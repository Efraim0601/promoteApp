import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { I18n } from '../core/i18n';
import { Subscription } from '../core/models';
import { payById, recordStatus } from './constants';
import { StatusBadgeComponent } from './status-badge';
import { ClientPhotoComponent } from './client-photo';

/** Shared transaction row (agent + admin lists), ported from agent.jsx TxRow.
 *  In {@code detailed} mode (admin) it leads with the client photo and shows phone / ID / date /
 *  payment method, so a record can be identified at a glance while scrolling. */
@Component({
  selector: 'tx-row',
  standalone: true,
  imports: [StatusBadgeComponent, ClientPhotoComponent],
  template: `
    <button (click)="open.emit()" class="txrow" [class.txrow-detailed]="detailed">
      @if (detailed) {
        <client-photo [refId]="t.ref" [name]="t.fullName" [hasSelfie]="t.hasSelfie" [size]="46"></client-photo>
      } @else {
        <span class="op-logo" [style.background]="pm.bg" [style.color]="pm.fg" style="width:34px;height:34px;font-size:10px;border-radius:9px;flex-shrink:0;overflow:hidden">@if (pm.logo) { <img [src]="pm.logo" [alt]="pm.name" style="width:100%;height:100%;object-fit:contain;padding:3px;box-sizing:border-box" /> } @else { {{ pm.short }} }</span>
      }
      <div style="min-width:0;flex:1">
        <div style="font-weight:700;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{ t.fullName }}</div>
        @if (detailed) {
          <div class="muted" style="font-size:11.5px;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{ t.phone }}@if (t.cni) { · {{ i18n.t('cni_short') }} {{ t.cni }} }</div>
          <div class="muted" style="font-size:10.5px;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{ t.ref }} · {{ fmtDate }} · {{ pm.name }}@if (t.channel === 'self') { · {{ i18n.t('tx_self') }} }</div>
        } @else {
          <div class="muted" style="font-size:11px;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{ t.ref }} · {{ i18n.t('del_' + t.delivery + '_title') }}</div>
        }
      </div>
      <div style="text-align:right;flex-shrink:0">
        <div style="font-weight:800;font-size:13px;white-space:nowrap">{{ i18n.money(t.amount) }}</div>
        <div style="margin-top:4px"><status-badge [status]="status"></status-badge></div>
      </div>
    </button>`,
  styles: [`
    .txrow{ display:flex; align-items:center; gap:11px; padding:11px 8px; border-top:1px solid var(--border);
      background:none; border-left:none; border-right:none; border-bottom:none; cursor:pointer; text-align:left;
      font-family:var(--font); color:var(--text); width:100%; }
    .txrow-detailed{ align-items:flex-start; padding:12px 8px; }
    .txrow:hover{ background:var(--surface-2); }
  `],
})
export class TxRowComponent {
  i18n = inject(I18n);
  @Input() t!: Subscription;
  /** Admin table: richer row with the client photo + phone/ID/date for at-a-glance identification. */
  @Input() detailed = false;
  @Output() open = new EventEmitter<void>();
  get pm() { return payById(this.t.pay); }
  get status() { return recordStatus(this.t); }
  get fmtDate() {
    const d = new Date(this.t.createdAt);
    return isNaN(d.getTime()) ? '' : d.toLocaleDateString(this.i18n.lang() === 'en' ? 'en-GB' : 'fr-FR',
      { day: '2-digit', month: '2-digit', year: '2-digit' });
  }
}
