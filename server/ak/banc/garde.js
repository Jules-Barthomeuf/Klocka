// Le banc d'essai d'AK (12 oct. 2026) : des demandes réelles rejouées sur une
// copie de la base. Ce qui sortirait de la plateforme (Drive, Monday, agenda,
// services payants, tâches de fond) est simulé : le modèle reçoit « fait »,
// rien ne part. Hors banc, ce fichier ne change rien.

export const auBanc = () => process.env.KLOCKA_BANC === '1';

// AK : les gestes qui touchent l'extérieur ou consomment des crédits.
export const SIMULES_AK = new Set([
  'creer_drive_dossier', 'ranger_drive', 'bloquer_rdv', 'data_b', 'lancer_kdata', 'lancer_alx', 'faire_tout',
  'generer_prez_bancaire', 'lancer_design', 'pousser_dossier_monday', 'pousser_projet_monday', 'creer_agent_monday', 'creer_client_monday',
]);
// Les chats mandataire : le rapport d'estimation (Data-B, en fond), MyNotary, Monday.
export const SIMULES_MANDATAIRE = new Set(['lancer_estimation', 'corriger_mandat', 'nouveau_contact', 'envoyer_mynotary', 'rediger_avis', 'lancer_prospective_datab']);

/** Le résultat rendu au modèle pour un geste simulé. */
export const simule = (nom) => ({ ok: true, simule: true, message: `Banc d'essai : ${nom} simulé, rien n'est parti. Considère-le fait.` });
