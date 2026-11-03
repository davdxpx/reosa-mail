// REOSA: Einstellungen des Webmails nicht unbefristet aufheben (README,
// „Betrieb bei REOSA“; Spec der Plattform: reosa-docs/30-email/06-mailboxes.md,
// „Der Lebenslauf“, Datenschutzerklärung 7.30).
//
// Bulwark legt die Einstellungen einer Person (auch Signaturen und Vorlagen)
// verschlüsselt je Anmeldename und Server ab und löscht sie nie. Löscht die
// Plattform ein Postfach, erfährt das Webmail davon nichts, und wer den Namen
// später neu bekäme, lüde die alten Einstellungen. Deshalb: Jedes Laden zählt
// als Nutzung, und was SETTINGS_RETENTION_DAYS Tage nicht genutzt wurde, wird
// gelöscht.
//
// Seit Bulwark 1.17 liegen die Einstellungen im gemeinsamen Speicher
// (`getStore().collection('settings')`). Im lokalen Modus, so wie bei REOSA
// (ein Replikat, kein SHARED_STORE_URL), ist das weiter eine Datei
// `<SETTINGS_DATA_DIR>/<id>.enc`; die Frist hängt an ihrer Änderungszeit. Im
// geteilten Modus gibt es keine Datei: Dann läuft nichts, und das Protokoll
// sagt es einmal (eine stille Lücke wäre ein gebrochenes Versprechen).

import { readdir, stat, unlink, utimes } from 'node:fs/promises';
import path from 'node:path';

export const SETTINGS_RETENTION_DAYS_DEFAULT = 180;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Tage bis zum Löschen; `null` mit `off` (dann löscht nichts). */
export function settingsRetentionDays(env: Record<string, string | undefined> = process.env): number | null {
  const raw = env.SETTINGS_RETENTION_DAYS?.trim().toLowerCase();
  if (raw === 'off') return null;
  const days = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isInteger(days) && days >= 1 ? days : SETTINGS_RETENTION_DAYS_DEFAULT;
}

/** Ein Laden zählt als Nutzung; scheitert das, bleibt es beim alten Stand. */
export async function markSettingsUsed(filePath: string, now: Date = new Date()): Promise<void> {
  try {
    await utimes(filePath, now, now);
  } catch {
    // Kein Grund, das Laden scheitern zu lassen.
  }
}

/**
 * Löscht die Datei einer Person (`<id>.enc`) samt ihren Nebendateien
 * (`<id>.enc.tmp` beim Schreiben, beiseitegelegte unlesbare Kopien), wenn sie
 * länger als die Frist ungenutzt ist. Andere Dateien bleiben.
 */
export async function purgeStaleSettings(dir: string, maxAgeDays: number, now: number = Date.now()): Promise<number> {
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
    if (!/^[0-9a-f]{64}\.enc/.test(name)) continue;
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

let timer: ReturnType<typeof setInterval> | null = null;

/** Beim Start und danach täglich, nur auf dem Leader; nie mit Namen oder Inhalt im Protokoll. */
export async function startSettingsRetention(env: Record<string, string | undefined> = process.env): Promise<void> {
  const days = settingsRetentionDays(env);
  if (days === null || timer) return;
  const { isSharedMode } = await import('@/lib/shared-store');
  if (isSharedMode()) {
    console.warn('Webmail-Einstellungen: geteilter Speicher, die Frist von SETTINGS_RETENTION_DAYS greift nicht.');
    return;
  }
  const { getSettingsDir } = await import('@/lib/settings-sync');
  const dir = getSettingsDir();
  const run = () => {
    purgeStaleSettings(dir, days)
      .then((removed) => {
        if (removed > 0) console.info(`Webmail-Einstellungen: ${removed} ungenutzte gelöscht.`);
      })
      .catch((err) => {
        console.warn('Webmail-Einstellungen: Aufräumen gescheitert:', (err as NodeJS.ErrnoException).code ?? 'unbekannt');
      });
  };
  run();
  timer = setInterval(run, DAY_MS);
  timer.unref?.();
}

export function stopSettingsRetention(): void {
  if (timer) clearInterval(timer);
  timer = null;
}

/** Für den Scheduler-Leader von Bulwark (instrumentation.node.ts): läuft auf genau einem Replikat. */
export const settingsRetentionJob = {
  start: () => startSettingsRetention(),
  stop: async () => stopSettingsRetention(),
};
