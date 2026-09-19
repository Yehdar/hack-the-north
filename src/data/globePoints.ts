import type { SeatId } from "@/lib/types";

// ============================================================================
// GLOBE POSITIONS — presentational only. Track B owns this file.
//
// At the hour-11 integration this is replaced by Track A's src/data/hubs.ts as
// the source of hub coordinates; these exist so the globe is not empty while
// Track A is still building. The seat positions stay either way — the
// committee sits at the firm's HQ.
// ============================================================================

export type GlobePoint = { id: string; label: string; lat: number; lon: number };

/** Placeholder hubs. Track A's hubs.ts supersedes these. */
export const HUB_POINTS: GlobePoint[] = [
  { id: "sf", label: "San Francisco", lat: 37.77, lon: -122.42 },
  { id: "nyc", label: "New York", lat: 40.71, lon: -74.01 },
  { id: "toronto", label: "Toronto", lat: 43.65, lon: -79.38 },
  { id: "waterloo", label: "Waterloo", lat: 43.46, lon: -80.52 },
  { id: "london", label: "London", lat: 51.51, lon: -0.13 },
  { id: "berlin", label: "Berlin", lat: 52.52, lon: 13.4 },
  { id: "telaviv", label: "Tel Aviv", lat: 32.08, lon: 34.78 },
  { id: "bangalore", label: "Bangalore", lat: 12.97, lon: 77.59 },
  { id: "singapore", label: "Singapore", lat: 1.35, lon: 103.82 },
  { id: "saopaulo", label: "São Paulo", lat: -23.55, lon: -46.63 },
];

/**
 * The committee sits at the firm's HQ, fanned out slightly so three dots in
 * the same city remain individually clickable rather than overlapping into one.
 */
export const SEAT_POINTS: Record<SeatId | "devils-advocate", GlobePoint> = {
  gp: { id: "gp", label: "General Partner", lat: 37.77, lon: -122.42 },
  principal: { id: "principal", label: "Principal", lat: 37.42, lon: -122.14 },
  skeptic: { id: "skeptic", label: "Skeptic", lat: 37.49, lon: -122.79 },
  "devils-advocate": {
    id: "devils-advocate",
    label: "Devil's Advocate",
    lat: 38.15,
    lon: -122.6,
  },
};
