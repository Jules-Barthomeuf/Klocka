// Le bien d'essai du mandataire (29 oct. 2026, Jules : « un projet test pour naviguer de la 1 à la 6 et faire tout le
// flow sans faire le travail, et sans crédits »). Un seul bien, « Bien d'essai », que chaque scénario remet dans un état
// donné : rendez-vous fixé, avis rédigé, refusé, prix d'accord, mandat signé, dossier complet, en vente, envoyé à Klocka,
// offre, compromis, acte. Tout est posé directement dans la base : aucun appel au modèle, aucun mail, aucune
// notification à l'équipe, rien vers Monday ni Drive. Chaque scénario repart de zéro : les objets de l'essai (et eux
// seuls, marqués `essai_bien`) sont effacés puis reconstruits jusqu'à l'état voulu.

import fs from 'fs';
import path from 'path';
import { Records, CHEMIN_UPLOADS } from './db.js';

const JOUR = 86400000;
const maintenant = () => new Date().toISOString();
const ilYa = (j) => new Date(Date.now() - j * JOUR).toISOString();
const ENTITES = ['ProprietaireMandataire', 'EstimationMandataire', 'MandatMandataire', 'DossierMandataire', 'MiseEnMarche', 'Rappel', 'MessageDossier', 'Notification'];
const ADRESSE = "12 rue de l'Essai, 69002 Lyon";
const BIEN = "Bien d'essai · Boulangerie, 12 rue de l'Essai";

/** Les scénarios, par étape du bien : la clé, l'étape où le bien s'ouvre ensuite, ce qu'on voit. */
export const SCENARIOS = [
  { etape: 'previsite', titre: 'Visite', liste: [
    ['rdv', 'Rendez-vous fixé', 'La préparation de la visite.'],
    ['visite_faite', 'Visite faite', 'Le compte rendu est dicté ; on peut lancer l’avis.'],
  ] },
  { etape: 'estimation', titre: 'Avis de valeur', liste: [
    ['avis_redige', 'Avis rédigé', 'L’avis est prêt à relire et à présenter.'],
    ['avis_envoye', 'Avis envoyé', 'Estimation envoyée, en attente du propriétaire.'],
    ['reflechit', 'Il réfléchit', 'Reste envoyée, relance datée.'],
    ['refus_prix', 'Il trouve le prix trop bas', 'En pause, relance à trois mois.'],
    ['concurrent', 'Il signe avec un concurrent', 'Perdu, motif concurrent.'],
    ['plus_vendeur', 'Il ne vend plus', 'Perdu, motif plus vendeur.'],
    ['accord', 'Il est d’accord sur le prix', 'Prix d’accord : le bien passe au mandat.'],
  ] },
  { etape: 'mandat', titre: 'Mandat', liste: [
    ['mandat_prepare', 'Mandat préparé', 'Le brouillon, prêt à envoyer.'],
    ['mandat_envoye', 'Mandat envoyé', 'En attente de la saisie sur MyNotary.'],
    ['mandat_signe', 'Mandat signé', 'Le dossier de vente s’ouvre.'],
  ] },
  { etape: 'marche', titre: 'Commercialisation', liste: [
    ['dossier_vide', 'Dossier à constituer', 'Aucune pièce : Haka propose le mail au vendeur.'],
    ['dossier_complet', 'Pièces reçues, locataire à notifier', 'Le droit de préférence reste à régler.'],
    ['pret_vente', 'Prêt à mettre en vente', 'Tout est réglé : « Mettre en vente » est actif.'],
    ['en_vente', 'Mis en vente', 'Le teaser est composé, à relire et valider.'],
  ] },
  { etape: 'offre', titre: 'Offres', liste: [
    ['teaser_valide', 'Teaser validé', 'Qui le commercialise : Klocka ou vous ?'],
    ['klocka', 'Envoyé à Klocka', 'La conversation avec l’équipe, avancement à zéro.'],
    ['klocka_offre', 'Chez Klocka : offre en cours', 'Analyse, présentation, intéressé et offre cochés.'],
    ['moi', 'Commercialisé par vous', 'Le suivi de la vente, sans offre.'],
    ['moi_offre', 'Une offre reçue', 'Une offre validée par Klocka.'],
  ] },
  { etape: 'vente', titre: 'Vente', liste: [
    ['compromis', 'Compromis signé', 'La vente suit son cours chez le notaire.'],
    ['acte', 'Acte signé', 'Le bien est vendu.'],
  ] },
];
const ORDRE = SCENARIOS.flatMap((g) => g.liste.map(([cle]) => cle));
const ETAPE_DE = Object.fromEntries(SCENARIOS.flatMap((g) => g.liste.map(([cle]) => [cle, g.etape])));

