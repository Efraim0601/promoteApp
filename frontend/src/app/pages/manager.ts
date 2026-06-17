import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { I18n } from '../core/i18n';
import { Api } from '../core/api';
import { Auth } from '../core/auth';
import {
  Product, ProductKind, ProductRequest, Promotion, PromotionRequest, PromotionType,
  CommissionRule, CommissionRuleRequest, CommissionEntry,
  CommissionScopeType, CommissionTargetType, CommissionRateType,
} from '../core/models';
import { AppBarComponent } from '../shared/app-bar';
import { IconComponent } from '../shared/icon';
import { SpinnerComponent } from '../shared/spinner';
import { NotifBellComponent } from '../shared/notif-bell';

/**
 * Manager console. Phase 2 ships the **Catalogue** tab: the single place to configure the
 * products/services sold (the Promote card + the bank products), their prices, tariff components
 * and promotions. Later phases add the Commissions and Statistiques tabs. Gated to MANAGER/ADMIN.
 *
 * <p>Back-office screen — French strings are inline (not routed through i18n) as this console is
 * internal to managers.
 */
@Component({
  selector: 'page-manager',
  standalone: true,
  imports: [FormsModule, DecimalPipe, RouterLink, AppBarComponent, IconComponent, SpinnerComponent, NotifBellComponent],
  template: `
  <div class="scr">
    <app-bar>
      <notif-bell appbar-right></notif-bell>
      <button appbar-right class="icon-btn" (click)="auth.logout()" [title]="i18n.t('logout')"><ic name="logout" [size]="15" [sw]="2"></ic></button>
    </app-bar>
    <div class="scr-body">
      <div class="kicker" style="margin-bottom:4px"><ic name="store" [size]="13" style="vertical-align:-2px;margin-right:4px"></ic>Espace Manager</div>
      <h1 style="font-size:21px;margin:0 0 12px">Catalogue des produits</h1>

      <!-- Tabs -->
      <div style="display:flex;gap:6px;margin-bottom:14px;flex-wrap:wrap">
        <button class="btn" [class.btn-outline]="tab() !== 'catalogue'" (click)="tab.set('catalogue')" style="font-size:12.5px;padding:6px 12px">Catalogue</button>
        <button class="btn" [class.btn-outline]="tab() !== 'commissions'" (click)="switchTo('commissions')" style="font-size:12.5px;padding:6px 12px">Commissions</button>
        <a class="btn btn-outline" routerLink="/team-stats" style="font-size:12.5px;padding:6px 12px;text-decoration:none">Statistiques</a>
      </div>

      @if (tab() === 'catalogue') {
      @if (loading()) {
        <div class="load-center"><spinner tone="primary" [size]="22"></spinner> {{ i18n.t('loading') }}</div>
      } @else {
        <!-- New product -->
        <div class="card" style="padding:14px;margin-bottom:14px">
          <div class="kicker" style="margin-bottom:8px">Nouveau produit</div>
          <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end">
            <label style="flex:1;min-width:140px">Libellé
              <input [(ngModel)]="nLabel" placeholder="Ex. Compte épargne" />
            </label>
            <label style="width:130px">Code
              <input [(ngModel)]="nCode" placeholder="compte_epargne" />
            </label>
            <label style="width:120px">Groupe
              <input [(ngModel)]="nGroup" placeholder="bancaire" />
            </label>
            <label style="width:120px">Prix (XAF)
              <input type="number" [(ngModel)]="nPrice" min="0" />
            </label>
            <button class="btn" (click)="createProduct()" [disabled]="!nLabel().trim() || saving()" style="padding:8px 14px">
              <ic name="plus" [size]="13"></ic> Ajouter
            </button>
          </div>
          @if (formErr()) { <p class="err" style="font-size:12px;margin:8px 0 0">{{ formErr() }}</p> }
        </div>

        <!-- Product list -->
        @for (p of products(); track p.id) {
          <div class="card" style="padding:12px 14px;margin-bottom:10px">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
              <span class="badge" [style.background]="p.kind === 'CARD' ? 'var(--primary)' : 'var(--surface-2)'"
                    [style.color]="p.kind === 'CARD' ? '#fff' : 'var(--muted)'" style="font-size:10px">{{ p.kind === 'CARD' ? 'Carte' : 'Bancaire' }}</span>
              <span style="font-weight:700;font-size:14px">{{ p.label }}</span>
              <span class="muted" style="font-size:11px">{{ p.code }}</span>
              @if (p.groupCode) { <span class="muted" style="font-size:11px">· {{ p.groupCode }}</span> }
              @if (!p.active) { <span class="badge" style="background:#fde8e8;color:#b42318;font-size:10px">Inactif</span> }
              <span style="flex:1"></span>
              <span style="font-weight:800;font-size:14px">{{ p.effectivePrice | number }} XAF</span>
              @if (p.effectivePrice !== p.basePrice) {
                <span class="muted" style="font-size:11px;text-decoration:line-through">{{ p.basePrice | number }}</span>
                <span class="badge" style="background:#ecfdf3;color:#067647;font-size:10px">Promo</span>
              }
              <button class="icon-btn" (click)="toggleEdit(p)" title="Modifier"><ic name="pencil" [size]="14"></ic></button>
              @if (!p.builtin) {
                <button class="icon-btn" (click)="removeProduct(p)" title="Supprimer"><ic name="trash" [size]="14"></ic></button>
              }
            </div>

            @if (editId() === p.id) {
              <div style="margin-top:12px;border-top:1px solid var(--border);padding-top:12px;display:flex;flex-direction:column;gap:10px">
                <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end">
                  <label style="flex:1;min-width:140px">Libellé <input [(ngModel)]="eLabel" /></label>
                  @if (!p.builtin) { <label style="width:130px">Code <input [(ngModel)]="eCode" /></label> }
                  <label style="width:120px">Groupe <input [(ngModel)]="eGroup" /></label>
                  <label style="width:120px">Prix (XAF) <input type="number" [(ngModel)]="ePrice" min="0" /></label>
                  <label style="display:flex;align-items:center;gap:6px;font-size:12.5px;padding-bottom:8px">
                    <input type="checkbox" [(ngModel)]="eActive" style="width:auto" /> Actif
                  </label>
                </div>

                <!-- Card tariff components -->
                @if (p.kind === 'CARD' && eComponents().length) {
                  <div class="kicker" style="margin:4px 0">Composants tarifaires</div>
                  <div style="display:flex;flex-direction:column;gap:6px">
                    @for (c of eComponents(); track c.ckey) {
                      <div style="display:flex;align-items:center;gap:8px">
                        <span style="flex:1;font-size:12.5px">{{ c.label || c.ckey }}</span>
                        <input type="number" [ngModel]="c.amount" (ngModelChange)="setComp(c.ckey, $event)" min="0" style="width:120px" />
                        <span class="muted" style="font-size:11px">XAF</span>
                      </div>
                    }
                  </div>
                }

                <!-- Promotions -->
                <div class="kicker" style="margin:4px 0">Promotions</div>
                @for (pr of p.promotions; track pr.id) {
                  <div style="display:flex;align-items:center;gap:8px;font-size:12.5px">
                    <span class="badge" [style.background]="pr.active ? '#ecfdf3' : 'var(--surface-2)'" [style.color]="pr.active ? '#067647' : 'var(--muted)'" style="font-size:10px">{{ pr.active ? 'Active' : 'Inactive' }}</span>
                    <span>{{ pr.type === 'PRICE' ? (pr.value | number) + ' XAF' : pr.value + ' %' }}</span>
                    <span class="muted" style="font-size:11px">{{ pr.startDate || '—' }} → {{ pr.endDate || '∞' }}</span>
                    <span style="flex:1"></span>
                    <button class="icon-btn" (click)="togglePromo(pr)" [title]="pr.active ? 'Désactiver' : 'Activer'"><ic name="refresh" [size]="13"></ic></button>
                    <button class="icon-btn" (click)="removePromo(pr)" title="Supprimer"><ic name="trash" [size]="13"></ic></button>
                  </div>
                }
                <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end">
                  <label style="width:120px">Type
                    <select [(ngModel)]="pType">
                      <option value="PERCENT">Remise %</option>
                      <option value="PRICE">Prix promo</option>
                    </select>
                  </label>
                  <label style="width:120px">Valeur <input type="number" [(ngModel)]="pValue" min="0" /></label>
                  <label style="width:140px">Début <input type="date" [(ngModel)]="pStart" /></label>
                  <label style="width:140px">Fin <input type="date" [(ngModel)]="pEnd" /></label>
                  <button class="btn btn-outline" (click)="addPromo(p)" [disabled]="saving()" style="padding:7px 12px;font-size:12px"><ic name="plus" [size]="12"></ic> Promotion</button>
                </div>

                <div style="display:flex;gap:8px;justify-content:flex-end">
                  <button class="btn btn-outline" (click)="editId.set(null)" style="padding:7px 14px;font-size:12.5px">Annuler</button>
                  <button class="btn" (click)="saveProduct(p)" [disabled]="saving()" style="padding:7px 14px;font-size:12.5px">Enregistrer</button>
                </div>
              </div>
            }
          </div>
        }
        @if (!products().length) { <p class="muted" style="text-align:center">Aucun produit.</p> }
      }
      }

      @if (tab() === 'commissions') {
      @if (cLoading()) {
        <div class="load-center"><spinner tone="primary" [size]="22"></spinner> {{ i18n.t('loading') }}</div>
      } @else {
        <!-- New commission rule -->
        <div class="card" style="padding:14px;margin-bottom:14px">
          <div class="kicker" style="margin-bottom:8px">Nouvelle règle de commission</div>
          <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end">
            <label style="width:120px">Portée
              <select [(ngModel)]="rScopeType">
                <option value="PRODUCT">Produit</option>
                <option value="GROUP">Groupe</option>
              </select>
            </label>
            <label style="width:150px">{{ rScopeType() === 'PRODUCT' ? 'Produit' : 'Groupe' }}
              @if (rScopeType() === 'PRODUCT') {
                <select [(ngModel)]="rScopeCode">
                  @for (p of products(); track p.id) { <option [value]="p.code">{{ p.label }}</option> }
                </select>
              } @else {
                <input [(ngModel)]="rScopeCode" placeholder="bancaire" />
              }
            </label>
            <label style="width:120px">Bénéficiaire
              <select [(ngModel)]="rTargetType">
                <option value="ROLE">Rôle</option>
                <option value="USER">Utilisateur</option>
              </select>
            </label>
            <label style="width:150px">{{ rTargetType() === 'ROLE' ? 'Rôle' : 'ID utilisateur' }}
              @if (rTargetType() === 'ROLE') {
                <select [(ngModel)]="rTargetValue">
                  <option value="COLLECTEUR">Collecteur</option>
                  <option value="AGENT">Chargé de clientèle</option>
                  <option value="CHEF_EQUIPE">Chef d’équipe</option>
                  <option value="SUPERVISEUR">Superviseur</option>
                </select>
              } @else {
                <input [(ngModel)]="rTargetValue" placeholder="u-xxxxxxxx" />
              }
            </label>
            <label style="width:110px">Type
              <select [(ngModel)]="rRateType">
                <option value="PERCENT">Pourcentage</option>
                <option value="FIXED">Montant fixe</option>
              </select>
            </label>
            <label style="width:110px">{{ rRateType() === 'PERCENT' ? 'Taux (%)' : 'Montant' }}
              <input type="number" [(ngModel)]="rRateValue" min="0" />
            </label>
            <button class="btn" (click)="createRule()" [disabled]="!rScopeCode() || !rTargetValue() || cSaving()" style="padding:8px 14px"><ic name="plus" [size]="13"></ic> Ajouter</button>
          </div>
        </div>

        <!-- Rules list -->
        <div class="kicker" style="margin-bottom:6px">Règles · {{ rules().length }}</div>
        @for (r of rules(); track r.id) {
          <div class="card" style="padding:10px 14px;margin-bottom:8px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:12.5px">
            <span class="badge" [style.background]="r.active ? '#ecfdf3' : 'var(--surface-2)'" [style.color]="r.active ? '#067647' : 'var(--muted)'" style="font-size:10px">{{ r.active ? 'Active' : 'Inactive' }}</span>
            <span><b>{{ r.scopeType === 'PRODUCT' ? 'Produit' : 'Groupe' }}</b> {{ r.scopeCode }}</span>
            <span class="muted">→</span>
            <span><b>{{ r.targetType === 'ROLE' ? 'Rôle' : 'Utilisateur' }}</b> {{ r.targetValue }}</span>
            <span style="flex:1"></span>
            <span style="font-weight:800">{{ r.rateType === 'PERCENT' ? r.rateValue + ' %' : (r.rateValue | number) + ' XAF' }}</span>
            <button class="icon-btn" (click)="toggleRule(r)" [title]="r.active ? 'Désactiver' : 'Activer'"><ic name="refresh" [size]="13"></ic></button>
            <button class="icon-btn" (click)="removeRule(r)" title="Supprimer"><ic name="trash" [size]="13"></ic></button>
          </div>
        }
        @if (!rules().length) { <p class="muted" style="font-size:12.5px">Aucune règle de commission.</p> }

        <!-- Ledger -->
        <div class="kicker" style="margin:16px 0 6px">Commissions générées · total {{ totalCommissions() | number }} XAF</div>
        @if (!entries().length) {
          <p class="muted" style="font-size:12.5px">Aucune commission générée pour l’instant.</p>
        } @else {
          <div class="card" style="padding:4px 0;overflow:hidden">
            @for (e of entries(); track e.id) {
              <div style="display:flex;align-items:center;gap:10px;padding:9px 14px;border-top:1px solid var(--border);font-size:12.5px">
                <span style="min-width:0;flex:1;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{ e.beneficiaryName || e.beneficiaryId }}</span>
                <span class="muted" style="font-size:11px">{{ e.productCode }}</span>
                <span class="muted" style="font-size:11px">{{ e.saleRef }}</span>
                <span style="font-weight:800">{{ e.amount | number }}</span>
              </div>
            }
          </div>
        }
      }
      }
    </div>
  </div>`,
})
export class ManagerComponent implements OnInit {
  i18n = inject(I18n);
  auth = inject(Auth);
  private api = inject(Api);

