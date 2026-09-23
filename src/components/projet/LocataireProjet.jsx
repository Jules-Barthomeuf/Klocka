import React from "react";
import { nf, InfoDot } from "./SecteurChiffres";
import { useEdition, estMasque } from "./EditionEnPlace";
import { dureeDepuis, dureeJusque, dateLongue, moisEntre } from "./durees";

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

/** Les six valeurs, calculées une fois pour la page et le panneau. */
export function valeursLocataire(project) {
  const loyer = Number(project.sim_loyer_initial_ht) || Number(project.loyer_annuel_ht) || 0;
  return {
    "loc.loyer": loyer > 0 ? `${nf.format(loyer)} €` : null,
    "loc.depuis": dureeDepuis(project.locataire_depuis),
    "loc.restant": dureeJusque(project.echeance_bail, { court: true }),
    "loc.echeance": dateLongue(project.echeance_bail),
    "loc.nom": project.nom_locataire || null,
    "loc.profil": project.profil_locataire || null,
  };
}

/** Pure : la part du bail qui reste à courir, entre 0 et 1, ou null. */
export function partRestante(project, maintenant = new Date()) {
  if (!project.echeance_bail) return null;
  const restant = moisEntre(maintenant, project.echeance_bail);
  if (restant == null) return null;
  const total = project.locataire_depuis ? moisEntre(project.locataire_depuis, project.echeance_bail) : null;
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

function Anneau({ part, texte }) {
  const r = 46;
  const c = 2 * Math.PI * r;
  const visible = part == null ? 0 : part;
  return (
    <div className="relative w-[220px] h-[220px] max-md:w-[180px] max-md:h-[180px] mx-auto">
      <svg viewBox="0 0 110 110" className="w-full h-full -rotate-90">
        <circle cx="55" cy="55" r={r} fill="none" strokeWidth="5" className="stroke-encre/[0.14]" />
        <circle cx="55" cy="55" r={r} fill="none" strokeWidth="5" strokeLinecap="round" className="stroke-menthe transition-[stroke-dashoffset] duration-700"
          strokeDasharray={c} strokeDashoffset={c * (1 - visible)} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
        <div className={`text-[22px] max-md:text-[18px] font-light leading-tight ${texte ? "text-encre" : "text-brume"}`} style={{ fontVariantNumeric: "tabular-nums" }}>{texte || "—"}</div>
        <div className="text-[10.5px] tracking-[0.22em] uppercase text-ardoise mt-1.5">restant</div>
      </div>
    </div>
  );
}

function Case({ valeur, label, info }) {
  return (
    <div>
      <div className={`text-[32px] max-md:text-[24px] font-light leading-none ${valeur ? "text-encre" : "text-brume"}`} style={{ fontVariantNumeric: "tabular-nums" }}>{valeur || "—"}</div>
      <div className="text-[14px] text-ardoise mt-2.5 flex items-center gap-1.5">{label}<InfoDot texte={info} /></div>
    </div>
  );
}

export default function LocataireProjet({ project }) {
  const edition = useEdition();
  const valeurs = valeursLocataire(project);
  const visible = (cle) => !estMasque(edition, cle);
  const loyer = Number(project.sim_loyer_initial_ht) || Number(project.loyer_annuel_ht) || 0;
  const parMois = loyer > 0 ? Math.round(loyer / 12) : 0;

  // Deux colonnes, deux lignes : loyer et échéance à gauche, ce qui en
  // découle (depuis quand, par mois) à droite, comme sur la maquette.
  const bail = [
    visible("loc.loyer") && { valeur: valeurs["loc.loyer"], label: "Loyer annuel HT/HC" },
    visible("loc.depuis") && { valeur: moisAnnee(project.locataire_depuis), label: "En place depuis", info: valeurs["loc.depuis"] ? `Soit ${valeurs["loc.depuis"]}.` : null },
    visible("loc.echeance") && { valeur: valeurs["loc.echeance"], label: "Échéance du bail" },
    visible("loc.loyer") && { valeur: parMois > 0 ? `${nf.format(parMois)} €` : null, label: "Soit par mois" },
  ].filter(Boolean);
  const anneau = visible("loc.restant");
  const exploite = visible("loc.nom") || visible("loc.profil");
  if (!bail.length && !anneau && !exploite) return null;

  const pastilles = pastillesProfil(project.profil_locataire);

  return (
    <div className={`grid gap-10 max-md:gap-6 ${anneau ? "md:grid-cols-[240px_minmax(0,1fr)]" : ""}`}>
      {anneau && (
        <div className="flex items-center">
          <Anneau part={partRestante(project)} texte={valeurs["loc.restant"]} />
        </div>
      )}
      <div className="min-w-0">
        {bail.length > 0 && (
          <div>
            <div className="text-[12px] tracking-[0.2em] uppercase text-ardoise pb-3 border-b border-encre/[0.12]">Le bail en place</div>
            <div className="grid grid-cols-2 gap-x-16 max-md:gap-x-8 gap-y-8 max-md:gap-y-6 py-8 max-md:py-6">
              {bail.map((c) => <Case key={c.label} {...c} />)}
            </div>
          </div>
        )}
        {exploite && (
          <div className={bail.length ? "border-t border-encre/[0.12] pt-6" : ""}>
            <div className="text-[12px] tracking-[0.2em] uppercase text-ardoise mb-3">Qui exploite</div>
            {visible("loc.nom") && (
              <div>
                <div className={`text-[26px] max-md:text-[20px] font-light leading-tight ${valeurs["loc.nom"] ? "text-encre" : "text-brume"}`}>{valeurs["loc.nom"] || "—"}</div>
                <div className="text-[14px] text-ardoise mt-1.5">Nom du locataire</div>
              </div>
            )}
            {visible("loc.profil") && (
              <div className={`flex flex-wrap gap-2 justify-end ${visible("loc.nom") ? "mt-6" : ""}`}>
                {pastilles.length ? pastilles.map((p) => (
                  <span key={p} className="text-[13px] px-4 py-2 rounded-full border border-bord-doux text-craie">{p}</span>
                )) : <span className="text-[13px] px-4 py-2 rounded-full border border-bord-doux text-brume">Profil —</span>}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
