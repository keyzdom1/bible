import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * WCAG AA verification for the web theme (spec §10: "Meet WCAG AA contrast in both
 * themes"). The values are read from globals.css so the test fails if a token edit
 * silently drops a text colour below 4.5:1.
 */

const CSS = readFileSync(fileURLToPath(new URL("../src/app/globals.css", import.meta.url)), "utf8");

function varsIn(selector: string): Record<string, string> {
  const start = CSS.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`selector not found in globals.css: ${selector}`);
  const end = CSS.indexOf("}", start);
  const block = CSS.slice(start, end);
  const found: Record<string, string> = {};
  for (const match of block.matchAll(/(--[\w-]+):\s*([^;]+);/g)) {
    const name = match[1];
    const value = match[2];
    if (name && value) found[name] = value.trim();
  }
  return found;
}

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

const base = varsIn(":root");
const light = { ...base, ...varsIn(':root[data-theme="light"]') };
const dark = { ...base, ...varsIn(':root[data-theme="dark"]') };
const readingLight = varsIn(':root[data-reading-theme="light"] .reading-surface');
const readingSepia = varsIn(':root[data-reading-theme="sepia"] .reading-surface');
const readingDark = varsIn(':root[data-reading-theme="dark"] .reading-surface');

function token(theme: Record<string, string>, name: string): string {
  const value = theme[name];
  if (!value) throw new Error(`missing theme token: ${name}`);
  if (!value.startsWith("#")) throw new Error(`theme token ${name} is not a hex colour: ${value}`);
  return value;
}

function assertTheme(
  label: string,
  theme: Record<string, string>,
  reading: Record<string, string>,
): void {
  const bg = token(theme, "--bg");
  const elevated = token(theme, "--bg-elevated");
  const text = token(theme, "--text");
  const muted = token(theme, "--text-muted");
  const subtle = token(theme, "--text-subtle");
  const primary = token(theme, "--primary");
  const onPrimary = token(theme, "--primary-contrast");
  const danger = token(theme, "--danger");
  const dangerSoft = token(theme, "--danger-soft");
  const success = token(theme, "--success");
  const successSoft = token(theme, "--success-soft");
  const warning = token(theme, "--warning");
  const warningSoft = token(theme, "--warning-soft");
  const goldText = token(theme, "--gold-text");

  expectAA(text, bg, `${label} body text on page background`);
  expectAA(text, elevated, `${label} body text on elevated card`);
  expectAA(muted, bg, `${label} muted text on page background`);
  expectAA(muted, elevated, `${label} muted text on elevated card`);
  expectAA(subtle, bg, `${label} subtle text on page background`);
  expectAA(subtle, elevated, `${label} subtle text on elevated card`);
  expectAA(primary, bg, `${label} links and primary text on page background`);
  expectAA(onPrimary, primary, `${label} button label on primary fill`);
  expectAA(danger, bg, `${label} danger text on page background`);
  expectAA(danger, dangerSoft, `${label} danger text on danger surface`);
  expectAA(success, bg, `${label} success text on page background`);
  expectAA(success, successSoft, `${label} success text on success surface`);
  expectAA(warning, warningSoft, `${label} warning text on warning surface`);
  expectAA(goldText, bg, `${label} gold label text on page background`);

  const readerBg = token(reading, "--reader-bg");
  const readerText = token(reading, "--reader-text");
  const readerMuted = token(reading, "--reader-muted");
  expectAA(readerText, readerBg, `${label} scripture text on reading surface`);
  expectAA(readerMuted, readerBg, `${label} reading reference text on reading surface`);
}

describe("web theme contrast (WCAG AA)", () => {
  it("passes AA in the light app theme", () => {
    assertTheme("light", light, readingLight);
  });

  it("passes AA in the dark app theme", () => {
    assertTheme("dark", dark, readingDark);
  });

  it("passes AA in the sepia reading theme", () => {
    const bg = token(readingSepia, "--reader-bg");
    expectAA(token(readingSepia, "--reader-text"), bg, "sepia scripture text");
    expectAA(token(readingSepia, "--reader-muted"), bg, "sepia reference text");
  });

  it("keeps the brand palette from spec section 10", () => {
    expect(base["--royal-blue"]).toBe("#123b8f");
    expect(base["--royal-red"]).toBe("#c9182b");
    expect(base["--gold"]).toBe("#f4b942");
    expect(base["--cyan"]).toBe("#00b8d9");
    expect(base["--purple"]).toBe("#6c3fc5");
    expect(base["--emerald"]).toBe("#16a085");
    expect(base["--navy"]).toBe("#081b3a");
    expect(base["--light-gray"]).toBe("#f4f7fb");
    expect(light["--bg-elevated"]).toBe("#ffffff");
  });
});
