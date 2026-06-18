/** Shared API types mirroring the backend DTOs. */

export type Role =
  | 'ADMIN' | 'MANAGER' | 'AGENT' | 'PRINT_AGENT' | 'CASHIER'
  | 'COLLECTEUR' | 'SUPERVISEUR' | 'CHEF_EQUIPE';

export type Permission =
  | 'SOUSCRIPTIONS_READ' | 'SOUSCRIPTIONS_WRITE' | 'SOUSCRIPTIONS_VALIDATE'
  | 'SOUSCRIPTIONS_PRINT' | 'SOUSCRIPTIONS_EXPORT'
  | 'RECHARGES_READ' | 'RECHARGES_VALIDATE' | 'RECHARGES_EXPORT'
  | 'COLLECTES_READ' | 'COLLECTES_WRITE' | 'COLLECTES_EXPORT'
  | 'UTILISATEURS_READ' | 'UTILISATEURS_WRITE'
  | 'CONFIG_READ' | 'CONFIG_WRITE'
  | 'PRODUITS_READ' | 'PRODUITS_WRITE'
  | 'PROMOTIONS_READ' | 'PROMOTIONS_WRITE'
  | 'COMMISSIONS_READ' | 'COMMISSIONS_WRITE' | 'COMMISSIONS_EXPORT'
  | 'STATS_READ'
  | 'MESSAGES_READ' | 'MESSAGES_WRITE';

export interface Profile {
  id: number;
  name: string;
  description: string | null;
  builtin: boolean;
  permissions: Permission[];
}

export interface ProfileRequest {
  name: string;
  description: string;
  permissions: Permission[];
}

/** Matrix definition used to render the permission grid in the admin UI. */
export interface PermMatrixModule {
  module: string;
  label: string;
  actions: string[];
}

export const PERM_MATRIX: PermMatrixModule[] = [
  { module: 'SOUSCRIPTIONS', label: 'Souscriptions', actions: ['READ', 'WRITE', 'VALIDATE', 'PRINT', 'EXPORT'] },
  { module: 'RECHARGES',     label: 'Recharges',     actions: ['READ', 'VALIDATE', 'EXPORT'] },
  { module: 'COLLECTES',     label: 'Collectes',     actions: ['READ', 'WRITE', 'EXPORT'] },
  { module: 'PRODUITS',      label: 'Produits',      actions: ['READ', 'WRITE'] },
  { module: 'PROMOTIONS',    label: 'Promotions',    actions: ['READ', 'WRITE'] },
  { module: 'COMMISSIONS',   label: 'Commissions',   actions: ['READ', 'WRITE', 'EXPORT'] },
  { module: 'STATS',         label: 'Statistiques',  actions: ['READ'] },
  { module: 'MESSAGES',      label: 'Messages',      actions: ['READ', 'WRITE'] },
  { module: 'UTILISATEURS',  label: 'Utilisateurs',  actions: ['READ', 'WRITE'] },
  { module: 'CONFIG',        label: 'Configuration', actions: ['READ', 'WRITE'] },
];

/** All assignable roles, in landing-priority order (first present drives the landing page). */
export const ALL_ROLES: Role[] = [
  'ADMIN', 'MANAGER', 'SUPERVISEUR', 'CHEF_EQUIPE', 'AGENT', 'CASHIER', 'PRINT_AGENT', 'COLLECTEUR',
];

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;          // primary role (kept for landing/compat)
  roles?: Role[];      // full set of roles the account holds
  agency: string | null;
  phone: string | null;
  mustChangePassword?: boolean;
  enabled?: boolean;
  createdAt?: string | null;
  profileIds?: number[] | null;
  permissions?: Permission[] | null;
  parentUserId?: string | null;   // hierarchy parent (who this account reports to)
}

/** One audited login attempt (admin view). */
export interface ActionAudit {
  id: string;
  actorId: string | null;
  actorName: string | null;
  actorRoles: string | null;
  action: string;              // CREATE_USER, DELETE_COLLECTE, …
  entityType: string | null;
  entityRef: string | null;
  details: string | null;
  ip: string | null;
  at: string;
}

export interface LoginAudit {
  id: string;
  userId: string | null;
  name: string | null;
  email: string;
  roles: string | null;     // CSV of roles at login time
  success: boolean;
  reason: string | null;    // ok | invalid_credentials | account_disabled
  ip: string | null;
  userAgent: string | null;
  at: string;
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
  rechargeMin: number;   // recharge free-entry lower bound (XAF)
  rechargeMax: number;   // recharge free-entry upper bound (XAF)
  rechargeInitiale: number;  // Offre Promote — recharge initiale, carte prépayée (XAF)
  passPremium: number;       // Offre Promote — Pass Premium, carte prépayée (XAF)
  rechargeInitialeBancaire: number;  // recharge initiale, carte bancaire (XAF)
  passPremiumBancaire: number;       // Pass Premium, carte bancaire (XAF)
}

