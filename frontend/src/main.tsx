import "./index.css";
import "./i18n";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { startThemeSync } from "./lib/theme";
import { router } from "./routes";

startThemeSync();

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: true, staleTime: 10_000 } },
});

const root = document.getElementById("root");
if (!root) throw new Error("#root element missing");

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
