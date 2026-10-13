/** Hebrew is right-to-left; everything else we ship is left-to-right (docs/0087). */
export function directionOf(language: string): "ltr" | "rtl" {
  return language.startsWith("he") ? "rtl" : "ltr";
}
