import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { I18n } from '../core/i18n';
import { AppBarComponent } from '../shared/app-bar';
import { IconComponent } from '../shared/icon';
import { QrCodeComponent } from '../shared/qr-code';

/** Stand QR screen: shows a REAL QR encoding the client subscription URL.
 *  Scanning it with a phone opens the real /client form on that phone. */
@Component({
  selector: 'page-qr',
  standalone: true,
  imports: [AppBarComponent, IconComponent, QrCodeComponent],
  template: `
  <div class="scr">
    <app-bar>
      <button appbar-left class="back-link" (click)="back()" style="margin-right:2px"><ic name="chevL" [size]="20"></ic></button>
    </app-bar>
    <div class="scr-body" style="align-items:center;text-align:center">
      <div style="width:100%">
        <div class="kicker" style="text-align:center">{{ i18n.t('card_name') }}</div>
        <h1 style="font-size:23px;margin-top:8px">{{ i18n.t('qr_title') }}</h1>
      </div>
      <div class="card" style="padding:22px;display:inline-flex;flex-direction:column;align-items:center;gap:14px;margin-top:6px">
        <div style="position:relative;padding:10px;border-radius:18px;background:var(--surface-2)">
          <qr-code [data]="clientUrl" [size]="196"></qr-code>
          <span class="corner tl"></span><span class="corner tr"></span><span class="corner bl"></span><span class="corner br"></span>
        </div>
        <div style="font-size:11px;color:var(--muted);letter-spacing:.05em;word-break:break-all;max-width:240px">
          {{ clientUrl }}
        </div>
      </div>
      <p class="muted" style="font-size:13px;line-height:1.5;max-width:300px">{{ i18n.t('qr_desc') }}</p>
      <div style="flex:1"></div>
    </div>
    <div class="scr-foot">
      <button class="btn btn-outline" (click)="openHere()"><ic name="arrowR" [size]="18"></ic> {{ i18n.t('qr_open_here') }}</button>
      <p class="muted" style="font-size:11px;text-align:center">{{ i18n.t('qr_scan_hint') }}</p>
    </div>
  </div>`,
  styles: [`
    .corner{ position:absolute; width:22px; height:22px; }
    .corner.tl{ top:0; left:0; border-top:3px solid var(--primary); border-left:3px solid var(--primary); border-top-left-radius:12px; }
    .corner.tr{ top:0; right:0; border-top:3px solid var(--primary); border-right:3px solid var(--primary); border-top-right-radius:12px; }
    .corner.bl{ bottom:0; left:0; border-bottom:3px solid var(--primary); border-left:3px solid var(--primary); border-bottom-left-radius:12px; }
    .corner.br{ bottom:0; right:0; border-bottom:3px solid var(--primary); border-right:3px solid var(--primary); border-bottom-right-radius:12px; }
  `],
})
export class QrComponent {
  i18n = inject(I18n);
  private router = inject(Router);

  /** Absolute URL of the public open path (buy a card / recharge one) — adapts to the deployed origin. */
  clientUrl = (typeof window !== 'undefined' ? window.location.origin : '') + '/start';

  back() { this.router.navigateByUrl('/login'); }
  openHere() { this.router.navigateByUrl('/start'); }
}
