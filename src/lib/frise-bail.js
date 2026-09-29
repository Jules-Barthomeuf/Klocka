// Les deux dates du bail en cours, telles que la page projet les affiche.

/**
 * Pure : les deux dates de la frise. Ce que le projet porte l'emporte sur ce
 * que le serveur a lu dans le bail, comme dans projet-cases ; ainsi la page
 * suit la saisie de l'éditeur avant même l'enregistrement.
 */
export function friseDuProjet(project, friseLue) {
  const iso = (v) => (v && /^\d{4}-\d{2}-\d{2}/.test(String(v)) ? String(v).slice(0, 10) : null);
  const debut = iso(project?.bail_date_debut) || friseLue?.debut || null;
  const fin = iso(project?.bail_date_echeance) || iso(project?.echeance_bail) || friseLue?.fin || null;
  if (!debut && !fin) return null;
  return { debut, fin, source: friseLue?.source || null };
}
