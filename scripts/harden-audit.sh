#!/usr/bin/env bash
#
# harden-audit.sh — audit de durcissement (hardening) du serveur du portail Promote.
#
# LECTURE SEULE : ce script n'applique AUCUNE modification. Il inspecte la configuration
# (système, comptes, SSH, pare-feu, ports, Docker, application) et produit un rapport avec
# un statut par contrôle et un score final, plus des recommandations.
#
# Usage (sur le serveur) :
#   sudo ./scripts/harden-audit.sh                 # rapport complet à l'écran
#   sudo ./scripts/harden-audit.sh > audit.txt     # exporter le rapport
#   sudo ./scripts/harden-audit.sh --no-color      # sans couleurs (fichier / CI)
#
# Conseil : lancez-le en root (ou via sudo) pour voir SSHD, /etc/shadow, Docker, ufw…
# Sans privilèges, les contrôles inaccessibles sont marqués [i] (ignorés), pas en échec.
#
# Pensé pour la stack : Ubuntu + Docker compose + ufw + Caddy (Let's Encrypt) + PostgreSQL + MinIO.

set -uo pipefail   # PAS de -e : un audit enchaîne des sondes qui peuvent renvoyer non-zéro.

# --------------------------------------------------------------------------- présentation
COLOR=1
[ "${1:-}" = "--no-color" ] && COLOR=0
[ -t 1 ] || COLOR=0
if [ "$COLOR" = 1 ]; then
  G=$'\e[1;32m'; Y=$'\e[1;33m'; R=$'\e[1;31m'; B=$'\e[1;34m'; DIM=$'\e[2m'; N=$'\e[0m'
else
  G=""; Y=""; R=""; B=""; DIM=""; N=""
fi

PASS=0; WARN=0; FAIL=0; SKIP=0
declare -a ACTIONS=()

section() { printf '\n%s── %s ──────────────────────────────────────%s\n' "$B" "$1" "$N"; }
ok()   { PASS=$((PASS+1)); printf '  %s[OK]%s %s\n' "$G" "$N" "$1"; }
warn() { WARN=$((WARN+1)); printf '  %s[! ]%s %s\n' "$Y" "$N" "$1"; [ -n "${2:-}" ] && ACTIONS+=("${Y}WARN${N}  $2"); }
bad()  { FAIL=$((FAIL+1)); printf '  %s[X ]%s %s\n' "$R" "$N" "$1"; [ -n "${2:-}" ] && ACTIONS+=("${R}FAIL${N}  $2"); }
skip() { SKIP=$((SKIP+1)); printf '  %s[i ] %s%s\n' "$DIM" "$1" "$N"; }
note() { printf '       %s%s%s\n' "$DIM" "$1" "$N"; }

have() { command -v "$1" >/dev/null 2>&1; }
IS_ROOT=0; [ "$(id -u)" = 0 ] && IS_ROOT=1
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"

printf '%s╔══════════════════════════════════════════════════════════╗%s\n' "$B" "$N"
printf '%s║   Audit de durcissement — portail Promote (lecture seule) ║%s\n' "$B" "$N"
printf '%s╚══════════════════════════════════════════════════════════╝%s\n' "$B" "$N"
printf '  Hôte : %s   |   Date : %s\n' "$(hostname)" "$(date '+%Y-%m-%d %H:%M:%S')"
[ "$IS_ROOT" = 1 ] || printf '  %sNon root : certains contrôles seront ignorés. Relancez avec sudo.%s\n' "$Y" "$N"

# =========================================================================== 1. Système
section "1. Système & mises à jour"
if [ -r /etc/os-release ]; then . /etc/os-release; note "OS : ${PRETTY_NAME:-inconnu}"; fi

if have apt-get; then
  upg="$(apt-get -s upgrade 2>/dev/null | grep -c '^Inst')"
  sec="$(apt-get -s upgrade 2>/dev/null | grep -i '^Inst' | grep -ci security)"
  if [ "${sec:-0}" -gt 0 ]; then bad "$sec mise(s) à jour de SÉCURITÉ en attente (sur $upg paquets)." "Appliquer : sudo apt-get update && sudo apt-get upgrade"
  elif [ "${upg:-0}" -gt 0 ]; then warn "$upg paquet(s) à mettre à jour (aucune marquée sécurité)." "sudo apt-get update && sudo apt-get upgrade"
  else ok "Aucun paquet en attente de mise à jour."; fi

  if dpkg -l 2>/dev/null | grep -q unattended-upgrades; then
    if systemctl is-enabled unattended-upgrades >/dev/null 2>&1; then ok "unattended-upgrades installé et activé (correctifs auto)."
    else warn "unattended-upgrades installé mais pas activé." "sudo dpkg-reconfigure -plow unattended-upgrades"; fi
  else warn "unattended-upgrades absent : pas de correctifs de sécurité automatiques." "sudo apt-get install unattended-upgrades"; fi
