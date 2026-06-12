import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { isValidPhoneNumber, parsePhoneNumberFromString } from 'libphonenumber-js';
import { I18n } from '../core/i18n';
import { Api } from '../core/api';
import { Auth } from '../core/auth';
import { Geo, GeoFix } from '../core/geo';
import { Recharge } from '../core/models';
import { PAY_METHODS, payById, matchesOperator, formatPhone, formatPan, PAN_DIGITS } from '../shared/constants';
import { AppBarComponent } from '../shared/app-bar';
import { IconComponent } from '../shared/icon';
import { FieldComponent, PhoneFieldComponent } from '../shared/fields';
import { TileChoiceComponent, TileOption } from '../shared/tile-choice';
import { ReceiptUploadComponent } from '../shared/receipt-upload';
import { StatusBadgeComponent } from '../shared/status-badge';
import { SpinnerComponent } from '../shared/spinner';
import { PromoteCardComponent } from '../shared/promote-card';
import { ReceiptService } from '../shared/receipt';

/** Free-entry amount bounds — must match RechargeService.MIN_AMOUNT / MAX_AMOUNT on the backend. */
const MIN_AMOUNT = 500;
const MAX_AMOUNT = 1_000_000;

interface RechargeForm {
  prenom: string; nom: string; pan: string; amount: string;
  pay: string; payPhone: string;
  saraReceiptData: string | null; saraReceiptKey: string | null; saraRef: string;
}

/**
 * Public prepaid-card recharge (top-up). A deliberately short, low-friction flow: a welcome screen,
 * a single form (holder name + PAN + amount + payment method), then the same MoMo / cash / SARA
 * processing UX as the subscription flow. Reuses the shared payment components and ReceiptService.
 */
