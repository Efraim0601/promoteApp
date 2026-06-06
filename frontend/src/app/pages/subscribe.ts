import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { I18n } from '../core/i18n';
import { Api } from '../core/api';
import { Agent, CardConfig, Subscription } from '../core/models';
import { PAY_METHODS, payById, matchesOperator } from '../shared/constants';
import { AppBarComponent } from '../shared/app-bar';
import { IconComponent } from '../shared/icon';
import { FieldComponent, PhoneFieldComponent, CniFieldComponent, ExpiryFieldComponent } from '../shared/fields';
import { StepsComponent } from '../shared/steps';
import { StatusBadgeComponent } from '../shared/status-badge';
import { AvatarComponent } from '../shared/avatar';
import { PhotoCaptureComponent } from '../shared/photo-capture';
import { ReceiptUploadComponent } from '../shared/receipt-upload';
import { TileChoiceComponent, TileOption } from '../shared/tile-choice';
import { PromoteCardComponent } from '../shared/promote-card';
import { QrCodeComponent } from '../shared/qr-code';

const STEP_KEYS = ['step_identity', 'step_documents', 'step_photo', 'step_payment', 'step_recap'];
const STEP_COUNT = STEP_KEYS.length;

interface WizardForm {
  prenom: string; nom: string; sexe: string; cni: string; niu: string; cniExp: string; phone: string;
  email: string; quartier: string; region: string;
  selfie: boolean; selfieData: string | null; selfieKey: string | null;
  cniRectoData: string | null; cniRectoKey: string | null;
  cniVersoData: string | null; cniVersoKey: string | null;
  saraReceiptData: string | null; saraReceiptKey: string | null;
  pay: string; payPhone: string; delivery: string; refPhone: string;
}

/** Cameroon administrative regions (for the Région dropdown). */
const REGIONS = [
  'Adamaoua', 'Centre', 'Est', 'Extrême-Nord', 'Littoral',
  'Nord', 'Nord-Ouest', 'Ouest', 'Sud', 'Sud-Ouest',
];

function parseExp(d: string): Date | null {
  if (d.length !== 8) return null;
  const dd = +d.slice(0, 2), mm = +d.slice(2, 4), yy = +d.slice(4, 8);
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31 || yy < 2024 || yy > 2099) return null;
  const dt = new Date(yy, mm - 1, dd);
  if (dt.getMonth() !== mm - 1 || dt.getDate() !== dd) return null;
  return dt;
}
const fmtExp = (d: string) => (d.length === 8 ? `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4, 8)}` : d);

@Component({
  selector: 'page-subscribe',
  standalone: true,
  imports: [
    AppBarComponent, IconComponent, FieldComponent, PhoneFieldComponent, CniFieldComponent,
    ExpiryFieldComponent, StepsComponent, StatusBadgeComponent, AvatarComponent,
    PhotoCaptureComponent, ReceiptUploadComponent, TileChoiceComponent, PromoteCardComponent, QrCodeComponent,
  ],
  templateUrl: './subscribe.html',
})
export class SubscribeComponent implements OnInit, OnDestroy {
  i18n = inject(I18n);
  private api = inject(Api);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  channel: 'agent' | 'self' = 'agent';
  get isSelf() { return this.channel === 'self'; }
  readonly STEP_COUNT = STEP_COUNT;
  readonly payById = payById;

  config: CardConfig = { price: 5000, fees: 500, transport: 1000 };

  step = signal(0);
  /** Self (QR) flow opens on a welcome screen; the agent flow starts straight on the form. */
  started = signal(false);
  proc = signal<null | 'paying' | 'reference' | 'failed'>(null);
  phase = signal<'send' | 'wait'>('send');
  touched = signal(false);
  refAgent = signal<Agent | null>(null);
  refUnknown = signal(false);
  result = signal<{ ref: string; payStatus?: string; amount?: number; message?: string | null } | null>(null);
  copied = signal(false);
  busy = signal(false);

  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private polling = false;

  readonly REGIONS = REGIONS;

