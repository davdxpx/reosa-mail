// @vitest-environment node
// REOSA: Anmeldung nur über die Plattform (lib/reosa/sso-gate.ts).
import { describe, expect, it } from 'vitest';
import {
  reosaCallbackUri,
  reosaSsoConfigProblem,
  reosaSsoGate,
  reosaSsoRequired,
  reosaSsoStartRefusal,
  reosaStalwartContextRefusal,
  safeReturnPath,
} from '@/lib/reosa/sso-gate';

const ON = {
  REOSA_SSO_REQUIRED: 'true',
  OAUTH_ENABLED: 'true',
  OAUTH_ONLY: 'true',
  AUTO_SSO_ENABLED: 'true',
  OAUTH_ISSUER_URL: 'https://sb.example.test/auth/v1',
  OAUTH_CLIENT_ID: '11111111-1111-4111-8111-111111111111',
};

const none = new URLSearchParams();

describe('reosaSsoGate', () => {
  it('ändert ohne den Schalter nichts (Upstream-Verhalten)', () => {
    expect(reosaSsoRequired({})).toBe(false);
    expect(reosaSsoGate('POST', '/api/auth/session', none, {})).toEqual({ action: 'pass' });
    expect(reosaSsoGate('GET', '/api/auth/impersonate', none, {})).toEqual({ action: 'pass' });
  });

  for (const [method, path] of [
    ['POST', '/api/auth/verify'],
    ['POST', '/api/auth/totp-token-exchange'],
    ['GET', '/api/auth/impersonate'],
    ['POST', '/api/auth/pair/create'],
    ['POST', '/api/auth/pair/redeem'],
    ['GET', '/api/auth/pair/status'],
    ['POST', '/api/auth/pair/token'],
    ['POST', '/api/auth/handoff/create'],
    ['POST', '/api/auth/handoff/redeem'],
    ['POST', '/api/auth/reauth/sso/complete'],
    ['POST', '/api/admin/auth'],
    ['POST', '/api/admin/change-password'],
    ['POST', '/api/admin/oauth/setup'],
    ['POST', '/api/dev-jmap/session'],
  ] as const) {
    it(`sperrt ${method} ${path}`, () => {
      expect(reosaSsoGate(method, path, none, ON)).toMatchObject({ action: 'block', status: 404 });
    });
  }

  it('sperrt die Sitzung mit Passwort oder Token, lässt das Löschen', () => {
    for (const method of ['POST', 'GET', 'PUT']) {
      expect(reosaSsoGate(method, '/api/auth/session', none, ON)).toMatchObject({ action: 'block', status: 403 });
    }
    expect(reosaSsoGate('DELETE', '/api/auth/session', none, ON)).toEqual({ action: 'pass' });
  });

  it('sperrt den Code-Tausch aus dem Browser, lässt Erneuern und Abmelden', () => {
    expect(reosaSsoGate('POST', '/api/auth/token', none, ON)).toMatchObject({ action: 'block' });
    expect(reosaSsoGate('PUT', '/api/auth/token', none, ON)).toEqual({ action: 'pass' });
    expect(reosaSsoGate('DELETE', '/api/auth/token', none, ON)).toEqual({ action: 'pass' });
  });

  it('lässt die Strecke über den Aussteller offen', () => {
    for (const [method, path] of [
      ['POST', '/api/auth/sso/start'],
      ['POST', '/api/auth/sso/complete'],
      ['GET', '/api/auth/oauth/metadata'],
      ['POST', '/api/auth/stalwart-context'],
      ['POST', '/api/account/stalwart/jmap'],
      ['GET', '/api/config'],
      ['GET', '/de/mail'],
      ['GET', '/de/login'],
      ['GET', '/de/auth/callback'],
    ] as const) {
      expect(reosaSsoGate(method, path, none, ON)).toEqual({ action: 'pass' });
    }
  });

  it('sperrt ein zweites Konto über den Slot', () => {
    expect(reosaSsoGate('PUT', '/api/auth/token', new URLSearchParams('slot=1'), ON)).toMatchObject({
      action: 'block',
    });
    expect(reosaSsoGate('PUT', '/api/auth/token', new URLSearchParams('slot=0'), ON)).toEqual({ action: 'pass' });
  });

  it('lässt sich nicht über einen ähnlichen Pfad umgehen', () => {
    expect(reosaSsoGate('GET', '/api/auth/impersonate/', none, ON)).toMatchObject({ action: 'block' });
    expect(reosaSsoGate('POST', '/api/auth/pair', none, ON)).toMatchObject({ action: 'block' });
    // Ein anderer Name mit gleichem Anfang ist keine gesperrte Route.
    expect(reosaSsoGate('GET', '/api/auth/pairing-info', none, ON)).toEqual({ action: 'pass' });
  });

  it('meldet sich ohne vollständige Konfiguration niemanden an (fail closed)', () => {
    for (const broken of [
      { ...ON, OAUTH_ISSUER_URL: '' },
      { ...ON, OAUTH_ISSUER_URL: 'http://evil.example.test' },
      { ...ON, OAUTH_CLIENT_ID: '' },
      { ...ON, OAUTH_ONLY: 'false' },
      { ...ON, AUTO_SSO_ENABLED: '' },
      { ...ON, ALLOW_CUSTOM_JMAP_ENDPOINT: 'true' },
      { ...ON, BULWARK_JWT_AUTH_SECRET: 'x' },
      { ...ON, BULWARK_STALWART_MASTER_USER: 'admin' },
      { ...ON, DEMO_MODE: 'true' },
    ]) {
      expect(reosaSsoConfigProblem(broken)).not.toBeNull();
      expect(reosaSsoGate('GET', '/de/mail', none, broken)).toMatchObject({ action: 'block', status: 503 });
      expect(reosaSsoGate('POST', '/api/auth/sso/start', none, broken)).toMatchObject({ status: 503 });
    }
    expect(reosaSsoConfigProblem(ON)).toBeNull();
  });

  it('nennt im Befund nur Namen, nie Werte', () => {
    const problem = reosaSsoConfigProblem({ ...ON, BULWARK_JWT_AUTH_SECRET: 'geheim-123' }) ?? '';
    expect(problem).not.toContain('geheim-123');
  });
});

