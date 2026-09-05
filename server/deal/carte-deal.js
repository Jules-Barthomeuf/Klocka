// La carte de deal : ce que la data room dit du bien, confronté au teaser.
//
// Même logique que la carte de pré-analyse, mêmes mots : un verdict
// déterministe, les écarts entre ce qu'on nous a vendu et ce que les pièces
// disent, les problèmes en trois familles, un simulateur recalculé. Le
// registre de faits est la matrice (question × document, cité à la page) ;
// ici, le code réconcilie — l'IA n'y touche pas.

import { lireMatrice, lireFiche } from './matrice.js';
import { montants, surfaces, dates, loyerAnnuel } from './dossier-lecture.js';
import { calculerAEM } from './aem.js';
import { Records } from '../db.js';

const val = (c) => (c && c.absent === false ? c.valeur : c?.valeur ?? null);

// La pièce qui devrait répondre à chaque question. Sans elle dans la data
// room, l'absence est une pièce manquante ; avec elle, un silence à signaler.
const PIECE_ATTENDUE = {
  adresse: 'Bail commercial', surface: 'Bail commercial', destination: 'Bail commercial', diagnostics: 'Diagnostics',
  parties: 'Bail commercial', dates_bail: 'Bail commercial', duree: 'Bail commercial', resiliation: 'Bail commercial',
  loyer: 'Bail commercial', indexation: 'Bail commercial', charges: 'Bail commercial', depot: 'Bail commercial',
  pas_de_porte: 'Bail commercial', caution: 'Bail commercial', travaux_conformite: 'Bail commercial', etat_lieux: 'Bail commercial',
  resolutoire: 'Bail commercial', cession: 'Bail commercial',
  creation: 'Kbis', capital: 'Kbis', dirigeants: 'Kbis', origine_fonds: 'Bail commercial', paiements: 'Quittances',
  tantiemes: 'EDD', charges_copro: 'Appels de charges', restrictions: 'Règlement de copropriété',
  travaux_votes: "PV d'AG copro", procedures: "PV d'AG copro",
  prix: null, rendement_affiche: null, charges_non_recup: 'Bail commercial', taxe_fonciere: 'Taxe foncière',
};
// Les pièces qui peuvent aussi répondre à la place de la pièce attendue.
const EQUIVALENTS = { EDD: ['Règlement de copropriété'], 'Règlement de copropriété': ['EDD'], Kbis: ['Bail commercial'] };

// Ce qui bloque : une contradiction ici n'est pas une nuance.
const BLOQUANTES = new Set(['dates_bail', 'duree', 'loyer', 'surface', 'destination', 'parties', 'prix']);

export const LIBELLE_RECONCILIATION = {
  confirme: 'Confirmé', contradiction: 'Contradiction', piece_manquante: 'Pièce manquante', non_mentionne: 'Non mentionné',
  hors_critere: 'Hors critère', ecart_teaser: 'Écart avec le teaser', a_verifier: 'À vérifier', ecarte: 'Écarté (faux positif)',
};

const nombre = (n) => (n == null ? null : Math.round(n));
const pct = (a, b) => (a && b ? ((a - b) / b) * 100 : null);