  form: WizardForm = {
    prenom: '', nom: '', sexe: '', cni: '', niu: '', cniExp: '', phone: '',
    email: '', quartier: '', region: '',
    selfie: false, selfieData: null, selfieKey: null,
    cniRectoData: null, cniRectoKey: null, cniVersoData: null, cniVersoKey: null,
    saraReceiptData: null, saraReceiptKey: null,
    pay: 'om', payPhone: '', delivery: 'promote', refPhone: '',
  };

  ngOnInit() {
    this.channel = this.route.snapshot.data['channel'] === 'self' ? 'self' : 'agent';
    this.restore();                                   // bring back any in-progress entry
    // Agent flow starts on the form; the client (QR) flow opens on the welcome screen — unless a
    // draft is being resumed mid-way, in which case skip straight back to where they were.
    this.started.set(!this.isSelf || this.step() > 0);
    this.api.getConfig().subscribe((c) => (this.config = c));
    if (this.isSelf && this.form.refPhone) this.onRefPhone(this.form.refPhone);
  }

  /** Leave the welcome screen and begin the wizard (client/QR flow). */
  begin() { this.started.set(true); }
  get showWelcome() { return this.isSelf && !this.started() && !this.proc(); }

  ngOnDestroy() { this.stopPolling(); }

  set<K extends keyof WizardForm>(k: K, v: WizardForm[K]) {
    this.form[k] = v;
    if (k === 'refPhone') this.onRefPhone(v as string);
    // When a MoMo method is picked, default the payment number to the KYC phone (still editable):
    // the client confirms or changes the number that will actually receive the prompt.
    if (k === 'pay' && (v === 'om' || v === 'mtn') && !this.form.payPhone) this.form.payPhone = this.form.phone;
    this.persist();
  }

  // ---- draft persistence: survive reloads / navigating away, so nothing typed is lost ----
  private storageKey() { return `promote-wizard-${this.channel}`; }

  /** Save text fields + upload keys + step. Heavy base64 previews are skipped (localStorage quota);
   *  the uploads themselves already live on the server, referenced by their keys. */
  private persist() {
    try {
      const { selfieData, cniRectoData, cniVersoData, saraReceiptData, ...rest } = this.form;
      localStorage.setItem(this.storageKey(), JSON.stringify({ form: rest, step: this.step() }));
    } catch { /* storage unavailable or full — ignore */ }
  }

  private restore() {
    try {
      const raw = localStorage.getItem(this.storageKey());
      if (!raw) return;
      const saved = JSON.parse(raw) as { form?: Partial<WizardForm>; step?: number };
      if (saved.form) {
        // Restore fields, but force previews null (only their keys were persisted).
        this.form = { ...this.form, ...saved.form,
          selfieData: null, cniRectoData: null, cniVersoData: null, saraReceiptData: null };
      }
      if (typeof saved.step === 'number') this.step.set(Math.min(this.lastStep, Math.max(0, saved.step)));
    } catch { /* corrupt draft — ignore */ }
  }

  private clearPersist() { try { localStorage.removeItem(this.storageKey()); } catch { /* ignore */ } }

  private onRefPhone(v: string) {
    // Resolve & show the referrer's NAME only on the client/QR path. In the commercial
    // (agent) flow the number is still captured & stored, but the name is never revealed.
    if (this.isSelf && v.length === 9) {
      this.api.resolveAgent(v).subscribe((a) => { this.refAgent.set(a); this.refUnknown.set(!a); });
    } else {
      this.refAgent.set(null); this.refUnknown.set(false);
    }
  }

  // ---- derived ----
  get transport() { return this.form.delivery === 'home' ? (this.config.transport || 0) : 0; }
  get total() { return (this.config.price || 0) + (this.config.fees || 0) + this.transport; }
  get fullName() { return (this.form.prenom + ' ' + this.form.nom).trim(); }
  get pm() { return payById(this.form.pay); }

