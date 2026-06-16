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
    :host { position: relative; display: inline-flex; align-items: center; }

    /* ── Bell button ── */
    .bell-btn {
      position: relative; background: none; border: none; padding: 7px;
      cursor: pointer; color: inherit; display: inline-flex; align-items: center;
      border-radius: 8px; transition: background .15s;
    }
    .bell-btn:hover { background: rgba(0,0,0,.07); }
    .unread-badge {
      position: absolute; top: 1px; right: 1px;
      min-width: 17px; height: 17px; border-radius: 99px;
      background: #e53935; color: #fff;
      font-size: 9px; font-weight: 800;
      display: flex; align-items: center; justify-content: center;
      padding: 0 3px; pointer-events: none; line-height: 1;
      border: 2px solid var(--surface, #fff);
    }

    /* ── Dropdown ── */
    .dropdown {
      position: absolute; top: calc(100% + 8px); right: -8px;
      width: 340px; max-height: 460px;
      background: var(--surface, #fff);
      border: 1px solid var(--border, #e5e7eb);
      border-radius: 14px;
      box-shadow: 0 12px 32px rgba(0,0,0,.16);
      z-index: 1000;
      display: flex; flex-direction: column;
      overflow: hidden;
    }
    .drop-head {
      display: flex; align-items: center; gap: 8px;
      padding: 12px 16px 10px; border-bottom: 1px solid var(--border, #e5e7eb);
      flex-shrink: 0;
    }
    .drop-title { margin: 0; font-size: 14px; font-weight: 800; flex: 1; }
    .drop-badge {
      background: #e53935; color: #fff; font-size: 10px; font-weight: 800;
      border-radius: 99px; padding: 1px 7px; line-height: 18px;
    }
    .mark-all-btn {
      background: none; border: none; cursor: pointer;
      font-size: 11.5px; color: var(--primary, #2563eb); font-weight: 700;
      padding: 4px 8px; border-radius: 6px; transition: background .12s;
    }
    .mark-all-btn:hover { background: var(--primary-soft, #eff6ff); }

    /* ── List ── */
    .drop-list { overflow-y: auto; flex: 1; }
    .empty-state {
      padding: 36px 16px; text-align: center;
      color: var(--muted, #9ca3af); font-size: 13.5px;
    }
    .empty-state ic { display: block; margin: 0 auto 10px; opacity: .35; }

    /* ── Notification row ── */
    .notif-row {
      display: flex; align-items: flex-start; gap: 11px;
      padding: 11px 16px; cursor: pointer;
      border-bottom: 1px solid var(--border, #e5e7eb);
      transition: background .12s; position: relative;
    }
    .notif-row:last-child { border-bottom: none; }
    .notif-row:hover { background: var(--surface-2, #f9fafb); }
    .notif-row.unread { background: #eff6ff; }
    .notif-row.unread:hover { background: #dbeafe; }

    .dot-wrap { padding-top: 4px; flex-shrink: 0; }
    .unread-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--primary, #2563eb); }
    .read-dot { width: 8px; height: 8px; }

    .row-content { flex: 1; min-width: 0; }
    .row-title {
      font-size: 13px; font-weight: 700;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      color: var(--text, #111827);
    }
    .notif-row.unread .row-title { color: var(--primary, #1d4ed8); }
    .row-body {
      font-size: 12px; color: var(--muted, #6b7280);
      margin-top: 2px; line-height: 1.45;
      display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .row-meta {
      display: flex; align-items: center; gap: 6px;
      font-size: 10.5px; color: var(--muted, #9ca3af);
      margin-top: 4px; font-weight: 500;
    }
    .img-chip {
      display: inline-flex; align-items: center; gap: 3px;
      background: var(--surface-2, #f3f4f6); border-radius: 4px;
      padding: 1px 5px; font-size: 10px; font-weight: 700; color: var(--primary, #2563eb);
    }
    .open-hint {
      font-size: 10.5px; color: var(--primary, #2563eb); font-weight: 600;
      margin-top: 3px; opacity: .7;
    }

    /* ── Detail modal ── */
    .modal-backdrop {
      position: fixed; inset: 0; background: rgba(0,0,0,.45);
      z-index: 2000; display: flex; align-items: center; justify-content: center;
      padding: 20px;
    }
    .modal-card {
      background: var(--surface, #fff);
      border-radius: 16px;
      box-shadow: 0 20px 60px rgba(0,0,0,.22);
      width: 100%; max-width: 520px;
      max-height: 90vh; display: flex; flex-direction: column;
      overflow: hidden;
    }
    .modal-head {
      display: flex; align-items: flex-start; gap: 10px;
      padding: 18px 20px 14px; border-bottom: 1px solid var(--border, #e5e7eb);
    }
    .modal-title { font-size: 17px; font-weight: 800; line-height: 1.3; flex: 1; }
    .modal-close {
      background: var(--surface-2, #f3f4f6); border: none;
      border-radius: 8px; padding: 6px; cursor: pointer;
      display: flex; align-items: center; flex-shrink: 0;
      transition: background .12s; color: var(--muted, #6b7280);
    }
    .modal-close:hover { background: var(--border, #e5e7eb); color: var(--text, #111); }
    .modal-body { padding: 16px 20px; overflow-y: auto; flex: 1; }
    .modal-text {
      font-size: 14px; line-height: 1.6; color: var(--text, #1f2937);
      white-space: pre-wrap; word-break: break-word;
    }
    .modal-img-wrap { margin-top: 14px; border-radius: 10px; overflow: hidden; cursor: zoom-in; }
    .modal-img { width: 100%; display: block; border-radius: 10px; }
    .modal-foot {
      padding: 12px 20px; border-top: 1px solid var(--border, #e5e7eb);
      display: flex; align-items: center; gap: 8px;
      font-size: 11.5px; color: var(--muted, #9ca3af); flex-shrink: 0;
    }
    .sender-chip {
      background: var(--surface-2, #f3f4f6);
      border-radius: 6px; padding: 3px 8px;
      font-weight: 700; font-size: 11.5px; color: var(--text, #374151);
    }
  `],
  template: `
    <!-- Bell button -->
    <button class="bell-btn" (click)="toggle()" title="Notifications">
      <ic name="bell" [size]="20" [sw]="1.8"></ic>
      @if (unread() > 0) {
        <span class="unread-badge">{{ unread() > 99 ? '99+' : unread() }}</span>
      }
    </button>

    <!-- Dropdown list -->
    @if (open()) {
      <div class="dropdown">
        <div class="drop-head">
          <h4 class="drop-title">Notifications</h4>
          @if (unread() > 0) {
            <span class="drop-badge">{{ unread() }} non lue{{ unread() > 1 ? 's' : '' }}</span>
            <button class="mark-all-btn" (click)="markAll(); $event.stopPropagation()">Tout lire</button>
          }
        </div>
        <div class="drop-list">
          @if (loading() && !notifs().length) {
            <div class="empty-state"><ic name="refresh" [size]="28"></ic>Chargement…</div>
          } @else if (!notifs().length) {
            <div class="empty-state"><ic name="bell" [size]="28"></ic>Aucune notification</div>
          } @else {
            @for (n of notifs(); track n.id) {
              <div class="notif-row" [class.unread]="!n.read" (click)="openDetail(n); $event.stopPropagation()">
                <div class="dot-wrap">
                  @if (!n.read) { <div class="unread-dot"></div> } @else { <div class="read-dot"></div> }
                </div>
                <div class="row-content">
                  <div class="row-title">{{ n.title }}</div>
                  @if (n.body) { <div class="row-body">{{ n.body }}</div> }
                  <div class="row-meta">
                    <span>{{ n.senderName }}</span>
                    <span>·</span>
                    <span>{{ fmtDate(n.createdAt) }}</span>
                    @if (n.imageData) {
                      <span class="img-chip"><ic name="camera" [size]="10"></ic> image</span>
                    }
                  </div>
                  <div class="open-hint">Cliquer pour ouvrir →</div>
                </div>
              </div>
            }
          }
        </div>
      </div>
    }

    <!-- Detail modal -->
    @if (selected()) {
      <div class="modal-backdrop" (click)="closeDetail()">
        <div class="modal-card" (click)="$event.stopPropagation()">
          <div class="modal-head">
            <div class="modal-title">{{ selected()!.title }}</div>
            <button class="modal-close" (click)="closeDetail()"><ic name="x" [size]="18" [sw]="2"></ic></button>
          </div>
          <div class="modal-body">
            @if (selected()!.body) {
              <div class="modal-text">{{ selected()!.body }}</div>
            }
            @if (selected()!.imageData) {
              <div class="modal-img-wrap" (click)="openImageFullscreen(selected()!.imageData!)">
                <img class="modal-img" [src]="selected()!.imageData!" alt="Image de la notification" />
              </div>
            }
          </div>
          <div class="modal-foot">
            <span class="sender-chip">{{ selected()!.senderName }}</span>
            <span>{{ fmtDateLong(selected()!.createdAt) }}</span>
            @if (selected()!.imageData) {
              <button class="mark-all-btn" style="margin-left:auto" (click)="openImageFullscreen(selected()!.imageData!)">
                <ic name="eye" [size]="13"></ic> Ouvrir l&#x2019;image
              </button>
            }
          </div>
        </div>
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
  selected = signal<AppNotification | null>(null);

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

  openDetail(n: AppNotification) {
    this.selected.set(n);
    this.open.set(false);
    if (!n.read) {
      this.api.markNotificationRead(n.id).subscribe({
        next: () => {
          this.notifs.update((list) => list.map((x) => x.id === n.id ? { ...x, read: true } : x));
          this.unread.update((c) => Math.max(0, c - 1));
          this.selected.update((s) => s ? { ...s, read: true } : s);
        },
        error: () => {},
      });
    }
  }

  closeDetail() { this.selected.set(null); }

  markAll() {
    this.api.markAllNotificationsRead().subscribe({
      next: () => {
        this.notifs.update((list) => list.map((n) => ({ ...n, read: true })));
        this.unread.set(0);
      },
      error: () => {},
    });
  }

  openImageFullscreen(dataUri: string) {
    const w = window.open('', '_blank');
    if (w) {
      w.document.write(`<!DOCTYPE html><html><body style="margin:0;background:#000;display:flex;align-items:center;justify-content:center;min-height:100vh"><img src="${dataUri}" style="max-width:100%;max-height:100vh;object-fit:contain"></body></html>`);
      w.document.close();
    }
  }

  fmtDate(iso: string): string {
    const d = new Date(iso);
    const now = new Date();
    const diffH = (now.getTime() - d.getTime()) / 3_600_000;
    if (diffH < 1) return `il y a ${Math.round(diffH * 60)} min`;
    if (diffH < 24) return `il y a ${Math.round(diffH)}h`;
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
  }

  fmtDateLong(iso: string): string {
    return new Date(iso).toLocaleDateString('fr-FR', {
      weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  }

  private onDocClick = (e: MouseEvent) => {
    if (this.selected()) return;
    if (!this.open()) return;
    const host = (e.target as HTMLElement).closest('notif-bell');
    if (!host) this.open.set(false);
  };
}
