// Le teaser K Partners (28 oct. 2026, Jules : « la première chose qu'on voit quand on passe à mettre en vente : ça fait
// le teaser pour l'agent immobilier directement »). Une page A4, la même trame pour les sept classes d'actif ; ce qui
// change, ce sont les trois chiffres clés, le tableau, le libellé de la photo et la confidentialité.
//
// Tout est rempli par le CODE, depuis le mandat, l'avis de valeur et le dossier : aucun appel au modèle. Le titre ne
// porte jamais d'adresse ni de nom ; le sous-titre situe par la taille de la ville (API Géo) et la région. Le mandataire
// corrige ce qu'il veut ; ce qu'il a écrit n'est plus jamais recalculé.

import { Records, Meta } from './db.js';
import { estLocation, HONORAIRES_LOCATION, honorairesLocation } from '../src/lib/location.js';

const eur = (n) => (n == null || !Number.isFinite(Number(n)) ? null : `${Math.round(Number(n)).toLocaleString('fr-FR').replace(/[\u202f\u00a0]/g, ' ')} €`);
const pct = (n) => (n == null || !Number.isFinite(n) ? null : `${n.toFixed(1).replace('.', ',')} %`);
const m2 = (n) => (n ? `${Math.round(n).toLocaleString('fr-FR').replace(/[\u202f\u00a0]/g, ' ')} m²` : null);
const sans = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const nombre = (...vals) => { for (const v of vals) { const n = Number(String(v ?? '').replace(/[^\d.,]/g, '').replace(',', '.')); if (n > 0) return n; } return null; };
const AFAIRE = '[à compléter]';

/** Les sept classes d'actif : ce que l'acheteur regarde en premier. `etoile` : la tuile en pervenche. */
export const CLASSES = {
  murs_loues: { libelle: 'Murs loués', tableau: 'Le bien', photo: 'Façade', tuiles: ['prix', 'loyer', 'rendement'], etoile: 2, lignes: ['surface', 'locataire', 'bail'] },
  murs_libres: { libelle: 'Murs libres', tableau: 'Le bien', photo: 'Façade', tuiles: ['prix_m2', 'loyer_marche', 'rendement_potentiel'], etoile: 2, lignes: ['occupation', 'surface_vitrine', 'destination'] },
  fonds: { libelle: 'Fonds de commerce', tableau: 'Le fonds', photo: 'Boutique', tuiles: ['prix_multiple', 'ca', 'ebe'], etoile: 2, lignes: ['equipe', 'bail', 'motif'] },
  droit_au_bail: { libelle: 'Droit au bail', tableau: 'Le droit au bail', photo: 'Vitrine et rue', tuiles: ['prix_cession', 'loyer', 'surfaces'], etoile: 1, lignes: ['surfaces', 'destination', 'bail'] },
  bureaux: { libelle: 'Bureaux', tableau: 'Le bien', photo: 'Plateau', tuiles: ['prix', 'loyer', 'rendement'], etoile: 2, lignes: ['surface_divisibilite', 'locataire', 'performance'] },
  local_activite: { libelle: "Local d'activité", tableau: 'Le bien', photo: 'Bâtiment et cour', tuiles: ['prix', 'loyer', 'rendement'], etoile: 2, lignes: ['surface_terrain', 'hauteur_acces', 'locataire'] },
  entrepot: { libelle: 'Entrepôt logistique', tableau: 'Le bien', photo: 'Vue aérienne', tuiles: ['prix', 'loyer', 'rendement'], etoile: 2, lignes: ['surface', 'hauteur_quais', 'icpe', 'locataire'] },
  // Un local à louer (6 nov. 2026, Jules : « adapter tout le système à la location ») : le candidat regarde le loyer,
  // pas un prix ni un rendement. L'adresse reste cachée, comme en vente.
  a_louer: { libelle: 'Local à louer', tableau: 'Le local', photo: 'Façade', tuiles: ['loyer_demande', 'loyer_m2', 'surface_louee'], etoile: 0, lignes: ['destination', 'disponibilite', 'conditions'] },
};

