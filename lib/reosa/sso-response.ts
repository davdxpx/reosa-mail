// REOSA: die Antwort des Tors aus lib/reosa/sso-gate.ts für proxy.ts.
import { NextResponse } from 'next/server';
import { reosaSsoGate } from '@/lib/reosa/sso-gate';

const NOT_CONFIGURED_HTML = `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><title>Webmail</title><style>body{font-family:system-ui,sans-serif;margin:0;min-height:100vh;display:grid;place-items:center;background:#F7F4EC;color:#1d1b16}@media (prefers-color-scheme:dark){body{background:#151412;color:#ece8de}}main{max-width:28rem;padding:24px}h1{font-size:1.25rem;margin:0 0 .5rem}p{margin:0;line-height:1.5}</style></head><body><main><h1>Anmeldung gerade nicht möglich</h1><p>Das Webmail kann gerade niemanden anmelden. Versuchen Sie es später erneut.</p></main></body></html>`;

/** `null` heißt: weiter wie bei Bulwark. */
export function reosaGateResponse(method: string, pathname: string, search: URLSearchParams): NextResponse | null {
  const decision = reosaSsoGate(method, pathname, search);
  if (decision.action === 'pass') return null;
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: decision.error }, { status: decision.status });
  }
  if (decision.status === 503) {
    return new NextResponse(NOT_CONFIGURED_HTML, {
      status: 503,
      headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
    });
  }
  return new NextResponse('Not Found', { status: 404 });
}
