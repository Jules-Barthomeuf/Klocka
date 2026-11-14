// L'agent qui rentre le projet (13 nov. 2026, Jules : « lorsqu'on clique sur Créer le projet, ça lance un agent qui fait
// toutes les recherches, regarde la fiche du bien, remplit le projet au maximum ; on le voit travailler en bas à gauche,
// on ouvre le petit truc et on voit ce qu'il fait ; ensuite il nous dit ce qu'il lui faut pour terminer ; une fois fini,
// "le projet est prêt, voir" »).
//
// Un travail en tâche de fond, étape par étape, gardé en base (AgentProjet) pour que la carte en bas à gauche le suive
// d'une page à l'autre :
//   1. les pièces pas encore lues le sont ; la commune et le marché se complètent ;
//   2. les chiffres de la ville, la dernière vente des murs, l'image de la ville ;
//   3. le projet naît comme avant (creerProjetDepuisDeal) : le lot, l'Analyse, les pièces ;
//   4. le modèle relit la fiche du bien et remplit ce qui reste vide, chaque valeur avec la phrase qui la donne ;
//   5. ce qui se déduit se calcule (début ou échéance d'un 3-6-9, en place depuis, rendement, loyer au m²) ;
//   6. le prix du résidentiel (Figaro) et le loyer autour (celui de la partie Marché du dossier), avant l'ouverture ;
//      puis ce qui ne tient pas debout (dates du bail, rendement, loyer au m² face au Marché, quittances), dit sans corriger ;
//   7. trois photos de la ville sur Google, à trier dans l'onglet Images (remplace « jamais de photos d'office », 19 oct.) ;
//   8. ce qu'il lui faut pour finir, dit sur la carte et en tête du chat du projet.
// Une valeur posée par l'agent garde sa source (mode Sources de l'éditeur). Il n'écrit que dans des cases vides et ne
// touche jamais une case modifiée à la main. Une étape qui échoue est dite et n'arrête pas les suivantes.

import { Records } from '../db.js';

const ENTITE = 'AgentProjet';
// Un travail sans nouvelles depuis ce délai est mort avec le serveur (un redémarrage l'interrompt).
const SANS_NOUVELLES_MS = 4 * 60 * 1000;
// Trois photos de la ville au plus (13 nov. 2026, Jules : « ça a pris trop de photos »).
const PHOTOS_VILLE = 3;
// L'attente du prix du résidentiel et du loyer autour, au plus.
const ATTENTE_SECTEUR_MS = 45 * 1000;
// La carte montre les travaux de la journée ; une carte fermée ne revient pas.
const FENETRE_MS = 24 * 3600 * 1000;

const vide = (v) => v == null || v === '' || v === 0 || (Array.isArray(v) && !v.length);
const euros = (n) => `${Math.round(Number(n)).toLocaleString('fr-FR').replace(/[\u202f\u00a0]/g, ' ')} €`;
const dateLongue = (iso) => { const d = new Date(`${iso}T00:00:00Z`); return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }); };
const court = (t, n = 160) => { const s = String(t || '').replace(/\s+/g, ' ').trim(); return s.length > n ? `${s.slice(0, n - 1)}…` : s; };

// ---------------------------------------------------------------------------
// Pures
// ---------------------------------------------------------------------------

/** Pure : une date AAAA-MM-JJ valide, sinon null. */
export function dateValide(v) {
  const m = String(v || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return Number.isNaN(d.getTime()) || d.getUTCMonth() !== +m[2] - 1 ? null : `${m[1]}-${m[2]}-${m[3]}`;
}

/** Pure : une date décalée d'un nombre d'années puis de jours. */
export function decaler(iso, ans, jours = 0) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + ans);
  d.setUTCDate(d.getUTCDate() + jours);
  return d.toISOString().slice(0, 10);
}

const est369 = (t) => /3\s*[-/.]\s*6\s*[-/.]\s*9|\bneuf ans\b|\b9 ans\b/i.test(String(t || ''));

// Ce que le modèle peut remplir, et comment la valeur se range. Les montants sont annuels.
export const LECTURES = {
  // Ce que la Pré-analyse n'a pas lu (banc du 13 nov. : CAFPI sans activité, Glacier et le Verger sans locataire, Krys
  // sans prix) : la fiche relue le donne souvent.
  nom_locataire: { type: 'texte', dit: "le nom du locataire en place (l'enseigne ou la société), seulement s'il est écrit" },
  activite_locataire: { type: 'texte', dit: "l'activité exercée dans le local en quelques mots (« Courtage en crédit immobilier », « Glacier »)" },
  prix_acquisition: { type: 'montant', dit: 'le prix de vente FAI (honoraires inclus), en euros ; un prix net vendeur seulement si le texte ne donne que lui' },
  bail_date_debut: { type: 'date', dit: "la prise d'effet (ou la signature) du bail en cours" },
  bail_date_echeance: { type: 'date', dit: "l'échéance du bail en cours" },
  bail_duree_ferme_ans: { type: 'nombre', dit: 'les années fermes du bail (sans sortie triennale)' },
  locataire_depuis: { type: 'date', dit: "depuis quand le locataire occupe le local, si le texte le dit (un locataire en place avant le bail en cours, renouvelé) ; une année seule : le 1er janvier" },
  loyer_annuel_ht: { type: 'montant', dit: 'le loyer actuel, HT HC, par an' },
  bail_loyer_initial: { type: 'montant', dit: 'le loyer à la signature du bail, HT HC, par an, seulement s’il est dit à part du loyer actuel' },
  bail_depot_garantie: { type: 'montant', dit: 'le dépôt de garantie, en euros' },
  provision_charges: { type: 'montant', dit: 'la provision pour charges, par an' },
  taxe_fonciere_an: { type: 'montant', dit: 'la taxe foncière, par an' },
  sim_charges_copropriete: { type: 'montant', dit: 'les charges de copropriété, par an' },
  sim_loyer_soumis_tva: { type: 'booleen', dit: 'le loyer est-il soumis à la TVA' },
  sim_taxe_refacturable: { type: 'booleen', dit: 'la taxe foncière est-elle refacturée au locataire' },
  sim_charges_refacturable: { type: 'booleen', dit: 'les charges sont-elles refacturées au locataire' },
  surface_detail: { type: 'texte', dit: 'le détail de la surface en quelques mots (« 180 m² en rez-de-chaussée avec vitrine »)' },
  profil_locataire: { type: 'texte', dit: "le profil de l'exploitant en deux à quatre mots, s'il est dit, sans redire son nom ni son activité, sans virgule ni parenthèse (« Enseigne nationale », « Franchisé », « Exploitant depuis 2010 »)" },
  type_construction: { type: 'texte', dit: "le bâti, s'il est dit (« Immeuble haussmannien », « Centre commercial »)" },
};
// Une valeur lue se range aussi sous les autres noms que la page lit.
const ECHOS = {
  prix_acquisition: ['sim_prix_bien_fai', 'sim_prix_bien_negocie'],
  loyer_annuel_ht: ['sim_loyer_initial_ht'],
  taxe_fonciere_an: ['sim_taxe_fonciere'],
  sim_charges_copropriete: ['charges_copropriete'],
};

