// Passerelle dépouillement → projet.
//
// Le dépouillement répond à la grille de lecture, élément par élément. Chaque
// élément a une destination connue dans la fiche projet : c'est la table CIBLES
// ci-dessous, source unique pour les deux usages —
//   1. remplir le projet à sa création (patchDepuisExtractions),
//   2. montrer à l'écran ce qui ira où (donneesProjet), onglet « Données extraites ».
//
// Un élément sans destination n'est pas perdu : il apparaît dans l'onglet, sans
// case d'arrivée, plutôt que d'être silencieusement ignoré.

// type :
//   champ_bail → ligne de bail_admin_fields (libellé + valeur, texte libre)
//   texte      → champ texte du projet, écrit seulement s'il est vide
//   note_diag  → note libre de l'onglet Diagnostics
//   dpe        → note DPE + consommation, extraites du constat
//   booleen    → oui/non (assujettissement TVA)
const CIBLES = {
  // --- Bail -----------------------------------------------------------------
  'Date de début / date de fin': { section: 'Locataire & bail', type: 'champ_bail', libelle: 'Echéance du bail' },
  'Les parties': { section: 'Locataire & bail', type: 'champ_bail', libelle: 'Les parties' },
  'Conditions financières': { section: 'Locataire & bail', type: 'champ_bail', libelle: 'Loyer actuel' },
  'Désignation du bail': { section: 'Locataire & bail', type: 'champ_bail', libelle: 'Type de bail' },
  'Droit de cession ou non': { section: 'Locataire & bail', type: 'champ_bail', libelle: 'Droit de cession' },
  Indexation: { section: 'Locataire & bail', type: 'champ_bail', libelle: "Mode d'indexation" },
  'Dépôt de garantie & pas de porte': { section: 'Locataire & bail', type: 'champ_bail', libelle: 'Dépôt de garantie' },
  'Charges (qui paie quoi ?)': { section: 'Locataire & bail', type: 'champ_bail', libelle: 'Charges et taxes refacturées' },

  // --- PV d'AG --------------------------------------------------------------
  'Travaux votés': { section: 'Copropriété', type: 'texte', champ: 'resolutions_votees', libelle: 'Résolutions votées' },
  'Résolutions non votées (récurrentes)': { section: 'Copropriété', type: 'texte', champ: 'resolutions_refusees', libelle: 'Résolutions refusées' },

  // --- Règlement de copropriété --------------------------------------------
  'Activités autorisées': { section: 'Copropriété', type: 'texte', champ: 'activites_autorisees', libelle: 'Activités autorisées' },
  'Activités non autorisées': { section: 'Copropriété', type: 'texte', champ: 'activites_interdites', libelle: 'Activités interdites' },
  'Quote-part & tantièmes': { section: 'Copropriété', type: 'texte', champ: 'quote_part_lot', libelle: 'Quote-part du lot' },

  // --- Quittances -----------------------------------------------------------
  'Prix du loyer HC HT': { section: 'Locataire & bail', type: 'champ_bail', libelle: 'Loyer relevé sur quittances' },
  'Assujettissement à la TVA': { section: 'Simulateur', type: 'booleen', champ: 'sim_loyer_soumis_tva', libelle: 'Loyer soumis à TVA' },

  // --- Diagnostics ----------------------------------------------------------
  DPE: { section: 'Diagnostics', type: 'dpe', libelle: 'Note DPE et consommation' },
  Amiante: { section: 'Diagnostics', type: 'note_diag', libelle: 'Note « Amiante »' },
  ERP: { section: 'Diagnostics', type: 'note_diag', libelle: 'Note « ERP »' },
  Termites: { section: 'Diagnostics', type: 'note_diag', libelle: 'Note « Termites »' },
  Plomb: { section: 'Diagnostics', type: 'note_diag', libelle: 'Note « Plomb »' },
  Électricité: { section: 'Diagnostics', type: 'note_diag', libelle: 'Note « Électricité »' },
};

