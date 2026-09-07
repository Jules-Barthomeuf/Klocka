// La grille du bail : les critères de Klocka, un par ligne, avec la valeur
// lue dans les pièces, sa source, et un statut. Vert quand la valeur est là
// et qu'aucune règle ne s'allume ; orange dès qu'une règle s'allume, avec le
// motif ; gris tant que rien n'a été lu. Les règles sont celles de l'équipe,
// écrites en clair à côté de chaque critère.

import { Records } from '../db.js';
import { lireFiche, lancerRemplissage, lireMatrice } from './matrice.js';
import { montants, dates, loyerAnnuel } from './dossier-lecture.js';

const val = (c) => (c && c.absent === false ? c.valeur : c?.valeur ?? null);
const neg = (t) => /^\s*(non\b|aucun|pas de|néant|absent|sans )|non (mentionn|précisé|prévu)|ne figure pas|n'est pas (mentionn|précisé|indiqué|soumis)/i.test(String(t || ''));
const dit = (t, motif) => motif.test(String(t || ''));

export const CRITERES_BAIL = [
  { id: 'type_bail', libelle: 'Type de bail', champs: ['type_bail', 'duree'], regle: 'Warning si bail précaire ou dérogatoire, ou si tacite reconduction.' },
  { id: 'echeance', libelle: 'Échéance du bail', champs: ['dates_bail'], regle: 'Date de début et date de fin.' },
  { id: 'parties', libelle: 'Les parties', champs: ['parties'], regle: 'Warning si le locataire est une personne physique.' },
  { id: 'loyer_signature', libelle: 'Conditions financières — loyer de signature', champs: ['loyer'], regle: 'Warning si incohérence entre le loyer de signature et le loyer de la fiche commerciale, indexation en vigueur comprise.' },
  { id: 'conditions_exceptionnelles', libelle: 'Conditions financières exceptionnelles', champs: ['conditions_exceptionnelles'], regle: 'Warning si nous sommes encore dans la période de franchise ou de loyer par palier.' },
  { id: 'mode_reglement', libelle: 'Mode de règlement des loyers', champs: ['mode_reglement', 'paiements'], regle: 'Warning si écart entre la fréquence des quittances et les conditions du bail.' },
  { id: 'tva', libelle: 'Loyer assujetti à TVA', champs: ['tva_loyer', 'loyer'], regle: 'Warning si le loyer n\'est pas assujetti à la TVA.' },
  { id: 'destination', libelle: 'Destination du bail', champs: ['destination'], regle: 'Warning si toute activité autorisée.' },
  { id: 'cession', libelle: 'Conditions de cession', champs: ['cession'], regle: 'Warning si sous-location autorisée.' },
  { id: 'indexation', libelle: 'Indexation', champs: ['indexation'], regle: 'Warning si absence de clause d\'indexation, ou indexation sur l\'ICC.' },
  { id: 'depot', libelle: 'Dépôt de garantie', champs: ['depot'], regle: 'Warning si moins d\'un mois de loyer de signature inscrit dans le bail.' },
  { id: 'pas_de_porte', libelle: 'Pas-de-porte', champs: ['pas_de_porte'], regle: 'Information.' },
  { id: 'charges', libelle: 'Charges refacturées', champs: ['charges', 'charges_copro'], regle: 'Warning si les charges de copropriété ne peuvent pas être refacturées au locataire.' },
  { id: 'taxes', libelle: 'Taxes refacturées', champs: ['taxe_fonciere', 'charges'], regle: 'Warning si la taxe foncière ne peut pas être refacturée au locataire.' },
];

