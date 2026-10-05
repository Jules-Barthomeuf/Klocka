// Les deux dates du bail en cours, telles que la page projet les affiche.

const iso = (v) => (v && /^\d{4}-\d{2}-\d{2}/.test(String(v)) ? String(v).slice(0, 10) : null);
const decaler = (date, ans) => {
  const d = new Date(`${date}T12:00:00`);
  d.setFullYear(d.getFullYear() + ans);
  return d.toISOString().slice(0, 10);
};

// Un bail commercial court neuf ans : la durée qu'on suppose quand le dossier
// n'en donne qu'un bout.
export const ANS_BAIL = 9;

/**
 * Pure : les deux dates de la frise. Ce que le projet porte l'emporte sur ce
 * que le serveur a lu dans le bail, comme dans projet-cases ; ainsi la page
 * suit la saisie de l'éditeur avant même l'enregistrement.
 *
 * Sans prise d'effet, l'arrivée du locataire en tient lieu tant qu'elle tombe
 * dans les douze ans avant l'échéance : au-delà, le bail a été renouvelé et
 * l'arrivée date un bail précédent. `debutVient` dit d'où vient le début.
 */
export function friseDuProjet(project, friseLue) {
  const fin = iso(project?.bail_date_echeance) || iso(project?.echeance_bail) || friseLue?.fin || null;
  let debut = iso(project?.bail_date_debut) || friseLue?.debut || null;
  let debutVient = debut ? "bail" : null;
  const arrivee = iso(project?.locataire_depuis);
  if (!debut && arrivee && (!fin || (arrivee < fin && arrivee >= decaler(fin, -12)))) {
    debut = arrivee;
    debutVient = "arrivee";
  }
  if (!debut && !fin) return null;
  return { debut, fin, debutVient, source: friseLue?.source || null };
}

/**
 * Pure : la frise toujours bornée des deux côtés. Le bout qui manque se
 * déduit de l'autre sur un bail de neuf ans, et se dit estimé : la frise
 * place alors le début, la fin, et aujourd'hui entre les deux.
 */
export function friseBornee(frise) {
  if (!frise?.debut && !frise?.fin) return null;
  if (frise.debut && frise.fin) return { ...frise, estime: null };
  if (frise.fin) return { ...frise, debut: decaler(frise.fin, -ANS_BAIL), estime: "debut" };
  return { ...frise, fin: decaler(frise.debut, ANS_BAIL), estime: "fin" };
}

/** Pure : la date d'arrivée du locataire, ou à défaut le début du bail. */
export function arriveeDuLocataire(project, friseLue = null) {
  return iso(project?.locataire_depuis) || iso(project?.bail_date_debut) || friseLue?.debut || null;
}
