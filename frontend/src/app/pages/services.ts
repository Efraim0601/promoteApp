import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { I18n } from '../core/i18n';
import { AppBarComponent } from '../shared/app-bar';
import { IconComponent } from '../shared/icon';
import { PromoteCardComponent } from '../shared/promote-card';

/**
 * Public landing for the open path: lets anyone choose between buying a Promote card (the existing
 * subscription flow) and topping up an existing prepaid card (the recharge flow).
 */
@Component({
  selector: 'page-services',
  standalone: true,
  imports: [AppBarComponent, IconComponent, PromoteCardComponent],
  template: `
  <div class="scr">
    <app-bar><span appbar-right class="badge" style="background:var(--surface-2);color:var(--muted)">{{ i18n.t('badge_self') }}</span></app-bar>
    <div class="scr-body">
      <div style="display:flex;flex-direction:column;gap:16px">
        <div class="kicker">{{ i18n.t('home_kicker') }}</div>
        <promote-card></promote-card>
        <div>
          <h1 style="font-size:23px">{{ i18n.t('services_title') }}</h1>
          <p class="muted" style="font-size:13.5px;line-height:1.55;margin-top:8px">{{ i18n.t('services_sub') }}</p>
        </div>

        <button class="svc-card" (click)="buy()">
          <span class="svc-ic" style="background:var(--primary);color:#fff"><ic name="idcard" [size]="24"></ic></span>
          <span class="svc-txt">
            <span class="svc-title">{{ i18n.t('svc_buy_title') }}</span>
            <span class="svc-desc">{{ i18n.t('svc_buy_desc') }}</span>
          </span>
          <ic name="arrowR" [size]="20" style="color:var(--muted)"></ic>
        </button>

        <button class="svc-card" (click)="recharge()">
          <span class="svc-ic" style="background:var(--af-gold);color:#5a4200"><ic name="phone" [size]="24"></ic></span>
          <span class="svc-txt">
            <span class="svc-title">{{ i18n.t('svc_recharge_title') }}</span>
            <span class="svc-desc">{{ i18n.t('svc_recharge_desc') }}</span>
          </span>
          <ic name="arrowR" [size]="20" style="color:var(--muted)"></ic>
        </button>
      </div>
    </div>
  </div>`,
  styles: [`
    .svc-card { display:flex; align-items:center; gap:14px; width:100%; text-align:left;
      padding:16px; border:1px solid var(--border); border-radius:var(--radius); background:var(--surface);
      cursor:pointer; transition:border-color .15s, transform .05s; }
    .svc-card:hover { border-color:var(--primary); }
    .svc-card:active { transform:scale(.99); }
    .svc-ic { width:48px; height:48px; border-radius:14px; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
    .svc-txt { display:flex; flex-direction:column; gap:3px; min-width:0; flex:1; }
    .svc-title { font-size:15.5px; font-weight:800; }
    .svc-desc { font-size:12.5px; color:var(--muted); line-height:1.4; }
  `],
})
export class ServicesComponent {
  i18n = inject(I18n);
  private router = inject(Router);

  buy() { this.router.navigateByUrl('/client'); }
  recharge() { this.router.navigateByUrl('/recharge'); }
}
