import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { Api } from '../core/api';
import { AppNotification } from '../core/models';
import { IconComponent } from './icon';

const POLL_MS = 30_000;

@Component({
  selector: 'notif-bell',
  standalone: true,
  imports: [IconComponent],
  styles: [`
    :host { position: relative; display: inline-flex; }
    .bell-btn { position: relative; background: none; border: none; padding: 6px; cursor: pointer; color: inherit; display: inline-flex; align-items: center; border-radius: 8px; }
    .bell-btn:hover { background: var(--surface-2); }
    .badge { position: absolute; top: 2px; right: 2px; min-width: 16px; height: 16px; border-radius: 99px; background: var(--accent); color: #fff; font-size: 9.5px; font-weight: 800; display: flex; align-items: center; justify-content: center; padding: 0 3px; pointer-events: none; }
    .dropdown { position: absolute; top: calc(100% + 6px); right: 0; width: 320px; max-height: 420px; overflow-y: auto; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; box-shadow: 0 8px 24px rgba(0,0,0,.13); z-index: 999; }
    .drop-head { display: flex; align-items: center; gap: 8px; padding: 10px 14px; border-bottom: 1px solid var(--border); }
    .drop-head h4 { margin: 0; font-size: 13px; font-weight: 800; flex: 1; }
    .mark-all { background: none; border: none; cursor: pointer; font-size: 11px; color: var(--primary); font-weight: 700; padding: 2px 6px; border-radius: 4px; }
    .mark-all:hover { background: var(--primary-soft, #e8f0fe); }
    .notif-row { display: flex; gap: 10px; padding: 10px 14px; border-bottom: 1px solid var(--border); cursor: pointer; transition: background .12s; }
    .notif-row:last-child { border-bottom: none; }
    .notif-row:hover { background: var(--surface-2); }
    .notif-row.unread { background: var(--primary-soft, #e8f0fe); }
    .notif-row.unread:hover { background: color-mix(in srgb, var(--primary-soft,#e8f0fe) 80%, var(--surface-2)); }
    .notif-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--primary); flex-shrink: 0; margin-top: 5px; }
    .notif-dot.read { background: transparent; }
    .notif-body { flex: 1; min-width: 0; }
    .notif-title { font-size: 12.5px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .notif-text { font-size: 11.5px; color: var(--muted); margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .notif-meta { font-size: 10.5px; color: var(--muted); margin-top: 3px; }
    .empty { padding: 28px 14px; text-align: center; color: var(--muted); font-size: 13px; }
  `],
  template: `
    <button class="bell-btn" (click)="toggle()" [title]="'Notifications'">
      <ic name="bell" [size]="20" [sw]="1.8"></ic>
      @if (unread() > 0) {
        <span class="badge">{{ unread() > 99 ? '99+' : unread() }}</span>
      }
    </button>
    @if (open()) {
      <div class="dropdown">
        <div class="drop-head">
          <h4>Notifications</h4>
          @if (unread() > 0) {
            <button class="mark-all" (click)="markAll()">Tout lire</button>
          }
        </div>
        @if (loading() && !notifs().length) {
          <div class="empty">Chargement…</div>
        } @else if (!notifs().length) {
          <div class="empty">Aucune notification</div>
        } @else {
          @for (n of notifs(); track n.id) {
            <div class="notif-row" [class.unread]="!n.read" (click)="markOne(n)">
              <div class="notif-dot" [class.read]="n.read"></div>
              <div class="notif-body">
                <div class="notif-title">{{ n.title }}</div>
                @if (n.body) { <div class="notif-text">{{ n.body }}</div> }
                <div class="notif-meta">{{ n.senderName }} · {{ fmtDate(n.createdAt) }}</div>
              </div>
            </div>
          }
        }
      </div>
    }
  `,
})
export class NotifBellComponent implements OnInit, OnDestroy {
  private api = inject(Api);

  open = signal(false);
  unread = signal(0);
  notifs = signal<AppNotification[]>([]);
  loading = signal(false);

  private pollTimer: ReturnType<typeof setInterval> | null = null;

  ngOnInit() {
    this.pollCount();
    this.pollTimer = setInterval(() => this.pollCount(), POLL_MS);
    document.addEventListener('click', this.onDocClick, true);
  }

  ngOnDestroy() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    document.removeEventListener('click', this.onDocClick, true);
  }

  private pollCount() {
    this.api.unreadCount().subscribe({ next: (r) => this.unread.set(r.count), error: () => {} });
  }

  toggle() {
    const next = !this.open();
    this.open.set(next);
    if (next) this.loadAll();
  }

  private loadAll() {
    this.loading.set(true);
    this.api.myNotifications().subscribe({
      next: (list) => { this.notifs.set(list); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  markOne(n: AppNotification) {
    if (n.read) return;
    this.api.markNotificationRead(n.id).subscribe({
      next: () => {
        this.notifs.update((list) => list.map((x) => x.id === n.id ? { ...x, read: true } : x));
        this.unread.update((c) => Math.max(0, c - 1));
      },
      error: () => {},
    });
  }

  markAll() {
    this.api.markAllNotificationsRead().subscribe({
      next: () => {
        this.notifs.update((list) => list.map((n) => ({ ...n, read: true })));
        this.unread.set(0);
      },
      error: () => {},
    });
  }

  fmtDate(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  }

  private onDocClick = (e: MouseEvent) => {
    if (!this.open()) return;
    const host = (e.target as HTMLElement).closest('notif-bell');
    if (!host) this.open.set(false);
  };
}