@Component({
  selector: 'page-recharge',
  standalone: true,
  imports: [
    AppBarComponent, IconComponent, FieldComponent, PhoneFieldComponent, TileChoiceComponent,
    ReceiptUploadComponent, StatusBadgeComponent, SpinnerComponent, PromoteCardComponent,
  ],
  template: `
  <!-- ===== Welcome ===== -->
  @if (showWelcome) {
    <div class="scr">
      <app-bar><button appbar-left class="back-link" (click)="exit()" style="margin-right:2px"><ic name="chevL" [size]="20"></ic></button></app-bar>
      <div class="scr-body">
        <div style="display:flex;flex-direction:column;gap:16px">
          <div class="kicker">{{ i18n.t('home_kicker') }}</div>
          <promote-card></promote-card>
          <div>
            <h1 style="font-size:23px">{{ i18n.t('recharge_welcome_title') }}</h1>
            <p class="muted" style="font-size:13.5px;line-height:1.55;margin-top:8px">{{ i18n.t('recharge_welcome_desc') }}</p>
          </div>
          <div class="card" style="padding:6px 14px">
            <div class="srow"><span class="lbl" style="display:inline-flex;align-items:center;gap:8px"><ic name="user" [size]="17" style="color:var(--primary)"></ic> {{ i18n.t('recharge_welcome_step1') }}</span></div>
            <div class="srow"><span class="lbl" style="display:inline-flex;align-items:center;gap:8px"><ic name="idcard" [size]="17" style="color:var(--primary)"></ic> {{ i18n.t('recharge_welcome_step2') }}</span></div>
            <div class="srow"><span class="lbl" style="display:inline-flex;align-items:center;gap:8px"><ic name="phone" [size]="17" style="color:var(--primary)"></ic> {{ i18n.t('recharge_welcome_step3') }}</span></div>
          </div>
        </div>
      </div>
      <div class="scr-foot">
        <button class="btn btn-primary" (click)="begin()">{{ i18n.t('start') }} <ic name="arrowR" [size]="19"></ic></button>
      </div>
    </div>
  }

  <!-- ===== MoMo processing ===== -->
  @else if (proc() === 'paying') {
    <div class="scr">
      <app-bar><span appbar-right class="badge" style="background:var(--surface-2);color:var(--muted)">{{ i18n.t('badge_self') }}</span></app-bar>
      <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:18px;padding:10px 0">
        <div style="position:relative;width:120px;height:120px;display:flex;align-items:center;justify-content:center">
          <span style="position:absolute;inset:0;border-radius:50%;background:color-mix(in srgb, var(--primary) 22%, transparent);animation:ripple 1.8s ease-out infinite"></span>
          <span style="position:absolute;inset:0;border-radius:50%;background:color-mix(in srgb, var(--primary) 22%, transparent);animation:ripple 1.8s ease-out infinite 0.9s"></span>
          <span class="op-logo" [style.background]="pm.bg" [style.color]="pm.fg" style="width:72px;height:72px;border-radius:22px;font-size:20px;box-shadow:var(--shadow-lg);overflow:hidden">@if (pm.logo) { <img [src]="pm.logo" [alt]="pm.name" style="width:100%;height:100%;object-fit:contain;padding:8px;box-sizing:border-box" /> } @else { {{ pm.short }} }</span>
        </div>
        @if (phase() === 'send') {
          <div class="spinner" style="border-color:color-mix(in srgb, var(--primary) 35%, transparent);border-top-color:var(--primary)"></div>
          <h1 style="font-size:20px">{{ i18n.t('sending') }}</h1>
        } @else if (waitLong()) {
          <h1 style="font-size:21px">{{ i18n.t('waiting_long_title') }}</h1>
          <p class="muted" style="font-size:13.5px;line-height:1.55;max-width:300px">{{ i18n.t('waiting_long_desc') }}</p>
          <div style="display:flex;flex-direction:column;gap:10px;width:100%;max-width:300px;margin-top:4px">
            <button class="btn btn-primary" (click)="manualRefresh()" [disabled]="refreshing()" style="width:100%">
              @if (refreshing()) { <spinner></spinner> } @else { <ic name="refresh" [size]="18"></ic> {{ i18n.t('waiting_paid_check') }} }
            </button>
            <button class="btn btn-ghost" (click)="resumePolling()" [disabled]="refreshing()" style="font-size:13px">{{ i18n.t('waiting_keep') }}</button>
          </div>
        } @else {
          <h1 style="font-size:21px">{{ i18n.t('waiting_title') }}</h1>
          <p class="muted" style="font-size:13.5px;line-height:1.55;max-width:290px">
            {{ waitBefore() }}<b style="color:var(--text)">{{ fmtPhone(form.payPhone) }}</b>{{ waitAfter() }}
          </p>
          <div class="card" style="padding:11px 14px;display:flex;gap:9px;align-items:flex-start;max-width:300px;text-align:left;background:var(--surface-2)">
            <ic name="phone" [size]="18" style="color:var(--primary);flex-shrink:0;margin-top:1px"></ic>
            <span style="font-size:11.5px;color:var(--text);line-height:1.45;font-weight:600">{{ i18n.t('waiting_pin_instr', { op: pm.name }) }}</span>
          </div>
        }
      </div>
      @if (phase() === 'wait') {
        <div class="scr-foot">
          <button class="btn btn-ghost" (click)="exit()" style="font-size:13px">{{ i18n.t('cancel') }}</button>
        </div>
      }
    </div>
  }

  <!-- ===== Failed ===== -->
  @else if (proc() === 'failed') {
    <div class="scr">
      <app-bar><span appbar-right class="badge" style="background:var(--surface-2);color:var(--muted)">{{ i18n.t('badge_self') }}</span></app-bar>
      <div class="scr-body">
        <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:16px">
          <div style="width:86px;height:86px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:var(--accent-soft);color:var(--accent);animation:pop .45s cubic-bezier(.2,.8,.3,1.2)">
            <ic name="alert" [size]="42" [sw]="2.5"></ic>
          </div>
          <div>
            <h1 style="font-size:22px">{{ i18n.t('failed_title') }}</h1>
            <p class="muted" style="font-size:13.5px;line-height:1.5;max-width:290px;margin-top:8px">{{ i18n.t('failed_desc', { op: pm.name }) }}</p>
            @if (result()?.paymentMessage) {
              <p style="font-size:13px;line-height:1.45;max-width:290px;margin-top:10px;color:var(--accent);font-weight:600">{{ result()!.paymentMessage }}</p>
            }
          </div>
        </div>
      </div>
      <div class="scr-foot">
        <button class="btn btn-primary" (click)="retry()"><ic name="refresh" [size]="18"></ic> {{ i18n.t('retry') }}</button>
        <button class="btn btn-ghost" (click)="exit()">{{ i18n.t('home_btn') }}</button>
      </div>
    </div>
  }

  <!-- ===== Reference / end ===== -->
  @else if (proc() === 'reference') {
    <div class="scr">
      <app-bar><span appbar-right class="badge" style="background:var(--surface-2);color:var(--muted)">{{ i18n.t('badge_self') }}</span></app-bar>
      <div class="scr-body">
        <div style="display:flex;flex-direction:column;align-items:center;text-align:center;gap:14px">
          <div [style.background]="(isCash || isSaraPending) ? 'color-mix(in srgb, var(--af-gold) 22%, transparent)' : 'var(--success)'"
               [style.color]="(isCash || isSaraPending) ? '#8a6400' : '#fff'"
               style="width:64px;height:64px;border-radius:50%;display:flex;align-items:center;justify-content:center;animation:pop .45s cubic-bezier(.2,.8,.3,1.2)">
            <ic [name]="(isCash || isSaraPending) ? 'clock' : 'check'" [size]="32" [sw]="2.5"></ic>
          </div>
          <div>
            <h1 style="font-size:22px">{{ i18n.t((isCash || isSaraPending) ? 'recharge_done_pending_title' : 'recharge_done_paid_title') }}</h1>
            <p class="muted" style="font-size:13px;line-height:1.5;max-width:300px;margin-top:7px">{{ i18n.t(isSaraPending ? 'recharge_done_sara_desc' : isCash ? 'recharge_done_cash_desc' : 'recharge_done_paid_desc') }}</p>
          </div>

          <div class="card" style="padding:18px;width:100%;display:flex;flex-direction:column;align-items:center;gap:8px">
            <div class="kicker" style="text-align:center">{{ i18n.t('ref_label') }}</div>
            <button (click)="copyRef()" style="width:100%;border:1.5px dashed var(--border);background:var(--field-bg);border-radius:var(--radius);padding:11px 14px;display:flex;align-items:center;justify-content:center;gap:10px;cursor:pointer;color:var(--text)">
              <span style="font-family:var(--font-head);font-weight:800;font-size:22px;letter-spacing:.08em;white-space:nowrap">{{ result()!.ref }}</span>
              <ic [name]="copied() ? 'check' : 'copy'" [size]="17" [style.color]="copied() ? 'var(--success)' : 'var(--muted)'"></ic>
            </button>
            @if (copied()) { <div style="font-size:11px;color:var(--success);font-weight:700">{{ i18n.t('copied') }}</div> }
          </div>

          <p class="muted" style="font-size:12.5px;line-height:1.5;max-width:310px">{{ i18n.t('recharge_ref_instr') }}</p>

          <div class="card" style="padding:4px 16px;width:100%">
            <div class="srow"><span class="lbl">{{ i18n.t('recharge_pan_short') }}</span><span class="val">{{ fmtPan(result()!.pan) }}</span></div>
            <div class="srow"><span class="lbl">{{ i18n.t('ref_status_pay') }}</span><span class="val"><status-badge [status]="isSaraPending ? 'sara_pending' : isCash ? 'cash' : 'paid_done'"></status-badge></span></div>
            <div class="srow total"><span class="lbl">{{ i18n.t('total') }}</span><span class="val">{{ i18n.money(result()!.amount) }}</span></div>
          </div>

          <button class="btn btn-outline" (click)="downloadReceipt()" [disabled]="receiptBusy()" style="width:100%">
            @if (receiptBusy()) { <spinner tone="primary"></spinner> } @else { <ic name="download" [size]="17"></ic> {{ i18n.t('receipt_download') }} }
          </button>
        </div>
      </div>
      <div class="scr-foot">
        <button class="btn btn-primary" (click)="reset()"><ic name="plus" [size]="18"></ic> {{ i18n.t('recharge_new') }}</button>
        <button class="btn btn-ghost" (click)="exit()" style="font-size:13px">{{ i18n.t('home_btn') }}</button>
      </div>
    </div>
  }

  <!-- ===== Form ===== -->
  @else {
    <div class="scr">
      <app-bar>
        <button appbar-left class="back-link" (click)="back()" style="margin-right:2px"><ic name="chevL" [size]="20"></ic></button>
        <span appbar-right class="badge" style="background:var(--surface-2);color:var(--muted)">{{ i18n.t('badge_self') }}</span>
      </app-bar>
      <div class="scr-body">
        <div>
          <div class="kicker" style="margin-top:4px">{{ i18n.t('recharge_welcome_title') }}</div>
          <h1 style="font-size:22px;margin-top:5px">{{ i18n.t('recharge_title') }}</h1>
          <p class="muted" style="font-size:13px;margin-top:5px">{{ i18n.t('recharge_sub') }}</p>
        </div>

        <field [label]="i18n.t('prenom')" [err]="e('prenom')"><div class="input-prefix"><span class="pfx"><ic name="user" [size]="17"></ic></span><input [placeholder]="i18n.t('prenom_ph')" [value]="form.prenom" (input)="set('prenom', $any($event.target).value)" /></div></field>
        <field [label]="i18n.t('nom')" [err]="e('nom')"><div class="input-prefix"><span class="pfx"><ic name="user" [size]="17"></ic></span><input [placeholder]="i18n.t('nom_ph')" [value]="form.nom" (input)="set('nom', $any($event.target).value)" /></div></field>

        <field [label]="i18n.t('recharge_pan_label')" [hint]="i18n.t('recharge_pan_hint')" [err]="e('pan')">
          <div class="input-prefix"><span class="pfx"><ic name="idcard" [size]="17"></ic></span>
            <input inputmode="numeric" maxlength="19" [placeholder]="i18n.t('recharge_pan_ph')" [value]="form.pan" (input)="onPan($any($event.target).value)" style="letter-spacing:.06em" />
          </div>
        </field>

        <field [label]="i18n.t('recharge_amount_label')" [hint]="amountHint" [err]="e('amount')">
          <div class="input-prefix"><span class="pfx"><ic name="hash" [size]="17"></ic></span>
            <input inputmode="numeric" [placeholder]="i18n.t('recharge_amount_ph')" [value]="form.amount" (input)="onAmount($any($event.target).value)" />
          </div>
        </field>

        <div style="border-top:1px solid var(--border);padding-top:16px">
          <div style="font-size:13px;font-weight:700;margin-bottom:8px">{{ i18n.t('recharge_pay_title') }}</div>
          <tile-choice [options]="payTiles" [value]="form.pay" (valueChange)="set('pay', $event)"></tile-choice>

          @if (isMomo) {
            <div style="margin-top:10px">
              <phone-field [label]="i18n.t('pay_phone_label', { op: pm.name })" [value]="form.payPhone" (valueChange)="set('payPhone', $event)"
                [hint]="i18n.t('pay_phone_hint')" [err]="payPhoneErrorShown"></phone-field>
            </div>
          }

          @if (form.pay === 'sara') {
            <div class="card" style="padding:14px;margin-top:10px;display:flex;flex-direction:column;gap:11px;background:var(--surface-2)">
              <div style="display:flex;align-items:center;gap:8px;font-size:12.5px;font-weight:800;color:var(--primary)"><ic name="phone" [size]="16"></ic> {{ i18n.t('sara_steps_title') }}</div>
              <ol style="margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:9px">
                @for (s of saraSteps; track $index) {
                  <li style="display:flex;gap:10px;align-items:flex-start">
                    <span style="flex-shrink:0;width:20px;height:20px;border-radius:50%;background:var(--primary);color:#fff;font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center">{{ $index + 1 }}</span>
                    <span style="font-size:12px;line-height:1.45">{{ i18n.t(s) }}</span>
                  </li>
                }
              </ol>
            </div>
            <div class="card" style="padding:14px;margin-top:10px;display:flex;flex-direction:column;gap:6px;border:1px solid var(--primary)">
              <div style="font-size:11.5px;font-weight:700;text-transform:uppercase;letter-spacing:.03em;color:var(--primary)">{{ i18n.t('sara_account_title') }}</div>
              <div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap">
                <span style="font-size:22px;font-weight:800;letter-spacing:.04em">{{ i18n.t('sara_account_number') }}</span>
                <span class="muted" style="font-size:12.5px;font-weight:600">{{ i18n.t('sara_account_label') }}</span>
              </div>
              <p class="muted" style="font-size:11.5px;line-height:1.45;margin:0">{{ i18n.t('sara_account_hint') }}</p>
            </div>
            <div style="font-size:13px;font-weight:700;margin-top:12px">{{ i18n.t('sara_receipt_label') }}</div>
            <receipt-upload [imageData]="form.saraReceiptData" [guide]="i18n.t('sara_receipt_guide')" (captured)="onSaraReceipt($event)"></receipt-upload>
            @if (touched() && !form.saraReceiptKey) { <div class="err" style="text-align:center;font-weight:700">{{ i18n.t('sara_receipt_required') }}</div> }

            @if (saraExtracting()) {
              <div class="load-center"><spinner tone="primary" [size]="20"></spinner> {{ i18n.t('receipt_reading') }}</div>
            } @else if (form.saraReceiptKey) {
              <div class="card" style="padding:14px;margin-top:10px;display:flex;flex-direction:column;gap:10px">
                <div style="display:flex;align-items:center;gap:8px"><ic name="scan" [size]="16" style="color:var(--primary)"></ic><span style="font-size:13px;font-weight:800">{{ i18n.t('receipt_info_title') }}</span></div>
                <field [label]="i18n.t('receipt_ref_label')" [hint]="i18n.t('receipt_ref_hint')"
                       [err]="touched() && !form.saraRef.trim() ? i18n.t('receipt_ref_required') : null">
                  <div class="input-prefix"><span class="pfx"><ic name="hash" [size]="16"></ic></span>
                    <input [placeholder]="i18n.t('receipt_ref_ph')" [value]="form.saraRef" (input)="set('saraRef', $any($event.target).value)" style="letter-spacing:.02em;font-weight:600" />
                  </div>
                </field>
              </div>
            }
          }
        </div>
      </div>

      <div class="scr-foot">
        <button class="btn btn-primary" (click)="confirm()" [disabled]="busy() || !formComplete">
          @if (busy()) { <spinner></spinner> }
          @else if (form.pay === 'cash') { <ic name="check" [size]="19" [sw]="2.4"></ic> {{ i18n.t('recharge_confirm_cash') }} }
          @else if (form.pay === 'sara') { <ic name="check" [size]="19" [sw]="2.4"></ic> {{ i18n.t('recharge_confirm_sara') }} }
          @else { <ic name="phone" [size]="18"></ic> {{ i18n.t('recharge_confirm') }} ({{ i18n.money(amountValue) }}) }
        </button>
      </div>
    </div>
  }`,
})
export class RechargeComponent implements OnInit, OnDestroy {
  i18n = inject(I18n);
  private api = inject(Api);
  private auth = inject(Auth);
  private geo = inject(Geo);
  private router = inject(Router);
  private receipt = inject(ReceiptService);

