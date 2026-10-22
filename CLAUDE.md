# CLAUDE.md für reosa-mail

Fork von Bulwark Webmail (AGPL-3.0-only) für das Webmail der Plattform REOSA.
Betrieb, Umgebung und Gründe: README, Abschnitt „Betrieb bei REOSA“. Spec im
Repo der Plattform (`davdxpx/REOSA`): `reosa-docs/30-email/06-mailboxes.md`,
`08-operations.md`, Entscheidungen E11, E17, E18 in `11-open-decisions.md`.

## Die Grenzen (gelten für jede Änderung)

1. **Eigene Origin** unter `mail.<domain>`; nie in einer Sitzung von Konsole
   oder REOSA Sales, nie in ein `iframe` der Plattform.
2. **Nur JMAP mit Stalwart.** Kein Zugang zur Datenbank der Plattform, kein
   Verwaltungs-Zugang zum Mailserver. Das Konto `platform` und jedes Konto mit
   Impersonation ist ein Generalschlüssel und kommt nie hierher; die
   Impersonation von Bulwark (`BULWARK_JWT_AUTH_SECRET`,
   `BULWARK_STALWART_MASTER_*`) bleibt aus.
3. **Nur das Postfach der angemeldeten Person.** Keine Funktionsadressen.
4. **Nichts an Dritte.** Keine Telemetrie, keine Abrufe bei fremden Diensten
   (Übersetzung, Symbole, Push-Relay, Update-Prüfung); ein neuer Weg nach
   draußen bekommt einen Schalter, der in `Dockerfile.reosa` auf aus steht.
5. **Quelltext sichtbar** (AGPL-3.0 §13): der Link „Quelltext“ auf der
   Anmeldeseite und unter Einstellungen > Über bleibt.
6. **LICENSE und NOTICE bleiben**, Urheberhinweise von Bulwark ebenso.

## Upstream-Abgleich

Eigene Änderungen klein halten und mit `REOSA` markieren (Kommentar an der
Stelle), eigene Dateien unter `lib/reosa/`, `components/reosa/`,
`deploy/reosa/`, `Dockerfile.reosa`. Dateien von Bulwark nur dort anfassen,
wo kein Schalter von außen reicht, und dann mit einer Zeile statt eines
Umbaus. `Dockerfile` und `docker-compose.yml` von Bulwark bleiben unverändert.

## Prüfen

`npm ci`, `npm run lint`, `npm run typecheck`, `npx vitest run` (alle grün).
Commits als `𝕏0L0™ <davdxpx@gmail.com>`, Conventional Commits, letzte Zeile
„Developed by @davdxpx“. Eine neue Fassung im Betrieb: Commit hier, Tag
setzen, Commit in `tooling/scripts/compose-units.ts` der Plattform anheben,
`bun gen:compose`.

Texte: Deutsch mit echten Umlauten, kein Gedankenstrich als Satzzeichen.
