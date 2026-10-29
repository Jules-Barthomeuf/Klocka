// Les exemples de l'espace mandataire (10 oct. 2026) : un mandataire qui
// arrive n'a encore rien, et ne voit donc pas comment l'espace marche. À sa
// première visite, on pose des fiches d'exemple, toutes marquées `exemple` et
// signalées « Exemple » à l'écran :
//   - Mandat : un mandat commencé, local loué à Basic-Fit, presque complet,
//     à finir dans le chat ;
//   - Estimation : le même local, en brouillon ;
//   - Dossiers : un dossier avec deux pièces déposées, un autre complet ;
//   - Mise en marché : un bien présenté, l'activité des clients, une offre
//     validée par Klocka, à laquelle répondre.
// Un exemple ne sort jamais de la plateforme : il ne part ni chez MyNotary, ni
// chez Klocka (transfert, file de validation), ni dans Monday. Un clic les
// retire tous ; ils ne reviennent pas.

import fs from 'fs';
import path from 'path';
import { Records, Meta, CHEMIN_UPLOADS } from './db.js';

const cleMeta = (email) => `mandataire-exemples:${String(email || '').toLowerCase()}`;
const maintenant = () => new Date().toISOString();
const ENTITES = ['EstimationMandataire', 'MandatMandataire', 'DossierMandataire', 'MiseEnMarche', 'ProprietaireMandataire', 'ListeMandataire', 'VisiteAcquereur', 'AcquereurMandataire'];

