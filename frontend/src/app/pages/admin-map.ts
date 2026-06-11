import { AfterViewInit, Component, ElementRef, OnDestroy, inject, signal, viewChild } from '@angular/core';
import * as L from 'leaflet';
import { Api } from '../core/api';
import { I18n } from '../core/i18n';
import { MapPoint } from '../core/models';
import { IconComponent } from '../shared/icon';
import { SpinnerComponent } from '../shared/spinner';

const CLIENT_COLOR = '#D81E2C';   // brand red — subscriptions
const STAFF_COLOR = '#2563eb';    // blue — staff
const GEO_CACHE_KEY = 'promote.geocache';   // persisted city → coordinate lookups
const NOMINATIM_GAP_MS = 1100;              // ≥1 req/s, per Nominatim's usage policy

type Coord = { lat: number; lng: number };

/**
 * Admin map (Leaflet + OpenStreetMap). Plots every client and staff member:
 *  - records with a GPS fix → an exact, solid marker;
 *  - records without a fix → an *approximate* marker, the locality (city / agency) forward-geocoded
 *    to a coarse position (city-level lookups are cached + throttled to respect Nominatim limits);
 *  - records with no usable location at all are counted but not plotted.
 */
@Component({
  selector: 'admin-map',
  standalone: true,
  imports: [IconComponent, SpinnerComponent],
  template: `
  <div style="display:flex;flex-direction:column;gap:12px">
    <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
      <span style="display:inline-flex;align-items:center;gap:7px;font-size:13px">
        <span style="width:12px;height:12px;border-radius:50%;background:${CLIENT_COLOR};display:inline-block"></span>
        {{ i18n.t('map_legend_clients') }} ({{ clientCount() }})
      </span>
      <span style="display:inline-flex;align-items:center;gap:7px;font-size:13px">
        <span style="width:12px;height:12px;border-radius:50%;background:${STAFF_COLOR};display:inline-block"></span>
        {{ i18n.t('map_legend_staff') }} ({{ staffCount() }})
      </span>
      <span style="display:inline-flex;align-items:center;gap:7px;font-size:13px" [title]="i18n.t('map_approx_hint')">
        <span style="width:12px;height:12px;border-radius:50%;background:transparent;border:1.5px dashed var(--muted);display:inline-block"></span>
        {{ i18n.t('map_legend_approx') }} ({{ approxCount() }})
      </span>
      @if (unlocatedCount()) {
        <span class="muted" style="font-size:12.5px" [title]="i18n.t('map_unlocated_hint')">
          {{ i18n.t('map_unlocated') }}: {{ unlocatedCount() }}
        </span>
      }
      <button class="btn btn-outline" (click)="reload()" [disabled]="loading()"
              style="margin-left:auto;padding:7px 12px;font-size:13px">
        <ic name="refresh" [size]="15"></ic> {{ i18n.t('map_reload') }}
      </button>
    </div>

    @if (empty() && !loading()) {
      <p class="muted" style="font-size:13.5px">{{ i18n.t('map_empty') }}</p>
    }

    <div style="position:relative;border:1px solid var(--border);border-radius:14px;overflow:hidden">
      <div #map style="height:540px;width:100%;background:#e9eef2"></div>
      @if (loading()) {
        <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:color-mix(in srgb,var(--surface) 60%,transparent)">
          <spinner></spinner>
        </div>
      }
      @if (geocoding()) {
        <div class="muted" style="position:absolute;left:10px;bottom:10px;background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:5px 9px;font-size:11.5px;display:flex;align-items:center;gap:6px">
          <spinner [size]="12"></spinner> {{ i18n.t('map_locating') }}
        </div>
      }
    </div>
  </div>`,
})
export class AdminMapComponent implements AfterViewInit, OnDestroy {
  i18n = inject(I18n);
  private api = inject(Api);

  private mapEl = viewChild.required<ElementRef<HTMLDivElement>>('map');
  private map: L.Map | null = null;
  private layer: L.LayerGroup | null = null;

  loading = signal(true);
  geocoding = signal(false);
  clientCount = signal(0);
  staffCount = signal(0);
  approxCount = signal(0);
  unlocatedCount = signal(0);
  empty = signal(false);

  /** Reverse-geocoded addresses for exact points, keyed by rounded coordinate. `undefined` = not yet
   *  fetched, `''` = fetched but none found (avoids re-querying). */
  private addrCache = new Map<string, string>();
  /** Forward-geocoded city/agency → coordinate, persisted across sessions to spare Nominatim. */
  private geoCache = this.loadGeoCache();
  /** Serialises forward-geocode calls so they stay under the rate limit. */
  private geoQueue: Promise<unknown> = Promise.resolve();
  /** Incremented on each render so stale async callbacks (from a prior reload) bail out. */
  private renderId = 0;

