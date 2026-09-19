import { Spherical, Vector3 } from "three";

// Pure globe maths, kept out of the component so it can be tested without a
// WebGL context — the render loop never runs in a backgrounded tab, so a test
// is the only reliable way to know the focus actually lands.

export const RADIUS = 2;

/** Longitude is negated. Without it the globe renders mirrored — every
 *  hand-rolled three.js globe hits this once. */
export function latLonToVector3(lat: number, lon: number, radius: number): Vector3 {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((-lon + 180) * Math.PI) / 180;
  return new Vector3(
    radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

/** Signed delta taking the short way round, so easing never unwinds the long
 *  way through 350 degrees. */
export function shortestTurn(from: number, to: number): number {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export type LatLon = { lat: number; lon: number };

/** Evenly spread points over a sphere — a Fibonacci lattice, in degrees. */
export function fibonacciSphere(n: number): LatLon[] {
  const golden = Math.PI * (3 - Math.sqrt(5));
  const out: LatLon[] = [];
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2;
    out.push({
      lat: (Math.asin(y) * 180) / Math.PI,
      lon: ((((i * golden * 180) / Math.PI) % 360) + 360) % 360 - 180,
    });
  }
  return out;
}

type Ring = [number, number][];

/**
 * A land test built from the coastline rings ([lon, lat], closed). Bounding
 * boxes first, so the full ray-cast only runs for the few rings that could
 * possibly contain the point.
 */
export function landTest(rings: Ring[]): (p: LatLon) => boolean {
  const boxes = rings.map((ring) => {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const [x, y] of ring) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    return { ring, minX, maxX, minY, maxY };
  });

  return ({ lat, lon }) =>
    boxes.some(
      (b) =>
        lon >= b.minX && lon <= b.maxX && lat >= b.minY && lat <= b.maxY && inside(b.ring, lon, lat)
    );
}

function inside(ring: Ring, x: number, y: number): boolean {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/**
 * A great-circle arc lifted off the surface, highest in the middle. Longer
 * arcs fly higher, capped so a trip to Sydney stays inside the frame.
 */
export function arcPoints(from: LatLon, to: LatLon, segments = 48): Vector3[] {
  const a = latLonToVector3(from.lat, from.lon, 1);
  const b = latLonToVector3(to.lat, to.lon, 1);
  const theta = a.angleTo(b);
  const lift = Math.min(0.45, 0.08 + theta * 0.18);
  const s = Math.sin(theta);

  const points: Vector3[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const dir =
      theta < 1e-6
        ? a.clone()
        : a
            .clone()
            .multiplyScalar(Math.sin((1 - t) * theta) / s)
            .add(b.clone().multiplyScalar(Math.sin(t * theta) / s));
    points.push(dir.setLength(RADIUS * (1.01 + Math.sin(Math.PI * t) * lift)));
  }
  return points;
}

/**
 * One frame of easing the camera round until a coordinate faces it. The camera
 * orbits and the globe stays still, at the camera's current distance.
 *
 * This replaced rotating the globe itself. With Euler order YXZ, that version
 * tilted by latitude about the world X axis before spinning by longitude, which
 * is only correct near 90°E — San Francisco came to rest near the top edge
 * instead of facing the viewer.
 */
export function focusStep(camera: Vector3, lat: number, lon: number, ease = 0.06): Vector3 {
  const target = new Spherical().setFromVector3(latLonToVector3(lat, lon, 1));
  const now = new Spherical().setFromVector3(camera);
  now.theta += shortestTurn(now.theta, target.theta) * ease;
  now.phi += (target.phi - now.phi) * ease;
  return new Vector3().setFromSpherical(now);
}
