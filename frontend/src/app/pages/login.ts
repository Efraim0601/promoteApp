import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { I18n } from '../core/i18n';
import { Auth } from '../core/auth';
import { Api } from '../core/api';
import { AppBarComponent } from '../shared/app-bar';
import { IconComponent } from '../shared/icon';
import { FieldComponent } from '../shared/fields';
import { SpinnerComponent } from '../shared/spinner';

type Mode = 'staff' | 'collecteur';

/** Collecteur phone+PIN sign-in hidden on the login page (API / auth layer unchanged). */
const SHOW_COLLECTEUR_LOGIN = false;

@Component({
  selector: 'page-login',
  standalone: true,
  imports: [AppBarComponent, IconComponent, FieldComponent, SpinnerComponent],
  template: `
  <div class="scr">
    <app-bar></app-bar>
    <div class="scr-body">
      <div style="text-align:center;margin-top:6px">
        <span style="width:56px;height:56px;border-radius:16px;display:inline-flex;align-items:center;justify-content:center;background:color-mix(in srgb, var(--primary) 12%, var(--surface));color:var(--primary)">
          <ic name="lock" [size]="26"></ic>
        </span>
        <h1 style="font-size:23px;margin-top:12px">{{ i18n.t('login_title') }}</h1>
        <p class="muted" style="font-size:13.5px;margin-top:6px;line-height:1.45">{{ i18n.t(showCollecteurLogin && mode() === 'collecteur' ? 'login_collecteur_sub' : 'login_sub') }}</p>
      </div>

      @if (showCollecteurLogin) {
      <!-- Mode switch: staff (email + password) vs collecteur (phone + PIN, field data-collection). -->
      <div style="display:flex;gap:4px;background:var(--surface-2);border-radius:12px;padding:4px;margin-top:4px">
        <button type="button" (click)="setMode('staff')"
                [style.background]="mode() === 'staff' ? 'var(--surface)' : 'transparent'"
                [style.box-shadow]="mode() === 'staff' ? 'var(--shadow)' : 'none'"
                [style.color]="mode() === 'staff' ? 'var(--text)' : 'var(--muted)'"
                style="flex:1;border:none;border-radius:9px;padding:9px;font-size:13px;font-weight:700;cursor:pointer">{{ i18n.t('login_mode_staff') }}</button>
        <button type="button" (click)="setMode('collecteur')"
                [style.background]="mode() === 'collecteur' ? 'var(--surface)' : 'transparent'"
                [style.box-shadow]="mode() === 'collecteur' ? 'var(--shadow)' : 'none'"
                [style.color]="mode() === 'collecteur' ? 'var(--text)' : 'var(--muted)'"
                style="flex:1;border:none;border-radius:9px;padding:9px;font-size:13px;font-weight:700;cursor:pointer">{{ i18n.t('login_mode_collecteur') }}</button>
      </div>
      }

      @if (!showCollecteurLogin || mode() === 'staff') {
        @if (!forgot()) {
        <field [label]="i18n.t('login_email')">
          <div class="input-prefix">
            <span class="pfx"><ic name="user" [size]="16"></ic></span>
            <input type="email" autocomplete="username" [placeholder]="i18n.t('login_email_ph')"
                   [value]="email()" (input)="setEmail($event)" (keydown.enter)="submit()" />
          </div>
        </field>
        <field [label]="i18n.t('login_pw')" [err]="err() ? i18n.t(err()) : null">
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
        <div style="width:100%;text-align:right;margin-top:-4px">
          <button type="button" (click)="openForgot()"
                  style="background:none;border:none;padding:0;font-size:12.5px;font-weight:600;color:var(--primary);cursor:pointer">
            {{ i18n.t('login_forgot') }}
          </button>
        </div>
        <button class="btn btn-primary" (click)="submit()" [disabled]="busy()">
          @if (busy()) { <spinner></spinner> } @else { {{ i18n.t('login_btn') }} <ic name="arrowR" [size]="18"></ic> }
        </button>
        } @else {
        <div style="text-align:center;margin-bottom:4px">
          <h2 style="font-size:18px;margin:0">{{ i18n.t('fp_title') }}</h2>
          <p class="muted" style="font-size:13px;margin-top:8px;line-height:1.45">{{ i18n.t('fp_sub') }}</p>
        </div>
        @if (sent()) {
          <div class="feedback ok-box" style="font-size:12.5px"><ic name="check" [size]="18" style="flex-shrink:0"></ic> {{ i18n.t('fp_sent') }}</div>
        } @else {
          <field [label]="i18n.t('login_email')">
            <div class="input-prefix">
              <span class="pfx"><ic name="user" [size]="16"></ic></span>
              <input type="email" autocomplete="username" [placeholder]="i18n.t('login_email_ph')"
                     [value]="email()" (input)="setEmail($event)" (keydown.enter)="submitForgot()" />
            </div>
          </field>
          <button class="btn btn-primary" (click)="submitForgot()" [disabled]="busy() || !email().trim()">
            @if (busy()) { <spinner></spinner> } @else { {{ i18n.t('fp_submit') }} <ic name="mail" [size]="18"></ic> }
          </button>
        }
        <button type="button" class="btn btn-ghost" (click)="closeForgot()" style="font-size:13px;margin-top:4px">
          <ic name="chevL" [size]="16"></ic> {{ i18n.t('fp_back') }}
        </button>
        }
      } @else if (showCollecteurLogin) {
        <field [label]="i18n.t('login_phone')">
          <div class="input-prefix">
            <span class="pfx"><ic name="phone" [size]="16"></ic></span>
            <input type="tel" inputmode="numeric" maxlength="9" autocomplete="tel" [placeholder]="i18n.t('login_phone_ph')"
                   [value]="phone()" (input)="setPhone($event)" (keydown.enter)="submitPhone()" />
          </div>
        </field>
        <field [label]="i18n.t('login_pin')" [err]="err() ? i18n.t(err()) : null">
          <div class="input-prefix">
            <span class="pfx"><ic name="lock" [size]="16"></ic></span>
            <input [type]="showPw() ? 'text' : 'password'" inputmode="numeric" maxlength="4" autocomplete="off" placeholder="••••"
                   style="letter-spacing:4px" [value]="pin()" (input)="setPin($event)" (keydown.enter)="submitPhone()" />
            <button type="button" (click)="showPw.set(!showPw())"
                    [title]="i18n.t(showPw() ? 'pw_hide' : 'pw_show')" [attr.aria-label]="i18n.t(showPw() ? 'pw_hide' : 'pw_show')"
                    style="display:flex;align-items:center;padding:0 12px;background:transparent;border:none;cursor:pointer;color:var(--muted)">
              <ic [name]="showPw() ? 'eyeOff' : 'eye'" [size]="18"></ic>
            </button>
          </div>
        </field>
        <button class="btn btn-primary" (click)="submitPhone()" [disabled]="busy() || !phoneValid()">
          @if (busy()) { <spinner></spinner> } @else { {{ i18n.t('login_btn') }} <ic name="arrowR" [size]="18"></ic> }
        </button>
      }

      <div style="flex:1"></div>
      <button class="btn btn-outline" style="font-size:12.5px" (click)="clientPath()"><ic name="qr" [size]="16"></ic> {{ i18n.t('client_demo_link') }}</button>
    </div>
  </div>`,
  styles: [`
    .feedback{ display:flex; align-items:center; gap:10px; padding:12px 14px; border-radius:var(--radius); }
    .ok-box{ background:color-mix(in srgb, var(--primary) 12%, var(--surface)); color:var(--primary); }
  `],
})
export class LoginComponent {
  /** Exposed for the template — see {@link SHOW_COLLECTEUR_LOGIN}. */
  readonly showCollecteurLogin = SHOW_COLLECTEUR_LOGIN;

