import { Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { I18n } from '../core/i18n';
import { Api } from '../core/api';
import { Auth } from '../core/auth';
import { AdminStats, CardConfig, CreateUserRequest, ImportUserRow, ImportUsersResult, Role, Subscription, User } from '../core/models';
import { AppBarComponent } from '../shared/app-bar';
import { IconComponent } from '../shared/icon';
import { AvatarComponent } from '../shared/avatar';
import { FieldComponent } from '../shared/fields';
import { TxDetailComponent } from '../shared/tx-detail';
import { SpinnerComponent } from '../shared/spinner';
import { StatusBadgeComponent } from '../shared/status-badge';
import { ClientPhotoComponent } from '../shared/client-photo';
import { payById, recordStatus } from '../shared/constants';

@Component({
  selector: 'page-admin',
  standalone: true,
  imports: [AppBarComponent, IconComponent, AvatarComponent, FieldComponent, TxDetailComponent, SpinnerComponent, StatusBadgeComponent, ClientPhotoComponent],
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
          <button [class.active]="section() === 'transactions'" (click)="section.set('transactions')"><ic name="hash" [size]="18"></ic> {{ i18n.t('nav_transactions') }}</button>
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
        <div class="kpi"><div class="kv" style="color:var(--success)">{{ stats()?.paid ?? 0 }}</div><div class="kl">{{ i18n.t('kpi_success') }}</div></div>
        <div class="kpi"><div class="kv" style="color:var(--af-gold)">{{ stats()?.pending ?? 0 }}</div><div class="kl">{{ i18n.t('kpi_pending') }}</div></div>
        <div class="kpi"><div class="kv" style="font-size:17px;color:var(--primary)">{{ i18n.money(stats()?.collected ?? 0) }}</div><div class="kl">{{ i18n.t('kpi_collected') }}</div></div>
      </div>

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
          <field [label]="i18n.t('user_role')">
            <select class="input" [value]="nu().role" (change)="onNu('role', $event)">
              <option value="AGENT">{{ i18n.t('role_agent') }}</option>
              <option value="PRINT_AGENT">{{ i18n.t('role_print') }}</option>
              <option value="ADMIN">{{ i18n.t('role_admin') }}</option>
            </select>
          </field>
          <field [label]="i18n.t('user_password')"><input class="input" type="text" [value]="nu().password" (input)="onNu('password', $event)" /></field>
          @if (nu().role === 'AGENT') {
            <field [label]="i18n.t('user_agency')"><input class="input" [value]="nu().agency || ''" (input)="onNu('agency', $event)" /></field>
            <field [label]="i18n.t('user_phone')" [hint]="i18n.t('user_phone_hint')"
                   [err]="(nu().phone || '') && !agentPhoneOk() ? i18n.t('user_phone_invalid') : null">
              <input class="input" inputmode="numeric" maxlength="9" [value]="nu().phone || ''" (input)="onNu('phone', $event)" />
            </field>
          }
          <button class="btn btn-primary" [disabled]="!userValid() || userBusy()" (click)="createUser()" style="padding:12px">
            @if (userBusy()) { <spinner></spinner> } @else { <ic name="plus" [size]="17"></ic> {{ i18n.t('user_create') }} }
          </button>
          @if (userMsg() === 'created') { <p style="font-size:12px;text-align:center;color:var(--success);font-weight:700">{{ i18n.t('user_created') }}</p> }
          @if (userMsg() === 'exists') { <p class="err" style="font-size:12px;text-align:center">{{ i18n.t('user_exists') }}</p> }
          @if (userMsg() === 'invalid') { <p class="err" style="font-size:12px;text-align:center">{{ i18n.t('user_invalid') }}</p> }
        </div>

        <div class="kicker" style="margin-top:16px;margin-bottom:6px">{{ i18n.t('users_list') }} · {{ usersList().length }}</div>
        @if (usersLoading()) {
        <div class="load-center"><spinner tone="primary" [size]="20"></spinner> {{ i18n.t('loading') }}</div>
        } @else {
        <div style="display:flex;flex-direction:column">
          @for (u of usersList(); track u.id) {
            <div style="display:flex;align-items:center;gap:10px;padding:9px 2px;border-top:1px solid var(--border)">
              <avatar [name]="u.name" [size]="30"></avatar>
              <div style="min-width:0;flex:1">
                <div style="font-size:13px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{ u.name }}</div>
                <div class="muted" style="font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{ u.email }}</div>
              </div>
              <span class="badge" style="background:var(--surface-2);color:var(--muted);font-size:10.5px;flex-shrink:0">{{ roleLabel(u.role) }}</span>
            </div>
          }
        </div>
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

      <!-- ========== TRANSACTIONS (wider than the 760px content cap, for the detailed table) ========== -->
      @if (section() === 'transactions') {
      <h1 style="font-size:21px">{{ i18n.t('nav_transactions') }}</h1>
      <div class="card" style="overflow:hidden;max-width:1180px">
        <div style="display:flex;align-items:center;gap:8px;padding:14px 14px 10px">
          <ic name="chart" [size]="17" style="color:var(--primary)"></ic>
          <h3 style="font-size:15px">{{ i18n.t('all_sales') }}</h3>
          <span class="muted" style="margin-left:auto;font-size:12px;font-weight:700">{{ filteredTxs().length }} {{ i18n.t('tx_count') }}</span>
        </div>
        <div style="padding:0 14px 12px;display:flex;flex-direction:column;gap:8px">
          <div class="input-prefix">
            <span class="pfx"><ic name="search" [size]="15"></ic></span>
            <input [placeholder]="i18n.t('tx_search_ph')" [value]="txSearch()" (input)="txSearch.set($any($event.target).value)" />
          </div>
          <div style="display:flex;gap:8px">
            <select class="input" [value]="txStatus()" (change)="txStatus.set($any($event.target).value)" style="flex:1">
              <option value="all">{{ i18n.t('tx_all_status') }}</option>
              <option value="paid">{{ i18n.t('st_paid') }}</option>
              <option value="pending">{{ i18n.t('st_awaiting') }}</option>
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
                    <td class="nowrap">{{ t.phone || '—' }}</td>
                    <td class="brk">{{ t.cni || '—' }}</td>
                    <td class="nowrap">{{ txDate(t.createdAt) }}</td>
                    <td><span style="display:flex;align-items:center;gap:6px;min-width:0"><span class="op-logo" [style.background]="pm(t).bg" [style.color]="pm(t).fg" style="width:20px;height:20px;font-size:8px;border-radius:5px;overflow:hidden;flex-shrink:0">@if (pm(t).logo) { <img [src]="pm(t).logo" [alt]="pm(t).name" style="width:100%;height:100%;object-fit:contain" /> } @else { {{ pm(t).short }} }</span><span style="overflow-wrap:anywhere;line-height:1.25">{{ t.pay === 'cash' ? i18n.t('pay_cash_short') : pm(t).name }}</span></span></td>
                    <td class="num">{{ i18n.money(t.amount) }}</td>
                    <td><status-badge [status]="rowStatus(t)"></status-badge></td>
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

      </main>
    </div>
  </div>`,
})
export class AdminComponent implements OnInit {
  i18n = inject(I18n);
  auth = inject(Auth);
  private api = inject(Api);
  private router = inject(Router);

  /** Active sidebar section. */
  section = signal<'overview' | 'config' | 'users' | 'transactions'>('overview');

  stats = signal<AdminStats | null>(null);
  txs = signal<Subscription[]>([]);
  // Per-section loading flags so each panel can show a spinner while its request is in flight.
  statsLoading = signal(true);
  txLoading = signal(true);
  usersLoading = signal(true);
  cfgLoading = signal(true);
  saving = signal(false);
  // Signals so the "save" button's [disabled] binding stays reactive (the app is zoneless).
  cfg = signal<CardConfig>({ price: 0, fees: 0, transport: 0 });
  private original = signal<CardConfig>({ price: 0, fees: 0, transport: 0 });
  changed = computed(() => {
    const c = this.cfg(), o = this.original();
    return c.price !== o.price || c.fees !== o.fees || c.transport !== o.transport;
  });
  saved = signal(false);
  saveErr = signal(false);

  // --- user management ---
  usersList = signal<User[]>([]);
  nu = signal<CreateUserRequest>({ name: '', email: '', role: 'AGENT', password: '', agency: '', phone: '' });
  userMsg = signal<'' | 'created' | 'exists' | 'invalid'>('');
  userBusy = signal(false);
  /** A commercial's phone must be a valid local 9-digit number (links client referrals to their stats). */
  agentPhoneOk = computed(() => /^6\d{8}$/.test((this.nu().phone ?? '').replace(/\D/g, '')));
  userValid = computed(() => {
    const u = this.nu();
    const base = !!u.name.trim() && /\S+@\S+\.\S+/.test(u.email) && !!u.role && (u.password ?? '').length >= 4;
    return base && (u.role !== 'AGENT' || this.agentPhoneOk());
  });

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
  txPrev() { this.txPage.update((p) => Math.max(0, p - 1)); }
  txNext() { this.txPage.update((p) => Math.min(this.txPageCount() - 1, p + 1)); }

  // Row helpers for the table cells.
  pm = (t: Subscription) => payById(t.pay);
  rowStatus = (t: Subscription) => recordStatus(t);
  txDate = (iso: string) => this.fmtDateTime(iso);

  ngOnInit() {
    this.api.adminStats().subscribe({ next: (s) => { this.stats.set(s); this.statsLoading.set(false); }, error: () => this.statsLoading.set(false) });
    this.api.allSubscriptions().subscribe({ next: (t) => { this.txs.set(t); this.txLoading.set(false); }, error: () => this.txLoading.set(false) });
    this.api.getConfig().subscribe({ next: (c) => { this.cfg.set({ ...c }); this.original.set({ ...c }); this.cfgLoading.set(false); }, error: () => this.cfgLoading.set(false) });
    this.loadUsers();
  }

  private loadUsers() {
    this.usersLoading.set(true);
    this.api.users().subscribe({ next: (u) => { this.usersList.set(u); this.usersLoading.set(false); }, error: () => this.usersLoading.set(false) });
  }
  get agentUsers() { return this.usersList().filter((u) => u.role === 'AGENT'); }

  onNu(k: keyof CreateUserRequest, e: Event) {
    const v = (e.target as HTMLInputElement | HTMLSelectElement).value;
    this.nu.update((u) => ({ ...u, [k]: v }));
    this.userMsg.set('');
  }
  createUser() {
    if (!this.userValid() || this.userBusy()) { if (!this.userValid()) this.userMsg.set('invalid'); return; }
    this.userBusy.set(true);
    const u = this.nu();
    this.api.createUser({ ...u, name: u.name.trim(), email: u.email.trim() }).subscribe({
      next: () => {
        this.userBusy.set(false); this.userMsg.set('created');
        this.nu.set({ name: '', email: '', role: 'AGENT', password: '', agency: '', phone: '' });
        this.loadUsers();
        setTimeout(() => this.userMsg.set(''), 2500);
      },
      error: (err) => {
        this.userBusy.set(false);
        this.userMsg.set(err?.status === 409 ? 'exists' : 'invalid');
      },
    });
  }
  roleLabel(role: Role) {
    return this.i18n.t(role === 'ADMIN' ? 'role_admin' : role === 'PRINT_AGENT' ? 'role_print' : 'role_agent');
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
      const phone9 = (r.phone || '').replace(/\D/g, '').slice(-9);
      let status: 'new' | 'duplicate' | 'invalid' = 'new';
      let reason = '';
      if (!name || !/\S+@\S+\.\S+/.test(email)) { status = 'invalid'; reason = 'name_email'; }
      else if (role !== 'ADMIN' && role !== 'AGENT' && role !== 'PRINT_AGENT') { status = 'invalid'; reason = 'role'; }
      else if (role === 'AGENT' && !/^6\d{8}$/.test(phone9)) { status = 'invalid'; reason = 'phone'; }
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
      name: g(row, idx.name), email: g(row, idx.email), role: this.normRole(g(row, idx.role)),
      phone: g(row, idx.phone), agency: g(row, idx.agency),
    }));
  }
  /** Map free-text / localized role labels to the enum code. */
  private normRole(r: string): string {
    const s = (r || '').trim().toLowerCase();
    if (/admin/.test(s)) return 'ADMIN';
    if (/print|impr/.test(s)) return 'PRINT_AGENT';
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
      + 'Paul Mbarga,paul.mbarga@afrilandfirstbank.com,PRINT_AGENT,,\r\n');
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