/** Pure : la valeur rendue par le modèle, rangée selon son type ; null si elle ne tient pas. */
export function rangerLecture(champ, brut) {
  const def = LECTURES[champ];
  if (!def) return null;
  const t = String(brut ?? '').trim();
  if (!t || /^(null|inconnu|non (?:dit|pr[ée]cis[ée]|communiqu[ée]))$/i.test(t)) return null;
  if (def.type === 'date') return dateValide(t);
  if (def.type === 'booleen') return /^(oui|true|vrai)$/i.test(t) ? true : /^(non|false|faux)$/i.test(t) ? false : null;
  if (def.type === 'nombre' || def.type === 'montant') {
    const n = Number(t.replace(/[\s\u00a0\u202f€]/g, '').replace(',', '.'));
    if (!Number.isFinite(n) || n <= 0) return null;
    return def.type === 'nombre' ? (n < 100 ? n : null) : Math.round(n);
  }
  // Le profil se lit en pastilles, coupées aux virgules : une parenthèse ou une virgule en ferait des morceaux.
  if (champ === 'profil_locataire') return t.replace(/\s*\([^)]*\)/g, '').split(/[,;]/)[0].trim().slice(0, 60) || null;
  return t.slice(0, 200);
}

/** Pure : la case est-elle libre pour l'agent ? Vide, et jamais une case modifiée à la main. */
export function caseLibre(projet, champ) {
  if ((projet?.champs_a_la_main || []).includes(champ)) return false;
  const v = projet?.[champ];
  return LECTURES[champ]?.type === 'booleen' ? typeof v !== 'boolean' : vide(v);
}

/**
 * Pure : ce que le modèle a lu, en changements pour le projet (modifierChamps) : seulement les cases libres, avec la
 * phrase qui donne chaque valeur. Rend aussi les lignes du journal.
 */
export function changementsDeLaLecture(projet, lecture) {
  const changements = [];
  const lignes = [];
  const vus = new Set();
  for (const l of lecture?.champs || []) {
    const champ = String(l?.champ || '');
    if (vus.has(champ) || !caseLibre(projet, champ)) continue;
    const valeur = rangerLecture(champ, l.valeur);
    if (valeur == null) continue;
    vus.add(champ);
    const citation = court(l.citation, 200);
    const source = { source: 'Fiche du bien', raison: citation ? `« ${citation} »` : 'Lu dans la fiche du bien' };
    changements.push({ champ, valeur, ...source });
    for (const echo of ECHOS[champ] || []) if (caseLibre(projet, echo)) changements.push({ champ: echo, valeur, ...source });
    // Un prix trouvé : l'apport suit les 15 % du simulateur, comme à la création.
    if (champ === 'prix_acquisition' && caseLibre(projet, 'sim_apport')) changements.push({ champ: 'sim_apport', valeur: Math.round(valeur * 0.15), source: 'Calcul', raison: '15 % du prix FAI' });
    lignes.push(`${LIBELLES[champ] || champ} : ${montrer(champ, valeur)}${citation ? ` (« ${court(citation, 90)} »)` : ''}`);
  }
  return { changements, lignes };
}

const LIBELLES = {
  nom_locataire: 'Locataire', activite_locataire: 'Activité', prix_acquisition: 'Prix FAI',
  bail_date_debut: 'Début du bail', bail_date_echeance: 'Échéance du bail', bail_duree_ferme_ans: 'Années fermes', locataire_depuis: 'En place depuis',
  loyer_annuel_ht: 'Loyer annuel HT HC', bail_loyer_initial: 'Loyer de signature', bail_depot_garantie: 'Dépôt de garantie', provision_charges: 'Provision pour charges',
  taxe_fonciere_an: 'Taxe foncière', sim_charges_copropriete: 'Charges de copropriété', sim_loyer_soumis_tva: 'Loyer soumis à TVA',
  sim_taxe_refacturable: 'Taxe foncière refacturée', sim_charges_refacturable: 'Charges refacturées', surface_detail: 'Surface', profil_locataire: 'Profil du locataire',
  type_construction: 'Bâti', rendement_locatif: 'Rendement', loyer_m2_an: 'Loyer au m² par an',
};
function montrer(champ, v) {
  const t = LECTURES[champ]?.type;
  if (t === 'date') return dateLongue(v);
  if (t === 'booleen') return v ? 'oui' : 'non';
  if (t === 'montant') return `${euros(v)}${/depot|prix/.test(champ) ? '' : ' par an'}`;
  if (champ === 'bail_duree_ferme_ans') return `${v} ans`;
  return String(v);
}

/**
 * Pure : ce qui se déduit du projet sans rien lire (Jules : « on a mis une échéance, donc ça calcule en place depuis ») :
 * l'échéance en date, le début ou l'échéance d'un bail 3-6-9, le locataire en place depuis le début du bail, le
 * rendement et le loyer au m². Seulement dans les cases libres.
 */
