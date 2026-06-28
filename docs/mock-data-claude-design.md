# Données mock — Portail Afriland (Claude Design / React)

> Jeu de données **cohérent avec la hiérarchie** à coller dans le prototype (ex. `mockData.ts`). Tous les `parentId`, `agentId`, `beneficiaryId` se référencent entre eux. Les KPI/graphiques/rosters se **calculent** à partir de ces tableaux et **changent selon le rôle connecté** (scoping par sous-arbre).
>
> Organigramme : `admin → manager → {sup-1, sup-2}` ; `sup-1 → {chef-1, chef-2}` ; `sup-2 → {chef-3}` ; `chef-1 → {com-1, com-2}` ; `chef-2 → {com-3, com-4}` ; `chef-3 → {com-5, com-6}`. `cashier-1` et `print-1` rattachés au manager.

```ts
// ============================================================
// mockData.ts — Afriland portal prototype (Claude Design)
// ============================================================

export type Role =
  | 'ADMIN' | 'MANAGER' | 'SUPERVISEUR' | 'CHEF_EQUIPE'
  | 'COMMERCIAL' | 'CASHIER' | 'PRINT_AGENT';

export type PayStatus = 'pending' | 'paid' | 'cash' | 'sara_pending' | 'failed';
export type PayMethod = 'om' | 'mtn' | 'sara' | 'cash';
export type ProductType = 'CARTE_PHYSIQUE' | 'CARTE_VIRTUELLE' | 'COMPTE' | 'SERVICE';

// ---------- Mot de passe de démo (tous les comptes) ----------
export const DEMO_PASSWORD = 'demo';

// ---------- Agences ----------
export const AGENCIES = [
  { id: 'ag-1', name: 'Agence Yaoundé Centre', city: 'Yaoundé', active: true },
  { id: 'ag-2', name: 'Agence Douala Akwa',    city: 'Douala',  active: true },
  { id: 'ag-3', name: 'Agence Bafoussam',      city: 'Bafoussam', active: true },
  { id: 'ag-4', name: 'Agence Garoua',         city: 'Garoua',  active: false },
];

// ---------- Utilisateurs (hiérarchie) ----------
// parentId = responsable hiérarchique ; null au sommet.
export const USERS = [
  { id: 'admin',   name: 'Direction Promote',  email: 'admin@afrilandfirstbank.com',  roles: ['ADMIN'],       agency: null,    phone: '699000001', parentId: null,      enabled: true, mustChangePassword: false },
  { id: 'manager', name: 'Carine MBALLA',      email: 'manager@afrilandfirstbank.com',roles: ['MANAGER'],     agency: null,    phone: '699000002', parentId: 'admin',   enabled: true, mustChangePassword: false },

  { id: 'sup-1',   name: 'Paul ESSOMBA',       email: 'sup1@afrilandfirstbank.com',   roles: ['SUPERVISEUR'], agency: 'Agence Yaoundé Centre', phone: '699000010', parentId: 'manager', enabled: true, mustChangePassword: false },
  { id: 'sup-2',   name: 'Aïcha BELLO',        email: 'sup2@afrilandfirstbank.com',   roles: ['SUPERVISEUR'], agency: 'Agence Douala Akwa',    phone: '699000011', parentId: 'manager', enabled: true, mustChangePassword: false },

  { id: 'chef-1',  name: 'Yvan NGAMENI',       email: 'chef1@afrilandfirstbank.com',  roles: ['CHEF_EQUIPE'], agency: 'Agence Yaoundé Centre', phone: '699000020', parentId: 'sup-1', enabled: true, mustChangePassword: false },
  { id: 'chef-2',  name: 'Sandrine FOTSO',     email: 'chef2@afrilandfirstbank.com',  roles: ['CHEF_EQUIPE'], agency: 'Agence Bafoussam',      phone: '699000021', parentId: 'sup-1', enabled: true, mustChangePassword: false },
  { id: 'chef-3',  name: 'Boris EYENGA',       email: 'chef3@afrilandfirstbank.com',  roles: ['CHEF_EQUIPE'], agency: 'Agence Douala Akwa',    phone: '699000022', parentId: 'sup-2', enabled: true, mustChangePassword: false },

  { id: 'com-1',   name: 'Larissa NANA',       email: 'com1@afrilandfirstbank.com',   roles: ['COMMERCIAL'],  agency: 'Agence Yaoundé Centre', phone: '690110001', parentId: 'chef-1', enabled: true, mustChangePassword: false },
  { id: 'com-2',   name: 'Junior TCHOUMI',     email: 'com2@afrilandfirstbank.com',   roles: ['COMMERCIAL'],  agency: 'Agence Yaoundé Centre', phone: '690110002', parentId: 'chef-1', enabled: true, mustChangePassword: false },
  { id: 'com-3',   name: 'Mariam SALIHOU',     email: 'com3@afrilandfirstbank.com',   roles: ['COMMERCIAL'],  agency: 'Agence Bafoussam',      phone: '690110003', parentId: 'chef-2', enabled: true, mustChangePassword: false },
  { id: 'com-4',   name: 'Cédric ABEGA',       email: 'com4@afrilandfirstbank.com',   roles: ['COMMERCIAL'],  agency: 'Agence Bafoussam',      phone: '690110004', parentId: 'chef-2', enabled: true, mustChangePassword: false },
  { id: 'com-5',   name: 'Diane KAMGA',        email: 'com5@afrilandfirstbank.com',   roles: ['COMMERCIAL'],  agency: 'Agence Douala Akwa',    phone: '690110005', parentId: 'chef-3', enabled: true, mustChangePassword: false },
  { id: 'com-6',   name: 'Franck OWONA',       email: 'com6@afrilandfirstbank.com',   roles: ['COMMERCIAL','CASHIER'], agency: 'Agence Douala Akwa', phone: '690110006', parentId: 'chef-3', enabled: false, mustChangePassword: false },

  { id: 'cashier-1', name: 'Estelle MANGA',    email: 'caisse@afrilandfirstbank.com', roles: ['CASHIER'],     agency: 'Agence Yaoundé Centre', phone: '699000030', parentId: 'manager', enabled: true, mustChangePassword: false },
  { id: 'print-1',   name: 'Hervé NLEND',      email: 'impression@afrilandfirstbank.com', roles: ['PRINT_AGENT'], agency: 'Agence Yaoundé Centre', phone: '699000031', parentId: 'manager', enabled: true, mustChangePassword: true },
];

// ---------- Catalogue produits (généralisé) ----------
// effectivePrice calculé depuis basePrice + promo active (voir helper en bas).
export const PRODUCTS = [
  // Cartes physiques
  { id: 1,  code: 'visa_classic',   label: 'Carte Visa Classic',   category: 'Cartes',   type: 'CARTE_PHYSIQUE', basePrice: 15000, active: true, builtin: false,
    components: [{ key: 'fees', label: 'Frais d’émission', amount: 5000 }, { key: 'rechargeInitiale', label: 'Recharge initiale', amount: 7500 }, { key: 'passPremium', label: 'Pass Premium', amount: 2500 }, { key: 'transport', label: 'Livraison domicile', amount: 1000 }] },
  { id: 2,  code: 'visa_gold',      label: 'Carte Visa Gold',      category: 'Cartes',   type: 'CARTE_PHYSIQUE', basePrice: 30000, active: true, builtin: false,
    components: [{ key: 'fees', label: 'Frais d’émission', amount: 10000 }, { key: 'rechargeInitiale', label: 'Recharge initiale', amount: 15000 }, { key: 'passPremium', label: 'Pass Premium', amount: 5000 }, { key: 'transport', label: 'Livraison domicile', amount: 1500 }] },
  { id: 3,  code: 'visa_premium',   label: 'Carte Visa Premium',   category: 'Cartes',   type: 'CARTE_PHYSIQUE', basePrice: 60000, active: true, builtin: false, components: [] },
  { id: 4,  code: 'mc_standard',    label: 'Mastercard Standard',  category: 'Cartes',   type: 'CARTE_PHYSIQUE', basePrice: 15000, active: true, builtin: false, components: [] },
  { id: 5,  code: 'mc_world',       label: 'Mastercard World',     category: 'Cartes',   type: 'CARTE_PHYSIQUE', basePrice: 45000, active: true, builtin: false, components: [] },
  { id: 6,  code: 'carte_promote',  label: 'Carte Prépayée Promote', category: 'Cartes', type: 'CARTE_PHYSIQUE', basePrice: 10000, active: true, builtin: true,
    components: [{ key: 'fees', label: 'Frais d’émission', amount: 2500 }, { key: 'rechargeInitiale', label: 'Recharge initiale', amount: 2500 }, { key: 'passPremium', label: 'Pass Premium', amount: 2000 }, { key: 'transport', label: 'Livraison domicile', amount: 1000 }] },
  // Carte virtuelle
  { id: 7,  code: 'carte_virtuelle', label: 'Carte Virtuelle',     category: 'Cartes',   type: 'CARTE_VIRTUELLE', basePrice: 5000,  active: true, builtin: false, components: [] },
  // Comptes
  { id: 8,  code: 'compte_courant', label: 'Compte Courant',       category: 'Comptes',  type: 'COMPTE',  basePrice: 0,     active: true, builtin: true, components: [] },
  { id: 9,  code: 'compte_epargne', label: 'Compte Épargne',       category: 'Comptes',  type: 'COMPTE',  basePrice: 0,     active: true, builtin: false, components: [] },
  { id: 10, code: 'e_first',        label: 'e-First (compte digital)', category: 'Comptes', type: 'COMPTE', basePrice: 0,  active: true, builtin: true, components: [] },
  // Services
  { id: 11, code: 'sara_money',     label: 'SARA Money',           category: 'Services', type: 'SERVICE', basePrice: 0,     active: true, builtin: true, components: [] },
  { id: 12, code: 'pass_premium',   label: 'Pass Premium',         category: 'Services', type: 'SERVICE', basePrice: 2000,  active: true, builtin: false, components: [] },
];

// ---------- Promotions actives ----------
export const PROMOTIONS = [
  { id: 1, productId: 1, label: 'Promo rentrée Visa Classic', type: 'PERCENT', value: 20, startDate: '2026-06-01', endDate: '2026-07-31', active: true },
  { id: 2, productId: 6, label: 'Prépayée à prix réduit',     type: 'PRICE',   value: 7500, startDate: null, endDate: null, active: true },
];

// ---------- Souscriptions (échantillon ; dupliquer/varier pour atteindre 30–50) ----------
// agentId = commercial propriétaire ; referrerPhone9 crédite un parrain commercial.
export const SUBSCRIPTIONS = [
  { ref: 'PRM-1001', fullName: 'Jean DUPONT',     sexe: 'M', cni: 'AB123456', cniExp: '15/12/2028', niu: 'P012345678901A', phone: '+237690200001', email: 'jean@ex.cm', quartier: 'Bastos', region: 'Centre',   ville: 'Yaoundé',   productCode: 'visa_classic',  pay: 'mtn',  payPhone: '+237670200001', payStatus: 'paid',         delivery: 'promote', amount: 12000, transport: 0,    agentId: 'com-1', referrerPhone9: null,        printed: true,  pan: '4977 **** **** 1234', createdAt: '2026-06-22T09:12:00Z', paidAt: '2026-06-22T09:14:00Z' },
  { ref: 'PRM-1002', fullName: 'Marie KAMGA',     sexe: 'F', cni: 'CD234567', cniExp: '03/09/2027', niu: null,            phone: '+237690200002', email: 'marie@ex.cm', quartier: 'Mvan',   region: 'Centre',   ville: 'Yaoundé',   productCode: 'carte_promote', pay: 'om',   payPhone: '+237690200002', payStatus: 'paid',         delivery: 'agence',  amount: 7500,  transport: 0,    agentId: 'com-1', referrerPhone9: null,        printed: false, pan: null,                  createdAt: '2026-06-22T11:40:00Z', paidAt: '2026-06-22T11:42:00Z' },
  { ref: 'PRM-1003', fullName: 'Paul ETOO',       sexe: 'M', cni: 'EF345678', cniExp: '20/01/2029', niu: null,            phone: '+237690200003', email: 'paul@ex.cm', quartier: 'Akwa',   region: 'Littoral', ville: 'Douala',    productCode: 'visa_gold',     pay: 'mtn',  payPhone: '+237680200003', payStatus: 'pending',      delivery: 'home',    amount: 31500, transport: 1500, agentId: 'com-2', referrerPhone9: null,        printed: false, pan: null,                  createdAt: '2026-06-23T08:05:00Z', paidAt: null },
  { ref: 'PRM-1004', fullName: 'Aline NDONGO',    sexe: 'F', cni: 'GH456789', cniExp: '11/05/2026', niu: null,            phone: '+237690200004', email: 'aline@ex.cm', quartier: 'Bonabéri', region: 'Littoral', ville: 'Douala',  productCode: 'mc_standard',   pay: 'cash', payPhone: null,             payStatus: 'cash',         delivery: 'promote', amount: 15000, transport: 0,    agentId: 'com-2', referrerPhone9: '110001',    printed: false, pan: null,                  createdAt: '2026-06-23T10:30:00Z', paidAt: null },
  { ref: 'PRM-1005', fullName: 'Eric MANGA',      sexe: 'M', cni: 'IJ567890', cniExp: '28/02/2030', niu: 'P998877665544B', phone: '+237690200005', email: 'eric@ex.cm', quartier: 'Tamdja',  region: 'Ouest',    ville: 'Bafoussam', productCode: 'carte_promote', pay: 'sara', payPhone: null,             payStatus: 'sara_pending', delivery: 'agence',  amount: 7500,  transport: 0,    agentId: 'com-3', referrerPhone9: null,        printed: false, pan: null,                  createdAt: '2026-06-23T14:15:00Z', paidAt: null },
  { ref: 'PRM-1006', fullName: 'Sylvie TCHALEU',  sexe: 'F', cni: 'KL678901', cniExp: '09/07/2028', niu: null,            phone: '+237690200006', email: 'sylvie@ex.cm', quartier: 'Famla',  region: 'Ouest',    ville: 'Bafoussam', productCode: 'visa_classic',  pay: 'mtn',  payPhone: '+237670200006', payStatus: 'failed',       delivery: 'promote', amount: 12000, transport: 0,    agentId: 'com-3', referrerPhone9: null,        printed: false, pan: null,                  createdAt: '2026-06-23T16:50:00Z', failedAt: '2026-06-23T16:55:00Z', paymentMessage: 'Solde insuffisant' },
  { ref: 'PRM-1007', fullName: 'Georges FOE',     sexe: 'M', cni: 'MN789012', cniExp: '14/11/2027', niu: null,            phone: '+237690200007', email: 'georges@ex.cm', quartier: 'Akwa', region: 'Littoral', ville: 'Douala',    productCode: 'mc_world',      pay: 'om',   payPhone: '+237690200007', payStatus: 'paid',         delivery: 'promote', amount: 45000, transport: 0,    agentId: 'com-5', referrerPhone9: null,        printed: true,  pan: '5412 **** **** 9090', createdAt: '2026-06-24T07:20:00Z', paidAt: '2026-06-24T07:23:00Z' },
  { ref: 'PRM-1008', fullName: 'Nadia BIYA',      sexe: 'F', cni: 'OP890123', cniExp: '22/03/2029', niu: null,            phone: '+237690200008', email: 'nadia@ex.cm', quartier: 'Bonapriso', region: 'Littoral', ville: 'Douala', productCode: 'carte_virtuelle', pay: 'mtn', payPhone: '+237680200008', payStatus: 'paid',         delivery: 'promote', amount: 5000,  transport: 0,    agentId: 'com-5', referrerPhone9: null,        printed: false, pan: null,                  createdAt: '2026-06-24T09:00:00Z', paidAt: '2026-06-24T09:01:00Z' },
  { ref: 'PRM-1009', fullName: 'Thierry MEKA',    sexe: 'M', cni: 'QR901234', cniExp: '30/06/2028', niu: null,            phone: '+237690200009', email: 'thierry@ex.cm', quartier: 'Mendong', region: 'Centre',  ville: 'Yaoundé',   productCode: 'compte_courant', pay: 'cash', payPhone: null,            payStatus: 'paid',         delivery: 'promote', amount: 0,     transport: 0,    agentId: 'com-4', referrerPhone9: null,        printed: false, pan: null,                  createdAt: '2026-06-24T10:10:00Z', paidAt: '2026-06-24T10:30:00Z' },
  { ref: 'PRM-1010', fullName: 'Brenda SOH',      sexe: 'F', cni: 'ST012345', cniExp: '18/08/2030', niu: null,            phone: '+237690200010', email: 'brenda@ex.cm', quartier: 'Bali',   region: 'Littoral', ville: 'Douala',    productCode: 'visa_gold',     pay: 'mtn',  payPhone: '+237670200010', payStatus: 'pending',      delivery: 'agence',  amount: 30000, transport: 0,    agentId: 'com-6', referrerPhone9: null,        printed: false, pan: null,                  createdAt: '2026-06-24T11:25:00Z', paidAt: null },
];

// ---------- Recharges ----------
export const RECHARGES = [
  { ref: 'RC-000001', fullName: 'Jean DUPONT', phone: '+237690200001', pan: '4977 **** **** 1234', amount: 20000, pay: 'mtn',  payStatus: 'paid', fulfilled: true,  createdAt: '2026-06-23T12:00:00Z' },
  { ref: 'RC-000002', fullName: 'Marie KAMGA', phone: '+237690200002', pan: '5078 **** **** 5678', amount: 10000, pay: 'om',   payStatus: 'paid', fulfilled: false, createdAt: '2026-06-24T08:30:00Z' }, // → file "à créditer"
  { ref: 'RC-000003', fullName: 'Eric MANGA',  phone: '+237690200005', pan: '4977 **** **** 4321', amount: 5000,  pay: 'cash', payStatus: 'cash', fulfilled: false, createdAt: '2026-06-24T09:45:00Z' },
];

// ---------- Collectes (produits bancaires terrain) ----------
export const COLLECTES = [
  { ref: 'COL-000001', product: 'compte_ouvert', clientNom: 'Albert NJOYA',   clientPhone: '+237691000001', accountNumber: '00012345678', cardNumber: null,                cardType: null,            collectedById: 'com-1', createdAt: '2026-06-22T10:00:00Z' },
  { ref: 'COL-000002', product: 'carte_bancaire', clientNom: 'Pauline EKWA',  clientPhone: '+237691000002', accountNumber: null,         cardNumber: '4977 **** **** 7777', cardType: 'carte_visa_classic', collectedById: 'com-3', createdAt: '2026-06-23T11:30:00Z' },
  { ref: 'COL-000003', product: 'sara_money',     clientNom: 'Hervé TALLA',   clientPhone: '+237691000003', accountNumber: null,         cardNumber: null,                cardType: null,            collectedById: 'com-5', createdAt: '2026-06-24T09:15:00Z' },
  { ref: 'COL-000004', product: 'e_first',        clientNom: 'Linda MBOG',    clientPhone: '+237691000004', accountNumber: null,         cardNumber: null,                cardType: null,            collectedById: 'com-2', createdAt: '2026-06-24T13:40:00Z' },
];

// ---------- Règles de commission ----------
// Résolution : USER > ROLE ; PRODUCT > GROUP ; plus récente gagne.
export const COMMISSION_RULES = [
  { id: 1, scopeType: 'GROUP',   scopeCode: 'Cartes',       targetType: 'ROLE', targetValue: 'COMMERCIAL', rateType: 'PERCENT', rateValue: 5,    active: true, startDate: null, endDate: null },
  { id: 2, scopeType: 'PRODUCT', scopeCode: 'visa_gold',    targetType: 'ROLE', targetValue: 'COMMERCIAL', rateType: 'FIXED',   rateValue: 2000, active: true, startDate: null, endDate: null },
  { id: 3, scopeType: 'GROUP',   scopeCode: 'Comptes',      targetType: 'ROLE', targetValue: 'COMMERCIAL', rateType: 'FIXED',   rateValue: 1000, active: true, startDate: null, endDate: null },
  { id: 4, scopeType: 'PRODUCT', scopeCode: 'visa_premium', targetType: 'USER', targetValue: 'com-1',      rateType: 'PERCENT', rateValue: 8,    active: true, startDate: null, endDate: null },
];

// ---------- Commissions générées (idempotentes par sale+beneficiary) ----------
export const COMMISSION_ENTRIES = [
  { id: 1, saleType: 'SUBSCRIPTION', saleRef: 'PRM-1001', productCode: 'visa_classic', beneficiaryId: 'com-1', baseAmount: 12000, amount: 600,  ruleId: 1, status: 'VALIDATED', createdAt: '2026-06-22T09:14:00Z' },
  { id: 2, saleType: 'SUBSCRIPTION', saleRef: 'PRM-1002', productCode: 'carte_promote', beneficiaryId: 'com-1', baseAmount: 7500, amount: 375,  ruleId: 1, status: 'PENDING',   createdAt: '2026-06-22T11:42:00Z' },
  { id: 3, saleType: 'SUBSCRIPTION', saleRef: 'PRM-1007', productCode: 'mc_world',     beneficiaryId: 'com-5', baseAmount: 45000, amount: 2250, ruleId: 1, status: 'PAID',      createdAt: '2026-06-24T07:23:00Z' },
  { id: 4, saleType: 'COLLECTE',     saleRef: 'COL-000001', productCode: 'compte_ouvert', beneficiaryId: 'com-1', baseAmount: 0,   amount: 1000, ruleId: 3, status: 'VALIDATED', createdAt: '2026-06-22T10:00:00Z' },
];

// ---------- Notifications ----------
export const NOTIFICATIONS = [
  { id: 1, title: 'Objectif du mois', body: 'Bravo l’équipe, +12% vs mai. Continuez !', senderName: 'Yvan NGAMENI', recipientId: 'com-1', createdAt: '2026-06-24T08:00:00Z', read: false, imageData: null },
  { id: 2, title: 'Nouvelle promo Visa Classic', body: '-20% jusqu’au 31 juillet.', senderName: 'Carine MBALLA', recipientId: 'com-1', createdAt: '2026-06-23T17:00:00Z', read: false, imageData: null },
  { id: 3, title: 'Réunion superviseurs', body: 'Vendredi 10h en visio.', senderName: 'Direction Promote', recipientId: 'sup-1', createdAt: '2026-06-22T15:30:00Z', read: true, imageData: null },
];

// ---------- Audit ----------
export const LOGIN_AUDIT = [
  { id: 'l1', userId: 'admin',  name: 'Direction Promote', email: 'admin@afrilandfirstbank.com', roles: 'ADMIN',      success: true,  reason: 'ok',                  ip: '102.244.10.5', at: '2026-06-24T07:00:00Z' },
  { id: 'l2', userId: null,     name: '',                  email: 'inconnu@x.cm',                roles: null,         success: false, reason: 'invalid_credentials', ip: '102.244.10.9', at: '2026-06-24T07:05:00Z' },
  { id: 'l3', userId: 'com-1',  name: 'Larissa NANA',      email: 'com1@afrilandfirstbank.com',  roles: 'COMMERCIAL', success: true,  reason: 'ok',                  ip: '41.202.0.12',  at: '2026-06-24T08:01:00Z' },
];
export const ACTION_AUDIT = [
  { id: 'a1', actorId: 'manager', actorName: 'Carine MBALLA',     action: 'CREATE_PRODUCT', entityType: 'PRODUCT', entityRef: 'visa_premium', details: 'Création produit Visa Premium', ip: '41.202.0.2', at: '2026-06-20T09:00:00Z' },
  { id: 'a2', actorId: 'admin',   actorName: 'Direction Promote', action: 'CREATE_USER',    entityType: 'USER',    entityRef: 'com-6',        details: 'Création commercial Franck OWONA', ip: '102.244.10.5', at: '2026-06-21T10:30:00Z' },
  { id: 'a3', actorId: 'cashier-1', actorName: 'Estelle MANGA',   action: 'CASH_VALIDATE',  entityType: 'SUBSCRIPTION', entityRef: 'PRM-1009', details: 'Encaissement espèces 0 FCFA', ip: '41.202.0.30', at: '2026-06-24T10:30:00Z' },
];

// ---------- Profils & permissions (habilitations) ----------
export const PERM_MODULES = [
  { module: 'SOUSCRIPTIONS', label: 'Souscriptions', actions: ['READ','WRITE','VALIDATE','PRINT','EXPORT'] },
  { module: 'RECHARGES',     label: 'Recharges',     actions: ['READ','VALIDATE','EXPORT'] },
  { module: 'COLLECTES',     label: 'Collectes',     actions: ['READ','WRITE','EXPORT'] },
  { module: 'PRODUITS',      label: 'Produits',      actions: ['READ','WRITE'] },
  { module: 'PROMOTIONS',    label: 'Promotions',    actions: ['READ','WRITE'] },
  { module: 'COMMISSIONS',   label: 'Commissions',   actions: ['READ','WRITE','EXPORT'] },
  { module: 'STATS',         label: 'Statistiques',  actions: ['READ'] },
  { module: 'MESSAGES',      label: 'Messagerie',    actions: ['READ','WRITE'] },
  { module: 'UTILISATEURS',  label: 'Utilisateurs',  actions: ['READ','WRITE'] },
  { module: 'CONFIG',        label: 'Configuration', actions: ['READ','WRITE'] },
];
export const PROFILES = [
  { id: 1, name: 'Administrateur', builtin: true, permissions: ['*'] },
  { id: 2, name: 'Commercial',     builtin: true, permissions: ['SOUSCRIPTIONS_READ','SOUSCRIPTIONS_WRITE','COLLECTES_READ','COLLECTES_WRITE','STATS_READ'] },
  { id: 3, name: 'Caissier',       builtin: true, permissions: ['SOUSCRIPTIONS_READ','RECHARGES_READ','RECHARGES_VALIDATE'] },
];

// ---------- Configuration tarifaire ----------
export const CONFIG = {
  price: 10000, fees: 2500, transport: 1000,
  rechargeMin: 500, rechargeMax: 1000000,
  rechargeInitiale: 2500, passPremium: 2000,
  rechargeInitialeBancaire: 7500, passPremiumBancaire: 5000,
};

// ---------- Points carte (géolocalisation) ----------
export const MAP_POINTS = [
  { type: 'client', ref: 'PRM-1001', lat: 3.866, lng: 11.516, label: 'Jean DUPONT' },
  { type: 'client', ref: 'PRM-1003', lat: 4.061, lng: 9.786,  label: 'Paul ETOO' },
  { type: 'agent',  ref: 'com-1',    lat: 3.848, lng: 11.502, label: 'Larissa NANA' },
  { type: 'agent',  ref: 'com-5',    lat: 4.051, lng: 9.767,  label: 'Diane KAMGA' },
];

// ============================================================
// Helpers attendus dans le prototype
// ============================================================

// Prix effectif d'un produit (applique la promo active du jour).
export function effectivePrice(productId: number, on = '2026-06-24') {
  const p = PRODUCTS.find(x => x.id === productId)!;
  const promo = PROMOTIONS.find(pr => pr.productId === productId && pr.active
    && (!pr.startDate || pr.startDate <= on) && (!pr.endDate || pr.endDate >= on));
  if (!promo) return p.basePrice;
  const v = promo.type === 'PRICE' ? promo.value : Math.round(p.basePrice * (100 - promo.value) / 100);
  return Math.max(0, v);
}

// Descendants d'un user (sous-arbre) — pour le scoping hiérarchique.
export function descendantIds(rootId: string): string[] {
  const out: string[] = [];
  const walk = (id: string) => USERS.filter(u => u.parentId === id).forEach(c => { out.push(c.id); walk(c.id); });
  walk(rootId);
  return out;
}

// Périmètre de données visible selon le rôle connecté.
// ADMIN/MANAGER → tout ; SUPERVISEUR/CHEF_EQUIPE → leur sous-arbre ; COMMERCIAL → soi (+ ventes recommandées).
export function visibleAgentIds(user: { id: string; roles: string[] }): string[] | 'ALL' {
  if (user.roles.includes('ADMIN') || user.roles.includes('MANAGER')) return 'ALL';
  if (user.roles.includes('SUPERVISEUR') || user.roles.includes('CHEF_EQUIPE'))
    return [user.id, ...descendantIds(user.id)];
  return [user.id];
}

// Une vente est-elle visible par un commercial (propriétaire OU recommandée par lui) ?
export function isOwnedOrReferred(sub: any, user: { id: string; phone?: string }): boolean {
  if (sub.agentId === user.id) return true;
  const p9 = (user.phone || '').slice(-6);
  return !!sub.referrerPhone9 && sub.referrerPhone9 === p9;
}
```

## Comptes de démo

| Rôle | Email | Mot de passe |
|---|---|---|
| Admin | admin@afrilandfirstbank.com | `demo` |
| Manager | manager@afrilandfirstbank.com | `demo` |
| Superviseur | sup1@afrilandfirstbank.com | `demo` |
| Chef d'équipe | chef1@afrilandfirstbank.com | `demo` |
| Commercial | com1@afrilandfirstbank.com | `demo` |
| Caissier | caisse@afrilandfirstbank.com | `demo` |
| Point d'impression | impression@afrilandfirstbank.com | `demo` (changement forcé) |

> La barre de démo « Se connecter en tant que… » doit permettre de basculer sans saisir d'identifiants. Pour atteindre 30–50 souscriptions, dupliquer/varier `SUBSCRIPTIONS` (statuts, méthodes, dates sur ~14 jours, `agentId` réparti entre `com-1…com-6`) afin que l'entonnoir Mobile Money et les classements soient riches.
