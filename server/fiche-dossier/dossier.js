// Ce que la plateforme sait déjà d'un bien, pour la fiche (19 nov. 2026, Jules, maquette « Murs de pharmacie ») :
// l'avancement (fiche reçue, pré-analyse, documents, analyse, projet, visios, LOI, compromis, acte), l'identité
// (activité, prix, rendement, loyer, surface, locataire, bail), la négociation (prix demandé, offre de la LOI, ce que
// les notes en disent) et une relance suggérée quand rien ne bouge. Rien à ressaisir : le dossier, le projet, la LOI
// et les pièces font foi ; les notes complètent ce qu'ils ne savent pas (une visio, une contre-offre).

import { Records } from '../db.js';
import { montant } from '../montants.js';

export const ETAPES = ['Fiche reçue', 'Pré-analyse', 'Documents', 'Analyse', 'Projet', 'Visios', 'LOI', 'Compromis', 'Acte'];
const PIECES = [['bail', 'bail'], ['pv_ag', "PV d'AG"], ['rcp', 'règlement de copropriété'], ['quittances', 'quittances'], ['diagnostics', 'diagnostics']];

const val = (c) => (c && typeof c === 'object' ? (c.absent === false || c.valeur != null ? c.valeur : null) : c ?? null);
const nombre = (v) => { const n = Number(String(v ?? '').replace(/[^\d.,-]/g, '').replace(',', '.')); return Number.isFinite(n) && n ? n : null; };
const jours = (iso, maintenant) => Math.floor((maintenant.getTime() - new Date(iso).getTime()) / 864e5);
const phrase = (t) => { const s = String(t || '').trim().toLowerCase(); return s ? s[0].toUpperCase() + s.slice(1) : null; };

/** Le dossier et le projet d'une clé de bien. */
function lesDeux(cle) {
  const [type, id] = [cle.split(':')[0], cle.split(':').slice(1).join(':')];
  if (type === 'deal') {
    const deal = Records.findBy('Deal', 'deal_id', id);
    const projet = deal?.projet_id ? Records.get('Project', deal.projet_id) : Records.findBy('Project', 'deal_id', id);
    return { deal, projet };
  }
  if (type === 'projet') {
    const projet = Records.get('Project', id);
    return { deal: projet?.deal_id ? Records.findBy('Deal', 'deal_id', projet.deal_id) : null, projet };
  }
  return { deal: null, projet: null };
}

/** L'identité du bien : le projet d'abord (il a été relu), sinon ce que la fiche commerciale a donné. */
export function identite({ deal, projet }) {
  const lot = deal?.lots?.[0]?.lot || {};
  const adresse = val(lot.adresse);
  const ville = projet?.ville_secteur_champ1 || (adresse && typeof adresse === 'object' ? adresse.ville || adresse.commune : null) || deal?.lots?.[0]?.enrichissement?.commune?.nom || null;
  const prix = nombre(projet?.prix_acquisition) || nombre(val(lot.prix_fai));
  const loyer = nombre(projet?.loyer_annuel_ht) || nombre(val(lot.loyer_annuel_ht_hc));
  const rendement = nombre(projet?.rendement_locatif) || nombre(val(lot.rendement_annonce)) || (prix && loyer ? Math.round((loyer / prix) * 1000) / 10 : null);
  return {
    activite: projet?.activite_locataire || val(lot.locataire_activite) || null,
    locataire: projet?.nom_locataire || val(lot.locataire_nom) || null,
    ville,
    adresse: projet?.adresse_complete || (typeof adresse === 'string' ? adresse : adresse?.valeur || null),
    prix, prix_lisible: montant(prix),
    loyer, loyer_lisible: loyer ? `${montant(loyer)} par an` : null,
    rendement, rendement_lisible: rendement ? `${String(rendement).replace('.', ',')} %` : null,
    surface: nombre(projet?.surface_m2) || nombre(val(lot.surface_m2)),
    bail: projet?.echeance_bail || val(lot.bail_echeance) || null,
  };
}

