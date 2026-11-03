// @vitest-environment node
// REOSA: Vertragstest des Overlays (deploy/reosa/OVERLAY.md, overlay.json).
//
// Läuft in jeder CI und vor jedem Release-Pin. Er bricht, wenn ein
// Upstream-Sync eine REOSA-Datei, einen REOSA-Haken in einer Datei von
// Bulwark, einen Bau-Schritt in Dockerfile.reosa, einen sicheren Schalter,
// das Tor der Anmeldung oder die Lizenzhinweise still verliert.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '../../..');
const read = (file: string) => readFileSync(path.join(ROOT, file), 'utf8');

interface Overlay {
  ownFiles: string[];
  hooks: Array<{ file: string; markers: number; switch: string; test: string }>;
  dockerfileRequired: Record<string, string>;
  dockerfileForbidden: string[];
}

const overlay = JSON.parse(read('deploy/reosa/overlay.json')) as Overlay;
const reosaDockerfile = read('Dockerfile.reosa');

/** Die Anweisungen eines Dockerfiles, Fortsetzungszeilen zusammengezogen, ohne Kommentare. */
function instructions(dockerfile: string): string[] {
  return dockerfile
    .replace(/\\\n\s*/g, ' ')
    .split('\n')
    .map((line) => line.trim().replace(/\s+/g, ' '))
    .filter((line) => line !== '' && !line.startsWith('#'));
}

/** Der Wert, den Dockerfile.reosa einer Variablen gibt (ENV-Blöcke mit mehreren Paaren). */
function envValue(name: string): string | undefined {
  for (const line of instructions(reosaDockerfile)) {
    if (!line.startsWith('ENV ')) continue;
    for (const match of line.slice(4).matchAll(/([A-Z0-9_]+)=("[^"]*"|\S+)/g)) {
      if (match[1] === name) return match[2]?.replace(/^"|"$/g, '');
    }
  }
  return undefined;
}

describe('Overlay des Forks', () => {
  it('hat jede eigene Datei', () => {
    for (const file of overlay.ownFiles) expect(existsSync(path.join(ROOT, file)), file).toBe(true);
  });

  it('hat jeden Haken in den Dateien von Bulwark, mit seinem Test', () => {
    for (const hook of overlay.hooks) {
      const text = read(hook.file);
      const markers = text.split('\n').filter((line) => line.includes('REOSA')).length;
      expect(markers, `${hook.file}: REOSA-Markierungen`).toBeGreaterThanOrEqual(hook.markers);
      expect(existsSync(path.join(ROOT, hook.test)), hook.test).toBe(true);
    }
  });

  it('fasst nur Dateien von Bulwark an, die in der Landkarte stehen', () => {
    // Jede Datei außerhalb der eigenen Ordner, die REOSA nennt, muss eingetragen sein.
    const listed = new Set([...overlay.ownFiles, ...overlay.hooks.map((hook) => hook.file)]);
    for (const file of [
      'proxy.ts',
      'instrumentation.node.ts',
      'lib/settings-sync.ts',
      'lib/auth/verify-jmap-auth.ts',
      'lib/stalwart/server-fetch.ts',
      'app/api/config/route.ts',
      'hooks/use-config.ts',
    ]) {
      expect(listed.has(file), file).toBe(true);
    }
  });

  it('lässt Dockerfile und docker-compose.yml von Bulwark unverändert', () => {
    expect(read('Dockerfile')).not.toContain('REOSA');
    if (existsSync(path.join(ROOT, 'docker-compose.yml'))) expect(read('docker-compose.yml')).not.toContain('REOSA');
  });

  it('führt jeden Bau-Schritt von Dockerfile auch in Dockerfile.reosa', () => {
    const upstream = instructions(read('Dockerfile')).filter((line) => /^(RUN|COPY|FROM) /.test(line));
    const ours = new Set(instructions(reosaDockerfile));
    const skipped = [
      // Die Maps für den Fehler-Dienst baut REOSA nicht (BULWARK_SOURCE_MAPS=0); die Prüfung bleibt.
      /sentry\/cli/,
      /^FROM scratch AS sourcemaps$/,
      /^COPY --from=builder \/sourcemaps \/$/,
      // Die Abbilder heißen bei REOSA gleich, die Labels nicht.
    ];
    for (const step of upstream) {
      if (skipped.some((pattern) => pattern.test(step))) continue;
      expect(ours.has(step), `fehlt in Dockerfile.reosa: ${step}`).toBe(true);
    }
  });

  it('setzt jede sichere Vorgabe und keinen Generalschlüssel', () => {
    for (const [name, value] of Object.entries(overlay.dockerfileRequired)) {
      expect(envValue(name), name).toBe(value);
    }
    for (const name of overlay.dockerfileForbidden) expect(reosaDockerfile, name).not.toMatch(new RegExp(`\\b${name}=`));
    // Die Testseiten des Schein-JMAP-Servers kommen nie ins Abbild.
    expect(reosaDockerfile).toContain('rm -rf "app/api/dev-jmap"');
  });

  it('prüft jede Anfrage gegen das Tor, bevor die CSRF-Prüfung und next-intl greifen', () => {
    const proxy = read('proxy.ts');
    const gate = proxy.indexOf('reosaGateResponse(request.method, pathname');
    expect(gate).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(proxy.indexOf('Outer CSRF gate'));
    // Gesundheit und Bereitschaft antworten vorher (kein Login-Weg über sie).
    expect(proxy.indexOf('PROBE_PATHS.has(probePath)')).toBeLessThan(gate);
  });

  it('meldet den Schalter der Anmeldeseite, ohne Geheimnisse', () => {
    const config = read('app/api/config/route.ts');
    expect(config).toContain('reosaSsoRequired: reosaSsoRequired()');
    expect(config).not.toMatch(/OAUTH_CLIENT_SECRET[^\n]*NextResponse/);
    const login = read('app/(main)/[locale]/login/page.tsx');
    expect(login).toMatch(/if \(reosaSsoRequired\) \{\s*return <ReosaSsoLanding/);
  });

  it('behält Lizenz, Hinweise und den Link zum Quelltext', () => {
    expect(read('LICENSE')).toContain('GNU AFFERO GENERAL PUBLIC LICENSE');
    expect(existsSync(path.join(ROOT, 'NOTICE'))).toBe(true);
    expect(read('components/reosa/sso-landing.tsx')).toContain('<SourceCodeLink');
    // Auch die Anmeldeseite mit Passwort (SSO aus) zeigt den Link, in beiden Layouts.
    const login = read('app/(main)/[locale]/login/page.tsx');
    expect(login.split('<SourceCodeLink').length - 1).toBeGreaterThanOrEqual(2);
    // Die deutsche Bezeichnung bleibt „Quelltext“ (eine Zeile in locales/de/common.json).
    const de = JSON.parse(read('locales/de/common.json').replace(/^\uFEFF/, ''));
    expect(de.settings.advanced.about.source_code).toBe('Quelltext');
    expect(read('README.md')).toContain('Betrieb bei REOSA');
  });
});