/** Pure : un PDF d'une page, quelques lignes de texte (les pièces d'exemple des dossiers). */
export function pdfSimple(lignes) {
  const echapper = (t) => String(t).replace(/[\\()]/g, (c) => `\\${c}`).replace(/[^\x20-\x7e]/g, (c) => ({ é: 'e', è: 'e', ê: 'e', à: 'a', â: 'a', ô: 'o', î: 'i', ç: 'c', ù: 'u', 'É': 'E', '€': 'EUR', '’': "'", '·': '-' }[c] || ' '));
  const flux = ['BT', '/F1 12 Tf', '56 780 Td', '16 TL', ...lignes.map((l, i) => `${i ? 'T* ' : ''}(${echapper(l)}) Tj`), 'ET'].join('\n');
  const objets = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(flux)} >>\nstream\n${flux}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let corps = '%PDF-1.4\n';
  const positions = [];
  objets.forEach((o, i) => { positions.push(Buffer.byteLength(corps)); corps += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = Buffer.byteLength(corps);
  corps += `xref\n0 ${objets.length + 1}\n0000000000 65535 f \n${positions.map((p) => `${String(p).padStart(10, '0')} 00000 n \n`).join('')}`;
  corps += `trailer\n<< /Size ${objets.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(corps, 'latin1');
}

const PIECES_EXEMPLE = {
  bail: ['EXEMPLE - Bail commercial', '', 'Bailleur : SCI Les Exemples', 'Preneur : exploitant d\'une salle de sport (enseigne nationale)', 'Duree : 9 ans (3-6-9), a compter du 1er mars 2021', 'Loyer annuel : 111 000 EUR HT HC, indexe sur l\'ILC', 'Taxe fonciere refacturee au preneur', '', 'Document fictif, pour montrer le fonctionnement de l\'espace.'],
  quittances: ['EXEMPLE - Quittances de loyer', '', 'Juillet, aout, septembre : 9 250 EUR HT par mois', 'Regle a l\'echeance', '', 'Document fictif.'],
  diagnostics: ['EXEMPLE - Diagnostics', '', 'DPE : C', 'Amiante : absence', '', 'Document fictif.'],
  taxe_fonciere: ['EXEMPLE - Avis de taxe fonciere', '', 'Montant : 14 200 EUR, refacture au preneur', '', 'Document fictif.'],
  kbis: ['EXEMPLE - Extrait Kbis du locataire', '', 'Societe d\'exploitation de salles de sport', '', 'Document fictif.'],
};

/** Les pièces d'exemple, écrites une fois dans le dossier des fichiers déposés. */
function pieces(dossier = CHEMIN_UPLOADS) {
  fs.mkdirSync(dossier, { recursive: true });
  const out = {};
  for (const [cle, lignes] of Object.entries(PIECES_EXEMPLE)) {
    const nom = `exemple-${cle.replace('_', '-')}.pdf`;
    const chemin = path.join(dossier, nom);
    if (!fs.existsSync(chemin)) fs.writeFileSync(chemin, pdfSimple(lignes));
    out[cle] = [{ nom: `Exemple · ${nom.replace(/^exemple-/, '')}`, url: `/uploads/${nom}`, le: maintenant() }];
  }
  return out;
}

const trace = (email, action) => [{ le: maintenant(), par: email, action }];

/**
 * Pose les exemples d'un mandataire, une seule fois (Meta). Rend le nombre de
 * fiches créées (0 s'ils l'ont déjà été, ou ont été retirés).
 */
export function semerExemples(user, { dossierUploads = CHEMIN_UPLOADS } = {}) {
  const email = String(user?.email || '').toLowerCase();
  if (!email || Meta.get(cleMeta(email))) return 0;
  Meta.set(cleMeta(email), maintenant());
  const base = { mandataire_email: email, exemple: true, cree_le: maintenant() };
  const bien = 'Local loué à Basic-Fit · Avignon';
  const docs = pieces(dossierUploads);

  Records.create('EstimationMandataire', {
    ...base, bien, adresse: '245 avenue de l\'Exemple, 84000 Avignon',
    infos_rdv: 'Rendez-vous avec la gérante de la SCI. Salle de sport de 1 200 m², bail 3-6-9 signé en 2021, loyer 111 000 € HT par an, taxe foncière refacturée.',
    proprietaire_id: null, bail: null, rapport: null, statut: 'brouillon', historique: trace(email, 'exemple posé'),
  });

  Records.create('MandatMandataire', {
    ...base, bien: `Murs commerciaux loués à Basic-Fit · 245 avenue de l'Exemple, Avignon`,
    vendeur: null, vendeur_contact: null, prix: null, honoraires: null, honoraires_charge: null, type: null, duree_mois: null,
    // Presque complet : il ne reste que la durée, à dire dans le chat.
    questionnaire: {
      type_mandat: 'exclusif', vendeur_genre: 'morale', vendeur_societe: 'Les Exemples', vendeur_forme: 'SCI',
      vendeur_representant: 'Mme Claire Exemple, gérante', vendeur_adresse: '8 rue de la Paix, 84000 Avignon',
      vendeur_email: 'claire.exemple@exemple.fr', vendeur_telephone: '06 00 00 00 00',
      bien_designation: 'Murs commerciaux d\'une salle de sport de 1 200 m², loués à Basic-Fit', bien_adresse: '245 avenue de l\'Exemple, 84000 Avignon',
      bien_surface: 1200, bien_occupe: true, bien_locataire: 'Basic-Fit, bail commercial 3-6-9 depuis mars 2021',
      prix: 1850000, prix_tva: false, honoraires: 5, honoraires_unite: '%', honoraires_charge: 'vendeur',
    },
    conversation_id: null, statut: 'brouillon',
    reference_mynotary: null, document: null, document_signe: null, numero_registre: null, mynotary_url: null,
    historique: trace(email, 'exemple posé'),
  });

  Records.create('DossierMandataire', {
    ...base, bien: 'Cellule louée à une boulangerie · Nîmes', adresse: '14 rue de l\'Exemple, 30000 Nîmes',
    proprietaire: 'M. Paul Exemple', proprietaire_email: null, prix: 420000, surface_m2: 110, loyer_annuel: 26000,
    documents: { bail: docs.bail, quittances: docs.quittances }, statut: 'documents_en_cours', deal_id: null,
    historique: trace(email, 'exemple posé'),
  });
  Records.create('DossierMandataire', {
    ...base, bien, adresse: '245 avenue de l\'Exemple, 84000 Avignon',
    proprietaire: 'SCI Les Exemples', proprietaire_email: null, prix: 1850000, surface_m2: 1200, loyer_annuel: 111000,
    documents: { bail: docs.bail, quittances: docs.quittances, diagnostics: docs.diagnostics, taxe_fonciere: docs.taxe_fonciere, kbis: docs.kbis },
    statut: 'complet', deal_id: null, historique: trace(email, 'exemple posé'),
  });

  const jour = (n) => new Date(Date.now() - n * 86400000).toISOString();
  Records.create('MiseEnMarche', {
    ...base, dossier_id: null, deal_id: null, bien: 'Murs d\'une pharmacie · Montpellier',
    statut: 'offre', publication_validee_le: jour(20), presente_le: jour(18), offre_le: jour(2), preparation_le: jour(25),
    livrables: { teaser: null, fiche_deal: null, data_room: null }, video: null,
    activite: [
      { le: jour(17), type: 'dossier_ouvert', note: null, client_nom: null },
      { le: jour(15), type: 'dossier_ouvert', note: null, client_nom: null },
      { le: jour(12), type: 'visite_demandee', note: 'Un investisseur souhaite voir le local un mardi matin.', client_nom: null },
      { le: jour(8), type: 'visite_faite', note: 'Visite faite avec le pharmacien, bon contact.', client_nom: null },
      { le: jour(2), type: 'offre', note: null, client_nom: null },
    ],
    offres: [{
      id: 'o-exemple', le: jour(2), montant: 980000,
      conditions: 'Sous réserve d\'obtention du prêt, signature du compromis sous trois semaines.',
      argumentaire: 'Investisseur particulier, financement accordé en principe par sa banque, apport de 30 %. Offre à 4 % sous le prix affiché, sérieuse au regard du bail et de l\'emplacement.',
      client_nom: null, validee: true, validee_le: jour(2), reponse: null,
    }],
    suivi_acte: [], commission: null, historique: trace(email, 'exemple posé'),
  });
  return 5;
}

