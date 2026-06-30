import { Component, computed, inject, signal } from '@angular/core';
import { Api } from '../core/api';
import { I18n } from '../core/i18n';
import {
  ActionAuditDto, AdminStats, AgencyDto, CreateUserRequest, ImportRowResult, ImportUserRow,
  ImportUsersResult, LoginAuditDto, PaymentStats, ProfileDto, SmtpSettingsDto, SmtpSettingsUpdate,
  SubscriptionDto, TrustPayWaySettingsDto, TrustPayWaySettingsUpdate, UserDto,
} from '../core/models';
import { StaffSidebar } from '../shared/staff-sidebar';
import * as XLSX from 'xlsx';

type Tab = 'overview' | 'users' | 'transactions' | 'agencies' | 'permissions' | 'audit' | 'settings';
const fcfa = (n: number) => new Intl.NumberFormat('fr-FR').format(Math.round(n || 0)) + ' F';
const ROLES = ['AGENT', 'CASHIER', 'PRINT_AGENT', 'COLLECTEUR', 'SUPERVISEUR', 'CHEF_EQUIPE', 'MANAGER', 'ADMIN'];
const PAGE = 10;

@Component({
  selector: 'app-admin',
  imports: [StaffSidebar],
  template: `
    <app-staff-sidebar active="admin" />
    <div style="flex:1;padding:16px 16px 40px;padding-top:48px;max-width:960px;margin:0 auto;width:100%">
      <div style="padding-left:36px">
        <div class="tabs">
          @for (t of tabs; track t) {
            <button (click)="setTab(t)" class="tab" [class.tab-on]="tab() === t">{{ tabLabel(t) }}</button>
          }
        </div>

        <!-- OVERVIEW -->
        @if (tab() === 'overview') {
          <div class="fade-in">
            <div class="kpis">
              @for (k of adminKpis(); track k.label) {
                <div class="kpi"><div style="font-size:22px;font-weight:800" [style.color]="k.color">{{ k.value }}</div><div class="kl">{{ k.label }}</div></div>
              }
            </div>
            @if (pay()) {
              <div class="panel" style="margin-bottom:16px">
                <div style="font-size:14px;font-weight:700;color:var(--navy);margin-bottom:12px">{{ i18n.t('adm_momo_funnel') }}</div>
                <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:16px">
                  <div><span style="font-size:20px;font-weight:800;color:var(--navy)">{{ pay()!.momoTotal }}</span><div class="kl">{{ i18n.t('adm_total_momo') }}</div></div>
                  <div><span style="font-size:20px;font-weight:800;color:#059669">{{ pay()!.momoPaid }}</span><div class="kl">{{ i18n.t('adm_paid') }}</div></div>
                  <div><span style="font-size:20px;font-weight:800;color:#DC2626">{{ pay()!.momoFailed }}</span><div class="kl">{{ i18n.t('adm_failed') }}</div></div>
                  <div><span style="font-size:20px;font-weight:800;color:var(--primary)">{{ successRate() }}%</span><div class="kl">{{ i18n.t('adm_success_rate') }}</div></div>
                </div>
                <div style="font-size:12px;font-weight:600;color:var(--muted);margin-bottom:8px">{{ i18n.t('adm_per_network') }}</div>
                @for (n of networks(); track n.label) {
                  <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
                    <span style="font-size:12px;font-weight:600;color:var(--label);width:100px;flex-shrink:0">{{ n.label }}</span>
                    <div style="flex:1;height:20px;background:var(--surface-3);border-radius:10px;overflow:hidden">
                      <div style="height:100%;border-radius:10px;transition:width .5s" [style.background]="n.color" [style.width.%]="n.pct"></div>
                    </div>
                    <span style="font-size:11px;font-weight:700;color:var(--label);width:64px;text-align:right">{{ n.paid }}/{{ n.total }}</span>
                    <span style="font-size:11px;font-weight:600;width:36px" [style.color]="n.color">{{ n.pct }}%</span>
                  </div>
                }
              </div>
            }
          </div>
        }

        <!-- USERS -->
        @if (tab() === 'users') {
          <div class="fade-in">
            <div style="display:flex;gap:10px;margin-bottom:16px;align-items:center">
              <div style="flex:1;position:relative">
                <svg width="16" height="16" fill="none" stroke="#9CA3AF" stroke-width="2" viewBox="0 0 24 24" style="position:absolute;left:12px;top:50%;transform:translateY(-50%)"><circle cx="11" cy="11" r="8"></circle><path d="M21 21l-4.35-4.35"></path></svg>
                <input [value]="userSearch()" (input)="userSearch.set(val($event))" [placeholder]="i18n.t('dash_search')" style="width:100%;padding:10px 12px 10px 36px;border:1.5px solid var(--border);border-radius:10px;font-size:14px;background:var(--surface-2)">
              </div>
              <button (click)="showCreate.set(!showCreate())" class="btn btn-primary" style="width:auto;padding:10px 18px;border-radius:10px">+ {{ i18n.t('adm_add_user') }}</button>
              <button (click)="toggleImport()" class="btn-soft" style="width:auto;padding:10px 18px;border-radius:10px;white-space:nowrap">↥ Importer</button>
            </div>

            @if (showImport()) {
              <div class="panel" style="border:2px solid var(--primary);margin-bottom:16px">
                <div style="font-size:14px;font-weight:700;color:var(--navy);margin-bottom:6px">Import en masse (Excel / CSV)</div>
                <div style="font-size:12px;color:var(--muted);margin-bottom:12px">
                  Fichier <b>.xlsx</b>, <b>.xls</b> ou <b>.csv</b> avec les colonnes :
                  <b>nom</b>, <b>email</b>, <b>role</b>, <b>telephone</b>, <b>agence</b>.
                  Le rôle peut combiner plusieurs valeurs avec « | » (ex. AGENT|COLLECTEUR).
                  Un mot de passe temporaire est généré et envoyé par email à chaque nouvel utilisateur.
                  <button (click)="downloadTemplate()" class="linkbtn">Télécharger un modèle</button>
                </div>

                <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px">
                  <input #fileInput type="file" accept=".xlsx,.xls,.csv" (change)="onFile($event)"
                         style="font-size:13px">
                  @if (parsedRows().length) { <span style="font-size:12px;color:var(--label);font-weight:600">{{ parsedRows().length }} ligne(s) détectée(s)</span> }
                </div>
                @if (parseErr()) { <div class="alert-error" style="margin-bottom:10px">{{ parseErr() }}</div> }

                @if (parsedRows().length && !importResult()) {
                  <div style="max-height:180px;overflow:auto;border:1px solid var(--surface-3);border-radius:8px;margin-bottom:10px">
                    @for (r of parsedRows().slice(0, 50); track $index) {
                      <div class="urow" style="border:none;border-bottom:1px solid var(--surface-3);border-radius:0;padding:8px 12px">
                        <div style="min-width:0"><div style="font-size:13px;font-weight:600;color:var(--navy)">{{ r.name || '—' }}</div><div style="font-size:11px;color:var(--muted)">{{ r.email || '—' }}</div></div>
                        <span class="rolechip">{{ r.role || '—' }}</span>
                      </div>
                    }
                  </div>
                  <label style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--label);margin-bottom:12px;cursor:pointer">
                    <input type="checkbox" [checked]="updateExisting()" (change)="updateExisting.set(chk($event))">
                    Mettre à jour les comptes existants (sinon ils sont ignorés)
                  </label>
                  @if (importErr()) { <div class="alert-error" style="margin-bottom:10px">{{ importErr() }}</div> }
                  <div style="display:flex;gap:8px">
                    <button (click)="runImport()" [disabled]="importing()" class="btn btn-primary" style="width:auto;padding:10px 18px;border-radius:10px">
                      {{ importing() ? 'Import en cours…' : 'Importer ' + parsedRows().length + ' utilisateur(s)' }}
                    </button>
                    <button (click)="resetImport()" class="btn-soft" style="border-radius:10px">{{ i18n.t('adm_cancel') }}</button>
                  </div>
                }

                @if (importResult(); as res) {
                  <div class="alert-success" style="margin-bottom:10px">
                    ✓ {{ res.created }} créé(s), {{ res.updated }} mis à jour, {{ res.skipped }} ignoré(s), {{ res.invalid }} invalide(s)
                  </div>
                  <div style="max-height:220px;overflow:auto;border:1px solid var(--surface-3);border-radius:8px;margin-bottom:10px">
                    @for (r of res.rows; track $index) {
                      <div class="urow" style="border:none;border-bottom:1px solid var(--surface-3);border-radius:0;padding:8px 12px">
                        <div style="min-width:0">
                          <div style="font-size:13px;font-weight:600;color:var(--navy)">{{ r.name || r.email }}</div>
                          <div style="font-size:11px;color:var(--muted)">{{ r.email }} · {{ r.role }}</div>
                          @if (r.password) { <div style="font-size:11px;color:var(--label)">Mot de passe : <span class="mono">{{ r.password }}</span></div> }
                          @if (r.reason) { <div style="font-size:11px;color:#DC2626">{{ reasonLabel(r.reason) }}</div> }
                        </div>
                        <span class="statuschip" [style.color]="statusColor(r.status)" [style.border-color]="statusColor(r.status)">{{ statusLabel(r.status) }}</span>
                      </div>
                    }
                  </div>
                  <button (click)="resetImport()" class="btn-soft" style="border-radius:10px">Fermer</button>
                }
              </div>
            }

            @if (showCreate()) {
              <div class="panel" style="border:2px solid var(--primary);margin-bottom:16px">
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
                  <div><label class="lab">{{ i18n.t('adm_name') }} *</label><input class="in" [value]="nName()" (input)="nName.set(val($event))"></div>
                  <div><label class="lab">Email *</label><input class="in" [value]="nEmail()" (input)="nEmail.set(val($event))"></div>
                  <div>
                    <label class="lab">{{ i18n.t('adm_role') }} *</label>
                    <select class="in" [value]="nRole()" (change)="nRole.set(val($event))">@for (r of roles; track r) { <option [value]="r">{{ r }}</option> }</select>
                  </div>
                  <div><label class="lab">{{ i18n.t('adm_agency') }}</label><input class="in" [value]="nAgency()" (input)="nAgency.set(val($event))"></div>
                </div>
                @if (createMsg()) { <div class="alert-success" style="margin-bottom:10px">✓ {{ createMsg() }}</div> }
                @if (createErr()) { <div class="alert-error" style="margin-bottom:10px">{{ createErr() }}</div> }
                <div style="display:flex;gap:8px">
                  <button (click)="createUser()" class="btn btn-primary" style="width:auto;padding:10px 18px;border-radius:10px">{{ i18n.t('adm_create') }}</button>
                  <button (click)="showCreate.set(false)" class="btn-soft" style="border-radius:10px">{{ i18n.t('adm_cancel') }}</button>
                </div>
              </div>
            }

            <div style="display:flex;flex-direction:column;gap:6px">
              @for (u of filteredUsers(); track u.id) {
                <div class="urow">
                  <div style="min-width:0">
                    <div style="font-size:14px;font-weight:700;color:var(--navy)">{{ u.name }}</div>
                    <div style="font-size:11px;color:var(--muted);overflow:hidden;text-overflow:ellipsis">{{ u.email }}</div>
                  </div>
                  <div style="display:flex;align-items:center;gap:8px;flex-shrink:0">
                    <span class="rolechip">{{ roleOf(u) }}</span>
                    <button (click)="toggleEnabled(u)" class="mini" [style.color]="u.enabled ? '#059669' : '#DC2626'" [style.border-color]="u.enabled ? '#A7F3D0' : '#FECACA'">
                      {{ u.enabled ? '● ' + i18n.t('adm_disable') : '○ ' + i18n.t('adm_enable') }}
                    </button>
                  </div>
                </div>
              }
            </div>
          </div>
        }

        <!-- TRANSACTIONS -->
        @if (tab() === 'transactions') {
          <div class="fade-in">
            <div style="display:flex;gap:8px;margin-bottom:14px;align-items:center;flex-wrap:wrap">
              <select [value]="txFilter()" (change)="txFilter.set(val($event)); txPage.set(0)" style="padding:10px 12px;border:1.5px solid var(--border);border-radius:10px;font-size:12px;background:var(--surface-2);font-weight:600;color:var(--label)">
                <option value="all">{{ i18n.t('st_all') }}</option><option value="paid">{{ i18n.t('st_paid') }}</option><option value="pending">{{ i18n.t('st_pending') }}</option><option value="failed">{{ i18n.t('st_failed') }}</option>
              </select>
              <span style="font-size:12px;color:var(--muted)">{{ txFiltered().length }}</span>
            </div>
            <div style="display:flex;flex-direction:column;gap:8px">
              @for (s of txPaged(); track s.ref) {
                <div class="sale">
                  <div style="display:flex;justify-content:space-between;align-items:flex-start">
                    <div>
                      <span class="mono" style="font-size:12px;font-weight:700;color:var(--navy)">{{ s.ref }}</span>
                      <div style="font-size:14px;font-weight:700;color:var(--navy);margin-top:2px">{{ s.fullName }}</div>
                      <div style="font-size:11px;color:var(--muted);margin-top:2px">{{ s.productLabel }} · {{ s.pay }} · {{ s.payStatus }}</div>
                    </div>
                    <div style="text-align:right"><div style="font-size:15px;font-weight:800;color:var(--primary)">{{ money(s.amount) }}</div><div style="font-size:11px;color:var(--muted-2)">{{ date(s.createdAt) }}</div></div>
                  </div>
                </div>
              }
            </div>
            @if (txPageCount() > 1) {
              <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;margin-top:8px">
                <button (click)="txPage.set(txPage() - 1)" [disabled]="txPage() === 0" class="pg">←</button>
                <span style="font-size:12px;color:var(--muted)">{{ i18n.t('pg_page', { n: txPage() + 1, t: txPageCount() }) }}</span>
                <button (click)="txPage.set(txPage() + 1)" [disabled]="txPage() >= txPageCount() - 1" class="pg">→</button>
              </div>
            }
          </div>
        }

        <!-- AGENCIES -->
        @if (tab() === 'agencies') {
          <div class="fade-in" style="display:flex;flex-direction:column;gap:6px">
            @for (a of agencies(); track a.id) {
              <div class="urow"><div><div style="font-size:14px;font-weight:700;color:var(--navy)">{{ a.name }}</div><div style="font-size:11px;color:var(--muted)">{{ a.city }}</div></div><span class="mono" style="font-size:11px;color:var(--muted-2)">{{ a.id }}</span></div>
            }
          </div>
        }

        <!-- PERMISSIONS -->
        @if (tab() === 'permissions') {
          <div class="fade-in" style="display:flex;flex-direction:column;gap:10px">
            @for (p of profiles(); track p.id) {
              <div class="panel">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
                  <span style="font-size:14px;font-weight:700;color:var(--navy)">{{ p.name }}</span>
                  @if (p.builtin) { <span class="rolechip">{{ i18n.t('adm_perm_builtin') }}</span> }
                </div>
                <div style="display:flex;flex-wrap:wrap;gap:4px">
                  @for (perm of p.permissions; track perm) { <span class="permchip">{{ perm }}</span> }
                  @if (p.permissions.length === 0) { <span style="font-size:12px;color:var(--muted-2)">—</span> }
                </div>
              </div>
            }
          </div>
        }

        <!-- AUDIT -->
        @if (tab() === 'audit') {
          <div class="fade-in">
            <div style="display:flex;gap:2px;margin-bottom:14px;border-bottom:2px solid var(--surface-3)">
              <button (click)="auditTab.set('logins'); loadAudit()" class="tab" [class.tab-on]="auditTab() === 'logins'">{{ i18n.t('adm_login_audit') }}</button>
              <button (click)="auditTab.set('actions'); loadAudit()" class="tab" [class.tab-on]="auditTab() === 'actions'">{{ i18n.t('adm_action_audit') }}</button>
            </div>
            @if (auditTab() === 'logins') {
              <div style="display:flex;flex-direction:column;gap:6px">
                @for (l of logins(); track l.id) {
                  <div class="urow">
                    <div style="min-width:0"><div style="font-size:13px;font-weight:600;color:var(--navy)">{{ l.email }}</div><div style="font-size:11px;color:var(--muted)">{{ l.roles }} · {{ l.ip }}</div></div>
                    <div style="text-align:right;flex-shrink:0"><span [style.color]="l.success ? '#059669' : '#DC2626'" style="font-size:11px;font-weight:700">{{ l.success ? '✓' : '✗ ' + l.reason }}</span><div style="font-size:10px;color:var(--muted-2)">{{ dt(l.at) }}</div></div>
                  </div>
                }
                @if (logins().length === 0) { <div style="text-align:center;color:var(--muted);padding:24px">{{ i18n.t('adm_no_data') }}</div> }
              </div>
            } @else {
              <div style="display:flex;flex-direction:column;gap:6px">
                @for (a of actions(); track a.id) {
                  <div class="urow">
                    <div style="min-width:0"><div style="font-size:13px;font-weight:600;color:var(--navy)">{{ a.action }} <span style="color:var(--muted)">{{ a.entityType }} {{ a.entityRef }}</span></div><div style="font-size:11px;color:var(--muted)">{{ a.actorName }} · {{ a.actorRoles }}</div></div>
                    <div style="font-size:10px;color:var(--muted-2);flex-shrink:0">{{ dt(a.at) }}</div>
                  </div>
                }
                @if (actions().length === 0) { <div style="text-align:center;color:var(--muted);padding:24px">{{ i18n.t('adm_no_data') }}</div> }
              </div>
            }
          </div>
        }

        <!-- SETTINGS -->
        @if (tab() === 'settings') {
          <div class="fade-in" style="display:flex;flex-direction:column;gap:16px">

            <!-- SMTP -->
            <div class="panel">
              <div style="font-size:14px;font-weight:700;color:var(--navy);margin-bottom:4px">Serveur email (SMTP)</div>
              <div style="font-size:12px;color:var(--muted);margin-bottom:14px">Sert à l'envoi des identifiants aux nouveaux comptes et des réinitialisations. Laissez un champ vide pour utiliser la valeur du serveur (.env).</div>
              @if (smtp(); as s) {
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
                  <div><label class="lab">Hôte SMTP</label><input class="in" [value]="s.host || ''" (input)="patchSmtp('host', val($event))" placeholder="smtp.office365.com"></div>
                  <div><label class="lab">Port</label><input class="in" type="number" [value]="s.port ?? ''" (input)="patchSmtp('port', val($event))" placeholder="587"></div>
                  <div><label class="lab">Identifiant (username)</label><input class="in" [value]="s.username || ''" (input)="patchSmtp('username', val($event))" autocomplete="off"></div>
                  <div><label class="lab">Mot de passe {{ s.passwordSet ? '(défini ✓)' : '' }}</label><input class="in" type="password" [value]="smtpPassword()" (input)="smtpPassword.set(val($event))" placeholder="•••••• (laisser vide pour conserver)" autocomplete="new-password"></div>
                  <div><label class="lab">Expéditeur (from)</label><input class="in" [value]="s.from || ''" (input)="patchSmtp('from', val($event))" placeholder="no-reply@afrilandfirstbank.com"></div>
                  <div><label class="lab">Nom expéditeur</label><input class="in" [value]="s.fromName || ''" (input)="patchSmtp('fromName', val($event))" placeholder="Afriland Carte Promote"></div>
                  <div style="grid-column:1 / -1"><label class="lab">URL publique de l'application (lien de connexion dans les emails)</label><input class="in" [value]="s.publicUrl || ''" (input)="patchSmtp('publicUrl', val($event))" placeholder="https://promote.afrilandfirstbank.com"></div>
                </div>
                <label style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--label);margin-bottom:12px;cursor:pointer">
                  <input type="checkbox" [checked]="s.enabled === true" (change)="patchSmtpBool('enabled', chk($event))">
                  Envoi d'emails activé
                </label>
                @if (smtpMsg()) { <div class="alert-success" style="margin-bottom:10px">✓ {{ smtpMsg() }}</div> }
                @if (smtpErr()) { <div class="alert-error" style="margin-bottom:10px">{{ smtpErr() }}</div> }
                <div style="display:flex;gap:8px;flex-wrap:wrap">
                  <button (click)="saveSmtp()" [disabled]="smtpBusy()" class="btn btn-primary" style="width:auto;padding:10px 18px;border-radius:10px">Enregistrer</button>
                  <button (click)="doTestSmtp()" [disabled]="smtpBusy()" class="btn-soft" style="border-radius:10px">{{ smtpBusy() ? '…' : 'Envoyer un email de test' }}</button>
                </div>
              } @else { <div style="color:var(--muted);font-size:13px">Chargement…</div> }
            </div>

            <!-- TrustPayWay -->
            <div class="panel">
              <div style="font-size:14px;font-weight:700;color:var(--navy);margin-bottom:4px">Passerelle de paiement (TrustPayWay)</div>
              <div style="font-size:12px;color:var(--muted);margin-bottom:14px">Connexion à l'agrégateur Mobile Money. Les clés secrètes ne sont jamais réaffichées ; laissez vide pour conserver la valeur en place.</div>
              @if (tpw(); as t) {
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
                  <div style="grid-column:1 / -1"><label class="lab">URL de base de l'API</label><input class="in" [value]="t.baseUrl || ''" (input)="patchTpw('baseUrl', val($event))" placeholder="https://api.trustpayway.com"></div>
                  <div><label class="lab">Application ID</label><input class="in" [value]="t.applicationId || ''" (input)="patchTpw('applicationId', val($event))" autocomplete="off"></div>
                  <div><label class="lab">Clé secrète {{ t.secretKeySet ? '(définie ✓)' : '' }}</label><input class="in" type="password" [value]="tpwSecret()" (input)="tpwSecret.set(val($event))" placeholder="•••••• (laisser vide pour conserver)" autocomplete="new-password"></div>
                  <div style="grid-column:1 / -1"><label class="lab">URL de notification (webhook)</label><input class="in" [value]="t.notifUrl || ''" (input)="patchTpw('notifUrl', val($event))" placeholder="https://…/api/payment/webhook/trustpayway"></div>
                  <div><label class="lab">Secret webhook {{ t.webhookSecretSet ? '(défini ✓)' : '' }}</label><input class="in" type="password" [value]="tpwWebhook()" (input)="tpwWebhook.set(val($event))" placeholder="•••••• (optionnel)" autocomplete="new-password"></div>
                  <div><label class="lab">Timeout connexion (ms)</label><input class="in" type="number" [value]="t.connectTimeoutMs ?? ''" (input)="patchTpw('connectTimeoutMs', val($event))" placeholder="5000"></div>
                  <div><label class="lab">Timeout push (ms)</label><input class="in" type="number" [value]="t.readTimeoutMs ?? ''" (input)="patchTpw('readTimeoutMs', val($event))" placeholder="45000"></div>
                  <div><label class="lab">Timeout statut (ms)</label><input class="in" type="number" [value]="t.statusReadTimeoutMs ?? ''" (input)="patchTpw('statusReadTimeoutMs', val($event))" placeholder="12000"></div>
                </div>
                @if (tpwMsg()) { <div class="alert-success" style="margin-bottom:10px">✓ {{ tpwMsg() }}</div> }
                @if (tpwErr()) { <div class="alert-error" style="margin-bottom:10px">{{ tpwErr() }}</div> }
                <div style="display:flex;gap:8px;flex-wrap:wrap">
                  <button (click)="saveTpw()" [disabled]="tpwBusy()" class="btn btn-primary" style="width:auto;padding:10px 18px;border-radius:10px">Enregistrer</button>
                  <button (click)="doTestTpw()" [disabled]="tpwBusy()" class="btn-soft" style="border-radius:10px">{{ tpwBusy() ? '…' : 'Tester la connexion' }}</button>
                </div>
                <div style="font-size:11px;color:var(--muted-2);margin-top:10px">Note : l'activation de la passerelle (provider) reste pilotée par la variable d'environnement et nécessite un redémarrage. Cet écran configure la connexion.</div>
              } @else { <div style="color:var(--muted);font-size:13px">Chargement…</div> }
            </div>
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    :host { display:flex;flex:1;flex-direction:column }
    .tabs { display:flex;gap:2px;margin-bottom:20px;border-bottom:2px solid var(--surface-3);overflow-x:auto }
    .tab { padding:10px 12px;border:none;background:none;font-size:12px;font-weight:700;cursor:pointer;color:var(--muted);border-bottom:2px solid transparent;margin-bottom:-2px;white-space:nowrap }
    .tab-on { color:var(--primary);border-bottom-color:var(--primary) }
    .kpis { display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px;margin-bottom:24px }
    .kpi { background:#fff;border-radius:12px;padding:14px;box-shadow:0 1px 3px rgba(0,0,0,.04);border:1px solid var(--surface-3) }
    .kl { font-size:11px;color:var(--muted);margin-top:2px }
    .panel { background:#fff;border-radius:14px;padding:18px;box-shadow:0 1px 4px rgba(0,0,0,.04);border:1px solid var(--surface-3) }
    .lab { display:block;font-size:12px;font-weight:600;color:var(--label);margin-bottom:4px }
    .in { width:100%;padding:10px 12px;border:1.5px solid var(--border);border-radius:10px;font-size:14px;background:var(--surface-2) }
    .urow { display:flex;justify-content:space-between;align-items:center;gap:10px;background:#fff;border-radius:10px;padding:12px 14px;border:1px solid var(--surface-3) }
    .rolechip { padding:2px 8px;border-radius:12px;font-size:10px;font-weight:700;background:var(--surface-3);color:var(--label) }
    .permchip { padding:2px 6px;border-radius:6px;font-size:10px;font-weight:600;background:var(--info-soft);color:var(--info) }
    .mini { padding:4px 10px;border-radius:8px;border:1.5px solid;background:#fff;font-size:11px;font-weight:700;cursor:pointer }
    .sale { background:#fff;border-radius:12px;padding:14px;box-shadow:0 1px 3px rgba(0,0,0,.04);border:1px solid var(--surface-3) }
    .pg { padding:6px 14px;border-radius:8px;border:1.5px solid var(--border);background:#fff;font-size:12px;font-weight:600;cursor:pointer }
    .pg:disabled { opacity:.4;cursor:default }
    .linkbtn { background:none;border:none;color:var(--primary);font-size:12px;font-weight:700;cursor:pointer;padding:0;text-decoration:underline }
    .statuschip { padding:2px 8px;border-radius:12px;font-size:10px;font-weight:700;background:#fff;border:1.5px solid;flex-shrink:0 }
  `],
})
export class AdminPage {
  protected i18n = inject(I18n);
  private api = inject(Api);
  tabs: Tab[] = ['overview', 'users', 'transactions', 'agencies', 'permissions', 'audit', 'settings'];
  roles = ROLES;
  tabLabel = (t: Tab) => (t === 'settings' ? 'Paramètres' : this.i18n.t('adm_' + t));

