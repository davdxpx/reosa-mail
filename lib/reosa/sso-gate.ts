// REOSA: Anmeldung nur über die Plattform (README, „Betrieb bei REOSA“;
// Spec der Plattform: reosa-docs/02-architecture/identity-platform.md,
// Abschnitt 9, „Das Webmail als Client“).
//
// Mit REOSA_SSO_REQUIRED=true ist der Anmeldedienst der Plattform der EINZIGE
// Weg hinein. Dieses Modul entscheidet serverseitig, welche Routen von
// Bulwark dann noch antworten. Ein ausgeblendeter Knopf allein reichte nicht:
// Passwort-, Token-, Kopplungs- und Konto-Wechsel-Routen bleiben sonst über
// einen direkten Aufruf erreichbar. Eingehängt in proxy.ts (eine Zeile) und
// in den drei Routen, die einen Rumpf lesen müssen (sso/start,
// stalwart-context, session).
//
// Fail closed: Fehlt die Konfiguration des Ausstellers, meldet sich niemand
// an. Es gibt keinen Rückfall auf Passwort, Demo oder einen eigenen Server.
//
// Was offen bleibt, ist genau die Strecke von Bulwark für die Anmeldung über
// einen Aussteller: sso/start, sso/complete, token (Erneuern, Abmelden),
// oauth/metadata, stalwart-context mit Bearer, dazu JMAP, Gesundheit, Config.

export type ReosaEnv = Readonly<Record<string, string | undefined>>;

/** Der Schalter. Nur `true` (beliebige Schreibung) schaltet ein. */
export function reosaSsoRequired(env: ReosaEnv = process.env): boolean {
  return (env.REOSA_SSO_REQUIRED ?? '').trim().toLowerCase() === 'true';
}

function isTrue(value: string | undefined): boolean {
  return /^(true|1|yes|on)$/i.test((value ?? '').trim());
}

/**
 * Was an der Konfiguration fehlt, damit die Anmeldung über die Plattform
 * überhaupt gehen kann; `null`, wenn nichts fehlt. Nur Namen, nie Werte.
 */
export function reosaSsoConfigProblem(env: ReosaEnv = process.env): string | null {
  const issuer = (env.OAUTH_ISSUER_URL ?? '').trim();
  if (!issuer) return 'OAUTH_ISSUER_URL fehlt';
  try {
    const url = new URL(issuer);
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && url.hostname === 'localhost')) {
      return 'OAUTH_ISSUER_URL ist keine https-Adresse';
    }
  } catch {
    return 'OAUTH_ISSUER_URL ist keine Adresse';
  }
  if (!(env.OAUTH_CLIENT_ID ?? '').trim()) return 'OAUTH_CLIENT_ID fehlt';
  if (!isTrue(env.OAUTH_ENABLED)) return 'OAUTH_ENABLED ist nicht an';
  if (!isTrue(env.OAUTH_ONLY)) return 'OAUTH_ONLY ist nicht an';
  if (!isTrue(env.AUTO_SSO_ENABLED)) return 'AUTO_SSO_ENABLED ist nicht an';
  if (isTrue(env.ALLOW_CUSTOM_JMAP_ENDPOINT)) return 'ALLOW_CUSTOM_JMAP_ENDPOINT ist an';
  if ((env.BULWARK_JWT_AUTH_SECRET ?? '').trim()) return 'BULWARK_JWT_AUTH_SECRET ist gesetzt (Impersonation)';
  if ((env.BULWARK_STALWART_MASTER_USER ?? '').trim()) return 'BULWARK_STALWART_MASTER_USER ist gesetzt (Impersonation)';
  if (isTrue(env.DEMO_MODE)) return 'DEMO_MODE ist an';
  if (isTrue(env.DEV_MOCK_JMAP)) return 'DEV_MOCK_JMAP ist an';
  return null;
}

export type GateDecision =
  | { action: 'pass' }
  | { action: 'block'; status: 403 | 404 | 503; error: 'sso_required' | 'not_found' | 'sso_not_configured' };

const BLOCKED_PREFIXES = [
  // Passwort- und Token-Anmeldung samt Vorprüfung und TOTP-Tausch.
  '/api/auth/verify',
  '/api/auth/totp-token-exchange',
  // Master-Impersonation von Bulwark: ein Generalschlüssel.
  '/api/auth/impersonate',
  // Kopplung und Übergabe an eine Mobil-App, Erneut-Anmelden dafür.
  '/api/auth/pair',
  '/api/auth/handoff',
  '/api/auth/reauth',
  // Verwaltung mit Passwort oder Stalwart-Superuser.
  '/api/admin/auth',
  '/api/admin/change-password',
  '/api/admin/oauth/setup',
  // Der Schein-JMAP-Server der Entwicklung.
  '/api/dev-jmap',
];

