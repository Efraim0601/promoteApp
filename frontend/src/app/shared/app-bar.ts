import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { I18n } from '../core/i18n';
import { Auth } from '../core/auth';
import { IconComponent } from './icon';

/** Brand header with the Afriland logo, card name and language toggle.
 *  Optional projected content: [appbar-left] and [appbar-right] slots. */
@Component({
  selector: 'app-bar',
  standalone: true,
  imports: [IconComponent],
  template: `
    <div class="appbar">
      <ng-content select="[appbar-left]"></ng-content>
      <button type="button" class="brand" (click)="home()" [title]="i18n.t('home_btn')" [attr.aria-label]="i18n.t('home_btn')"
              style="background:none;border:none;padding:0;margin:0;cursor:pointer;font:inherit;color:inherit;text-align:left">
        <img src="assets/main_logo.svg" alt="Carte Promote" class="brand-logo" />
        <span class="brand-sep" aria-hidden="true"></span>
        <div class="brand-sub">{{ i18n.t('brand_tagline') }}</div>
      </button>
      <ng-content select="[appbar-right]"></ng-content>
      @if (auth.isStaff()) {
        <button class="icon-btn" (click)="changePassword()" [title]="i18n.t('change_pw')" aria-label="change password">
          <ic name="lock" [size]="15" [sw]="2"></ic>
        </button>
      }
      <button class="icon-btn" (click)="i18n.toggle()" aria-label="language">
        <ic name="globe" [size]="15" [sw]="2"></ic>
        {{ i18n.lang() === 'fr' ? 'EN' : 'FR' }}
      </button>
    </div>`,
})
export class AppBarComponent {
  i18n = inject(I18n);
  auth = inject(Auth);
  private router = inject(Router);

  changePassword() {
    this.router.navigateByUrl('/change-password');
  }

  /** Clicking the logo returns to the main page: the staff member's landing page when logged in,
   *  otherwise the public start page. */
  home() {
    this.router.navigateByUrl(this.auth.isStaff() ? this.auth.landingPath() : '/start');
  }
}
