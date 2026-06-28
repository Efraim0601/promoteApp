# EXHAUSTIVE Prompt — Reproduce the Afriland portal in Claude Design (React + GSAP)

> Paste into Claude (Design / artifact mode). Generates a complete **React prototype** (mock data) faithfully reproducing every flow and feature of the Afriland portal, **generalized to all banking products** (Visa, Mastercard, prepaid, virtual cards + accounts + services), with **better UX** and targeted **GSAP** animations.
>
> It is long on purpose: the goal is to reproduce **every existing feature in full detail**. You may split delivery across several artifacts (build order at the end).

---

## PROMPT TO USE

You are a senior product designer-engineer. Build a premium **React web prototype** for **Afriland First Bank**: an internal portal to **sell banking products** (Visa, Mastercard, prepaid, virtual cards; accounts; services) through a hierarchical sales network, with KYC, Mobile Money payment, card printing, cashier, field collection, commissions, statistics and administration. This is a UX redesign of a real existing portal: reproduce **all** the features below while improving ergonomics and fluidity.

### 0. Technical constraints

- **React** (function components + hooks), clear component structure. **TypeScript** if possible.
- **GSAP** (`gsap`, `useGSAP`, `ScrollTrigger`/`Flip` where useful) for animations — only at the spots listed in §3.
- **Everything simulated in memory**: no backend. Rich mock data (§16), latencies faked with `setTimeout` (payment, loading, OCR, polling), no real network calls.
- **Simulated routing** via state (`view` + `role`). Navigation and visible screens **depend on the signed-in role**.
- **Demo bar** pinned at the top: "Sign in as…" with a role switcher (Admin, Manager, Supervisor, Team Lead, Sales rep, Cashier, Print point, Public) that instantly reloads the app in that role to explore every journey without real auth.
- **Bilingual FR/EN**: a globe button in the top bar toggles language; **French by default**. Centralize labels in a `t(key)` dictionary (at least titles, buttons, statuses, field labels).
- **Currency**: FCFA (XAF), format `1,234,500 FCFA`.
- **Responsive**: desktop-first (back office) but the subscription/recharge funnel must be flawless on mobile (≥ 375 px).

### 1. Visual identity & design system

- **Afriland brand**: deep **green** primary (`#0E7C43` / `#0B6B3A`), **gold** accent (`#C9A227` / `#E0B73A`), neutral light backgrounds, charcoal text. Secondary surface for table headers.
- **Style**: rounded cards (12–16 px), soft shadows, generous whitespace, Inter/Manrope type, thin **lucide-react** icons.
- **Payment colors** (reuse everywhere): Orange Money `#FF7900` (white text), MTN MoMo `#FFCB05` (dark text), SARA Money white/`#1E3A8A` (+ logo), Cash `#0E7A45` (₣ symbol).
- **Reusable components**: `Button` (primary/outline/ghost/danger), `Card`, `KpiCard` (value + label + color + delta), `Badge`/`StatusBadge`, `Modal`, `Table`, `Stepper`/`Steps`, `Tabs`, `Sidebar`, `Topbar`, `Avatar` (initials + admin dot), `Field` (label + input + hint + error), `PhoneField` (country code + E.164), `TileChoice` (visual radio tile), `EmptyState`, `Spinner`, `Toast`, `QrCode`, `PhotoCapture` (simulated camera), `ReceiptUpload`, `NotifBell`.
- **Accessibility**: visible keyboard focus, sufficient contrast, clear disabled states with explanatory tooltips.

### 2. Statuses — palette and labels (respect everywhere)

| Internal status | EN label | Color |
|---|---|---|
| `pending` | Pending | amber/gold |
| `cash` | Pay in cash | amber/gold |
| `sara_pending` | SARA — to validate | amber/gold |
| `paid` | Paid | green |
| `paid_done` / `fulfilled` | Credited / Settled | green |
| `printed` | Printed / Handed over | blue/violet |
| `to_fulfill` | Paid — to credit | blue |
| `failed` | Failed | red |
| `expired` | Expired (timeout) | muted red |

### 3. GSAP animations — precise spots (and nowhere else)

