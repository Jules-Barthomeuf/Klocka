// Le récap de la semaine (27 nov. 2026, Jules : « un mode récap dans l'assistant ; on clique, on arrive dans un chat
// avec écrit "faites-moi un vocal pour me raconter votre semaine, et je l'envoie à qui vous le souhaitez" ; il
// structure, il dit "c'est bon pour vous ?" ; on choisit à qui l'envoyer, plusieurs personnes en même temps ; la personne
// voit son récap dès qu'elle ouvre la page, en début de semaine prochaine, la première fois le lundi d'après »).
// Le vocal est mis en forme par un appel au modèle, relu par son auteur, puis gardé ; rien ne part sans son « Envoyer ».

import { Records } from '../db.js';
import { invokeLLM } from '../llm.js';
import { mesurer } from '../llm-couts.js';
import { equipe, prenomDe } from './modele.js';

const ENTITE = 'RecapSemaine';
const norm = (e) => String(e || '').trim().toLowerCase();

/** Pure : le jour à Paris d'une date, « AAAA-MM-JJ ». */
export const jourParis = (d = new Date()) => new Date(d).toLocaleDateString('en-CA', { timeZone: 'Europe/Paris' });

/** Pure : le lundi de la semaine d'après, à Paris (un récap envoyé un lundi attend le lundi suivant). */
export function lundiSuivant(maintenant = new Date()) {
  const [a, m, j] = jourParis(maintenant).split('-').map(Number);
  const jour = new Date(Date.UTC(a, m - 1, j));
  const dow = jour.getUTCDay(); // 0 dimanche, 1 lundi
  const ecart = ((8 - dow) % 7) || 7;
  jour.setUTCDate(jour.getUTCDate() + ecart);
  return jour.toISOString().slice(0, 10);
}

const SCHEMA = {
  type: 'object',
  properties: {
    titre: { type: 'string', description: 'Une ligne : « Semaine du 24 novembre » ou ce que le vocal met en avant.' },
    parties: {
      type: 'array',
      items: {
        type: 'object',
        properties: { titre: { type: 'string' }, points: { type: 'array', items: { type: 'string' } } },
        required: ['titre', 'points'],
      },
    },
  },
  required: ['titre', 'parties'],
};

/** Pure : la consigne de mise en forme. `avant` : le récap déjà proposé, quand le vocal le corrige. */
export function consigneRecap(texte, { auteur = 'la personne', avant = null, maintenant = new Date() } = {}) {
  const jour = new Date(maintenant).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Paris' });
  return `${auteur}, de l'équipe Klocka (investissement en murs commerciaux), raconte sa semaine à voix haute pour un ou plusieurs collègues. Nous sommes le ${jour}. Mets son récit en forme : un récap qu'un collègue lit en une minute lundi matin.

Règles :
- Des parties courtes, dans l'ordre qui sert le lecteur ; reprends celles qui conviennent : « Ce qui a avancé », « Ce qui bloque », « À suivre la semaine prochaine », « À savoir » (une information utile à l'équipe), « Besoin d'aide ». Pas de partie vide.
- Un point par chose, une phrase qui se comprend seule : le dossier ou la personne nommés, les chiffres exacts tels que dits. Pas de formule creuse, pas de « il a été », pas de gras.
- N'invente rien, ne complète rien : ce qui n'est pas dit n'est pas écrit. Une hésitation reste une hésitation (« peut-être », « à confirmer »).
- La voix est transcrite : corrige les mots mal entendus quand le sens est sûr, enlève les répétitions et les « euh ».
- Écris à la première personne de ${auteur} (« J'ai relancé… »), comme s'il l'avait écrit lui-même.
- titre : « Semaine du … » (le lundi de cette semaine), sauf si le récit dit autre chose.
${avant ? `\nLe récap proposé avant (garde-le, change seulement ce que ${auteur} demande) :\n${JSON.stringify(avant)}\n\nCe que ${auteur} veut changer :` : '\nLe récit :'}
« ${String(texte).slice(0, 20000)} »`;
}

