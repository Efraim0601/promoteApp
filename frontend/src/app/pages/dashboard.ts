import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import * as XLSX from 'xlsx';
import { Api } from '../core/api';
import { I18n } from '../core/i18n';
import { AgentKpi, DailyBucket, DashboardStats } from '../core/models';
import { IconComponent } from '../shared/icon';

@Component({
  selector: 'page-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, IconComponent],
  template: `
<div class="dash-page">

  <!-- ===== Header ===== -->
  <div class="dash-header">
    <div class="dash-header-left">
      <button class="back-btn" (click)="goBack()"><ic name="arrow-left" [size]="16"></ic></button>
      <div>
        <h1 class="dash-h1">{{ t('dash_title') }}</h1>
        <p class="dash-sub">{{ t('dash_sub') }}</p>
      </div>
    </div>
    <div class="dash-filters">
      <label class="filter-label">{{ t('dash_filter_from') }}
        <input type="date" [(ngModel)]="filterFrom" class="filter-input">
      </label>
      <label class="filter-label">{{ t('dash_filter_to') }}
        <input type="date" [(ngModel)]="filterTo" class="filter-input">
      </label>
      <button class="refresh-btn" (click)="load()" [disabled]="loading()">
        <ic name="refresh" [size]="15"></ic> {{ t('dash_refresh') }}
      </button>
      @if (stats()) {
        <button class="export-btn" (click)="exportExcel()">
          <ic name="download" [size]="15"></ic> Export Excel
        </button>
      }
    </div>
  </div>

  @if (loading()) {
    <div class="dash-loading">
      <ic name="refresh" [size]="24"></ic>
      <span>Chargement...</span>
    </div>
  }
  @if (error()) {
    <div class="dash-error">{{ error() }}</div>
  }

  @if (stats(); as s) {

  <!-- ===== KPI Cards — Today ===== -->
  <div class="section-title">Aujourd'hui</div>
  <div class="kpi-grid">
    <div class="kpi-card kpi-blue">
      <div class="kpi-value">{{ s.todayCreated }}</div>
      <div class="kpi-label">{{ t('dash_today_created') }}</div>
    </div>
    <div class="kpi-card kpi-green">
      <div class="kpi-value">{{ s.todayPaid }}</div>
      <div class="kpi-label">{{ t('dash_today_paid') }}</div>
    </div>
    <div class="kpi-card kpi-purple">
      <div class="kpi-value">{{ s.todayPrinted }}</div>
      <div class="kpi-label">{{ t('dash_today_printed') }}</div>
    </div>
    <div class="kpi-card kpi-red">
      <div class="kpi-value">{{ s.todayFailed }}</div>
      <div class="kpi-label">{{ t('dash_today_failed') }}</div>
    </div>
  </div>

  <!-- ===== KPI Cards — Window totals ===== -->
  <div class="section-title">Période : {{ filterFrom }} → {{ filterTo }}</div>
  <div class="kpi-grid">
    <div class="kpi-card">
      <div class="kpi-value">{{ s.totalCreated }}</div>
      <div class="kpi-label">{{ t('dash_total_created') }}</div>
    </div>
    <div class="kpi-card kpi-green">
      <div class="kpi-value">{{ s.totalPaid }}</div>
      <div class="kpi-label">{{ t('dash_total_paid') }}</div>
    </div>
    <div class="kpi-card kpi-purple">
      <div class="kpi-value">{{ s.totalPrinted }}</div>
      <div class="kpi-label">{{ t('dash_total_printed') }}</div>
    </div>
    <div class="kpi-card kpi-orange">
      <div class="kpi-value">{{ s.awaitingPrint }}</div>
      <div class="kpi-label">{{ t('dash_awaiting_print') }}</div>
    </div>
    <div class="kpi-card kpi-amber">
      <div class="kpi-value">{{ s.awaitingPayment }}</div>
      <div class="kpi-label">{{ t('dash_awaiting_payment') }}</div>
    </div>
    <div class="kpi-card kpi-red">
      <div class="kpi-value">{{ s.totalFailed }}</div>
      <div class="kpi-label">{{ t('dash_total_failed') }}</div>
    </div>
  </div>

  <!-- ===== Rate Cards ===== -->
  <div class="rate-grid">
    <div class="rate-card">
      <div class="rate-label">{{ t('dash_conversion_rate') }}</div>
      <div class="rate-bar-bg">
        <div class="rate-bar rate-bar-green" [style.width]="s.conversionRate + '%'"></div>
      </div>
      <div class="rate-value rate-green">{{ s.conversionRate | number:'1.1-1' }}%</div>
    </div>
    <div class="rate-card">
      <div class="rate-label">{{ t('dash_print_rate') }}</div>
      <div class="rate-bar-bg">
        <div class="rate-bar rate-bar-purple" [style.width]="s.printRate + '%'"></div>
      </div>
      <div class="rate-value rate-purple">{{ s.printRate | number:'1.1-1' }}%</div>
    </div>
    <div class="rate-card">
      <div class="rate-label">{{ t('dash_failure_rate') }}</div>
      <div class="rate-bar-bg">
        <div class="rate-bar rate-bar-red" [style.width]="s.failureRate + '%'"></div>
      </div>
      <div class="rate-value rate-red">{{ s.failureRate | number:'1.1-1' }}%</div>
    </div>
  </div>

  <!-- ===== Daily Trend Chart ===== -->
  <div class="chart-card">
    <div class="chart-card-header">
      <h3 class="chart-title">{{ t('dash_trend_title') }}</h3>
      <div class="chart-legend">
        <span class="legend-dot leg-blue"></span> {{ t('dash_trend_created') }}
        <span class="legend-dot leg-green"></span> {{ t('dash_trend_paid') }}
        <span class="legend-dot leg-purple"></span> {{ t('dash_trend_printed') }}
        <span class="legend-dot leg-red"></span> {{ t('dash_trend_failed') }}
      </div>
    </div>
    @if (s.dailyTrend.length) {
      <div class="chart-svg-wrap">
        <svg [attr.viewBox]="'0 0 ' + SVG_W + ' ' + SVG_H" preserveAspectRatio="none" class="trend-svg">
          <!-- Grid lines -->
          @for (yLine of yGridLines(); track yLine.y) {
            <line [attr.x1]="PAD_X" [attr.y1]="yLine.y" [attr.x2]="SVG_W - 8" [attr.y2]="yLine.y"
                  stroke="#e5e7eb" stroke-width="1"/>
            <text [attr.x]="PAD_X - 4" [attr.y]="yLine.y + 4" text-anchor="end" class="axis-label">{{ yLine.val }}</text>
          }
          <!-- X labels -->
          @for (lbl of xLabels(); track lbl.x; let i = $index) {
            @if (i % xLabelStep() === 0) {
              <text [attr.x]="lbl.x" [attr.y]="SVG_H - 4" text-anchor="middle" class="axis-label">{{ lbl.text }}</text>
            }
          }
          <!-- Area fills -->
          <path [attr.d]="trendArea('created')" fill="#3b82f6" fill-opacity="0.08"/>
          <path [attr.d]="trendArea('paid')"    fill="#10b981" fill-opacity="0.10"/>
          <path [attr.d]="trendArea('printed')" fill="#8b5cf6" fill-opacity="0.10"/>
          <path [attr.d]="trendArea('failed')"  fill="#ef4444" fill-opacity="0.10"/>
          <!-- Lines -->
          <polyline [attr.points]="trendLine('created')" fill="none" stroke="#3b82f6" stroke-width="2" stroke-linejoin="round"/>
          <polyline [attr.points]="trendLine('paid')"    fill="none" stroke="#10b981" stroke-width="2" stroke-linejoin="round"/>
          <polyline [attr.points]="trendLine('printed')" fill="none" stroke="#8b5cf6" stroke-width="2" stroke-linejoin="round"/>
          <polyline [attr.points]="trendLine('failed')"  fill="none" stroke="#ef4444" stroke-width="2" stroke-linejoin="round"/>
          <!-- Dots on last point -->
          @if (lastPoint()) {
            <circle [attr.cx]="lastPoint()!.x" [attr.cy]="lastPoint()!.created" r="4" fill="#3b82f6"/>
            <circle [attr.cx]="lastPoint()!.x" [attr.cy]="lastPoint()!.paid"    r="4" fill="#10b981"/>
            <circle [attr.cx]="lastPoint()!.x" [attr.cy]="lastPoint()!.printed" r="4" fill="#8b5cf6"/>
            <circle [attr.cx]="lastPoint()!.x" [attr.cy]="lastPoint()!.failed"  r="4" fill="#ef4444"/>
          }
        </svg>
      </div>
    } @else {
      <div class="no-data">{{ t('dash_no_data') }}</div>
    }
  </div>

  <!-- ===== Rapport journalier interactif ===== -->
  <div class="chart-card">
    <div class="chart-card-header">
      <h3 class="chart-title">Rapport journalier</h3>
      <div class="day-actions">
        <!-- Day-of-week quick-select chips -->
        <button class="dow-chip" (click)="selectAll()">Tous</button>
        <button class="dow-chip" (click)="selectByDow(1)">Lun</button>
        <button class="dow-chip" (click)="selectByDow(2)">Mar</button>
        <button class="dow-chip" (click)="selectByDow(3)">Mer</button>
        <button class="dow-chip" (click)="selectByDow(4)">Jeu</button>
        <button class="dow-chip dow-weekend" (click)="selectByDow(5)">Ven</button>
        <button class="dow-chip dow-weekend" (click)="selectByDow(6)">Sam</button>
        <button class="dow-chip dow-weekend" (click)="selectByDow(0)">Dim</button>
        <button class="dow-chip dow-we-all" (click)="selectByDow(5, 6, 0)">Week-end</button>
        <button class="dow-chip dow-clear" (click)="clearSelection()">Effacer</button>
      </div>
    </div>

    <div class="day-table-wrap">
      <table class="day-table">
        <thead>
          <tr>
            <th class="chk-col">
              <input type="checkbox"
                     [checked]="allSelected()"
                     [indeterminate]="someSelected()"
                     (change)="toggleAll($event)">
            </th>
            <th>Jour</th>
            <th class="num-col">Paiements confirmés</th>
            <th class="num-col">Cartes produites</th>
            <th class="num-col">Volume (FCFA)</th>
          </tr>
        </thead>
        <tbody>
          @for (d of s.dailyTrend; track d.date) {
            <tr [class.row-empty]="d.paid === 0 && d.printed === 0"
                [class.row-selected]="isSelected(d.date)"
                (click)="toggleDate(d.date)">
              <td class="chk-col" (click)="$event.stopPropagation()">
                <input type="checkbox" [checked]="isSelected(d.date)" (change)="toggleDate(d.date)">
              </td>
              <td class="day-cell">
                <span class="day-badge" [class.day-we]="isWeekend(d.date)">{{ dayLabel(d.date) }}</span>
              </td>
              <td class="num-col">{{ d.paid | number }}</td>
              <td class="num-col bold-purple">{{ d.printed | number }}</td>
              <td class="num-col bold-green">{{ d.amount | number }} FCFA</td>
            </tr>
          }
        </tbody>
        @if (selectedTotals().days > 0) {
          <tfoot>
            <tr class="total-row">
              <td class="chk-col"></td>
              <td class="total-label">TOTAL — {{ selectedTotals().days }} jour(s)</td>
              <td class="num-col total-val">{{ selectedTotals().paid | number }}</td>
              <td class="num-col total-val bold-purple">{{ selectedTotals().printed | number }}</td>
              <td class="num-col total-val bold-green">{{ selectedTotals().amount | number }} FCFA</td>
            </tr>
          </tfoot>
        }
      </table>
    </div>

    @if (selectedTotals().days > 0) {
      <div class="export-row">
        <span class="export-info">{{ selectedTotals().days }} jour(s) sélectionné(s)</span>
        <button class="export-btn" (click)="exportSelection()">
          <ic name="download" [size]="14"></ic> Export Excel — sélection
        </button>
      </div>
    }
  </div>

  <!-- ===== Conversion Funnel ===== -->
  <div class="charts-row">
    <div class="chart-card flex-1">
      <h3 class="chart-title">{{ t('dash_funnel_title') }}</h3>
      <div class="funnel">
        <div class="funnel-row">
          <span class="funnel-label">{{ t('dash_total_created') }}</span>
          <div class="funnel-bar-bg">
            <div class="funnel-bar" style="width:100%;background:#3b82f6"></div>
          </div>
          <span class="funnel-count">{{ s.totalCreated }}</span>
        </div>
        <div class="funnel-row">
          <span class="funnel-label">{{ t('dash_total_paid') }}</span>
          <div class="funnel-bar-bg">
            <div class="funnel-bar" [style.width]="funnelPct(s.totalPaid, s.totalCreated)" style="background:#10b981"></div>
          </div>
          <span class="funnel-count">{{ s.totalPaid }} <span class="funnel-pct">({{ s.conversionRate | number:'1.0-0' }}%)</span></span>
        </div>
        <div class="funnel-row">
          <span class="funnel-label">{{ t('dash_total_printed') }}</span>
          <div class="funnel-bar-bg">
            <div class="funnel-bar" [style.width]="funnelPct(s.totalPrinted, s.totalCreated)" style="background:#8b5cf6"></div>
          </div>
          <span class="funnel-count">{{ s.totalPrinted }} <span class="funnel-pct">({{ s.printRate | number:'1.0-0' }}%)</span></span>
        </div>
        <div class="funnel-row">
          <span class="funnel-label">{{ t('dash_awaiting_print') }}</span>
          <div class="funnel-bar-bg">
            <div class="funnel-bar" [style.width]="funnelPct(s.awaitingPrint, s.totalCreated)" style="background:#f59e0b"></div>
          </div>
          <span class="funnel-count">{{ s.awaitingPrint }}</span>
        </div>
        <div class="funnel-row">
          <span class="funnel-label">{{ t('dash_total_failed') }}</span>
          <div class="funnel-bar-bg">
            <div class="funnel-bar" [style.width]="funnelPct(s.totalFailed, s.totalCreated)" style="background:#ef4444"></div>
          </div>
          <span class="funnel-count">{{ s.totalFailed }} <span class="funnel-pct">({{ s.failureRate | number:'1.0-0' }}%)</span></span>
        </div>
      </div>
    </div>

    <!-- ===== Top agents by encaissement ===== -->
    <div class="chart-card flex-2">
      <h3 class="chart-title">{{ t('dash_bar_paid_title') }}</h3>
      @if (s.perAgent.length) {
        <div class="agent-bars">
          @for (a of s.perAgent.slice(0, 10); track a.id) {
            <div class="abar-row">
              <div class="abar-name" [title]="a.name + (a.agency ? ' — ' + a.agency : '')">{{ a.name }}</div>
              <div class="abar-track">
                <div class="abar-fill abar-paid"
                     [style.width]="barPct(a.paid, maxPaid())"
                     [title]="a.paid + ' encaissés'"></div>
                <div class="abar-fill abar-printed"
                     [style.width]="barPct(a.printed, maxPaid())"
                     [title]="a.printed + ' imprimés'"></div>
              </div>
              <div class="abar-vals">
                <span class="abar-paid-val">{{ a.paid }}</span>
                <span class="abar-sep">/</span>
                <span class="abar-printed-val">{{ a.printed }}</span>
              </div>
            </div>
          }
          <div class="abar-legend">
            <span class="abar-dot abar-dot-paid"></span> Encaissés
            <span class="abar-dot abar-dot-printed"></span> Imprimés
          </div>
        </div>
      } @else {
        <div class="no-data">{{ t('dash_no_data') }}</div>
      }
    </div>
  </div>

  <!-- ===== Agent Performance Table ===== -->
  <div class="chart-card">
    <div class="chart-card-header">
      <h3 class="chart-title">{{ t('dash_agents_title') }}</h3>
      <span class="table-meta">{{ s.perAgent.length }} commerciaux</span>
    </div>
    @if (s.perAgent.length) {
      <div class="table-wrap">
        <table class="perf-table">
          <thead>
            <tr>
              <th>{{ t('dash_agent_name') }}</th>
              <th class="num-col">{{ t('dash_agent_total') }}</th>
              <th class="num-col">{{ t('dash_agent_paid') }}</th>
              <th class="num-col">{{ t('dash_agent_printed') }}</th>
              <th class="num-col">{{ t('dash_agent_failed') }}</th>
              <th class="num-col">{{ t('dash_agent_conversion') }}</th>
              <th class="num-col">{{ t('dash_agent_print_rate') }}</th>
              <th class="num-col">{{ t('dash_agent_failure_rate') }}</th>
              <th class="num-col">{{ t('dash_agent_today') }}</th>
            </tr>
          </thead>
          <tbody>
            @for (a of s.perAgent; track a.id) {
              <tr [class.row-zero]="a.total === 0">
                <td class="agent-name-cell">
                  <div class="agent-name">{{ a.name }}</div>
                  @if (a.agency) { <div class="agent-agency">{{ a.agency }}</div> }
                </td>
                <td class="num-col">{{ a.total }}</td>
                <td class="num-col bold-green">{{ a.paid }}</td>
                <td class="num-col bold-purple">{{ a.printed }}</td>
                <td class="num-col" [class.bold-red]="a.failed > 0">{{ a.failed }}</td>
                <td class="num-col">
                  <span class="rate-chip" [class.chip-green]="a.conversionRate >= 70" [class.chip-amber]="a.conversionRate >= 40 && a.conversionRate < 70" [class.chip-red]="a.conversionRate < 40">
                    {{ a.conversionRate | number:'1.0-0' }}%
                  </span>
                </td>
                <td class="num-col">
                  <span class="rate-chip" [class.chip-green]="a.printRate >= 70" [class.chip-amber]="a.printRate >= 40 && a.printRate < 70" [class.chip-red]="a.printRate < 40 && a.paid > 0">
                    {{ a.printRate | number:'1.0-0' }}%
                  </span>
                </td>
                <td class="num-col">
                  <span class="rate-chip" [class.chip-green]="a.failureRate < 10" [class.chip-amber]="a.failureRate >= 10 && a.failureRate < 25" [class.chip-red]="a.failureRate >= 25 && a.total > 0">
                    {{ a.failureRate | number:'1.0-0' }}%
                  </span>
                </td>
                <td class="num-col">
                  <div class="today-cell">
                    <span class="today-total">{{ a.todayTotal }}</span>
                    @if (a.todayPaid > 0) {
                      <span class="today-paid">+{{ a.todayPaid }}</span>
                    }
                  </div>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    } @else {
      <div class="no-data">{{ t('dash_no_data') }}</div>
    }
  </div>

  <!-- ===== Failure Rate per agent ===== -->
  <div class="chart-card" style="margin-bottom:2rem">
    <h3 class="chart-title">{{ t('dash_bar_fail_title') }}</h3>
    @if (s.perAgent.length) {
      <div class="fail-bars">
        @for (a of sortedByFailure(); track a.id) {
          <div class="abar-row">
            <div class="abar-name">{{ a.name }}</div>
            <div class="abar-track">
              <div class="abar-fill"
                   [class.abar-fail-green]="a.failureRate < 10"
                   [class.abar-fail-amber]="a.failureRate >= 10 && a.failureRate < 25"
                   [class.abar-fail-red]="a.failureRate >= 25"
                   [style.width]="barPct(a.failureRate, maxFailureRate())"
                   [title]="(a.failureRate | number:'1.1-1') + '%'">
              </div>
            </div>
            <div class="abar-vals">{{ a.failureRate | number:'1.1-1' }}%</div>
          </div>
        }
      </div>
    } @else {
      <div class="no-data">{{ t('dash_no_data') }}</div>
    }
  </div>

  } <!-- end @if stats -->
</div>
  `,
  styles: [`
    :host { display: block; background: #f8fafc; min-height: 100vh; }

    .dash-page { padding: 20px 28px; font-family: inherit; }

    /* ---- Header ---- */
    .dash-header {
      display: flex; align-items: center; justify-content: space-between;
      flex-wrap: wrap; gap: 16px; margin-bottom: 24px;
    }
    .dash-header-left { display: flex; align-items: center; gap: 12px; }
    .back-btn {
      background: none; border: 1px solid #d1d5db; border-radius: 8px;
      padding: 6px 10px; cursor: pointer; color: #6b7280;
    }
    .back-btn:hover { background: #f3f4f6; }
    .dash-h1 { margin: 0; font-size: 22px; font-weight: 700; color: #111827; }
    .dash-sub { margin: 2px 0 0; font-size: 13px; color: #6b7280; }

    .dash-filters { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
    .filter-label { font-size: 12px; font-weight: 600; color: #374151; display: flex; flex-direction: column; gap: 3px; }
    .filter-input {
      padding: 6px 10px; border: 1px solid #d1d5db; border-radius: 8px;
      font-size: 13px; background: #fff; outline: none;
    }
    .filter-input:focus { border-color: #6366f1; }
    .refresh-btn {
      display: flex; align-items: center; gap: 6px;
      padding: 8px 16px; background: #6366f1; color: #fff;
      border: none; border-radius: 8px; cursor: pointer; font-size: 13px; font-weight: 600;
    }
    .refresh-btn:hover { background: #4f46e5; }
    .refresh-btn:disabled { opacity: .5; cursor: not-allowed; }
    .export-btn {
      display: flex; align-items: center; gap: 6px;
      padding: 8px 16px; background: #059669; color: #fff;
      border: none; border-radius: 8px; cursor: pointer; font-size: 13px; font-weight: 600;
    }
    .export-btn:hover { background: #047857; }

    /* ---- Loading / Error ---- */
    .dash-loading { display: flex; align-items: center; gap: 10px; padding: 40px; color: #6b7280; }
    .dash-error { padding: 16px; background: #fee2e2; border-radius: 8px; color: #991b1b; margin-bottom: 16px; }

    /* ---- Section title ---- */
    .section-title { font-size: 12px; font-weight: 700; color: #9ca3af; text-transform: uppercase; letter-spacing: .06em; margin: 16px 0 8px; }

    /* ---- KPI cards ---- */
    .kpi-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 12px; margin-bottom: 12px; }
    .kpi-card {
      background: #fff; border-radius: 12px; padding: 18px 20px;
      border: 1px solid #e5e7eb; box-shadow: 0 1px 3px rgba(0,0,0,.05);
    }
    .kpi-value { font-size: 32px; font-weight: 800; color: #111827; line-height: 1; }
    .kpi-label { font-size: 12px; color: #6b7280; margin-top: 6px; }
    .kpi-blue { border-top: 3px solid #3b82f6; }
    .kpi-blue .kpi-value { color: #1d4ed8; }
    .kpi-green { border-top: 3px solid #10b981; }
    .kpi-green .kpi-value { color: #065f46; }
    .kpi-purple { border-top: 3px solid #8b5cf6; }
    .kpi-purple .kpi-value { color: #5b21b6; }
    .kpi-orange { border-top: 3px solid #f59e0b; }
    .kpi-orange .kpi-value { color: #92400e; }
    .kpi-amber { border-top: 3px solid #fbbf24; }
    .kpi-amber .kpi-value { color: #92400e; }
    .kpi-red { border-top: 3px solid #ef4444; }
    .kpi-red .kpi-value { color: #991b1b; }

    /* ---- Rate cards ---- */
    .rate-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 16px; }
    .rate-card { background: #fff; border-radius: 12px; padding: 16px 20px; border: 1px solid #e5e7eb; }
    .rate-label { font-size: 12px; font-weight: 600; color: #6b7280; margin-bottom: 10px; }
    .rate-bar-bg { height: 10px; background: #f3f4f6; border-radius: 99px; overflow: hidden; margin-bottom: 8px; }
    .rate-bar { height: 100%; border-radius: 99px; transition: width .5s; }
    .rate-bar-green { background: #10b981; }
    .rate-bar-purple { background: #8b5cf6; }
    .rate-bar-red { background: #ef4444; }
    .rate-value { font-size: 22px; font-weight: 800; }
    .rate-green { color: #065f46; }
    .rate-purple { color: #5b21b6; }
    .rate-red { color: #991b1b; }

    /* ---- Chart cards ---- */
    .chart-card {
      background: #fff; border-radius: 12px; padding: 20px 24px;
      border: 1px solid #e5e7eb; box-shadow: 0 1px 3px rgba(0,0,0,.05);
      margin-bottom: 16px;
    }
    .chart-card-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
    .chart-title { margin: 0 0 16px; font-size: 15px; font-weight: 700; color: #111827; }
    .chart-card-header .chart-title { margin: 0; }
    .table-meta { font-size: 12px; color: #9ca3af; }
    .chart-legend { display: flex; align-items: center; gap: 16px; font-size: 12px; color: #6b7280; }
    .legend-dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 4px; }
    .leg-blue { background: #3b82f6; }
    .leg-green { background: #10b981; }
    .leg-purple { background: #8b5cf6; }
    .leg-red { background: #ef4444; }

    /* ---- SVG trend chart ---- */
    .chart-svg-wrap { width: 100%; overflow: hidden; }
    .trend-svg { width: 100%; height: 200px; display: block; }
    .axis-label { font-size: 10px; fill: #9ca3af; font-family: inherit; }

    /* ---- Charts row (funnel + agent bars) ---- */
    .charts-row { display: flex; gap: 16px; margin-bottom: 16px; }
    .charts-row .chart-card { margin-bottom: 0; }
    .flex-1 { flex: 1; min-width: 260px; }
    .flex-2 { flex: 2; min-width: 320px; }

    /* ---- Funnel ---- */
    .funnel { display: flex; flex-direction: column; gap: 12px; }
    .funnel-row { display: flex; align-items: center; gap: 12px; }
    .funnel-label { font-size: 12px; color: #6b7280; min-width: 140px; }
    .funnel-bar-bg { flex: 1; height: 14px; background: #f3f4f6; border-radius: 99px; overflow: hidden; }
    .funnel-bar { height: 100%; border-radius: 99px; transition: width .6s; min-width: 3px; }
    .funnel-count { font-size: 13px; font-weight: 700; color: #111827; min-width: 80px; text-align: right; }
    .funnel-pct { font-size: 11px; font-weight: 400; color: #9ca3af; }

    /* ---- Agent bar chart ---- */
    .agent-bars { display: flex; flex-direction: column; gap: 8px; }
    .abar-row { display: flex; align-items: center; gap: 10px; }
    .abar-name { font-size: 12px; color: #374151; min-width: 120px; max-width: 160px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .abar-track { flex: 1; height: 18px; background: #f3f4f6; border-radius: 4px; overflow: hidden; position: relative; }
    .abar-fill { height: 100%; position: absolute; left: 0; top: 0; border-radius: 4px; transition: width .5s; }
    .abar-paid { background: #10b981; opacity: .85; }
    .abar-printed { background: #8b5cf6; opacity: .6; }
    .abar-fail-green { background: #10b981; }
    .abar-fail-amber { background: #f59e0b; }
    .abar-fail-red { background: #ef4444; }
    .abar-vals { font-size: 12px; color: #374151; min-width: 60px; text-align: right; }
    .abar-paid-val { color: #065f46; font-weight: 700; }
    .abar-sep { color: #d1d5db; }
    .abar-printed-val { color: #5b21b6; }
    .abar-legend { display: flex; align-items: center; gap: 12px; font-size: 11px; color: #9ca3af; margin-top: 8px; }
    .abar-dot { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 4px; }
    .abar-dot-paid { background: #10b981; }
    .abar-dot-printed { background: #8b5cf6; opacity: .6; }
    .fail-bars { display: flex; flex-direction: column; gap: 8px; }

    /* ---- Performance table ---- */
    .table-wrap { overflow-x: auto; }
    .perf-table { width: 100%; border-collapse: collapse; font-size: 13px; }
    .perf-table thead th { text-align: left; padding: 8px 12px; font-size: 11px; font-weight: 700; color: #9ca3af; text-transform: uppercase; letter-spacing: .04em; border-bottom: 2px solid #f3f4f6; white-space: nowrap; }
    .perf-table tbody td { padding: 10px 12px; border-bottom: 1px solid #f9fafb; }
    .perf-table tbody tr:hover td { background: #f9fafb; }
    .perf-table tbody tr:last-child td { border-bottom: none; }
    .num-col { text-align: right; }
    .row-zero td { opacity: .45; }
    .agent-name-cell { }
    .agent-name { font-weight: 600; color: #111827; }
    .agent-agency { font-size: 11px; color: #9ca3af; }
    .bold-green { font-weight: 700; color: #065f46; }
    .bold-purple { font-weight: 700; color: #5b21b6; }
    .bold-red { font-weight: 700; color: #991b1b; }
    .rate-chip { display: inline-block; padding: 2px 8px; border-radius: 99px; font-size: 11px; font-weight: 700; }
    .chip-green { background: #d1fae5; color: #065f46; }
    .chip-amber { background: #fef3c7; color: #92400e; }
    .chip-red   { background: #fee2e2; color: #991b1b; }
    .today-cell { display: flex; align-items: center; gap: 6px; justify-content: flex-end; }
    .today-total { font-weight: 600; }
    .today-paid { background: #d1fae5; color: #065f46; font-size: 11px; font-weight: 700; padding: 2px 6px; border-radius: 99px; }

    .no-data { text-align: center; padding: 32px; color: #9ca3af; font-size: 14px; }

    /* ---- Interactive daily report ---- */
    .day-actions { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
    .dow-chip {
      padding: 4px 12px; border-radius: 99px; font-size: 12px; font-weight: 600; cursor: pointer;
      border: 1px solid #d1d5db; background: #f9fafb; color: #374151;
    }
    .dow-chip:hover { background: #f3f4f6; border-color: #9ca3af; }
    .dow-weekend { border-color: #818cf8; color: #4f46e5; background: #eef2ff; }
    .dow-weekend:hover { background: #e0e7ff; }
    .dow-we-all { border-color: #4f46e5; color: #fff; background: #4f46e5; }
    .dow-we-all:hover { background: #4338ca; }
    .dow-clear { color: #9ca3af; }
    .dow-clear:hover { background: #fee2e2; color: #991b1b; border-color: #fca5a5; }

    .day-table-wrap { overflow-x: auto; margin-top: 12px; }
    .day-table { width: 100%; border-collapse: collapse; font-size: 13px; }
    .day-table thead th { padding: 8px 12px; font-size: 11px; font-weight: 700; color: #9ca3af; text-transform: uppercase; letter-spacing: .04em; border-bottom: 2px solid #f3f4f6; text-align: left; }
    .day-table thead .num-col { text-align: right; }
    .day-table tbody tr { cursor: pointer; transition: background .1s; }
    .day-table tbody tr:hover td { background: #f0f9ff; }
    .day-table tbody td { padding: 9px 12px; border-bottom: 1px solid #f9fafb; }
    .chk-col { width: 36px; text-align: center; }
    .row-empty td { opacity: .35; }
    .row-selected td { background: #eff6ff !important; }
    .day-badge { font-weight: 600; color: #374151; }
    .day-we { color: #4f46e5; }
    .day-cell { white-space: nowrap; }

    .day-table tfoot .total-row td { padding: 10px 12px; background: #1e293b; color: #f8fafc; font-weight: 700; border-top: 2px solid #334155; }
    .total-label { font-size: 13px; }
    .total-val { font-size: 15px; color: #f8fafc; }
    .total-val.bold-green { color: #6ee7b7; }
    .total-val.bold-purple { color: #c4b5fd; }

    .export-row { display: flex; align-items: center; justify-content: flex-end; gap: 12px; margin-top: 12px; }
    .export-info { font-size: 12px; color: #6b7280; }

    @media (max-width: 768px) {
      .dash-page { padding: 12px 16px; }
      .charts-row { flex-direction: column; }
      .rate-grid { grid-template-columns: 1fr; }
      .kpi-grid { grid-template-columns: repeat(2, 1fr); }
      .perf-table thead th:nth-child(n+6) { display: none; }
      .perf-table tbody td:nth-child(n+6) { display: none; }
    }
  `]
})
export class DashboardComponent implements OnInit {
  private api = inject(Api);
  private router = inject(Router);
  private i18n = inject(I18n);
  t = (k: string) => this.i18n.t(k);

