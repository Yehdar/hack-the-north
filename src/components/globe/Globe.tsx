"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import {
  RADIUS,
  arcPoints,
  fibonacciSphere,
  focusStep,
  landTest,
  latLonToVector3,
  type LatLon,
} from "./geo";

// ============================================================================
// GLOBE — the navigator both phases hang off.
//
// Raw Three.js rather than react-three-fiber: the dots are mutated every frame
// from a ref and must never round-trip through React state, and the HTML
// overlay labels are positioned by projecting 3D points to screen space each
// frame. R3F would be fighting us on both.
//
// The look: continents as a dot matrix, a warm atmosphere on the rim, a ripple
// every time someone answers, and arcs when the crowd is sent out. Everything
// that moves means something happened.
// ============================================================================

export type GlobeDot = {
  id: string;
  lat: number;
  lon: number;
  /** Drives colour. -1 hostile .. +1 enthusiastic, or undefined for idle. */
  stance?: number;
  label: string;
  /** 0..1, scales the dot. */
  weight?: number;
  /** Pulsing = this agent is thinking right now. */
  active?: boolean;
};

export type GlobeArc = {
  id: string;
  from: LatLon;
  to: LatLon;
  /** ms before this arc starts flying, so a fan of arcs launches in sequence. */
  delay?: number;
};

type Props = {
  dots: GlobeDot[];
  onDotClick?: (id: string) => void;
  /** Rotates this coordinate to face the camera and stops the idle spin.
   *  Without it the committee sits on the far side of the globe and you never
   *  see the seats pulse. */
  focus?: LatLon | null;
  arcs?: GlobeArc[];
  /** A place that keeps pulsing — where the council or committee is sitting. */
  beacon?: LatLon | null;
  className?: string;
};

const ACCENT = new THREE.Color("#ff5a3c");
const LAND_DOT = new THREE.Color("#5b5366");
const ARC_GROW_MS = 1100;
const ARC_FADE_MS = 500;
const RIPPLE_MS = 1100;

/**
 * Sentiment as temperature: cold blue through to signal amber.
 *
 * Deliberately not red-to-green. Red/green reads as pass/fail, which is the
 * wrong frame for "how much heat is in this market", and it is the one ramp
 * that disappears for red-green colourblind viewers.
 */
function stanceColor(stance?: number): string {
  if (stance === undefined) return "#6b6477";

  const t = Math.max(0, Math.min(1, (stance + 1) / 2));
  const cold = [0x3b, 0x82, 0xf6];
  const mid = [0x84, 0x94, 0xb4];
  const hot = [0xff, 0xb0, 0x20];

  const [from, to, local] =
    t < 0.5 ? [cold, mid, t * 2] : [mid, hot, (t - 0.5) * 2];

  const channel = (i: number) =>
    Math.round(from[i] + (to[i] - from[i]) * local)
      .toString(16)
      .padStart(2, "0");

  return `#${channel(0)}${channel(1)}${channel(2)}`;
}