describe('Rümpfe der offenen Routen', () => {
  it('lehnt in sso/start Mobil-Übergabe, Erneut-Anmelden und Slots ab', () => {
    expect(reosaSsoStartRefusal({ redirect_uri: 'x' }, ON)).toBeNull();
    expect(reosaSsoStartRefusal({ mobile_redirect_uri: 'bulwark://x' }, ON)).toBe('mobile_handoff');
    expect(reosaSsoStartRefusal({ purpose: 'reauth' }, ON)).toBe('reauth');
    expect(reosaSsoStartRefusal({ slot: 3 }, ON)).toBe('slot');
    expect(reosaSsoStartRefusal({ mobile_redirect_uri: 'x' }, {})).toBeNull();
  });

  it('nimmt in stalwart-context nur Bearer an', () => {
    expect(reosaStalwartContextRefusal('Bearer eyJ.a.b', ON)).toBe(false);
    expect(reosaStalwartContextRefusal('Basic dXNlcjpwYXNz', ON)).toBe(true);
    expect(reosaStalwartContextRefusal(undefined, ON)).toBe(true);
    expect(reosaStalwartContextRefusal('Basic dXNlcjpwYXNz', {})).toBe(false);
  });

  it('nennt genau einen Rückweg, unabhängig von der Sprache', () => {
    expect(reosaCallbackUri('https://mail.example.test', '', ON)).toBe('https://mail.example.test/de/auth/callback');
    expect(reosaCallbackUri('https://mail.example.test', '/webmail', { REOSA_SSO_CALLBACK_LOCALE: 'en' })).toBe(
      'https://mail.example.test/webmail/en/auth/callback',
    );
    expect(reosaCallbackUri('https://mail.example.test', '', { REOSA_SSO_CALLBACK_LOCALE: '../x' })).toBe(
      'https://mail.example.test/de/auth/callback',
    );
  });
});

describe('safeReturnPath', () => {
  it('trägt einen Tiefenlink mit Sprache, Ordner, Nachricht und Suche', () => {
    expect(safeReturnPath('/de/mail/inbox/m-1?q=rechnung&filter=unread', '/de')).toBe(
      '/de/mail/inbox/m-1?q=rechnung&filter=unread',
    );
  });

  for (const raw of ['https://evil.example.test', '//evil.example.test/x', '/\\evil.example.test', 'javascript:alert(1)', 'de/mail', '/de\u0000', '', null]) {
    it(`weist ${JSON.stringify(raw)} ab`, () => {
      expect(safeReturnPath(raw, '/de')).toBe('/de');
    });
  }
});
