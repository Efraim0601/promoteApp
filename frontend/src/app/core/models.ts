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

export type PayStatus = 'pending' | 'paid' | 'cash' | 'failed';

export interface Subscription {
  ref: string;
  prenom: string;
  nom: string;
  fullName: string;
  cni: string;
  cniExp: string;
  phone: string;
  pay: string;        // om | mtn | cash
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
  status: string;     // printed | failed | cash | awaiting
  createdAt: string;
}

export interface CreateSubscriptionRequest {
  prenom: string;
  nom: string;
  cni: string;
  cniExp: string;     // dd/MM/yyyy
  phone: string;      // 9 digits
  pay: string;
  delivery: string;
  selfie: boolean;
  selfieKey?: string | null;
  cniRectoKey?: string | null;
  cniVersoKey?: string | null;
  referrerPhone?: string;
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