  tab = signal<'catalogue' | 'commissions'>('catalogue');
  products = signal<Product[]>([]);
  loading = signal(true);
  saving = signal(false);
  formErr = signal('');

  // commissions
  rules = signal<CommissionRule[]>([]);
  entries = signal<CommissionEntry[]>([]);
  cLoading = signal(false);
  cSaving = signal(false);
  commissionsLoaded = false;
  totalCommissions = computed(() => this.entries().reduce((sum, e) => sum + e.amount, 0));
  // new-rule form
  rScopeType = signal<CommissionScopeType>('GROUP');
  rScopeCode = signal('bancaire');
  rTargetType = signal<CommissionTargetType>('ROLE');
  rTargetValue = signal('COLLECTEUR');
  rRateType = signal<CommissionRateType>('PERCENT');
  rRateValue = signal(0);

  // new-product form
  nLabel = signal(''); nCode = signal(''); nGroup = signal('bancaire'); nPrice = signal(0);

  // edit state
  editId = signal<number | null>(null);
  eLabel = signal(''); eCode = signal(''); eGroup = signal(''); ePrice = signal(0); eActive = signal(true);
  eComponents = signal<{ ckey: string; label: string | null; amount: number }[]>([]);

  // new-promotion form
  pType = signal<PromotionType>('PERCENT'); pValue = signal(0); pStart = signal(''); pEnd = signal('');

