import { Injectable, signal } from '@angular/core';

export type Theme = 'institutionnel' | 'fintech' | 'warm';

/** Visual theme. Default is the Afriland red institutional theme. */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly theme = signal<Theme>('institutionnel');
  set(t: Theme): void { this.theme.set(t); }
}