  ngAfterViewInit() {
    this.map = L.map(this.mapEl().nativeElement, { center: [4.6, 12.5], zoom: 6 });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap',
    }).addTo(this.map);
    this.layer = L.layerGroup().addTo(this.map);
    this.reload();
  }

  ngOnDestroy() {
    this.renderId++;          // invalidate any in-flight geocoding callbacks
    this.map?.remove();
    this.map = null;
  }

  reload() {
    if (!this.map) return;
    this.loading.set(true);
    this.api.mapPoints().subscribe({
      next: (pts) => { this.render(pts); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  private render(pts: MapPoint[]) {
    const rid = ++this.renderId;
    this.layer?.clearLayers();

    this.clientCount.set(pts.filter((p) => p.type === 'client').length);
    this.staffCount.set(pts.filter((p) => p.type === 'staff').length);

    const exact = pts.filter((p) => p.lat != null && p.lng != null);
    const needsGeo = pts.filter((p) => (p.lat == null || p.lng == null) && !!p.place);
    const unlocated = pts.filter((p) => (p.lat == null || p.lng == null) && !p.place);

    this.approxCount.set(needsGeo.length);
    this.unlocatedCount.set(unlocated.length);
    this.empty.set(exact.length === 0 && needsGeo.length === 0);

    // 1) Plot exact points right away and frame them.
    const bounds: L.LatLngExpression[] = [];
    for (const p of exact) {
      this.addMarker(p, { lat: p.lat!, lng: p.lng! }, false);
      bounds.push([p.lat!, p.lng!]);
    }
    if (bounds.length) this.map!.fitBounds(L.latLngBounds(bounds).pad(0.2), { maxZoom: 14 });

    // 2) Geocode the distinct localities of the no-GPS records, then drop their approximate pins.
    const groups = new Map<string, MapPoint[]>();
    for (const p of needsGeo) {
      const key = p.place!.trim().toLowerCase();
      (groups.get(key) ?? groups.set(key, []).get(key)!).push(p);
    }
    if (!groups.size) return;

    this.geocoding.set(true);
    const approxBounds: L.LatLngExpression[] = [];
    const jobs = [...groups.values()].map((members) =>
      this.geocodeCity(members[0].place!).then((coord) => {
        if (rid !== this.renderId || !this.map || !coord) return;   // stale render or no match
        for (const p of members) {
          const [dLat, dLng] = this.jitter(p.ref);
          const at = { lat: coord.lat + dLat, lng: coord.lng + dLng };
          this.addMarker(p, at, true);
          approxBounds.push([at.lat, at.lng]);
        }
      }),
    );
    Promise.allSettled(jobs).then(() => {
      if (rid !== this.renderId) return;
      this.geocoding.set(false);
      // If nothing had an exact fix, frame the approximate pins so the map isn't stuck on the default view.
      if (!bounds.length && approxBounds.length) {
        this.map!.fitBounds(L.latLngBounds(approxBounds).pad(0.2), { maxZoom: 12 });
      }
    });
  }

  /** Add one circle marker (solid for exact fixes, hollow/dashed for approximate ones). */
  private addMarker(p: MapPoint, at: Coord, approx: boolean) {
    const color = p.type === 'client' ? CLIENT_COLOR : STAFF_COLOR;
    const style: L.CircleMarkerOptions = approx
      ? { radius: 6, color, weight: 1.5, dashArray: '2', fillColor: color, fillOpacity: 0.28 }
      : { radius: 7, color: '#fff', weight: 2, fillColor: color, fillOpacity: 0.9 };
    const marker = L.circleMarker([at.lat, at.lng], style).addTo(this.layer!);
    marker.bindPopup(() => this.popup(p, approx, at));
    if (!approx) {
      // Reverse-geocode an exact point's street address lazily, on first open.
      marker.on('popupopen', (e) => {
        if (this.addrCache.has(this.akey(at))) return;
        this.reverseGeocode(at.lat, at.lng).then((addr) => {
          this.addrCache.set(this.akey(at), addr ?? '');
          if (this.map) (e.popup as L.Popup).setContent(this.popup(p, approx, at));
        });
      });
    }
  }

  /** Stable per-record offset (~±2 km) so many records in one city fan out instead of stacking. */
  private jitter(ref: string): [number, number] {
    let h = 0;
    for (let i = 0; i < ref.length; i++) h = (Math.imul(h, 31) + ref.charCodeAt(i)) | 0;
    const a = (h & 0xffff) / 0xffff * 2 - 1;
    const b = ((h >>> 16) & 0xffff) / 0xffff * 2 - 1;
    return [a * 0.02, b * 0.02];
  }

  /** Coordinate key (≈1 m granularity) used to cache reverse-geocoding results. */
  private akey(c: Coord): string { return `${c.lat.toFixed(5)},${c.lng.toFixed(5)}`; }

  /** Resolve a coarse coordinate for a city/agency in Cameroon. Cached (persistently) and throttled;
   *  resolves to null on no match or any failure. */
  private geocodeCity(place: string): Promise<Coord | null> {
    const key = place.trim().toLowerCase();
    if (this.geoCache.has(key)) return Promise.resolve(this.geoCache.get(key)!);
    const run = this.geoQueue.then(async () => {
      if (this.geoCache.has(key)) return;            // filled while queued
      await new Promise((r) => setTimeout(r, NOMINATIM_GAP_MS));
      const coord = await this.forwardGeocode(place);
      this.geoCache.set(key, coord);
      this.persistGeoCache();
    });
    this.geoQueue = run.catch(() => {});
    return this.geoQueue.then(() => this.geoCache.get(key) ?? null);
  }

  /** Nominatim forward search, restricted to Cameroon. */
  private async forwardGeocode(place: string): Promise<Coord | null> {
    try {
      const lang = this.i18n.lang();
      const q = encodeURIComponent(`${place}, Cameroun`);
      const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${q}&limit=1&countrycodes=cm&accept-language=${lang}`;
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) return null;
      const j = await res.json();
      if (Array.isArray(j) && j.length) return { lat: +j[0].lat, lng: +j[0].lon };
      return null;
    } catch {
      return null;
    }
  }

  /** Nominatim reverse lookup for an exact coordinate → a human-readable address. */
  private async reverseGeocode(lat: number, lng: number): Promise<string | null> {
    try {
      const lang = this.i18n.lang();
      const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=${lang}&zoom=18`;
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) return null;
      const j = await res.json();
      return typeof j?.display_name === 'string' ? j.display_name : null;
    } catch {
      return null;
    }
  }

  /** Popup HTML for a point (all interpolated text escaped). */
  private popup(p: MapPoint, approx: boolean, at: Coord): string {
    const lines: string[] = [`<strong>${esc(p.label)}</strong>`];
    if (p.type === 'client') {
      lines.push(`${this.i18n.t('map_ref')}: ${esc(p.ref)}`);
      if (p.status) lines.push(`${this.i18n.t('map_status')}: ${esc(p.status)}`);
    } else if (p.role) {
      lines.push(`${this.i18n.t('map_role')}: ${esc(p.role)}`);
    }

    if (approx) {
      // We already know the locality — no reverse geocode; flag the position as approximate.
      lines.push(`<span style="color:#334155">≈ ${esc(p.place ?? '')}</span>`);
      lines.push(`<span style="color:#b45309">${esc(this.i18n.t('map_approx'))}</span>`);
    } else {
      if (p.accuracy != null) lines.push(`${this.i18n.t('map_accuracy')}: ±${Math.round(p.accuracy)} m`);
      const addr = this.addrCache.get(this.akey(at));
      const addrLine = addr === undefined
        ? `<span style="color:#94a3b8">${esc(this.i18n.t('map_addr_loading'))}</span>`
        : addr === '' ? '' : `<span style="color:#334155">📍 ${esc(addr)}</span>`;
      if (addrLine) lines.push(addrLine);
    }
    if (p.date) lines.push(`<span style="color:#64748b">${new Date(p.date).toLocaleString()}</span>`);

    return `<div style="font-size:13px;line-height:1.5;max-width:240px">${lines.join('<br>')}</div>`;
  }

  // ---- persistent forward-geocode cache ----
  private loadGeoCache(): Map<string, Coord | null> {
    try {
      const s = localStorage.getItem(GEO_CACHE_KEY);
      if (s) return new Map(Object.entries(JSON.parse(s)));
    } catch { /* ignore corrupt cache */ }
    return new Map();
  }

  private persistGeoCache() {
    try {
      localStorage.setItem(GEO_CACHE_KEY, JSON.stringify(Object.fromEntries(this.geoCache)));
    } catch { /* quota / disabled storage — non-fatal */ }
  }
}

/** Escape user-controlled text for safe interpolation into popup HTML. */
function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
