"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

// ============================================================================
// THE BOARDROOM, IN THREE DIMENSIONS.
//
// Five partners in suits around an oval table, seen from the head of the room.
// The flat SVG faces read as a diagram; this reads as somewhere you have been
// made to sit.
//
// Built from primitives rather than a loaded model: it is a few hundred
// vertices, it ships nothing, and it can be recoloured per partner per frame,
// which a downloaded GLTF would make awkward.
//
// Everything that moves is bound to something real. The speaker straightens
// and lights, the partner being addressed turns their head, and a partner
// still forming a view sits dimmed. Nothing animates to look busy.
// ============================================================================

export type RoomSeat = {
  id: string;
  role: string;
  /** -1..1 once they have a view. Drives the tie. */
  stance?: number;
  /** Their share of the vote, which sets how they sit. */
  weight: number;
};

type Props = {
  seats: RoomSeat[];
  speaking?: string | null;
  addressing?: string | null;
  thinking?: Set<string>;
  conceded?: Set<string>;
  selected?: string | null;
  onSelect?: (id: string | null) => void;
  className?: string;
};

const SUIT = 0x232a3a;
const SUIT_LIGHT = 0x2f3950;
const SHIRT = 0xe8eaf0;
const SKINS = [0xd9a689, 0xc08457, 0x8d5524, 0xf0c8a0, 0xa9714b];
const HAIR = [0x2b2118, 0x4a3728, 0x1a1a1a, 0x6b4a2f, 0x3a2a1e];

function tieColor(stance?: number): number {
  if (stance === undefined) return 0x6b7280;
  if (stance > 0.2) return 0x3fb950;
  if (stance < -0.2) return 0xe5534b;
  return 0xd9a441;
}

/** Seat n of m around the table, clockwise from the far side. */
function seatAngle(i: number, n: number) {
  return -Math.PI / 2 + (i / n) * Math.PI * 2;
}

type Person = {
  group: THREE.Group;
  head: THREE.Mesh;
  torso: THREE.Mesh;
  tie: THREE.Mesh;
  glow: THREE.Mesh;
  angle: number;
  /** Where the head is pointing now, eased toward a target each frame. */
  turn: number;
};