else skip "apt non disponible — contrôle des mises à jour ignoré."; fi

if [ -f /var/run/reboot-required ]; then warn "Redémarrage requis (nouveau noyau/lib en attente)." "Planifier un reboot."
else ok "Aucun redémarrage en attente."; fi

if have timedatectl; then
  timedatectl show -p NTPSynchronized 2>/dev/null | grep -q 'yes' \
    && ok "Horloge synchronisée (NTP)." || warn "Horloge non synchronisée (NTP)." "sudo timedatectl set-ntp true"
fi

# =========================================================================== 2. Comptes
section "2. Comptes & authentification"
root_uids="$(awk -F: '($3==0){print $1}' /etc/passwd 2>/dev/null | grep -v '^root$')"
[ -z "$root_uids" ] && ok "Aucun compte UID 0 autre que root." \
  || bad "Compte(s) avec UID 0 (équivalent root) : $root_uids" "Investiguer ces comptes — porte dérobée possible."

if [ "$IS_ROOT" = 1 ] && [ -r /etc/shadow ]; then
  empty="$(awk -F: '($2==""){print $1}' /etc/shadow 2>/dev/null)"
  [ -z "$empty" ] && ok "Aucun compte sans mot de passe." \
    || bad "Compte(s) SANS mot de passe : $empty" "sudo passwd -l <user> ou définir un mot de passe."
else skip "Mots de passe vides — nécessite root (/etc/shadow)."; fi

sudoers="$(getent group sudo 2>/dev/null | cut -d: -f4)"
note "Membres du groupe sudo : ${sudoers:-aucun}"
if [ "$IS_ROOT" = 1 ]; then
  if grep -rEq '^[^#]*NOPASSWD' /etc/sudoers /etc/sudoers.d/ 2>/dev/null; then
    warn "Règle sudo NOPASSWD détectée (sudo sans mot de passe)." "Revoir /etc/sudoers.d/ — éviter NOPASSWD si possible."
  else ok "Aucune règle sudo NOPASSWD."; fi
fi

if have fail2ban-client && systemctl is-active fail2ban >/dev/null 2>&1; then
  ok "fail2ban actif (protection contre le brute-force SSH)."
else warn "fail2ban absent/inactif : pas de blocage des tentatives SSH répétées." "sudo apt-get install fail2ban && sudo systemctl enable --now fail2ban"; fi

# =========================================================================== 3. SSH
section "3. SSH (sshd)"
SSHD="$( { sshd -T 2>/dev/null || cat /etc/ssh/sshd_config 2>/dev/null; } | tr 'A-Z' 'a-z' )"
sshd_get() { echo "$SSHD" | grep -E "^[[:space:]]*$1[[:space:]]" | tail -1 | awk '{print $2}'; }
if [ -n "$SSHD" ]; then
  v="$(sshd_get permitrootlogin)"
  case "$v" in no|prohibit-password|without-password) ok "PermitRootLogin = ${v:-?} (login root direct restreint).";;
    *) warn "PermitRootLogin = ${v:-non défini} : login root par SSH possible." "Régler PermitRootLogin no (ou prohibit-password).";; esac

  v="$(sshd_get passwordauthentication)"
  [ "$v" = "no" ] && ok "PasswordAuthentication = no (clés uniquement)." \
    || warn "PasswordAuthentication = ${v:-yes} : mots de passe SSH acceptés." "Passer en clés : PasswordAuthentication no."

  v="$(sshd_get permitemptypasswords)"; [ "$v" = "no" ] && ok "PermitEmptyPasswords = no." || warn "PermitEmptyPasswords = ${v:-?}." "Régler PermitEmptyPasswords no."
  v="$(sshd_get x11forwarding)"; [ "$v" = "no" ] && ok "X11Forwarding = no." || warn "X11Forwarding = ${v:-?} (inutile sur un serveur)." "Régler X11Forwarding no."
  v="$(sshd_get maxauthtries)"; [ -n "$v" ] && { [ "$v" -le 4 ] 2>/dev/null && ok "MaxAuthTries = $v." || warn "MaxAuthTries = $v (élevé)." "Régler MaxAuthTries 3-4."; }
  v="$(sshd_get port)"; note "Port SSH : ${v:-22}"
