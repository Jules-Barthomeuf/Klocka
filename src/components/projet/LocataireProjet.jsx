import React from "react";
import { nf, InfoDot } from "./SecteurChiffres";
import { useEdition, estMasque, ValeurEditable, ValeurForcee, forcee, Bloc } from "./EditionEnPlace";
import { Carte, TitreCarte } from "./Cartes";
import { dureeDepuis, dureeJusque, dateLongue, moisEntre } from "./durees";
import { friseDuProjet, arriveeDuLocataire } from "@/lib/frise-bail";

// Le locataire : à gauche l'anneau du bail restant à courir, à droite le bail
// en place (loyer annuel, en place depuis, échéance, soit par mois), puis
// qui exploite (le nom, et le profil en pastilles).
//
// Les cases sont toujours là, remplies ou non : on voit ce qu'il reste à
// trouver. Chacune se retire de la page d'une croix, depuis le panneau ; la
// liste des cases retirées vit dans le projet (champs_masques), comme pour
// les autres champs.

export const CASES_LOCATAIRE = [
  ["loc.loyer", "Loyer annuel HT/HC"],
  ["loc.depuis", "En place depuis"],
  ["loc.restant", "Bail restant à courir"],
  ["loc.echeance", "Échéance du bail"],
  ["loc.nom", "Nom du locataire"],
  ["loc.profil", "Profil"],
];

// Un bail commercial court neuf ans : c'est la durée qu'on prend pour
// l'anneau quand le dossier ne dit pas depuis quand le locataire est là.
const MOIS_BAIL = 108;

// L'échéance du bail : la même date que la frise de l'onglet Bail.
const echeanceDe = (project) => project.bail_date_echeance || project.echeance_bail || null;

/** Les six valeurs, calculées une fois pour la page et le panneau. */
export function valeursLocataire(project, friseLue = null) {
  const loyer = Number(project.sim_loyer_initial_ht) || Number(project.loyer_annuel_ht) || 0;
  return {
    "loc.loyer": loyer > 0 ? `${nf.format(loyer)} €` : null,
    "loc.depuis": dureeDepuis(arriveeDuLocataire(project, friseLue)),
    "loc.restant": dureeJusque(echeanceDe(project), { court: true }),
    "loc.echeance": dateLongue(echeanceDe(project)),
    "loc.nom": project.nom_locataire || null,
    "loc.profil": project.profil_locataire || null,
  };
}

/** Pure : la part du bail qui reste à courir, entre 0 et 1, ou null. */
export function partRestante(project, maintenant = new Date(), friseLue = null) {
  const fin = echeanceDe(project);
  if (!fin) return null;
  const restant = moisEntre(maintenant, fin);
  if (restant == null) return null;
  // La durée se mesure depuis le début du bail, comme la frise de l'onglet Bail.
  const debut = friseDuProjet(project, friseLue)?.debut;
  const total = debut ? moisEntre(debut, fin) : null;
  const duree = total > 0 ? total : MOIS_BAIL;
  return Math.max(0, Math.min(1, restant / duree));
}

/** « Juin 2021 » : le mois et l'année, sans le jour. */
const moisAnnee = (iso) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const t = d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  return t.charAt(0).toUpperCase() + t.slice(1);
};

/** Le profil en pastilles : « Indépendant, SARL · 2 associés » en devient deux. */
export const pastillesProfil = (texte) => String(texte || "").split(/\s*[,;|\n]\s*/).map((p) => p.trim()).filter(Boolean);

function Anneau({ part, texte, children = null }) {
  const r = 46;
  const c = 2 * Math.PI * r;
  const visible = part == null ? 0 : part;
  return (
    <div className="relative w-[220px] h-[220px] max-md:w-[180px] max-md:h-[180px] mx-auto">
      <svg viewBox="0 0 110 110" className="w-full h-full -rotate-90">
        <circle cx="55" cy="55" r={r} fill="none" strokeWidth="5" className="stroke-relief" />
        <circle cx="55" cy="55" r={r} fill="none" strokeWidth="5" strokeLinecap="round" className="stroke-menthe transition-[stroke-dashoffset] duration-700"
          strokeDasharray={c} strokeDashoffset={c * (1 - visible)} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
        <div className={`text-[22px] max-md:text-[18px] font-medium leading-tight ${texte ? "text-encre" : "text-brume"}`} style={{ fontVariantNumeric: "tabular-nums" }}>{children || texte || "—"}</div>
        <div className="text-[13px] text-ardoise mt-1.5">restant</div>
      </div>
    </div>
  );
}

// `champ` : le champ du projet que la case modifie au clic ; `force` : la
// valeur forcée, pour ce qui se calcule (le loyer par mois).
function Case({ valeur, label, info, champ = null, type = "number", force = null }) {
  const texte = valeur || "—";
  return (
    <div>
      <div className={`text-[32px] max-md:text-[24px] font-medium tracking-[-0.02em] leading-none ${valeur ? "text-encre" : "text-brume"}`} style={{ fontVariantNumeric: "tabular-nums" }}>
        {force ? <ValeurForcee cle={force}>{texte}</ValeurForcee> : <ValeurEditable champ={champ} type={type}>{texte}</ValeurEditable>}
      </div>
      <div className="text-[13px] text-ardoise mt-2.5 flex items-center gap-1.5">{label}<InfoDot texte={info} /></div>
    </div>
  );
}