  get errs() {
    const f = this.form;
    const expDate = parseExp(f.cniExp);
    const phoneOk = /^6\d{8}$/.test(f.phone);
    const emailOk = /^\S+@\S+\.\S+$/.test(f.email);
    const cniOk = /^[0-9A-F]{6,}$/.test(f.cni); // hexadecimal, at least 6 chars
    return {
      prenom: !f.prenom.trim() ? this.i18n.t('required') : null,
      nom: !f.nom.trim() ? this.i18n.t('required') : null,
      sexe: !f.sexe ? this.i18n.t('required') : null,
      cni: !f.cni ? this.i18n.t('required') : !cniOk ? this.i18n.t('cni_invalid') : null,
      cniExp: !f.cniExp ? this.i18n.t('required') : !expDate ? this.i18n.t('exp_invalid')
        : expDate < new Date() ? this.i18n.t('exp_expired') : null,
      phone: !f.phone ? this.i18n.t('required') : !phoneOk ? this.i18n.t('invalid_phone') : null,
      email: !f.email.trim() ? this.i18n.t('required') : !emailOk ? this.i18n.t('email_invalid') : null,
      quartier: !f.quartier.trim() ? this.i18n.t('required') : null,
      region: !f.region ? this.i18n.t('required') : null,
    };
  }
  e(key: 'prenom' | 'nom' | 'sexe' | 'cni' | 'cniExp' | 'phone' | 'email' | 'quartier' | 'region'): string | null {
    return this.touched() ? this.errs[key] : null;
  }

  get step0ok() {
    const x = this.errs;
    return !x.prenom && !x.nom && !x.sexe && !x.cni && !x.cniExp && !x.phone && !x.email && !x.quartier && !x.region;
  }
  // Document / photo steps are satisfied by a local capture OR a restored upload key (so a
  // page reload mid-wizard doesn't force the client to retake what was already uploaded).
  get docsOk() {
    return (!!this.form.cniRectoData || !!this.form.cniRectoKey)
        && (!!this.form.cniVersoData || !!this.form.cniVersoKey);
  }
  get selfieOk() { return !!this.form.selfieData || !!this.form.selfieKey; }
  /** Mobile Money methods that need a payment number + USSD push. */
  get isMomo() { return this.form.pay === 'om' || this.form.pay === 'mtn'; }
  /** Valid = 9-digit Cameroon number AND it belongs to the chosen operator (MTN/Orange). */
  get payPhoneOk() {
    return /^6\d{8}$/.test(this.form.payPhone) && matchesOperator(this.form.pay, this.form.payPhone);
  }
  /** Error to show under the payment number: bad format, or right format but wrong operator. */
  get payPhoneError(): string | null {
    if (!this.isMomo) return null;
    if (!/^6\d{8}$/.test(this.form.payPhone)) return this.i18n.t('invalid_phone');
    if (!matchesOperator(this.form.pay, this.form.payPhone)) {
      return this.i18n.t(this.form.pay === 'mtn' ? 'pay_phone_not_mtn' : 'pay_phone_not_om');
    }
    return null;
  }
  /** Show the payment-number error once the field is "complete enough" or the step was touched. */
  get payPhoneErrorShown(): string | null {
    return this.touched() || this.form.payPhone.length >= 9 ? this.payPhoneError : null;
  }
  /** Payment step: a method is chosen; MoMo needs a valid payment number, SARA needs a receipt. */
  get payStepOk() {
    if (!this.form.pay) return false;
    if (this.isMomo) return this.payPhoneOk;
    if (this.form.pay === 'sara') return !!this.form.saraReceiptKey;
    return true;
  }
  get stepValid() {
    return [this.step0ok, this.docsOk, this.selfieOk, this.payStepOk, true][this.step()];
  }
  get lastStep() { return STEP_COUNT - 1; }
  stepKey(i: number) { return STEP_KEYS[i]; }

  get headTitle() { return ['identity_title', 'doc_title', 'photo_title', 'payment_title', 'recap_title'][this.step()]; }
  get headSub() { return ['identity_sub', 'doc_sub', 'photo_sub', 'payment_sub', 'recap_sub2'][this.step()]; }
  get expDisplay() { return fmtExp(this.form.cniExp); }
  get isCash() { return this.result()?.payStatus === 'cash'; }
  get isSaraPending() { return this.result()?.payStatus === 'sara_pending'; }

