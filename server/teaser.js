// Le teaser K Partners (28 oct. 2026, Jules : « la première chose qu'on voit quand on passe à mettre en vente : ça fait
// le teaser pour l'agent immobilier directement »). Une page A4, la même trame pour les sept classes d'actif ; ce qui
// change, ce sont les trois chiffres clés, le tableau, le filigrane, le libellé de la photo et la confidentialité.
//
// Tout est rempli par le CODE, depuis le mandat, l'avis de valeur et le dossier : aucun appel au modèle. Le titre ne
// porte jamais d'adresse ni de nom ; le sous-titre situe par la taille de la ville (API Géo) et la région. Le mandataire
// corrige ce qu'il veut ; ce qu'il a écrit n'est plus jamais recalculé.

import { Records, Meta } from './db.js';

const eur = (n) => (n == null || !Number.isFinite(Number(n)) ? null : `${Math.round(Number(n)).toLocaleString('fr-FR').replace(/[\u202f\u00a0]/g, ' ')} €`);
const pct = (n) => (n == null || !Number.isFinite(n) ? null : `${n.toFixed(1).replace('.', ',')} %`);
const m2 = (n) => (n ? `${Math.round(n).toLocaleString('fr-FR').replace(/[\u202f\u00a0]/g, ' ')} m²` : null);
const sans = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const nombre = (...vals) => { for (const v of vals) { const n = Number(String(v ?? '').replace(/[^\d.,]/g, '').replace(',', '.')); if (n > 0) return n; } return null; };
const AFAIRE = '[à compléter]';

/** Les sept classes d'actif : ce que l'acheteur regarde en premier. `etoile` : la tuile en pervenche. */
export const CLASSES = {
  murs_loues: { libelle: 'Murs loués', tableau: 'Le bien', photo: 'Façade', filigrane: 'rendement', tuiles: ['prix', 'loyer', 'rendement'], etoile: 2, lignes: ['surface', 'locataire', 'bail'] },
  murs_libres: { libelle: 'Murs libres', tableau: 'Le bien', photo: 'Façade', filigrane: 'rendement_potentiel', tuiles: ['prix_m2', 'loyer_marche', 'rendement_potentiel'], etoile: 2, lignes: ['occupation', 'surface_vitrine', 'destination'] },
  fonds: { libelle: 'Fonds de commerce', tableau: 'Le fonds', photo: 'Boutique', filigrane: 'multiple', tuiles: ['prix_multiple', 'ca', 'ebe'], etoile: 2, lignes: ['equipe', 'bail', 'motif'] },
  droit_au_bail: { libelle: 'Droit au bail', tableau: 'Le droit au bail', photo: 'Vitrine et rue', filigrane: 'n1', tuiles: ['prix_cession', 'loyer', 'surfaces'], etoile: 1, lignes: ['surfaces', 'destination', 'bail'] },
  bureaux: { libelle: 'Bureaux', tableau: 'Le bien', photo: 'Plateau', filigrane: 'rendement', tuiles: ['prix', 'loyer', 'rendement'], etoile: 2, lignes: ['surface_divisibilite', 'locataire', 'performance'] },
  local_activite: { libelle: "Local d'activité", tableau: 'Le bien', photo: 'Bâtiment et cour', filigrane: 'rendement', tuiles: ['prix', 'loyer', 'rendement'], etoile: 2, lignes: ['surface_terrain', 'hauteur_acces', 'locataire'] },
  entrepot: { libelle: 'Entrepôt logistique', tableau: 'Le bien', photo: 'Vue aérienne', filigrane: 'rendement', tuiles: ['prix', 'loyer', 'rendement'], etoile: 2, lignes: ['surface', 'hauteur_quais', 'icpe', 'locataire'] },
};

