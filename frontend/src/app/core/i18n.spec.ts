import { describe, it, expect } from 'vitest';
import { I18n } from './i18n';

describe('I18n', () => {
  it('starts in French and toggles to English', () => {
    const i = new I18n();
    expect(i.lang()).toBe('fr');
    const fr = i.t('login_btn');
    i.toggle();
    expect(i.lang()).toBe('en');
    expect(i.t('login_btn')).not.toBe(fr);
  });

  it('returns the key unchanged when it is missing, and still runs interpolation', () => {
    const i = new I18n();
    expect(i.t('___missing_key___', { x: 1 })).toBe('___missing_key___');
  });

  it('formats money with grouped digits and the FCFA suffix', () => {
    const i = new I18n();
    const s = i.money(1234567);
    expect(s).toContain(i.t('fcfa'));
    expect(s).toMatch(/1\s?234\s?567|1234567/);
  });

  it('rounds and guards non-numeric money input', () => {
    const i = new I18n();
    expect(i.money(NaN)).toContain('0');
  });
});
