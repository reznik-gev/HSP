import { Check, Languages, Monitor, Moon, Sun, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LANGUAGES, type Language } from "@/i18n";
import { useSavePreference } from "@/lib/preferences";
import { useTheme, type ThemeChoice } from "@/lib/theme";

import { UserMenu } from "./UserMenu";

/** Each language is named in itself, so anyone can find their own. */
const LANGUAGE_NAMES: Record<Language, string> = { en: "English", he: "עברית" };

const THEMES: { choice: ThemeChoice; icon: LucideIcon }[] = [
  { choice: "light", icon: Sun },
  { choice: "dark", icon: Moon },
  { choice: "system", icon: Monitor },
];

export function TopBar() {
  return (
    <header className="flex h-12 shrink-0 items-center justify-end gap-1 border-b bg-card px-3">
      <LanguageMenu />
      <ThemeMenu />
      <UserMenu />
    </header>
  );
}

function LanguageMenu() {
  const { t, i18n } = useTranslation();
  const save = useSavePreference();
  const choose = (language: Language) => {
    void i18n.changeLanguage(language);
    save.mutate({ language });
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t("settings.language")}>
          <Languages aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          {t("settings.language")}
        </DropdownMenuLabel>
        {LANGUAGES.map((lng) => (
          <DropdownMenuItem key={lng} lang={lng} onSelect={() => choose(lng)}>
            <span className="flex-1">{LANGUAGE_NAMES[lng]}</span>
            {i18n.resolvedLanguage === lng && <Check aria-hidden />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ThemeMenu() {
  const { t } = useTranslation();
  const { choice, setChoice } = useTheme();
  const save = useSavePreference();
  const choose = (theme: ThemeChoice) => {
    setChoice(theme);
    save.mutate({ theme });
  };
  const Current = THEMES.find((x) => x.choice === choice)?.icon ?? Monitor;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t("settings.appearance")}>
          <Current aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          {t("settings.appearance")}
        </DropdownMenuLabel>
        {THEMES.map(({ choice: c, icon: Icon }) => (
          <DropdownMenuItem key={c} onSelect={() => choose(c)}>
            <Icon aria-hidden />
            <span className="flex-1">{t(`settings.${c}`)}</span>
            {choice === c && <Check aria-hidden />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
