// La relecture d'une préz (12 oct. 2026, Jules : « je veux pouvoir lui donner
// ma préz et que ça vérifie les chiffres »). Une présentation jointe au chat
// (projet de financement, PDF ou Word) est relue contre le projet de la
// plateforme, et son dossier s'il en a un : chaque chiffre de la préz face à
// celui de la plateforme, les calculs refaits (loyer au m², loyer mensuel,
// indexation, cumuls, rendement), les cases restées à remplir. Rien n'est
// créé ni modifié : la réponse dit ce qui est juste et ce qui est à corriger.

import fs from 'fs';
import path from 'path';
import { Records } from '../db.js';
import { invokeLLM } from '../llm.js';
import { mesurer } from '../llm-couts.js';

const LONGUEUR_MAX = 40000;
// Ce qui n'est pas un chiffre du bien : identifiants, liens, méta.
const HORS_SUJET = /^(id|created_|updated_|created_by|admin_|client_|monday_|photos|presentation_|sim_lien|sim_fichier|deal_id|drive)/;

/** Pure : les champs renseignés d'un projet, sans les zéros ni les vides du simulateur, triés par nom. */
export function champsRenseignes(projet) {
  return Object.fromEntries(Object.entries(projet || {})
    .filter(([k, v]) => !HORS_SUJET.test(k) && v != null && v !== '' && v !== 0 && v !== 'null' && (typeof v === 'number' || typeof v === 'boolean' || (typeof v === 'string' && v.length <= 400)))
    .sort(([a], [b]) => a.localeCompare(b)));
}

const SCHEMA = {
  type: 'object',
  properties: {
    synthese: { type: 'string', description: "Deux phrases au plus : la préz est-elle prête à envoyer, et ce qu'il faut corriger d'abord." },
    ecarts: {
      type: 'array',
      description: 'Chaque chiffre ou fait de la préz qui ne colle pas : à la plateforme, à un autre endroit de la préz, ou à un calcul refait.',
      items: {
        type: 'object',
        properties: {
          page: { type: 'string', description: 'le numéro du repère « --- page N --- » du texte (« page 10 »), jamais le numéro du sommaire ; ou « plusieurs »' },
          element: { type: 'string', description: 'ce qui est en cause, en quelques mots (« loyer net année 10 »)' },
          dans_la_prez: { type: 'string', description: 'la valeur telle qu’écrite dans la préz' },
          attendu: { type: 'string', description: 'la valeur juste, et d’où elle vient (champ de la plateforme ou calcul détaillé)' },
          gravite: { type: 'string', enum: ['bloquant', 'a_corriger', 'a_verifier'], description: "bloquant : faux et visible par la banque (prix, loyer, rendement, financement) ; a_corriger : erreur ou incohérence secondaire ; a_verifier : la plateforme ne permet pas de trancher" },
        },
        required: ['page', 'element', 'dans_la_prez', 'attendu', 'gravite'],
      },
    },
    a_remplir: { type: 'array', items: { type: 'string' }, description: 'Une phrase par case restée vide ou générique (« page 1 : « Prenom NOM » et « A l’attention de XXX » »), page d’après le repère « --- page N --- ».' },
    conformes: { type: 'array', items: { type: 'string' }, description: 'Les chiffres clés vérifiés et justes, une ligne chacun (« Prix d’acquisition 335 000 € : conforme au projet »).' },
  },
  required: ['synthese', 'ecarts', 'a_remplir', 'conformes'],
};

