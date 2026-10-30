// L'analyse pièce par pièce (29 oct. 2026, Jules).
//
// Ce qui ne marchait pas : la machine décidait seule (quelle pièce est un
// bail, quelle fiche utiliser), une pièce ajoutée relançait toute la lecture,
// une valeur ne se corrigeait pas toujours et la source ne s'ouvrait pas.
// Les analystes repassaient par Gemini, où ils voient la pièce et vérifient
// d'un coup d'oeil.
//
// Ici :
//   - l'humain classe, l'IA extrait : une pièce n'est lue que rangée par
//     quelqu'un dans un emplacement (Bail, Quittances, PV d'AG…). Le nom du
//     fichier propose un emplacement, il ne range jamais ;
//   - une pièce = une lecture : ranger un PV d'AG lit ce PV, rien d'autre. Les
//     critères demandés sont ceux de la grille de son emplacement ;
//   - chaque valeur a sa preuve : page et citation, la citation retrouvée dans
//     le texte du PDF quand il en a un (« vérifiée »), sinon dite non retrouvée ;
//   - chaque case a un état posé par l'analyste (vérifiée, corrigée,
//     introuvable) qu'aucune relecture n'écrase ;
//   - les croisements signalent l'écart, l'analyste choisit la valeur retenue.
//
// Tout vit sur le dossier, dans `Deal.analyse_pieces` :
//   docs[docId]  = { type, par, le, extraction: { statut, le, erreur }, valeurs: { critere: { valeur, page, citation, verifiee, donnees } }, questions: [...] }
//   cases[g.c]   = { statut: 'verifie'|'corrige'|'introuvable'|null, valeur, source, note, par, le }
//   ecarts[cle]  = { retenu, par, le }

import { Records } from '../db.js';
import { GRILLES, warnings } from './grilles.js';
import { CATEGORIE_PAR_TYPE, typeDepuisCategorie } from './grille.js';

// --- Deux grilles de plus, pour les pièces que l'ancienne lecture ignorait --------------------
export const GRILLES_EN_PLUS = {
  taxe_fonciere: {
    titre: 'Taxe foncière',
    criteres: [
      { id: 'annee', libelle: "Année de l'avis", format: '« 2025 »', regle: 'Information.' },
      { id: 'montant', libelle: 'Montant de la taxe foncière', format: '« X XXX € »', regle: 'Information.' },
      { id: 'teom', libelle: "Taxe d'enlèvement des ordures ménagères", format: '« XXX € », ou « Aucune ».', regle: 'Information.' },
      { id: 'local', libelle: 'Adresse et local imposés', format: 'Court, tel que l\'avis l\'écrit.', regle: 'Information.' },
    ],
    schema: {
      annee: { type: 'object', properties: { texte: { type: 'string' } } },
      montant: { type: 'object', properties: { texte: { type: 'string' }, montant: { type: 'number' } } },
      teom: { type: 'object', properties: { texte: { type: 'string' }, montant: { type: 'number' } } },
      local: { type: 'object', properties: { texte: { type: 'string' } } },
    },
  },
  kbis: {
    titre: 'Kbis du locataire',
    criteres: [
      { id: 'denomination', libelle: 'Dénomination', format: '« SARL TARTANPION »', regle: 'Information.' },
      { id: 'immatriculation', libelle: 'Immatriculation', format: '« RCS Paris 123 456 789, immatriculée le JJ/MM/AAAA »', regle: 'Information.' },
      { id: 'capital', libelle: 'Capital social', format: '« X XXX € »', regle: 'Information.' },
      { id: 'dirigeant', libelle: 'Dirigeant', format: 'Nom et fonction.', regle: 'Information.' },
      { id: 'activite', libelle: 'Activité déclarée', format: 'Telle que l\'extrait l\'écrit.', regle: 'Information.' },
      { id: 'procedure', libelle: 'Procédure collective', format: '« Aucune », ou la procédure et sa date.', regle: 'Warning si une procédure collective est en cours.' },
      { id: 'date_extrait', libelle: "Date de l'extrait", format: 'JJ/MM/AAAA', regle: "À vérifier si l'extrait a plus de trois mois." },
    ],
    schema: {
      denomination: { type: 'object', properties: { texte: { type: 'string' } } },
      immatriculation: { type: 'object', properties: { texte: { type: 'string' } } },
      capital: { type: 'object', properties: { texte: { type: 'string' } } },
      dirigeant: { type: 'object', properties: { texte: { type: 'string' } } },
      activite: { type: 'object', properties: { texte: { type: 'string' } } },
      procedure: { type: 'object', properties: { texte: { type: 'string' }, en_cours: { type: 'boolean', description: 'true si une sauvegarde, un redressement ou une liquidation est en cours' } } },
      date_extrait: { type: 'object', properties: { texte: { type: 'string' }, date: { type: 'string', description: 'JJ/MM/AAAA' } } },
    },
  },
};

export const grilleDe = (id) => GRILLES[id] || GRILLES_EN_PLUS[id] || null;

// Ce que l'onglet Bien attend des pièces (29 oct. 2026, Jules : « il doit se servir des pièces qu'on a importées pour
// remplir le plus d'infos possibles »). Lu en même temps que la grille de la pièce, gardé avec ses valeurs, mais montré
// seulement dans l'onglet Bien : les grilles de Jules ne changent pas.
const BIEN_ADRESSE = { id: 'bien_adresse', libelle: 'Adresse du local et lots', format: 'Adresse complète, puis les lots s\'ils sont dits : « 12 rue Foch, 56100 Lorient · lots 3 et 12 ».' };
const BIEN_SURFACE = { id: 'bien_surface', libelle: 'Surface du local', format: '« XX m² » en disant laquelle (Carrez, utile, louée), et par niveau si la pièce les distingue.', schema: { type: 'object', properties: { texte: { type: 'string' }, m2: { type: 'number', description: 'la surface totale du local en m²' } } } };
export const CRITERES_BIEN = {
  bail: [BIEN_ADRESSE, BIEN_SURFACE, { id: 'bien_bailleur', libelle: 'Bailleur', format: 'Le nom du bailleur, tel que le bail l\'écrit : « SCI DU PORT ».' }],
  avenants: [{ id: 'bien_bailleur', libelle: 'Bailleur', format: 'Le nom du bailleur, s\'il est dit.' }],
  taxe_fonciere: [{ id: 'bien_proprietaire', libelle: 'Propriétaire imposé', format: 'Le nom du ou des propriétaires sur l\'avis.' }],
  diagnostics: [BIEN_ADRESSE, BIEN_SURFACE],
  rcp: [{ id: 'bien_lots', libelle: 'Lots du local', format: 'Les numéros de lots du local et leurs tantièmes, s\'ils sont dits.' }],
};
/** Tout ce qu'une pièce lit : les critères de sa grille, puis ce que l'onglet Bien attend d'elle. */
export const criteresLus = (type) => [...(grilleDe(TYPES.find((t) => t.id === type)?.grille)?.criteres || []), ...(CRITERES_BIEN[type] || [])];

