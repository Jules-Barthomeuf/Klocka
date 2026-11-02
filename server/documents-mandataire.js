// Les documents d'un mandataire, tous biens confondus (2 nov. 2026, Jules : « un onglet bibliothèque avec les
// documents : les mandats triés par date, les estimations, les decks, les comptes rendus de visite »). Une ligne par
// document, la plus récente en tête : mandats, avis de valeur (le deck est la même estimation, ouverte dans son bien),
// comptes rendus de visite, teasers, offres reçues. Les pièces de la Data Room restent dans le bien. Rien d'exemple.

import { montant } from './montants.js';

const ETAT_MANDAT = (m) => (m.statut === 'enregistre' ? 'Signé, inscrit au registre' : m.statut === 'signe' || m.statut === 'pret' ? 'Signé'
  : m.statut === 'demande_envoyee' ? (m.valide_le ? 'En signature' : m.a_relire ? 'À relire' : 'Envoyé') : 'En préparation');
const nomDuBien = (x) => x?.bien || [x?.commerce || x?.nom, x?.ville].filter(Boolean).join(' · ') || 'Bien sans nom';
const lien = (cle, etape) => `/Biens?bien=${encodeURIComponent(cle)}&etape=${etape}`;
// La vraie première page (2 nov. 2026, Jules) : l'avis et le teaser sont photographiés par le serveur, une fois par
// version (server/vignette-document.js) ; le mandat est dessiné par l'écran depuis son PDF.
const vignette = (id, version) => `/api/mandataire/documents/vignette?id=${encodeURIComponent(id)}&v=${encodeURIComponent(version || '')}`;

/** Pure : les documents, depuis les objets du mandataire (déjà filtrés à lui). */
export function documentsDuMandataire({ estimations = [], mandats = [], marches = [], proprietaires = [] } = {}) {
  const docs = [];
  for (const m of mandats.filter((x) => !x.exemple)) {
    docs.push({
      id: `mandat:${m.id}`, type: 'mandat', titre: nomDuBien(m), detail: [ETAT_MANDAT(m), m.vendeur].filter(Boolean).join(' · '),
      le: m.signe_le || m.pret_le || m.valide_le || m.a_relire?.le || m.demande_envoyee_le || m.cree_le || null,
      lien: lien(`mandat:${m.id}`, 'mandat'), pdf: m.document_signe?.url || m.document?.url || m.a_relire?.url || null,
    });
  }
  for (const e of estimations.filter((x) => !x.exemple && x.avis)) {
    const v = e.avis?.chiffres?.valeur;
    docs.push({
      id: `estimation:${e.id}`, type: 'avis', titre: nomDuBien(e),
      detail: [v ? montant(v) : null, e.statut === 'envoye' ? 'envoyé au propriétaire' : 'pas encore envoyé'].filter(Boolean).join(' · '),
      le: e.envoye_le || e.updated_date || e.cree_le || null,
      lien: lien(`estimation:${e.id}`, 'estimation'), pdf: `/api/mandataire/estimations/${e.id}/pdf`,
      version: e.updated_date || e.prete_le || e.cree_le || null, vignette: vignette(`estimation:${e.id}`, e.updated_date || e.prete_le || e.cree_le),
    });
  }
  for (const p of proprietaires.filter((x) => !x.exemple && x.biens?.compte_rendu)) {
    const cr = p.biens.compte_rendu;
    const resume = String(cr.texte || cr.resume || cr.proprietaire?.projet || '').replace(/\s+/g, ' ').trim();
    docs.push({
      id: `cr:${p.id}`, type: 'compte_rendu', titre: nomDuBien(p), detail: resume ? resume.slice(0, 140) : 'Compte rendu de visite',
      le: cr.le || p.biens.visite?.faite_le || null, lien: lien(`proprietaire:${p.id}`, 'previsite'), pdf: null,
    });
  }
  for (const m of marches.filter((x) => !x.exemple)) {
    if (m.teaser) {
      docs.push({
        id: `teaser:${m.id}`, type: 'teaser', titre: nomDuBien(m), detail: m.teaser.valide_le ? 'Validé' : 'En préparation',
        le: m.teaser.valide_le || m.teaser.compose_le || m.cree_le || null, lien: lien(`marche:${m.id}`, 'marche'), pdf: `/api/mandataire/marches/${m.id}/teaser/pdf`,
        version: m.teaser.valide_le || m.teaser.compose_le || m.updated_date || null, vignette: vignette(`teaser:${m.id}`, m.teaser.valide_le || m.teaser.compose_le || m.updated_date),
      });
    }
    // Les offres que Klocka a validées, sans le nom du client (marcheVuParMandataire les a déjà filtrées).
    for (const o of m.offres || []) {
      docs.push({
        id: `offre:${m.id}:${o.id}`, type: 'offre', titre: nomDuBien(m), detail: [montant(o.montant), o.conditions].filter(Boolean).join(' · '),
        le: o.validee_le || o.le || null, lien: lien(`marche:${m.id}`, 'offre'), pdf: null,
      });
    }
  }
  return docs.sort((a, b) => String(b.le || '').localeCompare(String(a.le || '')));
}
