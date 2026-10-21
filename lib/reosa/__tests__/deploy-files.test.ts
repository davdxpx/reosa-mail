// @vitest-environment node
// REOSA: Die Dateien, die Dockerfile.reosa ins Abbild legt (deploy/reosa/admin),
// passen zu dem, was Bulwark von einem Konfigurations-Ordner erwartet.
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_FEATURE_GATES } from '@/lib/admin/types';

const dir = path.resolve(__dirname, '../../../deploy/reosa/admin');
const read = (file: string) => readFileSync(path.join(dir, file), 'utf-8');

describe('deploy/reosa/admin', () => {
  const policy = JSON.parse(read('policy.json'));
  const registry = JSON.parse(read('themes/registry.json')) as {
    themes: { id: string; contentHash: string; hasSkin: boolean; enabled: boolean }[];
  };

  it('kennt nur Schalter, die Bulwark auch hat', () => {
    for (const key of Object.keys(policy.features)) {
      expect(Object.keys(DEFAULT_FEATURE_GATES)).toContain(key);
    }
  });

  it('schaltet Erweiterungen von aussen, eigene Themes und eingebettete Seiten ab', () => {
    expect(policy.features).toMatchObject({
      pluginsEnabled: false,
      pluginsUploadEnabled: false,
      userThemesEnabled: false,
      sidebarAppsEnabled: false,
      accountArchivePasswordsEnabled: false,
    });
    // Symbole der Absender kaemen von einem Dritten; fest aus, nicht nur als Vorgabe.
    expect(policy.restrictions.senderFavicons).toEqual({ locked: true, value: false });
  });

  it('nennt als Vorgabe ein Theme, das im Ordner liegt, mit stimmender Pruefsumme', () => {
    const theme = registry.themes.find((t) => t.id === policy.themePolicy.defaultThemeId);
    expect(theme).toBeDefined();
    if (!theme) return;
    expect(theme.enabled).toBe(true);
    const css = read(`themes/${theme.id}.css`);
    const skin = theme.hasSkin ? read(`themes/${theme.id}.skin.css`) : '';
    const hash = createHash('sha256').update(css).update('\0').update(skin).digest('hex');
    expect(theme.contentHash).toBe(hash);
  });
});
