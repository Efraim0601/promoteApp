import { Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { I18n } from '../core/i18n';
import { Api } from '../core/api';
import { Auth } from '../core/auth';
import { AgentStats, ClaimResult, Subscription } from '../core/models';
import { AppBarComponent } from '../shared/app-bar';
import { IconComponent } from '../shared/icon';
import { AvatarComponent } from '../shared/avatar';
import { TxRowComponent } from '../shared/tx-row';
import { PhoneFieldComponent, CniFieldComponent } from '../shared/fields';

@Component({
  selector: 'page-agent-home',
  standalone: true,
  imports: [AppBarComponent, IconComponent, AvatarComponent, TxRowComponent, PhoneFieldComponent, CniFieldComponent],
  template: `
  <div class="scr">
    <app-bar>
      <button appbar-right class="icon-btn" (click)="auth.logout()" [title]="i18n.t('logout')"><ic name="logout" [size]="15" [sw]="2"></ic></button>
    </app-bar>
    <div class="scr-body">
      <div style="display:flex;align-items:center;gap:12px">
        <avatar [name]="auth.user()!.name" role="agent" [size]="46"></avatar>
        <div style="min-width:0">
          <div class="muted" style="font-size:12.5px;font-weight:600">{{ i18n.t('greeting') }},</div>
          <div style="font-size:18px;font-weight:800;font-family:var(--font-head);line-height:1.1">{{ auth.user()!.name }}</div>
          <div class="muted" style="font-size:12px;margin-top:2px"><ic name="store" [size]="12" style="vertical-align:-1px;margin-right:3px"></ic>{{ auth.user()!.agency }}</div>
        </div>
      </div>

      <button class="btn btn-primary" (click)="newSub()"><ic name="plus" [size]="19"></ic> {{ i18n.t('new_sub_btn') }}</button>
      <button class="btn btn-outline" (click)="claiming.set(true)" style="margin-top:-4px"><ic name="qr" [size]="18"></ic> {{ i18n.t('claim_btn') }}</button>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div class="kpi"><div class="kv">{{ stats()?.total ?? 0 }}</div><div class="kl">{{ i18n.t('kpi_my_subs') }}</div></div>
        <div class="kpi"><div class="kv" style="color:var(--success)">{{ stats()?.paid ?? 0 }}</div><div class="kl">{{ i18n.t('kpi_success') }}</div></div>
        <div class="kpi"><div class="kv" style="color:var(--af-gold)">{{ stats()?.pending ?? 0 }}</div><div class="kl">{{ i18n.t('kpi_pending') }}</div></div>
        <div class="kpi"><div class="kv" style="font-size:17px;color:var(--primary)">{{ i18n.money(stats()?.collected ?? 0) }}</div><div class="kl">{{ i18n.t('kpi_collected') }}</div></div>
      </div>

      <div class="card" style="overflow:hidden">
        <div style="display:flex;align-items:center;gap:8px;padding:14px 14px 10px">
          <ic name="chart" [size]="17" style="color:var(--primary)"></ic>
          <h3 style="font-size:15px">{{ i18n.t('my_sales') }}</h3>
          <span class="muted" style="margin-left:auto;font-size:12px;font-weight:700">{{ mine().length }}</span>
        </div>
        <div style="padding:0 6px 6px">
          @if (mine().length === 0) {
            <p class="muted" style="font-size:13px;padding:8px 14px 20px;text-align:center">{{ i18n.t('tx_empty') }}</p>
          } @else {
            <div style="display:flex;flex-direction:column">
              @for (t of reversed; track t.ref) { <tx-row [t]="t" (open)="openRef(t.ref)"></tx-row> }
            </div>
          }
        </div>
      </div>
      <div style="flex:1"></div>
      <button class="btn btn-ghost" (click)="auth.logout()" style="font-size:13.5px"><ic name="logout" [size]="16"></ic> {{ i18n.t('logout') }}</button>
    </div>

    @if (claiming()) {
      <div class="modal-overlay" (click)="close()">
        <div class="modal-sheet" (click)="$event.stopPropagation()">
          <div style="display:flex;align-items:flex-start;gap:10px">
            <span class="tile-ic" style="width:40px;height:40px;border-radius:11px;flex-shrink:0"><ic name="qr" [size]="20"></ic></span>
            <div style="min-width:0;flex:1">
              <h2 style="font-size:17px;line-height:1.2">{{ i18n.t('claim_title') }}</h2>
              <p class="muted" style="font-size:11.5px;line-height:1.4;margin-top:4px">{{ i18n.t('claim_sub') }}</p>
            </div>
            <button class="back-link" (click)="close()" style="flex-shrink:0"><ic name="x" [size]="20"></ic></button>
          </div>

          @if (!res() || !res()!.ok) {
            <phone-field [label]="i18n.t('tel')" [value]="phone()" (valueChange)="phone.set($event); res.set(null)"></phone-field>
            <cni-field [label]="i18n.t('cni')" [value]="cni()" (valueChange)="cni.set($event); res.set(null)"></cni-field>
            @if (res()) {
              <div class="feedback err-box"><ic name="alert" [size]="20" style="flex-shrink:0"></ic><div style="font-size:12px;font-weight:600;line-height:1.35">{{ i18n.t(failKey) }}</div></div>
            }
            <button class="btn btn-primary" (click)="submit()" [disabled]="!canSubmit"><ic name="search" [size]="18"></ic> {{ i18n.t('claim_submit') }}</button>
          } @else {
            <div class="feedback ok-box">
              <ic name="check" [size]="20" [sw]="2.6" style="flex-shrink:0"></ic>
              <div style="min-width:0"><div style="font-weight:700;font-size:13px">{{ res()!.record!.fullName }}</div><div style="font-size:11.5px">{{ i18n.t('claim_ok') }}</div></div>
            </div>
            <button class="btn btn-primary" (click)="close()">{{ i18n.t('close') }}</button>
          }
        </div>
      </div>
    }
  </div>`,
  styles: [`
    .modal-overlay{ position:absolute; inset:0; z-index:50; display:flex; flex-direction:column; justify-content:flex-end; align-items:center;
      background:rgba(15,20,18,.5); backdrop-filter:blur(2px); }
    .modal-sheet{ width:100%; max-width:720px; background:var(--bg2); border-top-left-radius:22px; border-top-right-radius:22px; padding:20px;
      box-shadow:0 -10px 40px rgba(0,0,0,.3); display:flex; flex-direction:column; gap:14px; }
    @media (min-width:760px){ .modal-sheet{ border-radius:22px; margin-bottom:24px; } }
    .feedback{ display:flex; align-items:center; gap:10px; padding:12px 14px; border-radius:var(--radius); }
    .ok-box{ background:var(--success-soft); color:var(--success); }
    .err-box{ background:var(--accent-soft); color:var(--accent); }
  `],
})
export class AgentHomeComponent implements OnInit {
  i18n = inject(I18n);
  auth = inject(Auth);
  private api = inject(Api);
  private router = inject(Router);

  stats = signal<AgentStats | null>(null);
  mine = signal<Subscription[]>([]);
  claiming = signal(false);
  phone = signal('');
  cni = signal('');
  res = signal<ClaimResult | null>(null);

  ngOnInit() { this.refresh(); }
  private refresh() {
    this.api.agentStats().subscribe((s) => this.stats.set(s));
    this.api.mySubscriptions().subscribe((m) => this.mine.set(m));
  }

  get reversed() { return this.mine().slice().reverse(); }
  get canSubmit() { return /^6\d{8}$/.test(this.phone()) && this.cni().length >= 6; }
  get failKey() {
    const r = this.res();
    return r?.reason === 'unpaid' ? 'claim_unpaid' : r?.reason === 'taken' ? 'claim_taken' : 'claim_notfound';
  }

  newSub() { this.router.navigateByUrl('/subscribe'); }
  openRef(ref: string) { this.router.navigate(['/print'], { queryParams: { ref } }); }

  submit() {
    if (!this.canSubmit) return;
    this.api.claim(this.phone(), this.cni()).subscribe((r) => {
      this.res.set(r);
      if (r.ok) this.refresh();
    });
  }
  close() { this.claiming.set(false); this.phone.set(''); this.cni.set(''); this.res.set(null); }
}
