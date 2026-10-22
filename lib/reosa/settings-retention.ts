// REOSA: Einstellungen des Webmails nicht unbefristet aufheben (README,
// "Betrieb bei REOSA", Abschnitt "Einstellungen auf dem Server"; Spec der
// Plattform: reosa-docs/30-email/06-mailboxes.md, "Der Lebenslauf").
//
// Bulwark legt die Einstellungen einer Person verschluesselt unter
// SETTINGS_DATA_DIR ab, eine Datei je Anmeldename und Server
// (lib/settings-sync.ts), und loescht sie nie. Darin stehen auch Signaturen
// und Vorlagen. Loescht die Plattform ein Postfach, erfaehrt das Webmail
// davon nichts, und wer den Namen spaeter neu bekaeme, laedt die alten
// Einstellungen. Deshalb: Jedes Laden zaehlt als Nutzung (mtime), und was
// SETTINGS_RETENTION_DAYS Tage nicht genutzt wurde, wird geloescht. Die Frist
// liegt weit vor einer neuen Vergabe des Namens (fruehestens 24 Monate nach
// dem Ende).

import { readdir, stat, unlink, utimes } from 'node:fs/promises';
import path from 'node:path';

export const SETTINGS_RETENTION_DAYS_DEFAULT = 180;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Tage bis zum Loeschen; `null` mit `off` (dann loescht nichts). */
export function settingsRetentionDays(
  env: Record<string, string | undefined> = process.env,
): number | null {
  const raw = env.SETTINGS_RETENTION_DAYS?.trim().toLowerCase();
  if (raw === 'off') return null;
  const days = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isInteger(days) && days >= 1 ? days : SETTINGS_RETENTION_DAYS_DEFAULT;
}

/** Derselbe Ordner wie in lib/settings-sync.ts. */
export function settingsDir(env: Record<string, string | undefined> = process.env): string {
  return env.SETTINGS_DATA_DIR || path.join(process.cwd(), 'data', 'settings');
}

/** Ein Laden zaehlt als Nutzung; scheitert das, bleibt es beim alten Stand. */
export async function markSettingsUsed(filePath: string, now: Date = new Date()): Promise<void> {
  try {
    await utimes(filePath, now, now);
  } catch {
    // Kein Grund, das Laden scheitern zu lassen.
  }
}

/**
 * Loescht jede Datei des Ordners (`.enc` und liegengebliebene `.tmp`), die
 * laenger als `maxAgeDays` nicht genutzt wurde. Gibt die Zahl zurueck; ein
 * fehlender Ordner heisst: nichts zu tun.
 */
export async function purgeStaleSettings(
  dir: string,
  maxAgeDays: number,
  now: number = Date.now(),
): Promise<number> {
  let names: string[];
  try {
    names = await readdir(dir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 0;
    throw error;
  }
  const cutoff = now - maxAgeDays * DAY_MS;
  let removed = 0;
  for (const name of names) {
    if (!name.endsWith('.enc') && !name.endsWith('.tmp')) continue;
    const file = path.join(dir, name);
    try {
      const info = await stat(file);
      if (!info.isFile() || info.mtimeMs >= cutoff) continue;
      await unlink(file);
      removed += 1;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  return removed;
}

/** Beim Start und danach taeglich; nie mit Namen oder Inhalt im Protokoll. */
export function startSettingsRetention(
  env: Record<string, string | undefined> = process.env,
): void {
  const days = settingsRetentionDays(env);
  if (days === null) return;
  const dir = settingsDir(env);
  const run = () => {
    purgeStaleSettings(dir, days)
      .then((removed) => {
        if (removed > 0) console.info(`Webmail-Einstellungen: ${removed} ungenutzte geloescht.`);
      })
      .catch((err) => {
        console.warn(
          'Webmail-Einstellungen: Aufraeumen gescheitert:',
          (err as NodeJS.ErrnoException).code ?? 'unbekannt',
        );
      });
  };
  run();
  setInterval(run, DAY_MS).unref();
}