  readonly SVG_W = 900;
  readonly SVG_H = 220;
  readonly PAD_X = 42;
  readonly PAD_Y = 20;
  readonly PAD_BOT = 30;

  loading = signal(false);
  error   = signal('');
  stats   = signal<DashboardStats | null>(null);

  filterFrom = '';
  filterTo   = '';

  // ---- day selection ----
  selectedDates = signal<Set<string>>(new Set());

  isSelected(date: string)    { return this.selectedDates().has(date); }
  isWeekend(dateStr: string)  { const d = new Date(dateStr + 'T12:00:00').getDay(); return d === 0 || d === 5 || d === 6; }

  toggleDate(date: string) {
    this.selectedDates.update(s => { const n = new Set(s); n.has(date) ? n.delete(date) : n.add(date); return n; });
  }

  toggleAll(ev: Event) {
    const chk = (ev.target as HTMLInputElement).checked;
    chk ? this.selectAll() : this.clearSelection();
  }

  selectAll() {
    const s = this.stats();
    this.selectedDates.set(new Set(s ? s.dailyTrend.map(d => d.date) : []));
  }

  clearSelection() { this.selectedDates.set(new Set()); }

  selectByDow(...days: number[]) {
    const s = this.stats();
    if (!s) return;
    this.selectedDates.update(() => {
      const ns = new Set<string>();
      for (const d of s.dailyTrend) {
        if (days.includes(new Date(d.date + 'T12:00:00').getDay())) ns.add(d.date);
      }
      return ns;
    });
  }

