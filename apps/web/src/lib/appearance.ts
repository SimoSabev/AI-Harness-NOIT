import type { Key } from "../i18n/t";

// D-599: Settings → Appearance, pure. The accent (Harnova green by default), the ground, Nova's colour and the size of
// everything are the person's, kept in cookies; the root layout turns them into <html> attributes and CSS variables,
// and tokens.css derives the rest (accent text and soft ground per theme). Only #rrggbb passes, so nothing reaches CSS
// but a colour.
export type Ground = "night" | "graphite" | "warm" | "black";
export interface Appearance { accent: string | null; ground: Ground; nova: string | null; scale: number }

export const ACCENTS: { id: string; hex: string | null; label: Key }[] = [
  { id: "green", hex: null, label: "look.accent.green" },
  { id: "indigo", hex: "#5e62ea", label: "look.accent.indigo" },
  { id: "blue", hex: "#2f7ff0", label: "look.accent.blue" },
  { id: "teal", hex: "#1aa39a", label: "look.accent.teal" },
  { id: "amber", hex: "#d9902a", label: "look.accent.amber" },
  { id: "rose", hex: "#d9527f", label: "look.accent.rose" },
];
export const GROUNDS: { id: Ground; label: Key; swatch: [string, string] }[] = [
  { id: "night", label: "look.ground.night", swatch: ["#10161a", "#161f24"] },
  { id: "graphite", label: "look.ground.graphite", swatch: ["#0e0f11", "#15161a"] },
  { id: "warm", label: "look.ground.warm", swatch: ["#12100e", "#1a1714"] },
  { id: "black", label: "look.ground.black", swatch: ["#000000", "#0a0d0f"] },
];
export const NOVAS: { id: string; hex: string | null; label: Key }[] = [
  { id: "accent", hex: null, label: "look.nova.accent" },
  { id: "lavender", hex: "#8d90ff", label: "look.nova.lavender" },
  { id: "aqua", hex: "#3fc7d8", label: "look.nova.aqua" },
  { id: "sunset", hex: "#f2a65a", label: "look.nova.sunset" },
  { id: "fuchsia", hex: "#e879b9", label: "look.nova.fuchsia" },
];
export const SCALES = [90, 95, 100, 105, 110, 115, 120] as const;

const HEX = /^#[0-9a-f]{6}$/;
const hex = (v: string | undefined): string | null => (v && HEX.test(v.toLowerCase()) ? v.toLowerCase() : null);

export function parseAppearance(c: { accent?: string | undefined; ground?: string | undefined; nova?: string | undefined; scale?: string | undefined }): Appearance {
  const ground = GROUNDS.some((g) => g.id === c.ground) ? (c.ground as Ground) : "night";
  const n = Number(c.scale);
  const near = SCALES.reduce((a, b) => (Math.abs(b - n) < Math.abs(a - n) ? b : a), 100);
  const scale = Number.isFinite(n) && n >= 85 && n <= 125 ? near : 100;
  return { accent: hex(c.accent), ground, nova: hex(c.nova), scale };
}

/** WCAG relative luminance → the readable ink on that colour */
export function inkOn(color: string): string {
  const v = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  const l = 0.2126 * (v[0] ?? 0) + 0.7152 * (v[1] ?? 0) + 0.0722 * (v[2] ?? 0);
  return l > 0.3 ? "#121807" : "#ffffff";
}

export function appearanceAttrs(a: Appearance): { data: Record<string, string>; style: Record<string, string> } {
  const data: Record<string, string> = {};
  const style: Record<string, string> = {};
  if (a.accent) {
    data["data-accent"] = "custom";
    style["--user-accent"] = a.accent;
    style["--user-accent-ink"] = inkOn(a.accent);
  }
  if (a.ground !== "night") data["data-ground"] = a.ground;
  if (a.nova) style["--nova"] = a.nova;
  if (a.scale !== 100) style.fontSize = `${a.scale}%`;
  return { data, style };
}