export function Boardroom({
  seats,
  speaking,
  addressing,
  thinking,
  conceded,
  selected,
  onSelect,
  className,
}: Props) {
  const mount = useRef<HTMLDivElement>(null);
  const overlay = useRef<HTMLDivElement>(null);

  const people = useRef<Map<string, Person>>(new Map());
  const labels = useRef<Map<string, HTMLDivElement>>(new Map());
  const state = useRef({ seats, speaking, addressing, thinking, conceded, selected });
  const onSelectRef = useRef(onSelect);

  // Refreshed after each commit rather than during render: the loop reads
  // these every frame and must never see a half-rendered value.
  useEffect(() => {
    state.current = { seats, speaking, addressing, thinking, conceded, selected };
    onSelectRef.current = onSelect;
  });

  // ---- scene, once -------------------------------------------------------
  useEffect(() => {
    const el = mount.current;
    const layer = overlay.current;
    if (!el || !layer) return;

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x0f1520, 9, 22);

    const cam = new THREE.PerspectiveCamera(38, el.clientWidth / el.clientHeight, 0.1, 100);
    // At the head of the table, a little above eye level, looking down it.
    // Far enough back that the two nearest partners are whole rather than
    // cropped to a shoulder, which is what a tighter frame did.
    cam.position.set(0, 3.5, 10.6);
    cam.lookAt(0, 1.25, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(el.clientWidth, el.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    el.appendChild(renderer.domElement);
    renderer.domElement.style.cursor = "pointer";

    // ---- light ----------------------------------------------------------
    scene.add(new THREE.HemisphereLight(0x8fa6c8, 0x0a0e16, 1.05));

    const key = new THREE.DirectionalLight(0xffffff, 1.5);
    key.position.set(3, 8, 5);
    scene.add(key);

    const fill = new THREE.DirectionalLight(0x6f86b8, 0.5);
    fill.position.set(-5, 3, -4);
    scene.add(fill);

    // The lamp over the table, which is what makes it read as a room.
    const lamp = new THREE.PointLight(0xffe6c4, 26, 12, 2);
    lamp.position.set(0, 3.1, 0);
    scene.add(lamp);

    // ---- the table ------------------------------------------------------
    const table = new THREE.Group();

    const top = new THREE.Mesh(
      new THREE.CylinderGeometry(2.5, 2.5, 0.14, 64),
      new THREE.MeshStandardMaterial({ color: 0x2b2118, roughness: 0.45, metalness: 0.05 })
    );
    top.scale.set(1, 1, 0.62);
    top.position.y = 0.92;
    table.add(top);

    const plinth = new THREE.Mesh(
      new THREE.CylinderGeometry(1.3, 1.65, 0.9, 32),
      new THREE.MeshStandardMaterial({ color: 0x1a202c, roughness: 0.8 })
    );
    plinth.scale.set(1, 1, 0.62);
    plinth.position.y = 0.45;
    table.add(plinth);

    // The report, which is what they are all here about.
    const report = new THREE.Mesh(
      new THREE.BoxGeometry(0.82, 0.016, 1.06),
      new THREE.MeshStandardMaterial({ color: 0xf4f1ea, roughness: 0.9 })
    );
    report.position.set(0, 1.0, 0.1);
    report.rotation.y = -0.16;
    table.add(report);

    scene.add(table);

    // floor, so the figures are standing somewhere
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(14, 48),
      new THREE.MeshStandardMaterial({ color: 0x0c111b, roughness: 1 })
    );
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);

    // A wall around them. Without it the far partners sat against nothing and
    // the top of the frame was dead space. Fog eats the top, so it reads as a
    // dark room rather than a cylinder.
    const wall = new THREE.Mesh(
      new THREE.CylinderGeometry(13, 13, 9, 48, 1, true),
      new THREE.MeshStandardMaterial({
        color: 0x141c2b,
        roughness: 0.96,
        side: THREE.BackSide,
      })
    );
    wall.position.y = 4.5;
    scene.add(wall);

    // ---- the partners ---------------------------------------------------
    const seatList = state.current.seats;

    seatList.forEach((s, i) => {
      const a = seatAngle(i, seatList.length);
      const group = new THREE.Group();

      // Seated around an ellipse, facing the middle of the table.
      const rx = 3.1;
      const rz = 2.0;
      group.position.set(Math.cos(a) * rx, 0, Math.sin(a) * rz);
      group.rotation.y = -a - Math.PI / 2;

      const skin = SKINS[i % SKINS.length];
      const hair = HAIR[i % HAIR.length];

      // chair
      const chair = new THREE.Mesh(
        new THREE.BoxGeometry(0.72, 0.9, 0.12),
        new THREE.MeshStandardMaterial({ color: 0x151b28, roughness: 0.9 })
      );
      chair.position.set(0, 0.95, -0.42);
      group.add(chair);

      // jacket
      const torso = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.33, 0.44, 6, 16),
        new THREE.MeshStandardMaterial({ color: SUIT, roughness: 0.72 })
      );
      torso.scale.set(1.16, 1, 0.78);
      torso.position.y = 1.2;
      group.add(torso);

      // shoulders, so the silhouette reads as a jacket rather than a pill
      const shoulders = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.17, 0.62, 4, 12),
        new THREE.MeshStandardMaterial({ color: SUIT_LIGHT, roughness: 0.75 })
      );
      shoulders.rotation.z = Math.PI / 2;
      shoulders.position.y = 1.42;
      group.add(shoulders);

      // shirt
      const shirt = new THREE.Mesh(
        new THREE.ConeGeometry(0.17, 0.34, 3),
        new THREE.MeshStandardMaterial({ color: SHIRT, roughness: 0.6 })
      );
      shirt.rotation.x = Math.PI;
      shirt.position.set(0, 1.35, 0.25);
      group.add(shirt);

      // tie, which carries where they stand
      const tie = new THREE.Mesh(
        new THREE.BoxGeometry(0.075, 0.3, 0.03),
        new THREE.MeshStandardMaterial({ color: tieColor(s.stance), roughness: 0.4 })
      );
      tie.position.set(0, 1.28, 0.3);
      group.add(tie);

      // head
      const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.235, 24, 20),
        new THREE.MeshStandardMaterial({ color: skin, roughness: 0.85 })
      );
      head.position.y = 1.73;
      head.scale.set(1, 1.08, 0.95);
      group.add(head);

      // One cap, in head-local space. Adding a second copy at the head's
      // WORLD height put a bare scalp floating above the table.
      const hairMesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.245, 20, 16, 0, Math.PI * 2, 0, Math.PI * 0.62),
        new THREE.MeshStandardMaterial({ color: hair, roughness: 0.95 })
      );
      hairMesh.position.set(0, 0.015, 0);
      hairMesh.scale.set(1, 1.02, 1);
      head.add(hairMesh);

      // a ring on the floor that lights when they speak
      const glow = new THREE.Mesh(
        new THREE.RingGeometry(0.46, 0.62, 32),
        new THREE.MeshBasicMaterial({
          color: 0x5aa9e6,
          transparent: true,
          opacity: 0,
          side: THREE.DoubleSide,
        })
      );
      glow.rotation.x = -Math.PI / 2;
      glow.position.y = 0.02;
      group.add(glow);

      group.userData.seatId = s.id;
      scene.add(group);

      people.current.set(s.id, { group, head, torso, tie, glow, angle: a, turn: 0 });

      // nameplate
      const plate = document.createElement("div");
      plate.className =
        "absolute left-0 top-0 whitespace-nowrap rounded-[2px] px-2 py-[2px] font-mono text-[10px] uppercase tracking-[0.1em] transition-opacity duration-200 pointer-events-none";
      plate.style.background = "rgba(10,14,22,0.92)";
      plate.style.border = "1px solid var(--border)";
      plate.style.boxShadow = "0 2px 6px -2px rgb(0 0 0 / 0.9)";
      plate.textContent = s.role;
      layer.appendChild(plate);
      labels.current.set(s.id, plate);
    });

    // ---- clicking a partner ---------------------------------------------
    const ray = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    const onClick = (e: MouseEvent) => {
      const r = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      pointer.y = -((e.clientY - r.top) / r.height) * 2 + 1;
      ray.setFromCamera(pointer, cam);

      const hit = ray.intersectObjects(scene.children, true)[0]?.object;
      if (!hit) return;

      // Walk up to whichever group carries a seat id.
      let o: THREE.Object3D | null = hit;
      while (o && !o.userData.seatId) o = o.parent;
      const id = o?.userData.seatId as string | undefined;

      onSelectRef.current?.(id && id === state.current.selected ? null : (id ?? null));
    };
    renderer.domElement.addEventListener("click", onClick);

    // ---- loop ------------------------------------------------------------
    let raf = 0;
    const tmp = new THREE.Vector3();
    const camTarget = new THREE.Vector3(0, 3.5, 7.4);
    const lookTarget = new THREE.Vector3(0, 0.9, 0);

    const tick = () => {
      raf = requestAnimationFrame(tick);
      const t = performance.now() / 1000;
      const st = state.current;

      // Lean toward whoever is selected, so a conversation feels closer.
      if (st.selected) {
        const p = people.current.get(st.selected);
        if (p) {
          camTarget.set(
            p.group.position.x * 0.5,
            2.9,
            p.group.position.z * 0.5 + 6.0
          );
          lookTarget.set(p.group.position.x * 0.75, 1.6, p.group.position.z * 0.75);
        }
      } else {
        camTarget.set(0, 4.6, 11.2);
        lookTarget.set(0, 1.1, 0);
      }
      cam.position.lerp(camTarget, 0.045);
      tmp.copy(lookTarget);
      cam.lookAt(tmp);

      for (const [id, p] of people.current) {
        const seat = st.seats.find((s) => s.id === id);
        const isSpeaking = st.speaking === id;
        const isAddressed = st.addressing === id;
        const dim = Boolean(st.selected) && st.selected !== id;

        // sit up to speak
        const lift = isSpeaking ? 0.075 : 0;
        p.group.position.y += (lift - p.group.position.y) * 0.12;

        // turn the head toward whoever matters
        let want = 0;
        const other = isSpeaking ? st.addressing : st.speaking;
        if (other && other !== id) {
          const o = people.current.get(other);
          if (o) {
            const da = Math.atan2(
              o.group.position.z - p.group.position.z,
              o.group.position.x - p.group.position.x
            );
            want = Math.max(-0.75, Math.min(0.75, -p.angle - Math.PI / 2 - da));
          }
        }
        p.turn += (want - p.turn) * 0.08;
        p.head.rotation.y = p.turn;

        // talking: a small nod, not a mouth we cannot see from here
        p.head.rotation.x = isSpeaking ? Math.sin(t * 7) * 0.055 : p.head.rotation.x * 0.9;

        // the ring under a speaker
        const mat = p.glow.material as THREE.MeshBasicMaterial;
        const wantOpacity = isSpeaking ? 0.5 + Math.sin(t * 4) * 0.18 : isAddressed ? 0.16 : 0;
        mat.opacity += (wantOpacity - mat.opacity) * 0.12;

        // a partner still thinking sits back, dimmed
        const bodyMat = p.torso.material as THREE.MeshStandardMaterial;
        const wantsDim = dim || (st.thinking?.has(id) && seat?.stance === undefined);
        bodyMat.opacity = 1;
        bodyMat.transparent = false;
        bodyMat.color.lerp(
          new THREE.Color(wantsDim ? 0x171d2a : isSpeaking ? SUIT_LIGHT : SUIT),
          0.08
        );

        // the tie carries their stance, and turns green when they concede
        const tieMat = p.tie.material as THREE.MeshStandardMaterial;
        tieMat.color.lerp(
          new THREE.Color(st.conceded?.has(id) ? 0x3fb950 : tieColor(seat?.stance)),
          0.07
        );

        // Nameplate, on the table in front of them rather than floating over
        // their head. Heads are close together from this angle and the plates
        // landed on each other; a place setting never can.
        const plate = labels.current.get(id);
        if (plate) {
          tmp.set(Math.cos(p.angle) * 2.12, 1.02, Math.sin(p.angle) * 1.3).project(cam);
          const rect = renderer.domElement.getBoundingClientRect();
          const onScreen = tmp.z < 1;
          plate.style.opacity = onScreen ? (dim ? "0.25" : "1") : "0";
          plate.style.color = isSpeaking ? "var(--accent)" : "var(--muted)";
          plate.style.borderColor = isSpeaking ? "var(--accent)" : "var(--border)";
          // Plates further round the table are further away, so they shrink.
          const near = (Math.sin(p.angle) + 1) / 2;
          plate.style.transform = `translate(-50%,-50%) translate(${
            ((tmp.x + 1) / 2) * rect.width
          }px, ${((-tmp.y + 1) / 2) * rect.height}px) scale(${(0.82 + near * 0.26).toFixed(3)})`;
        }
      }

      renderer.render(scene, cam);
    };
    tick();

    const onResize = () => {
      if (!el.clientWidth || !el.clientHeight) return;
      cam.aspect = el.clientWidth / el.clientHeight;
      cam.updateProjectionMatrix();
      renderer.setSize(el.clientWidth, el.clientHeight);
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(el);

    const peopleAtMount = people.current;
    const labelsAtMount = labels.current;

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.domElement.removeEventListener("click", onClick);
      renderer.dispose();
      el.removeChild(renderer.domElement);
      for (const l of labelsAtMount.values()) l.remove();
      labelsAtMount.clear();
      peopleAtMount.clear();
    };
    // Built once per roster size. The loop reads live props through the state
    // ref, so a new speaker never rebuilds the room.
  }, [seats.length]);

  return (
    <div className={`relative ${className ?? ""}`}>
      <div ref={mount} className="absolute inset-0" />
      <div ref={overlay} className="pointer-events-none absolute inset-0 overflow-hidden" />
    </div>
  );
}
