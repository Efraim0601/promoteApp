#!/usr/bin/env bash
#
# harden-apply.sh — applique les correctifs de durcissement SÛRS du serveur Promote.
#
# Contrairement à harden-audit.sh (lecture seule), ce script MODIFIE le système, mais
# uniquement pour les actions à faible risque :
#   1. Mises à jour des paquets (apt upgrade)
#   2. fail2ban (anti brute-force SSH) + jail sshd
#   3. auditd (journal d'audit)
#   4. Durcissement du démon Docker (/etc/docker/daemon.json, fusionné sans écraser)
#
# Le durcissement SSH (risque de verrouillage) et la revue sudo NE SONT PAS automatiques :
#   - SSH est proposé en option INTERACTIVE, avec détection d'accès par clé, sauvegarde,
#     validation 'sshd -t' et restauration auto en cas d'erreur.
#   - sudo NOPASSWD est seulement SIGNALÉ (jamais modifié — trop dépendant du contexte).
#
# Usage (sur le serveur, en root) :
#   sudo ./scripts/harden-apply.sh                 # interactif (recommandé)
#   sudo ./scripts/harden-apply.sh --yes           # sans questions pour le bloc sûr (CI)
#   sudo ./scripts/harden-apply.sh --no-docker-restart   # applique daemon.json sans relancer Docker
#   sudo ./scripts/harden-apply.sh --help
#
# Idempotent : relançable sans danger. Après coup, relancez 'sudo ./scripts/harden-audit.sh'.

set -uo pipefail

ASSUME_YES=0; DOCKER_RESTART=1
for arg in "$@"; do
  case "$arg" in
    -y|--yes) ASSUME_YES=1 ;;
    --no-docker-restart) DOCKER_RESTART=0 ;;
    -h|--help) grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Option inconnue : $arg (voir --help)"; exit 1 ;;
  esac
done

# --------------------------------------------------------------------------- présentation
if [ -t 1 ]; then G=$'\e[1;32m'; Y=$'\e[1;33m'; R=$'\e[1;31m'; B=$'\e[1;34m'; DIM=$'\e[2m'; N=$'\e[0m'
else G=""; Y=""; R=""; B=""; DIM=""; N=""; fi
say()  { printf '\n%s==>%s %s\n' "$B" "$N" "$*"; }
ok()   { printf '  %s[OK]%s %s\n' "$G" "$N" "$*"; }
warn() { printf '  %s[! ]%s %s\n' "$Y" "$N" "$*"; }
err()  { printf '  %s[X ]%s %s\n' "$R" "$N" "$*" >&2; }
note() { printf '       %s%s%s\n' "$DIM" "$*" "$N"; }
have() { command -v "$1" >/dev/null 2>&1; }

# Demande de confirmation (toujours "non" par défaut). Court-circuitée par --yes pour le bloc sûr.
confirm() { # $1 = question, $2 = "force-ask" pour ignorer --yes
  if [ "$ASSUME_YES" = 1 ] && [ "${2:-}" != "force-ask" ]; then return 0; fi
  if [ ! -t 0 ]; then return 1; fi   # pas de TTY → on n'ose pas
  local rep; read -r -p "  ${1} [o/N] " rep || true
  case "$rep" in o|O|oui|OUI|y|Y|yes) return 0 ;; *) return 1 ;; esac
}

[ "$(id -u)" = 0 ] || { err "À lancer en root : sudo $0"; exit 1; }

declare -a DONE=() SKIPPED=() TODO=()
DOCKER_NEEDS_RESTART=0

printf '%s╔════════════════════════════════════════════════════════════╗%s\n' "$B" "$N"
printf '%s║   Durcissement — application des correctifs sûrs (Promote)  ║%s\n' "$B" "$N"
printf '%s╚════════════════════════════════════════════════════════════╝%s\n' "$B" "$N"
printf '  Hôte : %s   |   %s\n' "$(hostname)" "$(date '+%Y-%m-%d %H:%M:%S')"
echo "  Actions sûres : apt upgrade · fail2ban · auditd · daemon.json Docker"
if [ "$ASSUME_YES" != 1 ]; then
  confirm "Appliquer ces correctifs sûrs maintenant ?" || { echo "Annulé."; exit 0; }
fi

# =========================================================================== 1. apt upgrade
say "1/4 · Mises à jour des paquets"
if have apt-get; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -y >/dev/null 2>&1 && ok "Index des paquets à jour." || warn "apt-get update a rencontré un souci."
  pending="$(apt-get -s upgrade 2>/dev/null | grep -c '^Inst')"
  if [ "${pending:-0}" -gt 0 ]; then
    if confirm "Installer ${pending} mise(s) à jour ?"; then
      if apt-get upgrade -y >/dev/null 2>&1; then ok "Paquets mis à jour (${pending})."; DONE+=("apt upgrade (${pending} paquets)")
      else err "Échec de apt-get upgrade — voir le journal."; fi
      [ -f /var/run/reboot-required ] && warn "Un redémarrage est désormais requis (nouveau noyau)."
    else SKIPPED+=("apt upgrade (${pending} en attente)"); note "Ignoré."; fi
  else ok "Aucune mise à jour en attente."; fi