1. **Login / splash**: logo + fields in `stagger` (fade + slide-up), slight `back.out`.
2. **Dashboards**: KPI cards `stagger` on arrival; **count-up numbers**; chart bars rise from 0; 14-day trend animated.
3. **Subscription / recharge funnel**: stepper step transitions (horizontal slide + fade); progress bar fills via `tween`; on success, **drawn SVG checkmark** + subtle halo/confetti.
4. **KYC capture**: detection frame "breathing" (pulse); capture → validated thumbnail via **GSAP Flip**.
5. **Sidebar**: mobile slide open; **active-tab indicator that glides**.
6. **Lists/tables**: light `stagger` of rows on load and on filtering.
7. **Modals**: scale + fade; overlay fade.
8. **Mobile Money payment**: animated **progress ring** + pulse while waiting; animated transition to paid (green) or failed (red).
9. **Toasts / notifications**: corner slide-in + auto-dismiss; **unread badge** pulses on new notification.

Durations 0.2–0.6 s, natural easing, 60 fps, never gratuitous.

### 4. Roles, hierarchy and permissions (RBAC)

7 roles + a **tree hierarchy** (`parentId`). An account may **hold several roles** (e.g. Sales rep + Cashier); permissions = union.

| Role | Can do | Landing | Data scope |
|---|---|---|---|
| **Admin** | Create/manage everything (users, roles, profiles, products, config, agencies, audit). | `/admin` | Global |
| **Manager** | Creates **products/promotions/commissions**, creates **Supervisors**, assigns **Team Leads** and **Sales reps**. Global commercial view. | `/manager` | Global |
| **Supervisor** | Pilots their subtree (read-only). **Cannot create sales reps** (collecteurs only). | `/supervision` | Subtree |
| **Team Lead** | Sees activity of the **sales reps assigned to them**, roster, messaging. | `/team` | Their team |
| **Sales rep** (Agent/Collector) | Runs subscriptions, recharges, collections; tracks **their own stats and commissions**. | `/rep` | Their sales (+ referred) |
| **Cashier** | Validates cash/ATM payments, credits recharges. | `/cashier` | Cashier queue |
| **Print point** | Reviews KYC, verifies identity, prints, captures PAN, hands over the card. | `/print` | Print queue |

**Rules to surface in the UI:**
- **Who creates whom**: Admin → everyone; Manager → Supervisors/Team Leads/Sales reps; **Supervisor → no "create sales rep" button** (absent/disabled + tooltip "Manager only").
- **Visible scoping**: Team Lead = only their team; Supervisor = their subtree; Admin/Manager = global. KPIs, lists and rosters change when switching roles.
- **Fine-grained permissions** (modules × actions) for the admin Permissions screen: modules `Subscriptions, Recharges, Collections, Products, Promotions, Commissions, Statistics, Messaging, Users, Configuration`; actions per module: `READ, WRITE, VALIDATE, PRINT, EXPORT`.

### 5. Product catalogue — generalized (heart of the redesign)

The portal sells the **whole banking range**, not a single card. Model a **generic catalogue** managed by the Manager. Each **product** has: unique `code`, `label`, `description`, `group/category`, `type` (`PHYSICAL_CARD | VIRTUAL_CARD | ACCOUNT | SERVICE`), `base price` (XAF), `active`, `builtin` (non-deletable, editable only). **Cards** have **tariff components** (issuance fee, initial top-up, transport/delivery, premium pass) and may have **variants** (prepaid vs bank). **Promotions** per product: fixed `PRICE` or `PERCENT` (0–100), optional date window → **effective price** (struck base price + "Promo" badge when a promo is live today; floored at ≥ 0).

Demo products (at least): **Visa Classic / Gold / Premium**, **Mastercard Standard / World**, **Prepaid card (Promote)**, **Virtual card**, **Current account**, **Savings account**, **e-First (digital account)**, **SARA Money**, **Premium Pass**. Categories: Cards / Accounts / Services.

The **subscription funnel** consumes this catalogue: you **pick a product first**, then the journey adapts to its type (physical card → KYC + printing; virtual card → no physical printing; account/service → simplified collection).

### 6. Layout & navigation

