import { Routes } from '@angular/router';
import { authGuard, roleGuard } from './core/guards';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'login' },
  { path: 'login', loadComponent: () => import('./pages/login').then((m) => m.LoginComponent) },

  { path: 'admin', canActivate: [roleGuard('ADMIN')], loadComponent: () => import('./pages/admin').then((m) => m.AdminComponent) },
  { path: 'agent', canActivate: [roleGuard('AGENT')], loadComponent: () => import('./pages/agent-home').then((m) => m.AgentHomeComponent) },

  // assisted (relationship officer) subscription
  { path: 'subscribe', canActivate: [roleGuard('AGENT')], data: { channel: 'agent' },
    loadComponent: () => import('./pages/subscribe').then((m) => m.SubscribeComponent) },

  // public client (QR) path
  { path: 'qr', loadComponent: () => import('./pages/qr').then((m) => m.QrComponent) },
  { path: 'client', data: { channel: 'self' },
    loadComponent: () => import('./pages/subscribe').then((m) => m.SubscribeComponent) },

  // print point (staff)
  { path: 'print', canActivate: [authGuard], loadComponent: () => import('./pages/print-point').then((m) => m.PrintPointComponent) },

  { path: '**', redirectTo: 'login' },
];
