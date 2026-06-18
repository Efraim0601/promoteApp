import { Routes } from '@angular/router';
import { authGuard, roleGuard, sessionGuard } from './core/guards';

export const routes: Routes = [
  // Public entry point: the bare domain serves the open "start" page (buy a card / recharge).
  { path: '', pathMatch: 'full', redirectTo: 'start' },
  // Staff sign-in — a route on its own; also where logout redirects (see Auth.logout()).
  { path: 'login', loadComponent: () => import('./pages/login').then((m) => m.LoginComponent) },

  // self-service / forced (first-login) password change — any logged-in staff
  { path: 'change-password', canActivate: [sessionGuard],
    loadComponent: () => import('./pages/change-password').then((m) => m.ChangePasswordComponent) },

  { path: 'admin', canActivate: [roleGuard('ADMIN', 'MANAGER', 'SUPERVISEUR')], loadComponent: () => import('./pages/admin').then((m) => m.AdminComponent) },

  // manager console — catalog, commissions, scoped stats
  { path: 'manager', canActivate: [roleGuard('MANAGER', 'ADMIN')], loadComponent: () => import('./pages/manager').then((m) => m.ManagerComponent) },

  // hierarchy-scoped sales dashboard — every management level (server scopes the data)
  { path: 'team-stats', canActivate: [roleGuard('ADMIN', 'MANAGER', 'SUPERVISEUR', 'CHEF_EQUIPE')], loadComponent: () => import('./pages/team-stats').then((m) => m.TeamStatsComponent) },

  { path: 'agent', canActivate: [roleGuard('AGENT')], loadComponent: () => import('./pages/agent-home').then((m) => m.AgentHomeComponent) },

  // assisted subscription — relationship officers and cashiers
  { path: 'subscribe', canActivate: [roleGuard('AGENT', 'CASHIER')], data: { channel: 'agent' },
    loadComponent: () => import('./pages/subscribe').then((m) => m.SubscribeComponent) },

  // public client (QR) path
  { path: 'qr', loadComponent: () => import('./pages/qr').then((m) => m.QrComponent) },
  // public open path — choose between buying a card and recharging one
  { path: 'start', loadComponent: () => import('./pages/services').then((m) => m.ServicesComponent) },
  { path: 'client', data: { channel: 'self' },
    loadComponent: () => import('./pages/subscribe').then((m) => m.SubscribeComponent) },
  // public prepaid-card recharge (top-up)
  { path: 'recharge', loadComponent: () => import('./pages/recharge').then((m) => m.RechargeComponent) },

  // print point (staff)
  { path: 'print', canActivate: [authGuard], loadComponent: () => import('./pages/print-point').then((m) => m.PrintPointComponent) },

  // cashier — validate in-person cash payments
  { path: 'cashier', canActivate: [roleGuard('CASHIER', 'ADMIN')], loadComponent: () => import('./pages/cashier').then((m) => m.CashierComponent) },

  // collecteur — capture + manage own bank-product sales (collectes)
  { path: 'collecte', canActivate: [roleGuard('COLLECTEUR', 'ADMIN')], loadComponent: () => import('./pages/collecte').then((m) => m.CollecteComponent) },

  // collecte supervisor — global collecte statistics, separate from the admin dashboard
  { path: 'collecte-stats', canActivate: [roleGuard('SUPERVISEUR', 'ADMIN')], loadComponent: () => import('./pages/collecte-stats').then((m) => m.CollecteStatsComponent) },

  // supervisor — daily reconciliation of print remittance + cash collection across everyone
  { path: 'supervision', canActivate: [roleGuard('SUPERVISEUR', 'ADMIN', 'MANAGER')], loadComponent: () => import('./pages/supervision').then((m) => m.SupervisionComponent) },

  // Unknown URLs fall back to the public start page (not the staff login).
  { path: '**', redirectTo: 'start' },
];