- **Topbar**: clickable Afriland logo (→ role landing), name + role, **notification bell** (unread badge), **FR/EN globe button**, **lock icon → change password** (staff), profile menu (sign out). Left/right slots.
- **Sidebar per role**: only authorized sections appear; active item highlighted with an animated indicator; collapsible on mobile (hamburger + slide).
- **Public views** (home, self subscription, recharge, QR): full width, no sidebar.

### 7. Authentication & session

- **Login** (`/login`): **email + password** (toggle visibility), "Sign in", **"Forgot password?"** link (email field + confirmation "If this account exists, an email was sent"). **Expired session** banner. Errors: invalid credentials, disabled account.
- **Collector mode** (present but hidden by default): **phone (9 digits `6XXXXXXXX`) + 4-digit PIN**.
- **Post-login redirect** to the role landing (cf. §4). For multi-role accounts, priority Admin > Manager > Supervisor > Team Lead > Sales rep > Cashier > Print.
- **Change password** (`/change-password`): **forced on first login** (`mustChangePassword`) or self-service via the lock. Fields: current + new + confirm. **Validations (front/back mirror)**: ≥ 8 chars, at least 1 letter AND 1 digit, confirmation match, different from old. Dedicated error messages.
- **Geolocation**: best-effort (simulated GPS capture after login and at subscription, never blocking).

### 8. In-app notifications

- **Bell** in the topbar with a **red badge** of unread count ("99+" beyond). Pulse on arrival.
- **Dropdown** (≈ 340 px): "Notifications" title + "Mark all read"; scrollable list (blue dot if unread, **title** + optional 2-line clamped **body**, sender, relative date "2h ago", thumbnail if image). Click item → **detail modal** (title, `pre-wrap` body, zoomable image) and mark read.
- Source: **team messages** (Team Lead/Supervisor/Manager/Admin) and the admin **notification composer**. Simulate a **polling** refresh of the counter.

### 9. Subscription journey — detailed wizard (flagship screen)

Available as **public self-service (QR/link)** and **assisted (sales rep)**. Stepped wizard (animated slide). **Persistent draft** (the wizard remembers input on back). **Self mode** starts with a welcome/offer screen; **assisted mode** starts straight at Identity.

**Public home** (`/start`): choose "**Buy / subscribe to a product**" (→ funnel) or "**Recharge a card**" (→ recharge), + a discreet "Staff login" link. **QR screen** (`/qr`): large QR encoding the public URL + "Open here" button.

**Offer screen (self)**: client-space badge, welcome title, **offer summary** (card price + initial top-up + premium pass + total), 3-step checklist (ID, phone, pickup), "Start" button.

**Step 0 — Product** *(redesign addition)*: catalogue gallery filterable by category; selection highlights the product visual (bank-card gradient green/gold with chip for "card" products). The chosen type adapts later steps.

**Step 1 — Identity** ("Your information"). Exact fields, validations and errors:
- **First name*** (text) — required.
- **Last name*** (text) — required.
- **Sex*** (select: M / F) — required.
- **ID type** (select: National ID / Passport / Receipt; default ID) — changes the following labels.
- **ID number***: National ID = uppercase alphanumeric `^[0-9A-Z]{6,}$` ("Invalid ID"); Passport/Receipt = `^[0-9A-Z-]{5,}$`. OCR cross-check: if the recto capture later yields a different name/number → **non-blocking warning**.
- **Tax ID (NIU)** (optional, alphanumeric).
- **Expiry date*** (`dd/mm/yyyy` or date-picker): 8 digits, day 1–31, month 1–12, year 2024–2099, **future** date (else "expired ID").
- **Birth date*** (only if National ID; `yyyy-mm-dd`): **past** date, year ≥ 1900. Used as **anti-duplicate** key (first+last+ID+birth).
- **Phone*** (international E.164 field, default Cameroon `+237`) — validated.
- **Email*** — `^\S+@\S+\.\S+$`.
- **District*** and **City*** — required.
- **Referrer block (optional)**: referrer phone; in self mode, **async resolution** → if the number matches a sales rep, show their **name + agency** (green check); else "unknown referrer". The sale will be credited to the referrer.

