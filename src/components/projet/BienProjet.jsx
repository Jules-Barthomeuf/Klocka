import React, { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { nf } from "./SecteurChiffres";
import { useEdition } from "./EditionEnPlace";
import { InfoDot } from "./SecteurChiffres";

// Le bien : à gauche les photos, qui défilent toutes seules ; à droite le
// local en quatre lignes (activité, détenu depuis, surface, dernière vente).
//
// L'activité tient en un mot ou deux ; le détail, s'il y en a un, reste
// derrière l'info au survol. En édition, les quatre lignes sont là même
// vides : on voit ce qu'il reste à trouver.

const DELAI_MS = 4500;

function Photos({ photos }) {
  const [i, setI] = useState(0);
  const [pause, setPause] = useState(false);
  const n = photos.length;
  useEffect(() => {
    if (n < 2 || pause) return undefined;
    const t = setInterval(() => setI((v) => (v + 1) % n), DELAI_MS);
    return () => clearInterval(t);
  }, [n, pause]);
  if (!n) return null;
  const courante = photos[Math.min(i, n - 1)];
  return (
    <div onMouseEnter={() => setPause(true)} onMouseLeave={() => setPause(false)}>
      <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-surface">
        <img key={courante} src={courante} alt={`Photo ${i + 1} sur ${n}`} className="w-full h-full object-cover" />
        {n > 1 && (
          <>
            <button type="button" aria-label="Photo précédente" onClick={() => setI((v) => (v - 1 + n) % n)}
              className="absolute left-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-fond/70 backdrop-blur-sm border border-bord-doux text-encre flex items-center justify-center hover:bg-fond transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button type="button" aria-label="Photo suivante" onClick={() => setI((v) => (v + 1) % n)}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-fond/70 backdrop-blur-sm border border-bord-doux text-encre flex items-center justify-center hover:bg-fond transition-colors">
              <ChevronRight className="w-4 h-4" />
            </button>
          </>
        )}
      </div>
      {n > 1 && (
        <div className="grid grid-cols-4 gap-3 mt-3">
          {photos.slice(0, 8).map((p, k) => (
            <button key={p + k} type="button" onClick={() => setI(k)} aria-label={`Photo ${k + 1}`}
              className={`aspect-[4/3] overflow-hidden rounded-lg border transition-colors ${k === i ? "border-menthe" : "border-transparent hover:border-bord-vif"}`}>
              <img src={p} alt="" className="w-full h-full object-cover" loading="lazy" />
            </button>
          ))}
        </div>
      )}
      <div className="text-[12px] text-ardoise mt-2 font-mono" style={{ fontVariantNumeric: "tabular-nums" }}>{i + 1} / {n}</div>
    </div>
  );
}

function Ligne({ label, valeur, sous, info }) {
  return (
    <div className="flex justify-between items-baseline gap-4 py-4 border-b border-encre/[0.12]">
      <span className="text-[14px] text-ardoise flex items-center gap-1.5">{label}<InfoDot texte={info} /></span>
      <span className="text-right">
        <span className={`block text-[22px] max-md:text-[18px] font-light ${valeur ? "text-encre" : "text-brume"}`} style={{ fontVariantNumeric: "tabular-nums" }}>{valeur || "—"}</span>
        {sous && <span className="block text-[15px] max-md:text-[13.5px] text-craie mt-1" style={{ fontVariantNumeric: "tabular-nums" }}>{sous}</span>}
      </span>
    </div>
  );
}

export default function BienProjet({ project }) {
  const edition = useEdition();
  const enEdition = !!edition?.onChamp;
  const surface = Number(project.sim_surface) || Number(project.surface_m2) || 0;
  const detenu = project.detenu_depuis || project.derniere_vente_annee || null;
  const prixVente = Number(project.derniere_vente_prix) > 0 ? `${nf.format(Number(project.derniere_vente_prix))} €` : null;

  const lignes = [
    { valeur: project.activite_locataire && !/non renseign/i.test(project.activite_locataire) ? project.activite_locataire : null, label: "Activité", info: project.activite_detail || null },
    { valeur: detenu ? String(detenu) : null, label: "Détenu depuis", info: "Depuis quand le propriétaire actuel tient les murs, d'après la dernière mutation publiée (DVF) ou l'acte." },
    { valeur: surface > 0 ? `${nf.format(surface)} m²` : null, label: "Surface", info: project.surface_detail || null },
    // L'année en grand, le prix dessous : deux chiffres sur une ligne se
    // lisaient comme un seul.
    { valeur: project.derniere_vente_annee ? String(project.derniere_vente_annee) : null, sous: prixVente, label: "Dernière vente", info: "L'année et le prix de la dernière mutation des murs, d'après les ventes publiées (DVF) ou l'acte." },
  ].filter((l) => enEdition || l.valeur);

  const photos = (project.photos || []).filter(Boolean);
  if (!lignes.length && !photos.length) return null;

  return (
    <div className={`grid gap-10 max-md:gap-6 ${photos.length ? "md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]" : ""}`}>
      {photos.length > 0 && <Photos photos={photos} />}
      {lignes.length > 0 && (
        <div>
          <div className="text-[12px] tracking-[0.2em] uppercase text-ardoise pb-3 border-b border-encre/[0.35]">Le local</div>
          {lignes.map((l) => <Ligne key={l.label} {...l} />)}
        </div>
      )}
    </div>
  );
}
