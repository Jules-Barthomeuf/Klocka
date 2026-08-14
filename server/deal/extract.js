// BLOC 1 — Extraction.
//
// Un LLM lit le texte source et remplit un schéma imposé. Il ne calcule rien,
// ne décide rien, n'interprète rien. Aucun champ hors schéma n'est accepté.
//
// Le garde-fou qui suit l'appel est la pièce maîtresse : chaque valeur doit être
// adossée à une citation littérale retrouvable dans le texte source. Une
// citation introuvable fait tomber la valeur, quelle que soit sa vraisemblance.

import { invokeLLM, llmEnabled } from '../llm.js';

export const CHAMPS = [
  'adresse',
  'prix_fai',
  'honoraires_inclus',
  'montant_honoraires',
  'loyer_annuel_ht_hc',
  'surface_m2',
  'locataire_nom',
  'locataire_activite',
  'bail_echeance',
  'bail_type',
  'occupe',
  'rendement_annonce',
  'type_actif',
];

// L'adresse est le seul champ composite : ses sous-champs portent la valeur,
// mais la citation/confiance sont communes.
const champAbsent = () => ({ valeur: null, citation: null, confiance: null, absent: true });

export function lotVide() {
  const lot = {};
  for (const c of CHAMPS) lot[c] = champAbsent();
  lot.adresse = { valeur: { rue: null, code_postal: null, ville: null }, citation: null, confiance: null, absent: true };
  return lot;
}

const SCHEMA_REPONSE = {
  type: 'object',
  properties: {
    lots: {
      type: 'array',
      description: "Un objet par lot décrit dans la fiche. Une fiche mono-lot renvoie un seul élément.",
      items: {
        type: 'object',
        properties: {
          intitule_lot: { type: 'string', description: "Libellé distinguant ce lot dans la fiche (ex: 'Lot 2 - 15 rue X'). Vide si mono-lot." },
          adresse: {
            type: 'object',
            properties: {
              valeur: {
                type: 'object',
                properties: {
                  rue: { type: 'string' },
                  code_postal: { type: 'string' },
                  ville: { type: 'string' },
                },
              },
              citation: { type: 'string' },
              confiance: { type: 'string', enum: ['haute', 'moyenne', 'basse'] },
              absent: { type: 'boolean' },
            },
          },
          prix_fai: { $ref: '#/$defs/champ_nombre' },
          honoraires_inclus: { $ref: '#/$defs/champ_booleen' },
          montant_honoraires: { $ref: '#/$defs/champ_nombre' },
          loyer_annuel_ht_hc: { $ref: '#/$defs/champ_nombre' },
          surface_m2: { $ref: '#/$defs/champ_nombre' },
          locataire_nom: { $ref: '#/$defs/champ_texte' },
          locataire_activite: { $ref: '#/$defs/champ_texte' },
          bail_echeance: { $ref: '#/$defs/champ_texte' },
          bail_type: { $ref: '#/$defs/champ_texte' },
          occupe: { $ref: '#/$defs/champ_booleen' },
          rendement_annonce: { $ref: '#/$defs/champ_nombre' },
          type_actif: { $ref: '#/$defs/champ_texte' },
        },
      },
    },
  },
  $defs: {
    champ_nombre: {
      type: 'object',
      properties: {
        valeur: { type: 'number' },
        citation: { type: 'string' },
        confiance: { type: 'string', enum: ['haute', 'moyenne', 'basse'] },
        absent: { type: 'boolean' },
      },
    },
    champ_texte: {
      type: 'object',
      properties: {
        valeur: { type: 'string' },
        citation: { type: 'string' },
        confiance: { type: 'string', enum: ['haute', 'moyenne', 'basse'] },
        absent: { type: 'boolean' },
      },
    },
    champ_booleen: {
      type: 'object',
      properties: {
        valeur: { type: 'boolean' },
        citation: { type: 'string' },
        confiance: { type: 'string', enum: ['haute', 'moyenne', 'basse'] },
        absent: { type: 'boolean' },
      },
    },
  },
};