/** Pure : un récap propre (titre, parties non vides, points en texte). */
export function recapPropre(r) {
  const parties = (Array.isArray(r?.parties) ? r.parties : [])
    .map((p) => ({ titre: String(p?.titre || '').trim().slice(0, 80), points: (Array.isArray(p?.points) ? p.points : []).map((x) => String(x || '').trim().slice(0, 600)).filter(Boolean).slice(0, 15) }))
    .filter((p) => p.titre && p.points.length)
    .slice(0, 8);
  return { titre: String(r?.titre || '').trim().slice(0, 120) || 'Récap de la semaine', parties };
}

/** Met le vocal en forme (ou corrige le récap déjà proposé). */
export async function structurer({ texte, avant = null }, user, { maintenant = new Date(), lire = null } = {}) {
  const t = String(texte || '').trim();
  if (!t) return { ok: false, error: 'Rien à mettre en forme.' };
  const prompt = consigneRecap(t, { auteur: prenomDe(user?.email) || 'la personne', avant: avant ? recapPropre(avant) : null, maintenant });
  const appeler = lire || (() => invokeLLM({ prompt, response_json_schema: SCHEMA, effort: 'low', max_tokens: 3000 }));
  const { resultat } = await mesurer({ operation: 'mettre en forme un récap de semaine', par: user?.email || null }, appeler);
  const recap = recapPropre(resultat);
  if (!recap.parties.length) return { ok: false, error: "Je n'ai rien pu tirer de ce récit : redis-le, un peu plus long." };
  return { ok: true, recap };
}

/** Ceux à qui on peut l'envoyer : l'équipe, sans soi. */
export function destinatairesPossibles(user) {
  const moi = norm(user?.email);
  return equipe().filter((p) => p.email !== moi).map((p) => ({ email: p.email, prenom: p.prenom, nom: p.nom }));
}

/** Garde le récap ; il se montre à chaque destinataire à partir du lundi suivant. */
export function envoyer({ recap, texte = '', destinataires = [] }, user, { maintenant = new Date() } = {}) {
  const r = recapPropre(recap);
  if (!r.parties.length) return { ok: false, error: 'Le récap est vide.' };
  const connus = new Set(equipe().map((p) => p.email));
  const pour = [...new Set((Array.isArray(destinataires) ? destinataires : []).map(norm))].filter((e) => connus.has(e) && e !== norm(user?.email));
  if (!pour.length) return { ok: false, error: 'Choisis au moins une personne.' };
  const visible = lundiSuivant(maintenant);
  const rec = Records.create(ENTITE, { par: norm(user?.email), destinataires: pour, recap: r, texte: String(texte || '').slice(0, 20000), cree_le: new Date(maintenant).toISOString(), visible_des: visible, lus: {} });
  return { ok: true, id: rec.id, visible_des: visible, destinataires: pour.map((e) => ({ email: e, prenom: prenomDe(e) })) };
}

/** Les récaps reçus, visibles depuis leur lundi et pas encore lus, les plus anciens d'abord. */
export function recus(user, { maintenant = new Date() } = {}) {
  const moi = norm(user?.email);
  const aujourdhui = jourParis(maintenant);
  return Records.list(ENTITE)
    .filter((r) => (r.destinataires || []).includes(moi) && String(r.visible_des) <= aujourdhui && !r.lus?.[moi])
    .sort((a, b) => String(a.cree_le).localeCompare(String(b.cree_le)))
    .map((r) => ({ id: r.id, de: prenomDe(r.par), de_email: r.par, recap: r.recap, cree_le: r.cree_le, avec: (r.destinataires || []).filter((e) => e !== moi).map(prenomDe) }));
}

/** « J'ai lu » : le récap ne se montre plus à cette personne. */
export function marquerLu(id, user, { maintenant = new Date() } = {}) {
  const r = Records.get(ENTITE, String(id || ''));
  const moi = norm(user?.email);
  if (!r || !(r.destinataires || []).includes(moi)) return { ok: false, error: 'Récap introuvable.' };
  Records.update(ENTITE, r.id, { lus: { ...(r.lus || {}), [moi]: new Date(maintenant).toISOString() } });
  return { ok: true };
}