  tab = signal<Tab>('overview');
  stats = signal<AdminStats | null>(null);
  pay = signal<PaymentStats | null>(null);
  usersList = signal<UserDto[]>([]);
  txList = signal<SubscriptionDto[]>([]);
  agencies = signal<AgencyDto[]>([]);
  profiles = signal<ProfileDto[]>([]);
  logins = signal<LoginAuditDto[]>([]);
  actions = signal<ActionAuditDto[]>([]);

  userSearch = signal('');
  showCreate = signal(false);
  nName = signal(''); nEmail = signal(''); nRole = signal('AGENT'); nAgency = signal('');
  createMsg = signal(''); createErr = signal('');
  showImport = signal(false);
  parsedRows = signal<ImportUserRow[]>([]);
  parseErr = signal(''); importErr = signal('');
  updateExisting = signal(false);
  importing = signal(false);
  importResult = signal<ImportUsersResult | null>(null);
  txFilter = signal('all'); txPage = signal(0);
  auditTab = signal<'logins' | 'actions'>('logins');
  // settings
  smtp = signal<SmtpSettingsDto | null>(null);
  smtpPassword = signal(''); smtpMsg = signal(''); smtpErr = signal(''); smtpBusy = signal(false);
  tpw = signal<TrustPayWaySettingsDto | null>(null);
  tpwSecret = signal(''); tpwWebhook = signal('');
  tpwMsg = signal(''); tpwErr = signal(''); tpwBusy = signal(false);

