import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { DomSanitizer, SafeResourceUrl, SafeUrl } from '@angular/platform-browser';
import { ImagePreview } from '../shared/image-preview';
import { ClientPhotoComponent } from '../shared/client-photo';
import { ActivatedRoute, Router } from '@angular/router';
import { I18n } from '../core/i18n';
import { Api } from '../core/api';
import { Auth } from '../core/auth';
import { PrintStats, Recharge, Subscription } from '../core/models';
import { LIVE_REFRESH_MS, payById, recordStatus, formatPan } from '../shared/constants';
import { AppBarComponent } from '../shared/app-bar';
import { IconComponent } from '../shared/icon';
import { FieldComponent } from '../shared/fields';
import { PhotoCaptureComponent } from '../shared/photo-capture';
import { StatusBadgeComponent } from '../shared/status-badge';
import { SpinnerComponent } from '../shared/spinner';
import { NotifBellComponent } from '../shared/notif-bell';

/** Print point — retrieve a KYC file by reference, then print & hand over the card. */
@Component({
  selector: 'page-print-point',
  standalone: true,
  imports: [AppBarComponent, IconComponent, FieldComponent, PhotoCaptureComponent, StatusBadgeComponent, SpinnerComponent, ClientPhotoComponent, NotifBellComponent],
  template: `
  <div class="scr">
    <app-bar>
      <button appbar-left class="back-link" (click)="exit()" style="margin-right:2px"><ic name="chevL" [size]="20"></ic></button>
      <notif-bell appbar-right></notif-bell>
      <button appbar-right class="icon-btn" (click)="auth.logout()" [title]="i18n.t('logout')"><ic name="logout" [size]="15" [sw]="2"></ic></button>
    </app-bar>
    <div class="scr-body">
      <div>
        <div class="kicker"><ic name="printer" [size]="13" style="vertical-align:-2px;margin-right:4px"></ic>{{ i18n.t('card_name') }}</div>
        <h1 style="font-size:23px;margin-top:6px">{{ i18n.t('pp_title') }}</h1>
        <p class="muted" style="font-size:13px;margin-top:5px">{{ i18n.t('pp_sub') }}</p>
      </div>

      @if (auth.hasRole('COLLECTEUR')) {
        <button class="btn btn-outline" (click)="goCollecte()" style="width:100%;margin-bottom:10px"><ic name="store" [size]="18"></ic> {{ i18n.t('nav_collectes') }}</button>
      }

      <!-- Print-point KPIs (hidden while viewing a single record) -->
      @if (!rec() && stats(); as st) {
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">
          <div class="kpi"><div class="kv" style="color:var(--primary)">{{ st.myPrinted }}</div><div class="kl">{{ i18n.t('pp_kpi_mine') }}</div></div>
          <div class="kpi"><div class="kv" style="color:var(--success)">{{ st.myPrintedToday }}</div><div class="kl">{{ i18n.t('kpi_today') }}</div></div>
          <div class="kpi"><div class="kv" style="color:var(--af-gold)">{{ st.queue }}</div><div class="kl">{{ i18n.t('pp_kpi_queue') }}</div></div>
        </div>
        <p class="muted" style="font-size:10.5px;margin-top:-4px;text-align:center;display:flex;align-items:center;justify-content:center;gap:5px;color:var(--success)"><span class="live-dot"></span>{{ i18n.t('live_auto') }}</p>
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
              <client-photo [refId]="s.ref" [name]="s.fullName" [hasSelfie]="s.hasSelfie" [size]="44"></client-photo>
              <div style="min-width:0;flex:1">
                <div style="font-size:14px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{ s.fullName }}</div>
                <div class="muted" style="font-size:11.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{ s.ref }} · {{ s.phone }}@if (s.cni) { · {{ i18n.t('cni_short') }} {{ s.cni }} }</div>
              </div>
              <status-badge [status]="status(s)"></status-badge>
              <ic name="chevR" [size]="16" style="color:var(--muted);flex-shrink:0"></ic>
            </button>
          }
        </div>
      }

      <!-- Recharge matches (top-ups have no KYC; SARA ones are validated here). -->
      @if (!rec() && !rRec() && rechargeResults().length) {
        <div class="card" style="overflow:hidden">
          <div class="muted" style="padding:10px 14px;border-bottom:1px solid var(--border);font-size:11.5px"><ic name="phone" [size]="12" style="vertical-align:-1px;margin-right:4px"></ic>{{ i18n.t('pp_recharges') }}</div>
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

      @if (searched() && !rec() && !rRec() && !loading() && !results().length && !rechargeResults().length) {
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
            @if (r.pan) {
              <div class="muted" style="font-size:12.5px"><ic name="idcard" [size]="13" style="vertical-align:-2px;margin-right:3px"></ic>{{ i18n.t('pp_pan') }} : <b style="color:var(--text)">{{ fmtPan(r.pan) }}</b></div>
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
                  <img [src]="selfieUrl()" alt="selfie" (click)="preview.open(selfieUrl())" style="width:78px;height:78px;object-fit:cover;cursor:zoom-in" />
                } @else {
                  <svg viewBox="0 0 78 78" width="78" height="78"><rect width="78" height="78" fill="#cfe6da"/><circle cx="39" cy="31" r="16" fill="#5b7d6f"/><path d="M14 78 q0 -22 25 -22 q25 0 25 22z" fill="#5b7d6f"/></svg>
                }
                <span style="position:absolute;right:3px;bottom:3px;width:20px;height:20px;border-radius:50%;background:var(--success);color:#fff;display:flex;align-items:center;justify-content:center"><ic name="check" [size]="13" [sw]="3"></ic></span>
              </div>
              <div style="min-width:0;flex:1">
                <div style="font-size:16px;font-weight:800">{{ r.fullName }}</div>
                <div class="muted" style="font-size:12px;margin-top:3px">{{ i18n.t('cni_short') }} {{ r.cni }} · {{ i18n.t('validity') }} {{ r.cniExp }}</div>
                <div class="muted" style="font-size:12px;margin-top:2px">{{ r.phone }}@if (r.email) { · {{ r.email }}}</div>
                @if (r.quartier || r.ville || r.region) {
                  <div class="muted" style="font-size:12px;margin-top:2px">{{ r.quartier }}{{ r.quartier && (r.ville || r.region) ? ' · ' : '' }}{{ r.ville }}{{ r.ville && r.region ? ' · ' : '' }}{{ r.region }}</div>
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
            <!-- CNI recto / verso — display + retake -->
            @if (retakingCni()) {
              <div style="padding:0 16px 12px">
                <photo-capture facing="environment" [boxW]="280" [boxH]="160"
                  (captured)="onRetakeCni(r.ref, retakingCni()!, $event)" (retake)="retakingCni.set(null)"></photo-capture>
                @if (cniBusy()) { <div class="muted" style="font-size:12px;margin-top:4px;text-align:center">{{ i18n.t('pp_photo_saving') }}</div> }
                @else { <button class="btn btn-ghost" (click)="retakingCni.set(null)" style="font-size:13px;margin-top:6px">{{ i18n.t('cancel') }}</button> }
              </div>
            }
            <div style="padding:0 16px 12px;display:flex;gap:10px">
              <div style="flex:1;text-align:center">
                @if (rectoUrl()) {
                  <img [src]="rectoUrl()" alt="CNI recto" (click)="preview.open(rectoUrl())" style="width:100%;height:84px;object-fit:cover;border-radius:8px;border:1px solid var(--border);cursor:zoom-in" />
                } @else if (r.hasCniRecto) {
                  <div style="height:84px;border-radius:8px;border:1px solid var(--border);display:flex;align-items:center;justify-content:center"><spinner tone="muted" [size]="18"></spinner></div>
                } @else {
                  <div style="height:84px;border-radius:8px;border:1px dashed var(--border);display:flex;align-items:center;justify-content:center;color:var(--muted)"><ic name="idcard" [size]="22"></ic></div>
                }
                <div class="muted" style="font-size:10.5px;margin-top:3px">{{ i18n.t('pp_cni_recto') }}</div>
                <button class="btn btn-ghost" (click)="retakingCni.set('cni-recto')" [disabled]="retakingCni() !== null || cniBusy()" style="padding:2px 8px;font-size:11px;margin-top:3px" [title]="i18n.t('pp_retake_recto')"><ic name="camera" [size]="12"></ic></button>
              </div>
              <div style="flex:1;text-align:center">
                @if (versoUrl()) {
                  <img [src]="versoUrl()" alt="CNI verso" (click)="preview.open(versoUrl())" style="width:100%;height:84px;object-fit:cover;border-radius:8px;border:1px solid var(--border);cursor:zoom-in" />
                } @else if (r.hasCniVerso) {
                  <div style="height:84px;border-radius:8px;border:1px solid var(--border);display:flex;align-items:center;justify-content:center"><spinner tone="muted" [size]="18"></spinner></div>
                } @else {
                  <div style="height:84px;border-radius:8px;border:1px dashed var(--border);display:flex;align-items:center;justify-content:center;color:var(--muted)"><ic name="idcard" [size]="22"></ic></div>
                }
                <div class="muted" style="font-size:10.5px;margin-top:3px">{{ i18n.t('pp_cni_verso') }}</div>
                <button class="btn btn-ghost" (click)="retakingCni.set('cni-verso')" [disabled]="retakingCni() !== null || cniBusy()" style="padding:2px 8px;font-size:11px;margin-top:3px" [title]="i18n.t('pp_retake_verso')"><ic name="camera" [size]="12"></ic></button>
              </div>
            </div>
            <div style="padding:0 16px 6px">
              <!-- NIU: shown to staff; agent/admin can add or correct it when the client didn't provide it -->
              <div class="srow">
                <span class="lbl">{{ i18n.t('niu_short') }}</span>
                @if (editingNiu()) {
                  <span class="val" style="display:flex;gap:6px;align-items:center;justify-content:flex-end">
                    <input class="input" style="height:30px;padding:4px 9px;font-size:12.5px;max-width:160px" [placeholder]="i18n.t('niu_ph')"
                           [value]="niuDraft()" (input)="niuDraft.set($any($event.target).value)" (keydown.enter)="saveNiu(r.ref)" />
                    <button class="icon-btn" (click)="saveNiu(r.ref)" [disabled]="savingNiu()" [title]="i18n.t('save')">@if (savingNiu()) { <spinner tone="primary" [size]="15"></spinner> } @else { <ic name="check" [size]="15" [sw]="2.4"></ic> }</button>
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
              <div class="srow"><span class="lbl">{{ i18n.t('delivery_label') }}</span><span class="val">{{ r.delivery === 'agence' && r.pickupAgencyName ? r.pickupAgencyName : i18n.t('del_' + r.delivery + '_title') }}</span></div>
              @if (r.payStatus === 'cash') {
                <div class="srow total"><span class="lbl">{{ i18n.t('pp_to_collect') }}</span><span class="val" style="color:var(--warning)">{{ i18n.money(r.amount) }}</span></div>
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
                  <img [src]="receiptImg()" alt="reçu SARA" (click)="preview.open(receiptImg())" style="width:100%;max-height:380px;object-fit:contain;background:var(--surface-2);border:1px solid var(--border);border-radius:10px;cursor:zoom-in" />
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

            <!-- Card number — required before printing. Only when the payment is settled (paid/cash);
                 never for a failed / pending payment. -->
            @if (canPrint(r)) {
              <div style="padding:0 16px 16px;border-top:1px solid var(--border);padding-top:14px">
                <field [label]="i18n.t('pp_card_number')" [hint]="i18n.t('pp_card_number_hint')"
                       [err]="cardTouched() && !cardNumberOk ? i18n.t('pp_card_number_required') : null">
                  <div style="display:flex;align-items:center;gap:6px;padding:0 12px">
                    <ic name="idcard" [size]="16" style="color:var(--muted);flex-shrink:0"></ic>
                    <input #cardPfx inputmode="numeric" maxlength="4" placeholder="XXXX" [value]="cardPrefix()"
                           (input)="cardPrefix.set($any($event.target).value.replace(/\D/g,'').slice(0,4)); if(cardPrefix().length===4) cardSfx.focus()"
                           style="width:52px;text-align:center;letter-spacing:.1em;border:none;outline:none;background:transparent;font-size:14px;font-weight:600;padding:11px 0" />
                    <span style="color:var(--muted);letter-spacing:.1em;font-size:14px;font-weight:600;user-select:none">**** ****</span>
                    <input #cardSfx inputmode="numeric" maxlength="4" placeholder="XXXX" [value]="cardSuffix()"
                           (input)="cardSuffix.set($any($event.target).value.replace(/\D/g,'').slice(0,4))"
                           style="width:52px;text-align:center;letter-spacing:.1em;border:none;outline:none;background:transparent;font-size:14px;font-weight:600;padding:11px 0" />
                  </div>
                </field>
                <!-- PAN (Primary Account Number) — captured at activation, optional -->
                <field [label]="i18n.t('pp_pan')" [hint]="i18n.t('pp_pan_hint')">
                  <div style="display:flex;align-items:center;gap:6px;padding:0 12px">
                    <ic name="idcard" [size]="16" style="color:var(--muted);flex-shrink:0"></ic>
                    <input #panPfx inputmode="numeric" maxlength="4" placeholder="XXXX" [value]="panPrefix()"
                           (input)="panPrefix.set($any($event.target).value.replace(/\D/g,'').slice(0,4)); if(panPrefix().length===4) panSfx.focus()"
                           style="width:52px;text-align:center;letter-spacing:.1em;border:none;outline:none;background:transparent;font-size:14px;font-weight:600;padding:11px 0" />
                    <span style="color:var(--muted);letter-spacing:.1em;font-size:14px;font-weight:600;user-select:none">**** ****</span>
                    <input #panSfx inputmode="numeric" maxlength="4" placeholder="XXXX" [value]="panSuffix()"
                           (input)="panSuffix.set($any($event.target).value.replace(/\D/g,'').slice(0,4))"
                           style="width:52px;text-align:center;letter-spacing:.1em;border:none;outline:none;background:transparent;font-size:14px;font-weight:600;padding:11px 0" />
                  </div>
                </field>
              </div>
            }
          </div>
        }
      }

      <!-- Recharge SARA record -->
      @if (rRec(); as r) {
        @if (rValidated()) {
          <div class="card" style="padding:20px;display:flex;flex-direction:column;align-items:center;gap:12px;text-align:center">
            <span style="width:64px;height:64px;border-radius:50%;background:var(--success);color:#fff;display:flex;align-items:center;justify-content:center;animation:pop .45s cubic-bezier(.2,.8,.3,1.2)"><ic name="check" [size]="32" [sw]="2.5"></ic></span>
            <h2 style="font-size:18px">{{ i18n.t('pp_sara_validated') }}</h2>
            <div style="font-weight:800;letter-spacing:.06em;white-space:nowrap">{{ r.ref }}</div>
            <div style="font-size:18px;font-weight:800;color:var(--success)">{{ i18n.money(r.amount) }}</div>
          </div>
        } @else {
          <div class="card" style="overflow:hidden">
            <div style="padding:13px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:8px">
              <ic name="phone" [size]="17" style="color:var(--primary)"></ic>
              <h3 style="font-size:15px">{{ i18n.t('pp_recharge_record') }}</h3>
              <span style="margin-left:auto"><status-badge [status]="r.status"></status-badge></span>
            </div>
            <div style="padding:16px 16px 6px">
              <div style="font-size:16px;font-weight:800">{{ r.fullName }}</div>
              <div class="muted" style="font-size:12px;margin-top:3px">{{ i18n.t('recharge_pan_short') }} {{ fmtPan(r.pan) }} · {{ r.pay === 'cash' ? i18n.t('pay_cash_name') : rpm(r).name }}</div>
            </div>
            <div style="padding:0 16px 10px">
              <div class="srow total"><span class="lbl">{{ i18n.t('pp_sara_amount') }}</span><span class="val">{{ i18n.money(r.amount) }}</span></div>
              @if (r.payStatus === 'failed' && r.paymentMessage) { <div class="srow"><span class="lbl">{{ i18n.t('pp_sara_rejected') }}</span><span class="val" style="color:var(--accent)">{{ r.paymentMessage }}</span></div> }
            </div>

            @if (r.hasSaraReceipt && (receiptImg() || receiptPdf())) {
              <div style="padding:0 16px 12px">
                <div class="muted" style="font-size:11.5px;font-weight:700;margin-bottom:6px">{{ i18n.t('pp_sara_receipt') }}</div>
                @if (receiptPdf()) {
                  <iframe [src]="receiptPdf()" style="width:100%;height:360px;border:1px solid var(--border);border-radius:10px"></iframe>
                } @else if (receiptImg()) {
                  <img [src]="receiptImg()" alt="reçu SARA" (click)="preview.open(receiptImg())" style="width:100%;max-height:380px;object-fit:contain;background:var(--surface-2);border:1px solid var(--border);border-radius:10px;cursor:zoom-in" />
                }
                @if (receiptOpenUrl()) { <a [href]="receiptOpenUrl()" target="_blank" rel="noopener" class="btn btn-ghost" style="margin-top:8px;width:auto;padding:8px 12px;font-size:12.5px;text-decoration:none"><ic name="scan" [size]="15"></ic> {{ i18n.t('pp_sara_open') }}</a> }
              </div>
            }

            @if (r.payStatus === 'sara_pending') {
              <div style="padding:0 16px 14px">
                <div class="muted" style="font-size:11.5px;font-weight:700;margin-bottom:8px">{{ i18n.t('pp_sara_extracted') }}</div>
                <field [label]="i18n.t('pp_sara_ref')"><input class="input" [placeholder]="i18n.t('pp_sara_ref_ph')" [value]="saraRefDraft()" (input)="saraRefDraft.set($any($event.target).value)" /></field>
                <field [label]="i18n.t('pp_sara_payer')"><input class="input" inputmode="tel" [placeholder]="i18n.t('pp_sara_payer_ph')" [value]="saraPhoneDraft()" (input)="saraPhoneDraft.set($any($event.target).value)" /></field>
                <field [label]="i18n.t('pp_sara_amount_field')"><input class="input" inputmode="numeric" [placeholder]="i18n.t('pp_sara_amount_ph')" [value]="saraAmountDraft()" (input)="saraAmountDraft.set($any($event.target).value)" /></field>
                <p class="muted" style="font-size:11px;line-height:1.4;margin-top:2px;display:flex;gap:5px;align-items:flex-start"><ic name="alert" [size]="13" style="flex-shrink:0;margin-top:1px"></ic>{{ i18n.t('pp_sara_extracted_hint') }}</p>
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
          <button class="btn btn-primary" (click)="doValidateSara(r.ref)" [disabled]="validating()">
            @if (validating()) { <spinner></spinner> } @else { <ic name="check" [size]="18" [sw]="2.4"></ic> {{ i18n.t('pp_sara_validate') }} }
          </button>
          <div style="display:flex;gap:10px">
            <button class="btn btn-ghost" (click)="doRejectSara(r.ref)" [disabled]="validating()" style="font-size:13px;color:var(--accent)"><ic name="x" [size]="16"></ic> {{ i18n.t('pp_sara_reject') }}</button>
            <button class="btn btn-ghost" (click)="again()" style="font-size:13px">{{ i18n.t('pp_again') }}</button>
          </div>
        </div>
      } @else if (canPrint(r)) {
        <div class="scr-foot">
          @if (printErr()) { <div class="feedback err-box" style="font-size:12.5px"><ic name="alert" [size]="18" style="flex-shrink:0"></ic> {{ i18n.t(printErr()!) }}</div> }
          <button class="btn btn-primary" (click)="doPrint(r.ref)" [disabled]="printing()">
            @if (printing()) { <spinner></spinner> } @else { <ic name="printer" [size]="18"></ic> {{ i18n.t('pp_print') }} }
          </button>
          <button class="btn btn-ghost" (click)="again()" style="font-size:13px">{{ i18n.t('pp_again') }}</button>
        </div>
      } @else {
        <!-- Payment failed / still pending: card activation is blocked. -->
        <div class="scr-foot">
          <div style="display:flex;gap:9px;align-items:flex-start;padding:11px 13px;border-radius:var(--radius);background:var(--accent-soft);color:var(--accent)">
            <ic name="alert" [size]="18" style="flex-shrink:0;margin-top:1px"></ic>
            <span style="font-size:12.5px;line-height:1.4;font-weight:600">{{ i18n.t('pp_not_payable') }}</span>
          </div>
          <button class="btn btn-ghost" (click)="again()" style="font-size:13px">{{ i18n.t('pp_again') }}</button>
        </div>
      }
    } @else if (rRec(); as r) {
      @if (rValidated() || r.payStatus !== 'sara_pending') {
        <div class="scr-foot"><button class="btn btn-ghost" (click)="again()">{{ i18n.t('pp_again') }}</button></div>
      } @else {
        <div class="scr-foot">
          <button class="btn btn-primary" (click)="doValidateSaraRecharge(r.ref)" [disabled]="validating()">
            @if (validating()) { <spinner></spinner> } @else { <ic name="check" [size]="18" [sw]="2.4"></ic> {{ i18n.t('pp_sara_validate') }} }
          </button>
          <div style="display:flex;gap:10px">
            <button class="btn btn-ghost" (click)="doRejectSaraRecharge(r.ref)" [disabled]="validating()" style="font-size:13px;color:var(--accent)"><ic name="x" [size]="16"></ic> {{ i18n.t('pp_sara_reject') }}</button>
            <button class="btn btn-ghost" (click)="again()" style="font-size:13px">{{ i18n.t('pp_again') }}</button>
          </div>
        </div>
      }
    }
  </div>`,
})
export class PrintPointComponent implements OnInit, OnDestroy {
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
  // Recharge SARA validation runs in parallel signals so the printing pipeline is untouched.
  rechargeResults = signal<Recharge[]>([]);
  rRec = signal<Recharge | null>(null);
  rValidated = signal(false);
  stats = signal<PrintStats | null>(null);
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
  retakingCni = signal<'cni-recto' | 'cni-verso' | null>(null);
  cniBusy = signal(false);
  printing = signal(false);
  printErr = signal<string | null>(null);
  cardPrefix = signal('');
  cardSuffix = signal('');
  panPrefix = signal('');
  panSuffix = signal('');
  cardTouched = signal(false);
  private objectUrls: string[] = [];

