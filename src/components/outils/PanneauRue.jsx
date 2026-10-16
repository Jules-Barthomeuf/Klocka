import React, { useMemo } from "react";
import { Loader2 } from "lucide-react";
import { adresseLisible } from "@/lib/vacance-signaux";

// Le taux de vacance d'une rue entière, puis de ses tronçons (16 oct. 2026,
// Jules : « pouvoir mesurer la vacance par tronçon, en gros par rue, pas
// forcément par zone »). Les règles sont celles du taux par zone
// (server/outils/vacance-taux.js) : vacants / (vacants + occupés), incertains
// à part, pas de pourcentage sous dix locaux tranchés. Le tronçon est un
// morceau de la rue, d'environ quinze locaux rangés par numéro : le taux de la
// rue entière ne cache plus un bout vide.

const pct = (n) => (n == null ? "—" : `${String(n).replace(".", ",")} %`);
const dateFr = (iso) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : "");
const jourCourt = (iso) => (iso ? new Date(`${iso}T12:00:00Z`).toLocaleDateString("fr-FR", { month: "short", year: "numeric" }) : "");
const metres = (m) => (m >= 1000 ? `${(m / 1000).toFixed(1).replace(".", ",")} km` : `${Math.round(m)} m`);
const enMots = (v) => String(v || "").toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());
/** Le nom de la rue tel qu'on l'a demandé, ou mis en mots s'il est en capitales (le registre l'écrit ainsi). */
export const nomDeRue = (v) => (v && v === v.toUpperCase() ? enMots(v) : v);

