import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { I18n } from '../core/i18n';
import { Api } from '../core/api';
import { Auth } from '../core/auth';
import { Collecte, CreateCollecteRequest } from '../core/models';
import { COLLECTE_PRODUCTS, CARD_TYPES } from '../shared/constants';
import { AppBarComponent } from '../shared/app-bar';
import { IconComponent } from '../shared/icon';
import { FieldComponent } from '../shared/fields';
import { TileChoiceComponent, TileOption } from '../shared/tile-choice';
import { SpinnerComponent } from '../shared/spinner';

interface CForm {
  product: string; clientNom: string; clientPhone: string;
  cniNumber: string; accountNumber: string;
  cardPrefix: string; cardSuffix: string; cardType: string;
}
const EMPTY: CForm = { product: '', clientNom: '', clientPhone: '', cniNumber: '', accountNumber: '', cardPrefix: '', cardSuffix: '', cardType: '' };

/**
 * Collecteur portal: capture bank-product sales (collectes) and manage one's own — the native
 * replacement for the KoboToolbox "Questionnaire 4". The client fields shown depend on the product.
 */
@Component({
  selector: 'page-collecte',
  standalone: true,
  imports: [AppBarComponent, IconComponent, FieldComponent, TileChoiceComponent, SpinnerComponent],
  template: `
  <div class="scr">
    <app-bar>
      <button appbar-right class="icon-btn" (click)="auth.logout()" [title]="i18n.t('logout')"><ic name="logout" [size]="15" [sw]="2"></ic></button>
    </app-bar>
    <div class="scr-body">
      <div class="kicker">{{ i18n.t('col_kicker') }}</div>
      <h1 style="font-size:21px;margin:2px 0 2px">{{ editingRef() ? i18n.t('col_edit_title') : i18n.t('col_new_title') }}</h1>
      <p class="muted" style="font-size:12.5px;line-height:1.5;margin-bottom:14px">{{ i18n.t('col_sub') }}</p>

      <!-- Product -->
      <div style="font-size:13px;font-weight:700;margin-bottom:8px">{{ i18n.t('col_product_label') }}</div>
      <tile-choice [options]="productTiles" [value]="form().product" (valueChange)="setProduct($event)"></tile-choice>
      @if (touched() && !form().product) { <div class="err" style="margin-top:6px;font-weight:700">{{ i18n.t('required') }}</div> }

      @if (form().product) {
        <div style="display:flex;flex-direction:column;gap:12px;margin-top:16px">
          <field [label]="i18n.t('col_client_nom')" [err]="touched() && !form().clientNom.trim() ? i18n.t('required') : null">
            <div class="input-prefix"><span class="pfx"><ic name="user" [size]="17"></ic></span>
              <input [value]="form().clientNom" (input)="set('clientNom', $any($event.target).value)" [placeholder]="i18n.t('col_client_nom_ph')" />
            </div>
          </field>

          @if (form().product === 'compte_ouvert' || form().product === 'e_first') {
            <field [label]="i18n.t('col_cni')" [err]="touched() && !form().cniNumber.trim() ? i18n.t('required') : null">
              <div class="input-prefix"><span class="pfx"><ic name="idcard" [size]="17"></ic></span>
                <input [value]="form().cniNumber" (input)="set('cniNumber', $any($event.target).value)" [placeholder]="i18n.t('col_cni_ph')" />
              </div>
            </field>
          }

          @if (form().product === 'carte_bancaire') {
            <field [label]="i18n.t('col_card_number')">
              <div style="display:flex;align-items:center;gap:6px;padding:0 12px">
                <ic name="idcard" [size]="17" style="color:var(--muted);flex-shrink:0"></ic>
                <input #cPfx inputmode="numeric" maxlength="4" placeholder="XXXX" [value]="form().cardPrefix"
                       (input)="set('cardPrefix', $any($event.target).value.replace(/\D/g,'').slice(0,4)); if(form().cardPrefix.length===4) cSfx.focus()"
                       style="width:52px;text-align:center;letter-spacing:.1em;border:none;outline:none;background:transparent;font-size:15px;font-weight:600;padding:12px 0" />
                <span style="color:var(--muted);letter-spacing:.1em;font-size:15px;font-weight:600;user-select:none">**** ****</span>
                <input #cSfx inputmode="numeric" maxlength="4" placeholder="XXXX" [value]="form().cardSuffix"
                       (input)="set('cardSuffix', $any($event.target).value.replace(/\D/g,'').slice(0,4))"
                       style="width:52px;text-align:center;letter-spacing:.1em;border:none;outline:none;background:transparent;font-size:15px;font-weight:600;padding:12px 0" />
              </div>
            </field>
            <field [label]="i18n.t('col_card_type')" [err]="touched() && !form().cardType ? i18n.t('required') : null">
              <div class="input-prefix"><span class="pfx"><ic name="idcard" [size]="17"></ic></span>
                <select [value]="form().cardType" (change)="set('cardType', $any($event.target).value)">
                  <option value="" disabled>{{ i18n.t('col_card_type_ph') }}</option>
                  @for (t of cardTypes; track t) { <option [value]="t">{{ i18n.t('ct_' + t) }}</option> }
                </select>
              </div>
            </field>
          }

          <field [label]="i18n.t('col_client_phone')" [err]="touched() && !form().clientPhone.trim() ? i18n.t('required') : null">
            <div class="input-prefix"><span class="pfx"><ic name="phone" [size]="17"></ic></span>
              <input inputmode="tel" [value]="form().clientPhone" (input)="set('clientPhone', $any($event.target).value)" [placeholder]="i18n.t('col_client_phone_ph')" />
            </div>
          </field>
        </div>
      }

      @if (msg()) { <div class="card" style="margin-top:12px;padding:10px 12px;background:color-mix(in srgb, var(--success) 14%, transparent);color:var(--success);font-size:12.5px;font-weight:700"><ic name="check" [size]="15" style="vertical-align:-2px"></ic> {{ msg() }}</div> }
      @if (err()) { <p class="err" style="margin-top:10px;text-align:center;font-weight:700">{{ err() }}</p> }

      <div style="display:flex;gap:8px;margin-top:16px">
        <button class="btn btn-primary" (click)="submit()" [disabled]="busy()" style="flex:1;padding:12px">
          @if (busy()) { <spinner></spinner> } @else { <ic name="check" [size]="17"></ic> {{ editingRef() ? i18n.t('col_save') : i18n.t('col_submit') }} }
        </button>
        @if (editingRef()) { <button class="btn btn-ghost" (click)="resetForm()" [disabled]="busy()" style="padding:12px">{{ i18n.t('cancel_short') }}</button> }
      </div>

      <!-- My collectes -->
      <div class="kicker" style="margin-top:24px;margin-bottom:6px">{{ i18n.t('col_mine') }} · {{ mine().length }}</div>
      @if (loading()) {
        <div class="load-center"><spinner tone="primary"></spinner></div>
      } @else if (!mine().length) {
        <p class="muted" style="font-size:12.5px">{{ i18n.t('col_empty') }}</p>
      } @else {
        <div class="card" style="padding:2px 0;overflow:hidden">
          @for (c of mine(); track c.ref) {
            <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;border-top:1px solid var(--border)">
              <div style="min-width:0;flex:1">
                <div style="font-size:13px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{ c.clientNom || '—' }} <span class="muted" style="font-weight:500;font-size:11px">· {{ i18n.t('prod_' + c.product) }}</span></div>
                <div class="muted" style="font-size:11px">{{ c.clientPhone || '—' }} · {{ c.ref }} · {{ date(c.createdAt) }}</div>
              </div>
              <button class="icon-btn" (click)="edit(c)" [title]="i18n.t('edit')" style="flex-shrink:0"><ic name="pencil" [size]="15"></ic></button>
              <button class="icon-btn" (click)="remove(c)" [title]="i18n.t('delete')" [disabled]="busy()" style="flex-shrink:0;color:var(--accent)"><ic name="trash" [size]="15"></ic></button>
            </div>
          }
        </div>
      }
    </div>
  </div>`,
})
export class CollecteComponent implements OnInit {
  i18n = inject(I18n);
  auth = inject(Auth);
  private api = inject(Api);
  private router = inject(Router);

