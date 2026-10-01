// Les quatre pages de travail du mandataire (spécification V1, sections 7 à
// 10) : Estimation (porte 1), Mandat, Dossier (porte 2), Mise en marché
// (porte 3). Chacune a son objet et ses statuts, indépendants des autres :
// on peut demander un mandat sans estimation, déposer un dossier sans mandat.
//
// Deux mains touchent ces objets. Le mandataire crée, dépose, envoie ; Klocka
// (l'admin) valide aux portes. Chaque fonction dit qui a le droit : `siens`
// pour le mandataire (sa propre adresse), `admin` pour l'équipe. La route
// vérifie le rôle, ici on vérifie la propriété.
//
// Rien ne part vers un tiers d'ici : le rapport validé, le mandat prêt, la
// relance du propriétaire se préparent ; le mandataire les envoie lui-même.

import { Records, Meta } from './db.js';

const maintenant = () => new Date().toISOString();
const emailDe = (user) => String(user?.email || '').toLowerCase();
const estAdmin = (user) => user?.role === 'admin';
const trace = (x, action, user, detail = null) => [...(x.historique || []), { le: maintenant(), par: user?.email || null, action, ...(detail ? { detail } : {}) }];

/** Le mandataire voit les siens ; l'admin voit tout. */
function lire(entite, id, user) {
  const x = Records.get(entite, id);
  if (!x) return null;
  return estAdmin(user) || x.mandataire_email === emailDe(user) ? x : null;
}
const lister = (entite, user) =>
  Records.list(entite)
    .filter((x) => estAdmin(user) || x.mandataire_email === emailDe(user))
    .sort((a, b) => String(b.cree_le || '').localeCompare(String(a.cree_le || '')));

/** Une transition : l'état de départ doit être l'un des attendus. */
function passer(entite, x, attendus, statut, user, action, extra = {}) {
  if (!attendus.includes(x.statut)) return { ok: false, error: `Impossible depuis « ${x.statut} ».` };
  const maj = Records.update(entite, x.id, { ...extra, statut, [`${statut}_le`]: maintenant(), historique: trace(x, action, user, extra.commentaire || null) });
  return { ok: true, [entite === 'EstimationMandataire' ? 'estimation' : entite === 'MandatMandataire' ? 'mandat' : entite === 'DossierMandataire' ? 'dossier' : 'marche']: maj };
}

// ===========================================================================
// 1. Estimation — porte 1
// Brouillon → En validation → Validé → Envoyé
// ===========================================================================

// L'estimation est autonome : le mandataire la fait lui-même, par le chat ou
// à la main, avec les outils de marché de la maison. Pas de validation Klocka
// sur cette porte (décision de Jules, 1er octobre 2026) ; le mandat et le
// dossier gardent la leur. Les anciens statuts en_validation/valide se lisent
// comme « prete ».
export const STATUTS_ESTIMATION = ['brouillon', 'prete', 'envoye'];
const statutEstimation = (s) => (['en_validation', 'valide'].includes(s) ? 'prete' : s);

export const listerEstimations = (user) => lister('EstimationMandataire', user);
export const lireEstimation = (id, user) => lire('EstimationMandataire', id, user);

export function creerEstimation({ bien, adresse = null, infos_rdv = null, proprietaire_id = null }, user) {
  if (!String(bien || adresse || '').trim()) return { ok: false, error: 'Nommez le bien ou donnez son adresse.' };
  const e = Records.create('EstimationMandataire', {
    mandataire_email: emailDe(user),
    bien: String(bien || adresse).trim(),
    adresse: adresse ? String(adresse).trim() : null,
    infos_rdv: infos_rdv ? String(infos_rdv).trim() : null,
    proprietaire_id,
    bail: null,
    rapport: null,
    statut: 'brouillon',
    cree_le: maintenant(),
    historique: [{ le: maintenant(), par: user?.email || null, action: 'créée' }],
  });
  return { ok: true, estimation: e };
}

export function modifierEstimation(id, patch, user) {
  const e = lireEstimation(id, user);
  if (!e) return { ok: false, error: 'Estimation introuvable.' };
  // Tout se retouche tant que le rapport n'est pas parti au propriétaire.
  if (statutEstimation(e.statut) === 'envoye') return { ok: false, error: 'Ce rapport est parti : il ne se modifie plus.' };
  const champs = {};
  for (const c of ['bien', 'adresse', 'infos_rdv']) if (c in patch) champs[c] = patch[c] ? String(patch[c]).trim() : null;
  if (patch.rapport && typeof patch.rapport === 'object') champs.rapport = { ...(e.rapport || {}), ...patch.rapport };
  return { ok: true, estimation: Records.update('EstimationMandataire', e.id, champs) };
}

