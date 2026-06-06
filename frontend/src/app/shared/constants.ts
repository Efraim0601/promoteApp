import { Subscription } from '../core/models';

/** Payment methods, ported from components.jsx PAY_METHODS. */
export interface PayMethod { id: string; name: string; short: string; bg: string; fg: string; momo: boolean; }
export const PAY_METHODS: PayMethod[] = [
  { id: 'om', name: 'Orange Money', short: 'OM', bg: '#FF7900', fg: '#fff', momo: true },
  { id: 'mtn', name: 'MTN MoMo', short: 'MTN', bg: '#FFCB05', fg: '#1a1a1a', momo: true },
  { id: 'sara', name: 'SARA Money', short: 'SARA', bg: '#1E3A8A', fg: '#fff', momo: false },
  { id: 'cash', name: 'Espèces', short: '₣', bg: '#0E7A45', fg: '#fff', momo: false },
];
export const payById = (id: string): PayMethod => PAY_METHODS.find((p) => p.id === id) ?? PAY_METHODS[0];

export const DELIVERY_MODES = ['promote', 'agence', 'home'];

/** Overall record status for badges — ports components.jsx recordStatus(). */
export function recordStatus(r: Subscription): string {
  if (r.printed) return 'printed';
  if (r.payStatus === 'failed') return 'failed';
  if (r.payStatus === 'cash') return 'cash';
  if (r.payStatus === 'sara_pending') return 'sara_pending';
  return 'awaiting';
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