const LIBELLES_TUILES = {
  prix: 'Prix FAI', loyer: 'Loyer HT HC / an', rendement: 'Rendement brut', prix_m2: 'Prix FAI', loyer_marche: 'Loyer de marché estimé / an',
  rendement_potentiel: 'Rendement potentiel', prix_multiple: 'Prix', ca: "Chiffre d'affaires", ebe: 'EBE', prix_cession: 'Prix de cession', surfaces: 'Surfaces',
  loyer_demande: 'Loyer HT HC / an', loyer_m2: 'Loyer / m² / an', surface_louee: 'Surface',
};
const LIBELLES_LIGNES = {
  surface: 'Surface', locataire: 'Locataire', bail: 'Bail', occupation: 'Occupation', surface_vitrine: 'Surface et vitrine', destination: 'Destination',
  equipe: 'Équipe', motif: 'Motif de la cession', surfaces: 'Surfaces', surface_divisibilite: 'Surface', performance: 'Performance',
  surface_terrain: 'Surface et terrain', hauteur_acces: 'Hauteur et accès', hauteur_quais: 'Hauteur et quais', icpe: 'ICPE',
  disponibilite: 'Disponibilité', conditions: 'Conditions',
};
export const CONFIDENTIALITE = "Document confidentiel. L'adresse du bien et l'identité du vendeur sont communiquées après signature d'un engagement de confidentialité.";
export const CONFIDENTIALITE_LOCATION = "Document confidentiel. L'adresse du local et l'identité du propriétaire sont communiquées après signature d'un engagement de confidentialité.";
export const CONFIDENTIALITE_FONDS = `${CONFIDENTIALITE} Merci de ne prévenir ni les salariés, ni les clients, ni les fournisseurs : une cession qui s'ébruite abîme le fonds.`;

