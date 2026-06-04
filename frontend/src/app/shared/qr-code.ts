import { AfterViewInit, Component, ElementRef, Input, OnChanges, ViewChild } from '@angular/core';
import * as QRCode from 'qrcode';

/**
 * Real, scannable QR code. Encodes the given `data` (a URL or reference) using the
 * `qrcode` library — scanning it with any phone camera opens the encoded URL.
 */
@Component({
  selector: 'qr-code',
  standalone: true,
  template: `<canvas #c [style.width.px]="size" [style.height.px]="size" style="display:block;border-radius:12px"></canvas>`,
})
export class QrCodeComponent implements AfterViewInit, OnChanges {
  /** Text/URL to encode. (Legacy `seed` alias still accepted.) */
  @Input() data = '';
  @Input() set seed(v: string) { if (v) this.data = v; }
  @Input() size = 188;

  @ViewChild('c') canvas?: ElementRef<HTMLCanvasElement>;

  ngAfterViewInit() { this.render(); }
  ngOnChanges() { this.render(); }

  private render() {
    const el = this.canvas?.nativeElement;
    if (!el || !this.data) return;
    QRCode.toCanvas(el, this.data, {
      width: this.size,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#0F2A1B', light: '#ffffff' },
    }).catch(() => { /* ignore render errors */ });
  }
}
