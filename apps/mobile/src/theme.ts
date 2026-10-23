import type { LocalPreferences } from "@holyword/offline";
import { BRAND } from "./lib/config";

export type AppThemeMode = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";
export type ReadingTheme = "light" | "sepia" | "dark";

export interface Palette {
  readonly background: string;
  readonly surface: string;
  readonly surfaceAlt: string;
  readonly text: string;
  readonly muted: string;
  readonly subtle: string;
  readonly border: string;
  readonly primary: string;
  readonly onPrimary: string;
  readonly primarySoft: string;
  readonly danger: string;
  readonly success: string;
  readonly gold: string;
  readonly cyan: string;
  readonly purple: string;
  readonly emerald: string;
  readonly scrim: string;
}

export const LIGHT: Palette = {
  background: BRAND.lightGray,
  surface: BRAND.white,
  surfaceAlt: "#EAF0FA",
  text: BRAND.navy,
  muted: "#3B4A61",
  subtle: "#5A6980",
  border: "#CBD6E7",
  primary: BRAND.royalBlue,
  onPrimary: BRAND.white,
  primarySoft: "#E4ECFB",
  danger: BRAND.royalRed,
  success: "#0F7A62",
  gold: "#8A5A00",
  cyan: "#006D80",
  purple: "#5530A8",
  emerald: "#0F7A62",
  scrim: "rgba(8, 27, 58, 0.55)",
};

export const DARK: Palette = {
  background: "#07152C",
  surface: "#0D2344",
  surfaceAlt: "#122D54",
  text: "#F7FAFF",
  muted: "#C5D3E8",
  subtle: "#9EB1CC",
  border: "#29456B",
  primary: "#8FB4FF",
  onPrimary: "#06142B",
  primarySoft: "#17345E",
  danger: "#FF8B97",
  success: "#4ED6B8",
  gold: BRAND.gold,
  cyan: "#56D9F0",
  purple: "#B9A0FF",
  emerald: "#56D9B8",
  scrim: "rgba(0, 0, 0, 0.65)",
};

export function resolveTheme(
  preference: AppThemeMode | undefined,
  system: "light" | "dark" | null | undefined,
): ResolvedTheme {
  if (preference === "dark") return "dark";
  if (preference === "light") return "light";
  return system === "dark" ? "dark" : "light";
}

export function paletteFor(resolved: ResolvedTheme): Palette {
  return resolved === "dark" ? DARK : LIGHT;
}

export interface ReadingPalette {
  readonly background: string;
  readonly text: string;
  readonly muted: string;
  readonly border: string;
  readonly highlight: string;
}

export function readingPalette(theme: ReadingTheme | undefined): ReadingPalette {
  switch (theme) {
    case "sepia":
      return {
        background: "#F7EDD3",
        text: "#332A1B",
        muted: "#6A5B44",
        border: "#D8C7A3",
        highlight: "#F1D796",
      };
    case "dark":
      return {
        background: "#07152C",
        text: "#F7FAFF",
        muted: "#B7C7DD",
        border: "#29456B",
        highlight: "#3B4C22",
      };
    default:
      return {
        background: "#FFFFFF",
        text: "#111B2B",
        muted: "#4C5A6E",
        border: "#D5DEEA",
        highlight: "#F8E7A1",
      };
  }
}

export const FONT_SCALE_MIN = 0.85;
export const FONT_SCALE_MAX = 1.6;
export const FONT_SCALE_STEP = 0.05;

export function fontScaleOf(preferences: LocalPreferences | null): number {
  return Math.min(FONT_SCALE_MAX, Math.max(FONT_SCALE_MIN, preferences?.font_scale ?? 1));
}

export const HIGHLIGHT_COLORS = [
  { id: "yellow", label: "Yellow", value: "#F4B942" },
  { id: "green", label: "Green", value: "#8FE3C1" },
  { id: "blue", label: "Blue", value: "#9FC5FF" },
  { id: "pink", label: "Pink", value: "#FFB3C7" },
  { id: "purple", label: "Purple", value: "#C9B3FF" },
] as const;