/**
 * L'avancement, du plus récent au plus ancien : seules les étapes franchies, chacune avec sa date et ce qu'il faut en
 * savoir. `etapesNotees` : les étapes que les notes ont posées ({ etape, le }), pour ce que la plateforme ne voit pas.
 */
export function avancement({ deal, projet }, { etape = null, etapesNotees = [], visios = 0, maintenant = new Date() } = {}) {
  const suivi = deal?.suivi || [];
  const quand = (pred) => suivi.find(pred)?.le || null;
  const note = (nom) => etapesNotees.filter((e) => e.etape === nom).map((e) => e.le).sort()[0] || null;
  const lettres = deal ? Records.filter('LettreIntention', { deal_id: deal.deal_id }) : projet ? Records.filter('LettreIntention', { projet_id: projet.id }) : [];
  const loi = lettres.sort((a, b) => String(a.cree_le).localeCompare(String(b.cree_le)))[0] || null;
  const verdict = deal?.lots?.[0]?.evaluation?.verdict || null;
  const presents = new Set();
  for (const d of deal?.documents_espace || []) {
    const t = String(d.categorie || d.nom || '').toLowerCase();
    for (const [cle] of PIECES) if (t.includes(cle.replace('_', ' ')) || t.includes(cle)) presents.add(cle);
  }
  const nbPieces = (deal?.documents_espace || []).length;
  const manquent = nbPieces ? PIECES.filter(([c]) => !presents.has(c)).map(([, l]) => l) : [];
  const etapes = [
    { nom: 'Fiche reçue', le: deal?.cree_le || deal?.created_date || projet?.created_date || null },
    { nom: 'Pré-analyse', le: quand((s) => s.type === 'analyse') || (verdict ? deal?.cree_le : null), detail: phrase(verdict) },
    { nom: 'Documents', le: quand((s) => s.vers === 'documents_recus') || quand((s) => s.vers === 'documents_demandes') || note('Documents'),
      detail: nbPieces ? `${nbPieces} reçu${nbPieces > 1 ? 's' : ''}${manquent.length ? `, ${manquent.slice(0, 2).join(' et ')} manquant${manquent.length > 1 ? 's' : ''}` : ''}` : deal?.statut === 'documents_demandes' ? 'demandés, rien reçu' : null },
    { nom: 'Analyse', le: quand((s) => s.vers === 'depouille') || note('Analyse') },
    { nom: 'Projet', le: projet?.created_date || quand((s) => s.vers === 'projet_cree') || note('Projet') },
    { nom: 'Visios', le: note('Visios'), detail: visios ? `${visios} faite${visios > 1 ? 's' : ''}` : null },
    { nom: 'LOI', le: loi?.cree_le || note('LOI'), detail: loi?.champs?.prix ? `${montant(nombre(loi.champs.prix)) || loi.champs.prix} proposés` : null },
    { nom: 'Compromis', le: note('Compromis') },
    { nom: 'Acte', le: note('Acte') },
  ];
  // L'étape posée par une note vaut aussi pour celles d'avant, même sans date.
  const rang = etape ? ETAPES.indexOf(etape) : -1;
  const franchies = etapes.filter((e, i) => e.le || i <= rang);
  // Les étapes que les notes disent avec leurs mots (« Offre · non contresignée ») se rangent à leur date parmi celles
  // de la plateforme ; une étape habituelle notée prend le détail de la note (19 nov. 2026, Jules).
  const derniereNote = (nom) => etapesNotees.filter((e) => e.etape === nom).sort((a, b) => String(b.le).localeCompare(String(a.le)))[0] || null;
  for (const e of franchies) { const n = derniereNote(e.nom); if (n?.detail) e.detail = n.detail; }
  const libres = [...new Set(etapesNotees.map((e) => e.etape))].filter((nom) => !ETAPES.includes(nom)).map((nom) => { const n = derniereNote(nom); return { nom, le: n.le, detail: n.detail }; });
  const toutes = franchies.slice().reverse();
  for (const l of libres) {
    // Avant la première étape datée plus ancienne qu'elle ; les étapes sans date gardent leur ordre.
    const i = toutes.findIndex((e) => e.le && String(e.le) < String(l.le));
    toutes.splice(i === -1 ? toutes.length : i, 0, l);
  }
  const courante = toutes[0] || null;
  return {
    etapes: toutes.map((e, i) => ({ ...e, courante: i === 0 })),
    resume: courante ? `${courante.nom}${courante.le ? ` · ${new Date(courante.le).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}` : ''}` : null,
    loi, manquent, depuis_loi: loi ? jours(loi.cree_le, maintenant) : null,
  };
}

