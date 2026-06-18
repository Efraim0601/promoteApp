import { Component, Input, inject } from '@angular/core';
import { I18n } from '../core/i18n';

/** Status pill — status: paid (à imprimer) | pending | cash | sara_pending | failed | printed. */
@Component({
  selector: 'status-badge',
  standalone: true,
  template: `<span class="badge {{ cls }}"><span class="bdot" style="background:currentColor"></span>{{ i18n.t(key) }}</span>`,
})
export class StatusBadgeComponent {
  i18n = inject(I18n);
  @Input() status = 'pending';

  // 4 couleurs distinctes : ambre = action paiement, bleu = prêt à imprimer, vert = terminé, rouge = échec.
  private map: Record<string, { cls: string; key: string }> = {
    pending: { cls: 'pending', key: 'st_pending' },     // en attente de paiement (PIN client)
    cash: { cls: 'pending', key: 'st_cash' },            // espèces à encaisser
    sara_pending: { cls: 'pending', key: 'st_sara_pending' },
    paid: { cls: 'info', key: 'st_to_print' },           // payée, pas encore imprimée (souscription)
    paid_done: { cls: 'success', key: 'st_paid' },       // payée & terminée (recharge — rien à imprimer)
    to_fulfill: { cls: 'info', key: 'st_to_fulfill' },   // recharge payée, à créditer sur la carte (caissier)
    fulfilled: { cls: 'success', key: 'st_fulfilled' },  // recharge créditée & validée (terminé)
    printed: { cls: 'success', key: 'st_printed' },      // imprimée (terminé)
    failed: { cls: 'failed', key: 'st_failed' },
    expired: { cls: 'expired', key: 'st_expired' },     // délai dépassé (prompt non validé) — pas un rejet, à reprendre
    awaiting: { cls: 'pending', key: 'st_pending' },     // rétro-compatibilité
  };
  get cls(): string { return (this.map[this.status] ?? this.map['pending']).cls; }
  get key(): string { return (this.map[this.status] ?? this.map['pending']).key; }
}
