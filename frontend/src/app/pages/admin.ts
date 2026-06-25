import { Component, OnDestroy, OnInit, Signal, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { I18n } from '../core/i18n';
import { Api } from '../core/api';
import { ConfigStore } from '../core/config-store';
import { Auth } from '../core/auth';
import { ActionAudit, AdminStats, Agency, AgencyPickupStats, ALL_ROLES, CardConfig, Collecte, CreateUserRequest, ImportAgenciesResult, ImportAgencyRow, ImportUserRow, ImportUsersResult, LoginAudit, PaymentStats, PaymentTrendBucket, PERM_MATRIX, Profile, Recharge, ReconcileReport, Role, Subscription, UpdateUserRequest, User } from '../core/models';
import { AppBarComponent } from '../shared/app-bar';
import { IconComponent } from '../shared/icon';
import { AvatarComponent } from '../shared/avatar';
import { FieldComponent } from '../shared/fields';
import { TxDetailComponent } from '../shared/tx-detail';
import { SpinnerComponent } from '../shared/spinner';
import { StatusBadgeComponent } from '../shared/status-badge';
import { ClientPhotoComponent } from '../shared/client-photo';
import { AdminMapComponent } from './admin-map';
import { NotifBellComponent } from '../shared/notif-bell';
import { RevealDirective } from '../shared/reveal';
import { livePoll, payById, recordStatus, formatPan, COLLECTE_PRODUCTS } from '../shared/constants';
import { SlicePipe, NgTemplateOutlet } from '@angular/common';
import * as XLSX from 'xlsx';

@Component({
  selector: 'page-admin',
  standalone: true,
  imports: [AppBarComponent, IconComponent, AvatarComponent, FieldComponent, TxDetailComponent, SpinnerComponent, StatusBadgeComponent, ClientPhotoComponent, AdminMapComponent, NotifBellComponent, FormsModule, SlicePipe, NgTemplateOutlet, RevealDirective],
  template: `
  <div class="scr">
    <app-bar class="appbar-wide">
      <notif-bell appbar-right></notif-bell>
      <button appbar-right class="icon-btn" (click)="auth.logout()" [title]="i18n.t('logout')"><ic name="logout" [size]="15" [sw]="2"></ic></button>
    </app-bar>

    <div class="admin-layout">
      <!-- ===== Sidebar ===== -->
      <aside class="admin-side">
        <div class="admin-userbox">
          <avatar [name]="auth.user()!.name" role="admin" [size]="40"></avatar>
          <div style="min-width:0">
            <div style="font-size:13.5px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{ auth.user()!.name }}</div>
            <div class="muted" style="font-size:11px">{{ i18n.t(isSupervisor() ? 'role_superviseur' : 'role_admin') }}</div>
          </div>
        </div>
        <!-- Mobile: toggle that collapses the nav so it no longer fills the top of the screen. -->
        <button type="button" class="admin-nav-toggle" (click)="menuOpen.set(!menuOpen())"
                [attr.aria-expanded]="menuOpen()" [attr.aria-label]="i18n.t('menu')">
          <ic [name]="menuOpen() ? 'x' : 'menu'" [size]="18"></ic>
          <span>{{ currentNavLabel() }}</span>
        </button>
        <nav class="admin-nav" [class.open]="menuOpen()" (click)="menuOpen.set(false)">
          @if (!isSupervisor()) {
          <button [class.active]="section() === 'overview'" (click)="section.set('overview')"><ic name="chart" [size]="18"></ic> {{ i18n.t('nav_overview') }}</button>
          <button [class.active]="section() === 'config'" (click)="section.set('config')"><ic name="gear" [size]="18"></ic> {{ i18n.t('nav_config') }}</button>
          }
          <button [class.active]="section() === 'users'" (click)="section.set('users')"><ic name="user" [size]="18"></ic> {{ i18n.t(isSupervisor() ? 'nav_collecteurs' : 'nav_users') }}</button>
          @if (auth.hasRole('COLLECTEUR')) {
          <button (click)="goCollecte()"><ic name="store" [size]="18"></ic> {{ i18n.t('my_collectes') }}</button>
          }
          @if (!isSupervisor()) {
          <button [class.active]="section() === 'agencies'" (click)="section.set('agencies')"><ic name="pin" [size]="18"></ic> {{ i18n.t('nav_agencies') }}</button>
          <button [class.active]="section() === 'agence-retrait'" (click)="section.set('agence-retrait'); loadAgenceRetrait()"><ic name="pin" [size]="18"></ic> {{ i18n.t('nav_agence_retrait') }}</button>
          <button [class.active]="section() === 'transactions'" (click)="section.set('transactions')"><ic name="hash" [size]="18"></ic> {{ i18n.t('nav_transactions') }}</button>
          <button [class.active]="section() === 'recharges'" (click)="section.set('recharges')"><ic name="phone" [size]="18"></ic> {{ i18n.t('nav_recharges') }}</button>
          <button [class.active]="section() === 'collectes'" (click)="section.set('collectes')"><ic name="store" [size]="18"></ic> {{ i18n.t('nav_collectes') }}</button>
          <button [class.active]="section() === 'habilitations'" (click)="section.set('habilitations'); loadProfiles()"><ic name="lock" [size]="18"></ic> {{ i18n.t('nav_habilitations') }}</button>
          <button [class.active]="section() === 'audit'" (click)="section.set('audit')"><ic name="shield" [size]="18"></ic> {{ i18n.t('nav_audit') }}</button>
          <button [class.active]="section() === 'map'" (click)="section.set('map')"><ic name="pin" [size]="18"></ic> {{ i18n.t('nav_map') }}</button>
          }
          <!-- Collecte statistics — reachable by supervisor (and admin) on a page of its own. -->
          <button (click)="goCollecteStats()"><ic name="chart" [size]="18"></ic> {{ i18n.t('nav_collecte_stats') }}</button>
        </nav>
        <div class="admin-spacer"></div>
        <nav class="admin-nav admin-logout">
          <button (click)="auth.logout()"><ic name="logout" [size]="18"></ic> {{ i18n.t('logout') }}</button>
        </nav>
      </aside>

      <!-- ===== Main content ===== -->
      <main class="admin-main">

      <!-- ===== Recharge stats card — defined once, rendered in the recharges section
                 and in the overview "Recharge" tab. ===== -->
      <ng-template #rchStatsTpl>
        @if (rLoading()) {
          <div class="card load-center"><spinner tone="primary" [size]="22"></spinner> {{ i18n.t('loading') }}</div>
        } @else if (rchKpi(); as k) {
        <div class="card" style="padding:16px;margin-bottom:12px" data-reveal="card">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px">
            <ic name="phone" [size]="17" style="color:var(--primary)"></ic>
            <h3 style="font-size:15px">{{ i18n.t('rch_kpi_title') }}</h3>
            <span style="margin-left:auto;display:inline-flex;align-items:center;gap:5px;font-size:10.5px;font-weight:700;color:var(--success)"><span class="live-dot"></span>{{ i18n.t('live_auto') }}</span>
          </div>

          <!-- 3 headline KPIs -->
          <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-bottom:14px">
            <div class="kpi" [title]="i18n.t('rch_kpi_success_desc')">
              <div class="kv" style="color:var(--success)">{{ k.paid }}</div>
              <div class="kl">{{ i18n.t('rch_kpi_success') }}</div>
            </div>
            <div class="kpi" [title]="i18n.t('rch_kpi_total_desc')">
              <div class="kv">{{ k.total }}</div>
              <div class="kl">{{ i18n.t('rch_kpi_total') }}</div>
            </div>
            <div class="kpi" [title]="i18n.t('rch_kpi_amount_desc')">
              <div class="kv" style="font-size:17px;color:var(--primary)">{{ i18n.money(k.amount) }}</div>
              <div class="kl">{{ i18n.t('rch_kpi_amount') }}</div>
            </div>
          </div>

          <!-- Status pills -->
          <div style="display:flex;flex-wrap:wrap;gap:8px;font-size:12px;font-weight:700">
            <span style="display:inline-flex;align-items:center;gap:5px;padding:5px 10px;border-radius:99px;background:var(--success-soft);color:var(--success)" [title]="i18n.t('rch_kpi_paid_desc')">
              {{ k.paid }} {{ i18n.t('st_paid') }}
            </span>
            <span style="display:inline-flex;align-items:center;gap:5px;padding:5px 10px;border-radius:99px;background:var(--surface-2);color:var(--muted)" [title]="i18n.t('rch_kpi_pending_desc')">
              {{ k.pending }} {{ i18n.t('st_pending') }}
            </span>
            <span style="display:inline-flex;align-items:center;gap:5px;padding:5px 10px;border-radius:99px;background:var(--accent-soft);color:var(--accent)" [title]="i18n.t('rch_kpi_failed_desc')">
              {{ k.failed }} {{ i18n.t('pay_funnel_technical_failed') }}
            </span>
          </div>

          <!-- 14-day trend chart -->
          @if (k.trends.length) {
          <div style="margin-top:14px;border-top:1px solid var(--border);padding-top:12px">
            <div class="muted" style="font-size:11.5px;font-weight:700;margin-bottom:4px">{{ i18n.t('rch_trend_title') }}</div>
            <p class="muted" style="font-size:10px;line-height:1.35;margin-bottom:10px">{{ i18n.t('pay_trends_hint') }}</p>
            <div style="display:flex;align-items:flex-end;gap:3px;height:110px;padding-bottom:2px">
              @for (b of k.trends; track b.date) {
                <div style="flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;height:100%;justify-content:flex-end"
                     [title]="trendDayLabel(b.date) + ' — ' + i18n.t('st_paid') + ': ' + b.paid + ', ' + i18n.t('st_failed') + ': ' + b.failed + ', ' + i18n.t('st_pending') + ': ' + b.pending">
                  <div style="width:100%;max-width:28px;display:flex;flex-direction:column-reverse;gap:1px">
                    @if (b.paid)    { <div [style.height.px]="rchTrendBarPx(b.paid)"    style="background:var(--success);border-radius:2px 2px 0 0;min-height:2px"></div> }
                    @if (b.failed)  { <div [style.height.px]="rchTrendBarPx(b.failed)"  style="background:var(--accent);min-height:2px"></div> }
                    @if (b.pending) { <div [style.height.px]="rchTrendBarPx(b.pending)" style="background:var(--af-gold);border-radius:0 0 2px 2px;min-height:2px"></div> }
                  </div>
                  <span style="font-size:8px;color:var(--muted);margin-top:4px;white-space:nowrap">{{ trendDayLabel(b.date) }}</span>
                </div>
              }
            </div>
            <div style="display:flex;flex-wrap:wrap;gap:12px;margin-top:8px;font-size:10.5px;font-weight:600">
              <span style="color:var(--success)">■ {{ i18n.t('st_paid') }}</span>
              <span style="color:var(--accent)">■ {{ i18n.t('st_failed') }}</span>
              <span style="color:var(--af-gold)">■ {{ i18n.t('st_pending') }}</span>
            </div>
          </div>
          }

          <!-- By network -->
          <div style="margin-top:14px;border-top:1px solid var(--border);padding-top:12px">
            <div class="muted" style="font-size:11.5px;font-weight:700;margin-bottom:6px">{{ i18n.t('pay_funnel_by_network') }}</div>
            <div class="srow" style="padding:6px 0"><span class="lbl">Orange Money</span><span class="val">{{ k.om.paid }}/{{ k.om.total }} · {{ rate(k.om.paid, k.om.total) }}%</span></div>
            <div class="srow" style="padding:6px 0"><span class="lbl">MTN MoMo</span><span class="val">{{ k.mtn.paid }}/{{ k.mtn.total }} · {{ rate(k.mtn.paid, k.mtn.total) }}%</span></div>
            <div class="srow" style="padding:6px 0"><span class="lbl">SARA Money</span><span class="val">{{ k.sara.paid }}/{{ k.sara.total }} · {{ rate(k.sara.paid, k.sara.total) }}%</span></div>
            <div class="srow" style="padding:6px 0"><span class="lbl">{{ i18n.t('pay_cash_name') }}</span><span class="val">{{ k.cash.paid }}/{{ k.cash.total }} · {{ rate(k.cash.paid, k.cash.total) }}%</span></div>
          </div>
        </div>
        } @else {
          <p class="muted" style="font-size:13px;padding:20px 14px;text-align:center">{{ i18n.t('rch_empty') }}</p>
        }
      </ng-template>

      <!-- ========== OVERVIEW ========== -->
      @if (section() === 'overview') {
      <div reveal="screen">
      <!-- En-tête avec filtre date (le filtre ne s'applique qu'à l'onglet Achat) -->
      <div style="display:flex;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:12px" data-reveal="item">
        <h1 style="font-size:21px;margin:0;flex:1;min-width:140px">{{ i18n.t('nav_overview') }}</h1>
        @if (overviewTab() === 'achat') {
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
          <input class="input" type="date" [value]="overviewFrom()" (change)="overviewFrom.set($any($event.target).value)"
                 style="width:130px;font-size:12px;padding:5px 8px" title="Depuis" />
          <span class="muted" style="font-size:12px">→</span>
          <input class="input" type="date" [value]="overviewTo()" (change)="overviewTo.set($any($event.target).value)"
                 style="width:130px;font-size:12px;padding:5px 8px" title="Jusqu'au" />
          @if (overviewFrom() || overviewTo()) {
            <button class="btn btn-ghost" (click)="clearOverviewFilter()" style="padding:5px 10px;font-size:12px">✕ Tout</button>
          }
        </div>
        }
      </div>

      <!-- Onglets : Achat (vue existante, par défaut) / Recharge (stats recharge) -->
      <div style="display:flex;gap:6px;margin-bottom:14px;max-width:760px">
        <button class="btn" [class.btn-primary]="overviewTab()==='achat'" [class.btn-outline]="overviewTab()!=='achat'"
                (click)="overviewTab.set('achat')" style="flex:1;padding:8px;font-size:13px">
          <ic name="hash" [size]="14"></ic> {{ i18n.t('ov_tab_achat') }}
        </button>
        <button class="btn" [class.btn-primary]="overviewTab()==='recharge'" [class.btn-outline]="overviewTab()!=='recharge'"
                (click)="overviewTab.set('recharge')" style="flex:1;padding:8px;font-size:13px">
          <ic name="phone" [size]="14"></ic> {{ i18n.t('ov_tab_recharge') }}
        </button>
      </div>

      @if (overviewTab() === 'recharge') {
        <ng-container [ngTemplateOutlet]="rchStatsTpl"></ng-container>
      } @else {
      @if (statsLoading()) {
      <div class="card load-center"><spinner tone="primary" [size]="22"></spinner> {{ i18n.t('loading') }}</div>
      } @else {

      <!-- ===== AUJOURD'HUI — section permanente indépendante du filtre ===== -->
      <div class="card" style="padding:14px 16px;margin-bottom:10px;border-left:3px solid var(--primary)" data-reveal="card">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:10px">
          <ic name="calendar" [size]="15" style="color:var(--primary)"></ic>
          <span style="font-size:12px;font-weight:800;color:var(--primary);text-transform:uppercase;letter-spacing:.07em">Aujourd'hui</span>
        </div>
        <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1px;background:var(--border);border-radius:8px;overflow:hidden">
          <div style="text-align:center;padding:10px 8px;background:var(--surface)">
            <div class="kv-anim" style="font-size:26px;font-weight:900;color:var(--success);font-variant-numeric:tabular-nums;line-height:1.1"
                 [attr.data-val]="stats()?.todayPaid ?? 0">{{ stats()?.todayPaid ?? 0 }}</div>
            <div style="font-size:11px;font-weight:700;color:var(--muted);margin-top:3px">Cartes payées</div>
          </div>
          <div style="text-align:center;padding:10px 8px;background:var(--surface)">
            <div class="kv-anim" style="font-size:26px;font-weight:900;color:var(--primary);font-variant-numeric:tabular-nums;line-height:1.1"
                 [attr.data-val]="stats()?.todayPrinted ?? 0">{{ stats()?.todayPrinted ?? 0 }}</div>
            <div style="font-size:11px;font-weight:700;color:var(--muted);margin-top:3px">Cartes récupérées</div>
          </div>
          <div style="text-align:center;padding:10px 8px;background:var(--surface)">
            <div class="kv-anim amount-anim" style="font-size:17px;font-weight:900;color:var(--af-gold);font-variant-numeric:tabular-nums;line-height:1.2"
                 [attr.data-val]="stats()?.todayCollected ?? 0">{{ i18n.money(stats()?.todayCollected ?? 0) }}</div>
            <div style="font-size:11px;font-weight:700;color:var(--muted);margin-top:3px">Encaissé</div>
          </div>
          <div style="text-align:center;padding:10px 8px;background:var(--surface)">
            <div class="kv-anim" style="font-size:26px;font-weight:900;color:var(--af-gold);font-variant-numeric:tabular-nums;line-height:1.1"
                 [attr.data-val]="stats()?.todayPending ?? 0">{{ stats()?.todayPending ?? 0 }}</div>
            <div style="font-size:11px;font-weight:700;color:var(--muted);margin-top:3px">En attente validation</div>
          </div>
        </div>
      </div>

      <!-- ===== KPIs globaux (filtrables par date) ===== -->
      <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px">
        <div class="kpi" data-reveal="kpi"><div class="kv" style="color:var(--success)">{{ stats()?.paid ?? 0 }}</div><div class="kl">{{ i18n.t('kpi_success') }}{{ (overviewFrom() || overviewTo()) ? ' (période)' : '' }}</div></div>
        <div class="kpi" data-reveal="kpi"><div class="kv" style="color:var(--primary)">{{ stats()?.totalPrinted ?? 0 }}</div><div class="kl">Cartes récupérées{{ (overviewFrom() || overviewTo()) ? ' (période)' : '' }}</div></div>
        <div class="kpi" data-reveal="kpi" style="position:relative;overflow:hidden">
          <div class="kv amount-block" style="color:var(--primary)">
            <span class="amount-main">{{ fmtAmount(stats()?.collected ?? 0) }}</span>
            <span class="amount-unit">FCFA</span>
          </div>
          <div class="kl">{{ i18n.t('kpi_collected') }}{{ (overviewFrom() || overviewTo()) ? ' (période)' : '' }}</div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:10px">
        <div class="kpi" data-reveal="kpi"><div class="kv">{{ stats()?.total ?? 0 }}</div><div class="kl">{{ i18n.t('kpi_total') }}{{ (overviewFrom() || overviewTo()) ? ' (période)' : '' }}</div></div>
        <div class="kpi" data-reveal="kpi"><div class="kv" style="color:var(--af-gold)">{{ stats()?.pending ?? 0 }}</div><div class="kl">{{ i18n.t('kpi_pending') }}{{ (overviewFrom() || overviewTo()) ? ' (période)' : '' }}</div></div>
        <div class="kpi" data-reveal="kpi" (click)="showFailed()" style="cursor:pointer"
             [style.borderColor]="technicalFailed() ? 'color-mix(in srgb, var(--accent) 45%, var(--border))' : 'var(--border)'"
             [style.background]="technicalFailed() ? 'var(--accent-soft)' : 'var(--surface)'">
          <div class="kv" style="color:var(--accent)">{{ technicalFailed() }}</div>
          <div class="kl">{{ i18n.t('pay_funnel_technical_failed') }}{{ (overviewFrom() || overviewTo()) ? ' (période)' : '' }}</div>
        </div>
      </div>

      <!-- ===== Mobile Money payment funnel ===== -->
      @if (payStats(); as p) {
        <div class="card" style="padding:16px" data-reveal="card">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px">
            <ic name="phone" [size]="17" style="color:var(--primary)"></ic>
            <h3 style="font-size:15px">{{ i18n.t('pay_funnel_title') }}{{ (overviewFrom() || overviewTo()) ? ' (période)' : '' }}</h3>
            <span style="margin-left:auto;display:inline-flex;align-items:center;gap:5px;font-size:10.5px;font-weight:700;color:var(--success)" [title]="i18n.t('live_auto')"><span class="live-dot"></span>{{ i18n.t('live_auto') }}</span>
          </div>
          <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px">
            <div class="kpi"><div class="kv">{{ p.momoTotal }}</div><div class="kl">{{ i18n.t('pay_funnel_total') }}</div></div>
            <div class="kpi"><div class="kv" style="color:var(--success)">{{ rate(p.momoPaid, p.momoTotal) }}%</div><div class="kl">{{ i18n.t('pay_funnel_success_rate') }}</div></div>
            <div class="kpi"><div class="kv" style="font-size:17px">{{ p.medianConfirmSeconds }}s</div><div class="kl">{{ i18n.t('pay_funnel_median') }}</div></div>
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:12px;font-size:12px;font-weight:700">
            <span style="display:inline-flex;align-items:center;gap:5px;padding:5px 10px;border-radius:99px;background:var(--success-soft);color:var(--success)">{{ p.momoPaid }} {{ i18n.t('st_paid') }}</span>
            <span style="display:inline-flex;align-items:center;gap:5px;padding:5px 10px;border-radius:99px;background:var(--surface-2);color:var(--muted)">{{ p.momoPending }} {{ i18n.t('st_pending') }}</span>
            <span style="display:inline-flex;align-items:center;gap:5px;padding:5px 10px;border-radius:99px;background:var(--accent-soft);color:var(--accent)">{{ p.networkOrUnknownFailed }} {{ i18n.t('pay_funnel_technical_failed') }}</span>
          </div>
          @if (p.trends.length) {
            <div style="margin-top:14px;border-top:1px solid var(--border);padding-top:12px">
              <div class="muted" style="font-size:11.5px;font-weight:700;margin-bottom:4px">{{ i18n.t('pay_trends_title') }}</div>
              <p class="muted" style="font-size:10px;line-height:1.35;margin-bottom:10px">{{ i18n.t('pay_trends_hint') }}</p>
              <div style="display:flex;align-items:flex-end;gap:3px;height:110px;padding-bottom:2px">
                @for (b of p.trends; track b.date) {
                  <div style="flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;height:100%;justify-content:flex-end" [title]="trendTooltip(b)">
                    <div style="width:100%;max-width:28px;display:flex;flex-direction:column-reverse;gap:1px">
                      @if (b.paid) {
                        <div [style.height.px]="trendBarPx(b.paid, p.trends)" style="background:var(--success);border-radius:2px 2px 0 0;min-height:2px"></div>
                      }
                      @if (b.failed) {
                        <div [style.height.px]="trendBarPx(b.failed, p.trends)" style="background:var(--accent);min-height:2px"></div>
                      }
                      @if (b.pending) {
                        <div [style.height.px]="trendBarPx(b.pending, p.trends)" style="background:var(--af-gold);border-radius:0 0 2px 2px;min-height:2px"></div>
                      }
                    </div>
                    <span style="font-size:8px;color:var(--muted);margin-top:4px;white-space:nowrap">{{ trendDayLabel(b.date) }}</span>
                  </div>
                }
              </div>
              <div style="display:flex;flex-wrap:wrap;gap:12px;margin-top:8px;font-size:10.5px;font-weight:600">
                <span style="color:var(--success)">■ {{ i18n.t('st_paid') }}</span>
                <span style="color:var(--accent)">■ {{ i18n.t('st_failed') }}</span>
                <span style="color:var(--af-gold)">■ {{ i18n.t('st_pending') }}</span>
              </div>
            </div>
          }
          <div style="margin-top:14px">
            <div class="muted" style="font-size:11.5px;font-weight:700;margin-bottom:6px">{{ i18n.t('pay_funnel_by_network') }}</div>
            <div class="srow" style="padding:6px 0;cursor:pointer;border-radius:6px;transition:background .15s"
                 (click)="showPayFilter('om')" title="Voir les transactions Orange Money"
                 (mouseenter)="$any($event.target).style.background='var(--surface-2)'" (mouseleave)="$any($event.target).style.background=''">
              <span class="lbl" style="color:var(--primary);text-decoration:underline dotted">Orange Money ↗</span>
              <span class="val">{{ p.orangePaid }}/{{ p.orangeTotal }} · {{ rate(p.orangePaid, p.orangeTotal) }}%</span>
            </div>
            <div class="srow" style="padding:6px 0;cursor:pointer;border-radius:6px;transition:background .15s"
                 (click)="showPayFilter('mtn')" title="Voir les transactions MTN MoMo"
                 (mouseenter)="$any($event.target).style.background='var(--surface-2)'" (mouseleave)="$any($event.target).style.background=''">
              <span class="lbl" style="color:var(--primary);text-decoration:underline dotted">MTN MoMo ↗</span>
              <span class="val">{{ p.mtnPaid }}/{{ p.mtnTotal }} · {{ rate(p.mtnPaid, p.mtnTotal) }}%</span>
            </div>
          </div>
          @if (p.failuresByCategory.length) {
            <div style="margin-top:12px;border-top:1px solid var(--border);padding-top:10px">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
                <span class="muted" style="font-size:11.5px;font-weight:700">{{ i18n.t('pay_funnel_failures') }} · {{ p.networkOrUnknownFailed }} {{ i18n.t('pay_funnel_technical_failed').toLowerCase() }}</span>
                <button class="btn btn-ghost" (click)="exportFailures()" style="margin-left:auto;padding:4px 9px;font-size:11px"><ic name="copy" [size]="13"></ic> {{ i18n.t('tx_export') }}</button>
              </div>
              @for (b of p.failuresByCategory; track b.category) {
                <div style="margin-bottom:8px">
                  <div style="display:flex;align-items:center;gap:8px;font-size:12px;margin-bottom:2px">
                    <span style="min-width:0;flex:1;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{ failLabel(b.category) }}</span>
                    <span style="font-weight:800">{{ b.count }}</span>
                    <span class="muted" style="font-size:10.5px;width:38px;text-align:right">{{ failRate(b, p) }}%</span>
                  </div>
                  <div style="height:6px;border-radius:99px;background:var(--surface-2);overflow:hidden">
                    <div [style.width.%]="failRate(b, p)" style="height:100%;background:var(--accent);border-radius:99px;transition:width .4s"></div>
                  </div>
                </div>
              }
              <p class="muted" style="font-size:10.5px;line-height:1.4;margin-top:4px">{{ i18n.t('pay_funnel_failures_note') }}</p>
            </div>
          }
        </div>
      }

      <!-- ===== Réconciliation des paiements : vérifier les N dernières heures ===== -->
      <div class="card" style="padding:16px" data-reveal="card">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
          <ic name="refresh" [size]="17" style="color:var(--primary)"></ic>
          <h3 style="font-size:15px">{{ i18n.t('recon_title') }}</h3>
        </div>
        <p class="muted" style="font-size:11.5px;line-height:1.45;margin-bottom:12px">{{ i18n.t('recon_sub') }}</p>
        <div style="display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap">
          <field [label]="i18n.t('recon_hours')" style="flex:0 0 130px">
            <input type="number" min="1" max="168" [value]="reconHours()"
                   (input)="reconHours.set(clampHours($any($event.target).value))" />
          </field>
          <button class="btn btn-primary" (click)="runReconcile()" [disabled]="reconLoading()" style="width:auto;padding:11px 18px">
            @if (reconLoading()) { <spinner [size]="18"></spinner> } @else { <ic name="refresh" [size]="18"></ic> {{ i18n.t('recon_run') }} }
          </button>
        </div>
        @if (reconError()) {
          <div class="feedback err-box" style="font-size:12.5px;margin-top:12px"><ic name="alert" [size]="16" style="flex-shrink:0"></ic> {{ reconError() }}</div>
        }
        @if (reconReport(); as r) {
          <div style="margin-top:14px;border-top:1px solid var(--border);padding-top:12px">
            <div class="muted" style="font-size:11px;margin-bottom:8px">{{ i18n.t('recon_window', { hours: r.hours }) }}</div>
            <div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px">
              <div class="kpi"><div class="kv">{{ r.scanned }}</div><div class="kl">{{ i18n.t('recon_scanned') }}</div></div>
              <div class="kpi"><div class="kv" style="color:var(--success)">{{ reconChanged().length }}</div><div class="kl">{{ i18n.t('recon_updated') }}</div></div>
              <div class="kpi"><div class="kv" style="color:var(--muted)">{{ r.unchanged + reconReasonRefreshed() }}</div><div class="kl">{{ i18n.t('recon_unchanged') }}</div></div>
              <div class="kpi"><div class="kv" [style.color]="r.errors ? 'var(--accent)' : 'var(--muted)'">{{ r.errors }}</div><div class="kl">{{ i18n.t('recon_errors') }}</div></div>
            </div>
            @if (reconChanged().length) {
              <div style="margin-top:12px">
                <div class="muted" style="font-size:11.5px;font-weight:700;margin-bottom:6px">{{ i18n.t('recon_changes') }}</div>
                @for (d of reconChanged(); track d.ref) {
                  <div class="srow" style="padding:5px 0;font-size:12px">
                    <span class="lbl">{{ d.ref }}</span>
                    <span class="val">{{ d.statusBefore }} → <b [style.color]="d.statusAfter === 'paid' ? 'var(--success)' : 'var(--accent)'">{{ d.statusAfter }}</b></span>
                  </div>
                }
              </div>
            } @else {
              <p class="muted" style="font-size:11.5px;margin-top:10px">{{ i18n.t('recon_none') }}</p>
            }
            @if (reconReasonRefreshed()) {
              <p class="muted" style="font-size:11px;margin-top:8px">{{ i18n.t('recon_reason_refreshed', { count: reconReasonRefreshed() }) }}</p>
            }
          </div>
        }
      </div>

      <!-- ===== Vérification live : régulariser TOUS les dossiers pending/failed (historique), logs en direct ===== -->
      <div class="card" style="padding:16px" data-reveal="card">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
          <ic name="refresh" [size]="17" style="color:var(--primary)"></ic>
          <h3 style="font-size:15px">{{ i18n.t('vstream_title') }}</h3>
        </div>
        <p class="muted" style="font-size:11.5px;line-height:1.45;margin-bottom:12px">{{ i18n.t('vstream_sub') }}</p>
        <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">
          @if (!streamRunning()) {
            <button class="btn btn-primary" (click)="runStream()" style="width:auto;padding:11px 18px">
              <ic name="refresh" [size]="18"></ic> {{ i18n.t('vstream_run') }}
            </button>
          } @else {
            <button class="btn" (click)="stopStream()" style="width:auto;padding:11px 18px">
              <spinner [size]="16"></spinner> {{ i18n.t('vstream_stop') }}
            </button>
          }
          @if (streamTotal()) {
            <span class="muted" style="font-size:12px;font-weight:700">{{ streamDone() }} / {{ streamTotal() }}</span>
          }
        </div>

        @if (streamError()) {
          <div class="feedback err-box" style="font-size:12.5px;margin-top:12px"><ic name="alert" [size]="16" style="flex-shrink:0"></ic> {{ streamError() }}</div>
        }

        @if (streamRunning() || streamTotal() || streamLines().length) {
          <div style="margin-top:14px;border-top:1px solid var(--border);padding-top:12px">
            <div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px">
              <div class="kpi"><div class="kv">{{ streamDone() }}</div><div class="kl">{{ i18n.t('recon_scanned') }}</div></div>
              <div class="kpi"><div class="kv" style="color:var(--success)">{{ streamUpdated() }}</div><div class="kl">{{ i18n.t('recon_updated') }}</div></div>
              <div class="kpi"><div class="kv" style="color:var(--muted)">{{ streamUnchanged() + streamReason() }}</div><div class="kl">{{ i18n.t('recon_unchanged') }}</div></div>
              <div class="kpi"><div class="kv" [style.color]="streamErrors() ? 'var(--accent)' : 'var(--muted)'">{{ streamErrors() }}</div><div class="kl">{{ i18n.t('recon_errors') }}</div></div>
            </div>
            @if (streamReason()) {
              <p class="muted" style="font-size:11px;margin-top:8px">{{ i18n.t('recon_reason_refreshed', { count: streamReason() }) }}</p>
            }
            <div class="vstream-log" style="margin-top:12px;max-height:300px;overflow:auto;background:rgba(0,0,0,.03);border:1px solid var(--border);border-radius:8px;padding:8px 10px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:11.5px;line-height:1.65;white-space:pre-wrap;word-break:break-word">
              @for (l of streamLines(); track l.i) {
                <div [style.color]="l.color">{{ l.text }}</div>
              } @empty {
                <div class="muted">{{ i18n.t('vstream_waiting') }}</div>
              }
            </div>
          </div>
        }
      </div>

      <div class="card" style="padding:16px" data-reveal="card">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px">
          <ic name="award" [size]="17" style="color:var(--primary)"></ic>
          <h3 style="font-size:15px">{{ i18n.t('by_agent') }}</h3>
          <span class="muted" style="font-size:11.5px;margin-left:4px">({{ (stats()?.byAgent?.length ?? 0) }} chargés)</span>
        </div>
        <div style="display:flex;flex-direction:column;gap:14px">
          @for (r of pagedAgents(); track r.id) {
            <div style="display:flex;align-items:center;gap:11px">
              @if (r.role === 'online') {
                <span class="op-logo" style="width:34px;height:34px;border-radius:50%;background:var(--surface-2);color:var(--muted);flex-shrink:0"><ic name="qr" [size]="17"></ic></span>
              } @else {
                <avatar [name]="r.name" role="agent" [size]="34"></avatar>
              }
              <div style="min-width:0;flex:1">
                <div style="display:flex;justify-content:space-between;gap:8px">
                  <span style="font-size:13px;font-weight:700;flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{ r.role === 'online' ? i18n.t('online_channel') : r.name }}</span>
                  <span style="font-size:12.5px;font-weight:800;white-space:nowrap;flex-shrink:0">{{ r.count }} <span class="muted" style="font-weight:600">{{ i18n.t(r.count > 1 ? 'sales_unit' : 'sale_unit') }}</span></span>
                </div>
                <div style="height:7px;background:var(--surface-2);border-radius:99px;margin-top:5px;overflow:hidden">
                  <div [style.width.%]="pct(r.count)" [style.background]="r.role === 'online' ? 'var(--muted)' : 'var(--primary)'" style="height:100%;border-radius:99px;transition:width .4s"></div>
                </div>
                <div class="muted" style="font-size:11px;margin-top:4px">{{ r.agency || i18n.t('arrived_via') }} · {{ i18n.money(r.collected) }}</div>
              </div>
            </div>
          }
        </div>
        @if (agentPageCount() > 1) {
          <div style="display:flex;align-items:center;justify-content:center;gap:10px;margin-top:14px;border-top:1px solid var(--border);padding-top:12px">
            <button class="icon-btn" (click)="agentPrev()" [disabled]="agentPage() === 0" style="width:30px;height:30px"><ic name="chevL" [size]="15"></ic></button>
            <span class="muted" style="font-size:12px;font-weight:700">{{ agentPage() + 1 }} / {{ agentPageCount() }}</span>
            <button class="icon-btn" (click)="agentNext()" [disabled]="agentPage() === agentPageCount()-1" style="width:30px;height:30px"><ic name="chevR" [size]="15"></ic></button>
          </div>
        }
      </div>
      }
      }

      </div>
      }

      <!-- ========== CONFIG ========== -->
      @if (section() === 'config') {
      <div reveal="screen">
      <h1 style="font-size:21px" data-reveal="item">{{ i18n.t('nav_config') }}</h1>
      <div class="card" style="padding:16px" data-reveal="card">
        <div style="display:flex;align-items:flex-start;gap:9px;margin-bottom:14px">
          <ic name="gear" [size]="17" style="color:var(--primary);flex-shrink:0;margin-top:2px"></ic>
          <div style="min-width:0">
            <h3 style="font-size:15px;line-height:1.2">{{ i18n.t('config_title') }}</h3>
            <p class="muted" style="font-size:11.5px;line-height:1.4;margin-top:3px">{{ i18n.t('config_sub') }}</p>
          </div>
        </div>
        @if (cfgLoading()) {
        <div class="load-center"><spinner tone="primary" [size]="22"></spinner> {{ i18n.t('loading') }}</div>
        } @else {
        <div style="display:flex;flex-direction:column;gap:12px">
          <field [label]="i18n.t('card_price')">
            <div class="input-prefix"><input inputmode="numeric" [value]="cfg().price" (input)="onCfg('price', $event)" /><span class="pfx" style="border-right:none;border-left:1.5px solid var(--border)">{{ i18n.t('fcfa') }}</span></div>
          </field>
          <field [label]="i18n.t('fees')">
            <div class="input-prefix"><input inputmode="numeric" [value]="cfg().fees" (input)="onCfg('fees', $event)" /><span class="pfx" style="border-right:none;border-left:1.5px solid var(--border)">{{ i18n.t('fcfa') }}</span></div>
          </field>
          <field [label]="i18n.t('transport_fee')">
            <div class="input-prefix"><input inputmode="numeric" [value]="cfg().transport" (input)="onCfg('transport', $event)" /><span class="pfx" style="border-right:none;border-left:1.5px solid var(--border)">{{ i18n.t('fcfa') }}</span></div>
          </field>

          <!-- Offre Promote: carte gratuite — le client paie la recharge initiale + le Pass Premium. -->
          <div style="border-top:1px solid var(--border);padding-top:12px;margin-top:2px">
            <div style="font-size:12.5px;font-weight:800;color:var(--primary);margin-bottom:4px">{{ i18n.t('cfg_offer_title') }}</div>
            <p class="muted" style="font-size:11px;line-height:1.4;margin-bottom:10px">{{ i18n.t('cfg_offer_sub') }}</p>

            <!-- Carte bancaire (type par défaut). -->
            <div style="font-size:11.5px;font-weight:700;color:var(--text);margin-bottom:6px">{{ i18n.t('cfg_offer_bancaire_title') }}</div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px">
              <field [label]="i18n.t('offer_recharge_initiale')" style="flex:1">
                <div class="input-prefix"><input inputmode="numeric" [value]="cfg().rechargeInitialeBancaire" (input)="onCfg('rechargeInitialeBancaire', $event)" /><span class="pfx" style="border-right:none;border-left:1.5px solid var(--border)">{{ i18n.t('fcfa') }}</span></div>
              </field>
              <field [label]="i18n.t('offer_pass_premium')" style="flex:1">
                <div class="input-prefix"><input inputmode="numeric" [value]="cfg().passPremiumBancaire" (input)="onCfg('passPremiumBancaire', $event)" /><span class="pfx" style="border-right:none;border-left:1.5px solid var(--border)">{{ i18n.t('fcfa') }}</span></div>
              </field>
            </div>
            <div class="srow total" style="margin-top:8px"><span class="lbl">{{ i18n.t('total') }}</span><span class="val">{{ i18n.money((cfg().rechargeInitialeBancaire || 0) + (cfg().passPremiumBancaire || 0)) }}</span></div>

            <!-- Carte prépayée. -->
            <div style="font-size:11.5px;font-weight:700;color:var(--text);margin:14px 0 6px">{{ i18n.t('cfg_offer_prepaid_title') }}</div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px">
              <field [label]="i18n.t('offer_recharge_initiale')" style="flex:1">
                <div class="input-prefix"><input inputmode="numeric" [value]="cfg().rechargeInitiale" (input)="onCfg('rechargeInitiale', $event)" /><span class="pfx" style="border-right:none;border-left:1.5px solid var(--border)">{{ i18n.t('fcfa') }}</span></div>
              </field>
              <field [label]="i18n.t('offer_pass_premium')" style="flex:1">
                <div class="input-prefix"><input inputmode="numeric" [value]="cfg().passPremium" (input)="onCfg('passPremium', $event)" /><span class="pfx" style="border-right:none;border-left:1.5px solid var(--border)">{{ i18n.t('fcfa') }}</span></div>
              </field>
            </div>
            <div class="srow total" style="margin-top:8px"><span class="lbl">{{ i18n.t('total') }}</span><span class="val">{{ i18n.money((cfg().rechargeInitiale || 0) + (cfg().passPremium || 0)) }}</span></div>
          </div>

          <!-- Recharge (top-up) free-entry amount bounds. -->
          <div style="border-top:1px solid var(--border);padding-top:12px;margin-top:2px">
            <div style="font-size:12.5px;font-weight:800;color:var(--primary);margin-bottom:10px">{{ i18n.t('cfg_recharge_title') }}</div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px">
              <field [label]="i18n.t('cfg_recharge_min')" style="flex:1">
                <div class="input-prefix"><input inputmode="numeric" [value]="cfg().rechargeMin" (input)="onCfg('rechargeMin', $event)" /><span class="pfx" style="border-right:none;border-left:1.5px solid var(--border)">{{ i18n.t('fcfa') }}</span></div>
              </field>
              <field [label]="i18n.t('cfg_recharge_max')" style="flex:1">
                <div class="input-prefix"><input inputmode="numeric" [value]="cfg().rechargeMax" (input)="onCfg('rechargeMax', $event)" /><span class="pfx" style="border-right:none;border-left:1.5px solid var(--border)">{{ i18n.t('fcfa') }}</span></div>
              </field>
            </div>
          </div>

          <button class="btn btn-primary" [disabled]="!changed() || saving()" (click)="saveCfg()" style="padding:12px">
            @if (saving()) { <spinner></spinner> } @else if (saved()) { <ic name="check" [size]="18" [sw]="2.5"></ic> {{ i18n.t('saved') }} } @else { {{ i18n.t('save') }} }
          </button>
          @if (saveErr()) { <p class="err" style="font-size:12px;text-align:center;margin-top:2px">{{ i18n.t('save_error') }}</p> }
        </div>
        }
      </div>

      </div>
      }

      <!-- ========== USERS ========== -->
      @if (section() === 'users') {
      <div reveal="screen">
      <h1 style="font-size:21px" data-reveal="item">{{ i18n.t('nav_users') }}</h1>
      <p class="muted" style="font-size:13px;line-height:1.45;margin-top:-8px;margin-bottom:12px" data-reveal="item">{{ i18n.t('users_sub') }}</p>

      <!-- Toolbar: search + filters + actions -->
      <div class="card" style="padding:14px 16px;margin-bottom:12px" data-reveal="card">
        <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center">
          <div class="input-prefix" style="flex:1;min-width:200px">
            <span class="pfx"><ic name="search" [size]="16"></ic></span>
            <input [placeholder]="i18n.t('user_search_ph')" [value]="userSearch()" (input)="userSearch.set($any($event.target).value)" />
          </div>
          <button class="btn btn-primary" (click)="openUserCreate()" style="padding:10px 14px;font-size:13px;white-space:nowrap">
            <ic name="plus" [size]="16"></ic> {{ i18n.t('user_new') }}
          </button>
          @if (!isSupervisor()) {
            <button class="btn btn-outline" (click)="openUserImport()" style="padding:10px 14px;font-size:13px;white-space:nowrap">
              <ic name="download" [size]="16"></ic> {{ i18n.t('user_import_btn') }}
            </button>
          }
        </div>
        <!-- Secondary filter row -->
        <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:10px;padding-top:10px;border-top:1px solid var(--border)">
          <span class="muted" style="font-size:11.5px;white-space:nowrap">{{ i18n.t('user_filter_role') }}</span>
          <button (click)="userFilterRole.set(null)"
                  [class.btn-primary]="userFilterRole() === null" [class.btn-ghost]="userFilterRole() !== null"
                  class="btn" style="padding:4px 9px;font-size:11.5px">{{ i18n.t('user_filter_all_roles') }}</button>
          @for (r of allRoles; track r) {
            <button (click)="userFilterRole.set(userFilterRole() === r ? null : r)"
                    [class.btn-primary]="userFilterRole() === r" [class.btn-ghost]="userFilterRole() !== r"
                    class="btn" style="padding:4px 9px;font-size:11.5px">{{ roleLabel(r) }}</button>
          }
          <span class="muted" style="font-size:11.5px;white-space:nowrap;margin-left:8px">{{ i18n.t('user_filter_date_from') }}</span>
          <input type="date" class="input" style="width:140px;padding:4px 8px;font-size:12px"
                 [value]="userFilterDateFrom()" (change)="userFilterDateFrom.set($any($event.target).value)" />
          <span class="muted" style="font-size:11.5px;white-space:nowrap">{{ i18n.t('user_filter_date_to') }}</span>
          <input type="date" class="input" style="width:140px;padding:4px 8px;font-size:12px"
                 [value]="userFilterDateTo()" (change)="userFilterDateTo.set($any($event.target).value)" />
          @if (hasActiveFilters()) {
            <button class="btn btn-ghost" (click)="clearUserFilters()" style="padding:4px 9px;font-size:11.5px;margin-left:auto">
              <ic name="x" [size]="13"></ic> {{ i18n.t('user_filters_clear') }}
            </button>
          }
        </div>
      </div>

      @if ((createdPw() || createdPin()) && (userMsg() === 'created' || userMsg() === 'recreated' || userMsg() === 'reset')) {
      <div class="card" style="padding:14px 16px;margin-bottom:12px;background:var(--surface-2)">
        <div style="font-size:12px;color:var(--success);font-weight:700;margin-bottom:8px">{{ i18n.t(userMsg() === 'recreated' ? 'user_recreated' : userMsg() === 'reset' ? 'user_reset_done' : 'user_created_pw') }}</div>
        @if (createdPw()) {
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <code style="font-size:14px;font-weight:700;letter-spacing:.5px">{{ createdPw() }}</code>
          <button class="btn btn-outline" style="padding:6px 10px;font-size:12px" (click)="copyPw()">
            <ic name="copy" [size]="15"></ic> {{ pwCopied() ? i18n.t('copied') : i18n.t('copy_btn') }}
          </button>
        </div>
        }
        @if (createdPin()) {
          <div style="margin-top:10px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <span class="muted" style="font-size:11.5px">{{ i18n.t('user_created_pin') }}</span>
            <code style="font-size:18px;font-weight:800;letter-spacing:3px">{{ createdPin() }}</code>
            <button class="btn btn-outline" style="padding:6px 10px;font-size:12px" (click)="copyPin()">
              <ic name="copy" [size]="15"></ic> {{ pinCopied() ? i18n.t('copied') : i18n.t('copy_btn') }}
            </button>
          </div>
        }
      </div>
      }

      <!-- Main accounts list -->
      <div class="card" style="padding:16px" data-reveal="card">
        <div class="kicker" style="margin-bottom:10px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-weight:600;font-size:12px">
            <input type="checkbox" [checked]="isAllPageSelected()" [indeterminate]="isSomePageSelected()" (change)="toggleSelectAllPage()" style="cursor:pointer" />
            {{ i18n.t('users_list') }} · {{ filteredUsers().length }}@if (hasActiveFilters() || userSearch().trim()) { / {{ usersList().length }} }
          </label>
          @if (selectedUserIds().size > 0) {
            <span class="badge" style="background:var(--primary-soft,#e8f0fe);color:var(--primary);font-size:11px">{{ selectedUserIds().size }} {{ i18n.t('user_selected_n') }}</span>
          }
          <button class="btn btn-ghost" (click)="openNotifPanel(false)" style="padding:4px 9px;font-size:11px;display:flex;align-items:center;gap:5px"><ic name="bell" [size]="13"></ic> Notifier</button>
          <button class="btn btn-ghost" (click)="refreshSection('users')" style="padding:4px 9px;font-size:11px" [title]="i18n.t('dash_refresh')"><ic name="refresh" [size]="13"></ic></button>
          <button class="btn btn-ghost" (click)="exportUsers()" [disabled]="!filteredUsers().length" style="margin-left:auto;padding:4px 9px;font-size:11px"><ic name="copy" [size]="13"></ic> {{ i18n.t('tx_export') }}</button>
        </div>
        <!-- Bulk action bar -->
        @if (selectedUserIds().size > 0) {
          <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:10px 12px;margin-bottom:10px;background:var(--surface-2);border-radius:8px;border:1px solid var(--border)">
            <span style="font-size:12.5px;font-weight:700">{{ selectedUserIds().size }} {{ i18n.t('user_selected_n') }}</span>
            <span class="muted" style="font-size:12px">{{ i18n.t('user_bulk_assign') }}</span>
            <select class="input" style="padding:5px 8px;font-size:12px;width:auto" (change)="bulkAssignRole.set($any($event.target).value || null)">
              <option value="">{{ i18n.t('user_bulk_role_ph') }}</option>
              @for (r of allRoles; track r) { <option [value]="r" [selected]="bulkAssignRole() === r">{{ roleLabel(r) }}</option> }
            </select>
            <button class="btn btn-primary" [disabled]="!bulkAssignRole() || bulkAssignBusy()" (click)="applyBulkAssign()" style="padding:5px 11px;font-size:12px">
              @if (bulkAssignBusy()) { <spinner [size]="14"></spinner> } @else { {{ i18n.t('user_bulk_assign_btn') }} }
            </button>
            @if (bulkAssignMsg() === 'done') {
              <span style="font-size:11.5px;color:var(--success);font-weight:700">{{ i18n.t('user_bulk_assigned') }}</span>
            }
            <!-- Send notification — initialise avec la sélection courante -->
            <button class="btn btn-ghost" (click)="openNotifPanel(true)" style="padding:5px 10px;font-size:12px;display:flex;align-items:center;gap:5px">
              <ic name="bell" [size]="14"></ic> Notifier
            </button>
            <button class="btn btn-ghost" (click)="clearSelection()" style="padding:5px 10px;font-size:12px;margin-left:auto">{{ i18n.t('cancel_short') }}</button>
          </div>
        }

        <!-- ===== Panneau de composition de notification ===== -->
        @if (notifPanelOpen()) {
          <div style="padding:16px;margin-bottom:12px;background:var(--surface);border-radius:10px;border:1px solid var(--border);box-shadow:0 2px 8px rgba(0,0,0,.06)">

            <!-- En-tête -->
            <div style="font-size:13px;font-weight:800;margin-bottom:14px;display:flex;align-items:center;gap:6px">
              <ic name="bell" [size]="15" style="color:var(--primary)"></ic>
              Composer une notification
            </div>

            <!-- Chips de rôles -->
            <div style="margin-bottom:10px">
              <div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:7px">Destinataires — sélection multiple</div>
              <div style="display:flex;flex-wrap:wrap;gap:6px">
                @for (rc of notifRoleChips; track rc.role) {
                  <button
                    (click)="toggleNotifRole(rc.role)"
                    [disabled]="countByRole(rc.role) === 0"
                    [style]="isRoleFullySelected(rc.role)
                      ? 'padding:5px 12px;font-size:12px;font-weight:700;border-radius:99px;border:none;cursor:pointer;background:var(--primary);color:#fff;display:flex;align-items:center;gap:5px'
                      : 'padding:5px 12px;font-size:12px;font-weight:600;border-radius:99px;border:1.5px solid var(--border);cursor:pointer;background:var(--surface-2);color:var(--fg);display:flex;align-items:center;gap:5px'">
                    {{ rc.label }}
                    <span style="font-size:11px;opacity:.75">({{ countByRole(rc.role) }})</span>
                  </button>
                }
              </div>
            </div>

            <!-- Résumé destinataires -->
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;padding:8px 10px;background:var(--surface-2);border-radius:6px;min-height:32px">
              @if (notifRecipientIds().size > 0) {
                <span style="font-size:12px;font-weight:700;color:var(--primary)">{{ notifRecipientIds().size }} destinataire(s)</span>
                <button (click)="clearNotifRecipients()"
                        style="font-size:11px;color:var(--accent);font-weight:700;background:none;border:none;cursor:pointer;padding:0">
                  Effacer
                </button>
              } @else {
                <span style="font-size:12px;color:var(--muted)">Aucun destinataire — cliquez sur un ou plusieurs groupes ci-dessus</span>
              }
            </div>

            <!-- Formulaire -->
            <div style="display:flex;flex-direction:column;gap:8px">
              <input class="input" placeholder="Objet de la notification" [(ngModel)]="notifTitle" style="font-size:13px" />
              <textarea class="input" placeholder="Message (optionnel)" [(ngModel)]="notifBody" rows="3" style="font-size:13px;resize:vertical"></textarea>
              <!-- Image jointe -->
              <div>
                @if (!notifImageData()) {
                  <label style="display:inline-flex;align-items:center;gap:6px;cursor:pointer;padding:6px 10px;border:1.5px dashed var(--border);border-radius:7px;font-size:12px;color:var(--muted);background:var(--surface-2)">
                    <ic name="camera" [size]="14"></ic> Joindre une image (optionnel)
                    <input type="file" accept="image/*" (change)="onNotifImagePicked($event)" style="display:none" />
                  </label>
                } @else {
                  <div style="display:flex;align-items:flex-start;gap:8px;padding:8px;background:var(--surface-2);border-radius:8px;border:1px solid var(--border)">
                    <img [src]="notifImageData()!" style="width:72px;height:72px;object-fit:cover;border-radius:6px;flex-shrink:0" alt="aperçu" />
                    <div style="flex:1;min-width:0">
                      <div style="font-size:12px;font-weight:700;margin-bottom:4px">Image jointe</div>
                      <button class="btn btn-ghost" (click)="clearNotifImage()" style="padding:3px 8px;font-size:11px;color:var(--accent)">
                        <ic name="trash" [size]="12"></ic> Supprimer
                      </button>
                    </div>
                  </div>
                }
              </div>
            </div>

            <!-- Actions -->
            <div style="display:flex;align-items:center;gap:8px;margin-top:12px;flex-wrap:wrap">
              <button class="btn btn-primary"
                      [disabled]="!notifTitle.trim() || !notifRecipientIds().size || notifBusy()"
                      (click)="sendNotification()"
                      style="padding:6px 14px;font-size:12.5px">
                @if (notifBusy()) { <spinner [size]="14"></spinner> } @else { <ic name="send" [size]="13"></ic> &nbsp;Envoyer }
              </button>
              @if (notifMsg() === 'done') {
                <span style="font-size:12px;color:var(--success);font-weight:700">Notification envoyée !</span>
              }
              @if (notifMsg() === 'error') {
                <span style="font-size:12px;color:var(--accent);font-weight:700">Erreur lors de l&#x2019;envoi.</span>
              }
              <button class="btn btn-ghost" (click)="notifPanelOpen.set(false)" style="padding:5px 10px;font-size:12px;margin-left:auto">Fermer</button>
            </div>
          </div>
        }
        @if (usersLoading()) {
        <div style="display:flex;flex-direction:column">
          @for (n of skeletonRows; track n) {
            <div style="display:flex;align-items:center;gap:10px;padding:9px 2px;border-top:1px solid var(--border)">
              <span class="skel" style="width:22px;height:22px;border-radius:3px;flex-shrink:0"></span>
              <span class="skel" style="width:30px;height:30px;border-radius:50%;flex-shrink:0"></span>
              <div style="flex:1;min-width:0">
                <span class="skel" style="width:55%;height:13px;display:block;margin-bottom:5px"></span>
                <span class="skel" style="width:38%;height:10px;display:block"></span>
              </div>
              <span class="skel" style="width:64px;height:20px;border-radius:99px"></span>
            </div>
          }
        </div>
        } @else if (!filteredUsers().length) {
        <p class="muted" style="font-size:13px;text-align:center;padding:24px 8px">{{ i18n.t('users_no_match') }}</p>
        } @else {
        <div style="display:flex;flex-direction:column">
          @for (u of pagedUsers(); track u.id) {
            <div style="display:flex;align-items:center;gap:10px;padding:9px 2px;border-top:1px solid var(--border);flex-wrap:wrap" [style.opacity]="u.enabled === false ? '.5' : '1'">
              <input type="checkbox" [checked]="selectedUserIds().has(u.id)" (change)="toggleSelectUser(u)" style="cursor:pointer;flex-shrink:0" />
              <avatar [name]="u.name" [size]="30"></avatar>
              <div style="min-width:120px;flex:1">
                <div style="font-size:13px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{ u.name }}</div>
                <div class="muted" style="font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{ u.email }}</div>
                @if (u.phone) {
                  <div class="muted" style="font-size:10.5px;margin-top:1px">{{ u.phone }}@if (u.agency) { · {{ u.agency }} }</div>
                }
              </div>
              <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end;margin-left:auto;flex-shrink:0">
                @if (u.enabled === false) {
                  <span class="badge" style="background:var(--accent-soft);color:var(--accent);font-size:10px">{{ i18n.t('user_disabled') }}</span>
                }
                @for (pid of (u.profileIds ?? []); track pid) {
                  @if (profileById(pid); as pr) {
                    <span class="badge" style="background:var(--surface-2);color:var(--muted);font-size:10.5px">{{ pr.name }}</span>
                  }
                }
                @if (!(u.profileIds ?? []).length) {
                  @for (r of userRoles(u); track r) {
                    <span class="badge" style="background:var(--surface-2);color:var(--muted);font-size:10.5px">{{ roleLabel(r) }}</span>
                  }
                }
                @if (!isSupervisor()) {
                  <button class="icon-btn" (click)="startEditUser(u)" [title]="i18n.t('user_edit_info')" style="flex-shrink:0"><ic name="pencil" [size]="15"></ic></button>
                  <button class="icon-btn" (click)="startEditRoles(u)" title="Modifier les rôles" style="flex-shrink:0"><ic name="award" [size]="15"></ic></button>
                  <button class="icon-btn" (click)="startAssignProfiles(u)" [title]="i18n.t('hab_assign_profiles')" style="flex-shrink:0"><ic name="shield" [size]="15"></ic></button>
                }
                @if (!isSupervisor() || userRoles(u).includes('COLLECTEUR')) {
                  <button class="icon-btn" (click)="toggleUserActions(u)" [title]="i18n.t('user_more_actions')" style="flex-shrink:0"><ic name="more" [size]="15" [sw]="3"></ic></button>
                }
              </div>
              @if (editUserId() === u.id) {
                <div style="flex-basis:100%;border-top:1px dashed var(--border);margin-top:6px;padding-top:8px;display:flex;flex-direction:column;gap:8px">
                  <field [label]="i18n.t('user_name')"><input class="input" [value]="editUser().name" (input)="onEditUser('name', $event)" /></field>
                  <field [label]="i18n.t('user_email')"><input class="input" type="email" [value]="editUser().email" (input)="onEditUser('email', $event)" /></field>
                  <field [label]="i18n.t('user_phone')" [hint]="i18n.t('user_phone_hint')"
                         [err]="(editUser().phone || '') && !editUserPhoneOk() ? i18n.t('user_phone_invalid') : null">
                    <input class="input" inputmode="numeric" maxlength="9" [value]="editUser().phone || ''" (input)="onEditUser('phone', $event)" />
                  </field>
                  @if (userRoles(u).includes('AGENT')) {
                    <field [label]="i18n.t('user_agency')"><input class="input" [value]="editUser().agency || ''" (input)="onEditUser('agency', $event)" /></field>
                  }
                  @if (editUserErr()) { <span class="err" style="font-size:11.5px">{{ i18n.t(editUserErr()) }}</span> }
                  @if (editUserMsg() === 'updated') { <span style="font-size:11.5px;color:var(--success);font-weight:700">{{ i18n.t('user_updated') }}</span> }
                  <div style="display:flex;gap:8px">
                    <button class="btn btn-primary" (click)="saveUser(u)" [disabled]="!editUserValid() || editUserSaving()" style="padding:7px 12px;font-size:12.5px">
                      @if (editUserSaving()) { <spinner></spinner> } @else { {{ i18n.t('save') }} }
                    </button>
                    <button class="btn btn-ghost" (click)="cancelEditUser()" [disabled]="editUserSaving()" style="padding:7px 12px;font-size:12.5px">{{ i18n.t('cancel_short') }}</button>
                  </div>
                </div>
              }
              @if (assignProfilesId() === u.id) {
                <div style="flex-basis:100%;border-top:1px dashed var(--border);margin-top:6px;padding-top:8px;display:flex;flex-direction:column;gap:10px">
                  <div class="kicker">{{ i18n.t('hab_assign_profiles') }}</div>
                  <div style="display:flex;flex-wrap:wrap;gap:7px">
                    @for (pr of profilesList(); track pr.id) {
                      <button type="button" (click)="toggleAssignProfile(pr.id)"
                              [class.btn-primary]="assignProfileIds().includes(pr.id)"
                              [class.btn-outline]="!assignProfileIds().includes(pr.id)"
                              class="btn" style="padding:5px 10px;font-size:11.5px">{{ pr.name }}</button>
                    }
                  </div>
                  @if (assignProfilesErr()) { <span class="err" style="font-size:11.5px">{{ i18n.t(assignProfilesErr()) }}</span> }
                  @if (assignProfilesMsg()) { <span style="font-size:11.5px;color:var(--success);font-weight:700">{{ i18n.t('hab_assign_saved') }}</span> }
                  <div style="display:flex;gap:8px">
                    <button class="btn btn-primary" (click)="saveAssignProfiles(u)" [disabled]="assignProfilesSaving()" style="padding:7px 12px;font-size:12.5px">
                      @if (assignProfilesSaving()) { <spinner></spinner> } @else { {{ i18n.t('hab_assign_save') }} }
                    </button>
                    <button class="btn btn-ghost" (click)="assignProfilesId.set(null)" [disabled]="assignProfilesSaving()" style="padding:7px 12px;font-size:12.5px">{{ i18n.t('cancel_short') }}</button>
                  </div>
                </div>
              }
              @if (editRolesId() === u.id) {
                <div style="flex-basis:100%;border-top:1px dashed var(--border);margin-top:6px;padding-top:8px;display:flex;flex-direction:column;gap:8px">
                  <div class="kicker">Rôles de l'utilisateur</div>
                  <div style="display:flex;flex-wrap:wrap;gap:7px">
                    @for (r of allRoles; track r) {
                      <button type="button" (click)="toggleEditRole(r)"
                              [class.btn-primary]="editRoles().includes(r)"
                              [class.btn-outline]="!editRoles().includes(r)"
                              class="btn" style="padding:5px 10px;font-size:11.5px">{{ roleLabel(r) }}</button>
                    }
                  </div>
                  @if (!editRoles().length) {
                    <span class="err" style="font-size:11.5px">Au moins un rôle requis</span>
                  }
                  @if (editRolesErr()) {
                    <span class="err" style="font-size:11.5px">{{ i18n.t(editRolesErr()) }}</span>
                  }
                  <div style="display:flex;gap:8px">
                    <button class="btn btn-primary" (click)="saveRoles(u)" [disabled]="!editRoles().length || editRolesSaving()" style="padding:7px 12px;font-size:12.5px">
                      @if (editRolesSaving()) { <spinner></spinner> } @else { {{ i18n.t('save') }} }
                    </button>
                    <button class="btn btn-ghost" (click)="editRolesId.set(null)" [disabled]="editRolesSaving()" style="padding:7px 12px;font-size:12.5px">{{ i18n.t('cancel_short') }}</button>
                  </div>
                </div>
              }
              @if (userActionsId() === u.id) {
                <div style="flex-basis:100%;border-top:1px dashed var(--border);margin-top:6px;padding-top:8px;display:flex;flex-wrap:wrap;gap:8px;align-items:center">
                  @if (u.enabled === false) {
                    <button class="btn btn-primary" (click)="recreateUser(u)" [disabled]="userRecreating() === u.id"
                            style="padding:6px 12px;font-size:12px;white-space:nowrap">
                      @if (userRecreating() === u.id) { <spinner [size]="14"></spinner> } @else { {{ i18n.t('user_recreate') }} }
                    </button>
                  }
                  @if (u.enabled !== false) {
                    <button class="btn btn-outline" (click)="resetUserCredentials(u)" [disabled]="userResetting() === u.id"
                            style="padding:6px 12px;font-size:12px;white-space:nowrap">
                      @if (userResetting() === u.id) { <spinner [size]="14"></spinner> } @else { {{ i18n.t('user_reset_credentials') }} }
                    </button>
                  }
                  @if (u.id !== auth.user()?.id) {
                    <button class="btn btn-outline" (click)="toggleUser(u)" [disabled]="userToggling() === u.id"
                            style="padding:6px 12px;font-size:12px;white-space:nowrap">
                      {{ u.enabled === false ? i18n.t('user_enable') : i18n.t('user_disable') }}
                    </button>
                  }
                  <button class="btn btn-ghost" (click)="userActionsId.set(null)" style="padding:6px 12px;font-size:12px;margin-left:auto">{{ i18n.t('cancel_short') }}</button>
                </div>
              }
            </div>
          }
        </div>
        @if (userToggleErr()) { <p class="err" style="font-size:12px;text-align:center;margin-top:6px">{{ i18n.t(userToggleErr()) }}</p> }
        @if (userPageCount() > 1) {
          <div class="tx-pager">
            <span class="muted" style="font-size:11.5px">{{ i18n.t('step') }} {{ userPage() + 1 }} {{ i18n.t('of') }} {{ userPageCount() }}</span>
            <div style="display:flex;gap:6px">
              <button class="btn btn-outline" (click)="userPrev()" [disabled]="userPage() === 0" style="padding:7px 12px;font-size:13px"><ic name="chevL" [size]="16"></ic></button>
              <button class="btn btn-outline" (click)="userNext()" [disabled]="userPage() >= userPageCount() - 1" style="padding:7px 12px;font-size:13px"><ic name="chevR" [size]="16"></ic></button>
            </div>
          </div>
        }
        }
      </div>

      <!-- Create user panel -->
      @if (userPanel() === 'create') {
      <div class="card" style="padding:16px;margin-top:12px">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:14px">
          <h3 style="font-size:15px;margin:0">{{ i18n.t('user_new') }}</h3>
          <button type="button" class="icon-btn" (click)="closeUserPanel()" [title]="i18n.t('cancel_short')"><ic name="x" [size]="18"></ic></button>
        </div>
        <div style="display:flex;flex-direction:column;gap:10px">
          <field [label]="i18n.t('user_name')"><input class="input" [value]="nu().name" (input)="onNu('name', $event)" /></field>
          <field [label]="i18n.t('user_email')"><input class="input" type="email" [value]="nu().email" (input)="onNu('email', $event)" /></field>
          <field [label]="i18n.t('user_phone')" [hint]="i18n.t('user_phone_hint')"
                 [err]="(nu().phone || '') && !phoneOk() ? i18n.t('user_phone_invalid') : null">
            <input class="input" inputmode="numeric" maxlength="9" [value]="nu().phone || ''" (input)="onNu('phone', $event)" />
          </field>
          @if (nuHasRole('AGENT')) {
            <field [label]="i18n.t('user_agency')"><input class="input" [value]="nu().agency || ''" (input)="onNu('agency', $event)" /></field>
          }
          <field [label]="i18n.t('user_roles')" [hint]="i18n.t(isSupervisor() ? 'sup_collecteur_only' : 'user_roles_hint')">
            @if (isSupervisor()) {
              <span class="badge" style="background:var(--surface-2);color:var(--text);font-size:12px;padding:6px 11px">{{ roleLabel('COLLECTEUR') }}</span>
            } @else {
              <div style="display:flex;flex-wrap:wrap;gap:7px">
                @for (r of allRoles; track r) {
                  <button type="button" (click)="toggleNuRole(r)"
                          [class.btn-primary]="nuHasRole(r)" [class.btn-outline]="!nuHasRole(r)"
                          class="btn" style="padding:6px 11px;font-size:12px">{{ roleLabel(r) }}</button>
                }
              </div>
            }
          </field>
          @if (nuHasRole('COLLECTEUR')) {
            <p class="muted" style="font-size:11.5px;line-height:1.4;margin:-2px 0 2px">{{ i18n.t('collecteur_pin_note') }}</p>
          }
          <p class="muted" style="font-size:11.5px;line-height:1.4;margin:-2px 0 2px">{{ i18n.t('user_pw_note') }}</p>
          <button class="btn btn-primary" [disabled]="!userValid() || userBusy()" (click)="createUser()" style="padding:12px">
            @if (userBusy()) { <spinner></spinner> } @else { <ic name="plus" [size]="17"></ic> {{ i18n.t('user_create') }} }
          </button>
          @if (userMsg() === 'created' && createdPw()) {
            <div class="feedback" style="flex-direction:column;align-items:stretch;gap:6px;background:var(--surface-2);border-radius:10px;padding:10px 12px">
              <span style="font-size:12px;color:var(--success);font-weight:700">{{ i18n.t('user_created_pw') }}</span>
              <div style="display:flex;align-items:center;gap:8px">
                <code style="font-size:14px;font-weight:700;letter-spacing:.5px;flex:1">{{ createdPw() }}</code>
                <button class="btn btn-outline" style="padding:6px 10px;font-size:12px" (click)="copyPw()">
                  <ic name="copy" [size]="15"></ic> {{ pwCopied() ? i18n.t('copied') : i18n.t('copy_btn') }}
                </button>
              </div>
            </div>
          }
          @if (userMsg() === 'created' && createdPin()) {
            <div class="feedback" style="flex-direction:column;align-items:stretch;gap:6px;background:var(--surface-2);border-radius:10px;padding:10px 12px">
              <span style="font-size:12px;color:var(--success);font-weight:700">{{ i18n.t('user_created_pin') }}</span>
              <div style="display:flex;align-items:center;gap:8px">
                <code style="font-size:18px;font-weight:800;letter-spacing:3px;flex:1">{{ createdPin() }}</code>
                <button class="btn btn-outline" style="padding:6px 10px;font-size:12px" (click)="copyPin()">
                  <ic name="copy" [size]="15"></ic> {{ pinCopied() ? i18n.t('copied') : i18n.t('copy_btn') }}
                </button>
              </div>
            </div>
          }
          @if (userMsg() === 'exists') { <p class="err" style="font-size:12px;text-align:center">{{ i18n.t('user_exists') }}</p> }
          @if (userMsg() === 'phone_exists') { <p class="err" style="font-size:12px;text-align:center">{{ i18n.t('user_phone_exists') }}</p> }
          @if (userMsg() === 'invalid') { <p class="err" style="font-size:12px;text-align:center">{{ i18n.t('user_invalid') }}</p> }
        </div>
      </div>
      }

      <!-- Bulk import users — admin only -->
      @if (userPanel() === 'import' && !isSupervisor()) {
      <div class="card" style="padding:16px;margin-top:12px">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px">
          <div style="display:flex;align-items:flex-start;gap:9px;min-width:0">
            <ic name="download" [size]="17" style="color:var(--primary);flex-shrink:0;margin-top:2px"></ic>
            <div style="min-width:0">
              <h3 style="font-size:15px;line-height:1.2;margin:0">{{ i18n.t('import_title') }}</h3>
              <p class="muted" style="font-size:11.5px;line-height:1.4;margin-top:3px">{{ i18n.t('import_sub') }}</p>
            </div>
          </div>
          <button type="button" class="icon-btn" (click)="closeUserPanel()" [title]="i18n.t('cancel_short')"><ic name="x" [size]="18"></ic></button>
        </div>

        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">
          <button class="btn btn-outline" (click)="importFile.click()" style="flex:1;min-width:140px;padding:9px;font-size:13px"><ic name="copy" [size]="15"></ic> {{ i18n.t('import_pick') }}</button>
          <button class="btn btn-ghost" (click)="downloadTemplate()" style="flex:1;min-width:120px;padding:9px;font-size:13px"><ic name="download" [size]="15"></ic> {{ i18n.t('import_template') }}</button>
        </div>
        <input #importFile type="file" accept=".csv,text/csv,text/plain" (change)="onImportFile($event)" style="display:none" />

        <field [label]="i18n.t('import_paste_label')">
          <textarea class="input" rows="4" [placeholder]="i18n.t('import_paste_ph')" [value]="importText()" (input)="onImportText($event)" style="resize:vertical;font-family:var(--font);line-height:1.5"></textarea>
        </field>

        @if (preview().length) {
          <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:10px;font-size:12px;font-weight:700">
            <span style="color:var(--success)">{{ importCounts().created }} {{ i18n.t('import_new') }}</span>
            <span style="color:var(--af-gold)">{{ importCounts().dup }} {{ i18n.t('import_dup') }}</span>
            @if (importCounts().invalid) { <span style="color:var(--accent)">{{ importCounts().invalid }} {{ i18n.t('import_invalid') }}</span> }
          </div>

          <div style="margin-top:10px">
            <div class="muted" style="font-size:11px;font-weight:700;margin-bottom:5px">{{ i18n.t('import_dup_policy') }}</div>
            <div style="display:flex;gap:6px">
              <button class="btn" [class.btn-primary]="!importUpdate()" [class.btn-outline]="importUpdate()" (click)="importUpdate.set(false)" style="flex:1;padding:8px;font-size:12.5px">{{ i18n.t('import_skip') }}</button>
              <button class="btn" [class.btn-primary]="importUpdate()" [class.btn-outline]="!importUpdate()" (click)="importUpdate.set(true)" style="flex:1;padding:8px;font-size:12.5px">{{ i18n.t('import_update') }}</button>
            </div>
          </div>

          <div style="max-height:220px;overflow-y:auto;margin-top:10px;border:1px solid var(--border);border-radius:var(--radius)">
            @for (r of preview(); track $index) {
              <div style="display:flex;align-items:center;gap:8px;padding:7px 9px;border-bottom:1px solid var(--border)">
                @switch (r.status) {
                  @case ('new') { <span class="badge" style="background:color-mix(in srgb, var(--success) 18%, transparent);color:var(--success);font-size:10px;flex-shrink:0">{{ i18n.t('import_new') }}</span> }
                  @case ('duplicate') { <span class="badge" style="background:color-mix(in srgb, var(--af-gold) 22%, transparent);color:#8a6400;font-size:10px;flex-shrink:0">{{ i18n.t('import_dup') }}</span> }
                  @case ('invalid') { <span class="badge" style="background:var(--accent-soft);color:var(--accent);font-size:10px;flex-shrink:0">{{ i18n.t('import_invalid') }}</span> }
                }
                <div style="min-width:0;flex:1">
                  <div style="font-size:12.5px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{ r.name || '—' }} <span class="muted" style="font-weight:500">· {{ r.role || '—' }}</span></div>
                  <div class="muted" style="font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{ r.email || '—' }}@if (r.status === 'invalid') { · <span style="color:var(--accent)">{{ impReason(r.reason) }}</span> }</div>
                </div>
              </div>
            }
          </div>

          <div style="display:flex;gap:8px;margin-top:10px">
            <button class="btn btn-primary" [disabled]="importBusy() || !importActionable()" (click)="runImport()" style="flex:1;padding:11px">
              @if (importBusy()) { <spinner></spinner> } @else { <ic name="check" [size]="17"></ic> {{ i18n.t('import_run') }} {{ importActionable() }} {{ i18n.t('import_lines') }} }
            </button>
            <button class="btn btn-ghost" (click)="clearImport()" [disabled]="importBusy()" style="padding:11px">{{ i18n.t('tx_clear') }}</button>
          </div>
          @if (importErr()) { <p class="err" style="font-size:12px;text-align:center;margin-top:6px">{{ i18n.t('import_error') }}</p> }
        }

        @if (importResult(); as res) {
          <div class="card" style="background:var(--surface-2);padding:12px 14px;margin-top:12px">
            <div style="font-size:13px;font-weight:800;margin-bottom:6px"><ic name="check" [size]="15" style="color:var(--success);vertical-align:-2px"></ic> {{ i18n.t('import_done') }}</div>
            <div style="font-size:12.5px;line-height:1.7">
              <b style="color:var(--success)">{{ res.created }}</b> {{ i18n.t('import_created') }} ·
              <b>{{ res.updated }}</b> {{ i18n.t('import_updated') }} ·
              <b>{{ res.skipped }}</b> {{ i18n.t('import_skipped') }}@if (res.invalid) { · <b style="color:var(--accent)">{{ res.invalid }}</b> {{ i18n.t('import_invalid_n') }} }
            </div>

            @if (importCreds().length) {
              <div class="kicker" style="margin-top:12px;margin-bottom:4px">{{ i18n.t('import_creds_title') }}</div>
              <p class="muted" style="font-size:11px;line-height:1.4;margin-bottom:8px">{{ i18n.t('import_creds_hint') }}</p>
              <div style="max-height:160px;overflow-y:auto;font-size:12px">
                @for (c of importCreds(); track c.email) {
                  <div style="display:flex;justify-content:space-between;gap:8px;padding:4px 0;border-top:1px solid var(--border)">
                    <span class="muted" style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ c.email }}</span>
                    <code style="font-weight:800;flex-shrink:0">{{ c.tempPassword }}</code>
                  </div>
                }
              </div>
              <button class="btn btn-outline" (click)="downloadCredentials()" style="width:100%;padding:9px;font-size:13px;margin-top:8px"><ic name="download" [size]="15"></ic> {{ i18n.t('import_creds_download') }}</button>
            }
          </div>
        }
      </div>
      }

      </div>
      }

      <!-- ========== PICKUP AGENCIES (lieux de retrait) ========== -->
      @if (section() === 'agencies') {
      <div reveal="screen">
      <h1 style="font-size:21px" data-reveal="item">{{ i18n.t('nav_agencies') }}</h1>

      <!-- Pickup-agency statistics -->
      <div class="card" style="padding:16px" data-reveal="card">
        <!-- Header -->
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
          <ic name="chart" [size]="16" style="color:var(--primary)"></ic>
          <h3 style="font-size:14.5px">{{ i18n.t('ag_stats_title') }}</h3>
          @if (agPickupStats(); as s) {
            <span class="muted" style="margin-left:auto;font-size:11.5px;font-weight:700">{{ agPickupTotal() }} {{ i18n.t('tx_count') }}</span>
          }
          <button class="icon-btn" (click)="refreshAgencies()" [title]="i18n.t('dash_refresh')" style="color:var(--muted)"><ic name="refresh" [size]="14"></ic></button>
        </div>

        <!-- Period filter -->
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px">
          @for (p of [{v:'all',l:'ag_period_all'},{v:'week',l:'ag_period_week'},{v:'month',l:'ag_period_month'},{v:'custom',l:'ag_period_custom'}]; track p.v) {
            <button class="btn" style="padding:4px 11px;font-size:12px"
              [class.btn-primary]="agStatsPeriod() === p.v"
              [class.btn-outline]="agStatsPeriod() !== p.v"
              (click)="agStatsPeriod.set($any(p.v))">{{ i18n.t(p.l) }}</button>
          }
        </div>
        @if (agStatsPeriod() === 'custom') {
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:12px">
            <input class="input" type="date" [value]="agStatsFrom()" (change)="agStatsFrom.set($any($event.target).value)" style="flex:1;min-width:105px" />
            <span class="muted" style="font-size:12px">→</span>
            <input class="input" type="date" [value]="agStatsTo()" (change)="agStatsTo.set($any($event.target).value)" style="flex:1;min-width:105px" />
          </div>
        }

        @if (agStatsLoading()) {
          <!-- Skeleton -->
          <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-bottom:14px">
            @for (n of [1,2,3]; track n) {
              <div class="kpi"><span class="skel" style="width:40px;height:28px;display:block;margin-bottom:6px"></span><span class="skel" style="width:70%;height:11px;display:block"></span></div>
            }
          </div>
          @for (n of [1,2,3,4,5]; track n) {
            <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-top:1px solid var(--border)">
              <span class="skel" style="width:20px;height:12px;display:block"></span>
              <div style="flex:1;min-width:0"><span class="skel" style="width:65%;height:13px;display:block;margin-bottom:5px"></span><span class="skel" style="width:100%;height:5px;display:block"></span></div>
              <span class="skel" style="width:24px;height:16px;display:block"></span>
            </div>
          }
        } @else if (agPickupStats(); as s) {
          <!-- Delivery-mode KPIs -->
          <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-bottom:14px">
            <div class="kpi" [style.borderColor]="'var(--primary)'" style="border-width:2px">
              <div class="kv" style="font-size:20px;color:var(--primary)">{{ s.totalAgence }}</div>
              <div class="kl">{{ i18n.t('ag_delivery_agence') }}</div>
              @if (agPickupTotal() > 0) {
                <div style="margin-top:6px;height:4px;border-radius:2px;background:var(--surface-2);overflow:hidden">
                  <div [style.width.%]="s.totalAgence * 100 / agPickupTotal()" style="height:100%;background:var(--primary);border-radius:2px"></div>
                </div>
                <div style="font-size:10.5px;font-weight:700;color:var(--primary);margin-top:3px">{{ (s.totalAgence * 100 / agPickupTotal()).toFixed(1) }}%</div>
              }
            </div>
            <div class="kpi">
              <div class="kv" style="font-size:20px;color:var(--success)">{{ s.totalPromote }}</div>
              <div class="kl">{{ i18n.t('ag_delivery_promote') }}</div>
              @if (agPickupTotal() > 0) {
                <div style="margin-top:6px;height:4px;border-radius:2px;background:var(--surface-2);overflow:hidden">
                  <div [style.width.%]="s.totalPromote * 100 / agPickupTotal()" style="height:100%;background:var(--success);border-radius:2px"></div>
                </div>
                <div style="font-size:10.5px;font-weight:700;color:var(--success);margin-top:3px">{{ (s.totalPromote * 100 / agPickupTotal()).toFixed(1) }}%</div>
              }
            </div>
            <div class="kpi">
              <div class="kv" style="font-size:20px;color:var(--af-gold)">{{ s.totalHome }}</div>
              <div class="kl">{{ i18n.t('ag_delivery_home') }}</div>
              @if (agPickupTotal() > 0) {
                <div style="margin-top:6px;height:4px;border-radius:2px;background:var(--surface-2);overflow:hidden">
                  <div [style.width.%]="s.totalHome * 100 / agPickupTotal()" style="height:100%;background:var(--af-gold);border-radius:2px"></div>
                </div>
                <div style="font-size:10.5px;font-weight:700;color:var(--af-gold);margin-top:3px">{{ (s.totalHome * 100 / agPickupTotal()).toFixed(1) }}%</div>
              }
            </div>
          </div>

          <!-- Branch ranking -->
          @if (s.byAgency.length) {
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
              <div class="kicker" style="margin:0">{{ i18n.t('ag_stats_ranking') }}</div>
              <span class="muted" style="font-size:11px">{{ i18n.t('ag_stats_click_hint') }}</span>
            </div>
            @for (b of s.byAgency; track b.id; let i = $index) {
              <!-- Agency row — clickable -->
              <div (click)="toggleAgency(b.id)"
                   [style.background]="agSelectedId() === b.id ? 'var(--accent-soft)' : 'transparent'"
                   style="cursor:pointer;border-top:1px solid var(--border);border-radius:4px">
                <div style="display:flex;align-items:center;gap:10px;padding:9px 6px">
                  <span style="font-size:12px;font-weight:800;color:var(--muted);width:22px;text-align:right;flex-shrink:0">{{ i + 1 }}</span>
                  <div style="flex:1;min-width:0">
                    <div style="font-size:13px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis"
                         [style.color]="agSelectedId() === b.id ? 'var(--accent)' : 'var(--text)'">{{ b.name }}</div>
                    <div style="margin-top:4px;height:5px;border-radius:3px;background:var(--surface-2);overflow:hidden">
                      <div [style.width.%]="b.count * 100 / s.byAgency[0].count"
                           [style.background]="agSelectedId() === b.id ? 'var(--accent)' : 'var(--primary)'"
                           style="height:100%;border-radius:3px;transition:width .3s"></div>
                    </div>
                  </div>
                  <div style="text-align:right;flex-shrink:0">
                    <div style="font-size:15px;font-weight:800" [style.color]="agSelectedId() === b.id ? 'var(--accent)' : 'var(--primary)'">{{ b.count }}</div>
                    @if (s.totalAgence > 0) {
                      <div style="font-size:10px;font-weight:600;color:var(--muted)">{{ (b.count * 100 / s.totalAgence).toFixed(1) }}%</div>
                    }
                  </div>
                  <ic [name]="agSelectedId() === b.id ? 'chevD' : 'chevR'" [size]="14" style="color:var(--muted);flex-shrink:0"></ic>
                </div>

                <!-- Drilldown: subscriptions for this agency -->
                @if (agSelectedId() === b.id) {
                  <div style="padding:0 6px 12px">
                    @if (!agSelectedSubs().length) {
                      <p class="muted" style="font-size:12.5px;text-align:center;padding:12px 0">{{ i18n.t('ag_drilldown_empty') }}</p>
                    } @else {
                      <div style="overflow-x:auto">
                        <table class="tx-table" style="margin-top:4px">
                          <thead>
                            <tr>
                              <th>{{ i18n.t('client') }}</th>
                              <th>{{ i18n.t('phone') }}</th>
                              <th>{{ i18n.t('tx_date') }}</th>
                              <th>{{ i18n.t('tx_status') }}</th>
                            </tr>
                          </thead>
                          <tbody>
                            @for (t of agSelectedPaged(); track t.ref) {
                              <tr class="tx-tr" (click)="openRef(t.ref); $event.stopPropagation()">
                                <td><div class="cell-name">{{ t.fullName }}</div><div class="cell-sub">{{ t.ref }}</div></td>
                                <td>{{ t.phone || '—' }}</td>
                                <td class="nowrap">{{ txDate(t.createdAt) }}</td>
                                <td><status-badge [status]="rowStatus(t)"></status-badge></td>
                              </tr>
                            }
                          </tbody>
                        </table>
                      </div>
                      @if (agSelectedPageCount() > 1) {
                        <div class="tx-pager" style="margin-top:8px">
                          <span class="muted" style="font-size:11.5px">{{ agSelectedSubs().length }} · p.{{ agSelectedPage() + 1 }}/{{ agSelectedPageCount() }}</span>
                          <div style="display:flex;gap:6px">
                            <button class="btn btn-outline" (click)="agSelectedPage()>0&&agSelectedPage.set(agSelectedPage()-1);$event.stopPropagation()" [disabled]="agSelectedPage()===0" style="padding:5px 10px;font-size:13px"><ic name="chevL" [size]="15"></ic></button>
                            <button class="btn btn-outline" (click)="agSelectedPage()<agSelectedPageCount()-1&&agSelectedPage.set(agSelectedPage()+1);$event.stopPropagation()" [disabled]="agSelectedPage()>=agSelectedPageCount()-1" style="padding:5px 10px;font-size:13px"><ic name="chevR" [size]="15"></ic></button>
                          </div>
                        </div>
                      }
                    }
                  </div>
                }
              </div>
            }
          } @else {
            <p class="muted" style="font-size:12.5px;text-align:center;padding:8px 0">{{ i18n.t('ag_stats_empty') }}</p>
          }
        }
      </div>

      <!-- Import pickup agencies -->
      <div class="card" style="padding:16px;margin-top:12px" data-reveal="card">
        <div style="display:flex;align-items:flex-start;gap:9px;margin-bottom:12px">
          <ic name="download" [size]="17" style="color:var(--primary);flex-shrink:0;margin-top:2px"></ic>
          <div style="min-width:0">
            <h3 style="font-size:15px;line-height:1.2">{{ i18n.t('ag_import_title') }}</h3>
            <p class="muted" style="font-size:11.5px;line-height:1.4;margin-top:3px">{{ i18n.t('ag_import_sub') }}</p>
          </div>
        </div>

        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">
          <button class="btn btn-outline" (click)="agFile.click()" style="flex:1;min-width:140px;padding:9px;font-size:13px"><ic name="copy" [size]="15"></ic> {{ i18n.t('import_pick') }}</button>
          <button class="btn btn-ghost" (click)="downloadAgTemplate()" style="flex:1;min-width:120px;padding:9px;font-size:13px"><ic name="download" [size]="15"></ic> {{ i18n.t('import_template') }}</button>
        </div>
        <input #agFile type="file" accept=".csv,text/csv,text/plain" (change)="onAgFile($event)" style="display:none" />

        <field [label]="i18n.t('import_paste_label')">
          <textarea class="input" rows="4" [placeholder]="i18n.t('ag_paste_ph')" [value]="agText()" (input)="onAgText($event)" style="resize:vertical;font-family:var(--font);line-height:1.5"></textarea>
        </field>

        @if (agPreview().length) {
          <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:10px;font-size:12px;font-weight:700">
            <span style="color:var(--success)">{{ agCounts().created }} {{ i18n.t('import_new') }}</span>
            <span style="color:var(--af-gold)">{{ agCounts().dup }} {{ i18n.t('import_dup') }}</span>
            @if (agCounts().invalid) { <span style="color:var(--accent)">{{ agCounts().invalid }} {{ i18n.t('import_invalid') }}</span> }
          </div>

          <div style="margin-top:10px">
            <div class="muted" style="font-size:11px;font-weight:700;margin-bottom:5px">{{ i18n.t('import_dup_policy') }}</div>
            <div style="display:flex;gap:6px">
              <button class="btn" [class.btn-primary]="!agUpdate()" [class.btn-outline]="agUpdate()" (click)="agUpdate.set(false)" style="flex:1;padding:8px;font-size:12.5px">{{ i18n.t('import_skip') }}</button>
              <button class="btn" [class.btn-primary]="agUpdate()" [class.btn-outline]="!agUpdate()" (click)="agUpdate.set(true)" style="flex:1;padding:8px;font-size:12.5px">{{ i18n.t('import_update') }}</button>
            </div>
          </div>

          <div style="max-height:220px;overflow-y:auto;margin-top:10px;border:1px solid var(--border);border-radius:var(--radius)">
            @for (r of agPreview(); track $index) {
              <div style="display:flex;align-items:center;gap:8px;padding:7px 9px;border-bottom:1px solid var(--border)">
                @switch (r.status) {
                  @case ('new') { <span class="badge" style="background:color-mix(in srgb, var(--success) 18%, transparent);color:var(--success);font-size:10px;flex-shrink:0">{{ i18n.t('import_new') }}</span> }
                  @case ('duplicate') { <span class="badge" style="background:color-mix(in srgb, var(--af-gold) 22%, transparent);color:#8a6400;font-size:10px;flex-shrink:0">{{ i18n.t('import_dup') }}</span> }
                  @case ('invalid') { <span class="badge" style="background:var(--accent-soft);color:var(--accent);font-size:10px;flex-shrink:0">{{ i18n.t('import_invalid') }}</span> }
                }
                <div style="min-width:0;flex:1">
                  <div style="font-size:12.5px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{ r.name || '—' }}</div>
                  <div class="muted" style="font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{ r.city || '—' }}@if (r.status === 'invalid') { · <span style="color:var(--accent)">{{ i18n.t('ag_r_name') }}</span> }</div>
                </div>
              </div>
            }
          </div>

          <div style="display:flex;gap:8px;margin-top:10px">
            <button class="btn btn-primary" [disabled]="agBusy() || !agActionable()" (click)="runAgImport()" style="flex:1;padding:11px">
              @if (agBusy()) { <spinner></spinner> } @else { <ic name="check" [size]="17"></ic> {{ i18n.t('import_run') }} {{ agActionable() }} {{ i18n.t('import_lines') }} }
            </button>
            <button class="btn btn-ghost" (click)="clearAg()" [disabled]="agBusy()" style="padding:11px">{{ i18n.t('tx_clear') }}</button>
          </div>
          @if (agErr()) { <p class="err" style="font-size:12px;text-align:center;margin-top:6px">{{ i18n.t('import_error') }}</p> }
        }

        @if (agResult(); as res) {
          <div class="card" style="background:var(--surface-2);padding:12px 14px;margin-top:12px">
            <div style="font-size:13px;font-weight:800;margin-bottom:6px"><ic name="check" [size]="15" style="color:var(--success);vertical-align:-2px"></ic> {{ i18n.t('import_done') }}</div>
            <div style="font-size:12.5px;line-height:1.7">
              <b style="color:var(--success)">{{ res.created }}</b> {{ i18n.t('import_created') }} ·
              <b>{{ res.updated }}</b> {{ i18n.t('import_updated') }} ·
              <b>{{ res.skipped }}</b> {{ i18n.t('import_skipped') }}@if (res.invalid) { · <b style="color:var(--accent)">{{ res.invalid }}</b> {{ i18n.t('import_invalid_n') }} }
            </div>
          </div>
        }
      </div>

      <!-- Current pickup agencies -->
      <div style="display:flex;align-items:center;gap:8px;margin-top:16px;margin-bottom:6px">
        <div class="kicker" style="margin:0">{{ i18n.t('ag_list') }} · {{ filteredAgencies().length }}@if (agSearch().trim()) { / {{ agencies().length }} }</div>
        <button class="btn btn-ghost" (click)="refreshSection('agencies')" style="padding:4px 9px;font-size:11px;margin-left:auto" [title]="i18n.t('dash_refresh')"><ic name="refresh" [size]="13"></ic></button>
      </div>
      <div class="input-prefix" style="margin-bottom:8px">
        <span class="pfx"><ic name="search" [size]="15"></ic></span>
        <input [placeholder]="i18n.t('user_search_ph')" [value]="agSearch()" (input)="agSearch.set($any($event.target).value)" />
      </div>
      @if (agLoading()) {
        <div class="card" style="padding:4px 0;overflow:hidden">
          @for (n of skeletonRows; track n) {
            <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid var(--border)">
              <span class="skel" style="width:16px;height:16px;border-radius:3px;flex-shrink:0"></span>
              <div style="flex:1;min-width:0">
                <span class="skel" style="width:60%;height:13px;display:block;margin-bottom:4px"></span>
                <span class="skel" style="width:35%;height:10px;display:block"></span>
              </div>
            </div>
          }
        </div>
      } @else if (!filteredAgencies().length) {
        <p class="muted" style="font-size:12.5px">{{ i18n.t('ag_empty') }}</p>
      } @else {
        <div class="card" style="padding:4px 0;overflow:hidden">
          @for (a of filteredAgencies(); track a.id) {
            <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid var(--border)">
              <ic name="pin" [size]="16" style="color:var(--primary);flex-shrink:0"></ic>
              <div style="min-width:0;flex:1">
                <div style="font-size:13px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{ a.name }}</div>
                @if (a.city) { <div class="muted" style="font-size:11px">{{ a.city }}</div> }
              </div>
            </div>
          }
        </div>
      }

      </div>
      }

      <!-- ========== RETRAITS AGENCE ========== -->
      @if (section() === 'agence-retrait') {
      <div reveal="screen">
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:16px" data-reveal="item">
        <h1 style="font-size:21px;margin:0;flex:1">{{ i18n.t('nav_agence_retrait') }}</h1>
        @if (filteredAgenceRetrait().length) {
          <button class="btn btn-ghost" (click)="exportAgenceRetrait()" style="padding:5px 11px;font-size:12px"><ic name="download" [size]="14"></ic> Exporter Excel</button>
        }
        <button class="icon-btn" (click)="loadAgenceRetrait()" [title]="i18n.t('dash_refresh')" style="color:var(--muted)"><ic name="refresh" [size]="15"></ic></button>
      </div>

      <!-- KPIs -->
      @if (!agenceRetraitLoading()) {
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:16px">
        <div class="kpi" data-reveal="kpi" style="padding:12px 14px">
          <div style="font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin-bottom:6px">Total demandes</div>
          <div style="font-size:28px;font-weight:800;line-height:1">{{ agenceRetrait().length }}</div>
        </div>
        <div class="kpi" data-reveal="kpi" style="padding:12px 14px;cursor:pointer"
             [style.borderColor]="agenceRetraitPending() ? 'color-mix(in srgb,var(--warning) 45%,var(--border))' : 'var(--border)'"
             [style.background]="agenceRetraitPending() ? 'var(--warning-soft)' : 'var(--surface)'"
             (click)="agenceRetraitStatus.set(agenceRetraitStatus() === 'pending' ? 'all' : 'pending')">
          <div style="font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--warning);margin-bottom:6px">En attente retrait</div>
          <div style="font-size:28px;font-weight:800;line-height:1;color:var(--warning)">{{ agenceRetraitPending() }}</div>
          @if (agenceRetrait().length) {
            <div style="font-size:11px;color:var(--muted);margin-top:4px">{{ (agenceRetraitPending() * 100 / agenceRetrait().length).toFixed(0) }}% du total</div>
          }
        </div>
        <div class="kpi" data-reveal="kpi" style="padding:12px 14px">
          <div style="font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--success);margin-bottom:6px">Cartes remises</div>
          <div style="font-size:28px;font-weight:800;line-height:1;color:var(--success)">{{ agenceRetraitDone() }}</div>
          @if (agenceRetrait().length) {
            <div style="font-size:11px;color:var(--muted);margin-top:4px">{{ (agenceRetraitDone() * 100 / agenceRetrait().length).toFixed(0) }}% du total</div>
          }
        </div>
      </div>
      }

      <div class="card" style="overflow:hidden;max-width:900px" data-reveal="card">
        <div style="padding:14px 14px 10px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <ic name="pin" [size]="17" style="color:var(--primary)"></ic>
          <h3 style="font-size:15px">Demandes de retrait en agence</h3>
          <span class="muted" style="margin-left:auto;font-size:12px;font-weight:700">{{ filteredAgenceRetrait().length }}@if (agenceRetraitSearch().trim() || agenceRetraitAgency() !== 'all' || agenceRetraitStatus() !== 'all') { / {{ agenceRetrait().length }} } demandes</span>
        </div>
        <div style="padding:0 14px 12px;display:flex;flex-direction:column;gap:8px">
          <!-- Recherche -->
          <div class="input-prefix">
            <span class="pfx"><ic name="search" [size]="15"></ic></span>
            <input placeholder="Rechercher par nom, ref, téléphone…" [value]="agenceRetraitSearch()" (input)="agenceRetraitSearch.set($any($event.target).value)" />
          </div>
          <!-- Filtre par agence - scroll horizontal -->
          <div>
            <div style="font-size:10.5px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:5px">Agence</div>
            <div style="display:flex;align-items:center;gap:5px;overflow-x:auto;padding-bottom:2px;scrollbar-width:none;-webkit-overflow-scrolling:touch">
              <button (click)="agenceRetraitAgency.set('all')"
                      [style.background]="agenceRetraitAgency() === 'all' ? 'var(--primary)' : 'var(--surface-2)'"
                      [style.color]="agenceRetraitAgency() === 'all' ? '#fff' : 'var(--fg)'"
                      style="border:none;border-radius:20px;padding:4px 12px;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;flex-shrink:0">Toutes</button>
              @for (ag of agenceRetraitAgencies(); track ag) {
                <button (click)="agenceRetraitAgency.set(ag)"
                        [style.background]="agenceRetraitAgency() === ag ? 'var(--primary)' : 'var(--surface-2)'"
                        [style.color]="agenceRetraitAgency() === ag ? '#fff' : 'var(--fg)'"
                        style="border:none;border-radius:20px;padding:4px 12px;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;flex-shrink:0">{{ ag }}</button>
              }
            </div>
          </div>
          <!-- Filtre statut -->
          <div style="display:flex;align-items:center;gap:6px">
            <span style="font-size:10.5px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.05em">Statut</span>
            @for (f of [['all','Tous'],['pending','En attente'],['done','Remises']]; track f[0]) {
              <button (click)="agenceRetraitStatus.set(f[0])"
                      [style.background]="agenceRetraitStatus() === f[0] ? 'var(--primary)' : 'var(--surface-2)'"
                      [style.color]="agenceRetraitStatus() === f[0] ? '#fff' : 'var(--fg)'"
                      style="border:none;border-radius:20px;padding:4px 12px;font-size:12px;font-weight:600;cursor:pointer">{{ f[1] }}</button>
            }
          </div>
        </div>

        @if (agenceRetraitLoading()) {
          <div style="padding:32px;text-align:center"><spinner [size]="28"></spinner></div>
        } @else if (!filteredAgenceRetrait().length) {
          <div style="padding:32px 14px;text-align:center;color:var(--muted);font-size:13.5px">Aucune demande de retrait en agence.</div>
        } @else {
          <div style="border-top:1px solid var(--border)">
            @for (r of filteredAgenceRetrait(); track r.ref) {
              <div style="display:flex;align-items:center;gap:12px;padding:11px 14px;border-bottom:1px solid var(--border)">
                <!-- Avatar initiale -->
                <div style="width:38px;height:38px;border-radius:50%;background:color-mix(in srgb,var(--primary) 10%,transparent);color:var(--primary);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:800;flex-shrink:0">
                  {{ r.fullName.charAt(0).toUpperCase() }}
                </div>
                <!-- Nom + ref + téléphone -->
                <div style="flex:1;min-width:0">
                  <div style="font-size:13.5px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{ r.fullName }}</div>
                  <div style="font-size:11.5px;color:var(--muted);margin-top:2px">{{ r.ref }} · {{ r.phone }}</div>
                </div>
                <!-- Agence + date + montant -->
                <div style="min-width:110px">
                  <div style="font-size:12.5px;font-weight:700;color:var(--primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{ r.pickupAgencyName }}</div>
                  <div style="font-size:11px;color:var(--muted);margin-top:2px">{{ r.createdAt | slice:0:10 }} · {{ i18n.money(r.amount) }}</div>
                </div>
                <!-- Statut + action -->
                <div style="display:flex;flex-direction:column;align-items:flex-end;gap:5px;flex-shrink:0">
                  <status-badge [status]="r.status"></status-badge>
                  <button class="btn btn-outline" style="padding:4px 12px;font-size:12px" (click)="goToTxFromAgence(r.ref)">Voir</button>
                </div>
              </div>
            }
          </div>
        }
      </div>

      </div>
      }

      <!-- ========== TRANSACTIONS (wider than the 760px content cap, for the detailed table) ========== -->
      @if (section() === 'transactions') {
      <div reveal="screen">
      <h1 style="font-size:21px" data-reveal="item">{{ i18n.t('nav_transactions') }}</h1>

      <!-- KPIs synthèse — visibles dès l'arrivée sur la page -->
      @if (!txLoading()) {
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px;margin-bottom:12px">
        <div class="kpi" data-reveal="kpi" style="padding:10px 12px">
          <div class="kv" style="font-size:22px">{{ txKpiTotal() }}</div>
          <div class="kl">{{ i18n.t('kpi_total') }}</div>
        </div>
        <div class="kpi" data-reveal="kpi" style="padding:10px 12px">
          <div class="kv" style="font-size:22px;color:var(--success)">{{ txKpiPaid() }}</div>
          <div class="kl">{{ i18n.t('kpi_success') }}</div>
        </div>
        <div class="kpi" data-reveal="kpi" style="padding:10px 12px;cursor:pointer"
             [style.borderColor]="txKpiCash() ? 'color-mix(in srgb,var(--warning) 45%,var(--border))' : 'var(--border)'"
             [style.background]="txKpiCash() ? 'var(--warning-soft)' : 'var(--surface)'"
             (click)="showPayFilter('cash')" title="Filtrer les paiements espèces en attente">
          <div class="kv" style="font-size:22px;color:var(--warning)">{{ txKpiCash() }}</div>
          <div class="kl">Espèces en attente</div>
        </div>
        <div class="kpi" data-reveal="kpi" style="padding:10px 12px">
          <div class="kv" style="font-size:22px;color:var(--primary)">{{ txKpiActivated() }}</div>
          <div class="kl">Cartes activées (PAN)</div>
        </div>
      </div>
      }

      <div class="card" style="overflow:hidden;max-width:1180px" data-reveal="card">
        <div style="display:flex;align-items:center;gap:8px;padding:14px 14px 10px;flex-wrap:wrap">
          <ic name="chart" [size]="17" style="color:var(--primary)"></ic>
          <h3 style="font-size:15px">{{ i18n.t('all_sales') }}</h3>
          <span style="margin-left:auto;display:inline-flex;align-items:center;gap:5px;font-size:10.5px;font-weight:700;color:var(--success)" [title]="i18n.t('live_auto')"><span class="live-dot"></span>{{ i18n.t('live_auto') }}</span>
          <span class="muted" style="font-size:12px;font-weight:700">{{ filteredTxs().length }}@if (txSearch().trim() || txStatuses().size > 0 || txAgent() !== 'all' || txFrom() || txTo() || txPay() !== 'all') { / {{ txs().length }} } {{ i18n.t('tx_count') }}</span>
          <button class="icon-btn" (click)="refreshSection('transactions')" [title]="i18n.t('dash_refresh')" style="color:var(--muted)"><ic name="refresh" [size]="15"></ic></button>
        </div>
        <div style="padding:0 14px 12px;display:flex;flex-direction:column;gap:8px">
          <div class="input-prefix">
            <span class="pfx"><ic name="search" [size]="15"></ic></span>
            <input [placeholder]="i18n.t('tx_search_ph')" [value]="txSearch()" (input)="txSearch.set($any($event.target).value)" />
          </div>
          <!-- Filtre statut multi-sélection avec opérateur AND / OR -->
          <div style="display:flex;flex-direction:column;gap:6px">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
              <span style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.05em">Statut</span>
              <!-- Opérateur -->
              <div style="display:inline-flex;border:1px solid var(--border);border-radius:6px;overflow:hidden;font-size:11.5px;font-weight:700">
                <button (click)="txStatusOp.set('OR')"
                        [style.background]="txStatusOp() === 'OR' ? 'var(--primary)' : 'var(--surface)'"
                        [style.color]="txStatusOp() === 'OR' ? '#fff' : 'var(--muted)'"
                        style="border:none;padding:3px 10px;cursor:pointer;font-weight:700;font-size:11.5px;font-family:var(--font)">OU</button>
                <button (click)="txStatusOp.set('AND')"
                        [style.background]="txStatusOp() === 'AND' ? 'var(--primary)' : 'var(--surface)'"
                        [style.color]="txStatusOp() === 'AND' ? '#fff' : 'var(--muted)'"
                        style="border:none;border-left:1px solid var(--border);padding:3px 10px;cursor:pointer;font-weight:700;font-size:11.5px;font-family:var(--font)">ET</button>
              </div>
              @if (txStatuses().size > 0) {
                <button (click)="clearTxStatuses()" style="font-size:11px;color:var(--muted);background:none;border:none;cursor:pointer;text-decoration:underline;padding:0">Effacer</button>
              }
            </div>
            <div style="display:flex;flex-wrap:wrap;gap:5px">
              @for (s of txStatusChips; track s.value) {
                <button (click)="toggleTxStatus(s.value)"
                        [style.background]="txStatuses().has(s.value) ? s.color : 'var(--surface-2)'"
                        [style.color]="txStatuses().has(s.value) ? '#fff' : 'var(--muted)'"
                        [style.borderColor]="txStatuses().has(s.value) ? s.color : 'var(--border)'"
                        style="border:1.5px solid;border-radius:99px;padding:4px 11px;font-size:12px;font-weight:600;cursor:pointer;font-family:var(--font);display:inline-flex;align-items:center;gap:5px">
                  {{ s.label }}
                  <span style="font-size:10.5px;opacity:.8">({{ s.count() }})</span>
                </button>
              }
            </div>
          </div>
          <div style="display:flex;gap:8px">
            <select class="input" [value]="txAgent()" (change)="txAgent.set($any($event.target).value)" style="flex:1">
              <option value="all">{{ i18n.t('tx_all_agents') }}</option>
              <option value="self">{{ i18n.t('tx_self') }}</option>
              @for (a of agentUsers; track a.id) { <option [value]="a.id">{{ a.name }}</option> }
            </select>
          </div>
          <!-- Filtre mode de paiement -->
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
            <span style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.05em">Paiement</span>
            @for (pm of [['all','Tous'],['om','Orange Money'],['mtn','MTN MoMo'],['cash','Espèces'],['sara','SARA']]; track pm[0]) {
              <button (click)="txPay.set(pm[0])"
                      [style.background]="txPay() === pm[0] ? 'var(--primary)' : 'var(--surface-2)'"
                      [style.color]="txPay() === pm[0] ? '#fff' : 'var(--muted)'"
                      [style.borderColor]="txPay() === pm[0] ? 'var(--primary)' : 'var(--border)'"
                      style="border:1.5px solid;border-radius:99px;padding:3px 10px;font-size:11.5px;font-weight:600;cursor:pointer;font-family:var(--font)">{{ pm[1] }}</button>
            }
          </div>
          <!-- Filtre mode de retrait -->
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
            <span style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.05em">Retrait</span>
            @for (d of [['all','Tous'],['agence','En agence'],['promote','Stand Promote'],['home','Domicile']]; track d[0]) {
              <button (click)="txDelivery.set(d[0])"
                      [style.background]="txDelivery() === d[0] ? 'var(--primary)' : 'var(--surface-2)'"
                      [style.color]="txDelivery() === d[0] ? '#fff' : 'var(--muted)'"
                      [style.borderColor]="txDelivery() === d[0] ? 'var(--primary)' : 'var(--border)'"
                      style="border:1.5px solid;border-radius:99px;padding:3px 10px;font-size:11.5px;font-weight:600;cursor:pointer;font-family:var(--font)">{{ d[1] }}</button>
            }
          </div>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <input class="input" type="date" [value]="txFrom()" (change)="txFrom.set($any($event.target).value)" style="flex:1;min-width:105px" />
            <span class="muted" style="font-size:12px">→</span>
            <input class="input" type="date" [value]="txTo()" (change)="txTo.set($any($event.target).value)" style="flex:1;min-width:105px" />
          </div>
          <div style="display:flex;gap:8px">
            <button class="btn btn-outline" (click)="exportCsv()" [disabled]="!filteredTxs().length" style="flex:1;padding:9px;font-size:13px"><ic name="copy" [size]="15"></ic> {{ i18n.t('tx_export') }}</button>
            <button class="btn btn-ghost" (click)="clearFilters()" style="flex:1;padding:9px;font-size:13px">{{ i18n.t('tx_clear') }}</button>
          </div>
        </div>
        @if (txLoading()) {
          <div style="overflow-x:auto;padding:0 2px">
            <table class="tx-table" aria-hidden="true">
              <tbody>
                @for (n of skeletonRows; track n) {
                  <tr>
                    <td><span class="skel" style="width:38px;height:38px;border-radius:50%;display:block"></span></td>
                    <td><span class="skel" style="width:80%;height:13px;display:block;margin-bottom:5px"></span><span class="skel" style="width:50%;height:10px;display:block"></span></td>
                    <td><span class="skel" style="width:75px;height:12px;display:block"></span></td>
                    <td><span class="skel" style="width:60px;height:12px;display:block"></span></td>
                    <td><span class="skel" style="width:80px;height:12px;display:block"></span></td>
                    <td><span class="skel" style="width:70px;height:12px;display:block"></span></td>
                    <td><span class="skel" style="width:55px;height:12px;display:block"></span></td>
                    <td><span class="skel" style="width:60px;height:20px;border-radius:99px;display:block"></span></td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        } @else if (filteredTxs().length === 0) {
          <p class="muted" style="font-size:13px;padding:20px 14px;text-align:center">{{ i18n.t('tx_empty') }}</p>
        } @else {
          <div style="overflow-y:auto;overflow-x:auto;max-height:min(68vh,600px);padding:0 2px">
            <table class="tx-table">
              <colgroup>
                <col style="width:44px" />
                <col />
                <col style="width:120px" />
                <col style="width:104px" />
                <col style="width:112px" />
                <col style="width:140px" />
                <col style="width:96px" />
                <col style="width:116px" />
              </colgroup>
              <thead>
                <tr>
                  <th style="width:46px"></th>
                  <th>{{ i18n.t('client') }}</th>
                  <th>{{ i18n.t('phone') }}</th>
                  <th>{{ i18n.t('cni_short') }}</th>
                  <th>{{ i18n.t('tx_date') }}</th>
                  <th>{{ i18n.t('pay_method_label') }}</th>
                  <th class="num">{{ i18n.t('tx_amount') }}</th>
                  <th>{{ i18n.t('tx_status') }}</th>
                </tr>
              </thead>
              <tbody>
                @for (t of pagedTxs(); track t.ref) {
                  <tr class="tx-tr" (click)="toggleExpand(t.ref)">
                    <td><client-photo [refId]="t.ref" [name]="t.fullName" [hasSelfie]="t.hasSelfie" [size]="38"></client-photo></td>
                    <td><div class="cell-name">{{ t.fullName }}</div><div class="cell-sub">{{ t.ref }}@if (t.channel === 'self') { · {{ i18n.t('tx_self') }} }</div></td>
                    <td class="nowrap" [attr.data-label]="i18n.t('phone')">{{ t.phone || '—' }}</td>
                    <td class="brk" [attr.data-label]="i18n.t('cni_short')">{{ t.cni || '—' }}</td>
                    <td class="nowrap" [attr.data-label]="i18n.t('tx_date')">{{ txDate(t.createdAt) }}</td>
                    <td [attr.data-label]="i18n.t('pay_method_label')"><span style="display:flex;align-items:center;gap:6px;min-width:0"><span class="op-logo" [style.background]="pm(t).bg" [style.color]="pm(t).fg" style="width:20px;height:20px;font-size:8px;border-radius:5px;overflow:hidden;flex-shrink:0">@if (pm(t).logo) { <img [src]="pm(t).logo" [alt]="pm(t).name" style="width:100%;height:100%;object-fit:contain" /> } @else { {{ pm(t).short }} }</span><span style="overflow-wrap:anywhere;line-height:1.25">{{ t.pay === 'cash' ? i18n.t('pay_cash_short') : pm(t).name }}</span></span></td>
                    <td class="num" [attr.data-label]="i18n.t('tx_amount')">{{ i18n.money(t.amount) }}</td>
                    <td [attr.data-label]="i18n.t('tx_status')"><status-badge [status]="rowStatus(t)"></status-badge></td>
                  </tr>
                  @if (expandedRef() === t.ref) {
                    <tr class="tx-expand"><td colspan="8" style="padding:0 6px 10px;background:var(--surface-2)">
                      <tx-detail [t]="t" [sellerName]="t.channel === 'self' ? null : agentName(t.agentId)" (openPrint)="openRef($event)"></tx-detail>
                    </td></tr>
                  }
                }
              </tbody>
            </table>
          </div>
          <div class="tx-pager">
            <span class="muted" style="font-size:11.5px">{{ filteredTxs().length }} {{ i18n.t('tx_count') }} · {{ i18n.t('step') }} {{ txPage() + 1 }} {{ i18n.t('of') }} {{ txPageCount() }}</span>
            <div style="display:flex;gap:6px">
              <button class="btn btn-outline" (click)="txPrev()" [disabled]="txPage() === 0" style="padding:7px 12px;font-size:13px"><ic name="chevL" [size]="16"></ic></button>
              <button class="btn btn-outline" (click)="txNext()" [disabled]="txPage() >= txPageCount() - 1" style="padding:7px 12px;font-size:13px"><ic name="chevR" [size]="16"></ic></button>
            </div>
          </div>
        }
      </div>

      </div>
      }

      <!-- ========== RECHARGES (paiements de recharge de carte prépayée) ========== -->
      @if (section() === 'recharges') {
      <div reveal="screen">
      <h1 style="font-size:21px" data-reveal="item">{{ i18n.t('nav_recharges') }}</h1>

      <!-- ===== Recharge KPI dashboard (shared with the overview "Recharge" tab) ===== -->
      <ng-container [ngTemplateOutlet]="rchStatsTpl"></ng-container>

      <div class="card" style="overflow:hidden;max-width:1180px" data-reveal="card">
        <div style="display:flex;align-items:center;gap:8px;padding:14px 14px 10px;flex-wrap:wrap">
          <ic name="phone" [size]="17" style="color:var(--primary)"></ic>
          <h3 style="font-size:15px">{{ i18n.t('rch_all') }}</h3>
          <span style="margin-left:auto;display:inline-flex;align-items:center;gap:5px;font-size:10.5px;font-weight:700;color:var(--success)"><span class="live-dot"></span>{{ i18n.t('live_auto') }}</span>
          <span class="muted" style="font-size:12px;font-weight:700">{{ filteredRecharges().length }}@if (rSearch().trim() || rStatus() !== 'all' || rPayFilter() !== 'all' || rFrom() || rTo()) { / {{ recharges().length }} } {{ i18n.t('tx_count') }}</span>
          <button class="icon-btn" (click)="refreshSection('recharges')" [title]="i18n.t('dash_refresh')" style="color:var(--muted)"><ic name="refresh" [size]="15"></ic></button>
        </div>
        <div style="padding:0 14px 12px;display:flex;flex-direction:column;gap:8px">
          <div class="input-prefix">
            <span class="pfx"><ic name="search" [size]="15"></ic></span>
            <input [placeholder]="i18n.t('rch_search_ph')" [value]="rSearch()" (input)="rSearch.set($any($event.target).value)" />
          </div>
          <div style="display:flex;gap:8px">
            <select class="input" [value]="rStatus()" (change)="rStatus.set($any($event.target).value)" style="flex:1">
              <option value="all">{{ i18n.t('tx_all_status') }}</option>
              <option value="paid">{{ i18n.t('st_paid') }}</option>
              <option value="pending">{{ i18n.t('st_pending') }}</option>
              <option value="cash">{{ i18n.t('st_cash') }}</option>
              <option value="sara_pending">{{ i18n.t('st_sara_pending') }}</option>
              <option value="failed">{{ i18n.t('st_failed') }}</option>
            </select>
            <select class="input" [value]="rPayFilter()" (change)="rPayFilter.set($any($event.target).value)" style="flex:1">
              <option value="all">{{ i18n.t('rch_all_methods') }}</option>
              <option value="om">Orange Money</option>
              <option value="mtn">MTN MoMo</option>
              <option value="sara">SARA Money</option>
              <option value="cash">{{ i18n.t('pay_cash_name') }}</option>
            </select>
          </div>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <input class="input" type="date" [value]="rFrom()" (change)="rFrom.set($any($event.target).value)" style="flex:1;min-width:105px" />
            <span class="muted" style="font-size:12px">→</span>
            <input class="input" type="date" [value]="rTo()" (change)="rTo.set($any($event.target).value)" style="flex:1;min-width:105px" />
          </div>
          <div style="display:flex;gap:8px">
            <button class="btn btn-outline" (click)="exportRecharges()" [disabled]="!filteredRecharges().length" style="flex:1;padding:9px;font-size:13px"><ic name="copy" [size]="15"></ic> {{ i18n.t('tx_export') }}</button>
            <button class="btn btn-ghost" (click)="clearRFilters()" style="flex:1;padding:9px;font-size:13px">{{ i18n.t('tx_clear') }}</button>
          </div>
        </div>
        @if (rLoading()) {
          <div style="overflow-x:auto;padding:0 2px">
            <table class="tx-table" aria-hidden="true">
              <tbody>
                @for (n of skeletonRows; track n) {
                  <tr>
                    <td><span class="skel" style="width:80%;height:13px;display:block;margin-bottom:5px"></span><span class="skel" style="width:50%;height:10px;display:block"></span></td>
                    <td><span class="skel" style="width:75px;height:12px;display:block"></span></td>
                    <td><span class="skel" style="width:70px;height:12px;display:block"></span></td>
                    <td><span class="skel" style="width:80px;height:12px;display:block"></span></td>
                    <td><span class="skel" style="width:60px;height:12px;display:block"></span></td>
                    <td><span class="skel" style="width:55px;height:12px;display:block"></span></td>
                    <td><span class="skel" style="width:60px;height:20px;border-radius:99px;display:block"></span></td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        } @else if (filteredRecharges().length === 0) {
          <p class="muted" style="font-size:13px;padding:20px 14px;text-align:center">{{ i18n.t('rch_empty') }}</p>
        } @else {
          <div style="overflow-y:auto;overflow-x:auto;max-height:min(68vh,600px);padding:0 2px">
            <table class="tx-table">
              <colgroup>
                <col /><col style="width:170px" /><col style="width:126px" /><col style="width:140px" /><col style="width:140px" /><col style="width:96px" /><col style="width:116px" />
              </colgroup>
              <thead>
                <tr>
                  <th>{{ i18n.t('client') }}</th>
                  <th>{{ i18n.t('recharge_pan_short') }}</th>
                  <th>{{ i18n.t('phone') }}</th>
                  <th>{{ i18n.t('tx_date') }}</th>
                  <th>{{ i18n.t('pay_method_label') }}</th>
                  <th class="num">{{ i18n.t('tx_amount') }}</th>
                  <th>{{ i18n.t('tx_status') }}</th>
                </tr>
              </thead>
              <tbody>
                @for (r of pagedRecharges(); track r.ref) {
                  <tr class="tx-tr">
                    <td><div class="cell-name">{{ r.fullName }}</div><div class="cell-sub">{{ r.ref }}</div></td>
                    <td class="brk" [attr.data-label]="i18n.t('recharge_pan_short')">{{ fmtPan(r.pan) }}</td>
                    <td class="nowrap" [attr.data-label]="i18n.t('phone')">{{ r.phone || '—' }}</td>
                    <td class="nowrap" [attr.data-label]="i18n.t('tx_date')">{{ txDate(r.createdAt) }}</td>
                    <td [attr.data-label]="i18n.t('pay_method_label')"><span style="display:flex;align-items:center;gap:6px;min-width:0"><span class="op-logo" [style.background]="rpm(r).bg" [style.color]="rpm(r).fg" style="width:20px;height:20px;font-size:8px;border-radius:5px;overflow:hidden;flex-shrink:0">@if (rpm(r).logo) { <img [src]="rpm(r).logo" [alt]="rpm(r).name" style="width:100%;height:100%;object-fit:contain" /> } @else { {{ rpm(r).short }} }</span><span style="overflow-wrap:anywhere;line-height:1.25">{{ r.pay === 'cash' ? i18n.t('pay_cash_short') : rpm(r).name }}</span></span></td>
                    <td class="num" [attr.data-label]="i18n.t('tx_amount')">{{ i18n.money(r.amount) }}</td>
                    <td [attr.data-label]="i18n.t('tx_status')"><status-badge [status]="r.status"></status-badge></td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <div class="tx-pager">
            <span class="muted" style="font-size:11.5px">{{ filteredRecharges().length }} {{ i18n.t('tx_count') }} · {{ i18n.t('step') }} {{ rPage() + 1 }} {{ i18n.t('of') }} {{ rPageCount() }}</span>
            <div style="display:flex;gap:6px">
              <button class="btn btn-outline" (click)="rPrev()" [disabled]="rPage() === 0" style="padding:7px 12px;font-size:13px"><ic name="chevL" [size]="16"></ic></button>
              <button class="btn btn-outline" (click)="rNext()" [disabled]="rPage() >= rPageCount() - 1" style="padding:7px 12px;font-size:13px"><ic name="chevR" [size]="16"></ic></button>
            </div>
          </div>
        }
      </div>

      </div>
      }

      <!-- ========== COLLECTES (ventes de produits bancaires) ========== -->
      @if (section() === 'collectes') {
      <div reveal="screen">
      <h1 style="font-size:21px" data-reveal="item">{{ i18n.t('nav_collectes') }}</h1>

      <!-- Stats -->
      <div class="card" style="padding:14px;margin-top:12px" data-reveal="card">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
          <ic name="chart" [size]="16" style="color:var(--primary)"></ic>
          <h3 style="font-size:14.5px">{{ i18n.t('col_stats_title') }}</h3>
          <span class="muted" style="margin-left:auto;font-size:12px;font-weight:700">{{ collectes().length }} {{ i18n.t('col_total') }}</span>
          <button class="btn btn-ghost" (click)="exportCollecteStatsExcel()" [disabled]="!collectes().length" style="padding:4px 9px;font-size:11px"><ic name="download" [size]="13"></ic> {{ i18n.t('col_export_xl') }}</button>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          @for (b of statByProduct(); track b.key) {
            <div style="flex:1;min-width:120px;border:1px solid var(--border);border-radius:var(--radius);padding:9px 11px">
              <div class="muted" style="font-size:11px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{ i18n.t('prod_' + b.key) }}</div>
              <div style="font-size:19px;font-weight:800">{{ b.count }}</div>
            </div>
          }
        </div>
        @if (topCommercials().length) {
          <div class="kicker" style="margin-top:12px;margin-bottom:5px">{{ i18n.t('col_by_commercial') }}</div>
          <div style="display:flex;flex-direction:column;gap:4px">
            @for (b of topCommercials(); track b.key) {
              <div style="display:flex;align-items:center;gap:8px;font-size:12.5px">
                <span style="min-width:0;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{ b.label || '—' }}</span>
                <span style="font-weight:800">{{ b.count }}</span>
              </div>
            }
          </div>
        }
      </div>

      <div class="card" style="overflow:hidden;max-width:1180px;margin-top:12px" data-reveal="card">
        <div style="display:flex;align-items:center;gap:8px;padding:14px 14px 10px;flex-wrap:wrap">
          <ic name="store" [size]="17" style="color:var(--primary)"></ic>
          <h3 style="font-size:15px">{{ i18n.t('col_all') }}</h3>
          <span class="muted" style="margin-left:auto;font-size:12px;font-weight:700">{{ filteredCollectes().length }}@if (colSearch().trim() || colProduct() !== 'all' || colCommercial() !== 'all' || colFrom() || colTo()) { / {{ collectes().length }} } {{ i18n.t('tx_count') }}</span>
          <button class="icon-btn" (click)="refreshSection('collectes')" [title]="i18n.t('dash_refresh')" style="color:var(--muted)"><ic name="refresh" [size]="15"></ic></button>
        </div>
        <div style="padding:0 14px 12px;display:flex;flex-direction:column;gap:8px">
          <div class="input-prefix">
            <span class="pfx"><ic name="search" [size]="15"></ic></span>
            <input [placeholder]="i18n.t('col_search_ph')" [value]="colSearch()" (input)="colSearch.set($any($event.target).value)" />
          </div>
          <div style="display:flex;gap:8px">
            <select class="input" [value]="colProduct()" (change)="colProduct.set($any($event.target).value)" style="flex:1">
              <option value="all">{{ i18n.t('col_all_products') }}</option>
              @for (p of productCodes; track p) { <option [value]="p">{{ i18n.t('prod_' + p) }}</option> }
            </select>
            <select class="input" [value]="colCommercial()" (change)="colCommercial.set($any($event.target).value)" style="flex:1">
              <option value="all">{{ i18n.t('col_all_commercials') }}</option>
              @for (c of commercialOptions(); track c.id) { <option [value]="c.id">{{ c.name }}</option> }
            </select>
          </div>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <input class="input" type="date" [value]="colFrom()" (change)="colFrom.set($any($event.target).value)" style="flex:1;min-width:105px" />
            <span class="muted" style="font-size:12px">→</span>
            <input class="input" type="date" [value]="colTo()" (change)="colTo.set($any($event.target).value)" style="flex:1;min-width:105px" />
          </div>
          <div style="display:flex;gap:8px">
            <button class="btn btn-outline" (click)="exportCollectes()" [disabled]="!filteredCollectes().length" style="flex:1;padding:9px;font-size:13px"><ic name="copy" [size]="15"></ic> {{ i18n.t('tx_export') }}</button>
            <button class="btn btn-ghost" (click)="clearColFilters()" style="flex:1;padding:9px;font-size:13px">{{ i18n.t('tx_clear') }}</button>
          </div>
        </div>
        @if (colLoading()) {
          <div style="overflow-x:auto;padding:0 2px">
            <table class="tx-table" aria-hidden="true">
              <tbody>
                @for (n of skeletonRows; track n) {
                  <tr>
                    <td><span class="skel" style="width:70%;height:13px;display:block;margin-bottom:5px"></span><span class="skel" style="width:40%;height:10px;display:block"></span></td>
                    <td><span class="skel" style="width:65%;height:13px;display:block;margin-bottom:5px"></span><span class="skel" style="width:45%;height:10px;display:block"></span></td>
                    <td><span class="skel" style="width:80px;height:12px;display:block"></span></td>
                    <td><span class="skel" style="width:90px;height:12px;display:block"></span></td>
                    <td><span class="skel" style="width:80px;height:12px;display:block"></span></td>
                    <td><span class="skel" style="width:24px;height:24px;border-radius:50%;display:block"></span></td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        } @else if (filteredCollectes().length === 0) {
          <p class="muted" style="font-size:13px;padding:20px 14px;text-align:center">{{ i18n.t('col_empty') }}</p>
        } @else {
          <div style="overflow-y:auto;overflow-x:auto;max-height:min(68vh,600px);padding:0 2px">
            <table class="tx-table">
              <colgroup>
                <col style="width:150px" /><col /><col style="width:150px" /><col style="width:150px" /><col style="width:120px" /><col style="width:56px" />
              </colgroup>
              <thead>
                <tr>
                  <th>{{ i18n.t('col_commercial') }}</th>
                  <th>{{ i18n.t('client') }}</th>
                  <th>{{ i18n.t('col_product_col') }}</th>
                  <th>{{ i18n.t('col_details') }}</th>
                  <th>{{ i18n.t('tx_date') }}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                @for (c of pagedCollectes(); track c.ref) {
                  <tr class="tx-tr">
                    <td><div class="cell-name">{{ c.collectedByName || '—' }}</div><div class="cell-sub">{{ c.ref }}</div></td>
                    <td [attr.data-label]="i18n.t('client')"><div class="cell-name">{{ c.clientNom || '—' }}</div><div class="cell-sub">{{ c.clientPhone || '—' }}</div></td>
                    <td [attr.data-label]="i18n.t('col_product_col')">{{ i18n.t('prod_' + c.product) }}</td>
                    <td class="brk" [attr.data-label]="i18n.t('col_details')">{{ colDetails(c) }}</td>
                    <td class="nowrap" [attr.data-label]="i18n.t('tx_date')">{{ txDate(c.createdAt) }}</td>
                    <td><button class="icon-btn" (click)="deleteCollecte(c)" [disabled]="colBusy()" [title]="i18n.t('delete')" style="color:var(--accent)"><ic name="trash" [size]="15"></ic></button></td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <div class="tx-pager">
            <span class="muted" style="font-size:11.5px">{{ filteredCollectes().length }} {{ i18n.t('tx_count') }} · {{ i18n.t('step') }} {{ colPage() + 1 }} {{ i18n.t('of') }} {{ colPageCount() }}</span>
            <div style="display:flex;gap:6px">
              <button class="btn btn-outline" (click)="colPrev()" [disabled]="colPage() === 0" style="padding:7px 12px;font-size:13px"><ic name="chevL" [size]="16"></ic></button>
              <button class="btn btn-outline" (click)="colNext()" [disabled]="colPage() >= colPageCount() - 1" style="padding:7px 12px;font-size:13px"><ic name="chevR" [size]="16"></ic></button>
            </div>
          </div>
        }
      </div>

      </div>
      }

      <!-- ========== AUDIT (journal des connexions) ========== -->
      @if (section() === 'audit') {
      <h1 style="font-size:21px">{{ i18n.t('nav_audit') }}</h1>
      <!-- Sub-tabs: Connexions / Actions -->
      <div style="display:flex;gap:6px;margin-bottom:12px;max-width:1180px">
        <button class="btn" [class.btn-primary]="auditTab()==='logins'" [class.btn-outline]="auditTab()!=='logins'"
                (click)="auditTab.set('logins')" style="flex:1;padding:8px;font-size:13px">
          <ic name="shield" [size]="14"></ic> {{ i18n.t('act_tab_logins') }}
        </button>
        <button class="btn" [class.btn-primary]="auditTab()==='actions'" [class.btn-outline]="auditTab()!=='actions'"
                (click)="auditTab.set('actions'); loadActionAudit()" style="flex:1;padding:8px;font-size:13px">
          <ic name="edit" [size]="14"></ic> {{ i18n.t('act_tab_actions') }}
        </button>
      </div>

      <!-- ── Connexions ── -->
      @if (auditTab() === 'logins') {
      <div class="card" style="overflow:hidden;max-width:1180px" reveal="card" data-reveal>
        <div style="display:flex;align-items:center;gap:8px;padding:14px 14px 10px;flex-wrap:wrap">
          <ic name="shield" [size]="17" style="color:var(--primary)"></ic>
          <h3 style="font-size:15px">{{ i18n.t('audit_title') }}</h3>
          <span class="muted" style="margin-left:auto;font-size:12px;font-weight:700">{{ filteredAudit().length }}@if (auditSearch().trim() || auditFilter() !== 'all') { / {{ loginAudits().length }} }</span>
          <button class="icon-btn" (click)="refreshSection('audit')" [title]="i18n.t('dash_refresh')" style="color:var(--muted)"><ic name="refresh" [size]="15"></ic></button>
        </div>
        <p class="muted" style="font-size:11.5px;padding:0 14px 8px">{{ i18n.t('audit_sub') }}</p>
        <div style="padding:0 14px 12px;display:flex;flex-direction:column;gap:8px">
          <div class="input-prefix">
            <span class="pfx"><ic name="search" [size]="15"></ic></span>
            <input [placeholder]="i18n.t('audit_search_ph')" [value]="auditSearch()" (input)="auditSearch.set($any($event.target).value)" />
          </div>
          <div style="display:flex;gap:6px">
            <button class="btn" [class.btn-primary]="auditFilter()==='all'" [class.btn-outline]="auditFilter()!=='all'" (click)="auditFilter.set('all')" style="flex:1;padding:8px;font-size:12.5px">{{ i18n.t('audit_all') }}</button>
            <button class="btn" [class.btn-primary]="auditFilter()==='ok'" [class.btn-outline]="auditFilter()!=='ok'" (click)="auditFilter.set('ok')" style="flex:1;padding:8px;font-size:12.5px">{{ i18n.t('audit_ok') }}</button>
            <button class="btn" [class.btn-primary]="auditFilter()==='ko'" [class.btn-outline]="auditFilter()!=='ko'" (click)="auditFilter.set('ko')" style="flex:1;padding:8px;font-size:12.5px">{{ i18n.t('audit_ko') }}</button>
          </div>
        </div>
        @if (auditLoading()) {
          <div style="overflow-x:auto;padding:0 2px">
            <table class="tx-table" aria-hidden="true">
              <tbody>
                @for (n of skeletonRows; track n) {
                  <tr>
                    <td><span class="skel" style="width:80px;height:12px;display:block"></span></td>
                    <td><span class="skel" style="width:70%;height:13px;display:block;margin-bottom:5px"></span><span class="skel" style="width:50%;height:10px;display:block"></span></td>
                    <td><span class="skel" style="width:60px;height:20px;border-radius:99px;display:block"></span></td>
                    <td><span class="skel" style="width:90px;height:12px;display:block"></span></td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        } @else if (filteredAudit().length === 0) {
          <p class="muted" style="font-size:13px;padding:20px 14px;text-align:center">{{ i18n.t('audit_empty') }}</p>
        } @else {
          <div style="overflow-y:auto;overflow-x:auto;max-height:min(70vh,620px);padding:0 2px">
            <table class="tx-table">
              <colgroup><col style="width:150px" /><col /><col style="width:150px" /><col style="width:130px" /></colgroup>
              <thead>
                <tr>
                  <th>{{ i18n.t('audit_when') }}</th>
                  <th>{{ i18n.t('audit_user') }}</th>
                  <th>{{ i18n.t('audit_result') }}</th>
                  <th>{{ i18n.t('audit_ip') }}</th>
                </tr>
              </thead>
              <tbody>
                @for (a of pagedAudit(); track a.id) {
                  <tr class="tx-tr">
                    <td class="nowrap" [attr.data-label]="i18n.t('audit_when')">{{ txDate(a.at) }}</td>
                    <td [attr.data-label]="i18n.t('audit_user')"><div class="cell-name">{{ a.name || a.email }}</div><div class="cell-sub">{{ a.email }}@if (a.roles) { · {{ a.roles }} }</div></td>
                    <td [attr.data-label]="i18n.t('audit_result')">
                      @if (a.success) {
                        <span class="badge" style="background:color-mix(in srgb, var(--success) 18%, transparent);color:var(--success);font-size:10.5px">{{ i18n.t('audit_success') }}</span>
                      } @else {
                        <span class="badge" style="background:var(--accent-soft);color:var(--accent);font-size:10.5px">{{ i18n.t('audit_failure') }}</span>
                        <span class="muted" style="font-size:10.5px;margin-left:5px">{{ auditReason(a.reason) }}</span>
                      }
                    </td>
                    <td class="brk muted" [attr.data-label]="i18n.t('audit_ip')" style="font-size:11.5px">{{ a.ip || '—' }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <div class="tx-pager">
            <span class="muted" style="font-size:11.5px">{{ filteredAudit().length }} · {{ i18n.t('step') }} {{ auditPage() + 1 }} {{ i18n.t('of') }} {{ auditPageCount() }}</span>
            <div style="display:flex;gap:6px">
              <button class="btn btn-outline" (click)="auditPrev()" [disabled]="auditPage() === 0" style="padding:7px 12px;font-size:13px"><ic name="chevL" [size]="16"></ic></button>
              <button class="btn btn-outline" (click)="auditNext()" [disabled]="auditPage() >= auditPageCount() - 1" style="padding:7px 12px;font-size:13px"><ic name="chevR" [size]="16"></ic></button>
            </div>
          </div>
        }
      </div>
      } <!-- end auditTab logins -->

      <!-- ── Actions ── -->
      @if (auditTab() === 'actions') {
      <div class="card" style="overflow:hidden;max-width:1180px" reveal="card" data-reveal>
        <div style="display:flex;align-items:center;gap:8px;padding:14px 14px 10px;flex-wrap:wrap">
          <ic name="edit" [size]="17" style="color:var(--primary)"></ic>
          <h3 style="font-size:15px">{{ i18n.t('act_title') }}</h3>
          <span class="muted" style="margin-left:auto;font-size:12px;font-weight:700">{{ filteredActions().length }}</span>
        </div>
        <p class="muted" style="font-size:11.5px;padding:0 14px 8px">{{ i18n.t('act_sub') }}</p>
        <div style="padding:0 14px 12px">
          <div class="input-prefix">
            <span class="pfx"><ic name="search" [size]="15"></ic></span>
            <input [placeholder]="i18n.t('act_search_ph')" [value]="actSearch()"
                   (input)="actSearch.set($any($event.target).value)" />
          </div>
        </div>
        @if (actLoading()) {
          <div style="overflow-x:auto;padding:0 2px">
            <table class="tx-table" aria-hidden="true">
              <tbody>
                @for (n of skeletonRows; track n) {
                  <tr>
                    <td><span class="skel" style="width:80px;height:12px;display:block"></span></td>
                    <td><span class="skel" style="width:70%;height:13px;display:block;margin-bottom:5px"></span><span class="skel" style="width:40%;height:10px;display:block"></span></td>
                    <td><span class="skel" style="width:90px;height:20px;border-radius:4px;display:block"></span></td>
                    <td><span class="skel" style="width:70px;height:12px;display:block"></span></td>
                    <td><span class="skel" style="width:80%;height:12px;display:block"></span></td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        } @else if (filteredActions().length === 0) {
          <p class="muted" style="font-size:13px;padding:20px 14px;text-align:center">{{ i18n.t('act_empty') }}</p>
        } @else {
          <div style="overflow-y:auto;overflow-x:auto;max-height:min(70vh,640px);padding:0 2px">
            <table class="tx-table">
              <colgroup>
                <col style="width:148px"/><col style="width:160px"/><col style="width:170px"/><col style="width:120px"/><col/>
              </colgroup>
              <thead>
                <tr>
                  <th>{{ i18n.t('audit_when') }}</th>
                  <th>{{ i18n.t('act_actor') }}</th>
                  <th>{{ i18n.t('act_action') }}</th>
                  <th>{{ i18n.t('act_entity') }}</th>
                  <th>{{ i18n.t('act_details') }}</th>
                </tr>
              </thead>
              <tbody>
                @for (a of pagedActions(); track a.id) {
                  <tr class="tx-tr">
                    <td class="nowrap">{{ txDate(a.at) }}</td>
                    <td>
                      <div class="cell-name">{{ a.actorName || '—' }}</div>
                      <div class="cell-sub">{{ a.actorRoles || '' }}</div>
                    </td>
                    <td>
                      <span class="badge" style="background:color-mix(in srgb,var(--primary) 12%,transparent);color:var(--primary);font-size:10.5px;white-space:nowrap">
                        {{ actionLabel(a.action) }}
                      </span>
                    </td>
                    <td class="muted" style="font-size:11.5px">
                      @if (a.entityType) { <span style="font-weight:700">{{ a.entityType }}</span> }
                      @if (a.entityRef) { <div class="cell-sub">{{ a.entityRef }}</div> }
                    </td>
                    <td style="font-size:12px;color:var(--text)">{{ a.details || '—' }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <div class="tx-pager">
            <span class="muted" style="font-size:11.5px">{{ filteredActions().length }} · {{ i18n.t('step') }} {{ actPage() + 1 }} {{ i18n.t('of') }} {{ actPageCount() }}</span>
            <div style="display:flex;gap:6px">
              <button class="btn btn-outline" (click)="actPrev()" [disabled]="actPage()===0" style="padding:7px 12px;font-size:13px"><ic name="chevL" [size]="16"></ic></button>
              <button class="btn btn-outline" (click)="actNext()" [disabled]="actPage()>=actPageCount()-1" style="padding:7px 12px;font-size:13px"><ic name="chevR" [size]="16"></ic></button>
            </div>
          </div>
        }
      </div>
      } <!-- end auditTab actions -->
      }

      <!-- ========== MAP ========== -->
      @if (section() === 'map') {
        <div reveal="screen">
        <div class="card" style="padding:16px" data-reveal="card">
          <h2 style="font-size:16px;margin-bottom:4px">{{ i18n.t('nav_map') }}</h2>
          <p class="muted" style="font-size:12.5px;margin-bottom:14px">{{ i18n.t('map_sub') }}</p>
          <admin-map></admin-map>
        </div>
        </div>
      }

      <!-- ========== HABILITATIONS ========== -->
      @if (section() === 'habilitations') {
      <div reveal="screen">
      <h1 style="font-size:21px" data-reveal="item">{{ i18n.t('hab_title') }}</h1>
      <p class="muted" style="font-size:13px;margin-top:-8px;margin-bottom:14px" data-reveal="item">{{ i18n.t('hab_sub') }}</p>

      <!-- Profile list -->
      <div class="card" style="padding:16px;margin-bottom:14px" data-reveal="card">
        <div class="kicker" style="margin-bottom:12px;display:flex;align-items:center;gap:8px">
          <span>{{ i18n.t('hab_profiles') }} · {{ profilesList().length }}</span>
          <button class="btn btn-primary" (click)="startNewProfile()" [disabled]="editProfileId() !== null"
                  style="margin-left:auto;padding:5px 12px;font-size:12px">
            <ic name="plus" [size]="14"></ic> {{ i18n.t('hab_new_profile') }}
          </button>
        </div>
        @if (profilesLoading()) {
          <div class="load-center"><spinner tone="primary" [size]="20"></spinner> {{ i18n.t('loading') }}</div>
        } @else {
          @for (profile of profilesList(); track profile.id) {
            <div style="border-top:1px solid var(--border);padding:10px 2px">
              <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                <div style="flex:1;min-width:0">
                  <div style="font-size:13.5px;font-weight:700">{{ profile.name }}
                    @if (profile.builtin) {
                      <span class="badge" style="background:var(--surface-2);color:var(--muted);font-size:10px;margin-left:5px">{{ i18n.t('hab_builtin') }}</span>
                    }
                  </div>
                  @if (profile.description) { <div class="muted" style="font-size:11.5px;margin-top:2px">{{ profile.description }}</div> }
                  <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:6px">
                    @for (mod of permMatrix; track mod.module) {
                      @for (action of mod.actions; track action) {
                        @if (profile.permissions.includes(asPermission(mod.module + '_' + action))) {
                          <span class="badge" style="background:var(--primary-soft,#e8f0fe);color:var(--primary);font-size:10px">
                            {{ i18n.t('hab_module_' + mod.module) }} · {{ i18n.t('hab_perm_' + action.toLowerCase()) }}
                          </span>
                        }
                      }
                    }
                    @if (!profile.permissions.length) {
                      <span class="muted" style="font-size:11px">{{ i18n.t('hab_no_perm') }}</span>
                    }
                  </div>
                </div>
                <div style="display:flex;gap:6px;flex-shrink:0">
                  <button class="icon-btn" (click)="startEditProfile(profile)"><ic name="pencil" [size]="15"></ic></button>
                  @if (!profile.builtin) {
                    <button class="icon-btn" (click)="deleteProfile(profile)" style="color:var(--accent)"><ic name="trash" [size]="15"></ic></button>
                  }
                </div>
              </div>
            </div>
          }
          @if (profileDeleteMsg()) {
            <p style="font-size:12px;color:var(--success);font-weight:700;margin-top:8px">{{ i18n.t('hab_deleted') }}</p>
          }
        }
      </div>

      <!-- Profile editor (create / edit) -->
      @if (editProfileId() !== null) {
        <div class="card" style="padding:16px;margin-bottom:14px" data-reveal="card">
          <div class="kicker" style="margin-bottom:12px">
            {{ editProfileId() === -1 ? i18n.t('hab_new_profile') : (profilesList().find(p => p.id === editProfileId())?.name ?? '') }}
          </div>
          <div style="display:flex;flex-direction:column;gap:12px">
            <field [label]="i18n.t('hab_profile_name')">
              <input class="input" [placeholder]="i18n.t('hab_profile_name_ph')"
                     [value]="profileDraft().name"
                     (input)="profileDraft.update(f => ({...f, name: $any($event.target).value}))" />
            </field>
            <field [label]="i18n.t('hab_profile_desc')">
              <input class="input" [placeholder]="i18n.t('hab_profile_desc_ph')"
                     [value]="profileDraft().description"
                     (input)="profileDraft.update(f => ({...f, description: $any($event.target).value}))" />
            </field>
            <!-- Permission matrix -->
            <div>
              <div class="kicker" style="margin-bottom:8px">{{ i18n.t('hab_permissions') }}</div>
              <div style="overflow-x:auto">
                <table style="border-collapse:collapse;font-size:12.5px;min-width:100%">
                  <thead>
                    <tr style="background:var(--surface-2)">
                      <th style="text-align:left;padding:6px 10px;border:1px solid var(--border);min-width:130px">Module</th>
                      @for (action of allActions; track action) {
                        <th style="text-align:center;padding:6px 10px;border:1px solid var(--border);white-space:nowrap">
                          {{ i18n.t('hab_perm_' + action.toLowerCase()) }}
                        </th>
                      }
                    </tr>
                  </thead>
                  <tbody>
                    @for (mod of permMatrix; track mod.module) {
                      <tr>
                        <td style="padding:7px 10px;border:1px solid var(--border);font-weight:600">
                          {{ i18n.t('hab_module_' + mod.module) }}
                        </td>
                        @for (action of allActions; track action) {
                          <td style="text-align:center;padding:7px 10px;border:1px solid var(--border)">
                            @if (mod.actions.includes(action)) {
                              <input type="checkbox"
                                     [checked]="profileDraft().permissions.includes(mod.module + '_' + action)"
                                     (change)="toggleProfilePerm(mod.module + '_' + action)"
                                     style="cursor:pointer;width:15px;height:15px" />
                            } @else {
                              <span style="color:var(--border)">—</span>
                            }
                          </td>
                        }
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            </div>
            @if (editProfileId()! > 0 && profilesList().find(p => p.id === editProfileId())?.builtin) {
              <p class="muted" style="font-size:11.5px;display:flex;align-items:center;gap:5px">
                <ic name="alert" [size]="13"></ic> {{ i18n.t('hab_builtin_tip') }}
              </p>
            }
            @if (profileSaveMsg()) {
              <span style="font-size:12px;color:var(--success);font-weight:700">{{ i18n.t('hab_saved') }}</span>
            }
            <div style="display:flex;gap:8px">
              <button class="btn btn-primary" [disabled]="!profileDraft().name.trim() || profileSaving()" (click)="saveProfile()" style="padding:7px 14px;font-size:12.5px">
                @if (profileSaving()) { <spinner></spinner> } @else { {{ i18n.t('save') }} }
              </button>
              <button class="btn btn-ghost" (click)="cancelProfileEdit()" style="padding:7px 14px;font-size:12.5px">{{ i18n.t('cancel_short') }}</button>
            </div>
          </div>
        </div>
      }

      </div>
      }

      </main>
    </div>
  </div>`,
})
export class AdminComponent implements OnInit, OnDestroy {
  i18n = inject(I18n);
  auth = inject(Auth);
  private api = inject(Api);
  private configStore = inject(ConfigStore);
  private router = inject(Router);
  private stopPoll?: () => void;

  /** Active sidebar section. */
  section = signal<'overview' | 'config' | 'users' | 'agencies' | 'agence-retrait' | 'transactions' | 'recharges' | 'collectes' | 'audit' | 'map' | 'habilitations'>('overview');
  auditTab = signal<'logins' | 'actions'>('logins');
  /** Overview sub-tabs: card purchases (default) vs. recharges. */
  overviewTab = signal<'achat' | 'recharge'>('achat');

  /** Mobile only: the nav collapses behind a toggle so it no longer eats the top of the screen. */
  menuOpen = signal(false);
  /** Label shown on the mobile nav toggle — the current section's name. */
  currentNavLabel = computed(() => {
    const keys: Record<string, string> = {
      overview: 'nav_overview', config: 'nav_config',
      users: this.isSupervisor() ? 'nav_collecteurs' : 'nav_users',
      agencies: 'nav_agencies', 'agence-retrait': 'nav_agence_retrait',
      transactions: 'nav_transactions', recharges: 'nav_recharges',
      collectes: 'nav_collectes', audit: 'nav_audit', map: 'nav_map',
      habilitations: 'nav_habilitations',
    };
    return this.i18n.t(keys[this.section()] ?? 'nav_overview');
  });

  readonly skeletonRows = [1, 2, 3, 4, 5, 6, 7, 8];

  private debouncedOf<T>(src: Signal<T>, delay = 250): Signal<T> {
    const out = signal<T>(src());
    effect((onCleanup) => {
      const v = src();
      const t = setTimeout(() => out.set(v), delay);
      onCleanup(() => clearTimeout(t));
    });
    return out;
  }

  loadedSections = new Set<string>();
  private readonly _sectionEffect = effect(() => {
    const s = this.section();
    if (this.loadedSections.has(s)) return;
    this.loadedSections.add(s);
    if (s === 'agencies')    this.loadAgencies();
    if (s === 'recharges')   this.loadRecharges();
    if (s === 'collectes')   this.loadCollectes();
    if (s === 'audit')       this.loadAudit();
  });

  /** The overview "Recharge" tab reuses the recharge dataset — load it lazily on first open. */
  private readonly _overviewRechargeEffect = effect(() => {
    if (this.section() !== 'overview' || this.overviewTab() !== 'recharge') return;
    if (this.loadedSections.has('recharges')) return;
    this.loadedSections.add('recharges');
    this.loadRecharges();
  });

  /** A supervisor (without ADMIN) gets a restricted view: only collecteur user management. */
  readonly isSupervisor = computed(() => this.auth.hasRole('SUPERVISEUR') && !this.auth.hasRole('ADMIN'));
  goCollecte() { this.router.navigateByUrl('/collecte'); }
  goCollecteStats() { this.router.navigateByUrl('/collecte-stats'); }

  stats = signal<AdminStats | null>(null);
  payStats = signal<PaymentStats | null>(null);

  // --- payment reconciliation (verify the last N hours against the live gateway) ---
  reconHours = signal(4);
  reconLoading = signal(false);
  reconReport = signal<ReconcileReport | null>(null);
  reconError = signal('');
  /** True regularisations: the pay status actually moved (e.g. failed → paid). A reconcile pass also
   *  flags changed=true when it merely refreshed the aggregator's decline message on an order that stays
   *  failed/pending (statusBefore === statusAfter) — those are NOT regularisations and would otherwise
   *  show as a confusing "failed → failed". We keep only the real status moves here. */
  reconChanged = computed(() => (this.reconReport()?.details ?? [])
    .filter((d) => d.changed && d.statusBefore !== d.statusAfter));
  /** Count of orders whose status did not move but whose failure reason was refreshed. */
  reconReasonRefreshed = computed(() => (this.reconReport()?.details ?? [])
    .filter((d) => d.changed && d.statusBefore === d.statusAfter).length);
  clampHours(v: unknown) { return Math.min(168, Math.max(1, Math.floor(Number(v) || 1))); }

  runReconcile() {
    if (this.reconLoading()) return;
    this.reconLoading.set(true);
    this.reconError.set('');
    this.reconReport.set(null);
    this.api.reconcilePayments(this.clampHours(this.reconHours())).subscribe({
      next: (r) => { this.reconReport.set(r); this.reconLoading.set(false); },
      error: (e) => {
        this.reconLoading.set(false);
        const code = e?.error?.error as string | undefined;
        this.reconError.set(
          code === 'reconcile_already_running' ? this.i18n.t('recon_busy')
          : code === 'reconcile_requires_trustpayway' ? this.i18n.t('recon_no_gateway')
          : this.i18n.t('recon_failed'));
      },
    });
  }

  // --- live verification (SSE): re-check EVERY pending/failed MoMo order, streaming a log per order ---
  streamRunning = signal(false);
  streamTotal = signal(0);
  streamDone = signal(0);
  streamUpdated = signal(0);     // real regularisations (status actually moved)
  streamReason = signal(0);      // same status, decline reason refreshed
  streamUnchanged = signal(0);
  streamErrors = signal(0);
  streamError = signal('');
  streamLines = signal<{ i: number; text: string; color: string }[]>([]);
  private streamAbort: AbortController | null = null;

  /** Open the SSE stream with the JWT Bearer header (EventSource can't set headers, so we read the
   *  response body manually) and render one log line per verified order as it arrives. */
  async runStream() {
    if (this.streamRunning()) return;
    this.streamRunning.set(true);
    this.streamError.set('');
    this.streamLines.set([]);
    this.streamTotal.set(0); this.streamDone.set(0);
    this.streamUpdated.set(0); this.streamReason.set(0); this.streamUnchanged.set(0); this.streamErrors.set(0);
    const ctrl = new AbortController();
    this.streamAbort = ctrl;
    try {
      const res = await fetch('/api/payment/reconcile/stream', {
        headers: { Authorization: `Bearer ${this.auth.token ?? ''}`, Accept: 'text/event-stream' },
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        this.streamError.set(res.status === 409 ? this.i18n.t('recon_busy') : this.i18n.t('recon_failed'));
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let sep: number;
        while ((sep = buf.indexOf('\n\n')) >= 0) {
          const frame = buf.slice(0, sep);
          buf = buf.slice(sep + 2);
          this.handleStreamFrame(frame);
        }
      }
    } catch {
      if (!ctrl.signal.aborted) this.streamError.set(this.i18n.t('recon_failed'));
    } finally {
      this.streamRunning.set(false);
      this.streamAbort = null;
    }
  }

  stopStream() {
    this.streamAbort?.abort();
    this.streamRunning.set(false);
  }

  /** Parse one SSE frame ("event: <name>\n data: <json>") and dispatch it. */
  private handleStreamFrame(frame: string) {
    let event = 'message';
    const dataLines: string[] = [];
    for (const line of frame.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).replace(/^ /, ''));
    }
    if (!dataLines.length) return;
    let data: any;
    try { data = JSON.parse(dataLines.join('\n')); } catch { return; }
    if (event === 'start') { this.streamTotal.set(data.total ?? 0); return; }
    if (event === 'error') {
      this.streamError.set(
        data.error === 'reconcile_already_running' ? this.i18n.t('recon_busy')
        : data.error === 'reconcile_requires_trustpayway' ? this.i18n.t('recon_no_gateway')
        : this.i18n.t('recon_failed'));
      return;
    }
    if (event === 'log') this.appendStreamLine(data);
    // 'done' carries the final report; the live counters already reflect it, so nothing to do.
  }

  private appendStreamLine(d: { index: number; ref: string; statusBefore: string; statusAfter: string;
                                changed: boolean; note: string; reason: string }) {
    this.streamDone.set(d.index);
    const before = d.statusBefore || '?';
    const after = d.statusAfter || '?';
    let text: string, color: string;
    if (!d.changed && d.note) {                          // gateway/DB error on this order
      this.streamErrors.update((n) => n + 1);
      text = `✗ ${d.ref} — ${d.note}`; color = 'var(--accent)';
    } else if (d.changed && before !== after) {          // real regularisation
      this.streamUpdated.update((n) => n + 1);
      const recovered = after === 'paid';
      text = `✓ ${d.ref} : ${before} → ${after}${recovered ? ' (régularisé)' : ''}`;
      color = recovered ? 'var(--success)' : 'var(--accent)';
    } else if (d.changed) {                              // same status, decline reason refreshed
      this.streamReason.update((n) => n + 1);
      text = `• ${d.ref} : ${after} (motif rafraîchi${d.reason ? ' : ' + d.reason : ''})`;
      color = 'var(--muted)';
    } else {                                             // already aligned
      this.streamUnchanged.update((n) => n + 1);
      text = `· ${d.ref} : ${after} (inchangé)`; color = 'var(--muted)';
    }
    // Bound the DOM: keep the last 500 lines (counters above stay exact regardless).
    this.streamLines.update((lines) => {
      const next = [...lines, { i: d.index, text, color }];
      return next.length > 500 ? next.slice(next.length - 500) : next;
    });
    // Best-effort auto-scroll to the newest line.
    setTimeout(() => { const el = document.querySelector('.vstream-log'); if (el) el.scrollTop = el.scrollHeight; }, 0);
  }

  // Filtre date pour la vue d'ensemble
  overviewFrom = signal('');
  overviewTo   = signal('');
  private _overviewFilterInitialized = false;
  private readonly _overviewFilterEffect = effect(() => {
    const from = this.overviewFrom(), to = this.overviewTo();
    if (!this._overviewFilterInitialized) { this._overviewFilterInitialized = true; return; }
    this.statsLoading.set(true);
    this.api.adminStats(from || undefined, to || undefined)
      .subscribe({ next: (s) => { this.stats.set(s); this.statsLoading.set(false); }, error: () => this.statsLoading.set(false) });
    // The MoMo funnel (incl. the "Échecs réseau / indéterminés" card) must honour the same window.
    this.api.paymentStats(from || undefined, to || undefined)
      .subscribe({ next: (p) => this.payStats.set(p), error: () => {} });
  });
  txs = signal<Subscription[]>([]);
  // Per-section loading flags so each panel can show a spinner while its request is in flight.
  statsLoading = signal(true);
  txLoading = signal(true);
  usersLoading = signal(true);
  cfgLoading = signal(true);
  saving = signal(false);
  // Signals so the "save" button's [disabled] binding stays reactive (the app is zoneless).
  cfg = signal<CardConfig>({ price: 0, fees: 0, transport: 0, rechargeMin: 0, rechargeMax: 0, rechargeInitiale: 0, passPremium: 0, rechargeInitialeBancaire: 0, passPremiumBancaire: 0 });
  private original = signal<CardConfig>({ price: 0, fees: 0, transport: 0, rechargeMin: 0, rechargeMax: 0, rechargeInitiale: 0, passPremium: 0, rechargeInitialeBancaire: 0, passPremiumBancaire: 0 });
  changed = computed(() => {
    const c = this.cfg(), o = this.original();
    return c.price !== o.price || c.fees !== o.fees || c.transport !== o.transport
      || c.rechargeMin !== o.rechargeMin || c.rechargeMax !== o.rechargeMax
      || c.rechargeInitiale !== o.rechargeInitiale || c.passPremium !== o.passPremium
      || c.rechargeInitialeBancaire !== o.rechargeInitialeBancaire || c.passPremiumBancaire !== o.passPremiumBancaire;
  });
  saved = signal(false);
  saveErr = signal(false);

  // --- user management ---
  usersList = signal<User[]>([]);
  userSearch = signal('');
  private readonly dbUserSearch = this.debouncedOf(this.userSearch);
  userFilterRole = signal<Role | null>(null);
  userFilterDateFrom = signal('');
  userFilterDateTo = signal('');
  /** Secondary panel: create form or bulk import (main view stays the searchable list). */
  userPanel = signal<'none' | 'create' | 'import'>('none');
  hasActiveFilters = computed(() =>
    !!this.userSearch().trim() || this.userFilterRole() !== null ||
    !!this.userFilterDateFrom() || !!this.userFilterDateTo()
  );
  filteredUsers = computed(() => {
    const q = this.dbUserSearch().trim().toLowerCase();
    const digits = this.dbUserSearch().replace(/\D/g, '');
    const filterRole = this.userFilterRole();
    const dateFrom = this.userFilterDateFrom() ? new Date(this.userFilterDateFrom() + 'T00:00:00') : null;
    const dateTo = this.userFilterDateTo() ? new Date(this.userFilterDateTo() + 'T23:59:59') : null;
    return this.usersList().filter((u) => {
      if (q || digits) {
        const roles = this.userRoles(u).map((r) => this.roleLabel(r)).join(' ');
        const hay = `${u.name} ${u.email} ${u.phone ?? ''} ${u.agency ?? ''} ${roles}`.toLowerCase();
        const phone = (u.phone ?? '').replace(/\D/g, '');
        if (!hay.includes(q) && !(digits && phone.includes(digits))) return false;
      }
      if (filterRole && !this.userRoles(u).includes(filterRole)) return false;
      if (dateFrom || dateTo) {
        const created = u.createdAt ? new Date(u.createdAt) : null;
        if (!created) return !(dateFrom || dateTo);
        if (dateFrom && created < dateFrom) return false;
        if (dateTo && created > dateTo) return false;
      }
      return true;
    });
  });
  clearUserFilters() {
    this.userSearch.set('');
    this.userFilterRole.set(null);
    this.userFilterDateFrom.set('');
    this.userFilterDateTo.set('');
  }

  // --- selection & bulk role assignment ---
  selectedUserIds = signal<Set<string>>(new Set());
  bulkAssignRole = signal<Role | null>(null);
  bulkAssignBusy = signal(false);
  bulkAssignMsg = signal('');
  toggleSelectUser(u: User) {
    this.selectedUserIds.update((s) => { const n = new Set(s); n.has(u.id) ? n.delete(u.id) : n.add(u.id); return n; });
    this.bulkAssignMsg.set('');
  }
  isAllPageSelected = computed(() => {
    const ids = this.selectedUserIds();
    return this.pagedUsers().length > 0 && this.pagedUsers().every((u) => ids.has(u.id));
  });
  isSomePageSelected = computed(() => {
    const ids = this.selectedUserIds();
    return this.pagedUsers().some((u) => ids.has(u.id)) && !this.isAllPageSelected();
  });
  toggleSelectAllPage() {
    const all = this.pagedUsers();
    if (this.isAllPageSelected()) {
      this.selectedUserIds.update((s) => { const n = new Set(s); all.forEach((u) => n.delete(u.id)); return n; });
    } else {
      this.selectedUserIds.update((s) => { const n = new Set(s); all.forEach((u) => n.add(u.id)); return n; });
    }
    this.bulkAssignMsg.set('');
  }
  clearSelection() { this.selectedUserIds.set(new Set()); this.bulkAssignRole.set(null); this.bulkAssignMsg.set(''); this.notifMsg.set(''); }

  // --- notification compose ---
  notifPanelOpen    = signal(false);
  notifRecipientIds = signal<Set<string>>(new Set());
  notifTitle = '';
  notifBody  = '';
  notifBusy  = signal(false);
  notifMsg   = signal('');
  notifImageData = signal<string | null>(null);

  readonly notifRoleChips: { role: string; label: string }[] = [
    { role: 'ALL',         label: 'Tous' },
    { role: 'AGENT',       label: 'Agents' },
    { role: 'CASHIER',     label: 'Caissiers' },
    { role: 'PRINT_AGENT', label: 'Imprimeurs' },
    { role: 'ADMIN',       label: 'Admins' },
    { role: 'SUPERVISEUR', label: 'Superviseurs' },
    { role: 'COLLECTEUR',  label: 'Collecteurs' },
  ];

  usersForRole(role: string) {
    const all = this.usersList().filter(u => u.enabled !== false);
    if (role === 'ALL') return all;
    return all.filter(u => (u.roles ?? [u.role]).includes(role as Role));
  }

  countByRole(role: string): number { return this.usersForRole(role).length; }

  isRoleFullySelected(role: string): boolean {
    const users = this.usersForRole(role);
    if (!users.length) return false;
    const sel = this.notifRecipientIds();
    return users.every(u => sel.has(u.id));
  }

  toggleNotifRole(role: string) {
    const users = this.usersForRole(role);
    const allIn = this.isRoleFullySelected(role);
    this.notifRecipientIds.update(s => {
      const n = new Set(s);
      allIn ? users.forEach(u => n.delete(u.id)) : users.forEach(u => n.add(u.id));
      return n;
    });
  }

  clearNotifRecipients() { this.notifRecipientIds.set(new Set()); }
  clearTxStatuses() { this.txStatuses.set(new Set()); }

  openNotifPanel(seedFromSelection: boolean) {
    this.notifRecipientIds.set(seedFromSelection && this.selectedUserIds().size > 0
      ? new Set(this.selectedUserIds()) : new Set());
    this.notifPanelOpen.set(true);
    this.notifMsg.set('');
  }

  onNotifImagePicked(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => this.notifImageData.set(e.target?.result as string ?? null);
    reader.readAsDataURL(file);
  }

  clearNotifImage() { this.notifImageData.set(null); }

  sendNotification() {
    const ids = [...this.notifRecipientIds()];
    if (!this.notifTitle.trim() || !ids.length || this.notifBusy()) return;
    this.notifBusy.set(true); this.notifMsg.set('');
    this.api.sendNotification({
      title: this.notifTitle.trim(),
      body: this.notifBody.trim(),
      recipientIds: ids,
      imageData: this.notifImageData() ?? undefined,
    }).subscribe({
      next: () => {
        this.notifBusy.set(false); this.notifMsg.set('done');
        this.notifTitle = ''; this.notifBody = ''; this.notifImageData.set(null);
      },
      error: () => { this.notifBusy.set(false); this.notifMsg.set('error'); },
    });
  }
  applyBulkAssign() {
    const role = this.bulkAssignRole();
    const ids = [...this.selectedUserIds()];
    if (!role || !ids.length || this.bulkAssignBusy()) return;
    this.bulkAssignBusy.set(true); this.bulkAssignMsg.set('');
    let done = 0;
    for (const id of ids) {
      const u = this.usersList().find((x) => x.id === id);
      if (!u) { done++; if (done === ids.length) this.finishBulkAssign(); continue; }
      const roles: Role[] = [...new Set([...this.userRoles(u), role])];
      this.api.setUserRoles(id, roles).subscribe({
        next: (updated) => {
          this.usersList.update((list) => list.map((x) => (x.id === id ? updated : x)));
          done++;
          if (done === ids.length) this.finishBulkAssign();
        },
        error: () => { done++; if (done === ids.length) this.finishBulkAssign(); },
      });
    }
  }
  private finishBulkAssign() {
    this.bulkAssignBusy.set(false);
    this.bulkAssignMsg.set('done');
    this.loadUsers();
  }
  // Client-side pagination of the filtered staff accounts list.
  userPage = signal(0);
  readonly userPageSize = 8;
  userPageCount = computed(() => Math.max(1, Math.ceil(this.filteredUsers().length / this.userPageSize)));
  pagedUsers = computed(() => {
    const all = this.filteredUsers();
    const p = Math.min(this.userPage(), this.userPageCount() - 1);
    return all.slice(p * this.userPageSize, p * this.userPageSize + this.userPageSize);
  });
  private readonly _userPageReset = effect(() => { this.filteredUsers().length; this.userPage.set(0); });
  userPrev() { this.userPage.update((p) => Math.max(0, p - 1)); }
  userNext() { this.userPage.update((p) => Math.min(this.userPageCount() - 1, p + 1)); }

  exportUsers() {
    const esc = (v: string) => `"${(v ?? '').replace(/"/g, '""')}"`;
    const header = ['Nom', 'Email', 'Téléphone', 'Rôle(s)', 'Agence', 'Actif'];
    const rows = this.filteredUsers().map((u) => [
      u.name,
      u.email,
      u.phone ?? '',
      this.userRoles(u).map((r) => this.roleLabel(r)).join(' / '),
      u.agency ?? '',
      u.enabled === false ? 'Non' : 'Oui',
    ].map((v) => esc(String(v))).join(','));
    this.downloadCsv('utilisateurs.csv', '﻿' + [header.join(','), ...rows].join('\r\n'));
  }

  openUserCreate() {
    this.userPanel.set('create');
    this.userMsg.set('');
    this.createdPw.set('');
    this.createdPin.set('');
  }
  openUserImport() { this.userPanel.set('import'); }
  closeUserPanel() { this.userPanel.set('none'); }

  recreateUser(u: User) {
    if (this.userRecreating() || u.enabled !== false) return;
    if (!confirm(this.i18n.t('user_recreate_confirm'))) return;
    this.userRecreating.set(u.id);
    this.userMsg.set('');
    this.createdPw.set('');
    this.createdPin.set('');
    this.api.recreateUser(u.id).subscribe({
      next: (res) => {
        this.userRecreating.set('');
        this.userMsg.set('recreated');
        this.createdPw.set(res.tempPassword);
        this.pwCopied.set(false);
        this.createdPin.set(res.pin || '');
        this.pinCopied.set(false);
        this.loadUsers();
      },
      error: (err) => {
        this.userRecreating.set('');
        this.userMsg.set(err?.status === 409 && err?.error?.error === 'account_active' ? 'user_active' : 'invalid');
      },
    });
  }
  resetUserCredentials(u: User) {
    if (this.userResetting() || u.enabled === false) return;
    if (!confirm(this.i18n.t('user_reset_confirm'))) return;
    this.userResetting.set(u.id);
    this.userMsg.set('');
    this.createdPw.set('');
    this.createdPin.set('');
    this.api.resetUserCredentials(u.id).subscribe({
      next: (res) => {
        this.userResetting.set('');
        this.userMsg.set('reset');
        this.createdPw.set(res.tempPassword || '');
        this.pwCopied.set(false);
        this.createdPin.set(res.pin || '');
        this.pinCopied.set(false);
      },
      error: (err) => {
        this.userResetting.set('');
        this.userMsg.set(err?.status === 409 && err?.error?.error === 'account_disabled' ? 'user_disabled' : 'invalid');
      },
    });
  }
  // Enable/disable a staff account (admin only). userToggling holds the id being updated.
  userToggling = signal('');
  userRecreating = signal('');
  userResetting = signal('');
  userToggleErr = signal('');
  toggleUser(u: User) {
    const next = u.enabled === false;   // currently disabled → re-enable; else disable
    if (!next && !confirm(this.i18n.t('user_disable_confirm'))) return;
    this.userToggleErr.set('');
    this.userToggling.set(u.id);
    this.api.setUserEnabled(u.id, next).subscribe({
      next: (updated) => {
        this.userToggling.set('');
        this.usersList.update((list) => list.map((x) => (x.id === u.id ? { ...x, enabled: updated.enabled } : x)));
      },
      error: (err) => {
        this.userToggling.set('');
        const code = err?.error?.error;
        this.userToggleErr.set(code === 'last_admin' ? 'user_err_last_admin'
          : code === 'cannot_disable_self' ? 'user_err_self' : 'user_err_toggle');
      },
    });
  }
  readonly allRoles = ALL_ROLES;
  readonly permMatrix = PERM_MATRIX;
  readonly allActions = ['READ', 'WRITE', 'VALIDATE', 'PRINT', 'EXPORT'];

  // --- profile / habilitation management ---
  profilesList = signal<Profile[]>([]);
  profilesLoading = signal(false);
  loadProfiles() {
    if (this.profilesList().length) return;
    this.profilesLoading.set(true);
    this.api.getProfiles().subscribe({ next: (ps) => { this.profilesList.set(ps); this.profilesLoading.set(false); }, error: () => this.profilesLoading.set(false) });
  }
  profileById(id: number): Profile | undefined { return this.profilesList().find((p) => p.id === id); }
  asPermission(s: string) { return s as any; }

  editProfileId = signal<number | null>(null);
  profileDraft = signal<{ name: string; description: string; permissions: string[] }>({ name: '', description: '', permissions: [] });
  profileSaving = signal(false);
  profileSaveMsg = signal(false);
  profileDeleteMsg = signal(false);

  startNewProfile() {
    this.editProfileId.set(-1);
    this.profileDraft.set({ name: '', description: '', permissions: [] });
    this.profileSaveMsg.set(false);
  }
  startEditProfile(p: Profile) {
    this.editProfileId.set(p.id);
    this.profileDraft.set({ name: p.name, description: p.description ?? '', permissions: [...p.permissions] });
    this.profileSaveMsg.set(false);
  }
  cancelProfileEdit() { this.editProfileId.set(null); }
  toggleProfilePerm(key: string) {
    this.profileDraft.update((d) => {
      const perms = d.permissions.includes(key) ? d.permissions.filter((p) => p !== key) : [...d.permissions, key];
      return { ...d, permissions: perms };
    });
  }
  saveProfile() {
    const draft = this.profileDraft();
    if (!draft.name.trim() || this.profileSaving()) return;
    const req = { name: draft.name.trim(), description: draft.description.trim(), permissions: draft.permissions as any[] };
    this.profileSaving.set(true); this.profileSaveMsg.set(false);
    const id = this.editProfileId();
    const obs = id === -1 ? this.api.createProfile(req) : this.api.updateProfile(id!, req);
    obs.subscribe({
      next: (saved) => {
        this.profilesList.update((list) => {
          const idx = list.findIndex((p) => p.id === saved.id);
          return idx >= 0 ? list.map((p) => (p.id === saved.id ? saved : p)) : [...list, saved];
        });
        this.profileSaving.set(false); this.profileSaveMsg.set(true);
        this.editProfileId.set(saved.id);
      },
      error: () => this.profileSaving.set(false),
    });
  }
  deleteProfile(p: Profile) {
    if (!confirm(this.i18n.t('hab_delete_confirm'))) return;
    this.api.deleteProfile(p.id).subscribe({
      next: () => {
        this.profilesList.update((list) => list.filter((x) => x.id !== p.id));
        this.profileDeleteMsg.set(true);
        setTimeout(() => this.profileDeleteMsg.set(false), 3000);
      },
    });
  }

  // --- profile assignment to users ---
  assignProfilesId = signal<string | null>(null);
  assignProfileIds = signal<number[]>([]);
  assignProfilesSaving = signal(false);
  assignProfilesErr = signal('');
  assignProfilesMsg = signal(false);

  startAssignProfiles(u: User) {
    this.editUserId.set(null);
    this.userActionsId.set(null);
    this.editRolesId.set(null);
    this.assignProfilesId.set(u.id);
    this.assignProfileIds.set([...(u.profileIds ?? [])]);
    this.assignProfilesErr.set('');
    this.assignProfilesMsg.set(false);
    this.loadProfiles();
  }
  toggleAssignProfile(id: number) {
    this.assignProfileIds.update((ids) => ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);
  }
  saveAssignProfiles(u: User) {
    if (this.assignProfilesSaving()) return;
    this.assignProfilesSaving.set(true); this.assignProfilesErr.set(''); this.assignProfilesMsg.set(false);
    this.api.setUserProfiles(u.id, this.assignProfileIds()).subscribe({
      next: (updated) => {
        this.usersList.update((list) => list.map((x) => (x.id === u.id ? updated : x)));
        if (updated.id === this.auth.user()?.id) this.auth.setUser(updated);
        this.assignProfilesSaving.set(false); this.assignProfilesMsg.set(true);
      },
      error: () => { this.assignProfilesSaving.set(false); this.assignProfilesErr.set('generic_error'); },
    });
  }

  nu = signal<CreateUserRequest>({ name: '', email: '', role: 'AGENT', agency: '', phone: '' });
  /** Roles selected on the create form (multi-role). */
  nuRoles = signal<Role[]>(['AGENT']);
  userMsg = signal<'' | 'created' | 'recreated' | 'reset' | 'exists' | 'phone_exists' | 'invalid' | 'user_active' | 'user_disabled'>('');
  userBusy = signal(false);
  /** Temporary password returned on the last successful creation (also emailed to the user). */
  createdPw = signal('');
  pwCopied = signal(false);
  /** 4-digit login PIN returned when a collecteur account was just created (phone+PIN sign-in). */
  createdPin = signal('');
  pinCopied = signal(false);
  nuHasRole(r: Role) { return this.nuRoles().includes(r); }
  toggleNuRole(r: Role) {
    this.nuRoles.update((list) => list.includes(r) ? list.filter((x) => x !== r) : [...list, r]);
  }
  /** The full role set of an account (for the user list badges). */
  userRoles(u: User): Role[] { return u.roles && u.roles.length ? u.roles : [u.role]; }
  /** Phone is mandatory for every account: a valid local 9-digit Cameroon mobile (also the
   *  collecteur's login id, and what links a client's referral to an agent's stats). */
  phoneOk = computed(() => /^6\d{8}$/.test((this.nu().phone ?? '').replace(/\D/g, '')));
  userValid = computed(() => {
    const u = this.nu();
    return !!u.name.trim() && /\S+@\S+\.\S+/.test(u.email) && this.nuRoles().length > 0 && this.phoneOk();
  });

  // --- inline profile editing (existing accounts) ---
  editUserId = signal<string | null>(null);
  editUser = signal<UpdateUserRequest>({ name: '', email: '', agency: '', phone: '' });
  editUserSaving = signal(false);
  editUserErr = signal('');
  editUserMsg = signal<'' | 'updated'>('');
  editUserPhoneOk = computed(() => /^6\d{8}$/.test((this.editUser().phone ?? '').replace(/\D/g, '')));
  editUserValid = computed(() => {
    const u = this.editUser();
    return !!u.name.trim() && /\S+@\S+\.\S+/.test(u.email) && this.editUserPhoneOk();
  });
  startEditUser(u: User) {
    this.assignProfilesId.set(null);
    this.userActionsId.set(null);
    this.editRolesId.set(null);
    this.editUserId.set(u.id);
    this.editUser.set({ name: u.name, email: u.email, agency: u.agency ?? '', phone: u.phone ?? '' });
    this.editUserErr.set('');
    this.editUserMsg.set('');
  }
  cancelEditUser() { this.editUserId.set(null); this.editUserErr.set(''); this.editUserMsg.set(''); }
  onEditUser(k: keyof UpdateUserRequest, e: Event) {
    let v = (e.target as HTMLInputElement).value;
    if (k === 'phone') v = v.replace(/\D/g, '').slice(0, 9);
    this.editUser.update((u) => ({ ...u, [k]: v }));
    this.editUserErr.set('');
    this.editUserMsg.set('');
  }
  saveUser(u: User) {
    if (!this.editUserValid() || this.editUserSaving()) return;
    this.editUserSaving.set(true);
    this.editUserErr.set('');
    this.editUserMsg.set('');
    const body = this.editUser();
    this.api.updateUser(u.id, {
      name: body.name.trim(),
      email: body.email.trim(),
      agency: body.agency?.trim() || null,
      phone: body.phone?.trim() || null,
    }).subscribe({
      next: (updated) => {
        this.editUserSaving.set(false);
        this.usersList.update((list) => list.map((x) => (x.id === u.id ? updated : x)));
        if (updated.id === this.auth.user()?.id) this.auth.setUser(updated);
        this.editUserMsg.set('updated');
      },
      error: (err) => {
        this.editUserSaving.set(false);
        const code = err?.error?.error;
        this.editUserErr.set(code === 'email_exists' ? 'user_exists'
          : code === 'phone_exists' ? 'user_phone_exists'
          : code === 'invalid_name_or_email' ? 'user_invalid'
          : code === 'agent_phone_required' ? 'user_err_agent_phone' : 'user_err_update');
      },
    });
  }

  // --- secondary actions panel (destructive actions behind ⋮) ---
  userActionsId = signal<string | null>(null);
  toggleUserActions(u: User) {
    this.editUserId.set(null);
    this.editRolesId.set(null);
    this.userActionsId.update((id) => (id === u.id ? null : u.id));
  }

  // --- inline role editing (existing accounts) ---
  editRolesId = signal<string | null>(null);
  editRoles = signal<Role[]>([]);
  editRolesSaving = signal(false);
  editRolesErr = signal('');
  startEditRoles(u: User) {
    this.editUserId.set(null);
    this.userActionsId.set(null);
    this.assignProfilesId.set(null);
    this.editRolesId.set(u.id);
    this.editRoles.set([...this.userRoles(u)]);
    this.editRolesErr.set('');
  }
  toggleEditRole(r: Role) {
    this.editRoles.update((list) => list.includes(r) ? list.filter((x) => x !== r) : [...list, r]);
    this.editRolesErr.set('');
  }
  saveRoles(u: User) {
    const roles = this.editRoles();
    if (!roles.length || this.editRolesSaving()) return;
    this.editRolesSaving.set(true); this.editRolesErr.set('');
    this.api.setUserRoles(u.id, roles).subscribe({
      next: (updated) => {
        this.editRolesSaving.set(false); this.editRolesId.set(null);
        this.usersList.update((list) => list.map((x) => (x.id === u.id ? updated : x)));
        if (updated.id === this.auth.user()?.id) this.auth.setUser(updated);
        this.loadUsers();   // re-sync from the server so the displayed roles can never desync
      },
      error: (err) => {
        this.editRolesSaving.set(false);
        const code = err?.error?.error;
        this.editRolesErr.set(code === 'last_admin' ? 'user_err_last_admin'
          : code === 'agent_phone_required' ? 'user_err_agent_phone' : 'user_err_roles');
      },
    });
  }

  // --- transaction filters ---
  txSearch    = signal('');
  private readonly dbTxSearch = this.debouncedOf(this.txSearch);
  txStatuses  = signal<Set<string>>(new Set());  // multi-sélection de statuts
  txStatusOp  = signal<'OR' | 'AND'>('OR');      // opérateur entre les statuts sélectionnés
  txAgent     = signal('all');
  txFrom      = signal('');
  txTo        = signal('');
  txPay       = signal('all');  // filtre par mode de paiement (all | om | mtn | cash | sara)
  txDelivery  = signal('all'); // filtre par mode de retrait (all | agence | promote | home)

  // KPIs calculés depuis les données brutes (indépendants des filtres actifs)
  txKpiTotal     = computed(() => this.txs().length);
  txKpiPaid      = computed(() => this.txs().filter(t => t.payStatus === 'paid').length);
  txKpiCash      = computed(() => this.txs().filter(t => t.payStatus === 'cash').length);
  txKpiActivated = computed(() => this.txs().filter(t => t.pan && t.pan.trim()).length);

  toggleTxStatus(st: string) {
    this.txStatuses.update(s => { const n = new Set(s); n.has(st) ? n.delete(st) : n.add(st); return n; });
  }

  private matchesSt(t: Subscription, st: string): boolean {
    return t.status === st || t.payStatus === st;
  }

  readonly txStatusChips = [
    { value: 'paid',         label: 'Encaissé',       color: '#10b981', count: computed(() => this.txs().filter(t => this.matchesSt(t, 'paid')).length) },
    { value: 'pending',      label: 'En attente',      color: '#f59e0b', count: computed(() => this.txs().filter(t => this.matchesSt(t, 'pending')).length) },
    { value: 'cash',         label: 'Cash',            color: '#6b7280', count: computed(() => this.txs().filter(t => this.matchesSt(t, 'cash')).length) },
    { value: 'sara_pending', label: 'SARA',            color: '#8b5cf6', count: computed(() => this.txs().filter(t => this.matchesSt(t, 'sara_pending')).length) },
    { value: 'failed',       label: 'Échoué',          color: '#ef4444', count: computed(() => this.txs().filter(t => this.matchesSt(t, 'failed')).length) },
    { value: 'printed',      label: 'Imprimé',         color: '#6366f1', count: computed(() => this.txs().filter(t => this.matchesSt(t, 'printed')).length) },
  ];

  // --- expandable transaction detail (full client file) ---
  expandedRef = signal<string | null>(null);
  filteredTxs = computed(() => {
    const q = this.dbTxSearch().trim().toLowerCase();
    const digits = this.dbTxSearch().replace(/\D/g, '');
    const statuses = this.txStatuses(), op = this.txStatusOp();
    const ag = this.txAgent(), from = this.txFrom(), to = this.txTo(), pay = this.txPay(), delivery = this.txDelivery();
    return this.txs().slice().reverse().filter((t) => {
      if (statuses.size > 0) {
        const tests = [...statuses].map(st => this.matchesSt(t, st));
        const match = op === 'AND' ? tests.every(Boolean) : tests.some(Boolean);
        if (!match) return false;
      }
      if (ag === 'self' ? t.channel !== 'self' : ag !== 'all' && t.agentId !== ag) return false;
      if (pay !== 'all' && t.pay !== pay) return false;
      if (delivery !== 'all' && t.delivery !== delivery) return false;
      if (from && t.createdAt.slice(0, 10) < from) return false;
      if (to && t.createdAt.slice(0, 10) > to) return false;
      if (q) {
        const hay = `${t.ref} ${t.fullName}`.toLowerCase();
        const phone = (t.phone || '').replace(/\D/g, '');
        if (!hay.includes(q) && !(digits && phone.includes(digits))) return false;
      }
      return true;
    });
  });

  // --- transactions table pagination ---
  txPage = signal(0);
  readonly txPageSize = 12;
  txPageCount = computed(() => Math.max(1, Math.ceil(this.filteredTxs().length / this.txPageSize)));
  pagedTxs = computed(() => {
    const all = this.filteredTxs();
    const p = Math.min(this.txPage(), this.txPageCount() - 1);
    return all.slice(p * this.txPageSize, p * this.txPageSize + this.txPageSize);
  });
  // Any filter change (or fresh data) → back to the first page.
  private readonly _txPageReset = effect(() => { this.filteredTxs(); this.txPage.set(0); });
  /** Number of failed transactions (for the quick "Échouées" filter chip). */
  failedCount = computed(() => this.txs().filter((t) => t.payStatus === 'failed' || t.status === 'failed').length);
  /** One-click toggle of the failed-only view. */
  toggleFailedFilter() { this.toggleTxStatus('failed'); }
  /** Overview KPI → open the transactions table filtered on failed payments. */
  showFailed() { this.txStatuses.set(new Set(['failed'])); this.section.set('transactions'); }
  /** Par réseau → filtre sur le mode de paiement et bascule vers la liste. */
  showPayFilter(pay: string) { this.txPay.set(pay); this.txStatuses.set(new Set()); this.section.set('transactions'); }
  txPrev() { this.txPage.update((p) => Math.max(0, p - 1)); }
  txNext() { this.txPage.update((p) => Math.min(this.txPageCount() - 1, p + 1)); }

  // Row helpers for the table cells.
  pm = (t: Subscription) => payById(t.pay);
  rowStatus = (t: Subscription) => recordStatus(t);
  txDate = (iso: string) => this.fmtDateTime(iso);

  // --- card recharges (top-ups) — separate payments view, with filters ---
  recharges = signal<Recharge[]>([]);
  rLoading = signal(true);
  rSearch = signal('');
  private readonly dbRSearch = this.debouncedOf(this.rSearch);
  rStatus = signal('all');   // all | paid | pending | cash | sara_pending | failed
  rPayFilter = signal('all'); // all | om | mtn | sara | cash
  rFrom = signal('');
  rTo = signal('');
  rPage = signal(0);
  readonly rPageSize = 12;
  rpm = (r: Recharge) => payById(r.pay);
  fmtPan = (v: string) => formatPan(v);

  private loadRecharges() {
    this.rLoading.set(true);
    this.api.recharges().subscribe({ next: (r) => { this.recharges.set(r); this.rLoading.set(false); }, error: () => this.rLoading.set(false) });
  }

  filteredRecharges = computed(() => {
    const q = this.dbRSearch().trim().toLowerCase();
    const digits = this.dbRSearch().replace(/\D/g, '');
    const st = this.rStatus(), pay = this.rPayFilter(), from = this.rFrom(), to = this.rTo();
    return this.recharges().slice().reverse().filter((r) => {
      if (st !== 'all' && r.status !== st && r.payStatus !== st) return false;
      if (pay !== 'all' && r.pay !== pay) return false;
      if (from && r.createdAt.slice(0, 10) < from) return false;
      if (to && r.createdAt.slice(0, 10) > to) return false;
      if (q) {
        const hay = `${r.ref} ${r.fullName}`.toLowerCase();
        const pan = (r.pan || '').replace(/\D/g, '');
        if (!hay.includes(q) && !(digits && pan.includes(digits))) return false;
      }
      return true;
    });
  });
  rPageCount = computed(() => Math.max(1, Math.ceil(this.filteredRecharges().length / this.rPageSize)));
  pagedRecharges = computed(() => {
    const all = this.filteredRecharges();
    const p = Math.min(this.rPage(), this.rPageCount() - 1);
    return all.slice(p * this.rPageSize, p * this.rPageSize + this.rPageSize);
  });
  private readonly _rPageReset = effect(() => { this.filteredRecharges(); this.rPage.set(0); });
  rPrev() { this.rPage.update((p) => Math.max(0, p - 1)); }
  rNext() { this.rPage.update((p) => Math.min(this.rPageCount() - 1, p + 1)); }
  clearRFilters() { this.rSearch.set(''); this.rStatus.set('all'); this.rPayFilter.set('all'); this.rFrom.set(''); this.rTo.set(''); }

  /** Aggregate KPIs computed client-side from the already-loaded recharges list. */
  rchKpi = computed(() => {
    const all = this.recharges();
    if (!all.length) return null;
    const byPay = (p: string) => ({ total: all.filter(r => r.pay === p).length, paid: all.filter(r => r.pay === p && r.payStatus === 'paid').length });
    const paid   = all.filter(r => r.payStatus === 'paid').length;
    const pending = all.filter(r => r.payStatus === 'pending').length;
    const failed  = all.filter(r => r.payStatus === 'failed').length;
    const amount  = all.filter(r => r.payStatus === 'paid').reduce((s, r) => s + r.amount, 0);
    const cutoff  = new Date(); cutoff.setDate(cutoff.getDate() - 13);
    const cutStr  = cutoff.toISOString().slice(0, 10);
    const tMap    = new Map<string, { paid: number; failed: number; pending: number }>();
    for (const r of all) {
      const d = r.createdAt.slice(0, 10);
      if (d < cutStr) continue;
      const e = tMap.get(d) ?? { paid: 0, failed: 0, pending: 0 };
      if (r.payStatus === 'paid') e.paid++; else if (r.payStatus === 'failed') e.failed++; else e.pending++;
      tMap.set(d, e);
    }
    const trends = [...tMap.entries()].sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({ date, ...v, total: v.paid + v.failed + v.pending }));
    return { total: all.length, paid, pending, failed, amount, om: byPay('om'), mtn: byPay('mtn'), sara: byPay('sara'), cash: byPay('cash'), trends };
  });
  rchTrendBarPx(n: number) {
    const max = Math.max(1, ...( this.rchKpi()?.trends.map(t => t.paid + t.failed + t.pending) ?? []));
    return Math.max(2, Math.round((n / max) * 88));
  }
  exportRecharges() {
    const esc = (v: string) => `"${(v ?? '').replace(/"/g, '""')}"`;
    const header = ['Reference', 'Nom complet', 'PAN', 'Date', 'Paiement', 'Statut', 'Montant'];
    const rows = this.filteredRecharges().map((r) => [
      r.ref, r.fullName, formatPan(r.pan), this.fmtDateTime(r.createdAt),
      r.pay === 'cash' ? 'Espèces' : payById(r.pay).name, r.status, String(r.amount),
    ].map((v) => esc(String(v))).join(','));
    this.downloadCsv('recharges.csv', '﻿' + [header.join(','), ...rows].join('\r\n'));
  }

  // --- collectes (ventes de produits bancaires) — management view ---
  collectes = signal<Collecte[]>([]);
  colLoading = signal(true);
  colBusy = signal(false);
  colSearch = signal('');
  private readonly dbColSearch = this.debouncedOf(this.colSearch);
  colProduct = signal('all');     // all | <product code>
  colCommercial = signal('all');  // all | <collectedById>
  colFrom = signal('');
  colTo = signal('');
  colPage = signal(0);
  readonly colPageSize = 12;
  readonly productCodes = COLLECTE_PRODUCTS;

  private loadCollectes() {
    this.colLoading.set(true);
    this.api.collectes().subscribe({ next: (c) => { this.collectes.set(c); this.colLoading.set(false); }, error: () => this.colLoading.set(false) });
  }

  /** Distinct commercials present in the data, for the filter dropdown. */
  commercialOptions = computed(() => {
    const seen = new Map<string, string>();
    for (const c of this.collectes()) {
      const id = c.collectedById ?? '—';
      if (!seen.has(id)) seen.set(id, c.collectedByName ?? '—');
    }
    return [...seen.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  });
  /** Counts per product (all four, in fixed order) for the stat cards. */
  statByProduct = computed(() => {
    const counts = new Map<string, number>(COLLECTE_PRODUCTS.map((p) => [p, 0]));
    for (const c of this.collectes()) counts.set(c.product, (counts.get(c.product) ?? 0) + 1);
    return COLLECTE_PRODUCTS.map((key) => ({ key, count: counts.get(key) ?? 0 }));
  });
  /** Top commercials by number of collectes (max 8). */
  topCommercials = computed(() => {
    const m = new Map<string, { label: string; count: number }>();
    for (const c of this.collectes()) {
      const id = c.collectedById ?? '—';
      const e = m.get(id) ?? { label: c.collectedByName ?? '—', count: 0 };
      e.count++; m.set(id, e);
    }
    return [...m.entries()].map(([key, v]) => ({ key, label: v.label, count: v.count }))
      .sort((a, b) => b.count - a.count).slice(0, 8);
  });

  filteredCollectes = computed(() => {
    const q = this.dbColSearch().trim().toLowerCase();
    const digits = this.dbColSearch().replace(/\D/g, '');
    const prod = this.colProduct(), com = this.colCommercial(), from = this.colFrom(), to = this.colTo();
    return this.collectes().filter((c) => {
      if (prod !== 'all' && c.product !== prod) return false;
      if (com !== 'all' && (c.collectedById ?? '—') !== com) return false;
      if (from && c.createdAt.slice(0, 10) < from) return false;
      if (to && c.createdAt.slice(0, 10) > to) return false;
      if (q) {
        const hay = `${c.ref} ${c.collectedByName ?? ''} ${c.clientNom ?? ''} ${c.accountNumber ?? ''} ${c.cardNumber ?? ''}`.toLowerCase();
        const phone = (c.clientPhone ?? '').replace(/\D/g, '');
        if (!hay.includes(q) && !(digits && phone.includes(digits))) return false;
      }
      return true;
    });
  });
  colPageCount = computed(() => Math.max(1, Math.ceil(this.filteredCollectes().length / this.colPageSize)));
  pagedCollectes = computed(() => {
    const all = this.filteredCollectes();
    const p = Math.min(this.colPage(), this.colPageCount() - 1);
    return all.slice(p * this.colPageSize, p * this.colPageSize + this.colPageSize);
  });
  private readonly _colPageReset = effect(() => { this.filteredCollectes(); this.colPage.set(0); });
  colPrev() { this.colPage.update((p) => Math.max(0, p - 1)); }
  colNext() { this.colPage.update((p) => Math.min(this.colPageCount() - 1, p + 1)); }
  clearColFilters() { this.colSearch.set(''); this.colProduct.set('all'); this.colCommercial.set('all'); this.colFrom.set(''); this.colTo.set(''); }

  /** One-line product-specific detail (account / card no + type). */
  colDetails(c: Collecte): string {
    if (c.product === 'compte_ouvert') return c.accountNumber || '—';
    if (c.product === 'carte_bancaire') {
      const t = c.cardType ? this.i18n.t('ct_' + c.cardType) : '';
      return [c.cardNumber, t].filter(Boolean).join(' · ') || '—';
    }
    return '—';
  }

  deleteCollecte(c: Collecte) {
    if (this.colBusy() || !confirm(this.i18n.t('col_delete_confirm'))) return;
    this.colBusy.set(true);
    this.api.deleteCollecte(c.ref).subscribe({
      next: () => { this.colBusy.set(false); this.collectes.update((list) => list.filter((x) => x.ref !== c.ref)); },
      error: () => { this.colBusy.set(false); },
    });
  }

  exportCollectes() {
    const esc = (v: string) => `"${(v ?? '').replace(/"/g, '""')}"`;
    const header = ['Reference', 'Commercial', 'Produit', 'Nom client', 'Telephone', 'N° compte', 'N° carte', 'Type carte', 'Date'];
    const rows = this.filteredCollectes().map((c) => [
      c.ref, c.collectedByName ?? '', this.i18n.t('prod_' + c.product), c.clientNom ?? '', c.clientPhone ?? '',
      c.accountNumber ?? '', c.cardNumber ?? '', c.cardType ? this.i18n.t('ct_' + c.cardType) : '', this.fmtDateTime(c.createdAt),
    ].map((v) => esc(String(v))).join(','));
    this.downloadCsv('collectes.csv', '﻿' + [header.join(','), ...rows].join('\r\n'));
  }

  exportCollecteStatsExcel() {
    const all = this.collectes();
    if (!all.length) return;
    const today = new Date().toISOString().slice(0, 10);
    const total = all.length;

    // Sheet 1: Résumé par produit
    const resumeRows: (string | number)[][] = [
      ['Statistiques de la Collecte — Afriland Carte Promote'],
      [`Exporté le : ${today}`],
      [],
      ['Produit', 'Nombre', 'Part (%)'],
      ...this.statByProduct().map(b => [
        this.i18n.t('prod_' + b.key), b.count,
        total > 0 ? Math.round(b.count / total * 100) : 0,
      ]),
      [],
      ['TOTAL', total, 100],
    ];
    const ws1 = XLSX.utils.aoa_to_sheet(resumeRows);
    ws1['!cols'] = [{ wch: 28 }, { wch: 10 }, { wch: 10 }];
    ws1['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 2 } }];

    // Sheet 2: Classement des commerciaux (tous)
    const comMap = new Map<string, { label: string; count: number }>();
    for (const c of all) {
      const id = c.collectedById ?? '—';
      const e = comMap.get(id) ?? { label: c.collectedByName ?? '—', count: 0 };
      e.count++; comMap.set(id, e);
    }
    const comRanked = [...comMap.values()].sort((a, b) => b.count - a.count);
    const comRows: (string | number)[][] = [
      ['Rang', 'Commercial', 'Nombre'],
      ...comRanked.map((b, i) => [i + 1, b.label, b.count]),
    ];
    const ws2 = XLSX.utils.aoa_to_sheet(comRows);
    ws2['!cols'] = [{ wch: 6 }, { wch: 32 }, { wch: 10 }];

    // Sheet 3: Détail des collectes
    const detailRows: (string | number)[][] = [
      ['Référence', 'Commercial', 'Produit', 'Nom client', 'Téléphone', 'N° compte', 'N° carte', 'Type carte', 'Date'],
      ...all.map(c => [
        c.ref,
        c.collectedByName ?? '',
        this.i18n.t('prod_' + c.product),
        c.clientNom ?? '',
        c.clientPhone ?? '',
        c.accountNumber ?? '',
        c.cardNumber ?? '',
        c.cardType ? this.i18n.t('ct_' + c.cardType) : '',
        this.fmtDateTime(c.createdAt),
      ]),
    ];
    const ws3 = XLSX.utils.aoa_to_sheet(detailRows);
    ws3['!cols'] = [{ wch: 12 }, { wch: 22 }, { wch: 18 }, { wch: 20 }, { wch: 14 }, { wch: 16 }, { wch: 16 }, { wch: 14 }, { wch: 18 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws1, 'Résumé');
    XLSX.utils.book_append_sheet(wb, ws2, 'Commerciaux');
    XLSX.utils.book_append_sheet(wb, ws3, 'Détail');
    XLSX.writeFile(wb, `collecte-stats_${today}.xlsx`);
  }

  // --- login audit (journal des connexions) ---
  loginAudits = signal<LoginAudit[]>([]);
  auditLoading = signal(true);
  auditSearch = signal('');
  private readonly dbAuditSearch = this.debouncedOf(this.auditSearch);
  auditFilter = signal<'all' | 'ok' | 'ko'>('all');
  auditPage = signal(0);
  readonly auditPageSize = 20;

  private loadAudit() {
    this.auditLoading.set(true);
    this.api.loginAudit().subscribe({ next: (a) => { this.loginAudits.set(a); this.auditLoading.set(false); }, error: () => this.auditLoading.set(false) });
  }
  filteredAudit = computed(() => {
    const q = this.dbAuditSearch().trim().toLowerCase();
    const f = this.auditFilter();
    return this.loginAudits().filter((a) => {
      if (f === 'ok' && !a.success) return false;
      if (f === 'ko' && a.success) return false;
      if (q) {
        const hay = `${a.email} ${a.name ?? ''} ${a.ip ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  });
  auditPageCount = computed(() => Math.max(1, Math.ceil(this.filteredAudit().length / this.auditPageSize)));
  pagedAudit = computed(() => {
    const all = this.filteredAudit();
    const p = Math.min(this.auditPage(), this.auditPageCount() - 1);
    return all.slice(p * this.auditPageSize, p * this.auditPageSize + this.auditPageSize);
  });
  private readonly _auditPageReset = effect(() => { this.filteredAudit(); this.auditPage.set(0); });
  auditPrev() { this.auditPage.update((p) => Math.max(0, p - 1)); }
  auditNext() { this.auditPage.update((p) => Math.min(this.auditPageCount() - 1, p + 1)); }
  auditReason(reason: string | null) {
    const key = 'audit_reason_' + (reason || 'ok');
    const t = this.i18n.t(key);
    return t === key ? (reason || '') : t;
  }

  // --- action audit ---
  actionAudits = signal<ActionAudit[]>([]);
  actLoading = signal(false);
  actLoaded = false;
  actSearch = signal('');
  private readonly dbActSearch = this.debouncedOf(this.actSearch);
  actPage = signal(0);
  readonly actPageSize = 20;

  loadActionAudit() {
    if (this.actLoaded) return;
    this.actLoaded = true;
    this.fetchActions(this.actSearch());
  }

  /** Fetch the action log from the server. An empty term returns the most-recent page; a non-empty
   *  term searches the WHOLE history so older references (e.g. an old print) are findable. */
  private fetchActions(q: string) {
    this.actLoading.set(true);
    this.api.actionAudit(q).subscribe({
      next: (a) => { this.actionAudits.set(a); this.actLoading.set(false); },
      error: () => this.actLoading.set(false),
    });
  }

  /** Re-query the server whenever the (debounced) search term changes, once the tab is open. */
  private readonly _actSearchFetch = effect(() => {
    const q = this.dbActSearch();
    if (!this.actLoaded) return;   // don't fetch before the Actions tab is first opened
    this.fetchActions(q);
  });

  filteredActions = computed(() => {
    // The server already filters by the search term; this just narrows the loaded page client-side
    // (instant feedback while the debounced server query is in flight).
    const q = this.dbActSearch().trim().toLowerCase();
    if (!q) return this.actionAudits();
    return this.actionAudits().filter((a) => {
      const hay = `${a.actorName ?? ''} ${a.actorRoles ?? ''} ${a.action} ${a.entityType ?? ''} ${a.entityRef ?? ''} ${a.details ?? ''}`.toLowerCase();
      return hay.includes(q);
    });
  });
  actPageCount = computed(() => Math.max(1, Math.ceil(this.filteredActions().length / this.actPageSize)));
  pagedActions = computed(() => {
    const all = this.filteredActions();
    const p = Math.min(this.actPage(), this.actPageCount() - 1);
    return all.slice(p * this.actPageSize, p * this.actPageSize + this.actPageSize);
  });
  private readonly _actPageReset = effect(() => { this.filteredActions(); this.actPage.set(0); });
  actPrev() { this.actPage.update((p) => Math.max(0, p - 1)); }
  actNext() { this.actPage.update((p) => Math.min(this.actPageCount() - 1, p + 1)); }

  actionLabel(action: string): string {
    const key = 'act_' + action;
    const t = this.i18n.t(key);
    return t === key ? action : t;
  }

  /** Success rate (%) guarded against division by zero. */
  rate(part: number, total: number) { return total > 0 ? Math.round((part / total) * 100) : 0; }

  /** MoMo technical failures (network + unknown) for dashboard KPIs. */
  technicalFailed = computed(() => this.payStats()?.networkOrUnknownFailed ?? 0);

  /** Failure-bar percentage: count vs total MoMo attempts (taux relatif au trafic total). */
  failRate(b: { category: string; count: number }, p: PaymentStats) {
    return this.rate(b.count, p.momoTotal);
  }

  private trendMax(buckets: PaymentTrendBucket[]) {
    return buckets.reduce((m, b) => Math.max(m, b.paid, b.failed, b.pending, b.total), 1);
  }
  trendBarPx(n: number, buckets: PaymentTrendBucket[]) {
    const max = this.trendMax(buckets);
    return Math.max(2, Math.round((n / max) * 88));
  }
  trendDayLabel(iso: string) {
    const p = iso.split('-');
    return p.length === 3 ? `${p[2]}/${p[1]}` : iso;
  }
  trendTooltip(b: PaymentTrendBucket) {
    return `${this.trendDayLabel(b.date)} — ${this.i18n.t('st_paid')}: ${b.paid}, ${this.i18n.t('st_failed')}: ${b.failed}, ${this.i18n.t('st_pending')}: ${b.pending}`;
  }

  /** Map export category: NETWORK and UNKNOWN roll up to the dashboard bucket. */
  exportFailCategory(cat: string | null | undefined) {
    const c = cat || 'UNKNOWN';
    if (c === 'NETWORK' || c === 'UNKNOWN') return this.failLabel('NETWORK_OR_UNKNOWN');
    return this.failLabel(c);
  }

  /** Localised label for a failure category code (falls back to the raw code). */
  failLabel(cat: string) {
    const key = 'fail_cat_' + cat;
    const t = this.i18n.t(key);
    return t === key ? cat : t;
  }
  /** Export the failed Mobile Money transactions with their classified cause + raw message. */
  exportFailures() {
    const esc = (v: string) => `"${(v ?? '').replace(/"/g, '""')}"`;
    const header = ['Reference', 'Nom', 'Telephone', 'Operateur', 'Categorie', 'Motif brut', 'Date'];
    const failed = this.txs().filter((t) => (t.pay === 'om' || t.pay === 'mtn') && (t.payStatus === 'failed' || t.status === 'failed'));
    const rows = failed.map((t) => [
      t.ref, t.fullName, t.phone ?? '', t.pay === 'om' ? 'Orange Money' : 'MTN MoMo',
      this.exportFailCategory(t.failureCategory), t.paymentMessage ?? '', this.fmtDateTime(t.createdAt),
    ].map((v) => esc(String(v))).join(','));
    this.downloadCsv('echecs-paiement.csv', '﻿' + [header.join(','), ...rows].join('\r\n'));
  }

  ngOnInit() {
    // Supervisor: restricted to collecteur user management — load only users, no admin-only data/poll.
    if (this.isSupervisor()) {
      this.section.set('users');
      this.nuRoles.set(['COLLECTEUR']);
      this.loadUsers();
      return;
    }
    this.api.adminStats().subscribe({ next: (s) => { this.stats.set(s); this.statsLoading.set(false); }, error: () => this.statsLoading.set(false) });
    this.api.paymentStats().subscribe({ next: (p) => this.payStats.set(p), error: () => {} });
    this.api.allSubscriptions().subscribe({ next: (t) => { this.txs.set(t); this.txLoading.set(false); }, error: () => this.txLoading.set(false) });
    this.api.getConfig().subscribe({ next: (c) => { this.cfg.set({ ...c }); this.original.set({ ...c }); this.cfgLoading.set(false); }, error: () => this.cfgLoading.set(false) });
    this.loadUsers();
    // Mark eagerly-loaded sections so the _sectionEffect doesn't trigger a second load on first visit.
    this.loadedSections.add('overview');
    this.loadedSections.add('transactions');
    this.loadedSections.add('users');
    this.loadedSections.add('config');
    // agencies, recharges, collectes, audit are lazy-loaded by _sectionEffect on first visit
    // Silent background refresh of the KPIs + transactions table (no spinner, keeps filters intact).
    this.stopPoll = livePoll(() => this.refreshLive());
  }
  ngOnDestroy() { this.stopPoll?.(); }
  private refreshLive() {
    // Keep the active period filter intact across silent polls (else the KPIs snap back to cumulative).
    const from = this.overviewFrom() || undefined, to = this.overviewTo() || undefined;
    this.api.adminStats(from, to).subscribe({ next: (s) => this.stats.set(s), error: () => {} });
    this.api.paymentStats(from, to).subscribe({ next: (p) => this.payStats.set(p), error: () => {} });
  }

  private loadUsers() {
    this.usersLoading.set(true);
    this.api.users().subscribe({ next: (u) => { this.usersList.set(u); this.usersLoading.set(false); }, error: () => this.usersLoading.set(false) });
  }
  get agentUsers() { return this.usersList().filter((u) => this.userRoles(u).includes('AGENT')); }

  onNu(k: keyof CreateUserRequest, e: Event) {
    const v = (e.target as HTMLInputElement | HTMLSelectElement).value;
    this.nu.update((u) => ({ ...u, [k]: v }));
    this.userMsg.set('');
  }
  createUser() {
    if (!this.userValid() || this.userBusy()) { if (!this.userValid()) this.userMsg.set('invalid'); return; }
    this.userBusy.set(true);
    const u = this.nu();
    const roles = this.nuRoles();
    this.api.createUser({ ...u, name: u.name.trim(), email: u.email.trim(), role: roles[0], roles }).subscribe({
      next: (res) => {
        this.userBusy.set(false);
        this.userMsg.set(res.reactivated ? 'recreated' : 'created');
        this.createdPw.set(res.tempPassword); this.pwCopied.set(false);
        this.createdPin.set(res.pin || ''); this.pinCopied.set(false);
        const fallbackRole: Role = this.isSupervisor() ? 'COLLECTEUR' : 'AGENT';
        this.nu.set({ name: '', email: '', role: fallbackRole, agency: '', phone: '' });
        this.nuRoles.set([fallbackRole]);
        this.loadUsers();
      },
      error: (err) => {
        this.userBusy.set(false);
        // 409 distinguishes a duplicate email from a duplicate phone (both are now unique keys).
        this.userMsg.set(err?.status === 409
          ? (err?.error?.error === 'phone_exists' ? 'phone_exists' : 'exists')
          : 'invalid');
      },
    });
  }
  copyPw() {
    navigator.clipboard?.writeText(this.createdPw()).then(() => this.pwCopied.set(true));
  }
  copyPin() {
    navigator.clipboard?.writeText(this.createdPin()).then(() => this.pinCopied.set(true));
  }
  roleLabel(role: Role) {
    return this.i18n.t(role === 'ADMIN' ? 'role_admin' : role === 'PRINT_AGENT' ? 'role_print'
      : role === 'CASHIER' ? 'role_cashier' : role === 'COLLECTEUR' ? 'role_collecteur'
      : role === 'SUPERVISEUR' ? 'role_superviseur' : role === 'MANAGER' ? 'role_manager'
      : role === 'CHEF_EQUIPE' ? 'role_chef_equipe' : 'role_agent');
  }

  // --- bulk user import ---
  importText = signal('');
  importUpdate = signal(false);     // false = skip duplicates, true = update them
  importBusy = signal(false);
  importErr = signal(false);
  importResult = signal<ImportUsersResult | null>(null);

  /** Parsed rows from the pasted text / loaded CSV. */
  parsedRows = computed<ImportUserRow[]>(() => this.parseImport(this.importText()));

  /** Per-row preview status (client-side, for guidance — the backend is authoritative). */
  preview = computed(() => {
    const existing = new Set(this.usersList().map((u) => u.email.toLowerCase()));
    const seen = new Set<string>();
    return this.parsedRows().map((r) => {
      const name = (r.name || '').trim();
      const email = (r.email || '').trim();
      const role = (r.role || '').trim().toUpperCase();
      const roles = role.split('|').map((x) => x.trim()).filter(Boolean);
      const phone9 = (r.phone || '').replace(/\D/g, '').slice(-9);
      const known = ['ADMIN', 'AGENT', 'PRINT_AGENT', 'CASHIER', 'COLLECTEUR', 'SUPERVISEUR'];
      let status: 'new' | 'duplicate' | 'invalid' = 'new';
      let reason = '';
      if (!name || !/\S+@\S+\.\S+/.test(email)) { status = 'invalid'; reason = 'name_email'; }
      else if (!roles.length || !roles.every((x) => known.includes(x))) { status = 'invalid'; reason = 'role'; }
      else if (roles.includes('AGENT') && !/^6\d{8}$/.test(phone9)) { status = 'invalid'; reason = 'phone'; }
      else {
        const key = email.toLowerCase();
        if (existing.has(key) || seen.has(key)) status = 'duplicate';
        seen.add(key);
      }
      return { name, email, role, status, reason };
    });
  });
  importCounts = computed(() => {
    const p = this.preview();
    return {
      created: p.filter((r) => r.status === 'new').length,
      dup: p.filter((r) => r.status === 'duplicate').length,
      invalid: p.filter((r) => r.status === 'invalid').length,
    };
  });
  /** How many rows the import will actually act on (new + duplicates only if "update" is on). */
  importActionable = computed(() => this.importCounts().created + (this.importUpdate() ? this.importCounts().dup : 0));
  /** Created accounts with their generated temp password, to hand out / export. */
  importCreds = computed(() => this.importResult()?.rows.filter((r) => r.status === 'created' && r.tempPassword) ?? []);

  /** Parse pasted/CSV text. Accepts a header line (mapped by column name) or positional
   *  columns: name, email, role, phone, agency. Delimiter detected: tab, ';' or ','. */
  private parseImport(text: string): ImportUserRow[] {
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length);
    if (!lines.length) return [];
    const delim = lines[0].includes('\t') ? '\t' : lines[0].includes(';') ? ';' : ',';
    const cells = (l: string) => l.split(delim).map((c) => c.trim().replace(/^"(.*)"$/, '$1'));
    let rows = lines.map(cells);
    let idx = { name: 0, email: 1, role: 2, phone: 3, agency: 4 };
    const head = rows[0].map((c) => c.toLowerCase());
    const isHeader = head.some((c) => /e-?mail|courriel/.test(c)) || head.some((c) => /^(nom|name)$/.test(c));
    if (isHeader) {
      const at = (...re: RegExp[]) => head.findIndex((c) => re.some((r) => r.test(c)));
      idx = {
        name: at(/^(nom|name|nom complet|full ?name)$/),
        email: at(/e-?mail|courriel/),
        role: at(/^(role|rôle|profil)$/),
        phone: at(/^(tel|tél|telephone|téléphone|phone|numero|numéro)/),
        agency: at(/^(agence|agency)$/),
      };
      rows = rows.slice(1);
    }
    const g = (row: string[], i: number) => (i >= 0 && i < row.length ? row[i] : '');
    return rows.map((row) => ({
      name: g(row, idx.name), email: g(row, idx.email), role: this.normRoles(g(row, idx.role)),
      phone: g(row, idx.phone), agency: g(row, idx.agency),
    }));
  }
  /** Normalise a role cell that may carry several roles (separators | / +) → canonical "A|B". */
  private normRoles(cell: string): string {
    const parts = (cell || '').split(/[|/+]/).map((p) => this.normRole(p)).filter((p) => p);
    return [...new Set(parts)].join('|');
  }
  /** Map free-text / localized role labels to the enum code. */
  private normRole(r: string): string {
    const s = (r || '').trim().toLowerCase();
    if (/admin/.test(s)) return 'ADMIN';
    if (/print|impr/.test(s)) return 'PRINT_AGENT';
    if (/caiss|cashier|esp[èe]ce/.test(s)) return 'CASHIER';
    if (/supervis/.test(s)) return 'SUPERVISEUR';
    if (/collect/.test(s)) return 'COLLECTEUR';
    if (/agent|commerc|client/.test(s)) return 'AGENT';
    return (r || '').trim().toUpperCase();
  }
  impReason(code: string) {
    return code === 'name_email' ? this.i18n.t('imp_r_name_email')
      : code === 'role' ? this.i18n.t('imp_r_role')
      : code === 'phone' ? this.i18n.t('imp_r_phone') : '';
  }

  onImportText(e: Event) {
    this.importText.set((e.target as HTMLTextAreaElement).value);
    this.importResult.set(null); this.importErr.set(false);
  }
  onImportFile(e: Event) {
    const input = e.target as HTMLInputElement;
    const f = input.files?.[0];
    input.value = '';                 // allow re-selecting the same file
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => { this.importText.set(String(reader.result ?? '')); this.importResult.set(null); this.importErr.set(false); };
    reader.readAsText(f);
  }
  clearImport() { this.importText.set(''); this.importResult.set(null); this.importErr.set(false); }
  runImport() {
    const rows = this.parsedRows();
    if (!rows.length || this.importBusy()) return;
    this.importBusy.set(true); this.importErr.set(false);
    this.api.importUsers(rows, this.importUpdate()).subscribe({
      next: (res) => { this.importBusy.set(false); this.importResult.set(res); this.loadUsers(); },
      error: () => { this.importBusy.set(false); this.importErr.set(true); },
    });
  }
  downloadTemplate() {
    this.downloadCsv('modele-utilisateurs.csv',
      '﻿nom,email,role,telephone,agence\r\n'
      + 'Yvan Ngameni,yvan.ngameni@afrilandfirstbank.com,AGENT,690112233,Akwa\r\n'
      + 'Paul Mbarga,paul.mbarga@afrilandfirstbank.com,PRINT_AGENT,,\r\n'
      + 'Awa Fall,awa.fall@afrilandfirstbank.com,AGENT|COLLECTEUR,699001122,Bonanjo\r\n'
      + 'Marie Eyenga,marie.eyenga@afrilandfirstbank.com,SUPERVISEUR|COLLECTEUR,,\r\n'
      + 'Jean Tabi,jean.tabi@afrilandfirstbank.com,CASHIER,,\r\n');
  }
  downloadCredentials() {
    const esc = (v: string) => `"${(v ?? '').replace(/"/g, '""')}"`;
    const lines = [['Nom', 'Email', 'Role', 'Mot de passe temporaire'].join(',')].concat(
      this.importCreds().map((r) => [r.name, r.email, r.role, r.tempPassword ?? ''].map((v) => esc(String(v))).join(',')),
    );
    this.downloadCsv('identifiants-importes.csv', '﻿' + lines.join('\r\n'));
  }
  private downloadCsv(name: string, content: string) {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; a.click();
    URL.revokeObjectURL(url);
  }

  // --- pickup agencies (lieux de retrait) ---
  agencies = signal<Agency[]>([]);
  agLoading = signal(true);
  agPickupStats = signal<AgencyPickupStats | null>(null);
  agStatsLoading = signal(false);
  agStatsPeriod = signal<'all' | 'week' | 'month' | 'custom'>('all');
  agStatsFrom = signal('');
  agStatsTo = signal('');
  agSelectedId = signal<string | null>(null);
  agSelectedPage = signal(0);
  readonly agSelectedPageSize = 8;
  agSearch = signal('');
  private readonly dbAgSearch = this.debouncedOf(this.agSearch);

  agSelectedSubs = computed(() => {
    const id = this.agSelectedId();
    if (!id) return [];
    return this.txs()
      .filter(t => t.pickupAgencyId === id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  });
  agSelectedPageCount = computed(() => Math.max(1, Math.ceil(this.agSelectedSubs().length / this.agSelectedPageSize)));
  agSelectedPaged = computed(() => {
    const all = this.agSelectedSubs();
    const p = Math.min(this.agSelectedPage(), this.agSelectedPageCount() - 1);
    return all.slice(p * this.agSelectedPageSize, p * this.agSelectedPageSize + this.agSelectedPageSize);
  });
  private readonly _agPageReset = effect(() => { this.agSelectedSubs(); this.agSelectedPage.set(0); });

  private readonly _agStatsEffect = effect(() => {
    if (this.section() !== 'agencies') return;
    const period = this.agStatsPeriod();
    let from = '', to = '';
    if (period === 'week') {
      const today = new Date();
      const d = new Date(today); d.setDate(d.getDate() - 6);
      from = d.toISOString().slice(0, 10);
      to = today.toISOString().slice(0, 10);
    } else if (period === 'month') {
      const today = new Date();
      from = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
      to = today.toISOString().slice(0, 10);
    } else if (period === 'custom') {
      from = this.agStatsFrom(); to = this.agStatsTo();
      if (!from && !to) return;
    }
    this.loadAgencyStats(from || undefined, to || undefined);
  });
  agText = signal('');
  agUpdate = signal(false);
  agBusy = signal(false);
  agErr = signal(false);
  agResult = signal<ImportAgenciesResult | null>(null);

  filteredAgencies = computed(() => {
    const q = this.dbAgSearch().trim().toLowerCase();
    if (!q) return this.agencies();
    return this.agencies().filter((a) => {
      const hay = `${a.name} ${a.city ?? ''}`.toLowerCase();
      return hay.includes(q);
    });
  });

  agPickupTotal = computed(() => {
    const s = this.agPickupStats();
    return s ? s.totalAgence + s.totalPromote + s.totalHome : 0;
  });

  private loadAgencies() {
    this.agLoading.set(true);
    this.api.getAgencies().subscribe({ next: (a) => { this.agencies.set(a); this.agLoading.set(false); }, error: () => this.agLoading.set(false) });
    // stats are driven by _agStatsEffect so we don't need to call loadAgencyStats() here
  }

  private loadAgencyStats(from?: string, to?: string) {
    this.agStatsLoading.set(true);
    this.agPickupStats.set(null);
    this.api.agencyPickupStats(from, to).subscribe({
      next: (s) => { this.agPickupStats.set(s); this.agStatsLoading.set(false); },
      error: () => this.agStatsLoading.set(false),
    });
  }

  refreshAgencies() {
    this.loadAgencies();
    const p = this.agStatsPeriod();
    let from = '', to = '';
    const today = new Date();
    if (p === 'week') {
      const d = new Date(today); d.setDate(d.getDate() - 6);
      from = d.toISOString().slice(0, 10); to = today.toISOString().slice(0, 10);
    } else if (p === 'month') {
      from = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
      to = today.toISOString().slice(0, 10);
    } else if (p === 'custom') {
      from = this.agStatsFrom(); to = this.agStatsTo();
    }
    this.loadAgencyStats(from || undefined, to || undefined);
  }

  toggleAgency(id: string) {
    this.agSelectedId.update(cur => cur === id ? null : id);
  }

  refreshSection(s: string) {
    if (s === 'users')         this.loadUsers();
    else if (s === 'agencies') this.refreshAgencies();
    else if (s === 'transactions') this.api.allSubscriptions().subscribe({ next: (t) => this.txs.set(t), error: () => {} });
    else if (s === 'recharges')  this.loadRecharges();
    else if (s === 'collectes')  this.loadCollectes();
    else if (s === 'agence-retrait') this.loadAgenceRetrait();
    else if (s === 'audit') {
      this.loadAudit();
      this.actLoaded = false;
      if (this.auditTab() === 'actions') this.loadActionAudit();
    }
  }

  agParsedRows = computed<ImportAgencyRow[]>(() => this.parseAgencies(this.agText()));

  /** Client-side preview (the backend is authoritative): name required, dup by name+city. */
  agPreview = computed(() => {
    const existing = new Set(this.agencies().map((a) => this.agKey(a.name, a.city ?? '')));
    const seen = new Set<string>();
    return this.agParsedRows().map((r) => {
      const name = (r.name || '').trim();
      const city = (r.city || '').trim();
      let status: 'new' | 'duplicate' | 'invalid' = 'new';
      if (!name) { status = 'invalid'; }
      else {
        const key = this.agKey(name, city);
        if (existing.has(key) || seen.has(key)) status = 'duplicate';
        seen.add(key);
      }
      return { name, city, status };
    });
  });
  agCounts = computed(() => {
    const p = this.agPreview();
    return {
      created: p.filter((r) => r.status === 'new').length,
      dup: p.filter((r) => r.status === 'duplicate').length,
      invalid: p.filter((r) => r.status === 'invalid').length,
    };
  });
  agActionable = computed(() => this.agCounts().created + (this.agUpdate() ? this.agCounts().dup : 0));

  private agKey(name: string, city: string) { return `${(name || '').trim().toLowerCase()}|${(city || '').trim().toLowerCase()}`; }

  /** Parse pasted/CSV text. Header line mapped by column name, or positional: name, city.
   *  Delimiter detected: tab, ';' or ','. */
  private parseAgencies(text: string): ImportAgencyRow[] {
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length);
    if (!lines.length) return [];
    const delim = lines[0].includes('\t') ? '\t' : lines[0].includes(';') ? ';' : ',';
    const cells = (l: string) => l.split(delim).map((c) => c.trim().replace(/^"(.*)"$/, '$1'));
    let rows = lines.map(cells);
    let idx = { name: 0, city: 1 };
    const head = rows[0].map((c) => c.toLowerCase());
    const isHeader = head.some((c) => /^(nom|name|agence|agency)$/.test(c)) || head.some((c) => /^(ville|city)$/.test(c));
    if (isHeader) {
      const at = (...re: RegExp[]) => head.findIndex((c) => re.some((r) => r.test(c)));
      idx = { name: at(/^(nom|name|agence|agency)$/), city: at(/^(ville|city|localit[eé])$/) };
      rows = rows.slice(1);
    }
    const g = (row: string[], i: number) => (i >= 0 && i < row.length ? row[i] : '');
    return rows.map((row) => ({ name: g(row, idx.name), city: g(row, idx.city) || null }));
  }

  onAgText(e: Event) {
    this.agText.set((e.target as HTMLTextAreaElement).value);
    this.agResult.set(null); this.agErr.set(false);
  }
  onAgFile(e: Event) {
    const input = e.target as HTMLInputElement;
    const f = input.files?.[0];
    input.value = '';
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => { this.agText.set(String(reader.result ?? '')); this.agResult.set(null); this.agErr.set(false); };
    reader.readAsText(f);
  }
  clearAg() { this.agText.set(''); this.agResult.set(null); this.agErr.set(false); }
  runAgImport() {
    const rows = this.agParsedRows();
    if (!rows.length || this.agBusy()) return;
    this.agBusy.set(true); this.agErr.set(false);
    this.api.importAgencies(rows, this.agUpdate()).subscribe({
      next: (res) => { this.agBusy.set(false); this.agResult.set(res); this.loadAgencies(); },
      error: () => { this.agBusy.set(false); this.agErr.set(true); },
    });
  }
  downloadAgTemplate() {
    this.downloadCsv('modele-agences.csv',
      '﻿nom,ville\r\n'
      + 'Agence Yaoundé Centre,Yaoundé\r\n'
      + 'Agence Douala Akwa,Douala\r\n');
  }

  clearFilters() {
    this.txSearch.set(''); this.txStatuses.set(new Set()); this.txStatusOp.set('OR'); this.txAgent.set('all'); this.txFrom.set(''); this.txTo.set(''); this.txPay.set('all'); this.txDelivery.set('all');
  }

  clearOverviewFilter() {
    this.overviewFrom.set('');
    this.overviewTo.set('');
  }

  fmtAmount(v: number): string {
    if (v >= 1_000_000) return (v / 1_000_000).toFixed(v % 1_000_000 === 0 ? 0 : 1) + ' M';
    if (v >= 1_000)     return (v / 1_000).toFixed(v % 1_000 === 0 ? 0 : 1) + ' k';
    return v.toLocaleString('fr-FR');
  }
  exportCsv() {
    const rows = this.filteredTxs();
    const head = [
      'Date', 'Reference', 'Nom', 'Sexe', 'CNI', 'Expiration CNI', 'NIU', 'Telephone contact', 'Email',
      'Quartier', 'Region', 'Ville', 'Photo client', 'Photo CNI recto', 'Photo CNI verso',
      'Paiement', 'Telephone paiement', 'Recommande par', 'Telephone parrain',
      'Livraison', 'Canal', 'Vendeur', 'Numero carte', 'PAN', 'Statut', 'Montant',
    ];
    const yn = (b: boolean) => (b ? 'Oui' : 'Non');
    const esc = (v: string) => `"${(v ?? '').replace(/"/g, '""')}"`;
    const lines = [head.join(',')].concat(
      rows.map((t) => [
        this.fmtDateTime(t.createdAt), t.ref, t.fullName, t.sexe, t.cni, t.cniExp, t.niu ?? '',
        t.phone, t.email, t.quartier, t.region, t.ville,
        yn(t.hasSelfie), yn(t.hasCniRecto), yn(t.hasCniVerso),
        t.pay, t.payPhone ?? '', t.referrerName ?? '', t.referrerPhone ?? '',
        t.delivery,
        t.channel === 'self' ? 'En ligne' : 'Agent',
        t.channel === 'self' ? '' : (this.agentName(t.agentId) ?? ''),
        t.cardNumber ?? '',
        t.pan || t.cardNumber || '',  // PAN = pan si saisi, sinon cardNumber (les agents saisissent le PAN dans ce champ)
        t.status, String(t.amount),
      ].map((v) => esc(String(v))).join(',')),
    );
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'transactions.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  pct(count: number) {
    const max = Math.max(1, ...(this.stats()?.byAgent ?? []).map((r) => r.count));
    return (count / max) * 100;
  }

  // Pagination "Ventes par chargé de clientèle"
  readonly AGENT_PAGE_SIZE = 8;
  agentPage = signal(0);
  agentPageCount = computed(() => {
    const n = this.stats()?.byAgent?.length ?? 0;
    return n === 0 ? 1 : Math.ceil(n / this.AGENT_PAGE_SIZE);
  });
  pagedAgents = computed(() => {
    const all = this.stats()?.byAgent ?? [];
    const p = this.agentPage();
    return all.slice(p * this.AGENT_PAGE_SIZE, (p + 1) * this.AGENT_PAGE_SIZE);
  });
  agentPrev() { this.agentPage.update(p => p > 0 ? p - 1 : 0); }
  agentNext() { const max = this.agentPageCount() - 1; this.agentPage.update(p => p < max ? p + 1 : max); }
  onCfg(k: keyof CardConfig, e: Event) {
    const n = Number((e.target as HTMLInputElement).value.replace(/\D/g, '').slice(0, 8)) || 0;
    this.cfg.update((v) => ({ ...v, [k]: n }));
    this.saved.set(false); this.saveErr.set(false);
  }
  saveCfg() {
    if (this.saving()) return;
    this.saveErr.set(false); this.saving.set(true);
    this.api.updateConfig(this.cfg()).subscribe({
      next: (c) => {
        this.original.set({ ...c }); this.cfg.set({ ...c }); this.saving.set(false);
        // Update the shared frontend store so other pages reflect the new config immediately.
        this.configStore.setLocal(c);
        this.saved.set(true); setTimeout(() => this.saved.set(false), 1600);
      },
      error: () => { this.saveErr.set(true); this.saving.set(false); },
    });
  }
  openRef(ref: string) { this.router.navigate(['/print'], { queryParams: { ref } }); }

  /** Toggle the full-detail panel under an admin row. */
  toggleExpand(ref: string) {
    this.expandedRef.set(this.expandedRef() === ref ? null : ref);
  }
  agentName(id: string | null) { return this.usersList().find((u) => u.id === id)?.name ?? id ?? '—'; }
  // ---- Retraits agence (admin view) ----
  agenceRetrait        = signal<Subscription[]>([]);
  agenceRetraitLoading = signal(false);
  agenceRetraitSearch  = signal('');
  agenceRetraitAgency  = signal('all');
  agenceRetraitStatus  = signal('all');

  agenceRetraitPending = computed(() => this.agenceRetrait().filter(s => s.payStatus === 'paid' && !s.printed).length);
  agenceRetraitDone    = computed(() => this.agenceRetrait().filter(s => s.printed).length);

  agenceRetraitAgencies = computed(() => {
    const names = new Set(this.agenceRetrait().map(s => s.pickupAgencyName ?? '').filter(Boolean));
    return Array.from(names).sort();
  });

  filteredAgenceRetrait = computed(() => {
    const q = this.agenceRetraitSearch().toLowerCase().trim();
    const ag = this.agenceRetraitAgency();
    const st = this.agenceRetraitStatus();
    return this.agenceRetrait().filter(s => {
      if (q && !s.fullName.toLowerCase().includes(q) && !s.ref.toLowerCase().includes(q) && !(s.phone || '').includes(q) && !(s.pickupAgencyName || '').toLowerCase().includes(q)) return false;
      if (ag !== 'all' && s.pickupAgencyName !== ag) return false;
      if (st === 'pending' && s.printed) return false;
      if (st === 'done' && !s.printed) return false;
      return true;
    });
  });

  /** Normalised digit keys used to link a card sale to its recharges (mirror of the backend). */
  private static onlyDigits(v?: string | null) { return (v ?? '').replace(/\D/g, ''); }
  private static phone9(v?: string | null) { const d = AdminComponent.onlyDigits(v); return d.length > 9 ? d.slice(-9) : d; }

  /** Index every recharge by card PAN and by holder phone (last 9 digits) for a fast client-side join. */
  private rechargeIndex() {
    const byPan = new Map<string, Recharge[]>();
    const byPhone = new Map<string, Recharge[]>();
    for (const r of this.recharges()) {
      const pan = AdminComponent.onlyDigits(r.pan);
      const ph9 = AdminComponent.phone9(r.phone);
      if (pan) (byPan.get(pan) ?? byPan.set(pan, []).get(pan)!).push(r);
      if (ph9) (byPhone.get(ph9) ?? byPhone.set(ph9, []).get(ph9)!).push(r);
    }
    return { byPan, byPhone };
  }
  /** Recharges of one card/client (by PAN and/or phone), de-duplicated, oldest first. */
  private rechargesFor(s: Subscription, idx: { byPan: Map<string, Recharge[]>; byPhone: Map<string, Recharge[]> }) {
    const pan = AdminComponent.onlyDigits(s.pan);
    const ph9 = AdminComponent.phone9(s.phone);
    const seen = new Map<string, Recharge>();
    if (pan) for (const r of idx.byPan.get(pan) ?? []) seen.set(r.ref, r);
    if (ph9) for (const r of idx.byPhone.get(ph9) ?? []) seen.set(r.ref, r);
    return [...seen.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  /** Export the withdrawal-agency clients. Ensures recharges are loaded first so the workbook can
   *  carry, alongside the client + agency data, every recharge occurrence of those clients. */
  exportAgenceRetrait() {
    if (!this.filteredAgenceRetrait().length) return;
    if (!this.recharges().length) {
      this.api.recharges().subscribe({
        next: (r) => { this.recharges.set(r); this.buildAgenceRetraitXlsx(); },
        error: () => this.buildAgenceRetraitXlsx(),
      });
    } else {
      this.buildAgenceRetraitXlsx();
    }
  }

  private buildAgenceRetraitXlsx() {
    const rows = this.filteredAgenceRetrait();
    if (!rows.length) return;
    const today = new Date().toISOString().slice(0, 10);
    const payLabel: Record<string, string> = { om: 'Orange Money', mtn: 'MTN MoMo', cash: 'Espèces', sara: 'Virement SARA' };
    const cardLabel: Record<string, string> = { prepaid: 'Prépayée', bancaire: 'Bancaire' };
    const idx = this.rechargeIndex();

    // --- Sheet 1: client info + pickup agency, with a recharge summary per client ---
    const header = ['Référence', 'Nom complet', 'Téléphone', 'Email', 'CNI', 'NIU', 'Quartier', 'Ville', 'Région',
                    'Agence de retrait', 'Type de carte', 'N° carte', 'PAN', 'Montant (FCFA)', 'Méthode de paiement',
                    'Canal', 'Statut', 'Date de souscription', 'Nb recharges', 'Total rechargé (FCFA)', 'Dernière recharge'];
    const data: (string | number)[][] = [header];
    for (const r of rows) {
      const rch = this.rechargesFor(r, idx);
      const credited = rch.filter(x => x.status === 'fulfilled');
      const last = rch.length ? rch[rch.length - 1] : null;
      data.push([
        r.ref, r.fullName, r.phone, r.email ?? '', r.cni ?? '', r.niu ?? '',
        r.quartier ?? '', r.ville ?? '', r.region ?? '',
        r.pickupAgencyName ?? '', cardLabel[r.cardType ?? ''] ?? (r.cardType ?? ''),
        r.cardNumber ?? '', r.pan ?? '', r.amount, payLabel[r.pay] ?? r.pay,
        r.channel === 'agent' ? 'Agent' : 'Client (QR)', r.printed ? 'Remise' : 'En attente',
        this.fmtDateTime(r.createdAt),
        rch.length, credited.reduce((s, x) => s + x.amount, 0), last ? this.fmtDateTime(last.createdAt) : '',
      ]);
    }
    const ws = XLSX.utils.aoa_to_sheet(data);
    ws['!cols'] = [{ wch: 12 }, { wch: 26 }, { wch: 14 }, { wch: 22 }, { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 14 },
                  { wch: 14 }, { wch: 24 }, { wch: 12 }, { wch: 16 }, { wch: 20 }, { wch: 14 }, { wch: 18 }, { wch: 12 },
                  { wch: 12 }, { wch: 18 }, { wch: 12 }, { wch: 18 }, { wch: 18 }];
    ws['!freeze'] = { xSplit: 0, ySplit: 1 };

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Retraits agence');

    // --- Sheet 2: every recharge occurrence of those clients, chronological ---
    const rHeader = ['Client', 'Téléphone', 'CNI', 'Agence de retrait', 'PAN carte', 'Réf souscription',
                     'Réf recharge', 'Date', 'Montant (FCFA)', 'Méthode de paiement', 'Statut', 'Crédité par', 'Date crédit'];
    const rData: (string | number)[][] = [rHeader];
    for (const r of rows) {
      for (const x of this.rechargesFor(r, idx)) {
        rData.push([
          r.fullName, r.phone, r.cni ?? '', r.pickupAgencyName ?? '', x.pan ?? r.pan ?? '', r.ref,
          x.ref, this.fmtDateTime(x.createdAt), x.amount,
          x.pay === 'cash' ? 'Espèces' : (payLabel[x.pay] ?? x.pay), x.status,
          x.fulfilledBy ?? '', x.fulfilledAt ? this.fmtDateTime(x.fulfilledAt) : '',
        ]);
      }
    }
    if (rData.length > 1) {
      const rws = XLSX.utils.aoa_to_sheet(rData);
      rws['!cols'] = [{ wch: 26 }, { wch: 14 }, { wch: 14 }, { wch: 24 }, { wch: 20 }, { wch: 12 }, { wch: 12 },
                     { wch: 18 }, { wch: 14 }, { wch: 18 }, { wch: 14 }, { wch: 18 }, { wch: 18 }];
      rws['!freeze'] = { xSplit: 0, ySplit: 1 };
      XLSX.utils.book_append_sheet(wb, rws, 'Recharges');
    }

    XLSX.writeFile(wb, `retraits-agence_${today}.xlsx`);
  }

  goToTxFromAgence(ref: string) {
    if (!this.txs().length) {
      this.api.allSubscriptions().subscribe({ next: (t) => this.txs.set(t), error: () => {} });
    }
    this.txSearch.set(ref);
    this.section.set('transactions');
    this.expandedRef.set(ref);
  }

  loadAgenceRetrait() {
    this.agenceRetraitLoading.set(true);
    this.api.allSubscriptions().subscribe({
      next: (list) => {
        this.agenceRetrait.set([...list.filter(s => s.delivery === 'agence')].reverse());
        this.agenceRetraitLoading.set(false);
      },
      error: () => this.agenceRetraitLoading.set(false),
    });
  }

  /** Format an ISO timestamp as date + time for the CSV export. */
  private fmtDateTime(iso: string) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString(this.i18n.lang() === 'en' ? 'en-GB' : 'fr-FR', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  }
}
