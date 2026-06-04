import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Auth } from './auth';
import { Role } from './models';

/** Requires an authenticated staff user. */
export const authGuard: CanActivateFn = () => {
  const auth = inject(Auth);
  const router = inject(Router);
  return auth.isStaff() ? true : router.parseUrl('/login');
};

/** Requires one of the given roles; otherwise sends the user to their own landing. */
export const roleGuard = (...roles: Role[]): CanActivateFn => () => {
  const auth = inject(Auth);
  const router = inject(Router);
  if (!auth.isStaff()) return router.parseUrl('/login');
  return auth.hasRole(...roles) ? true : router.parseUrl(auth.landingPath());
};