/** Le bail déposé : le fichier, et son texte lu (PDF, photo, Word). */
export async function deposerBail(id, fichier, user) {
  const e = lireEstimation(id, user);
  if (!e) return { ok: false, error: 'Estimation introuvable.' };
  if (e.statut !== 'brouillon') return { ok: false, error: 'Le bail se change tant que le rapport est en brouillon.' };
  const { ingerer } = await import('./deal/ingest.js');
  const lu = await ingerer({ buffer: fichier.buffer, filename: fichier.filename, mimetype: fichier.mimetype });
  const bail = { nom: fichier.filename, url: fichier.url, texte: String(lu.texte || '').slice(0, 60_000), transcrit: !!lu.transcrit, le: maintenant() };
  return { ok: true, estimation: Records.update('EstimationMandataire', e.id, { bail }) };
}

/** Pure : la fourchette de prix tirée du loyer et des taux. Un taux haut fait un prix bas. */
export function fourchettePrix(loyerAnnuel, tauxBas, tauxHaut) {
  const l = Number(loyerAnnuel);
  const b = Number(tauxBas);
  const h = Number(tauxHaut);
  if (!(l > 0) || !(b > 0) || !(h > 0)) return null;
  const arrondi = (n) => Math.round(n / 5000) * 5000;
  return { prix_bas: arrondi(l / (Math.max(b, h) / 100)), prix_haut: arrondi(l / (Math.min(b, h) / 100)) };
}

const SCHEMA_RAPPORT = {
  type: 'object',
  properties: {
    bail: {
      type: 'object',
      properties: {
        locataire: { type: ['string', 'null'] },
        enseigne: { type: ['string', 'null'] },
        activite: { type: ['string', 'null'] },
        loyer_annuel_hc: { type: ['number', 'null'] },
        surface_m2: { type: ['number', 'null'] },
        date_effet: { type: ['string', 'null'] },
        echeance: { type: ['string', 'null'] },
        duree: { type: ['string', 'null'] },
        indexation: { type: ['string', 'null'] },
        charges: { type: ['string', 'null'], description: 'Taxe foncière, charges, travaux : qui paie quoi' },
      },
    },
    taux_bas: { type: 'number', description: 'Taux de rendement bas (%), le prix haut' },
    taux_haut: { type: 'number', description: 'Taux de rendement haut (%), le prix bas' },
    justification_taux: { type: 'string' },
    loyer_marche: { type: 'string', description: 'Le loyer du bail face au marché (sur-loué, dans le marché, sous-loué), chiffres à l’appui' },
    enseigne: { type: 'object', properties: { solidite: { type: 'string', enum: ['forte', 'moyenne', 'fragile', 'inconnue'] }, commentaire: { type: 'string' } } },
    emplacement: { type: 'string' },
    vigilance: { type: 'array', items: { type: 'string' } },
    synthese: { type: 'string', description: 'Trois phrases pour le propriétaire' },
  },
  required: ['bail', 'taux_bas', 'taux_haut', 'vigilance', 'synthese'],
};

/**
 * Le rapport de valorisation en brouillon : le bail lu, le marché de la rue
 * (Equimmox, Data-B, DVF en secours), la solidité de l'enseigne, les points
 * de vigilance. Les prix se calculent ici, pas dans le modèle : loyer ÷ taux.
 */
