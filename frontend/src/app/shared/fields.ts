import { Component, EventEmitter, HostListener, Input, OnChanges, Output, SimpleChanges, inject } from '@angular/core';
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
      <div style="position:relative">
        <div class="input-prefix">
          <!-- Collapsed: flag + dial code only. A native <select> can't show the name in the list yet the
               code in the field, and its selected option is unreliable with @for — hence a custom menu. -->
          <button type="button" class="phone-cc" (click)="toggleOpen($event)" [attr.aria-expanded]="open" aria-label="Indicatif pays">
            <span style="font-size:15px;line-height:1">{{ selectedFlag }}</span>
            <span>+{{ dial }}</span>
            <span style="opacity:.55;font-size:11px">▾</span>
          </button>
          <input inputmode="tel" maxlength="18" [placeholder]="placeholder" [value]="national" (input)="onInput($event)" />
        </div>
        @if (open) {
          <div class="cc-menu" (click)="$event.stopPropagation()">
            <input class="cc-search" [placeholder]="i18n.t('cc_search')" [value]="filter"
                   (input)="filter = $any($event.target).value" autofocus />
            <div class="cc-list">
              @for (c of filteredCountries; track c.iso) {
                <button type="button" (click)="choose(c.iso)" [class.cc-active]="c.iso === country">
                  <span style="font-size:15px;line-height:1">{{ c.flag }}</span>
                  <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ c.name }}</span>
                  <span class="cc-dial">+{{ c.dial }}</span>
                </button>
              }
            </div>
          </div>
        }
      </div>
    </field>`,
})
export class PhoneFieldComponent implements OnChanges {
  i18n = inject(I18n);
  @Input() label = '';
  @Input() hint = '';
  @Input() err: string | null = null;
  @Input() value = '';
  @Input() defaultCountry: CountryCode = 'CM';
  @Output() valueChange = new EventEmitter<string>();

  countries = buildCountries(this.i18n.lang());
  country: CountryCode = 'CM';   // default: Cameroon
  national = '';
  open = false;
  filter = '';
  private lastEmitted = '';

  get dial() { return getCountryCallingCode(this.country); }
  get selectedFlag() { return flagEmoji(this.country); }
  get placeholder() { return this.country === 'CM' ? '6 99 00 00 00' : '000 000 000'; }
  get filteredCountries(): CountryOption[] {
    const q = this.filter.trim().toLowerCase();
    if (!q) return this.countries;
    return this.countries.filter((c) =>
      c.name.toLowerCase().includes(q) || c.dial.includes(q) || c.iso.toLowerCase().includes(q));
  }

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

  toggleOpen(e: Event) { e.stopPropagation(); this.open = !this.open; this.filter = ''; }
  choose(iso: string) { this.country = iso as CountryCode; this.open = false; this.filter = ''; this.emit(); }

  /** Close the menu on any click outside it (the toggle/menu stop propagation). */
  @HostListener('document:click')
  closeMenu() { this.open = false; }

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

/**
 * Expiry date input — a native date picker for a friendly calendar UX, while keeping the existing
 * {@code ddmmyyyy} digit contract used by the form (validation, payload, drafts) unchanged.
 */
@Component({
  selector: 'expiry-field',
  standalone: true,
  imports: [FieldComponent],
  template: `
    <field [label]="label" [err]="err">
      <input class="input" type="date" [value]="isoValue" [min]="minIso" (change)="onChange($event)" />
    </field>`,
})
export class ExpiryFieldComponent {
  @Input() label = '';
  @Input() err: string | null = null;
  @Input() value = ''; // ddmmyyyy digits
  @Output() valueChange = new EventEmitter<string>();

  /** Earliest selectable day = today (an ID-card expiry must be in the future). */
  get minIso(): string { return new Date().toISOString().slice(0, 10); }

  /** ddmmyyyy → yyyy-mm-dd for the native date input. */
  get isoValue(): string {
    const s = (this.value || '').replace(/\D/g, '');
    if (s.length !== 8) return '';
    return `${s.slice(4, 8)}-${s.slice(2, 4)}-${s.slice(0, 2)}`;
  }
  onChange(e: Event) {
    const iso = (e.target as HTMLInputElement).value; // yyyy-mm-dd (or '' when cleared)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) { this.value = ''; this.valueChange.emit(''); return; }
    const [yyyy, mm, dd] = iso.split('-');
    this.value = `${dd}${mm}${yyyy}`;
    this.valueChange.emit(this.value);
  }
}
