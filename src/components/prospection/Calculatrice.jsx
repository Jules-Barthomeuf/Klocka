import React, { useEffect, useMemo, useRef, useState } from "react";
import { chiffresEntendus, calculer } from "@/lib/chiffres-entendus";
import seuils from "../../../server/ak/seuils.json";

// La calculatrice du mode appel (16 oct. 2026, Jules) : dès qu'un prix ou un
// loyer est dit, elle s'ouvre dans la colonne de gauche, les chiffres déjà
// posés, et fait les comptes aux seuils d'AK. Un chiffre se corrige à la main ;
// redit autrement au téléphone, c'est le nouveau qui revient.

const euros = (n) => `${Math.round(n).toLocaleString("fr-FR")} €`;
const pct = (n) => `${n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`;
const VERDICT = { tourne: ["Ça tourne", "text-menthe"], limite: ["Limite", "text-ambre"], dead: ["Dead", "text-alerte"] };

function Champ({ libelle, valeur, onChange, unite, aide }) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-[12.5px] text-ardoise">{libelle}</span>
      <span className="flex items-baseline gap-1.5 border-b border-trait focus-within:border-menthe">
        <input inputMode="decimal" value={valeur} onChange={(e) => onChange(e.target.value)} placeholder="—"
          className="w-full min-w-0 bg-transparent py-1 text-[18px] tabular-nums text-encre outline-none placeholder:text-brume max-md:text-[16px]" />
        <span className="flex-none text-[12.5px] text-brume">{unite}</span>
      </span>
      {aide && <span className="text-[12.5px] text-brume">{aide}</span>}
    </label>
  );
}

function Ligne({ libelle, valeur, classe = "text-encre" }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[13.5px] text-ardoise">{libelle}</span>
      <span className={`whitespace-nowrap text-[13.5px] tabular-nums ${classe}`}>{valeur}</span>
    </div>
  );
}

const lireNombre = (s) => {
  const n = Number(String(s).replace(/[\s\u00a0\u202f€]/g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
};
const ecrire = (n) => (n == null ? "" : Math.round(n).toLocaleString("fr-FR"));

/** `textes` : les morceaux transcrits et les notes de l'appel. */
export default function Calculatrice({ textes }) {
  const lu = useMemo(() => chiffresEntendus(textes), [textes.join("\n")]);
  const [saisi, setSaisi] = useState({});
  // Un chiffre redit au téléphone remplace celui tapé à la main.
  const precedent = useRef(lu);
  useEffect(() => {
    const avant = precedent.current;
    setSaisi((s) => {
      const t = { ...s };
      for (const k of ["prix", "loyer_an", "surface"]) if (lu[k] !== avant[k]) delete t[k];
      return t;
    });
    precedent.current = lu;
  }, [lu.prix, lu.loyer_an, lu.surface]);

  if (lu.prix == null && lu.loyer_an == null) return null;
  const valeur = (k) => (k in saisi ? saisi[k] : ecrire(lu[k]));
  const v = { prix: lireNombre(valeur("prix")), loyer_an: lireNombre(valeur("loyer_an")), surface: lireNombre(valeur("surface")) };
  const r = calculer(v, seuils);
  const poser = (k) => (x) => setSaisi((s) => ({ ...s, [k]: x }));
  const [mot, couleur] = VERDICT[r.verdict] || [];

  return (
    <div className="flex flex-col gap-4 border-t border-trait pt-4 duration-500 animate-in fade-in-0 slide-in-from-bottom-2">
      <span className="text-[11px] tracking-[.16em] text-brume">CALCULATRICE</span>
      <div className="flex flex-col gap-3">
        <Champ libelle="Prix FAI" valeur={valeur("prix")} onChange={poser("prix")} unite="€" />
        <Champ libelle="Loyer annuel HT" valeur={valeur("loyer_an")} onChange={poser("loyer_an")} unite="€/an"
          aide={lu.loyer_mensuel && !("loyer_an" in saisi) ? `Dit au mois : ${euros(lu.loyer_an / 12)}` : null} />
        <Champ libelle="Surface" valeur={valeur("surface")} onChange={poser("surface")} unite="m²" />
      </div>
      {(r.rendement_brut != null || r.prix_qui_passe != null) && (
        <div className="flex flex-col gap-1.5">
          {r.rendement_brut != null && <Ligne libelle="Rendement brut" valeur={pct(r.rendement_brut)} />}
          {r.rendement_aem != null && <Ligne libelle={`Acte en main (+${String(seuils.frais_acquisition_pct).replace(".", ",")} %)`} valeur={pct(r.rendement_aem)} />}
          {mot && <Ligne libelle="Verdict" valeur={mot} classe={couleur} />}
          {r.prix_qui_passe != null && <Ligne libelle={`Prix pour ${seuils.rendement_aem.tourne} % acte en main`} valeur={euros(r.prix_qui_passe)} />}
          {r.prix_m2 != null && <Ligne libelle="Prix au m²" valeur={euros(r.prix_m2)} />}
          {r.loyer_m2_an != null && <Ligne libelle="Loyer au m² par an" valeur={euros(r.loyer_m2_an)} />}
        </div>
      )}
    </div>
  );
}
