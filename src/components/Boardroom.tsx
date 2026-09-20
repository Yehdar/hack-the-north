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

const SKINS = [0xd9a689, 0xc08457, 0x8d5524, 0xf0c8a0, 0xa9714b];
// Keyed by seat, like the rest of a partner's appearance. Dark hair on a dark
// suit has no silhouette at this size, so the long styles are the lighter ones.
const HAIR: Record<string, number> = {
  chair: 0x8a5a33,
  gp: 0x2b2118,
  principal: 0x6e4526,
  skeptic: 0x1a1a1a,
  "devils-advocate": 0x4a3728,
};
const FALLBACK_HAIR = 0x3a2a1e;

// Five people, not one person copied five times. A room of identical figures
// reads as placeholder art however well it is lit.
const SUITS = [0x2c3547, 0x36373f, 0x27353e, 0x3b3745, 0x2f3a4b];
const SHIRTS = [0xe8eaf0, 0xd7e1f0, 0xefe8dc, 0xe8eaf0, 0xdbe6f2];

type Look = {
  glasses?: boolean;
  /** Hair with body at the sides rather than a flat cap. */
  volume?: boolean;
  bun?: boolean;
  /** Hair past the jaw, a narrower frame, and a ribbon in place of a tie. */
  woman?: boolean;
  /** A scarf, in this colour. */
  scarf?: number;
  cup?: boolean;
  pad?: boolean;
};

/**
 * Keyed by seat id, not by the order they happen to be listed in.
 *
 * Index keying meant a partner changed face whenever the roster was filtered
 * differently, which is unsettling in a room you are supposed to recognise.
 */
const LOOKS: Record<string, Look> = {
  chair: { woman: true, volume: true, pad: true },
  gp: { glasses: true, pad: true },
  principal: { woman: true, bun: true, cup: true },
  skeptic: { volume: true, scarf: 0xa8442f, pad: true },
  "devils-advocate": { glasses: true, volume: true, cup: true },
};

const FALLBACK_LOOK: Look = { volume: true };

const TABLE_RX = 2.5;
const TABLE_RZ = 1.55;

/**
 * How far the table edge is from the middle, along one seat's line.
 *
 * Seats used to sit on their own ellipse, which left a gap that changed with
 * the angle: some partners rested their hands on the table and others on thin
 * air. Measuring from the table means every seat is the same distance from it.
 */
function edgeAt(a: number) {
  const c = Math.cos(a) / TABLE_RX;
  const z = Math.sin(a) / TABLE_RZ;
  return 1 / Math.sqrt(c * c + z * z);
}

/** A capsule stretched between two joints, so a limb can be posed by its ends. */
function limb(from: THREE.Vector3, to: THREE.Vector3, radius: number, mat: THREE.Material) {
  const dir = new THREE.Vector3().subVectors(to, from);
  const mesh = new THREE.Mesh(
    new THREE.CapsuleGeometry(radius, Math.max(dir.length() - radius * 2, 0.02), 4, 10),
    mat
  );
  mesh.position.copy(from).add(to).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  mesh.castShadow = true;
  return mesh;
}

function tieColor(stance?: number): number {
  if (stance === undefined) return 0x6b7280;
  if (stance > 0.2) return 0x3fb950;
  if (stance < -0.2) return 0xe5534b;
  return 0xd9a441;
}

/**
 * Seat i of n, spread across the far side of the table.
 *
 * They used to ring it completely, which sat two partners with their backs to
 * you for the whole meeting: you could not see their faces, and the faces are
 * the point. A pitch is not arranged that way either. The committee is on one
 * side of the table and you are on the other.
 */
function seatAngle(i: number, n: number) {
  if (n < 2) return -Math.PI / 2;
  return -Math.PI / 2 + (i / (n - 1) - 0.5) * Math.PI * 0.76;
}