/** Toutes les lignes dépouillées du dossier, avec leur destination projet. */
export function donneesProjet(deal) {
  const lignes = [];
  for (const ext of deal?.extractions || []) {
    for (const l of ext.lignes || []) {
      if (!String(l.constat || '').trim()) continue;
      const cible = CIBLES[l.element] || null;
      lignes.push({
        element: l.element,
        constat: l.constat,
        commentaire: l.commentaire || '',
        statut: l.statut || null,
        page: l.page || null,
        document_nom: ext.document_nom,
        document_url: ext.document_url || null,
        extraction_id: ext.id,
        // Destination dans la fiche projet, ou null quand la grille relève un
        // élément qui n'a pas (encore) de case dédiée.
        section: cible?.section || null,
        champ: cible?.libelle || null,
      });
    }
  }
  return lignes;
}

// « Non », « non assujetti », « exonéré » → false ; « oui », « assujetti » → true.
function ouiNon(constat) {
  const t = String(constat || '').toLowerCase();
  if (/\bnon\b|exon[ée]r|hors\s+tva|sans\s+tva/.test(t)) return false;
  if (/\boui\b|assujetti|soumis/.test(t)) return true;
  return null;
}

function dpeDepuis(constat) {
  const t = String(constat || '');
  const note = t.match(/\b(?:classe|note|étiquette)?\s*([A-G])\b(?![a-z])/i);
  const conso = t.match(/(\d[\d\s.,]*)\s*kwh/i);
  return {
    note: note ? note[1].toUpperCase() : null,
    consommation: conso ? Math.round(Number(conso[1].replace(/[\s.,]/g, ''))) || null : null,
  };
}

/**
 * Patch à fusionner dans le projet : ce que le dépouillement sait remplir.
 * Ne remplace jamais une valeur déjà posée par la préanalyse — il complète.
 * @returns {{ patch: object, remplis: string[], ignores: string[] }}
 */
export function patchDepuisExtractions(deal, projet = {}) {
  const patch = {};
  const remplis = [];
  const ignores = [];

  const champsBail = [...(projet.bail_admin_fields || [])];
  const notesDiag = [...(projet.notes_diagnostique || [])];

  const poserChampBail = (libelle, valeur) => {
    const i = champsBail.findIndex((c) => c.label === libelle);
    if (i >= 0) {
      // Un champ prédéfini vide se remplit ; un champ déjà renseigné est laissé.
      if (String(champsBail[i].value || '').trim()) return false;
      champsBail[i] = { ...champsBail[i], value: valeur };
      return true;
    }
    champsBail.push({ label: libelle, value: valeur });
    return true;
  };

  for (const l of donneesProjet(deal)) {
    const cible = CIBLES[l.element];
    if (!cible) { ignores.push(l.element); continue; }
    const valeur = String(l.constat).trim();

    if (cible.type === 'champ_bail') {
      if (poserChampBail(cible.libelle, valeur)) remplis.push(cible.libelle);
      continue;
    }
    if (cible.type === 'texte') {
      const dejaLa = String(patch[cible.champ] ?? projet[cible.champ] ?? '').trim();
      if (dejaLa) continue;
      patch[cible.champ] = valeur;
      remplis.push(cible.libelle);
      continue;
    }
    if (cible.type === 'note_diag') {
      notesDiag.push({ titre: l.element, contenu: valeur });
      remplis.push(cible.libelle);
      continue;
    }
    if (cible.type === 'dpe') {
      const { note, consommation } = dpeDepuis(valeur);
      if (note && !projet.dpe_note) { patch.dpe_note = note; remplis.push('Note DPE'); }
      if (consommation && !projet.dpe_consommation) { patch.dpe_consommation = consommation; remplis.push('Consommation DPE'); }
      // Le constat complet reste lisible en note, la lettre seule perdrait le détail.
      notesDiag.push({ titre: 'DPE', contenu: valeur });
      continue;
    }
    if (cible.type === 'booleen') {
      const b = ouiNon(valeur);
      if (b !== null) { patch[cible.champ] = b; remplis.push(cible.libelle); }
      continue;
    }
  }

  if (champsBail.length) patch.bail_admin_fields = champsBail;
  if (notesDiag.length) patch.notes_diagnostique = notesDiag;
  return { patch, remplis, ignores };
}