export async function genererRapport(id, user) {
  const e = lireEstimation(id, user);
  if (!e) return { ok: false, error: 'Estimation introuvable.' };
  if (statutEstimation(e.statut) === 'envoye') return { ok: false, error: 'Ce rapport est parti au propriétaire : il ne se régénère plus.' };
  if (!e.bail?.texte && !e.infos_rdv) return { ok: false, error: 'Déposez la photo du bail ou dictez les infos du rendez-vous.' };

  let marche = null;
  if (e.adresse) {
    try {
      const { valeurLocative } = await import('./valeur-locative.js');
      const r = await valeurLocative(e.adresse, { user });
      if (r.ok) marche = r.resultat;
    } catch (err) {
      console.warn(`[estimation] marché indisponible : ${err?.message || err}`);
    }
  }

  const { invokeLLM } = await import('./llm.js');
  const brut = await invokeLLM({
    prompt:
      `Tu prépares, pour un mandataire K Partners, le brouillon d'un rapport de valorisation de murs commerciaux, destiné au propriétaire après validation par un analyste Klocka.\n` +
      `Règles : n'invente aucun chiffre du bail ; ce qui n'est pas écrit reste null. Le taux de rendement tient compte de l'emplacement, de l'enseigne, de la durée restante du bail et du loyer face au marché (murs commerciaux en France : 5 à 9 % le plus souvent). Les points de vigilance sont concrets (échéance proche, loyer au-dessus du marché, charges non refacturées, locataire fragile, clause d'indexation absente…).\n\n` +
      `Nous sommes le ${new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' })} : les échéances se comptent depuis aujourd'hui.\n` +
      `Bien : ${e.bien}${e.adresse ? `, ${e.adresse}` : ''}\n` +
      `Infos du rendez-vous : ${e.infos_rdv || '(aucune)'}\n\n` +
      `Marché (loyers au m² par an, Equimmox / Data-B / DVF) : ${marche ? JSON.stringify({ rue: marche.rue, quartier: marche.quartier, ville: marche.ville }).slice(0, 3000) : '(indisponible)'}\n\n` +
      `Bail :\n${e.bail?.texte ? e.bail.texte.slice(0, 40_000) : '(pas de bail déposé)'}`,
    response_json_schema: SCHEMA_RAPPORT,
  });
  if (!brut || typeof brut !== 'object') return { ok: false, error: 'La lecture n’a rien rendu : réessayez.' };

  const loyer = brut.bail?.loyer_annuel_hc ?? null;
  const prix = fourchettePrix(loyer, brut.taux_bas, brut.taux_haut);
  const rapport = {
    ...brut,
    ...(prix || { prix_bas: null, prix_haut: null }),
    rendement: loyer && prix ? { bas: brut.taux_bas, haut: brut.taux_haut } : null,
    marche: marche ? { rue: marche.rue || null, quartier: marche.quartier || null, ville: marche.ville || null, source: marche.source || null, unite: marche.unite || '€/m²/an' } : null,
    genere_le: maintenant(),
  };
  // L'appel au modèle a pris du temps : si l'estimation est partie en
  // validation entre-temps, on n'écrase rien.
  const frais = Records.get('EstimationMandataire', e.id);
  if (!frais || statutEstimation(frais.statut) === 'envoye') return { ok: false, error: 'L’estimation a changé pendant la rédaction : rien n’a été écrasé.' };
  const maj = Records.update('EstimationMandataire', e.id, { rapport, statut: 'prete', prete_le: frais.prete_le || maintenant(), historique: trace(frais, 'rapport généré', user) });
  return { ok: true, estimation: maj };
}

export function marquerEstimationEnvoyee(id, user) {
  const e = lireEstimation(id, user);
  if (!e) return { ok: false, error: 'Estimation introuvable.' };
  if (statutEstimation(e.statut) !== 'prete') return { ok: false, error: 'Rédigez le rapport avant de le marquer envoyé.' };
  return { ok: true, estimation: Records.update('EstimationMandataire', e.id, { statut: 'envoye', envoye_le: maintenant(), historique: trace(e, 'envoyée au propriétaire', user) }) };
}

// ===========================================================================
// 2. Mandat
// Demande envoyée → Mandat prêt → Signé → Enregistré
//
// MyNotary n'a pas d'API branchée ici : la demande part dans la file de
// Klocka, qui la saisit sur MyNotary et dépose le mandat rédigé. C'est ce
// dépôt qui le rend « prêt » chez le mandataire.
// ===========================================================================

export const TYPES_MANDAT = ['simple', 'exclusif'];
export const listerMandats = (user) => lister('MandatMandataire', user);
export const lireMandat = (id, user) => lire('MandatMandataire', id, user);

export function demanderMandat(champs, user) {
  const vendeur = String(champs.vendeur || '').trim();
  const bien = String(champs.bien || '').trim();
  const prix = Number(champs.prix);
  const honoraires = Number(champs.honoraires);
  const duree = Number(champs.duree_mois);
  if (!vendeur || !bien) return { ok: false, error: 'Le vendeur et le bien sont nécessaires.' };
  if (!(prix > 0)) return { ok: false, error: 'Le prix est nécessaire.' };
  if (!(honoraires >= 0) || champs.honoraires === '' || champs.honoraires == null) return { ok: false, error: 'Les honoraires sont nécessaires.' };
  if (!TYPES_MANDAT.includes(champs.type)) return { ok: false, error: 'Mandat simple ou exclusif ?' };
  if (!(duree > 0)) return { ok: false, error: 'La durée est nécessaire.' };
  const m = Records.create('MandatMandataire', {
    mandataire_email: emailDe(user),
    vendeur, bien,
    vendeur_contact: champs.vendeur_contact ? String(champs.vendeur_contact).trim() : null,
    prix, honoraires,
    honoraires_charge: champs.honoraires_charge === 'acquereur' ? 'acquereur' : 'vendeur',
    type: champs.type, duree_mois: duree,
    estimation_id: champs.estimation_id || null,
    statut: 'demande_envoyee',
    reference_mynotary: null, document: null, document_signe: null, numero_registre: null,
    cree_le: maintenant(),
    demande_envoyee_le: maintenant(),
    historique: [{ le: maintenant(), par: user?.email || null, action: 'demande envoyée' }],
  });
  return { ok: true, mandat: m };
}

