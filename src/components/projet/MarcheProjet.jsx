import React from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { ChiffresStrip, nf, useSecteurProjet } from "./SecteurChiffres";
import { J } from "@/design/jetons";

// Le marché, en trois temps : le résidentiel autour, le commercial de la rue,
// puis le projet lui-même.
//
// Chaque chiffre a une valeur de référence, lue chez Le Figaro pour le
// résidentiel et chez Data-B pour la rue. Le dossier peut la corriger : ce
// qu'il porte l'emporte toujours, sinon on corrigerait dans le vide.

/** La tranche de surface sur laquelle se lisent les loyers commerciaux. */
export function trancheSurface(surface) {
  const s = Number(surface) || 0;
  if (!s) return null;
  return { bas: Math.round(s * 0.7), haut: Math.round(s * 1.3), surface: Math.round(s) };
}

const phraseTranche = (t) =>
  t
    ? `Loyers relevés sur des locaux de ${nf.format(t.bas)} à ${nf.format(t.haut)} m², soit la surface du projet (${nf.format(t.surface)} m²) à 30 % près.`
    : "Loyers relevés sur des locaux de surface comparable.";

const pourcent = (v) => (v == null ? null : `${v > 0 ? "+" : ""}${String(v).replace(".", ",")} %`);

function Comparaison({ bail, offre, projet }) {
  const donnees = [
    bail > 0 && { nom: "Baux existants", valeur: Math.round(bail), teinte: J["menthe-fonce"] },
    offre > 0 && { nom: "Offre de marché", valeur: Math.round(offre), teinte: J["ambre"] },
    projet > 0 && { nom: "Ce projet", valeur: Math.round(projet), teinte: J["menthe"] },
  ].filter(Boolean);
  if (donnees.length < 2) return null;

  return (
    <div className="mt-8 max-md:mt-6">
      <div className="mb-3 text-[11px] uppercase tracking-[0.2em] text-ardoise">Le loyer du projet face au marché</div>
      <div className="h-[220px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={donnees} margin={{ top: 8, right: 12, left: 4, bottom: 8 }} barCategoryGap="28%">
            <XAxis dataKey="nom" tick={{ fill: J["ardoise"], fontSize: 11 }} axisLine={{ stroke: J["trait"] }} tickLine={false} />
            <YAxis tick={{ fill: J["ardoise"], fontSize: 11 }} axisLine={false} tickLine={false} width={58} tickFormatter={(v) => `${nf.format(v)} €`} />
            <Tooltip
              cursor={{ fill: "rgba(255,255,255,0.03)" }}
              contentStyle={{ background: J["surface"], border: `1px solid ${J["bord"]}`, borderRadius: 10, fontSize: 12 }}
              labelStyle={{ color: J["encre"] }}
              formatter={(v) => [`${nf.format(v)} € HT HC /m²/an`, ""]}
            />
            <Bar dataKey="valeur" radius={[3, 3, 0, 0]}>
              {donnees.map((d) => <Cell key={d.nom} fill={d.teinte} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default function MarcheProjet({ project, isPublic = false, prixM2Revient = 0, loyerM2 = 0 }) {
  const { data: donnees } = useSecteurProjet(project, !isPublic);
  const r = donnees?.residentiel;
  const rue = donnees?.rue;

  // Ce que le dossier porte l'emporte sur la source, à condition qu'il porte
  // quelque chose : le formulaire écrit 0 dans les cases vides, et un zéro
  // affiché à la place d'une évolution connue serait un mensonge.
  const duDossier = (valeur, source) => (Number(valeur) ? Number(valeur) : source ?? null);
  const prixRue = Number(project.marche_rue_prix_m2) || rue?.prix_m2 || Number(project.marche_prix_m2_median) || 0;
  const evo1 = duDossier(project.marche_evolution_1an, r?.evolution_1_an?.valeur);
  const evo5 = duDossier(project.marche_evolution_5ans, r?.evolution_5_ans?.valeur);
  const loyerResidentiel = Number(project.marche_residentiel_loyer_m2_mois) || r?.loyer_m2_mois || 0;

  const bail = Number(project.marche_baux_moyenne) || 0;
  const offre = Number(project.marche_offre_moyenne) || rue?.loyer_m2_an || 0;
  const tranche = trancheSurface(project.sim_surface || project.surface_m2);
  const aide = phraseTranche(tranche);

  const rienDuTout = !prixRue && evo1 == null && evo5 == null && !loyerResidentiel && !bail && !offre && !prixM2Revient && !loyerM2;
  if (rienDuTout) return null;

  return (
    <div>
      {!project.marche_masquer_residentiel && (prixRue > 0 || evo1 != null || evo5 != null || loyerResidentiel > 0) && (
        <>
          <div className="mb-3 text-[11px] uppercase tracking-[0.2em] text-ardoise">
            Résidentiel{r?.nom ? ` — ${r.nom}` : ""}
          </div>
          <ChiffresStrip chiffres={[
            prixRue > 0 && {
              valeur: `${nf.format(prixRue)} €`,
              label: "Prix moyen dans la rue /m²",
              info: `Prix du résidentiel dans la rue, selon Le Figaro Immobilier${rue?.prix_m2_source ? ` (${rue.prix_m2_source})` : ""}.`,
            },
            evo1 != null && { valeur: pourcent(evo1), label: "Sur 1 an, dans la ville", accent: evo1 < 0 ? "text-red-400" : "text-menthe-clair" },
            evo5 != null && { valeur: pourcent(evo5), label: "Sur 5 ans, dans la ville", accent: evo5 < 0 ? "text-red-400" : "text-menthe-clair" },
            loyerResidentiel > 0 && {
              valeur: `${nf.format(loyerResidentiel)} €`,
              label: "Loyer résidentiel moyen /m²/mois",
              info: "Loyer médian d'un appartement, hors charges, selon Le Figaro Immobilier.",
            },
          ]} />
        </>
      )}

      {!project.marche_masquer_commercial && (bail > 0 || offre > 0) && (
        <div className="mt-8 max-md:mt-6">
          <div className="mb-3 text-[11px] uppercase tracking-[0.2em] text-ardoise">
            Commercial{rue?.nom ? ` — ${rue.nom}` : ""}
          </div>
          <ChiffresStrip chiffres={[
            bail > 0 && { valeur: `${nf.format(bail)} €`, label: "Loyer moyen des baux existants /m²/an", info: aide },
            offre > 0 && { valeur: `${nf.format(offre)} €`, label: "Loyer moyen à l'offre /m²/an", info: aide },
          ]} />
        </div>
      )}

      {(prixM2Revient > 0 || loyerM2 > 0) && (
        <div className="mt-8 max-md:mt-6">
          <div className="mb-3 text-[11px] uppercase tracking-[0.2em] text-ardoise">Ce projet</div>
          <ChiffresStrip chiffres={[
            prixM2Revient > 0 && {
              valeur: `${nf.format(prixM2Revient)} €`,
              label: "Prix du projet /m²",
              accent: "text-menthe-clair",
              info: "Prix de revient (prix négocié, droits, honoraires et frais) divisé par la surface.",
            },
            loyerM2 > 0 && {
              valeur: `${nf.format(loyerM2)} €`,
              label: "Loyer du projet /m²/an",
              accent: "text-menthe-clair",
              info: "Loyer annuel HT HC divisé par la surface.",
            },
          ]} />
        </div>
      )}

      <Comparaison bail={bail} offre={offre} projet={loyerM2} />
    </div>
  );
}