  readonly cardTypes = CARD_TYPES;
  form = signal<CForm>({ ...EMPTY });
  editingRef = signal<string | null>(null);
  touched = signal(false);
  busy = signal(false);
  msg = signal('');
  err = signal('');
  mine = signal<Collecte[]>([]);
  loading = signal(true);

  get productTiles(): TileOption[] {
    const icons: Record<string, string> = { compte_ouvert: '◉', carte_bancaire: '▣', sara_money: '₣', e_first: '★' };
    return COLLECTE_PRODUCTS.map((p) => ({
      id: p, icon: icons[p] ?? '•', bg: 'var(--primary)', color: '#fff',
      title: this.i18n.t('prod_' + p), desc: this.i18n.t('prod_' + p + '_desc'),
    }));
  }

  ngOnInit() { this.load(); }

  private load() {
    this.loading.set(true);
    this.api.myCollectes().subscribe({ next: (c) => { this.mine.set(c); this.loading.set(false); }, error: () => this.loading.set(false) });
  }

  set<K extends keyof CForm>(k: K, v: CForm[K]) { this.form.update((f) => ({ ...f, [k]: v })); this.msg.set(''); }
  setProduct(p: string) { this.form.update((f) => ({ ...f, product: p })); this.msg.set(''); }

  resetForm() { this.form.set({ ...EMPTY }); this.editingRef.set(null); this.touched.set(false); this.err.set(''); }

