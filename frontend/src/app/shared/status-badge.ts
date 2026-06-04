import { Component, Input, inject } from '@angular/core';
import { I18n } from '../core/i18n';

/** Status pill — status: paid | awaiting | cash | failed | printed. */
@Component({
  selector: 'status-badge',
  standalone: true,
  template: `<span class="badge {{ cls }}"><span class="bdot" style="background:currentColor"></span>{{ i18n.t(key) }}</span>`,
})
export class StatusBadgeComponent {
  i18n = inject(I18n);
  @Input() status = 'awaiting';

  private map: Record<string, { cls: string; key: string }> = {
    paid: { cls: 'success', key: 'st_paid' },
    awaiting: { cls: 'pending', key: 'st_awaiting' },
    cash: { cls: 'pending', key: 'st_cash' },
    failed: { cls: 'failed', key: 'st_failed' },
    printed: { cls: 'success', key: 'st_printed' },
  };
  get cls(): string { return (this.map[this.status] ?? this.map['awaiting']).cls; }
  get key(): string { return (this.map[this.status] ?? this.map['awaiting']).key; }
}