const LIBELLES_TUILES = {
  prix: 'Prix FAI', loyer: 'Loyer HT HC / an', rendement: 'Rendement brut', prix_m2: 'Prix FAI', loyer_marche: 'Loyer de marché estimé / an',
  rendement_potentiel: 'Rendement potentiel', prix_multiple: 'Prix', ca: "Chiffre d'affaires", ebe: 'EBE', prix_cession: 'Prix de cession', surfaces: 'Surfaces',
};
const LIBELLES_LIGNES = {
  surface: 'Surface', locataire: 'Locataire', bail: 'Bail', occupation: 'Occupation', surface_vitrine: 'Surface et vitrine', destination: 'Destination',
  equipe: 'Équipe', motif: 'Motif de la cession', surfaces: 'Surfaces', surface_divisibilite: 'Surface', performance: 'Performance',
  surface_terrain: 'Surface et terrain', hauteur_acces: 'Hauteur et accès', hauteur_quais: 'Hauteur et quais', icpe: 'ICPE',
};
export const CONFIDENTIALITE = "Document confidentiel. L'adresse du bien et l'identité du vendeur sont communiquées après signature d'un engagement de confidentialité.";
export const CONFIDENTIALITE_FONDS = `${CONFIDENTIALITE} Merci de ne prévenir ni les salariés, ni les clients, ni les fournisseurs : une cession qui s'ébruite abîme le fonds.`;

/** Pure : la classe d'actif, d'après le type de l'avis, l'occupation et la désignation du mandat. */
export function classeDe({ type_bien = null, occupe = null, designation = '' } = {}) {
  const t = sans(designation);
  if (/droit au bail/.test(t)) return 'droit_au_bail';
  if (/fonds de commerce|\bfonds\b/.test(t)) return 'fonds';
  if (/entrepot|logistique/.test(t)) return 'entrepot';
  if (type_bien === 'bureaux' || /\bbureaux?\b/.test(t)) return 'bureaux';
  if (type_bien === 'local_activite' || /activite/.test(t)) return 'local_activite';
  return occupe === false ? 'murs_libres' : 'murs_loues';
}

/** Pure : la taille de la ville, dite sans la nommer. */
export function tailleDeVille(population) {
  const p = Number(population) || 0;
  if (!p) return null;
  if (p >= 250000) return "d'une métropole";
  if (p >= 80000) return "d'une grande ville";
  if (p >= 20000) return "d'une ville moyenne";
  return "d'une petite ville";
}

/** Pure : les faits du bien, rassemblés depuis le mandat (q), l'avis (a) et son questionnaire (e). */
export function faitsDuBien({ mandat = null, estimation = null, dossier = null } = {}) {
  const q = mandat?.questionnaire || {};
  const e = estimation?.questionnaire || {};
  const a = estimation?.avis || {};
  const prix = nombre(mandat?.prix, dossier?.prix, a.chiffres?.prix_affiche, a.chiffres?.valeur);
  const loyer = nombre(e.loyer_annuel_hc, dossier?.loyer_annuel);
  const surface = nombre(q.bien_surface, e.surface_utile, dossier?.surface_m2);
  const effet = String(e.date_effet || '').match(/(\d{4})/)?.[1] || null;
  const echeance = String(e.echeance || '').match(/(\d{4})/)?.[1] || null;
  const occupe = typeof q.bien_occupe === 'boolean' ? q.bien_occupe : typeof e.occupe === 'boolean' ? e.occupe : typeof a.occupe === 'boolean' ? a.occupe : null;
  return {
    prix, loyer, surface, occupe, effet, echeance,
    type_bien: e.type_bien || a.type_bien || null,
    designation: q.bien_designation || a.description?.resume || '',
    activite: e.activite_locataire || q.bien_locataire_activite || null,
    bail_type: e.bail_type || null,
    dpe: String(e.diagnostics || '').match(/\bDPE\s*:?\s*([A-G])\b/i)?.[1]?.toUpperCase() || null,
    loyer_marche: nombre(a.chiffres?.loyer_marche),
    emplacement: a.emplacement?.synthese || e.emplacement || '',
    ville: String(a.bien?.ville || q.bien_adresse || dossier?.adresse || '').replace(/^\d{5}\s*/, '').split(',').pop().trim() || null,
    mediane_m2: nombre(String(a.marche?.synthese || '').match(/médiane\s+([\d\s\u202f]+)\s*€/i)?.[1]),
    photo: a.photos?.couverture || dossier?.photos?.[0]?.url || null,
  };
}

