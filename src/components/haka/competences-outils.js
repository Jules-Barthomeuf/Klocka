// Les petits outils partagés par la liste et la fiche des compétences (17 oct. 2026).

export const quand = (iso) => (iso ? new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");
export const jour = (iso) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : "");
export const NOMS_DECLENCHEURS = {
  chat: "chat", dossier: "dossier", mail: "mail", automatique: "auto", mail_fiche_recue: "mail reçu", fiche_deposee: "dépôt", documents_recus: "documents reçus",
  planifie: "horaire", demande_chat: "chat", bouton: "bouton",
};

/** Pure : l'état affiché d'une compétence. */
export const statutDe = (c) => (Number(c.version) === 0 ? { cle: "brouillon", mot: "Brouillon, jamais publiée" } : c.desactivee ? { cle: "desactivee", mot: "Désactivée" } : c.brouillon ? { cle: "active", mot: "Active · brouillon en cours" } : { cle: "active", mot: "Active" });