/** Pure : la consigne posée au modèle. */
export function consigneVerification({ texte, projet, dossier }) {
  return `Tu relis, pour Klocka (investissement en murs commerciaux), une présentation « projet de financement » destinée à une banque, avant qu'elle parte. Tu es exigeant et précis : une erreur de chiffre devant un banquier coûte le dossier.

Ta référence est la plateforme : le projet ci-dessous${dossier ? ' et son dossier de préanalyse' : ''}. Les champs « sim_* » sont ceux du simulateur (sim_prix_bien_negocie = prix d'acquisition négocié, sim_prix_bien_fai = prix affiché frais d'agence inclus, sim_loyer_initial_ht = loyer annuel HT HC, sim_indexation_loyers = indexation annuelle en %, sim_travaux_montantN et sim_travaux_anneeN = travaux prévus l'année N, sim_taux_interet, sim_duree_credit, sim_apport, sim_droits_enregistrement = droits en % du prix, etc.). Un champ absent ou à zéro n'est pas renseigné : ne l'invente pas, et ne reproche pas à la préz une valeur que la plateforme n'a pas.

Vérifie, page par page :
1. chaque chiffre de la préz contre la plateforme (prix, loyer, surface, locataire, activité, dates et échéance du bail, travaux, charges, taxe foncière, financement) ;
2. la cohérence interne : un même chiffre identique partout, et les calculs refaits (loyer au m² = loyer / surface, loyer mensuel = annuel / 12, prix au m², durée restante du bail à la date d'aujourd'hui (${new Date().toISOString().slice(0, 10)}), chaque année de la projection = la précédente × (1 + indexation), loyers nets = bruts − charges − travaux de l'année, cumuls, rendement = loyer / prix) ; recalcule toi-même, chiffre par chiffre, et donne le calcul dans « attendu » ;
3. les phrases qui contredisent les chiffres (« charges et taxe foncière à la charge du locataire » alors que la projection ou le projet en portent) ;
4. ce qui est resté générique ou vide : noms à remplacer, « XXX », tirets à la place d'une valeur, page sans contenu.
Un écart d'arrondi de moins de 1 € n'est pas un écart. Ne liste dans « conformes » que ce que tu as vraiment vérifié.

LE PROJET (champs renseignés) :
${JSON.stringify(projet, null, 1)}
${dossier ? `\nLE DOSSIER DE PRÉANALYSE :\n${JSON.stringify(dossier, null, 1).slice(0, 8000)}\n` : ''}
LA PRÉSENTATION (texte des pages) :
${texte}`;
}

/** Relit une présentation jointe contre un projet (et son dossier). `invoquer` se remplace dans les tests. */
export async function verifierPresentation({ chemin, projet_id = null, deal_id = null }, { user = null, invoquer = invokeLLM } = {}) {
  if (!chemin || !fs.existsSync(chemin)) return { ok: false, error: 'Présentation introuvable : elle doit être jointe au message.' };
  const projet = projet_id ? Records.get('Project', projet_id) : null;
  if (projet_id && !projet) return { ok: false, error: 'Projet introuvable : trouver_bien ou chercher_projet pour son identifiant.' };
  const dealId = deal_id || projet?.deal_id || null;
  const deal = dealId ? Records.findBy('Deal', 'deal_id', dealId) : null;
  if (!projet && !deal) return { ok: false, error: 'Il faut le projet ou le dossier de référence : trouver_bien d’abord.' };

  const { ingerer } = await import('../deal/ingest.js');
  const nom = path.basename(chemin).replace(/^\d+-[0-9a-f]{8}-/, '');
  const lu = await ingerer({ buffer: fs.readFileSync(chemin), filename: nom, mimetype: /\.pdf$/i.test(chemin) ? 'application/pdf' : undefined });
  const texte = String(lu?.texte || '').trim();
  if (!texte) return { ok: false, error: 'Je ne lis rien dans cette présentation (ni texte, ni page reconnue).' };

  let dossier = null;
  const lot = deal?.lots?.[0];
  if (lot) {
    try {
      const { vueRedacteur } = await import('../deal/redact.js');
      const vue = vueRedacteur({ lot: lot.lot, enrichissement: lot.enrichissement, evaluation: lot.evaluation });
      dossier = { titre: deal.titre || null, bien: vue.bien, finances: vue.finances };
    } catch { dossier = { titre: deal.titre || null }; }
  }
  const prompt = consigneVerification({ texte: texte.slice(0, LONGUEUR_MAX), projet: projet ? { titre: projet.titre, ...champsRenseignes(projet) } : null, dossier });
  const { resultat } = await mesurer({ operation: 'relecture de préz', sur: projet?.id || dealId, par: user?.email || null }, () =>
    invoquer({ prompt, response_json_schema: SCHEMA, effort: 'medium', max_tokens: 20000 }));
  const r = resultat || {};
  return {
    ok: true,
    reference: projet ? `projet « ${projet.titre} »` : `dossier « ${deal?.titre || dealId} »`,
    pages: lu.pages || null,
    tronque: texte.length > LONGUEUR_MAX,
    synthese: r.synthese || null,
    ecarts: Array.isArray(r.ecarts) ? r.ecarts : [],
    a_remplir: (Array.isArray(r.a_remplir) ? r.a_remplir : []).map((x) => (typeof x === 'string' ? x : Object.values(x || {}).join(' : '))).filter(Boolean),
    conformes: Array.isArray(r.conformes) ? r.conformes : [],
  };
}
