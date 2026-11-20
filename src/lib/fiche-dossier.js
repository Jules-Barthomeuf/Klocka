// La fiche du dossier, côté écran (19 nov. 2026) : les dates d'une action, et l'ouverture d'une fiche d'où qu'on soit.

export const isoJour = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** « jeu. 20 nov. », « aujourd'hui », « demain ». */
export function dateCourte(iso) {
  if (!iso) return "";
  const auj = isoJour();
  const demain = isoJour(new Date(Date.now() + 864e5));
  if (iso === auj) return "aujourd'hui";
  if (iso === demain) return "demain";
  return new Date(`${iso}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
}

/** La date d'un journal : « 19 nov. », l'année si ce n'est pas celle-ci. */
export function dateJournal(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const memeAnnee = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", ...(memeAnnee ? {} : { year: "numeric" }) });
}

/** Les trois raccourcis d'une action sans date : aujourd'hui, demain, cette semaine (le vendredi, ou demain s'il est passé). */
export function choixDates() {
  const auj = new Date();
  const vendredi = new Date(auj);
  vendredi.setDate(auj.getDate() + ((5 - auj.getDay() + 7) % 7));
  const finSemaine = auj.getDay() >= 5 || auj.getDay() === 0 ? null : isoJour(vendredi);
  return [
    { libelle: "Aujourd'hui", valeur: isoJour(auj) },
    { libelle: "Demain", valeur: isoJour(new Date(auj.getTime() + 864e5)) },
    ...(finSemaine && finSemaine !== isoJour(auj) ? [{ libelle: "Cette semaine", valeur: finSemaine }] : [{ libelle: "Lundi", valeur: isoJour(new Date(auj.getTime() + (((8 - auj.getDay()) % 7) || 7) * 864e5)) }]),
  ];
}

/** Ouvre la fiche d'un bien, d'un agent ou d'un client par-dessus la page (FicheDossierHote l'affiche). */
export const ouvrirFiche = (cle) => window.dispatchEvent(new CustomEvent("klocka:fiche-dossier", { detail: { cle } }));

export const enRetard = (iso) => !!iso && iso < isoJour();
