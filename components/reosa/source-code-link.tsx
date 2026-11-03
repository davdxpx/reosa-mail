"use client";

// REOSA: eigene Ergänzung des Forks (README, „Betrieb bei REOSA“).
//
// AGPL-3.0 Abschnitt 13: Wer eine veränderte Fassung im Netz anbietet, bietet
// allen, die mit ihr arbeiten, den Quelltext an. Upstream steht der Link unter
// Einstellungen > Über; im Betrieb bei REOSA steht er zusätzlich auf der
// Anmeldeseite, mit Passwort (login/page.tsx) wie mit SSO
// (components/reosa/sso-landing.tsx). Die Adresse kommt aus
// SOURCE_CODE_URL (die genaue Fassung, die läuft); die Plattform setzt sie in
// compose.email.yml immer. Fehlt sie trotzdem, steht der Hinweis ohne Link da,
// statt auf eine geratene Fassung zu zeigen.

import { useTranslations } from "next-intl";
import { useConfig } from "@/hooks/use-config";

export function SourceCodeLink({ className }: { className?: string }) {
  const t = useTranslations("settings.advanced");
  const { sourceCodeUrl } = useConfig();
  if (!sourceCodeUrl) return <span className={className}>{t("about.source_code")} (AGPL-3.0)</span>;
  return (
    <a href={sourceCodeUrl} target="_blank" rel="noopener noreferrer" className={className}>
      {t("about.source_code")}
    </a>
  );
}
