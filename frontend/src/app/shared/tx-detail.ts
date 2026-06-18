import { Component, EventEmitter, Input, OnDestroy, OnInit, Output, inject, signal } from '@angular/core';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { I18n } from '../core/i18n';
import { Api } from '../core/api';
import { Subscription } from '../core/models';
import { payById, formatPan } from './constants';
import { IconComponent } from './icon';
import { SpinnerComponent } from './spinner';
import { ImagePreview } from './image-preview';
import { ReceiptService } from './receipt';
import { PhotoCaptureComponent } from './photo-capture';

/**
 * Full detail of a subscription — every field the client filled in, plus the
 * captured photos (client + CNI recto/verso). Shared by the admin "all sales"
 * table and the agent "my sales" table. Images are loaded lazily while the
 * panel is mounted and revoked on destroy.
 */
@Component({
  selector: 'tx-detail',
  standalone: true,
  imports: [IconComponent, SpinnerComponent, PhotoCaptureComponent],
  template: `
    <div class="card" style="margin:2px 2px 8px;padding:13px 14px;background:var(--surface-2)">
      <!-- Retake panel (selfie ou CNI) -->
      @if (retakingKind()) {
        <div style="margin-bottom:12px">
          <photo-capture [facing]="retakingKind() === 'selfie' ? 'user' : 'environment'"
            [round]="retakingKind() === 'selfie'" [allowFlip]="retakingKind() === 'selfie'"
            [boxW]="retakingKind() === 'selfie' ? 200 : 280" [boxH]="retakingKind() === 'selfie' ? 200 : 160"
            (captured)="doRetake(retakingKind()!, $event)" (retake)="retakingKind.set(null)"></photo-capture>
          @if (retakeBusy()) { <div class="muted" style="font-size:12px;margin-top:6px;text-align:center">{{ i18n.t('pp_photo_saving') }}</div> }
          @else { <button class="btn btn-ghost" (click)="retakingKind.set(null)" style="margin-top:6px;font-size:13px">{{ i18n.t('cancel') }}</button> }
        </div>
      }

      <!-- Photos: client + CNI recto/verso (présence + aperçu + reprise) -->
      <div style="display:flex;gap:10px;margin-bottom:8px">
        <div style="flex:1;text-align:center">
          @if (selfie()) {
            <img [src]="selfie()" alt="photo client" (click)="preview.open(selfie())" style="width:100%;height:80px;object-fit:cover;border-radius:8px;border:1px solid var(--border);cursor:zoom-in" />
          } @else if (t.hasSelfie) {
            <div style="width:100%;height:80px;border-radius:8px;border:1px solid var(--border);display:flex;align-items:center;justify-content:center"><spinner tone="muted" [size]="20"></spinner></div>
          } @else {
            <div style="width:100%;height:80px;border-radius:8px;border:1px dashed var(--border);display:flex;align-items:center;justify-content:center;color:var(--muted)"><ic name="user" [size]="22"></ic></div>
          }
          <div class="muted" style="font-size:10px;margin-top:3px">{{ i18n.t('tx_photo_client') }} · <b [style.color]="t.hasSelfie ? 'var(--success)' : 'var(--accent)'">{{ i18n.t(t.hasSelfie ? 'tx_present' : 'tx_absent') }}</b></div>
          <button class="btn btn-ghost" (click)="retakingKind.set('selfie')" [disabled]="retakingKind() !== null" style="padding:2px 7px;font-size:10px;margin-top:2px" [title]="i18n.t('pp_retake_photo')"><ic name="camera" [size]="11"></ic></button>
        </div>
        <div style="flex:1;text-align:center">
          @if (recto()) {
            <img [src]="recto()" alt="CNI recto" (click)="preview.open(recto())" style="width:100%;height:80px;object-fit:cover;border-radius:8px;border:1px solid var(--border);cursor:zoom-in" />
          } @else if (t.hasCniRecto) {
            <div style="width:100%;height:80px;border-radius:8px;border:1px solid var(--border);display:flex;align-items:center;justify-content:center"><spinner tone="muted" [size]="20"></spinner></div>
          } @else {
            <div style="width:100%;height:80px;border-radius:8px;border:1px dashed var(--border);display:flex;align-items:center;justify-content:center;color:var(--muted)"><ic name="idcard" [size]="22"></ic></div>
          }
          <div class="muted" style="font-size:10px;margin-top:3px">{{ i18n.t('pp_cni_recto') }} · <b [style.color]="t.hasCniRecto ? 'var(--success)' : 'var(--accent)'">{{ i18n.t(t.hasCniRecto ? 'tx_present' : 'tx_absent') }}</b></div>
          <button class="btn btn-ghost" (click)="retakingKind.set('cni-recto')" [disabled]="retakingKind() !== null" style="padding:2px 7px;font-size:10px;margin-top:2px" [title]="i18n.t('pp_retake_recto')"><ic name="camera" [size]="11"></ic></button>
        </div>
        <div style="flex:1;text-align:center">
          @if (verso()) {
            <img [src]="verso()" alt="CNI verso" (click)="preview.open(verso())" style="width:100%;height:80px;object-fit:cover;border-radius:8px;border:1px solid var(--border);cursor:zoom-in" />
          } @else if (t.hasCniVerso) {
            <div style="width:100%;height:80px;border-radius:8px;border:1px solid var(--border);display:flex;align-items:center;justify-content:center"><spinner tone="muted" [size]="20"></spinner></div>
          } @else {
            <div style="width:100%;height:80px;border-radius:8px;border:1px dashed var(--border);display:flex;align-items:center;justify-content:center;color:var(--muted)"><ic name="idcard" [size]="22"></ic></div>
          }
          <div class="muted" style="font-size:10px;margin-top:3px">{{ i18n.t('pp_cni_verso') }} · <b [style.color]="t.hasCniVerso ? 'var(--success)' : 'var(--accent)'">{{ i18n.t(t.hasCniVerso ? 'tx_present' : 'tx_absent') }}</b></div>
          <button class="btn btn-ghost" (click)="retakingKind.set('cni-verso')" [disabled]="retakingKind() !== null" style="padding:2px 7px;font-size:10px;margin-top:2px" [title]="i18n.t('pp_retake_verso')"><ic name="camera" [size]="11"></ic></button>
        </div>
      </div>

      <div style="font-size:13px">
        <div class="srow" style="padding:8px 0"><span class="lbl">{{ i18n.t('tx_datetime') }}</span><span class="val">{{ fmtDateTime(t.createdAt) }}</span></div>
        <div class="srow" style="padding:8px 0"><span class="lbl">{{ i18n.t('ref') }}</span><span class="val">{{ t.ref }}</span></div>
        <div class="srow" style="padding:8px 0"><span class="lbl">{{ i18n.t('nom') }} / {{ i18n.t('prenom') }}</span><span class="val">{{ t.fullName }}</span></div>
        <div class="srow" style="padding:8px 0"><span class="lbl">{{ i18n.t('sexe') }}</span><span class="val">{{ sexeLabel(t.sexe) }}</span></div>
        <div class="srow" style="padding:8px 0"><span class="lbl">{{ i18n.t('cni_short') }}</span><span class="val">{{ t.cni }}@if (t.cniExp) { <span class="muted" style="font-weight:600"> · {{ i18n.t('validity') }} {{ t.cniExp }}</span> }</span></div>
        <div class="srow" style="padding:8px 0"><span class="lbl">{{ i18n.t('niu_short') }}</span><span class="val">@if (t.niu) { {{ t.niu }} } @else { <span class="muted">{{ i18n.t('niu_none') }}</span> }</span></div>
        <div class="srow" style="padding:8px 0"><span class="lbl">{{ i18n.t('tx_contact_phone') }}</span><span class="val">{{ t.phone || '—' }}</span></div>
        @if (t.email) { <div class="srow" style="padding:8px 0"><span class="lbl">{{ i18n.t('email_label') }}</span><span class="val">{{ t.email }}</span></div> }
        @if (t.quartier || t.ville || t.region) { <div class="srow" style="padding:8px 0"><span class="lbl">{{ i18n.t('quartier') }} / {{ i18n.t('ville_label') }} / {{ i18n.t('region_label') }}</span><span class="val">{{ t.quartier }}{{ t.quartier && (t.ville || t.region) ? ' · ' : '' }}{{ t.ville }}{{ t.ville && t.region ? ' · ' : '' }}{{ t.region }}</span></div> }
        <div class="srow" style="padding:8px 0"><span class="lbl">{{ i18n.t('pay_method_label') }}</span><span class="val">{{ t.pay === 'cash' ? i18n.t('pay_cash_name') : payName(t.pay) }}</span></div>
        <div class="srow" style="padding:8px 0"><span class="lbl">{{ i18n.t('tx_pay_phone') }}</span><span class="val">{{ t.payPhone || '—' }}</span></div>
        @if (t.payStatus === 'failed') {
          <div class="srow" style="padding:8px 0"><span class="lbl">{{ i18n.t('tx_fail_cause') }}</span><span class="val" style="color:var(--accent)">{{ failLabel(t.failureCategory) }}@if (t.paymentMessage) { · {{ t.paymentMessage }} }</span></div>
        }
        <div class="srow" style="padding:8px 0"><span class="lbl">{{ i18n.t('referred_by') }}</span><span class="val">{{ t.referrerName || t.referrerPhone || '—' }}</span></div>
        <div class="srow" style="padding:8px 0"><span class="lbl">{{ i18n.t('tx_referrer_phone') }}</span><span class="val">{{ t.referrerPhone || '—' }}</span></div>
        <div class="srow" style="padding:8px 0"><span class="lbl">{{ i18n.t('delivery_label') }}</span><span class="val">{{ t.delivery === 'agence' && t.pickupAgencyName ? t.pickupAgencyName : i18n.t('del_' + t.delivery + '_title') }}</span></div>
        <div class="srow" style="padding:8px 0"><span class="lbl">{{ i18n.t('tx_channel') }}</span><span class="val">{{ t.channel === 'self' ? i18n.t('online_channel') : (sellerName ? (i18n.t('tx_agent') + ' · ' + sellerName) : i18n.t('tx_agent')) }}</span></div>
        @if (t.cardNumber) { <div class="srow" style="padding:8px 0"><span class="lbl">{{ i18n.t('pp_card_number') }}</span><span class="val">{{ t.cardNumber }}</span></div> }
        @if (t.pan) { <div class="srow" style="padding:8px 0"><span class="lbl">{{ i18n.t('pp_pan') }}</span><span class="val">{{ fmtPan(t.pan) }}</span></div> }
        @if (t.cashCollectedBy) { <div class="srow" style="padding:8px 0"><span class="lbl">{{ i18n.t('cash_collected_by') }}</span><span class="val">{{ t.cashCollectedBy }}</span></div> }
        @if (t.cashPaymentReference) { <div class="srow" style="padding:8px 0"><span class="lbl">{{ i18n.t('cash_payment_reference') }}</span><span class="val">{{ t.cashPaymentReference }}</span></div> }
        <div class="srow total" style="padding:8px 0"><span class="lbl">{{ i18n.t('amount_paid') }}</span><span class="val">{{ i18n.money(t.amount) }}</span></div>
      </div>

      <button class="btn btn-outline" (click)="downloadReceipt()" [disabled]="receiptBusy()" style="margin-top:10px;padding:9px;font-size:13px">
        @if (receiptBusy()) { <spinner tone="primary"></spinner> } @else { <ic name="download" [size]="15"></ic> {{ i18n.t('receipt_download') }} }
      </button>
      @if (showPrint) {
        <button class="btn btn-outline" (click)="openPrint.emit(t.ref)" style="margin-top:8px;padding:9px;font-size:13px"><ic name="printer" [size]="15"></ic> {{ i18n.t('tx_open_print') }}</button>
      }
    </div>`,
})
export class TxDetailComponent implements OnInit, OnDestroy {
  i18n = inject(I18n);
  preview = inject(ImagePreview);
  private api = inject(Api);
  private sanitizer = inject(DomSanitizer);
  private receipt = inject(ReceiptService);
  receiptBusy = signal(false);
  retakingKind = signal<string | null>(null);
  retakeBusy = signal(false);

