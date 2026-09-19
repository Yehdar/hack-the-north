import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Vector3 } from "three";
import { HUB_POINTS } from "@/data/globePoints";
import { RADIUS, arcPoints, fibonacciSphere, focusStep, landTest, latLonToVector3 } from "./geo";

describe("dotted land", () => {
  const rings = JSON.parse(
    readFileSync(join(process.cwd(), "public", "continents.json"), "utf8")
  ) as [number, number][][];
  const isLand = landTest(rings);

  it("puts every hub on land and open ocean in the water", () => {
    for (const hub of HUB_POINTS) {
      // Coastal cities sit on the edge of a 110m coastline, so nudge inland
      // is not reliable; accept either the city or a point a degree away.
      const near = [0, 1, -1].some((d) => isLand({ lat: hub.lat + d, lon: hub.lon }) || isLand({ lat: hub.lat, lon: hub.lon + d }));
      expect(near, hub.id).toBe(true);
    }
    expect(isLand({ lat: 30, lon: -40 })).toBe(false); // mid-Atlantic
    expect(isLand({ lat: 0, lon: -150 })).toBe(false); // mid-Pacific
    expect(isLand({ lat: 23, lon: 13 })).toBe(true); // Sahara
  });

  it("covers roughly the share of the planet that is land", () => {
    const points = fibonacciSphere(4000);
    const share = points.filter(isLand).length / points.length;
    expect(share).toBeGreaterThan(0.22);
    expect(share).toBeLessThan(0.36);
  });
});

describe("arcs", () => {
  it("start and end on the cities and never dip into the globe", () => {
    const waterloo = { lat: 43.46, lon: -80.52 };
    const sydney = { lat: -33.87, lon: 151.21 };
    const points = arcPoints(waterloo, sydney);

    expect(points[0].distanceTo(latLonToVector3(waterloo.lat, waterloo.lon, RADIUS * 1.01))).toBeLessThan(1e-6);
    expect(points.at(-1)!.distanceTo(latLonToVector3(sydney.lat, sydney.lon, RADIUS * 1.01))).toBeLessThan(1e-6);
    for (const p of points) expect(p.length()).toBeGreaterThanOrEqual(RADIUS);
  });
});

const START = new Vector3(0, 1.4, 6);

function settle(camera: Vector3, lat: number, lon: number, frames = 240) {
  let c = camera.clone();
  for (let i = 0; i < frames; i++) c = focusStep(c, lat, lon);
  return c;
}

describe("globe focus", () => {
  it("brings every hub round to face the camera", () => {
    for (const hub of HUB_POINTS) {
      // Drift the camera first, the way autoRotate does before a focus lands.
      const drifted = START.clone().applyAxisAngle(new Vector3(0, 1, 0), 2.1);
      const camera = settle(drifted, hub.lat, hub.lon);
      const facing = latLonToVector3(hub.lat, hub.lon, 1).normalize();

      expect(camera.clone().normalize().dot(facing), hub.id).toBeGreaterThan(0.995);
    }
  });

  it("keeps the camera at the same distance", () => {
    const camera = settle(START, 6.52, 3.38); // Lagos
    expect(camera.length()).toBeCloseTo(START.length(), 6);
  });

  it("takes the short way round", () => {
    // Tokyo from a camera sitting just past it: the first step must move
    // toward it by a small angle, not unwind most of a full turn.
    const tokyo = latLonToVector3(35.68, 139.69, 1);
    const nearby = tokyo.clone().applyAxisAngle(new Vector3(0, 1, 0), 0.3).setLength(START.length());
    const step = focusStep(nearby, 35.68, 139.69);
    expect(step.angleTo(nearby)).toBeLessThan(0.3 * 0.06 + 1e-6);
  });
});