  private geoFix: GeoFix | null = null;

  started = signal(false);
  proc = signal<null | 'paying' | 'reference' | 'failed'>(null);
  phase = signal<'send' | 'wait'>('send');
  waitLong = signal(false);
  refreshing = signal(false);
  touched = signal(false);
  busy = signal(false);
  copied = signal(false);
  receiptBusy = signal(false);
  saraExtracting = signal(false);
  result = signal<Recharge | null>(null);
  // Admin-configurable amount bounds (loaded from /api/config); fall back to the defaults until loaded.
  min = signal(MIN_AMOUNT);
  max = signal(MAX_AMOUNT);

  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private polling = false;

  readonly payById = payById;
  /** SARA money: numbered steps to follow in the SARA app before uploading the receipt. */
  readonly saraSteps = ['sara_step1', 'sara_step2', 'sara_step3', 'sara_step4', 'sara_step5'];

  form: RechargeForm = {
    prenom: '', nom: '', pan: '', amount: '',
    pay: 'om', payPhone: '',
    saraReceiptData: null, saraReceiptKey: null, saraRef: '',
  };

  ngOnInit() {
    this.restore();
    this.geo.current().then((f) => (this.geoFix = f));
    // Apply the admin-configured recharge bounds.
    this.api.getConfig().subscribe({
      next: (c) => { if (c.rechargeMin) this.min.set(c.rechargeMin); if (c.rechargeMax) this.max.set(c.rechargeMax); },
      error: () => { /* keep defaults */ },
    });
  }
  ngOnDestroy() { this.stopPolling(); }