  @Input() t!: Subscription;
  /** Resolved seller name (admin view); leave null when irrelevant (agent's own sales). */
  @Input() sellerName: string | null = null;
  /** Whether to show the "open at print point" button. */
  @Input() showPrint = true;
  @Output() openPrint = new EventEmitter<string>();

  selfie = signal<SafeUrl | null>(null);
  recto = signal<SafeUrl | null>(null);
  verso = signal<SafeUrl | null>(null);
  private urls: string[] = [];

  doRetake(kind: string, dataUrl: string) {
    this.retakeBusy.set(true);
    this.api.uploadImage(dataUrl, kind).subscribe({
      next: (u) => this.api.updatePhoto(this.t.ref, kind, u.key).subscribe({
        next: () => {
          this.retakingKind.set(null); this.retakeBusy.set(false);
          if (kind === 'selfie') { this.t.hasSelfie = true; this.selfie.set(null); this.load('selfie', this.selfie); }
          if (kind === 'cni-recto') { this.t.hasCniRecto = true; this.recto.set(null); this.load('cni-recto', this.recto); }
          if (kind === 'cni-verso') { this.t.hasCniVerso = true; this.verso.set(null); this.load('cni-verso', this.verso); }
        },
        error: () => this.retakeBusy.set(false),
      }),
      error: () => this.retakeBusy.set(false),
    });
  }