export function deductions(projet) {
  const p = { ...projet };
  const changements = [];
  const lignes = [];
  const poser = (champ, valeur, raison, ligne) => {
    if ((p.champs_a_la_main || []).includes(champ)) return;
    changements.push({ champ, valeur, source: 'Calcul', raison });
    p[champ] = valeur;
    lignes.push(ligne);
  };
  let fin = dateValide(p.bail_date_echeance) || dateValide(p.echeance_bail);
  if (fin && (!dateValide(p.bail_date_echeance) || !dateValide(p.echeance_bail)) && !(p.champs_a_la_main || []).includes('echeance_bail')) {
    changements.push({ champ: 'bail_date_echeance', valeur: fin, source: 'Fiche du bien', raison: "L'échéance de la fiche, en date" });
    p.bail_date_echeance = fin; p.echeance_bail = fin;
  }
  let debut = dateValide(p.bail_date_debut);
  const typeBail = p.type_bail || (p.bail_admin_fields || []).find((l) => l.label === 'Type de bail')?.value;
  if (!debut && fin && est369(typeBail)) {
    debut = decaler(fin, -9, 1);
    poser('bail_date_debut', debut, `Bail ${typeBail} : neuf ans avant l'échéance du ${dateLongue(fin)}`, `Début du bail : ${dateLongue(debut)} (bail ${typeBail}, neuf ans avant l'échéance)`);
  }
  if (!fin && debut && est369(typeBail)) {
    fin = decaler(debut, 9, -1);
    poser('bail_date_echeance', fin, `Bail ${typeBail} : neuf ans après le début, le ${dateLongue(debut)}`, `Échéance du bail : ${dateLongue(fin)} (bail ${typeBail}, neuf ans après le début)`);
    p.echeance_bail = fin;
  }
  if (debut && vide(p.locataire_depuis)) poser('locataire_depuis', debut, 'Le début du bail en cours', `En place depuis : ${dateLongue(debut)} (le début du bail)`);
  const loyer = Number(p.sim_loyer_initial_ht) || Number(p.loyer_annuel_ht) || 0;
  const prix = Number(p.sim_prix_bien_fai) || Number(p.prix_acquisition) || 0;
  if (loyer > 0 && prix > 0 && vide(p.rendement_locatif)) {
    const r = Math.round((loyer / prix) * 10000) / 100;
    poser('rendement_locatif', r, `Loyer annuel ${euros(loyer)} sur le prix FAI ${euros(prix)}`, `Rendement : ${String(r).replace('.', ',')} % (loyer ${euros(loyer)} sur prix FAI ${euros(prix)})`);
  }
  // Pas de loyer au m² ici : la création le pose déjà, et l'écrire par modifierChamps referait le loyer annuel d'après la
  // surface (528 € × 180 m² = 95 040 € au lieu de 95 000 €).
  return { changements, lignes };
}

const ans = (a, b) => (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / (365.25 * 86400000);
const nb = (n) => String(Math.round(n * 10) / 10).replace('.', ',');

/**
 * Pure : ce qui ne tient pas debout dans le projet rempli (13 nov. 2026) : l'agent ne corrige rien, il le dit. Une date
 * de bail à l'envers, un 3-6-9 qui ne fait pas neuf ans, un rendement hors de 3 à 12 % (souvent un loyer mensuel pris
 * pour l'annuel), un loyer au m² à plus du double ou moins de la moitié du loyer autour (la partie Marché), un loyer
 * différent de celui des quittances.
 */
export function incoherences(projet, { loyerAutour = null, loyerQuittances = null, aujourdHui = new Date().toISOString().slice(0, 10) } = {}) {
  const sortie = [];
  const debut = dateValide(projet?.bail_date_debut);
  const fin = dateValide(projet?.bail_date_echeance) || dateValide(projet?.echeance_bail);
  const typeBail = projet?.type_bail || '';
  if (debut && fin && debut >= fin) sortie.push(`Le début du bail (${dateLongue(debut)}) est après son échéance (${dateLongue(fin)}) : laquelle des deux est fausse ?`);
  else if (debut && fin && est369(typeBail) && Math.abs(ans(debut, fin) - 9) > 0.15) sortie.push(`Bail ${typeBail}, mais ${nb(ans(debut, fin))} ans entre son début (${dateLongue(debut)}) et son échéance (${dateLongue(fin)}) : renouvellement, avenant, ou une date fausse ?`);
  if (fin && fin < aujourdHui && projet?.statut_bail !== 'vacant') sortie.push(`L'échéance du bail (${dateLongue(fin)}) est passée : bail en tacite prolongation, ou renouvelé ?`);
  const loyer = Number(projet?.sim_loyer_initial_ht) || Number(projet?.loyer_annuel_ht) || 0;
  const prix = Number(projet?.sim_prix_bien_fai) || Number(projet?.prix_acquisition) || 0;
  if (loyer > 0 && prix > 0) {
    const r = (loyer / prix) * 100;
    if (r < 3 || r > 12) sortie.push(`Rendement de ${nb(r)} % (loyer ${euros(loyer)} sur prix ${euros(prix)}) : ${r > 12 ? 'loyer trop haut ou prix trop bas' : 'loyer mensuel pris pour annuel, ou prix trop haut'} ?`);
  }
  const surface = Number(projet?.sim_surface) || Number(projet?.surface_m2) || 0;
  if (loyer > 0 && surface > 0 && Number(loyerAutour) > 0) {
    const m2 = loyer / surface;
    const ratio = m2 / Number(loyerAutour);
    if (ratio > 2 || ratio < 0.5) sortie.push(`Loyer de ${euros(m2)}/m²/an, contre ${euros(loyerAutour)} autour (partie Marché) : ${ratio > 2 ? `${nb(ratio)} fois plus` : `${nb(1 / ratio)} fois moins`}. Surface ou loyer à vérifier.`);
  }
  if (loyer > 0 && Number(loyerQuittances) > 0 && Math.abs(loyer - loyerQuittances) / loyerQuittances > 0.05) sortie.push(`Loyer du projet ${euros(loyer)}, quittances ${euros(loyerQuittances)} par an : lequel retenir ?`);
  return sortie;
}

/** Pure : l'adresse donne-t-elle un numéro dans la rue ? */
export const adressePrecise = (adresse) => /^\s*\d+\s*(?:bis|ter|[a-d])?\b/i.test(String(adresse || ''));

/**
 * Pure : ce qu'il faut à l'agent pour finir le projet, en questions courtes, les plus utiles d'abord (Jules : « il va
 * nous dire ce qu'il a besoin pour terminer : l'adresse précise ou d'autres trucs »).
 */
export function questionsPourFinir(projet, { points = [] } = {}) {
  const q = [];
  const adresse = String(projet?.adresse_complete || '');
  if (!adresse.trim()) q.push("L'adresse du local");
  else if (!adressePrecise(adresse)) q.push(`L'adresse précise : le numéro dans la rue (la fiche dit « ${court(adresse.split(',')[0], 60)} »)`);
  if (vide(projet?.prix_acquisition) && vide(projet?.sim_prix_bien_fai)) q.push('Le prix de vente FAI');
  if (projet?.statut_bail !== 'vacant') {
    if (vide(projet?.loyer_annuel_ht) && vide(projet?.sim_loyer_initial_ht)) q.push('Le loyer annuel HT HC');
    if (vide(projet?.nom_locataire)) q.push("Le nom du locataire (l'enseigne ou la société)");
    if (!dateValide(projet?.bail_date_echeance) && !dateValide(projet?.echeance_bail)) q.push("L'échéance du bail");
    if (!dateValide(projet?.bail_date_debut) && !dateValide(projet?.locataire_depuis)) q.push('La date de début du bail, ou depuis quand le locataire est en place');
  }
  if (vide(projet?.surface_m2) && vide(projet?.sim_surface)) q.push('La surface du local');
  if (vide(projet?.taxe_fonciere_an) && vide(projet?.sim_taxe_fonciere)) {
    // « La fiche dit qu'elle est refacturée » seulement si c'est la fiche qui le dit : sinon c'est le réglage par défaut du
    // simulateur, et la phrase était fausse (banc du 13 nov.).
    q.push(typeof projet?.sim_taxe_refacturable === 'boolean' && projet?.sources_champs?.sim_taxe_refacturable
      ? `Le montant de la taxe foncière (la fiche dit seulement qu'elle ${projet.sim_taxe_refacturable ? 'est' : "n'est pas"} refacturée)`
      : 'Le montant de la taxe foncière, et si elle est refacturée au locataire');
  }
  for (const p of points) if (p && q.length < 8) q.push(court(p, 200));
  return q.slice(0, 8);
}

// ---------------------------------------------------------------------------
// La lecture de la fiche par le modèle
// ---------------------------------------------------------------------------

const SCHEMA = {
  type: 'object',
  properties: {
    champs: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          champ: { type: 'string', enum: Object.keys(LECTURES) },
          valeur: { type: 'string', description: 'dates en AAAA-MM-JJ ; montants en euros, en chiffres seuls ; oui ou non' },
          citation: { type: 'string', description: 'la phrase exacte du texte qui donne la valeur' },
        },
        required: ['champ', 'valeur', 'citation'],
      },
    },
    points_a_eclaircir: { type: 'array', items: { type: 'string' }, description: "au plus deux vraies contradictions entre deux parties du dossier (deux chiffres ou deux faits qui ne peuvent pas être vrais ensemble), une phrase chacune, sous forme de question ; vide le plus souvent" },
  },
  required: ['champs', 'points_a_eclaircir'],
};

