// Les outils propres à AK qui vont au-delà de la plateforme : le couperet de
// la renta, la recherche de biens, la lecture d'une pièce jointe, ALX, le
// brouillon au propriétaire. Chaque outil est du code ordinaire ; le modèle
// choisit, le code fait. Les fonctions pures sont testées sans réseau.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Records } from '../db.js';

const ici = path.dirname(fileURLToPath(import.meta.url));
export const SEUILS = JSON.parse(fs.readFileSync(path.join(ici, 'seuils.json'), 'utf8'));

const val = (x) => (x && typeof x === 'object' && 'valeur' in x ? x.valeur : x);
const nombre = (x) => { const n = Number(val(x)); return Number.isFinite(n) && n > 0 ? n : null; };
const titreDeal = (d) => d?.nom || d?.lots?.[0]?.synthese?.titre || d?.source?.nom_fichier || d?.deal_id;

/** La date de fin d'un bail, lue dans ce qu'on a écrit : « 06/07/2034 », « 2028-01-31 », « janvier 2028 ». Pure. */
export function finDeBail(texte) {
  const t = String(val(texte) || '').trim();
  if (!t) return null;
  let m = t.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
  m = t.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  const MOIS = ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre'];
  const bas = t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  m = bas.match(new RegExp(`(${MOIS.join('|')})\\s+(\\d{4})`));
  if (m) return new Date(Date.UTC(+m[2], MOIS.indexOf(m[1]) + 1, 0));
  m = bas.match(/\b(20\d{2})\b/);
  if (m) return new Date(Date.UTC(+m[1], 11, 31));
  return null;
}

const cran = (valeur, seuils, plusEstMieux = true) => {
  if (valeur == null) return null;
  if (plusEstMieux) return valeur >= seuils.tourne ? 'tourne' : valeur <= seuils.dead ? 'dead' : 'limite';
  return valeur <= seuils.tourne ? 'tourne' : valeur >= seuils.dead ? 'dead' : 'limite';
};

/**
 * Le couperet : ça tourne, c'est limite, ou c'est dead. Pure.
 * @param {{prix_fai:number, loyer:number, bail_fin?:Date|null, ca?:number|null, honoraires_inclus?:boolean, honoraires?:number|null}} b
 * @param {Date} [aujourdhui]
 */
export function couperet(b, aujourdhui = new Date(), seuils = SEUILS) {
  const prix = nombre(b.prix_fai); const loyer = nombre(b.loyer);
  if (!prix || !loyer) return { verdict: null, motif: !prix ? 'prix inconnu' : 'loyer inconnu' };
  const honoraires = b.honoraires_inclus === false && nombre(b.honoraires) ? nombre(b.honoraires) : 0;
  const aem = Math.round((prix + honoraires) * (1 + seuils.frais_acquisition_pct / 100));
  const rendement = Math.round((loyer / aem) * 10000) / 100;
  const rendementFai = Math.round((loyer / prix) * 10000) / 100;
  const bailAns = b.bail_fin ? Math.round(((b.bail_fin - aujourdhui) / (365.25 * 86400000)) * 10) / 10 : null;
  const effort = nombre(b.ca) ? Math.round((loyer / nombre(b.ca)) * 1000) / 10 : null;
  const crans = {
    rendement: cran(rendement, seuils.rendement_aem),
    bail: cran(bailAns, seuils.bail_restant_ans),
    effort: cran(effort, seuils.taux_effort_pct, false),
  };
  const notes = Object.values(crans).filter(Boolean);
  const verdict = notes.includes('dead') ? 'dead' : notes.includes('limite') ? 'limite' : 'tourne';
  const raisons = [];
  raisons.push(`rendement AEM ${String(rendement).replace('.', ',')} % (${String(rendementFai).replace('.', ',')} % FAI)${crans.rendement === 'tourne' ? '' : crans.rendement === 'dead' ? ', trop bas' : ', juste'}`);
  if (bailAns != null) raisons.push(`bail restant ${String(bailAns).replace('.', ',')} an${bailAns > 1 ? 's' : ''}${crans.bail === 'dead' ? ', trop court' : crans.bail === 'limite' ? ', court' : ''}`);
  if (effort != null) raisons.push(`taux d'effort ${String(effort).replace('.', ',')} %${crans.effort === 'dead' ? ', le locataire tient pas' : crans.effort === 'limite' ? ', tendu' : ''}`);
  return { verdict, aem, rendement_aem: rendement, rendement_fai: rendementFai, bail_restant_ans: bailAns, taux_effort: effort, crans, raisons, seuils: { rendement_aem: seuils.rendement_aem, bail_restant_ans: seuils.bail_restant_ans, taux_effort_pct: seuils.taux_effort_pct } };
}

/** Le couperet d'un dossier ou d'un projet de la plateforme. */
export function verifierRenta({ deal_id = null, projet_id = null }) {
  if (deal_id) {
    const deal = Records.findBy('Deal', 'deal_id', deal_id);
    if (!deal) return { ok: false, error: 'Dossier introuvable.' };
    const l = deal.lots?.[0]?.lot || {};
    const r = couperet({ prix_fai: val(l.prix_fai), loyer: val(l.loyer_annuel_ht_hc), bail_fin: finDeBail(l.bail_echeance), honoraires_inclus: val(l.honoraires_inclus), honoraires: val(l.montant_honoraires), ca: val(l.chiffre_affaires) ?? val(l.ca_ht) });
    return { ok: true, titre: titreDeal(deal), ...r };
  }
  if (projet_id) {
    const p = Records.get('Project', projet_id);
    if (!p) return { ok: false, error: 'Projet introuvable.' };
    const r = couperet({ prix_fai: p.prix_acquisition, loyer: p.loyer_annuel_ht, bail_fin: finDeBail(p.echeance_bail) });
    return { ok: true, titre: p.titre, ...r };
  }
  return { ok: false, error: 'Il faut un dossier ou un projet.' };
}

