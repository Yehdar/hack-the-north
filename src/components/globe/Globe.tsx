"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

// ============================================================================
// GLOBE — the navigator both phases hang off.
//
// Raw Three.js rather than react-three-fiber: the dots are mutated every frame
// from a ref and must never round-trip through React state, and the HTML
// overlay labels are positioned by projecting 3D points to screen space each
// frame. R3F would be fighting us on both.
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

type Props = {
  dots: GlobeDot[];
  onDotClick?: (id: string) => void;
  /** Rotates this coordinate to face the camera and stops the idle spin.
   *  Without it the committee sits on the far side of the globe and you never
   *  see the seats pulse. */
  focus?: { lat: number; lon: number } | null;
  className?: string;
};

const RADIUS = 2;

/** Longitude is negated: without it the globe renders mirrored. Tunnel hit the
 *  same thing and left a comment about it in their source. */
function latLonToVector3(lat: number, lon: number, radius: number) {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((-lon + 180) * Math.PI) / 180;
  return new THREE.Vector3(
    radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

/** Signed delta taking the short way round, so easing never unwinds the long
 *  way through 350 degrees. */
function shortestTurn(from: number, to: number): number {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function stanceColor(stance?: number): string {
  if (stance === undefined) return "#64748b";
  if (stance > 0.25) return "#34d399";
  if (stance < -0.25) return "#f87171";
  return "#fbbf24";
}

export function Globe({ dots, onDotClick, focus, className }: Props) {
  const mount = useRef<HTMLDivElement>(null);
  const overlay = useRef<HTMLDivElement>(null);

  const scene = useRef<THREE.Scene | null>(null);
  const camera = useRef<THREE.PerspectiveCamera | null>(null);
  const globe = useRef<THREE.Group | null>(null);
  const dotMeshes = useRef<Map<string, THREE.Mesh>>(new Map());
  const labels = useRef<Map<string, HTMLDivElement>>(new Map());
  const dotData = useRef<GlobeDot[]>(dots);
  const clickHandler = useRef(onDotClick);
  const focusTarget = useRef(focus);
  const controlsRef = useRef<OrbitControls | null>(null);

  dotData.current = dots;
  clickHandler.current = onDotClick;
  focusTarget.current = focus;

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
    group.rotation.order = "YXZ";
    sc.add(group);

    // Faint sphere so the far-side dots read as occluded rather than floating.
    group.add(
      new THREE.Mesh(
        new THREE.SphereGeometry(RADIUS * 0.985, 48, 48),
        new THREE.MeshBasicMaterial({ color: 0x0a0f1a, transparent: true, opacity: 0.92 })
      )
    );
    group.add(
      new THREE.Mesh(
        new THREE.SphereGeometry(RADIUS, 32, 32),
        new THREE.MeshBasicMaterial({
          color: 0x1e293b,
          wireframe: true,
          transparent: true,
          opacity: 0.12,
        })
      )
    );

    const controls = new OrbitControls(cam, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.minDistance = 3.2;
    controls.maxDistance = 9;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.35;

    controlsRef.current = controls;

    renderer.domElement.addEventListener("pointerdown", () => {
      controls.autoRotate = false;
      renderer.domElement.style.cursor = "grabbing";
    });
    renderer.domElement.addEventListener("pointerup", () => {
      renderer.domElement.style.cursor = "grab";
    });

    // ---- country outlines ------------------------------------------------
    void fetch("/continents.json")
      .then((r) => r.json())
      .then((rings: [number, number][][]) => {
        // One LineSegments for every coastline on earth, not 288 Line objects.
        // 288 draw calls of static geometry starves the main thread badly
        // enough to visibly throttle setInterval elsewhere on the page.
        const positions: number[] = [];
        for (const ring of rings) {
          for (let i = 0; i < ring.length - 1; i++) {
            const a = latLonToVector3(ring[i][1], ring[i][0], RADIUS * 1.001);
            const b = latLonToVector3(ring[i + 1][1], ring[i + 1][0], RADIUS * 1.001);
            positions.push(a.x, a.y, a.z, b.x, b.y, b.z);
          }
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute(
          "position",
          new THREE.Float32BufferAttribute(positions, 3)
        );
        group.add(
          new THREE.LineSegments(
            geometry,
            new THREE.LineBasicMaterial({
              color: 0x334155,
              transparent: true,
              opacity: 0.55,
            })
          )
        );
      })
      .catch(() => {
        /* globe still renders without outlines */
      });

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
    const tmp = new THREE.Vector3();
    const camDir = new THREE.Vector3();

    const tick = () => {
      raf = requestAnimationFrame(tick);

      // Ease the requested coordinate round to face the camera. Y brings the
      // longitude round; X tilts the latitude up into view.
      const f = focusTarget.current;
      if (f) {
        controls.autoRotate = false;
        // autoRotate moves the CAMERA, so by the time we focus the camera has
        // drifted off +Z. Offset by its current azimuth or the globe spins to
        // the wrong face.
        // A point at longitude L sits at theta = (180 - L); rotating the group
        // by (90 - L) brings it round to +Z, which is the face the camera sees.
        const targetY =
          ((90 - f.lon) * Math.PI) / 180 + controls.getAzimuthalAngle();
        const targetX = (f.lat * Math.PI) / 180;

        group.rotation.y += shortestTurn(group.rotation.y, targetY) * 0.06;
        group.rotation.x += shortestTurn(group.rotation.x, targetX) * 0.06;
      }

      controls.update();

      const t = performance.now() / 1000;
      for (const d of dotData.current) {
        const mesh = dotMeshes.current.get(d.id);
        if (!mesh) continue;
        const base = 0.028 + (d.weight ?? 0.4) * 0.05;
        mesh.scale.setScalar(d.active ? base * (1.3 + Math.sin(t * 6) * 0.35) : base);
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
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(el);

    scene.current = sc;
    camera.current = cam;
    globe.current = group;

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.domElement.removeEventListener("click", onClick);
      controls.dispose();
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
          "absolute left-0 top-0 whitespace-nowrap font-mono text-[10px] tracking-wider text-white/70 transition-opacity duration-200 pointer-events-none";
        layer.appendChild(label);
        labels.current.set(d.id, label);
      } else {
        (mesh.material as THREE.MeshBasicMaterial).color = color;
      }

      const label = labels.current.get(d.id);
      if (label) label.textContent = d.label.toUpperCase();
    }
  }, [dots]);

  return (
    <div className={`relative ${className ?? ""}`}>
      <div ref={mount} className="absolute inset-0" />
      <div ref={overlay} className="pointer-events-none absolute inset-0 overflow-hidden" />
    </div>
  );
}
