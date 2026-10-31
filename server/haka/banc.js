// Haka : le banc d'essai d'une compétence (17 oct. 2026, Jules). « Tester » lance
// un brouillon sur chaque dossier de test, en LECTURE SEULE : aucune écriture sur
// le dossier, rien dans la file, aucun mail. Le résultat est comparé à celui de
// la version publiée : verdict, points signalés, valeurs, coût, durée.
//
// Pour la pré-analyse, le banc rejoue le verdict avec les règles de l'en-tête
// (celles du brouillon, puis celles de la version publiée) sur les valeurs déjà
// lues et gardées sur le dossier : le code seul décide, donc aucun appel à un
// modèle, aucun coût. Une compétence sans règles chiffrées est testée sur son
// en-tête et la présence de ses dossiers ; le corps reste relu par Haka.

import { Records } from '../db.js';
import { prixFai } from '../deal/prix.js';
import { verdictPreanalyse } from './regles-preanalyse.js';

const val = (champ) => (champ && champ.absent === false ? champ.valeur : null);
const sans = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Le dossier d'un test : son identifiant, ou un morceau de son titre (« ADG Bordeaux »). */
export function dossierDeTest(ref) {
  const r = String(ref || '').trim();
  if (!r) return null;
  const deals = Records.list('Deal');
  const exact = deals.find((d) => d.deal_id === r);
  if (exact) return exact;
  const q = sans(r);
  return deals.find((d) => sans(d.nom || d.lots?.[0]?.lot?.titre?.valeur || '').includes(q)) || deals.find((d) => sans(JSON.stringify([d.nom, d.source?.nom_fichier, d.titre])).includes(q)) || null;
}

/** Pure : les valeurs que la pré-analyse lit sur un dossier (déjà extraites, avec leur source). */
export function valeursDuDossier(deal) {
  const entree = deal?.lots?.[0] || null;
  const lot = entree?.lot || {};
  const surface = Number(val(lot.surface_m2)) || null;
  const marche = entree?.comparaison_marche || null;
  const parM2 = (m) => (m?.median != null && surface ? m.median * surface : null);
  const v = {
    prix_fai: prixFai(lot),
    loyer_annuel_ht_hc: val(lot.loyer_annuel_ht_hc),
    occupe: val(lot.occupe),
    activite: val(lot.type_actif) || val(lot.activite) || null,
    enseigne: val(lot.locataire_nom),
    loyer_marche: parM2(marche?.loyer),
    prix_marche: parM2(marche?.prix),
  };
  const non = [];
  if (v.prix_fai == null) non.push('Prix');
  if (v.loyer_annuel_ht_hc == null) non.push('Loyer');
  if (v.occupe == null) non.push('Occupation');
  if (!surface) non.push('Surface');
  return { ...v, non_renseignees: non };
}

const resume = (r) => ({ verdict: r.verdict, motif: r.motif || null, points: (r.points || []).map((p) => p.phrase), rendement: r.rendement == null ? null : Math.round(r.rendement * 10) / 10 });

/**
 * Teste un en-tête (brouillon) contre la version publiée sur un dossier.
 * @returns {{dossier: string, titre: string|null, brouillon: object, publiee: object, ecarts: string[], cout_eur: number, duree_ms: number, erreur?: string}}
 */
export function essayer({ slug, brouillon, publiee, ref }) {
  const debut = Date.now();
  const deal = dossierDeTest(ref);
  if (!deal) return { dossier: ref, titre: null, erreur: `Dossier de test introuvable : « ${ref} »`, ecarts: [], cout_eur: 0, duree_ms: 0 };
  const titre = deal.nom || deal.lots?.[0]?.synthese?.titre || deal.deal_id;
  const base = { dossier: deal.deal_id, titre, cout_eur: 0 };
  if (slug !== 'pre-analyse-fiche') {
    const ecarts = [];
    if (publiee && brouillon.corps !== publiee.corps) ecarts.push('Le corps de la méthode a changé : il se juge à l\'exécution, par l\'Assistant KPartners.');
    return { ...base, brouillon: { verdict: null }, publiee: { verdict: null }, note: "Pas de règles chiffrées à rejouer : l'en-tête et le dossier sont valides.", ecarts, duree_ms: Date.now() - debut };
  }
  const valeurs = valeursDuDossier(deal);
  const b = resume(verdictPreanalyse(valeurs, brouillon.regles));
  const p = resume(verdictPreanalyse(valeurs, publiee?.regles));
  const ecarts = [];
  if (b.verdict !== p.verdict) ecarts.push(`Verdict : ${p.verdict} devient ${b.verdict}`);
  if ((b.motif || '') !== (p.motif || '') && b.verdict === p.verdict) ecarts.push(`Premier point : « ${p.motif || '—'} » devient « ${b.motif || '—'} »`);
  const nouveaux = b.points.filter((x) => !p.points.includes(x));
  const perdus = p.points.filter((x) => !b.points.includes(x));
  if (nouveaux.length) ecarts.push(`Points en plus : ${nouveaux.join(' ; ')}`);
  if (perdus.length) ecarts.push(`Points en moins : ${perdus.join(' ; ')}`);
  return { ...base, valeurs, brouillon: b, publiee: p, ecarts, duree_ms: Date.now() - debut };
}
