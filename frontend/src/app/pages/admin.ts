import { Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { I18n } from '../core/i18n';
import { Api } from '../core/api';
import { Auth } from '../core/auth';
import { AdminStats, CardConfig, Subscription } from '../core/models';
import { AppBarComponent } from '../shared/app-bar';
import { IconComponent } from '../shared/icon';
import { AvatarComponent } from '../shared/avatar';
import { FieldComponent } from '../shared/fields';
import { TxRowComponent } from '../shared/tx-row';

@Component({
  selector: 'page-admin',
  standalone: true,
  imports: [AppBarComponent, IconComponent, AvatarComponent, FieldComponent, TxRowComponent],
  template: `
  <div class="scr">
    <app-bar>
      <button appbar-right class="icon-btn" (click)="auth.logout()" [title]="i18n.t('logout')"><ic name="logout" [size]="15" [sw]="2"></ic></button>
    </app-bar>
    <div class="scr-body">
      <div style="display:flex;align-items:center;gap:12px">
        <avatar [name]="auth.user()!.name" role="admin" [size]="46"></avatar>
        <div style="min-width:0">
          <div class="kicker">{{ i18n.t('view_global') }}</div>
          <div style="font-size:20px;font-weight:800;font-family:var(--font-head);line-height:1.1;margin-top:2px">{{ i18n.t('admin_title') }}</div>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div class="kpi"><div class="kv">{{ stats()?.total ?? 0 }}</div><div class="kl">{{ i18n.t('kpi_total') }}</div></div>
        <div class="kpi"><div class="kv" style="color:var(--success)">{{ stats()?.paid ?? 0 }}</div><div class="kl">{{ i18n.t('kpi_success') }}</div></div>
        <div class="kpi"><div class="kv" style="color:var(--af-gold)">{{ stats()?.pending ?? 0 }}</div><div class="kl">{{ i18n.t('kpi_pending') }}</div></div>
        <div class="kpi"><div class="kv" style="font-size:17px;color:var(--primary)">{{ i18n.money(stats()?.collected ?? 0) }}</div><div class="kl">{{ i18n.t('kpi_collected') }}</div></div>
      </div>

      <div class="card" style="padding:16px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px">
          <ic name="award" [size]="17" style="color:var(--primary)"></ic>
          <h3 style="font-size:15px">{{ i18n.t('by_agent') }}</h3>
        </div>
        <div style="display:flex;flex-direction:column;gap:14px">
          @for (r of stats()?.byAgent ?? []; track r.id) {
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
      </div>

      <!-- config -->
      <div class="card" style="padding:16px">
        <div style="display:flex;align-items:flex-start;gap:9px;margin-bottom:14px">
          <ic name="gear" [size]="17" style="color:var(--primary);flex-shrink:0;margin-top:2px"></ic>
          <div style="min-width:0">
            <h3 style="font-size:15px;line-height:1.2">{{ i18n.t('config_title') }}</h3>
            <p class="muted" style="font-size:11.5px;line-height:1.4;margin-top:3px">{{ i18n.t('config_sub') }}</p>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:12px">
          <field [label]="i18n.t('card_price')">
            <div class="input-prefix"><input inputmode="numeric" [value]="cfg.price" (input)="onCfg('price', $event)" /><span class="pfx" style="border-right:none;border-left:1.5px solid var(--border)">{{ i18n.t('fcfa') }}</span></div>
          </field>
          <field [label]="i18n.t('fees')">
            <div class="input-prefix"><input inputmode="numeric" [value]="cfg.fees" (input)="onCfg('fees', $event)" /><span class="pfx" style="border-right:none;border-left:1.5px solid var(--border)">{{ i18n.t('fcfa') }}</span></div>
          </field>
          <field [label]="i18n.t('transport_fee')">
            <div class="input-prefix"><input inputmode="numeric" [value]="cfg.transport" (input)="onCfg('transport', $event)" /><span class="pfx" style="border-right:none;border-left:1.5px solid var(--border)">{{ i18n.t('fcfa') }}</span></div>
          </field>
          <button class="btn btn-primary" [disabled]="!changed" (click)="saveCfg()" style="padding:12px">
            @if (saved()) { <ic name="check" [size]="18" [sw]="2.5"></ic> {{ i18n.t('saved') }} } @else { {{ i18n.t('save') }} }
          </button>
        </div>
      </div>

      <!-- all sales -->
      <div class="card" style="overflow:hidden">
        <div style="display:flex;align-items:center;gap:8px;padding:14px 14px 10px">
          <ic name="chart" [size]="17" style="color:var(--primary)"></ic>
          <h3 style="font-size:15px">{{ i18n.t('all_sales') }}</h3>
          <span class="muted" style="margin-left:auto;font-size:12px;font-weight:700">{{ txs().length }}</span>
        </div>
        <div style="max-height:300px;overflow-y:auto;padding:0 6px 6px">
          @if (txs().length === 0) {
            <p class="muted" style="font-size:13px;padding:8px 14px 20px;text-align:center">{{ i18n.t('tx_empty') }}</p>
          } @else {
            <div style="display:flex;flex-direction:column">
              @for (t of reversed; track t.ref) { <tx-row [t]="t" (open)="openRef(t.ref)"></tx-row> }
            </div>
          }
        </div>
      </div>

      <button class="btn btn-ghost" (click)="auth.logout()" style="font-size:13.5px"><ic name="logout" [size]="16"></ic> {{ i18n.t('logout') }}</button>
    </div>
  </div>`,
})
export class AdminComponent implements OnInit {
  i18n = inject(I18n);
  auth = inject(Auth);
  private api = inject(Api);
  private router = inject(Router);

  stats = signal<AdminStats | null>(null);
  txs = signal<Subscription[]>([]);
  cfg: CardConfig = { price: 0, fees: 0, transport: 0 };
  private original: CardConfig = { price: 0, fees: 0, transport: 0 };
  saved = signal(false);

  ngOnInit() {
    this.api.adminStats().subscribe((s) => this.stats.set(s));
    this.api.allSubscriptions().subscribe((t) => this.txs.set(t));
    this.api.getConfig().subscribe((c) => { this.cfg = { ...c }; this.original = { ...c }; });
  }

  get reversed() { return this.txs().slice().reverse(); }
  pct(count: number) {
    const max = Math.max(1, ...(this.stats()?.byAgent ?? []).map((r) => r.count));
    return (count / max) * 100;
  }
  onCfg(k: keyof CardConfig, e: Event) {
    this.cfg[k] = Number((e.target as HTMLInputElement).value.replace(/\D/g, '').slice(0, 8)) || 0;
    this.saved.set(false);
  }
  get changed() {
    return this.cfg.price !== this.original.price || this.cfg.fees !== this.original.fees || this.cfg.transport !== this.original.transport;
  }
  saveCfg() {
    this.api.updateConfig(this.cfg).subscribe((c) => {
      this.original = { ...c }; this.cfg = { ...c };
      this.saved.set(true); setTimeout(() => this.saved.set(false), 1600);
    });
  }
  openRef(ref: string) { this.router.navigate(['/print'], { queryParams: { ref } }); }
}
