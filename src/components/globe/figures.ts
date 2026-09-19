import * as THREE from "three";
import { RADIUS, latLonToVector3 } from "./geo";

// ============================================================================
// PEOPLE, NOT DOTS.
//
// Every person on the globe is a small figure — a girl or a boy, as their
// persona says — wearing their answer: the shirt is the same red / amber /
// green as every light in the app.
//
// They stand upright on the screen, like map pins, rather than straight out of
// the sphere: a figure standing radially faces the camera with the top of its
// head. They are drawn in a second pass over the globe, so the planet never
// cuts into one, and they are laid out in screen space every frame so no two
// ever overlap — where a crowd is too dense, the less important figure shrinks
// or steps back until the camera gives it room.
//
// Instanced: one draw call per body part for the whole crowd, so a hundred and
// twenty people cost about what the dots did.
// ============================================================================

export type FigureKind = "girl" | "boy";

export type FigureSpec = {
  id: string;
  kind: FigureKind;
  lat: number;
  lon: number;
  /** Shirt colour: the stance. */
  color: string;
  /** 0..1, attention. A little taller when fully engaged. */
  weight: number;
  /** Still waiting on this person: they bob while they think. */
  active: boolean;
  /** Size multiplier — the committee's four can stand larger than a crowd. */
  scale?: number;
};

export type Box = { x0: number; y0: number; x1: number; y1: number };
export type LayoutItem = { id: string; box: Box; priority: number };

/** Feet to crown, in world units, before per-figure scaling: about 29px on the
 *  near face of the globe at the default camera distance. Big enough that the
 *  hair and the dress read, small enough that a city's crowd still fits. */
export const FIGURE_HEIGHT = 0.11;
/** Screen width of a figure as a share of its height, arms included. */
const ASPECT = 0.54;
/** The size a crowded figure tries before stepping back. */
const SHRINK = 0.74;
// Long enough to still be waving once the globe has turned to face them.
const WAVE_MS = 2600;
const HOP_MS = 320;
/** The camera's distance from the globe's centre when the sizes above hold. */
const HOME_DISTANCE = Math.hypot(1.4, 6);
/**
 * How far figures resist the zoom: 0 would scale them with the globe, 1 would
 * pin them to one screen size. In between, they still grow as you lean in —
 * they are objects on the globe, not stickers — but stay between about 22px
 * and 38px across the whole zoom range instead of 11px to 90px.
 */
const ZOOM_RESIST = 0.7;

/**
 * Greedy screen-space layout: most important first. Each figure keeps its full
 * size if its box is clear, tries a smaller size if not, and otherwise steps
 * back (0) until the camera gives it room. Boxes shrink toward the feet, so a
 * smaller figure still stands on its own spot.
 */
export function declutter(items: LayoutItem[], shrink = SHRINK, pad = 1): Map<string, number> {
  const placed: Box[] = [];
  const out = new Map<string, number>();
  const clear = (b: Box) =>
    !placed.some(
      (p) => b.x0 < p.x1 + pad && b.x1 + pad > p.x0 && b.y0 < p.y1 + pad && b.y1 + pad > p.y0
    );

  for (const item of [...items].sort((a, b) => b.priority - a.priority)) {
    if (clear(item.box)) {
      placed.push(item.box);
      out.set(item.id, 1);
      continue;
    }
    const small = shrinkBox(item.box, shrink);
    if (clear(small)) {
      placed.push(small);
      out.set(item.id, shrink);
      continue;
    }
    out.set(item.id, 0);
  }
  return out;
}

export function shrinkBox(b: Box, k: number): Box {
  const cx = (b.x0 + b.x1) / 2;
  const w = (b.x1 - b.x0) * k;
  const h = (b.y1 - b.y0) * k;
  return { x0: cx - w / 2, x1: cx + w / 2, y0: b.y1 - h, y1: b.y1 };
}

// ---------------------------------------------------------------------------
// The figure, at unit height: feet at y = 0, crown at y ≈ 1, facing +z.