function startsWithSegment(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/** Ein Slot ungleich 0 ist ein zweites Konto; das gibt es bei REOSA nicht. */
function secondAccountSlot(search: URLSearchParams): boolean {
  const raw = search.get('slot');
  return raw !== null && raw !== '' && raw !== '0';
}

/**
 * Die Entscheidung für eine Anfrage, nach dem dekodierten Pfad ohne
 * Base-Path. Seiten werden hier nur bei fehlender Konfiguration gesperrt; die
 * Anmeldeseite selbst zeigt im REOSA-Betrieb kein Formular (components/reosa).
 */
export function reosaSsoGate(
  method: string,
  pathname: string,
  search: URLSearchParams,
  env: ReosaEnv = process.env,
): GateDecision {
  if (!reosaSsoRequired(env)) return { action: 'pass' };

  if (reosaSsoConfigProblem(env) !== null) {
    // Gesundheit bleibt erreichbar (proxy.ts beantwortet sie vorher); alles
    // andere sagt ehrlich, dass keine Anmeldung möglich ist.
    if (pathname.startsWith('/_next/') || pathname === '/favicon.ico') return { action: 'pass' };
    return { action: 'block', status: 503, error: 'sso_not_configured' };
  }

  for (const prefix of BLOCKED_PREFIXES) {
    if (startsWithSegment(pathname, prefix)) return { action: 'block', status: 404, error: 'not_found' };
  }

  // Sitzung mit Passwort oder Token: anlegen, lesen, erneuern gesperrt;
  // Löschen bleibt, damit ein altes Cookie beim Abmelden verschwindet.
  if (startsWithSegment(pathname, '/api/auth/session') && method.toUpperCase() !== 'DELETE') {
    return { action: 'block', status: 403, error: 'sso_required' };
  }

  // Code-Tausch mit einem PKCE-Prüfwert aus dem Browser: Bei REOSA startet
  // nur der Server (sso/start, sso/complete). Erneuern (PUT) und Abmelden
  // (DELETE) bleiben.
  if (pathname === '/api/auth/token' && method.toUpperCase() === 'POST') {
    return { action: 'block', status: 403, error: 'sso_required' };
  }

  // Zweites Konto über einen Slot: nie.
  if (pathname.startsWith('/api/auth/') && secondAccountSlot(search)) {
    return { action: 'block', status: 403, error: 'sso_required' };
  }

  return { action: 'pass' };
}

/** Der Rückweg des Anmeldedienstes: genau einer, unabhängig von der Sprache der Person. */
export function reosaCallbackUri(origin: string, basePath: string, env: ReosaEnv = process.env): string {
  const locale = (env.REOSA_SSO_CALLBACK_LOCALE ?? '').trim() || 'de';
  const safeLocale = /^[a-z]{2}(-[A-Za-z]{2,4})?$/.test(locale) ? locale : 'de';
  return `${origin}${basePath}/${safeLocale}/auth/callback`;
}

/**
 * Prüft den Rumpf von sso/start im REOSA-Betrieb: keine Übergabe an eine
 * Mobil-App, kein Erneut-Anmelden für eine Kopplung, kein zweiter Slot.
 * `null` heißt erlaubt.
 */
export function reosaSsoStartRefusal(body: Record<string, unknown>, env: ReosaEnv = process.env): string | null {
  if (!reosaSsoRequired(env)) return null;
  if (body.mobile_redirect_uri || body.mobile_state || body.mobile_code_challenge) return 'mobile_handoff';
  if (body.purpose === 'reauth') return 'reauth';
  if (body.slot !== undefined && body.slot !== 0) return 'slot';
  return null;
}

/** Im REOSA-Betrieb nimmt stalwart-context nur ein Bearer-Token des Ausstellers an. */
export function reosaStalwartContextRefusal(authHeader: unknown, env: ReosaEnv = process.env): boolean {
  if (!reosaSsoRequired(env)) return false;
  return typeof authHeader !== 'string' || !/^Bearer\s+\S+$/.test(authHeader.trim());
}

/**
 * Ein interner Rückweg nach dem Anmelden (Tiefenlink): nur ein relativer
 * Pfad derselben Anwendung, nie `//`, nie ein Schema, kein Backslash, keine
 * Steuerzeichen. Was nicht passt, wird `fallback`.
 */
export function safeReturnPath(raw: string | null | undefined, fallback: string): string {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 2048) return fallback;
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return fallback;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f\\]/.test(raw)) return fallback;
  try {
    // Eine Basis ohne Host: Löst sich der Pfad zu einem Host auf, war er keiner.
    const resolved = new URL(raw, 'file:///');
    if (resolved.protocol !== 'file:' || resolved.host !== '') return fallback;
    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch {
    return fallback;
  }
}
