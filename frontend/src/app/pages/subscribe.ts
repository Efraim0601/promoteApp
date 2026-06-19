import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { I18n } from '../core/i18n';
import { Api } from '../core/api';
import { ConfigStore } from '../core/config-store';
import { Auth } from '../core/auth';
import { Geo, GeoFix } from '../core/geo';
import { Agency, Agent, CardConfig, Subscription } from '../core/models';
import { isValidPhoneNumber, parsePhoneNumberFromString } from 'libphonenumber-js';
import { PAY_METHODS, payById, matchesOperator, formatPhone } from '../shared/constants';
import { AppBarComponent } from '../shared/app-bar';
import { IconComponent } from '../shared/icon';
import { FieldComponent, PhoneFieldComponent, CniFieldComponent, ExpiryFieldComponent } from '../shared/fields';
import { StepsComponent } from '../shared/steps';
import { StatusBadgeComponent } from '../shared/status-badge';
import { AvatarComponent } from '../shared/avatar';
import { PhotoCaptureComponent } from '../shared/photo-capture';
import { ReceiptService } from '../shared/receipt';
import { ReceiptUploadComponent } from '../shared/receipt-upload';
import { TileChoiceComponent, TileOption } from '../shared/tile-choice';
import { SpinnerComponent } from '../shared/spinner';
import { PromoteCardComponent } from '../shared/promote-card';
import { QrCodeComponent } from '../shared/qr-code';

const STEP_KEYS = ['step_identity', 'step_documents', 'step_photo', 'step_payment', 'step_recap'];
const STEP_COUNT = STEP_KEYS.length;
/** Index de l'étape photo (selfie) — étape obligatoire qui bloque la suite du parcours. */
const PHOTO_STEP = STEP_KEYS.indexOf('step_photo');

interface WizardForm {
  prenom: string; nom: string; sexe: string; docType: string; cni: string; niu: string; cniExp: string; phone: string;
  naissance: string;                                   // date de naissance (yyyy-MM-dd from the date input)
  cniOcrNom: string | null; cniOcrPrenom: string | null; // surname/given name OCR read off the CNI
  email: string; quartier: string; ville: string;
  selfie: boolean; selfieData: string | null; selfieKey: string | null;
  cniRectoData: string | null; cniRectoKey: string | null;
  cniVersoData: string | null; cniVersoKey: string | null;
  saraReceiptData: string | null; saraReceiptKey: string | null; saraRef: string;
  pay: string; payPhone: string; delivery: string; pickupAgencyId: string; refPhone: string;
  cardType: 'bancaire' | 'prepaid';
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

/** Birth date sanity (yyyy-MM-dd from the date input): a real calendar date, in the past, year ≥ 1900. */
function isValidBirth(d: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const [yy, mm, dd] = d.split('-').map(Number);
  if (yy < 1900 || mm < 1 || mm > 12 || dd < 1 || dd > 31) return false;
  const dt = new Date(yy, mm - 1, dd);
  if (dt.getMonth() !== mm - 1 || dt.getDate() !== dd) return false;
  return dt < new Date();
}

@Component({
  selector: 'page-subscribe',
  standalone: true,
  imports: [
    AppBarComponent, IconComponent, FieldComponent, PhoneFieldComponent, CniFieldComponent,
    ExpiryFieldComponent, StepsComponent, StatusBadgeComponent, AvatarComponent,
    PhotoCaptureComponent, ReceiptUploadComponent, TileChoiceComponent, PromoteCardComponent, QrCodeComponent,
    SpinnerComponent,
  ],
  templateUrl: './subscribe.html',
})
export class SubscribeComponent implements OnInit, OnDestroy {
  i18n = inject(I18n);
  private api = inject(Api);
  private auth = inject(Auth);
  private geo = inject(Geo);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private receipt = inject(ReceiptService);

  /** Browser GPS fix captured when the wizard opens (best-effort) — stored with the subscription. */
  private geoFix: GeoFix | null = null;

