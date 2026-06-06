import { Component, OnInit, inject, signal } from '@angular/core';
import { DomSanitizer, SafeResourceUrl, SafeUrl } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';
import { I18n } from '../core/i18n';
import { Api } from '../core/api';
import { Auth } from '../core/auth';
import { Subscription } from '../core/models';
import { payById, recordStatus } from '../shared/constants';
import { AppBarComponent } from '../shared/app-bar';
import { IconComponent } from '../shared/icon';
import { FieldComponent } from '../shared/fields';
import { PhotoCaptureComponent } from '../shared/photo-capture';
import { StatusBadgeComponent } from '../shared/status-badge';

/** Print point — retrieve a KYC file by reference, then print & hand over the card. */
@Component({
  selector: 'page-print-point',
  standalone: true,
  imports: [AppBarComponent, IconComponent, FieldComponent, PhotoCaptureComponent, StatusBadgeComponent],
  template: `
  <div class="scr">
    <app-bar>
      <button appbar-left class="back-link" (click)="exit()" style="margin-right:2px"><ic name="chevL" [size]="20"></ic></button>
      <span appbar-right class="badge" style="background:var(--surface-2);color:var(--muted)"><ic name="printer" [size]="13"></ic> {{ i18n.t('pp_title') }}</span>
    </app-bar>
    <div class="scr-body">
      <div>
        <div class="kicker"><ic name="printer" [size]="13" style="vertical-align:-2px;margin-right:4px"></ic>{{ i18n.t('card_name') }}</div>
        <h1 style="font-size:23px;margin-top:6px">{{ i18n.t('pp_title') }}</h1>
        <p class="muted" style="font-size:13px;margin-top:5px">{{ i18n.t('pp_sub') }}</p>
      </div>

      <field [label]="i18n.t('pp_input')">
        <div style="display:flex;gap:8px">
          <div class="input-prefix" style="flex:1">
            <span class="pfx"><ic name="search" [size]="16"></ic></span>
            <input [placeholder]="i18n.t('pp_search_ph')" [value]="ref()" style="letter-spacing:.02em;font-weight:600"
                   (input)="onRef($event)" (keydown.enter)="doSearch()" />
          </div>
          <button class="btn btn-primary" (click)="doSearch()" style="width:auto;padding:0 16px"><ic name="search" [size]="18"></ic></button>
        </div>
      </field>

      @if (!rec() && results().length) {
        <div class="card" style="overflow:hidden">
          <div class="muted" style="padding:10px 14px;border-bottom:1px solid var(--border);font-size:11.5px">{{ results().length }} {{ i18n.t('pp_results') }}</div>
          @for (s of results(); track s.ref) {
            <button (click)="open(s.ref)" style="width:100%;text-align:left;display:flex;align-items:center;gap:10px;padding:12px 14px;border:none;border-bottom:1px solid var(--border);background:transparent;cursor:pointer">
              <div style="min-width:0;flex:1">
                <div style="font-size:14px;font-weight:700">{{ s.fullName }}</div>
                <div class="muted" style="font-size:11.5px">{{ s.ref }} · {{ s.phone }}</div>
              </div>
              <status-badge [status]="status(s)"></status-badge>
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

      @if (searched() && !rec() && !loading() && !results().length) {
        <div class="card" style="padding:18px;display:flex;flex-direction:column;align-items:center;gap:10px;text-align:center">
          <span style="width:48px;height:48px;border-radius:50%;background:var(--accent-soft);color:var(--accent);display:flex;align-items:center;justify-content:center"><ic name="alert" [size]="24"></ic></span>
          <p style="font-size:13.5px;font-weight:700">{{ i18n.t('pp_notfound') }}</p>
          <button class="btn btn-ghost" (click)="again()" style="width:auto;padding:9px 14px;font-size:13px">{{ i18n.t('pp_again') }}</button>
        </div>
      }

      @if (rec(); as r) {
        @if (r.printed) {
          <div class="card" style="padding:20px;display:flex;flex-direction:column;align-items:center;gap:12px;text-align:center">
            <span style="width:64px;height:64px;border-radius:50%;background:var(--success);color:#fff;display:flex;align-items:center;justify-content:center;animation:pop .45s cubic-bezier(.2,.8,.3,1.2)"><ic name="check" [size]="32" [sw]="2.5"></ic></span>
            <h2 style="font-size:18px">{{ i18n.t('pp_printed_ok') }}</h2>
            <div style="font-weight:800;letter-spacing:.06em;white-space:nowrap">{{ r.ref }}</div>
            @if (r.cardNumber) {
              <div class="muted" style="font-size:12.5px"><ic name="idcard" [size]="13" style="vertical-align:-2px;margin-right:3px"></ic>{{ i18n.t('pp_card_number') }} : <b style="color:var(--text)">{{ r.cardNumber }}</b></div>
            }
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
                  <img [src]="selfieUrl()" alt="selfie" style="width:78px;height:78px;object-fit:cover" />
                } @else {
                  <svg viewBox="0 0 78 78" width="78" height="78"><rect width="78" height="78" fill="#cfe6da"/><circle cx="39" cy="31" r="16" fill="#5b7d6f"/><path d="M14 78 q0 -22 25 -22 q25 0 25 22z" fill="#5b7d6f"/></svg>
                }
                <span style="position:absolute;right:3px;bottom:3px;width:20px;height:20px;border-radius:50%;background:var(--success);color:#fff;display:flex;align-items:center;justify-content:center"><ic name="check" [size]="13" [sw]="3"></ic></span>
              </div>
              <div style="min-width:0;flex:1">
                <div style="font-size:16px;font-weight:800">{{ r.fullName }}</div>
                <div class="muted" style="font-size:12px;margin-top:3px">{{ i18n.t('cni_short') }} {{ r.cni }} · {{ i18n.t('validity') }} {{ r.cniExp }}</div>
                <div class="muted" style="font-size:12px;margin-top:2px">{{ r.phone }}@if (r.email) { · {{ r.email }}}</div>
                @if (r.quartier || r.region) {
                  <div class="muted" style="font-size:12px;margin-top:2px">{{ r.quartier }}{{ r.quartier && r.region ? ' · ' : '' }}{{ r.region }}</div>
                }
                <div style="display:inline-flex;align-items:center;gap:6px;margin-top:7px;font-size:11.5px;color:var(--success);font-weight:700"><ic name="check" [size]="14" [sw]="2.6"></ic> {{ i18n.t('pp_selfie_ok') }}</div>
              </div>
            </div>

            <!-- Retake a badly-shot client photo before printing -->
            @if (retaking()) {
              <div style="padding:0 16px 14px">
                <photo-capture facing="user" [allowFlip]="true" [round]="true" [boxW]="200" [boxH]="200"
                  [guide]="i18n.t('pp_retake_guide')" (captured)="onRetakeSelfie(r.ref, $event)" (retake)="retaking.set(false)"></photo-capture>
                <button class="btn btn-ghost" (click)="retaking.set(false)" style="font-size:13px;margin-top:6px">{{ i18n.t('cancel') }}</button>
              </div>
            } @else {
              <div style="padding:0 16px 12px;display:flex;align-items:center;gap:10px">
                <button class="btn btn-outline" (click)="retaking.set(true)" [disabled]="photoBusy()" style="width:auto;padding:8px 12px;font-size:12.5px"><ic name="camera" [size]="15"></ic> {{ i18n.t('pp_retake_photo') }}</button>
                @if (photoBusy()) { <span class="muted" style="font-size:11.5px">{{ i18n.t('pp_photo_saving') }}</span> }
              </div>
            }
            @if (rectoUrl() || versoUrl()) {
              <div style="padding:0 16px 12px;display:flex;gap:10px">
                @if (rectoUrl()) {
                  <div style="flex:1;text-align:center">
                    <img [src]="rectoUrl()" alt="CNI recto" style="width:100%;height:84px;object-fit:cover;border-radius:8px;border:1px solid var(--border)" />
                    <div class="muted" style="font-size:10.5px;margin-top:3px">{{ i18n.t('pp_cni_recto') }}</div>
                  </div>
                }
                @if (versoUrl()) {
                  <div style="flex:1;text-align:center">
                    <img [src]="versoUrl()" alt="CNI verso" style="width:100%;height:84px;object-fit:cover;border-radius:8px;border:1px solid var(--border)" />
                    <div class="muted" style="font-size:10.5px;margin-top:3px">{{ i18n.t('pp_cni_verso') }}</div>
                  </div>
                }
              </div>
            }
            <div style="padding:0 16px 6px">
              <!-- NIU: shown to staff; agent/admin can add or correct it when the client didn't provide it -->
              <div class="srow">
                <span class="lbl">{{ i18n.t('niu_short') }}</span>
                @if (editingNiu()) {
                  <span class="val" style="display:flex;gap:6px;align-items:center;justify-content:flex-end">
                    <input class="input" style="height:30px;padding:4px 9px;font-size:12.5px;max-width:160px" [placeholder]="i18n.t('niu_ph')"
                           [value]="niuDraft()" (input)="niuDraft.set($any($event.target).value)" (keydown.enter)="saveNiu(r.ref)" />
                    <button class="icon-btn" (click)="saveNiu(r.ref)" [disabled]="savingNiu()" [title]="i18n.t('save')"><ic name="check" [size]="15" [sw]="2.4"></ic></button>
                    <button class="icon-btn" (click)="cancelNiu()" [title]="i18n.t('cancel')"><ic name="x" [size]="15"></ic></button>
                  </span>
                } @else {
                  <span class="val" style="display:inline-flex;align-items:center;gap:8px">
                    @if (r.niu) { {{ r.niu }} } @else { <span class="muted">{{ i18n.t('niu_none') }}</span> }
                    @if (canEditNiu) { <button (click)="startEditNiu(r)" style="border:none;background:none;color:var(--primary);font-weight:700;font-size:11.5px;cursor:pointer;padding:0">{{ r.niu ? i18n.t('niu_edit') : i18n.t('niu_add') }}</button> }
                  </span>
                }
              </div>
              <div class="srow"><span class="lbl">{{ i18n.t('pay_method_label') }}</span><span class="val" style="display:inline-flex;align-items:center;gap:7px"><span class="op-logo" [style.background]="pm(r).bg" [style.color]="pm(r).fg" style="width:22px;height:22px;font-size:9px;border-radius:6px;overflow:hidden">@if (pm(r).logo) { <img [src]="pm(r).logo" [alt]="pm(r).name" style="width:100%;height:100%;object-fit:contain" /> } @else { {{ pm(r).short }} }</span>{{ r.pay === 'cash' ? i18n.t('pay_cash_name') : pm(r).name }}</span></div>
              <div class="srow"><span class="lbl">{{ i18n.t('delivery_label') }}</span><span class="val">{{ i18n.t('del_' + r.delivery + '_title') }}</span></div>
              @if (r.payStatus === 'cash') {
                <div class="srow total"><span class="lbl">{{ i18n.t('pp_to_collect') }}</span><span class="val" style="color:var(--accent)">{{ i18n.money(r.amount) }}</span></div>
              } @else if (r.payStatus === 'sara_pending') {
                <div class="srow total"><span class="lbl">{{ i18n.t('pp_sara_amount') }}</span><span class="val">{{ i18n.money(r.amount) }}</span></div>
              } @else {
                <div class="srow total"><span class="lbl">{{ i18n.t('amount_paid') }}</span><span class="val">{{ i18n.money(r.amount) }}</span></div>
              }
              @if (r.payStatus === 'failed' && r.paymentMessage) {
                <div class="srow"><span class="lbl">{{ i18n.t('pp_sara_rejected') }}</span><span class="val" style="color:var(--accent)">{{ r.paymentMessage }}</span></div>
              }
            </div>

            <!-- SARA money: show the uploaded receipt so the agent can check conformity -->
            @if (r.hasSaraReceipt && (receiptImg() || receiptPdf())) {
              <div style="padding:0 16px 14px">
                <div class="muted" style="font-size:11.5px;font-weight:700;margin-bottom:6px">{{ i18n.t('pp_sara_receipt') }}</div>
                @if (receiptPdf()) {
                  <iframe [src]="receiptPdf()" style="width:100%;height:360px;border:1px solid var(--border);border-radius:10px"></iframe>
                } @else if (receiptImg()) {
                  <img [src]="receiptImg()" alt="reçu SARA" style="width:100%;max-height:380px;object-fit:contain;background:var(--surface-2);border:1px solid var(--border);border-radius:10px" />
                }
                @if (receiptOpenUrl()) {
                  <a [href]="receiptOpenUrl()" target="_blank" rel="noopener" class="btn btn-ghost" style="margin-top:8px;width:auto;padding:8px 12px;font-size:12.5px;text-decoration:none"><ic name="scan" [size]="15"></ic> {{ i18n.t('pp_sara_open') }}</a>
                }
              </div>
            }

            <!-- Receipt fields auto-extracted (reference / payer / amount) — prefilled; the agent confirms or corrects before validating. -->
            @if (r.payStatus === 'sara_pending') {
              <div style="padding:0 16px 16px;border-top:1px solid var(--border);padding-top:14px">
                <div class="muted" style="font-size:11.5px;font-weight:700;margin-bottom:8px">{{ i18n.t('pp_sara_extracted') }}</div>
                <field [label]="i18n.t('pp_sara_ref')"><input class="input" [placeholder]="i18n.t('pp_sara_ref_ph')" [value]="saraRefDraft()" (input)="saraRefDraft.set($any($event.target).value)" /></field>
                <field [label]="i18n.t('pp_sara_payer')"><input class="input" inputmode="tel" [placeholder]="i18n.t('pp_sara_payer_ph')" [value]="saraPhoneDraft()" (input)="saraPhoneDraft.set($any($event.target).value)" /></field>
                <field [label]="i18n.t('pp_sara_amount_field')"><input class="input" inputmode="numeric" [placeholder]="i18n.t('pp_sara_amount_ph')" [value]="saraAmountDraft()" (input)="saraAmountDraft.set($any($event.target).value)" /></field>
                <p class="muted" style="font-size:11px;line-height:1.4;margin-top:2px;display:flex;gap:5px;align-items:flex-start"><ic name="alert" [size]="13" style="flex-shrink:0;margin-top:1px"></ic>{{ i18n.t('pp_sara_extracted_hint') }}</p>
              </div>
            }

            <!-- Card number — required before printing the activated card -->
            @if (r.payStatus !== 'sara_pending') {
              <div style="padding:0 16px 16px;border-top:1px solid var(--border);padding-top:14px">
                <field [label]="i18n.t('pp_card_number')" [hint]="i18n.t('pp_card_number_hint')"
                       [err]="cardTouched() && !cardNumberOk ? i18n.t('pp_card_number_required') : null">
                  <div class="input-prefix">
                    <span class="pfx"><ic name="idcard" [size]="16"></ic></span>
                    <input [placeholder]="i18n.t('pp_card_number_ph')" [value]="cardNumber()"
                           (input)="cardNumber.set($any($event.target).value)" style="letter-spacing:.04em;font-weight:600" />
                  </div>
                </field>
              </div>
            }
          </div>
        }
      }
      <div style="flex:1"></div>
    </div>

    @if (rec(); as r) {
      @if (r.printed) {
        <div class="scr-foot"><button class="btn btn-ghost" (click)="again()">{{ i18n.t('pp_again') }}</button></div>
      } @else if (r.payStatus === 'sara_pending') {
        <!-- Payment not yet confirmed: validate or reject the receipt before printing. -->
        <div class="scr-foot">
          <button class="btn btn-primary" (click)="doValidateSara(r.ref)" [disabled]="validating()"><ic name="check" [size]="18" [sw]="2.4"></ic> {{ i18n.t('pp_sara_validate') }}</button>
          <div style="display:flex;gap:10px">
            <button class="btn btn-ghost" (click)="doRejectSara(r.ref)" [disabled]="validating()" style="font-size:13px;color:var(--accent)"><ic name="x" [size]="16"></ic> {{ i18n.t('pp_sara_reject') }}</button>
            <button class="btn btn-ghost" (click)="again()" style="font-size:13px">{{ i18n.t('pp_again') }}</button>
          </div>
        </div>
      } @else {
        <div class="scr-foot">
          <button class="btn btn-primary" (click)="doPrint(r.ref)" [disabled]="printing()"><ic name="printer" [size]="18"></ic> {{ i18n.t('pp_print') }}</button>
          <button class="btn btn-ghost" (click)="again()" style="font-size:13px">{{ i18n.t('pp_again') }}</button>
        </div>
      }
    }
  </div>`,
})
export class PrintPointComponent implements OnInit {
  i18n = inject(I18n);
  auth = inject(Auth);
  private api = inject(Api);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private sanitizer = inject(DomSanitizer);