const CONSIGNES = `Tu es un extracteur de données. Tu lis une fiche commerciale d'immobilier d'entreprise et tu remplis un schéma.

TU NE CALCULES RIEN. TU NE DÉCIDES RIEN. TU N'INTERPRÈTES RIEN.
Tu ne fais que relever ce qui est écrit.

Chaque champ est un objet à quatre attributs :
- "valeur"    : la donnée relevée, au bon type (nombre sans espace ni symbole pour les montants)
- "citation"  : un extrait LITTÉRAL du document, copié caractère pour caractère, qui contient cette donnée
- "confiance" : "haute", "moyenne" ou "basse"
- "absent"    : true si l'information ne figure pas dans le document

RÈGLES IMPÉRATIVES :
1. Ne jamais inférer une valeur non écrite. Un champ non mentionné est {"valeur": null, "citation": null, "confiance": null, "absent": true} — jamais une estimation, jamais une moyenne du marché.
2. "citation" doit être un extrait littéral présent tel quel dans le document. Ne le reformule pas, ne le complète pas, ne corrige pas sa ponctuation. Si tu ne peux pas citer, le champ est absent.
3. Loyer : si le montant est mensuel, convertis-le en annuel dans "valeur" et signale-le dans la citation en reprenant d'abord l'extrait littéral. Si la périodicité est ambiguë, mets confiance "basse".
4. bail_type : "ferme" UNIQUEMENT si le document emploie ce terme, ou mentionne une période d'engagement sans faculté de résiliation. Sinon "3-6-9", ou absent si rien n'est dit.
5. occupe : false UNIQUEMENT si la vacance est explicite ("vacant", "libre de tout occupant"). Un bien présenté sans mention de locataire est ABSENT, pas vacant.
6. prix_fai : le prix de vente affiché, frais d'agence inclus. honoraires_inclus indique si les honoraires sont compris dans ce prix.
7. Si la fiche décrit PLUSIEURS LOTS, renvoie un élément par lot dans "lots", chacun avec ses propres valeurs et citations. Ne fusionne jamais deux lots. Ne répartis pas un prix global entre les lots : si un prix est global, il est absent au niveau du lot.
8. N'ajoute aucun champ hors du schéma.`;

// --- Garde-fou -------------------------------------------------------------

// Normalisation tolérante : casse, accents, espaces (y compris insécables et
// fines, courantes dans les montants "320 000 €"), ponctuation d'apostrophe.
function normaliser(str) {
  return String(str ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[    ]/g, ' ')
    .replace(/[''`´]/g, "'")
    .replace(/[""«»]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Vérifie qu'une citation figure littéralement dans le texte source.
 * @returns {boolean}
 */
export function citationPresente(citation, texteSource) {
  const c = normaliser(citation);
  if (!c || c.length < 3) return false;
  return normaliser(texteSource).includes(c);
}

const estVide = (v) => v === null || v === undefined || v === '';

/**
 * Applique le garde-fou à un lot extrait : tout champ dont la citation est
 * introuvable repasse en absent. Renvoie le lot nettoyé et le journal des rejets.
 */
export function verifierLot(lotBrut, texteSource) {
  const lot = lotVide();
  const incidents = [];

  for (const champ of CHAMPS) {
    const brut = lotBrut?.[champ];
    if (!brut || typeof brut !== 'object') continue;
    if (brut.absent === true) continue;

    const valeurVide =
      champ === 'adresse'
        ? !brut.valeur || (estVide(brut.valeur.rue) && estVide(brut.valeur.ville) && estVide(brut.valeur.code_postal))
        : estVide(brut.valeur);
    if (valeurVide) continue;

    if (!citationPresente(brut.citation, texteSource)) {
      incidents.push({
        champ,
        motif: estVide(brut.citation) ? 'citation_absente' : 'citation_introuvable',
        citation: brut.citation ?? null,
        valeur_rejetee: brut.valeur ?? null,
      });
      continue; // le champ reste absent
    }

    lot[champ] = {
      valeur: brut.valeur,
      citation: brut.citation,
      confiance: ['haute', 'moyenne', 'basse'].includes(brut.confiance) ? brut.confiance : 'moyenne',
      absent: false,
    };
  }

  lot.intitule_lot = typeof lotBrut?.intitule_lot === 'string' ? lotBrut.intitule_lot.trim() : '';
  return { lot, incidents };
}

/**
 * Extrait un ou plusieurs lots du texte source.
 * @param {string} texteSource
 * @returns {Promise<{lots: object[], incidents: object[], ia: boolean}>}
 */
export async function extraire(texteSource) {
  if (!texteSource || !texteSource.trim()) {
    return { lots: [lotVide()], incidents: [], ia: false };
  }
  if (!llmEnabled) {
    // Sans IA, on ne devine rien : tous les champs sont absents et le dossier
    // ressortira INSUFFISANT, ce qui est le comportement honnête.
    return { lots: [lotVide()], incidents: [{ lot: 0, champ: '*', motif: 'ia_non_configuree' }], ia: false };
  }

  const brut = await invokeLLM({
    prompt: `${CONSIGNES}\n\n--- DOCUMENT ---\n${texteSource}\n--- FIN DU DOCUMENT ---`,
    response_json_schema: SCHEMA_REPONSE,
  });

  const lotsBruts = Array.isArray(brut?.lots) && brut.lots.length ? brut.lots : [brut];

  const lots = [];
  const incidents = [];
  lotsBruts.forEach((lb, i) => {
    const { lot, incidents: inc } = verifierLot(lb, texteSource);
    lots.push(lot);
    inc.forEach((x) => incidents.push({ ...x, lot: i }));
  });

  if (incidents.length) {
    console.warn(
      `[preanalyse] ${incidents.length} valeur(s) rejetée(s) par le garde-fou de citation :`,
      incidents.map((i) => `${i.champ}(${i.motif})`).join(', ')
    );
  }

  return { lots, incidents, ia: true };
}
