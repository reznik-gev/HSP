/**
 * A side panel over the page (docs/0088 choice 5): slides in from the end side (the right in
 * English, the left in Hebrew), keeps the list behind it visible under a light overlay, traps
 * focus while open and closes with Escape. Built on Radix Dialog, shadcn/ui style (docs/0066).
 */
import { X } from "lucide-react";
import { Dialog as Primitive } from "radix-ui";
import type * as React from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { isInsideNotice } from "@/lib/notify";
import { cn } from "@/lib/utils";

export const Sheet = Primitive.Root;
export const SheetTrigger = Primitive.Trigger;
export const SheetClose = Primitive.Close;

export function SheetContent({
  className,
  children,
  onInteractOutside,
  ...props
}: React.ComponentProps<typeof Primitive.Content>) {
  const { t } = useTranslation();
  return (
    <Primitive.Portal>
      <Primitive.Overlay className="fixed inset-0 z-40 bg-black/15 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
      <Primitive.Content
        className={cn(
          "fixed inset-y-0 end-0 z-50 flex w-full max-w-md flex-col border-s bg-card shadow-xl outline-none",
          "data-[state=open]:animate-in data-[state=open]:duration-200",
          "data-[state=open]:slide-in-from-right rtl:data-[state=open]:slide-in-from-left",
          className,
        )}
        // Clicking Undo in a notice must not close the panel (docs/0088 choice 6).
        onInteractOutside={(e) => {
          if (isInsideNotice(e.target)) e.preventDefault();
          onInteractOutside?.(e);
        }}
        {...props}
      >
        {children}
        <Primitive.Close asChild>
          <Button
            variant="ghost"
            size="icon"
            className="absolute end-3 top-3"
            aria-label={t("common.close")}
          >
            <X aria-hidden />
          </Button>
        </Primitive.Close>
      </Primitive.Content>
    </Primitive.Portal>
  );
}

export function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("border-b px-6 py-5 pe-14", className)} {...props} />;
}

export function SheetTitle({ className, ...props }: React.ComponentProps<typeof Primitive.Title>) {
  return <Primitive.Title className={cn("text-lg font-semibold", className)} {...props} />;
}

export function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof Primitive.Description>) {
  return (
    <Primitive.Description
      className={cn("mt-1 text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

export function SheetBody({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex-1 space-y-6 overflow-y-auto px-6 py-5", className)} {...props} />;
}

export function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex justify-end gap-2 border-t px-6 py-4", className)} {...props} />;
}