else skip "Configuration sshd illisible (ni 'sshd -T' ni le fichier) — nécessite souvent root."; fi

# =========================================================================== 4. Pare-feu
section "4. Pare-feu (ufw) & ports exposés"
if have ufw && [ "$IS_ROOT" = 1 ]; then
  if ufw status 2>/dev/null | grep -q 'Status: active'; then
    ok "ufw actif."
    pol="$(ufw status verbose 2>/dev/null | grep -i 'Default:' )"; note "${pol:-politiques par défaut inconnues}"
    echo "$pol" | grep -qi 'deny (incoming)' && ok "Politique entrante par défaut : deny." \
      || warn "Politique entrante par défaut non 'deny'." "sudo ufw default deny incoming"
    note "Règles ouvertes :"; ufw status numbered 2>/dev/null | grep -E 'ALLOW' | sed 's/^/         /'
  else bad "ufw installé mais INACTIF — le serveur n'est pas filtré." "sudo ufw enable (après avoir autorisé SSH !)"; fi
elif have ufw; then skip "État ufw — nécessite root."
else warn "ufw non installé." "sudo apt-get install ufw puis configurer."; fi

# Ports en écoute exposés publiquement (0.0.0.0 / ::) vs locaux (127.0.0.1)
if have ss; then
  note "Sockets en écoute exposés publiquement (0.0.0.0 / ::) :"
  # Ports liés à une adresse publique (donc joignables de l'extérieur), pas la loopback.
  pub="$(ss -tulnH 2>/dev/null | awk '{print $5}' | grep -E '0\.0\.0\.0:|\[::\]:|^\*:' | sed -E 's/.*:([0-9]+)$/\1/' | sort -un)"
  expected="22 80 443 8443"
  if [ -z "$pub" ]; then ok "Aucun port public détecté (tout est en loopback)."; else
    for p in $pub; do
      if echo " $expected " | grep -q " $p "; then ok "Port public $p (attendu : SSH/HTTP/HTTPS)."
      else warn "Port $p exposé publiquement (0.0.0.0/::) — inattendu." "Vérifier ce service ; le lier à 127.0.0.1 ou le fermer dans ufw."; fi
    done
  fi
  # Bases de données / stockage : DOIVENT rester en loopback.
  for svc in "5432:PostgreSQL" "55432:PostgreSQL(hôte)" "9000:MinIO-S3" "9011:MinIO-console"; do
    port="${svc%%:*}"; name="${svc##*:}"
    if ss -tulnH 2>/dev/null | awk '{print $5}' | grep -qE "(0\.0\.0\.0|\[::\]|^\*):$port$"; then
      bad "$name ($port) écoute en PUBLIC — exposition de données." "Lier $name à 127.0.0.1 uniquement (voir .env / compose)."
    fi
  done
else skip "ss indisponible — contrôle des ports ignoré."; fi