  get showWelcome() { return !this.started() && !this.proc(); }
  begin() { this.started.set(true); }
  back() { this.started.set(false); }
  // Staff who launched a recharge return to their dashboard; a public client returns to /start.
  exit() { this.router.navigateByUrl(this.auth.isStaff() ? this.auth.landingPath() : '/start'); }

  set<K extends keyof RechargeForm>(k: K, v: RechargeForm[K]) {
    this.form[k] = v;
    // When a MoMo method is picked, default the payment number to the contact... (none here) — leave blank.
    this.persist();
  }
  /** PAN: keep digits only, capped at 16 (grouped in blocks of 4 for display). */
  onPan(v: string) { this.form.pan = formatPan(v); this.persist(); }
  /** Amount: digits only. */
  onAmount(v: string) { this.form.amount = v.replace(/\D/g, '').slice(0, 7); this.persist(); }

  // ---- derived ----
  get pm() { return payById(this.form.pay); }
  get isMomo() { return this.form.pay === 'om' || this.form.pay === 'mtn'; }
  get panDigits() { return this.form.pan.replace(/\D/g, ''); }
  get amountValue() { return parseInt(this.form.amount || '0', 10) || 0; }
  get isCash() { return this.result()?.payStatus === 'cash'; }
  get isSaraPending() { return this.result()?.payStatus === 'sara_pending'; }
  get amountHint() { return this.i18n.t('recharge_amount_hint', { min: this.i18n.money(this.min()), max: this.i18n.money(this.max()) }); }

