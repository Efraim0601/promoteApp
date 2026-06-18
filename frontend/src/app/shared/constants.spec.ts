import { describe, it, expect } from 'vitest';
import { payById, matchesOperator, recordStatus, PAY_METHODS } from './constants';
import { Subscription } from '../core/models';

describe('payById', () => {
  it('returns the matching payment method', () => {
    expect(payById('mtn').name).toBe('MTN MoMo');
    expect(payById('cash').short).toBe('₣');
  });
  it('falls back to the first method for an unknown id', () => {
    expect(payById('zzz')).toBe(PAY_METHODS[0]);
  });
});

describe('matchesOperator', () => {
  it('accepts MTN prefixes and rejects Orange ones', () => {
    expect(matchesOperator('mtn', '670000000')).toBe(true);
    expect(matchesOperator('mtn', '690000000')).toBe(false);
  });
  it('accepts Orange prefixes and rejects MTN ones', () => {
    expect(matchesOperator('om', '690000000')).toBe(true);
    expect(matchesOperator('om', '670000000')).toBe(false);
  });
  it('does not constrain an unknown operator', () => {
    expect(matchesOperator('cash', '123')).toBe(true);
  });
});

describe('recordStatus', () => {
  const base = { printed: false, payStatus: 'pending' } as unknown as Subscription;
  it('reports printed first', () => {
    expect(recordStatus({ ...base, printed: true } as Subscription)).toBe('printed');
  });
  it('maps each payment status', () => {
    expect(recordStatus({ ...base, payStatus: 'failed' } as Subscription)).toBe('failed');
    expect(recordStatus({ ...base, payStatus: 'cash' } as Subscription)).toBe('cash');
    expect(recordStatus({ ...base, payStatus: 'sara_pending' } as Subscription)).toBe('sara_pending');
    expect(recordStatus(base)).toBe('pending');                                          // pending = en attente de paiement
    expect(recordStatus({ ...base, payStatus: 'paid' } as Subscription)).toBe('paid');   // payée, pas encore imprimée
  });
  it('distingue le délai dépassé (TIMEOUT) du vrai échec', () => {
    // Un paiement failed dont la cause est un prompt USSD expiré → statut « expired » (libellé « Expiré »).
    expect(recordStatus({ ...base, payStatus: 'failed', failureCategory: 'TIMEOUT' } as Subscription)).toBe('expired');
    // Toute autre cause d'échec (rejet, solde, PIN…) reste « failed ».
    expect(recordStatus({ ...base, payStatus: 'failed', failureCategory: 'INSUFFICIENT_FUNDS' } as Subscription)).toBe('failed');
  });
});