/** Pure : les points à éclaircir qui en sont vraiment (le modèle glissait « … ce qui est cohérent, mais … »). */
export function pointsUtiles(points) {
  return (points || []).map((x) => String(x || '').trim())
    .filter((x) => x && !/\bcoh[ée]rent|\bcorrespond (bien|à)|\bne pr[ée]cise pas\b|\bsans pr[ée]cision\b/i.test(x))
    .slice(0, 2);
}

/** Pure : la consigne donnée au modèle. */
export function consigneLecture(texte, projet, aujourdHui) {
  const libres = Object.keys(LECTURES).filter((c) => caseLibre(projet, c));
  return [
    "Tu remplis la fiche d'un projet d'investissement (murs de commerce) à partir de ce que le dossier dit du bien.",
    `Aujourd'hui : ${aujourdHui}.`,
    '',
    'Les cases encore vides, à remplir seulement si le texte les donne :',
    ...libres.map((c) => `- ${c} : ${LECTURES[c].dit}`),
    '',
    "N'invente rien et ne devine rien : une case que le texte ne donne pas n'apparaît pas dans ta réponse. Chaque valeur porte la phrase exacte du texte qui la donne.",
    "Un montant mensuel ou trimestriel se ramène à l'année (1 500 € par mois : 18000). Un loyer « HT HC » ou « hors taxes hors charges » est le loyer actuel.",
    "Une date du bail que le texte ne donne pas reste absente : ne la calcule pas.",
    "Ce qui est saisi à la main par l'équipe ou vérifié par elle passe devant la fiche commerciale quand les deux diffèrent.",
    "Les points à éclaircir : seulement une vraie contradiction entre deux parties du dossier (la fiche dit primeur, l'équipe a saisi traiteur ; deux rendements différents). Jamais une remarque sur ce qui est cohérent, jamais un calcul de vérification, jamais une pièce à réclamer, jamais une précision générale. Le plus souvent, la liste est vide.",
    '',
    'Le dossier :',
    '"""',
    String(texte || '').slice(0, 16000),
    '"""',
    'Réponds en JSON.',
  ].join('\n');
}

const lireParDefaut = async ({ prompt }) => {
  const [{ invokeLLM }, { mesurer }] = await Promise.all([import('../llm.js'), import('../llm-couts.js')]);
  const { resultat } = await mesurer({ operation: 'rentrer le projet' }, () => invokeLLM({ prompt, response_json_schema: SCHEMA, effort: 'low' }));
  return resultat;
};

// Les lignes de la Pré-analyse, sous leur nom à l'écran.
const LIGNES_PREANALYSE = {
  adresse: 'Adresse', prix_fai: 'Prix FAI', honoraires_inclus: 'Honoraires inclus', montant_honoraires: 'Honoraires',
  loyer_annuel_ht_hc: 'Loyer annuel HT HC', surface_m2: 'Surface (m²)', locataire_nom: 'Locataire', locataire_activite: 'Activité',
  bail_echeance: 'Échéance du bail', bail_type: 'Type de bail', bail_texte: 'Bail', occupe: 'Occupé', rendement_annonce: 'Rendement annoncé',
  type_actif: "Type d'actif", intitule_lot: 'Lot',
};
const lisible = (v) => (v && typeof v === 'object' ? [v.rue, [v.code_postal, v.ville].filter(Boolean).join(' ')].filter(Boolean).join(', ') : v === true ? 'oui' : v === false ? 'non' : String(v ?? ''));

