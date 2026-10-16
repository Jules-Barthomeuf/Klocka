import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { chiffresEntendus, calculer } from "@/lib/chiffres-entendus";
import seuils from "../../../server/ak/seuils.json";

// La calculatrice du mode appel (16 oct. 2026, Jules) : dès qu'un prix ou un
// loyer est dit, elle s'ouvre en fenêtre devant la barre de gauche (au
// téléphone, en bas de l'écran), les chiffres déjà posés. Elle se déplace par
// son en-tête, et garde sa place d'un appel à l'autre. Un chiffre se corrige à
// la main ; redit autrement au téléphone, c'est le nouveau qui revient.
// Ni verdict ni prix cible (Jules, même jour) : les chiffres, rien de plus.

const euros = (n) => `${Math.round(n).toLocaleString("fr-FR")} €`;
const pct = (n) => `${n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`;
const CLE_POSITION = "klocka.calculatrice.position";
const LARGEUR = 280;
const borner = ({ x, y }) => ({
  x: Math.max(8, Math.min(x, window.innerWidth - Math.min(LARGEUR, window.innerWidth - 16) - 8)),
  y: Math.max(8, Math.min(y, window.innerHeight - 64)),
});
const lirePosition = () => { try { const p = JSON.parse(localStorage.getItem(CLE_POSITION)); return p && Number.isFinite(p.x) && Number.isFinite(p.y) ? p : null; } catch { return null; } };

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

function Ligne({ libelle, valeur }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[13.5px] text-ardoise">{libelle}</span>
      <span className="whitespace-nowrap text-[13.5px] tabular-nums text-encre">{valeur}</span>
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
  // Fermée, elle revient au prochain chiffre entendu.
  const [fermee, setFermee] = useState(false);
  // Sa place, posée à la main ; sans elle, en haut à gauche.
  const [position, setPosition] = useState(lirePosition);
  const prise = useRef(null);
  const saisir = (e) => {
    if (e.button !== 0 || e.target.closest("button")) return;
    const boite = e.currentTarget.parentElement.getBoundingClientRect();
    prise.current = { dx: e.clientX - boite.left, dy: e.clientY - boite.top };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const glisser = (e) => { if (prise.current) setPosition(borner({ x: e.clientX - prise.current.dx, y: e.clientY - prise.current.dy })); };
  const lacher = () => {
    if (!prise.current) return;
    prise.current = null;
    setPosition((p) => { try { if (p) localStorage.setItem(CLE_POSITION, JSON.stringify(p)); } catch { /* la place se perd, sans gravité */ } return p; });
  };
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
    setFermee(false);
  }, [lu.prix, lu.loyer_an, lu.surface]);

  if (fermee || (lu.prix == null && lu.loyer_an == null)) return null;
  const valeur = (k) => (k in saisi ? saisi[k] : ecrire(lu[k]));
  const v = { prix: lireNombre(valeur("prix")), loyer_an: lireNombre(valeur("loyer_an")), surface: lireNombre(valeur("surface")) };
  const r = calculer(v, seuils);
  const poser = (k) => (x) => setSaisi((s) => ({ ...s, [k]: x }));
  const place = position ? borner(position) : null;

  return createPortal(
    <div role="dialog" aria-label="Calculatrice"
      style={place ? { left: place.x, top: place.y, right: "auto", bottom: "auto", width: Math.min(LARGEUR, window.innerWidth - 16), maxHeight: window.innerHeight - place.y - 8 } : undefined}
      className="fixed left-3 top-20 z-[60] flex max-h-[calc(100dvh-6rem)] w-[280px] flex-col gap-4 overflow-y-auto rounded-[18px] border border-trait bg-surface-pleine p-5 shadow-[0_18px_40px_rgb(0_0_0/0.18)] duration-300 animate-in fade-in-0 slide-in-from-left-2 max-md:inset-x-3 max-md:bottom-3 max-md:top-auto max-md:max-h-[60dvh] max-md:w-auto">
      {/* L'en-tête se tient pour déplacer la fenêtre. */}
      <div onPointerDown={saisir} onPointerMove={glisser} onPointerUp={lacher} onPointerCancel={lacher} title="Glisser pour déplacer"
        className="-mx-5 -mt-5 flex cursor-grab touch-none select-none items-center justify-between px-5 pb-1 pt-5 active:cursor-grabbing">
        <span className="text-[11px] tracking-[.16em] text-brume">CALCULATRICE</span>
        <button type="button" onClick={() => setFermee(true)} aria-label="Fermer la calculatrice" title="Fermer : elle revient au prochain chiffre entendu"
          className="grid h-7 w-7 place-items-center rounded-full text-ardoise hover:text-encre" style={{ background: "transparent" }}><X className="h-4 w-4" /></button>
      </div>
      <div className="flex flex-col gap-3">
        <Champ libelle="Prix FAI" valeur={valeur("prix")} onChange={poser("prix")} unite="€" />
        <Champ libelle="Loyer annuel HT" valeur={valeur("loyer_an")} onChange={poser("loyer_an")} unite="€/an"
          aide={lu.loyer_mensuel && !("loyer_an" in saisi) ? `Dit au mois : ${euros(lu.loyer_an / 12)}` : null} />
        <Champ libelle="Surface" valeur={valeur("surface")} onChange={poser("surface")} unite="m²" />
      </div>
      {(r.rendement_brut != null || r.prix_m2 != null || r.loyer_m2_an != null) && (
        <div className="flex flex-col gap-1.5">
          {r.rendement_brut != null && <Ligne libelle="Rendement brut" valeur={pct(r.rendement_brut)} />}
          {r.rendement_aem != null && <Ligne libelle="Acte en main" valeur={pct(r.rendement_aem)} />}
          {r.prix_m2 != null && <Ligne libelle="Prix au m²" valeur={euros(r.prix_m2)} />}
          {r.loyer_m2_an != null && <Ligne libelle="Loyer au m² par an" valeur={euros(r.loyer_m2_an)} />}
        </div>
      )}
    </div>,
    document.body,
  );
}
