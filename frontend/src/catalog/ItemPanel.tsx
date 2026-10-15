/**
 * One catalog item in the side panel (docs/0095), or a new one. Built-in items are read-only
 * (docs/0083); Make a copy turns one into the organisation's own and opens the copy. Admins
 * change their own items in a form and archive them, with Undo (docs/0088); an archived item is
 * read-only until restored.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, ArchiveRestore, Copy } from "lucide-react";
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
import { ItemForm } from "./ItemForm";
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
  /** The item to show, or null for a new one. */
  itemId: string | null;
  onClose: () => void;
  /** Opens another item, e.g. a copy just made or a new item once created. */
  onOpen: (id: string) => void;
}) {
  const { t } = useTranslation();
  const item = useQuery({ ...catalogItemQuery(itemId ?? ""), enabled: !!itemId });
  const editable = item.data && !item.data.builtin && !item.data.archived_at;
  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent aria-describedby={undefined}>
        <SheetHeader>
          <SheetTitle>{itemId ? (item.data?.name ?? " ") : t("catalog.newItem")}</SheetTitle>
          {item.data && <SheetDescription>{categoryName(t, item.data.category)}</SheetDescription>}
        </SheetHeader>
        {!itemId ? (
          <SheetBody>
            <ItemForm item={null} onSaved={(saved) => onOpen(saved.id)} />
          </SheetBody>
        ) : item.isError ? (
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
              {editable ? (
                <ItemForm key={item.data.current_revision.id} item={item.data} onSaved={() => {}} />
              ) : (
                <ItemDetails item={item.data} />
              )}
            </SheetBody>
            <SheetFooter>
              {item.data.builtin ? (
                <CopyButton item={item.data} onCopied={onOpen} />
              ) : (
                <ArchiveButton item={item.data} />
              )}
            </SheetFooter>
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

/** Archives an item at once with Undo, or restores an archived one (docs/0088 choice 6). */
function ArchiveButton({ item }: { item: CatalogItem }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: ["catalog-items"] });
  const restore = async () => {
    const { error } = await api.POST("/api/v1/catalog-items/{item_id}/restore", {
      params: { path: { item_id: item.id } },
    });
    await refresh();
    if (error) notifyError(problemMessage(asProblem(error), t("common.failed")));
    return !error;
  };
  const change = useMutation({
    mutationFn: async () => {
      if (item.archived_at) {
        if (!(await restore())) return;
        notify(t("catalog.restored", { name: item.name }));
        return;
      }
      const { error } = await api.DELETE("/api/v1/catalog-items/{item_id}", {
        params: { path: { item_id: item.id } },
      });
      await refresh();
      if (error) {
        notifyError(problemMessage(asProblem(error), t("common.failed")));
        return;
      }
      notify(t("catalog.archived", { name: item.name }), {
        description: t("catalog.archivedHint"),
        undo: async () => {
          if (await restore()) notify(t("catalog.restored", { name: item.name }));
        },
      });
    },
  });
  return (
    <Button variant="outline" onClick={() => change.mutate()} disabled={change.isPending}>
      {item.archived_at ? <ArchiveRestore aria-hidden /> : <Archive aria-hidden />}
      {t(item.archived_at ? "catalog.restore" : "catalog.archive")}
    </Button>
  );
}
