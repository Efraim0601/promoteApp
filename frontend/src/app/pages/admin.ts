import { Component, OnDestroy, OnInit, computed, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { I18n } from '../core/i18n';
import { Api } from '../core/api';
import { Auth } from '../core/auth';
import { AdminStats, Agency, ALL_ROLES, CardConfig, Collecte, CreateUserRequest, ImportAgenciesResult, ImportAgencyRow, ImportUserRow, ImportUsersResult, LoginAudit, PaymentStats, Recharge, Role, Subscription, User } from '../core/models';
import { AppBarComponent } from '../shared/app-bar';
import { IconComponent } from '../shared/icon';
import { AvatarComponent } from '../shared/avatar';
import { FieldComponent } from '../shared/fields';
import { TxDetailComponent } from '../shared/tx-detail';
import { SpinnerComponent } from '../shared/spinner';
import { StatusBadgeComponent } from '../shared/status-badge';
import { ClientPhotoComponent } from '../shared/client-photo';
import { AdminMapComponent } from './admin-map';
import { LIVE_REFRESH_MS, payById, recordStatus, formatPan, COLLECTE_PRODUCTS } from '../shared/constants';

@Component({
  selector: 'page-admin',
  standalone: true,
  imports: [AppBarComponent, IconComponent, AvatarComponent, FieldComponent, TxDetailComponent, SpinnerComponent, StatusBadgeComponent, ClientPhotoComponent, AdminMapComponent],
  template: `
  <div class="scr">
    <app-bar class="appbar-wide">
      <button appbar-right class="icon-btn" (click)="auth.logout()" [title]="i18n.t('logout')"><ic name="logout" [size]="15" [sw]="2"></ic></button>
    </app-bar>

    <div class="admin-layout">
      <!-- ===== Sidebar ===== -->
      <aside class="admin-side">
        <div class="admin-userbox">
          <avatar [name]="auth.user()!.name" role="admin" [size]="40"></avatar>
          <div style="min-width:0">
            <div style="font-size:13.5px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{ auth.user()!.name }}</div>
            <div class="muted" style="font-size:11px">{{ i18n.t('role_admin') }}</div>
          </div>
        </div>
        <nav class="admin-nav">
          <button [class.active]="section() === 'overview'" (click)="section.set('overview')"><ic name="chart" [size]="18"></ic> {{ i18n.t('nav_overview') }}</button>
          <button [class.active]="section() === 'config'" (click)="section.set('config')"><ic name="gear" [size]="18"></ic> {{ i18n.t('nav_config') }}</button>
          <button [class.active]="section() === 'users'" (click)="section.set('users')"><ic name="user" [size]="18"></ic> {{ i18n.t('nav_users') }}</button>
          <button [class.active]="section() === 'agencies'" (click)="section.set('agencies')"><ic name="pin" [size]="18"></ic> {{ i18n.t('nav_agencies') }}</button>
          <button [class.active]="section() === 'transactions'" (click)="section.set('transactions')"><ic name="hash" [size]="18"></ic> {{ i18n.t('nav_transactions') }}</button>
          <button [class.active]="section() === 'recharges'" (click)="section.set('recharges')"><ic name="phone" [size]="18"></ic> {{ i18n.t('nav_recharges') }}</button>
          <button [class.active]="section() === 'collectes'" (click)="section.set('collectes')"><ic name="store" [size]="18"></ic> {{ i18n.t('nav_collectes') }}</button>
          <button [class.active]="section() === 'audit'" (click)="section.set('audit')"><ic name="shield" [size]="18"></ic> {{ i18n.t('nav_audit') }}</button>
          <button [class.active]="section() === 'map'" (click)="section.set('map')"><ic name="pin" [size]="18"></ic> {{ i18n.t('nav_map') }}</button>
        </nav>
        <div class="admin-spacer"></div>
        <nav class="admin-nav admin-logout">
          <button (click)="auth.logout()"><ic name="logout" [size]="18"></ic> {{ i18n.t('logout') }}</button>
        </nav>
      </aside>

      <!-- ===== Main content ===== -->
      <main class="admin-main">

      <!-- ========== OVERVIEW ========== -->
      @if (section() === 'overview') {
      <h1 style="font-size:21px">{{ i18n.t('nav_overview') }}</h1>
      @if (statsLoading()) {
      <div class="card load-center"><spinner tone="primary" [size]="22"></spinner> {{ i18n.t('loading') }}</div>
      } @else {
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div class="kpi"><div class="kv">{{ stats()?.total ?? 0 }}</div><div class="kl">{{ i18n.t('kpi_total') }}</div></div>
        <div class="kpi"><div class="kv" style="font-size:17px;color:var(--primary)">{{ i18n.money(stats()?.collected ?? 0) }}</div><div class="kl">{{ i18n.t('kpi_collected') }}</div></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-top:10px">
        <div class="kpi"><div class="kv" style="color:var(--success)">{{ stats()?.paid ?? 0 }}</div><div class="kl">{{ i18n.t('kpi_success') }}</div></div>
        <div class="kpi"><div class="kv" style="color:var(--af-gold)">{{ stats()?.pending ?? 0 }}</div><div class="kl">{{ i18n.t('kpi_pending') }}</div></div>
        <!-- Failed payments — click to jump to the filtered transactions table. -->
        <div class="kpi" (click)="showFailed()" style="cursor:pointer"
             [style.borderColor]="failedCount() ? 'color-mix(in srgb, var(--accent) 45%, var(--border))' : 'var(--border)'"
             [style.background]="failedCount() ? 'var(--accent-soft)' : 'var(--surface)'">
          <div class="kv" style="color:var(--accent)">{{ failedCount() }}</div><div class="kl">{{ i18n.t('kpi_failed') }}</div>
        </div>
      </div>

      <!-- ===== Mobile Money payment funnel ===== -->
      @if (payStats(); as p) {
        <div class="card" style="padding:16px">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px">
            <ic name="phone" [size]="17" style="color:var(--primary)"></ic>
            <h3 style="font-size:15px">{{ i18n.t('pay_funnel_title') }}</h3>
            <span style="margin-left:auto;display:inline-flex;align-items:center;gap:5px;font-size:10.5px;font-weight:700;color:var(--success)" [title]="i18n.t('live_auto')"><span class="live-dot"></span>{{ i18n.t('live_auto') }}</span>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">
            <div class="kpi"><div class="kv">{{ p.momoTotal }}</div><div class="kl">{{ i18n.t('pay_funnel_total') }}</div></div>
            <div class="kpi"><div class="kv" style="color:var(--success)">{{ rate(p.momoPaid, p.momoTotal) }}%</div><div class="kl">{{ i18n.t('pay_funnel_success_rate') }}</div></div>
            <div class="kpi"><div class="kv" style="font-size:17px">{{ p.medianConfirmSeconds }}s</div><div class="kl">{{ i18n.t('pay_funnel_median') }}</div></div>
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:12px;font-size:12px;font-weight:700">
            <span style="display:inline-flex;align-items:center;gap:5px;padding:5px 10px;border-radius:99px;background:var(--success-soft);color:var(--success)">{{ p.momoPaid }} {{ i18n.t('st_paid') }}</span>
            <span style="display:inline-flex;align-items:center;gap:5px;padding:5px 10px;border-radius:99px;background:var(--surface-2);color:var(--muted)">{{ p.momoPending }} {{ i18n.t('st_pending') }}</span>
            <span style="display:inline-flex;align-items:center;gap:5px;padding:5px 10px;border-radius:99px;background:var(--accent-soft);color:var(--accent)">{{ p.momoFailed }} {{ i18n.t('st_failed') }}</span>
          </div>
          <div style="margin-top:14px">
            <div class="muted" style="font-size:11.5px;font-weight:700;margin-bottom:6px">{{ i18n.t('pay_funnel_by_network') }}</div>
            <div class="srow" style="padding:6px 0"><span class="lbl">Orange Money</span><span class="val">{{ p.orangePaid }}/{{ p.orangeTotal }} · {{ rate(p.orangePaid, p.orangeTotal) }}%</span></div>
            <div class="srow" style="padding:6px 0"><span class="lbl">MTN MoMo</span><span class="val">{{ p.mtnPaid }}/{{ p.mtnTotal }} · {{ rate(p.mtnPaid, p.mtnTotal) }}%</span></div>
          </div>
          @if (p.momoFailed) {
            <div style="margin-top:10px;border-top:1px solid var(--border);padding-top:10px">
              <div class="muted" style="font-size:11.5px;font-weight:700;margin-bottom:6px">{{ i18n.t('pay_funnel_failures') }}</div>
              <div class="srow" style="padding:5px 0"><span class="lbl">{{ i18n.t('fail_insufficient') }}</span><span class="val">{{ p.insufficientFunds }}</span></div>
              <div class="srow" style="padding:5px 0"><span class="lbl">{{ i18n.t('fail_expired') }}</span><span class="val">{{ p.expired }}</span></div>
              <div class="srow" style="padding:5px 0"><span class="lbl">{{ i18n.t('fail_other') }}</span><span class="val">{{ p.otherFailures }}</span></div>
            </div>
          }
        </div>
      }

      <div class="card" style="padding:16px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px">
          <ic name="award" [size]="17" style="color:var(--primary)"></ic>
          <h3 style="font-size:15px">{{ i18n.t('by_agent') }}</h3>
        </div>
        <div style="display:flex;flex-direction:column;gap:14px">
          @for (r of stats()?.byAgent ?? []; track r.id) {
            <div style="display:flex;align-items:center;gap:11px">
              @if (r.role === 'online') {
                <span class="op-logo" style="width:34px;height:34px;border-radius:50%;background:var(--surface-2);color:var(--muted);flex-shrink:0"><ic name="qr" [size]="17"></ic></span>
              } @else {
                <avatar [name]="r.name" role="agent" [size]="34"></avatar>
              }
              <div style="min-width:0;flex:1">
                <div style="display:flex;justify-content:space-between;gap:8px">
                  <span style="font-size:13px;font-weight:700;flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{ r.role === 'online' ? i18n.t('online_channel') : r.name }}</span>
                  <span style="font-size:12.5px;font-weight:800;white-space:nowrap;flex-shrink:0">{{ r.count }} <span class="muted" style="font-weight:600">{{ i18n.t(r.count > 1 ? 'sales_unit' : 'sale_unit') }}</span></span>
                </div>
                <div style="height:7px;background:var(--surface-2);border-radius:99px;margin-top:5px;overflow:hidden">
                  <div [style.width.%]="pct(r.count)" [style.background]="r.role === 'online' ? 'var(--muted)' : 'var(--primary)'" style="height:100%;border-radius:99px;transition:width .4s"></div>
                </div>
                <div class="muted" style="font-size:11px;margin-top:4px">{{ r.agency || i18n.t('arrived_via') }} · {{ i18n.money(r.collected) }}</div>
              </div>
            </div>
          }
        </div>
      </div>
      }

      }

      <!-- ========== CONFIG ========== -->
      @if (section() === 'config') {
      <h1 style="font-size:21px">{{ i18n.t('nav_config') }}</h1>
      <div class="card" style="padding:16px">
        <div style="display:flex;align-items:flex-start;gap:9px;margin-bottom:14px">
          <ic name="gear" [size]="17" style="color:var(--primary);flex-shrink:0;margin-top:2px"></ic>
          <div style="min-width:0">
            <h3 style="font-size:15px;line-height:1.2">{{ i18n.t('config_title') }}</h3>
            <p class="muted" style="font-size:11.5px;line-height:1.4;margin-top:3px">{{ i18n.t('config_sub') }}</p>
          </div>
        </div>
        @if (cfgLoading()) {
        <div class="load-center"><spinner tone="primary" [size]="22"></spinner> {{ i18n.t('loading') }}</div>
        } @else {
        <div style="display:flex;flex-direction:column;gap:12px">
          <field [label]="i18n.t('card_price')">
            <div class="input-prefix"><input inputmode="numeric" [value]="cfg().price" (input)="onCfg('price', $event)" /><span class="pfx" style="border-right:none;border-left:1.5px solid var(--border)">{{ i18n.t('fcfa') }}</span></div>
          </field>
          <field [label]="i18n.t('fees')">
            <div class="input-prefix"><input inputmode="numeric" [value]="cfg().fees" (input)="onCfg('fees', $event)" /><span class="pfx" style="border-right:none;border-left:1.5px solid var(--border)">{{ i18n.t('fcfa') }}</span></div>
          </field>
          <field [label]="i18n.t('transport_fee')">
            <div class="input-prefix"><input inputmode="numeric" [value]="cfg().transport" (input)="onCfg('transport', $event)" /><span class="pfx" style="border-right:none;border-left:1.5px solid var(--border)">{{ i18n.t('fcfa') }}</span></div>
          </field>

          <!-- Offre Promote: carte gratuite — le client paie la recharge initiale + le Pass Premium. -->
          <div style="border-top:1px solid var(--border);padding-top:12px;margin-top:2px">
            <div style="font-size:12.5px;font-weight:800;color:var(--primary);margin-bottom:4px">{{ i18n.t('cfg_offer_title') }}</div>
            <p class="muted" style="font-size:11px;line-height:1.4;margin-bottom:10px">{{ i18n.t('cfg_offer_sub') }}</p>
            <div style="display:flex;gap:10px">
              <field [label]="i18n.t('offer_recharge_initiale')" style="flex:1">
                <div class="input-prefix"><input inputmode="numeric" [value]="cfg().rechargeInitiale" (input)="onCfg('rechargeInitiale', $event)" /><span class="pfx" style="border-right:none;border-left:1.5px solid var(--border)">{{ i18n.t('fcfa') }}</span></div>
              </field>
              <field [label]="i18n.t('offer_pass_premium')" style="flex:1">
                <div class="input-prefix"><input inputmode="numeric" [value]="cfg().passPremium" (input)="onCfg('passPremium', $event)" /><span class="pfx" style="border-right:none;border-left:1.5px solid var(--border)">{{ i18n.t('fcfa') }}</span></div>
              </field>
            </div>
            <div class="srow total" style="margin-top:8px"><span class="lbl">{{ i18n.t('total') }}</span><span class="val">{{ i18n.money((cfg().rechargeInitiale || 0) + (cfg().passPremium || 0)) }}</span></div>
          </div>

          <!-- Recharge (top-up) free-entry amount bounds. -->
          <div style="border-top:1px solid var(--border);padding-top:12px;margin-top:2px">
            <div style="font-size:12.5px;font-weight:800;color:var(--primary);margin-bottom:10px">{{ i18n.t('cfg_recharge_title') }}</div>
            <div style="display:flex;gap:10px">
              <field [label]="i18n.t('cfg_recharge_min')" style="flex:1">
                <div class="input-prefix"><input inputmode="numeric" [value]="cfg().rechargeMin" (input)="onCfg('rechargeMin', $event)" /><span class="pfx" style="border-right:none;border-left:1.5px solid var(--border)">{{ i18n.t('fcfa') }}</span></div>
              </field>
              <field [label]="i18n.t('cfg_recharge_max')" style="flex:1">
                <div class="input-prefix"><input inputmode="numeric" [value]="cfg().rechargeMax" (input)="onCfg('rechargeMax', $event)" /><span class="pfx" style="border-right:none;border-left:1.5px solid var(--border)">{{ i18n.t('fcfa') }}</span></div>
              </field>
            </div>
          </div>

          <button class="btn btn-primary" [disabled]="!changed() || saving()" (click)="saveCfg()" style="padding:12px">
            @if (saving()) { <spinner></spinner> } @else if (saved()) { <ic name="check" [size]="18" [sw]="2.5"></ic> {{ i18n.t('saved') }} } @else { {{ i18n.t('save') }} }
          </button>
          @if (saveErr()) { <p class="err" style="font-size:12px;text-align:center;margin-top:2px">{{ i18n.t('save_error') }}</p> }
        </div>
        }
      </div>

      }

      <!-- ========== USERS ========== -->
      @if (section() === 'users') {
      <h1 style="font-size:21px">{{ i18n.t('nav_users') }}</h1>
      <div class="card" style="padding:16px">
        <div style="display:flex;align-items:flex-start;gap:9px;margin-bottom:14px">
          <ic name="user" [size]="17" style="color:var(--primary);flex-shrink:0;margin-top:2px"></ic>
          <div style="min-width:0">
            <h3 style="font-size:15px;line-height:1.2">{{ i18n.t('users_title') }}</h3>
            <p class="muted" style="font-size:11.5px;line-height:1.4;margin-top:3px">{{ i18n.t('users_sub') }}</p>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:10px">
          <field [label]="i18n.t('user_name')"><input class="input" [value]="nu().name" (input)="onNu('name', $event)" /></field>
          <field [label]="i18n.t('user_email')"><input class="input" type="email" [value]="nu().email" (input)="onNu('email', $event)" /></field>
          <field [label]="i18n.t('user_roles')" [hint]="i18n.t('user_roles_hint')">
            <div style="display:flex;flex-wrap:wrap;gap:7px">
              @for (r of allRoles; track r) {
                <button type="button" (click)="toggleNuRole(r)"
                        [class.btn-primary]="nuHasRole(r)" [class.btn-outline]="!nuHasRole(r)"
                        class="btn" style="padding:6px 11px;font-size:12px">{{ roleLabel(r) }}</button>
              }
            </div>
          </field>
          @if (nuHasRole('AGENT')) {
            <field [label]="i18n.t('user_agency')"><input class="input" [value]="nu().agency || ''" (input)="onNu('agency', $event)" /></field>
            <field [label]="i18n.t('user_phone')" [hint]="i18n.t('user_phone_hint')"
                   [err]="(nu().phone || '') && !agentPhoneOk() ? i18n.t('user_phone_invalid') : null">
              <input class="input" inputmode="numeric" maxlength="9" [value]="nu().phone || ''" (input)="onNu('phone', $event)" />
            </field>
          }
          <p class="muted" style="font-size:11.5px;line-height:1.4;margin:-2px 0 2px">{{ i18n.t('user_pw_note') }}</p>
          <button class="btn btn-primary" [disabled]="!userValid() || userBusy()" (click)="createUser()" style="padding:12px">
            @if (userBusy()) { <spinner></spinner> } @else { <ic name="plus" [size]="17"></ic> {{ i18n.t('user_create') }} }
          </button>
          @if (userMsg() === 'created' && createdPw()) {
            <div class="feedback" style="flex-direction:column;align-items:stretch;gap:6px;background:var(--surface-2);border-radius:10px;padding:10px 12px">
              <span style="font-size:12px;color:var(--success);font-weight:700">{{ i18n.t('user_created_pw') }}</span>
              <div style="display:flex;align-items:center;gap:8px">
                <code style="font-size:14px;font-weight:700;letter-spacing:.5px;flex:1">{{ createdPw() }}</code>
                <button class="btn btn-outline" style="padding:6px 10px;font-size:12px" (click)="copyPw()">
                  <ic name="copy" [size]="15"></ic> {{ pwCopied() ? i18n.t('copied') : i18n.t('copy_btn') }}
                </button>
              </div>
            </div>
          }
          @if (userMsg() === 'exists') { <p class="err" style="font-size:12px;text-align:center">{{ i18n.t('user_exists') }}</p> }
          @if (userMsg() === 'invalid') { <p class="err" style="font-size:12px;text-align:center">{{ i18n.t('user_invalid') }}</p> }
        </div>

        <div class="kicker" style="margin-top:16px;margin-bottom:6px">{{ i18n.t('users_list') }} · {{ usersList().length }}</div>
        @if (usersLoading()) {
        <div class="load-center"><spinner tone="primary" [size]="20"></spinner> {{ i18n.t('loading') }}</div>
        } @else {
        <div style="display:flex;flex-direction:column">
          @for (u of pagedUsers(); track u.id) {
            <div style="display:flex;align-items:center;gap:10px;padding:9px 2px;border-top:1px solid var(--border);flex-wrap:wrap" [style.opacity]="u.enabled === false ? '.5' : '1'">
              <avatar [name]="u.name" [size]="30"></avatar>
              <div style="min-width:120px;flex:1">
                <div style="font-size:13px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{ u.name }}</div>
                <div class="muted" style="font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{ u.email }}</div>
              </div>
              <!-- Badges + action grouped so they wrap together and never overflow the card on a narrow column. -->
              <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end;margin-left:auto;flex-shrink:0">
                @if (u.enabled === false) {
                  <span class="badge" style="background:var(--accent-soft);color:var(--accent);font-size:10px">{{ i18n.t('user_disabled') }}</span>
                }
                @for (r of userRoles(u); track r) {
                  <span class="badge" style="background:var(--surface-2);color:var(--muted);font-size:10.5px">{{ roleLabel(r) }}</span>
                }
                <button class="icon-btn" (click)="startEditRoles(u)" [title]="i18n.t('user_edit_roles')" style="flex-shrink:0"><ic name="gear" [size]="15"></ic></button>
                @if (u.id !== auth.user()?.id) {
                  <button class="btn btn-outline" (click)="toggleUser(u)" [disabled]="userToggling() === u.id"
                          style="padding:5px 9px;font-size:11px;white-space:nowrap">
                    {{ u.enabled === false ? i18n.t('user_enable') : i18n.t('user_disable') }}
                  </button>
                }
              </div>
              <!-- Inline role editor (multi-role). -->
              @if (editRolesId() === u.id) {
                <div style="flex-basis:100%;border-top:1px dashed var(--border);margin-top:6px;padding-top:8px;display:flex;flex-direction:column;gap:8px">
                  <div style="display:flex;flex-wrap:wrap;gap:7px">
                    @for (r of allRoles; track r) {
                      <button type="button" (click)="toggleEditRole(r)"
                              [class.btn-primary]="editRoles().includes(r)" [class.btn-outline]="!editRoles().includes(r)"
                              class="btn" style="padding:5px 10px;font-size:11.5px">{{ roleLabel(r) }}</button>
                    }
                  </div>
                  @if (editRolesErr()) { <span class="err" style="font-size:11.5px">{{ i18n.t(editRolesErr()) }}</span> }
                  <div style="display:flex;gap:8px">
                    <button class="btn btn-primary" (click)="saveRoles(u)" [disabled]="!editRoles().length || editRolesSaving()" style="padding:7px 12px;font-size:12.5px">
                      @if (editRolesSaving()) { <spinner></spinner> } @else { {{ i18n.t('save') }} }
                    </button>
                    <button class="btn btn-ghost" (click)="editRolesId.set(null)" [disabled]="editRolesSaving()" style="padding:7px 12px;font-size:12.5px">{{ i18n.t('cancel_short') }}</button>
                  </div>
                </div>
              }
            </div>
          }
        </div>
        @if (userToggleErr()) { <p class="err" style="font-size:12px;text-align:center;margin-top:6px">{{ i18n.t(userToggleErr()) }}</p> }
        @if (userPageCount() > 1) {
          <div class="tx-pager">
            <span class="muted" style="font-size:11.5px">{{ i18n.t('step') }} {{ userPage() + 1 }} {{ i18n.t('of') }} {{ userPageCount() }}</span>
            <div style="display:flex;gap:6px">
              <button class="btn btn-outline" (click)="userPrev()" [disabled]="userPage() === 0" style="padding:7px 12px;font-size:13px"><ic name="chevL" [size]="16"></ic></button>
              <button class="btn btn-outline" (click)="userNext()" [disabled]="userPage() >= userPageCount() - 1" style="padding:7px 12px;font-size:13px"><ic name="chevR" [size]="16"></ic></button>
            </div>
          </div>
        }
        }
      </div>

      <!-- Bulk import users -->
      <div class="card" style="padding:16px;margin-top:12px">
        <div style="display:flex;align-items:flex-start;gap:9px;margin-bottom:12px">
          <ic name="download" [size]="17" style="color:var(--primary);flex-shrink:0;margin-top:2px"></ic>
          <div style="min-width:0">
            <h3 style="font-size:15px;line-height:1.2">{{ i18n.t('import_title') }}</h3>
            <p class="muted" style="font-size:11.5px;line-height:1.4;margin-top:3px">{{ i18n.t('import_sub') }}</p>
          </div>
        </div>

        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">
          <button class="btn btn-outline" (click)="importFile.click()" style="flex:1;min-width:140px;padding:9px;font-size:13px"><ic name="copy" [size]="15"></ic> {{ i18n.t('import_pick') }}</button>
          <button class="btn btn-ghost" (click)="downloadTemplate()" style="flex:1;min-width:120px;padding:9px;font-size:13px"><ic name="download" [size]="15"></ic> {{ i18n.t('import_template') }}</button>
        </div>
        <input #importFile type="file" accept=".csv,text/csv,text/plain" (change)="onImportFile($event)" style="display:none" />

        <field [label]="i18n.t('import_paste_label')">
          <textarea class="input" rows="4" [placeholder]="i18n.t('import_paste_ph')" [value]="importText()" (input)="onImportText($event)" style="resize:vertical;font-family:var(--font);line-height:1.5"></textarea>
        </field>

        @if (preview().length) {
          <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:10px;font-size:12px;font-weight:700">
            <span style="color:var(--success)">{{ importCounts().created }} {{ i18n.t('import_new') }}</span>
            <span style="color:var(--af-gold)">{{ importCounts().dup }} {{ i18n.t('import_dup') }}</span>
            @if (importCounts().invalid) { <span style="color:var(--accent)">{{ importCounts().invalid }} {{ i18n.t('import_invalid') }}</span> }
          </div>

          <div style="margin-top:10px">
            <div class="muted" style="font-size:11px;font-weight:700;margin-bottom:5px">{{ i18n.t('import_dup_policy') }}</div>
            <div style="display:flex;gap:6px">
              <button class="btn" [class.btn-primary]="!importUpdate()" [class.btn-outline]="importUpdate()" (click)="importUpdate.set(false)" style="flex:1;padding:8px;font-size:12.5px">{{ i18n.t('import_skip') }}</button>
              <button class="btn" [class.btn-primary]="importUpdate()" [class.btn-outline]="!importUpdate()" (click)="importUpdate.set(true)" style="flex:1;padding:8px;font-size:12.5px">{{ i18n.t('import_update') }}</button>
            </div>
          </div>

          <div style="max-height:220px;overflow-y:auto;margin-top:10px;border:1px solid var(--border);border-radius:var(--radius)">
            @for (r of preview(); track $index) {
              <div style="display:flex;align-items:center;gap:8px;padding:7px 9px;border-bottom:1px solid var(--border)">
                @switch (r.status) {
                  @case ('new') { <span class="badge" style="background:color-mix(in srgb, var(--success) 18%, transparent);color:var(--success);font-size:10px;flex-shrink:0">{{ i18n.t('import_new') }}</span> }
                  @case ('duplicate') { <span class="badge" style="background:color-mix(in srgb, var(--af-gold) 22%, transparent);color:#8a6400;font-size:10px;flex-shrink:0">{{ i18n.t('import_dup') }}</span> }
                  @case ('invalid') { <span class="badge" style="background:var(--accent-soft);color:var(--accent);font-size:10px;flex-shrink:0">{{ i18n.t('import_invalid') }}</span> }
                }
                <div style="min-width:0;flex:1">
                  <div style="font-size:12.5px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{ r.name || '—' }} <span class="muted" style="font-weight:500">· {{ r.role || '—' }}</span></div>
                  <div class="muted" style="font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{ r.email || '—' }}@if (r.status === 'invalid') { · <span style="color:var(--accent)">{{ impReason(r.reason) }}</span> }</div>
                </div>
              </div>
            }
          </div>

          <div style="display:flex;gap:8px;margin-top:10px">
            <button class="btn btn-primary" [disabled]="importBusy() || !importActionable()" (click)="runImport()" style="flex:1;padding:11px">
              @if (importBusy()) { <spinner></spinner> } @else { <ic name="check" [size]="17"></ic> {{ i18n.t('import_run') }} {{ importActionable() }} {{ i18n.t('import_lines') }} }
            </button>
            <button class="btn btn-ghost" (click)="clearImport()" [disabled]="importBusy()" style="padding:11px">{{ i18n.t('tx_clear') }}</button>
          </div>
          @if (importErr()) { <p class="err" style="font-size:12px;text-align:center;margin-top:6px">{{ i18n.t('import_error') }}</p> }
        }

        @if (importResult(); as res) {
          <div class="card" style="background:var(--surface-2);padding:12px 14px;margin-top:12px">
            <div style="font-size:13px;font-weight:800;margin-bottom:6px"><ic name="check" [size]="15" style="color:var(--success);vertical-align:-2px"></ic> {{ i18n.t('import_done') }}</div>
            <div style="font-size:12.5px;line-height:1.7">
              <b style="color:var(--success)">{{ res.created }}</b> {{ i18n.t('import_created') }} ·
              <b>{{ res.updated }}</b> {{ i18n.t('import_updated') }} ·
              <b>{{ res.skipped }}</b> {{ i18n.t('import_skipped') }}@if (res.invalid) { · <b style="color:var(--accent)">{{ res.invalid }}</b> {{ i18n.t('import_invalid_n') }} }
            </div>

            @if (importCreds().length) {
              <div class="kicker" style="margin-top:12px;margin-bottom:4px">{{ i18n.t('import_creds_title') }}</div>
              <p class="muted" style="font-size:11px;line-height:1.4;margin-bottom:8px">{{ i18n.t('import_creds_hint') }}</p>
              <div style="max-height:160px;overflow-y:auto;font-size:12px">
                @for (c of importCreds(); track c.email) {
                  <div style="display:flex;justify-content:space-between;gap:8px;padding:4px 0;border-top:1px solid var(--border)">
                    <span class="muted" style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ c.email }}</span>
                    <code style="font-weight:800;flex-shrink:0">{{ c.tempPassword }}</code>
                  </div>
                }
              </div>
              <button class="btn btn-outline" (click)="downloadCredentials()" style="width:100%;padding:9px;font-size:13px;margin-top:8px"><ic name="download" [size]="15"></ic> {{ i18n.t('import_creds_download') }}</button>
            }
          </div>
        }
      </div>

      }

      <!-- ========== PICKUP AGENCIES (lieux de retrait) ========== -->
      @if (section() === 'agencies') {
      <h1 style="font-size:21px">{{ i18n.t('nav_agencies') }}</h1>

      <!-- Import pickup agencies -->
      <div class="card" style="padding:16px;margin-top:12px">
        <div style="display:flex;align-items:flex-start;gap:9px;margin-bottom:12px">
          <ic name="download" [size]="17" style="color:var(--primary);flex-shrink:0;margin-top:2px"></ic>
          <div style="min-width:0">
            <h3 style="font-size:15px;line-height:1.2">{{ i18n.t('ag_import_title') }}</h3>
            <p class="muted" style="font-size:11.5px;line-height:1.4;margin-top:3px">{{ i18n.t('ag_import_sub') }}</p>
          </div>
        </div>

        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">
          <button class="btn btn-outline" (click)="agFile.click()" style="flex:1;min-width:140px;padding:9px;font-size:13px"><ic name="copy" [size]="15"></ic> {{ i18n.t('import_pick') }}</button>
          <button class="btn btn-ghost" (click)="downloadAgTemplate()" style="flex:1;min-width:120px;padding:9px;font-size:13px"><ic name="download" [size]="15"></ic> {{ i18n.t('import_template') }}</button>
        </div>
        <input #agFile type="file" accept=".csv,text/csv,text/plain" (change)="onAgFile($event)" style="display:none" />

        <field [label]="i18n.t('import_paste_label')">
          <textarea class="input" rows="4" [placeholder]="i18n.t('ag_paste_ph')" [value]="agText()" (input)="onAgText($event)" style="resize:vertical;font-family:var(--font);line-height:1.5"></textarea>
        </field>

        @if (agPreview().length) {
          <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:10px;font-size:12px;font-weight:700">
            <span style="color:var(--success)">{{ agCounts().created }} {{ i18n.t('import_new') }}</span>
            <span style="color:var(--af-gold)">{{ agCounts().dup }} {{ i18n.t('import_dup') }}</span>
            @if (agCounts().invalid) { <span style="color:var(--accent)">{{ agCounts().invalid }} {{ i18n.t('import_invalid') }}</span> }
          </div>

          <div style="margin-top:10px">
            <div class="muted" style="font-size:11px;font-weight:700;margin-bottom:5px">{{ i18n.t('import_dup_policy') }}</div>
            <div style="display:flex;gap:6px">
              <button class="btn" [class.btn-primary]="!agUpdate()" [class.btn-outline]="agUpdate()" (click)="agUpdate.set(false)" style="flex:1;padding:8px;font-size:12.5px">{{ i18n.t('import_skip') }}</button>
              <button class="btn" [class.btn-primary]="agUpdate()" [class.btn-outline]="!agUpdate()" (click)="agUpdate.set(true)" style="flex:1;padding:8px;font-size:12.5px">{{ i18n.t('import_update') }}</button>
            </div>
          </div>

          <div style="max-height:220px;overflow-y:auto;margin-top:10px;border:1px solid var(--border);border-radius:var(--radius)">
            @for (r of agPreview(); track $index) {
              <div style="display:flex;align-items:center;gap:8px;padding:7px 9px;border-bottom:1px solid var(--border)">
                @switch (r.status) {
                  @case ('new') { <span class="badge" style="background:color-mix(in srgb, var(--success) 18%, transparent);color:var(--success);font-size:10px;flex-shrink:0">{{ i18n.t('import_new') }}</span> }
                  @case ('duplicate') { <span class="badge" style="background:color-mix(in srgb, var(--af-gold) 22%, transparent);color:#8a6400;font-size:10px;flex-shrink:0">{{ i18n.t('import_dup') }}</span> }
                  @case ('invalid') { <span class="badge" style="background:var(--accent-soft);color:var(--accent);font-size:10px;flex-shrink:0">{{ i18n.t('import_invalid') }}</span> }
                }
                <div style="min-width:0;flex:1">
                  <div style="font-size:12.5px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{ r.name || '—' }}</div>
                  <div class="muted" style="font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{ r.city || '—' }}@if (r.status === 'invalid') { · <span style="color:var(--accent)">{{ i18n.t('ag_r_name') }}</span> }</div>
                </div>
              </div>
            }
          </div>

          <div style="display:flex;gap:8px;margin-top:10px">
            <button class="btn btn-primary" [disabled]="agBusy() || !agActionable()" (click)="runAgImport()" style="flex:1;padding:11px">
              @if (agBusy()) { <spinner></spinner> } @else { <ic name="check" [size]="17"></ic> {{ i18n.t('import_run') }} {{ agActionable() }} {{ i18n.t('import_lines') }} }
            </button>
            <button class="btn btn-ghost" (click)="clearAg()" [disabled]="agBusy()" style="padding:11px">{{ i18n.t('tx_clear') }}</button>
          </div>
          @if (agErr()) { <p class="err" style="font-size:12px;text-align:center;margin-top:6px">{{ i18n.t('import_error') }}</p> }
        }

        @if (agResult(); as res) {
          <div class="card" style="background:var(--surface-2);padding:12px 14px;margin-top:12px">
            <div style="font-size:13px;font-weight:800;margin-bottom:6px"><ic name="check" [size]="15" style="color:var(--success);vertical-align:-2px"></ic> {{ i18n.t('import_done') }}</div>
            <div style="font-size:12.5px;line-height:1.7">
              <b style="color:var(--success)">{{ res.created }}</b> {{ i18n.t('import_created') }} ·
              <b>{{ res.updated }}</b> {{ i18n.t('import_updated') }} ·
              <b>{{ res.skipped }}</b> {{ i18n.t('import_skipped') }}@if (res.invalid) { · <b style="color:var(--accent)">{{ res.invalid }}</b> {{ i18n.t('import_invalid_n') }} }
            </div>
          </div>
        }
      </div>

      <!-- Current pickup agencies -->
      <div class="kicker" style="margin-top:16px;margin-bottom:6px">{{ i18n.t('ag_list') }} · {{ agencies().length }}</div>
      @if (agLoading()) {
        <div class="load-center"><spinner tone="primary"></spinner></div>
      } @else if (!agencies().length) {
        <p class="muted" style="font-size:12.5px">{{ i18n.t('ag_empty') }}</p>
      } @else {
        <div class="card" style="padding:4px 0;overflow:hidden">
          @for (a of agencies(); track a.id) {
            <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid var(--border)">
              <ic name="pin" [size]="16" style="color:var(--primary);flex-shrink:0"></ic>
              <div style="min-width:0;flex:1">
                <div style="font-size:13px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{ a.name }}</div>
                @if (a.city) { <div class="muted" style="font-size:11px">{{ a.city }}</div> }
              </div>
            </div>
          }
        </div>
      }

      }

      <!-- ========== TRANSACTIONS (wider than the 760px content cap, for the detailed table) ========== -->
      @if (section() === 'transactions') {
      <h1 style="font-size:21px">{{ i18n.t('nav_transactions') }}</h1>
      <div class="card" style="overflow:hidden;max-width:1180px">
        <div style="display:flex;align-items:center;gap:8px;padding:14px 14px 10px">
          <ic name="chart" [size]="17" style="color:var(--primary)"></ic>
          <h3 style="font-size:15px">{{ i18n.t('all_sales') }}</h3>
          <span style="margin-left:auto;display:inline-flex;align-items:center;gap:5px;font-size:10.5px;font-weight:700;color:var(--success)" [title]="i18n.t('live_auto')"><span class="live-dot"></span>{{ i18n.t('live_auto') }}</span>
          <span class="muted" style="font-size:12px;font-weight:700">{{ filteredTxs().length }} {{ i18n.t('tx_count') }}</span>
        </div>
        <div style="padding:0 14px 12px;display:flex;flex-direction:column;gap:8px">
          <div class="input-prefix">
            <span class="pfx"><ic name="search" [size]="15"></ic></span>
            <input [placeholder]="i18n.t('tx_search_ph')" [value]="txSearch()" (input)="txSearch.set($any($event.target).value)" />
          </div>
          <!-- Quick filter: failed payments in one click -->
          <button (click)="toggleFailedFilter()"
                  [style.background]="txStatus() === 'failed' ? 'var(--accent)' : 'var(--accent-soft)'"
                  [style.color]="txStatus() === 'failed' ? '#fff' : 'var(--accent)'"
                  style="align-self:flex-start;border:none;border-radius:var(--radius-pill);padding:8px 14px;font-size:12.5px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;gap:7px;font-family:var(--font)">
            <ic name="alert" [size]="15"></ic> {{ i18n.t('tx_quick_failed') }}
            <span [style.background]="txStatus() === 'failed' ? 'rgba(255,255,255,.25)' : 'var(--accent)'"
                  [style.color]="txStatus() === 'failed' ? '#fff' : '#fff'"
                  style="min-width:18px;height:18px;padding:0 5px;border-radius:9px;font-size:11px;display:inline-flex;align-items:center;justify-content:center">{{ failedCount() }}</span>
          </button>
          <div style="display:flex;gap:8px">
            <select class="input" [value]="txStatus()" (change)="txStatus.set($any($event.target).value)" style="flex:1">
              <option value="all">{{ i18n.t('tx_all_status') }}</option>
              <option value="paid">{{ i18n.t('st_paid') }}</option>
              <option value="pending">{{ i18n.t('st_pending') }}</option>
              <option value="cash">{{ i18n.t('st_cash') }}</option>
              <option value="sara_pending">{{ i18n.t('st_sara_pending') }}</option>
              <option value="failed">{{ i18n.t('st_failed') }}</option>
              <option value="printed">{{ i18n.t('st_printed') }}</option>
            </select>
            <select class="input" [value]="txAgent()" (change)="txAgent.set($any($event.target).value)" style="flex:1">
              <option value="all">{{ i18n.t('tx_all_agents') }}</option>
              <option value="self">{{ i18n.t('tx_self') }}</option>
              @for (a of agentUsers; track a.id) { <option [value]="a.id">{{ a.name }}</option> }
            </select>
          </div>
          <div style="display:flex;gap:8px;align-items:center">
            <input class="input" type="date" [value]="txFrom()" (change)="txFrom.set($any($event.target).value)" style="flex:1" />
            <span class="muted" style="font-size:12px">→</span>
            <input class="input" type="date" [value]="txTo()" (change)="txTo.set($any($event.target).value)" style="flex:1" />
          </div>
          <div style="display:flex;gap:8px">
            <button class="btn btn-outline" (click)="exportCsv()" [disabled]="!filteredTxs().length" style="flex:1;padding:9px;font-size:13px"><ic name="copy" [size]="15"></ic> {{ i18n.t('tx_export') }}</button>
            <button class="btn btn-ghost" (click)="clearFilters()" style="flex:1;padding:9px;font-size:13px">{{ i18n.t('tx_clear') }}</button>
          </div>
        </div>
        @if (txLoading()) {
          <div class="load-center" style="padding:24px 0"><spinner tone="primary" [size]="22"></spinner> {{ i18n.t('loading') }}</div>
        } @else if (filteredTxs().length === 0) {
          <p class="muted" style="font-size:13px;padding:20px 14px;text-align:center">{{ i18n.t('tx_empty') }}</p>
        } @else {
          <div style="overflow-y:auto;overflow-x:hidden;max-height:min(68vh,600px);padding:0 2px">
            <table class="tx-table">
              <colgroup>
                <col style="width:44px" />
                <col />
                <col style="width:120px" />
                <col style="width:104px" />
                <col style="width:112px" />
                <col style="width:140px" />
                <col style="width:96px" />
                <col style="width:116px" />
              </colgroup>
              <thead>
                <tr>
                  <th style="width:46px"></th>
                  <th>{{ i18n.t('client') }}</th>
                  <th>{{ i18n.t('phone') }}</th>
                  <th>{{ i18n.t('cni_short') }}</th>
                  <th>{{ i18n.t('tx_date') }}</th>
                  <th>{{ i18n.t('pay_method_label') }}</th>
                  <th class="num">{{ i18n.t('tx_amount') }}</th>
                  <th>{{ i18n.t('tx_status') }}</th>
                </tr>
              </thead>
              <tbody>
                @for (t of pagedTxs(); track t.ref) {
                  <tr class="tx-tr" (click)="toggleExpand(t.ref)">
                    <td><client-photo [refId]="t.ref" [name]="t.fullName" [hasSelfie]="t.hasSelfie" [size]="38"></client-photo></td>
                    <td><div class="cell-name">{{ t.fullName }}</div><div class="cell-sub">{{ t.ref }}@if (t.channel === 'self') { · {{ i18n.t('tx_self') }} }</div></td>
                    <td class="nowrap" [attr.data-label]="i18n.t('phone')">{{ t.phone || '—' }}</td>
                    <td class="brk" [attr.data-label]="i18n.t('cni_short')">{{ t.cni || '—' }}</td>
                    <td class="nowrap" [attr.data-label]="i18n.t('tx_date')">{{ txDate(t.createdAt) }}</td>
                    <td [attr.data-label]="i18n.t('pay_method_label')"><span style="display:flex;align-items:center;gap:6px;min-width:0"><span class="op-logo" [style.background]="pm(t).bg" [style.color]="pm(t).fg" style="width:20px;height:20px;font-size:8px;border-radius:5px;overflow:hidden;flex-shrink:0">@if (pm(t).logo) { <img [src]="pm(t).logo" [alt]="pm(t).name" style="width:100%;height:100%;object-fit:contain" /> } @else { {{ pm(t).short }} }</span><span style="overflow-wrap:anywhere;line-height:1.25">{{ t.pay === 'cash' ? i18n.t('pay_cash_short') : pm(t).name }}</span></span></td>
                    <td class="num" [attr.data-label]="i18n.t('tx_amount')">{{ i18n.money(t.amount) }}</td>
                    <td [attr.data-label]="i18n.t('tx_status')"><status-badge [status]="rowStatus(t)"></status-badge></td>
                  </tr>
                  @if (expandedRef() === t.ref) {
                    <tr class="tx-expand"><td colspan="8" style="padding:0 6px 10px;background:var(--surface-2)">
                      <tx-detail [t]="t" [sellerName]="t.channel === 'self' ? null : agentName(t.agentId)" (openPrint)="openRef($event)"></tx-detail>
                    </td></tr>
                  }
                }
              </tbody>
            </table>
          </div>
          <div class="tx-pager">
            <span class="muted" style="font-size:11.5px">{{ filteredTxs().length }} {{ i18n.t('tx_count') }} · {{ i18n.t('step') }} {{ txPage() + 1 }} {{ i18n.t('of') }} {{ txPageCount() }}</span>
            <div style="display:flex;gap:6px">
              <button class="btn btn-outline" (click)="txPrev()" [disabled]="txPage() === 0" style="padding:7px 12px;font-size:13px"><ic name="chevL" [size]="16"></ic></button>
              <button class="btn btn-outline" (click)="txNext()" [disabled]="txPage() >= txPageCount() - 1" style="padding:7px 12px;font-size:13px"><ic name="chevR" [size]="16"></ic></button>
            </div>
          </div>
        }
      </div>
      }

      <!-- ========== RECHARGES (paiements de recharge de carte prépayée) ========== -->
      @if (section() === 'recharges') {
      <h1 style="font-size:21px">{{ i18n.t('nav_recharges') }}</h1>
      <div class="card" style="overflow:hidden;max-width:1180px">
        <div style="display:flex;align-items:center;gap:8px;padding:14px 14px 10px">
          <ic name="phone" [size]="17" style="color:var(--primary)"></ic>
          <h3 style="font-size:15px">{{ i18n.t('rch_all') }}</h3>
          <span style="margin-left:auto;display:inline-flex;align-items:center;gap:5px;font-size:10.5px;font-weight:700;color:var(--success)"><span class="live-dot"></span>{{ i18n.t('live_auto') }}</span>
          <span class="muted" style="font-size:12px;font-weight:700">{{ filteredRecharges().length }} {{ i18n.t('tx_count') }}</span>
        </div>
        <div style="padding:0 14px 12px;display:flex;flex-direction:column;gap:8px">
          <div class="input-prefix">
            <span class="pfx"><ic name="search" [size]="15"></ic></span>
            <input [placeholder]="i18n.t('rch_search_ph')" [value]="rSearch()" (input)="rSearch.set($any($event.target).value)" />
          </div>
          <div style="display:flex;gap:8px">
            <select class="input" [value]="rStatus()" (change)="rStatus.set($any($event.target).value)" style="flex:1">
              <option value="all">{{ i18n.t('tx_all_status') }}</option>
              <option value="paid">{{ i18n.t('st_paid') }}</option>
              <option value="pending">{{ i18n.t('st_pending') }}</option>
              <option value="cash">{{ i18n.t('st_cash') }}</option>
              <option value="sara_pending">{{ i18n.t('st_sara_pending') }}</option>
              <option value="failed">{{ i18n.t('st_failed') }}</option>
            </select>
            <select class="input" [value]="rPayFilter()" (change)="rPayFilter.set($any($event.target).value)" style="flex:1">
              <option value="all">{{ i18n.t('rch_all_methods') }}</option>
              <option value="om">Orange Money</option>
              <option value="mtn">MTN MoMo</option>
              <option value="sara">SARA Money</option>
              <option value="cash">{{ i18n.t('pay_cash_name') }}</option>
            </select>
          </div>
          <div style="display:flex;gap:8px;align-items:center">
            <input class="input" type="date" [value]="rFrom()" (change)="rFrom.set($any($event.target).value)" style="flex:1" />
            <span class="muted" style="font-size:12px">→</span>
            <input class="input" type="date" [value]="rTo()" (change)="rTo.set($any($event.target).value)" style="flex:1" />
          </div>
          <div style="display:flex;gap:8px">
            <button class="btn btn-outline" (click)="exportRecharges()" [disabled]="!filteredRecharges().length" style="flex:1;padding:9px;font-size:13px"><ic name="copy" [size]="15"></ic> {{ i18n.t('tx_export') }}</button>
            <button class="btn btn-ghost" (click)="clearRFilters()" style="flex:1;padding:9px;font-size:13px">{{ i18n.t('tx_clear') }}</button>
          </div>
        </div>
        @if (rLoading()) {
          <div class="load-center" style="padding:24px 0"><spinner tone="primary" [size]="22"></spinner> {{ i18n.t('loading') }}</div>
        } @else if (filteredRecharges().length === 0) {
          <p class="muted" style="font-size:13px;padding:20px 14px;text-align:center">{{ i18n.t('rch_empty') }}</p>
        } @else {
          <div style="overflow-y:auto;overflow-x:hidden;max-height:min(68vh,600px);padding:0 2px">
            <table class="tx-table">
              <colgroup>
                <col /><col style="width:170px" /><col style="width:140px" /><col style="width:140px" /><col style="width:96px" /><col style="width:116px" />
              </colgroup>
              <thead>
                <tr>
                  <th>{{ i18n.t('client') }}</th>
                  <th>{{ i18n.t('recharge_pan_short') }}</th>
                  <th>{{ i18n.t('tx_date') }}</th>
                  <th>{{ i18n.t('pay_method_label') }}</th>
                  <th class="num">{{ i18n.t('tx_amount') }}</th>
                  <th>{{ i18n.t('tx_status') }}</th>
                </tr>
              </thead>
              <tbody>
                @for (r of pagedRecharges(); track r.ref) {
                  <tr class="tx-tr">
                    <td><div class="cell-name">{{ r.fullName }}</div><div class="cell-sub">{{ r.ref }}</div></td>
                    <td class="brk" [attr.data-label]="i18n.t('recharge_pan_short')">{{ fmtPan(r.pan) }}</td>
                    <td class="nowrap" [attr.data-label]="i18n.t('tx_date')">{{ txDate(r.createdAt) }}</td>
                    <td [attr.data-label]="i18n.t('pay_method_label')"><span style="display:flex;align-items:center;gap:6px;min-width:0"><span class="op-logo" [style.background]="rpm(r).bg" [style.color]="rpm(r).fg" style="width:20px;height:20px;font-size:8px;border-radius:5px;overflow:hidden;flex-shrink:0">@if (rpm(r).logo) { <img [src]="rpm(r).logo" [alt]="rpm(r).name" style="width:100%;height:100%;object-fit:contain" /> } @else { {{ rpm(r).short }} }</span><span style="overflow-wrap:anywhere;line-height:1.25">{{ r.pay === 'cash' ? i18n.t('pay_cash_short') : rpm(r).name }}</span></span></td>
                    <td class="num" [attr.data-label]="i18n.t('tx_amount')">{{ i18n.money(r.amount) }}</td>
                    <td [attr.data-label]="i18n.t('tx_status')"><status-badge [status]="r.status"></status-badge></td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <div class="tx-pager">
            <span class="muted" style="font-size:11.5px">{{ filteredRecharges().length }} {{ i18n.t('tx_count') }} · {{ i18n.t('step') }} {{ rPage() + 1 }} {{ i18n.t('of') }} {{ rPageCount() }}</span>
            <div style="display:flex;gap:6px">
              <button class="btn btn-outline" (click)="rPrev()" [disabled]="rPage() === 0" style="padding:7px 12px;font-size:13px"><ic name="chevL" [size]="16"></ic></button>
              <button class="btn btn-outline" (click)="rNext()" [disabled]="rPage() >= rPageCount() - 1" style="padding:7px 12px;font-size:13px"><ic name="chevR" [size]="16"></ic></button>
            </div>
          </div>
        }
      </div>
      }

      <!-- ========== COLLECTES (ventes de produits bancaires) ========== -->
      @if (section() === 'collectes') {
      <h1 style="font-size:21px">{{ i18n.t('nav_collectes') }}</h1>

      <!-- Stats -->
      <div class="card" style="padding:14px;margin-top:12px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
          <ic name="chart" [size]="16" style="color:var(--primary)"></ic>
          <h3 style="font-size:14.5px">{{ i18n.t('col_stats_title') }}</h3>
          <span class="muted" style="margin-left:auto;font-size:12px;font-weight:700">{{ collectes().length }} {{ i18n.t('col_total') }}</span>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          @for (b of statByProduct(); track b.key) {
            <div style="flex:1;min-width:120px;border:1px solid var(--border);border-radius:var(--radius);padding:9px 11px">
              <div class="muted" style="font-size:11px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{ i18n.t('prod_' + b.key) }}</div>
              <div style="font-size:19px;font-weight:800">{{ b.count }}</div>
            </div>
          }
        </div>
        @if (topCommercials().length) {
          <div class="kicker" style="margin-top:12px;margin-bottom:5px">{{ i18n.t('col_by_commercial') }}</div>
          <div style="display:flex;flex-direction:column;gap:4px">
            @for (b of topCommercials(); track b.key) {
              <div style="display:flex;align-items:center;gap:8px;font-size:12.5px">
                <span style="min-width:0;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{ b.label || '—' }}</span>
                <span style="font-weight:800">{{ b.count }}</span>
              </div>
            }
          </div>
        }
      </div>

      <div class="card" style="overflow:hidden;max-width:1180px;margin-top:12px">
        <div style="display:flex;align-items:center;gap:8px;padding:14px 14px 10px">
          <ic name="store" [size]="17" style="color:var(--primary)"></ic>
          <h3 style="font-size:15px">{{ i18n.t('col_all') }}</h3>
          <span class="muted" style="margin-left:auto;font-size:12px;font-weight:700">{{ filteredCollectes().length }} {{ i18n.t('tx_count') }}</span>
        </div>
        <div style="padding:0 14px 12px;display:flex;flex-direction:column;gap:8px">
          <div class="input-prefix">
            <span class="pfx"><ic name="search" [size]="15"></ic></span>
            <input [placeholder]="i18n.t('col_search_ph')" [value]="colSearch()" (input)="colSearch.set($any($event.target).value)" />
          </div>
          <div style="display:flex;gap:8px">
            <select class="input" [value]="colProduct()" (change)="colProduct.set($any($event.target).value)" style="flex:1">
              <option value="all">{{ i18n.t('col_all_products') }}</option>
              @for (p of productCodes; track p) { <option [value]="p">{{ i18n.t('prod_' + p) }}</option> }
            </select>
            <select class="input" [value]="colCommercial()" (change)="colCommercial.set($any($event.target).value)" style="flex:1">
              <option value="all">{{ i18n.t('col_all_commercials') }}</option>
              @for (c of commercialOptions(); track c.id) { <option [value]="c.id">{{ c.name }}</option> }
            </select>
          </div>
          <div style="display:flex;gap:8px;align-items:center">
            <input class="input" type="date" [value]="colFrom()" (change)="colFrom.set($any($event.target).value)" style="flex:1" />
            <span class="muted" style="font-size:12px">→</span>
            <input class="input" type="date" [value]="colTo()" (change)="colTo.set($any($event.target).value)" style="flex:1" />
          </div>
          <div style="display:flex;gap:8px">
            <button class="btn btn-outline" (click)="exportCollectes()" [disabled]="!filteredCollectes().length" style="flex:1;padding:9px;font-size:13px"><ic name="copy" [size]="15"></ic> {{ i18n.t('tx_export') }}</button>
            <button class="btn btn-ghost" (click)="clearColFilters()" style="flex:1;padding:9px;font-size:13px">{{ i18n.t('tx_clear') }}</button>
          </div>
        </div>
        @if (colLoading()) {
          <div class="load-center" style="padding:24px 0"><spinner tone="primary" [size]="22"></spinner> {{ i18n.t('loading') }}</div>
        } @else if (filteredCollectes().length === 0) {
          <p class="muted" style="font-size:13px;padding:20px 14px;text-align:center">{{ i18n.t('col_empty') }}</p>
        } @else {
          <div style="overflow-y:auto;overflow-x:hidden;max-height:min(68vh,600px);padding:0 2px">
            <table class="tx-table">
              <colgroup>
                <col style="width:150px" /><col /><col style="width:150px" /><col style="width:150px" /><col style="width:120px" /><col style="width:56px" />
              </colgroup>
              <thead>
                <tr>
                  <th>{{ i18n.t('col_commercial') }}</th>
                  <th>{{ i18n.t('client') }}</th>
                  <th>{{ i18n.t('col_product_col') }}</th>
                  <th>{{ i18n.t('col_details') }}</th>
                  <th>{{ i18n.t('tx_date') }}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                @for (c of pagedCollectes(); track c.ref) {
                  <tr class="tx-tr">
                    <td><div class="cell-name">{{ c.collectedByName || '—' }}</div><div class="cell-sub">{{ c.ref }}</div></td>
                    <td [attr.data-label]="i18n.t('client')"><div class="cell-name">{{ c.clientNom || '—' }}</div><div class="cell-sub">{{ c.clientPhone || '—' }}</div></td>
                    <td [attr.data-label]="i18n.t('col_product_col')">{{ i18n.t('prod_' + c.product) }}</td>
                    <td class="brk" [attr.data-label]="i18n.t('col_details')">{{ colDetails(c) }}</td>
                    <td class="nowrap" [attr.data-label]="i18n.t('tx_date')">{{ txDate(c.createdAt) }}</td>
                    <td><button class="icon-btn" (click)="deleteCollecte(c)" [disabled]="colBusy()" [title]="i18n.t('delete')" style="color:var(--accent)"><ic name="trash" [size]="15"></ic></button></td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <div class="tx-pager">
            <span class="muted" style="font-size:11.5px">{{ filteredCollectes().length }} {{ i18n.t('tx_count') }} · {{ i18n.t('step') }} {{ colPage() + 1 }} {{ i18n.t('of') }} {{ colPageCount() }}</span>
            <div style="display:flex;gap:6px">
              <button class="btn btn-outline" (click)="colPrev()" [disabled]="colPage() === 0" style="padding:7px 12px;font-size:13px"><ic name="chevL" [size]="16"></ic></button>
              <button class="btn btn-outline" (click)="colNext()" [disabled]="colPage() >= colPageCount() - 1" style="padding:7px 12px;font-size:13px"><ic name="chevR" [size]="16"></ic></button>
            </div>
          </div>
        }
      </div>
      }

      <!-- ========== AUDIT (journal des connexions) ========== -->
      @if (section() === 'audit') {
      <h1 style="font-size:21px">{{ i18n.t('nav_audit') }}</h1>
      <div class="card" style="overflow:hidden;max-width:1180px">
        <div style="display:flex;align-items:center;gap:8px;padding:14px 14px 10px">
          <ic name="shield" [size]="17" style="color:var(--primary)"></ic>
          <h3 style="font-size:15px">{{ i18n.t('audit_title') }}</h3>
          <span class="muted" style="margin-left:auto;font-size:12px;font-weight:700">{{ filteredAudit().length }}</span>
        </div>
        <p class="muted" style="font-size:11.5px;padding:0 14px 8px">{{ i18n.t('audit_sub') }}</p>
        <div style="padding:0 14px 12px;display:flex;flex-direction:column;gap:8px">
          <div class="input-prefix">
            <span class="pfx"><ic name="search" [size]="15"></ic></span>
            <input [placeholder]="i18n.t('audit_search_ph')" [value]="auditSearch()" (input)="auditSearch.set($any($event.target).value)" />
          </div>
          <div style="display:flex;gap:6px">
            <button class="btn" [class.btn-primary]="auditFilter()==='all'" [class.btn-outline]="auditFilter()!=='all'" (click)="auditFilter.set('all')" style="flex:1;padding:8px;font-size:12.5px">{{ i18n.t('audit_all') }}</button>
            <button class="btn" [class.btn-primary]="auditFilter()==='ok'" [class.btn-outline]="auditFilter()!=='ok'" (click)="auditFilter.set('ok')" style="flex:1;padding:8px;font-size:12.5px">{{ i18n.t('audit_ok') }}</button>
            <button class="btn" [class.btn-primary]="auditFilter()==='ko'" [class.btn-outline]="auditFilter()!=='ko'" (click)="auditFilter.set('ko')" style="flex:1;padding:8px;font-size:12.5px">{{ i18n.t('audit_ko') }}</button>
          </div>
        </div>
        @if (auditLoading()) {
          <div class="load-center" style="padding:24px 0"><spinner tone="primary" [size]="22"></spinner> {{ i18n.t('loading') }}</div>
        } @else if (filteredAudit().length === 0) {
          <p class="muted" style="font-size:13px;padding:20px 14px;text-align:center">{{ i18n.t('audit_empty') }}</p>
        } @else {
          <div style="overflow-y:auto;overflow-x:hidden;max-height:min(70vh,620px);padding:0 2px">
            <table class="tx-table">
              <colgroup><col style="width:150px" /><col /><col style="width:150px" /><col style="width:130px" /></colgroup>
              <thead>
                <tr>
                  <th>{{ i18n.t('audit_when') }}</th>
                  <th>{{ i18n.t('audit_user') }}</th>
                  <th>{{ i18n.t('audit_result') }}</th>
                  <th>{{ i18n.t('audit_ip') }}</th>
                </tr>
              </thead>
              <tbody>
                @for (a of pagedAudit(); track a.id) {
                  <tr class="tx-tr">
                    <td class="nowrap" [attr.data-label]="i18n.t('audit_when')">{{ txDate(a.at) }}</td>
                    <td [attr.data-label]="i18n.t('audit_user')"><div class="cell-name">{{ a.name || a.email }}</div><div class="cell-sub">{{ a.email }}@if (a.roles) { · {{ a.roles }} }</div></td>
                    <td [attr.data-label]="i18n.t('audit_result')">
                      @if (a.success) {
                        <span class="badge" style="background:color-mix(in srgb, var(--success) 18%, transparent);color:var(--success);font-size:10.5px">{{ i18n.t('audit_success') }}</span>
                      } @else {
                        <span class="badge" style="background:var(--accent-soft);color:var(--accent);font-size:10.5px">{{ i18n.t('audit_failure') }}</span>
                        <span class="muted" style="font-size:10.5px;margin-left:5px">{{ auditReason(a.reason) }}</span>
                      }
                    </td>
                    <td class="brk muted" [attr.data-label]="i18n.t('audit_ip')" style="font-size:11.5px">{{ a.ip || '—' }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <div class="tx-pager">
            <span class="muted" style="font-size:11.5px">{{ filteredAudit().length }} · {{ i18n.t('step') }} {{ auditPage() + 1 }} {{ i18n.t('of') }} {{ auditPageCount() }}</span>
            <div style="display:flex;gap:6px">
              <button class="btn btn-outline" (click)="auditPrev()" [disabled]="auditPage() === 0" style="padding:7px 12px;font-size:13px"><ic name="chevL" [size]="16"></ic></button>
              <button class="btn btn-outline" (click)="auditNext()" [disabled]="auditPage() >= auditPageCount() - 1" style="padding:7px 12px;font-size:13px"><ic name="chevR" [size]="16"></ic></button>
            </div>
          </div>
        }
      </div>
      }

      <!-- ========== MAP ========== -->
      @if (section() === 'map') {
        <div class="card" style="padding:16px">
          <h2 style="font-size:16px;margin-bottom:4px">{{ i18n.t('nav_map') }}</h2>
          <p class="muted" style="font-size:12.5px;margin-bottom:14px">{{ i18n.t('map_sub') }}</p>
          <admin-map></admin-map>
        </div>
      }

      </main>
    </div>
  </div>`,
})
export class AdminComponent implements OnInit, OnDestroy {
  i18n = inject(I18n);
  auth = inject(Auth);
  private api = inject(Api);
  private router = inject(Router);
  private poll?: ReturnType<typeof setInterval>;

  /** Active sidebar section. */
  section = signal<'overview' | 'config' | 'users' | 'agencies' | 'transactions' | 'recharges' | 'collectes' | 'audit' | 'map'>('overview');

  stats = signal<AdminStats | null>(null);
  payStats = signal<PaymentStats | null>(null);
  txs = signal<Subscription[]>([]);
  // Per-section loading flags so each panel can show a spinner while its request is in flight.
  statsLoading = signal(true);
  txLoading = signal(true);
  usersLoading = signal(true);
  cfgLoading = signal(true);
  saving = signal(false);
  // Signals so the "save" button's [disabled] binding stays reactive (the app is zoneless).
  cfg = signal<CardConfig>({ price: 0, fees: 0, transport: 0, rechargeMin: 0, rechargeMax: 0, rechargeInitiale: 0, passPremium: 0 });
  private original = signal<CardConfig>({ price: 0, fees: 0, transport: 0, rechargeMin: 0, rechargeMax: 0, rechargeInitiale: 0, passPremium: 0 });
  changed = computed(() => {
    const c = this.cfg(), o = this.original();
    return c.price !== o.price || c.fees !== o.fees || c.transport !== o.transport
      || c.rechargeMin !== o.rechargeMin || c.rechargeMax !== o.rechargeMax;
  });
  saved = signal(false);
  saveErr = signal(false);

  // --- user management ---
  usersList = signal<User[]>([]);
  // Client-side pagination of the staff accounts list.
  userPage = signal(0);
  readonly userPageSize = 8;
  userPageCount = computed(() => Math.max(1, Math.ceil(this.usersList().length / this.userPageSize)));
  pagedUsers = computed(() => {
    const p = Math.min(this.userPage(), this.userPageCount() - 1);
    return this.usersList().slice(p * this.userPageSize, p * this.userPageSize + this.userPageSize);
  });
  // Back to the first page only when the number of accounts changes (reload / create / import),
  // not on an in-place edit like enabling/disabling a user. A computed emits only on value change.
  private readonly userCount = computed(() => this.usersList().length);
  private readonly _userPageReset = effect(() => { this.userCount(); this.userPage.set(0); });
  userPrev() { this.userPage.update((p) => Math.max(0, p - 1)); }
  userNext() { this.userPage.update((p) => Math.min(this.userPageCount() - 1, p + 1)); }
  // Enable/disable a staff account (admin only). userToggling holds the id being updated.
  userToggling = signal('');
  userToggleErr = signal('');
  toggleUser(u: User) {
    const next = u.enabled === false;   // currently disabled → re-enable; else disable
    if (!next && !confirm(this.i18n.t('user_disable_confirm'))) return;
    this.userToggleErr.set('');
    this.userToggling.set(u.id);
    this.api.setUserEnabled(u.id, next).subscribe({
      next: (updated) => {
        this.userToggling.set('');
        this.usersList.update((list) => list.map((x) => (x.id === u.id ? { ...x, enabled: updated.enabled } : x)));
      },
      error: (err) => {
        this.userToggling.set('');
        const code = err?.error?.error;
        this.userToggleErr.set(code === 'last_admin' ? 'user_err_last_admin'
          : code === 'cannot_disable_self' ? 'user_err_self' : 'user_err_toggle');
      },
    });
  }
  readonly allRoles = ALL_ROLES;
  nu = signal<CreateUserRequest>({ name: '', email: '', role: 'AGENT', agency: '', phone: '' });
  /** Roles selected on the create form (multi-role). */
  nuRoles = signal<Role[]>(['AGENT']);
  userMsg = signal<'' | 'created' | 'exists' | 'invalid'>('');
  userBusy = signal(false);
  /** Temporary password returned on the last successful creation (also emailed to the user). */
  createdPw = signal('');
  pwCopied = signal(false);
  nuHasRole(r: Role) { return this.nuRoles().includes(r); }
  toggleNuRole(r: Role) {
    this.nuRoles.update((list) => list.includes(r) ? list.filter((x) => x !== r) : [...list, r]);
  }
  /** The full role set of an account (for the user list badges). */
  userRoles(u: User): Role[] { return u.roles && u.roles.length ? u.roles : [u.role]; }
  /** A commercial's phone must be a valid local 9-digit number (links client referrals to their stats). */
  agentPhoneOk = computed(() => /^6\d{8}$/.test((this.nu().phone ?? '').replace(/\D/g, '')));
  userValid = computed(() => {
    const u = this.nu();
    const base = !!u.name.trim() && /\S+@\S+\.\S+/.test(u.email) && this.nuRoles().length > 0;
    return base && (!this.nuRoles().includes('AGENT') || this.agentPhoneOk());
  });

  // --- inline role editing (existing accounts) ---
  editRolesId = signal<string | null>(null);
  editRoles = signal<Role[]>([]);
  editRolesSaving = signal(false);
  editRolesErr = signal('');
  startEditRoles(u: User) {
    this.editRolesId.set(u.id);
    this.editRoles.set([...this.userRoles(u)]);
    this.editRolesErr.set('');
  }
  toggleEditRole(r: Role) {
    this.editRoles.update((list) => list.includes(r) ? list.filter((x) => x !== r) : [...list, r]);
    this.editRolesErr.set('');
  }
  saveRoles(u: User) {
    const roles = this.editRoles();
    if (!roles.length || this.editRolesSaving()) return;
    this.editRolesSaving.set(true); this.editRolesErr.set('');
    this.api.setUserRoles(u.id, roles).subscribe({
      next: (updated) => {
        this.editRolesSaving.set(false); this.editRolesId.set(null);
        this.usersList.update((list) => list.map((x) => (x.id === u.id ? updated : x)));
        if (updated.id === this.auth.user()?.id) this.auth.setUser(updated);
      },
      error: (err) => {
        this.editRolesSaving.set(false);
        const code = err?.error?.error;
        this.editRolesErr.set(code === 'last_admin' ? 'user_err_last_admin'
          : code === 'agent_phone_required' ? 'user_err_agent_phone' : 'user_err_roles');
      },
    });
  }

  // --- transaction filters ---
  txSearch = signal('');
  txStatus = signal('all');   // all | paid | pending | cash | failed | printed
  txAgent = signal('all');    // all | <agentId> | self
  txFrom = signal('');        // yyyy-mm-dd
  txTo = signal('');
  // --- expandable transaction detail (full client file) ---
  expandedRef = signal<string | null>(null);
  filteredTxs = computed(() => {
    const q = this.txSearch().trim().toLowerCase();
    const digits = this.txSearch().replace(/\D/g, '');
    const st = this.txStatus(), ag = this.txAgent(), from = this.txFrom(), to = this.txTo();
    return this.txs().slice().reverse().filter((t) => {
      if (st !== 'all' && t.status !== st && t.payStatus !== st) return false;
      if (ag === 'self' ? t.channel !== 'self' : ag !== 'all' && t.agentId !== ag) return false;
      if (from && t.createdAt.slice(0, 10) < from) return false;
      if (to && t.createdAt.slice(0, 10) > to) return false;
      if (q) {
        const hay = `${t.ref} ${t.fullName}`.toLowerCase();
        const phone = (t.phone || '').replace(/\D/g, '');
        if (!hay.includes(q) && !(digits && phone.includes(digits))) return false;
      }
      return true;
    });
  });

  // --- transactions table pagination ---
  txPage = signal(0);
  readonly txPageSize = 12;
  txPageCount = computed(() => Math.max(1, Math.ceil(this.filteredTxs().length / this.txPageSize)));
  pagedTxs = computed(() => {
    const all = this.filteredTxs();
    const p = Math.min(this.txPage(), this.txPageCount() - 1);
    return all.slice(p * this.txPageSize, p * this.txPageSize + this.txPageSize);
  });
  // Any filter change (or fresh data) → back to the first page.
  private readonly _txPageReset = effect(() => { this.filteredTxs(); this.txPage.set(0); });
  /** Number of failed transactions (for the quick "Échouées" filter chip). */
  failedCount = computed(() => this.txs().filter((t) => t.payStatus === 'failed' || t.status === 'failed').length);
  /** One-click toggle of the failed-only view. */
  toggleFailedFilter() { this.txStatus.set(this.txStatus() === 'failed' ? 'all' : 'failed'); }
  /** Overview KPI → open the transactions table filtered on failed payments. */
  showFailed() { this.txStatus.set('failed'); this.section.set('transactions'); }
  txPrev() { this.txPage.update((p) => Math.max(0, p - 1)); }
  txNext() { this.txPage.update((p) => Math.min(this.txPageCount() - 1, p + 1)); }

  // Row helpers for the table cells.
  pm = (t: Subscription) => payById(t.pay);
  rowStatus = (t: Subscription) => recordStatus(t);
  txDate = (iso: string) => this.fmtDateTime(iso);

  // --- card recharges (top-ups) — separate payments view, with filters ---
  recharges = signal<Recharge[]>([]);
  rLoading = signal(true);
  rSearch = signal('');
  rStatus = signal('all');   // all | paid | pending | cash | sara_pending | failed
  rPayFilter = signal('all'); // all | om | mtn | sara | cash
  rFrom = signal('');
  rTo = signal('');
  rPage = signal(0);
  readonly rPageSize = 12;
  rpm = (r: Recharge) => payById(r.pay);
  fmtPan = (v: string) => formatPan(v);

  private loadRecharges() {
    this.rLoading.set(true);
    this.api.recharges().subscribe({ next: (r) => { this.recharges.set(r); this.rLoading.set(false); }, error: () => this.rLoading.set(false) });
  }

  filteredRecharges = computed(() => {
    const q = this.rSearch().trim().toLowerCase();
    const digits = this.rSearch().replace(/\D/g, '');
    const st = this.rStatus(), pay = this.rPayFilter(), from = this.rFrom(), to = this.rTo();
    return this.recharges().slice().reverse().filter((r) => {
      if (st !== 'all' && r.status !== st && r.payStatus !== st) return false;
      if (pay !== 'all' && r.pay !== pay) return false;
      if (from && r.createdAt.slice(0, 10) < from) return false;
      if (to && r.createdAt.slice(0, 10) > to) return false;
      if (q) {
        const hay = `${r.ref} ${r.fullName}`.toLowerCase();
        const pan = (r.pan || '').replace(/\D/g, '');
        if (!hay.includes(q) && !(digits && pan.includes(digits))) return false;
      }
      return true;
    });
  });
  rPageCount = computed(() => Math.max(1, Math.ceil(this.filteredRecharges().length / this.rPageSize)));
  pagedRecharges = computed(() => {
    const all = this.filteredRecharges();
    const p = Math.min(this.rPage(), this.rPageCount() - 1);
    return all.slice(p * this.rPageSize, p * this.rPageSize + this.rPageSize);
  });
  private readonly _rPageReset = effect(() => { this.filteredRecharges(); this.rPage.set(0); });
  rPrev() { this.rPage.update((p) => Math.max(0, p - 1)); }
  rNext() { this.rPage.update((p) => Math.min(this.rPageCount() - 1, p + 1)); }
  clearRFilters() { this.rSearch.set(''); this.rStatus.set('all'); this.rPayFilter.set('all'); this.rFrom.set(''); this.rTo.set(''); }
  exportRecharges() {
    const esc = (v: string) => `"${(v ?? '').replace(/"/g, '""')}"`;
    const header = ['Reference', 'Nom complet', 'PAN', 'Date', 'Paiement', 'Statut', 'Montant'];
    const rows = this.filteredRecharges().map((r) => [
      r.ref, r.fullName, formatPan(r.pan), this.fmtDateTime(r.createdAt),
      r.pay === 'cash' ? 'Espèces' : payById(r.pay).name, r.status, String(r.amount),
    ].map((v) => esc(String(v))).join(','));
    this.downloadCsv('recharges.csv', '﻿' + [header.join(','), ...rows].join('\r\n'));
  }

  // --- collectes (ventes de produits bancaires) — management view ---
  collectes = signal<Collecte[]>([]);
  colLoading = signal(true);
  colBusy = signal(false);
  colSearch = signal('');
  colProduct = signal('all');     // all | <product code>
  colCommercial = signal('all');  // all | <collectedById>
  colFrom = signal('');
  colTo = signal('');
  colPage = signal(0);
  readonly colPageSize = 12;
  readonly productCodes = COLLECTE_PRODUCTS;

  private loadCollectes() {
    this.colLoading.set(true);
    this.api.collectes().subscribe({ next: (c) => { this.collectes.set(c); this.colLoading.set(false); }, error: () => this.colLoading.set(false) });
  }

  /** Distinct commercials present in the data, for the filter dropdown. */
  commercialOptions = computed(() => {
    const seen = new Map<string, string>();
    for (const c of this.collectes()) {
      const id = c.collectedById ?? '—';
      if (!seen.has(id)) seen.set(id, c.collectedByName ?? '—');
    }
    return [...seen.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  });
  /** Counts per product (all four, in fixed order) for the stat cards. */
  statByProduct = computed(() => {
    const counts = new Map<string, number>(COLLECTE_PRODUCTS.map((p) => [p, 0]));
    for (const c of this.collectes()) counts.set(c.product, (counts.get(c.product) ?? 0) + 1);
    return COLLECTE_PRODUCTS.map((key) => ({ key, count: counts.get(key) ?? 0 }));
  });
  /** Top commercials by number of collectes (max 8). */
  topCommercials = computed(() => {
    const m = new Map<string, { label: string; count: number }>();
    for (const c of this.collectes()) {
      const id = c.collectedById ?? '—';
      const e = m.get(id) ?? { label: c.collectedByName ?? '—', count: 0 };
      e.count++; m.set(id, e);
    }
    return [...m.entries()].map(([key, v]) => ({ key, label: v.label, count: v.count }))
      .sort((a, b) => b.count - a.count).slice(0, 8);
  });

  filteredCollectes = computed(() => {
    const q = this.colSearch().trim().toLowerCase();
    const digits = this.colSearch().replace(/\D/g, '');
    const prod = this.colProduct(), com = this.colCommercial(), from = this.colFrom(), to = this.colTo();
    return this.collectes().filter((c) => {
      if (prod !== 'all' && c.product !== prod) return false;
      if (com !== 'all' && (c.collectedById ?? '—') !== com) return false;
      if (from && c.createdAt.slice(0, 10) < from) return false;
      if (to && c.createdAt.slice(0, 10) > to) return false;
      if (q) {
        const hay = `${c.ref} ${c.collectedByName ?? ''} ${c.clientNom ?? ''} ${c.accountNumber ?? ''} ${c.cardNumber ?? ''}`.toLowerCase();
        const phone = (c.clientPhone ?? '').replace(/\D/g, '');
        if (!hay.includes(q) && !(digits && phone.includes(digits))) return false;
      }
      return true;
    });
  });
  colPageCount = computed(() => Math.max(1, Math.ceil(this.filteredCollectes().length / this.colPageSize)));
  pagedCollectes = computed(() => {
    const all = this.filteredCollectes();
    const p = Math.min(this.colPage(), this.colPageCount() - 1);
    return all.slice(p * this.colPageSize, p * this.colPageSize + this.colPageSize);
  });
  private readonly _colPageReset = effect(() => { this.filteredCollectes(); this.colPage.set(0); });
  colPrev() { this.colPage.update((p) => Math.max(0, p - 1)); }
  colNext() { this.colPage.update((p) => Math.min(this.colPageCount() - 1, p + 1)); }
  clearColFilters() { this.colSearch.set(''); this.colProduct.set('all'); this.colCommercial.set('all'); this.colFrom.set(''); this.colTo.set(''); }

  /** One-line product-specific detail (account / card no + type). */
  colDetails(c: Collecte): string {
    if (c.product === 'compte_ouvert') return c.accountNumber || '—';
    if (c.product === 'carte_bancaire') {
      const t = c.cardType ? this.i18n.t('ct_' + c.cardType) : '';
      return [c.cardNumber, t].filter(Boolean).join(' · ') || '—';
    }
    return '—';
  }

  deleteCollecte(c: Collecte) {
    if (this.colBusy() || !confirm(this.i18n.t('col_delete_confirm'))) return;
    this.colBusy.set(true);
    this.api.deleteCollecte(c.ref).subscribe({
      next: () => { this.colBusy.set(false); this.collectes.update((list) => list.filter((x) => x.ref !== c.ref)); },
      error: () => { this.colBusy.set(false); },
    });
  }

  exportCollectes() {
    const esc = (v: string) => `"${(v ?? '').replace(/"/g, '""')}"`;
    const header = ['Reference', 'Commercial', 'Produit', 'Nom client', 'Telephone', 'N° compte', 'N° carte', 'Type carte', 'Date'];
    const rows = this.filteredCollectes().map((c) => [
      c.ref, c.collectedByName ?? '', this.i18n.t('prod_' + c.product), c.clientNom ?? '', c.clientPhone ?? '',
      c.accountNumber ?? '', c.cardNumber ?? '', c.cardType ? this.i18n.t('ct_' + c.cardType) : '', this.fmtDateTime(c.createdAt),
    ].map((v) => esc(String(v))).join(','));
    this.downloadCsv('collectes.csv', '﻿' + [header.join(','), ...rows].join('\r\n'));
  }

  // --- login audit (journal des connexions) ---
  loginAudits = signal<LoginAudit[]>([]);
  auditLoading = signal(true);
  auditSearch = signal('');
  auditFilter = signal<'all' | 'ok' | 'ko'>('all');
  auditPage = signal(0);
  readonly auditPageSize = 20;

  private loadAudit() {
    this.auditLoading.set(true);
    this.api.loginAudit().subscribe({ next: (a) => { this.loginAudits.set(a); this.auditLoading.set(false); }, error: () => this.auditLoading.set(false) });
  }
  filteredAudit = computed(() => {
    const q = this.auditSearch().trim().toLowerCase();
    const f = this.auditFilter();
    return this.loginAudits().filter((a) => {
      if (f === 'ok' && !a.success) return false;
      if (f === 'ko' && a.success) return false;
      if (q) {
        const hay = `${a.email} ${a.name ?? ''} ${a.ip ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  });
  auditPageCount = computed(() => Math.max(1, Math.ceil(this.filteredAudit().length / this.auditPageSize)));
  pagedAudit = computed(() => {
    const all = this.filteredAudit();
    const p = Math.min(this.auditPage(), this.auditPageCount() - 1);
    return all.slice(p * this.auditPageSize, p * this.auditPageSize + this.auditPageSize);
  });
  private readonly _auditPageReset = effect(() => { this.filteredAudit(); this.auditPage.set(0); });
  auditPrev() { this.auditPage.update((p) => Math.max(0, p - 1)); }
  auditNext() { this.auditPage.update((p) => Math.min(this.auditPageCount() - 1, p + 1)); }
  auditReason(reason: string | null) {
    const key = 'audit_reason_' + (reason || 'ok');
    const t = this.i18n.t(key);
    return t === key ? (reason || '') : t;
  }

  /** Success rate (%) guarded against division by zero. */
  rate(part: number, total: number) { return total > 0 ? Math.round((part / total) * 100) : 0; }

  ngOnInit() {
    this.api.adminStats().subscribe({ next: (s) => { this.stats.set(s); this.statsLoading.set(false); }, error: () => this.statsLoading.set(false) });
    this.api.paymentStats().subscribe({ next: (p) => this.payStats.set(p), error: () => {} });
    this.api.allSubscriptions().subscribe({ next: (t) => { this.txs.set(t); this.txLoading.set(false); }, error: () => this.txLoading.set(false) });
    this.api.getConfig().subscribe({ next: (c) => { this.cfg.set({ ...c }); this.original.set({ ...c }); this.cfgLoading.set(false); }, error: () => this.cfgLoading.set(false) });
    this.loadUsers();
    this.loadAgencies();
    this.loadRecharges();
    this.loadCollectes();
    this.loadAudit();
    // Silent background refresh of the KPIs + transactions table (no spinner, keeps filters intact).
    this.poll = setInterval(() => this.refreshLive(), LIVE_REFRESH_MS);
  }
  ngOnDestroy() { if (this.poll) clearInterval(this.poll); }
  private refreshLive() {
    // Only the lightweight, SQL-aggregated KPIs are polled live. The payments funnel and the full
    // transactions list (heavier) are loaded on open, not on every cycle — this keeps the
    // dashboard's hot path cheap (they refresh on page (re)load).
    this.api.adminStats().subscribe({ next: (s) => this.stats.set(s), error: () => {} });
  }

  private loadUsers() {
    this.usersLoading.set(true);
    this.api.users().subscribe({ next: (u) => { this.usersList.set(u); this.usersLoading.set(false); }, error: () => this.usersLoading.set(false) });
  }
  get agentUsers() { return this.usersList().filter((u) => this.userRoles(u).includes('AGENT')); }

  onNu(k: keyof CreateUserRequest, e: Event) {
    const v = (e.target as HTMLInputElement | HTMLSelectElement).value;
    this.nu.update((u) => ({ ...u, [k]: v }));
    this.userMsg.set('');
  }
  createUser() {
    if (!this.userValid() || this.userBusy()) { if (!this.userValid()) this.userMsg.set('invalid'); return; }
    this.userBusy.set(true);
    const u = this.nu();
    const roles = this.nuRoles();
    this.api.createUser({ ...u, name: u.name.trim(), email: u.email.trim(), role: roles[0], roles }).subscribe({
      next: (res) => {
        this.userBusy.set(false); this.userMsg.set('created');
        this.createdPw.set(res.tempPassword); this.pwCopied.set(false);
        this.nu.set({ name: '', email: '', role: 'AGENT', agency: '', phone: '' });
        this.nuRoles.set(['AGENT']);
        this.loadUsers();
      },
      error: (err) => {
        this.userBusy.set(false);
        this.userMsg.set(err?.status === 409 ? 'exists' : 'invalid');
      },
    });
  }
  copyPw() {
    navigator.clipboard?.writeText(this.createdPw()).then(() => this.pwCopied.set(true));
  }
  roleLabel(role: Role) {
    return this.i18n.t(role === 'ADMIN' ? 'role_admin' : role === 'PRINT_AGENT' ? 'role_print'
      : role === 'CASHIER' ? 'role_cashier' : role === 'COLLECTEUR' ? 'role_collecteur'
      : role === 'SUPERVISEUR' ? 'role_superviseur' : 'role_agent');
  }

  // --- bulk user import ---
  importText = signal('');
  importUpdate = signal(false);     // false = skip duplicates, true = update them
  importBusy = signal(false);
  importErr = signal(false);
  importResult = signal<ImportUsersResult | null>(null);

  /** Parsed rows from the pasted text / loaded CSV. */
  parsedRows = computed<ImportUserRow[]>(() => this.parseImport(this.importText()));

  /** Per-row preview status (client-side, for guidance — the backend is authoritative). */
  preview = computed(() => {
    const existing = new Set(this.usersList().map((u) => u.email.toLowerCase()));
    const seen = new Set<string>();
    return this.parsedRows().map((r) => {
      const name = (r.name || '').trim();
      const email = (r.email || '').trim();
      const role = (r.role || '').trim().toUpperCase();
      const roles = role.split('|').map((x) => x.trim()).filter(Boolean);
      const phone9 = (r.phone || '').replace(/\D/g, '').slice(-9);
      const known = ['ADMIN', 'AGENT', 'PRINT_AGENT', 'CASHIER', 'COLLECTEUR', 'SUPERVISEUR'];
      let status: 'new' | 'duplicate' | 'invalid' = 'new';
      let reason = '';
      if (!name || !/\S+@\S+\.\S+/.test(email)) { status = 'invalid'; reason = 'name_email'; }
      else if (!roles.length || !roles.every((x) => known.includes(x))) { status = 'invalid'; reason = 'role'; }
      else if (roles.includes('AGENT') && !/^6\d{8}$/.test(phone9)) { status = 'invalid'; reason = 'phone'; }
      else {
        const key = email.toLowerCase();
        if (existing.has(key) || seen.has(key)) status = 'duplicate';
        seen.add(key);
      }
      return { name, email, role, status, reason };
    });
  });
  importCounts = computed(() => {
    const p = this.preview();
    return {
      created: p.filter((r) => r.status === 'new').length,
      dup: p.filter((r) => r.status === 'duplicate').length,
      invalid: p.filter((r) => r.status === 'invalid').length,
    };
  });
  /** How many rows the import will actually act on (new + duplicates only if "update" is on). */
  importActionable = computed(() => this.importCounts().created + (this.importUpdate() ? this.importCounts().dup : 0));
  /** Created accounts with their generated temp password, to hand out / export. */
  importCreds = computed(() => this.importResult()?.rows.filter((r) => r.status === 'created' && r.tempPassword) ?? []);

  /** Parse pasted/CSV text. Accepts a header line (mapped by column name) or positional
   *  columns: name, email, role, phone, agency. Delimiter detected: tab, ';' or ','. */
  private parseImport(text: string): ImportUserRow[] {
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length);
    if (!lines.length) return [];
    const delim = lines[0].includes('\t') ? '\t' : lines[0].includes(';') ? ';' : ',';
    const cells = (l: string) => l.split(delim).map((c) => c.trim().replace(/^"(.*)"$/, '$1'));
    let rows = lines.map(cells);
    let idx = { name: 0, email: 1, role: 2, phone: 3, agency: 4 };
    const head = rows[0].map((c) => c.toLowerCase());
    const isHeader = head.some((c) => /e-?mail|courriel/.test(c)) || head.some((c) => /^(nom|name)$/.test(c));
    if (isHeader) {
      const at = (...re: RegExp[]) => head.findIndex((c) => re.some((r) => r.test(c)));
      idx = {
        name: at(/^(nom|name|nom complet|full ?name)$/),
        email: at(/e-?mail|courriel/),
        role: at(/^(role|rôle|profil)$/),
        phone: at(/^(tel|tél|telephone|téléphone|phone|numero|numéro)/),
        agency: at(/^(agence|agency)$/),
      };
      rows = rows.slice(1);
    }
    const g = (row: string[], i: number) => (i >= 0 && i < row.length ? row[i] : '');
    return rows.map((row) => ({
      name: g(row, idx.name), email: g(row, idx.email), role: this.normRoles(g(row, idx.role)),
      phone: g(row, idx.phone), agency: g(row, idx.agency),
    }));
  }
  /** Normalise a role cell that may carry several roles (separators | / +) → canonical "A|B". */
  private normRoles(cell: string): string {
    const parts = (cell || '').split(/[|/+]/).map((p) => this.normRole(p)).filter((p) => p);
    return [...new Set(parts)].join('|');
  }
  /** Map free-text / localized role labels to the enum code. */
  private normRole(r: string): string {
    const s = (r || '').trim().toLowerCase();
    if (/admin/.test(s)) return 'ADMIN';
    if (/print|impr/.test(s)) return 'PRINT_AGENT';
    if (/caiss|cashier|esp[èe]ce/.test(s)) return 'CASHIER';
    if (/supervis/.test(s)) return 'SUPERVISEUR';
    if (/collect/.test(s)) return 'COLLECTEUR';
    if (/agent|commerc|client/.test(s)) return 'AGENT';
    return (r || '').trim().toUpperCase();
  }
  impReason(code: string) {
    return code === 'name_email' ? this.i18n.t('imp_r_name_email')
      : code === 'role' ? this.i18n.t('imp_r_role')
      : code === 'phone' ? this.i18n.t('imp_r_phone') : '';
  }

  onImportText(e: Event) {
    this.importText.set((e.target as HTMLTextAreaElement).value);
    this.importResult.set(null); this.importErr.set(false);
  }
  onImportFile(e: Event) {
    const input = e.target as HTMLInputElement;
    const f = input.files?.[0];
    input.value = '';                 // allow re-selecting the same file
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => { this.importText.set(String(reader.result ?? '')); this.importResult.set(null); this.importErr.set(false); };
    reader.readAsText(f);
  }
  clearImport() { this.importText.set(''); this.importResult.set(null); this.importErr.set(false); }
  runImport() {
    const rows = this.parsedRows();
    if (!rows.length || this.importBusy()) return;
    this.importBusy.set(true); this.importErr.set(false);
    this.api.importUsers(rows, this.importUpdate()).subscribe({
      next: (res) => { this.importBusy.set(false); this.importResult.set(res); this.loadUsers(); },
      error: () => { this.importBusy.set(false); this.importErr.set(true); },
    });
  }
  downloadTemplate() {
    this.downloadCsv('modele-utilisateurs.csv',
      '﻿nom,email,role,telephone,agence\r\n'
      + 'Yvan Ngameni,yvan.ngameni@afrilandfirstbank.com,AGENT,690112233,Akwa\r\n'
      + 'Paul Mbarga,paul.mbarga@afrilandfirstbank.com,PRINT_AGENT,,\r\n'
      + 'Awa Fall,awa.fall@afrilandfirstbank.com,AGENT|COLLECTEUR,699001122,Bonanjo\r\n'
      + 'Marie Eyenga,marie.eyenga@afrilandfirstbank.com,SUPERVISEUR|COLLECTEUR,,\r\n'
      + 'Jean Tabi,jean.tabi@afrilandfirstbank.com,CASHIER,,\r\n');
  }
  downloadCredentials() {
    const esc = (v: string) => `"${(v ?? '').replace(/"/g, '""')}"`;
    const lines = [['Nom', 'Email', 'Role', 'Mot de passe temporaire'].join(',')].concat(
      this.importCreds().map((r) => [r.name, r.email, r.role, r.tempPassword ?? ''].map((v) => esc(String(v))).join(',')),
    );
    this.downloadCsv('identifiants-importes.csv', '﻿' + lines.join('\r\n'));
  }
  private downloadCsv(name: string, content: string) {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; a.click();
    URL.revokeObjectURL(url);
  }

  // --- pickup agencies (lieux de retrait) ---
  agencies = signal<Agency[]>([]);
  agLoading = signal(true);
  agText = signal('');
  agUpdate = signal(false);
  agBusy = signal(false);
  agErr = signal(false);
  agResult = signal<ImportAgenciesResult | null>(null);

  private loadAgencies() {
    this.agLoading.set(true);
    this.api.getAgencies().subscribe({ next: (a) => { this.agencies.set(a); this.agLoading.set(false); }, error: () => this.agLoading.set(false) });
  }

  agParsedRows = computed<ImportAgencyRow[]>(() => this.parseAgencies(this.agText()));

  /** Client-side preview (the backend is authoritative): name required, dup by name+city. */
  agPreview = computed(() => {
    const existing = new Set(this.agencies().map((a) => this.agKey(a.name, a.city ?? '')));
    const seen = new Set<string>();
    return this.agParsedRows().map((r) => {
      const name = (r.name || '').trim();
      const city = (r.city || '').trim();
      let status: 'new' | 'duplicate' | 'invalid' = 'new';
      if (!name) { status = 'invalid'; }
      else {
        const key = this.agKey(name, city);
        if (existing.has(key) || seen.has(key)) status = 'duplicate';
        seen.add(key);
      }
      return { name, city, status };
    });
  });
  agCounts = computed(() => {
    const p = this.agPreview();
    return {
      created: p.filter((r) => r.status === 'new').length,
      dup: p.filter((r) => r.status === 'duplicate').length,
      invalid: p.filter((r) => r.status === 'invalid').length,
    };
  });
  agActionable = computed(() => this.agCounts().created + (this.agUpdate() ? this.agCounts().dup : 0));

  private agKey(name: string, city: string) { return `${(name || '').trim().toLowerCase()}|${(city || '').trim().toLowerCase()}`; }

  /** Parse pasted/CSV text. Header line mapped by column name, or positional: name, city.
   *  Delimiter detected: tab, ';' or ','. */
  private parseAgencies(text: string): ImportAgencyRow[] {
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length);
    if (!lines.length) return [];
    const delim = lines[0].includes('\t') ? '\t' : lines[0].includes(';') ? ';' : ',';
    const cells = (l: string) => l.split(delim).map((c) => c.trim().replace(/^"(.*)"$/, '$1'));
    let rows = lines.map(cells);
    let idx = { name: 0, city: 1 };
    const head = rows[0].map((c) => c.toLowerCase());
    const isHeader = head.some((c) => /^(nom|name|agence|agency)$/.test(c)) || head.some((c) => /^(ville|city)$/.test(c));
    if (isHeader) {
      const at = (...re: RegExp[]) => head.findIndex((c) => re.some((r) => r.test(c)));
      idx = { name: at(/^(nom|name|agence|agency)$/), city: at(/^(ville|city|localit[eé])$/) };
      rows = rows.slice(1);
    }
    const g = (row: string[], i: number) => (i >= 0 && i < row.length ? row[i] : '');
    return rows.map((row) => ({ name: g(row, idx.name), city: g(row, idx.city) || null }));
  }

  onAgText(e: Event) {
    this.agText.set((e.target as HTMLTextAreaElement).value);
    this.agResult.set(null); this.agErr.set(false);
  }
  onAgFile(e: Event) {
    const input = e.target as HTMLInputElement;
    const f = input.files?.[0];
    input.value = '';
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => { this.agText.set(String(reader.result ?? '')); this.agResult.set(null); this.agErr.set(false); };
    reader.readAsText(f);
  }
  clearAg() { this.agText.set(''); this.agResult.set(null); this.agErr.set(false); }
  runAgImport() {
    const rows = this.agParsedRows();
    if (!rows.length || this.agBusy()) return;
    this.agBusy.set(true); this.agErr.set(false);
    this.api.importAgencies(rows, this.agUpdate()).subscribe({
      next: (res) => { this.agBusy.set(false); this.agResult.set(res); this.loadAgencies(); },
      error: () => { this.agBusy.set(false); this.agErr.set(true); },
    });
  }
  downloadAgTemplate() {
    this.downloadCsv('modele-agences.csv',
      '﻿nom,ville\r\n'
      + 'Agence Yaoundé Centre,Yaoundé\r\n'
      + 'Agence Douala Akwa,Douala\r\n');
  }

  clearFilters() {
    this.txSearch.set(''); this.txStatus.set('all'); this.txAgent.set('all'); this.txFrom.set(''); this.txTo.set('');
  }
  exportCsv() {
    const rows = this.filteredTxs();
    const head = [
      'Date', 'Reference', 'Nom', 'Sexe', 'CNI', 'Expiration CNI', 'NIU', 'Telephone contact', 'Email',
      'Quartier', 'Region', 'Ville', 'Photo client', 'Photo CNI recto', 'Photo CNI verso',
      'Paiement', 'Telephone paiement', 'Recommande par', 'Telephone parrain',
      'Livraison', 'Canal', 'Vendeur', 'Numero carte', 'PAN', 'Statut', 'Montant',
    ];
    const yn = (b: boolean) => (b ? 'Oui' : 'Non');
    const esc = (v: string) => `"${(v ?? '').replace(/"/g, '""')}"`;
    const lines = [head.join(',')].concat(
      rows.map((t) => [
        this.fmtDateTime(t.createdAt), t.ref, t.fullName, t.sexe, t.cni, t.cniExp, t.niu ?? '',
        t.phone, t.email, t.quartier, t.region, t.ville,
        yn(t.hasSelfie), yn(t.hasCniRecto), yn(t.hasCniVerso),
        t.pay, t.payPhone ?? '', t.referrerName ?? '', t.referrerPhone ?? '',
        t.delivery, t.channel === 'self' ? 'En ligne' : (this.agentName(t.agentId)), t.cardNumber ?? '', t.pan ?? '',
        t.status, String(t.amount),
      ].map((v) => esc(String(v))).join(',')),
    );
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'transactions.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  pct(count: number) {
    const max = Math.max(1, ...(this.stats()?.byAgent ?? []).map((r) => r.count));
    return (count / max) * 100;
  }
  onCfg(k: keyof CardConfig, e: Event) {
    const n = Number((e.target as HTMLInputElement).value.replace(/\D/g, '').slice(0, 8)) || 0;
    this.cfg.update((v) => ({ ...v, [k]: n }));
    this.saved.set(false); this.saveErr.set(false);
  }
  saveCfg() {
    if (this.saving()) return;
    this.saveErr.set(false); this.saving.set(true);
    this.api.updateConfig(this.cfg()).subscribe({
      next: (c) => {
        this.original.set({ ...c }); this.cfg.set({ ...c }); this.saving.set(false);
        this.saved.set(true); setTimeout(() => this.saved.set(false), 1600);
      },
      error: () => { this.saveErr.set(true); this.saving.set(false); },
    });
  }
  openRef(ref: string) { this.router.navigate(['/print'], { queryParams: { ref } }); }

  /** Toggle the full-detail panel under an admin row. */
  toggleExpand(ref: string) {
    this.expandedRef.set(this.expandedRef() === ref ? null : ref);
  }
  agentName(id: string | null) { return this.usersList().find((u) => u.id === id)?.name ?? id ?? '—'; }
  /** Format an ISO timestamp as date + time for the CSV export. */
  private fmtDateTime(iso: string) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString(this.i18n.lang() === 'en' ? 'en-GB' : 'fr-FR', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  }
}