/**
 * Un bien d'exemple par étape de Biens (25 oct. 2026, Jules : « pour que je puisse visualiser chaque étape »). Une fois
 * par mandataire (Meta), et seulement s'il a encore des exemples (retirés, ils ne reviennent pas). Les cinq exemples
 * d'origine servent, deux sont retouchés, rien n'est supprimé :
 *   1 Rendez-vous fixé, 2 Visité, 4 Prix d'accord : trois fiches de la Prospection (posées ici) ;
 *   3 Estimation : l'estimation d'Avignon ; 5 Mandat : le mandat d'Avignon ; 6 Analyse : le dossier de Nîmes ;
 *   7 Mise en marché : le dossier complet, renommé (Carpentras), au go et en préparation ;
 *   8 Offres : la pharmacie de Montpellier ; 9 Vente : un restaurant d'Arles au compromis (posé ici).
 * Depuis le 26 oct. 2026, sept étapes (Pré-visite, Avis de valeur, Mandat…) : les fiches gardent leurs anciens mots,
 * lus par `rangValide` (src/lib/biens-mandataire.js) : les anciens 1 et 2 sont en Pré-visite, 3 et 4 à l'Avis de valeur.
 * Rend le nombre de fiches créées ou retouchées.
 */
export function exemplesParEtape(user) {
  const email = String(user?.email || '').toLowerCase();
  const cle = `mandataire-exemples-etapes:${email}`;
  if (!email || Meta.get(cle)) return 0;
  const siens = (e) => Records.list(e).filter((x) => x.exemple && x.mandataire_email === email);
  if (!ENTITES.some((e) => siens(e).length)) return 0;
  Meta.set(cle, maintenant());
  const base = { mandataire_email: email, exemple: true, cree_le: maintenant() };
  const jour = (n) => new Date(Date.now() - n * 86400000).toISOString();
  let n = 0;
  const fiche = (champs, validee, histo) => {
    Records.create('ProprietaireMandataire', {
      ...base, statut: 'rdv_pris', source: 'Exemple', telephone_source: 'exemple', a_confirmer: {}, tentatives: 1,
      biens: { validee, pause: null }, historique: histo.map(([j, texte]) => ({ le: jour(j), type: 'note', texte })), ...champs,
    });
    n += 1;
  };
  fiche({ nom: 'M. Henri Exemple', commerce: 'Café des Halles', activite: 'Café', adresse: '2 place des Halles', ville: 'Nîmes', telephone: '06 00 00 00 01', prochaine_action: 'Rendez-vous sur place', prochaine_action_le: jour(-3) },
    null, [[6, 'Appelé : intéressé, il veut savoir ce que valent ses murs.'], [5, 'Rendez-vous fixé jeudi à 10 h, au café.']]);
  fiche({ nom: 'Mme Lucie Exemple', commerce: 'Boucherie Sainte-Anne', activite: 'Boucherie', adresse: '18 rue Sainte-Anne', ville: 'Avignon', telephone: '06 00 00 00 02', prochaine_action: 'Visiter le local', prochaine_action_le: jour(-1) },
    'rdv', [[9, 'Contactée par la SCI familiale.'], [7, 'Rendez-vous fixé pour visiter le local.']]);
  fiche({ nom: 'SCI Exemple Cours', commerce: 'Optique du Cours', activite: 'Opticien', adresse: '40 cours Mirabeau', ville: 'Aix-en-Provence', telephone: '06 00 00 00 03', prochaine_action: "Valider le prix avec la gérante", prochaine_action_le: jour(-2) },
    'estimation', [[20, 'Rendez-vous fixé.'], [15, 'Local visité : 85 m², bail 3-6-9 de 2019.'], [4, 'Avis de valeur envoyé : 640 000 à 700 000 €.']]);

  // 7 : le dossier complet d'Avignon devient un bien au go de l'analyste, sa mise en marché en préparation. Renommé
  // pour ne pas porter le même nom que l'estimation d'Avignon.
  const complet = siens('DossierMandataire').find((d) => d.statut === 'complet');
  if (complet) {
    const bien = 'Salle de sport louée · Carpentras';
    Records.update('DossierMandataire', complet.id, { bien, adresse: '12 avenue de l\'Exemple, 84200 Carpentras', statut: 'go' });
    if (!siens('MiseEnMarche').some((m) => m.dossier_id === complet.id)) {
      Records.create('MiseEnMarche', {
        ...base, dossier_id: complet.id, deal_id: null, bien, statut: 'preparation', preparation_le: jour(1),
        publication_validee_le: null, presente_le: null, offre_le: null,
        livrables: { teaser: null, fiche_deal: null, data_room: null }, video: null, activite: [], offres: [], suivi_acte: [], commission: null,
        historique: trace(email, 'exemple posé'),
      });
    }
    n += 1;
  }

  // 9 : la vente, un compromis signé, l'acte à venir.
  Records.create('MiseEnMarche', {
    ...base, dossier_id: null, deal_id: null, bien: 'Murs d\'un restaurant · Arles',
    statut: 'compromis', preparation_le: jour(70), publication_validee_le: jour(62), presente_le: jour(60), offre_le: jour(30),
    livrables: { teaser: null, fiche_deal: null, data_room: null }, video: null,
    activite: [
      { le: jour(58), type: 'dossier_ouvert', note: null, client_nom: null },
      { le: jour(45), type: 'visite_faite', note: 'Visite avec le restaurateur, très bon contact.', client_nom: null },
      { le: jour(30), type: 'offre', note: null, client_nom: null },
    ],
    offres: [{
      id: 'o-exemple-arles', le: jour(30), montant: 760000, conditions: 'Sans condition suspensive de prêt.',
      argumentaire: 'Investisseur déjà propriétaire de deux murs commerciaux à Arles, fonds propres.', client_nom: null,
      validee: true, validee_le: jour(30), reponse: 'acceptee',
    }],
    suivi_acte: [], commission: null, historique: trace(email, 'exemple posé'),
  });
  n += 1;
  return n;
}