/**
 * Tout ce que le dossier sait du bien, en texte (13 nov. 2026, Jules : « tu prends toutes les infos qu'on a mises dans
 * les parties ») : la fiche, chaque ligne de la Pré-analyse (celles saisies à la main d'abord : elles font foi), le bail
 * écrit par l'analyste, les grilles de l'Analyse, ce que les outils du Marché ont trouvé.
 */
export function texteDuDossier(deal, lot, analyse, { marche = [] } = {}) {
  const parties = [];
  const fiche = String(deal?.source?.texte || '').trim();
  if (fiche) parties.push(`FICHE COMMERCIALE\n${fiche}`);
  const champs = Object.entries(lot?.lot || {}).filter(([, c]) => c && typeof c === 'object' && c.absent === false && c.valeur != null && c.valeur !== '');
  const ligne = ([k, c]) => `- ${LIGNES_PREANALYSE[k] || k} : ${court(lisible(c.valeur), 600)}${c.saisi_a_la_main ? ' (saisi à la main par l’équipe : fait foi)' : c.citation ? ` (« ${court(c.citation, 160)} »)` : ''}`;
  const aLaMain = champs.filter(([, c]) => c.saisi_a_la_main);
  const lus = champs.filter(([, c]) => !c.saisi_a_la_main);
  if (champs.length) parties.push(`LA PRÉ-ANALYSE DU DOSSIER\n${[...aLaMain, ...lus].map(ligne).join('\n')}`);
  const lignes = (analyse?.grilles || []).flatMap((g) => (g.lignes || []).filter((l) => l.valeur && l.statut !== 'introuvable').map((l) => `- ${g.titre || g.id} · ${l.libelle} : ${court(l.valeur, 300)}${['verifie', 'corrige'].includes(l.statut) ? ' (vérifié par l’équipe)' : ''}`));
  if (lignes.length) parties.push(`L'ANALYSE DES PIÈCES DU DOSSIER\n${lignes.slice(0, 100).join('\n')}`);
  const outils = marche.map((l) => {
    const pts = (l.resultat?.points || []).filter((x) => x.resultat).map((x) => `  - ${x.libelle} : ${court(x.resultat, 300)}`);
    return pts.length || l.resultat?.conclusion ? `- ${l.outil}${l.resultat?.conclusion ? ` : ${court(l.resultat.conclusion, 300)}` : ''}${pts.length ? `\n${pts.join('\n')}` : ''}` : null;
  }).filter(Boolean);
  if (outils.length) parties.push(`LA PARTIE MARCHÉ DU DOSSIER\n${outils.join('\n')}`);
  return parties.join('\n\n');
}

/** Les dernières lectures finies des outils du Marché d'un lot, une par outil. */
export function lecturesDuMarche(dealId, index = 0) {
  const par = new Map();
  for (const l of Records.filter('LancementOutil', { deal_id: dealId })) {
    if (l.statut !== 'fini' || (l.index ?? 0) !== index || !l.resultat) continue;
    const d = par.get(l.outil);
    if (!d || String(l.lance_le) > String(d.lance_le)) par.set(l.outil, l);
  }
  return [...par.values()];
}

// ---------------------------------------------------------------------------
// Le travail
// ---------------------------------------------------------------------------

const enCours = new Map();

function journal(id) {
  const lire = () => Records.get(ENTITE, id);
  return {
    etape(texte) {
      const a = lire();
      const etapes = [...(a.etapes || []), { texte, etat: 'en_cours', lignes: [], debut: new Date().toISOString() }];
      Records.update(ENTITE, id, { etapes });
      const i = etapes.length - 1;
      return {
        finir(etat = 'fait', lignes = []) {
          const b = lire();
          const tout = [...(b.etapes || [])];
          tout[i] = { ...tout[i], etat, lignes: lignes.filter(Boolean).slice(0, 20), fin: new Date().toISOString() };
          Records.update(ENTITE, id, { etapes: tout });
        },
      };
    },
    poser(patch) { Records.update(ENTITE, id, patch); },
  };
}