else SKIPPED+=("apt (absent)"); warn "apt-get absent — étape ignorée."; fi

# =========================================================================== 2. fail2ban
say "2/4 · fail2ban (anti brute-force SSH)"
if have apt-get; then
  if ! dpkg -l 2>/dev/null | grep -q '^ii.*fail2ban'; then
    apt-get install -y fail2ban >/dev/null 2>&1 && ok "fail2ban installé." || err "Échec installation fail2ban."
  else ok "fail2ban déjà installé."; fi
  if have fail2ban-client; then
    # Jail sshd explicite (n'écrase pas jail.conf) : bannissement après 5 échecs.
    JAIL=/etc/fail2ban/jail.d/promote.local
    if [ ! -f "$JAIL" ]; then
      cat > "$JAIL" <<'EOF'
# Géré par harden-apply.sh — protection SSH.
[sshd]
enabled  = true
maxretry = 5
findtime = 10m
bantime  = 1h
EOF
      ok "Jail sshd configurée ($JAIL)."
    else ok "Jail sshd déjà présente."; fi
    systemctl enable fail2ban >/dev/null 2>&1
    if systemctl restart fail2ban >/dev/null 2>&1; then ok "fail2ban actif."; DONE+=("fail2ban"); else err "fail2ban n'a pas (re)démarré."; fi
  fi
else SKIPPED+=("fail2ban (apt absent)"); fi

# =========================================================================== 3. auditd
say "3/4 · auditd (journal d'audit)"
if have apt-get; then
  if ! dpkg -l 2>/dev/null | grep -q '^ii.*auditd'; then
    apt-get install -y auditd >/dev/null 2>&1 && ok "auditd installé." || err "Échec installation auditd."
  else ok "auditd déjà installé."; fi
  systemctl enable auditd >/dev/null 2>&1
  systemctl is-active auditd >/dev/null 2>&1 && { ok "auditd actif."; DONE+=("auditd"); } || { systemctl start auditd >/dev/null 2>&1 && ok "auditd démarré." || warn "auditd non démarré."; }
else SKIPPED+=("auditd (apt absent)"); fi

# =========================================================================== 4. daemon.json
say "4/4 · Durcissement du démon Docker (/etc/docker/daemon.json)"
if have docker; then
  F=/etc/docker/daemon.json
  install -d -m 0755 /etc/docker
  RESULT=""
  if have python3; then
    RESULT="$(python3 - "$F" <<'PY'
import json, os, sys
f = sys.argv[1]
base = {}
if os.path.exists(f):
    try:
        with open(f) as fh: base = json.load(fh)
    except Exception:
        # JSON illisible : on ne touche à rien, on signale.
        print("UNREADABLE"); sys.exit(0)
desired = {
    "live-restore": True,
    "no-new-privileges": True,
    "log-driver": "json-file",
    "log-opts": {"max-size": "10m", "max-file": "3"},
}
changed = False
for k, v in desired.items():
    if base.get(k) != v:
        base[k] = v; changed = True
if changed:
    with open(f, "w") as fh: json.dump(base, fh, indent=2); fh.write("\n")
print("CHANGED" if changed else "UNCHANGED")
PY
)"
  elif [ ! -f "$F" ]; then
    cat > "$F" <<'EOF'
{
  "live-restore": true,
  "no-new-privileges": true,
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "3" }
}
EOF
    RESULT="CHANGED"
  else
    RESULT="NOPY"
  fi

  case "$RESULT" in
    CHANGED)   ok "daemon.json durci (live-restore, no-new-privileges, rotation des logs)."; DONE+=("daemon.json"); DOCKER_NEEDS_RESTART=1 ;;
    UNCHANGED) ok "daemon.json déjà conforme." ;;
    UNREADABLE) err "daemon.json présent mais illisible (JSON invalide) — NON modifié."; TODO+=("Corriger /etc/docker/daemon.json à la main."); ;;
    NOPY)      warn "python3 absent et daemon.json déjà présent — fusion non faite (pour ne pas l'écraser)."; TODO+=("Fusionner manuellement live-restore/no-new-privileges dans $F."); ;;
  esac

  # Redémarrage de Docker (bounce des conteneurs) — confirmation requise.
  if [ "$DOCKER_NEEDS_RESTART" = 1 ]; then
    if [ "$DOCKER_RESTART" = 0 ]; then
      warn "daemon.json modifié mais --no-docker-restart : non pris en compte tant que Docker n'est pas relancé."
      TODO+=("Relancer Docker pour appliquer daemon.json : sudo systemctl restart docker")
    elif confirm "Redémarrer Docker pour appliquer (les conteneurs vont brièvement redémarrer) ?" force-ask; then
      if systemctl restart docker >/dev/null 2>&1; then ok "Docker redémarré — durcissement actif."
      else err "Échec du redémarrage de Docker — vérifiez 'systemctl status docker'."; fi
    else warn "Redémarrage différé."; TODO+=("Appliquer plus tard : sudo systemctl restart docker"); fi
  fi
else SKIPPED+=("Docker (absent)"); warn "Docker absent — étape ignorée."; fi