const SHOULDER = { x: 0.165, y: 0.52 };
const ARM_LENGTH = 0.265;
const ARM_REST = 0.18; // radians outward from hanging straight down
const ARM_RAISED = 2.55;

const SKIN = ["#f5d3bd", "#ecc3a4", "#e0ac86", "#c98d62", "#b0754b", "#8f5a38", "#6e4329", "#50301e"];
// Even the darkest hair is lifted off black: on the night side of the globe a
// true black head of hair vanishes, and with it the long hair that says girl.
const HAIR = ["#33251c", "#3b2a1f", "#463122", "#533826", "#654229", "#7a4f2c", "#a36f3c", "#c99b5f"];

/**
 * Stance as the same red / amber / green every light in the app uses.
 *
 * Dots used to be a blue-to-amber temperature ramp, which meant the globe and
 * the panel described the same people in two different languages. One
 * language, and it is the one everybody already reads without a legend.
 */
export function stanceColor(stance?: number): string {
  if (stance === undefined) return "#4a5468";

  const t = Math.max(0, Math.min(1, (stance + 1) / 2));
  const stop = [0xe5, 0x53, 0x4b];
  const caution = [0xd9, 0xa4, 0x41];
  const go = [0x3f, 0xb9, 0x50];

  const [from, to, local] =
    t < 0.5 ? [stop, caution, t * 2] : [caution, go, (t - 0.5) * 2];

  const channel = (i: number) =>
    Math.round(from[i] + (to[i] - from[i]) * local)
      .toString(16)
      .padStart(2, "0");

  return `#${channel(0)}${channel(1)}${channel(2)}`;
}

/** A figure's shirt: their stance, or — not heard from yet — a neutral grey a
 *  shade lighter than a dot's, so it still reads against the night side. */
export function shirtColor(stance?: number): string {
  return stance === undefined ? "#6c7891" : stanceColor(stance);
}

/** Skin and hair for a person, fixed by their id, so the figure on the globe
 *  and the one on the call card are the same person. */
export function figureLook(id: string): { skin: string; hair: string } {
  return {
    skin: SKIN[Math.floor(hash(`${id}:skin`) * SKIN.length)],
    hair: HAIR[Math.floor(hash(`${id}:hair`) * HAIR.length)],
  };
}
const PANTS = new THREE.Color("#2a3140");
const EYES = new THREE.Color("#1a1620");

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

type Figure = {
  spec: FigureSpec;
  anchor: THREE.Vector3;
  normal: THREE.Vector3;
  skin: THREE.Color;
  hair: THREE.Color;
  shirt: THREE.Color;
  shirtTarget: THREE.Color;
  restYaw: number;
  yaw: number;
  phase: number;
  /** Displayed size factor, eased toward the layout's target. */
  shown: number;
  /** The layout's last decision: 1, SHRINK or 0. */
  placed: number;
  waveAt: number;
  hopAt: number;
  /** Screen box at the displayed size, for picking. */
  box: Box | null;
};

type Parts = {
  legs: THREE.InstancedMesh;
  torsoBoy: THREE.InstancedMesh;
  torsoGirl: THREE.InstancedMesh;
  arms: THREE.InstancedMesh;
  hands: THREE.InstancedMesh;
  head: THREE.InstancedMesh;
  hairCap: THREE.InstancedMesh;
  hairLong: THREE.InstancedMesh;
  locks: THREE.InstancedMesh;
  eyes: THREE.InstancedMesh;
};

export class FigureLayer {
  /** Rendered after the globe, over a cleared depth buffer. */
  readonly scene = new THREE.Scene();

  private figures: Figure[] = [];
  private byId = new Map<string, Figure>();
  private parts: Parts;
  private material = new THREE.MeshLambertMaterial();
  private ring: THREE.Mesh;
  private hemi: THREE.HemisphereLight;
  private key: THREE.DirectionalLight;
  private selected: string | null = null;
  private hovered: string | null = null;
  private zoomScale = 1;

