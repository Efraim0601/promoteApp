import { AfterViewInit, Component, ElementRef, EventEmitter, Input, OnDestroy, Output, ViewChild, inject, signal } from '@angular/core';
import { I18n } from '../core/i18n';
import { IconComponent } from './icon';
import { assessDocument, DocIssue } from './image-quality';

/**
 * KYC photo capture via the device camera (getUserMedia). Supports the front
 * (selfie) and rear (environment) cameras with a flip toggle, round or rectangular
 * framing, and emits the captured frame as a JPEG data URL. Falls back to a neutral
 * placeholder when no camera is available (insecure origin, denied, no device).
 * Requires HTTPS in production; works on http://localhost.
 */
@Component({
  selector: 'photo-capture',
  standalone: true,
  imports: [IconComponent],
  template: `
    @if (imageData) {
      <div class="card" style="padding:16px;display:flex;flex-direction:column;align-items:center;gap:12px">
        <div [style.width.px]="boxW" [style.height.px]="boxH" [style.border-radius.px]="round ? boxW : 16"
             style="position:relative;overflow:hidden;box-shadow:var(--shadow)">
          <img [src]="imageData" alt="capture" style="width:100%;height:100%;object-fit:cover" />
          <span style="position:absolute;right:8px;bottom:8px;width:28px;height:28px;border-radius:50%;background:var(--success);color:#fff;display:flex;align-items:center;justify-content:center">
            <ic name="check" [size]="16" [sw]="2.6"></ic>
          </span>
        </div>
        <!-- Non-blocking quality warning: the shot is kept, the user decides to retake or continue. -->
        @if (qualityIssue()) {
          <p style="display:flex;gap:7px;align-items:flex-start;font-size:12px;line-height:1.4;max-width:280px;text-align:left;color:var(--accent);font-weight:600;background:var(--accent-soft);border-radius:10px;padding:9px 11px">
            <ic name="alert" [size]="16" [sw]="2.4" style="flex:0 0 auto;margin-top:1px"></ic>
            <span>{{ i18n.t('q_' + qualityIssue()) }}<br><span style="font-weight:500;color:var(--muted)">{{ i18n.t('q_keep_or_retake') }}</span></span>
          </p>
        }
        <div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center">
          <button class="btn btn-ghost" (click)="retakePhoto()" style="padding:10px 14px;font-size:13px;width:auto">
            <ic name="refresh" [size]="16"></ic> {{ i18n.t('selfie_retake') }}
          </button>
          @if (allowGallery) {
            <button class="btn btn-outline" (click)="pickFromGallery()" style="padding:10px 14px;font-size:13px;width:auto">
              <ic name="image" [size]="16"></ic> {{ i18n.t('cam_gallery') }}
            </button>
          }
        </div>
      </div>
    } @else {
      <div class="card" style="padding:16px;display:flex;flex-direction:column;align-items:center;gap:12px">
        <div [style.width.px]="boxW" [style.height.px]="boxH" [style.border-radius.px]="round ? boxW : 16"
             style="position:relative;overflow:hidden;background:#0e1f1b;display:flex;align-items:center;justify-content:center">
          <video #video autoplay playsinline muted
                 [style.display]="streaming() ? 'block' : 'none'"
                 [style.transform]="facing === 'user' ? 'scaleX(-1)' : 'none'"
                 style="width:100%;height:100%;object-fit:cover"></video>
          @if (!streaming()) {
            <ic [name]="round ? 'user' : 'idcard'" [size]="46" style="color:rgba(255,255,255,.35)"></ic>
          }
          @if (!round && streaming()) {
            <span style="position:absolute;inset:10px;border:2px dashed rgba(255,255,255,.5);border-radius:10px;pointer-events:none"></span>
          }
          @if (shooting()) { <span style="position:absolute;inset:0;background:#fff;animation:pulse .9s ease"></span> }
        </div>
        <p class="muted" style="font-size:12px;text-align:center;line-height:1.45;max-width:260px">{{ guide || i18n.t('selfie_guide') }}</p>
        <!-- Progressive guidance: a short checklist of what makes a good shot. -->
        @if (tips.length) {
          <div style="width:100%;max-width:300px;display:flex;flex-direction:column;gap:6px;background:var(--surface-2);border-radius:12px;padding:11px 13px">
            @if (tipsTitle) { <div style="font-size:11.5px;font-weight:800;color:var(--text)">{{ i18n.t(tipsTitle) }}</div> }
            @for (tip of tips; track tip) {
              <div style="display:flex;gap:7px;align-items:flex-start;font-size:11.5px;line-height:1.4;color:var(--muted)">
                <ic name="check" [size]="14" [sw]="2.6" style="color:var(--success);flex:0 0 auto;margin-top:1px"></ic>
                <span>{{ i18n.t(tip) }}</span>
              </div>
            }
          </div>
        }
        <div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center">
          @if (!streaming()) {
            <button class="btn btn-primary" (click)="start()" [disabled]="starting()" style="width:auto;padding:11px 18px">
              <ic name="camera" [size]="18"></ic> {{ starting() ? i18n.t('selfie_shooting') : i18n.t('cam_open') }}
            </button>
            @if (allowGallery) {
              <button class="btn btn-outline" (click)="pickFromGallery()" style="width:auto;padding:11px 14px;font-size:13px">
                <ic name="image" [size]="16"></ic> {{ i18n.t('cam_gallery') }}
              </button>
            }
          } @else {
            <button class="btn btn-primary" (click)="shoot()" [disabled]="shooting()" style="width:auto;padding:11px 18px">
              <ic name="camera" [size]="18"></ic> {{ i18n.t('cam_take') }}
            </button>
            @if (allowGallery) {
              <button class="btn btn-outline" (click)="pickFromGallery()" style="width:auto;padding:11px 14px;font-size:13px">
                <ic name="image" [size]="16"></ic> {{ i18n.t('cam_gallery') }}
              </button>
            }
            @if (allowFlip) {
              <button class="btn btn-outline" (click)="flip()" style="width:auto;padding:11px 14px;font-size:13px">
                <ic name="refresh" [size]="16"></ic> {{ facing === 'user' ? i18n.t('cam_rear') : i18n.t('cam_front') }}
              </button>
            }
          }
        </div>
      </div>
    }
    <canvas #canvas style="display:none"></canvas>
    <input #file type="file" accept="image/*" (change)="onFileSelected($event)" style="display:none" />`,
})
export class PhotoCaptureComponent implements AfterViewInit, OnDestroy {
  i18n = inject(I18n);