  ngOnInit() {
    if (this.t.hasSelfie) this.load('selfie', this.selfie);
    if (this.t.hasCniRecto) this.load('cni-recto', this.recto);
    if (this.t.hasCniVerso) this.load('cni-verso', this.verso);
  }
  ngOnDestroy() {
    this.urls.forEach((u) => URL.revokeObjectURL(u));
    this.urls = [];
  }

  private load(kind: string, target: { set: (v: SafeUrl | null) => void }) {
    this.api.imageBlob(this.t.ref, kind).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        this.urls.push(url);
        target.set(this.sanitizer.bypassSecurityTrustUrl(url));
      },
      error: () => target.set(null),
    });
  }

  fmtDateTime(iso: string) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString(this.i18n.lang() === 'en' ? 'en-GB' : 'fr-FR', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  }
  sexeLabel(s: string) { return s === 'M' ? this.i18n.t('sexe_m') : s === 'F' ? this.i18n.t('sexe_f') : (s || '—'); }
  payName(pay: string) { return payById(pay).name; }
  fmtPan(v: string) { return formatPan(v); }
  /** Localised label for a failure category code (falls back to a generic label). */
  failLabel(cat?: string | null) {
    if (!cat) return this.i18n.t('fail_cat_UNKNOWN');
    const key = 'fail_cat_' + cat;
    const t = this.i18n.t(key);
    return t === key ? cat : t;
  }

  /** Download a PNG receipt for this record (re-printable from any list). */
  async downloadReceipt() {
    if (this.receiptBusy()) return;
    this.receiptBusy.set(true);
    try {
      await this.receipt.download({
        ref: this.t.ref, fullName: this.t.fullName, pay: this.t.pay, payPhone: this.t.payPhone,
        payStatus: this.t.payStatus, amount: this.t.amount, createdAt: this.t.createdAt,
      });
    } finally {
      this.receiptBusy.set(false);
    }
  }
}
