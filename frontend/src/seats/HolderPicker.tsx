/**
 * Pick who gets a seat (docs/0088 choice 4): type a name, email or team, choose with the mouse or
 * the arrow keys and Enter. People come from the people search; teams match by name. An ARIA
 * combobox, so screen readers announce the options.
 */
import { useQuery } from "@tanstack/react-query";
import { Users } from "lucide-react";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";

import { api } from "@/api/client";
import { inputClass } from "@/components/ui/field";
import { cn } from "@/lib/utils";
import { unitsQuery } from "@/org/units";

export type Holder =
  | { kind: "person"; id: string; name: string; detail: string }
  | { kind: "unit"; id: string; name: string; detail: string | null };

export function HolderPicker({
  onPick,
  teams = true,
  label,
}: {
  onPick: (holder: Holder) => void;
  /** Offer teams as well as people (a device is issued to a person only). */
  teams?: boolean;
  /** The field's accessible name, if not "who gets the seat". */
  label?: string;
}) {
  const { t, i18n } = useTranslation();
  const id = useId();
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const query = q.trim();
  const people = useQuery({
    queryKey: ["people", "picker", query],
    enabled: query.length > 0,
    queryFn: async () => {
      const { data } = await api.GET("/api/v1/people", {
        params: { query: { q: query, limit: 8 } },
      });
      return data?.items ?? [];
    },
  });
  const units = useQuery(unitsQuery);
  const needle = query.toLocaleLowerCase(i18n.resolvedLanguage);
  const options: Holder[] = query
    ? [
        ...(people.data ?? []).map((p): Holder => ({
          kind: "person",
          id: p.id,
          name: p.display_name,
          detail: p.email,
        })),
        ...(teams ? (units.data ?? []) : [])
          .filter(
            (u) =>
              !u.archived_at && u.name.toLocaleLowerCase(i18n.resolvedLanguage).includes(needle),
          )
          .slice(0, 5)
          .map((u): Holder => ({ kind: "unit", id: u.id, name: u.name, detail: u.level_label })),
      ]
    : [];
  const pick = (h: Holder | undefined) => {
    if (!h) return;
    setQ("");
    onPick(h);
  };
  return (
    <div className="relative">
      <input
        role="combobox"
        aria-expanded={options.length > 0}
        aria-controls={`${id}-list`}
        aria-activedescendant={options.length ? `${id}-${active}` : undefined}
        aria-autocomplete="list"
        aria-label={label ?? t("assign.pickLabel")}
        placeholder={t(teams ? "assign.pickPlaceholder" : "assign.pickPersonPlaceholder")}
        value={q}
        className={inputClass}
        onChange={(e) => {
          setQ(e.target.value);
          setActive(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, options.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            pick(options[active]);
          } else if (e.key === "Escape") {
            setQ("");
          }
        }}
      />
      {options.length > 0 && (
        <ul
          id={`${id}-list`}
          role="listbox"
          aria-label={t("assign.pickLabel")}
          className="absolute inset-x-0 top-full z-20 mt-1 max-h-72 overflow-auto rounded-md border bg-popover py-1 shadow-md"
        >
          {options.map((o, i) => (
            <li
              key={`${o.kind}-${o.id}`}
              id={`${id}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              // mousedown, not click: picking must win over the input losing focus.
              onMouseDown={(e) => {
                e.preventDefault();
                pick(o);
              }}
              className={cn(
                "flex cursor-default items-center gap-2 px-3 py-1.5 text-sm",
                i === active && "bg-accent text-accent-foreground",
              )}
            >
              {o.kind === "unit" && <Users className="size-4 text-muted-foreground" aria-hidden />}
              <span className="min-w-0 flex-1 truncate">{o.name}</span>
              {o.detail && (
                <span
                  className="truncate text-xs text-muted-foreground"
                  dir={o.kind === "person" ? "ltr" : undefined}
                >
                  {o.kind === "unit" ? t("assign.team") : o.detail}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