  ref = signal('');
  searched = signal(false);
  loading = signal(false);
  results = signal<Subscription[]>([]);
  rec = signal<Subscription | null>(null);
  selfieUrl = signal<SafeUrl | null>(null);
  rectoUrl = signal<SafeUrl | null>(null);
  versoUrl = signal<SafeUrl | null>(null);
  receiptImg = signal<SafeUrl | null>(null);          // SARA receipt when it is an image
  receiptPdf = signal<SafeResourceUrl | null>(null);  // SARA receipt when it is a PDF (iframe)
  receiptOpenUrl = signal<string | null>(null);       // raw object URL, to open in a new tab
  validating = signal(false);
  editingNiu = signal(false);
  niuDraft = signal('');
  savingNiu = signal(false);
  // SARA receipt fields prefilled from extraction; the agent confirms/corrects them before validating.
  saraRefDraft = signal('');
  saraPhoneDraft = signal('');
  saraAmountDraft = signal('');
  // Print point: retake photo + mandatory card number before printing.
  retaking = signal(false);
  photoBusy = signal(false);
  printing = signal(false);
  cardNumber = signal('');
  cardTouched = signal(false);
  private objectUrls: string[] = [];

  /** Card number is mandatory before printing (light sanity check on length). */
  get cardNumberOk() { return this.cardNumber().trim().length >= 4; }

