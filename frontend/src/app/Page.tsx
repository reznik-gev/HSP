import type { ReactNode } from "react";

/** A page: a title and its content, start-aligned and kept to a readable width. */
export function Page({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mx-auto max-w-6xl px-8 py-7">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <div className="mt-6">{children}</div>
    </div>
  );
}

/** What a page shows when there's nothing to list yet: one sentence saying what goes here. */
export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <p className="max-w-prose rounded-md border border-dashed bg-card px-5 py-8 text-muted-foreground">
      {children}
    </p>
  );
}
