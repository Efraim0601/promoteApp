/*
 * Test de charge k6 — Carte Promote
 * =================================
 * Reproduit la charge réelle de la plateforme :
 *   - les TABLEAUX du personnel qui s'auto-rafraîchissent (admin / commercial / imprimeur / caissier),
 *     c.-à-d. le polling toutes les POLL secondes (défaut 3 s, comme LIVE_REFRESH_MS dans l'app) ;
 *   - le PARCOURS CLIENT QR (upload KYC + souscription + polling du statut + validation paiement).
 *
 * Deux modes :
 *   MODE=steady (défaut) : N utilisateurs simultanés par rôle, pendant DURATION → modèle "concurrence".
 *   MODE=ramp            : montée en débit (req/s) d'un mix de personnel → trouve le point de rupture.
 *
 * ⚠️  Le parcours client ÉCRIT en base (souscriptions, paiements). Ne le lancez PAS sur la prod :
 *     pointez BASE_URL vers un environnement de recette. Par défaut VUS_CLIENT=0 (lecture seule).
 *
 * Exemples :
 *   k6 run -e BASE_URL=https://recette.exemple.cm main.js
 *   k6 run -e MODE=ramp -e RAMP_TARGET=800 main.js
 *   k6 run -e VUS_AGENT=200 -e VUS_ADMIN=10 -e VUS_CLIENT=50 -e DURATION=5m main.js
 */
import http from 'k6/http';
import { check, sleep } from 'k6';

// ---------------------------------------------------------------- configuration (via -e VAR=...)
const BASE = (__ENV.BASE_URL || 'http://localhost:8390').replace(/\/$/, '');
const API = `${BASE}/api`;
const PW = __ENV.PW || 'promote';
// Mot de passe par rôle (admin et commercial diffèrent souvent). Défaut = PW.
const PWS = {
  admin: __ENV.ADMIN_PW || PW,
  agent: __ENV.AGENT_PW || PW,
  print: __ENV.PRINT_PW || PW,
  cashier: __ENV.CASHIER_PW || PW,
};
const POLL = parseFloat(__ENV.POLL || '3');          // intervalle de rafraîchissement (s) — = LIVE_REFRESH_MS
const MODE = __ENV.MODE || 'steady';                 // steady | ramp
const DURATION = __ENV.DURATION || '2m';
// Hôte en sslip.io/IP : le certificat peut ne pas être vérifiable → on l'ignore par défaut.
const INSECURE = (__ENV.INSECURE_TLS || 'true') === 'true';

const EMAILS = {
  admin: __ENV.ADMIN_EMAIL || 'admin@afrilandfirstbank.com',
  agent: __ENV.AGENT_EMAIL || 'awa.fall@afrilandfirstbank.com',
  print: __ENV.PRINT_EMAIL || 'imprimeur.promote@afrilandfirstbank.com',
  cashier: __ENV.CASHIER_EMAIL || 'caissier.promote@afrilandfirstbank.com',
};

// Utilisateurs simultanés par rôle (mode steady). Le mix par défaut reflète un back-office typique.
const VUS = {
  admin: parseInt(__ENV.VUS_ADMIN || '5', 10),
  agent: parseInt(__ENV.VUS_AGENT || '30', 10),
  print: parseInt(__ENV.VUS_PRINT || '5', 10),
  cashier: parseInt(__ENV.VUS_CASHIER || '5', 10),
  client: parseInt(__ENV.VUS_CLIENT || '0', 10),     // 0 = pas d'écriture (lecture seule)
};

// 1×1 PNG — charge utile minimale acceptée par /api/kyc/image (data URL image/png).
const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

const JSON_HDR = { 'Content-Type': 'application/json' };

