import { describe, expect, it } from "vitest";
import { PerspectiveCamera, Vector3 } from "three";
import {
  FigureLayer,
  declutter,
  figureLook,
  shirtColor,
  shrinkBox,
  stanceColor,
  type Box,
  type FigureSpec,
} from "./figures";
import { focusStep } from "./geo";

const overlap = (a: Box, b: Box) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;

describe("declutter", () => {
  it("keeps clear figures whole, and makes the less important of two collide give way", () => {
    const layout = declutter([
      { id: "a", box: { x0: 0, y0: 0, x1: 10, y1: 20 }, priority: 2 },
      { id: "b", box: { x0: 4, y0: 2, x1: 14, y1: 22 }, priority: 1 },
      { id: "c", box: { x0: 100, y0: 0, x1: 110, y1: 20 }, priority: 0 },
    ]);
    expect(layout.get("a")).toBe(1);
    expect(layout.get("b")).toBeLessThan(1);
    expect(layout.get("c")).toBe(1);
  });

  it("never leaves two placed figures overlapping, whatever the crowd", () => {
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let round = 0; round < 50; round++) {
      const items = Array.from({ length: 60 }, (_, i) => {
        const x = rand() * 300, y = rand() * 200, h = 18 + rand() * 12;
        return { id: String(i), box: { x0: x, y0: y - h, x1: x + h * 0.54, y1: y }, priority: rand() };
      });
      const layout = declutter(items, 0.74, 0);
      const placed = items
        .filter((it) => (layout.get(it.id) ?? 0) > 0)
        .map((it) => shrinkBox(it.box, layout.get(it.id)!));
      for (let i = 0; i < placed.length; i++)
        for (let j = i + 1; j < placed.length; j++) expect(overlap(placed[i], placed[j])).toBe(false);
    }
  });

  it("shrinks toward the feet, so a smaller figure still stands on its spot", () => {
    const b = shrinkBox({ x0: 10, y0: 0, x1: 20, y1: 40 }, 0.5);
    expect(b.y1).toBe(40);
    expect((b.x0 + b.x1) / 2).toBe(15);
    expect(b.y1 - b.y0).toBe(20);
  });
});

describe("colours and looks", () => {
  it("dresses the stance in the app's red, amber and green, and grey before an answer", () => {
    expect(stanceColor(-1)).toBe("#e5534b");
    expect(stanceColor(0)).toBe("#d9a441");
    expect(stanceColor(1)).toBe("#3fb950");
    expect(shirtColor(undefined)).toBe("#6c7891");
  });

  it("gives a person the same skin and hair every time, so globe and call card agree", () => {
    expect(figureLook("p42")).toEqual(figureLook("p42"));
    const looks = new Set(Array.from({ length: 40 }, (_, i) => figureLook(`p${i}`).skin));
    expect(looks.size).toBeGreaterThan(4);
  });
});

describe("the figure layer", () => {
  const camera = () => {
    const cam = new PerspectiveCamera(45, 1, 0.1, 100);
    let pos = new Vector3(0, 1.4, 6);
    for (let i = 0; i < 300; i++) pos = focusStep(pos, 45, -75);
    cam.position.copy(pos);
    cam.lookAt(0, 0, 0);
    cam.updateMatrixWorld();
    return cam;
  };

  // A crowd round New York, dense on purpose, plus someone on the far side.
  const crowd: FigureSpec[] = Array.from({ length: 40 }, (_, i) => ({
    id: `p${i}`,
    kind: i % 2 ? "girl" : "boy",
    lat: 40.7 + Math.sin(i * 2.4) * (1 + i * 0.2),
    lon: -74 + Math.cos(i * 2.4) * (1 + i * 0.2),
    color: "#6c7891",
    weight: 0.5,
    active: false,
  }));
  const antipode: FigureSpec = { ...crowd[0], id: "far", lat: -40.7, lon: 106 };

  it("stands nobody on anybody, and nobody from the far side of the world", () => {
    const layer = new FigureLayer();
    const cam = camera();
    layer.sync([...crowd, antipode], 0);
    for (let t = 0; t < 120; t++) layer.update(t * 16, cam, 900, 900, 1);

    const shown = layer.snapshot().filter((f) => f.shown > 0.6);
    expect(shown.length).toBeGreaterThan(10);
    expect(shown.find((f) => f.id === "far")).toBeUndefined();
    for (let i = 0; i < shown.length; i++)
      for (let j = i + 1; j < shown.length; j++) expect(overlap(shown[i].box, shown[j].box)).toBe(false);
    layer.dispose();
  });

  it("waves when clicked, and a click lands on the person under the pointer", () => {
    const layer = new FigureLayer();
    const cam = camera();
    layer.sync(crowd, 0);
    for (let t = 0; t < 120; t++) layer.update(t * 16, cam, 900, 900, 1);

    const someone = layer.snapshot().find((f) => f.shown > 0.9)!;
    const hit = layer.pick((someone.box.x0 + someone.box.x1) / 2, (someone.box.y0 + someone.box.y1) / 2);
    expect(hit).toBe(someone.id);
    expect(layer.pick(-50, -50)).toBeNull();

    layer.wave(someone.id, performance.now());
    expect(layer.snapshot().find((f) => f.id === someone.id)!.waving).toBe(true);
    layer.dispose();
  });
});
