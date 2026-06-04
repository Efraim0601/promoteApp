import { Component, Input } from '@angular/core';
import { mulberry32 } from './constants';

interface Cell { x: number; y: number; s: number; }

/** Generative QR-style code (decorative), ported from components.jsx qrMatrix/QRCode. */
@Component({
  selector: 'qr-code',
  standalone: true,
  template: `
    <svg [attr.width]="size" [attr.height]="size" [attr.viewBox]="'0 0 ' + size + ' ' + size" style="display:block">
      <rect [attr.width]="size" [attr.height]="size" rx="14" fill="#fff"></rect>
      @for (c of cells; track c.x + '-' + c.y) {
        <rect [attr.x]="c.x" [attr.y]="c.y" [attr.width]="c.s" [attr.height]="c.s" [attr.rx]="cell*0.18" fill="#0F2A1B"></rect>
      }
      <rect [attr.x]="lc" [attr.y]="lc" [attr.width]="lg" [attr.height]="lg" [attr.rx]="lg*0.22" fill="#fff"></rect>
      <g [attr.transform]="logoTransform">
        <path d="M20 4 L34 32 H26.5 L20 16 L13.5 32 H6 Z" fill="#06703A"></path>
        <path d="M20 4 L34 32 H26.5 L20 16 Z" fill="#D81E2C"></path>
      </g>
    </svg>`,
})
export class QrCodeComponent {
  @Input() seed = 'PROMOTE-AF';
  @Input() size = 188;

  private n = 29;
  private q = 2;
  get cell(): number { return this.size / (this.n + this.q * 2); }
  get lg(): number { return 6.4 * this.cell; }
  get lc(): number { return (this.size - this.lg) / 2; }
  get logoTransform(): string {
    const s = (this.lg * 0.68) / 40;
    return `translate(${this.lc + this.lg / 2 - this.lg * 0.34}, ${this.lc + this.lg / 2 - this.lg * 0.34}) scale(${s})`;
  }

  get cells(): Cell[] {
    const m = this.matrix(this.seed, this.n);
    const out: Cell[] = [];
    for (let i = 0; i < this.n; i++)
      for (let j = 0; j < this.n; j++)
        if (m[i][j]) out.push({ x: (j + this.q) * this.cell, y: (i + this.q) * this.cell, s: this.cell * 1.02 });
    return out;
  }

  private matrix(seedStr: string, n: number): boolean[][] {
    let seed = 0;
    for (let i = 0; i < seedStr.length; i++) seed = (seed * 31 + seedStr.charCodeAt(i)) | 0;
    const rnd = mulberry32(seed || 1);
    const m = Array.from({ length: n }, () => Array.from({ length: n }, () => rnd() < 0.47));
    const finder = (R: number, C: number) => {
      for (let i = -1; i <= 7; i++)
        for (let j = -1; j <= 7; j++) {
          const r = R + i, c = C + j;
          if (r < 0 || c < 0 || r >= n || c >= n) continue;
          const border = i === 0 || i === 6 || j === 0 || j === 6;
          const core = i >= 2 && i <= 4 && j >= 2 && j <= 4;
          const inRange = i >= 0 && i <= 6 && j >= 0 && j <= 6;
          m[r][c] = inRange ? border || core : false;
        }
    };
    finder(0, 0); finder(0, n - 7); finder(n - 7, 0);
    for (let i = 8; i < n - 8; i++) { m[6][i] = i % 2 === 0; m[i][6] = i % 2 === 0; }
    const a = Math.floor(n / 2) - 3, b = a + 7;
    for (let i = a; i < b; i++) for (let j = a; j < b; j++) m[i][j] = false;
    return m;
  }
}
