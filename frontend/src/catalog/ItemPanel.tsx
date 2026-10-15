/**
 * One catalog item in the side panel (docs/0095). Built-in items are read-only (docs/0083);
 * Make a copy turns one into a custom item to change, and opens the copy.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy } from "lucide-react";
import { useTranslation } from "react-i18next";

import { api } from "@/api/client";
import { asProblem, problemMessage } from "@/api/problems";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetSection,
  SheetTitle,
} from "@/components/ui/sheet";
import { notify, notifyError } from "@/lib/notify";

import { type CatalogItem, categoryName, copyItem, sizeText } from "./data";
import { FlagBadges } from "./FlagBadges";
import { ItemPreview } from "./ItemPreview";

export const catalogItemQuery = (id: string) => ({
  queryKey: ["catalog-items", "one", id],
  queryFn: async (): Promise<CatalogItem> => {
    const { data } = await api.GET("/api/v1/catalog-items/{item_id}", {
      params: { path: { item_id: id } },
    });
    if (!data) throw new Error("Couldn't load the item");
    return data;
  },
});

export function ItemPanel({
  itemId,
  onClose,
  onOpen,
}: {
  itemId: string;
  onClose: () => void;
  /** Opens another item, e.g. a copy just made. */
  onOpen: (id: string) => void;
}) {
  const { t } = useTranslation();
  const item = useQuery(catalogItemQuery(itemId));
  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent aria-describedby={undefined}>
        <SheetHeader>
          <SheetTitle>{item.data?.name ?? " "}</SheetTitle>
          {item.data && <SheetDescription>{categoryName(t, item.data.category)}</SheetDescription>}
        </SheetHeader>
        {item.isError ? (
          <SheetBody>
            <p role="alert" className="text-destructive">
              {t("catalog.loadFailed")}
            </p>
          </SheetBody>
        ) : item.data ? (
          <>
            <SheetBody>
              {item.data.builtin && (
                <p className="rounded-md bg-muted px-3 py-2 text-sm">{t("catalog.builtinNote")}</p>
              )}
              {item.data.archived_at && (
                <p className="rounded-md bg-muted px-3 py-2 text-sm">{t("catalog.archivedNote")}</p>
              )}
              <ItemDetails item={item.data} />
            </SheetBody>
            {item.data.builtin && (
              <SheetFooter>
                <CopyButton item={item.data} onCopied={onOpen} />
              </SheetFooter>
            )}
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

/** What an item is, read-only: its shape from above, size, colour and flags. */
export function ItemDetails({ item }: { item: CatalogItem }) {
  const { t } = useTranslation();
  const rev = item.current_revision;
  return (
    <SheetSection title={t("catalog.details")}>
      <ItemPreview
        item={rev}
        className="mx-auto h-32 w-full max-w-64"
        label={t("catalog.previewLabel", { name: item.name })}
      />
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        <dt className="text-muted-foreground">{t("catalog.fields.shape")}</dt>
        <dd>{t(`catalog.shapes.${rev.shape}`, { defaultValue: rev.shape })}</dd>
        <dt className="text-muted-foreground">{t("catalog.fields.size")}</dt>
        <dd className="tabular-nums">{t("catalog.sizeCm", { size: sizeText(rev) })}</dd>
        <dt className="text-muted-foreground">{t("catalog.fields.color")}</dt>
        <dd className="flex items-center gap-2">
          {rev.color ? (
            <>
              <span
                className="size-4 rounded-sm border"
                style={{ backgroundColor: rev.color }}
                aria-hidden
              />
              <span dir="ltr">{rev.color}</span>
            </>
          ) : (
            "–"
          )}
        </dd>
        <dt className="text-muted-foreground">{t("catalog.fields.key")}</dt>
        <dd dir="ltr" className="text-start font-mono text-xs">
          {item.key}
        </dd>
      </dl>
      <FlagBadges rev={rev} builtin={item.builtin} />
    </SheetSection>
  );
}

function CopyButton({ item, onCopied }: { item: CatalogItem; onCopied: (id: string) => void }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const copy = useMutation({
    mutationFn: () => copyItem(item, t("catalog.copyName", { name: item.name })),
    onSuccess: (made) => {
      void client.invalidateQueries({ queryKey: ["catalog-items"] });
      notify(t("catalog.copied", { name: made.name }));
      onCopied(made.id);
    },
    onError: (error) => notifyError(problemMessage(asProblem(error), t("common.failed"))),
  });
  return (
    <Button onClick={() => copy.mutate()} disabled={copy.isPending}>
      <Copy aria-hidden />
      {t("catalog.makeCopy")}
    </Button>
  );
}
