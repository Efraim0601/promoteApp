import { Routes } from '@angular/router';
import { authGuard, roleGuard, sessionGuard } from './core/guards';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'login' },
  { path: 'login', loadComponent: () => import('./pages/login').then((m) => m.LoginComponent) },

  // self-service / forced (first-login) password change — any logged-in staff
  { path: 'change-password', canActivate: [sessionGuard],
    loadComponent: () => import('./pages/change-password').then((m) => m.ChangePasswordComponent) },

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

  // cashier — validate in-person cash payments
  { path: 'cashier', canActivate: [roleGuard('CASHIER', 'ADMIN')], loadComponent: () => import('./pages/cashier').then((m) => m.CashierComponent) },

  { path: '**', redirectTo: 'login' },
];