  get payTiles(): TileOption[] {
    const desc: Record<string, string> = {
      om: this.i18n.t('pay_om_desc'), mtn: this.i18n.t('pay_mtn_desc'),
      sara: this.i18n.t('pay_sara_desc'), cash: this.i18n.t('pay_cash_desc'),
    };
    return PAY_METHODS.map((p) => ({
      id: p.id, bg: p.bg, color: p.fg, icon: p.short, logo: p.logo,
      title: p.id === 'cash' ? this.i18n.t('pay_cash_name') : p.name, desc: desc[p.id] ?? '',
    }));
  }

  // ---- validation ----
  get nameOk() { return !!this.form.prenom.trim() && !!this.form.nom.trim(); }
  get panOk() { return this.panDigits.length === PAN_DIGITS; }
  get amountOk() { const a = this.amountValue; return a >= this.min() && a <= this.max(); }
  get payPhoneOk() {
    const v = this.form.payPhone;
    if (!isValidPhoneNumber(v)) return false;
    const p = parsePhoneNumberFromString(v);
    return p?.country === 'CM' ? matchesOperator(this.form.pay, p.nationalNumber as string) : true;
  }
  get payPhoneError(): string | null {
    if (!this.isMomo) return null;
    const v = this.form.payPhone;
    if (!isValidPhoneNumber(v)) return this.i18n.t('invalid_phone');
    const p = parsePhoneNumberFromString(v);
    if (p?.country === 'CM' && !matchesOperator(this.form.pay, p.nationalNumber as string)) {
      return this.i18n.t(this.form.pay === 'mtn' ? 'pay_phone_not_mtn' : 'pay_phone_not_om');
    }
    return null;
  }
  get payPhoneErrorShown(): string | null {
    return this.touched() || this.form.payPhone.length >= 9 ? this.payPhoneError : null;
  }
  get payStepOk() {
    if (!this.form.pay) return false;
    if (this.isMomo) return this.payPhoneOk;
    if (this.form.pay === 'sara') return !!this.form.saraReceiptKey && !!this.form.saraRef.trim();
    return true;  // cash
  }
  get formComplete() { return this.nameOk && this.panOk && this.amountOk && this.payStepOk; }