  /** Card number is mandatory: requires 4 prefix + 4 suffix digits. */
  get cardNumberOk() { return this.cardPrefix().length === 4 && this.cardSuffix().length === 4; }

  pm = (r: Subscription) => payById(r.pay);
  fmtPan = (v: string) => formatPan(v);

  /** Extracts prefix (first 4 visible digits) and suffix (last 4 visible digits) from a masked
   *  or raw PAN — used to pre-fill the split inputs when loading an existing record. */
  private parsePanParts(v: string | null | undefined): { prefix: string; suffix: string } {
    if (!v) return { prefix: '', suffix: '' };
    const d = v.replace(/\D/g, '');
    if (d.length >= 8) return { prefix: d.slice(0, 4), suffix: d.slice(-4) };
    return { prefix: d.slice(0, 4), suffix: '' };
  }
  status = (r: Subscription) => recordStatus(r);
  /** A card may be activated only when the payment is settled (MoMo paid, or cash to collect here). */
  canPrint = (r: Subscription) => r.payStatus === 'paid' || r.payStatus === 'cash';
  /** Only relationship officers / admins may add or correct a NIU (print agents view only). */
  get canEditNiu() { return this.auth.hasRole('AGENT', 'ADMIN'); }

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
  ngOnDestroy() { if (this.poll) clearInterval(this.poll); this.clearSelfie(); }
  private loadStats() { this.api.printStats().subscribe({ next: (s) => this.stats.set(s), error: () => {} }); }