/** Pure : les trois points forts, par règles, dans l'ordre de ce qui rassure un acheteur. */
export function pointsForts(f, classe, { annee = new Date().getFullYear() } = {}) {
  const p = [];
  const rendement = f.prix && f.loyer ? (f.loyer / f.prix) * 100 : null;
  if (/centre.?ville|hyper.?centre|n°\s*1|numero 1|emplacement n/i.test(f.emplacement)) p.push('Emplacement de centre-ville');
  if (f.echeance && Number(f.echeance) - annee >= 3) p.push(`Bail en cours jusqu'en ${f.echeance}`);
  else if (f.effet && annee - Number(f.effet) >= 5) p.push(`Locataire en place depuis ${f.effet}`);
  if (rendement && rendement >= 6.5 && !['fonds', 'droit_au_bail'].includes(classe)) p.push(`Rendement de ${pct(rendement)}`);
  if (f.prix && f.surface && f.mediane_m2 && f.prix / f.surface < f.mediane_m2) p.push('Prix au m² sous la médiane du secteur');
  if (f.dpe && 'ABC'.includes(f.dpe)) p.push(`DPE ${f.dpe}`);
  if (f.activite && classe === 'murs_loues') p.push(`Activité établie : ${String(f.activite).toLowerCase()}`);
  while (p.length < 3) p.push(AFAIRE);
  return p.slice(0, 3);
}

