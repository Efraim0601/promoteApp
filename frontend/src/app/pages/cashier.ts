import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { ImagePreview } from '../shared/image-preview';
import { ActivatedRoute, Router } from '@angular/router';
import { I18n } from '../core/i18n';
import { Api } from '../core/api';
import { Auth } from '../core/auth';
import { CashierStats, Recharge, Subscription } from '../core/models';
import { LIVE_REFRESH_MS, payById, recordStatus } from '../shared/constants';
import { AppBarComponent } from '../shared/app-bar';
import { IconComponent } from '../shared/icon';
import { FieldComponent } from '../shared/fields';
import { StatusBadgeComponent } from '../shared/status-badge';
import { SpinnerComponent } from '../shared/spinner';

/** Cashier — retrieve a subscription, verify the client's identity, then validate the in-person
 *  cash payment (cash → paid). The printed card is then handed over at the print point. */
@Component({
  selector: 'page-cashier',
  standalone: true,
  imports: [AppBarComponent, IconComponent, FieldComponent, StatusBadgeComponent, SpinnerComponent],
  template: `
  <div class="scr">
    <app-bar>
      <button appbar-left class="back-link" (click)="exit()" style="margin-right:2px"><ic name="chevL" [size]="20"></ic></button>
      <button appbar-right class="icon-btn" (click)="auth.logout()" [title]="i18n.t('logout')"><ic name="logout" [size]="15" [sw]="2"></ic></button>
    </app-bar>
    <div class="scr-body">
      <div>
        <div class="kicker"><ic name="store" [size]="13" style="vertical-align:-2px;margin-right:4px"></ic>{{ i18n.t('card_name') }}</div>
        <h1 style="font-size:23px;margin-top:6px">{{ i18n.t('cash_title') }}</h1>
        <p class="muted" style="font-size:13px;margin-top:5px">{{ i18n.t('cash_sub') }}</p>
      </div>

      <!-- Cashier KPIs (hidden while viewing a single record) -->
      @if (!rec() && stats(); as st) {
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">
          <div class="kpi"><div class="kv" style="color:var(--primary)">{{ st.myCount }}</div><div class="kl">{{ i18n.t('cash_kpi_mine') }}</div></div>
          <div class="kpi"><div class="kv" style="color:var(--success)">{{ st.myCountToday }}</div><div class="kl">{{ i18n.t('kpi_today') }}</div></div>
          <div class="kpi"><div class="kv" style="color:var(--af-gold)">{{ st.pendingCount }}</div><div class="kl">{{ i18n.t('cash_kpi_queue') }}</div></div>
        </div>
        <p class="muted" style="font-size:11.5px;margin-top:-4px;text-align:center">
          {{ i18n.t('cash_kpi_collected') }} : <b style="color:var(--text)">{{ i18n.money(st.myCollected) }}</b>
          · {{ i18n.t('cash_kpi_pending_amount') }} : <b style="color:var(--accent)">{{ i18n.money(st.pendingAmount) }}</b>
        </p>
        <p class="muted" style="font-size:10.5px;margin-top:-8px;text-align:center;display:flex;align-items:center;justify-content:center;gap:5px;color:var(--success)"><span class="live-dot"></span>{{ i18n.t('live_auto') }}</p>
      }

      <field [label]="i18n.t('pp_input')">
        <div style="display:flex;gap:8px">
          <div class="input-prefix" style="flex:1">
            <span class="pfx"><ic name="search" [size]="16"></ic></span>
            <input [placeholder]="i18n.t('pp_search_ph')" [value]="ref()" style="letter-spacing:.02em;font-weight:600"
                   (input)="onRef($event)" (keydown.enter)="doSearch()" />
          </div>
          <button class="btn btn-primary" (click)="doSearch()" [disabled]="loading()" style="width:auto;padding:0 16px">
            @if (loading()) { <spinner [size]="18"></spinner> } @else { <ic name="search" [size]="18"></ic> }
          </button>
        </div>
      </field>

      @if (loading()) {
        <div class="load-center"><spinner tone="primary" [size]="22"></spinner> {{ i18n.t('loading') }}</div>
      }

      @if (!rec() && results().length) {
        <div class="card" style="overflow:hidden">
          <div class="muted" style="padding:10px 14px;border-bottom:1px solid var(--border);font-size:11.5px">{{ results().length }} {{ i18n.t('pp_results') }}</div>
          @for (s of results(); track s.ref) {
            <button (click)="open(s.ref)" style="width:100%;text-align:left;display:flex;align-items:center;gap:11px;padding:11px 14px;border:none;border-bottom:1px solid var(--border);background:transparent;cursor:pointer">
              <div style="min-width:0;flex:1">
                <div style="font-size:14px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{ s.fullName }}</div>
                <div class="muted" style="font-size:11.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{ s.ref }} · {{ s.phone }}</div>
              </div>
              <status-badge [status]="status(s)"></status-badge>
              <ic name="chevR" [size]="16" style="color:var(--muted);flex-shrink:0"></ic>
            </button>
          }
        </div>
      }

      <!-- Recharge matches (separate list — top-up records have no KYC file). -->
      @if (!rec() && !rRec() && rechargeResults().length) {
        <div class="card" style="overflow:hidden">
          <div class="muted" style="padding:10px 14px;border-bottom:1px solid var(--border);font-size:11.5px"><ic name="phone" [size]="12" style="vertical-align:-1px;margin-right:4px"></ic>{{ i18n.t('cash_recharges') }}</div>
          @for (r of rechargeResults(); track r.ref) {
            <button (click)="openRecharge(r.ref)" style="width:100%;text-align:left;display:flex;align-items:center;gap:11px;padding:11px 14px;border:none;border-bottom:1px solid var(--border);background:transparent;cursor:pointer">
              <div style="min-width:0;flex:1">
                <div style="font-size:14px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{ r.fullName }}</div>
                <div class="muted" style="font-size:11.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{ r.ref }} · {{ i18n.money(r.amount) }}</div>
              </div>
              <status-badge [status]="r.status"></status-badge>
              <ic name="chevR" [size]="16" style="color:var(--muted);flex-shrink:0"></ic>
            </button>
          }
        </div>
      }

      @if (!searched()) {
        <div class="card" style="padding:14px;display:flex;gap:9px;align-items:center">
          <ic name="hash" [size]="17" style="color:var(--muted);flex-shrink:0"></ic>
          <span class="muted" style="font-size:12px;line-height:1.4">{{ i18n.t('pp_hint') }}</span>
        </div>
      }

      <!-- Recharge record (cash validation). -->
      @if (rRec(); as r) {
        @if (rValidated()) {
          <div class="card" style="padding:20px;display:flex;flex-direction:column;align-items:center;gap:12px;text-align:center">
            <span style="width:64px;height:64px;border-radius:50%;background:var(--success);color:#fff;display:flex;align-items:center;justify-content:center;animation:pop .45s cubic-bezier(.2,.8,.3,1.2)"><ic name="check" [size]="32" [sw]="2.5"></ic></span>
            <h2 style="font-size:18px">{{ i18n.t('cash_validated_ok') }}</h2>
            <div style="font-weight:800;letter-spacing:.06em;white-space:nowrap">{{ r.ref }}</div>
            <div style="font-size:18px;font-weight:800;color:var(--success)">{{ i18n.money(r.amount) }}</div>
          </div>
        } @else {
          <div class="card" style="overflow:hidden">
            <div style="padding:13px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:8px">
              <ic name="phone" [size]="17" style="color:var(--primary)"></ic>
              <h3 style="font-size:15px">{{ i18n.t('cash_recharge_record') }}</h3>
              <span style="margin-left:auto"><status-badge [status]="r.status"></status-badge></span>
            </div>
            <div style="padding:16px 16px 6px">
              <div style="font-size:16px;font-weight:800">{{ r.fullName }}</div>
              <div class="muted" style="font-size:12px;margin-top:3px">{{ i18n.t('recharge_pan_short') }} {{ r.pan }}</div>
            </div>
            <div style="padding:0 16px 14px">
              <div class="srow"><span class="lbl">{{ i18n.t('pay_method_label') }}</span><span class="val">{{ r.pay === 'cash' ? i18n.t('pay_cash_name') : rpm(r).name }}</span></div>
              @if (r.payStatus === 'cash') {
                <div class="srow total"><span class="lbl">{{ i18n.t('pp_to_collect') }}</span><span class="val" style="color:var(--accent)">{{ i18n.money(r.amount) }}</span></div>
              } @else {
                <div class="srow total"><span class="lbl">{{ i18n.t('amount_paid') }}</span><span class="val">{{ i18n.money(r.amount) }}</span></div>
              }
              @if (r.cashCollectedBy) { <div class="srow"><span class="lbl">{{ i18n.t('cash_collected_by') }}</span><span class="val">{{ r.cashCollectedBy }}</span></div> }
            </div>
            @if (r.payStatus !== 'cash') {
              <div style="padding:0 16px 16px">
                <div style="display:flex;gap:9px;align-items:flex-start;padding:11px 13px;border-radius:var(--radius);background:var(--surface-2);color:var(--muted)">
                  <ic name="alert" [size]="18" style="flex-shrink:0;margin-top:1px"></ic>
                  <span style="font-size:12.5px;line-height:1.4;font-weight:600">{{ i18n.t('cash_not_cash') }}</span>
                </div>
              </div>
            }
          </div>
        }
      }

      @if (searched() && !rec() && !rRec() && !loading() && !results().length && !rechargeResults().length) {
        <div class="card" style="padding:18px;display:flex;flex-direction:column;align-items:center;gap:10px;text-align:center">
          <span style="width:48px;height:48px;border-radius:50%;background:var(--accent-soft);color:var(--accent);display:flex;align-items:center;justify-content:center"><ic name="alert" [size]="24"></ic></span>
          <p style="font-size:13.5px;font-weight:700">{{ i18n.t('pp_notfound') }}</p>
          <button class="btn btn-ghost" (click)="again()" style="width:auto;padding:9px 14px;font-size:13px">{{ i18n.t('pp_again') }}</button>
        </div>
      }

      @if (rec(); as r) {
        @if (justValidated()) {
          <div class="card" style="padding:20px;display:flex;flex-direction:column;align-items:center;gap:12px;text-align:center">
            <span style="width:64px;height:64px;border-radius:50%;background:var(--success);color:#fff;display:flex;align-items:center;justify-content:center;animation:pop .45s cubic-bezier(.2,.8,.3,1.2)"><ic name="check" [size]="32" [sw]="2.5"></ic></span>
            <h2 style="font-size:18px">{{ i18n.t('cash_validated_ok') }}</h2>
            <div style="font-weight:800;letter-spacing:.06em;white-space:nowrap">{{ r.ref }}</div>
            <div style="font-size:18px;font-weight:800;color:var(--success)">{{ i18n.money(r.amount) }}</div>
            <p class="muted" style="font-size:12.5px;line-height:1.4">{{ i18n.t('cash_handover_hint') }}</p>
          </div>
        } @else {
          <div class="card" style="overflow:hidden">
            <div style="padding:13px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:8px">
              <ic name="idcard" [size]="17" style="color:var(--primary)"></ic>
              <h3 style="font-size:15px">{{ i18n.t('pp_record') }}</h3>
              <span style="margin-left:auto"><status-badge [status]="status(r)"></status-badge></span>
            </div>
            <div style="padding:16px;display:flex;gap:14px">
              <div style="width:78px;height:78px;border-radius:14px;overflow:hidden;flex-shrink:0;position:relative;box-shadow:var(--shadow)">
                @if (selfieUrl()) {
                  <img [src]="selfieUrl()" alt="selfie" (click)="preview.open(selfieUrl())" style="width:78px;height:78px;object-fit:cover;cursor:zoom-in" />
                } @else {
                  <svg viewBox="0 0 78 78" width="78" height="78"><rect width="78" height="78" fill="#cfe6da"/><circle cx="39" cy="31" r="16" fill="#5b7d6f"/><path d="M14 78 q0 -22 25 -22 q25 0 25 22z" fill="#5b7d6f"/></svg>
                }
              </div>
              <div style="min-width:0;flex:1">
                <div style="font-size:16px;font-weight:800">{{ r.fullName }}</div>
                <div class="muted" style="font-size:12px;margin-top:3px">{{ i18n.t('cni_short') }} {{ r.cni }} · {{ i18n.t('validity') }} {{ r.cniExp }}</div>
                <div class="muted" style="font-size:12px;margin-top:2px">{{ r.phone }}@if (r.email) { · {{ r.email }}}</div>
              </div>
            </div>
            <div style="padding:0 16px 14px">
              <div class="srow"><span class="lbl">{{ i18n.t('pay_method_label') }}</span><span class="val" style="display:inline-flex;align-items:center;gap:7px"><span class="op-logo" [style.background]="pm(r).bg" [style.color]="pm(r).fg" style="width:22px;height:22px;font-size:9px;border-radius:6px;overflow:hidden">@if (pm(r).logo) { <img [src]="pm(r).logo" [alt]="pm(r).name" style="width:100%;height:100%;object-fit:contain" /> } @else { {{ pm(r).short }} }</span>{{ r.pay === 'cash' ? i18n.t('pay_cash_name') : pm(r).name }}</span></div>
              @if (r.payStatus === 'cash') {
                <div class="srow total"><span class="lbl">{{ i18n.t('pp_to_collect') }}</span><span class="val" style="color:var(--accent)">{{ i18n.money(r.amount) }}</span></div>
              } @else {
                <div class="srow total"><span class="lbl">{{ i18n.t('amount_paid') }}</span><span class="val">{{ i18n.money(r.amount) }}</span></div>
              }
              @if (r.cashCollectedBy) {
                <div class="srow"><span class="lbl">{{ i18n.t('cash_collected_by') }}</span><span class="val">{{ r.cashCollectedBy }}</span></div>
              }
            </div>

            <!-- The record is not a pending cash payment: nothing to collect here. -->
            @if (r.payStatus !== 'cash') {
              <div style="padding:0 16px 16px">
                <div style="display:flex;gap:9px;align-items:flex-start;padding:11px 13px;border-radius:var(--radius);background:var(--surface-2);color:var(--muted)">
                  <ic name="alert" [size]="18" style="flex-shrink:0;margin-top:1px"></ic>
                  <span style="font-size:12.5px;line-height:1.4;font-weight:600">{{ i18n.t('cash_not_cash') }}</span>
                </div>
              </div>
            }
          </div>
        }
      }
      <div style="flex:1"></div>
    </div>

    @if (rec(); as r) {
      @if (justValidated()) {
        <div class="scr-foot"><button class="btn btn-ghost" (click)="again()">{{ i18n.t('pp_again') }}</button></div>
      } @else if (r.payStatus === 'cash') {
        <div class="scr-foot">
          @if (err()) { <div class="feedback err-box" style="font-size:12.5px"><ic name="alert" [size]="18" style="flex-shrink:0"></ic> {{ i18n.t('cash_error') }}</div> }
          <button class="btn btn-primary" (click)="doValidate(r.ref)" [disabled]="busy()">
            @if (busy()) { <spinner></spinner> } @else { <ic name="check" [size]="18" [sw]="2.4"></ic> {{ i18n.t('cash_validate') }} }
          </button>
          <div style="display:flex;gap:10px">
            <button class="btn btn-ghost" (click)="doReject(r.ref)" [disabled]="busy()" style="font-size:13px;color:var(--accent)"><ic name="x" [size]="16"></ic> {{ i18n.t('cash_reject') }}</button>
            <button class="btn btn-ghost" (click)="again()" style="font-size:13px">{{ i18n.t('pp_again') }}</button>
          </div>
        </div>
      } @else {
        <div class="scr-foot"><button class="btn btn-ghost" (click)="again()">{{ i18n.t('pp_again') }}</button></div>
      }
    } @else if (rRec(); as r) {
      @if (rValidated()) {
        <div class="scr-foot"><button class="btn btn-ghost" (click)="again()">{{ i18n.t('pp_again') }}</button></div>
      } @else if (r.payStatus === 'cash') {
        <div class="scr-foot">
          @if (err()) { <div class="feedback err-box" style="font-size:12.5px"><ic name="alert" [size]="18" style="flex-shrink:0"></ic> {{ i18n.t('cash_error') }}</div> }
          <button class="btn btn-primary" (click)="doValidateRecharge(r.ref)" [disabled]="busy()">
            @if (busy()) { <spinner></spinner> } @else { <ic name="check" [size]="18" [sw]="2.4"></ic> {{ i18n.t('cash_validate') }} }
          </button>
          <div style="display:flex;gap:10px">
            <button class="btn btn-ghost" (click)="doRejectRecharge(r.ref)" [disabled]="busy()" style="font-size:13px;color:var(--accent)"><ic name="x" [size]="16"></ic> {{ i18n.t('cash_reject') }}</button>
            <button class="btn btn-ghost" (click)="again()" style="font-size:13px">{{ i18n.t('pp_again') }}</button>
          </div>
        </div>
      } @else {
        <div class="scr-foot"><button class="btn btn-ghost" (click)="again()">{{ i18n.t('pp_again') }}</button></div>
      }
    }
  </div>`,
})
export class CashierComponent implements OnInit, OnDestroy {
  i18n = inject(I18n);
  auth = inject(Auth);
  private api = inject(Api);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private sanitizer = inject(DomSanitizer);
  preview = inject(ImagePreview);

