import { Component, EventEmitter, Input, Output } from '@angular/core';

/** Wizard progress bars. When [clickable], each bar is a button that jumps to that step. */
@Component({
  selector: 'steps',
  standalone: true,
  template: `<div class="steps">
    @for (i of dots; track i) {
      <button type="button" class="step-dot" [class.done]="i < current" [class.on]="i === current"
        [disabled]="!clickable" [attr.aria-label]="labels[i] || null" [title]="labels[i] || ''"
        (click)="pick.emit(i)">
        <span class="bar"></span>
      </button>
    }
  </div>`,
  styles: [`
    .steps{ display:flex; align-items:center; gap:6px; }
    .step-dot{ flex:1; display:block; appearance:none; border:none; background:transparent; padding:9px 0; cursor:pointer; }
    .step-dot[disabled]{ cursor:default; }
    .step-dot .bar{ display:block; height:5px; border-radius:3px; background:var(--border); transition:background .2s ease; }
    .step-dot.on .bar{ background:var(--primary); }
    .step-dot.done .bar{ background:var(--primary-700); }
  `],
})
export class StepsComponent {
  @Input() n = 4;
  @Input() current = 0;
  @Input() clickable = false;
  @Input() labels: string[] = [];
  @Output() pick = new EventEmitter<number>();
  get dots(): number[] { return Array.from({ length: this.n }, (_, i) => i); }
}
