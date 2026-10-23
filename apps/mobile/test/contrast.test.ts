import { describe, expect, it } from "vitest";
import { BRAND } from "../src/lib/config";
import { DARK, LIGHT, readingPalette } from "../src/theme";

/**
 * WCAG AA verification for the mobile theme (spec §10: "Meet WCAG AA contrast in
 * both themes"), plus the brand palette the app must use.
 */

function toLinear(channel: number): number {
  return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const value = hex.replace("#", "").trim();
  if (!/^[0-9a-f]{6}$/i.test(value)) throw new Error(`not a 6-digit hex colour: ${hex}`);
  const channels = [0, 2, 4].map(
    (offset) => Number.parseInt(value.slice(offset, offset + 2), 16) / 255,
  );
  const r = toLinear(channels[0] ?? 0);
  const g = toLinear(channels[1] ?? 0);
  const b = toLinear(channels[2] ?? 0);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const first = luminance(a);
  const second = luminance(b);
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}

function expectAA(foreground: string, background: string, label: string, minimum = 4.5): void {
  const ratio = contrast(foreground, background);
  expect(
    ratio,
    `${label}: ${foreground} on ${background} measured ${ratio.toFixed(2)}:1, needs ${minimum}:1`,
  ).toBeGreaterThanOrEqual(minimum);
}

function assertPalette(label: string, palette: typeof LIGHT): void {
  const { background, surface, surfaceAlt, text, muted, subtle, primary, onPrimary } = palette;
  const accents = {
    danger: palette.danger,
    success: palette.success,
    gold: palette.gold,
    cyan: palette.cyan,
    purple: palette.purple,
    emerald: palette.emerald,
  };

  expectAA(text, background, `${label} body text on background`);
  expectAA(text, surface, `${label} body text on surface`);
  expectAA(text, surfaceAlt, `${label} body text on alternate surface`);
  expectAA(muted, background, `${label} muted text on background`);
  expectAA(muted, surface, `${label} muted text on surface`);
  expectAA(subtle, surface, `${label} subtle text on surface`);
  expectAA(subtle, background, `${label} subtle text on background`);
  expectAA(primary, surface, `${label} primary text on surface`);
  expectAA(onPrimary, primary, `${label} button label on primary fill`);
  expectAA(text, palette.primarySoft, `${label} body text on primary tint`);
  for (const [name, colour] of Object.entries(accents)) {
    expectAA(colour, surface, `${label} ${name} text on surface`);
  }
}

describe("mobile theme contrast (WCAG AA)", () => {
  it("passes AA in the light palette", () => {
    assertPalette("light", LIGHT);
  });

  it("passes AA in the dark palette", () => {
    assertPalette("dark", DARK);
  });

  it("passes AA in every reading palette", () => {
    for (const theme of ["light", "sepia", "dark"] as const) {
      const palette = readingPalette(theme);
      expectAA(palette.text, palette.background, `${theme} reading scripture text`);
      expectAA(palette.muted, palette.background, `${theme} reading reference text`);
    }
  });

  it("uses the brand palette from spec section 10", () => {
    expect(BRAND).toEqual({
      royalBlue: "#123B8F",
      royalRed: "#C9182B",
      gold: "#F4B942",
      cyan: "#00B8D9",
      purple: "#6C3FC5",
      emerald: "#16A085",
      navy: "#081B3A",
      lightGray: "#F4F7FB",
      white: "#FFFFFF",
    });
    expect(LIGHT.background).toBe(BRAND.lightGray);
    expect(LIGHT.surface).toBe(BRAND.white);
    expect(LIGHT.text).toBe(BRAND.navy);
    expect(LIGHT.primary).toBe(BRAND.royalBlue);
  });
});
