import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  ActionAuditDto,
  AdminStats,
  AgencyDto,
  CommissionEntryDto,
  CommissionRuleDto,
  HierarchyStatsDto,
  TeamMemberDto,
  AgentStats,
  CashierStats,
  CollecteDto,
  CollecteStats,
  ConfigDto,
  CreateCollecteRequest,
  CreateRechargeRequest,
  CreateSubscriptionRequest,
  CreateUserRequest,
  LoginAuditDto,
  LoginResponse,
  NotificationDto,
  PaymentStats,
  PaymentStatusDto,
  PrintStats,
  ProductDto,
  ProfileDto,
  RechargeDto,
  SubscriptionDto,
  User,
  UserDto,
} from './models';

/** Typed wrapper over the backend REST API (base path /api). */
@Injectable({ providedIn: 'root' })
export class Api {
  private http = inject(HttpClient);
  private base = '/api';

  // ---- auth ----
  login(email: string, password: string): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${this.base}/auth/login`, { email, password });
  }
  loginPhone(phone: string, pin: string): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${this.base}/auth/login-phone`, { phone, pin });
  }
  forgotPassword(email: string): Observable<void> {
    return this.http.post<void>(`${this.base}/auth/forgot-password`, { email });
  }
  me(): Observable<User> {
    return this.http.get<User>(`${this.base}/auth/me`);
  }
  changePassword(currentPassword: string, newPassword: string): Observable<User> {
    return this.http.post<User>(`${this.base}/auth/change-password`, { currentPassword, newPassword });
  }

  // ---- catalogue / souscription (parcours public) ----
  products(): Observable<ProductDto[]> {
    return this.http.get<ProductDto[]>(`${this.base}/products`);
  }
  agencies(): Observable<AgencyDto[]> {
    return this.http.get<AgencyDto[]>(`${this.base}/agencies`);
  }
  config(): Observable<ConfigDto> {
    return this.http.get<ConfigDto>(`${this.base}/config`);
  }
  /** Upload a base64 data-URL; returns the storage key to reference in the subscription. */
  uploadKycImage(image: string, kind: 'selfie' | 'cni-recto' | 'cni-verso'): Observable<{ key: string }> {
    return this.http.post<{ key: string }>(`${this.base}/kyc/image`, { image, kind });
  }
  uploadReceipt(image: string): Observable<{ key: string; reference?: string | null; payerPhone?: string | null; amount?: number | null }> {
    return this.http.post<{ key: string; reference?: string | null; payerPhone?: string | null; amount?: number | null }>(
      `${this.base}/kyc/receipt`, { image, kind: 'sara-receipt' },
    );
  }
  createSelfSubscription(req: CreateSubscriptionRequest): Observable<SubscriptionDto> {
    return this.http.post<SubscriptionDto>(`${this.base}/subscriptions/self`, req);
  }
  paySubscription(ref: string, outcome: string, reason?: string): Observable<SubscriptionDto> {
    return this.http.patch<SubscriptionDto>(`${this.base}/subscriptions/${ref}/pay`, { outcome, reason });
  }
  subscriptionStatus(ref: string): Observable<PaymentStatusDto> {
    return this.http.get<PaymentStatusDto>(`${this.base}/subscriptions/${ref}/status`);
  }

  // ---- recharge (parcours public) ----
  createRecharge(req: CreateRechargeRequest): Observable<RechargeDto> {
    return this.http.post<RechargeDto>(`${this.base}/recharges`, req);
  }
  payRecharge(ref: string, outcome: string, reason?: string): Observable<RechargeDto> {
    return this.http.patch<RechargeDto>(`${this.base}/recharges/${ref}/pay`, { outcome, reason });
  }
  rechargeStatus(ref: string): Observable<PaymentStatusDto> {
    return this.http.get<PaymentStatusDto>(`${this.base}/recharges/${ref}/status`);
  }

  // ---- staff dashboard ----
  agentStats(): Observable<AgentStats> {
    return this.http.get<AgentStats>(`${this.base}/stats/agent`);
  }
  mySubscriptions(): Observable<SubscriptionDto[]> {
    return this.http.get<SubscriptionDto[]>(`${this.base}/subscriptions/mine`);
  }
  searchSubscriptions(q: string): Observable<SubscriptionDto[]> {
    return this.http.get<SubscriptionDto[]>(`${this.base}/subscriptions/search`, { params: { q } });
  }

  // ---- cashier ----
  cashierStats(): Observable<CashierStats> {
    return this.http.get<CashierStats>(`${this.base}/stats/cashier`);
  }
  pendingRecharges(): Observable<RechargeDto[]> {
    return this.http.get<RechargeDto[]>(`${this.base}/recharges/pending-fulfillment`);
  }
  fulfillRecharge(ref: string, evidenceImageKey?: string): Observable<RechargeDto> {
    return this.http.patch<RechargeDto>(`${this.base}/recharges/${ref}/fulfill`, { evidenceImageKey });
  }
  cashValidateSubscription(ref: string, outcome: string, paymentReference?: string, reason?: string): Observable<SubscriptionDto> {
    return this.http.patch<SubscriptionDto>(`${this.base}/subscriptions/${ref}/cash-validate`, { outcome, paymentReference, reason });
  }

  // ---- print ----
  printStats(): Observable<PrintStats> {
    return this.http.get<PrintStats>(`${this.base}/stats/print`);
  }
  printSubscription(ref: string, cardNumber?: string, pan?: string): Observable<SubscriptionDto> {
    return this.http.patch<SubscriptionDto>(`${this.base}/subscriptions/${ref}/print`, { cardNumber, pan });
  }

  // ---- collecte ----
  collecteStats(): Observable<CollecteStats> {
    return this.http.get<CollecteStats>(`${this.base}/collectes/stats`);
  }
  myCollectes(): Observable<CollecteDto[]> {
    return this.http.get<CollecteDto[]>(`${this.base}/collectes/mine`);
  }
  createCollecte(req: CreateCollecteRequest): Observable<CollecteDto> {
    return this.http.post<CollecteDto>(`${this.base}/collectes`, req);
  }

  // ---- admin ----
  adminStats(): Observable<AdminStats> {
    return this.http.get<AdminStats>(`${this.base}/stats/admin`);
  }
  paymentStats(): Observable<PaymentStats> {
    return this.http.get<PaymentStats>(`${this.base}/stats/payments`);
  }
  users(): Observable<UserDto[]> {
    return this.http.get<UserDto[]>(`${this.base}/users`);
  }
  createUser(req: CreateUserRequest): Observable<UserDto> {
    return this.http.post<UserDto>(`${this.base}/users`, req);
  }
  setUserEnabled(id: string, enabled: boolean): Observable<unknown> {
    return this.http.patch(`${this.base}/users/${id}/enabled`, { enabled });
  }
  allSubscriptions(): Observable<SubscriptionDto[]> {
    return this.http.get<SubscriptionDto[]>(`${this.base}/subscriptions`);
  }
  profiles(): Observable<ProfileDto[]> {
    return this.http.get<ProfileDto[]>(`${this.base}/profiles`);
  }
  auditLogins(): Observable<LoginAuditDto[]> {
    return this.http.get<LoginAuditDto[]>(`${this.base}/audit/logins`);
  }
  auditActions(q?: string): Observable<ActionAuditDto[]> {
    return this.http.get<ActionAuditDto[]>(`${this.base}/audit/actions`, { params: q ? { q } : {} });
  }

  // ---- manager / team ----
  commissionRules(): Observable<CommissionRuleDto[]> {
    return this.http.get<CommissionRuleDto[]>(`${this.base}/commissions/rules`);
  }
  commissionEntries(): Observable<CommissionEntryDto[]> {
    return this.http.get<CommissionEntryDto[]>(`${this.base}/commissions/entries`);
  }
  hierarchyStats(): Observable<HierarchyStatsDto> {
    return this.http.get<HierarchyStatsDto>(`${this.base}/stats/hierarchy`);
  }
  teamRoster(): Observable<TeamMemberDto[]> {
    return this.http.get<TeamMemberDto[]>(`${this.base}/team`);
  }
  sendTeamMessage(title: string, body: string, recipientIds: string[]): Observable<unknown> {
    return this.http.post(`${this.base}/team/message`, { title, body, recipientIds });
  }

  // ---- notifications ----
  notificationsMine(): Observable<NotificationDto[]> {
    return this.http.get<NotificationDto[]>(`${this.base}/notifications/mine`);
  }
  unreadCount(): Observable<{ count: number }> {
    return this.http.get<{ count: number }>(`${this.base}/notifications/unread-count`);
  }
  markNotifRead(id: number): Observable<void> {
    return this.http.patch<void>(`${this.base}/notifications/${id}/read`, {});
  }
  markAllNotifRead(): Observable<void> {
    return this.http.post<void>(`${this.base}/notifications/read-all`, {});
  }

  // ---- reconciliation (admin) ----
  reconcile(hours: number): Observable<{ hours: number; scanned: number; updated: number; unchanged: number; errors: number }> {
    return this.http.post<{ hours: number; scanned: number; updated: number; unchanged: number; errors: number }>(
      `${this.base}/payment/reconcile`, null, { params: { hours: String(hours) } },
    );
  }

  // ---- generic helpers (extended view by view) ----
  get<T>(path: string): Observable<T> {
    return this.http.get<T>(`${this.base}${path}`);
  }
  post<T>(path: string, body: unknown): Observable<T> {
    return this.http.post<T>(`${this.base}${path}`, body);
  }
}
