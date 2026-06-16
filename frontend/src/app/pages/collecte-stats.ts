import { Component, OnInit, inject, signal } from '@angular/core';
import * as XLSX from 'xlsx';
import { I18n } from '../core/i18n';
import { Api } from '../core/api';
import { Auth } from '../core/auth';
import { CollecteStats } from '../core/models';
import { AppBarComponent } from '../shared/app-bar';
import { IconComponent } from '../shared/icon';
import { SpinnerComponent } from '../shared/spinner';
import { NotifBellComponent } from '../shared/notif-bell';

/**
 * Collecte supervisor view: global statistics of bank-product sales (collectes), in a page of its
 * own — separate from the admin dashboard. Open to SUPERVISEUR and ADMIN (gated in the route).
 */
@Component({
  selector: 'page-collecte-stats',
  standalone: true,
  imports: [AppBarComponent, IconComponent, SpinnerComponent, NotifBellComponent],
  template: `
  <div class="scr">
    <app-bar>
      <notif-bell appbar-right></notif-bell>
      <button appbar-right class="icon-btn" (click)="auth.logout()" [title]="i18n.t('logout')"><ic name="logout" [size]="15" [sw]="2"></ic></button>
    </app-bar>
    <div class="scr-body">
      <div class="kicker" style="margin-bottom:4px"><ic name="chart" [size]="13" style="vertical-align:-2px;margin-right:4px"></ic>{{ i18n.t('cs_kicker') }}</div>

      <!-- Header row: title + action buttons -->
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
        <h1 style="font-size:21px;margin:0;flex:1">{{ i18n.t('cs_title') }}</h1>
        <button class="icon-btn" (click)="load()" [title]="i18n.t('map_reload')" style="flex-shrink:0"><ic name="refresh" [size]="16"></ic></button>
        @if (stats() && !loading()) {
          <button class="btn btn-outline" (click)="exportExcel()" style="font-size:12px;padding:6px 11px;flex-shrink:0"><ic name="download" [size]="13"></ic> {{ i18n.t('cs_export_xl') }}</button>
        }
      </div>
      <p class="muted" style="font-size:12.5px;line-height:1.5;margin:0 0 16px">{{ i18n.t('cs_sub') }}</p>

      @if (loading()) {
        <div class="load-center"><spinner tone="primary" [size]="22"></spinner> {{ i18n.t('loading') }}</div>
      } @else if (stats(); as s) {
        <!-- Total -->
        <div class="card" style="padding:16px;text-align:center;margin-bottom:12px">
          <div style="font-size:34px;font-weight:800;color:var(--primary);line-height:1">{{ s.total }}</div>
          <div class="muted" style="font-size:12px;font-weight:700;margin-top:4px;text-transform:uppercase;letter-spacing:.04em">{{ i18n.t('cs_total') }}</div>
        </div>

        <!-- By product -->
        <div class="kicker" style="margin-bottom:6px">{{ i18n.t('cs_by_product') }}</div>
        <div class="card" style="padding:12px 14px;margin-bottom:12px;display:flex;flex-direction:column;gap:10px">
          @for (b of s.byProduct; track b.key) {
            <div>
              <div style="display:flex;align-items:center;gap:8px;font-size:13px;margin-bottom:3px">
                <span style="min-width:0;flex:1;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{ i18n.t('prod_' + b.key) }}</span>
                <span style="font-weight:800">{{ b.count }}</span>
                <span class="muted" style="font-size:11px;width:42px;text-align:right">{{ pct(b.count, s.total) }}%</span>
              </div>
              <div style="height:7px;border-radius:99px;background:var(--surface-2);overflow:hidden">
                <div [style.width.%]="pct(b.count, s.total)" style="height:100%;background:var(--primary);border-radius:99px;transition:width .4s"></div>
              </div>
            </div>
          }
        </div>

        <!-- By commercial -->
        <div class="kicker" style="margin-bottom:6px">{{ i18n.t('cs_by_commercial') }} · {{ s.byCommercial.length }}</div>
        @if (!s.byCommercial.length) {
          <p class="muted" style="font-size:12.5px">{{ i18n.t('cs_empty') }}</p>
        } @else {
          <div class="card" style="padding:4px 0;overflow:hidden">
            @for (b of s.byCommercial; track b.key; let i = $index) {
              <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;border-top:1px solid var(--border)">
                <span style="width:22px;height:22px;border-radius:50%;background:var(--surface-2);font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0">{{ i + 1 }}</span>
                <span style="min-width:0;flex:1;font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{ b.label || '—' }}</span>
                <span style="font-size:14px;font-weight:800">{{ b.count }}</span>
              </div>
            }
          </div>
        }
      } @else {
        <p class="err" style="text-align:center;font-weight:700">{{ i18n.t('cs_error') }}</p>
      }
    </div>
  </div>`,
})
export class CollecteStatsComponent implements OnInit {
  i18n = inject(I18n);
  auth = inject(Auth);
  private api = inject(Api);

  stats = signal<CollecteStats | null>(null);
  loading = signal(true);

  ngOnInit() { this.load(); }

  load() {
    this.loading.set(true);
    this.api.collecteStats().subscribe({
      next: (s) => { this.stats.set(s); this.loading.set(false); },
      error: () => { this.stats.set(null); this.loading.set(false); },
    });
  }

  pct(part: number, total: number) { return total > 0 ? Math.round((part / total) * 100) : 0; }

  exportExcel() {
    const s = this.stats();
    if (!s) return;
    const today = new Date().toISOString().slice(0, 10);
    const total = s.total;

    // Sheet 1: Résumé par produit
    const resumeRows: (string | number)[][] = [
      ['Statistiques de la Collecte — Afriland Carte Promote'],
      [`Exporté le : ${today}`],
      [],
      ['Produit', 'Nombre', 'Part (%)'],
      ...s.byProduct.map(b => [this.i18n.t('prod_' + b.key), b.count, this.pct(b.count, total)]),
      [],
      ['TOTAL', total, 100],
    ];
    const ws1 = XLSX.utils.aoa_to_sheet(resumeRows);
    ws1['!cols'] = [{ wch: 28 }, { wch: 10 }, { wch: 10 }];
    ws1['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 2 } }];

    // Sheet 2: Classement des commerciaux
    const comRows: (string | number)[][] = [
      ['Rang', 'Commercial', 'Nombre'],
      ...s.byCommercial.map((b, i) => [i + 1, b.label || '—', b.count]),
    ];
    const ws2 = XLSX.utils.aoa_to_sheet(comRows);
    ws2['!cols'] = [{ wch: 6 }, { wch: 32 }, { wch: 10 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws1, 'Résumé');
    XLSX.utils.book_append_sheet(wb, ws2, 'Commerciaux');
    XLSX.writeFile(wb, `collecte-stats_${today}.xlsx`);
  }
}
