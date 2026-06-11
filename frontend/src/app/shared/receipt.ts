import { Injectable, inject } from '@angular/core';
import * as QRCode from 'qrcode';
import { I18n } from '../core/i18n';
import { payById } from './constants';

/** Minimal data needed to render a payment receipt — satisfied by both the live
 *  subscription result and a stored Subscription record. */
export interface ReceiptData {
  ref: string;
  fullName?: string | null;
  pay?: string | null;
  payPhone?: string | null;
  payStatus?: string | null;
  amount?: number | null;
  createdAt?: string | null;
  kind?: 'card' | 'recharge';   // 'recharge' tweaks the title/note and shows the PAN (default 'card')
  pan?: string | null;          // shown on recharge receipts (the card topped up)
}

/**
 * Builds and downloads a PNG receipt (payment info + reference + QR to the print point).
 * Shared by the subscription end screen and every record view (agent / admin tables, the
 * reference-verification result), so a receipt can be re-downloaded from any record.
 */
@Injectable({ providedIn: 'root' })
export class ReceiptService {
  private i18n = inject(I18n);

  /** Deep link encoded in the QR — opens the print point on this reference. */
  private refUrl(ref: string) {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    return origin ? `${origin}/print?ref=${ref}` : ref;
  }

  async download(d: ReceiptData) {
    const r = d;
    const isRecharge = d.kind === 'recharge';
    const W = 760, DARK = '#0F2A1B', RED = '#C8102E', MUTED = '#6b7770', LINE = '#e3e8e5';
    // QR: card receipts deep-link to the print point; a recharge isn't collected, so it just encodes the ref.
    let qrImg: HTMLImageElement | null = null;
    try {
      const payload = isRecharge ? r.ref : this.refUrl(r.ref);
      const url = await QRCode.toDataURL(payload, { width: 520, margin: 1, errorCorrectionLevel: 'M', color: { dark: DARK, light: '#ffffff' } });
      qrImg = await this.loadImg(url);
    } catch { /* QR optional */ }

    // Rows of payment info (skip empty payment phone).
    const rows: [string, string][] = [
      [this.i18n.t('tx_datetime'), this.fmtDateTime(r.createdAt ?? undefined)],
      [this.i18n.t('receipt_holder'), r.fullName || '—'],
    ];
    if (isRecharge && r.pan) rows.push([this.i18n.t('recharge_pan_short'), r.pan]);
    rows.push([this.i18n.t('pay_method_label'), this.payDisplay(r.pay ?? undefined)]);
    if (r.payPhone) rows.push([this.i18n.t('tx_pay_phone'), r.payPhone]);
    rows.push([this.i18n.t('receipt_status'), this.statusLabel(r.payStatus ?? undefined)]);
    rows.push([this.i18n.t('amount_paid'), this.i18n.money(r.amount ?? 0)]);

    // Measure the footer note to size the canvas (pickup for a card; a recharge note otherwise).
    const meas = document.createElement('canvas').getContext('2d')!;
    meas.font = '14px system-ui, sans-serif';
    const noteLines = this.wrap(meas, this.i18n.t(isRecharge ? 'recharge_receipt_note' : 'pickup_notice'), W - 96);

    const qrTop = 230, qrSize = 260;
    const rowsTop = qrTop + qrSize + 130;
    const noteTop = rowsTop + rows.length * 52 + 26;
    const H = noteTop + 26 + noteLines.length * 22 + 60;

    const scale = 2;
    const canvas = document.createElement('canvas');
    canvas.width = W * scale; canvas.height = H * scale;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(scale, scale);
    ctx.textBaseline = 'alphabetic';

    // Background
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
    // Header band
    ctx.fillStyle = DARK; ctx.fillRect(0, 0, W, 110);
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 28px system-ui, sans-serif'; ctx.fillText(this.i18n.t('card_name').toUpperCase(), 48, 52);
    ctx.font = '400 16px system-ui, sans-serif'; ctx.globalAlpha = 0.85; ctx.fillText(this.i18n.t('bank'), 48, 82); ctx.globalAlpha = 1;
    // Title + status
    ctx.fillStyle = DARK; ctx.font = '700 25px system-ui, sans-serif'; ctx.fillText(this.i18n.t(isRecharge ? 'receipt_title_recharge' : 'receipt_title'), 48, 165);
    ctx.fillStyle = RED; ctx.font = '700 16px system-ui, sans-serif'; ctx.fillText(this.statusLabel(r.payStatus ?? undefined), 48, 194);
    // QR
    if (qrImg) ctx.drawImage(qrImg, (W - qrSize) / 2, qrTop, qrSize, qrSize);
    // Reference
    ctx.textAlign = 'center';
    ctx.fillStyle = MUTED; ctx.font = '600 14px system-ui, sans-serif'; ctx.fillText(this.i18n.t('ref_label'), W / 2, qrTop + qrSize + 40);
    ctx.fillStyle = DARK; ctx.font = '800 30px system-ui, sans-serif'; ctx.fillText(r.ref, W / 2, qrTop + qrSize + 80);
    ctx.textAlign = 'left';
    // Divider
    ctx.strokeStyle = LINE; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(48, rowsTop - 30); ctx.lineTo(W - 48, rowsTop - 30); ctx.stroke();
    // Rows
    rows.forEach(([label, value], i) => {
      const y = rowsTop + i * 52;
      ctx.fillStyle = MUTED; ctx.font = '400 15px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.fillText(label, 48, y);
      ctx.fillStyle = DARK; ctx.font = '700 16px system-ui, sans-serif'; ctx.textAlign = 'right'; ctx.fillText(value, W - 48, y);
      ctx.strokeStyle = LINE; ctx.beginPath(); ctx.moveTo(48, y + 18); ctx.lineTo(W - 48, y + 18); ctx.stroke();
    });
    ctx.textAlign = 'left';
    // Pickup note
    ctx.fillStyle = DARK; ctx.font = '400 14px system-ui, sans-serif';
    noteLines.forEach((ln, i) => ctx.fillText(ln, 48, noteTop + 26 + i * 22));
    // Generated timestamp
    ctx.fillStyle = MUTED; ctx.font = '400 11px system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(`${this.i18n.t('receipt_generated')} ${this.fmtDateTime()}`, W / 2, H - 24);

    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `recu-${r.ref}.png`;
    a.click();
  }

  // ---- helpers ----
  private loadImg(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }
  private wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
    const words = text.split(' '); const lines: string[] = []; let line = '';
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; }
      else line = test;
    }
    if (line) lines.push(line);
    return lines;
  }
  private statusLabel(payStatus?: string) {
    const k: Record<string, string> = {
      paid: 'st_paid', cash: 'st_cash', sara_pending: 'st_sara_pending', pending: 'st_pending', failed: 'st_failed',
    };
    return this.i18n.t(k[payStatus ?? ''] ?? 'st_pending');
  }
  private payDisplay(pay?: string) {
    return pay === 'cash' ? this.i18n.t('pay_cash_name') : pay ? payById(pay).name : '—';
  }
  private fmtDateTime(iso?: string) {
    const d = iso ? new Date(iso) : new Date();
    if (isNaN(d.getTime())) return iso ?? '';
    return d.toLocaleString(this.i18n.lang() === 'en' ? 'en-GB' : 'fr-FR',
      { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
}
