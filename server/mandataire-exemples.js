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
const ENTITES = ['EstimationMandataire', 'MandatMandataire', 'DossierMandataire', 'MiseEnMarche'];

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

/** Retire tous les exemples d'un mandataire ; ils ne reviennent pas. */
export function retirerExemples(user) {
  const email = String(user?.email || '').toLowerCase();
  let n = 0;
  for (const e of ENTITES) for (const x of Records.list(e).filter((y) => y.exemple && y.mandataire_email === email)) { Records.delete(e, x.id); n += 1; }
  if (!Meta.get(cleMeta(email))) Meta.set(cleMeta(email), maintenant());
  return { ok: true, retires: n };
}

/** Le message rendu quand on tente de faire sortir un exemple de la plateforme. */
export const REFUS_EXEMPLE = 'C\'est un exemple : il montre comment ça marche, mais il ne part pas. Créez le vôtre pour l\'envoyer pour de vrai.';
