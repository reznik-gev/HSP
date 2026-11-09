/**
 * Keyboard and mouse (docs/0130): every key and mouse move in the editor, in groups, in a side
 * sheet so the plan stays in view. Opens with ?, from the hint line, or from the top bar.
 * A new editor move needs a row here.
 */
import { useTranslation } from "react-i18next";

import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

import { TOOLS } from "./ToolStrip";

/** Each group's rows: ids under `editor.keys.rows`, each with `keys` and `what`. */
const GROUPS: { group: string; rows: string[] }[] = [
  {
    group: "select",
    rows: [
      "click",
      "shiftClick",
      "shiftDrag",
      "esc",
      "drag",
      "arrows",
      "shiftArrows",
      "typeDistance",
      "rotate",
      "delete",
    ],
  },
  { group: "walls", rows: ["wallBody", "wallEnd", "altDetach", "zoneCorner"] },
  {
    group: "drawing",
    rows: [
      "place",
      "typeLength",
      "shift",
      "alt",
      "endWall",
      "closeZone",
      "rotatePlacing",
      "numberDrag",
    ],
  },
  { group: "editing", rows: ["undo", "redo", "copy", "paste", "pasteBeside", "help"] },
  { group: "view", rows: ["pan", "zoom"] },
];

export function KeysSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const tools = [
    ...TOOLS.map(({ tool, key }) => ({ id: tool, keys: key, what: t(`editor.tools.${tool}`) })),
    { id: "grid", keys: t("editor.keys.rows.grid.keys"), what: t("editor.keys.rows.grid.what") },
  ];
  const groups = [
    { group: "tools", rows: tools },
    ...GROUPS.map(({ group, rows }) => ({
      group,
      rows: rows.map((id) => ({
        id,
        keys: t(`editor.keys.rows.${id}.keys`),
        what: t(`editor.keys.rows.${id}.what`),
      })),
    })),
  ];
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{t("editor.keys.title")}</SheetTitle>
          <SheetDescription>{t("editor.keys.description")}</SheetDescription>
        </SheetHeader>
        <SheetBody className="space-y-5">
          {groups.map(({ group, rows }) => (
            <section key={group} aria-labelledby={`keys-${group}`}>
              <h3 id={`keys-${group}`} className="mb-1.5 text-sm font-semibold">
                {t(`editor.keys.groups.${group}`)}
              </h3>
              <dl className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-x-4 gap-y-1.5 text-sm">
                {rows.map(({ id, keys, what }) => (
                  <div key={id} className="contents">
                    <dt>
                      <kbd className="rounded border bg-muted px-1.5 py-0.5 font-sans text-xs">
                        {keys}
                      </kbd>
                    </dt>
                    <dd className="text-muted-foreground">{what}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