  @Input() imageData: string | null = null;
  /** 'user' = front/selfie, 'environment' = rear. */
  @Input() facing: 'user' | 'environment' = 'user';
  @Input() allowFlip = false;
  @Input() round = false;
  @Input() guide = '';
  /** Optional progressive guidance: i18n keys rendered as a checklist of tips. */
  @Input() tips: string[] = [];
  @Input() tipsTitle = '';
  @Input() boxW = 200;
  @Input() boxH = 200;
  /** When true, captured frames are checked for document quality (sharp, exposed, fully framed). */
  @Input() qualityCheck = false;
  /** Allow picking from the gallery. Set false to FORCE the live camera (selfie / KYC integrity). */
  @Input() allowGallery = true;
  @Output() captured = new EventEmitter<string>();
  @Output() retake = new EventEmitter<void>();

  @ViewChild('video') video?: ElementRef<HTMLVideoElement>;
  @ViewChild('canvas') canvas?: ElementRef<HTMLCanvasElement>;
  @ViewChild('file') file?: ElementRef<HTMLInputElement>;

  streaming = signal(false);
  starting = signal(false);
  shooting = signal(false);
  /** Last blocking quality issue (null = none); drives the on-screen guidance message. */
  qualityIssue = signal<DocIssue | null>(null);
  private stream: MediaStream | null = null;

  ngAfterViewInit() { /* camera starts on user action */ }

  async start() {
    this.starting.set(true);
    await this.openCamera();
    this.starting.set(false);
  }

