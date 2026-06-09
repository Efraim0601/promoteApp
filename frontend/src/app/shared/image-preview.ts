import { Component, HostListener, Injectable, inject, signal } from '@angular/core';
import { SafeUrl } from '@angular/platform-browser';
import { IconComponent } from './icon';

/** App-wide image lightbox state. Call {@link open} with a (sanitized) image URL to show it. */
@Injectable({ providedIn: 'root' })
export class ImagePreview {
  readonly src = signal<SafeUrl | null>(null);
  open(src: SafeUrl | null | undefined) { if (src) this.src.set(src); }
  close() { this.src.set(null); }
}

/**
 * Full-screen image viewer overlay — mount once at the app root. Shows the whole image
 * (object-fit: contain, so every edge is visible) on a dim backdrop; closes on backdrop click,
 * the ✕ button, or Escape.
 */
@Component({
  selector: 'image-preview',
  standalone: true,
  imports: [IconComponent],
  template: `
    @if (preview.src(); as src) {
      <div class="img-modal" (click)="preview.close()">
        <button class="img-modal-close" (click)="preview.close()" aria-label="Fermer"><ic name="x" [size]="22"></ic></button>
        <img [src]="src" alt="" (click)="$event.stopPropagation()" />
      </div>
    }`,
  styles: [`
    .img-modal{ position:fixed; inset:0; z-index:1000; background:rgba(8,6,10,.86); backdrop-filter:blur(3px);
      display:flex; align-items:center; justify-content:center; padding:24px; animation:imgFade .16s ease; }
    .img-modal img{ max-width:94vw; max-height:88vh; object-fit:contain; border-radius:14px;
      border:1px solid rgba(255,255,255,.2); box-shadow:0 26px 80px rgba(0,0,0,.6); background:#0d0b10; }
    .img-modal-close{ position:absolute; top:16px; right:16px; width:44px; height:44px; border-radius:50%; border:none;
      background:rgba(255,255,255,.16); color:#fff; cursor:pointer; display:flex; align-items:center; justify-content:center; }
    .img-modal-close:hover{ background:rgba(255,255,255,.28); }
    @keyframes imgFade{ from{ opacity:0 } to{ opacity:1 } }
  `],
})
export class ImagePreviewComponent {
  preview = inject(ImagePreview);
  @HostListener('document:keydown.escape') onEsc() { this.preview.close(); }
}
