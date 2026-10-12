// Off-market, mode Simple (11 oct. 2026, Jules : « pour chaque ville, une IA
// dit quelles sont les zones les plus touristiques et commerciales ; on
// prospecte dans chaque zone, pas dans un autre quartier »). Une seule
// question au modèle par ville : les zones et leurs rues commerçantes. Les
// rues sont placées par la Base adresse nationale ; une zone est l'ensemble
// de ses rues, à 180 m près. Gardé dans la Ville, une fois.

import { Records } from '../db.js';
import { invokeLLM } from '../llm.js';
import { mesurer } from '../llm-couts.js';
import { resoudreAdresse } from '../adresse-ban.js';

const VILLE = 'Ville';
const maintenant = () => new Date().toISOString();
export const MARGE_ZONE_M = 180;

const SCHEMA = {
  type: 'object',
  properties: {
    zones: {
      type: 'array',
      description: 'De 1 à 5 zones, la plus commerçante d\'abord.',
      items: {
        type: 'object',
        properties: {
          nom: { type: 'string', description: 'Le nom usuel : « Hyper-centre », « Vieil Antibes », « Juan-les-Pins », « Rue d\'Antibes ».' },
          genre: { type: 'string', enum: ['hyper-centre', 'centre-ville', 'touristique', 'quartier commerçant'] },
          rues: { type: 'array', items: { type: 'string' }, description: 'De 3 à 10 rues, places ou boulevards commerçants de la zone, noms exacts.' },
          pourquoi: { type: 'string', description: 'Une phrase : pourquoi c\'est commerçant (piéton, enseignes nationales, tourisme, marché).' },
        },
        required: ['nom', 'genre', 'rues', 'pourquoi'],
      },
    },
  },
  required: ['zones'],
};

/** Pure : la consigne posée au modèle pour une ville. */
export const consigne = (ville) => `Tu connais bien les villes françaises et l'immobilier commercial. Ville : ${ville.nom}${ville.code_postal ? ` (${ville.code_postal})` : ''}.
Donne les zones les plus commerçantes et touristiques de cette ville : là où un investisseur achète des murs de boutiques (flux piéton, enseignes nationales, tourisme, rues piétonnes, places de marché). Une ville moyenne en a une ou deux (l'hyper-centre, parfois un quartier touristique) ; une station balnéaire ou une grande ville jusqu'à cinq (par exemple à Antibes : le centre autour de la rue de la République et du boulevard Albert 1er, le Vieil Antibes, Juan-les-Pins).
Pas de zone commerciale de périphérie (hypermarchés, retail parks), pas de quartier résidentiel ou pavillonnaire, pas de zone d'activité.
Pour chaque zone, les noms exacts de 3 à 10 rues, places ou boulevards commerçants, tels qu'ils figurent sur un plan. Si tu n'es pas sûr d'une rue, ne la mets pas. JSON.`;

const distanceM = (a, b) => 6371000 * Math.hypot(((b.lon - a.lon) * Math.cos(((a.lat + b.lat) / 2) * Math.PI / 180) * Math.PI) / 180, ((b.lat - a.lat) * Math.PI) / 180);

/** Pure : ce point est-il dans une zone (à moins de 180 m d'une de ses rues) ? Rend le nom de la zone, ou null. */
export function zoneDuPoint(p, zones = []) {
  if (!Number.isFinite(p?.lat)) return null;
  for (const z of zones) for (const r of z.points || []) if (distanceM(p, r) <= (z.marge_m || MARGE_ZONE_M)) return z.nom;
  return null;
}

/** Pure : le rectangle d'une zone, élargi de sa marge. */
export function rectangleDeZone(z) {
  const pts = z.points || [];
  if (!pts.length) return null;
  const marge = (z.marge_m || MARGE_ZONE_M) / 111000;
  const lat = pts.map((p) => p.lat); const lon = pts.map((p) => p.lon);
  const mLon = marge / Math.cos((lat[0] * Math.PI) / 180);
  return { bas: { lat: Math.min(...lat) - marge, lon: Math.min(...lon) - mLon }, haut: { lat: Math.max(...lat) + marge, lon: Math.max(...lon) + mLon } };
}

/**
 * Les zones d'une ville : demandées au modèle une fois, rues placées par la
 * BAN (une rue placée hors de la commune, ou à plus de 6 km du centre, est
 * écartée). `forcer` redemande. `invoquer` et `geocoder` se remplacent dans les tests.
 */
export async function zonesDeLaVille(villeId, { forcer = false, invoquer = invokeLLM, geocoder = resoudreAdresse, journal = () => {} } = {}) {
  const v = Records.get(VILLE, villeId);
  if (!v) return { ok: false, error: 'Ville introuvable.' };
  const deja = v.simple?.zones;
  if (deja?.length && !forcer) return { ok: true, zones: deja, deja: true };
  const { resultat } = await mesurer({ operation: 'zones commerciales', sur: villeId }, () => invoquer({ prompt: consigne(v), response_json_schema: SCHEMA, effort: 'low', max_tokens: 3000 }));
  const proposees = (resultat?.zones || []).slice(0, 5);
  const zones = [];
  for (const z of proposees) {
    const points = [];
    for (const rue of (z.rues || []).slice(0, 10)) {
      const a = await geocoder(`${rue}, ${v.code_postal || ''} ${v.nom}`.replace(/\s+/g, ' ')).catch(() => null);
      if (!a?.lat) continue;
      if (v.code_insee && a.code_insee && a.code_insee !== v.code_insee) continue;
      if (v.centre?.lat && distanceM(a, v.centre) > 6000) continue;
      points.push({ rue, lat: a.lat, lon: a.lon });
    }
    if (points.length) zones.push({ nom: z.nom, genre: z.genre, pourquoi: z.pourquoi, rues: points.map((p) => p.rue), points, marge_m: MARGE_ZONE_M });
  }
  Records.update(VILLE, villeId, { simple: { ...(Records.get(VILLE, villeId).simple || {}), zones, zones_le: maintenant() } });
  journal(`${v.nom} : ${zones.length} zone(s) commerçante(s) : ${zones.map((z) => `${z.nom} (${z.points.length} rues)`).join(', ')}.`);
  return { ok: true, zones };
}