  private async openCamera() {
    this.stop();
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: this.facing }, audio: false });
      this.streaming.set(true);
      setTimeout(() => { if (this.video) this.video.nativeElement.srcObject = this.stream; }, 0);
    } catch {
      this.simulate(); // no camera / denied / insecure origin
    }
  }

  flip() {
    this.facing = this.facing === 'user' ? 'environment' : 'user';
    if (this.streaming()) this.openCamera();
  }

  shoot() {
    const v = this.video?.nativeElement;
    const c = this.canvas?.nativeElement;
    if (!v || !c) return;
    this.shooting.set(true);
    const w = this.round ? 320 : 640, h = this.round ? 320 : 400;
    c.width = w; c.height = h;
    const ctx = c.getContext('2d')!;
    // cover-fit the video frame into the canvas
    const vr = v.videoWidth / v.videoHeight, cr = w / h;
    let sw = v.videoWidth, sh = v.videoHeight, sx = 0, sy = 0;
    if (vr > cr) { sw = v.videoHeight * cr; sx = (v.videoWidth - sw) / 2; }
    else { sh = v.videoWidth / cr; sy = (v.videoHeight - sh) / 2; }
    if (this.facing === 'user') { ctx.translate(w, 0); ctx.scale(-1, 1); }
    ctx.drawImage(v, sx, sy, sw, sh, 0, 0, w, h);
    // Quality check is now advisory (flexible): flag blurry / dark / glare / mis-framed shots as a
    // warning shown on the preview, but keep the photo — the user retakes or continues as they wish.
    this.qualityIssue.set(this.qualityCheck ? (assessDocument(c).issue ?? null) : null);
    const data = c.toDataURL('image/jpeg', 0.82);
    setTimeout(() => { this.shooting.set(false); this.stop(); this.imageData = data; this.captured.emit(data); }, 220);
  }

  /** Open the device gallery / file picker (no `capture` attr → lets the user pick an existing image). */
  pickFromGallery() {
    this.file?.nativeElement.click();
  }

  /** Load a picked image file, normalise it (cover-fit, JPEG) like a camera shot, and emit it. */
  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const f = input.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        this.stop(); // release the camera if it was open
        const data = this.drawCover(img);
        input.value = ''; // allow re-picking the same file later
        // No quality gate on gallery picks — the sharpness/framing check applies only to photos
        // captured live by the in-app camera (the user can't reframe a file they already have).
        this.qualityIssue.set(null);
        this.imageData = data;
        this.captured.emit(data);
      };
      img.onerror = () => { input.value = ''; };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(f);
  }

  /** Cover-fit an image source into the capture canvas at the same dimensions as shoot(). */
  private drawCover(img: HTMLImageElement): string {
    const c = this.canvas?.nativeElement ?? document.createElement('canvas');
    const w = this.round ? 320 : 640, h = this.round ? 320 : 400;
    c.width = w; c.height = h;
    const ctx = c.getContext('2d')!;
    const ir = img.naturalWidth / img.naturalHeight, cr = w / h;
    let sw = img.naturalWidth, sh = img.naturalHeight, sx = 0, sy = 0;
    if (ir > cr) { sw = img.naturalHeight * cr; sx = (img.naturalWidth - sw) / 2; }
    else { sh = img.naturalWidth / cr; sy = (img.naturalHeight - sh) / 2; }
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
    return c.toDataURL('image/jpeg', 0.82);
  }

  /** Neutral placeholder so KYC can proceed when no camera is available. */
  private simulate() {
    const c = this.canvas?.nativeElement ?? document.createElement('canvas');
    const w = this.round ? 320 : 640, h = this.round ? 320 : 400;
    c.width = w; c.height = h;
    const ctx = c.getContext('2d')!;
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#cfe6da'); g.addColorStop(1, '#9cc3b3');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#5b7d6f';
    if (this.round) {
      ctx.beginPath(); ctx.arc(w / 2, h * 0.4, w * 0.2, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(w / 2, h, w * 0.3, h * 0.28, 0, Math.PI, 0, true); ctx.fill();
    } else {
      ctx.fillRect(w * 0.1, h * 0.2, w * 0.8, h * 0.6);
    }
    this.imageData = c.toDataURL('image/jpeg', 0.8);
    this.captured.emit(this.imageData);
  }

  retakePhoto() { this.imageData = null; this.qualityIssue.set(null); this.retake.emit(); }

  private stop() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.streaming.set(false);
  }
  ngOnDestroy() { this.stop(); }
}
