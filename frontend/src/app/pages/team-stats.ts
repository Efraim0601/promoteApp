import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { I18n } from '../core/i18n';
import { Api } from '../core/api';
import { Auth } from '../core/auth';
import { HierarchyStats, Product, TeamMember } from '../core/models';
import { AppBarComponent } from '../shared/app-bar';
import { IconComponent } from '../shared/icon';
import { SpinnerComponent } from '../shared/spinner';
import { NotifBellComponent } from '../shared/notif-bell';
import { RevealDirective } from '../shared/reveal';

/**
 * Hierarchy-scoped sales dashboard, shared by every level of the management chain. The backend
 * bounds the data to the caller's perimeter: admin/manager see the whole organisation, a superviseur
 * sees their chefs d'équipe and teams, a chef d'équipe sees only their own team. A product filter
 * lets a manager drill into a single product. Back-office screen — French strings inline.
 */
@Component({
  selector: 'page-team-stats',
  standalone: true,
  imports: [FormsModule, DecimalPipe, AppBarComponent, IconComponent, SpinnerComponent, NotifBellComponent, RevealDirective],
  template: `
  <div class="scr">
    <app-bar>
      <notif-bell appbar-right></notif-bell>
      <button appbar-right class="icon-btn" (click)="auth.logout()" [title]="i18n.t('logout')"><ic name="logout" [size]="15" [sw]="2"></ic></button>
    </app-bar>
    <div class="scr-body" reveal="screen">
      <div class="kicker" style="margin-bottom:4px" data-reveal="item"><ic name="chart" [size]="13" style="vertical-align:-2px;margin-right:4px"></ic>Statistiques de vente</div>
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;flex-wrap:wrap" data-reveal="item">
        <h1 style="font-size:21px;margin:0;flex:1">{{ scopeLabel() }}</h1>
        <label style="font-size:12px">Produit
          <select [(ngModel)]="productCode" (ngModelChange)="load()" style="margin-left:6px">
            <option value="">Tous</option>
            @for (p of products(); track p.id) { <option [value]="p.code">{{ p.label }}</option> }
          </select>
        </label>
        <button class="icon-btn" (click)="load()" [title]="i18n.t('map_reload')"><ic name="refresh" [size]="16"></ic></button>
      </div>

      @if (loading()) {
        <div class="load-center"><spinner tone="primary" [size]="22"></spinner> {{ i18n.t('loading') }}</div>
      } @else if (stats(); as s) {
        <!-- Totals -->
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;margin-bottom:14px">
          <div class="card" style="padding:12px;text-align:center" data-reveal="kpi">
            <div style="font-size:26px;font-weight:800;color:var(--primary);line-height:1">{{ s.totalSubscriptions | number }}</div>
            <div class="muted" style="font-size:11px;font-weight:700;margin-top:4px;text-transform:uppercase">Souscriptions</div>
          </div>
          <div class="card" style="padding:12px;text-align:center" data-reveal="kpi">
            <div style="font-size:26px;font-weight:800;color:var(--primary);line-height:1">{{ s.totalCollectes | number }}</div>
            <div class="muted" style="font-size:11px;font-weight:700;margin-top:4px;text-transform:uppercase">Collectes</div>
          </div>
          <div class="card" style="padding:12px;text-align:center" data-reveal="kpi">
            <div style="font-size:22px;font-weight:800;line-height:1">{{ s.totalCommissions | number }}</div>
            <div class="muted" style="font-size:11px;font-weight:700;margin-top:4px;text-transform:uppercase">Commissions (XAF)</div>
          </div>
        </div>

        <!-- Members -->
        <div class="kicker" style="margin-bottom:6px" data-reveal="item">Équipe · {{ s.members.length }}</div>
        @if (!s.members.length) {
          <p class="muted" style="font-size:12.5px">Aucune vente sur le périmètre.</p>
        } @else {
          <div class="card" style="padding:0;overflow:hidden" data-reveal="item">
            <div style="display:flex;align-items:center;gap:10px;padding:8px 14px;border-bottom:1px solid var(--border);font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase">
              <span style="flex:1">Membre</span>
              <span style="width:48px;text-align:right">Sousc.</span>
              <span style="width:48px;text-align:right">Coll.</span>
              <span style="width:80px;text-align:right">Comm.</span>
            </div>
            @for (m of s.members; track m.id) {
              <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid var(--border);font-size:12.5px">
                <span style="min-width:0;flex:1">
                  <span style="font-weight:600">{{ m.name }}</span>
                  <span class="muted" style="font-size:10.5px;margin-left:6px">{{ roleLabel(m.role) }}</span>
                </span>
                <span style="width:48px;text-align:right;font-weight:700">{{ m.subscriptions | number }}</span>
                <span style="width:48px;text-align:right;font-weight:700">{{ m.collectes | number }}</span>
                <span style="width:80px;text-align:right;font-weight:800">{{ m.commissionTotal | number }}</span>
              </div>
            }
          </div>
        }
      } @else {
        <p class="err" style="text-align:center;font-weight:700">Erreur de chargement.</p>
      }

      <!-- Team roster + messaging -->
      @if (roster().length) {
        <div class="kicker" style="margin:18px 0 6px" data-reveal="item">Mon équipe · {{ roster().length }}</div>
        <div class="card" style="padding:4px 0;overflow:hidden;margin-bottom:12px" data-reveal="card">
          @for (m of roster(); track m.id) {
            <label style="display:flex;align-items:center;gap:10px;padding:9px 14px;border-bottom:1px solid var(--border);font-size:12.5px;cursor:pointer">
              <input type="checkbox" [checked]="selected().has(m.id)" (change)="toggleSelect(m.id)" style="width:auto" />
              <span style="flex:1;font-weight:600">{{ m.name }}</span>
              <span class="muted" style="font-size:10.5px">{{ roleLabel(m.role) }}</span>
            </label>
          }
        </div>

        <div class="card" style="padding:14px" data-reveal="card">
          <div class="kicker" style="margin-bottom:8px">Envoyer un message {{ selected().size ? '(' + selected().size + ' sélectionné·s)' : '(toute l’équipe)' }}</div>
          <input [(ngModel)]="msgTitle" placeholder="Titre" style="width:100%;margin-bottom:8px" />
          <textarea [(ngModel)]="msgBody" placeholder="Votre message…" rows="3" style="width:100%;margin-bottom:8px"></textarea>
          <div style="display:flex;align-items:center;gap:10px">
            <button class="btn" (click)="sendMessage()" [disabled]="!msgBody().trim() || sending()" style="padding:8px 16px"><ic name="arrowR" [size]="13"></ic> Envoyer</button>
            @if (sentInfo()) { <span class="muted" style="font-size:12px">{{ sentInfo() }}</span> }
          </div>
        </div>
      }
    </div>
  </div>`,
})
export class TeamStatsComponent implements OnInit {
  i18n = inject(I18n);
  auth = inject(Auth);
  private api = inject(Api);

