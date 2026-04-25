// tests/first_run_tour.test.mjs — first-run gating logic.
//
// We don't render-test the JSX (no jsdom in this project); we cover the
// pure module-level helpers that gate visibility via localStorage. The
// component itself is exercised by visual review on the deployed site.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { shouldShowTour, markTourShown } from "../src/components/first_run_tour.jsx";

class FakeStorage {
  constructor() { this.store = new Map(); }
  getItem(k) { return this.store.has(k) ? this.store.get(k) : null; }
  setItem(k, v) { this.store.set(k, String(v)); }
  removeItem(k) { this.store.delete(k); }
  clear() { this.store.clear(); }
}

describe("first-run tour gating", () => {
  let originalWindow;
  beforeEach(() => {
    originalWindow = globalThis.window;
    globalThis.window = { localStorage: new FakeStorage() };
  });
  afterEach(() => {
    globalThis.window = originalWindow;
  });

  it("shouldShowTour returns true on first visit (no localStorage entry)", () => {
    expect(shouldShowTour()).toBe(true);
  });

  it("markTourShown writes the version flag", () => {
    markTourShown();
    expect(window.localStorage.getItem("fragment-viewer:tour-shown")).toBe("1");
  });

  it("shouldShowTour returns false after markTourShown for the same version", () => {
    markTourShown();
    expect(shouldShowTour()).toBe(false);
  });

  it("shouldShowTour returns true if a stale tour version was seen", () => {
    // Simulate a user who saw an older tour ("0"); the new tour version
    // is "1", so they should see the refreshed content.
    window.localStorage.setItem("fragment-viewer:tour-shown", "0");
    expect(shouldShowTour()).toBe(true);
  });

  it("returns false safely when window/localStorage is unavailable", () => {
    globalThis.window = undefined;
    expect(shouldShowTour()).toBe(false);
    // markTourShown is a no-op in this environment.
    expect(() => markTourShown()).not.toThrow();
  });
});