  /** Silent background refresh: KPIs always; plus the open record's status OR the search
   *  results, so a payment becoming "payée — à imprimer" surfaces in near real-time. Skips any
   *  in-flight action / edit (printing, SARA validation, NIU edit, photo retake) and never
   *  reloads images or resets the agent's drafts (card number, PAN, SARA fields). */
  private refreshLive() {
    this.loadStats();
    if (this.loading() || this.printing() || this.validating() || this.savingNiu()
        || this.photoBusy() || this.retaking() || this.editingNiu()) return;
    // An open recharge reuses the SARA drafts — don't refresh it (would reset the agent's edits).
    if (this.rRec()) return;
    const r = this.rec();
    if (r) {
      if (r.printed) return; // success screen — nothing left to update
      // Refresh the record's status/amount only; setRecord is NOT called, so images and drafts survive.
      this.api.byRef(r.ref).subscribe({ next: (s) => { if (this.rec()?.ref === s.ref && !this.rec()?.printed) this.rec.set(s); }, error: () => {} });
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
    this.searched.set(true); this.loading.set(true); this.clearSelfie();
    this.rec.set(null); this.results.set([]); this.rRec.set(null); this.rechargeResults.set([]);
    // Recharges with a SARA receipt are validated here too; show them as a separate list.
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

  /** Load the full record (incl. images) for a chosen reference. */
  open(ref: string) {
    this.searched.set(true); this.loading.set(true); this.results.set([]); this.rechargeResults.set([]);
    this.clearSelfie(); this.rec.set(null); this.rRec.set(null);
    this.api.byRef(ref).subscribe({
      next: (s) => { this.setRecord(s); this.loading.set(false); },
      error: () => { this.rec.set(null); this.loading.set(false); },
    });
  }

  /** Open a recharge for SARA validation (loads its receipt + prefills the editable fields). */
  openRecharge(ref: string) {
    this.searched.set(true); this.loading.set(true); this.results.set([]); this.rechargeResults.set([]);
    this.clearSelfie(); this.rec.set(null); this.rRec.set(null); this.rValidated.set(false);
    this.api.rechargeByRef(ref).subscribe({
      next: (r) => {
        this.rRec.set(r);
        this.saraRefDraft.set(r.saraRef ?? '');
        this.saraPhoneDraft.set(r.saraPayerPhone ?? '');
        this.saraAmountDraft.set(r.saraAmount != null ? String(r.saraAmount) : '');
        if (r.hasSaraReceipt) this.loadRechargeReceipt(r.ref);
        this.loading.set(false);
      },
      error: () => { this.rRec.set(null); this.loading.set(false); },
    });
  }

  again() {
    this.ref.set(''); this.searched.set(false); this.rec.set(null); this.results.set([]); this.clearSelfie();
    this.rRec.set(null); this.rechargeResults.set([]); this.rValidated.set(false);
    this.cardPrefix.set(''); this.cardSuffix.set(''); this.panPrefix.set(''); this.panSuffix.set('');
    this.cardTouched.set(false); this.retaking.set(false);
  }

  /** Validate / reject a recharge's SARA receipt (mirrors the subscription SARA flow). */
  doValidateSaraRecharge(ref: string) {
    if (this.validating()) return;
    this.validating.set(true);
    this.api.saraValidateRecharge(ref, 'validate', this.saraOpts()).subscribe({
      next: (r) => { this.rRec.set(r); this.rValidated.set(true); this.validating.set(false); },
      error: () => this.validating.set(false),
    });
  }
  doRejectSaraRecharge(ref: string) {
    if (this.validating()) return;
    const reason = window.prompt(this.i18n.t('pp_sara_reject_reason')) ?? '';
    if (reason === null) return;
    this.validating.set(true);
    this.api.saraValidateRecharge(ref, 'reject', { reason: reason || undefined, ...this.saraOpts() }).subscribe({
      next: (r) => { this.rRec.set(r); this.validating.set(false); },
      error: () => this.validating.set(false),
    });
  }
  rpm = (r: Recharge) => payById(r.pay);

  private loadRechargeReceipt(ref: string) {
    this.api.rechargeImageBlob(ref, 'sara-receipt').subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        this.objectUrls.push(url);
        this.receiptOpenUrl.set(url);
        if (blob.type === 'application/pdf') this.receiptPdf.set(this.sanitizer.bypassSecurityTrustResourceUrl(url));
        else this.receiptImg.set(this.sanitizer.bypassSecurityTrustUrl(url));
      },
      error: () => { this.receiptImg.set(null); this.receiptPdf.set(null); this.receiptOpenUrl.set(null); },
    });
  }
  /** Validate the print — card number is required and stored with the record. */
  doPrint(ref: string) {
    this.cardTouched.set(true);
    this.printErr.set(null);
    if (!this.cardNumberOk || this.printing()) return;
    this.printing.set(true);
    const cardNum = `${this.cardPrefix()} **** **** ${this.cardSuffix()}`;
    const pan = this.panPrefix() && this.panSuffix() ? `${this.panPrefix()} **** **** ${this.panSuffix()}` : undefined;
    this.api.print(ref, cardNum, pan).subscribe({
      next: (s) => { this.rec.set(s); this.printing.set(false); this.loadStats(); },
      // 409 = the backend refused because the payment is not settled (defence in depth).
      error: (e) => { this.printing.set(false); this.printErr.set(e?.status === 409 ? 'pp_not_payable' : 'pp_print_error'); },
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

  onRetakeCni(ref: string, kind: string, dataUrl: string) {
    this.cniBusy.set(true);
    this.api.uploadImage(dataUrl, kind).subscribe({
      next: (u) => this.api.updatePhoto(ref, kind, u.key).subscribe({
        next: (s) => {
          this.rec.set(s); this.cniBusy.set(false); this.retakingCni.set(null);
          if (kind === 'cni-recto') { this.rectoUrl.set(null); this.loadImage(ref, 'cni-recto', this.rectoUrl); }
          if (kind === 'cni-verso') { this.versoUrl.set(null); this.loadImage(ref, 'cni-verso', this.versoUrl); }
        },
        error: () => this.cniBusy.set(false),
      }),
      error: () => this.cniBusy.set(false),
    });
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
    this.cardTouched.set(false);
    const cp = this.parsePanParts(s.cardNumber); this.cardPrefix.set(cp.prefix); this.cardSuffix.set(cp.suffix);
    const pp = this.parsePanParts(s.pan);        this.panPrefix.set(pp.prefix);  this.panSuffix.set(pp.suffix);
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
  goCollecte() { this.router.navigateByUrl('/collecte'); }
}