  /** Field error (shown once touched). */
  e(field: 'prenom' | 'nom' | 'pan' | 'amount'): string | null {
    if (!this.touched()) return null;
    if (field === 'prenom') return this.form.prenom.trim() ? null : this.i18n.t('required');
    if (field === 'nom') return this.form.nom.trim() ? null : this.i18n.t('required');
    if (field === 'pan') return this.panOk ? null : this.i18n.t('recharge_pan_invalid');
    if (field === 'amount') return this.amountOk ? null : this.i18n.t('recharge_amount_invalid');
    return null;
  }

  // ---- SARA receipt ----
  onSaraReceipt(dataUrl: string) {
    this.form.saraReceiptData = dataUrl; this.form.saraReceiptKey = null;
    this.saraExtracting.set(true);
    this.api.uploadReceipt(dataUrl).subscribe({
      next: (r) => {
        this.form.saraReceiptKey = r.key;
        this.form.saraRef = r.reference ?? '';
        this.saraExtracting.set(false);
        this.persist();
      },
      error: () => this.saraExtracting.set(false),
    });
  }

  // ---- submit ----
  private payload() {
    return {
      prenom: this.form.prenom.trim(), nom: this.form.nom.trim(),
      pan: this.panDigits, amount: this.amountValue, pay: this.form.pay,
      payPhone: this.isMomo ? this.form.payPhone : undefined,
      saraReceiptKey: this.form.pay === 'sara' ? this.form.saraReceiptKey : undefined,
      saraRef: this.form.pay === 'sara' ? (this.form.saraRef.trim() || undefined) : undefined,
      latitude: this.geoFix?.lat, longitude: this.geoFix?.lng, geoAccuracy: this.geoFix?.accuracy,
    };
  }

