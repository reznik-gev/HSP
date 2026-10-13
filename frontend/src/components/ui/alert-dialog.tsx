/**
 * A modal that needs the user's attention before they continue (Radix AlertDialog, shadcn/ui
 * style, docs/0066). Focus is trapped inside and Escape doesn't dismiss it silently.
 */
import { AlertDialog as Primitive } from "radix-ui";
import type * as React from "react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const AlertDialog = Primitive.Root;
export const AlertDialogTrigger = Primitive.Trigger;

export function AlertDialogContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof Primitive.Content>) {
  return (
    <Primitive.Portal>
      <Primitive.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
      <Primitive.Content
        className={cn(
          "fixed inset-0 z-50 m-auto grid h-fit w-full max-w-md gap-4 rounded-lg border bg-popover p-6 text-popover-foreground shadow-lg",
          "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
          className,
        )}
        {...props}
      >
        {children}
      </Primitive.Content>
    </Primitive.Portal>
  );
}

export function AlertDialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof Primitive.Title>) {
  return <Primitive.Title className={cn("text-base font-semibold", className)} {...props} />;
}

export function AlertDialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof Primitive.Description>) {
  return (
    <Primitive.Description className={cn("text-sm text-muted-foreground", className)} {...props} />
  );
}

export function AlertDialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex justify-end gap-2", className)} {...props} />;
}

export function AlertDialogAction({
  className,
  ...props
}: React.ComponentProps<typeof Primitive.Action>) {
  return <Primitive.Action className={cn(buttonVariants(), className)} {...props} />;
}