// --- Les emplacements : un par type de pièce, dans l'ordre où l'équipe les reçoit --------------
export const TYPES = [
  { id: 'bail', titre: 'Bail', grille: 'bail', attendus: 1, categorie: CATEGORIE_PAR_TYPE.bail },
  { id: 'avenants', titre: 'Avenants', grille: 'bail', attendus: 0, categorie: CATEGORIE_PAR_TYPE.avenants },
  { id: 'quittances', titre: 'Quittances de loyer', grille: 'quittances', attendus: 3, categorie: CATEGORIE_PAR_TYPE.quittances },
  { id: 'pv_ag', titre: "PV d'AG", grille: 'pv_ag', attendus: 3, categorie: CATEGORIE_PAR_TYPE.pv_ag },
  { id: 'rcp', titre: 'Règlement de copropriété', grille: 'rcp', attendus: 1, categorie: CATEGORIE_PAR_TYPE.rcp },
  { id: 'diagnostics', titre: 'Diagnostics', grille: 'diagnostics', attendus: 1, categorie: CATEGORIE_PAR_TYPE.diagnostics },
  { id: 'taxe_fonciere', titre: 'Avis de taxe foncière', grille: 'taxe_fonciere', attendus: 1, categorie: CATEGORIE_PAR_TYPE.taxe_fonciere },
  { id: 'kbis', titre: 'Kbis du locataire', grille: 'kbis', attendus: 0, categorie: CATEGORIE_PAR_TYPE.kbis },
  // Rangées pour qu'on ne les confonde plus avec une pièce lue ; elles ne sont pas lues.
  { id: 'fiche', titre: 'Fiche du bien', grille: null, attendus: 0, categorie: 'Fiche commerciale' },
  { id: 'autre', titre: 'Autre pièce', grille: null, attendus: 0, categorie: CATEGORIE_PAR_TYPE.autre },
];
const TYPE = Object.fromEntries(TYPES.map((t) => [t.id, t]));
/** L'onglet de l'Analyse où se lit une pièce de ce type (« pv_ag » → « copropriete »), ou null. */
export const ongletDuType = (type) => GRILLES_LUES.find((g) => g.id === TYPE[type]?.grille)?.onglet || null;

// Les grilles lues, et l'onglet de l'analyse où chacune s'affiche.
export const GRILLES_LUES = [
  { id: 'bail', onglet: 'bail' },
  { id: 'kbis', onglet: 'bail' },
  { id: 'taxe_fonciere', onglet: 'bail' },
  { id: 'quittances', onglet: 'quittances' },
  { id: 'pv_ag', onglet: 'copropriete' },
  { id: 'rcp', onglet: 'copropriete' },
  { id: 'diagnostics', onglet: 'diagnostics' },
];
// Trois quittances ou trois PV disent chacun leur période : leurs valeurs s'empilent. Ailleurs, deux
// pièces qui ne disent pas la même chose (bail et avenant, deux avis) demandent un choix.
const EMPILEES = new Set(['quittances', 'pv_ag']);

// Le nom d'une fiche commerciale dit souvent « bail » (« murs loués, bail 3/6/9 ») : on la reconnaît d'abord.
const NOM_DE_FICHE = /\bfiche|teaser|plaquette|pr[ée]sentation|annonce|descriptif|opportunit/i;

/** L'emplacement que le nom ou la catégorie de la pièce propose. Une proposition : rien n'est rangé sans clic. */
export function suggestion(doc = {}) {
  const nom = `${doc.nom || ''}`;
  // « État descriptif de division » dit « descriptif » sans être une fiche.
  if (/descriptif[\s_-]+de[\s_-]+division|\bedd\b/i.test(nom.replace(/_/g, ' '))) return 'rcp';
  if (NOM_DE_FICHE.test(nom)) return 'fiche';
  const t = typeDepuisCategorie(doc.categorie || null, nom);
  if (t === 'edd') return 'rcp';
  if (t === 'charges') return 'pv_ag';
  return TYPE[t] && t !== 'autre' ? t : null;
}

// --- La lecture d'une pièce -----------------------------------------------------------------------
const decrireDonnees = (schema) =>
  Object.entries(schema?.properties || {})
    .filter(([k]) => k !== 'texte')
    .map(([k, p]) => `${k} (${p.type === 'boolean' ? 'vrai / faux' : p.type === 'number' ? 'nombre' : p.type === 'array' ? 'liste de textes' : 'texte'}${p.enum ? ` : ${p.enum.join(' | ')}` : ''}${p.description ? ` ; ${p.description}` : ''})`)
    .join(', ');

/** La consigne de lecture d'une pièce : les critères de la grille de son emplacement, rien d'autre. */
export function consigneLecture({ type, nom, criteres, grille, contexte = null, aujourdHui = new Date().toISOString().slice(0, 10) }) {
  const t = TYPE[type];
  const lignes = criteres.map((c) => {
    const donnees = decrireDonnees(c.schema || grille.schema?.[c.id]);
    return `- ${c.id} (${c.libelle}) : format ${c.format}${donnees ? `\n  donnees : ${donnees}` : ''}`;
  });
  return [
    `Tu lis « ${nom} », rangé par l'analyste comme : ${t?.titre || type}. C'est une pièce d'un dossier d'investissement en murs commerciaux.`,
    contexte ? `Ce que l'analyste sait de cette pièce, à prendre en compte pour la lire (il ne remplace pas ce que la pièce dit) : « ${contexte} »` : null,
    type === 'avenants' ? "Un avenant ne modifie souvent que quelques clauses : ne relève que ce que CET avenant dit." : null,
    `Pour chaque critère ci-dessous, relève ce que CETTE pièce dit, et rien d'autre. Ne devine rien, ne complète pas avec ce qu'une autre pièce dirait : si la pièce ne traite pas le critère, "valeur" est une chaîne vide.`,
    `Pour chaque valeur trouvée : "page", la page où elle se lit (les marques « --- page N --- » la donnent quand elles sont là), et "citation", la phrase du document qui la prouve, recopiée mot pour mot (300 caractères au plus, sans reformuler).`,
    `"valeur" suit le format demandé, en français. "donnees" porte les champs listés sous le critère, à null quand la pièce ne permet pas de les remplir. Dates au format JJ/MM/AAAA. Aujourd'hui : ${aujourdHui}.`,
    '',
    'Critères :',
    ...lignes,
    '',
    'Réponds UNIQUEMENT en JSON : {"criteres": {"<id>": {"valeur": "...", "page": 3, "citation": "...", "donnees": {}}}}',
  ].filter((l) => l != null).join('\n');
}

const nettoyer = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

/** La réponse du modèle, ramenée aux critères demandés. Un critère omis est un critère sans valeur. */
export function lireReponse(brut, criteres) {
  const texte = typeof brut === 'string' ? brut : JSON.stringify(brut || {});
  const debut = texte.indexOf('{');
  const fin = texte.lastIndexOf('}');
  if (debut === -1 || fin <= debut) throw new Error("Le modèle n'a pas rendu de réponse lisible.");
  const objet = JSON.parse(texte.slice(debut, fin + 1));
  const rendus = objet?.criteres && typeof objet.criteres === 'object' ? objet.criteres : objet;
  const sortie = {};
  for (const c of criteres) {
    const r = rendus?.[c.id] || {};
    const valeur = String(r.valeur ?? '').trim().slice(0, 2000);
    const page = Number.isFinite(Number(r.page)) && Number(r.page) > 0 ? Math.round(Number(r.page)) : null;
    sortie[c.id] = {
      valeur,
      page: valeur ? page : null,
      citation: valeur ? nettoyer(r.citation, 400) || null : null,
      donnees: valeur && r.donnees && typeof r.donnees === 'object' ? r.donnees : {},
    };
  }
  return sortie;
}

// --- La preuve : la citation retrouvée dans le texte de la pièce ----------------------------------
const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Le texte de chaque page, depuis le texte marqué « --- page N --- ». */
export function pagesDuTexte(texte) {
  const pages = [];
  const re = /---\s*page\s+(\d+)\s*---/gi;
  let m;
  let avant = null;
  while ((m = re.exec(texte))) {
    if (avant) pages[avant.n - 1] = texte.slice(avant.fin, m.index);
    avant = { n: Number(m[1]), fin: re.lastIndex };
  }
  if (avant) pages[avant.n - 1] = texte.slice(avant.fin);
  return pages.map((p) => p || '');
}

