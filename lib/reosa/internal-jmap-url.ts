// REOSA: eigene Ergaenzung des Forks (README, "Betrieb bei REOSA").
//
// Der Browser spricht JMAP mit dem oeffentlichen Namen des Mailservers
// (JMAP_SERVER_URL). Der Server des Webmails laeuft im selben Stapel wie
// Stalwart und darf diesen Weg nicht nehmen: Ueber die oeffentliche Adresse
// kaeme er mit einer privaten Absenderadresse an, und Stalwart weist auf
// Port 443 jede Verbindung aus einem privaten Netz ab. Mit
// JMAP_SERVER_INTERNAL_URL (etwa http://stalwart:8080) gehen die Abrufe des
// Servers stattdessen ueber das Netz des Stapels.
//
// Umgeschrieben wird nur, was auf die Origin von JMAP_SERVER_URL zielt. Jede
// andere Adresse (ein vom Nutzer gewaehlter Server, ein fremder Host) bleibt
// unveraendert, damit diese Abkuerzung nie zu einem Weg ins interne Netz
// wird. Ohne beide Variablen aendert sich nichts.

function originOf(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.origin;
  } catch {
    return null;
  }
}

/** Die beiden Variablen; sonst darf alles darin stehen (etwa `process.env`). */
export type InternalJmapEnv = Readonly<Record<string, string | undefined>> & {
  readonly JMAP_SERVER_URL?: string;
  readonly JMAP_SERVER_INTERNAL_URL?: string;
};

/**
 * Die Adresse, unter der der Server des Webmails `url` abruft. Gleich `url`,
 * solange keine interne Adresse gesetzt ist oder `url` nicht auf den
 * konfigurierten Mailserver zielt.
 */
export function toInternalJmapUrl(url: string, env: InternalJmapEnv = process.env): string {
  const publicOrigin = originOf(env.JMAP_SERVER_URL);
  const internalOrigin = originOf(env.JMAP_SERVER_INTERNAL_URL);
  if (!publicOrigin || !internalOrigin) return url;
  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return url;
  }
  if (target.origin !== publicOrigin) return url;
  return `${internalOrigin}${target.pathname}${target.search}`;
}
