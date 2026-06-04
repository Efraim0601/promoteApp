import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  AdminStats, Agent, AgentStats, CardConfig, ClaimResult,
  CreateSubscriptionRequest, LoginResponse, Subscription, User,
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
  pay(ref: string, outcome: 'validate' | 'fail'): Observable<Subscription> {
    return this.http.patch<Subscription>(`${this.base}/subscriptions/${ref}/pay`, { outcome });
  }

  /** Upload a captured selfie (data URL) → returns its object-storage key. */
  uploadSelfie(image: string): Observable<{ key: string }> {
    return this.http.post<{ key: string }>(`${this.base}/kyc/selfie`, { image });
  }
  /** Fetch the stored selfie image (staff) as a blob, for display. */
  selfieBlob(ref: string): Observable<Blob> {
    return this.http.get(`${this.base}/subscriptions/${ref}/selfie`, { responseType: 'blob' });
  }
  print(ref: string): Observable<Subscription> {
    return this.http.patch<Subscription>(`${this.base}/subscriptions/${ref}/print`, {});
  }
  claim(phone: string, cni: string): Observable<ClaimResult> {
    return this.http.post<ClaimResult>(`${this.base}/subscriptions/claim`, { phone, cni });
  }

  agents(): Observable<Agent[]> {
    return this.http.get<Agent[]>(`${this.base}/agents`);
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