/**
 * La page où la citation se lit vraiment : la page dite d'abord, puis toutes. La citation entière, sinon
 * son début (le modèle recopie rarement au caractère près). `verifiee` à null quand la pièce n'a pas de
 * texte (scan) : on ne sait pas, on ne prétend rien.
 */
export function trouverPage(pages, citation, pageDite = null) {
  if (!citation || !pages?.length) return { page: pageDite, verifiee: null };
  const cible = norm(citation);
  if (cible.length < 8) return { page: pageDite, verifiee: null };
  const normees = pages.map(norm);
  const ordre = pageDite && pageDite <= normees.length ? [pageDite - 1, ...normees.keys()] : [...normees.keys()];
  for (const longueur of [cible.length, 120, 80, 50, 30]) {
    const morceau = cible.slice(0, longueur).trim();
    if (morceau.length < 18 && longueur !== cible.length) continue;
    for (const i of ordre) if (normees[i]?.includes(morceau)) return { page: i + 1, verifiee: true };
  }
  return { page: pageDite, verifiee: false };
}

async function pagesDe(piece) {
  if (piece?.mimetype !== 'application/pdf' || !piece.buffer?.length) return null;
  try {
    const { coucheTexteDuPdf } = await import('./ingest.js');
    const couche = await coucheTexteDuPdf(piece.buffer);
    return couche ? pagesDuTexte(couche.texte) : null;
  } catch {
    return null;
  }
}

// --- L'état sur le dossier ----------------------------------------------------------------------------
const dealDe = (dealId) => Records.findBy('Deal', 'deal_id', dealId) || null;

// Toujours relire le dossier avant d'écrire : la file de lecture et l'écran écrivent en même temps.
function majEtat(dealId, fn) {
  const brut = dealDe(dealId);
  if (!brut) return null;
  const etat = structuredClone(brut.analyse_pieces || {});
  etat.docs = etat.docs || {};
  etat.cases = etat.cases || {};
  etat.ecarts = etat.ecarts || {};
  const r = fn(etat, brut);
  if (r === false) return null;
  Records.update('Deal', brut.id, { analyse_pieces: etat });
  return etat;
}

/** Ranger une pièce dans un emplacement (ou l'en retirer, type vide). Sa lecture d'avant ne vaut plus. */
export function rangerPiece(dealId, docId, type, user, { lire = true } = {}) {
  const brut = dealDe(dealId);
  if (!brut) return { ok: false, error: 'Dossier introuvable' };
  if (!(brut.documents_espace || []).some((d) => d.id === docId)) return { ok: false, error: 'Pièce introuvable' };
  const t = type ? typeDuDossier(brut, type) : null;
  if (type && !t) return { ok: false, error: 'Emplacement inconnu' };
  majEtat(dealId, (etat) => {
    const avant = etat.docs[docId] || {};
    if (!t) { delete etat.docs[docId]; return; }
    etat.docs[docId] = {
      type: t.id,
      par: user?.email || null,
      le: new Date().toISOString(),
      // Déposée dans la Data Room, la pièce n'est pas lue (29 oct. 2026, Jules) : la lecture se demande.
      extraction: t.grille && lire ? { statut: 'en_attente', le: new Date().toISOString() } : null,
      valeurs: {},
      questions: avant.questions || [],
      contexte: avant.contexte || null,
    };
  });
  // La catégorie de la Data Room suit le choix de l'analyste : c'est lui qui a classé.
  if (t) {
    const frais = dealDe(dealId);
    Records.update('Deal', frais.id, { documents_espace: (frais.documents_espace || []).map((d) => (d.id === docId ? { ...d, categorie: t.categorie, categorie_auto: false } : d)) });
  }
  return { ok: true, lire: !!t?.grille && lire };
}

// Un type de pièce que l'analyste nomme lui-même (29 oct. 2026, Jules : un « + » à la place d'« Autre pièce »,
// pour que jamais une pièce n'arrive sans qu'on sache ce qu'elle est). Il n'a pas de grille : il n'est pas lu.
const typesPerso = (brut) => brut?.analyse_pieces?.types_perso || [];
function typeDuDossier(brut, id) {
  if (TYPE[id]) return TYPE[id];
  const p = typesPerso(brut).find((x) => x.id === id);
  return p ? { id: p.id, titre: p.titre, grille: null, attendus: 0, categorie: p.titre } : null;
}
export const typeExiste = (dealId, id) => !!typeDuDossier(dealDe(dealId), id);

