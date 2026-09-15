import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Star } from "lucide-react";
import { base44 } from "@/api/base44Client";

// Les chiffres du secteur d'un projet, lus par le serveur (voir
// server/projet-secteur.js) : agglomération, centre-ville, résidentiel du
// Figaro, rue selon Data-B, flux et commercialité en étoiles.

// L'espace fine insécable du format français disparaît presque dans cette
// police : une espace insécable ordinaire garde les millions lisibles.
const format = new Intl.NumberFormat("fr-FR");
export const nf = { format: (n) => format.format(n).replace(/\u202f/g, "\u00a0") };

export function useSecteurProjet(project, actif = true) {
  return useQuery({
    queryKey: ["secteur-projet", project?.id, project?.adresse_complete],
    queryFn: () => base44.request("GET", `/api/projects/${project.id}/secteur`),
    enabled: actif && !!project?.id && !!project?.adresse_complete,
    // Le calcul tourne en arrière-plan côté serveur : on repasse tant qu'il dure.
    refetchInterval: (q) => (q.state.data?.en_cours ? 5000 : false),
    staleTime: 60_000,
    retry: false,
  });
}

export function Etoiles({ note, sur = 5 }) {
  return (
    <span className="inline-flex items-center gap-[3px]" role="img" aria-label={`${note} sur ${sur}`}>
      {Array.from({ length: sur }, (_, i) => (
        <Star key={i} strokeWidth={1.5} className={`w-[15px] h-[15px] ${i < note ? "text-menthe-clair fill-current" : "text-encre/[0.2]"}`} />
      ))}
    </span>
  );
}