# =========================================================================== SSH (interactif)
say "Optionnel · Durcissement SSH (NON automatique — risque de verrouillage)"
SSHCFG=/etc/ssh/sshd_config
if [ "$ASSUME_YES" = 1 ] || [ ! -t 0 ]; then
  warn "Mode non interactif : durcissement SSH NON appliqué (par sécurité)."
  TODO+=("Durcir SSH manuellement : PermitRootLogin prohibit-password, PasswordAuthentication no, X11Forwarding no, MaxAuthTries 3.")
elif [ -f "$SSHCFG" ]; then
  echo "  Modifs envisagées : PermitRootLogin=prohibit-password, PasswordAuthentication=no,"
  echo "  X11Forwarding=no, MaxAuthTries=3."
  printf '  %sCela coupe la connexion par MOT DE PASSE. Assurez-vous d%saccéder par CLÉ.%s\n' "$R" "'" "$N"
  # Détection d'au moins une clé autorisée (root + comptes humains).
  keyfound=0
  for ak in /root/.ssh/authorized_keys /home/*/.ssh/authorized_keys; do
    [ -s "$ak" ] && { keyfound=1; note "Clé(s) trouvée(s) : $ak"; }
  done
  if [ "$keyfound" = 0 ]; then
    err "AUCUNE clé SSH autorisée trouvée. Durcissement SSH REFUSÉ (vous seriez verrouillé)."
    TODO+=("Déposer votre clé (ssh-copy-id) et tester, PUIS relancer pour durcir SSH.")
  elif confirm "Tout est prêt — durcir SSH maintenant ?" force-ask; then
    read -r -p "  Confirmez en tapant exactement OUI : " sure || true
    if [ "$sure" = "OUI" ]; then
      BAK="${SSHCFG}.bak.$(date +%Y%m%d%H%M%S)"
      cp -a "$SSHCFG" "$BAK" && note "Sauvegarde : $BAK"
      set_opt() { # clé valeur
        if grep -qiE "^[#[:space:]]*$1[[:space:]]" "$SSHCFG"; then
          sed -i -E "s|^[#[:space:]]*$1[[:space:]].*|$1 $2|I" "$SSHCFG"
        else printf '%s %s\n' "$1" "$2" >> "$SSHCFG"; fi
      }
      set_opt PermitRootLogin prohibit-password
      set_opt PasswordAuthentication no
      set_opt X11Forwarding no
      set_opt MaxAuthTries 3
      if sshd -t 2>/dev/null; then
        if systemctl reload ssh >/dev/null 2>&1 || systemctl reload sshd >/dev/null 2>&1; then
          ok "SSH durci et rechargé."; DONE+=("SSH (PermitRootLogin/Password/X11/MaxAuthTries)")
          printf '  %sIMPORTANT : ouvrez une NOUVELLE session SSH par clé MAINTENANT pour vérifier,\n  avant de fermer celle-ci.%s\n' "$Y" "$N"
          note "Rollback si besoin : sudo cp $BAK $SSHCFG && sudo systemctl reload ssh"
        else err "Reload SSH impossible — restauration de la sauvegarde."; cp -a "$BAK" "$SSHCFG"; fi
      else
        err "Configuration sshd invalide (sshd -t) — restauration de la sauvegarde."; cp -a "$BAK" "$SSHCFG"
      fi
    else warn "Confirmation 'OUI' non saisie — SSH inchangé."; fi
  else warn "SSH laissé inchangé."; fi
else warn "$SSHCFG introuvable — étape SSH ignorée."; fi

# =========================================================================== sudo (signalement)
say "Information · règles sudo NOPASSWD (non modifiées)"
if grep -rEl '^[^#]*NOPASSWD' /etc/sudoers /etc/sudoers.d/ 2>/dev/null | grep -q .; then
  warn "Règle(s) NOPASSWD présente(s) dans :"
  grep -rEl '^[^#]*NOPASSWD' /etc/sudoers /etc/sudoers.d/ 2>/dev/null | sed 's/^/         /'
  note "Souvent légitime (cloud-init / compte de service). À revoir manuellement, non modifié ici."
  TODO+=("Revoir les règles sudo NOPASSWD ci-dessus (édition via 'sudo visudo').")
else ok "Aucune règle sudo NOPASSWD."; fi

# =========================================================================== Résumé
say "Résumé"
[ "${#DONE[@]}"    -gt 0 ] && { printf '  %sAppliqué :%s\n' "$G" "$N"; printf '   • %s\n' "${DONE[@]}"; }
[ "${#SKIPPED[@]}" -gt 0 ] && { printf '  %sIgnoré :%s\n'   "$DIM" "$N"; printf '   • %s\n' "${SKIPPED[@]}"; }
[ "${#TODO[@]}"    -gt 0 ] && { printf '  %sÀ faire (manuel) :%s\n' "$Y" "$N"; printf '   • %s\n' "${TODO[@]}"; }
echo
note "Vérifiez le résultat : sudo ./scripts/harden-audit.sh"
echo "  Pour activer HSTS (en-têtes Caddy) : git pull && ./deploy.sh --le"