const norme = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * Les biens de la plateforme qui répondent à des critères : dossiers de
 * préanalyse et projets, avec ce qu'on sait d'eux. Pure sur ses listes.
 */
export function chercherBiens(criteres = {}, { deals = Records.list('Deal'), projets = Records.list('Project') } = {}, aujourdhui = new Date()) {
  const c = criteres;
  const lignes = [];
  for (const d of deals) {
    if (d.archived || d.test) continue;
    const l = d.lots?.[0]?.lot || {};
    const adresse = val(l.adresse) || {};
    lignes.push({ genre: 'dossier', id: d.deal_id, titre: titreDeal(d), ville: adresse.ville || d.lots?.[0]?.enrichissement?.commune?.nom || '', prix: nombre(l.prix_fai), loyer: nombre(l.loyer_annuel_ht_hc), surface: nombre(l.surface_m2), activite: val(l.locataire_activite) || '', bail_fin: finDeBail(l.bail_echeance) });
  }
  for (const p of projets) {
    if (p.archived) continue;
    lignes.push({ genre: 'projet', id: p.id, titre: p.titre, ville: p.ville_secteur_champ1 || '', prix: nombre(p.prix_acquisition), loyer: nombre(p.loyer_annuel_ht), surface: nombre(p.surface_m2), activite: p.activite_locataire || '', bail_fin: finDeBail(p.echeance_bail) });
  }
  const ans = (x) => (x.bail_fin ? (x.bail_fin - aujourdhui) / (365.25 * 86400000) : null);
  return lignes
    .map((x) => ({ ...x, rendement: x.prix && x.loyer ? Math.round((x.loyer / x.prix) * 10000) / 100 : null, bail_restant_ans: ans(x) != null ? Math.round(ans(x) * 10) / 10 : null }))
    .filter((x) => !c.ville || norme(x.ville).includes(norme(c.ville)) || norme(x.titre).includes(norme(c.ville)))
    .filter((x) => !c.prix_max || (x.prix != null && x.prix <= c.prix_max))
    .filter((x) => !c.prix_min || (x.prix != null && x.prix >= c.prix_min))
    .filter((x) => !c.rendement_min || (x.rendement != null && x.rendement >= c.rendement_min))
    .filter((x) => !c.bail_min_ans || (x.bail_restant_ans != null && x.bail_restant_ans >= c.bail_min_ans))
    .filter((x) => !c.surface_min || (x.surface != null && x.surface >= c.surface_min))
    .filter((x) => !c.activite || norme(x.activite).includes(norme(c.activite)))
    .map(({ bail_fin, ...x }) => ({ ...x, bail_fin: bail_fin ? bail_fin.toISOString().slice(0, 10) : null }))
    .slice(0, 12);
}

/** Le texte d'une pièce jointe, pour la résumer sans rien créer. */
export async function lirePiece(chemin) {
  const buffer = fs.readFileSync(chemin);
  if (/\.pdf$/i.test(chemin)) {
    const { coucheTexteDuPdf } = await import('../deal/ingest.js');
    const lu = await coucheTexteDuPdf(buffer);
    if (!lu?.texte) return { ok: false, error: 'PDF sans texte lisible (un scan ?).' };
    return { ok: true, pages: lu.pages, texte: lu.texte.slice(0, 12000), tronque: lu.texte.length > 12000 };
  }
  if (/\.(txt|md|csv|eml)$/i.test(chemin)) return { ok: true, texte: buffer.toString('utf8').slice(0, 12000) };
  return { ok: false, error: 'Je ne sais lire que les PDF et les fichiers texte.' };
}

/** Les cibles ALX qui ressemblent à ce qu'on cherche : enseigne, adresse, ville. */
export function chercherCibles(recherche) {
  const mots = norme(recherche).split(/\s+/).filter((m) => m.length > 1);
  if (!mots.length) return [];
  const villes = new Map(Records.list('Ville').map((v) => [v.id, v.nom]));
  return Records.list('Cible')
    .map((c) => ({ id: c.id, enseigne: c.enseigne || null, adresse: c.adresse, ville: villes.get(c.ville_id) || '', pile: c.pile, classe: c.classe ?? null, proprietaire: c.proprietaire?.choix?.nom || c.foncier?.choix?.nom || null }))
    .filter((c) => { const t = norme(`${c.enseigne} ${c.adresse} ${c.ville}`); return mots.every((m) => t.includes(m)); })
    .slice(0, 8);
}

/** Lance la prospection ALX d'une ville, en tâche de fond. */
export async function lancerAlx({ ville, code_postal = null, classes = null, user = null }) {
  const { creerVille, listerVillesLeger } = await import('../alx/index.js');
  const { lancer } = await import('../alx/parcours.js');
  const existante = listerVillesLeger().find((v) => norme(v.nom) === norme(ville));
  let id = existante?.id;
  if (!id) {
    const r = creerVille({ nom: ville, code_postal, user });
    if (!r.ok) return r;
    id = r.ville.id;
  }
  const r = lancer(id, { user, tout: true, classes: Array.isArray(classes) && classes.length ? classes : null });
  if (!r.ok) return r;
  return { ok: true, ville_id: id, nom: r.ville.nom };
}
