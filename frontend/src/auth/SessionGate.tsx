import { useQuery } from "@tanstack/react-query";
import { useEffect, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

import { useSessionExpired } from "./expiry";
import { currentPath, loginUrl, meQuery, navigation } from "./session";

/**
 * Renders the app only for a signed-in user (docs/0087). Signed out: straight to the login page,
 * coming back to the same address afterwards. A session that ends while the app is open shows a
 * dialog instead, so nothing on screen disappears without explanation.
 */
export function SessionGate({ children }: { children: ReactNode }) {
  const me = useQuery(meQuery);
  if (me.isPending) return <Splash />;
  if (me.isError) return <Unreachable />;
  if (me.data === null) return <ToLogin />;
  return (
    <>
      {children}
      <ExpiredDialog />
    </>
  );
}

/** Nothing to show yet: the page background, so the shell doesn't flash in and out. */
function Splash() {
  return <div className="h-screen bg-background" aria-busy="true" />;
}

function ToLogin() {
  const { t } = useTranslation();
  useEffect(() => navigation.assign(loginUrl(currentPath())), []);
  return (
    <div className="grid h-screen place-items-center text-muted-foreground" role="status">
      {t("session.signingIn")}
    </div>
  );
}

function Unreachable() {
  const { t } = useTranslation();
  return (
    <div className="grid h-screen place-items-center px-8">
      <div className="max-w-sm space-y-4 text-center">
        <p role="alert">{t("session.unreachable")}</p>
        <Button variant="outline" onClick={() => window.location.reload()}>
          {t("session.reload")}
        </Button>
      </div>
    </div>
  );
}

function ExpiredDialog() {
  const { t } = useTranslation();
  const expired = useSessionExpired((s) => s.expired);
  return (
    <AlertDialog open={expired}>
      <AlertDialogContent>
        <AlertDialogTitle>{t("session.expiredTitle")}</AlertDialogTitle>
        <AlertDialogDescription>{t("session.expiredBody")}</AlertDialogDescription>
        <AlertDialogFooter>
          <AlertDialogAction onClick={() => navigation.assign(loginUrl(currentPath()))}>
            {t("session.signInAgain")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
