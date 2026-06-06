import { Component, OnInit, inject, signal } from '@angular/core';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';
import { I18n } from '../core/i18n';
import { Api } from '../core/api';
import { Auth } from '../core/auth';
import { Subscription } from '../core/models';
import { payById, recordStatus } from '../shared/constants';
import { AppBarComponent } from '../shared/app-bar';
import { IconComponent } from '../shared/icon';
import { FieldComponent } from '../shared/fields';
import { StatusBadgeComponent } from '../shared/status-badge';

/** Print point — retrieve a KYC file by reference, then print & hand over the card. */
@Component({
  selector: 'page-print-point',
  standalone: true,
  imports: [AppBarComponent, IconComponent, FieldComponent, StatusBadgeComponent],
  template: `
  <div class="scr">
    <app-bar>
      <button appbar-left class="back-link" (click)="exit()" style="margin-right:2px"><ic name="chevL" [size]="20"></ic></button>
      <span appbar-right class="badge" style="background:var(--surface-2);color:var(--muted)"><ic name="printer" [size]="13"></ic> {{ i18n.t('pp_title') }}</span>
    </app-bar>
    <div class="scr-body">
      <div>
        <div class="kicker"><ic name="printer" [size]="13" style="vertical-align:-2px;margin-right:4px"></ic>{{ i18n.t('card_name') }}</div>
        <h1 style="font-size:23px;margin-top:6px">{{ i18n.t('pp_title') }}</h1>
        <p class="muted" style="font-size:13px;margin-top:5px">{{ i18n.t('pp_sub') }}</p>
      </div>

      <field [label]="i18n.t('pp_input')">
        <div style="display:flex;gap:8px">
          <div class="input-prefix" style="flex:1">
            <span class="pfx"><ic name="search" [size]="16"></ic></span>
            <input [placeholder]="i18n.t('pp_search_ph')" [value]="ref()" style="letter-spacing:.02em;font-weight:600"
                   (input)="onRef($event)" (keydown.enter)="doSearch()" />
          </div>
          <button class="btn btn-primary" (click)="doSearch()" style="width:auto;padding:0 16px"><ic name="search" [size]="18"></ic></button>
        </div>
      </field>

      @if (!rec() && results().length) {
        <div class="card" style="overflow:hidden">
          <div class="muted" style="padding:10px 14px;border-bottom:1px solid var(--border);font-size:11.5px">{{ results().length }} {{ i18n.t('pp_results') }}</div>
          @for (s of results(); track s.ref) {
            <button (click)="open(s.ref)" style="width:100%;text-align:left;display:flex;align-items:center;gap:10px;padding:12px 14px;border:none;border-bottom:1px solid var(--border);background:transparent;cursor:pointer">
              <div style="min-width:0;flex:1">
                <div style="font-size:14px;font-weight:700">{{ s.fullName }}</div>
                <div class="muted" style="font-size:11.5px">{{ s.ref }} · {{ s.phone }}</div>
              </div>
              <status-badge [status]="status(s)"></status-badge>
              <ic name="chevR" [size]="16" style="color:var(--muted);flex-shrink:0"></ic>
            </button>
          }
        </div>
      }

      @if (!searched()) {
        <div class="card" style="padding:14px;display:flex;gap:9px;align-items:center">
          <ic name="hash" [size]="17" style="color:var(--muted);flex-shrink:0"></ic>
          <span class="muted" style="font-size:12px;line-height:1.4">{{ i18n.t('pp_hint') }}</span>
        </div>
      }

      @if (searched() && !rec() && !loading() && !results().length) {
        <div class="card" style="padding:18px;display:flex;flex-direction:column;align-items:center;gap:10px;text-align:center">
          <span style="width:48px;height:48px;border-radius:50%;background:var(--accent-soft);color:var(--accent);display:flex;align-items:center;justify-content:center"><ic name="alert" [size]="24"></ic></span>
          <p style="font-size:13.5px;font-weight:700">{{ i18n.t('pp_notfound') }}</p>
          <button class="btn btn-ghost" (click)="again()" style="width:auto;padding:9px 14px;font-size:13px">{{ i18n.t('pp_again') }}</button>
        </div>
      }

      @if (rec(); as r) {
        @if (r.printed) {
          <div class="card" style="padding:20px;display:flex;flex-direction:column;align-items:center;gap:12px;text-align:center">
            <span style="width:64px;height:64px;border-radius:50%;background:var(--success);color:#fff;display:flex;align-items:center;justify-content:center;animation:pop .45s cubic-bezier(.2,.8,.3,1.2)"><ic name="check" [size]="32" [sw]="2.5"></ic></span>
            <h2 style="font-size:18px">{{ i18n.t('pp_printed_ok') }}</h2>
            <div style="font-weight:800;letter-spacing:.06em;white-space:nowrap">{{ r.ref }}</div>
          </div>
        } @else {
          <div class="card" style="overflow:hidden">
            <div style="padding:13px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:8px">
              <ic name="idcard" [size]="17" style="color:var(--primary)"></ic>
              <h3 style="font-size:15px">{{ i18n.t('pp_record') }}</h3>
              <span style="margin-left:auto"><status-badge [status]="status(r)"></status-badge></span>
            </div>
            <div style="padding:16px;display:flex;gap:14px">
              <div style="width:78px;height:78px;border-radius:14px;overflow:hidden;flex-shrink:0;position:relative;box-shadow:var(--shadow)">
                @if (selfieUrl()) {
                  <img [src]="selfieUrl()" alt="selfie" style="width:78px;height:78px;object-fit:cover" />
                } @else {
                  <svg viewBox="0 0 78 78" width="78" height="78"><rect width="78" height="78" fill="#cfe6da"/><circle cx="39" cy="31" r="16" fill="#5b7d6f"/><path d="M14 78 q0 -22 25 -22 q25 0 25 22z" fill="#5b7d6f"/></svg>
                }
                <span style="position:absolute;right:3px;bottom:3px;width:20px;height:20px;border-radius:50%;background:var(--success);color:#fff;display:flex;align-items:center;justify-content:center"><ic name="check" [size]="13" [sw]="3"></ic></span>
              </div>
              <div style="min-width:0;flex:1">
                <div style="font-size:16px;font-weight:800">{{ r.fullName }}</div>
                <div class="muted" style="font-size:12px;margin-top:3px">{{ i18n.t('cni_short') }} {{ r.cni }} · {{ i18n.t('validity') }} {{ r.cniExp }}</div>
                <div class="muted" style="font-size:12px;margin-top:2px">{{ r.phone }}</div>
                <div style="display:inline-flex;align-items:center;gap:6px;margin-top:7px;font-size:11.5px;color:var(--success);font-weight:700"><ic name="check" [size]="14" [sw]="2.6"></ic> {{ i18n.t('pp_selfie_ok') }}</div>
              </div>
            </div>
            @if (rectoUrl() || versoUrl()) {
              <div style="padding:0 16px 12px;display:flex;gap:10px">
                @if (rectoUrl()) {
                  <div style="flex:1;text-align:center">
                    <img [src]="rectoUrl()" alt="CNI recto" style="width:100%;height:84px;object-fit:cover;border-radius:8px;border:1px solid var(--border)" />
                    <div class="muted" style="font-size:10.5px;margin-top:3px">{{ i18n.t('pp_cni_recto') }}</div>
                  </div>
                }
                @if (versoUrl()) {
                  <div style="flex:1;text-align:center">
                    <img [src]="versoUrl()" alt="CNI verso" style="width:100%;height:84px;object-fit:cover;border-radius:8px;border:1px solid var(--border)" />
                    <div class="muted" style="font-size:10.5px;margin-top:3px">{{ i18n.t('pp_cni_verso') }}</div>
                  </div>
                }
              </div>
            }
            <div style="padding:0 16px 6px">
              <div class="srow"><span class="lbl">{{ i18n.t('pay_method_label') }}</span><span class="val" style="display:inline-flex;align-items:center;gap:7px"><span class="op-logo" [style.background]="pm(r).bg" [style.color]="pm(r).fg" style="width:22px;height:22px;font-size:9px;border-radius:6px">{{ pm(r).short }}</span>{{ r.pay === 'cash' ? i18n.t('pay_cash_name') : pm(r).name }}</span></div>
              <div class="srow"><span class="lbl">{{ i18n.t('delivery_label') }}</span><span class="val">{{ i18n.t('del_' + r.delivery + '_title') }}</span></div>
              @if (r.payStatus === 'cash') {
                <div class="srow total"><span class="lbl">{{ i18n.t('pp_to_collect') }}</span><span class="val" style="color:var(--accent)">{{ i18n.money(r.amount) }}</span></div>
              } @else {
                <div class="srow total"><span class="lbl">{{ i18n.t('amount_paid') }}</span><span class="val">{{ i18n.money(r.amount) }}</span></div>
              }
            </div>
          </div>
        }
      }
      <div style="flex:1"></div>
    </div>

    @if (rec(); as r) {
      @if (!r.printed) {
        <div class="scr-foot">
          <button class="btn btn-primary" (click)="doPrint(r.ref)"><ic name="printer" [size]="18"></ic> {{ i18n.t('pp_print') }}</button>
          <button class="btn btn-ghost" (click)="again()" style="font-size:13px">{{ i18n.t('pp_again') }}</button>
        </div>
      } @else {
        <div class="scr-foot"><button class="btn btn-ghost" (click)="again()">{{ i18n.t('pp_again') }}</button></div>
      }
    }
  </div>`,
})
export class PrintPointComponent implements OnInit {
  i18n = inject(I18n);
  auth = inject(Auth);
  private api = inject(Api);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private sanitizer = inject(DomSanitizer);

