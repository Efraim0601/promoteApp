import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Auth } from './auth';

/** Attaches the JWT Bearer token to outgoing /api requests. */
export const tokenInterceptor: HttpInterceptorFn = (req, next) => {
  const token = inject(Auth).token;
  if (token && req.url.startsWith('/api')) {
    req = req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
  }
  return next(req);
};
