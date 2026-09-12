// Street View, côté serveur : la photo d'une devanture, sa date, et sa lecture.
//
// Le modèle lit une façade comme une personne le ferait : l'enseigne, le type
// d'activité, l'état apparent, une terrasse. Il propose, l'équipe valide. La
// date de prise de vue est toujours affichée : une image de 2019 montre une
// enseigne disparue.
//
// La clé est GOOGLE_MAPS_SERVEUR, distincte de la clé du navigateur : elle ne
// quitte jamais le serveur et n'ouvre que l'API Street View Static.

import { ErreurSource } from '../marche/erreurs.js';
import { generateFromDocument } from '../llm.js';

const cle = () => (process.env.GOOGLE_MAPS_SERVEUR || '').trim();
export const streetViewConfigure = () => !!cle();

const META = 'https://maps.googleapis.com/maps/api/streetview/metadata';
const IMAGE = 'https://maps.googleapis.com/maps/api/streetview';

/** La date de la photo disponible à cette adresse, ou null s'il n'y en a pas. */
export async function metadonnees(adresse) {
  if (!cle()) throw new ErreurSource("Street View n'est pas configuré : ajoutez GOOGLE_MAPS_SERVEUR dans le .env.", { service: 'Street View', classe: 'definitive' });
  const r = await fetch(`${META}?${new URLSearchParams({ location: adresse, key: cle() })}`, { signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new ErreurSource(`Street View a répondu ${r.status}.`, { service: 'Street View', statut: r.status });
  const m = await r.json();
  if (m.status !== 'OK') return null;
  return { date: m.date || null, pano: m.pano_id || null, lat: m.location?.lat ?? null, lon: m.location?.lng ?? null };
}

/** L'image elle-même, en JPEG. */
export async function photo(adresse, { largeur = 800, hauteur = 500 } = {}) {
  if (!cle()) throw new ErreurSource("Street View n'est pas configuré.", { service: 'Street View', classe: 'definitive' });
  const r = await fetch(`${IMAGE}?${new URLSearchParams({ location: adresse, size: `${largeur}x${hauteur}`, fov: '80', key: cle() })}`, { signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new ErreurSource(`Street View a répondu ${r.status}.`, { service: 'Street View', statut: r.status });
  return Buffer.from(await r.arrayBuffer());
}

const CONSIGNE = `Tu regardes la photo d'une devanture de commerce en France, prise depuis la rue.
Réponds en JSON strict, sans commentaire, avec ces clés :
- "enseigne" : le nom lisible sur la façade, ou null
- "activite" : le type de commerce en deux ou trois mots (boulangerie, opticien, agence immobilière, restaurant, banque, pharmacie, vêtements, bar, vide), ou null
- "etat" : "soigne", "correct" ou "degrade"
- "terrasse" : true ou false
- "vitrine_m" : ta meilleure estimation de la largeur de vitrine en mètres, entier, ou null
- "occupe" : false si le local paraît vide (rideau baissé, vitrine vide, « à louer »), sinon true
- "confiance" : "haute", "moyenne" ou "basse"
Ne devine pas ce que tu ne vois pas : null vaut mieux qu'une invention.`;

/** La lecture d'une devanture par le modèle. */
export async function lireDevanture(adresse) {
  const meta = await metadonnees(adresse);
  if (!meta) return { ok: false, error: 'Aucune photo Street View à cette adresse.' };
  const buffer = await photo(adresse);
  const brut = await generateFromDocument({ buffer, mimetype: 'image/jpeg', prompt: CONSIGNE, nom: `devanture-${adresse}` });
  let lecture = null;
  try {
    const texte = typeof brut === 'string' ? brut : brut?.text || brut?.texte || JSON.stringify(brut);
    lecture = JSON.parse(texte.replace(/^[\s\S]*?(\{[\s\S]*\})[\s\S]*$/, '$1'));
  } catch {
    lecture = { confiance: 'basse', brut: String(brut).slice(0, 400) };
  }
  return {
    ok: true,
    photo: {
      date: meta.date,
      lat: meta.lat,
      lon: meta.lon,
      lecture,
      lue_le: new Date().toISOString(),
      validee_par: null,
      validee_le: null,
    },
  };
}
