import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { I18n } from '../core/i18n';
import { Api } from '../core/api';
import { Auth } from '../core/auth';
import { AgentStats, ClaimResult, Subscription } from '../core/models';
import { isValidPhoneNumber } from 'libphonenumber-js';
import { livePoll, PAY_METHODS, recordStatus } from '../shared/constants';
import { AppBarComponent } from '../shared/app-bar';
import { IconComponent } from '../shared/icon';
import { AvatarComponent } from '../shared/avatar';
import { TxRowComponent } from '../shared/tx-row';
import { TxDetailComponent } from '../shared/tx-detail';
import { StatusBadgeComponent } from '../shared/status-badge';
import { SpinnerComponent } from '../shared/spinner';
import { FieldComponent, PhoneFieldComponent } from '../shared/fields';
import { ReceiptService } from '../shared/receipt';
import { NotifBellComponent } from '../shared/notif-bell';

@Component({
  selector: 'page-agent-home',
  standalone: true,
  imports: [AppBarComponent, IconComponent, AvatarComponent, TxRowComponent, TxDetailComponent, StatusBadgeComponent, SpinnerComponent, FieldComponent, PhoneFieldComponent, NotifBellComponent],
  template: `
  <div class="scr">
    <app-bar>
      <notif-bell appbar-right></notif-bell>
      <button appbar-right class="icon-btn" (click)="auth.logout()" [title]="i18n.t('logout')"><ic name="logout" [size]="15" [sw]="2"></ic></button>
    </app-bar>
    <div class="scr-body">
      <div style="display:flex;align-items:center;gap:12px">
        <avatar [name]="auth.user()!.name" role="agent" [size]="46"></avatar>
        <div style="min-width:0">
          <div class="muted" style="font-size:12.5px;font-weight:600">{{ i18n.t('greeting') }},</div>
          <div style="font-size:18px;font-weight:800;font-family:var(--font-head);line-height:1.1">{{ auth.user()!.name }}</div>
          <div class="muted" style="font-size:12px;margin-top:2px"><ic name="store" [size]="12" style="vertical-align:-1px;margin-right:3px"></ic>{{ auth.user()!.agency }}</div>
        </div>
      </div>

      <!-- Deux actions principales côte à côte (menu niveau 1) -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <button class="btn btn-primary" (click)="newSub()" style="padding:12px 8px;font-size:13.5px"><ic name="plus" [size]="18"></ic> {{ i18n.t('new_sub_btn') }}</button>
        <button class="btn btn-outline" (click)="newRecharge()" style="padding:12px 8px;font-size:13.5px"><ic name="phone" [size]="17"></ic> {{ i18n.t('new_recharge_btn') }}</button>
      </div>
      <!-- Actions secondaires (menu niveau 2) -->
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        @if (auth.hasRole('COLLECTEUR')) {
          <button class="btn btn-outline" (click)="goCollecte()" style="flex:1;padding:9px;font-size:13px"><ic name="store" [size]="16"></ic> {{ i18n.t('nav_collectes') }}</button>
        }
        <button class="btn btn-outline" (click)="claiming.set(true)" style="flex:1;padding:9px;font-size:13px"><ic name="qr" [size]="16"></ic> {{ i18n.t('claim_btn') }}</button>
        <button class="btn btn-ghost" (click)="openVerify()" style="flex:1;padding:9px;font-size:13px"><ic name="search" [size]="16"></ic> {{ i18n.t('verify_ref_btn') }}</button>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div class="kpi"><div class="kv">{{ stats()?.total ?? 0 }}</div><div class="kl">{{ i18n.t('kpi_my_subs') }}</div></div>
        <div class="kpi"><div class="kv" style="color:var(--success)">{{ stats()?.paid ?? 0 }}</div><div class="kl">{{ i18n.t('kpi_success') }}</div></div>
        <div class="kpi"><div class="kv" style="color:var(--af-gold)">{{ stats()?.pending ?? 0 }}</div><div class="kl">{{ i18n.t('kpi_pending') }}</div></div>
        <div class="kpi"><div class="kv" style="font-size:17px;color:var(--primary)">{{ i18n.money(stats()?.collected ?? 0) }}</div><div class="kl">{{ i18n.t('kpi_collected') }}</div></div>
      </div>

      <div class="card" style="overflow:hidden">
        <div style="display:flex;align-items:center;gap:8px;padding:14px 14px 10px">
          <ic name="chart" [size]="17" style="color:var(--primary)"></ic>
          <h3 style="font-size:15px">{{ i18n.t('my_sales') }}</h3>
          <span style="margin-left:auto;display:inline-flex;align-items:center;gap:5px;font-size:10.5px;font-weight:700;color:var(--success)" [title]="i18n.t('live_auto')"><span class="live-dot"></span>{{ i18n.t('live_auto') }}</span>
          <span class="muted" style="font-size:12px;font-weight:700">{{ filtered().length }} {{ i18n.t('tx_count') }}</span>
        </div>

        <!-- multi-level filters + advanced search over my own sales -->
        <div style="padding:0 14px 12px;display:flex;flex-direction:column;gap:8px">
          <div class="input-prefix">
            <span class="pfx"><ic name="search" [size]="15"></ic></span>
            <input [placeholder]="i18n.t('tx_search_adv_ph')" [value]="txSearch()" (input)="txSearch.set($any($event.target).value)" />
          </div>
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
            <select class="input" [value]="txPay()" (change)="txPay.set($any($event.target).value)" style="flex:1">
              <option value="all">{{ i18n.t('tx_all_pay') }}</option>
              @for (p of payMethods; track p.id) { <option [value]="p.id">{{ p.name }}</option> }
            </select>
          </div>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <input class="input" type="date" [value]="txFrom()" (change)="txFrom.set($any($event.target).value)" style="flex:1;min-width:105px" />
            <span class="muted" style="font-size:12px">→</span>
            <input class="input" type="date" [value]="txTo()" (change)="txTo.set($any($event.target).value)" style="flex:1;min-width:105px" />
          </div>
          <div style="display:flex;gap:8px">
            <button class="btn btn-outline" (click)="exportCsv()" [disabled]="!filtered().length" style="flex:1;padding:9px;font-size:13px"><ic name="copy" [size]="15"></ic> {{ i18n.t('tx_export') }}</button>
            <button class="btn btn-ghost" (click)="clearFilters()" style="flex:1;padding:9px;font-size:13px">{{ i18n.t('tx_clear') }}</button>
          </div>
        </div>

        <div style="max-height:360px;overflow-y:auto;padding:0 6px 6px">
          @if (loading()) {
            <div class="load-center"><spinner tone="primary" [size]="22"></spinner> {{ i18n.t('loading') }}</div>
          } @else if (mine().length === 0) {
            <p class="muted" style="font-size:13px;padding:8px 14px 20px;text-align:center">{{ i18n.t('tx_empty') }}</p>
          } @else if (filtered().length === 0) {
            <p class="muted" style="font-size:13px;padding:8px 14px 20px;text-align:center">{{ i18n.t('tx_no_match') }}</p>
          } @else {
            <div style="display:flex;flex-direction:column">
              @for (t of filtered(); track t.ref) {
                <tx-row [t]="t" [detailed]="true" (open)="toggleExpand(t.ref)"></tx-row>
                @if (expandedRef() === t.ref) {
                  <tx-detail [t]="t" (openPrint)="openRef($event)"></tx-detail>
                }
              }
            </div>
          }
        </div>
      </div>
      <div style="flex:1"></div>
      <button class="btn btn-ghost" (click)="auth.logout()" style="font-size:13.5px"><ic name="logout" [size]="16"></ic> {{ i18n.t('logout') }}</button>
    </div>

    @if (claiming()) {
      <div class="modal-overlay" (click)="close()">
        <div class="modal-sheet" (click)="$event.stopPropagation()">
          <div style="display:flex;align-items:flex-start;gap:10px">
            <span class="tile-ic" style="width:40px;height:40px;border-radius:11px;flex-shrink:0"><ic name="qr" [size]="20"></ic></span>
            <div style="min-width:0;flex:1">
              <h2 style="font-size:17px;line-height:1.2">{{ i18n.t('claim_title') }}</h2>
              <p class="muted" style="font-size:11.5px;line-height:1.4;margin-top:4px">{{ i18n.t('claim_sub') }}</p>
            </div>
            <button class="back-link" (click)="close()" style="flex-shrink:0"><ic name="x" [size]="20"></ic></button>
          </div>

          @if (!res() || !res()!.ok) {
            <phone-field [label]="i18n.t('tel')" [hint]="i18n.t('claim_phone_hint')" [value]="phone()" (valueChange)="phone.set($event); res.set(null)"></phone-field>
            <field [label]="i18n.t('cni')">
              <div class="input-prefix"><span class="pfx"><ic name="idcard" [size]="17"></ic></span>
                <input autocapitalize="characters" style="text-transform:uppercase" [placeholder]="i18n.t('doc_num_ph')"
                       [value]="cni()" (input)="cni.set($any($event.target).value.replace(/[^0-9A-Za-z]/g,'').toUpperCase()); res.set(null)" /></div>
            </field>
            <field [label]="i18n.t('niu_label')" [hint]="i18n.t('claim_niu_hint')"><input class="input" [placeholder]="i18n.t('niu_ph')" [value]="niu()" (input)="niu.set($any($event.target).value)" /></field>
            @if (res()) {
              <div class="feedback err-box"><ic name="alert" [size]="20" style="flex-shrink:0"></ic><div style="font-size:12px;font-weight:600;line-height:1.35">{{ i18n.t(failKey) }}</div></div>
            }
            <button class="btn btn-primary" (click)="submit()" [disabled]="!canSubmit || claimBusy()">
              @if (claimBusy()) { <spinner></spinner> } @else { <ic name="search" [size]="18"></ic> {{ i18n.t('claim_submit') }} }
            </button>
          } @else {
            <div class="feedback ok-box">
              <ic name="check" [size]="20" [sw]="2.6" style="flex-shrink:0"></ic>
              <div style="min-width:0"><div style="font-weight:700;font-size:13px">{{ res()!.record!.fullName }}</div><div style="font-size:11.5px">{{ i18n.t('claim_ok') }}</div></div>
            </div>
            <button class="btn btn-primary" (click)="close()">{{ i18n.t('close') }}</button>
          }
        </div>
      </div>
    }

    @if (verifying()) {
      <div class="modal-overlay" (click)="closeVerify()">
        <div class="modal-sheet" (click)="$event.stopPropagation()">
          <div style="display:flex;align-items:flex-start;gap:10px">
            <span class="tile-ic" style="width:40px;height:40px;border-radius:11px;flex-shrink:0"><ic name="search" [size]="20"></ic></span>
            <div style="min-width:0;flex:1">
              <h2 style="font-size:17px;line-height:1.2">{{ i18n.t('verify_ref_title') }}</h2>
              <p class="muted" style="font-size:11.5px;line-height:1.4;margin-top:4px">{{ i18n.t('verify_ref_sub') }}</p>
            </div>
            <button class="back-link" (click)="closeVerify()" style="flex-shrink:0"><ic name="x" [size]="20"></ic></button>
          </div>

          <div style="display:flex;gap:8px">
            <div class="input-prefix" style="flex:1">
              <span class="pfx"><ic name="search" [size]="16"></ic></span>
              <input [placeholder]="i18n.t('pp_search_ph')" [value]="vQuery()" style="letter-spacing:.02em;font-weight:600"
                     (input)="vQuery.set($any($event.target).value)" (keydown.enter)="verify()" />
            </div>
            <button class="btn btn-primary" (click)="verify()" [disabled]="vBusy() || !vQuery().trim()" style="width:auto;padding:0 16px">
              @if (vBusy()) { <spinner [size]="18"></spinner> } @else { <ic name="search" [size]="18"></ic> }
            </button>
          </div>

          <div style="max-height:48vh;overflow-y:auto;display:flex;flex-direction:column;gap:8px">
            @if (vBusy()) {
              <div class="load-center"><spinner tone="primary" [size]="20"></spinner> {{ i18n.t('loading') }}</div>
            } @else if (vSearched() && !vResults().length) {
              <p class="muted" style="font-size:13px;padding:12px;text-align:center">{{ i18n.t('pp_notfound') }}</p>
            } @else {
              @for (s of vResults(); track s.ref) {
                <div class="card" style="padding:12px 13px;display:flex;flex-direction:column;gap:8px;background:var(--surface-2)">
                  <div style="display:flex;align-items:center;gap:10px">
                    <div style="min-width:0;flex:1">
                      <div style="font-size:14px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{ s.fullName }}</div>
                      <div class="muted" style="font-size:11.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{ s.ref }} · {{ s.phone }}</div>
                    </div>
                    <status-badge [status]="vStatus(s)"></status-badge>
                  </div>
                  <div style="display:flex;align-items:center;gap:10px">
                    <span style="font-size:14px;font-weight:800">{{ i18n.money(s.amount) }}</span>
                    <span class="muted" style="font-size:11.5px">{{ payLabel(s.pay) }}</span>
                    <button class="btn btn-outline" (click)="downloadReceipt(s)" [disabled]="vReceiptBusy() === s.ref" style="margin-left:auto;width:auto;padding:7px 11px;font-size:12.5px">
                      @if (vReceiptBusy() === s.ref) { <spinner tone="primary" [size]="15"></spinner> } @else { <ic name="download" [size]="15"></ic> {{ i18n.t('receipt_download') }} }
                    </button>
                  </div>
                </div>
              }
            }
          </div>
        </div>
      </div>
    }
  </div>`,
  styles: [`
    .modal-overlay{ position:absolute; inset:0; z-index:50; display:flex; flex-direction:column; justify-content:flex-end; align-items:center;
      background:rgba(15,20,18,.5); backdrop-filter:blur(2px); }
    .modal-sheet{ width:100%; max-width:720px; background:var(--bg2); border-top-left-radius:22px; border-top-right-radius:22px; padding:20px;
      box-shadow:0 -10px 40px rgba(0,0,0,.3); display:flex; flex-direction:column; gap:14px; }
    @media (min-width:760px){ .modal-sheet{ border-radius:22px; margin-bottom:24px; } }
    .feedback{ display:flex; align-items:center; gap:10px; padding:12px 14px; border-radius:var(--radius); }
    .ok-box{ background:var(--success-soft); color:var(--success); }
    .err-box{ background:var(--accent-soft); color:var(--accent); }
  `],
})
export class AgentHomeComponent implements OnInit, OnDestroy {
  i18n = inject(I18n);
  auth = inject(Auth);
  private api = inject(Api);
  private router = inject(Router);
  private receipt = inject(ReceiptService);
  private stopPoll?: () => void;