**Step 2 — Documents (KYC)**: capture **ID front** and **back** (back hidden for Passport) via `PhotoCapture` (rear camera, **auto-capture**, 280×180 pulsing frame, tips: "hold flat / good light / avoid glare / well framed"). Validated thumbnail (GSAP Flip), **Retake** button. Show OCR warning on name/number mismatch.

**Step 3 — Selfie**: **front camera**, **round** 200×200 frame, **simulated face detection** with states: `searching…`, `no face`, `multiple faces`, `too far`, `too close`, `off-center`, `look straight`, `tilt`, `too dark`, `blurry`, `perfect — hold still` then **auto-capture** after ~0.7 s stable. Flip-camera button, Retake.

**Step 4 — Payment**:
- **Delivery/pickup** (if several modes): tiles **Promote (office)** / **At agency** (→ agency select `Name — City`) / **Home** (adds transport fee). Error if no agency chosen.
- **Method**: 4 tiles **Orange Money / MTN MoMo / SARA Money / Cash** (colors §1).
- **If OM/MTN**: **Mobile Money number** field (prefilled with KYC phone), **double validation** E.164 + **Cameroon operator** (MTN `^6(7\d{7}|5[0-4]\d{6}|8[0-4]\d{6})$`, OM `^6(9\d{7}|5[5-9]\d{6}|8[5-9]\d{6})$`) with errors "this number is not MTN/OM".
- **If SARA**: numbered instruction card (1–5), **SARA account number** to credit, **receipt upload** (image/PDF) → **simulated OCR extraction** (reference, payer phone, amount) shown then **confirmed/corrected** by the user (editable required reference field).
- **If Cash**: nothing to enter (validated at the cashier).

**Step 5 — Summary**: card visual with the client's name + 2 cards: (1) **personal data** (client, sex, ID, NIU, validity, phone, email, district, city, payment method, MoMo number, delivery, referrer); (2) **tariff summary** (card type, product price, initial top-up, premium pass, transport if home, **Total** highlighted). Contextual confirm button: **"Pay now"** (MoMo) / **"Confirm (cash)"** / **"Confirm (SARA)"**, with spinner.

**Payment processing** (MoMo):
1. **Sending** (~1.3 s): "Sending the request…", animated operator logo.
2. **Waiting**: "Approve on your phone", USSD instructions, bold number, "may take up to 2 min" tip, reference shown. **GSAP progress ring**.
3. **Simulated polling**: ~56 attempts, backoff (3 s ×10, then 5 s ×14, then 10 s), ~7 min max.
4. **Outcome**: **Paid** → success; **Failed** → failure; **exhaustion** → **"prolonged wait"** screen with "I paid / Refresh" and "Keep waiting".
5. **Demo simulation buttons** ("Approve" / "Fail") to drive the outcome in the prototype.

**Failure screen**: animated red alert + reason-specific message — **insufficient funds** / **timeout** / **declined** — aggregator detail message, reference kept. Buttons **Retry** / **Home**.

**Success / Reference screen** (also for Cash and SARA, no polling): animated green check (or amber "pending" glyph for cash/SARA), **`PRM-XXXX` reference** copyable, **QR code** (deep link to the print point `/print?ref=…`), pickup card ("bring your ID"), payment summary (status badge + amount), **"Download receipt" (PNG)** generated client-side (ref + QR), **"New subscription"**, **"Home"**, and for the rep **"Go to print point"**.

### 10. Recharge journey (`/recharge`)

Welcome screen (title, description, 3-step checklist) then **form**: First name*, Last name*, Phone* (E.164), **Card number (PAN)** as **dual 4 + 4 input** with **auto-advance** and masked display `XXXX **** **** XXXX`, **Amount** (numeric, configurable **min/max bounds**, e.g. 500 – 1,000,000, "between X and Y" message), then **payment method** (same 4 options + MoMo number / SARA receipt identical to the funnel). Contextual confirm. Same payment states (sending/waiting/failure/success). Success screen shows the **masked PAN** and allows **receipt download**. On the cashier side, a paid recharge enters the **"to credit"** queue.