/** Une relance suggérée quand le dossier attend sans action prévue : la LOI sans réponse, les pièces qui ne viennent pas. */
export function suggestion({ deal }, av, { derniere = null, maintenant = new Date() } = {}) {
  const calme = derniere ? jours(derniere, maintenant) : null;
  if (av.loi && av.depuis_loi >= 7 && (calme == null || calme >= 7) && av.etapes[0]?.nom === 'LOI') {
    return { texte: `Relancer le vendeur par l'agent : pas de réponse à la LOI depuis ${av.depuis_loi} jours.`, demande: `Prépare un message WhatsApp à l'agent pour relancer le vendeur : notre LOI est sans réponse depuis ${av.depuis_loi} jours.` };
  }
  const demandes = (deal?.suivi || []).filter((s) => s.vers === 'documents_demandes').map((s) => s.le).sort().pop();
  if (deal?.statut === 'documents_demandes' && demandes && jours(demandes, maintenant) >= 5) {
    const n = jours(demandes, maintenant);
    return { texte: `Relancer l'agent pour les documents : demandés il y a ${n} jours.`, demande: `Prépare un message WhatsApp à l'agent pour relancer les documents demandés il y a ${n} jours.` };
  }
  return null;
}

/** Tout ce que la fiche d'un bien reprend du dossier. */
export function donneesDuBien(cle, { etape = null, entrees = [], maintenant = new Date() } = {}) {
  const deux = lesDeux(cle);
  if (!deux.deal && !deux.projet) return null;
  const etapesNotees = entrees.filter((e) => e.genre === 'etape').map((e) => {
    const [etape, ...detail] = String(e.texte).replace(/^Étape : /, '').split(' · ');
    return { etape, detail: detail.join(' · ') || null, le: e.le };
  });
  const visios = entrees.filter((e) => e.genre === 'etape' && /Visios/.test(e.texte)).length;
  // Une offre notée en négociation est une étape, même sans note qui la pose (19 nov. 2026, Jules : « on a déjà fait
  // l'offre, ça ne doit pas rester en Projet ») : « Offre » à la date de la première, si rien n'a été noté depuis.
  const premiereOffre = entrees.filter((e) => e.genre === 'negociation' && /offre/i.test(e.texte)).map((e) => e.le).sort()[0] || null;
  if (premiereOffre && !etapesNotees.some((e) => String(e.le) >= String(premiereOffre))) etapesNotees.push({ etape: 'Offre', detail: null, le: premiereOffre });
  const id = identite(deux);
  const av = avancement(deux, { etape, etapesNotees, visios, maintenant });
  const derniere = entrees.map((e) => e.le).sort().pop() || null;
  const offre = av.loi?.champs?.prix ? nombre(av.loi.champs.prix) : null;
  const nego = entrees.filter((e) => e.genre === 'negociation').sort((a, b) => String(b.le).localeCompare(String(a.le)));
  return {
    identite: id,
    avancement: { etapes: av.etapes, resume: av.resume },
    negociation: {
      demande: id.prix_lisible, offre: montant(offre),
      resume: offre && id.prix ? `Offre ${montant(offre)} sur ${id.prix_lisible} demandés` : nego[0]?.texte || (id.prix ? `${id.prix_lisible} demandés` : null),
      lignes: nego.map((e) => ({ texte: e.texte, le: e.le })),
    },
    suggestion: suggestion(deux, av, { derniere, maintenant }),
  };
}
