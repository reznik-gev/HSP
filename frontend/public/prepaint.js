// Runs before the first paint so the page never flashes the wrong theme or direction
// (docs/0087). A separate file, not inline, so a strict Content-Security-Policy allows it (0060).
(function () {
  var root = document.documentElement;
  try {
    var saved = JSON.parse(localStorage.getItem("hsp.theme") || "{}");
    var choice = (saved.state && saved.state.choice) || "system";
    var dark =
      choice === "dark" ||
      (choice === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    root.classList.toggle("dark", dark);
    var lang = localStorage.getItem("hsp.language") || navigator.language || "en";
    var he = lang.indexOf("he") === 0;
    root.lang = he ? "he" : "en";
    root.dir = he ? "rtl" : "ltr";
  } catch {
    // Storage blocked: the app sets theme and direction itself once it starts.
  }
})();