/** Les objets de l'essai de ce mandataire. */
const objetsEssai = (email) => ENTITES.flatMap((e) => Records.list(e).filter((x) => x.essai_bien === email).map((x) => [e, x]));

/** Efface l'essai (ses objets seulement) ; rend leur nombre. */
export function effacerEssai(user) {
  const email = String(user?.email || '').toLowerCase();
  const tous = objetsEssai(email);
  // Les messages du fil et les rappels liés au dossier ou à la fiche de l'essai.
  const ids = new Set(tous.map(([, x]) => x.id));
  for (const m of Records.list('MessageDossier').filter((x) => ids.has(x.dossier_id))) Records.delete('MessageDossier', m.id);
  for (const r of Records.list('Rappel').filter((x) => ids.has(x.proprietaire_id))) Records.delete('Rappel', r.id);
  for (const [e, x] of tous) { try { Records.delete(e, x.id); } catch { /* déjà parti */ } }
  return tous.length;
}

/** Un petit PDF de pièce, déposé dans les uploads (rien n'est lu par le modèle). */
function piece(nom, lignes) {
  const { pdfSimple } = awaitPdf;
  const fichier = `essai-${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${nom}.pdf`;
  fs.mkdirSync(CHEMIN_UPLOADS, { recursive: true });
  fs.writeFileSync(path.join(CHEMIN_UPLOADS, fichier), pdfSimple(lignes));
  return { nom: `${nom}.pdf`, url: `/uploads/${fichier}`, le: maintenant() };
}
let awaitPdf = null;

const QUESTIONNAIRE = {
  type_bien: 'murs_commerce', adresse: ADRESSE, demandeur: 'M. Dupont (SCI Essai)', occupe: true, surface_utile: 85,
  locataire: 'SARL Boulangerie Essai', activite_locataire: 'Boulangerie-pâtisserie', bail_type: '3-6-9', date_effet: '01/03/2020', echeance: '28/02/2029',
  loyer_annuel_hc: 24000, indexation: 'ILC', taxe_fonciere: '2 100 € refacturée', charges: 'refacturées', etat: 'bon état', facade: '6 m de vitrine',
  emplacement: "Centre-ville, rue commerçante à deux pas de la place des Jacobins.", date_visite: new Date().toLocaleDateString('fr-FR'), visite_avec: 'M. Dupont',
};

