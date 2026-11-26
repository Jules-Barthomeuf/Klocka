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
  // Les équipements du local que la fiche nomme (25 nov. 2026, Jules : « la surface, le plan si on a et les équipements,
  // extraction etc. ») : ils passent à l'onglet Bien du projet.
  'equipements',
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
                  repere: { type: 'string', description: "Sans numéro ni rue : le repère que la fiche donne pour situer le local, tel qu'écrit (« métro Rambuteau », « place de la République », « face à la gare Saint-Charles »). Vide sinon." },
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
          equipements: { $ref: '#/$defs/champ_texte' },
          commerces: {
            type: 'array',
            description: "Quand ce lot est un ensemble de plusieurs cellules commerciales louées à des locataires différents (un portefeuille : « 3 locataires, 4 cellules »), une entrée par cellule, telle que l'état locatif ou la fiche la décrit. Vide pour un local à un seul locataire.",
            items: {
              type: 'object',
              properties: {
                locataire: { type: 'string', description: "L'enseigne ou le nom du locataire, tel qu'écrit. Vide pour une cellule vacante." },
                activite: { type: 'string' },
                surface_m2: { type: 'number' },
                loyer_annuel: { type: 'number', description: 'Le loyer annuel HT HC de la cellule, tel qu\'écrit.' },
                vacant: { type: 'boolean', description: 'true seulement si la fiche dit la cellule vacante ou libre.' },
              },
            },
          },
        },
      },
    },
    biens_annonces: {
      type: 'integer',
      description: "Le nombre de biens que le document annonce lui-même, en toutes lettres ou en chiffres (« 4 actifs à céder », « portefeuille de 6 murs », « 3 lots »). 0 s'il n'annonce aucun nombre.",
    },
    agent: {
      type: 'object',
      description: "L'agent immobilier qui présente le bien, et ses coordonnées telles qu'écrites. Vide si le document n'en donne pas.",
      properties: {
        nom: { type: 'string' },
        email: { type: 'string' },
        telephone: { type: 'string' },
        agence: { type: 'string' },
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

Le texte vient d'un PDF : les colonnes d'une mise en page peuvent y être
mélangées, et un libellé séparé de sa valeur. Cherche la valeur d'un libellé
dans tout le document, pas seulement sur la ligne d'à côté.

Chaque champ est un objet à quatre attributs :
- "valeur"    : la donnée relevée, au bon type (nombre sans espace ni symbole pour les montants)
- "citation"  : un extrait LITTÉRAL du document, copié caractère pour caractère, qui contient cette donnée
- "confiance" : "haute", "moyenne" ou "basse"
- "absent"    : true si l'information ne figure pas dans le document

RÈGLES IMPÉRATIVES :
1. Ne jamais inférer une valeur non écrite. Un champ non mentionné est {"valeur": null, "citation": null, "confiance": null, "absent": true} — jamais une estimation, jamais une moyenne du marché.
2. "citation" doit être un extrait littéral présent tel quel dans le document. Ne le reformule pas, ne le complète pas, ne corrige pas sa ponctuation. Si tu ne peux pas citer, le champ est absent.
3. Loyer : si le montant est mensuel, convertis-le en annuel dans "valeur" ; la citation reste l'extrait mensuel littéral, sans annotation ni conversion. Si la périodicité est ambiguë, mets confiance "basse".
4. bail_type : "ferme" UNIQUEMENT si le document emploie ce terme, ou mentionne une période d'engagement sans faculté de résiliation. Sinon "3-6-9", ou absent si rien n'est dit.
5. occupe : false UNIQUEMENT si la vacance est explicite ("vacant", "libre de tout occupant"). Un bien présenté sans mention de locataire est ABSENT, pas vacant.
6. prix_fai : le prix de vente affiché, quel que soit son libellé — « prix de vente », « prix net vendeur », « NV », « FAI », « HAI » — hors frais de notaire et hors prix d'acquisition total. Relève le montant écrit, sans rien y ajouter ni en retrancher. Un prix net vendeur avec honoraires en sus va DANS prix_fai, tel quel. honoraires_inclus : true si le prix est donné honoraires inclus (FAI, HAI), false s'il est net vendeur ou que les honoraires sont « en sus » ; absent si rien ne le dit. montant_honoraires : le montant des honoraires en euros s'il est écrit quelque part dans le document ; un simple pourcentage ne suffit pas (tu ne calcules rien).
7. Si la fiche décrit PLUSIEURS LOTS, renvoie un élément par lot dans "lots", chacun avec ses propres valeurs et citations. Ne fusionne jamais deux lots. Ne répartis pas un prix global entre les lots : si un prix est global, il est absent au niveau du lot. Un lot est un bien qu'on peut vendre : un immeuble ou un local loué à plusieurs locataires reste UN lot (ses locataires ne sont pas des lots), sauf si le document les vend séparément. Une liste ou un tableau de biens à vendre donne un lot par ligne.
8. N'ajoute aucun champ hors du schéma.
9. agent : la personne de l'agence qui présente ou envoie le bien (signature d'un mail, pied de fiche, « votre contact »), avec son nom, son adresse mail, son téléphone et le nom de son agence, recopiés tels qu'écrits. Jamais le locataire, le vendeur, le syndic, un notaire ni l'équipe Klocka (@klocka.immo). Ce qui n'est pas écrit reste vide.
10. biens_annonces : le nombre de biens que le document dit lui-même porter (« 4 actifs », « 6 murs commerciaux »), recopié ; 0 s'il ne donne aucun nombre. Tu ne comptes pas toi-même.
11. commerces : un lot loué à plusieurs locataires (un portefeuille de cellules commerciales vendu ensemble) reste UN lot (règle 7), mais chacune de ses cellules a son entrée dans "commerces" : le locataire tel qu'écrit, l'activité, la surface, le loyer annuel, et vacant à true pour une cellule vide. Recopie l'état locatif, ne calcule rien. Un local à un seul locataire n'a pas de "commerces".
12. equipements : les équipements du local que la fiche nomme, en mots courts séparés par des virgules (« extraction, terrasse de 20 m², cave, climatisation, vitrine double, licence IV »). Seulement ce qui est écrit ; la citation est l'extrait qui en nomme le plus. Absent si la fiche n'en nomme aucun.`;

// La cellule à lire seule (24 nov. 2026, Jules : « un portefeuille, préanalyser séparément ou en un seul lot ? ») : le
// portefeuille est découpé en un dossier par commerce, chacun lu sur le même document.
export const consigneCible = (cible) => `CONSIGNE PARTICULIÈRE : le document décrit plusieurs cellules commerciales. Ne relève QUE la cellule louée à « ${String(cible?.locataire || '').slice(0, 80)} »${cible?.surface_m2 ? ` (${cible.surface_m2} m²)` : ''} : un seul lot, avec son locataire, son activité, sa surface, son loyer annuel, son bail et l'adresse de l'immeuble. Un prix ou un rendement donné pour l'ensemble reste absent. "commerces" reste vide, biens_annonces à 0.`;

// --- Garde-fou -------------------------------------------------------------

// Normalisation tolérante : casse, accents, espaces (y compris insécables et
// fines, courantes dans les montants "320 000 €"), apostrophes et guillemets
// courbes, tirets typographiques. Le modèle recopie souvent « Prix d'achat »
// avec l'apostrophe droite quand le PDF porte la courbe : sans ce pliage, la
// citation était rejetée et la valeur perdue avec elle.
function normaliser(str) {
  return String(str ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u00a0\u202f\u2009\u2007]/g, ' ')
    .replace(/[\u2018\u2019\u0060\u00b4]/g, "'")
    .replace(/[\u201c\u201d\u00ab\u00bb]/g, '"')
    .replace(/[\u2013\u2014\u2212]/g, '-')
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

// Les champs numériques du schéma. Le modèle renvoie parfois « 430 000 € »
// en texte malgré la consigne : sans coercition, la valeur traversait tout le
// pipeline en chaîne et ressortait en « NaN € » ou « prix non renseigné ».
const NOMBRES = new Set(['prix_fai', 'montant_honoraires', 'loyer_annuel_ht_hc', 'surface_m2', 'rendement_annonce']);
export function enNombre(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let s = String(v ?? '').replace(/[\u00a0\u202f\s€%]/g, '').trim();
  if (s === '') return null;
  if (s.includes(',')) {
    // La virgule est la décimale : les points restants sont des milliers.
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) {
    // Écriture à points de milliers, sans décimale : « 320.000 », « 1.250.000 ».
    s = s.replace(/\./g, '');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

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

    let valeur = brut.valeur;
    if (NOMBRES.has(champ)) {
      valeur = enNombre(valeur);
      if (valeur === null) {
        incidents.push({ champ, motif: 'valeur_illisible', citation: brut.citation ?? null, valeur_rejetee: brut.valeur ?? null });
        continue;
      }
    }

    lot[champ] = {
      valeur,
      citation: brut.citation,
      confiance: ['haute', 'moyenne', 'basse'].includes(brut.confiance) ? brut.confiance : 'moyenne',
      absent: false,
    };
  }

  lot.intitule_lot = typeof lotBrut?.intitule_lot === 'string' ? lotBrut.intitule_lot.trim() : '';
  const commerces = verifierCommerces(lotBrut?.commerces, texteSource);
  if (commerces.length) lot.commerces = commerces;
  return { lot, incidents };
}

/**
 * Pure : les cellules d'un portefeuille (24 nov. 2026, Jules : « ça compte comme trois fiches car trois commerces »).
 * Une cellule louée garde son locataire seulement s'il figure dans le document ; une cellule sans locataire lisible
 * n'est gardée que vacante. Moins de deux cellules : rien (un local à un locataire n'est pas un portefeuille).
 */
export function verifierCommerces(brut, texteSource) {
  if (!Array.isArray(brut)) return [];
  const sortie = [];
  for (const c of brut.slice(0, 40)) {
    if (!c || typeof c !== 'object') continue;
    const nom = typeof c.locataire === 'string' ? c.locataire.trim() : '';
    const lu = nom.length >= 2 && citationPresente(nom, texteSource);
    const vacant = c.vacant === true || (!nom && /\b(vacant|vacante|libre)\b/i.test(texteSource));
    if (!lu && !vacant) continue;
    const surface = enNombre(c.surface_m2);
    const loyer = enNombre(c.loyer_annuel);
    sortie.push({
      locataire: lu && !vacant ? nom : null,
      activite: typeof c.activite === 'string' && c.activite.trim() ? c.activite.trim().slice(0, 80) : null,
      surface_m2: surface && surface > 0 ? surface : null,
      loyer_annuel: loyer && loyer > 0 && !vacant ? loyer : null,
      vacant: !!vacant,
    });
  }
  return sortie.length >= 2 ? sortie : [];
}

const chiffres = (t) => String(t ?? '').replace(/\D/g, '');

/**
 * Pure : l'agent relevé, chaque coordonnée gardée seulement si elle figure
 * dans le texte source. Un mail, un numéro ou un nom inventés partiraient
 * dans le CRM : le même garde-fou que les champs du bien s'applique.
 * @returns {{nom, email, telephone, agence} | null}
 */
export function verifierAgent(brut, texteSource) {
  if (!brut || typeof brut !== 'object') return null;
  const present = (v) => typeof v === 'string' && v.trim().length >= 3 && citationPresente(v.trim(), texteSource);
  const email = typeof brut.email === 'string' ? brut.email.trim().toLowerCase() : '';
  const tel = chiffres(brut.telephone);
  const agent = {
    nom: present(brut.nom) ? brut.nom.trim() : null,
    email: /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email) && present(email) && !email.endsWith('@klocka.immo') ? email : null,
    // Un numéro s'écrit de mille façons (points, espaces, +33) : on compare les chiffres.
    telephone: tel.length >= 9 && chiffres(texteSource).includes(tel.slice(-9)) ? String(brut.telephone).trim() : null,
    agence: present(brut.agence) ? brut.agence.trim() : null,
  };
  return agent.nom || agent.email || agent.telephone ? agent : null;
}