/** Pure : le contenu du teaser pour une classe, depuis les faits. Ce qui manque reste « [à compléter] ». */
export function composer(f, classe, { ville = null, ref = 'KP-0000' } = {}) {
  const c = CLASSES[classe] || CLASSES.murs_loues;
  const rendement = f.prix && f.loyer ? (f.loyer / f.prix) * 100 : null;
  const potentiel = f.prix && f.loyer_marche ? (f.loyer_marche / f.prix) * 100 : null;
  const valeurs = {
    prix: eur(f.prix), loyer: eur(f.loyer), rendement: pct(rendement),
    prix_m2: f.prix ? `${eur(f.prix)}${f.surface ? ` · ${eur(f.prix / f.surface)}/m²` : ''}` : null,
    loyer_marche: eur(f.loyer_marche), rendement_potentiel: pct(potentiel),
    prix_multiple: null, ca: null, ebe: null, prix_cession: eur(f.prix), surfaces: m2(f.surface),
  };
  const lignes = {
    surface: m2(f.surface), locataire: f.activite ? `${f.activite}${f.effet ? `, en place depuis ${f.effet}` : ''}` : null,
    bail: [f.bail_type, f.echeance ? `échéance ${f.echeance}` : null].filter(Boolean).join(', ') || null,
    occupation: f.occupe === false ? 'Libre de toute occupation' : null, surface_vitrine: m2(f.surface), destination: null,
    equipe: null, motif: null, surfaces: m2(f.surface), surface_divisibilite: m2(f.surface),
    performance: f.dpe ? `DPE ${f.dpe}` : null, surface_terrain: m2(f.surface), hauteur_acces: null, hauteur_quais: null, icpe: null,
  };
  const lieu = /centre.?ville|hyper.?centre/i.test(f.emplacement) ? 'centre-ville' : classe === 'bureaux' ? "quartier d'affaires" : 'emplacement commerçant';
  const nature = { murs_loues: 'Murs commerciaux loués', murs_libres: 'Murs commerciaux libres', fonds: 'Fonds de commerce', droit_au_bail: 'Droit au bail', bureaux: 'Plateau de bureaux loué', local_activite: "Local d'activité loué", entrepot: 'Entrepôt logistique loué' }[classe];
  const filigrane = { rendement: pct(rendement), rendement_potentiel: pct(potentiel), multiple: '3×', n1: 'n°1' }[c.filigrane] || null;
  // D'où vient chaque champ (mode Sources, 28 oct. 2026) : le mandat, l'avis, un calcul, une règle, l'API Géo.
  const S = (nature, origine, detail, calcul) => ({ nature, origine, detail, ...(calcul ? { calcul } : {}) });
  const parTuile = {
    prix: S('saisie', 'Mandat signé', 'Le prix du mandat, honoraires inclus.'),
    loyer: S('saisie', 'Avis de valeur', 'Le loyer annuel hors charges et hors taxes, tel que le bail le donne.'),
    rendement: S('calcul', 'Calcul', 'Le loyer annuel divisé par le prix FAI.', f.prix && f.loyer ? `${eur(f.loyer)} ÷ ${eur(f.prix)} = ${pct(rendement)}` : null),
    prix_m2: S('calcul', 'Mandat et avis', 'Le prix du mandat, puis divisé par la surface.', f.prix && f.surface ? `${eur(f.prix)} ÷ ${m2(f.surface)}` : null),
    loyer_marche: S('calcul', 'Avis de valeur', 'Le loyer de marché retenu par l\'avis pour ce local.'),
    rendement_potentiel: S('calcul', 'Calcul', 'Le loyer de marché divisé par le prix FAI.', f.prix && f.loyer_marche ? `${eur(f.loyer_marche)} ÷ ${eur(f.prix)} = ${pct(potentiel)}` : null),
    prix_cession: S('saisie', 'Mandat signé', 'Le prix de cession du mandat.'),
    surfaces: S('saisie', 'Mandat et avis', 'La surface du mandat, sinon celle de l\'avis.'),
  };
  const parLigne = {
    surface: S('saisie', 'Mandat et avis', 'La surface du mandat, sinon celle de l\'avis.'),
    locataire: S('saisie', 'Avis de valeur', "L'activité du locataire et l'année d'effet du bail, jamais son nom."),
    bail: S('saisie', 'Avis de valeur', 'Le type de bail et son échéance, lus dans le bail ou dits par le mandataire.'),
    performance: S('saisie', 'Avis de valeur', 'Le DPE noté dans les diagnostics.'),
    occupation: S('saisie', 'Mandat signé', 'Le mandat dit le bien libre.'),
  };
  const sources = {
    titre: S('modele', 'Composé par Klocka', "Le type de bien et l'emplacement, lus dans l'avis de valeur. Jamais d'adresse ni de nom."),
    sous_titre: ville ? S('donnee', 'API Géo (geo.api.gouv.fr)', 'La population de la commune donne la taille de la ville, sans la nommer, et sa région.') : null,
    photo: f.photo ? S('saisie', "Photos du dossier", 'La photo de couverture de l\'avis, sinon la première photo du dossier.') : null,
  };
  c.tuiles.forEach((k, i) => { if (valeurs[k]) sources[`tuiles.${i}`] = parTuile[k] || null; });
  c.lignes.forEach((k, i) => { if (lignes[k]) sources[`lignes.${i}`] = parLigne[k] || S('saisie', 'Mandat et avis', ''); });
  pointsForts(f, classe).forEach((p, i) => { if (p !== AFAIRE) sources[`points.${i}`] = S('calcul', 'Règle Klocka', 'Un point fort tiré des faits du bien : emplacement, bail, rendement, prix au m², DPE ou activité.'); });
  return {
    v: 1, classe, ref, sources,
    titre: `${nature}, ${lieu}`,
    sous_titre: ville ? `${lieu.charAt(0).toUpperCase()}${lieu.slice(1)} ${ville}` : AFAIRE,
    filigrane,
    photo: f.photo, photo_libelle: c.photo,
    tuiles: c.tuiles.map((k, i) => ({ cle: k, valeur: valeurs[k] || AFAIRE, libelle: LIBELLES_TUILES[k], etoile: i === c.etoile })),
    tableau_titre: c.tableau,
    lignes: c.lignes.map((k) => ({ cle: k, intitule: LIBELLES_LIGNES[k], detail: lignes[k] || AFAIRE })),
    points: pointsForts(f, classe),
    confidentialite: classe === 'fonds' ? CONFIDENTIALITE_FONDS : CONFIDENTIALITE,
  };
}

/** Le prochain numéro de teaser, « KP-0007 ». */
function prochaineRef() {
  const n = Number(Meta.get('teaser-ref') || 0) + 1;
  Meta.set('teaser-ref', String(n));
  return `KP-${String(n).padStart(4, '0')}`;
}