export function lireGrilleBail(dealId) {
  const f = lireFiche(dealId);
  if (!f) return null;
  const m = lireMatrice(dealId);
  const brut = Records.filter('Deal', { deal_id: dealId })[0];
  const teaser = brut.lots?.[0]?.lot || {};
  const champs = new Map(f.blocs.flatMap((b) => b.champs).map((c) => [c.id, c]));
  const v = (id) => champs.get(id)?.valeur || null;
  const preuvesDe = (ids) => ids.flatMap((id) => (champs.get(id)?.preuves || []).map((p) => ({ champ: id, document_id: p.document_id, document_nom: p.document_nom, document_url: p.document_url, page: p.page, citation: p.citation, reponse: p.reponse })));
  const lu = (ids) => ids.some((id) => m.lignes.some((l) => l.cellules && Object.prototype.hasOwnProperty.call(l.cellules, id)));
  const quittances = m.lignes.filter((l) => !l.perime && /quittance/i.test(l.categorie || ''));

  const lignes = CRITERES_BAIL.map((c) => {
    const texte = c.champs.map((id) => v(id)).filter(Boolean).join(' · ');
    const principal = v(c.champs[0]);
    // La question principale non lue : la ligne est « non lue », même si un champ voisin donne un indice.
    let statut = !lu([c.champs[0]]) ? 'non_lu' : texte ? 'ok' : 'vide';
    let motif = null;
    let valeur = principal || texte || null;

    switch (statut === 'non_lu' ? 'non_lu' : c.id) {
      case 'non_lu': break;
      case 'type_bail': {
        if (dit(texte, /dérogatoire|derogatoire|précaire|precaire|courte durée/)) { statut = 'warning'; motif = 'Bail précaire ou dérogatoire.'; }
        else if (dit(texte, /tacite reconduction/) && !dit(texte, /sans tacite|pas de tacite|exclu.{0,20}tacite/)) { statut = 'warning'; motif = 'Tacite reconduction prévue.'; }
        break;
      }
      case 'echeance': {
        const ds = dates(principal || '').map((d) => d.iso).sort();
        if (ds.length) valeur = `${ds[0].split('-').reverse().join('/')} → ${ds[ds.length - 1].split('-').reverse().join('/')}`;
        break;
      }
      case 'parties': {
        const preneur = String(principal || '').match(/preneur\s*[:—-]\s*([^;.]{3,160})/i)?.[1] || principal || '';
        const societe = /\b(SAS|SASU|SARL|EURL|SA|SCI|SNC|SEL|SCP|société|societe|sté|compagnie|association)\b/i.test(preneur);
        const physique = /\b(M\.|Mme|Monsieur|Madame|Mlle|né\(?e?\)? le|demeurant|entrepreneur individuel|EI\b)/i.test(preneur) && !societe;
        if (principal && physique) { statut = 'warning'; motif = 'Le locataire est une personne physique.'; }
        break;
      }
      case 'loyer_signature': {
        const loyerBail = loyerAnnuel(principal || '');
        const loyerFiche = val(teaser.loyer_annuel_ht_hc);
        const debut = dates(v('dates_bail') || '').map((d) => d.iso).sort()[0];
        if (loyerBail) valeur = `${Math.round(loyerBail).toLocaleString('fr-FR')} € HT/an`;
        if (loyerBail && loyerFiche) {
          const annees = debut ? Math.max(0, (Date.now() - Date.parse(debut)) / (365.25 * 86400000)) : 0;
          const indexe = loyerBail * Math.pow(1.02, annees); // indexation courante : ~2 % par an
          const ecart = Math.abs(loyerFiche - indexe) / indexe;
          valeur = `${Math.round(loyerBail).toLocaleString('fr-FR')} € à la signature · ${Math.round(indexe).toLocaleString('fr-FR')} € indexé (~2 %/an sur ${annees.toFixed(1)} an) · fiche ${Math.round(loyerFiche).toLocaleString('fr-FR')} €`;
          if (ecart > 0.05) { statut = 'warning'; motif = `Écart de ${(ecart * 100).toFixed(0)} % entre le loyer indexé et la fiche commerciale.`; }
        }
        break;
      }
      case 'conditions_exceptionnelles': {
        if (principal && !neg(principal) && dit(principal, /franchise|palier|progressi|remise|gratuit/)) {
          const fins = dates(principal).map((d) => d.iso).sort();
          const derniere = fins[fins.length - 1];
          if (!derniere || derniere >= new Date().toISOString().slice(0, 10)) { statut = 'warning'; motif = derniere ? `Période en cours jusqu'au ${derniere.split('-').reverse().join('/')}.` : 'Franchise ou paliers sans date de fin lisible : à vérifier.'; }
          else valeur = `${principal} — période terminée le ${derniere.split('-').reverse().join('/')}`;
        } else if (principal && neg(principal)) valeur = 'Aucune';
        break;
      }
      case 'mode_reglement': {
        const bailMensuel = dit(texte, /mensuel|chaque mois|par mois/), bailTrim = dit(texte, /trimestr/);
        const q = quittances.map((l) => l.cellules?.paiements?.reponse || l.cellules?.loyer?.reponse || '').join(' ');
        const qMensuel = dit(q, /mensuel|mois|janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre/), qTrim = dit(q, /trimestr/);
        if (quittances.length && ((bailMensuel && qTrim && !qMensuel) || (bailTrim && qMensuel && !qTrim))) { statut = 'warning'; motif = 'La fréquence des quittances ne suit pas les conditions du bail.'; }
        else if (!quittances.length && principal) { statut = statut === 'ok' ? 'a_verifier' : statut; motif = 'Aucune quittance dans la data room pour vérifier la fréquence.'; }
        break;
      }
      case 'tva': {
        const soumis = dit(texte, /soumis(e)? à la TVA|assujetti|option (pour la|à la) TVA|TVA en sus|\+ ?TVA|HT et TVA|majoré de la TVA/) && !dit(texte, /non soumis|exonér|sans TVA|non assujetti/);
        if (!principal && !soumis) { statut = lu(c.champs) ? 'warning' : 'non_lu'; motif = lu(c.champs) ? 'Aucune mention de TVA sur le loyer.' : null; }
        else if (!soumis) { statut = 'warning'; motif = 'Loyer non assujetti à la TVA.'; valeur = principal || 'Non soumis'; }
        else valeur = principal || 'Soumis à la TVA';
        break;
      }
      case 'destination': {
        if (dit(principal, /toute(s)? activité(s)?|tous commerces|toute nature|sans restriction/) && !dit(principal, /à l'exclusion|sauf|hors/)) { statut = 'warning'; motif = 'Toute activité autorisée.'; }
        break;
      }
      case 'cession': {
        if (dit(principal, /sous-?location/) && dit(principal, /sous-?location[^.;]{0,60}(autoris|permis|libre|possible)/i) && !dit(principal, /sous-?location[^.;]{0,40}interdit/i)) { statut = 'warning'; motif = 'Sous-location autorisée.'; }
        break;
      }
      case 'indexation': {
        if (!principal || neg(principal)) { if (lu(c.champs)) { statut = 'warning'; motif = 'Aucune clause d\'indexation.'; } }
        else if (dit(principal, /\bICC\b|coût de la construction/)) { statut = 'warning'; motif = 'Indexation sur l\'ICC.'; }
        break;
      }
      case 'depot': {
        const depot = montants(principal || '')[0]?.valeur ?? null;
        const loyerBail = loyerAnnuel(v('loyer') || '');
        if (depot != null && loyerBail) {
          const mois = depot / (loyerBail / 12);
          valeur = `${Math.round(depot).toLocaleString('fr-FR')} € · ${mois.toFixed(1)} mois de loyer`;
          if (mois < 1) { statut = 'warning'; motif = 'Moins d\'un mois de loyer de signature.'; }
        } else if (principal && neg(principal)) { statut = 'warning'; motif = 'Aucun dépôt de garantie.'; valeur = 'Aucun'; }
        break;
      }
      case 'pas_de_porte': {
        if (principal && neg(principal)) valeur = 'Aucun';
        break;
      }
      case 'charges': {
        const t = texte;
        const COPRO = '(copropri|charges communes|charges générales|charges de l\'immeuble)';
        const coproPreneur = dit(t, new RegExp(`${COPRO}[^.;]{0,120}(preneur|locataire)|(preneur|locataire)[^.;]{0,160}${COPRO}`, 'i'));
        const coproBailleur = dit(t, new RegExp(`${COPRO}[^.;]{0,80}(bailleur|propriétaire)[^.;]{0,30}(charge|support|conserv)|non refactur|ne (peuvent|pourront) (pas )?être refactur`, 'i'));
        if (statut !== 'non_lu' && principal && (coproBailleur || (!coproPreneur && dit(t, /copropri/)))) { statut = 'warning'; motif = 'Les charges de copropriété ne sont pas refacturables au locataire.'; }
        else if (statut !== 'non_lu' && principal && !coproPreneur) { statut = 'a_verifier'; motif = 'Le bail ne dit rien des charges de copropriété.'; }
        break;
      }
      case 'taxes': {
        const t = texte;
        const tfPreneur = dit(t, /taxe fonci[^.;]{0,80}(preneur|locataire)|(preneur|locataire)[^.;]{0,80}taxe fonci/i);
        const tfBailleur = dit(t, /taxe fonci[^.;]{0,80}(bailleur|propriétaire)[^.;]{0,30}(charge|support|conserv)|taxe fonci[^.;]{0,40}non refactur/i);
        if (principal || dit(t, /taxe fonci/)) {
          if (tfBailleur || !tfPreneur) { statut = 'warning'; motif = 'La taxe foncière n\'est pas refacturable au locataire.'; }
          else valeur = 'Taxe foncière refacturée au preneur' + (principal ? ` — ${principal}` : '');
        }
        break;
      }
      default: break;
    }
    if (statut === 'vide') { motif = motif || 'Aucune pièce ne répond.'; }
    if (statut === 'non_lu') { motif = 'Question pas encore lue : relancer l\'analyse.'; }
    return { ...c, valeur, statut, motif, preuves: preuvesDe(c.champs).slice(0, 6) };
  });

  const nb = (s) => lignes.filter((l) => l.statut === s).length;
  return { lignes, resume: { ok: nb('ok'), warning: nb('warning'), a_verifier: nb('a_verifier'), vide: nb('vide'), non_lu: nb('non_lu') }, gabarit_version: m.gabarit.version, remplissage: m.remplissage };
}

/** Les questions du gabarit jamais lues sur ce dossier : à lancer d'un clic. */
export function colonnesNonLues(dealId) {
  const m = lireMatrice(dealId);
  if (!m || !m.lignes.length) return [];
  return m.colonnes.filter((c) => !m.lignes.some((l) => l.cellules && Object.prototype.hasOwnProperty.call(l.cellules, c.id))).map((c) => c.id);
}
export function lireColonnesManquantes(dealId, opts) {
  const ids = colonnesNonLues(dealId);
  if (!ids.length) return { ok: true, rien: true };
  return { ok: true, colonnes: ids, remplissage: lancerRemplissage(dealId, { ...opts, seulementColonnes: ids }) };
}
