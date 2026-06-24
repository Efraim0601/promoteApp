import { Component, Input, inject, signal } from '@angular/core';
import { I18n } from '../core/i18n';
import { Api } from '../core/api';
import { Recharge, Subscription } from '../core/models';
import { PAY_METHODS } from './constants';
import { IconComponent } from './icon';
import { SpinnerComponent } from './spinner';
import { StatusBadgeComponent } from './status-badge';

/**
 * Collapsible recharge (top-up) history for one card/client. Embedded under a subscription search
 * result on every profile: it answers "did the client buy the card?" (the sale they searched) and
 * "has it been recharged?" — listing every top-up chronologically with its date, amount and status.
 *
 * Loads lazily on first expand (one request per card opened), keyed on the sale's PAN + phone.
 */
@Component({
  selector: 'recharge-history',
  standalone: true,
  imports: [IconComponent, SpinnerComponent, StatusBadgeComponent],
  template: `
    <div class="rh">
      <button class="rh-toggle" (click)="toggle()">
        <ic name="clock" [size]="14"></ic>
        <span>{{ i18n.t('rh_title') }}</span>
        @if (loaded()) { <span class="rh-count">{{ items().length }}</span> }
        <ic name="chevD" [size]="16" class="rh-chev" [class.up]="open()" style="margin-left:auto"></ic>
      </button>

      @if (open()) {
        @if (busy()) {
          <div class="rh-load"><spinner tone="primary" [size]="16"></spinner> {{ i18n.t('loading') }}</div>
        } @else if (!items().length) {
          <p class="rh-empty">{{ i18n.t('rh_none') }}</p>
        } @else {
          <div class="rh-sum">
            <span><b>{{ doneCount() }}</b>/{{ items().length }} {{ i18n.t('rh_done') }}</span>
            <span style="margin-left:auto">{{ i18n.t('rh_total') }} <b>{{ i18n.money(totalCredited()) }}</b></span>
            <button class="rh-export" (click)="exportCsv()" [title]="i18n.t('rh_export')">
              <ic name="download" [size]="13"></ic> {{ i18n.t('rh_export') }}
            </button>
          </div>
          <div class="rh-list">
            @for (r of items(); track r.ref; let i = $index) {
              <div class="rh-item">
                <span class="rh-idx">{{ i + 1 }}</span>
                <div style="min-width:0;flex:1">
                  <div class="rh-line">
                    <b>{{ i18n.money(r.amount) }}</b>
                    <status-badge [status]="r.status"></status-badge>
                  </div>
                  <div class="rh-meta">{{ fmtDate(r.createdAt) }} · {{ r.ref }}</div>
                </div>
              </div>
            }
          </div>
        }
      }
    </div>
  `,
  styles: [`
    .rh{ border-top:1px solid var(--border); padding-top:8px; }
    .rh-toggle{ display:flex; align-items:center; gap:7px; width:100%; background:transparent; border:0; cursor:pointer;
      color:var(--muted); font-size:12px; font-weight:700; padding:2px 0; }
    .rh-count{ background:var(--surface-2); color:var(--text); border-radius:999px; padding:1px 8px; font-size:11px; }
    .rh-chev{ transition:transform .15s ease; }
    .rh-chev.up{ transform:rotate(180deg); }
    .rh-load{ display:flex; align-items:center; gap:8px; font-size:12px; color:var(--muted); padding:8px 0; }
    .rh-empty{ font-size:12px; color:var(--muted); padding:8px 0; margin:0; }
    .rh-sum{ display:flex; align-items:center; gap:10px; font-size:11.5px; color:var(--muted); padding:6px 0 4px; }
    .rh-export{ display:inline-flex; align-items:center; gap:4px; background:transparent; border:1px solid var(--border);
      border-radius:8px; color:var(--text); font-size:11px; font-weight:700; padding:3px 8px; cursor:pointer; }
    .rh-export:hover{ background:var(--surface-2); }
    .rh-list{ display:flex; flex-direction:column; gap:6px; }
    .rh-item{ display:flex; align-items:center; gap:9px; }
    .rh-idx{ flex-shrink:0; width:20px; height:20px; border-radius:999px; background:var(--surface-2); color:var(--muted);
      font-size:11px; font-weight:700; display:flex; align-items:center; justify-content:center; }
    .rh-line{ display:flex; align-items:center; gap:8px; font-size:13px; }
    .rh-meta{ font-size:11px; color:var(--muted); margin-top:1px; }
  `],
})
export class RechargeHistoryComponent {
  i18n = inject(I18n);
  private api = inject(Api);

  /** The found sale; its PAN + phone key the card's recharge history. */
  @Input({ required: true }) sub!: Subscription;

  open = signal(false);
  busy = signal(false);
  loaded = signal(false);
  items = signal<Recharge[]>([]);

  toggle() {
    this.open.update((v) => !v);
    if (this.open() && !this.loaded() && !this.busy()) this.load();
  }

  private load() {
    this.busy.set(true);
    this.api.rechargesForCard(this.sub.pan ?? null, this.sub.phone ?? null).subscribe({
      next: (list) => { this.items.set(list); this.loaded.set(true); this.busy.set(false); },
      error: () => { this.busy.set(false); },
    });
  }

  /** Recharges effectively credited to the card (cashier-fulfilled). */
  doneCount() { return this.items().filter((r) => r.status === 'fulfilled').length; }
  totalCredited() { return this.items().filter((r) => r.status === 'fulfilled').reduce((s, r) => s + r.amount, 0); }

  fmtDate(iso: string) {
    const d = new Date(iso);
    return isNaN(d.getTime()) ? '' : d.toLocaleString(this.i18n.lang() === 'en' ? 'en-GB' : 'fr-FR',
      { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  private payLabel(p: string) { return p === 'cash' ? this.i18n.t('pay_cash_name') : (PAY_METHODS.find((m) => m.id === p)?.name ?? p); }
  private statusLabel(st: string) {
    const k: Record<string, string> = {
      pending: 'st_pending', cash: 'st_cash', sara_pending: 'st_sara_pending',
      to_fulfill: 'st_to_fulfill', fulfilled: 'st_fulfilled', failed: 'st_failed', paid: 'st_paid',
    };
    return this.i18n.t(k[st] ?? 'st_pending');
  }

  /** Extract this client's recharge occurrences as CSV — each row carries the client + card identity
   *  (and pickup agency) so the file is a self-contained extract usable on its own. */
  exportCsv() {
    const s = this.sub;
    const esc = (v: string) => `"${(v ?? '').replace(/"/g, '""')}"`;
    const head = ['Client', 'Telephone', 'CNI', 'PAN carte', 'Agence de retrait', 'Ref souscription',
      'N°', 'Ref recharge', 'Date', 'Montant', 'Paiement', 'Statut', 'Credite par', 'Date credit'];
    const rows = this.items().map((r, i) => [
      s.fullName, s.phone, s.cni ?? '', s.pan ?? '', s.pickupAgencyName ?? '', s.ref,
      String(i + 1), r.ref, this.fmtDate(r.createdAt), String(r.amount),
      this.payLabel(r.pay), this.statusLabel(r.status), r.fulfilledBy ?? '',
      r.fulfilledAt ? this.fmtDate(r.fulfilledAt) : '',
    ].map((v) => esc(String(v))).join(','));
    const blob = new Blob(['﻿' + [head.join(','), ...rows].join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `recharges_${s.ref}.csv`; a.click();
    URL.revokeObjectURL(url);
  }
}
