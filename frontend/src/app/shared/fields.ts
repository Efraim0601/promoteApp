import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, inject } from '@angular/core';
import { CountryCode, getCountries, getCountryCallingCode, parsePhoneNumberFromString } from 'libphonenumber-js';
import { IconComponent } from './icon';
import { I18n } from '../core/i18n';

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

/** ISO flag emoji from a 2-letter country code (regional-indicator symbols). */
const flagEmoji = (iso: string) =>
  iso.toUpperCase().replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)));

interface CountryOption { iso: CountryCode; name: string; dial: string; flag: string; }

/** Build the country list (flag · localized name · dial code), sorted by name. */
function buildCountries(lang: string): CountryOption[] {
  let namer: Intl.DisplayNames | null = null;
  try { namer = new Intl.DisplayNames([lang], { type: 'region' }); } catch { namer = null; }
  return getCountries()
    .map((iso) => ({ iso, dial: getCountryCallingCode(iso), flag: flagEmoji(iso), name: namer?.of(iso) ?? iso }))
    .sort((a, b) => a.name.localeCompare(b.name, lang));
}

/**
 * International phone input: a country selector (flag + dial code) plus the national number.
 * Emits the full E.164 string (e.g. "+237699000000"); validity per country is enforced by the
 * parent via libphonenumber-js. Parses an incoming E.164 value back into country + national so
 * drafts round-trip. Defaults to Cameroon.
 */
@Component({
  selector: 'phone-field',
  standalone: true,
  imports: [FieldComponent],
  template: `
    <field [label]="label" [hint]="hint" [err]="err">
      <div class="input-prefix">
        <select class="phone-cc" [value]="country" (change)="onCountry($any($event.target).value)" aria-label="Indicatif pays">
          @for (c of countries; track c.iso) { <option [value]="c.iso">{{ c.flag }} +{{ c.dial }}</option> }
        </select>
        <input inputmode="tel" maxlength="18" [placeholder]="placeholder" [value]="national"
               (input)="onInput($event)" />
      </div>
    </field>`,
})
export class PhoneFieldComponent implements OnChanges {
  private i18n = inject(I18n);
  @Input() label = '';
  @Input() hint = '';
  @Input() err: string | null = null;
  @Input() value = '';
  @Input() defaultCountry: CountryCode = 'CM';
  @Output() valueChange = new EventEmitter<string>();

  countries = buildCountries(this.i18n.lang());
  country: CountryCode = 'CM';
  national = '';
  private lastEmitted = '';

  get placeholder() { return this.country === 'CM' ? '6 99 00 00 00' : '000 000 000'; }

  ngOnChanges(ch: SimpleChanges) {
    if (ch['defaultCountry'] && !this.value) this.country = this.defaultCountry;
    // Only re-parse external value changes, never our own emissions (avoids clobbering typing).
    if (ch['value'] && this.value !== this.lastEmitted) this.parse(this.value);
  }

  private parse(v: string) {
    if (!v) { this.national = ''; return; }
    const p = parsePhoneNumberFromString(v);
    if (p) { if (p.country) this.country = p.country; this.national = p.nationalNumber as string; }
    else { this.national = v.replace(/\D/g, ''); }  // legacy national-only drafts
  }

  onCountry(iso: string) { this.country = iso as CountryCode; this.emit(); }

  onInput(e: Event) {
    this.national = (e.target as HTMLInputElement).value.replace(/\D/g, '');
    this.emit();
  }

  private emit() {
    const v = this.national ? '+' + getCountryCallingCode(this.country) + this.national : '';
    this.lastEmitted = v;
    this.value = v;
    this.valueChange.emit(v);
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
