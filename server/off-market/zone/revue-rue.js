// Off-market, mode Simple : la rue d'un commerce notée sur Street View par
// l'IA (11 oct. 2026). Seulement à la demande, point par point : c'est un
// appel au modèle de vision. La consigne reprend les derniers jugements de
// l'équipe qui parlaient de la rue telle qu'on la voit (rue dégradée, rue
// commerçante, voisinage attractif), pour que la note suive leurs critères.
// On ne garde pas d'image Street View (conditions de Google) : un exemple
// garde l'adresse, le verdict, les raisons et le texte.

import { Records } from '../../db.js';
import { generateFromDocument } from '../../llm.js';
import { mesurer } from '../../llm-couts.js';
import { COMMERCE } from '../simple.js';
import { EXEMPLE, oublierContexte } from './jugements.js';
import { RAISONS, VERDICTS } from './raisons.js';

/** Pure : les exemples de l'équipe, 10 positifs et 10 négatifs au plus, les plus récents. */
export function exemplesPourConsigne(exemples) {
  const recents = [...exemples].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  const ligne = (e) => `- ${VERDICTS[e.verdict]} · ${(e.raisons || []).map((r) => RAISONS[r] || r).join(', ')} · ${e.adresse || ''} : « ${String(e.commentaire || '').slice(0, 240)} »`;
  const pos = recents.filter((e) => e.verdict === 'interessant').slice(0, 10).map(ligne);
  const neg = recents.filter((e) => e.verdict === 'pas_interessant').slice(0, 10).map(ligne);
  return { pos, neg };
}

/** Pure : la consigne de la revue, avec les exemples. */
export function consigneRevue(exemples) {
  const { pos, neg } = exemplesPourConsigne(exemples);
  return `Tu regardes une photo Street View prise devant un commerce, en France. Un investisseur en murs commerciaux veut savoir si la rue est un bon emplacement de boutique.
Note la rue de 0 à 10 : 10, une rue commerçante vivante, vitrines soignées, voisinage attractif ; 0, une rue sans commerces, dégradée ou résidentielle.
${pos.length || neg.length ? `Voici comment l'équipe a jugé d'autres rues ; aligne ta note sur ses critères.\n${pos.length ? `Jugées intéressantes :\n${pos.join('\n')}\n` : ''}${neg.length ? `Jugées sans intérêt :\n${neg.join('\n')}\n` : ''}` : ''}Réponds en JSON strict : { "note": entier de 0 à 10, "pourquoi": une phrase sur ce que tu vois }. Ne devine pas ce que tu ne vois pas.`;
}

/** Note la rue d'un commerce et la garde sur le commerce (revue_rue). */
export async function noterRue(id, { lireImage = null, generer = generateFromDocument } = {}) {
  const c = Records.get(COMMERCE, id);
  if (!c) return { ok: false, error: 'Commerce introuvable.' };
  const sv = await import('../../alx/streetview.js');
  if (!sv.streetViewConfigure()) return { ok: false, error: "Street View n'est pas configuré sur ce serveur." };
  const texte = [c.adresse, c.ville].filter(Boolean).join(', ');
  const trouve = await sv.panoramaDeAdresse(texte, { pres: Number.isFinite(c.lat) ? { lat: c.lat, lon: c.lon } : null }).catch(() => null);
  const pano = trouve?.panorama?.pano || null;
  if (!pano && !trouve?.point) return { ok: false, error: 'Aucune photo Street View à cette adresse.' };
  const buffer = lireImage ? await lireImage(c) : await sv.photo(texte, { pano, cap: trouve?.panorama?.cap ?? null });
  const { resultat: brut } = await mesurer({ operation: 'revue de rue' }, () => generer({ buffer, mimetype: 'image/jpeg', prompt: consigneRevue(Records.list(EXEMPLE)), nom: `rue-${id}` }));
  let lu = null;
  try {
    const t = typeof brut === 'string' ? brut : brut?.text || brut?.texte || JSON.stringify(brut);
    lu = JSON.parse(t.replace(/^[\s\S]*?(\{[\s\S]*\})[\s\S]*$/, '$1'));
  } catch { lu = null; }
  const note = Math.round(Number(lu?.note));
  if (!Number.isFinite(note) || note < 0 || note > 10) return { ok: false, error: "L'IA n'a pas rendu de note lisible." };
  const revue_rue = { note, pourquoi: String(lu.pourquoi || '').slice(0, 300), pano, le: new Date().toISOString() };
  Records.update(COMMERCE, id, { revue_rue });
  oublierContexte(c.ville_id);
  return { ok: true, revue_rue };
}
