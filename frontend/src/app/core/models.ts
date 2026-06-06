/** Shared API types mirroring the backend DTOs. */

export type Role = 'ADMIN' | 'AGENT' | 'PRINT_AGENT';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  agency: string | null;
  phone: string | null;
}

export interface LoginResponse {
  token: string;
  user: User;
}

export interface CardConfig {
  price: number;
  fees: number;
  transport: number;
}

export type PayStatus = 'pending' | 'paid' | 'cash' | 'sara_pending' | 'failed';

export interface Subscription {
  ref: string;
  prenom: string;
  nom: string;
  fullName: string;
  sexe: string;
  email: string;
  cni: string;
  niu: string | null;   // unique taxpayer id (NIU) — optional
  cniExp: string;
  phone: string;
  quartier: string;
  region: string;
  pay: string;        // om | mtn | cash | sara
  delivery: string;   // promote | agence | home
  amount: number;
  transport: number;
  channel: string;    // agent | self
  agentId: string | null;
  referrerName: string | null;
  referrerPhone: string | null;
  payStatus: PayStatus;
  printed: boolean;
  selfieVerified: boolean;
  hasSelfie: boolean;
  hasCniRecto: boolean;
  hasCniVerso: boolean;
  hasSaraReceipt: boolean;
  status: string;     // printed | failed | cash | sara_pending | awaiting
  createdAt: string;
  paymentMessage?: string | null;  // aggregator reason on failure (e.g. "Solde insuffisant")
}

export interface CreateSubscriptionRequest {
  prenom: string;
  nom: string;
  sexe: string;       // M | F
  cni: string;
  niu?: string | null;   // NIU (taxpayer id) — optional
  cniExp: string;     // dd/MM/yyyy
  phone: string;      // 9 digits
  email: string;
  quartier: string;
  region: string;
  pay: string;
  payPhone?: string | null;
  delivery: string;
  selfie: boolean;
  selfieKey?: string | null;
  cniRectoKey?: string | null;
  cniVersoKey?: string | null;
  saraReceiptKey?: string | null;
  referrerPhone?: string;
}

export interface CreateUserRequest {
  name: string;
  email: string;
  role: Role;
  password: string;
  agency?: string | null;
  phone?: string | null;
}

export interface Agent {
  id: string;
  name: string;
  agency: string | null;
  phone: string | null;
}

export interface AgentBreakdown {
  id: string;
  name: string;
  agency: string | null;
  role: string;       // agent | online
  count: number;
  collected: number;
}

export interface AdminStats {
  total: number;
  paid: number;
  pending: number;
  collected: number;
  byAgent: AgentBreakdown[];
}

export interface AgentStats {
  total: number;
  paid: number;
  pending: number;
  collected: number;
}

export interface ClaimResult {
  ok: boolean;
  reason: string | null;
  record: Subscription | null;
}