  ref = signal('');
  searched = signal(false);
  loading = signal(false);
  results = signal<Subscription[]>([]);
  rec = signal<Subscription | null>(null);
  selfieUrl = signal<SafeUrl | null>(null);
  rectoUrl = signal<SafeUrl | null>(null);
  versoUrl = signal<SafeUrl | null>(null);
  private objectUrls: string[] = [];

  pm = (r: Subscription) => payById(r.pay);
  status = (r: Subscription) => recordStatus(r);

  ngOnInit() {
    const prefill = this.route.snapshot.queryParamMap.get('ref');
    if (prefill) { this.ref.set(prefill.toUpperCase()); this.open(prefill); }
  }

  onRef(e: Event) {
    // Accept reference, name or phone: letters, digits, spaces, + and -.
    this.ref.set((e.target as HTMLInputElement).value.replace(/[^a-zA-Z0-9 +-]/g, '').slice(0, 40));
  }

  /** Search by reference, name or phone. One match opens directly; several show a list. */
  doSearch() {
    const q = this.ref().trim();
    if (!q) return;
    this.searched.set(true); this.loading.set(true); this.clearSelfie(); this.rec.set(null); this.results.set([]);
    this.api.searchSubscriptions(q).subscribe({
      next: (list) => {
        this.loading.set(false);
        if (list.length === 1) this.open(list[0].ref);
        else this.results.set(list);
      },
      error: () => { this.loading.set(false); this.results.set([]); },
    });
  }

