import { Injectable, inject, signal } from '@angular/core';
import { Api } from './api';
import { CardConfig } from './models';

@Injectable({ providedIn: 'root' })
export class ConfigStore {
  private api = inject(Api);
  // Current config (null until loaded). Components read this signal for the latest values.
  cfg = signal<CardConfig | null>(null);

  constructor() {
    this.refresh();
  }

  refresh() {
    this.api.getConfig().subscribe({ next: (c) => this.cfg.set(c), error: () => {} });
  }

  setLocal(c: CardConfig) { this.cfg.set(c); }
}