// ---------------------------------------------------------------- scénarios (selon MODE)
function steadyScenarios() {
  const s = {};
  const mk = (exec, vus, role) => ({ executor: 'constant-vus', exec, vus, duration: DURATION, tags: { role } });
  if (VUS.admin > 0) s.admin_dashboard = mk('adminDashboard', VUS.admin, 'admin');
  if (VUS.agent > 0) s.agent_dashboard = mk('agentDashboard', VUS.agent, 'agent');
  if (VUS.print > 0) s.print_dashboard = mk('printDashboard', VUS.print, 'print');
  if (VUS.cashier > 0) s.cashier_dashboard = mk('cashierDashboard', VUS.cashier, 'cashier');
  if (VUS.client > 0) s.client_qr = mk('clientJourney', VUS.client, 'client');
  return s;
}

function rampScenarios() {
  const target = parseInt(__ENV.RAMP_TARGET || '500', 10);   // débit cible (itérations/s)
  const r = (f) => Math.max(1, Math.round(target * f));
  return {
    staff_ramp: {
      executor: 'ramping-arrival-rate',
      exec: 'staffIteration',
      startRate: parseInt(__ENV.RAMP_START || '10', 10),
      timeUnit: '1s',
      preAllocatedVUs: parseInt(__ENV.RAMP_PREALLOC || '80', 10),
      maxVUs: parseInt(__ENV.RAMP_MAXVUS || '2000', 10),
      stages: [
        { target: r(0.2), duration: '30s' },
        { target: r(0.5), duration: '1m' },
        { target: r(1.0), duration: '2m' },
        { target: r(1.0), duration: '1m' },
        { target: 0, duration: '15s' },
      ],
      tags: { role: 'staff_mix' },
    },
  };
}