# =========================================================================== 5. Docker
section "5. Docker (démon & conteneurs)"
if have docker && docker info >/dev/null 2>&1; then
  ok "Docker opérationnel."
  di="$(docker info 2>/dev/null)"
  echo "$di" | grep -qi 'rootless' && ok "Docker en mode rootless." || note "Docker en mode root (classique)."
  # Daemon.json hardening
  if [ -r /etc/docker/daemon.json ]; then
    grep -q 'live-restore' /etc/docker/daemon.json && ok "live-restore activé." || warn "live-restore non configuré." "Ajouter \"live-restore\": true dans /etc/docker/daemon.json."
    grep -q 'no-new-privileges' /etc/docker/daemon.json && ok "no-new-privileges par défaut." || warn "no-new-privileges non défini par défaut." "Ajouter \"no-new-privileges\": true dans /etc/docker/daemon.json."
    grep -q 'userland-proxy' /etc/docker/daemon.json && note "userland-proxy explicitement configuré." || true
  else warn "/etc/docker/daemon.json absent (durcissement démon non appliqué)." "Créer daemon.json : live-restore, no-new-privileges, limites de logs."; fi

  # Membres du groupe docker = root de fait
  dgrp="$(getent group docker 2>/dev/null | cut -d: -f4)"
  [ -n "$dgrp" ] && note "Groupe docker (≈ root) : $dgrp"

  # Conteneurs : ports publiés, privilèges, redémarrage
  note "Conteneurs et ports publiés :"
  docker ps --format '         {{.Names}}  {{.Status}}  [{{.Ports}}]' 2>/dev/null
  while IFS= read -r line; do
    nm="${line%% *}"; [ -z "$nm" ] && continue
    if echo "$line" | grep -qE '0\.0\.0\.0:|\[::\]:'; then
      ports="$(echo "$line" | grep -oE '0\.0\.0\.0:[0-9]+|\[::\]:[0-9]+' | sed -E 's/.*:([0-9]+)/\1/' | sort -un | tr '\n' ' ')"
      for p in $ports; do echo " 80 443 8443 " | grep -q " $p " \
        || warn "Conteneur '$nm' publie le port $p sur 0.0.0.0 (public)." "Limiter à 127.0.0.1 si non destiné au public (compose: 127.0.0.1:$p:...)."; done
    fi
    # privileged
    if [ "$(docker inspect -f '{{.HostConfig.Privileged}}' "$nm" 2>/dev/null)" = "true" ]; then
      bad "Conteneur '$nm' en mode --privileged." "Retirer --privileged sauf nécessité absolue."
    fi
    rp="$(docker inspect -f '{{.HostConfig.RestartPolicy.Name}}' "$nm" 2>/dev/null)"
    [ "$rp" = "no" ] || [ -z "$rp" ] && note "  '$nm' : politique de redémarrage = ${rp:-no} (préférez unless-stopped)."
  done < <(docker ps --format '{{.Names}} {{.Ports}}' 2>/dev/null)

  if have docker-bench-security; then note "docker-bench-security présent : 'sudo docker-bench-security' pour un audit CIS détaillé."
  else note "Astuce : 'docker run --rm --net host --pid host --cap-add audit_control -v /var/run/docker.sock:/var/run/docker.sock docker/docker-bench-security' pour l'audit CIS."; fi
elif have docker; then bad "Docker installé mais le démon ne répond pas (ou pas les droits)." "Vérifier : sudo systemctl status docker."
else skip "Docker non installé sur cet hôte."; fi

# =========================================================================== 6. Application
section "6. Application Promote (.env, secrets, TLS)"
ENV="$REPO_DIR/.env"
if [ -f "$ENV" ]; then
  perm="$(stat -c '%a' "$ENV" 2>/dev/null)"
  if [ "${perm: -1}" != "0" ] || [ "${perm: -2:1}" -gt 0 ] 2>/dev/null; then
    bad ".env lisible au-delà du propriétaire (perms $perm) — contient mots de passe DB/JWT/TrustPayWay." "chmod 600 $ENV"
  else ok ".env protégé (perms $perm)."; fi
  # Placeholders / secrets faibles laissés en l'état
  if grep -qE 'change-this|changeme|password=promote$|ChangezCeMotDePasse' "$ENV" 2>/dev/null; then
    bad "Valeur(s) d'exemple/faible(s) encore présentes dans .env." "Remplacer par des secrets forts (openssl rand -base64 48)."
  else ok "Aucun secret d'exemple évident dans .env."; fi
  jwt="$(grep -E '^JWT_SECRET=' "$ENV" | cut -d= -f2-)"; [ -n "$jwt" ] && { [ "${#jwt}" -ge 32 ] && ok "JWT_SECRET ≥ 32 caractères." || bad "JWT_SECRET trop court (${#jwt})." "Générer 48 octets : openssl rand -base64 48."; }
  grep -qE '^APP_CORS_ALLOWED_ORIGINS=https://' "$ENV" && ok "CORS restreint à une origine HTTPS." || warn "CORS non restreint à une origine HTTPS précise." "Définir APP_CORS_ALLOWED_ORIGINS sur l'URL publique exacte."
else skip ".env introuvable dans $REPO_DIR (script lancé hors du serveur de prod ?)."; fi

