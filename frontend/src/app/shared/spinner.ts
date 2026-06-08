import { Component, Input } from '@angular/core';

/**
 * Reusable loading spinner. `tone` selects the colour:
 *  - `light`   — on a primary/filled button (default)
 *  - `primary` — brand colour, for ghost buttons & section loaders
 *  - `muted`   — subtle, for inline placeholders (e.g. image loading)
 */
@Component({
  selector: 'spinner',
  standalone: true,
  template: `<span class="spinner" [style.width.px]="size" [style.height.px]="size"
    [style.border-width.px]="sw" [style.border-color]="track" [style.border-top-color]="head"></span>`,
  styles: [':host{display:inline-flex;line-height:0;vertical-align:middle}'],
})
export class SpinnerComponent {
  @Input() size = 18;
  @Input() sw = 2.5;
  @Input() tone: 'light' | 'primary' | 'muted' = 'light';

  private get color() {
    return this.tone === 'primary' ? 'var(--primary)' : this.tone === 'muted' ? 'var(--muted)' : 'var(--on-primary)';
  }
  get head() { return this.color; }
  get track() { return `color-mix(in srgb, ${this.color} 28%, transparent)`; }
}
