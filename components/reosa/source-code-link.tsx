"use client";

// REOSA: eigene Ergaenzung des Forks (README, "Betrieb bei REOSA").
//
// AGPL-3.0 Abschnitt 13: Wer eine veraenderte Fassung im Netz anbietet, bietet
// allen, die mit ihr arbeiten, den Quelltext an. Upstream steht der Link nur
// unter Einstellungen > Ueber; hier steht er sichtbar schon auf der
// Anmeldeseite. Die Adresse kommt aus SOURCE_CODE_URL (die genaue Fassung,
// die laeuft), sonst das Repository von Bulwark.

import { useTranslations } from "next-intl";
import { useConfig } from "@/hooks/use-config";

export const UPSTREAM_SOURCE_URL = "https://github.com/bulwarkmail/webmail";

export function SourceCodeLink({ className }: { className?: string }) {
  const t = useTranslations("settings.advanced");
  const { sourceCodeUrl } = useConfig();
  return (
    <a
      href={sourceCodeUrl || UPSTREAM_SOURCE_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
    >
      {t("about.source_code")}
    </a>
  );
}
