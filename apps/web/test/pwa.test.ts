import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import manifest from "../src/app/manifest";

/**
 * PWA installability and offline shell checks: the manifest must expose the
 * metadata Chrome's installability criteria require, and every route the service
 * worker precaches must still be a real page.
 */

const SW_SOURCE = readFileSync(fileURLToPath(new URL("../public/sw.js", import.meta.url)), "utf8");
const APP_DIR = fileURLToPath(new URL("../src/app", import.meta.url));

describe("web app manifest", () => {
  const value = manifest();

  it("provides the install metadata", () => {
    expect(value.id).toBe("/");
    expect(value.lang).toBe("en");
    expect(value.name).toBe("HolyWord Bible");
    expect(value.short_name).toBe("HolyWord");
    expect(value.start_url).toBe("/");
    expect(value.scope).toBe("/");
    expect(value.display).toBe("standalone");
    expect(value.theme_color).toBe("#123B8F");
    expect(value.background_color).toBe("#F4F7FB");
  });

  it("declares icons for every required density", () => {
    const icons = value.icons ?? [];
    const purposes = icons.map((icon) => `${icon.sizes}:${icon.purpose}`);
    expect(purposes).toContain("192x192:any");
    expect(purposes).toContain("512x512:any");
    expect(purposes).toContain("512x512:maskable");
  });

  it("offers Read and Search shortcuts", () => {
    expect(value.shortcuts?.map((shortcut) => shortcut.url)).toEqual(["/read", "/search"]);
  });
});

describe("service worker shell", () => {
  const shellStart = SW_SOURCE.indexOf("const SHELL_ROUTES = [");
  const shellEnd = SW_SOURCE.indexOf("];", shellStart);
  const shellBlock = SW_SOURCE.slice(shellStart, shellEnd);
  const routes = [...shellBlock.matchAll(/"(\/[^"]*)"/g)]
    .map((match) => match[1])
    .filter((route): route is string => Boolean(route));

  it("precaches the core reading routes", () => {
    expect(routes).toEqual(
      expect.arrayContaining([
        "/",
        "/read",
        "/search",
        "/study",
        "/library",
        "/settings",
        "/login",
      ]),
    );
  });

  it("only precaches routes that exist as pages", () => {
    expect(routes.length).toBeGreaterThan(0);
    for (const route of routes) {
      const segment = route === "/" ? "page" : `${route.slice(1)}/page`;
      const file = `${APP_DIR}/${segment}.tsx`;
      expect(existsSync(file), `sw.js precaches ${route} but ${file} does not exist`).toBe(true);
    }
  });

  it("registers a background sync handler for the shared tag", () => {
    expect(SW_SOURCE).toContain('event.tag === "holyword-sync"');
    expect(SW_SOURCE).toContain('event.data?.type === "REQUEST_SYNC"');
  });
});