/** Le travail d'un agent, étape par étape. `outils` remplace ce qui sort de la machine (tests). */
export async function travailler(agentId, { user = null, uploadDir = null, outils = {} } = {}) {
  const a = Records.get(ENTITE, agentId);
  const j = journal(agentId);
  const dealId = a.deal_id;
  const lotIndex = Number(a.lot_index) || 0;
  const P = await import('./projet.js');
  const { lotOuVide } = await import('./index.js');
  const { lireAnalyse } = await import('./analyse-pieces.js');
  const { modifierChamps } = await import('../projet-edition.js');
  const o = {
    extraire: outils.extraire || (async () => {
      const { extraireDocuments } = await import('./espace.js');
      const deal = Records.findBy('Deal', 'deal_id', dealId);
      return extraireDocuments(dealId, { documents: (deal.documents_espace || []).map((d) => d.id), uploadDir, user });
    }),
    completer: outils.completer || (() => P.completerAvantProjet(dealId, lotIndex)),
    ville: outils.ville || ((lot) => P.villeDuLot(lot)),
    vente: outils.vente || ((lot) => P.derniereVenteDesMurs(P.adresseDuLot(lot))),
    imageVille: outils.imageVille || (async (lot) => {
      const { imageDeLaVille } = await import('./photos-auto.js');
      const commune = lot?.enrichissement?.commune || {};
      return imageDeLaVille(commune.nom || lot?.lot?.adresse?.valeur?.ville || '', uploadDir, { departement: commune.departement || null });
    }),
    lire: outils.lire || lireParDefaut,
    // Les photos de la ville sur Google seulement (13 nov. 2026, Jules : « ça a pris trop de photos ; il faut juste que ça
    // cherche la ville sur Google et prenne les photos ») : ni Street View, ni les photos de Wikipédia.
    photosVille: outils.photosVille || (async (ville) => { const { photosGoogleDeLaVille } = await import('../photo-commerce.js'); return (await photosGoogleDeLaVille(ville, PHOTOS_VILLE)).map((x) => x.url).filter(Boolean); }),
    // Le prix du résidentiel (Figaro) et le loyer autour (la partie Marché du dossier), calculés avant que le projet
    // s'ouvre : la page les montrait seulement une fois arrivés, pendant qu'on lisait (13 nov. 2026, Jules).
    // Le prix du résidentiel seul, chez Le Figaro (quelques secondes) : quand Equimmox fait attendre la fiche du secteur,
    // l'agent le pose dans les cases du projet, que la page lit d'abord. Le même choix que la page : celui du dossier
    // s'il l'a, sinon Le Figaro à l'adresse ; le quartier d'abord, la commune à défaut.
    residentiel: outils.residentiel || (async (projet) => {
      const { residentielDe, lotDuProjet } = await import('../projet-secteur.js');
      const deal = Records.findBy('Deal', 'deal_id', projet.deal_id);
      const duLot = lotDuProjet(projet, deal)?.prix_residentiel;
      if (duLot) return residentielDe(duLot);
      const { adresseAChercher } = await import('../../src/lib/adresse-projet.js');
      const { prixResidentiel } = await import('../figaro.js');
      const texte = adresseAChercher(projet);
      const r = texte ? await Promise.race([prixResidentiel(texte), new Promise((ok) => { setTimeout(() => ok(null), 20000).unref?.(); })]) : null;
      return r?.ok ? residentielDe(r.resultat) : null;
    }),
    // Sans loyer dans la partie Marché, la page relit Equimmox : deux à cinq minutes au banc du 13 nov. L'agent attend
    // ATTENTE_SECTEUR_MS au plus ; la lecture continue en fond et la page la montre en arrivant.
    secteur: outils.secteur || (async (projet) => {
      const { lireSecteur, attendreSecteur, secteurGarde } = await import('../projet-secteur.js');
      lireSecteur(projet, { forcer: true });
      const fini = await Promise.race([attendreSecteur(projet.id).then(() => true), new Promise((ok) => { setTimeout(() => ok(false), ATTENTE_SECTEUR_MS).unref?.(); })]);
      return { ...(secteurGarde(projet.id) || {}), en_cours: !fini };
    }),
  };

  // 1. Les pièces, la commune, le marché.
  let deal = Records.findBy('Deal', 'deal_id', dealId);
  if ((deal.documents_espace || []).length && !(deal.extractions || []).length) {
    const e = j.etape('Je lis les pièces du dossier');
    try {
      const r = await o.extraire();
      e.finir(r?.ok === false ? 'echec' : 'fait', [r?.ok === false ? r.error : `${(r?.extractions || []).length} pièce(s) lue(s)`]);
    } catch (err) { e.finir('echec', [err?.message || String(err)]); }
  }
  {
    const e = j.etape('Je complète la commune et le marché du dossier');
    try { await o.completer(); e.finir('fait'); } catch (err) { e.finir('echec', [err?.message || String(err)]); }
  }

  // 2. La ville, la dernière vente, l'image de la ville.
  deal = Records.findBy('Deal', 'deal_id', dealId);
  const lot = lotOuVide(deal, lotIndex);
  let ville = null; let vente = null; let imageVille = null;
  {
    const e = j.etape('Je cherche les chiffres de la ville et la dernière vente des murs');
    const [rv, rd, ri] = await Promise.allSettled([o.ville(lot), o.vente(lot), o.imageVille(lot)]);
    ville = rv.status === 'fulfilled' ? rv.value : null;
    vente = rd.status === 'fulfilled' ? rd.value : null;
    imageVille = ri.status === 'fulfilled' ? ri.value : null;
    const nomVille = lot?.enrichissement?.commune?.nom || lot?.lot?.adresse?.valeur?.ville || 'la ville';
    e.finir('fait', [
      ville?.ville_habitants_agglo ? `${nomVille} : ${Number(ville.ville_habitants_agglo).toLocaleString('fr-FR').replace(/[\u202f\u00a0]/g, ' ')} habitants dans l'agglomération (INSEE)` : null,
      vente?.annee ? `Dernière vente des murs : ${vente.annee}${vente.prix ? `, ${euros(vente.prix)}` : ''} (DVF)` : 'Aucune vente des murs trouvée dans les ventes publiques (DVF)',
      imageVille ? 'Une image de la ville pour la couverture' : null,
    ]);
  }

  // 3. Le projet naît.
  const analyse = (() => { try { return lireAnalyse(dealId); } catch { return null; } })();
  let projetId;
  {
    const e = j.etape('Je crée le projet avec la fiche, la Pré-analyse et l’Analyse');
    const r = P.creerProjetDepuisDeal(dealId, lotIndex, user, { analyse, ville, vente, imageVille });
    if (!r.ok) { e.finir('echec', [r.error]); throw Object.assign(new Error(r.error), { project_id: r.project_id || null }); }
    projetId = r.project.id;
    j.poser({ project_id: projetId, titre: r.project.titre });
    const p = r.project;
    e.finir('fait', [
      p.nom_locataire ? `Locataire : ${p.nom_locataire}${p.activite_locataire ? `, ${p.activite_locataire}` : ''}` : null,
      p.adresse_complete ? `Adresse : ${p.adresse_complete}` : null,
      Number(p.ville_habitants_agglo || p.ville_habitants) > 0 ? `Ville : ${Number(p.ville_habitants_agglo || p.ville_habitants).toLocaleString('fr-FR').replace(/[\u202f\u00a0]/g, ' ')} habitants${Number(p.ville_revenu_median) > 0 ? `, revenu médian ${euros(p.ville_revenu_median)}` : ''}` : 'Pas de chiffres de population pour la ville',
      Number(p.sim_prix_bien_fai) > 0 ? `Prix FAI : ${euros(p.sim_prix_bien_fai)}` : null,
      Number(p.sim_loyer_initial_ht) > 0 ? `Loyer : ${euros(p.sim_loyer_initial_ht)} HT HC par an, ${euros(p.sim_loyer_initial_ht / 12)} par mois` : null,
      Number(p.sim_surface) > 0 ? `Surface : ${p.sim_surface} m²` : null,
      p.type_bail ? `Bail : ${p.type_bail}` : null,
      (p.bail_admin_fields || []).length > 1 ? `${p.bail_admin_fields.length} points du bail repris de l'Analyse` : null,
    ]);
  }

  // 4. La fiche relue par le modèle.
  let points = [];
  {
    const e = j.etape('Je relis la fiche du bien pour remplir ce qui reste vide');
    const texte = texteDuDossier(deal, lot, analyse, { marche: lecturesDuMarche(dealId, lotIndex) });
    if (!texte) e.finir('rien', ['Le dossier n’a pas de fiche à relire']);
    else {
      try {
        const projet = Records.get('Project', projetId);
        const lecture = await o.lire({ prompt: consigneLecture(texte, projet, new Date().toISOString().slice(0, 10)) });
        points = pointsUtiles(lecture?.points_a_eclaircir);
        const { changements, lignes } = changementsDeLaLecture(projet, lecture);
        const r = changements.length ? modifierChamps(projetId, changements, { par: 'Agent du projet' }) : { ok: true };
        // Un locataire trouvé dans la fiche nomme le projet, comme à la création (sauf un titre écrit à la main).
        const apres = Records.get('Project', projetId);
        if (r.ok && changements.some((c) => c.champ === 'nom_locataire') && !(apres.champs_a_la_main || []).includes('titre')) {
          const t = P.titreProjet(apres.nom_locataire, apres.adresse_complete, apres.activite_locataire || null);
          if (P.titrePropre(t)) { Records.update('Project', projetId, { titre: `${deal.test ? '[TEST] ' : ''}${t}` }); j.poser({ titre: t }); }
        }
        if (!r.ok) e.finir('echec', [r.error]);
        else e.finir(lignes.length ? 'fait' : 'rien', lignes.length ? lignes : ['Rien de plus dans la fiche que ce qui est déjà dans le projet']);
      } catch (err) { e.finir('echec', [`Lecture impossible : ${err?.message || err}`]); }
    }
  }

  // 5. Ce qui se déduit.
  {
    const e = j.etape('Je calcule ce qui se déduit');
    const { changements, lignes } = deductions(Records.get('Project', projetId));
    const r = changements.length ? modifierChamps(projetId, changements, { par: 'Agent du projet' }) : { ok: true };
    if (!r.ok) e.finir('echec', [r.error]);
    else e.finir(lignes.length ? 'fait' : 'rien', lignes.length ? lignes : ['Rien à déduire']);
  }

  // 6. Le marché de la page : prix du résidentiel, loyer autour.
  let secteurLu = null;
  {
    const e = j.etape('Je cherche le prix du résidentiel et le loyer autour');
    try {
      const d = await o.secteur(Records.get('Project', projetId));
      secteurLu = d;
      let r = d?.residentiel;
      if (!r?.prix_m2) {
        const projet = Records.get('Project', projetId);
        r = await o.residentiel(projet).catch(() => null);
        if (r?.prix_m2) {
          const source = { source: 'Le Figaro Immobilier', lien: r.lien || null, raison: `Prix médian du résidentiel, ${r.echelle === 'quartier' ? 'quartier' : 'commune'} ${r.nom || ''}`.trim() };
          const changements = [
            vide(projet.marche_rue_prix_m2) && { champ: 'marche_rue_prix_m2', valeur: r.prix_m2, ...source },
            vide(projet.marche_evolution_1an) && Number(r.evolution_1_an?.valeur) && { champ: 'marche_evolution_1an', valeur: Number(r.evolution_1_an.valeur), ...source },
            vide(projet.marche_evolution_5ans) && Number(r.evolution_5_ans?.valeur) && { champ: 'marche_evolution_5ans', valeur: Number(r.evolution_5_ans.valeur), ...source },
          ].filter(Boolean);
          if (changements.length) modifierChamps(projetId, changements, { par: 'Agent du projet' });
        }
      }
      const rue = d?.rue;
      const pct = (v) => (Number.isFinite(Number(v)) ? `${Number(v) > 0 ? '+' : ''}${String(v).replace('.', ',')} %` : null);
      e.finir(r?.prix_m2 || rue?.loyer_m2_an ? 'fait' : 'rien', [
        r?.prix_m2 ? `Prix du résidentiel à ${r.nom || 'la commune'} : ${euros(r.prix_m2)}/m²${[pct(r.evolution_1_an?.valeur) && `${pct(r.evolution_1_an.valeur)} sur un an`, pct(r.evolution_5_ans?.valeur) && `${pct(r.evolution_5_ans.valeur)} sur cinq ans`].filter(Boolean).map((x) => `, ${x}`).join('')} (Le Figaro Immobilier)` : 'Pas de prix du résidentiel (Le Figaro ne répond pas pour cette adresse)',
        rue?.loyer_m2_an ? `Loyer autour : ${euros(rue.loyer_m2_an)}/m²/an, ${rue.du_marche ? `celui de la partie Marché du dossier (${[rue.nom, rue.rayon].filter(Boolean).join(', ')})` : `${rue.loyer_source || 'Equimmox'}${rue.rayon ? ` à ${rue.rayon}` : ''}`}`
          : d?.en_cours ? "Le loyer autour arrive encore : Equimmox lit les baux autour (la partie Marché du dossier n'en a pas). Il sera sur la page du projet dans quelques minutes"
            : 'Pas de loyer autour : ni la partie Marché du dossier, ni Equimmox, ni Data-B',
      ]);
    } catch (err) { e.finir('echec', [err?.message || String(err)]); }
  }

  // 6 bis. Ce qui ne tient pas debout : dit, jamais corrigé.
  let incoherentes = [];
  {
    const e = j.etape('Je vérifie que les chiffres tiennent debout');
    const projet = Records.get('Project', projetId);
    const quittances = (analyse?.grilles || []).find((g) => g.id === 'quittances')?.lignes?.find((l) => l.id === 'loyer_hc_ht');
    const loyerQuittances = quittances?.valeur && quittances.statut !== 'introuvable' ? P.loyerAnnuel(quittances.valeur) : null;
    incoherentes = incoherences(projet, { loyerAutour: secteurLu?.rue?.loyer_m2_an || null, loyerQuittances });
    e.finir(incoherentes.length ? 'fait' : 'rien', incoherentes.length ? incoherentes : ['Dates du bail, rendement et loyer au m² cohérents']);
  }

  // 7. Les photos de la ville, sur Google ; elles remplacent l'image de couverture prise sur Wikipédia.
  {
    const e = j.etape('Je cherche des photos de la ville sur Google');
    const projet = Records.get('Project', projetId);
    const nomVille = String(projet.ville_secteur_champ1 || lot?.lot?.adresse?.valeur?.ville || '').trim();
    let photos = [];
    let raison = null;
    try { photos = nomVille ? (await o.photosVille(nomVille)).slice(0, PHOTOS_VILLE) : []; } catch (err) { raison = err?.message || String(err); }
    if (photos.length) {
      const autres = (projet.photos || []).filter((u) => typeof u === 'string' && u !== imageVille && !photos.includes(u));
      Records.update('Project', projetId, { photos: [...photos, ...autres] });
      e.finir('fait', [`${photos.length} photo(s) de ${nomVille} (Google)`, "À trier dans l'onglet Images du projet"]);
    } else {
      const suspendu = /403/.test(String(raison || ''));
      e.finir(raison ? 'echec' : 'rien', [
        suspendu ? 'Google refuse : le projet Google Cloud de Klocka est suspendu' : raison ? `Google ne répond pas : ${raison}` : `Google n'a pas de photo de ${nomVille || 'la ville'}`,
        imageVille ? "Le projet garde l'image de la ville en couverture (Wikipédia)" : null,
      ]);
    }
  }

  // 7 bis. Ce que l'équipe corrige d'habitude (13 nov. 2026, Jules : « si tous les projets remettent une majuscule, tu la
  // mettras dès le départ, sans demander ») : les règles de Suivi > Corrections, appliquées d'office.
  try {
    const { reglesDuMoment, appliquerAuProjet } = await import('../corrections-projet.js');
    if (reglesDuMoment().regles.some((r) => r.active)) {
      const e = j.etape("J'applique ce que l'équipe corrige d'habitude");
      const lignes = await appliquerAuProjet(projetId);
      e.finir(lignes.length ? 'fait' : 'rien', lignes.length ? lignes : ['Rien à reprendre sur ce projet']);
    }
  } catch (err) { console.warn(`[agent-projet] règles de correction : ${err?.message || err}`); }

  // 8. Ce qu'il faut pour finir.
  const projet = Records.get('Project', projetId);
  // Pas de pièce à réclamer (13 nov. 2026, Jules : « tu ne dois pas demander le bail signé ») : seulement les
  // informations que ni la fiche, ni la Pré-analyse, ni l'Analyse, ni le Marché ne donnent.
  const questions = questionsPourFinir(projet, { points: [...incoherentes, ...points] });
  const ouverture = P.questionsDuProjet(projet, { aVerifier: P.aVerifierDansLAnalyse(analyse), manques: questions });
  Records.update('Project', projetId, { questions_ouverture: ouverture, rentre_par_agent_le: new Date().toISOString() });
  j.poser({ questions });
  return { project_id: projetId, questions };
}