/** Klocka dépose le mandat rédigé sur MyNotary : il est prêt à signer. */
export function deposerMandatPret(id, { document, reference_mynotary = null }, user) {
  if (!estAdmin(user)) return { ok: false, error: 'Réservé à Klocka.' };
  const m = lireMandat(id, user);
  if (!m) return { ok: false, error: 'Mandat introuvable.' };
  if (!document?.url) return { ok: false, error: 'Joignez le mandat rédigé.' };
  return passer('MandatMandataire', m, ['demande_envoyee', 'pret'], 'pret', user, 'mandat prêt', { document, reference_mynotary: reference_mynotary || m.reference_mynotary });
}

/** Le mandataire dépose le mandat signé. */
export function deposerMandatSigne(id, document, user) {
  const m = lireMandat(id, user);
  if (!m) return { ok: false, error: 'Mandat introuvable.' };
  if (!document?.url) return { ok: false, error: 'Joignez le mandat signé.' };
  return passer('MandatMandataire', m, ['pret'], 'signe', user, 'signé', { document_signe: document });
}

/** Pure : le prochain numéro du registre, « 2026-0007 ». */
export function numeroSuivant(annee, dernier) {
  return `${annee}-${String((Number(dernier) || 0) + 1).padStart(4, '0')}`;
}

/** Klocka l'inscrit au registre des mandats : numéro d'ordre, sans trou. */
export function enregistrerMandat(id, user) {
  if (!estAdmin(user)) return { ok: false, error: 'Réservé à Klocka.' };
  const m = lireMandat(id, user);
  if (!m) return { ok: false, error: 'Mandat introuvable.' };
  if (m.statut !== 'signe') return { ok: false, error: 'Seul un mandat signé s’inscrit au registre.' };
  const annee = new Date().getFullYear();
  const cle = `registre-mandats:${annee}`;
  const dernier = Number(Meta.get(cle) || 0);
  const numero = numeroSuivant(annee, dernier);
  Meta.set(cle, String(dernier + 1));
  return passer('MandatMandataire', m, ['signe'], 'enregistre', user, `inscrit au registre (${numero})`, { numero_registre: numero });
}

/** Le registre : les mandats inscrits, dans l'ordre des numéros. */
export function registreMandats() {
  return Records.list('MandatMandataire')
    .filter((m) => m.numero_registre)
    .sort((a, b) => a.numero_registre.localeCompare(b.numero_registre));
}

/** Pure : le registre en CSV, pour un contrôle. */
export function registreCsv(mandats) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lignes = [['Numéro', 'Date', 'Mandataire', 'Vendeur', 'Bien', 'Type', 'Prix', 'Honoraires', 'Durée (mois)', 'Réf. MyNotary']];
  for (const m of mandats) {
    lignes.push([m.numero_registre, (m.enregistre_le || '').slice(0, 10), m.mandataire_email, m.vendeur, m.bien, m.type, m.prix, m.honoraires, m.duree_mois, m.reference_mynotary || '']);
  }
  return lignes.map((l) => l.map(esc).join(';')).join('\n');
}

// ===========================================================================
// 3. Dossier et analyse — porte 2
// Documents en cours → Complet → En étude → Go / Compléments / No-go
// ===========================================================================

export const PIECES = [
  { cle: 'bail', mot: 'Bail commercial', requise: true },
  { cle: 'quittances', mot: 'Trois dernières quittances', requise: true },
  { cle: 'kbis', mot: 'Kbis du locataire', requise: false },
  { cle: 'copropriete', mot: 'Règlement de copropriété, PV d’AG', requise: false },
  { cle: 'diagnostics', mot: 'Diagnostics (DPE, amiante…)', requise: true },
  { cle: 'taxe_fonciere', mot: 'Dernière taxe foncière', requise: true },
];

export const listerDossiers = (user) => lister('DossierMandataire', user);
export const lireDossier = (id, user) => lire('DossierMandataire', id, user);

/** Pure : ce qui manque, et si le dossier est complet. */
export function checklist(dossier) {
  const docs = dossier.documents || {};
  const lignes = PIECES.map((p) => ({ ...p, fichiers: docs[p.cle] || [], recue: (docs[p.cle] || []).length > 0 }));
  const manquantes = lignes.filter((l) => l.requise && !l.recue);
  return { lignes, manquantes, complet: manquantes.length === 0 };
}