/** La taille de la ville et sa région, depuis l'API Géo (gratuite) ; rien si elle ne répond pas. */
async function situer(ville) {
  if (!ville) return null;
  try {
    const { communeParNom } = await import('./chiffres-commune.js');
    const c = await communeParNom(ville);
    const taille = tailleDeVille(c?.population);
    return taille ? `${taille}${c.region?.nom ? ` (${c.region.nom})` : ''}` : null;
  } catch { return null; }
}

/** Le teaser d'une mise en marché : composé une fois, puis gardé tel que le mandataire l'a corrigé. */
export async function teaserDe(marcheId, user, { refaire = false, classe = null } = {}) {
  const P = await import('./mandataire-portes.js');
  const m = P.lireMarche(marcheId, user);
  if (!m) return { ok: false, error: 'Commercialisation introuvable.' };
  const deja = m.teaser;
  if (deja?.v && !refaire && !classe) return { ok: true, teaser: deja, marche_id: m.id };
  const d = m.dossier_id ? Records.get('DossierMandataire', m.dossier_id) : null;
  const mandat = d?.mandat_id ? Records.get('MandatMandataire', d.mandat_id) : null;
  const estimation = d ? P.estimationDu(d) : null;
  const f = faitsDuBien({ mandat, estimation, dossier: d });
  const k = CLASSES[classe] ? classe : deja?.classe && !refaire ? deja.classe : classeDe({ type_bien: f.type_bien, occupe: f.occupe, designation: f.designation });
  const t = composer(f, k, { ville: await situer(f.ville), ref: deja?.ref || prochaineRef() });
  Records.update('MiseEnMarche', m.id, { teaser: { ...t, compose_le: new Date().toISOString() } });
  return { ok: true, teaser: Records.get('MiseEnMarche', m.id).teaser, marche_id: m.id };
}

const CHAMPS_LIBRES = ['titre', 'sous_titre', 'filigrane', 'photo', 'photo_libelle', 'tableau_titre', 'confidentialite'];

/** Le mandataire corrige : un champ texte, une tuile, une ligne, un point fort. */
export async function modifierTeaser(marcheId, user, patch = {}, { par = 'mandataire' } = {}) {
  const P = await import('./mandataire-portes.js');
  const m = P.lireMarche(marcheId, user);
  if (!m?.teaser) return { ok: false, error: 'Le teaser n\'est pas encore composé.' };
  const t = { ...m.teaser };
  const court = (x, n = 200) => String(x ?? '').slice(0, n);
  for (const k of CHAMPS_LIBRES) if (k in patch) t[k] = court(patch[k], k === 'confidentialite' ? 600 : 200);
  if (Array.isArray(patch.tuiles)) t.tuiles = t.tuiles.map((x, i) => (patch.tuiles[i] ? { ...x, valeur: court(patch.tuiles[i].valeur ?? x.valeur, 60), libelle: court(patch.tuiles[i].libelle ?? x.libelle, 60) } : x));
  if (Array.isArray(patch.lignes)) t.lignes = patch.lignes.slice(0, 6).map((x) => ({ cle: x.cle || null, intitule: court(x.intitule, 40), detail: court(x.detail, 160) })).filter((x) => x.intitule || x.detail);
  if (Array.isArray(patch.points)) t.points = patch.points.slice(0, 3).map((x) => court(x, 80));
  // La mise en forme d'un élément (panneau de l'éditeur, comme l'avis) : un objet par chemin, null l'efface.
  for (const k of ['styles', 'positions']) {
    if (!patch[k] || typeof patch[k] !== 'object') continue;
    const suite = { ...(t[k] || {}) };
    for (const [chemin, v] of Object.entries(patch[k]).slice(0, 40)) {
      if (v === null) delete suite[chemin];
      else if (typeof v === 'object') suite[String(chemin).slice(0, 60)] = Object.fromEntries(Object.entries(v).slice(0, 30).filter(([, x]) => ['string', 'number', 'boolean'].includes(typeof x)));
    }
    t[k] = suite;
  }
  // Ce qui a changé prend sa nouvelle source : le mandataire, ou Haka à sa demande.
  const avant = m.teaser;
  const qui = par === 'haka' ? { nature: 'ia', origine: 'Retouché par Haka', detail: 'À la demande du mandataire.' } : { nature: 'saisie', origine: 'Corrigé par le mandataire', detail: `Le ${new Date().toLocaleDateString('fr-FR')}.` };
  const sources = { ...(avant.sources || {}) };
  for (const k of [...CHAMPS_LIBRES]) if (k in patch && patch[k] !== avant[k]) sources[k] = qui;
  (t.tuiles || []).forEach((x, i) => { if (x.valeur !== avant.tuiles?.[i]?.valeur) sources[`tuiles.${i}`] = qui; });
  (t.lignes || []).forEach((x, i) => { if (x.detail !== avant.lignes?.[i]?.detail) sources[`lignes.${i}`] = qui; });
  (t.points || []).forEach((x, i) => { if (x !== avant.points?.[i]) sources[`points.${i}`] = qui; });
  t.sources = sources;
  t.modifie_le = new Date().toISOString();
  Records.update('MiseEnMarche', m.id, { teaser: t });
  return { ok: true, teaser: t };
}

