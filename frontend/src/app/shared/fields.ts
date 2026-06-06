import { Component, EventEmitter, Input, Output } from '@angular/core';
import { IconComponent } from './icon';

/** Labelled field wrapper with optional hint / error line. */
@Component({
  selector: 'field',
  standalone: true,
  template: `
    <div class="field">
      @if (label) { <label>{{ label }}</label> }
      <ng-content></ng-content>
      @if (err) { <div class="err">{{ err }}</div> }
      @else if (hint) { <div class="hint">{{ hint }}</div> }
    </div>`,
})
export class FieldComponent {
  @Input() label = '';
  @Input() hint = '';
  @Input() err: string | null = null;
}

/** Cameroon phone input (+237, 9 digits starting with 6). */
@Component({
  selector: 'phone-field',
  standalone: true,
  imports: [FieldComponent],
  template: `
    <field [label]="label" [hint]="hint" [err]="err">
      <div class="input-prefix">
        <span class="pfx">🇨🇲 +237</span>
        <input inputmode="tel" maxlength="12" placeholder="6 99 00 00 00" [value]="value"
               (input)="onInput($event)" />
      </div>
    </field>`,
})
export class PhoneFieldComponent {
  @Input() label = '';
  @Input() hint = '';
  @Input() err: string | null = null;
  @Input() value = '';
  @Output() valueChange = new EventEmitter<string>();
  /** Cameroon mobile = fixed 9 digits starting with 6. Normalises pasted
   *  "+237…"/"237…" forms and caps at 9 digits. */
  onInput(e: Event) {
    let d = (e.target as HTMLInputElement).value.replace(/\D/g, '');
    if (d.startsWith('237')) d = d.slice(3);
    d = d.slice(0, 9);
    this.value = d;
    this.valueChange.emit(d);
  }
}

/** ID-card (CNI) number input. */
@Component({
  selector: 'cni-field',
  standalone: true,
  imports: [FieldComponent, IconComponent],
  template: `
    <field [label]="label" [hint]="hint" [err]="err">
      <div class="input-prefix">
        <span class="pfx"><ic name="idcard" [size]="17"></ic></span>
        <input inputmode="text" autocapitalize="characters" placeholder="1A2B3C4D" style="text-transform:uppercase"
               [value]="value" (input)="onInput($event)" />
      </div>
    </field>`,
})
export class CniFieldComponent {
  @Input() label = '';
  @Input() hint = '';
  @Input() err: string | null = null;
  @Input() value = '';
  @Output() valueChange = new EventEmitter<string>();
  onInput(e: Event) {
    // CNI number is hexadecimal: keep only 0-9 / A-F, upper-cased.
    const v = (e.target as HTMLInputElement).value.replace(/[^0-9a-fA-F]/g, '').toUpperCase().slice(0, 12);
    this.value = v;
    this.valueChange.emit(v);
  }
}

/** Expiry date input — stores ddmmyyyy digits, displays JJ/MM/AAAA. */
@Component({
  selector: 'expiry-field',
  standalone: true,
  imports: [FieldComponent, IconComponent],
  template: `
    <field [label]="label" [err]="err">
      <div class="input-prefix">
        <span class="pfx"><ic name="calendar" [size]="17"></ic></span>
        <input inputmode="numeric" placeholder="JJ / MM / AAAA" [value]="display" (input)="onInput($event)" />
      </div>
    </field>`,
})
export class ExpiryFieldComponent {
  @Input() label = '';
  @Input() err: string | null = null;
  @Input() value = ''; // ddmmyyyy digits
  @Output() valueChange = new EventEmitter<string>();

  get display(): string {
    const s = this.value.replace(/\D/g, '').slice(0, 8);
    let out = s.slice(0, 2);
    if (s.length > 2) out += '/' + s.slice(2, 4);
    if (s.length > 4) out += '/' + s.slice(4, 8);
    return out;
  }
  onInput(e: Event) {
    const v = (e.target as HTMLInputElement).value.replace(/\D/g, '').slice(0, 8);
    this.value = v;
    this.valueChange.emit(v);
  }
}