  ref = signal('');
  searched = signal(false);
  loading = signal(false);
  results = signal<Subscription[]>([]);
  rec = signal<Subscription | null>(null);
  // Recharges are kept in parallel signals so the (production-critical) subscription cash flow is untouched.
  rechargeResults = signal<Recharge[]>([]);
  rRec = signal<Recharge | null>(null);
  rValidated = signal(false);
  stats = signal<CashierStats | null>(null);
  selfieUrl = signal<SafeUrl | null>(null);
  busy = signal(false);
  err = signal(false);
  justValidated = signal(false);
  private objectUrls: string[] = [];

  pm = (r: Subscription) => payById(r.pay);
  status = (r: Subscription) => recordStatus(r);

  private poll?: ReturnType<typeof setInterval>;
  /** The last executed search query, so the live refresh re-runs the SAME search. */
  private lastQuery = '';

  ngOnInit() {
    this.loadStats();
    // Keep the queue/counters, the search results AND the open record live without a manual reload.
    this.poll = setInterval(() => this.refreshLive(), LIVE_REFRESH_MS);
    const prefill = this.route.snapshot.queryParamMap.get('ref');
    if (prefill) { this.ref.set(prefill.toUpperCase()); this.open(prefill); }
  }
  ngOnDestroy() { if (this.poll) clearInterval(this.poll); this.clear(); }
  private loadStats() { this.api.cashierStats().subscribe({ next: (s) => this.stats.set(s), error: () => {} }); }