/** Pure : la classe d'actif, d'après le type de l'avis, l'occupation et la désignation du mandat ; un bien à louer, d'office « Local à louer ». */
export function classeDe({ type_bien = null, occupe = null, designation = '', location = false } = {}) {
  if (location) return 'a_louer';
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

/**
 * Pure : les faits du bien, rassemblés depuis le mandat (q), l'avis (a) et son questionnaire (e). Un bien à louer (la
 * fiche, `biens.transaction`) n'a pas de prix : son loyer est le loyer demandé.
 */
export function faitsDuBien({ mandat = null, estimation = null, dossier = null, fiche = null } = {}) {
  const q = mandat?.questionnaire || {};
  const e = estimation?.questionnaire || {};
  const a = estimation?.avis || {};
  const location = estLocation(fiche);
  // Un bien importé (6 nov. 2026, banc d'import) n'a ni mandat ni avis de Klocka : son mandat importé et ce que le
  // mandataire a raconté (`biens.repris`) font le teaser. Le prix affiché est honoraires inclus quand ils sont à la
  // charge de l'acquéreur.
  const r = fiche?.biens?.repris || {};
  const mi = fiche?.mandat_importe || null;
  const faiImporte = !mandat && mi ? faiDuMandatImporte(mi) : null;
  const prix = location ? null : nombre(mandat?.prix, faiImporte, dossier?.prix, a.chiffres?.prix_affiche, a.chiffres?.valeur, r.prix);
  // En location, le loyer demandé : le mandat de location (`loyer`), sinon le loyer estimé par l'avis (sa valeur).
  const loyer = location ? nombre(fiche?.mandat_importe?.loyer_annuel, fiche?.biens?.repris?.loyer_annuel, fiche?.biens?.loyer_annuel, q.loyer_annuel, q.loyer, mandat?.loyer, dossier?.loyer_annuel, e.loyer_annuel_hc, a.chiffres?.loyer_marche, a.methodes === 'loyer' || a.chiffres?.loyer_m2 ? a.chiffres?.valeur : null) : nombre(e.loyer_annuel_hc, dossier?.loyer_annuel, r.loyer_annuel);
  const surface = nombre(q.bien_surface, e.surface_utile, dossier?.surface_m2, r.surface);
  const effet = String(e.date_effet || '').match(/(\d{4})/)?.[1] || null;
  const echeance = String(e.echeance || '').match(/(\d{4})/)?.[1] || null;
  const occupe = typeof q.bien_occupe === 'boolean' ? q.bien_occupe : typeof e.occupe === 'boolean' ? e.occupe : typeof a.occupe === 'boolean' ? a.occupe : r.loyer_annuel && !location ? true : null;
  // Ce que l'avis a écrit du local et de sa rue (7 nov. 2026) : la destination, la disponibilité, l'état, l'extraction,
  // les commerces voisins et les accès, pour remplir le local à louer et ses points forts sans rien inventer.
  const ligneAvis = (bloc, re) => (a[bloc]?.lignes || []).find((l) => re.test(String(l.mot || '')))?.texte || null;
  return {
    prix, loyer, surface, occupe, effet, echeance, location,
    destination: q.destination || ligneAvis('description', /destination/i) || null,
    disponibilite: q.disponibilite || ligneAvis('description', /disponib/i) || null,
    depot: q.depot_garantie || null,
    etat: ligneAvis('description', /^état/i),
    extraction: ligneAvis('description', /extraction/i),
    commerces_voisins: ligneAvis('emplacement', /commerces voisins/i),
    acces: ligneAvis('emplacement', /accès|transports/i),
    type_bien: e.type_bien || a.type_bien || fiche?.type_bien || null,
    designation: q.bien_designation || a.description?.resume || '',
    activite: e.activite_locataire || q.bien_locataire_activite || fiche?.activite || null,
    bail_type: e.bail_type || null,
    dpe: String(e.diagnostics || '').match(/\bDPE\s*:?\s*([A-G])\b/i)?.[1]?.toUpperCase() || null,
    loyer_marche: nombre(a.chiffres?.loyer_marche),
    emplacement: a.emplacement?.synthese || e.emplacement || '',
    ville: fiche?.ville && !a.bien?.ville ? fiche.ville : String(a.bien?.ville || q.bien_adresse || dossier?.adresse || '').replace(/^\d{5}\s*/, '').split(',').pop().trim() || null,
    mediane_m2: nombre(String(a.marche?.synthese || '').match(/médiane\s+([\d\s\u202f]+)\s*€/i)?.[1]),
    // La photo du local d'abord (le dossier, puis la fiche) ; la couverture de l'avis, souvent la ville, en dernier.
    photo: dossier?.photos?.[0]?.url || (fiche?.biens?.pieces || []).find((x) => x.nature === 'photos')?.url || a.photos?.couverture || null,
  };
}

/** Pure : le prix honoraires inclus d'un mandat importé (« 22 400 € » à la charge de l'acquéreur s'ajoutent au prix). */
export function faiDuMandatImporte(mi) {
  const prix = nombre(mi?.prix);
  if (!prix) return null;
  const h = String(mi.honoraires || '').replace(/[\u202f\u00a0]/g, ' ').match(/(\d[\d ]*(?:[.,]\d+)?)\s*(€|%)/);
  if (!h || /vendeur/i.test(mi.honoraires)) return prix;
  const n = Number(h[1].replace(/ /g, '').replace(',', '.'));
  return h[2] === '%' ? Math.round(prix * (1 + n / 100)) : prix + n;
}

/** Pure : les trois points forts, par règles, dans l'ordre de ce qui rassure un acheteur. */
export function pointsForts(f, classe, { annee = new Date().getFullYear() } = {}) {
  const p = [];
  const rendement = f.prix && f.loyer ? (f.loyer / f.prix) * 100 : null;
  if (/centre.?ville|hyper.?centre|n°\s*1|numero 1|emplacement n/i.test(f.emplacement)) p.push('Emplacement de centre-ville');
  // Le local à louer : ni bail en cours, ni rendement, ni prix au m² (6 nov. 2026).
  const aLouer = classe === 'a_louer';
  if (!aLouer && f.echeance && Number(f.echeance) - annee >= 3) p.push(`Bail en cours jusqu'en ${f.echeance}`);
  else if (!aLouer && f.effet && annee - Number(f.effet) >= 5) p.push(`Locataire en place depuis ${f.effet}`);
  if (!aLouer && rendement && rendement >= 6.5 && !['fonds', 'droit_au_bail'].includes(classe)) p.push(`Rendement de ${pct(rendement)}`);
  if (!aLouer && f.prix && f.surface && f.mediane_m2 && f.prix / f.surface < f.mediane_m2) p.push('Prix au m² sous la médiane du secteur');
  if (f.dpe && 'ABC'.includes(f.dpe)) p.push(`DPE ${f.dpe}`);
  if (f.activite && classe === 'murs_loues') p.push(`Activité établie : ${String(f.activite).toLowerCase()}`);
  // Le local à louer (7 nov. 2026) : ce que l'avis et le mandat disent du local et de sa rue.
  if (aLouer) {
    const voisins = Number(String(f.commerces_voisins || '').match(/(\d+)\s*commerces/)?.[1]);
    if (voisins >= 20) p.push(`Rue commerçante : ${f.commerces_voisins}`);
    if (/tous commerces/i.test(f.destination || '')) p.push('Destination tous commerces');
    if (/imm[ée]diat/i.test(f.disponibilite || '')) p.push('Disponible immédiatement');
    if (/^oui/i.test(f.extraction || '')) p.push('Extraction en place');
    if (/bon|excellent|neuf|refait/i.test(f.etat || '')) p.push(`Local en ${String(f.etat).toLowerCase()}`);
    if (f.acces && /bus|gare|m[ée]tro|tram|parking/i.test(f.acces)) p.push('Transports et parkings à proximité');
  }
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
    loyer_demande: eur(f.loyer), loyer_m2: f.loyer && f.surface ? `${eur(f.loyer / f.surface)} / m²` : null, surface_louee: m2(f.surface),
  };
  // Les conditions d'une location : le dépôt (dit par le mandataire) et les honoraires, à la charge du preneur.
  const honoraires = honorairesLocation(f.loyer);
  const depot = f.depot ? (/loyer/i.test(f.depot) ? f.depot : `${f.depot} de loyer`) : AFAIRE;
  const conditions = `Dépôt de garantie ${depot} ; honoraires ${Math.round(HONORAIRES_LOCATION.taux * 100)} % HT ${HONORAIRES_LOCATION.base}${honoraires ? ` (${eur(honoraires)} HT)` : ''}, à la charge du preneur`;
  const lignes = {
    surface: m2(f.surface), locataire: f.activite ? `${f.activite}${f.effet ? `, en place depuis ${f.effet}` : ''}` : null,
    bail: [f.bail_type, f.echeance ? `échéance ${f.echeance}` : null].filter(Boolean).join(', ') || null,
    occupation: f.occupe === false ? 'Libre de toute occupation' : null, surface_vitrine: m2(f.surface), destination: f.destination ? f.destination.charAt(0).toUpperCase() + f.destination.slice(1) : null,
    equipe: null, motif: null, surfaces: m2(f.surface), surface_divisibilite: m2(f.surface),
    performance: f.dpe ? `DPE ${f.dpe}` : null, surface_terrain: m2(f.surface), hauteur_acces: null, hauteur_quais: null, icpe: null,
    disponibilite: f.disponibilite ? (/imm[ée]diat/i.test(f.disponibilite) ? 'Disponible immédiatement' : `Disponible ${f.disponibilite}`) : null, conditions,
  };
  const lieu = /centre.?ville|hyper.?centre/i.test(f.emplacement) ? 'centre-ville' : classe === 'bureaux' ? "quartier d'affaires" : 'emplacement commerçant';
  const aLouer = { bureaux: 'Bureaux à louer', local_activite: "Local d'activité à louer" }[f.type_bien] || 'Local commercial à louer';
  const nature = { murs_loues: 'Murs commerciaux loués', murs_libres: 'Murs commerciaux libres', fonds: 'Fonds de commerce', droit_au_bail: 'Droit au bail', bureaux: 'Plateau de bureaux loué', local_activite: "Local d'activité loué", entrepot: 'Entrepôt logistique loué', a_louer: aLouer }[classe];
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
    loyer_demande: S('saisie', 'Fiche du bien', 'Le loyer annuel demandé, hors taxes et hors charges, sinon celui de l\'estimation.'),
    loyer_m2: S('calcul', 'Calcul', 'Le loyer annuel demandé divisé par la surface.', f.loyer && f.surface ? `${eur(f.loyer)} ÷ ${m2(f.surface)}` : null),
    surface_louee: S('saisie', 'Mandat et avis', 'La surface du mandat, sinon celle de l\'avis.'),
  };
  const parLigne = {
    surface: S('saisie', 'Mandat et avis', 'La surface du mandat, sinon celle de l\'avis.'),
    locataire: S('saisie', 'Avis de valeur', "L'activité du locataire et l'année d'effet du bail, jamais son nom."),
    bail: S('saisie', 'Avis de valeur', 'Le type de bail et son échéance, lus dans le bail ou dits par le mandataire.'),
    performance: S('saisie', 'Avis de valeur', 'Le DPE noté dans les diagnostics.'),
    occupation: S('saisie', 'Mandat signé', 'Le mandat dit le bien libre.'),
    conditions: S('calcul', 'Règle Klocka', `Les honoraires de location : ${Math.round(HONORAIRES_LOCATION.taux * 100)} % HT ${HONORAIRES_LOCATION.base}, à la charge du preneur, sauf ce que le mandat dit d'autre.`),
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
    photo: f.photo, photo_libelle: c.photo,
    tuiles: c.tuiles.map((k, i) => ({ cle: k, valeur: valeurs[k] || AFAIRE, libelle: LIBELLES_TUILES[k], etoile: i === c.etoile })),
    tableau_titre: c.tableau,
    lignes: c.lignes.map((k) => ({ cle: k, intitule: LIBELLES_LIGNES[k], detail: lignes[k] || AFAIRE })),
    points: pointsForts(f, classe),
    confidentialite: classe === 'fonds' ? CONFIDENTIALITE_FONDS : classe === 'a_louer' ? CONFIDENTIALITE_LOCATION : CONFIDENTIALITE,
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
    const c = await communeParNom(ville).catch(() => null);
    if (c?.population) return `${tailleDeVille(c.population)}${c.region?.nom ? ` (${c.region.nom})` : ''}`;
    // L'API Géo ne répond pas (7 nov. 2026, Jules : « le teaser ne se complète pas tout seul ») : le cache des communes
    // déjà résolues (server/deal/enrich.js) donne la même chose.
    const { resoudreCommune } = await import('./deal/enrich.js');
    const k = await resoudreCommune('', ville).catch(() => null);
    const taille = tailleDeVille(k?.population);
    return taille ? `${taille}${k.region ? ` (${typeof k.region === 'string' ? k.region : k.region.nom})` : ''}` : null;
  } catch { return null; }
}

