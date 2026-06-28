import { Component, inject, signal } from '@angular/core';
import { Api } from '../core/api';
import { I18n } from '../core/i18n';
import {
  CommissionEntryDto, CommissionRuleDto, HierarchyStatsDto, ProductDto, TeamMemberDto,
} from '../core/models';
import { StaffSidebar } from '../shared/staff-sidebar';

type Tab = 'catalogue' | 'commissions' | 'hierarchy' | 'team';
const fcfa = (n: number) => new Intl.NumberFormat('fr-FR').format(Math.round(n || 0)) + ' F';

@Component({
  selector: 'app-manager',
  imports: [StaffSidebar],
  template: `
    <app-staff-sidebar active="manager" />
    <div style="flex:1;padding:16px 16px 40px;padding-top:48px;max-width:900px;margin:0 auto;width:100%">
      <div style="padding-left:36px">
        <div class="tabs">
          @for (t of tabs; track t) { <button (click)="setTab(t)" class="tab" [class.tab-on]="tab() === t">{{ i18n.t('mgr_' + t) }}</button> }
        </div>

        <!-- CATALOGUE -->
        @if (tab() === 'catalogue') {
          <div class="fade-in" style="display:flex;flex-direction:column;gap:8px">
            @for (p of products(); track p.id) {
              <div class="row">
                <div style="display:flex;justify-content:space-between;align-items:flex-start">
                  <div>
                    <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
                      <span style="font-size:14px;font-weight:700;color:var(--navy)">{{ p.label }}</span>
                      @if (hasPromo(p)) { <span class="promo">PROMO</span> }
                      @if (!p.active) { <span class="off">off</span> }
                    </div>
                    <div style="font-size:11px;color:var(--muted);margin-top:2px">{{ p.kind }} · {{ p.groupCode }} · {{ p.code }}</div>
                  </div>
                  <div style="text-align:right">
                    @if (hasPromo(p)) { <div style="font-size:11px;color:var(--muted-2);text-decoration:line-through">{{ money(p.basePrice) }}</div> }
                    <div style="font-size:15px;font-weight:800;color:var(--primary)">{{ money(p.effectivePrice) }}</div>
                  </div>
                </div>
              </div>
            }
          </div>
        }

        <!-- COMMISSIONS -->
        @if (tab() === 'commissions') {
          <div class="fade-in">
            <div style="display:flex;gap:2px;margin-bottom:14px;border-bottom:2px solid var(--surface-3)">
              <button (click)="commSub.set('rules')" class="tab" [class.tab-on]="commSub() === 'rules'">{{ i18n.t('mgr_rules') }} ({{ rules().length }})</button>
              <button (click)="commSub.set('entries'); loadEntries()" class="tab" [class.tab-on]="commSub() === 'entries'">{{ i18n.t('mgr_entries') }}</button>
            </div>
            @if (commSub() === 'rules') {
              <div style="display:flex;flex-direction:column;gap:6px">
                @for (r of rules(); track r.id) {
                  <div class="row">
                    <div style="display:flex;justify-content:space-between;align-items:center">
                      <div><div style="font-size:13px;font-weight:700;color:var(--navy)">{{ r.scopeType }} {{ r.scopeCode }}</div><div style="font-size:11px;color:var(--muted)">{{ r.targetType }} {{ r.targetValue }}</div></div>
                      <div style="text-align:right"><span style="font-size:15px;font-weight:800;color:var(--primary)">{{ r.rateType === 'percent' ? r.rateValue + '%' : money(r.rateValue) }}</span>@if (!r.active) { <span class="off">off</span> }</div>
                    </div>
                  </div>
                }
                @if (rules().length === 0) { <div class="empty">{{ i18n.t('adm_no_data') }}</div> }
              </div>
            } @else {
              <div style="display:flex;flex-direction:column;gap:6px">
                @for (e of entries(); track e.id) {
                  <div class="row">
                    <div style="display:flex;justify-content:space-between;align-items:center">
                      <div><span class="mono" style="font-size:12px;font-weight:700;color:var(--navy)">{{ e.saleRef }}</span><div style="font-size:11px;color:var(--muted)">{{ e.beneficiaryName }} · {{ e.productCode }}</div></div>
                      <span style="font-size:14px;font-weight:800;color:#059669">{{ money(e.amount) }}</span>
                    </div>
                  </div>
                }
                @if (entries().length === 0) { <div class="empty">{{ i18n.t('adm_no_data') }}</div> }
              </div>
            }
          </div>
        }

        <!-- HIERARCHY -->
        @if (tab() === 'hierarchy') {
          <div class="fade-in">
            @if (hier()) {
              <div class="kpis">
                <div class="kpi"><div class="kv">{{ hier()!.totalSubscriptions }}</div><div class="kl">{{ i18n.t('mgr_total_subs') }}</div></div>
                <div class="kpi"><div class="kv" style="color:var(--primary)">{{ money(hier()!.totalSubscriptionsAmount) }}</div><div class="kl">{{ i18n.t('mgr_total_amount') }}</div></div>
                <div class="kpi"><div class="kv" style="color:#2563EB">{{ hier()!.totalCollectes }}</div><div class="kl">{{ i18n.t('mgr_total_collectes') }}</div></div>
                <div class="kpi"><div class="kv" style="color:#059669">{{ money(hier()!.totalCommissions) }}</div><div class="kl">{{ i18n.t('mgr_total_comm') }}</div></div>
              </div>
              <div style="display:flex;flex-direction:column;gap:6px">
                @for (m of hier()!.members; track m.id) {
                  <div class="row">
                    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px">
                      <div style="min-width:0"><div style="font-size:13px;font-weight:700;color:var(--navy)">{{ m.name }}</div><div style="font-size:11px;color:var(--muted)">{{ m.role }}</div></div>
                      <div style="display:flex;gap:14px;flex-shrink:0;text-align:right">
                        <div><div style="font-size:13px;font-weight:800;color:var(--navy)">{{ m.subscriptions }}</div><div class="kl">{{ i18n.t('mgr_total_subs') }}</div></div>
                        <div><div style="font-size:13px;font-weight:800;color:#059669">{{ money(m.commissionTotal) }}</div><div class="kl">{{ i18n.t('mgr_total_comm') }}</div></div>
                      </div>
                    </div>
                  </div>
                }
              </div>
            }
          </div>
        }

        <!-- TEAM -->
        @if (tab() === 'team') {
          <div class="fade-in">
            <div class="panel" style="margin-bottom:16px">
              <div style="font-size:14px;font-weight:700;color:var(--navy);margin-bottom:12px">{{ i18n.t('team_message') }}</div>
              <div class="fld"><label class="lab">{{ i18n.t('team_subject') }}</label><input class="in" [value]="msgTitle()" (input)="msgTitle.set(val($event))"></div>
              <div class="fld"><label class="lab">{{ i18n.t('team_body') }}</label><textarea class="in" rows="3" [value]="msgBody()" (input)="msgBody.set(val($event))"></textarea></div>
              @if (msgSent()) { <div class="alert-success" style="margin-bottom:10px">✓ {{ i18n.t('team_sent') }}</div> }
              <button (click)="sendMsg()" class="btn btn-primary" style="width:auto;padding:10px 18px;border-radius:10px">{{ i18n.t('team_send') }}</button>
            </div>
            <div style="font-size:13px;font-weight:700;color:var(--navy);margin-bottom:8px">{{ i18n.t('team_roster') }} ({{ roster().length }})</div>
            <div style="display:flex;flex-direction:column;gap:6px">
              @for (m of roster(); track m.id) {
                <div class="row"><div style="display:flex;justify-content:space-between;align-items:center"><div><div style="font-size:13px;font-weight:700;color:var(--navy)">{{ m.name }}</div><div style="font-size:11px;color:var(--muted)">{{ m.agency }}</div></div><span class="rolechip">{{ m.role }}</span></div></div>
              }
            </div>
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    :host { display:flex;flex:1;flex-direction:column }
    .tabs { display:flex;gap:2px;margin-bottom:20px;border-bottom:2px solid var(--surface-3);overflow-x:auto }
    .tab { padding:10px 12px;border:none;background:none;font-size:12px;font-weight:700;cursor:pointer;color:var(--muted);border-bottom:2px solid transparent;margin-bottom:-2px;white-space:nowrap }
    .tab-on { color:var(--primary);border-bottom-color:var(--primary) }
    .row { background:#fff;border-radius:12px;padding:14px;box-shadow:0 1px 3px rgba(0,0,0,.04);border:1px solid var(--surface-3) }
    .kpis { display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px;margin-bottom:20px }
    .kpi { background:#fff;border-radius:12px;padding:14px;box-shadow:0 1px 3px rgba(0,0,0,.04);border:1px solid var(--surface-3) }
    .kv { font-size:20px;font-weight:800;color:var(--navy) }
    .kl { font-size:11px;color:var(--muted);margin-top:2px }
    .panel { background:#fff;border-radius:14px;padding:18px;box-shadow:0 1px 4px rgba(0,0,0,.04);border:1px solid var(--surface-3) }
    .fld { margin-bottom:12px } .lab { display:block;font-size:12px;font-weight:600;color:var(--label);margin-bottom:4px }
    .in { width:100%;padding:10px 12px;border:1.5px solid var(--border);border-radius:10px;font-size:14px;background:var(--surface-2);font-family:inherit }
    .promo { padding:2px 6px;border-radius:4px;background:#FEF2F2;color:var(--primary);font-size:10px;font-weight:700 }
    .off { padding:2px 6px;border-radius:4px;background:var(--surface-3);color:var(--muted);font-size:10px;font-weight:700;margin-left:4px }
    .rolechip { padding:2px 8px;border-radius:12px;font-size:10px;font-weight:700;background:var(--surface-3);color:var(--label) }
    .empty { text-align:center;color:var(--muted);padding:24px }
  `],
})
export class ManagerPage {
  protected i18n = inject(I18n);
  private api = inject(Api);
  tabs: Tab[] = ['catalogue', 'commissions', 'hierarchy', 'team'];