  allSelected = computed(() => {
    const s = this.stats();
    return !!s && s.dailyTrend.length > 0 && this.selectedDates().size === s.dailyTrend.length;
  });

  someSelected = computed(() => {
    const sel = this.selectedDates().size;
    const s = this.stats();
    return sel > 0 && !!s && sel < s.dailyTrend.length;
  });

  selectedRows = computed(() => {
    const s = this.stats();
    if (!s) return [];
    const sel = this.selectedDates();
    return s.dailyTrend.filter(d => sel.has(d.date));
  });

  selectedTotals = computed(() => {
    const rows = this.selectedRows();
    return {
      days:    rows.length,
      paid:    rows.reduce((a, d) => a + d.paid,    0),
      printed: rows.reduce((a, d) => a + d.printed, 0),
      amount:  rows.reduce((a, d) => a + d.amount,  0),
    };
  });

  ngOnInit() {
    const to   = new Date();
    const from = new Date();
    from.setDate(from.getDate() - 29);
    this.filterTo   = this.toDateStr(to);
    this.filterFrom = this.toDateStr(from);
    this.load();
  }

  load() {
    this.loading.set(true);
    this.error.set('');
    this.api.dashboardStats(this.filterFrom, this.filterTo).subscribe({
      next:  (d) => { this.stats.set(d); this.loading.set(false); },
      error: () => { this.error.set('Erreur de chargement des données.'); this.loading.set(false); }
    });
  }