/** Pure : le teaser gardé, ses seuls champs « [à compléter] » remplis par une composition neuve de la même classe. */
export function completerTeaser(deja, neuf) {
  const vide = (v) => String(v ?? '').includes(AFAIRE);
  const plein = (v) => v != null && !vide(v);
  const patch = {};
  const sources = { ...(deja.sources || {}) };
  for (const k of ['titre', 'sous_titre']) if (vide(deja[k]) && plein(neuf[k])) { patch[k] = neuf[k]; sources[k] = neuf.sources?.[k] || null; }
  if (!deja.photo && neuf.photo) { patch.photo = neuf.photo; sources.photo = neuf.sources?.photo || null; }
  const tuiles = (deja.tuiles || []).map((x, i) => { const n = neuf.tuiles?.find((y) => y.cle === x.cle); if (vide(x.valeur) && plein(n?.valeur)) { sources[`tuiles.${i}`] = neuf.sources?.[`tuiles.${neuf.tuiles.indexOf(n)}`] || null; return { ...x, valeur: n.valeur }; } return x; });
  const lignes = (deja.lignes || []).map((x, i) => { const n = neuf.lignes?.find((y) => y.cle === x.cle); if (vide(x.detail) && plein(n?.detail)) { sources[`lignes.${i}`] = neuf.sources?.[`lignes.${neuf.lignes.indexOf(n)}`] || null; return { ...x, detail: n.detail }; } return x; });
  const libres = (neuf.points || []).filter((p) => plein(p) && !(deja.points || []).includes(p));
  const points = (deja.points || []).map((p) => (vide(p) && libres.length ? libres.shift() : p));
  if (JSON.stringify(tuiles) !== JSON.stringify(deja.tuiles)) patch.tuiles = tuiles;
  if (JSON.stringify(lignes) !== JSON.stringify(deja.lignes)) patch.lignes = lignes;
  if (JSON.stringify(points) !== JSON.stringify(deja.points)) patch.points = points;
  return Object.keys(patch).length ? { ...deja, ...patch, sources } : deja;
}

