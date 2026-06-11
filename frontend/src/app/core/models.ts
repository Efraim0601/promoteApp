/** Shared API types mirroring the backend DTOs. */

export type Role = 'ADMIN' | 'AGENT' | 'PRINT_AGENT' | 'CASHIER';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  agency: string | null;
  phone: string | null;
  mustChangePassword?: boolean;   // true until the user sets their own password (first login)
  enabled?: boolean;              // false → account disabled by an admin (cannot log in)
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
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
  ville: string;      // city / town
  pay: string;        // om | mtn | cash | sara
  payPhone?: string | null;  // MoMo number used for payment (may differ from contact phone)
  delivery: string;   // promote | agence | home
  pickupAgencyName?: string | null;  // chosen pickup branch name (delivery == agence)
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
  saraRef?: string | null;         // extracted from the SARA receipt — agent confirms at point of sale
  saraPayerPhone?: string | null;  // payer ("Émetteur") phone extracted from the receipt
  saraAmount?: number | null;      // total amount extracted from the receipt (XAF)
  cardNumber?: string | null;      // physical card number, entered at the print point
  pan?: string | null;             // PAN (Primary Account Number), captured at card activation
  cashCollectedBy?: string | null; // cashier who validated the in-person cash payment
  cashCollectedAt?: string | null; // when the cash was collected (ISO instant)
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
  ville: string;
  pay: string;
  payPhone?: string | null;
  delivery: string;
  pickupAgencyId?: string | null;  // chosen pickup branch id when delivery == agence
  selfie: boolean;
  selfieKey?: string | null;
  cniRectoKey?: string | null;
  cniVersoKey?: string | null;
  saraReceiptKey?: string | null;
  referrerPhone?: string;
  latitude?: number | null;     // browser GPS captured at subscription time (optional)
  longitude?: number | null;
  geoAccuracy?: number | null;  // accuracy radius in metres (optional)
}

/** One point on the admin map (client subscription or staff member). */
export interface MapPoint {
  type: 'client' | 'staff';
  label: string;
  lat: number | null;      // exact GPS fix, or null when none was captured
  lng: number | null;
  role: string | null;     // staff only — role name
  status: string | null;   // client only — subscription status
  ref: string;             // subscription ref (client) or user id (staff)
  date: string | null;     // ISO instant: subscription createdAt, or last location report
  accuracy: number | null; // fix precision radius in metres
  place: string | null;    // coarse locality (city / agency) to geocode when lat/lng are null
}

export interface CreateUserRequest {
  name: string;
  email: string;
  role: Role;
  agency?: string | null;
  phone?: string | null;
}

/** Result of a staff creation: the account + the auto-generated temporary password (also emailed). */
export interface CreateUserResult {
  user: User;
  tempPassword: string;
}

export interface Agent {
  id: string;
  name: string;
  agency: string | null;
  phone: string | null;
}

// ---- pickup agencies (lieux de retrait) ----
export interface Agency {
  id: string;
  name: string;
  city?: string | null;
}
export interface ImportAgencyRow {
  name: string;
  city?: string | null;
}
export interface ImportAgencyRowResult {
  name: string;
  city?: string | null;
  status: 'created' | 'updated' | 'skipped' | 'invalid';
  reason?: string | null;
}
export interface ImportAgenciesResult {
  created: number;
  updated: number;
  skipped: number;
  invalid: number;
  rows: ImportAgencyRowResult[];
}

// ---- bulk user import ----
export interface ImportUserRow {
  name: string;
  email: string;
  role: string;
  phone?: string | null;
  agency?: string | null;
}
export interface ImportRowResult {
  email: string;
  name: string;
  role: string;
  status: 'created' | 'updated' | 'skipped' | 'invalid';
  reason?: string | null;
  tempPassword?: string | null;
}
export interface ImportUsersResult {
  created: number;
  updated: number;
  skipped: number;
  invalid: number;
  rows: ImportRowResult[];
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

export interface PrintStats {
  myPrinted: number;       // cards I printed (all-time)
  myPrintedToday: number;  // cards I printed today
  queue: number;           // paid but not yet printed (waiting for a card)
  totalPrinted: number;    // all printed cards (global)
}

export interface CashierStats {
  myCount: number;         // cash payments I validated (all-time)
  myCollected: number;     // total amount I collected (XAF)
  myCountToday: number;    // cash payments I validated today
  pendingCount: number;    // cash subscriptions still awaiting collection
  pendingAmount: number;   // total amount still to collect (XAF)
}

export interface PaymentStats {
  momoTotal: number;       // total Mobile Money transactions
  momoPaid: number;
  momoFailed: number;
  momoPending: number;
  orangeTotal: number;
  orangePaid: number;
  mtnTotal: number;
  mtnPaid: number;
  insufficientFunds: number; // failures: insufficient balance
  expired: number;           // failures: PIN never entered / timeout
  otherFailures: number;
  avgConfirmSeconds: number;    // mean PENDING → paid latency
  medianConfirmSeconds: number; // median PENDING → paid latency
}

export interface ClaimResult {
  ok: boolean;
  reason: string | null;
  record: Subscription | null;
}
