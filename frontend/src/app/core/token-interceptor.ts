import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { Auth } from './auth';

/** Attaches the JWT Bearer token to outgoing /api requests, and on a 401 from a token-bearing
 *  request ends the (expired/invalid) session and routes back to login with a notice.
 *
 *  Without this, an expired JWT (12h TTL) dies silently — the app keeps "working" on cached views
 *  and public endpoints, and the failure only surfaces as a confusing generic error at the next
 *  authenticated write (e.g. "Impossible d'enregistrer la demande" on the subscription recap). */
export const tokenInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(Auth);
  const token = auth.token;
  if (token && req.url.startsWith('/api')) {
    req = req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
  }
  return next(req).pipe(
    catchError((err: unknown) => {
      // A 401 on a token-bearing request means the JWT expired or is invalid → the session is dead.
      // Exclude the login endpoints, where a 401 just means wrong credentials.
      if (err instanceof HttpErrorResponse && err.status === 401 && token
          && !req.url.includes('/api/auth/login')) {
        auth.expireSession();
      }
      return throwError(() => err);
    }),
  );
};