export function creerType(dealId, titre, user) {
  const t = String(titre || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  if (!t) return { ok: false, error: 'Nommez le type de document.' };
  const id = `perso_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const fait = majEtat(dealId, (etat) => { etat.types_perso = [...(etat.types_perso || []), { id, titre: t, par: user?.email || null, le: new Date().toISOString() }]; });
  return fait ? { ok: true, id, titre: t } : { ok: false, error: 'Dossier introuvable' };
}

/** Retirer un type créé, seulement vide : une pièce n'est jamais perdue avec sa zone. */
export function retirerType(dealId, id) {
  let erreur = null;
  const fait = majEtat(dealId, (etat) => {
    if (Object.values(etat.docs).some((d) => d.type === id)) { erreur = 'Retirez d\'abord ses pièces.'; return false; }
    etat.types_perso = (etat.types_perso || []).filter((x) => x.id !== id);
  });
  if (erreur) return { ok: false, error: erreur };
  return fait ? { ok: true } : { ok: false, error: 'Dossier introuvable' };
}

/** Le contexte d'une pièce, dit par l'analyste (« bail en tacite reconduction depuis 2014 ») : l'IA le lit avec elle. */
export function poserContexte(dealId, docId, contexte, user) {
  const brut = dealDe(dealId);
  if (!brut) return { ok: false, error: 'Dossier introuvable' };
  if (!(brut.documents_espace || []).some((d) => d.id === docId)) return { ok: false, error: 'Pièce introuvable' };
  const t = String(contexte || '').trim().slice(0, 2000);
  majEtat(dealId, (etat) => {
    const d = etat.docs[docId] || (etat.docs[docId] = { type: null, valeurs: {}, questions: [] });
    d.contexte = t || null;
    d.contexte_par = t ? user?.email || null : null;
    d.contexte_le = t ? new Date().toISOString() : null;
  });
  return { ok: true };
}

/**
 * La Data Room (29 oct. 2026, Jules : « plusieurs dropbox, une par type ; on met les documents, ça ne fait
 * rien, on voit juste que c'est bien importé ») : chaque emplacement et ses pièces, puis les types créés par
 * l'analyste. Une pièce importée avant les emplacements se range d'après sa catégorie ; sans catégorie connue,
 * dans « Sans type », qui ne s'affiche que s'il en reste.
 */
export function lireDepots(dealId) {
  const brut = dealDe(dealId);
  if (!brut) return null;
  const etat = brut.analyse_pieces?.docs || {};
  const perso = typesPerso(brut);
  const typeDe = (d) => {
    if (etat[d.id]?.type && typeDuDossier(brut, etat[d.id].type)) return etat[d.id].type;
    const t = d.categorie ? typeDepuisCategorie(d.categorie, '') : null;
    if (t === 'edd') return 'rcp';
    if (/fiche/i.test(d.categorie || '')) return 'fiche';
    return TYPE[t] ? t : 'autre';
  };
  const docs = (brut.documents_espace || []).map((d) => ({ id: d.id, nom: d.nom, url: d.url, mime: d.mime || null, taille: d.taille || 0, ajoute_le: d.ajoute_le || null, ajoute_par: d.ajoute_par || null, type: typeDe(d), contexte: etat[d.id]?.contexte || null, nom_propose: etat[d.id]?.nom_propose || null, drive_url: d.drive_range_le ? d.drive_url || null : null, drive_range_le: d.drive_range_le || null, lecture: etat[d.id]?.extraction?.statut || null }));
  const zone = (t, perso = false) => ({ id: t.id, titre: t.titre, attendus: t.attendus || 0, perso, documents: docs.filter((d) => d.type === t.id) });
  const sansType = zone({ id: 'autre', titre: 'Sans type' });
  const lisibles = new Set(TYPES.filter((t) => grilleDe(t.grille)).map((t) => t.id));
  const aLireDocs = docs.filter((d) => lisibles.has(d.type));
  return {
    drive_folder_url: brut.drive_folder_url || null,
    // Pour « Lancer l'analyse » : les pièces lisibles jamais lues, et celles déjà lues.
    nouvelles: aLireDocs.filter((d) => !d.lecture || d.lecture === 'erreur').length,
    deja_lues: aLireDocs.filter((d) => d.lecture && d.lecture !== 'erreur').length,
    emplacements: [
      ...TYPES.filter((t) => t.id !== 'autre').map((t) => zone(t)),
      ...perso.map((t) => zone(t, true)),
      ...(sansType.documents.length ? [sansType] : []),
    ],
  };
}

function marquer(dealId, docId, type, extraction) {
  majEtat(dealId, (etat) => {
    const d = etat.docs[docId];
    if (!d || d.type !== type) return false;
    d.extraction = extraction;
  });
}

async function lireParDefaut({ buffer, mimetype, nom, prompt }) {
  const { generateFromDocument } = await import('../llm.js');
  return generateFromDocument({ buffer, mimetype, nom, prompt });
}

/**
 * Lit une pièce rangée : les critères de la grille de son emplacement (ou un seul, `seulement`), avec la
 * preuve de chacun. N'écrit que dans `docs[docId].valeurs` : les cases décidées par l'analyste n'y sont pas.
 */
export async function lirePiece(dealId, docId, { uploadDir, user, seulement = null, lire = lireParDefaut } = {}) {
  const brut = dealDe(dealId);
  const etatDoc = brut?.analyse_pieces?.docs?.[docId];
  if (!etatDoc) return { ok: false, error: 'Pièce non rangée' };
  // Une pièce jamais lue : c'est elle qui peut contredire une ligne vérifiée (pas la relecture d'une pièce connue).
  const premiere = !seulement && !Object.keys(etatDoc.valeurs || {}).length;
  const type = etatDoc.type;
  const grille = grilleDe(TYPE[type]?.grille);
  if (!grille) return { ok: false, error: "Cet emplacement ne se lit pas" };
  const tous = criteresLus(type);
  const criteres = seulement ? tous.filter((c) => seulement.includes(c.id)) : tous;
  if (!criteres.length) return { ok: false, error: 'Critère inconnu' };
  const { chargerPiece } = await import('./espace.js');
  const piece = chargerPiece(dealId, docId, uploadDir);
  if (!piece?.buffer) {
    const erreur = "Le fichier n'est plus sur le serveur : déposez-le à nouveau.";
    marquer(dealId, docId, type, { statut: 'erreur', le: new Date().toISOString(), erreur });
    return { ok: false, error: erreur };
  }
  marquer(dealId, docId, type, { statut: 'en_cours', le: new Date().toISOString(), ...(seulement ? { critere: seulement[0] } : {}) });
  try {
    const { mesurer } = await import('../llm-couts.js');
    const prompt = consigneLecture({ type, nom: piece.nom, criteres, grille, contexte: etatDoc.contexte || null });
    const { resultat } = await mesurer({ operation: "lecture d'une pièce", par: user?.email || null, sur: dealId, libelle: piece.nom }, () =>
      lire({ buffer: piece.buffer, mimetype: piece.mimetype || 'application/pdf', nom: piece.nom, prompt })
    );
    const valeurs = lireReponse(resultat, criteres);
    const pages = await pagesDe(piece);
    for (const v of Object.values(valeurs)) {
      if (!v.valeur) continue;
      Object.assign(v, pages ? trouverPage(pages, v.citation, v.page) : { verifiee: null });
    }
    majEtat(dealId, (etat) => {
      const d = etat.docs[docId];
      // Rangée ailleurs pendant la lecture : cette lecture ne vaut plus rien.
      if (!d || d.type !== type) return false;
      d.valeurs = seulement ? { ...(d.valeurs || {}), ...valeurs } : valeurs;
      d.extraction = { statut: 'fait', le: new Date().toISOString(), par: user?.email || null };
      // Une pièce nouvelle qui contredit une ligne vérifiée la repasse à vérifier (30 oct. 2026, Jules) : la valeur saisie
      // et la note restent de côté. Sur une grille empilée (quittances, PV), toute pièce nouvelle ajoute à la ligne.
      if (premiere) {
        const gid = TYPE[type]?.grille;
        for (const [crit, v] of Object.entries(valeurs)) {
          if (!v?.valeur) continue;
          const cle = `${gid}.${crit}`;
          const h = etat.cases[cle];
          if (!h || !['verifie', 'corrige'].includes(h.statut)) continue;
          if (!EMPILEES.has(gid) && norm(h.valeur) === norm(v.valeur)) continue;
          etat.cases[cle] = { note: h.note || null, source: h.source || null, valeur_main: h.statut === 'corrige' ? h.valeur : h.valeur_main || null, par: h.par, le: h.le, contredite_par: docId };
        }
      }
    });
    import('./projet.js').then((m) => m.projetSuitLeDossier(dealId, user)).catch(() => {});
    return { ok: true, valeurs };
  } catch (e) {
    marquer(dealId, docId, type, { statut: 'erreur', le: new Date().toISOString(), erreur: e?.message || 'Lecture impossible' });
    return { ok: false, error: e?.message || 'Lecture impossible' };
  }
}

// --- La file : une pièce à la fois, l'écran n'attend pas ------------------------------------------------
const file = [];
let enMarche = false;

export function enfiler(dealId, docId, opts = {}) {
  const cle = `${dealId}:${docId}:${(opts.seulement || []).join(',')}`;
  if (file.some((t) => t.cle === cle)) return;
  if (!opts.seulement) {
    const d = dealDe(dealId)?.analyse_pieces?.docs?.[docId];
    if (d) marquer(dealId, docId, d.type, { statut: 'en_attente', le: new Date().toISOString() });
  }
  file.push({ cle, dealId, docId, opts });
  tourner();
}

async function tourner() {
  if (enMarche) return;
  enMarche = true;
  try {
    while (file.length) {
      const t = file.shift();
      await lirePiece(t.dealId, t.docId, t.opts).catch((e) => console.warn(`[analyse-pieces] ${e?.message || e}`));
    }
  } finally {
    enMarche = false;
  }
}

/** Au démarrage : les pièces laissées en route reprennent leur lecture. */
export function reprendreEnAttente(uploadDir) {
  let n = 0;
  for (const d of Records.list('Deal')) {
    for (const [docId, x] of Object.entries(d.analyse_pieces?.docs || {})) {
      if (['en_attente', 'en_cours'].includes(x.extraction?.statut)) { enfiler(d.deal_id, docId, { uploadDir }); n += 1; }
    }
  }
  return n;
}

// --- Les cases ---------------------------------------------------------------------------------------------
const val = (c) => (c && typeof c === 'object' && 'valeur' in c ? c.valeur : c ?? null);
const eur = (v) => (v == null ? null : `${Math.round(v).toLocaleString('fr-FR')} €`);

/** Un nombre dans un texte : « 26 400 € / an » → 26400. */
export function nombreDe(texte) {
  const m = String(texte || '').replace(/[\u00a0\u202f]/g, ' ').match(/\d[\d ]*(?:[.,]\d+)?/);
  if (!m) return null;
  const n = Number(m[0].replace(/ /g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function alertesEnPlus(gid, cid, x) {
  if (gid === 'kbis' && cid === 'procedure' && x.en_cours) return { statut: 'warning', motif: 'Procédure collective en cours.' };
  if (gid === 'kbis' && cid === 'date_extrait') {
    const [j, m, a] = String(x.date || x.texte || '').split('/').map(Number);
    const le = a ? Date.UTC(a, m - 1, j) : null;
    if (le && Date.now() - le > 92 * 86400000) return { statut: 'a_verifier', motif: "L'extrait a plus de trois mois." };
  }
  return null;
}

function documentsDe(brut) {
  const etat = brut.analyse_pieces || {};
  return (brut.documents_espace || []).map((d) => {
    const x = etat.docs?.[d.id] || null;
    return {
      id: d.id, nom: d.nom, url: d.url, mime: d.mime || null, ajoute_le: d.ajoute_le || null, titre: nomLisible(d, x),
      type: x?.type || null, range_par: x?.par || null, extraction: x?.extraction || null,
      lus: x?.valeurs ? Object.values(x.valeurs).filter((v) => v.valeur).length : 0,
      questions: x?.questions || [],
      suggestion: x?.type ? null : suggestion(d),
    };
  });
}

/**
 * Le nom d'une pièce à l'écran (29 oct. 2026, Jules : « je veux juste voir le nom corrigé, Bail commercial ») : le
 * nom proposé pour le Drive, sinon le nom du fichier s'il se lit, sinon le type de la pièce ; sans extension.
 * Un nom de scanner (« doc01657520260325093508-1.pdf ») ne se montre jamais.
 */
export function nomLisible(d, x) {
  const sans = (n) => String(n || '').replace(/\.[a-z0-9]{2,5}$/i, '').trim();
  const machine = (n) => /^(doc|scan|img|image|dsc|pxl|document|file|fichier)?[\s_-]*\d[\d_\s.-]{5,}$/i.test(sans(n)) || /^(img|dsc|pxl|scan)[\s_-]*\d{3,}/i.test(sans(n)) || !/[a-zà-ÿ]{2}/i.test(sans(n));
  if (x?.nom_propose) return sans(x.nom_propose);
  if (d?.nom && !machine(d.nom)) return sans(d.nom);
  return TYPES.find((t) => t.id === x?.type)?.titre || 'Pièce';
}

/** Une grille, case par case : la valeur montrée, son état, ses sources, l'alerte de la règle. */
function lireGrille(gid, brut, docs, ctx) {
  const grille = grilleDe(gid);
  const etat = brut.analyse_pieces || {};
  const types = TYPES.filter((t) => t.grille === gid).map((t) => t.id);
  const pieces = docs.filter((d) => types.includes(d.type)).sort((a, b) => types.indexOf(a.type) - types.indexOf(b.type));
  const enLecture = pieces.some((d) => ['en_attente', 'en_cours'].includes(d.extraction?.statut));
  const lignes = grille.criteres.map((c) => {
    const cle = `${gid}.${c.id}`;
    const humain = etat.cases?.[cle] || null;
    const sources = pieces
      .map((d) => {
        const v = etat.docs?.[d.id]?.valeurs?.[c.id];
        return v?.valeur ? { document_id: d.id, document_nom: d.nom, document_titre: d.titre, document_url: d.url, mime: d.mime, type: d.type, valeur: v.valeur, page: v.page, citation: v.citation, verifiee: v.verifiee ?? null, donnees: v.donnees || {} } : null;
      })
      .filter(Boolean);
    // Par défaut, la pièce la plus récente (30 oct. 2026, Jules) : un avenant reçu après le bail donne le chiffre affiché.
    const retenue = (humain?.source && sources.find((s) => s.document_id === humain.source)) || sources.at(-1) || null;
    const differentes = new Set(sources.map((s) => norm(s.valeur))).size > 1;
    let statut;
    let valeur = null;
    if (humain?.statut === 'corrige') { statut = 'corrige'; valeur = humain.valeur; }
    else if (humain?.statut === 'verifie') { statut = 'verifie'; valeur = humain.valeur ?? retenue?.valeur ?? null; }
    else if (humain?.statut === 'introuvable') statut = 'introuvable';
    else if (retenue) { statut = 'ia'; valeur = EMPILEES.has(gid) ? sources.map((s) => s.valeur).join('\n') : retenue.valeur; }
    else if (!pieces.length) statut = 'manquant';
    else if (enLecture) statut = 'lecture';
    else if (pieces.every((d) => !d.extraction)) statut = 'non_lu';
    else statut = 'introuvable';
    // Une valeur vérifiée que la relecture contredit : on le dit, on ne la remplace pas.
    const relue = humain?.statut === 'verifie' && retenue && humain.valeur && norm(retenue.valeur) !== norm(humain.valeur) ? retenue.valeur : null;
    // La règle juge la valeur lue par l'IA. C'est la note de l'IA : ni le vert ni une valeur modifiée ne l'effacent,
    // seule la personne la retire dans la case Notes (30 oct. 2026, Jules).
    let alerte = null;
    if (retenue && statut !== 'introuvable') {
      const x = { texte: retenue.valeur, ...retenue.donnees };
      alerte = (GRILLES[gid] ? warnings(gid, c.id, x, ctx) : null) || alertesEnPlus(gid, c.id, x);
    }
    return {
      id: c.id, cle, libelle: c.libelle, format: c.format, regle: c.regle,
      statut, valeur, sources, retenue: retenue?.document_id || null,
      a_choisir: !EMPILEES.has(gid) && differentes && !humain?.source && !['corrige', 'introuvable'].includes(humain?.statut),
      relue, alerte, note: humain?.note || null, valeur_main: humain?.statut === 'corrige' ? humain.valeur : humain?.valeur_main || null,
      par: humain?.par || null, le: humain?.le || null, introuvable_par: humain?.statut === 'introuvable' ? humain.par : null,
    };
  });
  return { id: gid, titre: grille.titre, pieces: pieces.map((d) => ({ id: d.id, nom: d.nom, type: d.type, extraction: d.extraction })), lignes };
}

// La donnée lue retenue d'une case, quand elle vient d'une pièce (pas d'une correction).
function donneesDe(grilles, gid, cid) {
  const l = grilles[gid]?.lignes.find((x) => x.id === cid);
  if (!l || l.statut === 'corrige' || l.statut === 'introuvable') return { texte: l?.valeur || null };
  const s = l.sources.find((x) => x.document_id === l.retenue);
  return s ? { texte: l.valeur, ...s.donnees, _source: s } : { texte: l.valeur };
}

const sourceDe = (d, libelle) => (d._source ? { source: libelle, document_id: d._source.document_id, document_nom: d._source.document_nom, document_url: d._source.document_url, page: d._source.page, citation: d._source.citation } : { source: libelle });
const ouiNonDe = (d) => (typeof d.oui === 'boolean' ? d.oui : /^\s*oui/i.test(d.texte || '') ? true : /^\s*non/i.test(d.texte || '') ? false : null);
const periodiciteDe = (d) => (d.periodicite && d.periodicite !== 'inconnu' ? d.periodicite : /trimestr/i.test(d.texte || '') ? 'trimestriel' : /mensuel|par mois/i.test(d.texte || '') ? 'mensuel' : /annuel|par an/i.test(d.texte || '') ? 'annuel' : null);

/** Les croisements entre pièces : ils signalent l'écart et montrent chaque valeur ; l'analyste retient. */
export function croiser(grilles, lot = {}, decisions = {}) {
  const sortie = [];
  const pousser = (cle, libelle, onglet, valeurs, ecart, motif) => {
    if (valeurs.length < 2) return;
    sortie.push({ cle, libelle, onglet, valeurs, ecart, motif: ecart ? motif : null, retenu: decisions[cle]?.retenu || null, par: decisions[cle]?.par || null });
  };

  // Le loyer : fiche commerciale, bail (signature), quittances ramenées à l'année.
  const fiche = Number(val(lot.loyer_annuel_ht_hc)) || null;
  const bail = donneesDe(grilles, 'bail', 'loyer_signature');
  const bailAn = Number(bail.annuel_ht) || nombreDe(bail.texte);
  const q = donneesDe(grilles, 'quittances', 'loyer_hc_ht');
  const qMontant = Number(q.montant) || nombreDe(q.texte);
  const qPer = periodiciteDe(q) || 'mensuel';
  const qAn = qMontant ? qMontant * (qPer === 'trimestriel' ? 4 : qPer === 'annuel' ? 1 : 12) : null;
  const loyers = [
    fiche ? { id: 'fiche', valeur: `${eur(fiche)} / an`, n: fiche, source: 'Fiche commerciale' } : null,
    bailAn ? { id: 'bail', valeur: `${eur(bailAn)} / an`, n: bailAn, ...sourceDe(bail, 'Bail') } : null,
    qAn ? { id: 'quittances', valeur: `${eur(qAn)} / an (${eur(qMontant)} ${qPer === 'trimestriel' ? 'par trimestre' : qPer === 'annuel' ? 'par an' : 'par mois'})`, n: qAn, ...sourceDe(q, 'Quittances') } : null,
  ].filter(Boolean);
  const ns = loyers.map((l) => l.n);
  const ecartLoyer = ns.length > 1 && Math.max(...ns) / Math.min(...ns) - 1 > 0.05;
  pousser('loyer', 'Loyer annuel HT HC', 'quittances', loyers.map(({ n, ...l }) => l), ecartLoyer, "Les pièces ne donnent pas le même loyer (plus de 5 % d'écart). Le loyer de signature peut différer du loyer actuel par l'indexation.");

  // La TVA : bail contre quittances.
  const tvaB = donneesDe(grilles, 'bail', 'tva');
  const tvaQ = donneesDe(grilles, 'quittances', 'tva');
  const tvas = [[tvaB, 'Bail', 'bail'], [tvaQ, 'Quittances', 'quittances']].map(([d, lib, id]) => (ouiNonDe(d) == null ? null : { id, valeur: ouiNonDe(d) ? 'Avec TVA' : 'Sans TVA', ...sourceDe(d, lib) })).filter(Boolean);
  pousser('tva', 'TVA sur le loyer', 'quittances', tvas, tvas.length > 1 && tvas[0].valeur !== tvas[1].valeur, 'Le bail et les quittances ne disent pas la même chose sur la TVA.');

  // La fréquence de paiement.
  const modeB = donneesDe(grilles, 'bail', 'mode_reglement');
  const pers = [[modeB, 'Bail', 'bail'], [q, 'Quittances', 'quittances']].map(([d, lib, id]) => { const p = d.texte ? periodiciteDe(d) : null; return p ? { id, valeur: p, ...sourceDe(d, lib) } : null; }).filter(Boolean);
  pousser('frequence', 'Fréquence de paiement', 'quittances', pers, pers.length > 1 && pers[0].valeur !== pers[1].valeur, 'Le bail et les quittances ne donnent pas la même fréquence.');

  // Le locataire : bail contre Kbis.
  const parties = donneesDe(grilles, 'bail', 'parties');
  const kbis = donneesDe(grilles, 'kbis', 'denomination');
  const locBail = parties.locataire || parties.texte;
  const loc = [locBail ? { id: 'bail', valeur: locBail, ...sourceDe(parties, 'Bail') } : null, kbis.texte ? { id: 'kbis', valeur: kbis.texte, ...sourceDe(kbis, 'Kbis') } : null].filter(Boolean);
  const a = norm(locBail).replace(/\b(sarl|sas|sasu|eurl|sa|sci|snc)\b/g, '').trim();
  const b = norm(kbis.texte).replace(/\b(sarl|sas|sasu|eurl|sa|sci|snc)\b/g, '').trim();
  pousser('locataire', 'Locataire', 'bail', loc, loc.length > 1 && !!a && !!b && !a.includes(b) && !b.includes(a), "Le locataire du bail n'est pas la société du Kbis.");

  return sortie;
}

/**
 * Les chiffres du simulateur que les autres onglets de l'analyse donnent (30 oct. 2026, Jules : « que les chiffres du
 * simulateur se remplissent automatiquement avec les données des autres pages ») : loyer, TVA, charges et taxe foncière
 * refacturées, montant de la taxe foncière, surface. Chaque chiffre dit d'où il vient. Le loyer retenu dans l'écart
 * gagne, sinon les quittances (le loyer d'aujourd'hui), sinon le bail.
 */
export function simulateurDesGrilles(grilles, brut = {}, ecarts = []) {
  const valeurs = {};
  const sources = {};
  const poser = (cle, v, source) => { if (v == null || v === '' || Number.isNaN(v)) return; valeurs[cle] = v; sources[cle] = source; };

  const loyer = ecarts.find((e) => e.cle === 'loyer');
  const retenu = loyer?.retenu && loyer.valeurs.find((v) => v.id === loyer.retenu);
  const bail = donneesDe(grilles, 'bail', 'loyer_signature');
  const bailAn = Number(bail.annuel_ht) || nombreDe(bail.texte);
  const q = donneesDe(grilles, 'quittances', 'loyer_hc_ht');
  const qMontant = Number(q.montant) || nombreDe(q.texte);
  const qPer = periodiciteDe(q) || 'mensuel';
  const qAn = qMontant ? qMontant * (qPer === 'trimestriel' ? 4 : qPer === 'annuel' ? 1 : 12) : null;
  if (retenu) poser('loyerInitialHTHC', nombreDe(retenu.valeur), `${retenu.source} (retenu)`);
  else if (qAn) poser('loyerInitialHTHC', Math.round(qAn), 'Quittances');
  else if (bailAn) poser('loyerInitialHTHC', Math.round(bailAn), 'Bail');

  const tvaB = ouiNonDe(donneesDe(grilles, 'bail', 'tva'));
  const tvaQ = ouiNonDe(donneesDe(grilles, 'quittances', 'tva'));
  if (tvaB != null) poser('loyerSoumisTVA', tvaB, 'Bail');
  else if (tvaQ != null) poser('loyerSoumisTVA', tvaQ, 'Quittances');

  const charges = donneesDe(grilles, 'bail', 'charges');
  poser('chargesCoproRefacturables', typeof charges.copro_refacturee === 'boolean' ? charges.copro_refacturee : ouiNonDe(charges), 'Bail');
  const taxes = donneesDe(grilles, 'bail', 'taxes');
  poser('taxeFonciereRefacturable', typeof taxes.taxe_fonciere_refacturee === 'boolean' ? taxes.taxe_fonciere_refacturee : ouiNonDe(taxes), 'Bail');
  const tf = donneesDe(grilles, 'taxe_fonciere', 'montant');
  const tfMontant = Number(tf.montant) || nombreDe(tf.texte);
  if (tfMontant) poser('taxeFonciere', Math.round(tfMontant), 'Avis de taxe foncière');

  // La surface : celle de l'onglet Bien si quelqu'un l'a posée, sinon la première pièce qui la dit (bail, puis diagnostics).
  const main = brut.analyse_pieces?.cases?.['bien.surface'];
  const surfaceMain = main?.valeur ? nombreDe(main.valeur) : null;
  if (surfaceMain) poser('surface', surfaceMain, 'Onglet Bien');
  else {
    const docs = brut.analyse_pieces?.docs || {};
    for (const type of ['bail', 'diagnostics']) {
      const lue = Object.values(docs).find((x) => x?.type === type && x.valeurs?.bien_surface?.valeur);
      const m2 = lue && (Number(lue.valeurs.bien_surface.donnees?.m2) || nombreDe(lue.valeurs.bien_surface.valeur));
      if (m2) { poser('surface', m2, type === 'bail' ? 'Bail' : 'Diagnostics'); break; }
    }
  }
  return { valeurs, sources };
}

/** Tout ce que l'écran montre : emplacements, pièces à ranger, grilles case par case, écarts. */
export function lireAnalyse(dealId) {
  const brut = dealDe(dealId);
  if (!brut) return null;
  const docs = documentsDe(brut);
  const lot = brut.lots?.[0]?.lot || {};
  // Le contexte des règles des grilles : la fiche, puis ce que le bail et les quittances ont donné.
  const ctx = { loyer_fiche: Number(val(lot.loyer_annuel_ht_hc)) || null, debut: null, a_quittances: docs.some((d) => d.type === 'quittances'), periodicite_quittances: null, tva_bail: null, provision_bail: null };
  const premiere = {};
  for (const gid of ['bail', 'quittances']) premiere[gid] = lireGrille(gid, brut, docs, ctx);
  const ech = donneesDe(premiere, 'bail', 'echeance');
  if (ech.debut) ctx.debut = Date.parse(String(ech.debut).split('/').reverse().join('-')) || null;
  ctx.tva_bail = ouiNonDe(donneesDe(premiere, 'bail', 'tva'));
  ctx.periodicite_quittances = ctx.a_quittances ? periodiciteDe(donneesDe(premiere, 'quittances', 'loyer_hc_ht')) || 'inconnu' : null;
  const grilles = Object.fromEntries(GRILLES_LUES.map(({ id }) => [id, lireGrille(id, brut, docs, ctx)]));
  const ecarts = croiser(grilles, lot, brut.analyse_pieces?.ecarts || {});
  const aVoir = (onglet) =>
    // Les croisements ne s'affichent plus (29 oct. 2026, Jules) : ils ne comptent plus.
    GRILLES_LUES.filter((g) => g.onglet === onglet).reduce((n, g) => n + grilles[g.id].lignes.filter((l) => l.statut === 'ia' || l.a_choisir || l.relue).length, 0);
  return {
    emplacements: TYPES.map((t) => ({ id: t.id, titre: t.titre, lue: !!t.grille, attendus: t.attendus, documents: docs.filter((d) => d.type === t.id) })),
    a_ranger: docs.filter((d) => !d.type),
    grilles: GRILLES_LUES.map(({ id, onglet }) => ({ ...grilles[id], onglet })),
    ecarts,
    simulateur: simulateurDesGrilles(grilles, brut, ecarts),
    a_voir: Object.fromEntries(['bail', 'quittances', 'copropriete', 'diagnostics'].map((o) => [o, aVoir(o)])),
    en_lecture: docs.filter((d) => ['en_attente', 'en_cours'].includes(d.extraction?.statut)).length,
    // Les cases tranchées de la grille Marché, calculée par l'écran à partir de la lecture du marché.
    cases_marche: Object.fromEntries(Object.entries(brut.analyse_pieces?.cases || {}).filter(([k]) => k.startsWith('marche.')).map(([k, v]) => [k.slice(7), v])),
  };
}

/**
 * Le geste de l'analyste sur une case : vérifier (la valeur montrée devient la sienne), corriger, dire
 * introuvable, retenir une pièce plutôt qu'une autre, noter, ou réinitialiser (retour à la lecture).
 */
export function deciderCase(dealId, grilleId, critereId, { action, valeur, source, note, main = false } = {}, user) {
  // L'onglet Bien a ses propres lignes (« bien.surface », « bien.vendeur »…) : modifiables comme les grilles.
  const grille = grilleDe(grilleId);
  // Bien et Marché (29 oct. 2026) ont leurs propres lignes, calculées ailleurs : toute ligne au bon format.
  const connue = grilleId === 'bien' || grilleId === 'marche' ? /^[a-z_]{2,40}$/.test(String(critereId)) : !!grille?.criteres.some((c) => c.id === critereId);
  if (!connue) return { ok: false, error: 'Case inconnue' };
  const cle = `${grilleId}.${critereId}`;
  const signe = { par: user?.email || null, le: new Date().toISOString() };
  let erreur = null;
  const fait = majEtat(dealId, (etat) => {
    const original = etat.cases[cle];
    const avant = original || {};
    switch (action) {
      case 'verifier': {
        const v = String(valeur ?? '').trim();
        if (!v) { erreur = 'Rien à vérifier : la case est vide.'; return false; }
        // Une valeur saisie à la main passe en OK (`main`, 29 oct. 2026, Jules) et reste de côté pour le tour suivant
        // de l'état ; valider la lecture garde celle d'avant.
        etat.cases[cle] = { ...avant, ...signe, statut: 'verifie', valeur: v.slice(0, 2000), valeur_main: main ? v.slice(0, 2000) : avant.statut === 'corrige' ? avant.valeur : avant.valeur_main || null };
        break;
      }
      case 'corriger': {
        const v = String(valeur ?? '').trim();
        if (!v) { erreur = 'La valeur corrigée est vide.'; return false; }
        etat.cases[cle] = { ...avant, ...signe, statut: 'corrige', valeur: v.slice(0, 2000) };
        break;
      }
      case 'introuvable':
        etat.cases[cle] = { ...avant, ...signe, statut: 'introuvable', valeur: null };
        break;
      case 'retenir':
        // Retenir une autre pièce rend la case à la lecture de cette pièce, non vérifiée.
        etat.cases[cle] = { note: avant.note || null, ...signe, statut: null, valeur: null, source: source || null };
        break;
      case 'noter': {
        const t = String(note ?? '').trim().slice(0, 2000);
        etat.cases[cle] = { ...avant, note: t || null, ...(Object.keys(avant).length ? {} : signe) };
        break;
      }
      case 'exclure': {
        // Une source décochée sur une ligne de Marché (30 oct. 2026, Jules) : elle reste affichée, grisée, et ne compte plus.
        const src = String(source || '').slice(0, 60);
        if (!src) { erreur = 'Source inconnue'; return false; }
        const liste = new Set(avant.exclues || []);
        if (liste.has(src)) liste.delete(src); else liste.add(src);
        etat.cases[cle] = { ...avant, exclues: [...liste] };
        break;
      }
      case 'reinitialiser': {
        // La valeur saisie à la main reste de côté : un clic de plus sur l'état la remet (29 oct. 2026, Jules).
        const main = avant.statut === 'corrige' ? avant.valeur : avant.valeur_main || null;
        if (avant.note || main) etat.cases[cle] = { note: avant.note || null, valeur_main: main, par: avant.par, le: avant.le };
        else delete etat.cases[cle];
        break;
      }
      default:
        erreur = 'Geste inconnu';
        return false;
    }
    retenirVersion(etat, cle, original, user);
  });
  if (erreur) return { ok: false, error: erreur };
  if (!fait) return { ok: false, error: 'Dossier introuvable' };
  return { ok: true };
}

// Les versions du dossier (29 oct. 2026, Jules : « retour en arrière ou en avant à la version ») : chaque geste sur
// une case garde la case d'avant et celle d'après ; Annuler remet l'une, Rétablir l'autre. Un geste nouveau efface
// ce qu'on pouvait rétablir. Gardées sur le dossier, partagées par l'équipe, les 200 dernières.
const VERSIONS_MAX = 200;
function retenirVersion(etat, cle, avant, user) {
  const apres = etat.cases[cle] ?? null;
  if (JSON.stringify(avant ?? null) === JSON.stringify(apres)) return;
  etat.versions = [...(etat.versions || []), { cle, avant: avant ?? null, apres, par: user?.email || null, le: new Date().toISOString() }].slice(-VERSIONS_MAX);
  etat.a_retablir = [];
}

function poserCase(etat, cle, contenu) {
  if (contenu) etat.cases[cle] = contenu;
  else delete etat.cases[cle];
}

/** Revenir d'une version (`sens` : 'annuler' ou 'retablir'). */
export function changerDeVersion(dealId, sens) {
  let rien = false;
  const fait = majEtat(dealId, (etat) => {
    const depuis = sens === 'retablir' ? (etat.a_retablir || []) : (etat.versions || []);
    const v = depuis.at(-1);
    if (!v) { rien = true; return false; }
    poserCase(etat, v.cle, sens === 'retablir' ? v.apres : v.avant);
    if (sens === 'retablir') { etat.a_retablir = depuis.slice(0, -1); etat.versions = [...(etat.versions || []), v]; }
    else { etat.versions = depuis.slice(0, -1); etat.a_retablir = [...(etat.a_retablir || []), v]; }
  });
  if (rien) return { ok: false, error: sens === 'retablir' ? 'Rien à rétablir.' : 'Rien à annuler.' };
  if (!fait) return { ok: false, error: 'Dossier introuvable' };
  return { ok: true };
}

/** Combien de versions on peut défaire et refaire. */
export function versionsDe(dealId) {
  const etat = dealDe(dealId)?.analyse_pieces || {};
  return { annuler: (etat.versions || []).length, retablir: (etat.a_retablir || []).length };
}

/** La valeur retenue d'un écart (`fiche`, `bail`, `quittances`, `kbis`), ou rien pour rouvrir. */
export function deciderEcart(dealId, cle, retenu, user) {
  const fait = majEtat(dealId, (etat) => {
    if (retenu) etat.ecarts[cle] = { retenu: String(retenu).slice(0, 40), par: user?.email || null, le: new Date().toISOString() };
    else delete etat.ecarts[cle];
  });
  return fait ? { ok: true } : { ok: false, error: 'Dossier introuvable' };
}

/** Les pièces à relire pour une case : celles de son emplacement. */
export function piecesDeLaGrille(dealId, grilleId) {
  const brut = dealDe(dealId);
  const types = TYPES.filter((t) => t.grille === grilleId).map((t) => t.id);
  return Object.entries(brut?.analyse_pieces?.docs || {}).filter(([, d]) => types.includes(d.type)).map(([id]) => id);
}

// --- Une question libre sur la pièce ouverte, comme dans Gemini ---------------------------------------------
export async function poserQuestion(dealId, docId, question, { uploadDir, user, lire = lireParDefaut } = {}) {
  const q = String(question || '').trim().slice(0, 1000);
  if (!q) return { ok: false, error: 'La question est vide.' };
  const { chargerPiece } = await import('./espace.js');
  const piece = chargerPiece(dealId, docId, uploadDir);
  if (!piece) return { ok: false, error: 'Pièce introuvable' };
  if (!piece.buffer) return { ok: false, error: "Le fichier n'est plus sur le serveur : déposez-le à nouveau." };
  const contexte = dealDe(dealId)?.analyse_pieces?.docs?.[docId]?.contexte || null;
  const prompt = [
    `Question d'un analyste sur ce document : « ${q} »`,
    contexte ? `Ce que l'analyste sait de cette pièce : « ${contexte} »` : null,
    `Réponds à partir de CE document seulement, en français, court et précis. Si le document ne répond pas, dis-le.`,
    `Donne la page où se lit la réponse (les marques « --- page N --- » la donnent quand elles sont là) et la phrase exacte du document qui la prouve, recopiée mot pour mot.`,
    `Réponds UNIQUEMENT en JSON : {"reponse": "...", "page": 3, "citation": "..."}`,
  ].filter(Boolean).join('\n');
  const { mesurer } = await import('../llm-couts.js');
  const { resultat } = await mesurer({ operation: 'question sur une pièce', par: user?.email || null, sur: dealId, libelle: piece.nom }, () =>
    lire({ buffer: piece.buffer, mimetype: piece.mimetype || 'application/pdf', nom: piece.nom, prompt })
  );
  const texte = String(resultat || '');
  let r = {};
  try { r = JSON.parse(texte.slice(texte.indexOf('{'), texte.lastIndexOf('}') + 1)); } catch { r = { reponse: texte.trim() }; }
  const page = Number(r.page) > 0 ? Math.round(Number(r.page)) : null;
  const citation = nettoyer(r.citation, 400) || null;
  const pages = await pagesDe(piece);
  const preuve = pages ? trouverPage(pages, citation, page) : { page, verifiee: null };
  const entree = { question: q, reponse: String(r.reponse || '').trim().slice(0, 4000) || "Pas de réponse.", citation, ...preuve, par: user?.email || null, le: new Date().toISOString() };
  majEtat(dealId, (etat) => {
    const d = etat.docs[docId] || (etat.docs[docId] = { type: null, valeurs: {}, questions: [] });
    d.questions = [entree, ...(d.questions || [])].slice(0, 20);
  });
  return { ok: true, ...entree };
}

