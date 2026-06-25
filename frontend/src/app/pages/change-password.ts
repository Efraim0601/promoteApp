import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { I18n } from '../core/i18n';
import { Api } from '../core/api';
import { Auth } from '../core/auth';
import { AppBarComponent } from '../shared/app-bar';
import { IconComponent } from '../shared/icon';
import { FieldComponent } from '../shared/fields';
import { SpinnerComponent } from '../shared/spinner';
import { RevealDirective } from '../shared/reveal';

/** Self-service password change. Also the forced screen on first login (mustChangePassword). */
@Component({
  selector: 'page-change-password',
  standalone: true,
  imports: [AppBarComponent, IconComponent, FieldComponent, SpinnerComponent, RevealDirective],
  template: `
  <div class="scr">
    <app-bar>
      @if (!forced()) {
        <button appbar-left class="back-link" (click)="back()" style="margin-right:2px"><ic name="chevL" [size]="20"></ic></button>
      }
    </app-bar>
    <div class="scr-body" reveal="screen">
      <div style="text-align:center;margin-top:6px" data-reveal="logo">
        <span style="width:56px;height:56px;border-radius:16px;display:inline-flex;align-items:center;justify-content:center;background:color-mix(in srgb, var(--primary) 12%, var(--surface));color:var(--primary)">
          <ic name="lock" [size]="26"></ic>
        </span>
        <h1 style="font-size:23px;margin-top:12px">{{ i18n.t('cp_title') }}</h1>
        @if (forced()) {
          <p class="muted" style="font-size:13.5px;margin-top:6px;line-height:1.45">{{ i18n.t('cp_forced') }}</p>
        }
      </div>

      <field [label]="i18n.t('cp_current')" data-reveal="input">
        <div class="input-prefix">
          <span class="pfx"><ic name="lock" [size]="16"></ic></span>
          <input [type]="show() ? 'text' : 'password'" autocomplete="current-password"
                 [value]="current()" (input)="current.set($any($event.target).value); err.set(null)" />
        </div>
      </field>

      <field [label]="i18n.t('cp_new')" [hint]="i18n.t('cp_policy')" data-reveal="input">
        <div class="input-prefix">
          <span class="pfx"><ic name="lock" [size]="16"></ic></span>
          <input [type]="show() ? 'text' : 'password'" autocomplete="new-password"
                 [value]="next()" (input)="next.set($any($event.target).value); err.set(null)" />
          <button type="button" (click)="show.set(!show())" [attr.aria-label]="i18n.t(show() ? 'pw_hide' : 'pw_show')"
                  style="display:flex;align-items:center;padding:0 12px;background:transparent;border:none;cursor:pointer;color:var(--muted)">
            <ic [name]="show() ? 'eyeOff' : 'eye'" [size]="18"></ic>
          </button>
        </div>
      </field>

      <field [label]="i18n.t('cp_confirm')" [err]="confirm() && !match() ? i18n.t('cp_mismatch') : null" data-reveal="input">
        <div class="input-prefix">
          <span class="pfx"><ic name="lock" [size]="16"></ic></span>
          <input [type]="show() ? 'text' : 'password'" autocomplete="new-password"
                 [value]="confirm()" (input)="confirm.set($any($event.target).value); err.set(null)" />
        </div>
      </field>

      @if (err()) {
        <div class="feedback err-box" style="font-size:12.5px"><ic name="alert" [size]="18" style="flex-shrink:0"></ic> {{ i18n.t(err()!) }}</div>
      }

      <button class="btn btn-primary" data-reveal="button" (click)="submit()" [disabled]="!canSubmit() || busy()">
        @if (busy()) { <spinner></spinner> } @else { <ic name="check" [size]="18" [sw]="2.4"></ic> {{ i18n.t('cp_submit') }} }
      </button>

      <div style="flex:1"></div>
      <button class="btn btn-ghost" (click)="auth.logout()" style="font-size:13.5px"><ic name="logout" [size]="16"></ic> {{ i18n.t('logout') }}</button>
    </div>
  </div>`,
  styles: [`
    .feedback{ display:flex; align-items:center; gap:10px; padding:12px 14px; border-radius:var(--radius); }
    .err-box{ background:var(--accent-soft); color:var(--accent); }
  `],
})
export class ChangePasswordComponent {
  i18n = inject(I18n);
  auth = inject(Auth);
  private api = inject(Api);
  private router = inject(Router);

  current = signal('');
  next = signal('');
  confirm = signal('');
  show = signal(false);
  busy = signal(false);
  err = signal<string | null>(null);

  forced = computed(() => this.auth.mustChangePassword);
  match = computed(() => this.next() === this.confirm());
  /** Mirror of the backend policy (≥ 8 chars, with a letter and a digit). */
  private policyOk = computed(() => {
    const p = this.next();
    return p.length >= 8 && /[a-zA-Z]/.test(p) && /\d/.test(p);
  });
  canSubmit = computed(() => !!this.current() && this.policyOk() && this.match());

  back() { this.router.navigateByUrl(this.auth.landingPath()); }

  submit() {
    if (!this.canSubmit() || this.busy()) return;
    if (!this.policyOk()) { this.err.set(this.next().length < 8 ? 'cp_err_short' : 'cp_err_complexity'); return; }
    this.busy.set(true);
    this.api.changePassword(this.current(), this.next()).subscribe({
      next: (u) => {
        this.auth.setUser(u);        // mustChangePassword now false
        this.busy.set(false);
        this.router.navigateByUrl(this.auth.landingPath());
      },
      error: (e) => {
        this.busy.set(false);
        this.err.set(this.mapError(e?.error?.error));
      },
    });
  }

  private mapError(code?: string): string {
    switch (code) {
      case 'wrong_current_password': return 'cp_err_current';
      case 'password_too_short': return 'cp_err_short';
      case 'password_needs_letter_and_digit': return 'cp_err_complexity';
      case 'password_unchanged': return 'cp_err_unchanged';
      default: return 'cp_err_generic';
    }
  }
}
