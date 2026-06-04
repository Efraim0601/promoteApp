import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { tap } from 'rxjs';
import { Api } from './api';
import { Role, User } from './models';

const TOKEN_KEY = 'promote.token';
const USER_KEY = 'promote.user';

/** Authentication + session state (JWT stored in localStorage). */
@Injectable({ providedIn: 'root' })
export class Auth {
  private api = inject(Api);
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
    return this.api.login(email, password).pipe(tap((res) => {
      localStorage.setItem(TOKEN_KEY, res.token);
      localStorage.setItem(USER_KEY, JSON.stringify(res.user));
      this.user.set(res.user);
    }));
  }

  logout(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    this.user.set(null);
    this.router.navigateByUrl('/login');
  }

  hasRole(...roles: Role[]): boolean {
    const u = this.user();
    return !!u && roles.includes(u.role);
  }

  /** Landing route for a freshly authenticated user. */
  landingPath(role?: Role): string {
    const r = role ?? this.user()?.role;
    if (r === 'ADMIN') return '/admin';
    if (r === 'AGENT') return '/agent';
    if (r === 'PRINT_AGENT') return '/print';
    return '/login';
  }
}