  ngOnInit() { this.load(); }

  load() {
    this.loading.set(true);
    this.api.listProducts().subscribe({
      next: (ps) => { this.products.set(ps); this.loading.set(false); },
      error: () => { this.products.set([]); this.loading.set(false); },
    });
  }

  createProduct() {
    const label = this.nLabel().trim();
    if (!label) return;
    this.saving.set(true); this.formErr.set('');
    const req: ProductRequest = {
      code: (this.nCode().trim() || label.toLowerCase().replace(/\s+/g, '_')),
      label, groupCode: this.nGroup().trim() || null, kind: 'BANK' as ProductKind,
      basePrice: Math.max(0, this.nPrice() || 0), active: true,
    };
    this.api.createProduct(req).subscribe({
      next: () => { this.nLabel.set(''); this.nCode.set(''); this.nPrice.set(0); this.saving.set(false); this.load(); },
      error: (e) => { this.formErr.set(e?.error?.error === 'code_exists' ? 'Ce code existe déjà.' : 'Échec de la création.'); this.saving.set(false); },
    });
  }

  toggleEdit(p: Product) {
    if (this.editId() === p.id) { this.editId.set(null); return; }
    this.editId.set(p.id);
    this.eLabel.set(p.label); this.eCode.set(p.code); this.eGroup.set(p.groupCode || '');
    this.ePrice.set(p.basePrice); this.eActive.set(p.active);
    this.eComponents.set(p.components.map((c) => ({ ...c })));
    this.pType.set('PERCENT'); this.pValue.set(0); this.pStart.set(''); this.pEnd.set('');
  }

