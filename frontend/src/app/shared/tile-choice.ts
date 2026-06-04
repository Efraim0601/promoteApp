import { Component, EventEmitter, Input, Output } from '@angular/core';
import { IconComponent } from './icon';

export interface TileOption {
  id: string;
  title: string;
  desc?: string;
  meta?: string;
  icon?: string;      // short text (e.g. "OM", "MTN", "₣")
  bg?: string;
  color?: string;
}

/** Selectable option tiles (payment methods, etc.), ported from components.jsx TileChoice. */
@Component({
  selector: 'tile-choice',
  standalone: true,
  imports: [IconComponent],
  template: `
    <div style="display:flex;flex-direction:column;gap:10px">
      @for (o of options; track o.id) {
        <button type="button" class="tile" [class.sel]="value === o.id" (click)="valueChange.emit(o.id)">
          <span class="tile-ic" [style.background]="o.color ? o.bg : null" [style.color]="o.color || null">{{ o.icon }}</span>
          <span style="min-width:0;flex:1;text-align:left">
            <span class="tile-title">{{ o.title }}</span>
            @if (o.desc) { <span class="tile-desc">{{ o.desc }}</span> }
          </span>
          @if (o.meta) { <span class="tile-meta">{{ o.meta }}</span> }
          <span class="tile-check"><ic name="check" [size]="16" [sw]="2.6"></ic></span>
        </button>
      }
    </div>`,
})
export class TileChoiceComponent {
  @Input() options: TileOption[] = [];
  @Input() value = '';
  @Output() valueChange = new EventEmitter<string>();
}
