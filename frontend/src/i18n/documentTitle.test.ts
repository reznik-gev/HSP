// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import en from "./en.json";
import he from "./he.json";

// The language saved after a switch (see `detection` in index.ts).
const SAVED_LANGUAGE_KEY = "musical_chairs.language";

async function loadI18n() {
  vi.resetModules();
  return (await import("./index")).default;
}

afterEach(() => {
  localStorage.clear();
});

describe("browser tab title (docs/0150, docs/0152)", () => {
  it("follows the language: the Hebrew name alone in Hebrew, the English name in English", async () => {
    const i18n = await loadI18n();
    await i18n.changeLanguage("en");
    expect(document.title).toBe(en.app.fullName);

    await i18n.changeLanguage("he");
    expect(document.title).toBe(he.app.fullName);

    await i18n.changeLanguage("en");
    expect(document.title).toBe(en.app.fullName);
  });

  it("is in Hebrew on first load when Hebrew was saved", async () => {
    localStorage.setItem(SAVED_LANGUAGE_KEY, "he");
    await loadI18n();
    expect(document.title).toBe(he.app.fullName);
  });
});
