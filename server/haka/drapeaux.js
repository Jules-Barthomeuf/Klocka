// Haka (17 oct. 2026, Jules) : l'agent au centre, une seule file « À valider ».
// Rien n'est actif en production sans un drapeau : on allume palier par palier.
//
//   HAKA_FILE=1            la file, ses routes, la page À valider, les compteurs
//   HAKA_FICHES=1          la compétence « fiche reçue » branchée sur la veille des boîtes
//                          (prime sur MAIL_PREANALYSE_AUTO : l'ancienne passe s'éteint)
//   HAKA_SIMULER=1         aucun appel Gmail ni aucun envoi : le bac à sable le pose
//   HAKA_PLAFOND_JOUR=50   dossiers créés par jour, tous analystes confondus ; alerte quand atteint
//   HAKA_BOITES_COMMUNES   boîtes dont les fiches n'ont pas de propriétaire (section Commun)
//   HAKA_MATIN=1           le tour du matin (relances dues → file, 8 h, lundi-vendredi) ; allumé seul sur Render
//   AK_CHAT_ACTIF=false    coupe le polling Google Chat d'AK sans toucher au code

const oui = (v) => /^(1|true|oui|yes)$/i.test(String(v || ''));
const non = (v) => /^(0|false|non|no)$/i.test(String(v || ''));

export const FILE = oui(process.env.HAKA_FILE);
export const FICHES = oui(process.env.HAKA_FICHES);
export const SIMULER = oui(process.env.HAKA_SIMULER);
export const PLAFOND_JOUR = Math.max(1, Number(process.env.HAKA_PLAFOND_JOUR) || 50);
export const BOITES_COMMUNES = new Set(
  String(process.env.HAKA_BOITES_COMMUNES || 'sourcing@klocka.immo').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean),
);
export const MATIN = FILE && (oui(process.env.HAKA_MATIN) || (!!process.env.RENDER && !non(process.env.HAKA_MATIN)));
export const AK_CHAT_ACTIF = !non(process.env.AK_CHAT_ACTIF);

/** L'état des drapeaux, pour l'écran et le Suivi. */
export const drapeaux = () => ({ file: FILE, fiches: FICHES, matin: MATIN, simuler: SIMULER, plafond_jour: PLAFOND_JOUR, boites_communes: [...BOITES_COMMUNES], ak_chat_actif: AK_CHAT_ACTIF });
