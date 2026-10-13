/**
 * Translations (docs/0087): English and Hebrew, one JSON file per language. Every visible string
 * goes through `t()`; i18n.test.ts fails when a key exists in one language but not the other.
 *
 * The page direction follows the language (Hebrew is right-to-left). The floor-plan drawing
 * itself never mirrors (docs/0087 choice 6).
 */
import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";

import { directionOf } from "./direction";
import en from "./en.json";
import he from "./he.json";

export const LANGUAGES = ["en", "he"] as const;
export type Language = (typeof LANGUAGES)[number];

export const resources = { en: { translation: en }, he: { translation: he } } as const;

function applyToDocument(language: string): void {
  document.documentElement.lang = language;
  document.documentElement.dir = directionOf(language);
}

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    supportedLngs: LANGUAGES,
    nonExplicitSupportedLngs: true, // "he-IL" -> "he"
    fallbackLng: "en",
    interpolation: { escapeValue: false }, // React already escapes
    detection: {
      // First visit: the browser's language. After a switch: the saved choice (docs/0087).
      order: ["localStorage", "navigator"],
      lookupLocalStorage: "hsp.language",
      caches: ["localStorage"],
    },
  });

i18n.on("languageChanged", applyToDocument);
applyToDocument(i18n.resolvedLanguage ?? "en");

export default i18n;
