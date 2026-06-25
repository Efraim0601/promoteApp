import { Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { I18n } from '../core/i18n';
import { Api } from '../core/api';
import { Auth } from '../core/auth';
import { CashSupervisionStats, PrintSupervisionStats } from '../core/models';
import { AppBarComponent } from '../shared/app-bar';
import { IconComponent } from '../shared/icon';
import { SpinnerComponent } from '../shared/spinner';
import { NotifBellComponent } from '../shared/notif-bell';
import { RevealDirective } from '../shared/reveal';

/**
 * Supervisor daily reconciliation: print remittance (per print agent) and cash collection (per
 * cashier) across EVERYONE for a chosen day, so the supervisor can validate each collaborator's
 * "rapprochement journalier". Read-only. Open to SUPERVISEUR / ADMIN / MANAGER (gated in the route).
 */
@Component({
  selector: 'page-supervision',
  standalone: true,
  imports: [AppBarComponent, IconComponent, SpinnerComponent, NotifBellComponent, RevealDirective],
  template: `
  <div class="scr">
    <app-bar>
      <notif-bell appbar-right></notif-bell>
      <button appbar-right class="icon-btn" (click)="auth.logout()" [title]="i18n.t('logout')"><ic name="logout" [size]="15" [sw]="2"></ic></button>
    </app-bar>
    <div class="scr-body" reveal="screen">
      <div class="kicker" style="margin-bottom:4px" data-reveal="item"><ic name="chart" [size]="13" style="vertical-align:-2px;margin-right:4px"></ic>{{ i18n.t('sup_kicker') }}</div>

      <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px" data-reveal="item">
        <h1 style="font-size:21px;margin:0;flex:1">{{ i18n.t('sup_title') }}</h1>
        <button class="icon-btn" (click)="load()" [title]="i18n.t('map_reload')" style="flex-shrink:0"><ic name="refresh" [size]="16"></ic></button>
      </div>
      <p class="muted" style="font-size:12.5px;line-height:1.5;margin:0 0 12px">{{ i18n.t('sup_sub') }}</p>

      <!-- Day picker + quick links to the supervisor's other views -->
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:14px" data-reveal="item">
        <label class="muted" style="font-size:12px;font-weight:700">{{ i18n.t('sup_day') }}</label>
        <input type="date" class="input" style="height:36px;width:auto;flex:0 0 auto" [value]="day()" [max]="today" (change)="onDay($event)" />
        <button class="btn btn-ghost" style="font-size:12px;padding:7px 11px" (click)="today_()">{{ i18n.t('sup_today') }}</button>
        <span style="flex:1"></span>
        <button class="btn btn-outline" style="font-size:12px;padding:7px 11px" (click)="go('/team-stats')"><ic name="chart" [size]="13"></ic> {{ i18n.t('sup_nav_team') }}</button>
        <button class="btn btn-outline" style="font-size:12px;padding:7px 11px" (click)="go('/collecte-stats')"><ic name="store" [size]="13"></ic> {{ i18n.t('sup_nav_collecte') }}</button>
      </div>

      @if (loading()) {
        <div class="load-center"><spinner tone="primary" [size]="22"></spinner> {{ i18n.t('loading') }}</div>
      } @else if (error()) {
        <p class="err" style="text-align:center;font-weight:700">{{ i18n.t('sup_error') }}</p>
      } @else {
        <!-- ===== IMPRESSION ===== -->
        <div class="kicker" style="margin-bottom:6px" data-reveal="item"><ic name="printer" [size]="13" style="vertical-align:-2px;margin-right:4px"></ic>{{ i18n.t('sup_print_title') }}</div>
        @if (print(); as p) {
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">
            <div class="kpi" style="padding:10px 12px" data-reveal="kpi"><div class="kv" style="font-size:20px;color:var(--primary)">{{ p.totalPrinted }}</div><div class="kl">{{ i18n.t('sup_total_printed') }}</div></div>
            <div class="kpi" style="padding:10px 12px" data-reveal="kpi"><div class="kv" style="font-size:20px;color:var(--af-gold)">{{ p.queue }}</div><div class="kl">{{ i18n.t('sup_queue') }}</div></div>
          </div>
          @if (!p.byPrinter.length) {
            <p class="muted" style="font-size:12.5px;margin-bottom:18px">{{ i18n.t('sup_empty_print') }}</p>
          } @else {
            <div class="card" style="overflow:hidden;margin-bottom:18px" data-reveal="item">
              <div class="sup-row sup-head">
                <span style="flex:1">{{ i18n.t('sup_col_printer') }}</span>
                <span class="sup-n">{{ i18n.t('sup_col_printed') }}</span>
                <span class="sup-n">{{ i18n.t('sup_col_activated') }}</span>
                <span class="sup-n">{{ i18n.t('sup_col_pending_act') }}</span>
              </div>
              @for (r of p.byPrinter; track r.id) {
                <div class="sup-row" [style.opacity]="r.printed ? 1 : .55">
                  <span style="flex:1;min-width:0">
                    <span style="font-weight:700;font-size:13px;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{ r.name }}</span>
                    @if (r.agency) { <span class="muted" style="font-size:11px">{{ r.agency }}</span> }
                  </span>
                  <span class="sup-n" style="font-weight:800">{{ r.printed }}</span>
                  <span class="sup-n" style="color:var(--success)">{{ r.activated }}</span>
                  <span class="sup-n" [style.color]="r.pendingActivation ? 'var(--warning)' : 'var(--muted)'">{{ r.pendingActivation }}</span>
                </div>
              }
            </div>
          }
        }

        <!-- ===== ENCAISSEMENT ===== -->
        <div class="kicker" style="margin-bottom:6px" data-reveal="item"><ic name="check" [size]="13" style="vertical-align:-2px;margin-right:4px"></ic>{{ i18n.t('sup_cash_title') }}</div>
        @if (cash(); as c) {
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">
            <div class="kpi" style="padding:10px 12px" data-reveal="kpi"><div class="kv" style="font-size:17px;color:var(--primary)">{{ i18n.money(c.totalCollected) }}</div><div class="kl">{{ i18n.t('sup_total_collected') }}</div></div>
            <div class="kpi" style="padding:10px 12px" data-reveal="kpi"><div class="kv" style="font-size:17px;color:var(--warning)">{{ i18n.money(c.pendingAmount) }}</div><div class="kl">{{ i18n.t('sup_pending_cash') }} ({{ c.pendingCount }})</div></div>
          </div>
          @if (!c.byCashier.length) {
            <p class="muted" style="font-size:12.5px">{{ i18n.t('sup_empty_cash') }}</p>
          } @else {
            <div class="card" style="overflow:hidden" data-reveal="item">
              <div class="sup-row sup-head">
                <span style="flex:1">{{ i18n.t('sup_col_cashier') }}</span>
                <span class="sup-n">{{ i18n.t('sup_col_count') }}</span>
                <span class="sup-amt">{{ i18n.t('sup_col_amount') }}</span>
              </div>
              @for (r of c.byCashier; track r.id) {
                <div class="sup-row" [style.opacity]="r.count ? 1 : .55">
                  <span style="flex:1;min-width:0">
                    <span style="font-weight:700;font-size:13px;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{ r.name }}</span>
                    @if (r.agency) { <span class="muted" style="font-size:11px">{{ r.agency }}</span> }
                  </span>
                  <span class="sup-n" style="font-weight:800">{{ r.count }}</span>
                  <span class="sup-amt" style="font-weight:800">{{ i18n.money(r.collected) }}</span>
                </div>
              }
            </div>
          }
        }
      }
    </div>
  </div>`,
  styles: [`
    .sup-row{ display:flex; align-items:center; gap:10px; padding:10px 14px; border-top:1px solid var(--border); }
    .sup-row:first-child{ border-top:none; }
    .sup-head{ background:var(--surface-2); font-size:10.5px; font-weight:700; text-transform:uppercase; letter-spacing:.03em; color:var(--muted); }
    .sup-n{ width:74px; text-align:right; flex-shrink:0; font-size:13px; }
    .sup-amt{ width:104px; text-align:right; flex-shrink:0; font-size:13px; }
  `],
})
export class SupervisionComponent implements OnInit {
  i18n = inject(I18n);
  auth = inject(Auth);
  private api = inject(Api);
  private router = inject(Router);

  readonly today = this.localDay(new Date());
  day = signal(this.today);
  print = signal<PrintSupervisionStats | null>(null);
  cash = signal<CashSupervisionStats | null>(null);
  loading = signal(true);
  error = signal(false);

  ngOnInit() { this.load(); }

  load() {
    this.loading.set(true);
    this.error.set(false);
    const d = this.day();
    let pending = 2;
    const done = () => { if (--pending === 0) this.loading.set(false); };
    this.api.printSupervision(d).subscribe({
      next: (s) => { this.print.set(s); done(); },
      error: () => { this.error.set(true); done(); },
    });
    this.api.cashSupervision(d).subscribe({
      next: (s) => { this.cash.set(s); done(); },
      error: () => { this.error.set(true); done(); },
    });
  }

  onDay(e: Event) {
    const v = (e.target as HTMLInputElement).value;
    if (v) { this.day.set(v); this.load(); }
  }
  today_() { if (this.day() !== this.today) { this.day.set(this.today); this.load(); } }
  go(path: string) { this.router.navigate([path]); }

  /** Local (server-zone-agnostic) yyyy-MM-dd, so "today" matches what the user sees on the calendar. */
  private localDay(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
}
