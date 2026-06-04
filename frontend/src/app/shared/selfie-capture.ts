import { Component, EventEmitter, Input, OnDestroy, Output, ViewChild, ElementRef, inject, signal } from '@angular/core';
import { I18n } from '../core/i18n';
import { IconComponent } from './icon';

/**
 * Real KYC selfie capture via the device camera (getUserMedia). Captures a JPEG
 * frame and emits it as a data URL. Falls back to a simulated placeholder when the
 * camera is unavailable or denied (and on insecure origins). Requires HTTPS in
 * production; works on http://localhost.
 */
@Component({
  selector: 'selfie-capture',
  standalone: true,
  imports: [IconComponent],
  template: `
    @if (imageData) {
      <div class="card" style="padding:16px;display:flex;flex-direction:column;align-items:center;gap:12px">
        <div style="position:relative;width:170px;height:170px;border-radius:50%;overflow:hidden;box-shadow:var(--shadow)">
          <img [src]="imageData" alt="selfie" style="width:100%;height:100%;object-fit:cover" />
          <span style="position:absolute;right:8px;bottom:8px;width:30px;height:30px;border-radius:50%;background:var(--success);color:#fff;display:flex;align-items:center;justify-content:center">
            <ic name="check" [size]="18" [sw]="2.6"></ic>
          </span>
        </div>
        <div style="display:flex;align-items:center;gap:7px;color:var(--success);font-weight:700;font-size:13px">
          <ic name="check" [size]="16" [sw]="2.5"></ic> {{ i18n.t('selfie_done') }}
        </div>
        <button class="btn btn-ghost" (click)="retakePhoto()" style="padding:10px 14px;font-size:13px;width:auto">
          <ic name="refresh" [size]="16"></ic> {{ i18n.t('selfie_retake') }}
        </button>
      </div>
    } @else {
      <div class="card" style="padding:16px;display:flex;flex-direction:column;align-items:center;gap:14px">
        <div style="position:relative;width:200px;height:200px;border-radius:50%;background:#0e1f1b;overflow:hidden;display:flex;align-items:center;justify-content:center">
          <video #video autoplay playsinline muted
                 [style.display]="streaming() ? 'block' : 'none'"
                 style="width:100%;height:100%;object-fit:cover;transform:scaleX(-1)"></video>
          @if (!streaming()) {
            <svg viewBox="0 0 200 200" width="200" height="200" style="position:absolute;inset:0">
              <ellipse cx="100" cy="92" rx="50" ry="64" fill="none" stroke="rgba(255,255,255,.35)" stroke-dasharray="6 8" stroke-width="2.5"/>
            </svg>
          }
          @if (shooting()) { <span style="position:absolute;inset:0;background:#fff;animation:pulse .9s ease"></span> }
        </div>
        <p class="muted" style="font-size:12.5px;text-align:center;line-height:1.45;max-width:250px">{{ hint() }}</p>
        <div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center">
          @if (!streaming()) {
            <button class="btn btn-primary" (click)="startCamera()" [disabled]="starting()" style="width:auto;padding:12px 20px">
              <ic name="camera" [size]="19"></ic> {{ starting() ? i18n.t('selfie_shooting') : i18n.t('selfie_take') }}
            </button>
          } @else {
            <button class="btn btn-primary" (click)="shoot()" [disabled]="shooting()" style="width:auto;padding:12px 22px">
              <ic name="camera" [size]="19"></ic> {{ i18n.t('selfie_take') }}
            </button>
          }
        </div>
      </div>
    }
    <canvas #canvas style="display:none"></canvas>`,
})
export class SelfieCaptureComponent implements OnDestroy {
  i18n = inject(I18n);
  /** Captured image as a data URL (set by the parent to restore, or emitted on capture). */
  @Input() imageData: string | null = null;
  @Output() captured = new EventEmitter<string>();
  @Output() retake = new EventEmitter<void>();

  @ViewChild('video') video?: ElementRef<HTMLVideoElement>;
  @ViewChild('canvas') canvas?: ElementRef<HTMLCanvasElement>;

  streaming = signal(false);
  starting = signal(false);
  shooting = signal(false);
  private failed = signal(false);
  private stream: MediaStream | null = null;

  hint() {
    return this.failed() ? this.i18n.t('selfie_guide') : this.i18n.t('selfie_guide');
  }

  async startCamera() {
    this.starting.set(true);
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
      this.streaming.set(true);
      // wait a tick for the <video> to render, then attach the stream
      setTimeout(() => { if (this.video) { this.video.nativeElement.srcObject = this.stream; } }, 0);
    } catch {
      // camera unavailable / denied / insecure origin → simulated fallback
      this.failed.set(true);
      this.simulate();
    } finally {
      this.starting.set(false);
    }
  }

  shoot() {
    const v = this.video?.nativeElement;
    const c = this.canvas?.nativeElement;
    if (!v || !c) return;
    this.shooting.set(true);
    const size = 320;
    c.width = size; c.height = size;
    const ctx = c.getContext('2d')!;
    // center-crop square, mirror to match the preview
    const side = Math.min(v.videoWidth, v.videoHeight) || size;
    const sx = (v.videoWidth - side) / 2, sy = (v.videoHeight - side) / 2;
    ctx.translate(size, 0); ctx.scale(-1, 1);
    ctx.drawImage(v, sx, sy, side, side, 0, 0, size, size);
    const data = c.toDataURL('image/jpeg', 0.82);
    setTimeout(() => {
      this.shooting.set(false);
      this.stop();
      this.imageData = data;
      this.captured.emit(data);
    }, 250);
  }

  /** Fallback when no camera: generate a neutral placeholder selfie so KYC can proceed. */
  private simulate() {
    const c = this.canvas?.nativeElement ?? document.createElement('canvas');
    c.width = 320; c.height = 320;
    const ctx = c.getContext('2d')!;
    const g = ctx.createLinearGradient(0, 0, 320, 320);
    g.addColorStop(0, '#cfe6da'); g.addColorStop(1, '#9cc3b3');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 320, 320);
    ctx.fillStyle = '#5b7d6f';
    ctx.beginPath(); ctx.arc(160, 128, 64, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(160, 300, 96, 86, 0, Math.PI, 0, true); ctx.fill();
    const data = c.toDataURL('image/jpeg', 0.8);
    this.imageData = data;
    this.captured.emit(data);
  }

  retakePhoto() {
    this.imageData = null;
    this.failed.set(false);
    this.retake.emit();
  }

  private stop() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.streaming.set(false);
  }
  ngOnDestroy() { this.stop(); }
}