  private valid(): boolean {
    const f = this.form();
    if (!f.product || !f.clientNom.trim() || !f.clientPhone.trim()) return false;
    if ((f.product === 'compte_ouvert' || f.product === 'e_first') && !f.cniNumber.trim()) return false;
    if (f.product === 'carte_bancaire' && !f.cardType) return false;
    return true;
  }

  private payload(): CreateCollecteRequest {
    const f = this.form();
    return {
      product: f.product,
      clientNom: f.clientNom.trim(),
      clientPhone: f.clientPhone.trim(),
      cniNumber: (f.product === 'compte_ouvert' || f.product === 'e_first') ? f.cniNumber.trim() : undefined,
      cardNumber: f.product === 'carte_bancaire' && f.cardPrefix && f.cardSuffix
        ? `${f.cardPrefix} **** **** ${f.cardSuffix}` : undefined,
      cardType: f.product === 'carte_bancaire' ? f.cardType : undefined,
    };
  }

  submit() {
    this.touched.set(true);
    this.err.set('');
    if (!this.valid() || this.busy()) return;
    this.busy.set(true);
    const ref = this.editingRef();
    const obs = ref ? this.api.updateCollecte(ref, this.payload()) : this.api.createCollecte(this.payload());
    obs.subscribe({
      next: () => { this.busy.set(false); this.msg.set(this.i18n.t(ref ? 'col_saved' : 'col_created')); this.resetForm(); this.load(); },
      error: () => { this.busy.set(false); this.err.set(this.i18n.t('col_error')); },
    });
  }

  edit(c: Collecte) {
    this.editingRef.set(c.ref);
    const d = (c.cardNumber ?? '').replace(/\D/g, '');
    this.form.set({
      product: c.product, clientNom: c.clientNom ?? '', clientPhone: c.clientPhone ?? '',
      cniNumber: c.cniNumber ?? '', accountNumber: c.accountNumber ?? '',
      cardPrefix: d.slice(0, 4), cardSuffix: d.length >= 8 ? d.slice(-4) : '',
      cardType: c.cardType ?? '',
    });
    this.touched.set(false); this.msg.set(''); this.err.set('');
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  remove(c: Collecte) {
    if (this.busy() || !confirm(this.i18n.t('col_delete_confirm'))) return;
    this.busy.set(true);
    this.api.deleteCollecte(c.ref).subscribe({
      next: () => { this.busy.set(false); if (this.editingRef() === c.ref) this.resetForm(); this.load(); },
      error: () => { this.busy.set(false); this.err.set(this.i18n.t('col_error')); },
    });
  }

  date(iso: string) { try { return new Date(iso).toLocaleDateString(this.i18n.lang() === 'fr' ? 'fr-FR' : 'en-GB'); } catch { return iso; } }
}