  goBack() { this.router.navigateByUrl('/admin'); }

  private toDateStr(d: Date): string {
    return d.toISOString().split('T')[0];
  }

  funnelPct(value: number, total: number): string {
    if (!total) return '0%';
    return Math.round((value / total) * 100) + '%';
  }

  barPct(value: number, max: number): string {
    if (!max) return '0%';
    return Math.round((value / max) * 100) + '%';
  }

  maxPaid = computed(() => {
    const s = this.stats();
    if (!s || !s.perAgent.length) return 1;
    return Math.max(...s.perAgent.map(a => a.paid), 1);
  });

  maxFailureRate = computed(() => {
    const s = this.stats();
    if (!s || !s.perAgent.length) return 100;
    return Math.max(...s.perAgent.map(a => a.failureRate), 1);
  });

  sortedByFailure = computed(() => {
    const s = this.stats();
    if (!s) return [];
    return [...s.perAgent].sort((a, b) => b.failureRate - a.failureRate);
  });

  // ---- SVG chart helpers ----

  private trendMax = computed(() => {
    const s = this.stats();
    if (!s || !s.dailyTrend.length) return 1;
    return Math.max(...s.dailyTrend.flatMap(d => [d.created, d.paid, d.printed, d.failed]), 1);
  });

  private chartBottom = computed(() => this.SVG_H - this.PAD_BOT);

