// Ce que l'assistant fait, dit en clair pendant qu'il le fait : « Recherche
// du dossier « Mâcon » », « Lecture Data-B : valeur locative ». Le fil de
// conversation affiche ces lignes une à une, au moment où l'outil part.

const court = (v, n = 50) => {
  const t = String(v ?? '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};
const entre = (v) => (v ? ` « ${court(v)} »` : '');

const LIBELLES = {
  chercher_dossier: (i) => `Recherche du dossier${entre(i.recherche || i.ville)}`,
  chercher_projet: (i) => `Recherche du projet${entre(i.recherche || i.nom)}`,
  trouver_bien: (i) => `Recherche du bien dans les projets et les dossiers${entre(i.recherche)}`,
  etat_dossier: () => 'Lecture du dossier',
  etat_projet: () => 'Lecture du projet',
  simuler_dossier: () => 'Simulation du financement',
  affiner_prospection: () => 'Mise à jour de la prospection',
  resultats_prospection: () => 'Lecture des résultats de la prospection',
  preparer_mail: (i) => `Rédaction du mail${i.destinataire ? ` à ${court(i.destinataire, 40)}` : ''}`,
  extraire_documents: () => 'Lecture des documents reçus',
  marche_ville: (i) => `Lecture du marché${entre(i.ville)}`,
  data_b: (i) => `Lecture Data-B : ${({ valeur_locative: 'valeur locative', cessions_fonds: 'cessions de fonds', etude_implantation: "étude d'implantation", proprietaire: 'propriétaire des murs' })[i.quoi] || 'données'}${entre(i.adresse)}`,
  verifier: () => 'Vérification des chiffres',
  creer_agent_monday: (i) => `Ajout de l'agent dans Monday${entre(i.nom || i.email)}`,
  interroger_documents: (i) => `Lecture des documents${i.question ? ` : ${court(i.question, 40)}` : ''}`,
  envoyer_mail: (i) => `Envoi du mail${i.destinataire ? ` à ${court(i.destinataire, 40)}` : ''}`,
  annuler_derniere_action: () => 'Annulation de la dernière action',
  historique_actions: () => "Lecture de l'historique des actions",
  plan_du_jour: () => 'Lecture du plan du jour',
  registre_engagements: () => 'Lecture des promesses des agents',
  creer_dossier: (i) => `Ouverture du dossier${entre(i.nom || i.ville)}`,
  noter_engagement: (i) => `Promesse notée${entre(i.quoi)}`,
  tenir_engagement: () => 'Promesse cochée',
  pousser_dossier_monday: () => 'Envoi du dossier dans Monday',
  pousser_projet_monday: () => 'Envoi du projet dans Monday',
  creer_drive_dossier: () => 'Création du dossier Drive',
  // AK.
  analyser_fiche: () => 'Lecture de la fiche et passage à la grille',
  boite_recue: () => 'Lecture de la boîte de réception',
  lire_mail: () => 'Lecture du mail',
  mails_du_dossier: () => 'Lecture des mails du dossier',
  faire_tout: () => 'Traitement du mail de bout en bout',
  deposer_mail: () => 'Dépôt du mail sur le dossier',
  preanalyser_mail: () => 'Lancement de la préanalyse du mail',
  chercher_drive: (i) => `Recherche sur le Drive${entre(i.recherche)}`,
  ranger_drive: () => 'Rangement sur le Drive',
  bloquer_rdv: (i) => `Rendez-vous dans l'agenda${entre(i.titre)}`,
  agenda: () => "Lecture de l'agenda",
  rediger_loi: (i) => `Rédaction de la LOI${entre(i.adresse_bien)}`,
  rediger_sequence: (i) => (i.sequence_id ? 'Réécriture de la séquence' : `Rédaction de la séquence${(i.etapes || []).length ? ` (${i.etapes.length} emails)` : ''}`),
  lancer_design: () => 'Lancement du chantier de design',
  version: () => 'Lecture de la version en ligne',
  retenir: () => 'Je retiens',
  oublier: () => "J'oublie",
  souvenirs: () => 'Lecture de ce que je sais',
  verifier_renta: () => 'Vérification de la rentabilité',
  chercher_biens: () => 'Recherche des biens qui correspondent',
  lire_piece: () => 'Lecture de la pièce jointe',
  chercher_cible: (i) => `Recherche dans ALX${entre(i.recherche)}`,
  brouillon_proprietaire: () => 'Rédaction du message au propriétaire',
  alx_societes: () => 'Lecture des sociétés propriétaires',
  alx_message: () => 'Préparation du message de démarchage',
  alx_appel: () => "Préparation de l'appel",
  lancer_alx: (i) => `Lancement de la prospection ALX${entre(i.ville)}`,
  ajouter_document: () => 'Ajout du document au dossier',
  creer_client_monday: (i) => `Création du client dans Monday${entre(i.nom)}`,
  modifier_dossier: (i) => {
    const champs = Object.keys(i || {}).filter((k) => k !== 'deal_id' && k !== 'lot_index');
    return `Modification du dossier${champs.length ? ` (${champs.join(', ')})` : ''}`;
  },
  donnees_commune: (i) => `Lecture des chiffres de la commune${entre(i.commune)}`,
  renommer_dossier: (i) => `Renommage du dossier${entre(i.nom)}`,
  supprimer_dossier: () => 'Suppression du dossier',
  creer_projet_depuis_dossier: () => 'Création du projet depuis le dossier',
  ajouter_photos_projet: () => 'Ajout des photos au projet',
  outils_kdata: () => 'Lecture des outils K-Data',
  lancer_kdata: (i) => `Lancement de K-Data${entre(i.adresse)}`,
  generer_prez_bancaire: () => 'Préparation de la présentation bancaire',
  chercher_agents: (i) => `Recherche des agents${entre(i.ville || i.recherche)}`,
  avis_dossier: () => 'Avis sur le dossier',
  mail_agent: () => "Rédaction du mail à l'agent",
  mail_libre: (i) => `Rédaction du mail${i.a ? ` à ${court(i.a, 40)}` : ''}`,
  retoucher_brouillon: () => 'Retouche du brouillon',
  appels_du_jour: () => 'Lecture des appels du jour',
  noter_appel: () => "Notation de l'appel",
  ajouter_prospect: (i) => `Ajout au carnet de prospection${entre(i.nom)}`,
  taches_en_cours: () => 'Lecture des tâches en cours',
  // L'agent du mandataire.
  noter_relance: (i) => `Création de la relance${entre(i.texte)}`,
  noter_rdv: (i) => `Création du rendez-vous${i.avec ? ` avec ${court(i.avec, 40)}` : ''}`,
  nouveau_contact: (i) => `Création de la fiche${entre(i.commerce || i.nom)}`,
  appel_sans_reponse: (i) => `Relance suivante pour${entre(i.qui) || ' le propriétaire'}`,
  resultat_appel: (i) => `Mise à jour de la fiche${entre(i.qui)}`,
  mes_proprietaires: () => 'Lecture de vos propriétaires',
  mes_dossiers: (i) => `Lecture de vos dossiers${entre(i.bien)}`,
  annuler_derniere: () => 'Annulation de la dernière relance',
  ranger_piece: (i) => `Rangement ${({ bail: 'du bail', quittances: 'des quittances', kbis: 'du Kbis', copropriete: 'des pièces de copropriété', diagnostics: 'des diagnostics', taxe_fonciere: 'de la taxe foncière' })[i.categorie] || 'de la pièce'} dans le dossier${entre(i.bien)}`,
  demander_mandat: (i) => `Demande de mandat${entre(i.bien)}`,
  corriger_mandat: (i) => `Correction du mandat${entre(i.bien)}`,
  lancer_estimation: (i) => `Rédaction du rapport d'estimation${entre(i.bien)}`,
  bail_estimation: (i) => `Dépôt du bail sur l'estimation${entre(i.bien)}`,
  mes_rappels: () => 'Lecture de vos rappels',
  demandes_clients: (i) => `Lecture des demandes clients${entre(i.ville)}`,
  avis_de_marche: (i) => `Lecture du marché${entre(i.adresse || i.qui)}`,
};

/** Pure : la ligne à afficher quand l'outil part. */
export function libelleOutil(nom, input = {}) {
  const f = LIBELLES[nom];
  return f ? f(input || {}) : `Outil : ${nom}`;
}
