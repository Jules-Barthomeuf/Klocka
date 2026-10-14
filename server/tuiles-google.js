// Le fond de carte Google Maps, en clair (13 oct. 2026, Jules : « la carte
// comme sur Google Maps en mode clair », pour les signaux de vacance). Les
// tuiles viennent de la Map Tiles API de Google (2D, « roadmap »), avec la clé
// du serveur (GOOGLE_MAPS_SERVEUR) : le navigateur passe par /api/tuiles-google,
// la clé ne le quitte jamais. Une session Google vaut environ deux semaines :
// elle se garde en mémoire et se refait une heure avant sa fin. Les tuiles ne
// se stockent pas (les conditions de Google ne le permettent qu'au cache HTTP) :
// leur en-tête de cache est simplement transmis au navigateur.

const SESSION_URL = 'https://tile.googleapis.com/v1/createSession';
const TUILE_URL = 'https://tile.googleapis.com/v1/2dtiles';
let session = null; // { jeton, fin_ms }
let enCours = null;

const cle = () => (process.env.GOOGLE_MAPS_SERVEUR || '').trim();
export const tuilesGoogleDisponibles = () => !!cle();

async function jeton() {
  if (session && Date.now() < session.fin_ms - 3600000) return session.jeton;
  if (!enCours) {
    enCours = (async () => {
      const r = await fetch(`${SESSION_URL}?key=${encodeURIComponent(cle())}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mapType: 'roadmap', language: 'fr-FR', region: 'FR' }),
        signal: AbortSignal.timeout(15000),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.session) throw new Error(`Google Map Tiles : ${r.status} ${j?.error?.message || ''}`.trim());
      session = { jeton: j.session, fin_ms: Number(j.expiry) * 1000 || Date.now() + 86400000 };
      return session.jeton;
    })().finally(() => { enCours = null; });
  }
  return enCours;
}

/**
 * Le fond Google répond-il, et sinon pourquoi (14 oct. 2026) : en ligne, la
 * carte des signaux restait blanche sans rien dire. Une tuile d'essai, et la
 * réponse gardée dix minutes. La carte bascule aussitôt sur un fond clair et
 * affiche la raison, au lieu d'attendre trente tuiles refusées.
 */
let etatGarde = null; // { le, disponible, raison }
export async function etatTuiles() {
  if (etatGarde && Date.now() - etatGarde.le < 10 * 60000) return { disponible: etatGarde.disponible, raison: etatGarde.raison };
  let disponible = false; let raison = null;
  if (!cle()) raison = "La clé GOOGLE_MAPS_SERVEUR n'est pas posée sur ce serveur.";
  else {
    try {
      const r = await tuileUneFois(0, 0, 0);
      disponible = r.ok;
      if (!r.ok) raison = `Google refuse les tuiles (réponse ${r.statut}) : vérifiez que la Map Tiles API est activée pour la clé GOOGLE_MAPS_SERVEUR.`;
    } catch (e) { raison = String(e?.message || e).slice(0, 240); }
  }
  if (!disponible) console.warn(`[tuiles-google] indisponible : ${raison}`);
  etatGarde = { le: Date.now(), disponible, raison };
  return { disponible, raison };
}

/** Une tuile : { ok, contenu, type, cache } ou { ok: false, statut }. Une panne passagère se réessaie une fois. */
export async function tuile(z, x, y) {
  try { return await tuileUneFois(z, x, y); } catch {
    try { return await tuileUneFois(z, x, y); } catch (e2) {
      console.warn('[tuiles-google]', e2?.message || e2);
      return { ok: false, statut: 502 };
    }
  }
}

async function tuileUneFois(z, x, y) {
  if (!cle()) return { ok: false, statut: 503 };
  const [zi, xi, yi] = [z, x, y].map((v) => Number.parseInt(v, 10));
  if (![zi, xi, yi].every(Number.isInteger) || zi < 0 || zi > 22 || xi < 0 || yi < 0 || xi >= 2 ** zi || yi >= 2 ** zi) return { ok: false, statut: 400 };
  const lire = async () => fetch(`${TUILE_URL}/${zi}/${xi}/${yi}?session=${encodeURIComponent(await jeton())}&key=${encodeURIComponent(cle())}`, { signal: AbortSignal.timeout(10000) });
  let r = await lire();
  // Une session refusée (expirée plus tôt que prévu) : on la refait une fois.
  if (r.status === 401 || r.status === 403) { session = null; r = await lire(); }
  if (!r.ok) return { ok: false, statut: r.status };
  return { ok: true, contenu: Buffer.from(await r.arrayBuffer()), type: r.headers.get('content-type') || 'image/png', cache: r.headers.get('cache-control') || 'private, max-age=86400' };
}