  pm = (r: Subscription) => payById(r.pay);
  status = (r: Subscription) => recordStatus(r);
  /** Only relationship officers / admins may add or correct a NIU (print agents view only). */
  get canEditNiu() { return this.auth.hasRole('AGENT', 'ADMIN'); }

  ngOnInit() {
    const prefill = this.route.snapshot.queryParamMap.get('ref');
    if (prefill) { this.ref.set(prefill.toUpperCase()); this.open(prefill); }
  }

  onRef(e: Event) {
    // Accept reference, name or phone: letters, digits, spaces, + and -.
    this.ref.set((e.target as HTMLInputElement).value.replace(/[^a-zA-Z0-9 +-]/g, '').slice(0, 40));
  }

  /** Search by reference, name or phone. One match opens directly; several show a list. */
  doSearch() {
    const q = this.ref().trim();
    if (!q) return;
    this.searched.set(true); this.loading.set(true); this.clearSelfie(); this.rec.set(null); this.results.set([]);
    this.api.searchSubscriptions(q).subscribe({
      next: (list) => {
        this.loading.set(false);
        if (list.length === 1) this.open(list[0].ref);
        else this.results.set(list);
      },
      error: () => { this.loading.set(false); this.results.set([]); },
    });
  }

  /** Load the full record (incl. images) for a chosen reference. */
  open(ref: string) {
    this.searched.set(true); this.loading.set(true); this.results.set([]); this.clearSelfie(); this.rec.set(null);
    this.api.byRef(ref).subscribe({
      next: (s) => { this.setRecord(s); this.loading.set(false); },
      error: () => { this.rec.set(null); this.loading.set(false); },
    });
  }
  again() {
    this.ref.set(''); this.searched.set(false); this.rec.set(null); this.results.set([]); this.clearSelfie();
    this.cardNumber.set(''); this.cardTouched.set(false); this.retaking.set(false);
  }
  /** Validate the print — card number is required and stored with the record. */
  doPrint(ref: string) {
    this.cardTouched.set(true);
    if (!this.cardNumberOk || this.printing()) return;
    this.printing.set(true);
    this.api.print(ref, this.cardNumber().trim()).subscribe({
      next: (s) => { this.rec.set(s); this.printing.set(false); },
      error: () => this.printing.set(false),
    });
  }

