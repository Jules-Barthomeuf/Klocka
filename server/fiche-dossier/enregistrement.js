// Le mode Enregistrement de l'assistant (20 nov. 2026, Jules : « un rendez-vous où on présente un projet à un client,
// ou un appel : on enregistre la conversation, les fiches se mettent à jour toutes seules et on les voit se mettre à
// jour au fur et à mesure ; comme Réunion, mais pour tout le monde »). La mécanique de Suivi > Réunion : des morceaux de
// trente secondes, transcrits dès qu'ils arrivent et gardés ici à leur rang (une page rechargée reprend où elle en
// était) ; l'audio n'est jamais gardé. Le texte part au rangement des notes (ranger.js), en direct puis à la fin.

import { Records } from '../db.js';
import { invokeLLM } from '../llm.js';
import { mesurer } from '../llm-couts.js';

const ETATS = ['en_cours', 'termine', 'abandonne'];

/** Un enregistrement neuf, à la personne qui le lance. */
export function creer(user, { maintenant = new Date() } = {}) {
  return Records.create('EnregistrementRdv', { par: user?.email || null, debut: maintenant.toISOString(), etat: 'en_cours', morceaux: [], fin: null });
}

export function lire(id, user) {
  const e = Records.get('EnregistrementRdv', String(id || ''));
  if (!e || (user?.email && e.par && e.par !== user.email)) return null;
  return e;
}

/** Un morceau transcrit, posé à son rang (un morceau renvoyé remplace le précédent). */
export function poserMorceau(e, i, texte) {
  const rang = Math.max(0, Math.floor(Number(i) || 0));
  const morceaux = (e.morceaux || []).filter((m) => m.i !== rang);
  morceaux.push({ i: rang, texte: String(texte || '').trim() });
  morceaux.sort((a, b) => a.i - b.i);
  return Records.update('EnregistrementRdv', e.id, { morceaux });
}

/** Tout ce qui a été dit, dans l'ordre. */
export const texteDe = (e) => (e?.morceaux || []).map((m) => m.texte).filter(Boolean).join('\n');

/** Fin de l'enregistrement : gardé (son texte part aux fiches) ou abandonné. */
export function finir(e, { abandon = false, maintenant = new Date() } = {}) {
  return Records.update('EnregistrementRdv', e.id, { etat: abandon ? 'abandonne' : 'termine', fin: maintenant.toISOString() });
}

/** L'enregistrement resté ouvert (page fermée en route), pour le reprendre ou le finir. */
export function enCoursDe(user) {
  return Records.filter('EnregistrementRdv', { par: user?.email || null, etat: 'en_cours' })
    .sort((a, b) => String(b.debut).localeCompare(String(a.debut)))[0] || null;
}

export const vue = (e) => e && ({ id: e.id, etat: ETATS.includes(e.etat) ? e.etat : 'en_cours', debut: e.debut, fin: e.fin || null, morceaux: (e.morceaux || []).length, prochain: (e.morceaux || []).reduce((m, x) => Math.max(m, x.i + 1), 0), caracteres: texteDe(e).length });

/**
 * Ce que l'assistant lit d'un long enregistrement : tout jusqu'à 40 000 caractères ; au-delà, le début (qui pose qui
 * est là et de quoi on parle) et la fin (ce qui a été conclu).
 */
export function lisible(texte, limite = 40000) {
  const t = String(texte || '');
  if (t.length <= limite) return t;
  const debut = Math.floor(limite / 4);
  return `${t.slice(0, debut)}\n[… le milieu de la conversation est omis …]\n${t.slice(t.length - (limite - debut))}`;
}

// ---------------------------------------------------------------------------
// La fin d'un sujet (20 nov. 2026, Jules : « pas un truc temporel, plus par rapport aux faits : on change de sujet, il
// me pose une question, il parle d'autre chose ; là, ce que j'ai dit va dans les fiches »). À chaque pause de la
// conversation ou à chaque question, un modèle rapide lit ce qui s'est dit depuis la dernière mise à jour et dit si un
// point utile aux fiches vient de se clore. Oui : les fiches se mettent à jour ; non : on attend la suite.
// ---------------------------------------------------------------------------

const MODELE_RAPIDE = 'claude-haiku-4-5';
const SCHEMA_SUJET = { type: 'object', properties: { clos: { type: 'boolean' }, raison: { type: 'string' } }, required: ['clos'] };

export function consigneSujet(passage) {
  return `Tu écoutes en direct une conversation de travail (un rendez-vous ou un appel d'une agence d'immobilier commercial), pour mettre à jour les fiches du dossier (le bien, le client, l'agent) au fil des faits.

Voici ce qui s'est dit depuis la dernière mise à jour des fiches. La fin du passage est ce qui vient d'être dit. La transcription est automatique, sans noms de locuteurs, parfois imparfaite.

PASSAGE :
${passage}

Réponds clos = true seulement si les deux sont vrais :
1. le passage contient au moins un fait utile aux fiches : un prix, une offre, un loyer, le locataire, le bail, ce que cherche le client, ses moyens, une décision, une date, une chose à faire, une impression nette sur une personne ;
2. ce point est terminé : la conversation passe à un autre sujet, l'autre personne pose une question ou enchaîne sur autre chose, ou une explication vient de se conclure.
Sinon clos = false : on est encore au milieu du même point, ou le passage n'est que politesse et bavardage.
raison : quelques mots (« passe du prix au bail », « encore sur le prix »).`;
}

/** Le point en cours vient-il de se clore ? `passage` : ce qui s'est dit depuis la dernière mise à jour. */
export async function sujetClos(passage, user, { lire = null } = {}) {
  const t = String(passage || '').trim();
  if (t.length < 120) return { clos: false, raison: 'trop court' };
  const extrait = t.length > 8000 ? t.slice(-8000) : t;
  const appeler = lire || (() => invokeLLM({ prompt: consigneSujet(extrait), response_json_schema: SCHEMA_SUJET, modele: MODELE_RAPIDE, max_tokens: 300 }));
  const { resultat } = await mesurer({ operation: 'suivre un enregistrement', par: user?.email || null }, appeler);
  return { clos: resultat?.clos === true, raison: String(resultat?.raison || '').slice(0, 160) };
}
