// @vitest-environment node
// REOSA: ungenutzte Einstellungen löschen (lib/reosa/settings-retention.ts).
import { mkdtemp, readFile, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  markSettingsUsed,
  purgeStaleSettings,
  SETTINGS_RETENTION_DAYS_DEFAULT,
  settingsRetentionDays,
} from '@/lib/reosa/settings-retention';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 3);
const ID_A = 'a'.repeat(64);
const ID_B = 'b'.repeat(64);
const ID_C = 'c'.repeat(64);
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
});

describe('purgeStaleSettings', () => {
  it('löscht nur Dateien von Personen, die länger als die Frist ungenutzt sind', async () => {
    await file(`${ID_A}.enc`, 181);
    await file(`${ID_B}.enc.tmp`, 200);
    const fresh = await file(`${ID_C}.enc`, 10);
    await file('fremd.json', 400);
    await file('anderes.tmp', 400);
    expect(await purgeStaleSettings(dir, 180, NOW)).toBe(2);
    await expect(stat(fresh)).resolves.toBeTruthy();
    await expect(stat(path.join(dir, 'fremd.json'))).resolves.toBeTruthy();
    await expect(stat(path.join(dir, 'anderes.tmp'))).resolves.toBeTruthy();
    await expect(stat(path.join(dir, `${ID_A}.enc`))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('hält ein geladenes Profil am Leben', async () => {
    const used = await file(`${ID_A}.enc`, 400);
    await markSettingsUsed(used, new Date(NOW));
    expect(await purgeStaleSettings(dir, 180, NOW)).toBe(0);
  });

  it('kennt einen fehlenden Ordner als leer', async () => {
    expect(await purgeStaleSettings(path.join(dir, 'gibt-es-nicht'), 180, NOW)).toBe(0);
  });

  it('ist in Laden und Start eingehängt, an der Datei, die der lokale Speicher schreibt', async () => {
    const sync = await readFile(path.join(process.cwd(), 'lib/settings-sync.ts'), 'utf8');
    expect(sync).toMatch(/markSettingsUsed\(path\.join\(getSettingsDir\(\), `\$\{settingsId\(username, serverUrl\)\}\.enc`\)\)/);
    expect(sync).toContain('file: (id) => `${id}.enc`');
    const start = await readFile(path.join(process.cwd(), 'instrumentation.node.ts'), 'utf8');
    expect(start).toContain('settingsRetentionJob');
  });
});