  // scratch
  private m = new THREE.Matrix4();
  private base = new THREE.Matrix4();
  private local = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private up = new THREE.Vector3();
  private right = new THREE.Vector3();
  private fwd = new THREE.Vector3();
  private toCam = new THREE.Vector3();
  private pos = new THREE.Vector3();
  private axis = new THREE.Vector3();
  private turn = new THREE.Quaternion();
  private projected = new THREE.Vector3();

  constructor(private readonly max = 400) {
    const make = (geometry: THREE.BufferGeometry, perFigure: number) => {
      const mesh = new THREE.InstancedMesh(geometry, this.material, max * perFigure);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.count = 0;
      // The shared bounding sphere is the base geometry's, not the crowd's.
      mesh.frustumCulled = false;
      this.scene.add(mesh);
      return mesh;
    };

    const arm = new THREE.CapsuleGeometry(0.045, 0.17, 3, 8);
    arm.translate(0, -0.13, 0); // pivot at the shoulder

    this.parts = {
      legs: make(new THREE.CapsuleGeometry(0.066, 0.13, 3, 8), 2),
      torsoBoy: make(new THREE.CylinderGeometry(0.135, 0.16, 0.3, 14), 1),
      torsoGirl: make(new THREE.CylinderGeometry(0.125, 0.235, 0.34, 16), 1),
      arms: make(arm, 2),
      hands: make(new THREE.SphereGeometry(0.052, 10, 8), 2),
      head: make(new THREE.SphereGeometry(0.2, 20, 16), 1),
      hairCap: make(new THREE.SphereGeometry(0.23, 20, 16), 1),
      hairLong: make(new THREE.CapsuleGeometry(0.2, 0.2, 4, 12), 1),
      // Two locks either side of the face: long hair has to show from the
      // front, where the camera always is.
      locks: make(new THREE.CapsuleGeometry(0.075, 0.2, 3, 8), 2),
      eyes: make(new THREE.SphereGeometry(0.03, 8, 6), 2),
    };

    // Lit from the viewer's upper left, so every figure reads as round.
    this.hemi = new THREE.HemisphereLight(0xeef2ff, 0x2b2733, 1.35);
    this.key = new THREE.DirectionalLight(0xffffff, 1.9);
    this.scene.add(this.hemi, this.key);

    // Who you are talking to: a ring on the ground at their feet.
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.78, 1, 40),
      new THREE.MeshBasicMaterial({
        color: "#5aa9e6",
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    this.ring.visible = false;
    this.scene.add(this.ring);
  }

  /** Match the figures to the people on screen, keeping each one's state. */
  sync(specs: FigureSpec[], now: number) {
    const next: Figure[] = [];
    for (const spec of specs.slice(0, this.max)) {
      let f = this.byId.get(spec.id);
      if (!f) {
        const h = hash(spec.id);
        const look = figureLook(spec.id);
        f = {
          spec,
          anchor: new THREE.Vector3(),
          normal: new THREE.Vector3(),
          skin: new THREE.Color(look.skin),
          hair: new THREE.Color(look.hair),
          shirt: new THREE.Color(spec.color),
          shirtTarget: new THREE.Color(spec.color),
          restYaw: (h - 0.5) * 0.7,
          yaw: (h - 0.5) * 0.7,
          phase: h * Math.PI * 2,
          shown: 0,
          placed: 0,
          waveAt: -Infinity,
          hopAt: -Infinity,
          box: null,
        };
      } else if (f.spec.color !== spec.color) {
        // An answer arrived, or changed: a little hop as the shirt changes.
        f.hopAt = now;
      }
      f.spec = spec;
      f.shirtTarget.set(spec.color);
      f.anchor.copy(latLonToVector3(spec.lat, spec.lon, RADIUS * 1.004));
      f.normal.copy(f.anchor).normalize();
      next.push(f);
    }
    this.figures = next;
    this.byId = new Map(next.map((f) => [f.spec.id, f]));

    const n = next.length;
    const p = this.parts;
    p.legs.count = p.arms.count = p.hands.count = p.eyes.count = p.locks.count = n * 2;
    p.torsoBoy.count = p.torsoGirl.count = p.head.count = p.hairCap.count = p.hairLong.count = n;

    next.forEach((f, i) => {
      p.legs.setColorAt(i * 2, PANTS);
      p.legs.setColorAt(i * 2 + 1, PANTS);
      p.hands.setColorAt(i * 2, f.skin);
      p.hands.setColorAt(i * 2 + 1, f.skin);
      p.eyes.setColorAt(i * 2, EYES);
      p.eyes.setColorAt(i * 2 + 1, EYES);
      p.head.setColorAt(i, f.skin);
      p.hairCap.setColorAt(i, f.hair);
      p.hairLong.setColorAt(i, f.hair);
      p.locks.setColorAt(i * 2, f.hair);
      p.locks.setColorAt(i * 2 + 1, f.hair);
    });
    for (const mesh of [p.legs, p.hands, p.eyes, p.head, p.hairCap, p.hairLong, p.locks]) {
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  /** A hello. Idempotent for a moment, so a click and the selection that
   *  follows it do not restart the wave halfway up. */
  wave(id: string, now: number) {
    const f = this.byId.get(id);
    if (f && now - f.waveAt > 400) f.waveAt = now;
  }

  setSelected(id: string | null) {
    this.selected = id;
  }

  setHovered(id: string | null) {
    this.hovered = id;
  }

  /** The figure under a point on screen, in CSS pixels. Forgiving by a few
   *  pixels: these are small targets. */
  pick(x: number, y: number): string | null {
    let best: Figure | null = null;
    let bestD = Infinity;
    for (const f of this.figures) {
      const b = f.box;
      if (!b || f.shown < 0.3) continue;
      const slack = 5;
      if (x < b.x0 - slack || x > b.x1 + slack || y < b.y0 - slack || y > b.y1 + slack) continue;
      const d = (x - (b.x0 + b.x1) / 2) ** 2 + (y - (b.y0 + b.y1) / 2) ** 2;
      if (d < bestD) {
        bestD = d;
        best = f;
      }
    }
    return best?.spec.id ?? null;
  }

  /** Where the people are standing on screen, so other layouts (the city
   *  labels) can keep off them. */
  occupied(): Box[] {
    const out: Box[] = [];
    for (const f of this.figures) if (f.box && f.shown > 0.3) out.push(f.box);
    return out;
  }

  /** What is on screen, for tests: every figure showing, and where. */
  snapshot() {
    return this.figures
      .filter((f) => f.box && f.shown > 0.05)
      .map((f) => ({
        id: f.spec.id,
        kind: f.spec.kind,
        shown: +f.shown.toFixed(2),
        box: f.box!,
        waving: performance.now() - f.waveAt < WAVE_MS,
      }));
  }

  /** One frame. `frames` is how many 60fps frames have passed, so easing is
   *  the same speed on a slow machine. */
  update(now: number, cam: THREE.PerspectiveCamera, width: number, height: number, frames: number) {
    cam.updateMatrixWorld();
    this.zoomScale = Math.pow(
      Math.max(0.1, cam.position.length() - RADIUS) / (HOME_DISTANCE - RADIUS),
      ZOOM_RESIST
    );
    const up = this.up.set(0, 1, 0).applyQuaternion(cam.quaternion);
    const camRight = this.right.set(1, 0, 0).applyQuaternion(cam.quaternion);

    this.hemi.position.copy(up);
    this.key.position.copy(cam.position).addScaledVector(up, 4).addScaledVector(camRight, -3);

    // ---- where everyone would stand at full size, and who fits ----------
    const items: LayoutItem[] = [];
    const horizon = new Map<Figure, number>();
    const fullBox = new Map<Figure, Box>();

    for (const f of this.figures) {
      this.toCam.copy(cam.position).sub(f.anchor).normalize();
      const facing = f.normal.dot(this.toCam);
      // Fade out over the last stretch before the horizon, so nobody stands
      // on the rim of the world half behind it.
      const h = smoothstep(0.05, 0.22, facing);
      horizon.set(f, h);
      if (h <= 0) continue;

      const size = this.size(f);
      const feet = this.project(f.anchor, cam, width, height);
      const crown = this.project(this.v.copy(f.anchor).addScaledVector(up, size), cam, width, height);
      const px = Math.max(1, feet.y - crown.y);
      const box = { x0: feet.x - (px * ASPECT) / 2, x1: feet.x + (px * ASPECT) / 2, y0: crown.y, y1: feet.y };
      fullBox.set(f, box);

      const id = f.spec.id;
      items.push({
        id,
        box,
        priority:
          (id === this.selected ? 16 : 0) +
          (id === this.hovered ? 8 : 0) +
          (now - f.waveAt < WAVE_MS ? 8 : 0) +
          // Whoever is already standing keeps their spot, so a slowly
          // turning globe does not flicker people in and out.
          (f.placed > 0 ? 4 : 0) +
          f.spec.weight +
          facing * 0.5,
      });
    }

    const layout = declutter(items);
    const ease = 1 - Math.pow(1 - 0.2, frames);

    // ---- pose and draw ----------------------------------------------------
    const p = this.parts;
    let ringFor: Figure | null = null;

    this.figures.forEach((f, i) => {
      const id = f.spec.id;
      f.placed = layout.get(id) ?? 0;
      const hover = id === this.hovered ? 1.12 : 1;
      const target = (horizon.get(f) ?? 0) * f.placed * hover;
      f.shown += (target - f.shown) * ease;
      if (f.shown < 0.01) f.shown = target === 0 ? 0 : f.shown;

      f.shirt.lerp(f.shirtTarget, ease);

      // Only a figure mid-hello has a wave clock. Left running for everyone
      // it is Infinity, and 0 × sin(Infinity) is NaN — which took every
      // figure's matrix with it.
      const since = now - f.waveAt;
      const waving = since >= 0 && since < WAVE_MS;
      const tw = waving ? since / WAVE_MS : 0;
      const raise = waving ? smoothstep(0, 0.14, tw) * (1 - smoothstep(0.82, 1, tw)) : 0;
      // Face the viewer to say hello, or while being talked to.
      const yawTarget = waving || id === this.selected ? 0 : f.restYaw;
      f.yaw += (yawTarget - f.yaw) * ease;

      const size = this.size(f) * f.shown;
      const box = fullBox.get(f);
      f.box = box && f.shown > 0.01 ? shrinkBox(box, f.shown / hover) : null;

      // Lift: thinking bobs, an answer hops, a hello bounces.
      const th = now - f.hopAt < HOP_MS ? (now - f.hopAt) / HOP_MS : -1;
      const lift =
        (f.spec.active ? (0.5 + 0.5 * Math.sin(now * 0.0055 + f.phase)) * 0.07 : 0) +
        (th >= 0 && th < 1 ? Math.sin(Math.PI * th) * 0.2 : 0) +
        raise * Math.abs(Math.sin(tw * Math.PI * 4)) * 0.06;

      // Upright on screen, turned toward the camera by its own small angle.
      this.fwd.copy(cam.position).sub(f.anchor);
      this.fwd.addScaledVector(up, -this.fwd.dot(up)).normalize();
      this.right.crossVectors(up, this.fwd).normalize();
      this.m.makeBasis(this.right, up, this.fwd);
      this.q.setFromRotationMatrix(this.m);
      this.q.multiply(this.turn.setFromAxisAngle(this.axis.set(0, 1, 0), f.yaw));
      this.pos.copy(f.anchor).addScaledVector(up, lift * size);
      this.base.compose(this.pos, this.q, this.v.setScalar(size));

      const put = (mesh: THREE.InstancedMesh, slot: number, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1) => {
        this.local.makeScale(sx, sy, sz).setPosition(x, y, z);
        mesh.setMatrixAt(slot, this.m.multiplyMatrices(this.base, this.local));
      };

      const girl = f.spec.kind === "girl";
      put(p.legs, i * 2, -0.075, 0.131, 0);
      put(p.legs, i * 2 + 1, 0.075, 0.131, 0);
      put(p.torsoBoy, i, 0, 0.4, 0, girl ? 0 : 1, girl ? 0 : 1, girl ? 0 : 1);
      put(p.torsoGirl, i, 0, 0.4, 0, girl ? 1 : 0, girl ? 1 : 0, girl ? 1 : 0);
      put(p.head, i, 0, 0.755, 0);
      // Set back and up from the head, so the face shows through the front
      // and the hair frames it: a cap for everyone, and hair to the
      // shoulders for the girls.
      put(p.hairCap, i, 0, 0.8, -0.06);
      const g = girl ? 1 : 0;
      put(p.hairLong, i, 0, 0.62, -0.09, g, g, g * 0.62);
      put(p.locks, i * 2, -0.175, 0.64, 0.05, g, g, g);
      put(p.locks, i * 2 + 1, 0.175, 0.64, 0.05, g, g, g);
      put(p.eyes, i * 2, -0.072, 0.765, 0.182);
      put(p.eyes, i * 2 + 1, 0.072, 0.765, 0.182);

      // Arms swing from the shoulder: the left hangs, the right waves hello.
      const wobble = raise * 0.42 * Math.sin(tw * Math.PI * 2 * 4.5);
      const angles = [-ARM_REST, ARM_REST + (ARM_RAISED - ARM_REST) * raise + wobble];
      angles.forEach((a, side) => {
        const sx = side === 0 ? -SHOULDER.x : SHOULDER.x;
        this.local.makeRotationZ(a).setPosition(sx, SHOULDER.y, 0);
        p.arms.setMatrixAt(i * 2 + side, this.m.multiplyMatrices(this.base, this.local));
        put(p.hands, i * 2 + side, sx + Math.sin(a) * ARM_LENGTH, SHOULDER.y - Math.cos(a) * ARM_LENGTH, 0);
      });

      p.torsoBoy.setColorAt(i, f.shirt);
      p.torsoGirl.setColorAt(i, f.shirt);
      p.arms.setColorAt(i * 2, f.shirt);
      p.arms.setColorAt(i * 2 + 1, f.shirt);

      if (id === this.selected && f.shown > 0.2) ringFor = f;
    });

    for (const mesh of Object.values(p)) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }

    // The ring lies on the ground, so it foreshortens with the globe.
    const r = ringFor as Figure | null;
    this.ring.visible = Boolean(r);
    if (r) {
      this.ring.position.copy(r.anchor);
      this.ring.quaternion.setFromUnitVectors(this.axis.set(0, 0, 1), r.normal);
      this.ring.scale.setScalar(this.size(r) * r.shown * 0.34);
      (this.ring.material as THREE.MeshBasicMaterial).opacity = 0.55 + 0.35 * Math.sin(now * 0.006);
    }
  }

  dispose() {
    for (const mesh of Object.values(this.parts)) mesh.geometry.dispose();
    this.material.dispose();
    this.ring.geometry.dispose();
    (this.ring.material as THREE.Material).dispose();
  }

  private size(f: Figure) {
    return FIGURE_HEIGHT * this.zoomScale * (f.spec.scale ?? 1) * (0.9 + f.spec.weight * 0.2);
  }

  private project(p: THREE.Vector3, cam: THREE.Camera, width: number, height: number) {
    const v = this.projected.copy(p).project(cam);
    return { x: ((v.x + 1) / 2) * width, y: ((1 - v.y) / 2) * height };
  }
}