  confirm() {
    if (this.busy()) return;
    if (!this.formComplete) { this.touched.set(true); return; }
    this.busy.set(true);
    this.api.createRecharge(this.payload()).subscribe({
      next: (r) => {
        this.busy.set(false);
        this.clearPersist();
        this.result.set(r);
        if (this.form.pay === 'cash' || this.form.pay === 'sara') { this.proc.set('reference'); }
        else if (r.payStatus === 'failed') { this.proc.set('failed'); }
        else { this.proc.set('paying'); this.runMomo(); this.startStatusPolling(r.ref); }
      },
      error: () => this.busy.set(false),
    });
  }

  private runMomo() { this.phase.set('send'); setTimeout(() => this.phase.set('wait'), 1300); }

  // ---- polling (mirrors the subscription flow) ----
  private readonly pollMax = 56;
  private pollDelay(n: number) { return n < 10 ? 3000 : n < 24 ? 5000 : 10000; }

  private startStatusPolling(ref: string) {
    this.stopPolling();
    this.polling = true;
    this.waitLong.set(false);
    let attempts = 0;
    const tick = () => {
      if (!this.polling) return;
      this.api.rechargeStatus(ref).subscribe({
        next: (s) => {
          if (!this.polling) return;
          if (s.payStatus === 'paid') {
            this.polling = false;
            this.result.update((r) => r ? { ...r, payStatus: 'paid' } : r);
            this.proc.set('reference');
          } else if (s.payStatus === 'failed') {
            this.polling = false;
            this.result.update((r) => r ? { ...r, payStatus: 'failed', paymentMessage: s.message ?? r.paymentMessage } : r);
            this.proc.set('failed');
          } else if (++attempts >= this.pollMax) {
            this.polling = false; this.waitLong.set(true);
          } else {
            this.pollTimer = setTimeout(tick, this.pollDelay(attempts));
          }
        },
        error: () => {
          if (!this.polling) return;
          if (++attempts >= this.pollMax) { this.polling = false; this.waitLong.set(true); }
          else this.pollTimer = setTimeout(tick, this.pollDelay(attempts));
        },
      });
    };
    this.pollTimer = setTimeout(tick, this.pollDelay(0));
  }

