// La ligne Bail de la Pré-analyse en texte libre (11 nov. 2026, Jules : « je veux pouvoir mettre ce que je veux ; parfois
// on voit juste 12 ans ferme, donc on ne peut pas remplir départ et échéance ; l'IA analyse ce qu'on a mis, pas juste
// la valeur »). Le modèle lit le texte et rend les cases du projet ; ce que le texte ne dit pas reste vide. Une échéance
// ne se calcule que si le texte donne le début et la durée.

import { invokeLLM } from '../llm.js';

const SCHEMA = {
  type: 'object',
  properties: {
    type_bail: { type: 'string', description: "le bail en quelques mots, tel qu'on le dit : « Bail commercial 3-6-9 », « Bail de 12 ans ferme », « Bail dérogatoire de 36 mois », « Bail professionnel »" },
    duree_ans: { type: ['number', 'null'], description: 'la durée totale du bail en années, si le texte la dit' },
    duree_ferme_ans: { type: ['number', 'null'], description: "les années fermes (sans sortie triennale), si le texte les dit ; « 12 ans ferme » : 12" },
    date_debut: { type: ['string', 'null'], description: "la prise d'effet en AAAA-MM-JJ, seulement si le texte la donne (une année seule : le 1er janvier de cette année)" },
    date_echeance: { type: ['string', 'null'], description: "l'échéance en AAAA-MM-JJ, seulement si le texte la donne" },
  },
  required: ['type_bail', 'duree_ans', 'duree_ferme_ans', 'date_debut', 'date_echeance'],
};

const consigne = (texte, aujourdHui) => [
  "Un analyste immobilier a écrit en quelques mots ce qu'il sait du bail commercial d'un local. Range-le dans les cases demandées.",
  `Son texte : « ${texte} »`,
  `Aujourd'hui : ${aujourdHui}.`,
  "N'invente rien : une date que le texte ne donne pas reste null. Ne calcule pas l'échéance toi-même. « 12 ans ferme » donne une durée et une période ferme, pas de date.",
  'Réponds en JSON.',
].join('\n');

// Compté dans les coûts de l'IA comme les autres gestes (llm-couts.js).
const lireParDefaut = async ({ prompt }) => {
  const { mesurer } = await import('../llm-couts.js');
  const { resultat } = await mesurer({ operation: 'lire le bail saisi' }, () => invokeLLM({ prompt, response_json_schema: SCHEMA, effort: 'low' }));
  return resultat;
};

/** Pure : une date AAAA-MM-JJ valide, sinon null. */
export function dateOuNull(v) {
  const m = String(v || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return Number.isNaN(d.getTime()) || d.getUTCMonth() !== +m[2] - 1 ? null : `${m[1]}-${m[2]}-${m[3]}`;
}

/** Pure : un nombre d'années positif, sinon null. */
const ans = (v) => (Number(v) > 0 && Number(v) < 100 ? Math.round(Number(v) * 10) / 10 : null);

/** Pure : la lecture du modèle remise au propre ; l'échéance seulement si le début et la durée la donnent. */
export function nettoyerBail(brut, texte) {
  const x = brut && typeof brut === 'object' ? brut : {};
  const debut = dateOuNull(x.date_debut);
  const duree = ans(x.duree_ans);
  let echeance = dateOuNull(x.date_echeance);
  if (!echeance && debut && duree && Number.isInteger(duree)) {
    const d = new Date(`${debut}T00:00:00Z`);
    d.setUTCFullYear(d.getUTCFullYear() + duree);
    d.setUTCDate(d.getUTCDate() - 1);
    echeance = d.toISOString().slice(0, 10);
  }
  return {
    texte,
    type_bail: String(x.type_bail || '').trim().slice(0, 120) || texte.slice(0, 120),
    duree_ans: duree,
    duree_ferme_ans: ans(x.duree_ferme_ans),
    date_debut: debut,
    date_echeance: echeance,
    le: new Date().toISOString(),
  };
}

/** Lit le texte libre de la ligne Bail. Sans modèle ou en échec : le texte seul, sans aucune date. */
export async function lireBailLibre(texte, { lire = lireParDefaut, aujourdHui = new Date().toISOString().slice(0, 10) } = {}) {
  const t = String(texte || '').replace(/\s+/g, ' ').trim();
  if (!t) return null;
  try {
    const r = await lire({ prompt: consigne(t, aujourdHui) });
    return nettoyerBail(typeof r === 'string' ? JSON.parse(r) : r, t);
  } catch {
    return nettoyerBail({}, t);
  }
}
