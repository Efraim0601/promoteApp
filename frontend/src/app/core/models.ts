// Backend contract types (REST /api). Kept minimal & extended view by view.

export type Role =
  | 'ADMIN'
  | 'MANAGER'
  | 'CHEF_EQUIPE'
  | 'AGENT'
  | 'PRINT_AGENT'
  | 'CASHIER'
  | 'COLLECTEUR'
  | 'SUPERVISEUR';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  roles: Role[];
  agency: string | null;
  phone: string | null;
  mustChangePassword: boolean;
  enabled: boolean;
  createdAt: string | null;
  profileIds: number[];
  permissions: string[];
}

export interface LoginResponse {
  token: string;
  user?: User;
}

// ---- catalogue / souscription ----
export interface PromotionDto {
  id: number;
  productId: number;
  label: string;
  type: string;
  value: number;
  startDate: string;
  endDate: string;
  active: boolean;
}
export interface ProductComponentDto {
  ckey: string;
  label: string;
  amount: number;
}
export interface ProductDto {
  id: number;
  code: string;
  label: string;
  description: string;
  groupCode: string;
  kind: string;
  basePrice: number;
  effectivePrice: number;
  builtin: boolean;
  active: boolean;
  imageKey: string | null;
  components: ProductComponentDto[];
  promotions: PromotionDto[];
}
export interface AgencyDto {
  id: string;
  name: string;
  city: string;
}
export interface ConfigDto {
  price: number;
  fees: number;
  transport: number;
  rechargeMin: number;
  rechargeMax: number;
  rechargeInitiale: number;
  passPremium: number;
  rechargeInitialeBancaire: number;
  passPremiumBancaire: number;
}
export interface PaymentStatusDto {
  ref: string;
  payStatus: string;
  message: string | null;
}

/** Public self-subscription payload (POST /api/subscriptions/self). */
export interface CreateSubscriptionRequest {
  prenom: string;
  nom: string;
  sexe: string; // M | F
  docType: string; // cni | passport | recepisse
  cni: string;
  niu?: string;
  cniExp: string;
  phone: string;
  email: string;
  quartier: string;
  region?: string;
  ville: string;
  pay: string; // om | mtn | cash | sara
  payPhone?: string;
  delivery?: string; // promote | agence | home
  selfie: boolean;
  selfieKey?: string;
  cniRectoKey?: string;
  cniVersoKey?: string;
  saraReceiptKey?: string;
  saraRef?: string;
  referrerPhone?: string;
  latitude?: number | null;
  longitude?: number | null;
  geoAccuracy?: number | null;
  pickupAgencyId?: string;
  cardType?: string; // bancaire | prepaid
  productCode?: string;
  naissance?: string; // dd/MM/yyyy
}

export interface CreateRechargeRequest {
  prenom: string;
  nom: string;
  phone: string;
  pan: string;
  amount: number;
  pay: string;
  payPhone?: string;
  saraReceiptKey?: string;
  saraRef?: string;
  latitude?: number | null;
  longitude?: number | null;
  geoAccuracy?: number | null;
}
export interface RechargeDto {
  ref: string;
  fullName: string;
  phone: string;
  pan: string;
  amount: number;
  pay: string;
  payStatus: string;
  status: string;
  createdAt: string;
  paymentMessage: string | null;
  [k: string]: unknown;
}

export interface SubscriptionDto {
  ref: string;
  fullName: string;
  amount: number;
  transport: number;
  productCode: string;
  productLabel: string;
  pay: string;
  payStatus: string;
  status: string;
  createdAt: string;
  paymentMessage: string | null;
  phone?: string;
  delivery?: string;
  printed?: boolean;
  agentId?: string;
  referrerName?: string;
  [k: string]: unknown;
}