  tab = signal<Tab>('catalogue');
  products = signal<ProductDto[]>([]);
  rules = signal<CommissionRuleDto[]>([]);
  entries = signal<CommissionEntryDto[]>([]);
  hier = signal<HierarchyStatsDto | null>(null);
  roster = signal<TeamMemberDto[]>([]);
  commSub = signal<'rules' | 'entries'>('rules');
  msgTitle = signal(''); msgBody = signal(''); msgSent = signal(false);

  constructor() { this.api.products().subscribe({ next: (l) => this.products.set(l), error: () => {} }); }

  val(e: Event) { return (e.target as HTMLInputElement | HTMLTextAreaElement).value; }
  money = (n: number) => fcfa(n);
  hasPromo = (p: ProductDto) => p.effectivePrice < p.basePrice || (p.promotions?.some((x) => x.active) ?? false);

  setTab(t: Tab) {
    this.tab.set(t);
    if (t === 'commissions' && this.rules().length === 0) this.api.commissionRules().subscribe({ next: (l) => this.rules.set(l), error: () => {} });
    if (t === 'hierarchy' && !this.hier()) this.api.hierarchyStats().subscribe({ next: (h) => this.hier.set(h), error: () => {} });
    if (t === 'team' && this.roster().length === 0) this.api.teamRoster().subscribe({ next: (l) => this.roster.set(l), error: () => {} });
  }
  loadEntries() { if (this.entries().length === 0) this.api.commissionEntries().subscribe({ next: (l) => this.entries.set(l), error: () => {} }); }
  sendMsg() {
    this.api.sendTeamMessage(this.msgTitle().trim(), this.msgBody().trim(), []).subscribe({
      next: () => { this.msgSent.set(true); this.msgTitle.set(''); this.msgBody.set(''); },
    });
  }
}
