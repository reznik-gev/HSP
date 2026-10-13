import { useQuery } from "@tanstack/react-query";
import { LogOut } from "lucide-react";
import { useTranslation } from "react-i18next";

import { initials, meQuery, signOut } from "@/auth/session";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** The signed-in person: who they are, their role, and signing out (docs/0087). */
export function UserMenu() {
  const { t } = useTranslation();
  const { data: me } = useQuery(meQuery);
  if (!me) return null;
  const name = me.name ?? me.email ?? me.subject;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t("user.menu", { name })}>
          <span className="grid size-7 place-items-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
            {initials(me)}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="font-medium">{name}</div>
          {me.email && me.email !== name && (
            <div className="text-xs text-muted-foreground">{me.email}</div>
          )}
          <div className="mt-1 text-xs text-muted-foreground">
            {t(me.is_admin ? "user.admin" : "user.viewer")}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void signOut()}>
          <LogOut className="rtl:-scale-x-100" aria-hidden />
          {t("user.signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