// `friseLue` : les dates que le serveur a lues dans le bail, pour qu'une
// arrivée non saisie se déduise de la prise d'effet.
export default function LocataireProjet({ project, friseLue = null }) {
  const edition = useEdition();
  const valeurs = valeursLocataire(project, friseLue);
  const arrivee = arriveeDuLocataire(project, friseLue);
  const visible = (cle) => !estMasque(edition, cle);
  const loyer = Number(project.sim_loyer_initial_ht) || Number(project.loyer_annuel_ht) || 0;
  const parMois = loyer > 0 ? Math.round(loyer / 12) : 0;
  const parMoisTexte = forcee(project, "loc_par_mois") || (parMois > 0 ? `${nf.format(parMois)} €` : null);
  const restant = forcee(project, "loc_restant") || valeurs["loc.restant"];

  // Deux colonnes, deux lignes : loyer et échéance à gauche, ce qui en
  // découle (depuis quand, par mois) à droite, comme sur la maquette.
  const bail = [
    visible("loc.loyer") && { valeur: valeurs["loc.loyer"], label: "Loyer annuel HT/HC", champ: "sim_loyer_initial_ht" },
    visible("loc.depuis") && { valeur: moisAnnee(arrivee), label: "En place depuis", info: valeurs["loc.depuis"] ? `Soit ${valeurs["loc.depuis"]}.` : null, champ: "locataire_depuis", type: "date" },
    visible("loc.echeance") && { valeur: valeurs["loc.echeance"], label: "Échéance du bail", champ: "echeance_bail", type: "date" },
    visible("loc.loyer") && { valeur: parMoisTexte, label: "Soit par mois", force: "loc_par_mois" },
  ].filter(Boolean);
  const anneau = visible("loc.restant");
  const exploite = visible("loc.nom") || visible("loc.profil");
  if (!bail.length && !anneau && !exploite) return null;

  const pastilles = pastillesProfil(project.profil_locataire);

  return (
    <div className={`grid gap-5 ${anneau ? "md:grid-cols-[300px_minmax(0,1fr)]" : ""}`}>
      {anneau && (
        <Bloc id="locataire-duree" titre="Durée du bail">
        <Carte className="flex h-full flex-col gap-4 p-7 max-md:p-5">
          <TitreCarte titre="Durée du bail" sous="La part qui reste à courir" />
          <div className="flex flex-1 items-center">
            <Anneau part={partRestante(project, new Date(), friseLue)} texte={restant}><ValeurForcee cle="loc_restant" type="text">{restant || "—"}</ValeurForcee></Anneau>
          </div>
        </Carte>
        </Bloc>
      )}
      <div className="min-w-0 flex flex-col gap-5">
        {bail.length > 0 && (
          <Bloc id="locataire-bail" titre="Le bail en place">
          <Carte className="p-7 max-md:p-5">
            <TitreCarte titre="Le bail en place" />
            <div className="grid grid-cols-2 gap-x-10 max-md:gap-x-6 gap-y-8 max-md:gap-y-6 pt-6">
              {bail.map((c) => <Case key={c.label} {...c} />)}
            </div>
          </Carte>
          </Bloc>
        )}
        {exploite && (
          <Bloc id="locataire-exploite" titre="Qui exploite">
          <Carte className="p-7 max-md:p-5">
            <div className="mb-4"><TitreCarte titre="Qui exploite" /></div>
            {visible("loc.nom") && (
              <div>
                <div className={`text-[26px] max-md:text-[20px] font-medium tracking-[-0.01em] leading-tight ${valeurs["loc.nom"] ? "text-encre" : "text-brume"}`}><ValeurEditable champ="nom_locataire" type="text">{valeurs["loc.nom"] || "—"}</ValeurEditable></div>
                <div className="text-[14px] text-ardoise mt-1.5">Nom du locataire</div>
              </div>
            )}
            {visible("loc.profil") && (
              <div className={`flex flex-wrap gap-2 ${visible("loc.nom") ? "mt-5" : ""}`}>
                {/* Le profil se modifie d'un bloc : les pastilles se séparent par des virgules. */}
                <ValeurEditable champ="profil_locataire" type="text">
                  <span className="flex flex-wrap gap-2">
                    {pastilles.length ? pastilles.map((p) => (
                      <span key={p} className="text-[13px] px-3.5 py-1.5 rounded-full bg-relief text-craie">{p}</span>
                    )) : <span className="text-[13px] px-3.5 py-1.5 rounded-full bg-relief text-brume">Profil —</span>}
                  </span>
                </ValeurEditable>
              </div>
            )}
          </Carte>
          </Bloc>
        )}
      </div>
    </div>
  );
}
