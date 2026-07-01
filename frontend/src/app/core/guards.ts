import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Auth } from './auth';
import { Role } from './models';

/** Requires an authenticated (non-expired) session. */
export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(Auth);
  const router = inject(Router);
  if (auth.isLoggedIn()) return true;
  // Preserve the intended destination (e.g. the /change-password link from a welcome email) so the
  // login page can send the user back there after signing in.
  return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};

/** Requires one of the given roles (derived from the JWT). */
export function roleGuard(...roles: Role[]): CanActivateFn {
  return () => {
    const auth = inject(Auth);
    const router = inject(Router);
    if (!auth.isLoggedIn()) return router.parseUrl('/login');
    if (auth.hasRole(...roles)) return true;
    return router.parseUrl('/home');
  };
}
