import { Component, Input } from '@angular/core';

/** Wizard progress dots. */
@Component({
  selector: 'steps',
  standalone: true,
  template: `<div class="steps">
    @for (i of dots; track i) {
      <div class="dot" [class.done]="i < current" [class.on]="i === current"></div>
    }
  </div>`,
})
export class StepsComponent {
  @Input() n = 4;
  @Input() current = 0;
  get dots(): number[] { return Array.from({ length: this.n }, (_, i) => i); }
}