// ---- catalog: products & promotions ----
export type ProductKind = 'CARD' | 'BANK';
export type PromotionType = 'PRICE' | 'PERCENT';

export interface ProductComponent {
  ckey: string;
  label: string | null;
  amount: number;
}

export interface Promotion {
  id: number;
  productId: number;
  label: string | null;
  type: PromotionType;
  value: number;          // promo price (PRICE) or discount % (PERCENT)
  startDate: string | null;   // yyyy-MM-dd
  endDate: string | null;
  active: boolean;
}

export interface Product {
  id: number;
  code: string;
  label: string;
  description: string | null;
  groupCode: string | null;
  kind: ProductKind;
  basePrice: number;
  effectivePrice: number;     // basePrice with the best live promotion applied
  builtin: boolean;
  active: boolean;
  components: ProductComponent[];
  promotions: Promotion[];
}

export interface ProductRequest {
  code: string;
  label: string;
  description?: string | null;
  groupCode?: string | null;
  kind: ProductKind;
  basePrice: number;
  active: boolean;
  components?: ProductComponent[];
}

export interface PromotionRequest {
  label?: string | null;
  type: PromotionType;
  value: number;
  startDate?: string | null;
  endDate?: string | null;
  active: boolean;
}

// ---- commissions ----
export type CommissionScopeType = 'PRODUCT' | 'GROUP';
export type CommissionTargetType = 'ROLE' | 'USER';
export type CommissionRateType = 'FIXED' | 'PERCENT';
export type CommissionStatus = 'PENDING' | 'VALIDATED' | 'PAID';

export interface CommissionRule {
  id: number;
  scopeType: CommissionScopeType;
  scopeCode: string;
  targetType: CommissionTargetType;
  targetValue: string;       // role name or user id
  rateType: CommissionRateType;
  rateValue: number;         // fixed XAF or percent 0–100
  startDate: string | null;
  endDate: string | null;
  active: boolean;
}

export interface CommissionRuleRequest {
  scopeType: CommissionScopeType;
  scopeCode: string;
  targetType: CommissionTargetType;
  targetValue: string;
  rateType: CommissionRateType;
  rateValue: number;
  startDate?: string | null;
  endDate?: string | null;
  active: boolean;
}

export interface CommissionEntry {
  id: number;
  saleType: 'SUBSCRIPTION' | 'COLLECTE';
  saleRef: string;
  productCode: string;
  beneficiaryId: string;
  beneficiaryName: string | null;
  baseAmount: number;
  amount: number;
  ruleId: number | null;
  status: CommissionStatus;
  createdAt: string | null;
}

// ---- hierarchy-scoped statistics ----
export interface MemberStats {
  id: string;
  name: string;
  role: string;
  subscriptions: number;
  subscriptionsAmount: number;
  collectes: number;
  commissionTotal: number;
}

export interface HierarchyStats {
  scope: 'GLOBAL' | 'SUBTREE';
  totalSubscriptions: number;
  totalSubscriptionsAmount: number;
  totalCollectes: number;
  totalCommissions: number;
  members: MemberStats[];
}

// ---- team (roster + messaging) ----
export interface TeamMember {
  id: string;
  name: string;
  role: string;
  agency: string | null;
}