/** Lance l'agent sur le lot d'un dossier ; rend l'agent tel qu'il est enregistré. */
export function lancerAgentProjet(dealId, lotIndex = 0, { user = null, uploadDir = null, outils = {} } = {}) {
  const deal = Records.findBy('Deal', 'deal_id', dealId);
  if (!deal) return { ok: false, error: 'Dossier introuvable' };
  if (deal.projet_id && Records.get('Project', deal.projet_id)) return { ok: false, error: 'Un projet existe déjà pour ce dossier.', project_id: deal.projet_id };
  const deja = Records.filter(ENTITE, { deal_id: dealId }).find((x) => x.etat === 'en_cours' && enCours.has(x.id));
  if (deja) return { ok: true, agent: deja };
  const lot = deal.lots?.[lotIndex]?.lot || {};
  const nom = [lot.locataire_nom?.valeur, lot.adresse?.valeur?.ville].filter(Boolean).join(' · ') || deal.nom || 'Le projet';
  const agent = Records.create(ENTITE, { deal_id: dealId, lot_index: lotIndex, nom, etat: 'en_cours', etapes: [], questions: [], project_id: null, titre: null, erreur: null, lance_par: user?.email || null, ferme: false }, user?.email);
  const travail = travailler(agent.id, { user, uploadDir, outils })
    .then(() => Records.update(ENTITE, agent.id, { etat: 'fini', fini_le: new Date().toISOString() }))
    .catch((err) => {
      console.warn(`[agent-projet] ${dealId} : ${err?.message || err}`);
      Records.update(ENTITE, agent.id, { etat: 'erreur', erreur: err?.message || String(err), ...(err?.project_id ? { project_id: err.project_id } : {}), fini_le: new Date().toISOString() });
    })
    .finally(() => enCours.delete(agent.id));
  enCours.set(agent.id, travail);
  return { ok: true, agent: Records.get(ENTITE, agent.id), travail };
}