  /** Silent background refresh: KPIs always; plus the open record's status OR the search
   *  results, so a payment moving (cash → payée) shows in near real-time. Never disturbs an
   *  in-flight action, the success screen, or the already-loaded selfie image. */
  private refreshLive() {
    this.loadStats();
    if (this.busy() || this.loading() || this.justValidated() || this.rValidated()) return;
    const r = this.rec();
    const rr = this.rRec();
    if (r) {
      // Refresh the record's data (status, amount…) only; leave the selfie image untouched.
      this.api.byRef(r.ref).subscribe({ next: (s) => { if (this.rec()?.ref === s.ref && !this.justValidated()) this.rec.set(s); }, error: () => {} });
    } else if (rr) {
      this.api.rechargeByRef(rr.ref).subscribe({ next: (x) => { if (this.rRec()?.ref === x.ref && !this.rValidated()) this.rRec.set(x); }, error: () => {} });
    } else if (this.results().length && this.ref().trim() === this.lastQuery && this.lastQuery) {
      this.api.searchSubscriptions(this.lastQuery).subscribe({ next: (list) => { if (!this.rec()) this.results.set(list); }, error: () => {} });
    }
  }

  onRef(e: Event) {
    // Accept reference, name or phone: letters, digits, spaces, + and -.
    this.ref.set((e.target as HTMLInputElement).value.replace(/[^a-zA-Z0-9 +-]/g, '').slice(0, 40));
  }

