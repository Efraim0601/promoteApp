import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { Subscription } from '../core/models';

/** Payment methods, ported from components.jsx PAY_METHODS. */
export interface PayMethod { id: string; name: string; short: string; bg: string; fg: string; momo: boolean; logo?: string; }
export const PAY_METHODS: PayMethod[] = [
  { id: 'om', name: 'Orange Money', short: 'OM', bg: '#FF7900', fg: '#fff', momo: true },
  { id: 'mtn', name: 'MTN MoMo', short: 'MTN', bg: '#FFCB05', fg: '#1a1a1a', momo: true },
  { id: 'sara', name: 'SARA Money', short: 'SARA', bg: '#fff', fg: '#1E3A8A', momo: false, logo: 'assets/sara_logo.png' },
  { id: 'cash', name: 'Espèces', short: '₣', bg: '#0E7A45', fg: '#fff', momo: false },
];
export const payById = (id: string): PayMethod => PAY_METHODS.find((p) => p.id === id) ?? PAY_METHODS[0];

/**
 * Cameroon mobile prefixes per operator (9 digits, starting with 6). Used to ensure the
 * Mobile Money number entered matches the chosen operator before letting the client continue.
 *  - MTN:    67·····, 650–654····, 680–684····
 *  - Orange: 69·····, 655–659····, 685–689····
 */
export const OPERATOR_PHONE: Record<string, RegExp> = {
  mtn: /^6(7\d{7}|5[0-4]\d{6}|8[0-4]\d{6})$/,
  om: /^6(9\d{7}|5[5-9]\d{6}|8[5-9]\d{6})$/,
};
/** True if a 9-digit Cameroon number belongs to the given operator (om | mtn). Unknown operator → not checked.
 *  Only meaningful for Cameroon numbers; callers skip it for other countries. */
export const matchesOperator = (operator: string, phone: string): boolean => {
  const re = OPERATOR_PHONE[operator];
  return re ? re.test(phone) : true;
};

/** Pretty international form of an E.164 number for display (e.g. "+237 6 99 00 00 00"). */
export const formatPhone = (v: string): string => {
  if (!v) return '';
  const p = parsePhoneNumberFromString(v);
  return p ? p.formatInternational() : v;
};

export const DELIVERY_MODES = ['promote', 'agence', 'home'];

/** Overall record status for badges — ports components.jsx recordStatus(). */
export function recordStatus(r: Subscription): string {
  // A failed payment must never be hidden by a (mistaken) print — surface the failure first.
  if (r.payStatus === 'failed') return 'failed';
  if (r.printed) return 'printed';
  if (r.payStatus === 'cash') return 'cash';
  if (r.payStatus === 'sara_pending') return 'sara_pending';
  if (r.payStatus === 'pending') return 'pending';   // en attente de paiement (PIN client)
  return 'paid';                                      // payée, pas encore imprimée -> « à imprimer »
}

/** Deterministic PRNG (mulberry32) used by the generative QR + card starfield. */
export function mulberry32(a: number): () => number {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
