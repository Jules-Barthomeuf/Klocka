// L'onglet Bien du module d'analyse (spec du 17 oct. 2026, Jules ; maquette du 18) : une ligne par
// information, la valeur retenue, ses sources en pastilles (document et page, ou calcul), et un statut :
// Info, Signalé, Bloquant, OK, ou « Non trouvé » avec les sources consultées. Calculé par le code sur la
// fiche commerciale et ce que la lecture des pièces a relevé (la matrice) ; aucun appel au modèle.
// Les sources publiques (Pappers, BODACC, Google Maps) ne sont pas encore branchées : quand elles
// seules répondraient, la ligne le dit.

import { Records } from '../db.js';
import { prixFai } from './prix.js';

const val = (c) => (c && c.absent === false ? c.valeur : null);
const sans = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const eur = (n) => `${Math.round(n).toLocaleString('fr-FR').replace(/\u202f|\u00a0/g, ' ')} €`;
const m2 = (n) => `${String(Math.round(n * 100) / 100).replace('.', ',')} m²`;
const pct = (x) => `${(Math.round(x * 10) / 10).toString().replace('.', ',')} %`;
const nombre = (t) => { const m = String(t ?? '').replace(/\u202f|\u00a0/g, ' ').match(/(\d[\d ]*(?:[.,]\d+)?)/); return m ? Number(m[1].replace(/ /g, '').replace(',', '.')) : null; };

/** Le nom court d'une pièce, pour sa pastille (« Bail », « Avis TF », « Avenant »…). */
export function nomCourt(l) {
  const c = sans(l.categorie);
  const n = sans(l.document_nom);
  if (/avenant/.test(c) || /avenant/.test(n)) return 'Avenant';
  if (/bail/.test(c) || /\bbail/.test(n)) return 'Bail';
  if (/taxe/.test(c) || /\btf\b|taxe fonc/.test(n)) return 'Avis TF';
  if (/kbis/.test(c) || /kbis/.test(n)) return 'Kbis';
  if (/reglement|edd/.test(c) || /\brcp\b|edd/.test(n)) return 'Règlement';
  if (/pv d.?ag/.test(c) || /\bpv\b/.test(n)) return 'PV d\'AG';
  if (/appels? de charges/.test(c) || /appel de fonds/.test(n)) return 'Appel de fonds';
  if (/\bdpe\b/.test(n)) return 'DPE';
  if (/diagnostic/.test(c)) return 'Diagnostic';
  return String(l.document_nom || 'Document').replace(/\.[a-z0-9]+$/i, '').slice(0, 24);
}

const pastille = (l, cellule) => ({ libelle: `${nomCourt(l)}${cellule?.page ? ` p. ${cellule.page}` : ''}`, document_id: l.document_id || null, document_url: l.document_url || null, page: cellule?.page || null, citation: cellule?.citation || null });
const FICHE = { libelle: 'Fiche p. 1' };
const CALCUL = { libelle: 'Calcul' };

