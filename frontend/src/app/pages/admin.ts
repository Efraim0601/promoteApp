import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { I18n } from '../core/i18n';
import { Api } from '../core/api';
import { Auth } from '../core/auth';
import { AdminStats, CardConfig, CreateUserRequest, Role, Subscription, User } from '../core/models';
import { AppBarComponent } from '../shared/app-bar';
import { IconComponent } from '../shared/icon';
import { AvatarComponent } from '../shared/avatar';
import { FieldComponent } from '../shared/fields';
import { TxRowComponent } from '../shared/tx-row';

@Component({
  selector: 'page-admin',
  standalone: true,
  imports: [AppBarComponent, IconComponent, AvatarComponent, FieldComponent, TxRowComponent],
  template: `
  <div class="scr">
    <app-bar>
      <button appbar-right class="icon-btn" (click)="auth.logout()" [title]="i18n.t('logout')"><ic name="logout" [size]="15" [sw]="2"></ic></button>
    </app-bar>
    <div class="scr-body">
      <div style="display:flex;align-items:center;gap:12px">
        <avatar [name]="auth.user()!.name" role="admin" [size]="46"></avatar>
        <div style="min-width:0">
          <div class="kicker">{{ i18n.t('view_global') }}</div>
          <div style="font-size:20px;font-weight:800;font-family:var(--font-head);line-height:1.1;margin-top:2px">{{ i18n.t('admin_title') }}</div>
        </div>
      </div>

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

      <!-- config -->
      <div class="card" style="padding:16px">
        <div style="display:flex;align-items:flex-start;gap:9px;margin-bottom:14px">
          <ic name="gear" [size]="17" style="color:var(--primary);flex-shrink:0;margin-top:2px"></ic>
          <div style="min-width:0">
            <h3 style="font-size:15px;line-height:1.2">{{ i18n.t('config_title') }}</h3>
            <p class="muted" style="font-size:11.5px;line-height:1.4;margin-top:3px">{{ i18n.t('config_sub') }}</p>
          </div>
        </div>
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
          <button class="btn btn-primary" [disabled]="!changed()" (click)="saveCfg()" style="padding:12px">
            @if (saved()) { <ic name="check" [size]="18" [sw]="2.5"></ic> {{ i18n.t('saved') }} } @else { {{ i18n.t('save') }} }
          </button>
          @if (saveErr()) { <p class="err" style="font-size:12px;text-align:center;margin-top:2px">{{ i18n.t('save_error') }}</p> }
        </div>
      </div>

      <!-- user management -->
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
            <field [label]="i18n.t('user_phone')"><input class="input" inputmode="numeric" [value]="nu().phone || ''" (input)="onNu('phone', $event)" /></field>
          }
          <button class="btn btn-primary" [disabled]="!userValid() || userBusy()" (click)="createUser()" style="padding:12px">
            <ic name="plus" [size]="17"></ic> {{ i18n.t('user_create') }}
          </button>
          @if (userMsg() === 'created') { <p style="font-size:12px;text-align:center;color:var(--success);font-weight:700">{{ i18n.t('user_created') }}</p> }
          @if (userMsg() === 'exists') { <p class="err" style="font-size:12px;text-align:center">{{ i18n.t('user_exists') }}</p> }
          @if (userMsg() === 'invalid') { <p class="err" style="font-size:12px;text-align:center">{{ i18n.t('user_invalid') }}</p> }
        </div>

        <div class="kicker" style="margin-top:16px;margin-bottom:6px">{{ i18n.t('users_list') }} · {{ usersList().length }}</div>
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
      </div>

      <!-- transactions with filters -->
      <div class="card" style="overflow:hidden">
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
        <div style="max-height:340px;overflow-y:auto;padding:0 6px 6px">
          @if (filteredTxs().length === 0) {
            <p class="muted" style="font-size:13px;padding:8px 14px 20px;text-align:center">{{ i18n.t('tx_empty') }}</p>
          } @else {
            <div style="display:flex;flex-direction:column">
              @for (t of filteredTxs(); track t.ref) { <tx-row [t]="t" (open)="openRef(t.ref)"></tx-row> }
            </div>
          }
        </div>
      </div>

      <button class="btn btn-ghost" (click)="auth.logout()" style="font-size:13.5px"><ic name="logout" [size]="16"></ic> {{ i18n.t('logout') }}</button>
    </div>
  </div>`,
})
export class AdminComponent implements OnInit {
  i18n = inject(I18n);
  auth = inject(Auth);
  private api = inject(Api);
  private router = inject(Router);

  stats = signal<AdminStats | null>(null);
  txs = signal<Subscription[]>([]);
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
  userValid = computed(() => {
    const u = this.nu();
    return !!u.name.trim() && /\S+@\S+\.\S+/.test(u.email) && !!u.role && (u.password ?? '').length >= 4;
  });

  // --- transaction filters ---
  txSearch = signal('');
  txStatus = signal('all');   // all | paid | pending | cash | failed | printed
  txAgent = signal('all');    // all | <agentId> | self
  txFrom = signal('');        // yyyy-mm-dd
  txTo = signal('');
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

  ngOnInit() {
    this.api.adminStats().subscribe((s) => this.stats.set(s));
    this.api.allSubscriptions().subscribe((t) => this.txs.set(t));
    this.api.getConfig().subscribe((c) => { this.cfg.set({ ...c }); this.original.set({ ...c }); });
    this.loadUsers();
  }

  private loadUsers() { this.api.users().subscribe({ next: (u) => this.usersList.set(u), error: () => {} }); }
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

  clearFilters() {
    this.txSearch.set(''); this.txStatus.set('all'); this.txAgent.set('all'); this.txFrom.set(''); this.txTo.set('');
  }
  exportCsv() {
    const rows = this.filteredTxs();
    const head = ['Reference', 'Nom', 'Telephone', 'Paiement', 'Statut', 'Montant', 'Canal', 'Date'];
    const esc = (v: string) => `"${(v ?? '').replace(/"/g, '""')}"`;
    const lines = [head.join(',')].concat(
      rows.map((t) => [t.ref, t.fullName, t.phone, t.pay, t.status, String(t.amount), t.channel, t.createdAt].map(esc).join(',')),
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
    this.saveErr.set(false);
    this.api.updateConfig(this.cfg()).subscribe({
      next: (c) => {
        this.original.set({ ...c }); this.cfg.set({ ...c });
        this.saved.set(true); setTimeout(() => this.saved.set(false), 1600);
      },
      error: () => this.saveErr.set(true),
    });
  }
  openRef(ref: string) { this.router.navigate(['/print'], { queryParams: { ref } }); }
}