export function creerDossier({ bien, adresse = null, proprietaire = null, proprietaire_email = null }, user) {
  if (!String(bien || '').trim()) return { ok: false, error: 'Nommez le bien.' };
  const d = Records.create('DossierMandataire', {
    mandataire_email: emailDe(user),
    bien: String(bien).trim(),
    adresse: adresse ? String(adresse).trim() : null,
    proprietaire: proprietaire ? String(proprietaire).trim() : null,
    proprietaire_email: proprietaire_email ? String(proprietaire_email).trim().toLowerCase() : null,
    documents: {},
    statut: 'documents_en_cours',
    deal_id: null,
    cree_le: maintenant(),
    historique: [{ le: maintenant(), par: user?.email || null, action: 'créé' }],
  });
  return { ok: true, dossier: d };
}

export function ajouterPiece(id, categorie, fichier, user) {
  const d = lireDossier(id, user);
  if (!d) return { ok: false, error: 'Dossier introuvable.' };
  if (!PIECES.some((p) => p.cle === categorie)) return { ok: false, error: 'Catégorie inconnue.' };
  if (!['documents_en_cours', 'complet', 'complements'].includes(d.statut)) return { ok: false, error: 'Le dossier est à l’étude : les pièces ne se changent plus.' };
  const documents = { ...(d.documents || {}), [categorie]: [...((d.documents || {})[categorie] || []), { nom: fichier.filename, url: fichier.url, le: maintenant() }] };
  const complet = checklist({ documents }).complet;
  const statut = d.statut === 'complements' ? 'complements' : complet ? 'complet' : 'documents_en_cours';
  return { ok: true, dossier: Records.update('DossierMandataire', d.id, { documents, statut, historique: trace(d, `pièce reçue : ${fichier.filename}`, user) }) };
}

export function retirerPiece(id, categorie, url, user) {
  const d = lireDossier(id, user);
  if (!d) return { ok: false, error: 'Dossier introuvable.' };
  if (!['documents_en_cours', 'complet', 'complements'].includes(d.statut)) return { ok: false, error: 'Le dossier est à l’étude.' };
  const documents = { ...(d.documents || {}), [categorie]: ((d.documents || {})[categorie] || []).filter((f) => f.url !== url) };
  const complet = checklist({ documents }).complet;
  const statut = d.statut === 'complements' ? 'complements' : complet ? 'complet' : 'documents_en_cours';
  return { ok: true, dossier: Records.update('DossierMandataire', d.id, { documents, statut }) };
}

/** Pure : la relance du propriétaire, prête à envoyer par le mandataire. */
export function relanceProprietaire(dossier) {
  const { manquantes } = checklist(dossier);
  if (!manquantes.length) return null;
  return {
    destinataire: dossier.proprietaire_email || '',
    objet: `${dossier.bien} : les documents qui manquent`,
    corps:
      `Bonjour${dossier.proprietaire ? ` ${dossier.proprietaire}` : ''},\n\n` +
      `Pour que l'étude de ${dossier.bien} puisse démarrer, il me manque encore :\n` +
      manquantes.map((m) => `- ${m.mot}`).join('\n') +
      `\n\nVous pouvez me les envoyer en réponse à ce mail, en photo ou en PDF.\n\nBien à vous,`,
  };
}

/**
 * Le dossier complet part chez Klocka : un dossier naît côté admin (origine
 * mandataire), les pièces y sont déposées et lues, un analyste le prend.
 */