  /** Search by reference, name or phone. One match opens directly; several show a list. */
  doSearch() {
    const q = this.ref().trim();
    if (!q) return;
    this.lastQuery = q;
    this.searched.set(true); this.loading.set(true); this.clear();
    this.rec.set(null); this.results.set([]); this.rRec.set(null); this.rechargeResults.set([]);
    // Search recharges in parallel; they appear as a separate list (or open directly if it's the only match).
    this.api.searchRecharges(q).subscribe({ next: (list) => this.rechargeResults.set(list), error: () => {} });
    this.api.searchSubscriptions(q).subscribe({
      next: (list) => {
        this.loading.set(false);
        if (list.length === 1 && !this.rechargeResults().length) this.open(list[0].ref);
        else this.results.set(list);
      },
      error: () => { this.loading.set(false); this.results.set([]); },
    });
  }

  /** Load the full record (incl. selfie) for a chosen reference. */
  open(ref: string) {
    this.searched.set(true); this.loading.set(true); this.results.set([]); this.rechargeResults.set([]); this.clear();
    this.rec.set(null); this.rRec.set(null);
    this.justValidated.set(false); this.err.set(false);
    this.api.byRef(ref).subscribe({
      next: (s) => { this.setRecord(s); this.loading.set(false); },
      error: () => { this.rec.set(null); this.loading.set(false); },
    });
  }

