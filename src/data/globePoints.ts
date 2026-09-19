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

/**
 * The committee sits at the firm's HQ, fanned out slightly so seats in the same
 * city stay individually clickable rather than overlapping into one dot.
 */
export const SEAT_POINTS: Record<SeatId | "devils-advocate", GlobePoint> = {
  gp: { id: "gp", label: "General Partner", lat: 37.77, lon: -122.42 },
  principal: { id: "principal", label: "Principal", lat: 37.42, lon: -122.14 },
  skeptic: { id: "skeptic", label: "Skeptic", lat: 37.49, lon: -122.79 },
  "devils-advocate": { id: "devils-advocate", label: "Devil's Advocate", lat: 38.15, lon: -122.6 },
};