  channel: 'agent' | 'self' = 'agent';
  get isSelf() { return this.channel === 'self'; }
  readonly STEP_COUNT = STEP_COUNT;
  readonly payById = payById;

  private configStore = inject(ConfigStore);
  private DEFAULT_CONFIG: CardConfig = { price: 10000, fees: 500, transport: 1000, rechargeMin: 500, rechargeMax: 1_000_000, rechargeInitiale: 2500, passPremium: 2000, rechargeInitialeBancaire: 2500, passPremiumBancaire: 2000 };
  get config(): CardConfig { return this.configStore.cfg() ?? this.DEFAULT_CONFIG; }

  /** Pickup branches (lieux de retrait) loaded from the server — shown when delivery == agence. */
  agencies = signal<Agency[]>([]);

  step = signal(0);
  /** Self (QR) flow opens on a welcome screen; the agent flow starts straight on the form. */
  started = signal(false);
  proc = signal<null | 'paying' | 'reference' | 'failed'>(null);
  phase = signal<'send' | 'wait'>('send');
  /** Auto-polling exhausted its window but the payment isn't terminal → prolonged-wait screen. */
  waitLong = signal(false);
  /** A manual "J'ai payé / Rafraîchir" status check is in flight. */
  refreshing = signal(false);
  touched = signal(false);
  refAgent = signal<Agent | null>(null);
  refUnknown = signal(false);
  result = signal<{ ref: string; payStatus?: string; amount?: number; message?: string | null;
                    fullName?: string; pay?: string; payPhone?: string | null; createdAt?: string } | null>(null);
  receiptBusy = signal(false);
  copied = signal(false);
  busy = signal(false);
  submitError = signal('');
  /** True when the backend runs the simulated MoMo gateway (demo validate/decline buttons). */
  simulated = signal(false);
  // SARA receipt: extraction in flight + the auto-extracted payer/amount shown alongside the reference.
  saraExtracting = signal(false);
  saraExtract = signal<{ payerPhone: string | null; amount: number | null } | null>(null);
  // True once the receipt's transaction number was auto-read from the upload (vs typed by hand).
  saraRefDetected = signal(false);
  // Non-blocking CNI OCR cross-check: i18n key of the warning to show when the typed data does not
  // match what OCR read on the card (null = no warning). Advisory only — never blocks the wizard.
  cniOcrWarning = signal<string | null>(null);

  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private polling = false;

  /** Progressive guidance shown on the CNI capture (i18n keys, rendered as a checklist). */
  readonly cniTips = ['cni_tip_flat', 'cni_tip_light', 'cni_tip_glare', 'cni_tip_frame'];
  /** SARA money: numbered steps to follow in the SARA app before uploading the receipt. */
  readonly saraSteps = ['sara_step1', 'sara_step2', 'sara_step3', 'sara_step4', 'sara_step5'];

  form: WizardForm = {
    prenom: '', nom: '', sexe: '', docType: 'cni', cni: '', niu: '', cniExp: '', phone: '',
    naissance: '', cniOcrNom: null, cniOcrPrenom: null,
    email: '', quartier: '', ville: '',
    selfie: false, selfieData: null, selfieKey: null,
    cniRectoData: null, cniRectoKey: null, cniVersoData: null, cniVersoKey: null,
    saraReceiptData: null, saraReceiptKey: null, saraRef: '',
    pay: 'om', payPhone: '', delivery: 'promote', pickupAgencyId: '', refPhone: '', cardType: 'prepaid',
  };