  /** Open a recharge record for cash validation. */
  openRecharge(ref: string) {
    this.searched.set(true); this.loading.set(true); this.results.set([]); this.rechargeResults.set([]); this.clear();
    this.rec.set(null); this.rRec.set(null); this.rValidated.set(false); this.err.set(false);
    this.api.rechargeByRef(ref).subscribe({
      next: (r) => { this.rRec.set(r); this.loading.set(false); },
      error: () => { this.rRec.set(null); this.loading.set(false); },
    });
  }

  again() {
    this.ref.set(''); this.searched.set(false); this.rec.set(null); this.results.set([]);
    this.rRec.set(null); this.rechargeResults.set([]); this.rValidated.set(false);
    this.justValidated.set(false); this.err.set(false); this.clear();
  }

  /** Validate / reject a cash recharge (mirrors the subscription cash flow). */
  doValidateRecharge(ref: string) {
    if (this.busy()) return;
    this.busy.set(true); this.err.set(false);
    this.api.cashValidateRecharge(ref, 'validate').subscribe({
      next: (r) => { this.rRec.set(r); this.busy.set(false); this.rValidated.set(true); this.loadStats(); },
      error: () => { this.busy.set(false); this.err.set(true); },
    });
  }
  doRejectRecharge(ref: string) {
    if (this.busy()) return;
    const reason = window.prompt(this.i18n.t('cash_reject_reason')) ?? '';
    if (reason === null) return;
    this.busy.set(true); this.err.set(false);
    this.api.cashValidateRecharge(ref, 'reject', reason || undefined).subscribe({
      next: (r) => { this.rRec.set(r); this.busy.set(false); },
      error: () => { this.busy.set(false); this.err.set(true); },
    });
  }
  rpm = (r: Recharge) => payById(r.pay);