export async function soumettreDossier(id, user, { uploadDir } = {}) {
  const d = lireDossier(id, user);
  if (!d) return { ok: false, error: 'Dossier introuvable.' };
  if (!['complet', 'complements'].includes(d.statut)) return { ok: false, error: 'Il manque encore des pièces.' };
  if (!checklist(d).complet) return { ok: false, error: 'Il manque encore des pièces.' };

  let dealId = d.deal_id;
  if (!dealId) {
    // Le verrou se pose avant le premier await : un double clic ne crée pas deux Deals.
    if (d.soumission_en_cours && Date.now() - Date.parse(d.soumission_en_cours) < 60_000) {
      return { ok: false, error: 'Soumission déjà en cours.' };
    }
    Records.update('DossierMandataire', d.id, { soumission_en_cours: maintenant() });
    const { creerCoquille } = await import('./deal/index.js');
    const deal = creerCoquille({ nom: d.bien, user, apercu: { origine: 'mandataire', mandataire: d.mandataire_email, adresse: d.adresse || null, proprietaire: d.proprietaire || null } });
    dealId = deal.deal_id;
    const cree = Records.findBy('Deal', 'deal_id', dealId);
    Records.update('Deal', cree.id, { origine: 'mandataire', mandataire_email: d.mandataire_email, dossier_mandataire_id: d.id, proprietaire_vendeur: d.proprietaire || null });
  }
  // Les pièces se lisent en arrière-plan : le mandataire n'attend pas la lecture.
  const deja = new Set(d.pieces_deposees || []);
  const aDeposer = Object.values(d.documents || {}).flat().filter((f) => !deja.has(f.url));
  if (aDeposer.length && uploadDir) {
    const fs = await import('fs');
    const path = await import('path');
    const { deposerDocument } = await import('./deal/deposer-document.js');
    (async () => {
      for (const f of aDeposer) {
        try {
          const fichier = path.join(uploadDir, path.basename(f.url));
          const r = await deposerDocument(dealId, { buffer: fs.readFileSync(fichier), filename: f.nom, url: f.url }, { user });
          if (!r?.ok) throw new Error(r?.error || 'dépôt refusé');
          // Déposée pour de bon : elle ne sera pas représentée à la prochaine soumission.
          const frais = Records.get('DossierMandataire', d.id);
          Records.update('DossierMandataire', d.id, { pieces_deposees: [...(frais?.pieces_deposees || []), f.url] });
        } catch (e) {
          console.warn(`[dossier mandataire] ${f.nom} non déposé : ${e?.message || e}`);
        }
      }
      // Et dans Google Drive : le dossier du bien, avec toutes ses pièces,
      // comme pour un deal de l'équipe. Un échec Drive ne bloque rien.
      try {
        const { classerDansDrive } = await import('./google-drive.js');
        const compte = (process.env.AK_COMPTE || 'sourcing@klocka.immo').trim().toLowerCase();
        const fichiers = Object.values(d.documents || {}).flat().map((f) => ({ nom: f.nom, chemin: path.basename(f.url), mime: /\.pdf$/i.test(f.nom || '') ? 'application/pdf' : undefined }));
        if (fichiers.length) {
          const r = await classerDansDrive(compte, `${d.bien}${d.proprietaire ? ` — ${d.proprietaire}` : ''} (K Partners)`, fichiers, uploadDir);
          Records.update('DossierMandataire', d.id, { drive_folder_id: r.folder_id, drive_folder_url: r.folder_url });
          if (r.erreurs.length) console.warn(`[dossier mandataire] Drive : ${r.erreurs.join(' ; ')}`);
        }
      } catch (e) {
        console.warn(`[dossier mandataire] Drive indisponible : ${e?.message || e}`);
      }
    })();
  }
  const maj = Records.update('DossierMandataire', d.id, {
    deal_id: dealId,
    soumission_en_cours: null,
    statut: 'en_etude',
    en_etude_le: maintenant(),
    historique: trace(d, 'envoyé à Klocka', user),
  });
  return { ok: true, dossier: maj };
}

/** L'analyste décide : go (la mise en marché naît), compléments, no-go. */
export function deciderDossier(id, { decision, commentaire = null }, user) {
  if (!estAdmin(user)) return { ok: false, error: 'Réservé à Klocka.' };
  const d = lireDossier(id, user);
  if (!d) return { ok: false, error: 'Dossier introuvable.' };
  if (!['go', 'complements', 'no_go'].includes(decision)) return { ok: false, error: 'Décision inconnue.' };
  if (decision !== 'go' && !String(commentaire || '').trim()) return { ok: false, error: 'Dites pourquoi, le mandataire le lira.' };
  const r = passer('DossierMandataire', d, ['en_etude'], decision, user, decision === 'go' ? 'go' : decision === 'no_go' ? 'no-go' : 'compléments demandés', { commentaire: commentaire ? String(commentaire).trim() : null });
  if (r.ok && decision === 'go' && !Records.list('MiseEnMarche').some((m) => m.dossier_id === d.id)) {
    r.marche = Records.create('MiseEnMarche', {
      mandataire_email: d.mandataire_email,
      dossier_id: d.id,
      deal_id: d.deal_id,
      bien: d.bien,
      statut: 'preparation',
      livrables: { teaser: null, fiche_deal: null, data_room: null },
      video: null,
      activite: [],
      offres: [],
      suivi_acte: [],
      commission: null,
      cree_le: maintenant(),
      preparation_le: maintenant(),
      historique: [{ le: maintenant(), par: user?.email || null, action: 'go : mise en marché ouverte' }],
    });
  }
  return r;
}

// ===========================================================================
// 4. Mise en marché — porte 3
// Dossier en préparation → Présenté aux clients → Offre → Compromis → Acte → Commission payée
// ===========================================================================

export const STATUTS_MARCHE = ['preparation', 'presente', 'offre', 'compromis', 'acte', 'commission_payee'];
export const listerMarches = (user) => lister('MiseEnMarche', user);
export const lireMarche = (id, user) => lire('MiseEnMarche', id, user);

/** Ce que le mandataire lit d'une offre : jamais le nom du client. */
export function marcheVuParMandataire(m) {
  return {
    ...m,
    offres: (m.offres || []).filter((o) => o.validee).map(({ client_nom, ...o }) => o),
    activite: (m.activite || []).map(({ client_nom, ...a }) => a),
  };
}