  setComp(ckey: string, amount: number) {
    this.eComponents.update((cs) => cs.map((c) => (c.ckey === ckey ? { ...c, amount: Math.max(0, amount || 0) } : c)));
  }

  saveProduct(p: Product) {
    this.saving.set(true);
    const req: ProductRequest = {
      code: p.builtin ? p.code : (this.eCode().trim() || p.code),
      label: this.eLabel().trim() || p.label,
      groupCode: this.eGroup().trim() || null,
      kind: p.kind, basePrice: Math.max(0, this.ePrice() || 0), active: this.eActive(),
      components: p.kind === 'CARD' ? this.eComponents() : undefined,
    };
    this.api.updateProduct(p.id, req).subscribe({
      next: () => { this.saving.set(false); this.editId.set(null); this.load(); },
      error: () => { this.saving.set(false); this.formErr.set('Échec de l’enregistrement.'); },
    });
  }

  removeProduct(p: Product) {
    if (!confirm(`Supprimer le produit « ${p.label} » ?`)) return;
    this.api.deleteProduct(p.id).subscribe({ next: () => this.load(), error: () => {} });
  }

  addPromo(p: Product) {
    this.saving.set(true);
    const req: PromotionRequest = {
      type: this.pType(), value: Math.max(0, this.pValue() || 0),
      startDate: this.pStart() || null, endDate: this.pEnd() || null, active: true,
    };
    this.api.addPromotion(p.id, req).subscribe({
      next: () => { this.saving.set(false); this.pValue.set(0); this.pStart.set(''); this.pEnd.set(''); this.load(); },
      error: () => { this.saving.set(false); },
    });
  }

