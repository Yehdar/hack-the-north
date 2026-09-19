import type { SeatId } from "@/lib/types";
import hubs from "./hubs.json";

// Hub coordinates come from the shared hubs.json that the persona generator
// also reads. Duplicating the list is how the globe and the crowd drift apart.

export type GlobePoint = {
  id: string;
  label: string;
  lat: number;
  lon: number;
  country?: string;
  capitalDensity?: number;
  note?: string;
};

export const HUB_POINTS: GlobePoint[] = (
  hubs as {
    id: string;
    name: string;
    country: string;
    lat: number;
    lon: number;
    capitalDensity: number;
    note: string;
  }[]
).map((h) => ({
  id: h.id,
  label: h.name,
  lat: h.lat,
  lon: h.lon,
  country: h.country,
  capitalDensity: h.capitalDensity,
  note: h.note,
}));

export function hubById(id: string): GlobePoint | undefined {
  return HUB_POINTS.find((h) => h.id === id);
}

type SeatKey = SeatId | "devils-advocate";

const SEATS: { id: SeatKey; label: string }[] = [
  { id: "gp", label: "General Partner" },
  { id: "principal", label: "Principal" },
  { id: "skeptic", label: "Skeptic" },
  { id: "devils-advocate", label: "Devil's Advocate" },
];

/**
 * The committee sits round a table at the firm's HQ: four seats on a small
 * ring about the city, wide enough that each dot stays individually clickable
 * instead of merging into one. Longitude is stretched by latitude so the ring
 * stays round in Stockholm as well as in Lagos.
 */
export function seatPointsAt(hubId: string): Record<SeatKey, GlobePoint> {
  const hub = hubById(hubId) ?? hubById("sf")!;
  const ring = 1.6;
  const stretch = 1 / Math.max(0.35, Math.cos((hub.lat * Math.PI) / 180));

  return Object.fromEntries(
    SEATS.map((s, i) => {
      const a = (i / SEATS.length) * Math.PI * 2 + Math.PI / 4;
      return [
        s.id,
        {
          id: s.id,
          label: s.label,
          lat: hub.lat + Math.sin(a) * ring,
          lon: hub.lon + Math.cos(a) * ring * stretch,
        },
      ];
    })
  ) as Record<SeatKey, GlobePoint>;
}

export const SEAT_POINTS = seatPointsAt("sf");