### 11. Sales rep workspace (`/rep`)

- **Header**: avatar + "Hello, [Name]" + agency.
- **Actions**: **New subscription**, **New recharge**, **My collections** (if collector), **Claim a sale (QR)**, **Verify a reference**.
- **Personal KPIs** (count-up): My subscriptions, Successful (paid), Pending, Amount collected, **My commissions**.
- **"My sales"** (live): advanced search (ref, name, NIU, SARA ref, phones), filters **status** + **method** + **dates**, **CSV export** (full columns: Date, Reference, Name, Sex, ID, Expiry, NIU, Phone, Email, District, Region, City, Selfie?, ID front?, ID back?, Payment, Payment phone, Referred by, Referrer phone, Delivery, Card no., PAN, Status, Amount, SARA ref), **expandable rows** (KYC photos + 30 detail fields). "Clear" button.
- **"Claim a sale" modal**: phone* + ID* (≥ 6) + NIU (optional) → "sale found / assigned to your portfolio" or errors "not found / already claimed / not paid".
- **"Verify a reference" modal**: search the whole database (ref/name/phone) → record(s) with status, amount, method, **Download receipt** button.

### 12. Team piloting — Team Lead & Supervisor (`/team`)

- **Scope** banner: "My team" (Team Lead) / "My subtree" / "Commercial organization" (Manager/Admin).
- **Product filter** + refresh button.
- **Aggregated KPIs**: Subscriptions, Collections, **Commissions (XAF)**.
- **Per-member table**: Member (name + role badge), Subscriptions, Collections, **Commissions** (ranking).
- **Roster + messaging**: checkable member list; **Title + Message** form; send to selection or to **the whole team**; "Sent to N member(s)" confirmation. Recipients **bounded to the subtree**. **No create-sales-rep button for the Supervisor.**

### 13. Manager console (`/manager`)

Tabs **Catalogue**, **Commissions**, **Hierarchy/Teams**, **Statistics**.

- **Catalogue**: **new product** form (Label*, Code, Category/Group, Type, Price XAF); **product cards** list (type badge, label/code, group, status, **effective vs struck base price + Promo badge**, Edit/Delete if non-builtin). **Inline editing**: label, code (if non-builtin), group, price, active; **tariff components** (for cards); **promotions** (list with active/inactive badge, % or amount value, dates, toggle, delete + add form: type PRICE/PERCENT, value, start, end). Error "this code already exists".
- **Commissions**: **rules** — form (Scope `PRODUCT`/`GROUP` + code; Beneficiary `ROLE`/`USER` + value; Type `PERCENT`/`FIXED` + value; date window); rules table (active badge, scope → beneficiary, amount, toggle/delete). **Generated commissions ledger** (`CommissionEntry`): beneficiary, product, sale reference, amount, **status PENDING/VALIDATED/PAID**, total. Resolution shown: `USER > ROLE`, `PRODUCT > GROUP`, most recent wins; **idempotent** generation per `(saleType, saleRef, beneficiary)`.
- **Hierarchy/Teams**: **visual org chart** (Admin/Manager → Supervisors → Team Leads → Sales reps); create Supervisors; assign Team Leads and Sales reps (drag/select `parentId`). Manager creates sales reps; Supervisor does not.
- **Statistics**: link/view to global team piloting.

### 14. Admin back office (`/admin`)

Sidebar sections (all detailed); **Purchase / Recharge** tabs on the overview.