  stats = signal<AgentStats | null>(null);
  mine = signal<Subscription[]>([]);
  claiming = signal(false);
  claimBusy = signal(false);
  // Whole-DB reference verification (any record, not just the agent's own portfolio).
  verifying = signal(false);
  vQuery = signal('');
  vResults = signal<Subscription[]>([]);
  vBusy = signal(false);
  vSearched = signal(false);
  vReceiptBusy = signal<string | null>(null);
  loading = signal(true);   // my-sales table while the request is in flight
  phone = signal('');
  cni = signal('');
  niu = signal('');
  res = signal<ClaimResult | null>(null);

  readonly payMethods = PAY_METHODS;

  // --- multi-level filters + advanced search over my sales ---
  txSearch = signal('');
  txStatus = signal('all');   // all | paid | pending | cash | sara_pending | failed | printed
  txPay = signal('all');      // all | om | mtn | sara | cash
  txFrom = signal('');        // yyyy-mm-dd
  txTo = signal('');
  expandedRef = signal<string | null>(null);
  filtered = computed(() => {
    const q = this.txSearch().trim().toLowerCase();
    const digits = this.txSearch().replace(/\D/g, '');
    const st = this.txStatus(), pay = this.txPay(), from = this.txFrom(), to = this.txTo();
    return this.mine().slice().reverse().filter((t) => {
      if (st !== 'all' && t.status !== st && t.payStatus !== st) return false;
      if (pay !== 'all' && t.pay !== pay) return false;
      if (from && t.createdAt.slice(0, 10) < from) return false;
      if (to && t.createdAt.slice(0, 10) > to) return false;
      if (q) {
        // Advanced search: reference, name, NIU, SARA reference, and any phone (contact / payment / payer).
        const hay = `${t.ref} ${t.fullName} ${t.niu ?? ''} ${t.saraRef ?? ''}`.toLowerCase();
        const phones = `${t.phone ?? ''} ${t.payPhone ?? ''} ${t.saraPayerPhone ?? ''}`.replace(/\D/g, '');
        if (!hay.includes(q) && !(digits && phones.includes(digits))) return false;
      }
      return true;
    });
  });

