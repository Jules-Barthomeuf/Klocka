// Une famille : chaque membre voit le dossier du titulaire (server/famille.js).
// Le serveur filtre déjà ; ces aides servent les pages qui demandent par adresse.

/** L'adresse dont ce compte voit le dossier : celle du titulaire, ou la sienne. */
export const adresseDuDossier = (user) =>
  (user?.est_compte_shadow && user?.compte_maitre_email) || user?.email || "";

/** « Paul », « Paul et Marie », « Paul, Marie et Léa » : le sien d'abord. */
export function prenomsDeLaFamille(user) {
  const prenoms = user?.famille?.prenoms;
  const seul = String(user?.full_name || user?.email?.split("@")[0] || "").split(" ")[0];
  if (!Array.isArray(prenoms) || prenoms.length < 2) return seul;
  return `${prenoms.slice(0, -1).join(", ")} et ${prenoms[prenoms.length - 1]}`;
}
