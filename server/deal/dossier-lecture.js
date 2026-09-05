// La lecture du dossier : ce que vingt documents disent du même bien.
//
// Une data room n'est pas une pile de pièces indépendantes : c'est un bien
// décrit par vingt sources qui doivent se recouper. Ce module ne relit rien —
// il croise ce que les extractions ont déjà relevé, et en tire quatre choses,
// dans l'ordre où on les lit :
//
//   1. le bien en huit lignes, chacune avec sa source ;
//   2. les contradictions entre documents — c'est là que la lecture croisée
//      vaut mieux qu'un résumé ;
//   3. les pièces qui manquent, à réclamer au vendeur ;
//   4. les points à trancher : ceux qui changent la décision ou le prix.
//
// Tout est déterministe : on compare des nombres et des dates relevés avec
// leur citation. Aucun modèle n'intervient ici.

import { Records } from '../db.js';

// ---------------------------------------------------------------------------
// Lire des valeurs dans une phrase
// ---------------------------------------------------------------------------

const NBSP = /[  \s]/g;

/** Les montants en euros d'une phrase, du plus grand au plus petit. */
export function montants(texte) {
  const t = String(texte || '');
  const trouves = [];
  const re = /(\d[\d  \s.]*(?:,\d{1,2})?)\s*(?:€|euros?\b)/gi;
  let m;
  while ((m = re.exec(t))) {
    const brut = m[1].replace(NBSP, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.');
    const v = Number(brut);
    if (Number.isFinite(v) && v > 0) trouves.push({ valeur: v, extrait: m[0].trim(), avant: t.slice(Math.max(0, m.index - 60), m.index) });
  }
  return trouves.sort((a, b) => b.valeur - a.valeur);
}

/** Les surfaces en m² d'une phrase. */
export function surfaces(texte) {
  const t = String(texte || '');
  const trouves = [];
  const re = /(\d[\d  \s.]*(?:,\d{1,2})?)\s*(?:m²|m2|mètres? carrés?)/gi;
  let m;
  while ((m = re.exec(t))) {
    const v = Number(m[1].replace(NBSP, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.'));
    if (Number.isFinite(v) && v > 0) trouves.push({ valeur: v, extrait: m[0].trim() });
  }
  return trouves.sort((a, b) => b.valeur - a.valeur);
}

const MOIS = {
  janvier: 1, février: 2, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6,
  juillet: 7, août: 8, aout: 8, septembre: 9, octobre: 10, novembre: 11, décembre: 12, decembre: 12,
};

/** Les dates d'une phrase, en ISO (jour, mois, année ou année seule). */
export function dates(texte) {
  const t = String(texte || '');
  const trouves = [];
  let m;
  const reLettres = /(\d{1,2})(?:er)?\s+([a-zéûôA-ZÉÛÔ]+)\s+(\d{4})/g;
  while ((m = reLettres.exec(t))) {
    const mois = MOIS[m[2].toLowerCase()];
    if (mois) trouves.push({ iso: `${m[3]}-${String(mois).padStart(2, '0')}-${String(Number(m[1])).padStart(2, '0')}`, annee: Number(m[3]), extrait: m[0] });
  }
  const reChiffres = /\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\b/g;
  while ((m = reChiffres.exec(t))) {
    trouves.push({ iso: `${m[3]}-${String(Number(m[2])).padStart(2, '0')}-${String(Number(m[1])).padStart(2, '0')}`, annee: Number(m[3]), extrait: m[0] });
  }
  return trouves;
}

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const val = (champ) => (champ && champ.absent === false ? champ.valeur : null);
const euros = (n) => `${Math.round(n).toLocaleString('fr-FR')} €`;

// ---------------------------------------------------------------------------
// Où chercher quoi
// ---------------------------------------------------------------------------

// Un fait du bien, et les endroits où les documents le disent. `motifs` cible
// l'intitulé de la ligne extraite ; `lire` en tire la valeur comparable.
const FAITS = [
  {
    cle: 'adresse',
    libelle: 'Adresse',
    motifs: [/designation|adresse|situation des locaux|immeuble/],
    types: ['bail', 'rcp', null],
    lire: (t) => ({ affiche: String(t).split(/\.\s|\sActivit/)[0].slice(0, 140) }),
  },
  {
    cle: 'surface',
    libelle: 'Surface',
    motifs: [/surface|superficie|carrez/],
    types: ['bail', 'diagnostics', 'rcp', null],
    lire: (t) => {
      const s = surfaces(t)[0];
      return s ? { nombre: s.valeur, affiche: `${s.valeur.toLocaleString('fr-FR')} m²` } : null;
    },
  },
  {
    cle: 'locataire',
    libelle: 'Locataire',
    motifs: [/les parties|preneur|locataire|exploitant/],
    types: ['bail', 'quittances'],
    lire: (t) => {
      const m = String(t).match(/preneur\s*:?\s*([^/;.\n]+)/i);
      return { affiche: (m ? m[1] : String(t)).trim().slice(0, 120) };
    },
  },
  {
    cle: 'loyer',
    libelle: 'Loyer annuel HT HC',
    motifs: [/conditions financieres|loyer/],
    types: ['bail', 'quittances'],
    lire: (t) => {
      // Le plus gros montant d'une clause financière est le loyer annuel ; un
      // « /mois » juste avant le dit mensuel, on le ramène à l'année.
      const liste = montants(t);
      if (!liste.length) return null;
      const annuel = liste.find((x) => /annuel|par an|\/an/i.test(x.avant + x.extrait)) || liste[0];
      const mensuel = /mois|mensuel/i.test(annuel.avant) && !/annuel/i.test(annuel.avant);
      const v = mensuel ? annuel.valeur * 12 : annuel.valeur;
      return { nombre: v, affiche: euros(v) };
    },
  },
  {
    cle: 'bail',
    libelle: 'Durée du bail',
    motifs: [/date de debut|duree|echeance|expiration/],
    types: ['bail'],
    lire: (t) => {
      const d = dates(t);
      const fin = d.length > 1 ? d[d.length - 1] : d[0];
      return fin ? { annee: fin.annee, iso: fin.iso, affiche: String(t).slice(0, 110) } : { affiche: String(t).slice(0, 110) };
    },
  },
  {
    cle: 'charges',
    libelle: 'Charges refacturées',
    motifs: [/charges/],
    types: ['bail', 'rcp'],
    lire: (t) => ({ affiche: String(t).slice(0, 160) }),
  },
  {
    cle: 'depot',
    libelle: 'Dépôt de garantie',
    motifs: [/depot de garantie|pas de porte|garantie/],
    types: ['bail'],
    lire: (t) => {
      const m = montants(t)[0];
      return m ? { nombre: m.valeur, affiche: euros(m.valeur) } : { affiche: String(t).slice(0, 110) };
    },
  },
];

/** Toutes les lignes extraites du dossier, avec leur provenance. */
function lignesDuDossier(deal) {
  const out = [];
  for (const e of deal.extractions || []) {
    if (e.erreur) continue;
    for (const [i, l] of (e.lignes || []).entries()) {
      if (!l.constat) continue;
      out.push({
        ...l,
        index: i,
        type: e.type || null,
        extraction_id: e.id,
        document: e.document_nom,
        document_url: e.document_url,
      });
    }
  }
  return out;
}

const source = (l) => ({
  document: l.document,
  page: l.page || null,
  extraction_id: l.extraction_id,
  index: l.index,
  citation: l.citation || null,
  element: l.element,
});

// ---------------------------------------------------------------------------
// 1. Le bien en huit lignes
// ---------------------------------------------------------------------------

export function ficheBien(deal) {
  const lignes = lignesDuDossier(deal);
  const lot = deal.lots?.[0]?.lot || {};
  const fiche = [];

  for (const fait of FAITS) {
    const candidats = lignes.filter(
      (l) => fait.motifs.some((m) => m.test(norm(l.element))) && (!fait.types || fait.types.includes(l.type))
    );
    let retenu = null;
    for (const c of candidats) {
      const lu = fait.lire(c.constat);
      if (lu && (lu.affiche || lu.nombre != null)) {
        retenu = { ...lu, source: source(c) };
        break;
      }
    }
    // À défaut de document, la pré-analyse a peut-être la valeur.
    if (!retenu) {
      const depuisFiche = {
        adresse: () => {
          const a = val(lot.adresse);
          if (!a) return null;
          return { affiche: typeof a === 'string' ? a : [a.rue, [a.code_postal, a.ville].filter(Boolean).join(' ')].filter(Boolean).join(', ') };
        },
        surface: () => (val(lot.surface_m2) ? { nombre: val(lot.surface_m2), affiche: `${val(lot.surface_m2)} m²` } : null),
        locataire: () => (val(lot.locataire_nom) ? { affiche: val(lot.locataire_nom) } : null),
        loyer: () => (val(lot.loyer_annuel_ht_hc) ? { nombre: val(lot.loyer_annuel_ht_hc), affiche: euros(val(lot.loyer_annuel_ht_hc)) } : null),
        bail: () => (val(lot.bail_echeance) ? { affiche: String(val(lot.bail_echeance)) } : null),
      }[fait.cle];
      const lu = depuisFiche?.();
      if (lu) retenu = { ...lu, source: { document: 'Fiche commerciale', page: null } };
    }
    fiche.push({ cle: fait.cle, libelle: fait.libelle, ...(retenu || { affiche: null, source: null }) });
  }

  // Le rendement se calcule : loyer retenu sur prix de revient annoncé.
  const loyer = fiche.find((f) => f.cle === 'loyer')?.nombre;
  const prix = val(lot.prix_fai);
  if (loyer && prix) {
    const r = (loyer / prix) * 100;
    fiche.push({
      cle: 'rendement',
      libelle: 'Rendement (loyer / prix FAI)',
      nombre: r,
      affiche: `${r.toFixed(2).replace('.', ',')} %`,
      source: { document: 'Calculé — loyer du bail sur prix annoncé', page: null },
    });
  } else {
    fiche.push({ cle: 'rendement', libelle: 'Rendement (loyer / prix FAI)', affiche: null, source: null });
  }

  return fiche;
}

// ---------------------------------------------------------------------------
// 2. Les contradictions entre documents
// ---------------------------------------------------------------------------

const ecartRelatif = (a, b) => Math.abs(a - b) / Math.max(a, b);

export function contradictions(deal) {
  const lignes = lignesDuDossier(deal);
  const lot = deal.lots?.[0]?.lot || {};
  const trouvees = [];

  const comparer = (sujet, releves, tolerance, formater) => {
    const propres = releves.filter((r) => Number.isFinite(r.valeur) && r.valeur > 0);
    if (propres.length < 2) return;
    const min = propres.reduce((a, b) => (a.valeur < b.valeur ? a : b));
    const max = propres.reduce((a, b) => (a.valeur > b.valeur ? a : b));
    if (ecartRelatif(min.valeur, max.valeur) <= tolerance) return;
    trouvees.push({
      sujet,
      ecart: formater(max.valeur - min.valeur),
      valeurs: propres.map((r) => ({ affiche: formater(r.valeur), ...r.source })),
    });
  };

  // Le loyer : bail, quittances, fiche commerciale.
  const loyers = [];
  for (const l of lignes) {
    if (!/conditions financieres|loyer/.test(norm(l.element))) continue;
    if (!['bail', 'quittances'].includes(l.type)) continue;
    const liste = montants(l.constat);
    if (!liste.length) continue;
    const cand = liste.find((x) => /annuel|par an|\/an/i.test(x.avant + x.extrait)) || liste[0];
    const mensuel = /mois|mensuel/i.test(cand.avant) && !/annuel/i.test(cand.avant);
    loyers.push({ valeur: mensuel ? cand.valeur * 12 : cand.valeur, source: source(l) });
  }
  if (val(lot.loyer_annuel_ht_hc)) loyers.push({ valeur: val(lot.loyer_annuel_ht_hc), source: { document: 'Fiche commerciale', page: null, element: 'Loyer annoncé' } });
  comparer('Loyer annuel HT HC', loyers, 0.03, (v) => euros(v));

  // La surface : bail, diagnostics (Carrez), règlement, fiche.
  const surf = [];
  for (const l of lignes) {
    if (!/surface|superficie|carrez/.test(norm(l.element))) continue;
    const s = surfaces(l.constat)[0];
    if (s) surf.push({ valeur: s.valeur, source: source(l) });
  }
  if (val(lot.surface_m2)) surf.push({ valeur: val(lot.surface_m2), source: { document: 'Fiche commerciale', page: null, element: 'Surface annoncée' } });
  comparer('Surface', surf, 0.05, (v) => `${v.toLocaleString('fr-FR')} m²`);

  // L'échéance du bail : l'année, dite par plusieurs pièces.
  const echeances = [];
  for (const l of lignes) {
    if (!/date de debut|duree|echeance|expiration|bail/.test(norm(l.element))) continue;
    const d = dates(l.constat);
    if (!d.length) continue;
    const fin = d[d.length - 1];
    if (fin.annee >= 2000 && fin.annee <= 2100) echeances.push({ annee: fin.annee, source: source(l) });
  }
  if (val(lot.bail_echeance)) {
    const d = dates(String(val(lot.bail_echeance)));
    if (d.length) echeances.push({ annee: d[d.length - 1].annee, source: { document: 'Fiche commerciale', page: null, element: 'Échéance annoncée' } });
  }
  const annees = [...new Set(echeances.map((e) => e.annee))];
  if (annees.length > 1) {
    trouvees.push({
      sujet: 'Échéance du bail',
      ecart: `${Math.max(...annees) - Math.min(...annees)} an(s) d'écart`,
      valeurs: echeances.map((e) => ({ affiche: String(e.annee), ...e.source })),
    });
  }

  return trouvees;
}

// ---------------------------------------------------------------------------
// 3. Ce qui manque
// ---------------------------------------------------------------------------

// Ce qu'une data room d'un local commercial loué doit contenir. `motifs`
// reconnaît la pièce par son nom de fichier ou sa catégorie.
export const PIECES_ATTENDUES = [
  { cle: 'bail', libelle: 'Bail commercial en cours', type: 'bail', motifs: [/bail/], essentiel: true },
  { cle: 'avenants', libelle: 'Avenants au bail', motifs: [/avenant/] },
  { cle: 'quittances', libelle: 'Dernières quittances de loyer', type: 'quittances', motifs: [/quittance|appel de loyer/], essentiel: true },
  { cle: 'etat_lieux', libelle: "État des lieux d'entrée", motifs: [/etat des lieux|edl/], essentiel: true },
  { cle: 'caution', libelle: 'Caution ou garantie du preneur', motifs: [/caution|garantie|acte de cautionnement/] },
  { cle: 'pv_ag', libelle: "Trois derniers PV d'assemblée générale", type: 'pv_ag', motifs: [/\bag\b|assembl|proces.?verbal|\bpv\b/], essentiel: true },
  { cle: 'rcp', libelle: 'Règlement de copropriété et EDD', type: 'rcp', motifs: [/copropriet|reglement|\brcp\b|edd|descriptif de division/], essentiel: true },
  { cle: 'charges', libelle: 'Appels de charges et budget prévisionnel', motifs: [/charge|budget|appel de fonds/] },
  { cle: 'diagnostics', libelle: 'Diagnostics (DPE, amiante, ERP, électricité)', type: 'diagnostics', motifs: [/diagnostic|dpe|amiante|erp|electric|termite|plomb/], essentiel: true },
  { cle: 'carrez', libelle: 'Mesurage (surface) et plans', motifs: [/carrez|mesurage|plan/] },
  { cle: 'taxe', libelle: 'Avis de taxe foncière', motifs: [/taxe fonciere|fonciere|teom/], essentiel: true },
  { cle: 'assurance', libelle: "Attestation d'assurance du preneur", motifs: [/assurance|attestation/] },
  { cle: 'kbis', libelle: 'Kbis et comptes du locataire', motifs: [/kbis|bilan|liasse|comptes/] },
];

export function piecesManquantes(deal) {
  const docs = (deal.documents_espace || []).map((d) => ({
    nom: d.nom || '',
    categorie: d.categorie || '',
    texte: norm(`${d.nom || ''} ${d.categorie || ''}`),
  }));
  const types = new Set((deal.extractions || []).map((e) => e.type).filter(Boolean));

  return PIECES_ATTENDUES.map((p) => {
    const parNom = docs.filter((d) => p.motifs.some((m) => m.test(d.texte)));
    const presente = parNom.length > 0 || (p.type && types.has(p.type));
    return {
      cle: p.cle,
      libelle: p.libelle,
      essentiel: !!p.essentiel,
      presente,
      documents: parNom.map((d) => d.nom),
    };
  });
}

// ---------------------------------------------------------------------------
// 4. Les points à trancher
// ---------------------------------------------------------------------------

// Ce qui change une décision ou un prix, par ordre de poids.
const POIDS = [
  [/cession|deplafonnement|resiliation|conge|expiration|renouvellement|expir/, 5],
  [/article 606|grosses reparations|travaux|ravalement|toiture|etancheite|ascenseur/, 5],
  [/impay|contentieux|procedure|litige|redressement|liquidation/, 5],
  [/amiante|icpe|pollution|accessibilit|conformit|erp|securite/, 4],
  [/indexation|charges|taxe fonciere|teom|refactur/, 3],
  [/destination|activite|enseigne|sous-location/, 3],
  [/depot de garantie|caution|garantie/, 2],
];

const POIDS_TYPE = { bail: 3, pv_ag: 3, rcp: 2, quittances: 2, diagnostics: 2 };

export function aTrancher(deal, { max = 5 } = {}) {
  const lignes = lignesDuDossier(deal).filter((l) => l.statut === 'Point de vigilance');
  const notes = lignes.map((l) => {
    const t = norm(`${l.element} ${l.constat} ${l.commentaire || ''}`);
    let poids = POIDS_TYPE[l.type] || 1;
    for (const [motif, p] of POIDS) if (motif.test(t)) poids += p;
    return { ...l, poids };
  });
  notes.sort((a, b) => b.poids - a.poids);
  return notes.slice(0, max).map((l) => ({
    element: l.element,
    constat: l.constat,
    commentaire: l.commentaire || null,
    poids: l.poids,
    source: source(l),
  }));
}

// ---------------------------------------------------------------------------
// La lecture complète
// ---------------------------------------------------------------------------

export function lireDossier(dealId) {
  const deal = Records.filter('Deal', { deal_id: dealId })[0];
  if (!deal) return null;
  const pieces = piecesManquantes(deal);
  return {
    fiche: ficheBien(deal),
    contradictions: contradictions(deal),
    pieces,
    manquantes: pieces.filter((p) => !p.presente),
    a_trancher: aTrancher(deal),
    documents: (deal.documents_espace || []).length,
    analyses: (deal.extractions || []).filter((e) => !e.erreur).length,
    a_classer: (deal.documents_espace || []).filter((d) => !d.categorie).length,
  };
}