/** A soft round sprite, so land dots are circles rather than GL squares. */
function dotSprite(): THREE.Texture {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.55, "rgba(255,255,255,1)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

type Ripple = { mesh: THREE.Mesh; born: number; reach: number };
type LiveArc = {
  line: Line2;
  head: THREE.Mesh;
  count: number;
  born: number;
  delay: number;
  dying: number | null;
};

export function Globe({ dots, onDotClick, focus, arcs, beacon, className }: Props) {
  const mount = useRef<HTMLDivElement>(null);
  const overlay = useRef<HTMLDivElement>(null);

  const globe = useRef<THREE.Group | null>(null);
  const dotMeshes = useRef<Map<string, THREE.Mesh>>(new Map());
  const labels = useRef<Map<string, HTMLDivElement>>(new Map());
  const seenStance = useRef<Map<string, number | undefined>>(new Map());
  const dotData = useRef<GlobeDot[]>(dots);
  const clickHandler = useRef(onDotClick);
  const focusTarget = useRef(focus);
  const beaconTarget = useRef(beacon);
  const spawnRipple = useRef<(at: THREE.Vector3, color: THREE.Color, reach?: number) => void>(
    () => {}
  );
  const liveArcs = useRef<Map<string, LiveArc>>(new Map());
  const arcMaterial = useRef<LineMaterial | null>(null);

  // The render loop reads the latest props through refs, refreshed after each
  // commit rather than during render.
  useEffect(() => {
    dotData.current = dots;
    clickHandler.current = onDotClick;
    focusTarget.current = focus;
    beaconTarget.current = beacon;
  });

  // ---- scene, once -------------------------------------------------------
  useEffect(() => {
    const el = mount.current;
    if (!el) return;

    const sc = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(45, el.clientWidth / el.clientHeight, 0.1, 100);
    cam.position.set(0, 1.4, 6);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(el.clientWidth, el.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    el.appendChild(renderer.domElement);
    renderer.domElement.style.cursor = "grab";

    const group = new THREE.Group();
    sc.add(group);

    const viewNormal = `
      varying vec3 vNormal;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`;

    // The body of the planet: opaque, so the far side's dots are hidden
    // rather than showing through as noise, with a faint warm light on the
    // limb so it reads as a sphere rather than a disc.
    group.add(
      new THREE.Mesh(
        new THREE.SphereGeometry(RADIUS * 0.995, 64, 64),
        new THREE.ShaderMaterial({
          uniforms: {
            base: { value: new THREE.Color(0x100e14) },
            rim: { value: ACCENT.clone() },
          },
          vertexShader: viewNormal,
          fragmentShader: `
            uniform vec3 base;
            uniform vec3 rim;
            varying vec3 vNormal;
            void main() {
              float edge = 1.0 - clamp(dot(vNormal, vec3(0.0, 0.0, 1.0)), 0.0, 1.0);
              gl_FragColor = vec4(base + rim * pow(edge, 4.0) * 0.28, 1.0);
            }`,
        })
      )
    );

    // Atmosphere: a back-faced shell just outside the globe. From the default
    // distance, the shell's visible back faces only tilt about 0.18 towards
    // the camera, so the glow is scaled to that band: brightest where it meets
    // the planet, gone at its own edge.
    const atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(RADIUS * 1.14, 64, 64),
      new THREE.ShaderMaterial({
        uniforms: { glow: { value: ACCENT.clone().lerp(new THREE.Color("#ffd9c9"), 0.2) } },
        vertexShader: viewNormal,
        fragmentShader: `
          uniform vec3 glow;
          varying vec3 vNormal;
          void main() {
            float rim = clamp(-dot(vNormal, vec3(0.0, 0.0, 1.0)) * 5.5, 0.0, 1.0);
            gl_FragColor = vec4(glow, 1.0) * pow(rim, 1.8) * 0.62;
          }`,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
      })
    );
    sc.add(atmosphere);

    const controls = new OrbitControls(cam, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.minDistance = 3.2;
    controls.maxDistance = 9;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.35;

    // A drag hands control to the user until a different place is focused.
    let released = false;
    let focusedOn = "";

    renderer.domElement.addEventListener("pointerdown", () => {
      controls.autoRotate = false;
      released = true;
      renderer.domElement.style.cursor = "grabbing";
    });
    renderer.domElement.addEventListener("pointerup", () => {
      renderer.domElement.style.cursor = "grab";
    });

    // ---- continents, as a dot matrix -------------------------------------
    const sprite = dotSprite();
    void fetch("/continents.json")
      .then((r) => r.json())
      .then((rings: [number, number][][]) => {
        const isLand = landTest(rings);
        const positions: number[] = [];
        for (const p of fibonacciSphere(16000)) {
          if (!isLand(p)) continue;
          const v = latLonToVector3(p.lat, p.lon, RADIUS * 1.002);
          positions.push(v.x, v.y, v.z);
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
        group.add(
          new THREE.Points(
            geometry,
            new THREE.PointsMaterial({
              size: 0.034,
              sizeAttenuation: true,
              map: sprite,
              color: LAND_DOT,
              transparent: true,
              alphaTest: 0.35,
              depthWrite: false,
            })
          )
        );
      })
      .catch(() => {
        /* the globe still renders without continents */
      });

    // ---- ripples: one per answer, and the beacon ------------------------
    const ripples: Ripple[] = [];
    const ringGeometry = new THREE.RingGeometry(0.82, 1, 48);

    spawnRipple.current = (at, color, reach = 0.14) => {
      if (ripples.length > 80) return;
      const mesh = new THREE.Mesh(
        ringGeometry,
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.9,
          side: THREE.DoubleSide,
          depthWrite: false,
        })
      );
      mesh.position.copy(at);
      mesh.lookAt(at.clone().multiplyScalar(2));
      mesh.scale.setScalar(0.001);
      group.add(mesh);
      ripples.push({ mesh, born: performance.now(), reach });
    };

    // ---- arcs --------------------------------------------------------------
    const arcMat = new LineMaterial({
      color: ACCENT.getHex(),
      linewidth: 1.6,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    });
    arcMat.resolution.set(el.clientWidth, el.clientHeight);
    arcMaterial.current = arcMat;

    // ---- raycast ---------------------------------------------------------
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    const onClick = (e: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, cam);

      const hits = raycaster.intersectObjects([...dotMeshes.current.values()]);
      const hit = hits[0]?.object;
      if (!hit) return;
      for (const [id, mesh] of dotMeshes.current) {
        if (mesh === hit) clickHandler.current?.(id);
      }
    };
    renderer.domElement.addEventListener("click", onClick);

    // ---- loop ------------------------------------------------------------
    let raf = 0;
    let lastBeacon = 0;
    const tmp = new THREE.Vector3();
    const camDir = new THREE.Vector3();

    const tick = () => {
      raf = requestAnimationFrame(tick);
      const now = performance.now();

      // Orbit the camera round until the requested coordinate faces it. The
      // globe itself never rotates, so dot positions stay in world space.
      const f = focusTarget.current;
      const key = f ? `${f.lat},${f.lon}` : "";
      if (key !== focusedOn) {
        focusedOn = key;
        released = false;
      }
      if (f && !released) {
        controls.autoRotate = false;
        cam.position.copy(focusStep(cam.position, f.lat, f.lon));
      }

      controls.update();

      const t = now / 1000;
      for (const d of dotData.current) {
        const mesh = dotMeshes.current.get(d.id);
        if (!mesh) continue;
        const base = 0.028 + (d.weight ?? 0.4) * 0.05;
        mesh.scale.setScalar(d.active ? base * (1.3 + Math.sin(t * 6) * 0.35) : base);
      }

      // Ripples expand and fade.
      for (let i = ripples.length - 1; i >= 0; i--) {
        const r = ripples[i];
        const k = (now - r.born) / RIPPLE_MS;
        if (k >= 1) {
          group.remove(r.mesh);
          (r.mesh.material as THREE.Material).dispose();
          ripples.splice(i, 1);
          continue;
        }
        const ease = 1 - Math.pow(1 - k, 3);
        r.mesh.scale.setScalar(0.01 + ease * r.reach);
        (r.mesh.material as THREE.MeshBasicMaterial).opacity = 0.85 * (1 - k);
      }

      const b = beaconTarget.current;
      if (b && now - lastBeacon > 1500) {
        lastBeacon = now;
        spawnRipple.current(latLonToVector3(b.lat, b.lon, RADIUS * 1.012), ACCENT, 0.24);
      }

      // Arcs grow from origin to destination, with a bright head in front.
      for (const [id, a] of liveArcs.current) {
        const k = Math.min(1, Math.max(0, (now - a.born - a.delay) / ARC_GROW_MS));
        const shown = Math.max(1, Math.round(k * a.count));
        (a.line.geometry as LineGeometry).instanceCount = k === 0 ? 0 : shown;
        const positions = (a.line.userData.points as THREE.Vector3[]) ?? [];
        const tip = positions[Math.min(positions.length - 1, shown)];
        if (tip) a.head.position.copy(tip);
        a.head.visible = k > 0 && k < 1;

        if (a.dying !== null) {
          const fade = 1 - Math.min(1, (now - a.dying) / ARC_FADE_MS);
          (a.line.material as LineMaterial).opacity = 0.9 * fade;
          if (fade <= 0) {
            group.remove(a.line, a.head);
            a.line.geometry.dispose();
            (a.line.material as LineMaterial).dispose();
            a.head.geometry.dispose();
            (a.head.material as THREE.Material).dispose();
            liveArcs.current.delete(id);
          }
        }
      }

      // Project each dot to screen space for its HTML label, and hide the ones
      // on the far side of the globe.
      cam.getWorldDirection(camDir);
      const rect = renderer.domElement.getBoundingClientRect();
      for (const [id, mesh] of dotMeshes.current) {
        const label = labels.current.get(id);
        if (!label) continue;
        mesh.getWorldPosition(tmp);
        const facing = tmp.clone().normalize().dot(camDir) < -0.15;
        tmp.project(cam);
        label.style.opacity = facing ? "1" : "0";
        label.style.transform = `translate(-50%, -140%) translate(${((tmp.x + 1) / 2) * rect.width}px, ${((-tmp.y + 1) / 2) * rect.height}px)`;
      }

      renderer.render(sc, cam);
    };
    tick();

    const onResize = () => {
      if (!el.clientWidth) return;
      cam.aspect = el.clientWidth / el.clientHeight;
      cam.updateProjectionMatrix();
      renderer.setSize(el.clientWidth, el.clientHeight);
      arcMat.resolution.set(el.clientWidth, el.clientHeight);
      for (const a of liveArcs.current.values()) {
        (a.line.material as LineMaterial).resolution.set(el.clientWidth, el.clientHeight);
      }
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(el);

    globe.current = group;
    const arcsAtMount = liveArcs.current;
    const meshesAtMount = dotMeshes.current;
    const labelsAtMount = labels.current;
    const stancesAtMount = seenStance.current;

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.domElement.removeEventListener("click", onClick);
      controls.dispose();
      ringGeometry.dispose();
      sprite.dispose();
      arcMat.dispose();
      // Everything keyed to this scene goes with it. A remount (StrictMode
      // does one in development) must rebuild the dots in the new scene, not
      // keep updating meshes that belong to the one just thrown away.
      arcsAtMount.clear();
      meshesAtMount.clear();
      for (const label of labelsAtMount.values()) label.remove();
      labelsAtMount.clear();
      stancesAtMount.clear();
      renderer.dispose();
      el.removeChild(renderer.domElement);
    };
  }, []);

  // ---- dots, on change ---------------------------------------------------
  useEffect(() => {
    const group = globe.current;
    const layer = overlay.current;
    if (!group || !layer) return;

    const seen = new Set(dots.map((d) => d.id));

    for (const [id, mesh] of dotMeshes.current) {
      if (seen.has(id)) continue;
      group.remove(mesh);
      dotMeshes.current.delete(id);
      seenStance.current.delete(id);
      labels.current.get(id)?.remove();
      labels.current.delete(id);
    }

    for (const d of dots) {
      const color = new THREE.Color(stanceColor(d.stance));
      let mesh = dotMeshes.current.get(d.id);

      if (!mesh) {
        mesh = new THREE.Mesh(
          new THREE.SphereGeometry(1, 12, 12),
          new THREE.MeshBasicMaterial({ color })
        );
        mesh.position.copy(latLonToVector3(d.lat, d.lon, RADIUS * 1.015));
        group.add(mesh);
        dotMeshes.current.set(d.id, mesh);

        const label = document.createElement("div");
        label.className =
          "absolute left-0 top-0 whitespace-nowrap font-mono text-[9px] tracking-[0.14em] text-muted/80 transition-opacity duration-200 pointer-events-none";
        layer.appendChild(label);
        labels.current.set(d.id, label);
      } else {
        (mesh.material as THREE.MeshBasicMaterial).color = color;
      }

      // Someone just answered: a ripple in their colour.
      const before = seenStance.current.get(d.id);
      if (before === undefined && d.stance !== undefined) {
        spawnRipple.current(mesh.position.clone(), color);
      }
      seenStance.current.set(d.id, d.stance);

      const label = labels.current.get(d.id);
      if (label) label.textContent = d.label.toUpperCase();
    }
  }, [dots]);

  // ---- arcs, on change ---------------------------------------------------
  useEffect(() => {
    const group = globe.current;
    const material = arcMaterial.current;
    if (!group || !material) return;

    const wanted = new Set((arcs ?? []).map((a) => a.id));
    const now = performance.now();

    for (const [id, live] of liveArcs.current) {
      if (!wanted.has(id) && live.dying === null) liveArcs.current.set(id, { ...live, dying: now });
    }

    for (const arc of arcs ?? []) {
      if (liveArcs.current.has(arc.id)) continue;
      const points = arcPoints(arc.from, arc.to);
      const geometry = new LineGeometry();
      geometry.setPositions(points.flatMap((p) => [p.x, p.y, p.z]));
      geometry.instanceCount = 0;

      const line = new Line2(geometry, material.clone());
      line.userData.points = points;
      line.computeLineDistances();

      const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.018, 10, 10),
        new THREE.MeshBasicMaterial({ color: 0xffe2d8 })
      );
      head.visible = false;

      group.add(line, head);
      liveArcs.current.set(arc.id, {
        line,
        head,
        count: points.length - 1,
        born: now,
        delay: arc.delay ?? 0,
        dying: null,
      });
    }
  }, [arcs]);

  return (
    <div className={`relative ${className ?? ""}`}>
      <div ref={mount} className="absolute inset-0" />
      <div ref={overlay} className="pointer-events-none absolute inset-0 overflow-hidden" />
    </div>
  );
}