/** Klocka fait avancer le bien d'un cran (jamais en arrière, jamais en sautant). */
export function avancerMarche(id, statut, user, extra = {}) {
  if (!estAdmin(user)) return { ok: false, error: 'Réservé à Klocka.' };
  const m = lireMarche(id, user);
  if (!m) return { ok: false, error: 'Mise en marché introuvable.' };
  const i = STATUTS_MARCHE.indexOf(m.statut);
  if (STATUTS_MARCHE.indexOf(statut) !== i + 1) return { ok: false, error: 'On avance d’une étape à la fois.' };
  return passer('MiseEnMarche', m, [m.statut], statut, user, `→ ${statut}`, extra);
}

export function poserLivrable(id, cle, lien, user) {
  if (!estAdmin(user)) return { ok: false, error: 'Réservé à Klocka.' };
  const m = lireMarche(id, user);
  if (!m) return { ok: false, error: 'Mise en marché introuvable.' };
  if (!['teaser', 'fiche_deal', 'data_room'].includes(cle)) return { ok: false, error: 'Livrable inconnu.' };
  const livrables = { ...(m.livrables || {}), [cle]: lien ? String(lien).trim() : null };
  return { ok: true, marche: Records.update('MiseEnMarche', m.id, { livrables }) };
}

export function deposerVideo(id, fichier, user) {
  const m = lireMarche(id, user);
  if (!m) return { ok: false, error: 'Mise en marché introuvable.' };
  return { ok: true, marche: Records.update('MiseEnMarche', m.id, { video: { nom: fichier.filename, url: fichier.url, le: maintenant() }, historique: trace(m, 'vidéo déposée', user) }) };
}

export const TYPES_ACTIVITE = { dossier_ouvert: 'Dossier ouvert', visite_demandee: 'Visite demandée', visite_faite: 'Visite faite', offre: 'Offre reçue' };

/** Klocka note ce que les clients font du bien. Le client reste anonyme côté mandataire. */
export function noterActivite(id, { type, client_nom = null, note = null }, user) {
  if (!estAdmin(user)) return { ok: false, error: 'Réservé à Klocka.' };
  const m = lireMarche(id, user);
  if (!m) return { ok: false, error: 'Mise en marché introuvable.' };
  if (!TYPES_ACTIVITE[type]) return { ok: false, error: 'Type inconnu.' };
  const activite = [...(m.activite || []), { le: maintenant(), type, note: note ? String(note).trim() : null, client_nom: client_nom || null }];
  return { ok: true, marche: Records.update('MiseEnMarche', m.id, { activite }) };
}

/** Une offre : Klocka la saisit, la valide avec son argumentaire ; alors seulement le mandataire la voit. */
export function poserOffre(id, { montant, conditions = null, argumentaire = null, client_nom = null, valider = false }, user) {
  if (!estAdmin(user)) return { ok: false, error: 'Réservé à Klocka.' };
  const m = lireMarche(id, user);
  if (!m) return { ok: false, error: 'Mise en marché introuvable.' };
  if (!(Number(montant) > 0)) return { ok: false, error: 'Le montant de l’offre est nécessaire.' };
  // Une offre n'existe que sur un bien présenté : rien ne se transmet au
  // mandataire pour un bien encore en préparation, ni après le compromis.
  if (!['presente', 'offre'].includes(m.statut)) return { ok: false, error: `Le bien est « ${m.statut} » : une offre se pose une fois le bien présenté.` };
  if (valider && !String(argumentaire || '').trim()) return { ok: false, error: 'L’argumentaire accompagne l’offre transmise.' };
  const offre = {
    id: `o-${Date.now()}`, le: maintenant(), montant: Number(montant),
    conditions: conditions ? String(conditions).trim() : null,
    argumentaire: argumentaire ? String(argumentaire).trim() : null,
    client_nom, validee: !!valider, reponse: null,
  };
  const patch = { offres: [...(m.offres || []), offre] };
  // Une offre transmise fait passer le bien à « Offre » s'il n'y était pas.
  if (valider && m.statut === 'presente') Object.assign(patch, { statut: 'offre', offre_le: maintenant(), historique: trace(m, '→ offre', user) });
  return { ok: true, marche: Records.update('MiseEnMarche', m.id, patch) };
}