  /** Retake the client photo (badly shot): upload the new shot, point the record at it, refresh. */
  onRetakeSelfie(ref: string, dataUrl: string) {
    this.retaking.set(false);
    this.photoBusy.set(true);
    this.api.uploadImage(dataUrl, 'selfie').subscribe({
      next: (u) => this.api.updatePhoto(ref, 'selfie', u.key).subscribe({
        next: (s) => { this.rec.set(s); this.reloadSelfie(s.ref); this.photoBusy.set(false); },
        error: () => this.photoBusy.set(false),
      }),
      error: () => this.photoBusy.set(false),
    });
  }
  private reloadSelfie(ref: string) {
    this.selfieUrl.set(null);
    this.loadImage(ref, 'selfie', this.selfieUrl);
  }

  /** The agent's confirmed/corrected receipt values, sent alongside the validate/reject decision. */
  private saraOpts() {
    const amt = parseInt(this.saraAmountDraft().replace(/\D/g, ''), 10);
    return {
      saraRef: this.saraRefDraft().trim() || undefined,
      saraPayerPhone: this.saraPhoneDraft().trim() || undefined,
      saraAmount: Number.isNaN(amt) ? undefined : amt,
    };
  }

  /** Validate the SARA money receipt → marks the subscription paid (then printable). */
  doValidateSara(ref: string) {
    if (this.validating()) return;
    this.validating.set(true);
    this.api.validateSara(ref, 'validate', this.saraOpts()).subscribe({
      next: (s) => { this.rec.set(s); this.validating.set(false); },
      error: () => this.validating.set(false),
    });
  }
  /** Reject the SARA money receipt (not conforming) → marks it failed, with a reason. */
  doRejectSara(ref: string) {
    if (this.validating()) return;
    const reason = window.prompt(this.i18n.t('pp_sara_reject_reason')) ?? '';
    if (reason === null) return; // cancelled
    this.validating.set(true);
    this.api.validateSara(ref, 'reject', { reason: reason || undefined, ...this.saraOpts() }).subscribe({
      next: (s) => { this.rec.set(s); this.validating.set(false); },
      error: () => this.validating.set(false),
    });
  }