  i18n = inject(I18n);
  private auth = inject(Auth);
  private api = inject(Api);
  private router = inject(Router);

  mode = signal<Mode>('staff');
  email = signal('');
  pw = signal('');
  phone = signal('');
  pin = signal('');
  err = signal('');   // i18n key of the error to show, or '' when none
  showPw = signal(false);
  busy = signal(false);
  forgot = signal(false);
  sent = signal(false);

  phoneValid = computed(() => /^6\d{8}$/.test(this.phone()) && this.pin().length >= 4);

  setMode(m: Mode) { if (this.mode() !== m) { this.mode.set(m); this.err.set(''); this.showPw.set(false); this.closeForgot(); } }
  setEmail(e: Event) { this.email.set((e.target as HTMLInputElement).value); this.err.set(''); }
  setPw(e: Event) { this.pw.set((e.target as HTMLInputElement).value); this.err.set(''); }
  setPhone(e: Event) { this.phone.set((e.target as HTMLInputElement).value.replace(/\D/g, '')); this.err.set(''); }
  setPin(e: Event) { this.pin.set((e.target as HTMLInputElement).value.replace(/\D/g, '')); this.err.set(''); }

  submit() {
    if (this.busy()) return;
    this.busy.set(true);
    this.auth.login(this.email().trim(), this.pw()).subscribe({
      next: () => this.router.navigateByUrl(this.auth.mustChangePassword ? '/change-password' : this.auth.landingPath()),
      error: (e) => { this.err.set(e?.status === 403 ? 'login_disabled' : 'login_err'); this.busy.set(false); },
    });
  }

  submitPhone() {
    if (this.busy() || !this.phoneValid()) return;
    this.busy.set(true);
    this.auth.loginByPhone(this.phone().trim(), this.pin().trim()).subscribe({
      next: () => this.router.navigateByUrl(this.auth.landingPath()),
      error: (e) => { this.err.set(e?.status === 403 ? 'login_disabled' : 'login_phone_err'); this.busy.set(false); },
    });
  }

  openForgot() { this.forgot.set(true); this.sent.set(false); this.err.set(''); }
  closeForgot() { this.forgot.set(false); this.sent.set(false); this.busy.set(false); }

  submitForgot() {
    const mail = this.email().trim();
    if (this.busy() || !mail) return;
    this.busy.set(true);
    this.api.forgotPassword(mail).subscribe({
      next: () => { this.sent.set(true); this.busy.set(false); },
      error: () => { this.sent.set(true); this.busy.set(false); },
    });
  }

  clientPath() { this.router.navigateByUrl('/qr'); }
}