export default function PanneauRue({ rue, attente, erreur, tronconChoisi, onTroncon, onLocal, localChoisi }) {
  const t = rue?.taux;
  const troncons = rue?.troncons || [];
  const choisi = troncons.find((x) => x.rang === tronconChoisi) || null;
  // Le tronçon le plus vacant parmi ceux dont le pourcentage est fiable : le repère du panneau et de la carte.
  const plusVacant = useMemo(() => {
    const f = troncons.filter((x) => x.fiable);
    return f.length > 1 ? f.reduce((m, x) => (x.taux > m.taux ? x : m), f[0]) : null;
  }, [troncons]);
  // Les locaux à regarder : vacants puis incertains, du tronçon choisi ou de toute la rue.
  const aVoir = useMemo(() => {
    const cles = choisi ? new Set(choisi.cles) : null;
    return (rue?.locaux || []).filter((l) => l.etat !== "occupe" && (!cles || cles.has(l.cle)))
      .sort((a, b) => ({ vacant: 0, incertain: 1 }[a.etat] - { vacant: 0, incertain: 1 }[b.etat]) || (parseInt(a.cle, 10) - parseInt(b.cle, 10)));
  }, [rue, choisi]);

  if (erreur) return <p className="m-0 px-4 py-3 text-[13px] text-alerte">{erreur}</p>;
  if (attente || !rue) {
    return (
      <p className="m-0 flex items-start gap-2 px-4 py-3 text-[13px] text-ardoise">
        <Loader2 className="mt-0.5 h-3.5 w-3.5 flex-none animate-spin text-menthe" />
        Taux de la rue : recensement des locaux de la commune, puis vérification sur Google Maps et OpenStreetMap. La première fois, une à deux minutes.
      </p>
    );
  }
  return (
    <div className="px-4 py-3">
      <p className="m-0 text-[11px] uppercase tracking-[.16em] text-brume">Taux de vacance estimé · rue entière</p>
      <p className="m-0 mt-1 truncate text-[17px] text-encre" title={nomDeRue(rue.nom)}>{nomDeRue(rue.nom)}</p>
      <p className="m-0 mt-1 text-[40px] font-light leading-none tracking-[-0.03em] text-encre tabular-nums">{t.fiable ? pct(t.taux) : "—"}</p>
      <p className="m-0 mt-1.5 text-[12.5px] text-ardoise">
        {t.vacants} vacants sur {t.tranches} locaux à vitrine tranchés{t.incertains ? ` · ${t.incertains} incertain${t.incertains > 1 ? "s" : ""}, à part` : ""}
      </p>
      {!t.fiable && <p className="m-0 mt-1 text-[12.5px] text-ambre">Moins de dix locaux sur cette rue : un pourcentage n'aurait pas de sens.</p>}

      {troncons.length > 0 && (
        <div className="mt-4">
          <p className="m-0 pb-1 text-[10.5px] uppercase tracking-[.12em] text-brume">{troncons.length > 1 ? `${troncons.length} tronçons, par numéro` : "Un seul tronçon"}</p>
          <div className="border-y border-trait">
            {troncons.map((x) => {
              const actif = tronconChoisi === x.rang;
              const pv = plusVacant && plusVacant.rang === x.rang && x.taux > 0;
              return (
                <button key={x.rang} type="button" onClick={() => onTroncon(actif ? null : x.rang)} aria-pressed={actif}
                  className={`block w-full border-t border-trait px-1 py-2 text-left first:border-t-0 ${actif ? "bg-rail-actif" : "hover:bg-relief/40"}`} style={{ background: actif ? undefined : "transparent" }}>
                  <span className="grid grid-cols-[22px_minmax(0,1fr)_52px] items-center gap-2 text-[12.5px]">
                    <span className={`grid h-[20px] w-[20px] place-items-center rounded-full text-[11px] tabular-nums ${actif ? "bg-menthe text-sur-menthe" : pv ? "bg-ambre text-sur-menthe" : "bg-relief text-craie"}`}>{x.rang}</span>
                    <span className="min-w-0 truncate text-craie">n° {x.du} à {x.au}<span className="text-brume"> · {metres(x.longueur_m)}{pv ? " · le plus vacant" : ""}</span></span>
                    <span className={`text-right text-[14px] tabular-nums ${x.fiable ? "text-encre" : "text-brume"}`}>{x.fiable ? pct(x.taux) : "—"}</span>
                  </span>
                  <span className="mt-1.5 grid grid-cols-[22px_minmax(0,1fr)_52px] items-center gap-2">
                    <span />
                    <span className="h-[4px] rounded-full bg-encre/[0.12]"><span className={`block h-full rounded-full ${pv ? "bg-ambre" : "bg-menthe"}`} style={{ width: `${x.fiable ? Math.min(100, x.taux) : 0}%` }} /></span>
                    <span className="text-right text-[11.5px] tabular-nums text-ardoise">{x.vacants} / {x.tranches}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-4">
        <p className="m-0 pb-1 text-[10.5px] uppercase tracking-[.12em] text-brume">{choisi ? `À regarder, tronçon ${choisi.rang}` : "À regarder, toute la rue"} · {aVoir.length}</p>
        <div className="border-y border-trait">
          {aVoir.map((l) => (
            <button key={l.cle} type="button" onClick={() => onLocal(l)} className={`block w-full border-t border-trait px-1 py-1.5 text-left first:border-t-0 ${localChoisi?.cle === l.cle ? "bg-rail-actif" : "hover:bg-relief/40"}`} style={{ background: localChoisi?.cle === l.cle ? undefined : "transparent" }}>
              <span className="flex items-baseline justify-between gap-2 text-[12.5px]">
                <span className="min-w-0 truncate text-encre">{adresseLisible(l.adresse)}</span>
                <span className={`flex-none text-[11.5px] ${l.etat === "vacant" ? "text-ambre" : "text-brume"}`}>{l.etat === "vacant" ? "Vacant" : "Incertain"}</span>
              </span>
              <span className="block truncate text-[12px] text-ardoise">{l.dernier ? `${adresseLisible(l.dernier.nom)} · fermé en ${jourCourt(l.dernier.ferme_le)}` : l.raison}</span>
            </button>
          ))}
          {!aVoir.length && <p className="m-0 py-2 text-[12.5px] text-brume">Aucun local vacant ou incertain{choisi ? " sur ce tronçon" : ""}.</p>}
        </div>
      </div>

      <p className="m-0 mt-3 text-[11.5px] leading-[1.55] text-brume">
        Méthode {rue.parametres.version}, la même que pour une zone : un local par adresse où un commerce ou un service en boutique est ouvert, ou a fermé depuis {rue.parametres.annees_historique} ans (SIRENE, {dateFr(rue.recense_le)}) ; vacant si plus personne n'y est ouvert, vérifié sur OpenStreetMap et Google Maps.
        {` ${t.vacants_confirmes} des ${t.vacants} vacants confirmés par une seconde source.`} Les tronçons coupent la rue en parts d'environ {rue.parametres.locaux_par_troncon} locaux, par numéro. Estimation reproductible, à valider sur un échantillon.
      </p>
    </div>
  );
}
