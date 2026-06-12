import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  AdminStats, Agency, Agent, AgentStats, CardConfig, CashierStats, ClaimResult,
  Collecte, CollecteStats, CreateCollecteRequest,
  CreateRechargeRequest, CreateSubscriptionRequest, CreateUserRequest, CreateUserResult, ImportAgenciesResult, ImportAgencyRow,
  ImportUserRow, ImportUsersResult, LoginAudit, Role,
  LoginResponse, MapPoint, PaymentStats, PayStatus, PrintStats, Recharge, Subscription, User,
} from './models';

/** Typed wrapper over the backend REST API (base path /api). */
@Injectable({ providedIn: 'root' })
export class Api {
  private http = inject(HttpClient);
  private base = '/api';

  login(email: string, password: string): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${this.base}/auth/login`, { email, password });
  }
  /** Simplified collecteur sign-in by phone number + 4-digit PIN. */
  loginByPhone(phone: string, pin: string): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${this.base}/auth/login-phone`, { phone, pin });
  }
  me(): Observable<User> {
    return this.http.get<User>(`${this.base}/auth/me`);
  }
  /** Change the logged-in user's own password (returns the updated user). */
  changePassword(currentPassword: string, newPassword: string): Observable<User> {
    return this.http.post<User>(`${this.base}/auth/change-password`, { currentPassword, newPassword });
  }
  /** Report the logged-in user's current GPS position (best-effort, stored as last-known location). */
  reportLocation(latitude: number, longitude: number, accuracy?: number): Observable<void> {
    return this.http.post<void>(`${this.base}/auth/location`, { latitude, longitude, accuracy });
  }
  /** Admin — every geolocated point to plot on the map (clients + staff). */
  mapPoints(): Observable<MapPoint[]> {
    return this.http.get<MapPoint[]>(`${this.base}/map/points`);
  }

  getConfig(): Observable<CardConfig> {
    return this.http.get<CardConfig>(`${this.base}/config`);
  }
  updateConfig(c: CardConfig): Observable<CardConfig> {
    return this.http.put<CardConfig>(`${this.base}/config`, c);
  }

  /** Public — active pickup branches the client can choose (delivery == agence). */
  getAgencies(): Observable<Agency[]> {
    return this.http.get<Agency[]>(`${this.base}/agencies`);
  }
  /** Admin — bulk import pickup branches. */
  importAgencies(rows: ImportAgencyRow[], updateExisting: boolean): Observable<ImportAgenciesResult> {
    return this.http.post<ImportAgenciesResult>(`${this.base}/agencies/import`, { rows, updateExisting });
  }

  createAssisted(req: CreateSubscriptionRequest): Observable<Subscription> {
    return this.http.post<Subscription>(`${this.base}/subscriptions`, req);
  }
  createSelf(req: CreateSubscriptionRequest): Observable<Subscription> {
    return this.http.post<Subscription>(`${this.base}/subscriptions/self`, req);
  }
  allSubscriptions(): Observable<Subscription[]> {
    return this.http.get<Subscription[]>(`${this.base}/subscriptions`);
  }
  mySubscriptions(): Observable<Subscription[]> {
    return this.http.get<Subscription[]>(`${this.base}/subscriptions/mine`);
  }
  byRef(ref: string): Observable<Subscription> {
    return this.http.get<Subscription>(`${this.base}/subscriptions/${ref}`);
  }
  /** Print point — search records by reference, client name, or phone. */
  searchSubscriptions(q: string): Observable<Subscription[]> {
    return this.http.get<Subscription[]>(`${this.base}/subscriptions/search`, { params: { q } });
  }
  /** Poll the live payment status of a subscription (public, lightweight). Carries the decline reason. */
  paymentStatus(ref: string): Observable<{ ref: string; payStatus: PayStatus; message?: string | null }> {
    return this.http.get<{ ref: string; payStatus: PayStatus; message?: string | null }>(`${this.base}/subscriptions/${ref}/status`);
  }

  /** Upload a captured KYC image (data URL); kind = selfie | cni-recto | cni-verso. */
  uploadImage(image: string, kind: string): Observable<{ key: string }> {
    return this.http.post<{ key: string }>(`${this.base}/kyc/image`, { image, kind });
  }
  /** Upload a SARA receipt (image/PDF data URL) and get back the auto-extracted fields
   *  (reference is the primary one; the client confirms/corrects it). */
  uploadReceipt(image: string): Observable<{ key: string; reference: string | null; payerPhone: string | null; amount: number | null }> {
    return this.http.post<{ key: string; reference: string | null; payerPhone: string | null; amount: number | null }>(`${this.base}/kyc/receipt`, { image });
  }
  /** Fetch a stored KYC image (staff) as a blob, for display. */
  imageBlob(ref: string, kind: string): Observable<Blob> {
    return this.http.get(`${this.base}/subscriptions/${ref}/image/${kind}`, { responseType: 'blob' });
  }
  /** Print point — mark printed; the physical card number is required, the PAN optional. */
  print(ref: string, cardNumber: string, pan?: string): Observable<Subscription> {
    return this.http.patch<Subscription>(`${this.base}/subscriptions/${ref}/print`, { cardNumber, pan });
  }
  /** Print point — replace a captured KYC image (key from a fresh /kyc/image upload). */
  updatePhoto(ref: string, kind: string, key: string): Observable<Subscription> {
    return this.http.patch<Subscription>(`${this.base}/subscriptions/${ref}/photo`, { kind, key });
  }
  /** Point of sale (staff) — validate or reject a SARA money receipt. The opts carry the agent's
   *  confirmed/corrected receipt values (reference, payer phone, amount) prefilled from extraction. */
  validateSara(
    ref: string,
    outcome: 'validate' | 'reject',
    opts?: { reason?: string; saraRef?: string; saraPayerPhone?: string; saraAmount?: number },
  ): Observable<Subscription> {
    return this.http.patch<Subscription>(`${this.base}/subscriptions/${ref}/sara-validate`, { outcome, ...opts });
  }
  /** Cashier — validate (→ paid) or reject (→ failed) an in-person cash payment. */
  cashValidate(ref: string, outcome: 'validate' | 'reject', reason?: string): Observable<Subscription> {
    return this.http.patch<Subscription>(`${this.base}/subscriptions/${ref}/cash-validate`, { outcome, reason });
  }
  claim(phone: string, cni: string, niu?: string): Observable<ClaimResult> {
    return this.http.post<ClaimResult>(`${this.base}/subscriptions/claim`, { phone, cni, niu });
  }
  /** Agent/admin — add or correct a client's NIU on an existing subscription. */
  updateNiu(ref: string, niu: string): Observable<Subscription> {
    return this.http.patch<Subscription>(`${this.base}/subscriptions/${ref}/niu`, { niu });
  }

  // ---- card recharge (top-up) ----
  /** Public — create a recharge (returns the created record + payment status). */
  createRecharge(req: CreateRechargeRequest): Observable<Recharge> {
    return this.http.post<Recharge>(`${this.base}/recharges`, req);
  }
  /** Public — poll the live payment status of a recharge. */
  rechargeStatus(ref: string): Observable<{ ref: string; payStatus: PayStatus; message?: string | null }> {
    return this.http.get<{ ref: string; payStatus: PayStatus; message?: string | null }>(`${this.base}/recharges/${ref}/status`);
  }
  /** Staff — search recharges by reference, holder name, or PAN. */
  searchRecharges(q: string): Observable<Recharge[]> {
    return this.http.get<Recharge[]>(`${this.base}/recharges/search`, { params: { q } });
  }
  /** Staff — fetch a single recharge by reference. */
  rechargeByRef(ref: string): Observable<Recharge> {
    return this.http.get<Recharge>(`${this.base}/recharges/${ref}`);
  }
  /** Staff — fetch a recharge's stored SARA receipt as a blob. */
  rechargeImageBlob(ref: string, kind: string): Observable<Blob> {
    return this.http.get(`${this.base}/recharges/${ref}/image/${kind}`, { responseType: 'blob' });
  }
  /** Cashier — validate/reject an in-person cash recharge. */
  cashValidateRecharge(ref: string, outcome: 'validate' | 'reject', reason?: string): Observable<Recharge> {
    return this.http.patch<Recharge>(`${this.base}/recharges/${ref}/cash-validate`, { outcome, reason });
  }
  /** Point of sale — validate/reject a SARA recharge receipt. */
  saraValidateRecharge(
    ref: string,
    outcome: 'validate' | 'reject',
    opts?: { reason?: string; saraRef?: string; saraPayerPhone?: string; saraAmount?: number },
  ): Observable<Recharge> {
    return this.http.patch<Recharge>(`${this.base}/recharges/${ref}/sara-validate`, { outcome, ...opts });
  }
  /** Admin/cashier — all recharges. */
  recharges(): Observable<Recharge[]> {
    return this.http.get<Recharge[]>(`${this.base}/recharges`);
  }
  /** Cashier — recharges paid but not yet credited to the card (the validation queue). */
  pendingRecharges(): Observable<Recharge[]> {
    return this.http.get<Recharge[]>(`${this.base}/recharges/pending-fulfillment`);
  }
  /** Cashier — confirm the effective recharge (card credited). */
  fulfillRecharge(ref: string): Observable<Recharge> {
    return this.http.patch<Recharge>(`${this.base}/recharges/${ref}/fulfill`, {});
  }

  // ---- collectes (ventes de produits bancaires) ----
  /** Collecteur / admin — capture a sale. */
  createCollecte(req: CreateCollecteRequest): Observable<Collecte> {
    return this.http.post<Collecte>(`${this.base}/collectes`, req);
  }
  /** Collecteur / admin — my own collectes. */
  myCollectes(): Observable<Collecte[]> {
    return this.http.get<Collecte[]>(`${this.base}/collectes/mine`);
  }
  /** Admin — all collectes. */
  collectes(): Observable<Collecte[]> {
    return this.http.get<Collecte[]>(`${this.base}/collectes`);
  }
  /** Admin — aggregated stats (by product, by commercial). */
  collecteStats(): Observable<CollecteStats> {
    return this.http.get<CollecteStats>(`${this.base}/collectes/stats`);
  }
  /** Admin / owner — update a collecte. */
  updateCollecte(ref: string, req: CreateCollecteRequest): Observable<Collecte> {
    return this.http.put<Collecte>(`${this.base}/collectes/${ref}`, req);
  }
  /** Admin / owner — delete a collecte. */
  deleteCollecte(ref: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/collectes/${ref}`);
  }

  agents(): Observable<Agent[]> {
    return this.http.get<Agent[]>(`${this.base}/agents`);
  }
  /** Admin — list all staff accounts (any role). */
  users(): Observable<User[]> {
    return this.http.get<User[]>(`${this.base}/users`);
  }
  /** Admin — create a staff account; the backend generates and emails a temporary password. */
  createUser(req: CreateUserRequest): Observable<CreateUserResult> {
    return this.http.post<CreateUserResult>(`${this.base}/users`, req);
  }
  /** Admin — enable or disable a staff account (a disabled account can no longer log in). */
  setUserEnabled(id: string, enabled: boolean): Observable<User> {
    return this.http.patch<User>(`${this.base}/users/${id}/enabled`, { enabled });
  }
  /** Admin — set the full role set of an existing account (multi-role). */
  setUserRoles(id: string, roles: Role[]): Observable<User> {
    return this.http.put<User>(`${this.base}/users/${id}/roles`, { roles });
  }
  /** Admin — recent login attempts (audit trail). */
  loginAudit(): Observable<LoginAudit[]> {
    return this.http.get<LoginAudit[]>(`${this.base}/audit/logins`);
  }
  /** Admin — bulk-import staff accounts; duplicates skipped or updated per updateExisting. */
  importUsers(rows: ImportUserRow[], updateExisting: boolean): Observable<ImportUsersResult> {
    return this.http.post<ImportUsersResult>(`${this.base}/users/import`, { rows, updateExisting });
  }
  resolveAgent(phone: string): Observable<Agent | null> {
    return this.http.get<Agent | null>(`${this.base}/agents/resolve`, { params: { phone } });
  }

  adminStats(): Observable<AdminStats> {
    return this.http.get<AdminStats>(`${this.base}/stats/admin`);
  }
  agentStats(): Observable<AgentStats> {
    return this.http.get<AgentStats>(`${this.base}/stats/agent`);
  }
  /** Print-point KPIs for the logged-in printer (cards printed + queue). */
  printStats(): Observable<PrintStats> {
    return this.http.get<PrintStats>(`${this.base}/stats/print`);
  }
  /** Cashier KPIs for the logged-in cashier (cash validated + queue). */
  cashierStats(): Observable<CashierStats> {
    return this.http.get<CashierStats>(`${this.base}/stats/cashier`);
  }
  /** Admin — Mobile Money payment funnel (acceptance, latency, failure causes, by network). */
  paymentStats(): Observable<PaymentStats> {
    return this.http.get<PaymentStats>(`${this.base}/stats/payments`);
  }
}