type Person = {
  group: THREE.Group;
  head: THREE.Mesh;
  torso: THREE.Mesh;
  tie: THREE.Mesh;
  glow: THREE.Mesh;
  angle: number;
  /** This partner's own suit, since they no longer share one. */
  suit: number;
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
    scene.fog = new THREE.Fog(0xe9e5dc, 12, 30);

    const cam = new THREE.PerspectiveCamera(38, el.clientWidth / el.clientHeight, 0.1, 100);
    // At the head of the table, a little above eye level, looking down it.
    // Far enough back that the two nearest partners are whole rather than
    // cropped to a shoulder, which is what a tighter frame did.
    cam.position.set(0, 2.6, 8.9);
    cam.lookAt(0, 1.5, -1.1);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    // Without a shadow under them the figures hover, and hovering is most of
    // what "not rendered" looks like.
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setSize(el.clientWidth, el.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    el.appendChild(renderer.domElement);
    renderer.domElement.style.cursor = "pointer";

    // ---- light ----------------------------------------------------------
    scene.add(new THREE.HemisphereLight(0xfdfbf6, 0xbfb9ab, 1.9));

    const key = new THREE.DirectionalLight(0xfffaf0, 1.35);
    key.position.set(3, 8, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -7;
    key.shadow.camera.right = 7;
    key.shadow.camera.top = 7;
    key.shadow.camera.bottom = -7;
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 24;
    key.shadow.bias = -0.0012;
    scene.add(key);

    const fill = new THREE.DirectionalLight(0xc9d6ea, 0.6);
    fill.position.set(-5, 3, -4);
    scene.add(fill);

    // A soft light from where you are sitting. The lamp is directly overhead,
    // so without this every face turned toward you is in its own shadow.
    const faceLight = new THREE.DirectionalLight(0xfff4e2, 0.5);
    faceLight.position.set(0, 2.4, 9);
    scene.add(faceLight);

    // The lamp over the table, which is what makes it read as a room.
    const lamp = new THREE.PointLight(0xffe9cc, 22, 15, 2);
    lamp.position.set(0, 3.1, 0);
    scene.add(lamp);

    // ---- the table ------------------------------------------------------
    const table = new THREE.Group();

    const top = new THREE.Mesh(
      new THREE.CylinderGeometry(TABLE_RX, TABLE_RX, 0.14, 64),
      new THREE.MeshStandardMaterial({ color: 0x8a6544, roughness: 0.5, metalness: 0.04 })
    );
    top.scale.set(1, 1, TABLE_RZ / TABLE_RX);
    top.receiveShadow = true;
    top.position.y = 0.92;
    table.add(top);

    const plinth = new THREE.Mesh(
      new THREE.CylinderGeometry(1.3, 1.65, 0.9, 32),
      new THREE.MeshStandardMaterial({ color: 0x6f5540, roughness: 0.82 })
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
      new THREE.MeshStandardMaterial({ color: 0xdedacf, roughness: 1 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // A wall around them. Without it the far partners sat against nothing and
    // the top of the frame was dead space. Fog eats the top, so it reads as a
    // dark room rather than a cylinder.
    const wall = new THREE.Mesh(
      new THREE.CylinderGeometry(13, 13, 9, 48, 1, true),
      new THREE.MeshStandardMaterial({
        color: 0xeae5da,
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

      // Pushed back a fixed distance from the table edge, facing the middle.
      const d = edgeAt(a) + 0.62;
      group.position.set(Math.cos(a) * d, 0, Math.sin(a) * d);
      group.rotation.y = -a - Math.PI / 2;

      const skin = SKINS[i % SKINS.length];
      const hair = HAIR[s.id] ?? FALLBACK_HAIR;
      const suit = SUITS[i % SUITS.length];
      const look = LOOKS[s.id] ?? FALLBACK_LOOK;

      const suitMat = new THREE.MeshStandardMaterial({ color: suit, roughness: 0.78 });
      const suitLit = new THREE.MeshStandardMaterial({
        color: new THREE.Color(suit).multiplyScalar(1.38),
        roughness: 0.8,
      });
      const skinMat = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.82 });
      const hairMat = new THREE.MeshStandardMaterial({ color: hair, roughness: 0.96 });
      const shirtMat = new THREE.MeshStandardMaterial({
        color: SHIRTS[i % SHIRTS.length],
        roughness: 0.62,
      });
      const darkMat = new THREE.MeshStandardMaterial({ color: 0x12151c, roughness: 0.4 });

      // chair
      const chair = new THREE.Mesh(
        new THREE.BoxGeometry(0.74, 0.92, 0.13),
        new THREE.MeshStandardMaterial({ color: 0x4a5160, roughness: 0.9 })
      );
      chair.position.set(0, 0.96, -0.46);
      chair.castShadow = true;
      group.add(chair);

      // jacket
      const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.33, 0.44, 6, 16), suitMat);
      torso.scale.set(look.woman ? 1.05 : 1.16, 1, look.woman ? 0.74 : 0.78);
      torso.position.y = 1.2;
      torso.castShadow = true;
      group.add(torso);

      // shoulders, so the silhouette reads as a jacket rather than a pill
      const shoulders = new THREE.Mesh(
        new THREE.CapsuleGeometry(look.woman ? 0.15 : 0.17, look.woman ? 0.5 : 0.62, 4, 12),
        suitLit
      );
      shoulders.rotation.z = Math.PI / 2;
      shoulders.position.y = 1.42;
      shoulders.castShadow = true;
      group.add(shoulders);

      // shirt, showing in the V between the lapels
      // A narrow V. At full width this read as a pale bib with a jacket drawn
      // round it, rather than a suit with a shirt under it.
      const shirt = new THREE.Mesh(new THREE.ConeGeometry(0.115, 0.3, 3), shirtMat);
      shirt.rotation.x = Math.PI;
      shirt.position.set(0, 1.4, 0.26);
      group.add(shirt);

      // Lapels and a collar. This is the detail that turns a capsule into a
      // suit, and it costs eight triangles.
      for (const side of [-1, 1]) {
        const lapel = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.36, 0.03), suitLit);
        lapel.position.set(side * 0.145, 1.31, 0.27);
        lapel.rotation.set(-0.08, 0, side * 0.26);
        group.add(lapel);

        const collar = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.07, 0.04), shirtMat);
        collar.position.set(side * 0.1, 1.48, 0.2);
        collar.rotation.z = side * 0.42;
        group.add(collar);
      }

      // What they are wearing at the collar carries where they stand. A tie on
      // some, a ribbon on others: one mesh either way, so the frame loop that
      // lerps its colour does not care which.
      const stanceMat = new THREE.MeshStandardMaterial({
        color: tieColor(s.stance),
        roughness: 0.38,
      });

      const tie = look.woman
        ? new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.055, 0.05), stanceMat)
        : new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.28, 0.03), stanceMat);
      tie.position.set(0, look.woman ? 1.47 : 1.31, look.woman ? 0.24 : 0.3);
      group.add(tie);

      if (!look.woman) {
        const knot = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.07, 0.045), stanceMat);
        knot.position.set(0, 1.46, 0.26);
        group.add(knot);
      }

      // neck
      const neck = new THREE.Mesh(
        new THREE.CylinderGeometry(look.woman ? 0.072 : 0.085, look.woman ? 0.086 : 0.1, 0.18, 12),
        skinMat
      );
      neck.position.y = 1.55;
      group.add(neck);

      // Arms, resting on the table in front of them.
      //
      // Their absence is what made these read as unfinished. A torso with a
      // head on it is a mannequin; a person puts their hands somewhere.
      for (const side of [-1, 1]) {
        const w = look.woman ? 0.9 : 1;
        const shoulder = new THREE.Vector3(side * 0.37 * w, 1.4, 0.02);
        const elbow = new THREE.Vector3(side * 0.43 * w, 1.11, 0.19);
        const wrist = new THREE.Vector3(side * 0.25 * w, 1.04, 0.5);

        group.add(limb(shoulder, elbow, 0.098, suitMat));
        group.add(limb(elbow, wrist, 0.084, suitMat));

        // a cuff of shirt where the sleeve ends
        const cuff = new THREE.Mesh(
          new THREE.CylinderGeometry(0.07, 0.07, 0.032, 10),
          shirtMat
        );
        cuff.position.copy(wrist).lerp(elbow, 0.3);
        cuff.quaternion.setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          new THREE.Vector3().subVectors(wrist, elbow).normalize()
        );
        group.add(cuff);

        const hand = new THREE.Mesh(new THREE.SphereGeometry(0.085, 14, 12), skinMat);
        hand.position.copy(wrist);
        hand.scale.set(0.95, 0.6, 1.35);
        hand.castShadow = true;
        group.add(hand);
      }

      // head
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.235, 24, 20), skinMat);
      head.position.y = 1.75;
      head.scale.set(1, 1.08, 0.95);
      head.castShadow = true;
      group.add(head);

      // A face. Everything below hangs off the head, so it turns when they do
      // and the room reads as people looking at each other.
      for (const side of [-1, 1]) {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.034, 12, 10), darkMat);
        eye.position.set(side * 0.082, 0.02, 0.198);
        head.add(eye);

        const brow = new THREE.Mesh(new THREE.BoxGeometry(0.078, 0.02, 0.022), hairMat);
        brow.position.set(side * 0.084, 0.088, 0.2);
        brow.rotation.z = side * -0.14;
        head.add(brow);

        const ear = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), skinMat);
        ear.position.set(side * 0.225, -0.01, -0.01);
        ear.scale.set(0.45, 1, 0.8);
        head.add(ear);
      }

      const nose = new THREE.Mesh(new THREE.SphereGeometry(0.036, 10, 8), skinMat);
      nose.position.set(0, -0.045, 0.215);
      nose.scale.set(0.8, 1, 0.9);
      head.add(nose);

      const mouth = new THREE.Mesh(
        new THREE.BoxGeometry(0.072, 0.016, 0.02),
        new THREE.MeshStandardMaterial({ color: 0x8a4f45, roughness: 0.7 })
      );
      mouth.position.set(0, -0.125, 0.198);
      head.add(mouth);

      if (look.glasses) {
        const frame = new THREE.MeshStandardMaterial({
          color: 0x0f1219,
          roughness: 0.32,
          metalness: 0.25,
        });
        for (const side of [-1, 1]) {
          const rim = new THREE.Mesh(new THREE.TorusGeometry(0.069, 0.013, 8, 20), frame);
          rim.position.set(side * 0.086, 0.02, 0.206);
          head.add(rim);

          const arm = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.014, 0.17), frame);
          arm.position.set(side * 0.155, 0.03, 0.125);
          head.add(arm);
        }
        const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.014, 0.014), frame);
        bridge.position.set(0, 0.028, 0.214);
        head.add(bridge);
      }

      // Hair with some mass to it. A single smooth skullcap read as a bald
      // mannequin, which was half of why these looked unrendered.
      // Two pieces, because one shell cannot do both jobs. A cap generous
      // enough to cover the back of the head came down over the eyes and
      // nose, which is exactly why they looked faceless.
      const cap = new THREE.Mesh(
        new THREE.SphereGeometry(0.248, 20, 16, 0, Math.PI * 2, 0, Math.PI * 0.36),
        hairMat
      );
      cap.position.set(0, 0.012, -0.012);
      cap.scale.set(1.03, 1.05, 1.05);
      cap.castShadow = true;
      head.add(cap);

      // the mass at the back and sides, which sits behind the face
      const back = new THREE.Mesh(new THREE.SphereGeometry(0.242, 18, 14), hairMat);
      back.position.set(0, 0.015, -0.085);
      back.scale.set(0.99, 0.98, 0.86);
      back.castShadow = true;
      head.add(back);

      // Hair that carries on past the jaw. Read with the narrower frame it is
      // what makes a figure in the same suit as the others read as a woman,
      // and it is honest geometry rather than a colour swap.
      if (look.woman) {
        for (const side of [-1, 1]) {
          const fall = new THREE.Mesh(new THREE.CapsuleGeometry(0.105, 0.28, 5, 12), hairMat);
          fall.position.set(side * 0.2, -0.15, -0.045);
          fall.scale.set(0.82, 1, 1.2);
          fall.rotation.z = side * 0.12;
          fall.castShadow = true;
          head.add(fall);
        }
        const nape = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.2, 5, 12), hairMat);
        nape.position.set(0, -0.12, -0.15);
        nape.scale.set(1.12, 1, 0.78);
        nape.castShadow = true;
        head.add(nape);
      }

      if (look.volume) {
        for (const side of [-1, 1]) {
          const puff = new THREE.Mesh(new THREE.SphereGeometry(0.118, 14, 12), hairMat);
          puff.position.set(side * 0.155, 0.05, -0.05);
          puff.scale.set(0.85, 1, 1.15);
          head.add(puff);
        }
      }
      if (look.bun) {
        const bun = new THREE.Mesh(new THREE.SphereGeometry(0.108, 14, 12), hairMat);
        bun.position.set(0, 0.04, -0.215);
        head.add(bun);
      }

      if (look.scarf) {
        const scarfMat = new THREE.MeshStandardMaterial({ color: look.scarf, roughness: 0.96 });
        const loop = new THREE.Mesh(new THREE.TorusGeometry(0.155, 0.058, 10, 22), scarfMat);
        loop.rotation.x = Math.PI / 2;
        loop.position.y = 1.57;
        loop.scale.set(1, 1, 0.88);
        loop.castShadow = true;
        group.add(loop);

        const tail = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.24, 0.06), scarfMat);
        tail.position.set(0.08, 1.44, 0.2);
        tail.rotation.z = 0.14;
        group.add(tail);
      }

      // What is in front of them. A boardroom table is never empty, and a
      // notepad reads as somebody who did the reading.
      if (look.pad) {
        const pad = new THREE.Mesh(
          new THREE.BoxGeometry(0.3, 0.012, 0.21),
          new THREE.MeshStandardMaterial({ color: 0xdcd8cd, roughness: 0.92 })
        );
        pad.position.set(0.02, 1.005, 0.56);
        pad.rotation.y = 0.12;
        pad.castShadow = true;
        group.add(pad);
      }
      if (look.cup) {
        const cup = new THREE.Mesh(
          new THREE.CylinderGeometry(0.052, 0.043, 0.11, 14),
          new THREE.MeshStandardMaterial({ color: 0xe6e0d4, roughness: 0.78 })
        );
        cup.position.set(-0.4, 1.054, 0.48);
        cup.castShadow = true;
        group.add(cup);
      }

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

      people.current.set(s.id, { group, head, torso, tie, glow, angle: a, turn: 0, suit });

      // nameplate
      const plate = document.createElement("div");
      plate.className =
        "absolute left-0 top-0 whitespace-nowrap rounded-[2px] px-2 py-[2px] font-mono text-[12px] uppercase tracking-[0.1em] transition-opacity duration-200 pointer-events-none";
      plate.style.background = "rgba(255,255,255,0.94)";
      plate.style.border = "1px solid var(--border)";
      plate.style.boxShadow = "0 2px 6px -2px rgb(23 26 32 / 0.35)";
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

    /**
     * How far back the camera has to sit for the whole row to fit.
     *
     * The room is much narrower when a conversation is open beside it, and at
     * that aspect a fixed distance cropped the partners at each end.
     */
    const fitDistance = () => {
      const vHalf = (cam.fov / 2) * (Math.PI / 180);
      const hHalf = Math.atan(Math.tan(vHalf) * cam.aspect);
      return Math.max(7.5, Math.min(17, 3.3 / Math.tan(hHalf) + 1));
    };
    const camTarget = new THREE.Vector3(0, 2.6, 8.9);
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
            2.4,
            p.group.position.z * 0.5 + Math.max(4.2, fitDistance() * 0.62)
          );
          lookTarget.set(p.group.position.x * 0.75, 1.6, p.group.position.z * 0.75);
        }
      } else {
        camTarget.set(0, 2.6, fitDistance());
        lookTarget.set(0, 1.5, -1.1);
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
          wantsDim
            ? new THREE.Color(0x171d2a)
            : new THREE.Color(p.suit).multiplyScalar(isSpeaking ? 1.3 : 1),
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
          const pd = edgeAt(p.angle) - 0.21;
          tmp.set(Math.cos(p.angle) * pd, 1.02, Math.sin(p.angle) * pd).project(cam);
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
