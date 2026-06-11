import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Auth } from './auth';
import { Role } from './models';

/** Requires an authenticated staff user (and a settled password). */
export const authGuard: CanActivateFn = () => {
  const auth = inject(Auth);
  const router = inject(Router);
  if (!auth.isStaff()) return router.parseUrl('/login');
  if (auth.mustChangePassword) return router.parseUrl('/change-password');
  return true;
};

/** Requires one of the given roles; otherwise sends the user to their own landing. */
export const roleGuard = (...roles: Role[]): CanActivateFn => () => {
  const auth = inject(Auth);
  const router = inject(Router);
  if (!auth.isStaff()) return router.parseUrl('/login');
  if (auth.mustChangePassword) return router.parseUrl('/change-password');
  return auth.hasRole(...roles) ? true : router.parseUrl(auth.landingPath());
};

/** Requires only a logged-in staff user — no forced-password redirect (for /change-password itself). */
export const sessionGuard: CanActivateFn = () => {
  const auth = inject(Auth);
  const router = inject(Router);
  return auth.isStaff() ? true : router.parseUrl('/login');
};
