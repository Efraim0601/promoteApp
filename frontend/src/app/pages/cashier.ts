import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { SlicePipe } from '@angular/common';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { ImagePreview } from '../shared/image-preview';
import { ActivatedRoute, Router } from '@angular/router';
import { I18n } from '../core/i18n';
import { Api } from '../core/api';
import { Auth } from '../core/auth';
import { CashierStats, Recharge, Subscription } from '../core/models';
import { LIVE_REFRESH_MS, payById, recordStatus, formatPan, formatPhone } from '../shared/constants';
import { AppBarComponent } from '../shared/app-bar';
import { IconComponent } from '../shared/icon';
import { FieldComponent } from '../shared/fields';
import { StatusBadgeComponent } from '../shared/status-badge';
import { SpinnerComponent } from '../shared/spinner';
import { PhotoCaptureComponent } from '../shared/photo-capture';
import { NotifBellComponent } from '../shared/notif-bell';

/** Cashier — retrieve a subscription, verify the client's identity, then validate the in-person
 *  cash payment (cash → paid). The printed card is then handed over at the print point. */
@Component({
  selector: 'page-cashier',
  standalone: true,
  imports: [AppBarComponent, IconComponent, FieldComponent, StatusBadgeComponent, SpinnerComponent, PhotoCaptureComponent, NotifBellComponent, SlicePipe],
  template: `
  <div class="scr">
    <app-bar>
      <button appbar-left class="back-link" (click)="exit()" style="margin-right:2px"><ic name="chevL" [size]="20"></ic></button>
      <notif-bell appbar-right></notif-bell>
      <button appbar-right class="icon-btn" (click)="auth.logout()" [title]="i18n.t('logout')"><ic name="logout" [size]="15" [sw]="2"></ic></button>
    </app-bar>
    <div class="scr-body">
      <div>
        <div class="kicker"><ic name="store" [size]="13" style="vertical-align:-2px;margin-right:4px"></ic>{{ i18n.t('card_name') }}</div>
        <h1 style="font-size:23px;margin-top:6px">{{ i18n.t('cash_title') }}</h1>
        <p class="muted" style="font-size:13px;margin-top:5px">{{ i18n.t('cash_sub') }}</p>
      </div>

      <!-- Strong alert: a new recharge is waiting to be credited/validated. -->
      @if (newAlert()) {
        <button (click)="goRecharges()" style="width:100%;border:none;cursor:pointer;display:flex;align-items:center;gap:10px;padding:12px 14px;border-radius:var(--radius);background:var(--af-gold);color:#5a4200;font-weight:800;font-size:13.5px;animation:pop .4s">
          <ic name="alert" [size]="18"></ic> {{ i18n.t('cash_rch_new_alert') }}
          <span style="margin-left:auto">{{ pendingRch().length }}</span>
        </button>
      }

      <!-- Tabs: cash/GAB collection vs recharge validation vs agency pickups. -->
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="btn" [class.btn-primary]="mode()==='especes'" [class.btn-outline]="mode()!=='especes'" (click)="setMode('especes')" style="flex:1;min-width:100px;padding:9px;font-size:12.5px"><ic name="store" [size]="15"></ic> {{ i18n.t('cash_tab_cash') }}</button>
        <button class="btn" [class.btn-primary]="mode()==='gab'" [class.btn-outline]="mode()!=='gab'" (click)="setMode('gab')" style="flex:1;min-width:80px;padding:9px;font-size:12.5px"><ic name="hash" [size]="15"></ic> {{ i18n.t('cash_tab_gab') }}</button>
        <button class="btn" [class.btn-primary]="mode()==='recharges'" [class.btn-outline]="mode()!=='recharges'" (click)="setMode('recharges')" style="flex:1;min-width:100px;padding:9px;font-size:12.5px"><ic name="phone" [size]="15"></ic> {{ i18n.t('cash_tab_recharges') }}@if (pendingRch().length) { <span style="margin-left:5px;background:var(--warning);color:#fff;border-radius:99px;padding:1px 7px;font-size:11px">{{ pendingRch().length }}</span> }</button>
        <button class="btn" [class.btn-primary]="mode()==='agence'" [class.btn-outline]="mode()!=='agence'" (click)="setMode('agence')" style="flex:1;min-width:100px;padding:9px;font-size:12.5px"><ic name="pin" [size]="15"></ic> Retraits agence@if (agencySubs().length) { <span style="margin-left:5px;background:var(--primary);color:#fff;border-radius:99px;padding:1px 7px;font-size:11px">{{ agencySubs().length }}</span> }</button>
      </div>

      @if (mode() === 'especes' || mode() === 'gab') {
      <!-- The cashier can also initiate a new subscription or a recharge (hidden while viewing a record). -->
      @if (!rec() && !rRec()) {
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <button class="btn btn-primary" (click)="newSub()" style="flex:1;min-width:150px"><ic name="plus" [size]="18"></ic> {{ i18n.t('new_sub_btn') }}</button>
          <button class="btn btn-outline" (click)="newRecharge()" style="flex:1;min-width:150px"><ic name="phone" [size]="18"></ic> {{ i18n.t('new_recharge_btn') }}</button>
          @if (auth.hasRole('COLLECTEUR')) {
            <button class="btn btn-outline" (click)="goCollecte()" style="flex:1;min-width:150px"><ic name="store" [size]="18"></ic> {{ i18n.t('nav_collectes') }}</button>
          }
        </div>
      }

      <!-- Cashier KPIs (hidden while viewing a single record) -->
      @if (!rec() && stats(); as st) {
        <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px">
          <div class="kpi"><div class="kv" style="color:var(--primary)">{{ st.myCount }}</div><div class="kl">{{ i18n.t('cash_kpi_mine') }}</div></div>
          <div class="kpi"><div class="kv" style="color:var(--success)">{{ st.myCountToday }}</div><div class="kl">{{ i18n.t('kpi_today') }}</div></div>
          <div class="kpi"><div class="kv" style="color:var(--af-gold)">{{ st.pendingCount }}</div><div class="kl">{{ i18n.t('cash_kpi_queue') }}</div></div>
        </div>
        <p class="muted" style="font-size:11.5px;margin-top:-4px;text-align:center">
          {{ i18n.t('cash_kpi_collected') }} : <b style="color:var(--text)">{{ i18n.money(st.myCollected) }}</b>
          · {{ i18n.t('cash_kpi_pending_amount') }} : <b style="color:var(--warning)">{{ i18n.money(st.pendingAmount) }}</b>
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
              <div class="muted" style="font-size:12px;margin-top:3px">{{ i18n.t('recharge_pan_short') }} {{ fmtPan(r.pan) }}</div>
              @if (r.phone) { <div class="muted" style="font-size:12px;margin-top:2px"><ic name="phone" [size]="12" style="vertical-align:-1px;margin-right:4px"></ic>{{ fmtPhone(r.phone) }}</div> }
            </div>
            <div style="padding:0 16px 14px">
              <div class="srow"><span class="lbl">{{ i18n.t('pay_method_label') }}</span><span class="val">{{ r.pay === 'cash' ? i18n.t('pay_cash_name') : rpm(r).name }}</span></div>
              @if (r.payStatus === 'cash') {
                <div class="srow total"><span class="lbl">{{ i18n.t('pp_to_collect') }}</span><span class="val" style="color:var(--warning)">{{ i18n.money(r.amount) }}</span></div>
              } @else {
                <div class="srow total"><span class="lbl">{{ i18n.t('amount_paid') }}</span><span class="val">{{ i18n.money(r.amount) }}</span></div>
              }
              @if (r.cashCollectedBy) { <div class="srow"><span class="lbl">{{ i18n.t('cash_collected_by') }}</span><span class="val">{{ r.cashCollectedBy }}</span></div> }
              @if (r.cashPaymentReference) { <div class="srow"><span class="lbl">{{ i18n.t('cash_payment_reference') }}</span><span class="val">{{ r.cashPaymentReference }}</span></div> }
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
            @if (r.cashPaymentReference) { <div class="muted" style="font-size:12px">{{ i18n.t('cash_payment_reference') }} · {{ r.cashPaymentReference }}</div> }
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
            <!-- Reprise photos (selfie + CNI recto/verso) -->
            @if (retakingPhoto()) {
              <div style="padding:0 16px 12px">
                <photo-capture [facing]="retakingPhoto() === 'selfie' ? 'user' : 'environment'"
                  [round]="retakingPhoto() === 'selfie'" [allowFlip]="retakingPhoto() === 'selfie'"
                  [boxW]="retakingPhoto() === 'selfie' ? 200 : 280" [boxH]="retakingPhoto() === 'selfie' ? 200 : 160"
                  (captured)="onRetakePhoto(r.ref, retakingPhoto()!, $event)" (retake)="retakingPhoto.set(null)"></photo-capture>
                @if (retakeBusy()) { <div class="muted" style="font-size:12px;margin-top:4px;text-align:center">{{ i18n.t('pp_photo_saving') }}</div> }
                @else { <button class="btn btn-ghost" (click)="retakingPhoto.set(null)" style="font-size:13px;margin-top:6px">{{ i18n.t('cancel') }}</button> }
              </div>
            } @else {
              <div style="padding:0 16px 10px;display:flex;gap:8px">
                <div style="flex:1;text-align:center">
                  @if (selfieUrl()) { <img [src]="selfieUrl()" alt="selfie" (click)="preview.open(selfieUrl())" style="width:100%;height:68px;object-fit:cover;border-radius:8px;border:1px solid var(--border);cursor:zoom-in" /> }
                  @else { <div style="height:68px;border-radius:8px;border:1px dashed var(--border);display:flex;align-items:center;justify-content:center;color:var(--muted)"><ic name="user" [size]="20"></ic></div> }
                  <div class="muted" style="font-size:10px;margin-top:2px">{{ i18n.t('tx_photo_client') }}</div>
                  <button class="btn btn-ghost" (click)="retakingPhoto.set('selfie')" style="padding:2px 7px;font-size:10px;margin-top:2px" [title]="i18n.t('pp_retake_photo')"><ic name="camera" [size]="11"></ic></button>
                </div>
                <div style="flex:1;text-align:center">
                  @if (rectoUrl()) { <img [src]="rectoUrl()" alt="CNI recto" (click)="preview.open(rectoUrl())" style="width:100%;height:68px;object-fit:cover;border-radius:8px;border:1px solid var(--border);cursor:zoom-in" /> }
                  @else { <div style="height:68px;border-radius:8px;border:1px dashed var(--border);display:flex;align-items:center;justify-content:center;color:var(--muted)"><ic name="idcard" [size]="20"></ic></div> }
                  <div class="muted" style="font-size:10px;margin-top:2px">{{ i18n.t('pp_cni_recto') }}</div>
                  <button class="btn btn-ghost" (click)="retakingPhoto.set('cni-recto')" style="padding:2px 7px;font-size:10px;margin-top:2px" [title]="i18n.t('pp_retake_recto')"><ic name="camera" [size]="11"></ic></button>
                </div>
                <div style="flex:1;text-align:center">
                  @if (versoUrl()) { <img [src]="versoUrl()" alt="CNI verso" (click)="preview.open(versoUrl())" style="width:100%;height:68px;object-fit:cover;border-radius:8px;border:1px solid var(--border);cursor:zoom-in" /> }
                  @else { <div style="height:68px;border-radius:8px;border:1px dashed var(--border);display:flex;align-items:center;justify-content:center;color:var(--muted)"><ic name="idcard" [size]="20"></ic></div> }
                  <div class="muted" style="font-size:10px;margin-top:2px">{{ i18n.t('pp_cni_verso') }}</div>
                  <button class="btn btn-ghost" (click)="retakingPhoto.set('cni-verso')" style="padding:2px 7px;font-size:10px;margin-top:2px" [title]="i18n.t('pp_retake_verso')"><ic name="camera" [size]="11"></ic></button>
                </div>
              </div>
            }
            <div style="padding:0 16px 14px">
              <div class="srow"><span class="lbl">{{ i18n.t('pay_method_label') }}</span><span class="val" style="display:inline-flex;align-items:center;gap:7px"><span class="op-logo" [style.background]="pm(r).bg" [style.color]="pm(r).fg" style="width:22px;height:22px;font-size:9px;border-radius:6px;overflow:hidden">@if (pm(r).logo) { <img [src]="pm(r).logo" [alt]="pm(r).name" style="width:100%;height:100%;object-fit:contain" /> } @else { {{ pm(r).short }} }</span>{{ r.pay === 'cash' ? i18n.t('pay_cash_name') : pm(r).name }}</span></div>
              @if (r.payStatus === 'cash') {
                <div class="srow total"><span class="lbl">{{ i18n.t('pp_to_collect') }}</span><span class="val" style="color:var(--warning)">{{ i18n.money(r.amount) }}</span></div>
              } @else {
                <div class="srow total"><span class="lbl">{{ i18n.t('amount_paid') }}</span><span class="val">{{ i18n.money(r.amount) }}</span></div>
              }
              <!-- Ventilation lecture seule : la caissière dissocie la recharge de la vente carte. -->
              @if (r.rechargeAmount != null) {
                <div class="srow" style="font-size:12px"><span class="lbl" style="color:var(--muted)">{{ i18n.t('cash_part_recharge') }}</span><span class="val">{{ i18n.money(r.rechargeAmount) }}</span></div>
                <div class="srow" style="font-size:12px"><span class="lbl" style="color:var(--muted)">{{ i18n.t('cash_part_card') }}</span><span class="val">{{ i18n.money(r.cardSaleAmount ?? 0) }}</span></div>
              }
              @if (r.cashCollectedBy) {
                <div class="srow"><span class="lbl">{{ i18n.t('cash_collected_by') }}</span><span class="val">{{ r.cashCollectedBy }}</span></div>
              }
              @if (r.cashPaymentReference) { <div class="srow"><span class="lbl">{{ i18n.t('cash_payment_reference') }}</span><span class="val">{{ r.cashPaymentReference }}</span></div> }
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
      } @else if (mode() === 'agence') {
        <!-- Clients ayant choisi ce point de retrait agence -->
        <div>
          <h2 style="font-size:17px;margin-bottom:2px">Retraits en agence</h2>
          <p class="muted" style="font-size:12.5px;line-height:1.4">Souscriptions dont le point de retrait correspond à votre agence.</p>
        </div>
        @if (agenceLoading()) {
          <div class="card load-center"><spinner tone="primary" [size]="20"></spinner></div>
        } @else if (!agencySubs().length) {
          <div class="card" style="padding:20px;text-align:center"><span class="muted" style="font-size:13px">Aucun retrait en attente pour cette agence.</span></div>
        } @else {
          @for (r of agencySubs(); track r.ref) {
            <div class="card" style="padding:14px;display:flex;flex-direction:column;gap:8px">
              <div style="display:flex;align-items:center;gap:8px">
                <div style="min-width:0;flex:1">
                  <div style="font-size:15px;font-weight:800">{{ r.fullName }}</div>
                  <div class="muted" style="font-size:11.5px;margin-top:2px">{{ r.ref }} · {{ r.phone }}</div>
                  <div style="font-size:11px;color:var(--primary);font-weight:700;margin-top:2px">{{ r.pickupAgencyName }}</div>
                </div>
                <status-badge [status]="status(r)"></status-badge>
              </div>
              <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                <span style="font-size:12px;color:var(--muted)">{{ r.createdAt | slice:0:10 }}</span>
                <span style="font-size:12px;font-weight:700;color:var(--primary)">{{ i18n.money(r.amount) }}</span>
                <span class="muted" style="font-size:11px">{{ r.pay === 'om' ? 'Orange Money' : r.pay === 'mtn' ? 'MTN MoMo' : r.pay === 'cash' ? 'Espèces' : r.pay }}</span>
              </div>
              <button class="btn btn-outline" (click)="openFromAgency(r.ref)" style="padding:8px;font-size:12.5px;width:auto;align-self:flex-start">
                <ic name="search" [size]="14"></ic> Voir / Valider
              </button>
            </div>
          }
        }
      } @else if (mode() === 'recharges') {
        <div>
          <h2 style="font-size:17px;margin-bottom:2px">{{ i18n.t('cash_rch_title') }}</h2>
          <p class="muted" style="font-size:12.5px;line-height:1.4">{{ i18n.t('cash_rch_sub') }}</p>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn" [class.btn-primary]="rchView()==='queue'" [class.btn-outline]="rchView()!=='queue'" (click)="rchView.set('queue')" style="flex:1;padding:8px;font-size:12.5px">{{ i18n.t('cash_rch_queue') }} ({{ pendingRch().length }})</button>
          <button class="btn" [class.btn-primary]="rchView()==='all'" [class.btn-outline]="rchView()!=='all'" (click)="loadAllRch()" style="flex:1;padding:8px;font-size:12.5px">{{ i18n.t('cash_rch_all') }}</button>
        </div>

        @if (rchView() === 'queue') {
          @if (!pendingRch().length) {
            <div class="card" style="padding:20px;text-align:center"><span class="muted" style="font-size:13px">{{ i18n.t('cash_rch_empty') }}</span></div>
          } @else {
            @for (r of pendingRch(); track r.ref) {
              <div class="card" style="padding:14px;display:flex;flex-direction:column;gap:10px">
                <div style="display:flex;align-items:center;gap:8px">
                  <div style="min-width:0;flex:1">
                    <div style="font-size:15px;font-weight:800">{{ r.fullName }}</div>
                    <div class="muted" style="font-size:12px;margin-top:2px">{{ r.ref }} · {{ i18n.t('recharge_pan_short') }} {{ fmtPan(r.pan) }}</div>
                  </div>
                  <status-badge [status]="r.status"></status-badge>
                </div>
                <div class="srow total" style="padding:0"><span class="lbl">{{ i18n.t('amount_paid') }}</span><span class="val" style="color:var(--primary)">{{ i18n.money(r.amount) }}</span></div>
                <div style="display:flex;gap:9px;align-items:flex-start;padding:9px 11px;border-radius:var(--radius);background:color-mix(in srgb, var(--af-gold) 14%, transparent)">
                  <ic name="alert" [size]="16" style="color:#8a6400;flex-shrink:0;margin-top:1px"></ic>
                  <span style="font-size:11.5px;line-height:1.4;color:#6b4f00">{{ i18n.t('cash_rch_credit_hint', { amount: i18n.money(r.amount), pan: fmtPan(r.pan) }) }}</span>
                </div>
                <button class="btn btn-primary" (click)="doFulfill(r.ref)" [disabled]="fulfilling() === r.ref" style="padding:11px">
                  @if (fulfilling() === r.ref) { <spinner></spinner> } @else { <ic name="check" [size]="18" [sw]="2.4"></ic> {{ i18n.t('cash_rch_validate') }} }
                </button>
              </div>
            }
          }
        } @else {
          @if (allRchLoading()) {
            <div class="load-center"><spinner tone="primary" [size]="20"></spinner> {{ i18n.t('loading') }}</div>
          } @else if (!allRch().length) {
            <div class="card" style="padding:20px;text-align:center"><span class="muted" style="font-size:13px">{{ i18n.t('rch_empty') }}</span></div>
          } @else {
            <div class="card" style="overflow:hidden">
              @for (r of allRch(); track r.ref) {
                <div style="display:flex;align-items:center;gap:10px;padding:11px 14px;border-bottom:1px solid var(--border)">
                  <div style="min-width:0;flex:1">
                    <div style="font-size:13.5px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{ r.fullName }}</div>
                    <div class="muted" style="font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{ r.ref }} · {{ i18n.money(r.amount) }}</div>
                  </div>
                  <status-badge [status]="r.status"></status-badge>
                  @if (r.payStatus === 'paid' && !r.fulfilled) {
                    <button class="btn btn-primary" (click)="doFulfill(r.ref)" [disabled]="fulfilling() === r.ref" style="width:auto;padding:6px 10px;font-size:12px">@if (fulfilling() === r.ref) { <spinner [size]="14"></spinner> } @else { {{ i18n.t('cash_rch_validate') }} }</button>
                  }
                </div>
              }
            </div>
          }
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
          <button class="btn btn-primary" (click)="mode() === 'gab' ? doValidateGab(r.ref) : doValidate(r.ref)" [disabled]="busy()">
            @if (busy()) { <spinner></spinner> } @else { <ic name="check" [size]="18" [sw]="2.4"></ic> {{ mode() === 'gab' ? i18n.t('cash_validate_gab') : i18n.t('cash_validate') }} }
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
  rectoUrl = signal<SafeUrl | null>(null);
  versoUrl = signal<SafeUrl | null>(null);
  retakingPhoto = signal<string | null>(null);
  retakeBusy = signal(false);
  busy = signal(false);
  err = signal(false);
  justValidated = signal(false);
  private objectUrls: string[] = [];

  // ---- recharge fulfillment (cashier credits the card after payment, then validates) ----
  mode = signal<'especes' | 'gab' | 'recharges' | 'agence'>('especes');
  rchView = signal<'queue' | 'all'>('queue');
  pendingRch = signal<Recharge[]>([]);     // paid, not yet credited — the validation queue
  allRch = signal<Recharge[]>([]);
  allRchLoading = signal(false);
  fulfilling = signal<string | null>(null); // ref being validated
  gabPaymentReference = signal('');
  gabTouched = signal(false);
  newAlert = signal(false);
  private prevPending = -1;

  agencySubs    = signal<Subscription[]>([]);
  agenceLoading = signal(false);

  pm = (r: Subscription) => payById(r.pay);
  status = (r: Subscription) => recordStatus(r);

  private poll?: ReturnType<typeof setInterval>;
  /** The last executed search query, so the live refresh re-runs the SAME search. */
  private lastQuery = '';

  ngOnInit() {
    this.loadStats();
    this.loadPending();
    // Keep the queue/counters, the search results AND the open record live without a manual reload.
    this.poll = setInterval(() => this.refreshLive(), LIVE_REFRESH_MS);
    const prefill = this.route.snapshot.queryParamMap.get('ref');
    if (prefill) { this.ref.set(prefill.toUpperCase()); this.open(prefill); }
  }
  ngOnDestroy() { if (this.poll) clearInterval(this.poll); this.clear(); }
  private loadStats() { this.api.cashierStats().subscribe({ next: (s) => this.stats.set(s), error: () => {} }); }

  /** Load the validation queue; a strong alert fires when its size grows (a new recharge to credit). */
  private loadPending() {
    this.api.pendingRecharges().subscribe({
      next: (list) => {
        const n = list.length;
        if (this.prevPending >= 0 && n > this.prevPending) this.raiseAlert();
        this.prevPending = n;
        this.pendingRch.set(list);
      },
      error: () => {},
    });
  }

  private raiseAlert() {
    this.newAlert.set(true);
    this.beep();
    setTimeout(() => this.newAlert.set(false), 8000);
  }

  /** Short double beep via the Web Audio API (no asset). Silently no-ops if audio is blocked. */
  private beep() {
    try {
      const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const blip = (at: number) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine'; o.frequency.value = 880;
        o.connect(g); g.connect(ctx.destination);
        g.gain.setValueAtTime(0.0001, ctx.currentTime + at);
        g.gain.exponentialRampToValueAtTime(0.35, ctx.currentTime + at + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + 0.18);
        o.start(ctx.currentTime + at); o.stop(ctx.currentTime + at + 0.2);
      };
      blip(0); blip(0.25);
      setTimeout(() => ctx.close(), 800);
    } catch { /* audio unavailable — the visual banner still shows */ }
  }

  setMode(m: 'especes' | 'gab' | 'recharges' | 'agence') {
    this.mode.set(m);
    if (m === 'recharges') { this.newAlert.set(false); this.loadPending(); if (this.rchView() === 'all') this.loadAllRch(); }
    if (m === 'agence') this.loadAgencySubs();
  }

  private loadAgencySubs() {
    const userAgency = this.auth.user()?.agency ?? '';
    this.agenceLoading.set(true);
    this.api.allSubscriptions().subscribe({
      next: (list) => {
        const filtered = list.filter(s =>
          s.delivery === 'agence' &&
          s.payStatus === 'paid' &&
          !s.printed &&
          (userAgency ? (s.pickupAgencyName ?? '').toLowerCase().includes(userAgency.toLowerCase()) : true)
        );
        this.agencySubs.set(filtered.reverse ? filtered.reverse() : filtered);
        this.agenceLoading.set(false);
      },
      error: () => this.agenceLoading.set(false),
    });
  }

  openFromAgency(ref: string) {
    this.mode.set('especes');
    this.ref.set(ref);
    this.open(ref);
  }
  goRecharges() { this.rchView.set('queue'); this.setMode('recharges'); }

  loadAllRch() {
    this.rchView.set('all');
    this.allRchLoading.set(true);
    this.api.recharges().subscribe({
      next: (list) => { this.allRch.set([...list].reverse()); this.allRchLoading.set(false); },
      error: () => this.allRchLoading.set(false),
    });
  }

  /** Cashier confirms the card has been credited → recharge validated, leaves the queue. */
  doFulfill(ref: string) {
    if (this.fulfilling()) return;
    this.fulfilling.set(ref);
    this.api.fulfillRecharge(ref).subscribe({
      next: () => {
        this.fulfilling.set(null);
        this.pendingRch.update((l) => l.filter((r) => r.ref !== ref));
        this.prevPending = this.pendingRch().length;
        if (this.rchView() === 'all') this.loadAllRch();
      },
      error: () => this.fulfilling.set(null),
    });
  }

  /** Silent background refresh: KPIs always; plus the open record's status OR the search
   *  results, so a payment moving (cash → payée) shows in near real-time. Never disturbs an
   *  in-flight action, the success screen, or the already-loaded selfie image. */
  private refreshLive() {
    this.loadStats();
    this.loadPending();   // keep the queue count + alert live regardless of the active mode
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
    this.gabPaymentReference.set(''); this.gabTouched.set(false);
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
  fmtPan = (v: string) => formatPan(v);
  fmtPhone = (v: string) => formatPhone(v);

  /** Confirm the cash was collected → marks the subscription paid (then printable). */
  doValidate(ref: string) {
    if (this.busy()) return;
    this.busy.set(true); this.err.set(false);
    this.api.cashValidate(ref, 'validate').subscribe({
      next: (s) => { this.rec.set(s); this.busy.set(false); this.justValidated.set(true); this.loadStats(); },
      error: () => { this.busy.set(false); this.err.set(true); },
    });
  }

  /** Validate a GAB collection: same cash record, but require the client payment reference. */
  doValidateGab(ref: string) {
    if (this.busy()) return;
    if (!this.gabPaymentReference().trim()) { this.gabTouched.set(true); return; }
    this.busy.set(true); this.err.set(false);
    this.api.cashValidate(ref, 'validate', undefined, this.gabPaymentReference().trim()).subscribe({
      next: (s) => { this.rec.set(s); this.busy.set(false); this.justValidated.set(true); this.gabPaymentReference.set(''); this.gabTouched.set(false); this.loadStats(); },
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
    if (s.hasCniRecto) this.loadImage(s.ref, 'cni-recto', this.rectoUrl);
    if (s.hasCniVerso) this.loadImage(s.ref, 'cni-verso', this.versoUrl);
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
    this.selfieUrl.set(null); this.rectoUrl.set(null); this.versoUrl.set(null);
    this.retakingPhoto.set(null); this.retakeBusy.set(false);
  }

  onRetakePhoto(ref: string, kind: string, dataUrl: string) {
    this.retakeBusy.set(true);
    this.api.uploadImage(dataUrl, kind).subscribe({
      next: (u) => this.api.updatePhoto(ref, kind, u.key).subscribe({
        next: (s) => {
          this.rec.set(s); this.retakingPhoto.set(null); this.retakeBusy.set(false);
          if (kind === 'selfie') { this.selfieUrl.set(null); this.loadImage(ref, 'selfie', this.selfieUrl); }
          if (kind === 'cni-recto') { this.rectoUrl.set(null); this.loadImage(ref, 'cni-recto', this.rectoUrl); }
          if (kind === 'cni-verso') { this.versoUrl.set(null); this.loadImage(ref, 'cni-verso', this.versoUrl); }
        },
        error: () => this.retakeBusy.set(false),
      }),
      error: () => this.retakeBusy.set(false),
    });
  }

  exit() { this.router.navigateByUrl(this.auth.landingPath()); }
  newSub() { this.router.navigateByUrl('/subscribe'); }
  newRecharge() { this.router.navigateByUrl('/recharge'); }
  goCollecte() { this.router.navigateByUrl('/collecte'); }
}
