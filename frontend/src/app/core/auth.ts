import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { tap } from 'rxjs';
import { Api } from './api';
import { Geo } from './geo';
import { ALL_ROLES, Role, User } from './models';

const TOKEN_KEY = 'promote.token';
const USER_KEY = 'promote.user';

/** Authentication + session state (JWT stored in localStorage). */
@Injectable({ providedIn: 'root' })
export class Auth {
  private api = inject(Api);
  private geo = inject(Geo);
  private router = inject(Router);

  readonly user = signal<User | null>(this.restoreUser());
  readonly isStaff = computed(() => this.user() !== null);

  private restoreUser(): User | null {
    try { const s = localStorage.getItem(USER_KEY); return s ? JSON.parse(s) : null; }
    catch { return null; }
  }

  get token(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  }

  login(email: string, password: string) {
    return this.api.login(email, password).pipe(tap((res) => this.establish(res)));
  }

  /** Simplified collecteur sign-in (phone number + 4-digit PIN). */
  loginByPhone(phone: string, pin: string) {
    return this.api.loginByPhone(phone, pin).pipe(tap((res) => this.establish(res)));
  }

  /** Persist a freshly authenticated session and capture the GPS fix (best-effort). */
  private establish(res: { token: string; user: User }): void {
    localStorage.setItem(TOKEN_KEY, res.token);
    localStorage.setItem(USER_KEY, JSON.stringify(res.user));
    this.user.set(res.user);
    this.reportLocation();
  }

  /** Best-effort: capture the browser's GPS fix and store it as the user's last-known location
   *  (powers the admin map). Silently does nothing if the permission is denied or unavailable. */
  private reportLocation(): void {
    this.geo.current().then((fix) => {
      if (!fix) return;
      this.api.reportLocation(fix.lat, fix.lng, fix.accuracy).subscribe({ error: () => {} });
    });
  }

  logout(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    this.user.set(null);
    this.router.navigateByUrl('/login');
  }

  /** Effective roles of the current user (the full set, or just the primary on older sessions). */
  roles(): Role[] {
    const u = this.user();
    if (!u) return [];
    return u.roles && u.roles.length ? u.roles : (u.role ? [u.role] : []);
  }
  hasRole(...roles: Role[]): boolean {
    const mine = this.roles();
    return roles.some((r) => mine.includes(r));
  }

  /** True until the user has set their own password (forces the change-password screen). */
  get mustChangePassword(): boolean {
    return !!this.user()?.mustChangePassword;
  }

  /** Persist an updated user (e.g. after a password change clears mustChangePassword). */
  setUser(u: User): void {
    localStorage.setItem(USER_KEY, JSON.stringify(u));
    this.user.set(u);
  }

  /** Landing route for a freshly authenticated user. For a multi-role account, the highest-priority
   *  role wins (ADMIN → Superviseur → Agent → Cashier → Print → Collecteur). */
  landingPath(role?: Role): string {
    const home: Record<Role, string> = {
      ADMIN: '/admin', SUPERVISEUR: '/admin', AGENT: '/agent',
      CASHIER: '/cashier', PRINT_AGENT: '/print', COLLECTEUR: '/collecte',
    };
    if (role) return home[role] ?? '/login';
    const mine = this.roles();
    for (const r of ALL_ROLES) if (mine.includes(r)) return home[r];
    return '/login';
  }
}