  ngOnInit() {
    this.channel = this.route.snapshot.data['channel'] === 'self' ? 'self' : 'agent';
    this.restore();                                   // bring back any in-progress entry
    // Agent flow starts on the form; the client (QR) flow opens on the welcome screen — unless a
    // draft is being resumed mid-way, in which case skip straight back to where they were.
    this.started.set(!this.isSelf || this.step() > 0);
    // Ensure store is fresh; components read `this.config` which returns the shared value.
    this.configStore.refresh();
    this.api.paymentProvider().subscribe({ next: (p) => this.simulated.set(p.provider === 'simulated'), error: () => {} });
    // Pickup branches for the "En agence" option (best-effort — empty list just hides the choice).
    this.api.getAgencies().subscribe({ next: (a) => this.agencies.set(a ?? []), error: () => {} });
    if (this.isSelf && this.form.refPhone) this.onRefPhone(this.form.refPhone);
    // Best-effort GPS — prompts for the permission once; stored with the subscription if granted.
    this.geo.current().then((fix) => (this.geoFix = fix));
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

  /** Save the whole form (text fields, upload keys AND the image previews) + step, so a reload
   *  restores the client's session exactly — photos included. If the payload exceeds the
   *  localStorage quota (large SARA PDF, several photos), we fall back to saving everything
   *  EXCEPT the heavy base64 previews (the uploads still live on the server, by their keys). */
  private persist() {
    const key = this.storageKey();
    try {
      localStorage.setItem(key, JSON.stringify({ form: this.form, step: this.step() }));
    } catch {
      try {
        const { selfieData, cniRectoData, cniVersoData, saraReceiptData, ...rest } = this.form;
        localStorage.setItem(key, JSON.stringify({ form: rest, step: this.step() }));
      } catch { /* storage unavailable — ignore */ }
    }
  }

  private restore() {
    try {
      const raw = localStorage.getItem(this.storageKey());
      if (!raw) return;
      const saved = JSON.parse(raw) as { form?: Partial<WizardForm>; step?: number };
      // Merge saved fields back in. Image previews are restored when present; if the quota
      // fallback dropped them, the keys still submit and the preview simply stays empty.
      if (saved.form) this.form = { ...this.form, ...saved.form };
      if (typeof saved.step === 'number') this.step.set(Math.min(this.lastStep, Math.max(0, saved.step)));
    } catch { /* corrupt draft — ignore */ }
  }

  private clearPersist() { try { localStorage.removeItem(this.storageKey()); } catch { /* ignore */ } }

  private onRefPhone(v: string) {
    // Resolve & show the referrer's NAME only on the client/QR path. In the commercial
    // (agent) flow the number is still captured & stored, but the name is never revealed.
    if (this.isSelf && isValidPhoneNumber(v)) {
      this.api.resolveAgent(v).subscribe((a) => { this.refAgent.set(a); this.refUnknown.set(!a); });
    } else {
      this.refAgent.set(null); this.refUnknown.set(false);
    }
  }

  // ---- derived ----
  get transport() { return this.form.delivery === 'home' ? (this.config.transport || 0) : 0; }
  readonly isBancaire = false;
  get rechargeInitiale() { return this.config.rechargeInitiale || 0; }
  get passPremium() { return this.config.passPremium || 0; }
  get total() { return this.rechargeInitiale + this.passPremium + this.transport; }
  get cardLabel() { return this.i18n.t('offer_card_label'); }
  get fullName() { return (this.form.prenom + ' ' + this.form.nom).trim(); }
  get pm() { return payById(this.form.pay); }

  get errs() {
    const f = this.form;
    const expDate = parseExp(f.cniExp);
    const phoneOk = isValidPhoneNumber(f.phone);
    const emailOk = /^\S+@\S+\.\S+$/.test(f.email);
    // CNI = alphanumérique ; passeport / récépissé = alphanumérique (lettres, chiffres, tiret).
    const docOk = f.docType === 'cni'
      ? /^[0-9A-Z]{6,}$/.test(f.cni.trim().toUpperCase())
      : /^[0-9A-Z-]{5,}$/.test(f.cni.trim().toUpperCase());
    return {
      prenom: !f.prenom.trim() ? this.i18n.t('required') : null,
      nom: !f.nom.trim() ? this.i18n.t('required') : null,
      sexe: !f.sexe ? this.i18n.t('required') : null,
      cni: !f.cni ? this.i18n.t('required') : !docOk ? this.i18n.t(f.docType === 'cni' ? 'cni_invalid' : 'doc_num_invalid') : null,
      cniExp: !f.cniExp ? this.i18n.t('required') : !expDate ? this.i18n.t('exp_invalid')
        : expDate < new Date() ? this.i18n.t('exp_expired') : null,
      // Birth date — part of the anti-duplicate identity (required for a CNI; N/A for passport/récépissé).
      naissance: f.docType !== 'cni' ? null
        : !f.naissance ? this.i18n.t('required')
        : !isValidBirth(f.naissance) ? this.i18n.t('birth_invalid') : null,
      phone: !f.phone ? this.i18n.t('required') : !phoneOk ? this.i18n.t('invalid_phone') : null,
      email: !f.email.trim() ? this.i18n.t('required') : !emailOk ? this.i18n.t('email_invalid') : null,
      quartier: !f.quartier.trim() ? this.i18n.t('required') : null,
      ville: !f.ville.trim() ? this.i18n.t('required') : null,
    };
  }
  e(key: 'prenom' | 'nom' | 'sexe' | 'cni' | 'cniExp' | 'naissance' | 'phone' | 'email' | 'quartier' | 'ville'): string | null {
    return this.touched() ? this.errs[key] : null;
  }

  get step0ok() {
    const x = this.errs;
    return !x.prenom && !x.nom && !x.sexe && !x.cni && !x.cniExp && !x.naissance
      && !x.phone && !x.email && !x.quartier && !x.ville;
  }
  // Document / photo steps are satisfied by a local capture OR a restored upload key (so a
  // page reload mid-wizard doesn't force the client to retake what was already uploaded).
  get docsOk() {
    const recto = !!this.form.cniRectoData || !!this.form.cniRectoKey;
    const verso = !!this.form.cniVersoData || !!this.form.cniVersoKey;
    // Le passeport n'a qu'une page d'identité → le verso est facultatif.
    return recto && (this.form.docType === 'passport' ? true : verso);
  }
  /** Libellés dépendant du type de pièce (CNI / passeport / récépissé). */
  get docLabel() { return this.i18n.t('doc_' + this.form.docType); }
  get docNumLabel() { return this.i18n.t('doc_num_' + this.form.docType); }
  get needsVerso() { return this.form.docType !== 'passport'; }
  get selfieOk() { return !!this.form.selfieData || !!this.form.selfieKey; }
  /** Mobile Money methods that need a payment number + USSD push. */
  get isMomo() { return this.form.pay === 'om' || this.form.pay === 'mtn'; }
  /** Valid = a real number for the chosen country; for Cameroon it must also match the operator (MTN/Orange). */
  get payPhoneOk() {
    const v = this.form.payPhone;
    if (!isValidPhoneNumber(v)) return false;
    const p = parsePhoneNumberFromString(v);
    return p?.country === 'CM' ? matchesOperator(this.form.pay, p.nationalNumber as string) : true;
  }
  /** Error to show under the payment number: invalid number, or (Cameroon only) wrong operator. */
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
  /** Show the payment-number error once the field is "complete enough" or the step was touched. */
  get payPhoneErrorShown(): string | null {
    return this.touched() || this.form.payPhone.length >= 9 ? this.payPhoneError : null;
  }
  /** Payment step: a method is chosen + a pickup branch when "En agence"; MoMo needs a valid
   *  payment number, SARA needs a receipt. */
  get payStepOk() {
    if (!this.form.pay) return false;
    if (!this.deliveryOk) return false;
    if (this.isMomo) return this.payPhoneOk;
    // SARA: receipt uploaded AND its reference confirmed (the primary field — may need correction).
    if (this.form.pay === 'sara') return !!this.form.saraReceiptKey && !!this.form.saraRef.trim();
    return true;
  }
  get stepValid() {
    return [this.step0ok, this.docsOk, this.selfieOk, this.payStepOk, true][this.step()];
  }
  /** All steps satisfied — required before the final confirmation can fire. */
  get formComplete() { return this.step0ok && this.docsOk && this.selfieOk && this.payStepOk; }
  /** First step still missing something (used to route the client there on confirm). */
  private firstInvalidStep() {
    if (!this.step0ok) return 0;
    if (!this.docsOk) return 1;
    if (!this.selfieOk) return 2;
    if (!this.payStepOk) return 3;
    return this.lastStep;
  }
  /** Highest step the client may navigate to: can't jump past the first incomplete step, so the
   *  recap/payment is unreachable until every prior step is valid. Drives the step-bar lock. */
  get maxReachableStep() { return this.firstInvalidStep(); }
  get lastStep() { return STEP_COUNT - 1; }
  stepKey(i: number) { return STEP_KEYS[i]; }
  /** Localised step names for the clickable progress bar. */
  get stepLabels() { return STEP_KEYS.map((k) => this.i18n.t(k)); }

  /** Step-bar navigation. Backward is always free. Forward may NOT skip past an incomplete step:
   *  the target is capped at the first step still missing/invalid, so the client can never reach
   *  the recap / payment with incorrect data. The landed step surfaces what's left (touched). */
  goToStep(i: number) {
    if (i === this.step()) return;
    const goingForward = i > this.step();
    // firstInvalidStep() is the furthest reachable step (== lastStep only when everything is valid).
    const target = goingForward ? Math.min(i, this.firstInvalidStep()) : i;
    this.touched.set(goingForward);
    this.step.set(Math.min(this.lastStep, Math.max(0, target)));
    if (this.step() === 3 && this.isMomo && !this.form.payPhone) this.form.payPhone = this.form.phone;
    this.persist();
  }

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

  /** Retrait / livraison tiles: "Promote" (par défaut) + "En agence" (si des agences existent). */
  get deliveryTiles(): TileOption[] {
    const tiles: TileOption[] = [
      { id: 'promote', icon: '★', bg: 'var(--primary)', color: '#fff',
        title: this.i18n.t('del_promote_title'), desc: this.i18n.t('del_promote_desc') },
    ];
    if (this.agencies().length) {
      tiles.push({ id: 'agence', icon: '▣', bg: 'var(--af-gold)', color: '#1a1a1a',
        title: this.i18n.t('del_agence_title'), desc: this.i18n.t('del_agence_desc') });
    }
    return tiles;
  }

  /** Picking a delivery mode; switching away from "agence" clears the chosen branch. */
  setDelivery(mode: string) {
    this.form.delivery = mode;
    if (mode !== 'agence') this.form.pickupAgencyId = '';
    this.persist();
  }
  onPickupAgency(e: Event) { this.set('pickupAgencyId', (e.target as HTMLSelectElement).value); }

  /** Resolved name of the chosen pickup branch (for the recap). */
  get pickupAgencyName(): string {
    return this.agencies().find((a) => a.id === this.form.pickupAgencyId)?.name ?? '';
  }
  /** Delivery step is valid: a branch must be chosen when "En agence" is selected. */
  get deliveryOk() { return this.form.delivery !== 'agence' || !!this.pickupAgencyName; }

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
  // Staff (agent OR cashier) return to their own dashboard; the public/QR client returns to /qr.
  exit() { this.router.navigateByUrl(this.isSelf ? '/qr' : this.auth.landingPath()); }
  home() { this.router.navigateByUrl(this.isSelf ? '/qr' : this.auth.landingPath()); }

  /** Client photo captured (front or rear camera): keep preview + upload. */
  onSelfie(dataUrl: string) {
    this.form.selfieData = dataUrl; this.form.selfieKey = null;
    this.api.uploadImage(dataUrl, 'selfie').subscribe({ next: (r) => { this.form.selfieKey = r.key; this.persist(); }, error: () => {} });
  }
  onRetakeSelfie() { this.form.selfieData = null; this.form.selfieKey = null; this.persist(); }

  onCniRecto(dataUrl: string) {
    this.form.cniRectoData = dataUrl; this.form.cniRectoKey = null;
    this.api.uploadImage(dataUrl, 'cni-recto').subscribe({ next: (r) => { this.form.cniRectoKey = r.key; this.persist(); }, error: () => {} });
    this.crossCheckCni(dataUrl);
  }
  onRetakeRecto() { this.form.cniRectoData = null; this.form.cniRectoKey = null; this.cniOcrWarning.set(null); this.persist(); }

  /** OCR the captured CNI front and warn (without blocking) if the typed name/number disagree.
   *  Best-effort: any error, OCR disabled, or unreadable card → no warning shown. */
  private crossCheckCni(dataUrl: string) {
    this.cniOcrWarning.set(null);
    this.api.cniOcr(dataUrl, { prenom: this.form.prenom, nom: this.form.nom, cni: this.form.cni }).subscribe({
      next: (r) => {
        if (!r.available) return;
        // Persist what OCR read off the card so the anti-duplicate identity check can compare BOTH
        // the typed name and the CNI-read name server-side.
        this.form.cniOcrNom = r.extractedNom; this.form.cniOcrPrenom = r.extractedPrenom; this.persist();
        if (r.numberMatch === false) this.cniOcrWarning.set('cni_ocr_number_mismatch');
        else if (r.nameMatch === false) this.cniOcrWarning.set('cni_ocr_name_mismatch');
      },
      error: () => {},
    });
  }

  onCniVerso(dataUrl: string) {
    this.form.cniVersoData = dataUrl; this.form.cniVersoKey = null;
    this.api.uploadImage(dataUrl, 'cni-verso').subscribe({ next: (r) => { this.form.cniVersoKey = r.key; this.persist(); }, error: () => {} });
  }
  onRetakeVerso() { this.form.cniVersoData = null; this.form.cniVersoKey = null; this.persist(); }

  /** SARA money receipt picked (image or PDF): keep preview + upload, store its key. */
  onSaraReceipt(dataUrl: string) {
    this.form.saraReceiptData = dataUrl; this.form.saraReceiptKey = null;
    this.saraExtract.set(null); this.saraRefDetected.set(false); this.saraExtracting.set(true);
    // Upload + auto-extract: the receipt reference is the primary field; the client confirms/corrects it.
    this.api.uploadReceipt(dataUrl).subscribe({
      next: (r) => {
        this.form.saraReceiptKey = r.key;
        this.form.saraRef = r.reference ?? '';
        this.saraRefDetected.set(!!(r.reference && r.reference.trim()));
        this.saraExtract.set({ payerPhone: r.payerPhone, amount: r.amount });
        this.saraExtracting.set(false);
        this.persist();
      },
      error: () => { this.saraExtracting.set(false); },
    });
  }

  private payload() {
    return {
      prenom: this.form.prenom.trim(), nom: this.form.nom.trim(), sexe: this.form.sexe,
      docType: this.form.docType,
      cni: this.form.cni, niu: this.form.niu.trim() || undefined, cniExp: fmtExp(this.form.cniExp), phone: this.form.phone,
      naissance: this.form.naissance || undefined,
      cniOcrNom: this.form.cniOcrNom || undefined, cniOcrPrenom: this.form.cniOcrPrenom || undefined,
      email: this.form.email.trim(), quartier: this.form.quartier.trim(), ville: this.form.ville.trim(),
      pay: this.form.pay, payPhone: this.isMomo ? this.form.payPhone : undefined, delivery: this.form.delivery,
      pickupAgencyId: this.form.delivery === 'agence' ? (this.form.pickupAgencyId || undefined) : undefined,
      cardType: this.form.cardType,
      selfie: !!this.form.selfieData, selfieKey: this.form.selfieKey,
      cniRectoKey: this.form.cniRectoKey, cniVersoKey: this.form.cniVersoKey,
      saraReceiptKey: this.form.saraReceiptKey,
      saraRef: this.form.pay === 'sara' ? (this.form.saraRef.trim() || undefined) : undefined,
      referrerPhone: this.form.refPhone || undefined,
      latitude: this.geoFix?.lat, longitude: this.geoFix?.lng, geoAccuracy: this.geoFix?.accuracy,
    };
  }

  confirm() {
    if (this.busy()) return;
    // Free navigation lets the client reach the recap with gaps — route them to the first
    // incomplete step instead of submitting an invalid file.
    if (!this.formComplete) { this.touched.set(true); this.step.set(this.firstInvalidStep()); return; }
    this.busy.set(true);
    this.submitError.set('');
    const obs = this.isSelf ? this.api.createSelf(this.payload()) : this.api.createAssisted(this.payload());
    obs.subscribe({
      next: (s: Subscription) => {
        this.busy.set(false);
        this.submitError.set('');
        this.clearPersist();   // record created server-side — drop the local draft
        this.result.set({ ref: s.ref, payStatus: s.payStatus, amount: s.amount, message: s.paymentMessage,
          fullName: s.fullName, pay: s.pay, payPhone: s.payPhone, createdAt: s.createdAt });
        // cash and SARA money are settled off-platform → straight to the reference screen, no polling.
        if (this.form.pay === 'cash' || this.form.pay === 'sara') { this.proc.set('reference'); }
        else if (s.payStatus === 'paid') { this.proc.set('reference'); }
        else if (s.payStatus === 'failed') { this.proc.set('failed'); } // gateway rejected the push
        else {
          this.proc.set('paying');
          this.runMomo();
          // The customer confirms on their phone; the result arrives via the aggregator
          // (webhook + get-status) — poll the backend until it resolves.
          this.startStatusPolling(s.ref);
        }
      },
      error: (err) => {
        this.busy.set(false);
        // A 401 is handled globally (the interceptor ends the session and routes to login). A 403
        // means the account lacks the AGENT/CASHIER role — surface that instead of blaming the form.
        if (err?.status === 403) { this.submitError.set('forbidden_role'); return; }
        const code = err?.error?.error as string | undefined;
        const known = ['cni_exists', 'cni_invalid', 'validation_error', 'server_error'];
        this.submitError.set(known.includes(code ?? '') ? code! : 'submit_failed');
      },
    });
  }

  private runMomo() {
    this.phase.set('send');
    setTimeout(() => this.phase.set('wait'), 1300);
  }

  /** ~7-minute polling window with back-off. Mobile Money confirmations can legitimately take
   *  over 2 minutes, so a short window produced false "failed" on real payments. */
  private readonly pollMax = 56;
  private pollDelay(n: number) { return n < 10 ? 3000 : n < 24 ? 5000 : 10000; }

  /** Poll the live payment status (back-off) until terminal; on window exhaustion show a
   *  prolonged-wait screen (never a false failure) the client can refresh manually. */
  private startStatusPolling(ref: string) {
    this.stopPolling();
    this.polling = true;
    this.waitLong.set(false);
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
            // Keep the decline reason (e.g. "Solde insuffisant") so the failure screen can explain it.
            this.result.set({ ...(this.result() ?? { ref }), payStatus: 'failed', message: s.message ?? this.result()?.message });
            this.proc.set('failed');
          } else if (++attempts >= this.pollMax) {
            // Don't declare failure — the confirmation may still arrive (late webhook). Switch to a
            // prolonged-wait state the client can refresh, instead of a misleading "échec".
            this.polling = false;
            this.waitLong.set(true);
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

  /** Manual "J'ai payé / Rafraîchir" during a prolonged wait — a single status check. */
  manualRefresh() {
    const ref = this.result()?.ref;
    if (!ref || this.refreshing()) return;
    this.refreshing.set(true);
    this.api.paymentStatus(ref).subscribe({
      next: (s) => {
        this.refreshing.set(false);
        if (s.payStatus === 'paid') {
          this.result.set({ ...(this.result() ?? { ref }), payStatus: 'paid' });
          this.proc.set('reference');
        } else if (s.payStatus === 'failed') {
          this.result.set({ ...(this.result() ?? { ref }), payStatus: 'failed', message: s.message ?? this.result()?.message });
          this.proc.set('failed');
        }
        // else: still pending → stay on the prolonged-wait screen
      },
      error: () => this.refreshing.set(false),
    });
  }
  /** Resume auto-polling from the prolonged-wait screen. */
  resumePolling() {
    const ref = this.result()?.ref;
    if (ref) this.startStatusPolling(ref);
  }

  /** Simulated gateway only — the real aggregator settles via webhook / get-status polling. */
  simulatePay(outcome: 'validate' | 'fail') {
    const ref = this.result()?.ref;
    if (!ref || this.busy()) return;
    this.busy.set(true);
    this.api.simulateSubscriptionPay(ref, outcome, outcome === 'fail' ? 'Refusé par le client' : undefined).subscribe({
      next: (s) => {
        this.stopPolling();
        this.busy.set(false);
        this.waitLong.set(false);
        const base = this.result() ?? { ref: s.ref };
        if (outcome === 'validate') {
          this.result.set({ ...base, payStatus: 'paid' });
          this.proc.set('reference');
        } else {
          this.result.set({ ...base, payStatus: 'failed', message: s.paymentMessage ?? 'Refusé par le client' });
          this.proc.set('failed');
        }
      },
      error: () => this.busy.set(false),
    });
  }

  private stopPolling() {
    this.polling = false;
    if (this.pollTimer) { clearTimeout(this.pollTimer); this.pollTimer = null; }
  }
  retry() { this.stopPolling(); this.waitLong.set(false); this.proc.set(null); }

  reset() {
    this.stopPolling();
    this.clearPersist();
    this.form = {
      prenom: '', nom: '', sexe: '', docType: 'cni', cni: '', niu: '', cniExp: '', phone: '', email: '', quartier: '', ville: '',
      naissance: '', cniOcrNom: null, cniOcrPrenom: null,
      selfie: false, selfieData: null, selfieKey: null,
      cniRectoData: null, cniRectoKey: null, cniVersoData: null, cniVersoKey: null,
      saraReceiptData: null, saraReceiptKey: null, saraRef: '',
      pay: 'om', payPhone: '', delivery: 'promote', pickupAgencyId: '', refPhone: '', cardType: 'prepaid',
    };
    this.touched.set(false); this.result.set(null); this.proc.set(null); this.step.set(0);
    this.waitLong.set(false); this.refreshing.set(false);
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

  /** Generate and download a PNG receipt: payment info + reference + QR to show at the print point. */
  async downloadReceipt() {
    const r = this.result();
    if (!r || this.receiptBusy()) return;
    this.receiptBusy.set(true);
    try {
      await this.receipt.download({
        ref: r.ref, fullName: r.fullName, pay: r.pay, payPhone: r.payPhone,
        payStatus: r.payStatus, amount: r.amount, createdAt: r.createdAt,
      });
    } finally {
      this.receiptBusy.set(false);
    }
  }

  // waiting description split helpers
  waitBefore() { return this.i18n.t('waiting_desc', { op: this.pm.name }).split('{n}')[0]; }
  waitAfter() { return this.i18n.t('waiting_desc', { op: this.pm.name }).split('{n}')[1] ?? ''; }

  /** Display an E.164 number in pretty international form (the value already carries its country code). */
  fmtPhone(v: string) { return formatPhone(v); }

  /** True when the decline reason indicates the Mobile Money account lacked funds → show a clear, dedicated notice. */
  get insufficientBalance() {
    const m = (this.result()?.message || '').toLowerCase();
    return /insuffisan|insufficient|\bsolde\b|provision|\bfonds?\b|\bfunds?\b|not enough/.test(m);
  }
  /** True when the transaction expired (the client never entered their PIN in time). */
  get expired() {
    const m = (this.result()?.message || '').toLowerCase();
    return !this.insufficientBalance && /expir|timeout|time out|délai|delai/.test(m);
  }
  /** Amount the client tried to pay (for the failure message). */
  get failAmount() { return this.result()?.amount ?? this.total; }
}