/** Construit l'essai jusqu'au scénario voulu. */
export async function appliquerScenario(cle, user) {
  if (!ORDRE.includes(cle)) return { ok: false, error: 'Scénario inconnu.' };
  awaitPdf = awaitPdf || await import('./mandataire-exemples.js');
  const email = String(user?.email || '').toLowerCase();
  effacerEssai(user);
  const rang = (k) => ORDRE.indexOf(k);
  const atteint = (k) => rang(cle) >= rang(k);
  const essai = { essai_bien: email, mandataire_email: email };

  // 1. Visite : la fiche, rendez-vous fixé.
  const p = Records.create('ProprietaireMandataire', {
    ...essai, statut: 'rdv_pris', nom: 'M. Dupont', commerce: 'Boulangerie Essai', adresse: ADRESSE, ville: 'Lyon', activite: 'Boulangerie',
    telephone: '06 00 00 00 00', email: 'dupont@exemple.fr', prochaine_action: 'Visite', prochaine_action_le: new Date(Date.now() + JOUR).toISOString(),
    biens: {}, historique: [{ le: ilYa(5), type: 'note', texte: "Bien d'essai : rendez-vous fixé." }], cree_le: ilYa(5),
  });
  if (cle === 'rdv') return fin(cle, p.id);

  // Visite faite : le compte rendu.
  Records.update('ProprietaireMandataire', p.id, { biens: { ...p.biens, compte_rendu: { le: ilYa(4), texte: "Visite faite avec M. Dupont : 85 m², bail 3-6-9 depuis 2020, loyer 24 000 € HT HC, locataire à jour. Il vend pour sa retraite, attend autour de 400 000 €." } } });
  if (cle === 'visite_faite') return fin(cle, p.id);

  // 2. Avis de valeur : composé sans le modèle (le provisoire de l'avis, complété de chiffres posés).
  const A = await import('./mandataire-avis.js');
  const e0 = { questionnaire: QUESTIONNAIRE, adresse: ADRESSE };
  const avis = A.avisProvisoire(e0, A.signataire(user));
  Object.assign(avis, {
    provisoire: false,
    bien: { ...avis.bien, rue: "12 rue de l'Essai", ville: '69002 Lyon' },
    marche: { ...avis.marche, synthese: 'Les locaux vendus autour se sont échangés entre 3 800 et 5 200 € par m² (exemple).' },
    methodes: { ...avis.methodes, synthese: 'Capitalisation du loyer à 6 %, recoupée par la comparaison.', taux: 6, prix_m2: 4600 },
    chiffres: { ...avis.chiffres, valeur: 400000, bas: 370000, haut: 430000, rendement: 6, capitalisation: 400000, prix_affiche: 420000 },
    conclusion: { ...avis.conclusion, points: ['Emplacement de centre-ville', 'Bail en cours jusqu’en 2029', 'Locataire à jour'] },
  });
  const e = Records.create('EstimationMandataire', {
    ...essai, bien: BIEN, adresse: ADRESSE, proprietaire_id: p.id, questionnaire: QUESTIONNAIRE, avis,
    statut: atteint('avis_envoye') ? 'envoye' : 'prete', prete_le: ilYa(3), cree_le: ilYa(3), historique: [{ le: ilYa(3), action: "avis d'essai" }],
    ...(atteint('avis_envoye') ? { envoye_le: ilYa(2) } : {}),
  });
  Records.update('ProprietaireMandataire', p.id, { biens: { ...Records.get('ProprietaireMandataire', p.id).biens, estimation_id: e.id } });
  if (cle === 'avis_redige' || cle === 'avis_envoye') return fin(cle, p.id);

  // La restitution : les cas du propriétaire, par le vrai code (relances datées, pause, perdu).
  const R = await import('./restitution-avis.js');
  const cas = { reflechit: 'reflechit', refus_prix: 'trop_bas', concurrent: 'concurrent', plus_vendeur: 'plus_vendeur' }[cle];
  if (cas) { R.appliquerRestitution(p.id, { cas }, user); return fin(cle, p.id); }
  R.appliquerRestitution(p.id, { cas: 'accord_conseille' }, user);
  if (cle === 'accord') return fin(cle, p.id);

  // 3. Mandat.
  const m = Records.create('MandatMandataire', {
    ...essai, bien: BIEN, estimation_id: e.id, proprietaire_id: p.id, vendeur: 'SCI Essai', prix: 400000, honoraires: 5, honoraires_charge: 'acquereur', type: 'exclusif', duree_mois: 12,
    questionnaire: {
      type_mandat: 'exclusif', vendeur_genre: 'morale', vendeur_societe: 'SCI Essai', vendeur_forme: 'SCI', vendeur_representant: 'M. Jean Dupont, gérant',
      vendeur_adresse: '3 place Bellecour, 69002 Lyon', vendeur_email: 'dupont@exemple.fr', bien_designation: 'Murs commerciaux d’une boulangerie de 85 m², loués',
      bien_adresse: ADRESSE, bien_surface: 85, bien_occupe: true, bien_locataire: 'SARL Boulangerie Essai, bail 3-6-9 depuis 2020',
      prix: 400000, prix_tva: false, honoraires: 5, honoraires_unite: '%', honoraires_charge: 'acquereur', duree_mois: 12,
    },
    statut: cle === 'mandat_prepare' ? 'brouillon' : cle === 'mandat_envoye' ? 'demande_envoyee' : 'signe',
    cree_le: ilYa(2), historique: [{ le: ilYa(2), action: "mandat d'essai" }],
  });
  if (cle === 'mandat_prepare' || cle === 'mandat_envoye') return fin(cle, p.id);

  // Mandat signé : le dossier de vente (sans dossier d'analyse : rien n'est lu).
  const docs = {};
  if (atteint('dossier_complet')) {
    docs.bail = [piece('Bail commercial', ['Bail commercial 3-6-9 (essai)', 'Loyer 24 000 EUR HT HC par an'])];
    docs.quittances = [piece('Quittances', ['Quittances de loyer (essai)'])];
    docs.diagnostics = [piece('Diagnostics', ['DPE C, amiante neant (essai)'])];
    docs.taxe_fonciere = [piece('Taxe fonciere', ['Taxe fonciere 2 100 EUR (essai)'])];
  }
  const d = Records.create('DossierMandataire', {
    ...essai, bien: BIEN, adresse: ADRESSE, proprietaire: 'SCI Essai', proprietaire_email: 'dupont@exemple.fr', prix: 400000, mandat_id: m.id,
    documents: docs, statut: atteint('dossier_complet') ? 'complet' : 'documents_en_cours', deal_id: null, cree_le: ilYa(2),
    // Le mail au vendeur est déjà « parti » pour que la veille ne le repropose pas avant le scénario qui le montre.
    ...(atteint('dossier_complet') ? { depot: { jeton: `essai-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`, cree_le: ilYa(2), propose_le: ilYa(2), expire_le: new Date(Date.now() + 90 * JOUR).toISOString() } } : {}),
    ...(atteint('pret_vente') ? { preference: { notifie_le: ilYa(40), reponse: 'refuse', le: ilYa(5) } } : {}),
    historique: [{ le: ilYa(2), action: "dossier d'essai" }],
  });
  if (cle === 'mandat_signe' || cle === 'dossier_vide' || cle === 'dossier_complet' || cle === 'pret_vente') return fin(cle, p.id);

  // 4. Mis en vente : la commercialisation et son teaser.
  Records.update('DossierMandataire', d.id, { statut: 'go', en_vente_le: ilYa(1) });
  const mm = Records.create('MiseEnMarche', {
    ...essai, dossier_id: d.id, deal_id: null, bien: BIEN, statut: 'preparation', livrables: { teaser: null, fiche_deal: null, data_room: null },
    video: null, activite: [], offres: [], suivi_acte: [], commission: null, cree_le: ilYa(1), preparation_le: ilYa(1), historique: [{ le: ilYa(1), action: "mise en vente d'essai" }],
  });
  const T = await import('./teaser.js');
  await T.teaserDe(mm.id, user);
  if (cle === 'en_vente') return fin(cle, p.id);
  await T.validerTeaser(mm.id, user);
  if (cle === 'teaser_valide') return fin(cle, p.id);

  // 5. Offres : la voie, posée sans prévenir l'équipe.
  const voie = ['klocka', 'klocka_offre'].includes(cle) ? 'klocka' : 'moi';
  Records.update('MiseEnMarche', mm.id, { voie, voie_le: ilYa(1) });
  if (voie === 'klocka') {
    Records.update('DossierMandataire', d.id, { envoye_klocka_le: ilYa(1), equipe: true, ...(cle === 'klocka_offre' ? { avancement: Object.fromEntries(['analyse', 'presentation', 'interesse', 'offre'].map((k, i) => [k, { le: ilYa(1 - i * 0.1), par: 'essai' }])) } : {}) });
    const F = await import('./fil-dossier.js');
    F.evenement(d.id, "Envoyé à Klocka (essai) : l'équipe suit le dossier ici.");
    if (cle === 'klocka_offre') F.poserMessage(d.id, { cote: 'analyste', auteur_email: null, texte: "Bonne nouvelle : un investisseur a fait une offre à 395 000 €, nous la travaillons (message d'essai)." });
    return fin(cle, p.id);
  }
  if (cle === 'moi') return fin(cle, p.id);
  const offre = { id: `essai-${Date.now()}`, montant: 395000, conditions: 'Sous réserve de prêt', argumentaire: "Offre d'essai", validee: true, le: ilYa(0.5) };
  Records.update('MiseEnMarche', mm.id, { statut: 'offre', offres: [offre] });
  if (cle === 'moi_offre') return fin(cle, p.id);

  // 6. Vente.
  Records.update('MiseEnMarche', mm.id, { statut: cle === 'acte' ? 'acte' : 'compromis', [`${cle}_le`]: maintenant() });
  return fin(cle, p.id);
}

function fin(cle, proprietaireId) {
  return { ok: true, scenario: cle, bien: `proprietaire:${proprietaireId}`, etape: ETAPE_DE[cle] };
}
