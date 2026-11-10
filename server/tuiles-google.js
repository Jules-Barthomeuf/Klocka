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
// Une session par thème (10 nov. 2026, Jules : « mode sombre plan sombre, mode clair plan clair ») : le plan sombre est
// le même « roadmap » avec un style posé à la création de la session.
const sessions = {}; // thème -> { jeton, fin_ms }
const enCours = {};
const STYLE_SOMBRE = [
  { stylers: [{ saturation: -80 }] },
  { elementType: 'geometry', stylers: [{ color: '#1b1c1b' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#9a9c99' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#121312' }] },
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#3a3c3a' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#202220' }] },
  { featureType: 'poi', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#1e2620' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2c2e2c' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#161716' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#3a3c3a' }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#262826' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0f1416' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#5d6466' }] },
];
const leTheme = (t) => (t === 'sombre' ? 'sombre' : 'clair');

const cle = () => (process.env.GOOGLE_MAPS_SERVEUR || '').trim();
export const tuilesGoogleDisponibles = () => !!cle();

async function jeton(theme = 'clair') {
  const session = sessions[theme];
  if (session && Date.now() < session.fin_ms - 3600000) return session.jeton;
  if (!enCours[theme]) {
    enCours[theme] = (async () => {
      const r = await fetch(`${SESSION_URL}?key=${encodeURIComponent(cle())}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mapType: 'roadmap', language: 'fr-FR', region: 'FR', ...(theme === 'sombre' ? { styles: STYLE_SOMBRE } : {}) }),
        signal: AbortSignal.timeout(15000),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.session) throw new Error(`Google Map Tiles : ${r.status} ${j?.error?.message || ''}`.trim());
      sessions[theme] = { jeton: j.session, fin_ms: Number(j.expiry) * 1000 || Date.now() + 86400000 };
      return sessions[theme].jeton;
    })().finally(() => { enCours[theme] = null; });
  }
  return enCours[theme];
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
export async function tuile(z, x, y, theme = 'clair') {
  const t = leTheme(theme);
  try { return await tuileUneFois(z, x, y, t); } catch {
    try { return await tuileUneFois(z, x, y, t); } catch (e2) {
      console.warn('[tuiles-google]', e2?.message || e2);
      return { ok: false, statut: 502 };
    }
  }
}

async function tuileUneFois(z, x, y, theme = 'clair') {
  if (!cle()) return { ok: false, statut: 503 };
  const [zi, xi, yi] = [z, x, y].map((v) => Number.parseInt(v, 10));
  if (![zi, xi, yi].every(Number.isInteger) || zi < 0 || zi > 22 || xi < 0 || yi < 0 || xi >= 2 ** zi || yi >= 2 ** zi) return { ok: false, statut: 400 };
  const lire = async () => fetch(`${TUILE_URL}/${zi}/${xi}/${yi}?session=${encodeURIComponent(await jeton(theme))}&key=${encodeURIComponent(cle())}`, { signal: AbortSignal.timeout(10000) });
  let r = await lire();
  // Une session refusée (expirée plus tôt que prévu) : on la refait une fois.
  if (r.status === 401 || r.status === 403) { sessions[theme] = null; r = await lire(); }
  if (!r.ok) return { ok: false, statut: r.status };
  return { ok: true, contenu: Buffer.from(await r.arrayBuffer()), type: r.headers.get('content-type') || 'image/png', cache: r.headers.get('cache-control') || 'private, max-age=86400' };
}
