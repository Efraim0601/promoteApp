import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { I18n } from '../core/i18n';
import { Auth } from '../core/auth';
import { AppBarComponent } from '../shared/app-bar';
import { IconComponent } from '../shared/icon';
import { FieldComponent } from '../shared/fields';

@Component({
  selector: 'page-login',
  standalone: true,
  imports: [AppBarComponent, IconComponent, FieldComponent],
  template: `
  <div class="scr">
    <app-bar></app-bar>
    <div class="scr-body">
      <div style="text-align:center;margin-top:6px">
        <span style="width:56px;height:56px;border-radius:16px;display:inline-flex;align-items:center;justify-content:center;background:color-mix(in srgb, var(--primary) 12%, var(--surface));color:var(--primary)">
          <ic name="lock" [size]="26"></ic>
        </span>
        <h1 style="font-size:23px;margin-top:12px">{{ i18n.t('login_title') }}</h1>
        <p class="muted" style="font-size:13.5px;margin-top:6px;line-height:1.45">{{ i18n.t('login_sub') }}</p>
      </div>

      <field [label]="i18n.t('login_email')">
        <div class="input-prefix">
          <span class="pfx"><ic name="user" [size]="16"></ic></span>
          <input type="email" autocomplete="username" [placeholder]="i18n.t('login_email_ph')"
                 [value]="email()" (input)="setEmail($event)" (keydown.enter)="submit()" />
        </div>
      </field>
      <field [label]="i18n.t('login_pw')" [err]="err() ? i18n.t('login_err') : null">
        <div class="input-prefix">
          <span class="pfx"><ic name="lock" [size]="16"></ic></span>
          <input [type]="showPw() ? 'text' : 'password'" autocomplete="current-password" placeholder="••••••••"
                 [value]="pw()" (input)="setPw($event)" (keydown.enter)="submit()" />
          <button type="button" (click)="showPw.set(!showPw())"
                  [title]="i18n.t(showPw() ? 'pw_hide' : 'pw_show')" [attr.aria-label]="i18n.t(showPw() ? 'pw_hide' : 'pw_show')"
                  style="display:flex;align-items:center;padding:0 12px;background:transparent;border:none;cursor:pointer;color:var(--muted)">
            <ic [name]="showPw() ? 'eyeOff' : 'eye'" [size]="18"></ic>
          </button>
        </div>
      </field>
      <button class="btn btn-primary" (click)="submit()">{{ i18n.t('login_btn') }} <ic name="arrowR" [size]="18"></ic></button>

      <div style="flex:1"></div>
      <button class="btn btn-outline" style="font-size:12.5px" (click)="clientPath()"><ic name="qr" [size]="16"></ic> {{ i18n.t('client_demo_link') }}</button>
    </div>
  </div>`,
})
export class LoginComponent {
  i18n = inject(I18n);
  private auth = inject(Auth);
  private router = inject(Router);

  email = signal('');
  pw = signal('');
  err = signal(false);
  showPw = signal(false);

  setEmail(e: Event) { this.email.set((e.target as HTMLInputElement).value); this.err.set(false); }
  setPw(e: Event) { this.pw.set((e.target as HTMLInputElement).value); this.err.set(false); }

  submit() {
    this.auth.login(this.email().trim(), this.pw()).subscribe({
      next: () => this.router.navigateByUrl(this.auth.landingPath()),
      error: () => this.err.set(true),
    });
  }

  clientPath() { this.router.navigateByUrl('/qr'); }
}