  /** Real deep link encoded in the reference QR — opens the print point on that ref. */
  get refUrl() {
    const r = this.result();
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    return r ? `${origin}/print?ref=${r.ref}` : '';
  }

  get payTiles(): TileOption[] {
    const desc: Record<string, string> = {
      om: this.i18n.t('pay_om_desc'), mtn: this.i18n.t('pay_mtn_desc'),
      sara: this.i18n.t('pay_sara_desc'), cash: this.i18n.t('pay_cash_desc'),
    };
    return PAY_METHODS.map((p) => ({
      id: p.id, bg: p.bg, color: p.fg, icon: p.short, logo: p.logo,
      title: p.id === 'cash' ? this.i18n.t('pay_cash_name') : p.name,
      desc: desc[p.id] ?? '',
    }));
  }

  // ---- navigation ----
  next() {
    this.touched.set(true);
    if (this.stepValid) {
      this.touched.set(false);
      this.step.set(Math.min(this.lastStep, this.step() + 1));
      // Entering the payment step with a MoMo method: default the payment number to the
      // KYC phone (still editable) so the client just confirms it or types the right one.
      if (this.step() === 3 && this.isMomo && !this.form.payPhone) this.form.payPhone = this.form.phone;
      this.persist();
    }
  }
  prev() {
    if (this.step() === 0) {
      if (this.isSelf) this.started.set(false); // client returns to the welcome screen
      else this.exit();
    } else { this.touched.set(false); this.step.set(this.step() - 1); this.persist(); }
  }
  exit() { this.router.navigateByUrl(this.isSelf ? '/qr' : '/agent'); }
  home() { this.router.navigateByUrl(this.isSelf ? '/qr' : '/agent'); }

  /** Client photo captured (front or rear camera): keep preview + upload. */
  onSelfie(dataUrl: string) {
    this.form.selfieData = dataUrl; this.form.selfieKey = null;
    this.api.uploadImage(dataUrl, 'selfie').subscribe({ next: (r) => { this.form.selfieKey = r.key; this.persist(); }, error: () => {} });
  }
  onRetakeSelfie() { this.form.selfieData = null; this.form.selfieKey = null; this.persist(); }

  onCniRecto(dataUrl: string) {
    this.form.cniRectoData = dataUrl; this.form.cniRectoKey = null;
    this.api.uploadImage(dataUrl, 'cni-recto').subscribe({ next: (r) => { this.form.cniRectoKey = r.key; this.persist(); }, error: () => {} });
  }
  onRetakeRecto() { this.form.cniRectoData = null; this.form.cniRectoKey = null; this.persist(); }

  onCniVerso(dataUrl: string) {
    this.form.cniVersoData = dataUrl; this.form.cniVersoKey = null;
    this.api.uploadImage(dataUrl, 'cni-verso').subscribe({ next: (r) => { this.form.cniVersoKey = r.key; this.persist(); }, error: () => {} });
  }
  onRetakeVerso() { this.form.cniVersoData = null; this.form.cniVersoKey = null; this.persist(); }

  /** SARA money receipt picked (image or PDF): keep preview + upload, store its key. */
  onSaraReceipt(dataUrl: string) {
    this.form.saraReceiptData = dataUrl; this.form.saraReceiptKey = null;
    this.api.uploadImage(dataUrl, 'sara-receipt').subscribe({ next: (r) => { this.form.saraReceiptKey = r.key; this.persist(); }, error: () => {} });
  }

  private payload() {
    return {
      prenom: this.form.prenom.trim(), nom: this.form.nom.trim(), sexe: this.form.sexe,
      cni: this.form.cni, niu: this.form.niu.trim() || undefined, cniExp: fmtExp(this.form.cniExp), phone: this.form.phone,
      email: this.form.email.trim(), quartier: this.form.quartier.trim(), region: this.form.region,
      pay: this.form.pay, payPhone: this.isMomo ? this.form.payPhone : undefined, delivery: this.form.delivery,
      selfie: !!this.form.selfieData, selfieKey: this.form.selfieKey,
      cniRectoKey: this.form.cniRectoKey, cniVersoKey: this.form.cniVersoKey,
      saraReceiptKey: this.form.saraReceiptKey,
      referrerPhone: this.form.refPhone || undefined,
    };
  }