  stats = signal<HierarchyStats | null>(null);
  products = signal<Product[]>([]);
  productCode = signal('');
  loading = signal(true);

  scopeLabel = computed(() => this.stats()?.scope === 'SUBTREE' ? 'Mon équipe' : 'Organisation commerciale');

  // team roster + messaging
  roster = signal<TeamMember[]>([]);
  selected = signal<Set<string>>(new Set());
  msgTitle = signal('');
  msgBody = signal('');
  sending = signal(false);
  sentInfo = signal('');

  ngOnInit() {
    this.api.listProducts().subscribe({ next: (ps) => this.products.set(ps), error: () => {} });
    this.api.teamRoster().subscribe({ next: (r) => this.roster.set(r), error: () => {} });
    this.load();
  }

  toggleSelect(id: string) {
    this.selected.update((set) => {
      const next = new Set(set);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  sendMessage() {
    const body = this.msgBody().trim();
    if (!body) return;
    this.sending.set(true); this.sentInfo.set('');
    const ids = Array.from(this.selected());
    this.api.teamMessage({ title: this.msgTitle().trim(), body, recipientIds: ids.length ? ids : null }).subscribe({
      next: (res) => {
        this.sending.set(false);
        this.sentInfo.set(`Envoyé à ${res.sent} membre(s).`);
        this.msgTitle.set(''); this.msgBody.set(''); this.selected.set(new Set());
      },
      error: () => { this.sending.set(false); this.sentInfo.set('Échec de l’envoi.'); },
    });
  }

  load() {
    this.loading.set(true);
    this.api.hierarchyStats(this.productCode() || null).subscribe({
      next: (s) => { this.stats.set(s); this.loading.set(false); },
      error: () => { this.stats.set(null); this.loading.set(false); },
    });
  }

  roleLabel(role: string) {
    switch (role) {
      case 'ADMIN': return this.i18n.t('role_admin');
      case 'MANAGER': return this.i18n.t('role_manager');
      case 'SUPERVISEUR': return this.i18n.t('role_superviseur');
      case 'CHEF_EQUIPE': return this.i18n.t('role_chef_equipe');
      case 'PRINT_AGENT': return this.i18n.t('role_print');
      case 'CASHIER': return this.i18n.t('role_cashier');
      case 'COLLECTEUR': return this.i18n.t('role_collecteur');
      default: return this.i18n.t('role_agent');
    }
  }
}
