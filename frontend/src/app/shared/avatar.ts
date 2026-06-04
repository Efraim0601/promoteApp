import { Component, Input } from '@angular/core';

/** Initials avatar — admins get the filled primary colour, others an outlined chip. */
@Component({
  selector: 'avatar',
  standalone: true,
  template: `<span [style.width.px]="size" [style.height.px]="size" [style.font-size.px]="size*0.38"
      [class.admin]="role==='admin'" class="av">{{ initials }}</span>`,
  styles: [`
    .av{ border-radius:50%; flex-shrink:0; display:flex; align-items:center; justify-content:center;
      font-weight:800; font-family:var(--font);
      background:var(--surface-2); color:var(--primary); border:1.5px solid var(--border); }
    .av.admin{ background:var(--primary); color:var(--on-primary); border:none; }
  `],
})
export class AvatarComponent {
  @Input() name = '?';
  @Input() size = 36;
  @Input() role = '';

  get initials(): string {
    return (this.name || '?').split(/\s+/).slice(0, 2).map((s) => s[0]).join('').toUpperCase();
  }
}
