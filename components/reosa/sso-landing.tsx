"use client";

// REOSA: die Anmeldeseite im Betrieb bei REOSA (lib/reosa/sso-gate.ts).
//
// Kein Formular, kein Passwort, kein zweiter Faktor, kein eigener Server: Die
// Anmeldung geschieht beim Anmeldedienst der Plattform. Diese Fläche zeigt
// nur, was gerade passiert. Die automatische Weiterleitung selbst ist die von
// Bulwark (AUTO_SSO_ENABLED mit OAUTH_ONLY, samt ihrem Schutz vor Schleifen:
// nach einem Fehler und nach bewusstem Abmelden startet sie nicht von selbst).
// Dann steht hier ein Knopf, und der Quelltext-Link (AGPL-3.0 Abschnitt 13).

import { SourceCodeLink } from "@/components/reosa/source-code-link";

const TEXT = {
  de: {
    redirecting: "Weiterleitung zur Anmeldung",
    title: "Webmail",
    body: "Melden Sie sich mit Ihrem Konto an.",
    errorTitle: "Anmeldung nicht abgeschlossen",
    errorBody: "Die Anmeldung wurde abgebrochen oder ist abgelaufen. Melden Sie sich erneut an.",
    addAccountTitle: "Ein weiteres Konto ist hier nicht möglich",
    addAccountBody: "Das Webmail öffnet das Postfach, das zu Ihrem Konto gehört.",
    signIn: "Anmelden",
    retry: "Erneut anmelden",
    back: "Zurück zum Postfach",
  },
  en: {
    redirecting: "Redirecting to sign in",
    title: "Webmail",
    body: "Sign in with your account.",
    errorTitle: "Sign-in not completed",
    errorBody: "The sign-in was cancelled or has expired. Please sign in again.",
    addAccountTitle: "Another account is not possible here",
    addAccountBody: "Webmail opens the mailbox that belongs to your account.",
    signIn: "Sign in",
    retry: "Sign in again",
    back: "Back to the mailbox",
  },
} as const;

export interface ReosaSsoLandingProps {
  locale: string;
  loading: boolean;
  error: string | null;
  addAccount: boolean;
  onStart: () => void;
  homeHref: string;
}

export function ReosaSsoLanding({ locale, loading, error, addAccount, onStart, homeHref }: ReosaSsoLandingProps) {
  const t = locale.toLowerCase().startsWith("de") ? TEXT.de : TEXT.en;
  const title = addAccount ? t.addAccountTitle : error ? t.errorTitle : t.title;
  const body = addAccount ? t.addAccountBody : error ? t.errorBody : t.body;

  return (
    <main className="min-h-[100dvh] flex flex-col items-center justify-center bg-background px-4 pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]">
      <div className="w-full max-w-sm text-center">
        {loading && !addAccount ? (
          <p role="status" aria-live="polite" className="text-base text-foreground">
            {t.redirecting}
          </p>
        ) : (
          <>
            <h1 className="text-xl font-semibold text-foreground">{title}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{body}</p>
            {addAccount ? (
              <a
                href={homeHref}
                className="mt-6 inline-flex min-h-[44px] items-center justify-center rounded-md px-4 text-sm font-medium text-primary"
              >
                {t.back}
              </a>
            ) : (
              <button
                type="button"
                onClick={onStart}
                className="mt-6 inline-flex min-h-[48px] w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
              >
                {error ? t.retry : t.signIn}
              </button>
            )}
          </>
        )}
        <p className="mt-8 text-xs text-muted-foreground">
          <SourceCodeLink className="underline-offset-2 hover:underline" />
        </p>
      </div>
    </main>
  );
}