// --- L'onglet Bien, nourri par les pièces ---------------------------------------------------------------------
const CATEGORIE_BIEN = { bail: 'Bail commercial', avenants: 'Avenants', taxe_fonciere: 'Taxe foncière', kbis: 'Kbis', diagnostics: 'Diagnostics', rcp: 'Règlement de copropriété', quittances: 'Quittances', pv_ag: "PV d'AG copro" };

/**
 * Les pièces lues, mises au format des lignes de la matrice que l'onglet Bien sait lire (server/deal/bien-analyse.js) :
 * une ligne par pièce, ses cellules adresse, surface, parties, taxe foncière, destination, procédures. Rien si
 * aucune pièce n'a encore été lue.
 */
export function lignesBienDesPieces(brut) {
  const docs = brut?.analyse_pieces?.docs || {};
  const sortie = [];
  for (const d of brut?.documents_espace || []) {
    const x = docs[d.id];
    if (!x?.type || !x.valeurs || x.extraction?.statut !== 'fait') continue;
    const v = (id) => (x.valeurs[id]?.valeur ? x.valeurs[id] : null);
    const cel = (c, texte = c?.valeur) => (c && texte ? { reponse: texte, page: c.page || null, citation: c.citation || null } : null);
    const cellules = {};
    const poser = (col, c) => { if (c) cellules[col] = c; };
    poser('adresse', cel(v('bien_adresse')) || cel(v('local')));
    const surf = v('bien_surface');
    poser('surface', surf ? cel(surf, surf.donnees?.m2 ? `${surf.donnees.m2} m² · ${surf.valeur}` : surf.valeur) : null);
    const parties = [v('bien_bailleur') && `Bailleur : ${v('bien_bailleur').valeur}`, v('bien_proprietaire') && `Propriétaire : ${v('bien_proprietaire').valeur}`, (x.type === 'bail' && v('parties')) && `Preneur : ${v('parties').donnees?.locataire || v('parties').valeur}`, x.type === 'kbis' && v('denomination') && `Preneur : ${v('denomination').valeur}${v('capital') ? `, capital ${v('capital').valeur}` : ''}`].filter(Boolean);
    const sourceParties = v('bien_bailleur') || v('bien_proprietaire') || v('parties') || v('denomination');
    poser('parties', parties.length ? cel(sourceParties, parties.join(' ; ')) : null);
    poser('taxe_fonciere', cel(v('montant')));
    poser('destination', cel(v('destination')));
    poser('procedures', cel(v('procedure')));
    poser('creation', cel(v('immatriculation')));
    if (Object.keys(cellules).length) sortie.push({ document_id: d.id, document_nom: d.nom, document_url: d.url, categorie: CATEGORIE_BIEN[x.type] || d.categorie || '', cellules });
  }
  return sortie;
}

