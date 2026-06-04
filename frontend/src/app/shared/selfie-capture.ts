import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { I18n } from '../core/i18n';
import { IconComponent } from './icon';

/** Simulated selfie capture for KYC, ported from components.jsx SelfieCapture. */
@Component({
  selector: 'selfie-capture',
  standalone: true,
  imports: [IconComponent],
  template: `
    @if (captured) {
      <div class="card" style="padding:16px;display:flex;flex-direction:column;align-items:center;gap:12px">
        <div style="position:relative;width:150px;height:150px;border-radius:50%;overflow:hidden;box-shadow:var(--shadow)">
          <svg viewBox="0 0 150 150" width="150" height="150">
            <defs><linearGradient id="selfbg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#cfe6da"/><stop offset="1" stop-color="#9cc3b3"/></linearGradient></defs>
            <rect width="150" height="150" fill="url(#selfbg)"/>
            <circle cx="75" cy="60" r="30" fill="#5b7d6f"/>
            <path d="M30 150 q0 -40 45 -40 q45 0 45 40 z" fill="#5b7d6f"/>
          </svg>
          <span style="position:absolute;right:6px;bottom:6px;width:30px;height:30px;border-radius:50%;background:var(--success);color:#fff;display:flex;align-items:center;justify-content:center">
            <ic name="check" [size]="18" [sw]="2.6"></ic>
          </span>
        </div>
        <div style="display:flex;align-items:center;gap:7px;color:var(--success);font-weight:700;font-size:13px">
          <ic name="check" [size]="16" [sw]="2.5"></ic> {{ i18n.t('selfie_done') }}
        </div>
        <button class="btn btn-ghost" (click)="retake.emit()" style="padding:10px 14px;font-size:13px;width:auto">
          <ic name="refresh" [size]="16"></ic> {{ i18n.t('selfie_retake') }}
        </button>
      </div>
    } @else {
      <div class="card" style="padding:16px;display:flex;flex-direction:column;align-items:center;gap:14px">
        <div style="position:relative;width:180px;height:180px;border-radius:50%;background:#0e1f1b;overflow:hidden;display:flex;align-items:center;justify-content:center">
          <svg viewBox="0 0 180 180" width="180" height="180" style="position:absolute;inset:0">
            <ellipse cx="90" cy="82" rx="46" ry="58" fill="none" stroke="rgba(255,255,255,.35)" stroke-dasharray="6 8" stroke-width="2.5"/>
            <path d="M90 78 v16M78 108 q12 8 24 0" fill="none" stroke="rgba(255,255,255,.3)" stroke-width="2.5" stroke-linecap="round"/>
          </svg>
          @if (shooting) { <span style="position:absolute;inset:0;background:#fff;animation:pulse .9s ease"></span> }
        </div>
        <p class="muted" style="font-size:12.5px;text-align:center;line-height:1.45;max-width:250px">{{ i18n.t('selfie_guide') }}</p>
        <button class="btn btn-primary" (click)="shoot()" [disabled]="shooting" style="width:auto;padding:12px 22px">
          <ic name="camera" [size]="19"></ic> {{ shooting ? i18n.t('selfie_shooting') : i18n.t('selfie_take') }}
        </button>
      </div>
    }`,
})
export class SelfieCaptureComponent {
  i18n = inject(I18n);
  @Input() captured = false;
  @Output() capture = new EventEmitter<void>();
  @Output() retake = new EventEmitter<void>();
  shooting = false;

  shoot() {
    this.shooting = true;
    setTimeout(() => { this.shooting = false; this.capture.emit(); }, 900);
  }
}
