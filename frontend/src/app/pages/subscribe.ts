import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { I18n } from '../core/i18n';
import { Api } from '../core/api';
import { Agent, CardConfig, Subscription } from '../core/models';
import { PAY_METHODS, payById } from '../shared/constants';
import { AppBarComponent } from '../shared/app-bar';
import { IconComponent } from '../shared/icon';
import { FieldComponent, PhoneFieldComponent, CniFieldComponent, ExpiryFieldComponent } from '../shared/fields';
import { StepsComponent } from '../shared/steps';
import { StatusBadgeComponent } from '../shared/status-badge';
import { AvatarComponent } from '../shared/avatar';
import { PhotoCaptureComponent } from '../shared/photo-capture';
import { TileChoiceComponent, TileOption } from '../shared/tile-choice';
import { PromoteCardComponent } from '../shared/promote-card';
import { QrCodeComponent } from '../shared/qr-code';

const STEP_KEYS = ['step_identity', 'step_documents', 'step_photo', 'step_payment', 'step_recap'];
const STEP_COUNT = STEP_KEYS.length;

interface WizardForm {
  prenom: string; nom: string; cni: string; cniExp: string; phone: string;
  selfie: boolean; selfieData: string | null; selfieKey: string | null;
  cniRectoData: string | null; cniRectoKey: string | null;
  cniVersoData: string | null; cniVersoKey: string | null;
  pay: string; delivery: string; refPhone: string;
}

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
    PhotoCaptureComponent, TileChoiceComponent, PromoteCardComponent, QrCodeComponent,
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

  form: WizardForm = {
    prenom: '', nom: '', cni: '', cniExp: '', phone: '',
    selfie: false, selfieData: null, selfieKey: null,
    cniRectoData: null, cniRectoKey: null, cniVersoData: null, cniVersoKey: null,
    pay: 'om', delivery: 'promote', refPhone: '',
  };

  ngOnInit() {
    this.channel = this.route.snapshot.data['channel'] === 'self' ? 'self' : 'agent';
    this.api.getConfig().subscribe((c) => (this.config = c));
  }

  ngOnDestroy() { this.stopPolling(); }

  set<K extends keyof WizardForm>(k: K, v: WizardForm[K]) {
    this.form[k] = v;
    if (k === 'refPhone') this.onRefPhone(v as string);
  }

  private onRefPhone(v: string) {
    if (v.length === 9) {
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
    return {
      prenom: !f.prenom.trim() ? this.i18n.t('required') : null,
      nom: !f.nom.trim() ? this.i18n.t('required') : null,
      cni: !f.cni ? this.i18n.t('required') : f.cni.length < 6 ? this.i18n.t('cni_invalid') : null,
      cniExp: !f.cniExp ? this.i18n.t('required') : !expDate ? this.i18n.t('exp_invalid')
        : expDate < new Date() ? this.i18n.t('exp_expired') : null,
      phone: !f.phone ? this.i18n.t('required') : !phoneOk ? this.i18n.t('invalid_phone') : null,
    };
  }
  e(key: 'prenom' | 'nom' | 'cni' | 'cniExp' | 'phone'): string | null {
    return this.touched() ? this.errs[key] : null;
  }

  get step0ok() { const x = this.errs; return !x.prenom && !x.nom && !x.cni && !x.cniExp && !x.phone; }
  get docsOk() { return !!this.form.cniRectoData && !!this.form.cniVersoData; }
  get stepValid() {
    return [this.step0ok, this.docsOk, !!this.form.selfieData, !!this.form.pay, true][this.step()];
  }
  get lastStep() { return STEP_COUNT - 1; }
  stepKey(i: number) { return STEP_KEYS[i]; }

  get headTitle() { return ['identity_title', 'doc_title', 'photo_title', 'payment_title', 'recap_title'][this.step()]; }
  get headSub() { return ['identity_sub', 'doc_sub', 'photo_sub', 'payment_sub', 'recap_sub2'][this.step()]; }
  get expDisplay() { return fmtExp(this.form.cniExp); }
  get isCash() { return this.result()?.payStatus === 'cash'; }

  /** Real deep link encoded in the reference QR — opens the print point on that ref. */
  get refUrl() {
    const r = this.result();
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    return r ? `${origin}/print?ref=${r.ref}` : '';
  }

  get payTiles(): TileOption[] {
    return PAY_METHODS.map((p) => ({
      id: p.id, bg: p.bg, color: p.fg, icon: p.short,
      title: p.id === 'cash' ? this.i18n.t('pay_cash_name') : p.name,
      desc: p.id === 'om' ? this.i18n.t('pay_om_desc') : p.id === 'mtn' ? this.i18n.t('pay_mtn_desc') : this.i18n.t('pay_cash_desc'),
    }));
  }

  // ---- navigation ----
  next() {
    this.touched.set(true);
    if (this.stepValid) { this.touched.set(false); this.step.set(Math.min(this.lastStep, this.step() + 1)); }
  }
  prev() {
    if (this.step() === 0) this.exit();
    else { this.touched.set(false); this.step.set(this.step() - 1); }
  }
  exit() { this.router.navigateByUrl(this.isSelf ? '/qr' : '/agent'); }
  home() { this.router.navigateByUrl(this.isSelf ? '/qr' : '/agent'); }

  /** Client photo captured (front or rear camera): keep preview + upload. */
  onSelfie(dataUrl: string) {
    this.form.selfieData = dataUrl; this.form.selfieKey = null;
    this.api.uploadImage(dataUrl, 'selfie').subscribe({ next: (r) => (this.form.selfieKey = r.key), error: () => {} });
  }
  onRetakeSelfie() { this.form.selfieData = null; this.form.selfieKey = null; }

  onCniRecto(dataUrl: string) {
    this.form.cniRectoData = dataUrl; this.form.cniRectoKey = null;
    this.api.uploadImage(dataUrl, 'cni-recto').subscribe({ next: (r) => (this.form.cniRectoKey = r.key), error: () => {} });
  }
  onRetakeRecto() { this.form.cniRectoData = null; this.form.cniRectoKey = null; }

  onCniVerso(dataUrl: string) {
    this.form.cniVersoData = dataUrl; this.form.cniVersoKey = null;
    this.api.uploadImage(dataUrl, 'cni-verso').subscribe({ next: (r) => (this.form.cniVersoKey = r.key), error: () => {} });
  }
  onRetakeVerso() { this.form.cniVersoData = null; this.form.cniVersoKey = null; }

  private payload() {
    return {
      prenom: this.form.prenom.trim(), nom: this.form.nom.trim(),
      cni: this.form.cni, cniExp: fmtExp(this.form.cniExp), phone: this.form.phone,
      pay: this.form.pay, delivery: this.form.delivery,
      selfie: !!this.form.selfieData, selfieKey: this.form.selfieKey,
      cniRectoKey: this.form.cniRectoKey, cniVersoKey: this.form.cniVersoKey,
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
        this.result.set({ ref: s.ref, payStatus: s.payStatus, amount: s.amount, message: s.paymentMessage });
        if (this.form.pay === 'cash') { this.proc.set('reference'); }
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
    this.form = {
      prenom: '', nom: '', cni: '', cniExp: '', phone: '', selfie: false, selfieData: null, selfieKey: null,
      cniRectoData: null, cniRectoKey: null, cniVersoData: null, cniVersoKey: null,
      pay: 'om', delivery: 'promote', refPhone: '',
    };
    this.touched.set(false); this.result.set(null); this.proc.set(null); this.step.set(0);
    this.refAgent.set(null); this.refUnknown.set(false);
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
