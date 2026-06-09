import { describe, it, expect } from 'vitest';
import { SpinnerComponent } from './spinner';

describe('SpinnerComponent', () => {
  it('defaults to the light tone (on a filled button)', () => {
    const s = new SpinnerComponent();
    expect(s.head).toContain('on-primary');
    expect(s.track).toContain('color-mix');
  });

  it('switches the head colour by tone', () => {
    const s = new SpinnerComponent();
    s.tone = 'primary';
    expect(s.head).toBe('var(--primary)');
    s.tone = 'muted';
    expect(s.head).toBe('var(--muted)');
  });
});
