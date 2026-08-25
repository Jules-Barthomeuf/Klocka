// Géocodage d'une adresse française.
//
// API Adresse de data.gouv (BAN) : gratuite, sans clé, couvre la France. Deux
// usages aujourd'hui — la plongée cartographique de la vidéo, et la colonne
// « Adresse » de Monday, qui exige des coordonnées et refuse une adresse seule.
//
// Meilleur effort : null en cas d'échec. Aucun appelant ne doit échouer parce
// qu'une adresse n'a pas été reconnue.

const URL_BAN = 'https://api-adresse.data.gouv.fr/search/';

// En dessous, la correspondance est trop incertaine pour être exploitée.
const SCORE_MINIMUM = 0.35;

/**
 * @param {{adresse?: string, commune?: string}} lieu
 * @returns {Promise<{lat, lon, libelle, precis}|null>}
 */
export async function geocoder({ adresse, commune } = {}) {
  const q = [adresse, commune].filter(Boolean).join(', ');
  if (!q) return null;
  try {
    const url = `${URL_BAN}?limit=1&q=${encodeURIComponent(q)}${adresse ? '' : '&type=municipality'}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!r.ok) return null;
    const f = (await r.json()).features?.[0];
    if (!f || (f.properties?.score ?? 0) < SCORE_MINIMUM) return null;
    const [lon, lat] = f.geometry.coordinates;
    return {
      lat,
      lon,
      libelle: f.properties?.label || q,
      // Une adresse au numéro ou à la rue ; sinon on n'a que la commune.
      precis: !!adresse && ['housenumber', 'street', 'locality'].includes(f.properties?.type),
    };
  } catch (e) {
    console.warn('[geocodage] échec :', e?.message || e);
    return null;
  }
}