  togglePromo(pr: Promotion) {
    const req: PromotionRequest = {
      label: pr.label, type: pr.type, value: pr.value,
      startDate: pr.startDate, endDate: pr.endDate, active: !pr.active,
    };
    this.api.updatePromotion(pr.id, req).subscribe({ next: () => this.load(), error: () => {} });
  }

  removePromo(pr: Promotion) {
    if (!confirm('Supprimer cette promotion ?')) return;
    this.api.deletePromotion(pr.id).subscribe({ next: () => this.load(), error: () => {} });
  }

  // ---- commissions ----
  switchTo(tab: 'catalogue' | 'commissions') {
    this.tab.set(tab);
    if (tab === 'commissions' && !this.commissionsLoaded) this.loadCommissions();
  }

  loadCommissions() {
    this.cLoading.set(true);
    this.api.listCommissionRules().subscribe({
      next: (rs) => {
        this.rules.set(rs);
        this.api.listCommissionEntries().subscribe({
          next: (es) => { this.entries.set(es); this.commissionsLoaded = true; this.cLoading.set(false); },
          error: () => { this.entries.set([]); this.cLoading.set(false); },
        });
      },
      error: () => { this.rules.set([]); this.cLoading.set(false); },
    });
  }

  createRule() {
    if (!this.rScopeCode().trim() || !this.rTargetValue().trim()) return;
    this.cSaving.set(true);
    const req: CommissionRuleRequest = {
      scopeType: this.rScopeType(), scopeCode: this.rScopeCode().trim(),
      targetType: this.rTargetType(), targetValue: this.rTargetValue().trim(),
      rateType: this.rRateType(), rateValue: Math.max(0, this.rRateValue() || 0), active: true,
    };
    this.api.createCommissionRule(req).subscribe({
      next: () => { this.cSaving.set(false); this.rRateValue.set(0); this.refreshCommissions(); },
      error: () => { this.cSaving.set(false); },
    });
  }

  toggleRule(r: CommissionRule) {
    const req: CommissionRuleRequest = {
      scopeType: r.scopeType, scopeCode: r.scopeCode, targetType: r.targetType, targetValue: r.targetValue,
      rateType: r.rateType, rateValue: r.rateValue, startDate: r.startDate, endDate: r.endDate, active: !r.active,
    };
    this.api.updateCommissionRule(r.id, req).subscribe({ next: () => this.refreshCommissions(), error: () => {} });
  }

  removeRule(r: CommissionRule) {
    if (!confirm('Supprimer cette règle de commission ?')) return;
    this.api.deleteCommissionRule(r.id).subscribe({ next: () => this.refreshCommissions(), error: () => {} });
  }

  private refreshCommissions() {
    this.api.listCommissionRules().subscribe({ next: (rs) => this.rules.set(rs), error: () => {} });
    this.api.listCommissionEntries().subscribe({ next: (es) => this.entries.set(es), error: () => {} });
  }
}
