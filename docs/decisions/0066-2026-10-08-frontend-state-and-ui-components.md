# 0066 — Frontend state & UI components: Zustand + shadcn/ui (Radix + Tailwind)

- **Date:** 2026-10-08
- **Status:** Accepted
- **Resolves:** a deferred item in [0011](0011-2026-10-08-frontend-stack.md)

## Note on how this was decided
> The product owner has **no prior experience with these libraries** and accepted the recommended option as-is.
> Treat this decision as **lower-confidence** than the others: it rests on the assistant's recommendation, not on the owner's evaluation. Re-examine it freely if the libraries cause friction once real UI work starts. Revisiting it is expected, not a reversal.

## Options considered
- **Zustand + Radix/shadcn** ✅ (recommended)
- Zustand + Mantine
- Redux Toolkit + MUI

## What these are, in brief
- **Zustand:** a tiny state-management library. A "store" is a plain object with functions that change it, and components subscribe to *slices* of it through selectors. It works **outside React**, which matters because the editor core must be React-free ([0052](0052-2026-10-08-svg-commitment-and-performance-gate.md)).
- **Radix UI:** unstyled, accessible building blocks for interactive widgets (dialogs, menus, popovers, tabs) that handle keyboard navigation and screen readers.
- **shadcn/ui:** not a dependency but a *collection of copy-in components* built on Radix and styled with **Tailwind CSS** (utility classes). The component source lives in our repo (`frontend/src/components/ui`), so we own and can change it.

## Decision
- The **client plan store** (the floor plan being edited) and editor UI state use **Zustand**, as a vanilla store created in the headless editor core. React components subscribe through fine-grained selectors so that only affected elements re-render (SVG performance, [0052](0052-2026-10-08-svg-commitment-and-performance-gate.md)).
- **Server data** (sites, people, assignments) stays in **TanStack Query** ([0039](0039-2026-10-08-frontend-api-client.md)), not in Zustand.
- UI components (panels, dialogs, forms, menus, tables) come from **shadcn/ui** on **Radix**, styled with **Tailwind CSS v4**.

## Consequences
- A small dependency footprint. Component code is in-repo and can be changed freely.
- Developers need to learn Tailwind's utility-class style. This is the most visible learning cost for someone new to the stack.
- **Revisit triggers:** the admin screens need many complex data tables or forms (Mantine's batteries may then pay off), or the selector discipline in Zustand proves error-prone.
