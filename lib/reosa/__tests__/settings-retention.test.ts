// @vitest-environment node
// REOSA: Einstellungen des Webmails werden nach der Frist geloescht (README,
// "Betrieb bei REOSA", Abschnitt "Einstellungen auf dem Server").
import { mkdtemp, readFile, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  markSettingsUsed,
  purgeStaleSettings,
  SETTINGS_RETENTION_DAYS_DEFAULT,
  settingsDir,
  settingsRetentionDays,
} from '@/lib/reosa/settings-retention';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 22);

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'reosa-settings-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function file(name: string, ageDays: number): Promise<string> {
  const target = path.join(dir, name);
  await writeFile(target, 'x');
  const at = new Date(NOW - ageDays * DAY);
  await utimes(target, at, at);
  return target;
}

describe('settingsRetentionDays', () => {
  it('nimmt 180 Tage als Vorgabe, eine ganze Zahl ab 1 und off', () => {
    expect(settingsRetentionDays({})).toBe(SETTINGS_RETENTION_DAYS_DEFAULT);
    expect(SETTINGS_RETENTION_DAYS_DEFAULT).toBe(180);
    expect(settingsRetentionDays({ SETTINGS_RETENTION_DAYS: '90' })).toBe(90);
    expect(settingsRetentionDays({ SETTINGS_RETENTION_DAYS: ' OFF ' })).toBeNull();
    expect(settingsRetentionDays({ SETTINGS_RETENTION_DAYS: '0' })).toBe(180);
    expect(settingsRetentionDays({ SETTINGS_RETENTION_DAYS: 'bald' })).toBe(180);
  });

  it('liest denselben Ordner wie lib/settings-sync.ts', async () => {
    expect(settingsDir({ SETTINGS_DATA_DIR: '/app/data/settings' })).toBe('/app/data/settings');
    const sync = await readFile(path.join(process.cwd(), 'lib/settings-sync.ts'), 'utf8');
    expect(sync).toContain("process.env.SETTINGS_DATA_DIR || path.join(process.cwd(), 'data', 'settings')");
  });
});

describe('purgeStaleSettings', () => {
  it('loescht nur, was laenger als die Frist ungenutzt ist', async () => {
    await file('alt.enc', 181);
    await file('liegen-geblieben.enc.tmp', 200);
    const fresh = await file('frisch.enc', 10);
    await file('fremd.json', 400);
    expect(await purgeStaleSettings(dir, 180, NOW)).toBe(2);
    await expect(stat(fresh)).resolves.toBeTruthy();
    await expect(stat(path.join(dir, 'fremd.json'))).resolves.toBeTruthy();
    await expect(stat(path.join(dir, 'alt.enc'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('haelt ein geladenes Profil am Leben', async () => {
    const used = await file('genutzt.enc', 400);
    await markSettingsUsed(used, new Date(NOW));
    expect(await purgeStaleSettings(dir, 180, NOW)).toBe(0);
  });

  it('kennt einen fehlenden Ordner als leer', async () => {
    expect(await purgeStaleSettings(path.join(dir, 'gibt-es-nicht'), 180, NOW)).toBe(0);
  });

  it('ist in Laden und Start eingehaengt', async () => {
    const sync = await readFile(path.join(process.cwd(), 'lib/settings-sync.ts'), 'utf8');
    expect(sync).toMatch(/markSettingsUsed\(filePath\)/);
    const start = await readFile(path.join(process.cwd(), 'instrumentation.node.ts'), 'utf8');
    expect(start).toMatch(/startSettingsRetention\(\)/);
  });
});
