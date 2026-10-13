import { useNavigate } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

/** The top-bar search (docs/0087): Enter opens the Seats page with the results. "/" focuses it. */
export function GlobalSearch() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const input = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && e.target.closest("input, textarea");
      if (e.key === "/" && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <form
      role="search"
      className="relative w-full max-w-sm"
      onSubmit={(e) => {
        e.preventDefault();
        const query = q.trim();
        if (!query) return;
        void navigate({ to: "/seats", search: { q: query } });
        setQ("");
        input.current?.blur();
      }}
    >
      <Search
        className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <input
        ref={input}
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t("search.placeholderShort")}
        aria-label={t("search.label")}
        aria-keyshortcuts="/"
        className="h-8 w-full rounded-md border border-input bg-background ps-8 pe-8 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
      />
      <kbd
        aria-hidden
        className="pointer-events-none absolute end-2 top-1/2 -translate-y-1/2 rounded border px-1.5 text-[11px] text-muted-foreground"
      >
        /
      </kbd>
    </form>
  );
}
