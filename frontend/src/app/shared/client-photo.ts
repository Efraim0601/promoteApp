import { AfterViewInit, Component, ElementRef, Input, OnDestroy, inject, signal } from '@angular/core';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { Api } from '../core/api';
import { AvatarComponent } from './avatar';

/**
 * Client selfie thumbnail (KYC) loaded by subscription ref, with an avatar-initials fallback.
 * The image endpoint is JWT-protected, so it must be fetched via HttpClient (not a bare <img src>)
 * then shown as an object URL. Loads lazily when scrolled into view, so a long admin table doesn't
 * fire a request per row up front.
 */
@Component({
  selector: 'client-photo',
  standalone: true,
  imports: [AvatarComponent],
  template: `
    @if (url()) {
      <img [src]="url()" alt="" [style.width.px]="size" [style.height.px]="size"
           style="object-fit:cover;border-radius:50%;display:block;flex-shrink:0;border:1.5px solid var(--border)" />
    } @else {
      <avatar [name]="name" [size]="size"></avatar>
    }`,
})
export class ClientPhotoComponent implements AfterViewInit, OnDestroy {
  private api = inject(Api);
  private sanitizer = inject(DomSanitizer);
  private host: ElementRef<HTMLElement> = inject(ElementRef);

  @Input() refId = '';
  @Input() name = '';
  @Input() hasSelfie = false;
  @Input() size = 40;

  url = signal<SafeUrl | null>(null);
  private objectUrl: string | null = null;
  private observer?: IntersectionObserver;

  ngAfterViewInit() {
    if (!this.hasSelfie || !this.refId) return;
    if (typeof IntersectionObserver === 'undefined') { this.load(); return; }
    this.observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { this.observer?.disconnect(); this.load(); }
    }, { rootMargin: '200px' });
    this.observer.observe(this.host.nativeElement);
  }

  private load() {
    this.api.imageBlob(this.refId, 'selfie').subscribe({
      next: (blob) => {
        this.revoke();
        this.objectUrl = URL.createObjectURL(blob);
        this.url.set(this.sanitizer.bypassSecurityTrustUrl(this.objectUrl));
      },
      error: () => { this.revoke(); this.url.set(null); },
    });
  }

  private revoke() { if (this.objectUrl) { URL.revokeObjectURL(this.objectUrl); this.objectUrl = null; } }
  ngOnDestroy() { this.observer?.disconnect(); this.revoke(); }
}
