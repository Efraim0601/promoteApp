import { Injectable } from '@angular/core';

/** One detected face, in normalised video coordinates (0..1, NOT mirrored). */
export interface FaceDetection {
  /** All face landmarks (≈478 points) as normalised {x,y}. */
  points: { x: number; y: number }[];
  /** Bounding box of the face, normalised. */
  box: { x: number; y: number; w: number; h: number };
  /** Centre of the box, normalised. */
  cx: number;
  cy: number;
  /** Face height as a fraction of the frame height (how big the head is). */
  fill: number;
}

/**
 * Thin wrapper around MediaPipe FaceLandmarker (Tasks Vision), used to (a) prove a real human
 * head is in frame before a selfie is accepted and (b) drive auto-capture once the face is well
 * placed. The model + WASM runtime are self-hosted under `/mediapipe` (no external CDN).
 *
 * Everything is best-effort: if the model/WASM/WebGL can't load (old device, offline first run),
 * {@link ready} resolves to false and the caller falls back to plain manual capture.
 */
@Injectable({ providedIn: 'root' })
export class FaceMesh {
  private landmarker: any | null = null;
  private initPromise: Promise<boolean> | null = null;

  /** Lazily load the model once. Resolves true when detection is usable, false on any failure. */
  ready(): Promise<boolean> {
    if (this.initPromise) return this.initPromise;
    this.initPromise = this.init();
    return this.initPromise;
  }

  private async init(): Promise<boolean> {
    try {
      // Dynamic import: the ~heavy MediaPipe bundle is only fetched when smart capture is actually used.
      const vision = await import('@mediapipe/tasks-vision');
      const fileset = await vision.FilesetResolver.forVisionTasks('/mediapipe/wasm');
      this.landmarker = await vision.FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: '/mediapipe/face_landmarker.task', delegate: 'GPU' },
        runningMode: 'VIDEO',
        numFaces: 1,
      });
      return true;
    } catch (e) {
      console.warn('[face-mesh] disabled — could not initialise FaceLandmarker', e);
      this.landmarker = null;
      return false;
    }
  }

  /**
   * Detect faces in the current video frame. `tsMs` must be a monotonically increasing timestamp
   * (e.g. performance.now()); MediaPipe rejects a repeated timestamp, so call this at most once per
   * frame. Returns the number of faces and the primary (first) one with its geometry, or null.
   */
  detect(video: HTMLVideoElement, tsMs: number): { count: number; face: FaceDetection | null } {
    if (!this.landmarker || !video.videoWidth) return { count: 0, face: null };
    let res: any;
    try {
      res = this.landmarker.detectForVideo(video, tsMs);
    } catch {
      return { count: 0, face: null };
    }
    const faces = res?.faceLandmarks;
    if (!faces || faces.length === 0) return { count: 0, face: null };

    const lm = faces[0] as { x: number; y: number }[];
    let minX = 1, minY = 1, maxX = 0, maxY = 0;
    const points = new Array(lm.length);
    for (let i = 0; i < lm.length; i++) {
      const x = lm[i].x, y = lm[i].y;
      points[i] = { x, y };
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    const w = Math.max(0, maxX - minX), h = Math.max(0, maxY - minY);
    return {
      count: faces.length,
      face: { points, box: { x: minX, y: minY, w, h }, cx: minX + w / 2, cy: minY + h / 2, fill: h },
    };
  }
}