  /** Begin editing the NIU (prefilled with the current value). */
  startEditNiu(r: Subscription) { this.niuDraft.set(r.niu ?? ''); this.editingNiu.set(true); }
  cancelNiu() { this.editingNiu.set(false); this.niuDraft.set(''); }
  /** Persist the added/corrected NIU, then refresh the displayed record. */
  saveNiu(ref: string) {
    if (this.savingNiu()) return;
    this.savingNiu.set(true);
    this.api.updateNiu(ref, this.niuDraft().trim()).subscribe({
      next: (s) => { this.rec.set(s); this.savingNiu.set(false); this.editingNiu.set(false); },
      error: () => this.savingNiu.set(false),
    });
  }

  private setRecord(s: Subscription) {
    this.rec.set(s);
    this.editingNiu.set(false); this.niuDraft.set('');
    this.retaking.set(false); this.photoBusy.set(false);
    this.cardTouched.set(false); this.cardNumber.set(s.cardNumber ?? '');
    // Prefill the editable SARA receipt fields with what was auto-extracted.
    this.saraRefDraft.set(s.saraRef ?? '');
    this.saraPhoneDraft.set(s.saraPayerPhone ?? '');
    this.saraAmountDraft.set(s.saraAmount != null ? String(s.saraAmount) : '');
    if (s.hasSelfie) this.loadImage(s.ref, 'selfie', this.selfieUrl);
    if (s.hasCniRecto) this.loadImage(s.ref, 'cni-recto', this.rectoUrl);
    if (s.hasCniVerso) this.loadImage(s.ref, 'cni-verso', this.versoUrl);
    if (s.hasSaraReceipt) this.loadReceipt(s.ref);
  }

  /** Load the SARA receipt blob and route it to an <img> (image) or an <iframe> (PDF). */
  private loadReceipt(ref: string) {
    this.api.imageBlob(ref, 'sara-receipt').subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        this.objectUrls.push(url);
        this.receiptOpenUrl.set(url);
        if (blob.type === 'application/pdf') {
          this.receiptPdf.set(this.sanitizer.bypassSecurityTrustResourceUrl(url));
        } else {
          this.receiptImg.set(this.sanitizer.bypassSecurityTrustUrl(url));
        }
      },
      error: () => { this.receiptImg.set(null); this.receiptPdf.set(null); this.receiptOpenUrl.set(null); },
    });
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
  private clearSelfie() {
    this.objectUrls.forEach((u) => URL.revokeObjectURL(u));
    this.objectUrls = [];
    this.selfieUrl.set(null); this.rectoUrl.set(null); this.versoUrl.set(null);
    this.receiptImg.set(null); this.receiptPdf.set(null); this.receiptOpenUrl.set(null);
  }
  exit() { this.router.navigateByUrl(this.auth.landingPath()); }
}