  /** Confirm the cash was collected → marks the subscription paid (then printable). */
  doValidate(ref: string) {
    if (this.busy()) return;
    this.busy.set(true); this.err.set(false);
    this.api.cashValidate(ref, 'validate').subscribe({
      next: (s) => { this.rec.set(s); this.busy.set(false); this.justValidated.set(true); this.loadStats(); },
      error: () => { this.busy.set(false); this.err.set(true); },
    });
  }

  /** Report the cash was never paid → marks the subscription failed, with a reason. */
  doReject(ref: string) {
    if (this.busy()) return;
    const reason = window.prompt(this.i18n.t('cash_reject_reason')) ?? '';
    if (reason === null) return; // cancelled
    this.busy.set(true); this.err.set(false);
    this.api.cashValidate(ref, 'reject', reason || undefined).subscribe({
      next: (s) => { this.rec.set(s); this.busy.set(false); },
      error: () => { this.busy.set(false); this.err.set(true); },
    });
  }

  private setRecord(s: Subscription) {
    this.rec.set(s);
    this.justValidated.set(false);
    if (s.hasSelfie) this.loadImage(s.ref, 'selfie', this.selfieUrl);
  }

  private loadImage(ref: string, kind: string, target: { set: (v: SafeUrl | null) => void }) {
    this.api.imageBlob(ref, kind).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        this.objectUrls.push(url);
        target.set(this.sanitizer.bypassSecurityTrustUrl(url));
      },
      error: () => target.set(null),
    });
  }

  private clear() {
    this.objectUrls.forEach((u) => URL.revokeObjectURL(u));
    this.objectUrls = [];
    this.selfieUrl.set(null);
  }

  exit() { this.router.navigateByUrl(this.auth.landingPath()); }
}