export function lireCarteDeal(dealId) {
  const m = lireMatrice(dealId);
  if (!m) return null;
  const f = lireFiche(dealId);
  const brut = Records.filter('Deal', { deal_id: dealId })[0];
  const lot = brut?.lots?.[0] || null;
  const teaser = lot?.lot || {};
  const champs = new Map(f.blocs.flatMap((b) => b.champs).map((c) => [c.id, c]));
  const presentes = new Set(m.lignes.map((l) => l.categorie || 'Autre'));
  const remplie = m.lignes.length > 0;

  // --- Les valeurs de la data room, lues depuis la fiche -----------------------
  const loyerDR = loyerAnnuel(champs.get('loyer')?.valeur || '') || null;
  const surfaceDR = surfaces(champs.get('surface')?.valeur || '')[0]?.valeur || null;
  const finBail = Math.max(0, ...dates(champs.get('dates_bail')?.valeur || '').map((d) => d.annee)) || null;
  const chargesNonRecupDR = montants(champs.get('charges_non_recup')?.valeur || '')[0]?.valeur || null;
  const taxeDR = montants(champs.get('taxe_fonciere')?.valeur || '')[0]?.valeur || null;
  const capital = montants(champs.get('capital')?.valeur || '')[0]?.valeur || null;

  const prixFai = val(teaser.prix_fai);
  const loyerTeaser = val(teaser.loyer_annuel_ht_hc);
  const surfaceTeaser = val(teaser.surface_m2);
  const echeanceTeaser = Number(String(val(teaser.bail_echeance) || '').match(/\d{4}/)?.[0]) || null;
  const rendementTeaser = val(teaser.rendement_annonce) ?? (loyerTeaser && prixFai ? (loyerTeaser / prixFai) * 100 : null);
  const rendementDR = loyerDR && prixFai ? (loyerDR / prixFai) * 100 : null;
  const aemTeaser = lot?.evaluation?.aem || (prixFai ? calculerAEM({ prixFai, loyerAnnuel: loyerTeaser }) : null);
  const aemDR = prixFai && loyerDR ? calculerAEM({ prixFai, prixNegocie: aemTeaser?.prix_negocie, loyerAnnuel: loyerDR }) : null;

  const ecarts = [
    { id: 'loyer', libelle: 'Loyer annuel HT HC', teaser: nombre(loyerTeaser), data_room: nombre(loyerDR), unite: '€', ecart_pct: pct(loyerDR, loyerTeaser), source: champs.get('loyer')?.source },
    { id: 'surface', libelle: 'Surface', teaser: surfaceTeaser, data_room: surfaceDR, unite: 'm²', ecart_pct: pct(surfaceDR, surfaceTeaser), source: champs.get('surface')?.source },
    { id: 'echeance', libelle: 'Échéance du bail', teaser: echeanceTeaser, data_room: finBail, unite: '', ecart_pct: null, ecart_ans: finBail && echeanceTeaser ? finBail - echeanceTeaser : null, source: champs.get('dates_bail')?.source },
    { id: 'rendement', libelle: 'Rendement brut', teaser: rendementTeaser != null ? Number(rendementTeaser.toFixed(2)) : null, data_room: rendementDR != null ? Number(rendementDR.toFixed(2)) : null, unite: '%', ecart_pts: rendementDR != null && rendementTeaser != null ? Number((rendementDR - rendementTeaser).toFixed(2)) : null },
    { id: 'rendement_aem', libelle: 'Rendement AEM', teaser: aemTeaser?.rendement_aem ?? null, data_room: aemDR?.rendement_aem ?? null, unite: '%', ecart_pts: aemDR && aemTeaser ? Number((aemDR.rendement_aem - aemTeaser.rendement_aem).toFixed(2)) : null },
    { id: 'charges_non_recup', libelle: 'Charges non récupérables', teaser: null, data_room: nombre(chargesNonRecupDR), unite: '€', source: champs.get('charges_non_recup')?.source },
    { id: 'taxe_fonciere', libelle: 'Taxe foncière', teaser: null, data_room: nombre(taxeDR), unite: '€', source: champs.get('taxe_fonciere')?.source },
  ].filter((e) => e.teaser != null || e.data_room != null);

  // --- La réconciliation, champ par champ -----------------------------------------
  const reconciliation = {};
  for (const c of m.colonnes) {
    const champ = champs.get(c.id);
    const s = m.synthese[c.id] || {};
    const revue = s.revue?.verdict || null;
    let statut;
    if (revue === 'faux_positif') statut = 'ecarte';
    else if (s.statut === 'contradictoire') statut = s.annonce ? 'ecart_teaser' : 'contradiction';
    else if (s.statut === 'coherent') statut = 'confirme';
    else if (s.statut === 'a_verifier') statut = 'a_verifier';
    else {
      // Manquant ou hors critère faute de pièce : la pièce attendue est-elle là ?
      const attendue = PIECE_ATTENDUE[c.id];
      const la = attendue && (presentes.has(attendue) || (EQUIVALENTS[attendue] || []).some((e) => presentes.has(e)));
      statut = !attendue ? 'non_mentionne' : la ? 'non_mentionne' : 'piece_manquante';
      if (champ?.preuves?.length) statut = 'non_mentionne'; // la pièce en parle pour dire qu'il n'y a rien
    }
    reconciliation[c.id] = { statut, detail: s.detail || '', revue: s.revue || null, piece_attendue: PIECE_ATTENDUE[c.id] || null };
  }
  // Hors critère : ce que les règles refusent, confirmé par les pièces.
  const horsCritere = [];
  const cible = lot?.evaluation?.profil?.criteres?.find?.((k) => k.champ === 'rendement_aem')?.valeur ?? null;
  if (aemDR && cible && aemDR.rendement_aem < Number(cible)) horsCritere.push({ champ: 'loyer', libelle: 'Rendement AEM recalculé', detail: `${aemDR.rendement_aem} % avec le loyer du bail, sous le seuil de ${cible} % du profil.` });
  if (finBail && finBail - new Date().getFullYear() < 3) horsCritere.push({ champ: 'dates_bail', libelle: 'Bail restant', detail: `Échéance ${finBail} : moins de trois ans d'engagement.` });
  for (const h of horsCritere) if (reconciliation[h.champ] && reconciliation[h.champ].statut !== 'ecarte') reconciliation[h.champ] = { ...reconciliation[h.champ], statut: 'hors_critere', detail: h.detail };

  // --- Les problèmes, en trois familles -----------------------------------------------
  const contradictions = [];
  const piecesManquantes = [];
  const vigilance = [];
  for (const c of m.colonnes) {
    const r = reconciliation[c.id];
    const champ = champs.get(c.id);
    const valeurs = (champ?.preuves || []).map((p) => ({ valeur: p.reponse, source: p.document_nom, page: p.page, document_id: p.document_id, document_url: p.document_url, citation: p.citation }));
    if (r.statut === 'contradiction' || r.statut === 'ecart_teaser') {
      if (r.statut === 'ecart_teaser') {
        const t = c.id === 'loyer' ? `${Math.round(loyerTeaser || 0).toLocaleString('fr-FR')} € par an` : c.id === 'surface' ? `${surfaceTeaser} m²` : c.id === 'rendement_affiche' ? `${Number(rendementTeaser).toFixed(2)} %` : null;
        if (t) valeurs.push({ valeur: t, source: 'Teaser (pré-analyse)', page: null });
      }
      contradictions.push({ champ: c.id, libelle: c.libelle, bloc: c.bloc, statut: r.statut, detail: r.detail, valeurs, gravite: BLOQUANTES.has(c.id) || c.criticite === 'haute' ? 'bloquante' : 'a_lever', revue: r.revue });
    } else if (r.statut === 'piece_manquante') {
      piecesManquantes.push({ champ: c.id, libelle: c.libelle, piece: r.piece_attendue, question: `${r.piece_attendue} — absent de la data room. À demander au vendeur (${c.libelle.toLowerCase()}).`, criticite: c.criticite });
    } else if (['non_mentionne', 'a_verifier', 'hors_critere'].includes(r.statut)) {
      vigilance.push({ champ: c.id, libelle: c.libelle, statut: r.statut, detail: r.statut === 'non_mentionne' ? `${r.piece_attendue ? `Le ${r.piece_attendue.toLowerCase()} est là mais ne dit rien` : 'Aucune pièce ne dit rien'} sur ${c.libelle.toLowerCase()}.` : r.detail, criticite: c.criticite });
    }
  }
  if (capital != null && capital < 20000) vigilance.push({ champ: 'capital', libelle: 'Capital du preneur', statut: 'a_verifier', detail: `Capital de ${capital.toLocaleString('fr-FR')} € : garanties du bail à regarder de près (caution, dépôt).`, criticite: 'moyenne' });

  // --- Le verdict ------------------------------------------------------------------------
  let verdict = null;
  const motifs = [];
  const reserves = [];
  if (remplie) {
    const bloquantes = contradictions.filter((c) => c.gravite === 'bloquante' && c.statut === 'contradiction');
    const horsCritereConfirme = vigilance.filter((v) => v.statut === 'hors_critere');
    const manquantesHautes = piecesManquantes.filter((p) => p.criticite === 'haute');
    const aLever = contradictions.filter((c) => !bloquantes.includes(c));
    if (bloquantes.length || horsCritereConfirme.length) {
      verdict = 'NO-GO';
      for (const b of bloquantes) motifs.push(`${b.libelle} : ${b.detail}`);
      for (const h of horsCritereConfirme) motifs.push(`${h.libelle} : ${h.detail}`);
    } else if (manquantesHautes.length || aLever.length) {
      verdict = 'INSUFFISANT';
      for (const p of manquantesHautes) motifs.push(p.question);
      for (const c of aLever) motifs.push(`${c.libelle} : ${c.detail}`);
    } else {
      for (const v of vigilance) reserves.push({ id: v.champ, motif: v.detail });
      for (const p of piecesManquantes) reserves.push({ id: p.champ, motif: p.question });
      verdict = reserves.length ? 'GO SOUS RÉSERVE' : 'GO';
      motifs.push(reserves.length ? `${reserves.length} point${reserves.length > 1 ? 's' : ''} à négocier ou à lever.` : 'Tout est renseigné, cohérent et dans les critères.');
    }
  }

  // --- La couverture des documents ---------------------------------------------------------
  const documents = m.lignes.map((l) => {
    const attendues = m.colonnes.filter((c) => PIECE_ATTENDUE[c.id] === (l.categorie || 'Autre'));
    const repondues = m.colonnes.filter((c) => l.cellules?.[c.id]?.reponse).length;
    const sansReponse = attendues.filter((c) => !l.cellules?.[c.id]?.reponse).map((c) => c.libelle);
    return { document_id: l.document_id, nom: l.document_nom, url: l.document_url, categorie: l.categorie || 'Autre', repondues, attendues: attendues.length, sans_reponse: sansReponse, erreur: l.erreur || null };
  });

  const simulateurDR = lot?.simulateur
    ? { ...lot.simulateur, ...(loyerDR ? { loyerInitialHTHC: Math.round(loyerDR) } : {}), ...(surfaceDR ? { surface: surfaceDR } : {}) }
    : null;

  return {
    remplie,
    remplissage: m.remplissage,
    rempli_le: f.rempli_le,
    titre: String(lot?.synthese?.titre || brut?.nom || 'Dossier').replace(/\s*[—:-]\s*(GO SOUS R[ÉE]SERVE|NO-?GO|GO|INSUFFISANT)\s*$/i, '').trim(),
    verdict, motifs, reserves,
    ecarts,
    contradictions, pieces_manquantes: piecesManquantes, vigilance,
    reconciliation,
    fiche: f,
    documents,
    a_classer: m.a_classer,
    nb_questions: m.colonnes.length,
    simulateur: { teaser: lot?.simulateur || null, data_room: simulateurDR, aem_teaser: aemTeaser, aem_data_room: aemDR },
    lot: lot ? { index: 0, lot: lot.lot, enrichissement: lot.enrichissement, evaluation: { verdict: lot.evaluation?.verdict } } : null,
    demandes_texte: [...piecesManquantes.map((p) => p.question), ...contradictions.filter((c) => c.statut === 'contradiction').map((c) => `${c.libelle} : ${c.detail} Pouvez-vous nous indiquer la valeur à retenir et la pièce qui fait foi ?`)].join('\n'),
  };
}