  /** Load the full record (incl. images) for a chosen reference. */
  open(ref: string) {
    this.searched.set(true); this.loading.set(true); this.results.set([]); this.clearSelfie(); this.rec.set(null);
    this.api.byRef(ref).subscribe({
      next: (s) => { this.setRecord(s); this.loading.set(false); },
      error: () => { this.rec.set(null); this.loading.set(false); },
    });
  }
  again() { this.ref.set(''); this.searched.set(false); this.rec.set(null); this.results.set([]); this.clearSelfie(); }
  doPrint(ref: string) {
    this.api.print(ref).subscribe((s) => this.rec.set(s));
  }

  private setRecord(s: Subscription) {
    this.rec.set(s);
    if (s.hasSelfie) this.loadImage(s.ref, 'selfie', this.selfieUrl);
    if (s.hasCniRecto) this.loadImage(s.ref, 'cni-recto', this.rectoUrl);
    if (s.hasCniVerso) this.loadImage(s.ref, 'cni-verso', this.versoUrl);
  }
  private loadImage(ref: string, kind: string, target: { set: (v: SafeUrl | null) => void }) {
    this.api.imageBlob(ref, kind).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        this.objectUrls.push(url);
        target.set(this.sanitizer.bypassSecurityTrustUrl(url));
      },
      error: () => target.set(null),
    });
  }
  private clearSelfie() {
    this.objectUrls.forEach((u) => URL.revokeObjectURL(u));
    this.objectUrls = [];
    this.selfieUrl.set(null); this.rectoUrl.set(null); this.versoUrl.set(null);
  }
  exit() { this.router.navigateByUrl(this.auth.landingPath()); }
}
