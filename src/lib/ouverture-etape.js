// Le premier mot de l'assistant dans l'étape d'un bien importé (6 nov. 2026, Jules : « quand on a importé un bien et
// qu'on arrive dans une étape, je veux que l'assistant me dise quelque chose, sinon on ne comprend pas bien »). Écrit
// depuis ce que l'import a gardé sur la fiche, sans appel au modèle : il s'affiche tout de suite et ne coûte rien.
// Il dit ce qu'on sait du bien, puis ce qu'on fait à cette étape, et ce qu'il suffit de dire.

import { estLocation } from "./location.js";
import { etapesVisibles, versVisible } from "./biens-mandataire.js";

const euros = (n) => (Number(n) > 0 ? `${Math.round(Number(n)).toLocaleString("fr-FR")} €` : null);
const jour = (iso) => (iso ? new Date(`${String(iso).slice(0, 10)}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : null);

/** Pure : ce que l'import a appris du bien, en une phrase (« 85 m², loyer 18 600 € par an, mandat signé le 3 mars 2026 »), ou null. */
export function ceQuOnSait(p) {
  const r = p?.biens?.repris || {};
  const m = p?.mandat_importe || null;
  const location = estLocation(p);
  const morceaux = [
    r.surface ? `${Number(r.surface).toLocaleString("fr-FR")} m²` : null,
    r.lots?.length > 1 ? `${r.lots.length} lots` : null,
    euros(r.loyer_annuel) ? `${location ? "loyer demandé" : "loyer"} ${euros(r.loyer_annuel)} par an` : null,
    !location && euros(r.prix || p?.biens?.prix_accord) ? `prix ${euros(r.prix || p.biens.prix_accord)}` : null,
    m ? (m.signe_le ? `mandat signé le ${jour(m.signe_le)}${m.enseigne && !m.k_partners ? ` chez ${m.enseigne}` : ""}` : "mandat pas encore signé") : null,
  ].filter(Boolean);
  return morceaux.length ? morceaux.join(", ") : null;
}

/** Pure : le premier message de l'étape `etape` d'un bien importé, ou null (un bien qui n'est pas importé, une étape inconnue). */
export function ouvertureDeLEtape(bien, etape) {
  const p = bien?.proprietaire || null;
  if (!p?.biens?.import) return null;
  const location = estLocation(p);
  const mot = etapesVisibles(p).find((e) => e.id === versVisible(etape))?.label;
  if (!mot) return null;
  const nom = bien.titre || p.nom_bien || p.commerce || "ce bien";
  const su = ceQuOnSait(p);
  const tete = `Vous êtes à l'étape ${mot} de ${nom}${location ? ", un local à louer" : ""}.${su ? ` D'après l'import : ${su}.` : ""}`;
  const m = p.mandat_importe || null;
  const suite = {
    previsite: p.biens?.compte_rendu
      ? "La visite est racontée. Dites « on passe à l'estimation » et j'ouvre l'étape suivante."
      : "Racontez-moi la visite (un vocal suffit), ou dites « on passe à l'estimation » si elle est déjà faite.",
    estimation: bien.estimation?.avis
      ? `${location ? "L'estimation du loyer" : "L'avis de valeur"} est là. Dites-moi ce qu'il faut corriger, ou « on passe au mandat ».`
      : `Je rédige ${location ? "l'estimation du loyer" : "l'avis de valeur"} avec ce que l'import m'a appris : dites « rédige-le », ou donnez-moi ce qui manque (la surface, ${location ? "l'état du local" : "le loyer"}).`,
    mandat: m?.signe_le
      ? `Le mandat est signé : rien à refaire ici. Dites « on passe à la Data room » pour ranger les pièces.`
      : m
        ? `Le mandat importé n'est pas encore signé. Dites-moi quand il l'est, ou faites-le ici : je le prépare avec ${location ? "le loyer demandé" : "le prix"} et le propriétaire.`
        : `Je prépare le mandat de ${location ? "location" : "vente"} avec ce que je sais : dites « prépare le mandat », je ne demanderai que ce qui manque.`,
    dataroom: `Onglet Data room : déposez ici les pièces du bien (bail, quittances, diagnostics…), je les range dans leur case ; les obligatoires sont marquées en ambre. Une fois réunies, ${location ? "la mise en location" : "la mise en vente"} prépare le teaser et les annonces, dans l'onglet Diffusion.`,
    marche: location
      ? "On cherche le locataire : la Diffusion porte le teaser « Local à louer » et les annonces, les Acquéreurs vos contacts, les Offres celles reçues."
      : "La Diffusion porte le teaser et les annonces, les Acquéreurs vos contacts, les Offres celles reçues, et l'onglet Vendeur le rapport à lui envoyer.",
    offre: location
      ? "Vos acquéreurs, les futurs locataires, arrivent ici. Dites-moi qui a visité ou envoyé son dossier, je le note."
      : "Les offres arrivent ici. Dites-moi l'offre reçue (qui, combien, conditions), je la note.",
    vente: location
      ? "Le bail signé clôt le parcours. Dites-moi la date de signature et le loyer retenu."
      : "La vente clôt le parcours. Dites-moi la date du compromis ou de l'acte.",
  }[etape];
  return suite ? `${tete} ${suite}` : tete;
}
