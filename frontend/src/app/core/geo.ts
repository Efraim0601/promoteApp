import { Injectable } from '@angular/core';

/** A browser GPS fix. */
export interface GeoFix {
  lat: number;
  lng: number;
  accuracy: number;   // radius in metres
}

/**
 * Thin, best-effort wrapper over the browser Geolocation API. Every call resolves — it never
 * rejects — returning `null` when the permission is denied, geolocation is unavailable, or no fix
 * is obtained in time. Callers treat a position as a bonus, never a requirement.
 */
@Injectable({ providedIn: 'root' })
export class Geo {
  /** Resolve the current position, or `null` if it can't be obtained within {@code timeoutMs}. */
  current(timeoutMs = 8000): Promise<GeoFix | null> {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return Promise.resolve(null);
    return new Promise((resolve) => {
      let done = false;
      const finish = (v: GeoFix | null) => { if (!done) { done = true; resolve(v); } };
      navigator.geolocation.getCurrentPosition(
        (p) => finish({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
        () => finish(null),
        { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 60000 },
      );
    });
  }
}