  constructor() {
    this.api.adminStats().subscribe({ next: (s) => this.stats.set(s), error: () => {} });
    this.api.paymentStats().subscribe({ next: (p) => this.pay.set(p), error: () => {} });
  }

  val(e: Event) { return (e.target as HTMLInputElement).value; }
  chk(e: Event) { return (e.target as HTMLInputElement).checked; }
  roleOf = (u: UserDto) => (u.roles && u.roles.length ? u.roles[0] : u.role);
  money = (n: number) => fcfa(n);
  date = (iso: string) => (iso ? new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }) : '');
  dt = (iso: string) => (iso ? new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');

  setTab(t: Tab) {
    this.tab.set(t);
    if (t === 'users' && this.usersList().length === 0) this.api.users().subscribe({ next: (l) => this.usersList.set(l), error: () => {} });
    if (t === 'transactions' && this.txList().length === 0) this.api.allSubscriptions().subscribe({ next: (l) => this.txList.set(l), error: () => {} });
    if (t === 'agencies' && this.agencies().length === 0) this.api.agencies().subscribe({ next: (l) => this.agencies.set(l), error: () => {} });
    if (t === 'permissions' && this.profiles().length === 0) this.api.profiles().subscribe({ next: (l) => this.profiles.set(l), error: () => {} });
    if (t === 'audit') this.loadAudit();
    if (t === 'settings' && !this.smtp()) this.loadSettings();
  }

  adminKpis = computed(() => {
    const s = this.stats();
    return [
      { label: this.i18n.t('kpi_total'), value: String(s?.total ?? '—'), color: '#1B1B2F' },
      { label: this.i18n.t('adm_paid'), value: String(s?.paid ?? '—'), color: '#059669' },
      { label: this.i18n.t('kpi_pending'), value: String(s?.pending ?? '—'), color: '#D97706' },
      { label: this.i18n.t('kpi_collected'), value: String(s?.collected ?? '—'), color: '#2563EB' },
      { label: this.i18n.t('adm_printed'), value: String(s?.totalPrinted ?? '—'), color: '#7C3AED' },
    ];
  });
  successRate = computed(() => {
    const p = this.pay(); if (!p || !p.momoTotal) return 0;
    return Math.round((p.momoPaid / p.momoTotal) * 100);
  });
  networks = computed(() => {
    const p = this.pay(); if (!p) return [];
    const mk = (label: string, paid: number, total: number, color: string) => ({ label, paid, total, color, pct: total ? Math.round((paid / total) * 100) : 0 });
    return [mk('Orange Money', p.orangePaid, p.orangeTotal, '#FF7900'), mk('MTN MoMo', p.mtnPaid, p.mtnTotal, '#FFCB05')];
  });

  filteredUsers = computed(() => {
    const q = this.userSearch().toLowerCase().trim();
    return this.usersList().filter((u) => !q || `${u.name} ${u.email} ${u.role}`.toLowerCase().includes(q)).slice(0, 100);
  });

  txFiltered = computed(() => {
    const f = this.txFilter();
    return this.txList().filter((s) => {
      if (f === 'paid') return s.payStatus === 'paid' || s.payStatus === 'success';
      if (f === 'pending') return s.payStatus === 'pending';
      if (f === 'failed') return s.payStatus === 'failed' || s.payStatus === 'expired';
      return true;
    });
  });
  txPageCount = computed(() => Math.max(1, Math.ceil(this.txFiltered().length / PAGE)));
  txPaged = computed(() => this.txFiltered().slice(this.txPage() * PAGE, this.txPage() * PAGE + PAGE));

  createUser() {
    this.createMsg.set(''); this.createErr.set('');
    if (!this.nName() || !this.nEmail()) { this.createErr.set(this.i18n.t('err_required_fields')); return; }
    const req: CreateUserRequest = { name: this.nName().trim(), email: this.nEmail().trim(), role: this.nRole(), roles: [this.nRole()], agency: this.nAgency().trim() || undefined };
    this.api.createUser(req).subscribe({
      next: (u) => { this.createMsg.set(this.i18n.t('adm_created')); this.usersList.set([u, ...this.usersList()]); this.nName.set(''); this.nEmail.set(''); this.nAgency.set(''); },
      error: (e) => this.createErr.set(e?.error?.error || e?.error?.message || 'Erreur'),
    });
  }
  // ---- bulk import (Excel / CSV) ----
  toggleImport() {
    const open = !this.showImport();
    this.showImport.set(open);
    if (open) this.showCreate.set(false); else this.resetImport();
  }
  resetImport() {
    this.parsedRows.set([]); this.parseErr.set(''); this.importErr.set('');
    this.importResult.set(null); this.importing.set(false); this.updateExisting.set(false);
    this.showImport.set(false);
  }

  /** Read the first non-empty value among candidate header names (case/space/accent-insensitive). */
  private pick(row: Record<string, unknown>, keys: Record<string, string>, candidates: string[]): string {
    for (const c of candidates) {
      const k = keys[c];
      if (k && row[k] != null && String(row[k]).trim() !== '') return String(row[k]).trim();
    }
    return '';
  }
  private norm(s: string): string {
    return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[\s._-]/g, '');
  }

  async onFile(e: Event) {
    this.parseErr.set(''); this.importErr.set(''); this.importResult.set(null); this.parsedRows.set([]);
    const input = e.target as HTMLInputElement;
    const file = input.files && input.files[0];
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
      if (!raw.length) { this.parseErr.set('Fichier vide ou aucune ligne de données.'); return; }
      // Map normalized header → original header key.
      const keys: Record<string, string> = {};
      for (const h of Object.keys(raw[0])) keys[this.norm(h)] = h;
      const rows: ImportUserRow[] = raw.map((r) => ({
        name: this.pick(r, keys, ['name', 'nom', 'nomcomplet', 'fullname']),
        email: this.pick(r, keys, ['email', 'mail', 'courriel', 'adresseemail']),
        role: this.pick(r, keys, ['role', 'roles', 'profil', 'rôle']),
        phone: this.pick(r, keys, ['phone', 'telephone', 'tel', 'numero', 'mobile']),
        agency: this.pick(r, keys, ['agency', 'agence', 'zone']),
      })).filter((r) => r.name || r.email || r.role);
      if (!rows.length) {
        this.parseErr.set('Aucune colonne reconnue. Attendu : nom, email, role, telephone, agence.');
        return;
      }
      this.parsedRows.set(rows);
    } catch {
      this.parseErr.set('Lecture du fichier impossible. Vérifiez le format (.xlsx, .xls ou .csv).');
    }
  }

  runImport() {
    if (!this.parsedRows().length) return;
    this.importing.set(true); this.importErr.set('');
    this.api.importUsers({ rows: this.parsedRows(), updateExisting: this.updateExisting() }).subscribe({
      next: (res) => {
        this.importing.set(false);
        this.importResult.set(res);
        if (res.created + res.updated > 0) {
          this.api.users().subscribe({ next: (l) => this.usersList.set(l), error: () => {} });
        }
      },
      error: (e) => { this.importing.set(false); this.importErr.set(e?.error?.error || e?.error?.message || 'Échec de l\'import'); },
    });
  }

  downloadTemplate() {
    const ws = XLSX.utils.aoa_to_sheet([
      ['nom', 'email', 'role', 'telephone', 'agence'],
      ['Jean Dupont', 'jean.dupont@example.com', 'AGENT', '670000000', 'Agence Centrale'],
      ['Marie Mballa', 'marie.mballa@example.com', 'CASHIER', '690000000', 'Agence Akwa'],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Utilisateurs');
    XLSX.writeFile(wb, 'modele-import-utilisateurs.xlsx');
  }

  statusLabel(s: ImportRowResult['status']) {
    return { created: 'Créé', updated: 'Mis à jour', skipped: 'Ignoré', invalid: 'Invalide' }[s] || s;
  }
  statusColor(s: ImportRowResult['status']) {
    return { created: '#059669', updated: '#2563EB', skipped: '#D97706', invalid: '#DC2626' }[s] || '#6B7280';
  }
  reasonLabel(r: string) {
    return {
      invalid_name_or_email: 'Nom ou email invalide',
      invalid_role: 'Rôle invalide',
      agent_phone_required: 'Téléphone (6XXXXXXXX) requis pour un AGENT',
      duplicate_in_file: 'Doublon dans le fichier',
      email_exists: 'Email déjà utilisé',
      phone_exists: 'Téléphone déjà utilisé',
    }[r] || r;
  }

  toggleEnabled(u: UserDto) {
    this.api.setUserEnabled(u.id, !u.enabled).subscribe({ next: () => this.usersList.set(this.usersList().map((x) => (x.id === u.id ? { ...x, enabled: !x.enabled } : x))) });
  }
  loadAudit() {
    if (this.auditTab() === 'logins') this.api.auditLogins().subscribe({ next: (l) => this.logins.set(l), error: () => {} });
    else this.api.auditActions().subscribe({ next: (l) => this.actions.set(l), error: () => {} });
  }

  // ---- settings (SMTP + TrustPayWay) ----
  loadSettings() {
    this.api.smtpSettings().subscribe({ next: (s) => this.smtp.set(s), error: () => {} });
    this.api.trustPayWaySettings().subscribe({ next: (t) => this.tpw.set(t), error: () => {} });
  }
  patchSmtp(key: keyof SmtpSettingsDto, value: string) {
    const s = this.smtp(); if (!s) return;
    const v: unknown = key === 'port' ? (value ? Number(value) : null) : (value || null);
    this.smtp.set({ ...s, [key]: v });
  }
  patchSmtpBool(key: keyof SmtpSettingsDto, value: boolean) {
    const s = this.smtp(); if (!s) return;
    this.smtp.set({ ...s, [key]: value });
  }
  patchTpw(key: keyof TrustPayWaySettingsDto, value: string) {
    const t = this.tpw(); if (!t) return;
    const numeric = key === 'connectTimeoutMs' || key === 'readTimeoutMs' || key === 'statusReadTimeoutMs';
    const v: unknown = numeric ? (value ? Number(value) : null) : (value || null);
    this.tpw.set({ ...t, [key]: v });
  }
  saveSmtp() {
    const s = this.smtp(); if (!s) return;
    this.smtpBusy.set(true); this.smtpMsg.set(''); this.smtpErr.set('');
    const req: SmtpSettingsUpdate = {
      enabled: s.enabled, host: s.host, port: s.port, username: s.username,
      password: this.smtpPassword() || null, from: s.from, fromName: s.fromName, publicUrl: s.publicUrl,
    };
    this.api.updateSmtpSettings(req).subscribe({
      next: (r) => { this.smtp.set(r); this.smtpPassword.set(''); this.smtpBusy.set(false); this.smtpMsg.set('Paramètres SMTP enregistrés'); },
      error: (e) => { this.smtpBusy.set(false); this.smtpErr.set(e?.error?.error || e?.error?.message || 'Erreur'); },
    });
  }
  doTestSmtp() {
    this.smtpBusy.set(true); this.smtpMsg.set(''); this.smtpErr.set('');
    this.api.testSmtp('').subscribe({
      next: (r) => { this.smtpBusy.set(false); if (r.ok) this.smtpMsg.set(r.message); else this.smtpErr.set(r.message); },
      error: (e) => { this.smtpBusy.set(false); this.smtpErr.set(e?.error?.message || 'Erreur'); },
    });
  }
  saveTpw() {
    const t = this.tpw(); if (!t) return;
    this.tpwBusy.set(true); this.tpwMsg.set(''); this.tpwErr.set('');
    const req: TrustPayWaySettingsUpdate = {
      baseUrl: t.baseUrl, secretKey: this.tpwSecret() || null, applicationId: t.applicationId,
      notifUrl: t.notifUrl, webhookSecret: this.tpwWebhook() || null,
      connectTimeoutMs: t.connectTimeoutMs, readTimeoutMs: t.readTimeoutMs, statusReadTimeoutMs: t.statusReadTimeoutMs,
    };
    this.api.updateTrustPayWaySettings(req).subscribe({
      next: (r) => { this.tpw.set(r); this.tpwSecret.set(''); this.tpwWebhook.set(''); this.tpwBusy.set(false); this.tpwMsg.set('Paramètres TrustPayWay enregistrés'); },
      error: (e) => { this.tpwBusy.set(false); this.tpwErr.set(e?.error?.error || e?.error?.message || 'Erreur'); },
    });
  }
  doTestTpw() {
    this.tpwBusy.set(true); this.tpwMsg.set(''); this.tpwErr.set('');
    this.api.testTrustPayWay().subscribe({
      next: (r) => { this.tpwBusy.set(false); if (r.ok) this.tpwMsg.set(r.message); else this.tpwErr.set(r.message); },
      error: (e) => { this.tpwBusy.set(false); this.tpwErr.set(e?.error?.message || 'Erreur'); },
    });
  }
}
