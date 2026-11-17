// Le résumé IA de la carte d'appel (15 nov. 2026, maquette de Jules : « Giboire Entreprise Rennes », « Résumé IA », trois
// phrases sous le nom). Ce que l'agence fait, ce qu'elle a en ligne, où on en est avec elle, et qui demander. Écrit d'après
// ce que Klocka sait déjà (Apollo, annonces Equimmox, registre du commerce, nos appels, le CRM), sans recherche web.
// Gardé avec l'agence (`resume_ia`) et refait seulement quand ce qu'on sait d'elle change : une agence revue ne coûte rien.

import { createHash } from 'node:crypto';
import { Records } from '../db.js';

const AGENCE = 'AgenceProspect';
const APPEL = 'AppelAgent';
const MODELE_RAPIDE = 'claude-haiku-4-5';

const SCHEMA = { type: 'object', properties: { texte: { type: 'string' } }, required: ['texte'] };

/** Pure : ce que le résumé peut dire de l'agence, rien d'autre. */
export function faitsDeLAgence(a, { fiche = null, appels = [], ville = null, pertinence = null, contacts = [] } = {}) {
  const derniers = [...appels].sort((x, y) => String(y.le).localeCompare(String(x.le))).slice(0, 3);
  return {
    nom: a?.nom || null,
    ville: ville || a?.ville || null,
    adresse: a?.adresse || null,
    specialite: pertinence?.specialite || null,
    indices: pertinence?.motifs || [],
    description: a?.apollo_description || null,
    mots_cles: (a?.apollo_mots || []).slice(0, 12),
    effectif: a?.effectif || null,
    // Zéro n'est pas su : une agence jamais lue chez Equimmox n'a pas « aucune annonce ».
    annonces: Number(a?.annonces) || null,
    annonces_commerce: Number(a?.annonces_commerce) || null,
    interlocuteurs: contacts.filter((x) => !x.standard).map((x) => [x.nom, x.fonction, x.source].filter(Boolean).join(', ')),
    appels: derniers.map((x) => ({ le: String(x.le || '').slice(0, 10), issue: x.issue || null, resume: x.resume || null })),
    crm: a?.monday_connu ? [a.monday_connu.statut, a.monday_connu.date].filter(Boolean).join(', ') || null : null,
    notes: fiche?.remarques ? String(fiche.remarques).slice(0, 500) : null,
    prochaine: fiche?.prochaine?.quoi || null,
    // Ce que dit son site (17 nov. 2026, Jules : « nous intervenons sur Nice, Antibes, Cannes », « 11 collaborateurs »,
    // ce qu'ils ont dans leurs offres), lu par site-agence.js.
    site: a?.site_lu && !a.site_lu.illisible ? {
      specialite: a.site_lu.specialite || null,
      zones: a.site_lu.zones || [],
      collaborateurs: a.site_lu.collaborateurs || null,
      offres: a.site_lu.offres || null,
      faits: a.site_lu.faits || [],
    } : null,
  };
}

/** Pure : l'empreinte des faits ; le résumé gardé vaut tant qu'elle ne change pas. */
export const cleDesFaits = (faits) => createHash('sha1').update(JSON.stringify(faits)).digest('hex').slice(0, 16);

/** Pure : la consigne donnée au modèle. */
export function construirePrompt(faits) {
  return `Tu prépares un appel de prospection de Klocka. Klocka cherche, pour des investisseurs financés, des murs commerciaux loués à acheter, et appelle les agences immobilières pour recevoir leurs biens avant la mise en ligne.

Écris le résumé de l'agence ci-dessous pour la personne qui va l'appeler, en français, en trois phrases au plus et 60 mots au plus, avec ce qui est utile à savoir avant de décrocher :
1. ce qu'est l'agence : sa spécialité, les villes où elle dit intervenir, sa taille (nombre de collaborateurs) ;
2. ce qu'elle a en offre (le site, les annonces relevées : vente ou location, types de biens, villes), le commerce surtout ;
3. où en est l'équipe avec elle (jamais appelée, ou ce que le dernier appel a donné) et qui demander.

Règles : n'invente rien qui ne soit dans les faits ; un fait absent ou null ne se dit pas (pas de « aucune annonce » si le nombre est null, jamais « aucune information disponible » ni « aucun appel enregistré » : dis « jamais appelée »). Ne dis jamais ce que Klocka cherche ni quoi leur proposer (partenariat, recevoir des murs, biens avant mise en ligne) : l'appelant le sait. Phrases simples, ton neutre, pas de tiret cadratin, pas de liste, pas de titre, pas le nom de l'agence en tête. Si aucun interlocuteur n'est connu, dis de demander le responsable commerce.

Faits (JSON) :
${JSON.stringify(faits, null, 1)}

Rends un JSON { "texte": "..." }.`;
}

const enCours = new Map();

/**
 * Le résumé de l'agence : le gardé si les faits n'ont pas bougé, sinon écrit (une demande à la fois par agence).
 * `lire(prompt)` remplace le modèle dans les tests.
 */
export async function resumeDeLAgence(agenceId, { lire = null, refaire = false } = {}) {
  const a = Records.get(AGENCE, agenceId);
  if (!a) return { ok: false, error: 'Agence introuvable.' };
  const MA = await import('./mode-appel.js');
  const fiche = a.carnet_id ? Records.get('AgentImmo', a.carnet_id) : null;
  const appels = a.carnet_id ? Records.list(APPEL).filter((x) => x.agent_id === a.carnet_id && x.etat === 'valide' && !x.essai_archive) : [];
  const ville = (a.liste_id && Records.get('ListeAgences', a.liste_id)?.ville) || null;
  const faits = faitsDeLAgence(a, { fiche, appels, ville: ville === 'Essai' ? null : ville, pertinence: MA.pertinence(a), contacts: MA.contactsDe(a, fiche) });
  const cle = cleDesFaits(faits);
  if (!refaire && a.resume_ia?.cle === cle && a.resume_ia.texte) return { ok: true, texte: a.resume_ia.texte, le: a.resume_ia.le };
  if (enCours.has(agenceId)) return enCours.get(agenceId);
  const p = (async () => {
    const prompt = construirePrompt(faits);
    let brut;
    if (lire) brut = await lire(prompt);
    else {
      const { invokeLLM } = await import('../llm.js');
      const { mesurer } = await import('../llm-couts.js');
      brut = (await mesurer({ operation: 'résumé agence', sur: agenceId }, () => invokeLLM({ prompt, response_json_schema: SCHEMA, modele: MODELE_RAPIDE, max_tokens: 600 }))).resultat;
    }
    const texte = String(brut?.texte || '').replace(/\s*—\s*/g, ', ').replace(/\s+/g, ' ').trim().slice(0, 600);
    if (!texte) return { ok: false, error: "Le résumé n'a pas abouti." };
    const le = new Date().toISOString();
    Records.update(AGENCE, agenceId, { resume_ia: { texte, cle, le } });
    return { ok: true, texte, le };
  })().finally(() => enCours.delete(agenceId));
  enCours.set(agenceId, p);
  return p;
}