export interface AgentStats {
  total: number;
  paid: number;
  pending: number;
  collected: number;
}
export interface CashierStats {
  myCount: number;
  myCollected: number;
  myCountToday: number;
  pendingCount: number;
  pendingAmount: number;
}
export interface PrintStats {
  myPrinted: number;
  myPrintedToday: number;
  queue: number;
  totalPrinted: number;
}
export interface CollecteDto {
  ref: string;
  product: string;
  clientNom: string;
  clientPhone: string;
  accountNumber: string;
  cardNumber: string;
  cardType: string;
  collectedById: string;
  collectedByName: string;
  createdAt: string;
}
export interface CreateCollecteRequest {
  product: string;
  clientNom?: string;
  clientPhone?: string;
  accountNumber?: string;
  cardNumber?: string;
  cardType?: string;
}
export interface CollecteBucket { key: string; label: string; count: number; }
export interface CollecteStats {
  total: number;
  byProduct: CollecteBucket[];
  byCommercial: CollecteBucket[];
}

// ---- admin ----
export interface AdminStats {
  total: number; paid: number; pending: number; collected: number; totalPrinted: number;
  todayPaid: number; todayPrinted: number; todayCollected: number; todayPending: number;
}
export interface PaymentStats {
  momoTotal: number; momoPaid: number; momoFailed: number; momoPending: number;
  orangeTotal: number; orangePaid: number; mtnTotal: number; mtnPaid: number;
  orangeFailed: number; mtnFailed: number;
  insufficientFunds: number; expired: number; otherFailures: number;
  avgConfirmSeconds: number; medianConfirmSeconds: number;
}
export interface UserDto {
  id: string; name: string; email: string; role: string; roles: string[];
  agency: string | null; phone: string | null; mustChangePassword: boolean; enabled: boolean;
  createdAt: string | null; profileIds: number[]; permissions: string[]; parentUserId: string | null;
}
export interface CreateUserRequest {
  name: string; email: string; role?: string; roles?: string[];
  agency?: string; phone?: string; parentUserId?: string;
}
// ---- bulk user import ----
export interface ImportUserRow {
  name: string; email: string; role: string; phone?: string; agency?: string;
}
export interface ImportUsersRequest { rows: ImportUserRow[]; updateExisting: boolean; }
export interface ImportRowResult {
  email: string; name: string; role: string;
  status: 'created' | 'updated' | 'skipped' | 'invalid';
  reason: string | null; password: string | null;
}
export interface ImportUsersResult {
  created: number; updated: number; skipped: number; invalid: number;
  rows: ImportRowResult[];
}
export interface ProfileDto {
  id: number; name: string; description: string; builtin: boolean; permissions: string[];
}
export interface LoginAuditDto {
  id: string; userId: string; name: string; email: string; roles: string;
  success: boolean; reason: string; ip: string; userAgent: string; at: string;
}
export interface ActionAuditDto {
  id: string; actorId: string; actorName: string; actorRoles: string;
  action: string; entityType: string; entityRef: string; details: string; ip: string; at: string;
}

// ---- manager / team ----
export interface CommissionRuleDto {
  id: number; scopeType: string; scopeCode: string; targetType: string; targetValue: string;
  rateType: string; rateValue: number; startDate: string; endDate: string; active: boolean;
}
export interface CommissionEntryDto {
  id: number; saleType: string; saleRef: string; productCode: string;
  beneficiaryId: string; beneficiaryName: string; baseAmount: number; amount: number;
  ruleId: number; status: string; createdAt: string;
}
export interface MemberStatsDto {
  id: string; name: string; role: string; subscriptions: number;
  subscriptionsAmount: number; collectes: number; commissionTotal: number;
}
export interface HierarchyStatsDto {
  scope: string; totalSubscriptions: number; totalSubscriptionsAmount: number;
  totalCollectes: number; totalCommissions: number; members: MemberStatsDto[];
}
export interface TeamMemberDto { id: string; name: string; role: string; agency: string; }

export interface NotificationDto {
  id: number; title: string; body: string; senderName: string;
  createdAt: string; read: boolean; imageData: string | null;
}
