import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { tap } from 'rxjs';
import { Api } from './api';
import { Geo } from './geo';
import { ALL_ROLES, Permission, Role, User } from './models';

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

  /** End an expired/invalid session (triggered by a 401) and return to login with a notice.
   *  No-op if already signed out, so parallel failing requests don't stack redundant redirects. */
  expireSession(): void {
    if (!this.token && !this.user()) return;
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    this.user.set(null);
    this.router.navigate(['/login'], { queryParams: { expired: 1 } });
  }

  /** Decode the JWT payload (claims) — the SAME token the backend authorises against. Returns null
   *  when there is no token or it can't be parsed. UTF-8 safe (names with accents). */
  private tokenClaims(): { role?: string; roles?: string; permissions?: string } | null {
    const seg = this.token?.split('.')[1];
    if (!seg) return null;
    try {
      const b64 = seg.replace(/-/g, '+').replace(/_/g, '/');
      const pad = b64.length % 4 ? b64 + '='.repeat(4 - (b64.length % 4)) : b64;
      const bytes = Uint8Array.from(atob(pad), (c) => c.charCodeAt(0));
      return JSON.parse(new TextDecoder().decode(bytes));
    } catch { return null; }
  }

  /** Effective roles of the current session, read FROM THE JWT — the single source of truth shared
   *  with the backend. This guarantees the route guards and the API can never disagree (a stale
   *  token simply carries stale roles for BOTH sides, instead of the guard trusting a separately
   *  stored user object). Falls back to the legacy single `role` claim on very old tokens. */
  roles(): Role[] {
    const c = this.tokenClaims();
    const csv = (c?.roles && c.roles.length ? c.roles : c?.role) ?? '';
    return csv.split(',').map((s) => s.trim()).filter(Boolean) as Role[];
  }
  hasRole(...roles: Role[]): boolean {
    const mine = this.roles();
    return roles.some((r) => mine.includes(r));
  }

  /** Effective permissions, also read from the JWT for the same single-source-of-truth reason. */
  permissions(): Permission[] {
    const csv = this.tokenClaims()?.permissions ?? '';
    return csv.split(',').map((s) => s.trim()).filter(Boolean) as Permission[];
  }

  /** ADMIN bypasses all permission checks for backward compatibility with pre-profile sessions. */
  hasPermission(...perms: Permission[]): boolean {
    if (this.hasRole('ADMIN')) return true;
    const mine = this.permissions();
    return perms.some((p) => mine.includes(p));
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
      ADMIN: '/admin', MANAGER: '/manager', SUPERVISEUR: '/supervision', CHEF_EQUIPE: '/team-stats',
      AGENT: '/agent', CASHIER: '/cashier', PRINT_AGENT: '/print', COLLECTEUR: '/collecte',
    };
    if (role) return home[role] ?? '/login';
    const mine = this.roles();
    for (const r of ALL_ROLES) if (mine.includes(r)) return home[r];
    return '/login';
  }
}