export const options = {
  insecureSkipTLSVerify: INSECURE,
  scenarios: MODE === 'ramp' ? rampScenarios() : steadyScenarios(),
  thresholds: {
    // Échecs HTTP : en mode ramp on AVORTE quand ça casse (pour situer le point de rupture).
    http_req_failed:
      MODE === 'ramp'
        ? [{ threshold: 'rate<0.05', abortOnFail: true, delayAbortEval: '30s' }]
        : ['rate<0.02'],
    http_req_duration: ['p(95)<1500', 'p(99)<3000'],
    // Cibles par endpoint (les plus lourds : la liste complète + les stats admin).
    'http_req_duration{name:GET /subscriptions (all)}': ['p(95)<2500'],
    'http_req_duration{name:GET /stats/admin}': ['p(95)<1500'],
  },
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

// ---------------------------------------------------------------- setup : login des 4 comptes
export function setup() {
  // En ramp on tente les 4 rôles ; en steady, seulement ceux dont VUS>0.
  const want =
    MODE === 'ramp'
      ? ['admin', 'agent', 'print', 'cashier']
      : ['admin', 'agent', 'print', 'cashier'].filter((r) => VUS[r] > 0);

  const tokens = {};
  for (const role of want) {
    const res = http.post(`${API}/auth/login`, JSON.stringify({ email: EMAILS[role], password: PWS[role] }), {
      headers: JSON_HDR,
      tags: { name: 'POST /auth/login' },
    });
    if (res.status === 200 && res.json('token')) {
      tokens[role] = res.json('token');
      console.log(`✓ login ${role} (${EMAILS[role]}) OK`);
    } else {
      // Tolérant : on n'interrompt pas le test — ce rôle ne générera simplement aucune charge.
      console.warn(`✗ login ${role} (${EMAILS[role]}) : HTTP ${res.status} → ce rôle est ignoré`);
    }
  }
  if (Object.keys(tokens).length === 0 && VUS.client === 0) {
    throw new Error('Aucun login réussi et VUS_CLIENT=0 : rien à tester. Vérifiez BASE_URL / identifiants.');
  }
  return { tokens };
}

// ---------------------------------------------------------------- helpers
function authGet(path, token, name) {
  if (!token) return null;   // rôle non authentifié → aucun appel
  const res = http.get(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` }, tags: { name } });
  check(res, { [`${name} → 200`]: (r) => r.status === 200 });
  return res;
}

// Un cycle de rafraîchissement, par rôle (mêmes appels que l'auto-refresh du frontend).
function pollAdmin(t) {
  authGet('/stats/admin', t, 'GET /stats/admin');
  authGet('/stats/payments', t, 'GET /stats/payments');
  authGet('/subscriptions', t, 'GET /subscriptions (all)');
}
function pollAgent(t) {
  authGet('/stats/agent', t, 'GET /stats/agent');
  authGet('/subscriptions/mine', t, 'GET /subscriptions/mine');
}
function pollPrint(t) {
  authGet('/stats/print', t, 'GET /stats/print');
}
function pollCashier(t) {
  authGet('/stats/cashier', t, 'GET /stats/cashier');
}

function rnd(n) {
  return Math.floor(Math.random() * n);
}
function randomPhone() {
  return '+2376' + String(10000000 + rnd(89999999)).slice(0, 8);
}
function randomHexCni() {
  const h = '0123456789ABCDEF';
  let s = '';
  for (let i = 0; i < 9; i++) s += h[rnd(16)];
  return s;
}
function uploadImage(kind) {
  const res = http.post(`${API}/kyc/image`, JSON.stringify({ image: TINY_PNG, kind }), {
    headers: JSON_HDR,
    tags: { name: 'POST /kyc/image' },
  });
  check(res, { 'kyc image → 200': (r) => r.status === 200 });
  return res.json('key');
}

// ---------------------------------------------------------------- exec : tableaux (steady)
export function adminDashboard(data) {
  pollAdmin(data.tokens.admin);
  sleep(POLL);
}
export function agentDashboard(data) {
  pollAgent(data.tokens.agent);
  sleep(POLL);
}
export function printDashboard(data) {
  pollPrint(data.tokens.print);
  sleep(POLL);
}
export function cashierDashboard(data) {
  pollCashier(data.tokens.cashier);
  sleep(POLL);
}

// ---------------------------------------------------------------- exec : mix personnel (ramp)
export function staffIteration(data) {
  const r = Math.random();
  if (r < 0.7) pollAgent(data.tokens.agent);        // les commerciaux sont les plus nombreux
  else if (r < 0.8) pollAdmin(data.tokens.admin);
  else if (r < 0.9) pollPrint(data.tokens.print);
  else pollCashier(data.tokens.cashier);
}

// ---------------------------------------------------------------- exec : parcours client QR (écrit !)
export function clientJourney() {
  http.get(`${API}/config`, { tags: { name: 'GET /config' } });

  const selfieKey = uploadImage('selfie');
  const cniRectoKey = uploadImage('cni-recto');
  const cniVersoKey = uploadImage('cni-verso');

  const phone = randomPhone();
  const body = {
    prenom: 'Load', nom: 'Test', sexe: 'M', docType: 'cni',
    cni: randomHexCni(), cniExp: '01/01/2031', phone, email: `load${rnd(1e9)}@test.cm`,
    quartier: 'Bonamoussadi', ville: 'Douala',
    pay: 'om', payPhone: phone, delivery: 'promote',
    selfie: true, selfieKey, cniRectoKey, cniVersoKey,
  };
  const res = http.post(`${API}/subscriptions/self`, JSON.stringify(body), {
    headers: JSON_HDR,
    tags: { name: 'POST /subscriptions/self' },
  });
  const ok = check(res, { 'self subscription → 200': (r) => r.status === 200 });
  if (!ok) return;

  const ref = res.json('ref');
  // Le client attend la confirmation (polling du statut, comme l'app).
  for (let i = 0; i < 3; i++) {
    sleep(POLL);
    http.get(`${API}/subscriptions/${ref}/status`, { tags: { name: 'GET /subscriptions/:ref/status' } });
  }
  // Simule la validation du paiement côté client (USSD).
  http.patch(`${API}/subscriptions/${ref}/pay`, JSON.stringify({ outcome: 'validate' }), {
    headers: JSON_HDR,
    tags: { name: 'PATCH /subscriptions/:ref/pay' },
  });
  sleep(1);
}