export interface TeamMessageRequest {
  title: string;
  body: string;
  recipientIds?: string[] | null;   // empty → the whole team
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
  pickupAgencyId?: string | null;    // chosen pickup branch id (delivery == agence)
  pickupAgencyName?: string | null;  // chosen pickup branch name (delivery == agence)
  cardType?: string;  // bancaire | prepaid
  amount: number;
  transport: number;
  rechargeAmount?: number | null;   // part recharge initiale du total (null sur dossiers anciens)
  cardSaleAmount?: number | null;   // part vente carte = amount - rechargeAmount
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
  cashPaymentReference?: string | null; // GAB/external payment reference entered when validating cash
  status: string;     // printed | failed | cash | sara_pending | awaiting
  createdAt: string;
  paymentMessage?: string | null;  // aggregator reason on failure (e.g. "Solde insuffisant")
  failureCategory?: string | null; // classified failure cause (only on a failed payment)
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
  cardType?: string;  // bancaire | prepaid (defaults to bancaire server-side)
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

// ---- card recharge (top-up) ----
export interface CreateRechargeRequest {
  prenom: string;
  nom: string;
  phone: string;
  pan: string;
  amount: number;
  pay: string;
  payPhone?: string | null;
  saraReceiptKey?: string | null;
  saraRef?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  geoAccuracy?: number | null;
}

export interface Recharge {
  ref: string;
  prenom: string;
  nom: string;
  fullName: string;
  phone?: string | null;
  pan: string;
  amount: number;
  pay: string;
  payPhone?: string | null;
  payStatus: PayStatus;
  status: string;
  hasSaraReceipt: boolean;
  saraRef?: string | null;
  saraPayerPhone?: string | null;
  saraAmount?: number | null;
  cashCollectedBy?: string | null;
  cashCollectedAt?: string | null;
  cashPaymentReference?: string | null;
  fulfilled: boolean;            // true once the cashier credited the card and validated
  fulfilledBy?: string | null;
  fulfilledAt?: string | null;
  createdAt: string;
  paymentMessage?: string | null;
}

export interface CreateUserRequest {
  name: string;
  email: string;
  role: Role;          // primary (kept for compat)
  roles?: Role[];      // full set chosen at creation
  agency?: string | null;
  phone?: string | null;
  parentUserId?: string | null;   // hierarchy parent (optional)
}

export interface UpdateUserRequest {
  name: string;
  email: string;
  agency?: string | null;
  phone?: string | null;
  parentUserId?: string | null;   // hierarchy parent (optional)
}

/** Result of a staff creation: the account + the auto-generated temporary password (also emailed).
 *  `pin` is the 4-digit collecteur login PIN, present only when a COLLECTEUR account was created. */
export interface CreateUserResult {
  user: User;
  tempPassword: string;
  pin?: string | null;
  reactivated?: boolean;
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

export interface AgencyPickupBucket {
  id: string;
  name: string;
  count: number;
}

export interface AgencyPickupStats {
  totalAgence: number;
  totalPromote: number;
  totalHome: number;
  byAgency: AgencyPickupBucket[];
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
  totalPrinted: number;
  todayPaid: number;
  todayPrinted: number;
  todayCollected: number;
  todayPending: number;
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

/** One card a print agent remitted; `activated` is true once a PAN was captured. */
export interface PrintCardRow {
  ref: string;
  fullName: string;
  phone: string;
  cardNumber: string | null;
  pan: string | null;
  printedAt: string | null;
  activated: boolean;
}

/** Print agent's card reconciliation (cards remitted vs activated), for checking physical stock. */
export interface PrintReconciliation {
  remises: number;
  activated: number;
  pending: number;
  cards: PrintCardRow[];
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
  orangeFailed: number;
  mtnFailed: number;
  /** NETWORK + UNKNOWN — technical failures shown on the dashboard. */
  networkOrUnknownFailed: number;
  failuresByCategory: FailureBucket[];
  /** Daily MoMo volumes (last 14 days, oldest first). */
  trends: PaymentTrendBucket[];
}

/** One failure-category bucket: a category code + how many failures fall into it. */
export interface FailureBucket {
  category: string;   // INSUFFICIENT_FUNDS | … | NETWORK_OR_UNKNOWN
  count: number;
}

export interface PaymentTrendBucket {
  date: string;   // yyyy-MM-dd
  paid: number;
  failed: number;
  pending: number;
  total: number;
}

export interface ClaimResult {
  ok: boolean;
  reason: string | null;
  record: Subscription | null;
}

// ---- collectes (ventes de produits bancaires) ----
export type CollecteProduct = 'compte_ouvert' | 'carte_bancaire' | 'sara_money' | 'e_first';

export interface CreateCollecteRequest {
  product: CollecteProduct | string;
  clientNom?: string | null;
  clientPhone?: string | null;
  cniNumber?: string | null;        // compte_ouvert, e_first
  accountNumber?: string | null;   // compte_ouvert
  cardNumber?: string | null;      // carte_bancaire
  cardType?: string | null;        // carte_bancaire
}

export interface Collecte {
  ref: string;
  product: string;
  clientNom?: string | null;
  clientPhone?: string | null;
  cniNumber?: string | null;
  accountNumber?: string | null;
  cardNumber?: string | null;
  cardType?: string | null;
  collectedById?: string | null;
  collectedByName?: string | null;
  createdAt: string;
}

export interface CollecteBucket {
  key: string;
  label: string;
  count: number;
}
export interface CollecteStats {
  total: number;
  byProduct: CollecteBucket[];
  byCommercial: CollecteBucket[];
}

// ---- notifications ----
export interface AppNotification {
  id: number;
  title: string;
  body: string | null;
  senderName: string;
  createdAt: string;
  read: boolean;
  imageData?: string | null;
}

export interface SendNotificationRequest {
  title: string;
  body: string;
  recipientIds: string[];
  imageData?: string | null;
}
