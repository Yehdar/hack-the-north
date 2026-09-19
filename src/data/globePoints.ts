import type { SeatId } from "@/lib/types";
import type { FigureKind } from "@/lib/discovery/types";
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

/** Each partner's figure matches the voice they already speak in. */
const SEATS: { id: SeatKey; label: string; figure: FigureKind }[] = [
  { id: "gp", label: "Lead Partner", figure: "boy" },
  { id: "principal", label: "Principal", figure: "girl" },
  { id: "skeptic", label: "Skeptical Partner", figure: "boy" },
  { id: "devils-advocate", label: "Devil's Advocate", figure: "girl" },
];

/** Degrees between neighbouring partners: wide enough that four figures stand
 *  side by side without touching, at every distance the camera allows. */
const SEAT_SPACING = 2.8;

/**
 * The committee stands in a row at the firm's HQ, facing you — a panel, which
 * is what an investment committee is. They used to sit on a small ring as
 * dots; as figures, a ring stacked heads on feet. Longitude is stretched by
 * latitude so the row keeps its spacing in Stockholm as well as in Lagos.
 */
export function seatPointsAt(hubId: string): Record<SeatKey, GlobePoint & { figure: FigureKind }> {
  const hub = hubById(hubId) ?? hubById("sf")!;
  const stretch = 1 / Math.max(0.35, Math.cos((hub.lat * Math.PI) / 180));

  return Object.fromEntries(
    SEATS.map((s, i) => [
      s.id,
      {
        id: s.id,
        label: s.label,
        figure: s.figure,
        lat: hub.lat,
        lon: hub.lon + (i - (SEATS.length - 1) / 2) * SEAT_SPACING * stretch,
      },
    ])
  ) as Record<SeatKey, GlobePoint & { figure: FigureKind }>;
}

export const SEAT_POINTS = seatPointsAt("sf");
