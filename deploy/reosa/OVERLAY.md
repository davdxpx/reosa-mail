# REOSA-Overlay: Änderungslandkarte und Upstream-Sync

Dieser Fork ist Bulwark Webmail plus eine dünne Schicht für den Betrieb bei
REOSA. Maschinenlesbar steht die Schicht in [`overlay.json`](./overlay.json);
der Vertragstest [`lib/reosa/__tests__/overlay-contract.test.ts`](../../lib/reosa/__tests__/overlay-contract.test.ts)
prüft sie in jeder CI. Ziel: Nach 100 oder 2000 neuen Upstream-Commits sieht
man in Minuten, ob jeder Patch noch nötig ist und noch greift.

## Zweige

| Zweig | Inhalt | Wer schreibt |
|---|---|---|
| `main` | unveränderter Spiegel von `bulwarkmail/webmail` | nur der Sync (schneller Vorlauf, nie ein REOSA-Commit) |
| `reosa/integration` | Upstream plus genau diese Schicht; daraus baut REOSA | nur über Pull Requests im Fork |
| `feat/reosa-*`, `sync/upstream-*` | kurzlebige Arbeit | PR gegen `reosa/integration` |
| `release/reosa-2026.10.21`, `release/reosa-2026.10.22`, `feat/reosa-integration` | der alte Stand vor dem Sync vom 03.11.2026 | nie löschen, bis Integration und Rückweg bestätigt sind |

Produktion baut nie einen Zweig, sondern genau einen Commit: `WEBMAIL_COMMIT`
in `tooling/scripts/compose-units.ts` der Plattform, danach `bun gen:compose`.
Ein Sync von `main` ändert deshalb weder Abbild noch Produktion.

## Die Schicht

| Datei von Bulwark | Warum | Schalter | Test |
|---|---|---|---|
| `proxy.ts` | Tor der Anmeldung über die Plattform vor jeder Route | `REOSA_SSO_REQUIRED` | `sso-gate.test.ts` |
| `app/api/auth/sso/start/route.ts` | keine Mobil-Übergabe, kein Erneut-Anmelden, kein Slot, ein fester Rückweg | `REOSA_SSO_REQUIRED` | `sso-gate.test.ts` |
| `app/api/auth/stalwart-context/route.ts` | nur Bearer des Ausstellers | `REOSA_SSO_REQUIRED` | `sso-gate.test.ts` |
| `app/api/config/route.ts`, `hooks/use-config.ts`, `lib/config-validation.ts` | Schalter für die Anmeldeseite | `REOSA_SSO_REQUIRED` | `overlay-contract.test.ts` |
| `app/(main)/[locale]/login/page.tsx` | kein Formular im REOSA-Betrieb; Link „Quelltext“ auch auf der Anmeldeseite mit Passwort | `REOSA_SSO_REQUIRED` | `overlay-contract.test.ts` |
| `locales/de/common.json` | eine Zeile: „Quelltext“ statt „Quellcode“ | keiner | `overlay-contract.test.ts` |
| `app/(main)/[locale]/auth/callback/page.tsx` | Tiefenlink nur als interner Pfad | immer | `sso-gate.test.ts` |
| `lib/auth/verify-jmap-auth.ts`, `lib/stalwart/server-fetch.ts` | Abrufe des Servers über das Netz des Stapels | `JMAP_SERVER_INTERNAL_URL` | `reosa-switches.test.ts` |
| `lib/settings-sync.ts`, `instrumentation.node.ts` | ungenutzte Einstellungen nach 180 Tagen löschen | `SETTINGS_RETENTION_DAYS` | `settings-retention.test.ts` |

Eigene Dateien: `Dockerfile.reosa`, `deploy/reosa/**`, `components/reosa/**`,
`lib/reosa/**`, `CLAUDE.md`. `Dockerfile` und `docker-compose.yml` von Bulwark
bleiben unverändert.

