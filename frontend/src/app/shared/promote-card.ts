import { Component, Input, inject } from '@angular/core';
import { I18n } from '../core/i18n';
import { mulberry32 } from './constants';

interface Dot { x: number; y: number; r: number; o: number; glow: boolean; }
interface Fall { x: number; y2: number; }

/** "Prépayée Electron" card visual, ported from components.jsx PromoteCard. */
@Component({
  selector: 'promote-card',
  standalone: true,
  template: `
  <div style="width:100%;border-radius:18px;overflow:hidden;box-shadow:0 16px 38px rgba(4,30,28,.5);line-height:0">
    <svg [attr.viewBox]="'0 0 ' + W + ' ' + H" width="100%" style="display:block" font-family="'Manrope',system-ui,sans-serif">
      <defs>
        <linearGradient id="pcbg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#17352f"/><stop offset="0.5" stop-color="#102a26"/><stop offset="1" stop-color="#0a1f1c"/>
        </linearGradient>
        <radialGradient id="pcglow" cx="0.62" cy="0.28" r="0.6">
          <stop offset="0" stop-color="#1d5a52" stop-opacity="0.55"/><stop offset="1" stop-color="#0a1f1c" stop-opacity="0"/>
        </radialGradient>
        <linearGradient id="pcstrip" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#6f6f68"/><stop offset="0.45" stop-color="#d9d7cd"/>
          <stop offset="0.55" stop-color="#c8c6bc"/><stop offset="1" stop-color="#5d5d56"/>
        </linearGradient>
        <linearGradient id="pcbadge" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#e8e6df"/><stop offset="0.5" stop-color="#b9b7ad"/><stop offset="1" stop-color="#d7d5cc"/>
        </linearGradient>
        <radialGradient id="pcglobe" cx="0.36" cy="0.32" r="0.75">
          <stop offset="0" stop-color="#f4f2ec"/><stop offset="0.5" stop-color="#c9c7bf"/>
          <stop offset="0.85" stop-color="#8f8d85"/><stop offset="1" stop-color="#5f5e58"/>
        </radialGradient>
        <clipPath id="pcclipglobe"><circle cx="232" cy="470" r="92"/></clipPath>
      </defs>
      <rect [attr.width]="W" [attr.height]="H" fill="url(#pcbg)"/>
      <rect [attr.width]="W" [attr.height]="H" fill="url(#pcglow)"/>
      @for (d of dots; track $index) {
        <circle [attr.cx]="d.x" [attr.cy]="d.y" [attr.r]="d.r" [attr.fill]="d.glow ? '#5fe6d8' : '#2f7d74'" [attr.opacity]="d.o"/>
      }
      <g stroke="#3bc9bd" stroke-width="2.4" opacity="0.7" fill="none">
        @for (f of falls; track $index) {
          <g><line [attr.x1]="f.x" y1="14" [attr.x2]="f.x" [attr.y2]="f.y2"/><circle [attr.cx]="f.x" [attr.cy]="f.y2" r="7" fill="#5fe6d8" stroke="none"/></g>
        }
      </g>
      <g stroke="#2f9c92" stroke-width="2.6" fill="none" opacity="0.6" stroke-linejoin="round" stroke-linecap="round">
        <path d="M1010 470 H905 V512 H835"/><circle cx="835" cy="512" r="6" fill="#54d8cb" stroke="none"/>
        <path d="M1010 556 H940 V520"/><path d="M40 420 H95 V470" opacity="0.5"/>
      </g>
      <g stroke="rgba(196,214,208,0.16)" stroke-width="3" fill="none" stroke-linejoin="round" stroke-linecap="round">
        <path d="M560 150 Q620 120 680 150 Q672 196 620 200 Q568 196 560 150 Z"/>
        <ellipse cx="620" cy="300" rx="86" ry="118"/>
        <path d="M576 268 Q600 256 620 268 M620 268 Q640 256 664 268"/>
        <path d="M592 292 h22 M626 292 h22"/><path d="M620 296 L606 344 H634 Z"/>
        <path d="M604 372 Q620 384 636 372"/>
        <path d="M598 418 H642"/><path d="M610 418 V470"/><path d="M630 418 V470"/>
        <path d="M520 470 H720 V512 H520 Z"/><path d="M560 512 L620 596 L680 512"/><path d="M620 596 V628"/>
      </g>
      <rect x="64" y="0" width="56" [attr.height]="H" fill="url(#pcstrip)"/>
      <g fill="#2c2c29" transform="translate(92,0)">
        <g transform="translate(0,120)"><path d="M-13 -8 Q0 -18 13 -8 Q4 0 13 8 Q0 18 -13 8 Q-4 0 -13 -8 Z"/></g>
        <g transform="translate(0,210)"><circle cx="-7" cy="0" r="7"/><circle cx="7" cy="0" r="7"/><rect x="-2" y="-9" width="4" height="18"/></g>
        <g transform="translate(0,300)"><path d="M0 -13 L4 -4 L13 -4 L6 2 L9 12 L0 6 L-9 12 L-6 2 L-13 -4 L-4 -4 Z"/></g>
        <g transform="translate(0,390)" stroke="#2c2c29" stroke-width="3.5" fill="none"><path d="M-10 6 q-2 -14 8 -12 q9 2 6 9 q-2 5 -8 3"/></g>
      </g>
      <g transform="translate(150,86)">
        <rect x="0" y="0" width="92" height="92" rx="10" fill="#d8202a"/>
        <path d="M62 22 a26 26 0 1 0 0 48" fill="none" stroke="#fff" stroke-width="11" stroke-linecap="round"/>
        <rect x="40" y="40" width="26" height="12" rx="3" fill="#fff"/><circle cx="70" cy="62" r="7" fill="#fff"/>
      </g>
      <text x="270" y="150" font-family="'Yellowtail', cursive" font-size="118" fill="#ffffff">Prépayée</text>
      <text x="430" y="196" font-size="38" fill="#ffffff" font-weight="700" letter-spacing="10">ELECTRON</text>
      <g transform="translate(770,108)">
        <rect x="0" y="0" width="206" height="62" rx="31" fill="url(#pcbadge)"/>
        <text x="103" y="42" text-anchor="middle" font-size="34" font-weight="800" fill="#1c1c1a" font-style="italic">Prepaid</text>
      </g>
      <g transform="translate(300,300)" stroke="#ffffff" stroke-width="11" fill="none" stroke-linecap="round" opacity="0.95">
        <path d="M0 -34 a44 44 0 0 1 0 68"/><path d="M22 -50 a66 66 0 0 1 0 100"/><path d="M-16 -16 a20 20 0 0 1 0 32"/>
      </g>
      <circle cx="232" cy="470" r="92" fill="url(#pcglobe)"/>
      <g clip-path="url(#pcclipglobe)" fill="#8a8880" opacity="0.55">
        <path d="M200 430 q24 -14 40 4 q14 14 -2 28 q-22 12 -40 -4 q-12 -16 2 -28 Z"/>
        <path d="M250 470 q24 -6 30 14 q4 20 -18 24 q-20 2 -22 -18 q0 -16 10 -20 Z"/>
        <path d="M180 500 q18 -4 22 10 q2 14 -14 14 q-14 0 -14 -12 q0 -10 6 -12 Z"/>
      </g>
      <ellipse cx="206" cy="442" rx="30" ry="20" fill="#ffffff" opacity="0.4"/>
      <text x="150" y="486" font-size="56" font-weight="600" fill="#e9e7df" letter-spacing="2">5028</text>
      <text x="640" y="430" font-size="30" font-weight="700" fill="#ffffff" letter-spacing="1">EXPIRE</text>
      <text x="640" y="470" font-size="30" font-weight="700" fill="#ffffff" letter-spacing="1">A FIN</text>
      <text x="770" y="470" font-size="30" font-weight="600" fill="#dfe6e3">{{ exp }}</text>
      <text x="150" y="600" font-size="30" font-weight="700" fill="#ffffff" letter-spacing="1">{{ name }}</text>
    </svg>
  </div>`,
})
export class PromoteCardComponent {
  private i18n = inject(I18n);
  @Input() holder = '';
  @Input() exp = '05/28';
  readonly W = 1010;
  readonly H = 636;

  get name(): string {
    const h = (this.holder || '').trim();
    return (h ? h.toUpperCase() : (this.i18n.lang() === 'en' ? 'CARD HOLDER' : 'TITULAIRE DE LA CARTE')).slice(0, 26);
  }

  readonly dots: Dot[] = (() => {
    const rnd = mulberry32(20250318);
    const arr: Dot[] = [];
    for (let i = 0; i < 120; i++)
      arr.push({ x: 110 + rnd() * 880, y: 24 + rnd() * 590, r: 1.4 + rnd() * 5.2, o: 0.12 + rnd() * 0.62, glow: rnd() < 0.18 });
    return arr;
  })();

  readonly falls: Fall[] = (() => {
    const fr = mulberry32(77);
    return [560, 610, 665, 720, 780, 835, 885, 930, 968].map((x) => ({ x, y2: 18 + (120 + fr() * 360) }));
  })();
}
