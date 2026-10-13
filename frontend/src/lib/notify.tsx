/**
 * Notices for what just happened (docs/0088 choice 6): removals act at once and say what they
 * released, with Undo for 10 seconds. Built on Sonner (shadcn/ui's toast), themed with our
 * tokens and placed at the end side, so it mirrors in Hebrew.
 */
import { useTranslation } from "react-i18next";
import { Toaster as Sonner, toast } from "sonner";

import i18n from "@/i18n";

import { useTheme } from "./theme";

const UNDO_MS = 10_000;

export function Toaster() {
  const { i18n } = useTranslation();
  const choice = useTheme((s) => s.choice);
  const rtl = i18n.dir() === "rtl";
  return (
    <Sonner
      theme={choice}
      dir={rtl ? "rtl" : "ltr"}
      position={rtl ? "bottom-left" : "bottom-right"}
      // Clickable even while a side panel is open (Radix blocks pointer events outside it).
      style={{ pointerEvents: "auto" }}
      toastOptions={{
        classNames: {
          toast: "!bg-popover !text-popover-foreground !border-border !font-sans",
          description: "!text-muted-foreground",
          actionButton: "!bg-primary !text-primary-foreground",
        },
      }}
    />
  );
}

/** True for events inside a notice, so panels don't treat Undo as a click outside. */
export function isInsideNotice(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest("[data-sonner-toaster]") !== null;
}

export interface NoticeOptions {
  description?: string;
  /** Offer Undo; called if the user clicks it within 10 seconds. */
  undo?: () => void | Promise<void>;
}

export function notify(message: string, { description, undo }: NoticeOptions = {}) {
  return toast(message, {
    description,
    duration: undo ? UNDO_MS : 5_000,
    action: undo ? { label: i18n.t("common.undo"), onClick: () => void undo() } : undefined,
  });
}

export function notifyError(message: string) {
  return toast.error(message, { duration: 8_000 });
}