/** Le teaser d'une mise en marché : composé une fois, puis gardé tel que le mandataire l'a corrigé. */
export async function teaserDe(marcheId, user, { refaire = false, classe = null } = {}) {
  const P = await import('./mandataire-portes.js');
  const m = P.lireMarche(marcheId, user);
  if (!m) return { ok: false, error: 'Commercialisation introuvable.' };
  const deja = m.teaser;
  const d = m.dossier_id ? Records.get('DossierMandataire', m.dossier_id) : null;
  const mandat = d?.mandat_id ? Records.get('MandatMandataire', d.mandat_id) : null;
  const estimation = d ? P.estimationDu(d) : null;
  const f = faitsDuBien({ mandat, estimation, dossier: d, fiche: d ? P.ficheDuDossier(d) : null });
  if (deja?.v && !refaire && !classe) {
    // Le teaser se complète seul (7 nov. 2026, Jules) : ce qui reste « [à compléter] » se remplit dès que le mandat,
    // l'avis ou l'API Géo le donnent ; ce que le mandataire ou l'assistant ont écrit ne bouge pas.
    if (!champsACompleter(deja).length) return { ok: true, teaser: deja, marche_id: m.id };
    const neuf = composer(f, deja.classe, { ville: /\[à compléter\]/.test(deja.sous_titre || '') ? await situer(f.ville) : null, ref: deja.ref });
    const complete = completerTeaser(deja, neuf);
    if (complete !== deja) Records.update('MiseEnMarche', m.id, { teaser: complete });
    return { ok: true, teaser: complete, marche_id: m.id };
  }
  const k = CLASSES[classe] ? classe : deja?.classe && !refaire ? deja.classe : classeDe({ type_bien: f.type_bien, occupe: f.occupe, designation: f.designation, location: f.location });
  const t = composer(f, k, { ville: await situer(f.ville), ref: deja?.ref || prochaineRef() });
  Records.update('MiseEnMarche', m.id, { teaser: { ...t, compose_le: new Date().toISOString() } });
  return { ok: true, teaser: Records.get('MiseEnMarche', m.id).teaser, marche_id: m.id };
}