# TLS : certificat servi par Caddy
DOMAIN="$( [ -f "$ENV" ] && grep -E '^DOMAIN=' "$ENV" | cut -d= -f2- )"
if [ -n "${DOMAIN:-}" ] && have curl; then
  hdr="$(curl -skI "https://${DOMAIN}/" --max-time 8 2>/dev/null)"
  if [ -n "$hdr" ]; then
    ok "HTTPS répond sur https://${DOMAIN}/"
    echo "$hdr" | grep -qi '^strict-transport-security' && ok "En-tête HSTS présent." || warn "En-tête HSTS absent." "Ajouter Strict-Transport-Security dans le Caddyfile."
  else warn "Pas de réponse HTTPS sur ${DOMAIN} (depuis cet hôte)." "Vérifier Caddy, le DNS et les ports 80/443."; fi
else skip "Contrôle TLS externe ignoré (DOMAIN/curl indisponible)."; fi

# =========================================================================== 7. Noyau & divers
section "7. Noyau, fichiers & journalisation"
sctl() { sysctl -n "$1" 2>/dev/null; }
[ "$(sctl kernel.randomize_va_space)" = "2" ] && ok "ASLR activé (kernel.randomize_va_space=2)." || warn "ASLR non maximal." "sysctl -w kernel.randomize_va_space=2 (et /etc/sysctl.d/)."
v="$(sctl net.ipv4.conf.all.rp_filter)"; [ "$v" = "1" ] || [ "$v" = "2" ] && ok "rp_filter activé (anti-spoofing)." || warn "rp_filter désactivé." "Activer net.ipv4.conf.all.rp_filter=1."
[ "$(sctl net.ipv4.tcp_syncookies)" = "1" ] && ok "tcp_syncookies activé (anti SYN-flood)." || warn "tcp_syncookies désactivé." "sysctl -w net.ipv4.tcp_syncookies=1."

if have systemctl; then
  systemctl is-active auditd >/dev/null 2>&1 && ok "auditd actif (journal d'audit)." || warn "auditd inactif/absent." "sudo apt-get install auditd pour la traçabilité."
fi

if [ "$IS_ROOT" = 1 ]; then
  # On exclut les couches d'images de conteneurs (containerd/docker) : leurs permissions
  # internes ne concernent pas l'hôte et généreraient des faux positifs en masse.
  ww="$(find / -xdev -type f -perm -0002 \
        -not -path '/proc/*' -not -path '/sys/*' \
        -not -path '/var/lib/docker/*' -not -path '/var/lib/containerd/*' \
        2>/dev/null | head -5)"
  [ -z "$ww" ] && ok "Aucun fichier world-writable suspect sur l'hôte (échantillon)." \
    || { warn "Fichiers modifiables par tous sur l'hôte (échantillon) :" "Revoir les permissions (chmod o-w)."; echo "$ww" | sed 's/^/         /'; }
else skip "Recherche world-writable / SUID — nécessite root."; fi

if have lynis; then note "Lynis présent : 'sudo lynis audit system' pour un audit système approfondi."
else note "Astuce : installez Lynis ('sudo apt-get install lynis' puis 'lynis audit system') pour un audit complet noté."; fi

# =========================================================================== Résumé
TOTAL=$((PASS+WARN+FAIL))
section "Résumé"
printf '  %s[OK] %d%s    %s[! ] %d%s    %s[X ] %d%s    %s[i ] %d ignorés%s   (sur %d contrôles)\n' \
  "$G" "$PASS" "$N" "$Y" "$WARN" "$N" "$R" "$FAIL" "$N" "$DIM" "$SKIP" "$N" "$TOTAL"
if [ "$TOTAL" -gt 0 ]; then
  score=$(( PASS * 100 / TOTAL ))
  printf '  Score de conformité : %d%% (les contrôles ignorés ne comptent pas)\n' "$score"
fi
if [ "${#ACTIONS[@]}" -gt 0 ]; then
  printf '\n  %sActions recommandées (par priorité) :%s\n' "$B" "$N"
  printf '%s\n' "${ACTIONS[@]}" | sort | sed 's/^/   • /'
fi
printf '\n  %sRappel : ce script est en lecture seule — aucune modification n%sa été appliquée.%s\n' "$DIM" "'" "$N"

# Code de sortie : 2 si au moins un échec, 1 si seulement des avertissements, 0 sinon.
if [ "$FAIL" -gt 0 ]; then exit 2; elif [ "$WARN" -gt 0 ]; then exit 1; else exit 0; fi
