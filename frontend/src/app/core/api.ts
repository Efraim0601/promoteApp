import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  AdminStats, Agent, AgentStats, CardConfig, ClaimResult,
  CreateSubscriptionRequest, CreateUserRequest, LoginResponse, PayStatus, Subscription, User,
} from './models';

/** Typed wrapper over the backend REST API (base path /api). */
@Injectable({ providedIn: 'root' })
export class Api {
  private http = inject(HttpClient);
  private base = '/api';

  login(email: string, password: string): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${this.base}/auth/login`, { email, password });
  }
  me(): Observable<User> {
    return this.http.get<User>(`${this.base}/auth/me`);
  }

  getConfig(): Observable<CardConfig> {
    return this.http.get<CardConfig>(`${this.base}/config`);
  }
  updateConfig(c: CardConfig): Observable<CardConfig> {
    return this.http.put<CardConfig>(`${this.base}/config`, c);
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
  /** Poll the live payment status of a subscription (public, lightweight). */
  paymentStatus(ref: string): Observable<{ ref: string; payStatus: PayStatus }> {
    return this.http.get<{ ref: string; payStatus: PayStatus }>(`${this.base}/subscriptions/${ref}/status`);
  }

  /** Upload a captured KYC image (data URL); kind = selfie | cni-recto | cni-verso. */
  uploadImage(image: string, kind: string): Observable<{ key: string }> {
    return this.http.post<{ key: string }>(`${this.base}/kyc/image`, { image, kind });
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
  claim(phone: string, cni: string, niu?: string): Observable<ClaimResult> {
    return this.http.post<ClaimResult>(`${this.base}/subscriptions/claim`, { phone, cni, niu });
  }
  /** Agent/admin — add or correct a client's NIU on an existing subscription. */
  updateNiu(ref: string, niu: string): Observable<Subscription> {
    return this.http.patch<Subscription>(`${this.base}/subscriptions/${ref}/niu`, { niu });
  }

  agents(): Observable<Agent[]> {
    return this.http.get<Agent[]>(`${this.base}/agents`);
  }
  /** Admin — list all staff accounts (any role). */
  users(): Observable<User[]> {
    return this.http.get<User[]>(`${this.base}/users`);
  }
  /** Admin — create a staff account. */
  createUser(req: CreateUserRequest): Observable<User> {
    return this.http.post<User>(`${this.base}/users`, req);
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
}