/**
 * Des exemples à Lyon (25 oct. 2026, Jules : « crée des dossiers d'exemple à Lyon aussi ») : une liste « Lyon · exemple »
 * de vrais commerces lyonnais (signal, propriétaire et exploitant connus, position), pour la carte, le mode terrain et
 * Mon secteur ; et un bien par étape de Biens, à Lyon. Une fois par mandataire (Meta), seulement s'il a déjà des exemples
 * (retirés, ils ne reviennent pas). Les fiches ne partent nulle part (ni Monday, ni MyNotary) : créées directement.
 * Rend le nombre de fiches créées.
 */
export function exemplesLyon(user) {
  const email = String(user?.email || '').toLowerCase();
  const cle = `mandataire-exemples-lyon:${email}`;
  if (!email || Meta.get(cle)) return 0;
  const siens = (e) => Records.list(e).filter((x) => x.exemple && x.mandataire_email === email);
  if (!ENTITES.some((e) => siens(e).length)) return 0;
  Meta.set(cle, maintenant());
  const base = { mandataire_email: email, exemple: true, cree_le: maintenant() };
  const jour = (n) => new Date(Date.now() - n * 86400000).toISOString();
  let n = 0;

  // Les vrais commerces de Lyon : les plus forts signaux d'abord, que personne ne suit encore.
  const lyon = Records.list('Ville').find((v) => String(v.nom || '').toLowerCase() === 'lyon') || null;
  const tenus = new Set(Records.list('ProprietaireMandataire').map((x) => x.commerce_simple_id).filter(Boolean));
  const commerces = lyon ? Records.filter('CommerceSimple', { ville_id: lyon.id })
    .filter((c) => c.lat != null && c.lon != null && c.proprietaire?.nom && c.exploitant?.nom && (c.drapeaux || []).length && !c.chaine && !tenus.has(c.id))
    .sort((a, b) => (b.drapeaux || []).length - (a.drapeaux || []).length || String(a.id).localeCompare(String(b.id)))
    .slice(0, 12) : [];
  const liste = Records.create('ListeMandataire', { ...base, nom: 'Lyon · exemple', source: 'Exemple' });
  const titre = (c) => String(c.enseigne || c.exploitant?.nom || c.nom || 'Commerce').toLowerCase().replace(/(^|[\s'-])\p{L}/gu, (m) => m.toUpperCase());
  const fiche = (c, champs) => {
    const p = Records.create('ProprietaireMandataire', {
      ...base, liste_id: liste.id, commerce_simple_id: c?.id || null, source: 'Exemple', a_confirmer: {}, tentatives: 0, telephone: null,
      commerce: c ? titre(c) : champs.commerce, nom: c?.proprietaire?.nom || null, activite: c?.activite || null, ville: 'Lyon', adresse: c?.adresse || champs.adresse || null,
      historique: [{ le: jour(10), type: 'creation', texte: 'Exemple posé' }], ...champs,
    });
    if (c) Records.update('CommerceSimple', c.id, { listes_mandataires: { ...(c.listes_mandataires || {}), [email]: { id: liste.id, nom: liste.nom, fiche_id: p.id, le: maintenant() } } });
    n += 1;
    return p;
  };

  // La liste : à contacter surtout, deux déjà contactés, pour la carte et le terrain.
  const [c1, c2, c3, c4, ...reste] = commerces;
  reste.slice(0, 8).forEach((c, i) => fiche(c, i < 2
    ? { statut: 'contacte', prochaine_action: 'Rappeler le propriétaire', prochaine_action_le: jour(-2), historique: [{ le: jour(10), type: 'creation', texte: 'Exemple posé' }, { le: jour(3), type: 'note', texte: 'Passé au commerce : le gérant donne le nom du propriétaire.' }] }
    : { statut: 'a_appeler' }));

  // Un bien par étape, à Lyon : les quatre premiers sur de vrais commerces (ils ont leur point sur la carte).
  const rdv = (c, validee, histo, plus = {}) => fiche(c, { statut: 'rdv_pris', biens: { validee, pause: null }, historique: histo.map(([j, texte]) => ({ le: jour(j), type: 'note', texte })), ...plus });
  if (c1) rdv(c1, null, [[4, 'Appelé : le propriétaire veut savoir ce que valent ses murs.'], [3, 'Rendez-vous fixé jeudi à 10 h, sur place.']], { prochaine_action: 'Rendez-vous sur place', prochaine_action_le: jour(-3) });
  if (c2) rdv(c2, 'rdv', [[8, 'Rendez-vous fixé.'], [6, 'Rendez-vous confirmé pour la visite.']], { prochaine_action: 'Visiter le local', prochaine_action_le: jour(-1) });
  if (c3) {
    const p = rdv(c3, 'visite', [[15, 'Rendez-vous fixé.'], [9, 'Local visité : 70 m², bail 3-6-9 de 2018, bon état.']]);
    Records.create('EstimationMandataire', { ...base, bien: `${p.commerce} · Lyon`, adresse: p.adresse, proprietaire_id: p.id, infos_rdv: 'Visite faite : 70 m², bail 3-6-9 de 2018, loyer à confirmer, bon état.', bail: null, rapport: null, statut: 'brouillon', historique: trace(email, 'exemple posé') });
  }
  if (c4) rdv(c4, 'estimation', [[25, 'Rendez-vous fixé.'], [20, 'Local visité.'], [6, 'Avis de valeur envoyé : 520 000 à 580 000 €.']], { prochaine_action: 'Valider le prix avec le propriétaire', prochaine_action_le: jour(-1) });
  Records.create('MandatMandataire', {
    ...base, bien: "Murs d'une librairie · 12 rue de la République, Lyon",
    vendeur: null, vendeur_contact: null, prix: null, honoraires: null, honoraires_charge: null, type: null, duree_mois: null,
    questionnaire: { type_mandat: 'exclusif', vendeur_genre: 'morale', vendeur_societe: 'Exemple République', vendeur_forme: 'SCI', bien_designation: 'Murs commerciaux d\'une librairie de 140 m²', bien_adresse: '12 rue de la République, 69002 Lyon', bien_surface: 140, bien_occupe: true, prix: 760000, prix_tva: false, honoraires: 5, honoraires_unite: '%', honoraires_charge: 'vendeur' },
    conversation_id: null, statut: 'brouillon', reference_mynotary: null, document: null, document_signe: null, numero_registre: null, mynotary_url: null, historique: trace(email, 'exemple posé'),
  });
  Records.create('DossierMandataire', {
    ...base, bien: 'Cellule louée à une pharmacie · Lyon 6e', adresse: '48 cours Franklin-Roosevelt, 69006 Lyon', proprietaire: 'SCI Exemple Foch', proprietaire_email: null,
    prix: 1250000, surface_m2: 160, loyer_annuel: 62000, documents: {}, statut: 'documents_en_cours', deal_id: null, historique: trace(email, 'exemple posé'),
  });
  const marche = (bien, statut, champs = {}) => Records.create('MiseEnMarche', {
    ...base, dossier_id: null, deal_id: null, bien, statut, preparation_le: jour(40), publication_validee_le: statut === 'preparation' ? null : jour(30), presente_le: statut === 'preparation' ? null : jour(28),
    livrables: { teaser: null, fiche_deal: null, data_room: null }, video: null, activite: [], offres: [], suivi_acte: [], commission: null, historique: trace(email, 'exemple posé'), ...champs,
  });
  marche('Murs d\'une boulangerie · Lyon 7e', 'preparation', { preparation_le: jour(2) });
  marche('Murs d\'un restaurant · Vieux Lyon', 'offre', {
    offre_le: jour(1),
    activite: [{ le: jour(20), type: 'dossier_ouvert', note: null, client_nom: null }, { le: jour(9), type: 'visite_faite', note: 'Visite avec le restaurateur.', client_nom: null }, { le: jour(1), type: 'offre', note: null, client_nom: null }],
    offres: [{ id: 'o-exemple-lyon', le: jour(1), montant: 690000, conditions: 'Sous réserve de prêt.', argumentaire: 'Investisseur lyonnais, apport de 35 %.', client_nom: null, validee: true, validee_le: jour(1), reponse: null }],
  });
  marche('Murs d\'un opticien · Croix-Rousse', 'compromis', {
    offre_le: jour(25),
    offres: [{ id: 'o-exemple-lyon-2', le: jour(25), montant: 480000, conditions: 'Sans condition de prêt.', argumentaire: 'Fonds propres.', client_nom: null, validee: true, validee_le: jour(25), reponse: 'acceptee' }],
  });
  return n + 5;
}

/** Retire tous les exemples d'un mandataire ; ils ne reviennent pas. */
export function retirerExemples(user) {
  const email = String(user?.email || '').toLowerCase();
  let n = 0;
  for (const e of ENTITES) for (const x of Records.list(e).filter((y) => y.exemple && y.mandataire_email === email)) {
    // Une fiche d'exemple posée sur un vrai commerce : le commerce oublie la liste d'exemple.
    const c = e === 'ProprietaireMandataire' && x.commerce_simple_id ? Records.get('CommerceSimple', x.commerce_simple_id) : null;
    if (c?.listes_mandataires?.[email]) { const { [email]: _ote, ...autres } = c.listes_mandataires; Records.update('CommerceSimple', c.id, { listes_mandataires: autres }); }
    Records.delete(e, x.id); n += 1;
  }
  if (!Meta.get(cleMeta(email))) Meta.set(cleMeta(email), maintenant());
  return { ok: true, retires: n };
}

/** Le message rendu quand on tente de faire sortir un exemple de la plateforme. */
export const REFUS_EXEMPLE = 'C\'est un exemple : il montre comment ça marche, mais il ne part pas. Créez le vôtre pour l\'envoyer pour de vrai.';