/** Le mandataire du teaser, pour le pied de page. */
export function signataireDe(email) {
  const u = Records.list('User').find((x) => String(x.email || '').toLowerCase() === String(email || '').toLowerCase());
  return { nom: u?.full_name || String(email || '').split('@')[0], email, telephone: u?.telephone || u?.phone || null };
}

/** Le teaser en PDF, imprimé par le navigateur du serveur sur la page d'impression (jeton de deux minutes). */
export async function teaserPdf(marcheId, user, { base }) {
  const r = await teaserDe(marcheId, user);
  if (!r.ok) return r;
  const fs = await import('fs');
  const path = await import('path');
  const { CHEMIN_UPLOADS } = await import('./db.js');
  const { jetonImpression } = await import('./presentation-pdf.js');
  const { lancerNavigateur } = await import('./marche/navigateur.js');
  const nav = await lancerNavigateur('Le teaser en PDF');
  const contexte = await nav.newContext({ viewport: { width: 794, height: 1123 }, locale: 'fr-FR' });
  const dossier = path.join(CHEMIN_UPLOADS, 'teasers');
  const fichier = path.join(dossier, `teaser-${String(r.marche_id).replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`);
  try {
    const page = await contexte.newPage();
    const jeton = jetonImpression(`teaser:${r.marche_id}`);
    await page.setExtraHTTPHeaders({ 'X-Klocka-Impression': jeton });
    await page.goto(`${base}/ImpressionTeaser?jeton=${jeton}`, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForFunction('window.__impressionPrete === true || !!window.__impressionErreur', null, { timeout: 60000 });
    const erreur = await page.evaluate('window.__impressionErreur || null');
    if (erreur) return { ok: false, error: `La page d'impression n'a pas pu s'ouvrir : ${erreur}` };
    await page.emulateMedia({ media: 'print' });
    const pdf = await page.pdf({ format: 'A4', printBackground: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
    fs.mkdirSync(dossier, { recursive: true });
    fs.writeFileSync(fichier, pdf);
  } finally {
    await contexte.close().catch(() => {});
  }
  return { ok: true, fichier, nom: `Teaser ${r.teaser.ref} · ${CLASSES[r.teaser.classe]?.libelle || 'K Partners'}.pdf` };
}

/** Le teaser lu par la page d'impression (jeton seul). */
export async function teaserParJeton(jeton) {
  const { cibleDuJeton } = await import('./presentation-pdf.js');
  const cible = cibleDuJeton(jeton);
  if (!cible || !String(cible).startsWith('teaser:')) return null;
  const m = Records.get('MiseEnMarche', String(cible).slice(7));
  if (!m?.teaser) return null;
  return { teaser: m.teaser, signataire: signataireDe(m.mandataire_email) };
}

// --- Haka retouche le teaser (28 oct. 2026, Jules : « on modifie comme dans le mandat ou l'avis ») ---------------

export const OUTIL_TEASER = {
  name: 'modifier_teaser',
  description: "Retouche le teaser du bien en vente, ouvert à l'écran. Ne passe que ce qui change : titre, sous_titre, tuiles (index 0 à 2 et valeur), lignes (index et detail), points (les trois points forts), confidentialite, ou classe (murs_loues, murs_libres, fonds, droit_au_bail, bureaux, local_activite, entrepot : la page se recompose). Jamais d'adresse, de nom du vendeur ni de nom du locataire dans le titre, le sous-titre ou les points forts. N'invente aucun chiffre : un chiffre vient du mandat, de l'avis ou du mandataire.",
  input_schema: {
    type: 'object',
    properties: {
      titre: { type: 'string' }, sous_titre: { type: 'string' }, confidentialite: { type: 'string' },
      classe: { type: 'string', enum: Object.keys(CLASSES) },
      tuiles: { type: 'array', items: { type: 'object', properties: { index: { type: 'integer' }, valeur: { type: 'string' } }, required: ['index', 'valeur'] } },
      lignes: { type: 'array', items: { type: 'object', properties: { index: { type: 'integer' }, detail: { type: 'string' } }, required: ['index', 'detail'] } },
      points: { type: 'array', items: { type: 'string' }, maxItems: 3 },
    },
  },
};

/** Pure : ce que Haka sait du teaser, en tête de la conversation. */
export function cadreDuTeaser(t) {
  if (!t) return '';
  return [
    `\n\nTEASER ouvert à l'écran (réf. ${t.ref}, classe ${CLASSES[t.classe]?.libelle || t.classe}) : le mandataire le relit et le corrige avec toi ; modifier_teaser l'écrit, la page se met à jour.`,
    `Titre : ${t.titre}. Sous-titre : ${t.sous_titre}.`,
    `Chiffres clés : ${t.tuiles.map((x, i) => `[${i}] ${x.libelle} = ${x.valeur}`).join(' ; ')}.`,
    `${t.tableau_titre} : ${t.lignes.map((l, i) => `[${i}] ${l.intitule} = ${l.detail}`).join(' ; ')}.`,
    `Points forts : ${t.points.join(' ; ')}.`,
    '« [à compléter] » marque ce qui manque : demande-le au mandataire plutôt que de l\'inventer. Dis en une phrase ce que tu as changé.',
  ].join('\n');
}

/** Haka applique sa retouche au teaser du bien en vente. */
export async function executerOutilTeaser(appel, user, { marche_id = null } = {}) {
  if (!marche_id) return { ok: false, error: "Aucun bien en vente ouvert à l'écran." };
  const input = appel.input || {};
  if (input.classe) {
    const r = await teaserDe(marche_id, user, { classe: input.classe });
    if (!r.ok) return r;
  }
  const P = await import('./mandataire-portes.js');
  const t = P.lireMarche(marche_id, user)?.teaser;
  if (!t) return { ok: false, error: "Le teaser n'est pas encore composé." };
  const patch = {};
  for (const k of ['titre', 'sous_titre', 'confidentialite']) if (input[k]) patch[k] = input[k];
  if (Array.isArray(input.tuiles)) patch.tuiles = t.tuiles.map((x, i) => { const n = input.tuiles.find((y) => y.index === i); return n ? { ...x, valeur: n.valeur } : x; });
  if (Array.isArray(input.lignes)) patch.lignes = t.lignes.map((x, i) => { const n = input.lignes.find((y) => y.index === i); return n ? { ...x, detail: n.detail } : x; });
  if (Array.isArray(input.points) && input.points.length) patch.points = [...input.points, ...t.points].slice(0, 3);
  if (!Object.keys(patch).length) return { ok: true, fait: input.classe ? `Teaser recomposé en ${CLASSES[input.classe].libelle}.` : 'Rien à changer.' };
  const r = await modifierTeaser(marche_id, user, patch, { par: 'haka' });
  return r.ok ? { ok: true, fait: `Teaser à jour : ${Object.keys(patch).join(', ')}.` } : r;
}

/** Le mandataire valide le teaser : la Commercialisation est faite, on passe aux offres (28 oct. 2026, Jules). */
export async function validerTeaser(marcheId, user, { annuler = false } = {}) {
  const P = await import('./mandataire-portes.js');
  const m = P.lireMarche(marcheId, user);
  if (!m?.teaser) return { ok: false, error: "Le teaser n'est pas encore composé." };
  const t = { ...m.teaser, valide_le: annuler ? null : new Date().toISOString() };
  Records.update('MiseEnMarche', m.id, { teaser: t });
  return { ok: true, teaser: t };
}