  manualRefresh() {
    const ref = this.result()?.ref;
    if (!ref || this.refreshing()) return;
    this.refreshing.set(true);
    this.api.rechargeStatus(ref).subscribe({
      next: (s) => {
        this.refreshing.set(false);
        if (s.payStatus === 'paid') { this.result.update((r) => r ? { ...r, payStatus: 'paid' } : r); this.proc.set('reference'); }
        else if (s.payStatus === 'failed') { this.result.update((r) => r ? { ...r, payStatus: 'failed', paymentMessage: s.message ?? r.paymentMessage } : r); this.proc.set('failed'); }
      },
      error: () => this.refreshing.set(false),
    });
  }
  resumePolling() { const ref = this.result()?.ref; if (ref) this.startStatusPolling(ref); }

  private stopPolling() { this.polling = false; if (this.pollTimer) { clearTimeout(this.pollTimer); this.pollTimer = null; } }
  retry() { this.stopPolling(); this.waitLong.set(false); this.proc.set(null); }

  reset() {
    this.stopPolling();
    this.clearPersist();
    this.form = { prenom: '', nom: '', pan: '', amount: '', pay: 'om', payPhone: '', saraReceiptData: null, saraReceiptKey: null, saraRef: '' };
    this.touched.set(false); this.result.set(null); this.proc.set(null);
    this.waitLong.set(false); this.refreshing.set(false);
    this.started.set(true);
  }

  copyRef() {
    const r = this.result(); if (!r) return;
    try { navigator.clipboard.writeText(r.ref); } catch { /* ignore */ }
    this.copied.set(true); setTimeout(() => this.copied.set(false), 1500);
  }

  async downloadReceipt() {
    const r = this.result();
    if (!r || this.receiptBusy()) return;
    this.receiptBusy.set(true);
    try {
      await this.receipt.download({
        kind: 'recharge', ref: r.ref, fullName: r.fullName, pan: r.pan,
        pay: r.pay, payPhone: r.payPhone, payStatus: r.payStatus, amount: r.amount, createdAt: r.createdAt,
      });
    } finally {
      this.receiptBusy.set(false);
    }
  }

  waitBefore() { return this.i18n.t('waiting_desc', { op: this.pm.name }).split('{n}')[0]; }
  waitAfter() { return this.i18n.t('waiting_desc', { op: this.pm.name }).split('{n}')[1] ?? ''; }
  fmtPhone(v: string) { return formatPhone(v); }
  fmtPan(v: string) { return formatPan(v); }

  // ---- draft persistence ----
  private storageKey() { return 'promote-recharge'; }
  private persist() {
    try { localStorage.setItem(this.storageKey(), JSON.stringify({ form: this.form, started: this.started() })); } catch { /* quota */ }
  }
  private restore() {
    try {
      const s = localStorage.getItem(this.storageKey());
      if (!s) return;
      const d = JSON.parse(s);
      if (d.form) this.form = { ...this.form, ...d.form };
      if (d.started) this.started.set(true);
    } catch { /* ignore corrupt draft */ }
  }
  private clearPersist() { try { localStorage.removeItem(this.storageKey()); } catch { /* ignore */ } }
}