const CHAMPS_LIBRES = ['titre', 'sous_titre', 'photo', 'photo_libelle', 'tableau_titre', 'confidentialite'];

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
  const qui = par === 'haka' ? { nature: 'ia', origine: 'Retouché par l\'Assistant KPartners', detail: 'À la demande du mandataire.' } : { nature: 'saisie', origine: 'Corrigé par le mandataire', detail: `Le ${new Date().toLocaleDateString('fr-FR')}.` };
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
export async function teaserPdf(marcheId, user, { base, co = false }) {
  const r = await teaserDe(marcheId, user);
  if (!r.ok) return r;
  // La fiche confrère (6 nov. 2026) : la même page, avec le bloc du co-courtage à la place de la confidentialité.
  if (co) {
    const c = await (await import('./co-courtage.js')).coDe(marcheId, user);
    if (!c.ok) return c;
  }
  const fs = await import('fs');
  const path = await import('path');
  const { CHEMIN_UPLOADS } = await import('./db.js');
  const { jetonImpression } = await import('./presentation-pdf.js');
  const { lancerNavigateur } = await import('./marche/navigateur.js');
  const nav = await lancerNavigateur('Le teaser en PDF');
  const contexte = await nav.newContext({ viewport: { width: 794, height: 1123 }, locale: 'fr-FR' });
  const dossier = path.join(CHEMIN_UPLOADS, 'teasers');
  const fichier = path.join(dossier, `${co ? 'confrere' : 'teaser'}-${String(r.marche_id).replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`);
  try {
    const page = await contexte.newPage();
    const jeton = jetonImpression(`${co ? 'co' : 'teaser'}:${r.marche_id}`);
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
  return { ok: true, fichier, nom: `${co ? 'Fiche confrère' : 'Teaser'} ${r.teaser.ref} · ${CLASSES[r.teaser.classe]?.libelle || 'K Partners'}.pdf` };
}

/** Le teaser lu par la page d'impression (jeton seul). */
export async function teaserParJeton(jeton) {
  const { cibleDuJeton } = await import('./presentation-pdf.js');
  const cible = cibleDuJeton(jeton);
  if (String(cible || '').startsWith('co:')) return (await import('./co-courtage.js')).coParJeton(jeton);
  if (!cible || !String(cible).startsWith('teaser:')) return null;
  const m = Records.get('MiseEnMarche', String(cible).slice(7));
  if (!m?.teaser) return null;
  return { teaser: m.teaser, signataire: signataireDe(m.mandataire_email) };
}

// --- Haka retouche le teaser (28 oct. 2026, Jules : « on modifie comme dans le mandat ou l'avis ») ---------------

export const OUTIL_TEASER = {
  name: 'modifier_teaser',
  description: "Retouche le teaser du bien en vente, ouvert à l'écran. Ne passe que ce qui change : titre, sous_titre, tuiles (index 0 à 2 et valeur), lignes (index et detail), points (les trois points forts), confidentialite, ou classe (murs_loues, murs_libres, fonds, droit_au_bail, bureaux, local_activite, entrepot, a_louer pour un local à louer : la page se recompose). Un local à louer n'a ni prix ni rendement : le loyer demandé, le loyer au m², la surface. Jamais d'adresse, de nom du vendeur ni de nom du locataire dans le titre, le sous-titre ou les points forts. N'invente aucun chiffre : un chiffre vient du mandat, de l'avis ou du mandataire.",
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

/** Pure : les champs du teaser encore « [à compléter] », nommés comme l'écran les montre. */
export function champsACompleter(t) {
  if (!t) return [];
  const a = (v) => String(v || '').includes(AFAIRE);
  return [
    a(t.titre) && 'le titre',
    a(t.sous_titre) && 'le sous-titre',
    ...(t.tuiles || []).filter((x) => a(x.valeur)).map((x) => `la tuile « ${x.libelle} »`),
    ...(t.lignes || []).filter((x) => a(x.detail)).map((x) => `la ligne « ${x.intitule} »`),
    ...(t.points || []).filter(a).map((_, i, l) => (l.length > 1 ? `un point fort (${i + 1})` : 'un point fort')),
  ].filter(Boolean);
}

/** Pure : ce que Haka sait du teaser, en tête de la conversation. */
export function cadreDuTeaser(t) {
  if (!t) return '';
  const reste = champsACompleter(t);
  return [
    `\n\nTEASER ouvert à l'écran (réf. ${t.ref}, classe ${CLASSES[t.classe]?.libelle || t.classe}) : le mandataire le relit et le corrige avec toi ; modifier_teaser l'écrit, la page se met à jour.`,
    `Titre : ${t.titre}. Sous-titre : ${t.sous_titre}.`,
    `Chiffres clés : ${t.tuiles.map((x, i) => `[${i}] ${x.libelle} = ${x.valeur}`).join(' ; ')}.`,
    `${t.tableau_titre} : ${t.lignes.map((l, i) => `[${i}] ${l.intitule} = ${l.detail}`).join(' ; ')}.`,
    `Points forts : ${t.points.join(' ; ')}.`,
    '« [à compléter] » marque ce qui manque : demande-le au mandataire plutôt que de l\'inventer. Dis en une phrase ce que tu as changé.',
    // 7 nov. 2026, Jules : « il dit que c'est complété mais non, il y a encore un champ à compléter ».
    reste.length ? `ENCORE À COMPLÉTER : ${reste.join(', ')}. Ne dis JAMAIS que le teaser est complet tant que cette liste n'est pas vide ; après une retouche, relis ce que l'outil rend (reste) et nomme ce qui manque encore.` : 'Tout est rempli : plus rien « à compléter ».',
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
  if (!r.ok) return r;
  const reste = champsACompleter(P.lireMarche(marche_id, user)?.teaser);
  return { ok: true, fait: `Teaser à jour : ${Object.keys(patch).join(', ')}.`, reste: reste.length ? `Encore à compléter : ${reste.join(', ')}. Dis-le, ne dis pas que tout est complet.` : 'Plus rien à compléter.' };
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