/** Pure : un nom de société ou de personne, nettoyé pour comparer (sans forme sociale ni ponctuation). */
export const nomPropre = (t) => sans(t).replace(/\b(sas|sasu|sarl|sci|eurl|sa|snc|societe|ste|la|le|les|de|du|des|m|mr|mme|monsieur|madame)\b/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();

/** Pure : ce qui suit un rôle dans un texte (« Bailleur : SAS X, capital… » → « SAS X »). */
export function apres(texte, roles) {
  const m = String(texte || '').match(new RegExp(`(?:${roles})\\s*(?:et demandeur\\s*)?(?:indiqu[ée]\\s*)?:\\s*([^,;\\n(]+)`, 'i'));
  // Un point ne coupe le nom que s'il finit une phrase (« M. Dupont » reste entier).
  return m ? m[1].split(/(?<=[a-zéèà]{2})\.\s+(?=[A-ZÉÈ][a-zé])/)[0].replace(/\.\s*$/, '').trim() : null;
}

/**
 * Pure : les lignes de l'onglet Bien.
 * @param {{lot: object, lignes: Array<{document_nom, document_id, document_url, categorie, cellules}>, retenues?: object}} p
 */
export function lignesBien({ lot = {}, lignes = [], retenues = {} }) {
  const cellules = (col) => lignes.flatMap((l) => (l.cellules?.[col]?.reponse ? [{ l, c: l.cellules[col] }] : []));
  const out = [];
  const ligne = (id, libelle, x) => out.push({ id, ligne: libelle, ...x });

  // Adresse et type de local.
  const a = val(lot.adresse);
  const adresse = a && typeof a === 'object' ? [a.rue, [a.code_postal, a.ville].filter(Boolean).join(' ')].filter(Boolean).join(', ') : a;
  const type = val(lot.type_actif);
  const adressesDocs = cellules('adresse');
  ligne('adresse', 'Adresse et type de local', {
    valeur: [type, adresse].filter(Boolean).join(', ') || (adressesDocs[0]?.c.reponse ?? null),
    sources: [...(adresse || type ? [FICHE] : []), ...adressesDocs.slice(0, 2).map(({ l, c }) => pastille(l, c))],
    statut: adresse || type || adressesDocs.length ? 'info' : 'non_trouve',
  });

  // Surface : chaque source, et l'écart.
  const sFiche = Number(val(lot.surface_m2)) || null;
  const sDocs = cellules('surface').map(({ l, c }) => ({ l, c, n: nombre(c.reponse) })).filter((x) => x.n);
  const toutes = [...(sFiche ? [{ source: 'Fiche', n: sFiche, p: FICHE }] : []), ...sDocs.map((x) => ({ source: nomCourt(x.l), n: x.n, p: pastille(x.l, x.c) }))];
  const sRetenue = nombre(retenues.surface?.valeur);
  if (toutes.length) {
    const min = Math.min(...toutes.map((x) => x.n)); const max = Math.max(...toutes.map((x) => x.n));
    const ecart = (max - min) / min;
    const distinctes = [...new Set(toutes.map((x) => x.n))];
    ligne('surface', 'Surface', {
      valeur: sRetenue ? `${m2(sRetenue)} (retenue)` : distinctes.length === 1 ? m2(distinctes[0]) : toutes.map((x) => `${m2(x.n)} (${x.source})`).join(' · '),
      sources: toutes.map((x) => x.p),
      statut: ecart > 0.05 && !sRetenue ? 'signale' : 'info',
      motif: ecart > 0.05 && !sRetenue ? `Écart de ${Math.round(ecart * 100)} % entre ${m2(min)} et ${m2(max)}.` : null,
      par_document: toutes.length > 1 ? toutes.map((x) => ({ source: x.source, valeur: m2(x.n) })) : null,
    });
  } else ligne('surface', 'Surface', { valeur: 'Non trouvé', sources: [], statut: 'non_trouve', motif: 'Ni la fiche ni les pièces lues ne donnent la surface.', consultees: ['Fiche', 'Bail', 'DPE', 'Règlement'] });

  // Prix FAI et honoraires.
  const prix = prixFai(lot);
  const hon = Number(val(lot.montant_honoraires)) || null;
  ligne('prix', 'Prix FAI et honoraires', {
    valeur: prix ? `${eur(prix)} FAI · ${hon ? `dont ${eur(hon)} d'honoraires` : 'honoraires non précisés'}` : 'Non trouvé',
    sources: prix ? [FICHE] : [], statut: prix ? 'info' : 'non_trouve',
  });

  // Rendement brut : calculé ; sous 5 %, bloquant.
  const loyer = nombre(retenues.loyer?.valeur) || Number(val(lot.loyer_annuel_ht_hc)) || null;
  const r = prix && loyer ? (loyer / prix) * 100 : null;
  ligne('rendement', 'Rendement brut', {
    valeur: r != null ? `${pct(r)} (${eur(loyer)} / ${eur(prix)})` : 'Non calculable',
    sources: r != null ? [CALCUL] : [], statut: r == null ? 'non_trouve' : r < 5 ? 'bloquant' : 'ok', motif: r != null && r < 5 ? 'Rendement brut sous 5 %.' : null,
  });

  // Vendeur : le bailleur du bail, le propriétaire de l'avis de taxe foncière et des diagnostics.
  const vendeurs = cellules('parties').map(({ l, c }) => ({ l, c, nom: apres(c.reponse, 'bailleur|propri[ée]taire\\(?s?\\)?|propri[ée]taires? et (?:donneurs? d.ordre|demandeur)') })).filter((x) => x.nom);
  const parBail = vendeurs.filter((x) => ['Bail', 'Avenant'].includes(nomCourt(x.l)));
  const parTF = vendeurs.filter((x) => nomCourt(x.l) === 'Avis TF');
  const retenus = [...parTF, ...parBail];
  const noms = [...new Set(retenus.map((x) => nomPropre(x.nom)))].filter(Boolean);
  ligne('vendeur', 'Vendeur', retenus.length ? {
    valeur: noms.length <= 1 ? `${retenus[0].nom}${parTF.length && parBail.length ? ' · même nom sur l\'avis de taxe foncière et le bail' : ''}` : retenus.map((x) => `${x.nom} (${nomCourt(x.l)})`).join(' · '),
    sources: retenus.slice(0, 3).map((x) => pastille(x.l, x.c)),
    statut: noms.length > 1 ? 'signale' : 'ok', motif: noms.length > 1 ? 'Noms différents selon les pièces.' : null,
    par_document: retenus.length > 1 ? retenus.map((x) => ({ source: nomCourt(x.l), valeur: x.nom })) : null,
  } : { valeur: 'Non trouvé', sources: [], statut: 'non_trouve', consultees: ['Avis de taxe foncière', 'Bail', 'Titre'] });

  // Taxe foncière annuelle.
  const tf = cellules('taxe_fonciere').map(({ l, c }) => ({ l, c, n: nombre(c.reponse) })).find((x) => x.n);
  const avisTF = lignes.find((l) => nomCourt(l) === 'Avis TF');
  ligne('taxe_fonciere', 'Taxe foncière annuelle', tf
    ? { valeur: eur(tf.n), sources: [pastille(tf.l, tf.c)], statut: 'info' }
    : avisTF
      ? { valeur: 'Avis reçu, montant pas encore lu', sources: [pastille(avisTF, null)], statut: 'non_trouve', note: 'L\'avis est dans le dossier ; la question « taxe foncière » n\'y a pas été lue.' }
      : { valeur: 'Non trouvé', sources: [], statut: 'non_trouve', consultees: ['Avis de taxe foncière'] });

  // Locataire : le preneur du bail, sa forme et son capital ; la fiche à défaut.
  const preneurs = cellules('parties').map(({ l, c }) => ({ l, c, nom: apres(c.reponse, 'preneur') })).filter((x) => x.nom && !/non mentionn|aucun/i.test(x.nom));
  const p = preneurs.find((x) => nomCourt(x.l) === 'Bail') || preneurs[0];
  const capital = p ? (String(p.c.reponse).match(/preneur[^]*?capital (?:de )?([\d\s.,]+) ?€/i)?.[1] || null) : null;
  const locFiche = val(lot.locataire_nom);
  ligne('locataire', 'Locataire', p || locFiche ? {
    valeur: p ? `${p.nom}${capital ? `, capital ${eur(nombre(capital))}` : ''}` : locFiche,
    sources: p ? [pastille(p.l, p.c)] : [FICHE],
    statut: 'ok', note: cellules('creation')[0] ? `Kbis : ${cellules('creation')[0].c.reponse}` : 'Date de création : Kbis ou Pappers, pas encore branché.',
  } : { valeur: 'Non trouvé', sources: [], statut: 'non_trouve', consultees: ['Kbis', 'Bail', 'Fiche'] });

  // Activité réelle : la destination du bail ; Pappers (code NAF) et Google Maps restent à brancher.
  const dest = cellules('destination').find(({ l }) => nomCourt(l) === 'Bail');
  ligne('activite', 'Activité réelle', dest ? {
    valeur: String(dest.c.reponse).replace(/^«\s*|\s*»\s*—.*$/g, '').slice(0, 140), sources: [pastille(dest.l, dest.c)], statut: 'info',
    note: 'Ce que dit le bail ; le code NAF (Pappers) et ce qu\'on voit sur place (Google Maps) restent à brancher.',
  } : { valeur: type || 'Non trouvé', sources: type ? [FICHE] : [], statut: type ? 'info' : 'non_trouve', consultees: ['Bail', 'Pappers', 'Google Maps'] });

  // Procédure collective : ce qu'en disent les pièces ; une procédure → bloquant.
  const proc = cellules('procedures');
  const enCours = proc.find(({ c }) => /redressement|liquidation|sauvegarde|procedure collective/i.test(sans(c.reponse)) && !/aucun|neant|pas de/i.test(sans(c.reponse)));
  ligne('procedure', 'Procédure collective', proc.length
    ? { valeur: enCours ? 'OUI' : 'NON', sources: proc.slice(0, 2).map(({ l, c }) => pastille(l, c)), statut: enCours ? 'bloquant' : 'ok', motif: enCours ? String(enCours.c.reponse).slice(0, 160) : null }
    : { valeur: 'Non trouvé', sources: [], statut: 'non_trouve', consultees: ['Kbis', 'Pappers', 'BODACC'], note: 'Pappers et BODACC ne sont pas encore branchés.' });

  // Santé financière : bilans du locataire, ou Pappers.
  ligne('sante', 'Santé financière', { valeur: 'Non trouvé', sources: [], statut: 'non_trouve', consultees: ['Bilans du locataire', 'Pappers'], note: 'Bilans non reçus ; Pappers pas encore branché.' });
  return out;
}

/**
 * Pure : la main de l'analyste sur une ligne du Bien (29 oct. 2026, Jules : « tout dans le tableau doit être
 * modifiable »). Une valeur modifiée remplace celle du calcul, « OK » la valide ; ni l'une ni l'autre ne bouge quand
 * les pièces sont relues. `etat` : 'ia' (calculé), 'corrige' (modifié par), 'verifie' (OK).
 */
export function avecLaMain(lignes, cases = {}) {
  return lignes.map((l) => {
    const h = cases[`bien.${l.id}`];
    if (!h?.statut) return { ...l, etat: 'ia', note_analyste: h?.note || null, valeur_main: h?.valeur_main || null };
    return { ...l, valeur_lue: l.valeur, valeur: h.valeur ?? l.valeur, valeur_main: h.statut === 'corrige' ? h.valeur : h.valeur_main || null, etat: h.statut === 'corrige' ? 'corrige' : h.statut === 'verifie' ? 'verifie' : 'ia', par: h.par || null, le: h.le || null };
  });
}

/** Les lignes du Bien d'un dossier : les pièces de la Data Room d'abord, l'ancienne lecture (la matrice) à défaut. */
export async function bienDu(dealId) {
  const d = Records.findBy('Deal', 'deal_id', dealId);
  if (!d) return null;
  const { lignesBienDesPieces } = await import('./analyse-pieces.js');
  let lignes = lignesBienDesPieces(d);
  if (!lignes.length) {
    const { lireMatrice } = await import('./matrice.js');
    lignes = (lireMatrice(dealId)?.lignes || []).filter((l) => !l.perime);
  }
  return { lignes: avecLaMain(lignesBien({ lot: d.lots?.[0]?.lot || {}, lignes, retenues: d.valeurs_retenues || {} }), d.analyse_pieces?.cases || {}) };
}