/** Klocka valide une offre déjà saisie, avec l'argumentaire qui l'accompagne. */
export function validerOffre(id, offreId, argumentaire, user) {
  if (!estAdmin(user)) return { ok: false, error: 'Réservé à Klocka.' };
  const m = lireMarche(id, user);
  if (!m) return { ok: false, error: 'Mise en marché introuvable.' };
  if (!String(argumentaire || '').trim()) return { ok: false, error: 'L’argumentaire accompagne l’offre transmise.' };
  if (!['presente', 'offre'].includes(m.statut)) return { ok: false, error: `Le bien est « ${m.statut} » : une offre se transmet une fois le bien présenté.` };
  if (!(m.offres || []).some((o) => o.id === offreId)) return { ok: false, error: 'Offre introuvable.' };
  const offres = (m.offres || []).map((o) => (o.id === offreId ? { ...o, validee: true, argumentaire: String(argumentaire).trim(), validee_le: maintenant() } : o));
  const patch = { offres };
  if (m.statut === 'presente') Object.assign(patch, { statut: 'offre', offre_le: maintenant(), historique: trace(m, '→ offre', user) });
  return { ok: true, marche: Records.update('MiseEnMarche', m.id, patch) };
}

/** Le mandataire rapporte la réponse du vendeur. */
export function repondreOffre(id, offreId, { reponse, note = null }, user) {
  const m = lireMarche(id, user);
  if (!m) return { ok: false, error: 'Mise en marché introuvable.' };
  if (!['acceptee', 'refusee', 'contre_offre'].includes(reponse)) return { ok: false, error: 'Réponse inconnue.' };
  if (!(m.offres || []).some((o) => o.id === offreId && o.validee)) return { ok: false, error: 'Offre introuvable (ou pas encore transmise).' };
  const offres = (m.offres || []).map((o) => (o.id === offreId && o.validee ? { ...o, reponse, reponse_note: note ? String(note).trim() : null, reponse_le: maintenant() } : o));
  return { ok: true, marche: Records.update('MiseEnMarche', m.id, { offres, historique: trace(m, `réponse du vendeur : ${reponse}`, user) }) };
}

/** Le suivi jusqu'à l'acte : pièces manquantes, relances notaire. Chacun y écrit. */
export function noterSuiviActe(id, texte, user) {
  const m = lireMarche(id, user);
  if (!m) return { ok: false, error: 'Mise en marché introuvable.' };
  if (!String(texte || '').trim()) return { ok: false, error: 'Rien à noter.' };
  const suivi_acte = [...(m.suivi_acte || []), { le: maintenant(), par: user?.email || null, texte: String(texte).trim(), fait: false }];
  return { ok: true, marche: Records.update('MiseEnMarche', m.id, { suivi_acte }) };
}

export function basculerSuiviActe(id, index, user) {
  const m = lireMarche(id, user);
  if (!m) return { ok: false, error: 'Mise en marché introuvable.' };
  const suivi_acte = (m.suivi_acte || []).map((s, i) => (i === Number(index) ? { ...s, fait: !s.fait } : s));
  return { ok: true, marche: Records.update('MiseEnMarche', m.id, { suivi_acte }) };
}

// ===========================================================================
// La file de validation (admin) : ce qui attend une décision de Klocka.
// ===========================================================================

const HEURES = (iso) => (iso ? Math.round((Date.now() - Date.parse(iso)) / 3600000) : null);

export function fileDeValidation() {
  const lignes = [];
  for (const m of Records.list('MandatMandataire').filter((x) => ['demande_envoyee', 'signe'].includes(x.statut))) {
    const depuis = m.statut === 'signe' ? m.signe_le : m.demande_envoyee_le;
    lignes.push({ genre: 'mandat', id: m.id, titre: `${m.bien} · ${m.vendeur}`, mandataire: m.mandataire_email, depuis, heures: HEURES(depuis), delai_h: m.statut === 'signe' ? 48 : 48, statut: m.statut, action: m.statut === 'signe' ? 'Inscrire au registre' : 'Vérifier prix et honoraires, rédiger sur MyNotary' });
  }
  for (const d of Records.list('DossierMandataire').filter((x) => x.statut === 'en_etude')) {
    lignes.push({ genre: 'dossier', id: d.id, titre: d.bien, mandataire: d.mandataire_email, depuis: d.en_etude_le, heures: HEURES(d.en_etude_le), delai_h: 72, deal_id: d.deal_id, action: 'Analyser, décider go / compléments / no-go' });
  }
  for (const m of Records.list('MiseEnMarche')) {
    const aValider = (m.offres || []).filter((o) => !o.validee);
    if (aValider.length) lignes.push({ genre: 'offre', id: m.id, titre: `${m.bien} · ${aValider.length} offre${aValider.length > 1 ? 's' : ''}`, mandataire: m.mandataire_email, depuis: aValider[0].le, heures: HEURES(aValider[0].le), delai_h: 24, action: 'Valider l’offre et son argumentaire' });
  }
  return lignes.map((l) => ({ ...l, en_retard: l.heures != null && l.heures > l.delai_h })).sort((a, b) => (b.heures ?? 0) - (a.heures ?? 0));
}