// Pastille « i » : comment lire le chiffre. Ouvre au survol et au clic, pour
// rester utilisable sur mobile où il n'y a pas de survol.
export function InfoDot({ texte }) {
  const [open, setOpen] = useState(false);
  if (!texte) return null;
  return (
    <span className="relative inline-flex align-middle">
      <button
        type="button"
        aria-label="Comment lire ce chiffre"
        onClick={() => setOpen((v) => !v)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onBlur={() => setOpen(false)}
        className={`w-[15px] h-[15px] rounded-full border text-[11px] leading-none flex items-center justify-center transition-colors
          ${open ? "border-menthe-clair text-menthe-clair" : "border-encre/25 text-ardoise hover:border-menthe-clair hover:text-menthe-clair"}`}
      >
        i
      </button>
      {open && (
        <span className="absolute left-1/2 -translate-x-1/2 bottom-[calc(100%+8px)] z-30 w-64 max-md:w-52 bg-surface border border-bord px-3.5 py-3 text-[12.5px] leading-[1.6] text-craie text-left normal-case tracking-normal shadow-xl">
          {texte}
        </span>
      )}
    </span>
  );
}

export function ChiffresStrip({ chiffres, className = "mb-5" }) {
  const list = (chiffres || []).filter((c) => c && c.valeur != null && c.valeur !== "");
  if (!list.length) return null;
  return (
    <div className={`flex flex-wrap border-t border-encre/[0.35] ${className}`}>
      {list.map((c, i) => (
        <div key={c.label} className={`flex-1 min-w-[130px] max-md:min-w-[46%] py-4 max-md:py-3 pr-5 ${i > 0 ? "md:border-l md:border-encre/[0.12] md:pl-5" : ""}`}>
          <div className={`text-[24px] max-md:text-[18px] font-light min-h-[32px] max-md:min-h-[26px] flex items-center ${c.accent || "text-encre"}`} style={{ fontVariantNumeric: "tabular-nums" }}>{c.valeur}</div>
          <div className="flex items-center gap-1.5 mt-1">
            <span className="text-[11px] text-ardoise">{c.label}</span>
            <InfoDot texte={c.info} />
          </div>
        </div>
      ))}
    </div>
  );
}

const distance = (m) => (m < 1000 ? `${nf.format(Math.round(m / 10) * 10)} m` : `${String((m / 1000).toFixed(1)).replace(".", ",")} km`);
const evolution = (e) => (e ? `${e.valeur > 0 ? "+" : ""}${String(e.valeur).replace(".", ",")} %` : null);
const teinte = (e) => (e ? (e.valeur < 0 ? "text-red-400" : "text-menthe-clair") : "");

/** Distance, commercialité et flux : la bande du secteur. */
export function chiffresSecteur(donnees) {
  const f = donnees?.flux;
  return [
    donnees?.centre?.distance_m != null && {
      valeur: distance(donnees.centre.distance_m),
      label: "Distance du centre-ville",
      info: `À vol d'oiseau, depuis la ${donnees.centre.repere}.`,
    },
    f?.commercialite && {
      valeur: <Etoiles {...f.commercialite} />,
      label: "Commercialité",
      info: `Note Data-B du tronçon${f.troncon ? ` : ${f.troncon}` : ""}.`,
    },
    f?.pieton && { valeur: <Etoiles {...f.pieton} />, label: "Flux piéton", info: "Estimation Data-B du passage piéton dans la zone." },
    f?.voiture && { valeur: <Etoiles {...f.voiture} />, label: "Flux voiture", info: "Estimation Data-B du trafic automobile dans la zone." },
  ].filter(Boolean);
}

/** Prix et loyers : le résidentiel du Figaro, puis la rue et le projet l'un sous l'autre. */
export function PrixEtLoyers({ donnees, prixM2Revient, loyerM2 }) {
  const r = donnees?.residentiel;
  const rue = donnees?.rue;
  const aProjet = prixM2Revient > 0 || loyerM2 > 0;
  if (!r && !rue && !aProjet) return null;
  const echelleDe = (e) => (e && r && e.echelle !== r.echelle ? ` (${e.echelle})` : "");
  return (
    <div className="mt-8 max-md:mt-6">
      {r && (
        <>
          <div className="text-[11px] tracking-[0.2em] uppercase text-ardoise mb-3">
            Résidentiel — {r.nom}
          </div>
          <ChiffresStrip chiffres={[
            r.prix_m2 && { valeur: `${nf.format(r.prix_m2)} €`, label: "Prix moyen /m²", info: `Prix médian d'un appartement, ${r.echelle === "quartier" ? "au quartier" : "à la commune"}, selon Le Figaro Immobilier.` },
            r.evolution_1_an && { valeur: evolution(r.evolution_1_an), label: `Sur 1 an${echelleDe(r.evolution_1_an)}`, accent: teinte(r.evolution_1_an) },
            r.evolution_5_ans && { valeur: evolution(r.evolution_5_ans), label: `Sur 5 ans${echelleDe(r.evolution_5_ans)}`, accent: teinte(r.evolution_5_ans) },
            r.loyer_m2_mois && { valeur: `${nf.format(r.loyer_m2_mois)} €`, label: "Loyer moyen /m²/mois", info: "Loyer médian d'un appartement, hors charges, selon Le Figaro Immobilier." },
          ]} />
        </>
      )}
      {(rue || aProjet) && (
        <div className="grid md:grid-cols-2 gap-x-10 mt-2">
          {rue && (
            <div className="md:col-span-2 text-[11px] tracking-[0.2em] uppercase text-ardoise mb-3 mt-3">
              Commerce — {rue.nom}
            </div>
          )}
          <ChiffresStrip className="mb-0" chiffres={[
            rue?.prix_m2 && { valeur: `${nf.format(rue.prix_m2)} €`, label: "Prix moyen dans la rue /m²", info: rue.prix_m2_source ? `Source : ${rue.prix_m2_source}.` : null },
          ]} />
          <ChiffresStrip className="mb-0" chiffres={[
            rue?.loyer_m2_an && { valeur: `${nf.format(rue.loyer_m2_an)} €`, label: "Loyer moyen dans la rue /m²/an", info: rue.loyer_bas ? `Fourchette ${nf.format(rue.loyer_bas)} à ${nf.format(rue.loyer_haut)} € HT HC /m²/an${rue.loyer_source ? `, ${rue.loyer_source}` : ""}.` : null },
          ]} />
          <ChiffresStrip className="mb-0" chiffres={[
            prixM2Revient > 0 && { valeur: `${nf.format(prixM2Revient)} €`, label: "Prix du projet /m², prix de revient", accent: "text-menthe-clair", info: "Prix de revient (prix négocié, droits, honoraires et frais) divisé par la surface." },
          ]} />
          <ChiffresStrip className="mb-0" chiffres={[
            loyerM2 > 0 && { valeur: `${nf.format(loyerM2)} €`, label: "Loyer du projet /m²/an", accent: "text-menthe-clair", info: "Loyer annuel HT HC divisé par la surface." },
          ]} />
        </div>
      )}
    </div>
  );
}