**Durch Upstream ersetzt** (seit 1.17): die eigenen Schalter `TRANSLATE_PROXY`,
`SENDER_FAVICONS`, `NEXT_PUBLIC_PUSH_RELAY_URL=off` durch
`NO_THIRD_PARTY_TRAFFIC=true`. Der Link „Quelltext“ bleibt eigener Patch: Upstream
zeigt `SOURCE_CODE_URL` nur unter Einstellungen > Über, also erst nach der
Anmeldung; AGPL-3.0 Abschnitt 13 und die Grenze 5 in `CLAUDE.md` verlangen ihn
schon auf der Anmeldeseite, mit Passwort wie mit SSO.

## Ein Upstream-Sync

1. `main` aus Upstream nachziehen: nur als schneller Vorlauf. Scheitert er,
   hat Upstream seine Geschichte neu geschrieben (so am 03.11.2026); dann nichts
   erzwingen, sondern den neuen Stand als Tag sichern und wie unten weiter.
2. Zweig `sync/upstream-<datum>` von `reosa/integration`, `main` hineinmergen.
3. Konflikte von Hand lösen. Erst prüfen, ob Upstream den Zweck eines Patches
   inzwischen selbst erfüllt (Tabelle oben, Spalte „Warum“); dann den Patch
   streichen und `overlay.json` nachziehen.
4. `npm ci`, `npm run lint`, `npm run typecheck`, `npx vitest run` (darin der
   Vertragstest), Abbild mit `Dockerfile.reosa` bauen.
5. PR gegen `reosa/integration`, nach dem Merge Tag `reosa/<datum>` auf den
   Merge-Commit, dann `WEBMAIL_COMMIT` in der Plattform anheben.

Der Workflow [`reosa-upstream-sync.yml`](../../.github/workflows/reosa-upstream-sync.yml)
macht Schritt 1 und 2 von Hand ausgelöst oder wöchentlich und öffnet den PR.
Bei einem Konflikt öffnet er den PR mit dem Hinweis und ohne Lösung; er
überschreibt nie `reosa/integration` und deployt nichts.

## Rückweg

Der vorherige geprüfte Commit bleibt erreichbar (Tag oder `release/reosa-*`).
Zurück heißt: `WEBMAIL_COMMIT` auf ihn setzen, `bun gen:compose`, deployen.
Der Stand vor dem Sync vom 03.11.2026 ist `2903cb1` (`release/reosa-2026.10.22`).

## Probe vom 03.11.2026: ein simulierter Sync mit Konflikt

In einem Wegwerf-Klon: ein erfundener Upstream-Commit auf `main`, der genau
die Zeilen der REOSA-Haken in `proxy.ts` und `lib/stalwart/server-fetch.ts`
ändert, dann der Ablauf oben.

| Fall | Ergebnis |
|---|---|
| Merge in einen Sync-Zweig von `reosa/integration` | Konflikt in `lib/stalwart/server-fetch.ts`, Merge hält an; `lib/reosa/**` bleibt vollständig |
| Konflikt achtlos zugunsten von Upstream gelöst | Vertragstest rot: `lib/stalwart/server-fetch.ts: REOSA-Markierungen: expected 0 to be greater than or equal to 2` |
| Upstream mit neu geschriebener Geschichte (wie am 03.11.2026) | `main` ist kein Vorgänger mehr, der schnelle Vorlauf des Workflows bricht ab, nichts wird geändert |

## Mobil-Prüfung vom 03.11.2026 (Screenshot des Owners, Stand 2026.10.22)

| Befund | Stand auf `reosa/integration` |
|---|---|
| „Keine Ergebnisse gefunden“ zweimal (Trefferzeile über leerer Liste) | behoben in c2337ba: die Trefferzeile steht nur bei Treffern |
| Leere Liste nennt keine Ursache (nur Ungelesen, Suche, Ladefehler, leerer Ordner) | behoben in c2337ba (`emptyListKind`), mit „Filter aufheben“ bzw. „Erneut versuchen“; Test `email-list-empty-states.test.tsx` |
| Suchfeld zeigt „(drücken Sie /)“ auch auf Touch-Geräten | mit Bulwark 1.20.0 erledigt: das Suchfeld zeigt „Suchen...“, der Schlüssel `search_placeholder_hint` wird nirgends mehr gelesen |

Offen: Screenshots von 320 bis 768 px und am Gerät (Android, iOS), nach dem Bau
des Abbilds aus `reosa/integration`.