  private pts = computed(() => {
    const s = this.stats();
    if (!s || !s.dailyTrend.length) return [];
    const data  = s.dailyTrend;
    const n     = data.length;
    const max   = this.trendMax();
    const cW    = this.SVG_W - this.PAD_X - 8;
    const cH    = this.chartBottom() - this.PAD_Y;
    return data.map((d, i) => {
      const x = this.PAD_X + (n <= 1 ? cW / 2 : (i / (n - 1)) * cW);
      const fy = (v: number) => this.PAD_Y + cH - (v / max) * cH;
      return { x, created: fy(d.created), paid: fy(d.paid), printed: fy(d.printed), failed: fy(d.failed), date: d.date };
    });
  });

  trendLine(field: 'created' | 'paid' | 'printed' | 'failed'): string {
    return this.pts().map(p => `${p.x.toFixed(1)},${p[field].toFixed(1)}`).join(' ');
  }

  trendArea(field: 'created' | 'paid' | 'printed' | 'failed'): string {
    const pts = this.pts();
    if (!pts.length) return '';
    const bottom = this.chartBottom();
    const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)},${p[field].toFixed(1)}`).join(' ');
    return `${line} L ${pts[pts.length - 1].x.toFixed(1)},${bottom} L ${pts[0].x.toFixed(1)},${bottom} Z`;
  }

  lastPoint = computed(() => {
    const p = this.pts();
    return p.length ? p[p.length - 1] : null;
  });

  yGridLines = computed(() => {
    const max = this.trendMax();
    const steps = 4;
    const lines = [];
    const cH = this.chartBottom() - this.PAD_Y;
    for (let i = 0; i <= steps; i++) {
      const val = Math.round((max / steps) * i);
      const y   = this.PAD_Y + cH - (val / max) * cH;
      lines.push({ y: parseFloat(y.toFixed(1)), val });
    }
    return lines;
  });

  xLabels = computed(() => {
    return this.pts().map(p => ({ x: p.x, text: p.date.slice(5) })); // MM-DD
  });

  xLabelStep = computed(() => {
    const n = this.pts().length;
    if (n <= 7)  return 1;
    if (n <= 15) return 2;
    return Math.ceil(n / 10);
  });

  // ---- helpers ----

  readonly FR_DAYS = ['Dim.', 'Lun.', 'Mar.', 'Mer.', 'Jeu.', 'Ven.', 'Sam.'];

  dayLabel(dateStr: string): string {
    const d = new Date(dateStr + 'T12:00:00');
    const [, mm, dd] = dateStr.split('-');
    return `${this.FR_DAYS[d.getDay()]} ${dd}/${mm}`;
  }

  // ---- Excel export ----

  exportSelection() {
    const rows = this.selectedRows();
    if (!rows.length) return;

    const sheetRows: (string | number)[][] = [
      ['Rapport journalier — Afriland Carte Promote'],
      [`Période sélectionnée : ${this.filterFrom} → ${this.filterTo}`],
      [`${rows.length} jour(s) sélectionné(s)`],
      [],
      ['Jour', 'Paiements confirmés', 'Cartes produites', 'Volume (FCFA)'],
    ];

    let totPaid = 0, totPrinted = 0, totAmount = 0;
    for (const d of rows) {
      sheetRows.push([this.dayLabel(d.date), d.paid, d.printed, d.amount]);
      totPaid    += d.paid;
      totPrinted += d.printed;
      totAmount  += d.amount;
    }
    sheetRows.push(['TOTAL', totPaid, totPrinted, totAmount]);

    const ws = XLSX.utils.aoa_to_sheet(sheetRows);
    ws['!cols'] = [{ wch: 16 }, { wch: 22 }, { wch: 18 }, { wch: 18 }];
    ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 3 } }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Rapport sélection');

    const dates = rows.map(r => r.date).sort();
    const filename = `rapport_${dates[0]}_${dates[dates.length - 1]}.xlsx`;
    XLSX.writeFile(wb, filename);
  }

  exportExcel() {
    const s = this.stats();
    if (!s) return;

    const fmt = (n: number) => n.toLocaleString('fr-FR');

    // ---- Sheet 1: Résumé journalier ----
    const summaryRows: (string | number)[][] = [
      ['Tableau de bord — Monitoring Afriland Carte Promote'],
      [`Période : ${this.filterFrom} → ${this.filterTo}`],
      [],
      ['Jour', 'Paiements confirmés', 'Cartes produites', 'Volume (FCFA)'],
    ];

    let totPaid = 0, totPrinted = 0, totAmount = 0;
    for (const d of s.dailyTrend) {
      if (d.paid === 0 && d.printed === 0 && d.amount === 0) continue; // skip empty days
      summaryRows.push([this.dayLabel(d.date), d.paid, d.printed, d.amount]);
      totPaid    += d.paid;
      totPrinted += d.printed;
      totAmount  += d.amount;
    }
    summaryRows.push(['TOTAL', totPaid, totPrinted, totAmount]);

    const ws1 = XLSX.utils.aoa_to_sheet(summaryRows);

    // Widths
    ws1['!cols'] = [{ wch: 16 }, { wch: 22 }, { wch: 18 }, { wch: 18 }];

    // Style: title merge
    ws1['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 3 } }];

    // ---- Sheet 2: Performance par commercial ----
    const agentRows: (string | number)[][] = [
      ['Commercial', 'Agence', 'Total', 'Encaissés', 'Imprimés', 'Échecs', 'Conv. %', 'Impr. %', 'Échec %', 'Auj.'],
    ];
    for (const a of s.perAgent) {
      agentRows.push([
        a.name,
        a.agency ?? '',
        a.total,
        a.paid,
        a.printed,
        a.failed,
        parseFloat(a.conversionRate.toFixed(1)),
        parseFloat(a.printRate.toFixed(1)),
        parseFloat(a.failureRate.toFixed(1)),
        a.todayTotal,
      ]);
    }
    const ws2 = XLSX.utils.aoa_to_sheet(agentRows);
    ws2['!cols'] = [{ wch: 22 }, { wch: 16 }, { wch: 8 }, { wch: 10 }, { wch: 10 }, { wch: 8 }, { wch: 9 }, { wch: 9 }, { wch: 9 }, { wch: 6 }];

    // ---- Sheet 3: Évolution journalière complète ----
    const trendRows: (string | number)[][] = [
      ['Date', 'Souscriptions', 'Encaissements', 'Impressions', 'Échecs', 'Volume (FCFA)'],
    ];
    for (const d of s.dailyTrend) {
      trendRows.push([this.dayLabel(d.date), d.created, d.paid, d.printed, d.failed, d.amount]);
    }
    const ws3 = XLSX.utils.aoa_to_sheet(trendRows);
    ws3['!cols'] = [{ wch: 14 }, { wch: 16 }, { wch: 16 }, { wch: 14 }, { wch: 10 }, { wch: 18 }];

    // ---- Workbook ----
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws1, 'Résumé journalier');
    XLSX.utils.book_append_sheet(wb, ws2, 'Commerciaux');
    XLSX.utils.book_append_sheet(wb, ws3, 'Évolution');

    const filename = `monitoring_${this.filterFrom}_${this.filterTo}.xlsx`;
    XLSX.writeFile(wb, filename);
  }
}