/**
 * Extrait un ou plusieurs lots du texte source.
 * @param {string} texteSource
 * @returns {Promise<{lots: object[], incidents: object[], ia: boolean}>}
 */
export async function extraire(texteSource, { cible = null } = {}) {
  if (!texteSource || !texteSource.trim()) {
    return { lots: [lotVide()], incidents: [], ia: false };
  }
  if (!llmEnabled) {
    // Sans IA, on ne devine rien : tous les champs sont absents et le dossier
    // ressortira INSUFFISANT, ce qui est le comportement honnête.
    return { lots: [lotVide()], incidents: [{ lot: 0, champ: '*', motif: 'ia_non_configuree' }], ia: false };
  }

  const brut = await invokeLLM({
    prompt: `${CONSIGNES}${cible ? `\n\n${consigneCible(cible)}` : ''}\n\n--- DOCUMENT ---\n${texteSource}\n--- FIN DU DOCUMENT ---`,
    response_json_schema: SCHEMA_REPONSE,
  });

  // Une cellule lue seule : un lot, sans ses voisines.
  const tous = Array.isArray(brut?.lots) && brut.lots.length ? brut.lots : [brut];
  const lotsBruts = cible ? [{ ...tous[0], commerces: [] }] : tous;

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

  // Le nombre de biens que le document annonce (22 nov. 2026, Jules : « 4 fiches dans un PDF ») : le compte des fiches
  // reçues le compare aux biens lus, et un écart se met « à vérifier » (deal/fiches-stats.js).
  const annonce = Number(brut?.biens_annonces);
  return { lots, incidents, ia: true, agent: verifierAgent(brut?.agent, texteSource), biens_annonces: !cible && Number.isInteger(annonce) && annonce > 0 && annonce <= 200 ? annonce : null };
}