  confirm() {
    if (this.busy()) return;
    this.busy.set(true);
    const obs = this.isSelf ? this.api.createSelf(this.payload()) : this.api.createAssisted(this.payload());
    obs.subscribe({
      next: (s: Subscription) => {
        this.busy.set(false);
        this.clearPersist();   // record created server-side — drop the local draft
        this.result.set({ ref: s.ref, payStatus: s.payStatus, amount: s.amount, message: s.paymentMessage });
        // cash and SARA money are settled off-platform → straight to the reference screen, no polling.
        if (this.form.pay === 'cash' || this.form.pay === 'sara') { this.proc.set('reference'); }
        else if (s.payStatus === 'failed') { this.proc.set('failed'); } // gateway rejected the push
        else {
          this.proc.set('paying');
          this.runMomo();
          // The customer confirms on their phone; the result arrives via the aggregator
          // (webhook + get-status) — poll the backend until it resolves.
          this.startStatusPolling(s.ref);
        }
      },
      error: () => this.busy.set(false),
    });
  }

  private runMomo() {
    this.phase.set('send');
    setTimeout(() => this.phase.set('wait'), 1300);
  }

  /** Poll the live payment status every 3 s until terminal, or give up after ~2 min. */
  private startStatusPolling(ref: string) {
    this.stopPolling();
    this.polling = true;
    let attempts = 0;
    const tick = () => {
      if (!this.polling) return;
      this.api.paymentStatus(ref).subscribe({
        next: (s) => {
          if (!this.polling) return;
          if (s.payStatus === 'paid') {
            this.polling = false;
            this.result.set({ ...(this.result() ?? { ref }), payStatus: 'paid' });
            this.proc.set('reference');
          } else if (s.payStatus === 'failed') {
            this.polling = false;
            this.proc.set('failed');
          } else if (++attempts >= 40) {
            this.polling = false;
            this.proc.set('failed'); // timed out waiting for the PIN
          } else {
            this.pollTimer = setTimeout(tick, 3000);
          }
        },
        error: () => {
          if (!this.polling) return;
          if (++attempts >= 40) { this.polling = false; this.proc.set('failed'); }
          else this.pollTimer = setTimeout(tick, 3000);
        },
      });
    };
    this.pollTimer = setTimeout(tick, 3000);
  }

  private stopPolling() {
    this.polling = false;
    if (this.pollTimer) { clearTimeout(this.pollTimer); this.pollTimer = null; }
  }
  retry() { this.stopPolling(); this.proc.set(null); }

  reset() {
    this.stopPolling();
    this.clearPersist();
    this.form = {
      prenom: '', nom: '', sexe: '', cni: '', niu: '', cniExp: '', phone: '', email: '', quartier: '', region: '',
      selfie: false, selfieData: null, selfieKey: null,
      cniRectoData: null, cniRectoKey: null, cniVersoData: null, cniVersoKey: null,
      saraReceiptData: null, saraReceiptKey: null,
      pay: 'om', payPhone: '', delivery: 'promote', refPhone: '',
    };
    this.touched.set(false); this.result.set(null); this.proc.set(null); this.step.set(0);
    this.refAgent.set(null); this.refUnknown.set(false);
    this.started.set(!this.isSelf); // client returns to the welcome screen
  }

  copyRef() {
    const r = this.result(); if (!r) return;
    try { navigator.clipboard.writeText(r.ref); } catch { /* ignore */ }
    this.copied.set(true); setTimeout(() => this.copied.set(false), 1500);
  }

  goPrint() {
    const r = this.result();
    this.router.navigate(['/print'], { queryParams: r ? { ref: r.ref } : {} });
  }

  // waiting description split helpers
  waitBefore() { return this.i18n.t('waiting_desc').split('{n}')[0]; }
  waitAfter() { return this.i18n.t('waiting_desc').split('{n}')[1] ?? ''; }
}