  ngOnInit() {
    this.refresh();
    // Silent background refresh so newly paid / printed sales appear without a manual reload.
    this.stopPoll = livePoll(() => this.refresh(true));
  }
  ngOnDestroy() { this.stopPoll?.(); }
  private refresh(silent = false) {
    this.api.agentStats().subscribe((s) => this.stats.set(s));
    if (!silent) this.loading.set(true);
    this.api.mySubscriptions().subscribe({
      next: (m) => { this.mine.set(m); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  clearFilters() {
    this.txSearch.set(''); this.txStatus.set('all'); this.txPay.set('all'); this.txFrom.set(''); this.txTo.set('');
  }

  /** Export the currently filtered sales as CSV (reference + key details). */
  exportCsv() {
    const rows = this.filtered();
    const head = [
      'Date', 'Reference', 'Nom', 'Sexe', 'CNI', 'Expiration CNI', 'NIU', 'Telephone contact', 'Email',
      'Quartier', 'Region', 'Ville', 'Photo client', 'Photo CNI recto', 'Photo CNI verso',
      'Paiement', 'Telephone paiement', 'Recommande par', 'Telephone parrain',
      'Livraison', 'Numero carte', 'PAN', 'Statut', 'Montant', 'Ref SARA',
    ];
    const yn = (b: boolean) => (b ? 'Oui' : 'Non');
    const esc = (v: string) => `"${(v ?? '').replace(/"/g, '""')}"`;
    const lines = [head.join(',')].concat(
      rows.map((t) => [
        t.createdAt, t.ref, t.fullName, t.sexe, t.cni, t.cniExp, t.niu ?? '',
        t.phone, t.email, t.quartier, t.region, t.ville,
        yn(t.hasSelfie), yn(t.hasCniRecto), yn(t.hasCniVerso),
        t.pay, t.payPhone ?? '', t.referrerName ?? '', t.referrerPhone ?? '',
        t.delivery, t.cardNumber ?? '', t.pan ?? '', t.status, String(t.amount), t.saraRef ?? '',
      ].map((v) => esc(String(v))).join(',')),
    );
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'mes-ventes.csv'; a.click();
    URL.revokeObjectURL(url);
  }
  get canSubmit() { return isValidPhoneNumber(this.phone()) && this.cni().length >= 6; }
  get failKey() {
    const r = this.res();
    return r?.reason === 'unpaid' ? 'claim_unpaid' : r?.reason === 'taken' ? 'claim_taken' : 'claim_notfound';
  }

  newSub() { this.router.navigateByUrl('/subscribe'); }
  newRecharge() { this.router.navigateByUrl('/recharge'); }
  goCollecte() { this.router.navigateByUrl('/collecte'); }
  openRef(ref: string) { this.router.navigate(['/print'], { queryParams: { ref } }); }
  toggleExpand(ref: string) { this.expandedRef.set(this.expandedRef() === ref ? null : ref); }

  submit() {
    if (!this.canSubmit || this.claimBusy()) return;
    this.claimBusy.set(true);
    this.api.claim(this.phone(), this.cni(), this.niu().trim() || undefined).subscribe({
      next: (r) => {
        this.res.set(r); this.claimBusy.set(false);
        if (r.ok) this.refresh();
      },
      error: () => this.claimBusy.set(false),
    });
  }
  close() { this.claiming.set(false); this.phone.set(''); this.cni.set(''); this.niu.set(''); this.res.set(null); }

  // ---- whole-DB reference verification ----
  openVerify() { this.verifying.set(true); }
  closeVerify() { this.verifying.set(false); this.vQuery.set(''); this.vResults.set([]); this.vSearched.set(false); }
  vStatus = (s: Subscription) => recordStatus(s);
  payLabel(pay: string) { return pay === 'cash' ? this.i18n.t('pay_cash_name') : (PAY_METHODS.find((p) => p.id === pay)?.name ?? pay); }

  /** Look a reference / name / phone up across the WHOLE database (not just the agent's own sales)
   *  to verify a payment. Uses the shared search endpoint, available to any authenticated staff. */
  verify() {
    const q = this.vQuery().trim();
    if (!q || this.vBusy()) return;
    this.vBusy.set(true); this.vSearched.set(true);
    this.api.searchSubscriptions(q).subscribe({
      next: (list) => { this.vResults.set(list); this.vBusy.set(false); },
      error: () => { this.vResults.set([]); this.vBusy.set(false); },
    });
  }

  /** Download the PNG receipt for a verified record. */
  async downloadReceipt(s: Subscription) {
    if (this.vReceiptBusy()) return;
    this.vReceiptBusy.set(s.ref);
    try {
      await this.receipt.download({
        ref: s.ref, fullName: s.fullName, pay: s.pay, payPhone: s.payPhone,
        payStatus: s.payStatus, amount: s.amount, createdAt: s.createdAt,
      });
    } finally {
      this.vReceiptBusy.set(null);
    }
  }
}
