// @vitest-environment node
// REOSA: Tests der eigenen Ergaenzungen des Forks (README, "Betrieb bei REOSA").
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { toInternalJmapUrl } from '@/lib/reosa/internal-jmap-url';

const ENV = {
  JMAP_SERVER_URL: 'https://mail01.example.net',
  JMAP_SERVER_INTERNAL_URL: 'http://stalwart:8080',
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('toInternalJmapUrl', () => {
  it('schreibt Abrufe auf den Mailserver auf das interne Netz um, mit Pfad und Abfrage', () => {
    expect(toInternalJmapUrl('https://mail01.example.net/.well-known/jmap', ENV)).toBe(
      'http://stalwart:8080/.well-known/jmap',
    );
    expect(toInternalJmapUrl('https://mail01.example.net/jmap/download/a/b/c?accept=x', ENV)).toBe(
      'http://stalwart:8080/jmap/download/a/b/c?accept=x',
    );
  });

  it('laesst jede andere Origin unveraendert, nie ein Weg ins interne Netz', () => {
    for (const url of [
      'https://other.example.net/jmap/',
      'http://mail01.example.net/jmap/',
      'https://mail01.example.net:8443/jmap/',
      'https://mail01.example.net.evil.example/jmap/',
      'not a url',
    ]) {
      expect(toInternalJmapUrl(url, ENV)).toBe(url);
    }
  });

  it('aendert ohne beide Variablen nichts', () => {
    const url = 'https://mail01.example.net/jmap/';
    expect(toInternalJmapUrl(url, {})).toBe(url);
    expect(toInternalJmapUrl(url, { JMAP_SERVER_URL: ENV.JMAP_SERVER_URL })).toBe(url);
    expect(toInternalJmapUrl(url, { JMAP_SERVER_INTERNAL_URL: ENV.JMAP_SERVER_INTERNAL_URL })).toBe(url);
    expect(toInternalJmapUrl(url, { ...ENV, JMAP_SERVER_INTERNAL_URL: 'ftp://stalwart' })).toBe(url);
  });
});

describe('fetchJmapServer im Stapel', () => {
  it('ruft einen vertrauten Server ueber die interne Adresse ab', async () => {
    vi.stubEnv('JMAP_SERVER_URL', ENV.JMAP_SERVER_URL);
    vi.stubEnv('JMAP_SERVER_INTERNAL_URL', ENV.JMAP_SERVER_INTERNAL_URL);
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        calls.push(url);
        return new Response('{}');
      }),
    );
    const { fetchJmapServer } = await import('@/lib/stalwart/server-fetch');
    await fetchJmapServer('https://mail01.example.net/jmap/', { method: 'POST' }, true);
    expect(calls).toEqual(['http://stalwart:8080/jmap/']);
  });
});

describe('Uebersetzung ueber einen Dritten', () => {
  it('antwortet mit TRANSLATE_PROXY=off 404 und fragt niemanden', async () => {
    vi.stubEnv('TRANSLATE_PROXY', 'off');
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const { POST } = await import('@/app/api/translate/route');
    const res = await POST(
      new NextRequest('https://webmail.example/api/translate', {
        method: 'POST',
        body: JSON.stringify({ text: 'Hallo', target: 'en' }),
      }),
    );
    expect(res.status).toBe(404);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('Symbole der Absender ueber einen Dritten', () => {
  it('liefert mit SENDER_FAVICONS=off ein leeres Bild und fragt niemanden', async () => {
    vi.stubEnv('SENDER_FAVICONS', 'off');
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const { GET } = await import('@/app/api/favicon/route');
    const res = await GET(new NextRequest('https://webmail.example/api/favicon?domain=example.org'));
    expect(res.headers.get('x-bulwark-favicon')).toBe('missing');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('Web Push ueber den Relay eines Dritten', () => {
  it('ist mit NEXT_PUBLIC_PUSH_RELAY_URL=off abgeschaltet', async () => {
    vi.stubEnv('NEXT_PUBLIC_PUSH_RELAY_URL', 'off');
    const { WEB_PUSH_DISABLED } = await import('@/lib/push-relays');
    expect(WEB_PUSH_DISABLED).toBe(true);
  });

  it('bleibt ohne den Schalter wie bei Bulwark', async () => {
    vi.stubEnv('NEXT_PUBLIC_PUSH_RELAY_URL', '');
    const { WEB_PUSH_DISABLED, DEFAULT_RELAY_BASE_URL } = await import('@/lib/push-relays');
    expect(WEB_PUSH_DISABLED).toBe(false);
    expect(DEFAULT_RELAY_BASE_URL).toMatch(/^https:\/\//);
  });
});