/** Pure : un agent tel que la carte le montre ; un travail resté « en cours » sans nouvelles est dit interrompu. */
export function agentAffiche(a, { vivant = false, maintenant = Date.now() } = {}) {
  const muet = a.etat === 'en_cours' && !vivant && maintenant - new Date(a.updated_date || a.created_date).getTime() > SANS_NOUVELLES_MS;
  return {
    id: a.id, deal_id: a.deal_id, nom: a.nom, titre: a.titre, project_id: a.project_id,
    etat: muet ? 'erreur' : a.etat, erreur: muet ? 'Interrompu (le serveur a redémarré) : relancez « Créer le projet » si le projet manque.' : a.erreur,
    etapes: a.etapes || [], questions: a.questions || [], cree_le: a.created_date, fini_le: a.fini_le || null,
  };
}

/** Les agents de la journée lancés par cette personne, le plus récent d'abord, sans ceux qu'elle a fermés. */
export function agentsDe(email, { maintenant = Date.now() } = {}) {
  if (!email) return [];
  return Records.filter(ENTITE, { lance_par: email })
    .filter((a) => !a.ferme && maintenant - new Date(a.created_date).getTime() < FENETRE_MS)
    .sort((x, y) => String(y.created_date).localeCompare(String(x.created_date)))
    .slice(0, 5)
    .map((a) => agentAffiche(a, { vivant: enCours.has(a.id), maintenant }));
}

/** Les agents d'un dossier encore en cours (le bouton du dossier attend). */
export function agentEnCoursDu(dealId) {
  const a = Records.filter(ENTITE, { deal_id: dealId }).find((x) => x.etat === 'en_cours' && enCours.has(x.id));
  return a ? agentAffiche(a, { vivant: true }) : null;
}

export function fermerAgent(id, email) {
  const a = Records.get(ENTITE, id);
  if (!a || (a.lance_par && email && a.lance_par !== email)) return { ok: false, error: 'Agent introuvable' };
  Records.update(ENTITE, id, { ferme: true });
  return { ok: true };
}