- **Overview**:
  - **Filters** From / To (+ "All").
  - **"Today" block** (filter-independent): Paid cards (green), Picked-up cards (primary), Collected (gold), Pending validation (gold).
  - **Global KPIs**: Paid cards, Picked-up cards, Amount collected, Total subscriptions, Pending, **Failed payments (clickable → detail)**.
  - **Mobile Money funnel** (live badge): Total, **Success rate %**, **Median confirmation time (s)**; Paid / Pending / Technical-failed pills; **14-day trend** (stacked green/red/gold bars per day, tooltip, legend); **per network** (Orange / MTN / SARA / Cash: paid/total · %); **technical failure categories** (label, count, %, bar) + warning note + Copy button.
  - **Reconciliation by time window**: "Window (hours)" 1–168, Refresh button, results (Scanned, Updated, Unchanged, Errors) + **changes list** (ref: old → new status).
  - **Live verification (streaming)**: "Regularize all pending/failed records"; Refresh/Stop button, X/Y counter, KPIs (Scanned, Updated, Unchanged, Errors), **live scrolling logs** (monospace, colored lines).
  - **Per-agent performance**: paginated list (avatar, name, # sales, bar, agency + collected amount).
- **Configuration**: Card price, Fees, Transport; **Prepaid offer** (initial top-up + premium pass + total); **Bank offer** (initial top-up + premium pass + total); **recharge bounds** (min/max). Save button (Saving… / Saved ✓ states).
- **Users**: search + **role filter** + dates; **Add user**; **Bulk import** (CSV/paste, template, preview with New/Duplicate/Invalid statuses, duplicate policy Skip/Update, result + generated credentials download); **notification composer** (recipient chips by role, subject, message, image, Send); **multi-select + bulk role assign + notify**; table (checkbox, avatar, name+email, phone+agency, profile/role badges, disabled state); **inline editing** (info / multi-select roles / profiles / enable-disable / recreate / reset credentials). Create: Name*, Email*, Phone, Agency (if rep), **multi-select roles**, **hierarchy parent**; shows **temporary password** + **PIN** (if collector). *Supervisor only sees collector management.*
- **Agencies**: **pickup-location stats** (At agency / Promote delivery / Home, bars + %) with period filters; **agency ranking** (rank, clickable name, bar, count + %, **drill-down**: Client/Phone/Date/Status); agency **import**; **list** (Name, City, Active, Edit/Delete) + create form (Name*, City*, Active).
- **Transactions**: filterable table (dates, status, method, search) — Date, Reference, Name, Phone, NIU, Status, Amount, Method, Delivery; click → **detail** (all info, photos, failure reason, actions).
- **Recharges**: KPIs (Paid/Total/Amount) + 14-day trend + per network; table (Reference, Name, **masked PAN**, Amount, Status, Method, Date).
- **Collections**: stats (total, per product, per rep); detailed table (Reference, Rep, Product, Client, Phone, Account no., Card no., Card type, Date); **multi-sheet Excel export**.
- **Permissions**: **permission matrix** (profiles × modules × actions), builtin profiles non-deletable, create/edit profiles, assign to users.
- **Audit**: **Logins** tab (Date, User, Role, Email, IP, User-Agent, Success/Failure) and **Actions** tab (Date, User, Action e.g. `CREATE_USER`, Entity, Details, IP) — filterable.
- **Map**: interactive map (Leaflet-style) with **client** (GPS) and **agent** markers, click popups.

### 15. Operational screens

- **Cashier (`/cashier`)** — 4 modes: **Cash**, **ATM/Transfer** (required ATM reference field), **Recharges**, **Agency pickups**. KPIs: my validations / today / queue (+ amounts). Search → **record** (selfie, ID front/back with **Retake**, client info, method, **amount to collect** in amber) → **Validate payment** / **Reject** (reason) → success screen. **Recharges** mode: paid-not-credited queue (alert banner), **Credit recharge** with **mandatory proof upload** (screenshot of the credit) before validation. **Agency pickups** mode: clients who chose agency pickup.
- **Print point (`/print`)** — KPIs: printed / today / queue. **Stock reconciliation** (Handed-over / Activated / Pending activation + table). Search → **KYC record** (verified selfie, ID front/back with Retake, info, editable NIU, method, delivery, referrer, amount to collect if cash, SARA receipt if any). **SARA validation** (show receipt, OCR-prefilled ref/payer/amount fields to confirm, Validate/Reject). **Printing** (if paid or cash): **card number entry** (4+4 masked, required) + optional **PAN** (4+4 masked) → **Print** → success. Blocked states if payment not regularized.
- **Supervision — Daily reconciliation (`/supervision`)**: date picker (max today, "Today" shortcut), quick links. **Printing section** (Total printed / Pending activation + per-printer table: Name, Agency, Printed, Activated, Pending). **Collection section** (Total collected / Pending + per-cashier table: Name, Agency, # records, Amount).
- **Collection (`/collection`)** — sales rep/collector: **product** selection (Account opened / Bank card / SARA Money / e-First — also generalize to catalogue products), common fields (Client name*, **ID** if account/e-First, Phone*), card-specific (Card no. 4+4, **Card type**: Fellow / Partner / Prepaid / Visa Classic / Visa Gold / Blanche…), Save/Cancel. **"My collections"**: list (name + product + phone + ref + date), Edit/Delete, **XLSX export**.

### 16. Expected mock data

Realistic, consistent dataset honoring **hierarchical scoping**:
- **Users**: 1 Admin, 1 Manager, 2 Supervisors, 3 Team Leads, 6–8 Sales reps, 1 Cashier, 1 Print point — linked by `parentId` (coherent org chart), with agency, phone, status.
- **Catalogue**: ~10–12 products across Cards/Accounts/Services, including 1–2 **live promotions** (visible effective price).
- **Subscriptions**: 30–50 with varied statuses (pending/paid/cash/sara_pending/failed/printed), spread methods (OM/MTN/SARA/Cash), dates over ~14 days, some **referred**.
- **Recharges** (~10), **collections** (~15), **commission rules + entries** (varied statuses), **notifications** (incl. team messages), **audit logs** (logins + actions).
- **KPIs, charts, funnel, rosters and lists compute from this data and change with the signed-in role** (a Team Lead only sees their reps, etc.). See the ready-to-paste dataset in `mock-data-claude-design.md`.

### 17. Quality requirements

- Total visual consistency; polished **empty states**; **skeletons/loaders** during faked latencies; confirmation toasts.
- **Role scoping demonstrable** via the demo bar.
- **Multi-product catalogue** at the heart (never a single hard-coded card).
- **Working FR/EN toggle** on the main labels.
- **GSAP animations only at §3 spots**, fluid and discreet.
- **PAN always masked** `XXXX **** **** XXXX` (only 4+4 captured).
- Clean code, named components, comments on animation and mock zones.

### 18. Build order (deliver an end-to-end navigable prototype)

1. Design system + role switch bar + Topbar/Sidebar + FR/EN i18n + StatusBadge.
2. Auth (login, forgot password, forced change) + notification bell.
3. Per-role dashboards (Sales rep, Team Lead/Supervisor, Manager, Admin) with count-up KPIs and charts.
4. **Subscription funnel** complete (product → identity → KYC → selfie → payment → summary → processing → success/failure) + **recharge**.
5. Manager console (catalogue + commissions + hierarchy).
6. Admin back office (overview + funnel + reconciliation + users + agencies + transactions + permissions + audit + map).
7. Operational screens (cashier, print, supervision, collection).

Pay special attention to the subscription funnel, the Mobile Money funnel and the product catalogue: these are the centerpieces.

---

### Adaptation notes (outside the prompt)

- Real target: **React front + Spring Boot back**; the Claude Design prototype mocks the API, but screen/flow architecture stays re-pluggable onto the existing REST API (`/api/subscriptions`, `/api/recharges`, `/api/collectes`, `/api/products`, `/api/commissions`, `/api/stats/*`, `/api/team`, `/api/users`, `/api/profiles`, `/api/notifications`, `/api/payment/*`, `/api/kyc/*`, `/api/audit/*`).
- **Product generalization**: Visa/Mastercard/prepaid/virtual + accounts + services, configurable catalogue (beyond the original single prepaid card).
- **Hierarchy** reproduced: Admin → Manager → Supervisor → Team Lead → Sales rep + operational Cashier & Print point. Explicit rule: *the Supervisor does not create sales reps; the Manager does.*
- Covers **all existing features**: smart KYC (face detection + ID OCR), Mobile Money payment (funnel, polling, reconciliation, live SSE verification), SARA (receipt + OCR), cash (cashier), recharge (PAN 4+4, fulfillment), collection (bank products), parameterized idempotent commissions, scoped statistics, team messaging, notifications, fine-grained permissions, audit, geolocation/map, bulk import, CSV/XLSX exports, bilingual FR/EN, PNG receipts.
