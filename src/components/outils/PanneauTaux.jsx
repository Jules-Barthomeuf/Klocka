import React from "react";
import { Loader2 } from "lucide-react";

// Le taux de vacance, dans le panneau de droite des signaux (14 oct. 2026,
// Jules : « un seul onglet ; on déplie le panneau de droite et on voit le taux
// de vacance »). Les règles sont côté serveur (server/outils/vacance-taux.js) :
// vacants / (vacants + occupés), incertains à part, pas de pourcentage sous
// dix locaux tranchés.

const pct = (n) => (n == null ? "—" : `${String(n).replace(".", ",")} %`);
const dateFr = (iso) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : "");
const enMots = (v) => v.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());

export default function PanneauTaux({ taux, attente, erreur, onRue = null }) {
  if (erreur) return <p className="m-0 px-4 py-3 text-[13px] text-alerte">{erreur}</p>;
  if (attente || !taux) {
    return (
      <p className="m-0 flex items-start gap-2 px-4 py-3 text-[13px] text-ardoise">
        <Loader2 className="mt-0.5 h-3.5 w-3.5 flex-none animate-spin text-menthe" />
        Taux de vacance : recensement des locaux de la commune, puis vérification sur Google Maps et OpenStreetMap. La première fois, une à deux minutes.
      </p>
    );
  }
  // Les tranchés et le seuil se recalculent ici s'ils manquent : un serveur pas encore relancé
  // après une mise à jour ne les envoie pas, et l'écran disait alors « moins de dix locaux » à tort.
  const brut = taux.taux || {};
  const tranches = brut.tranches ?? ((brut.occupes ?? 0) + (brut.vacants ?? 0));
  const t = { ...brut, tranches, fiable: brut.fiable ?? tranches >= 10 };
  return (
    <div className="px-4 py-3">
      <p className="m-0 text-[11px] uppercase tracking-[.16em] text-brume">Taux de vacance estimé</p>
      <p className="m-0 mt-1 text-[40px] font-light leading-none tracking-[-0.03em] text-encre tabular-nums">{t.fiable ? pct(t.taux) : "—"}</p>
      <p className="m-0 mt-1.5 text-[12.5px] text-ardoise">
        {t.vacants} vacants sur {t.tranches} locaux à vitrine tranchés{t.incertains ? ` · ${t.incertains} incertain${t.incertains > 1 ? "s" : ""}, à part` : ""}
      </p>
      {!t.fiable && <p className="m-0 mt-1 text-[12.5px] text-ambre">Moins de dix locaux : élargissez le rayon pour un pourcentage qui ait du sens.</p>}

      {taux.rues.length > 0 && (
        <div className="mt-4">
          <div className="grid grid-cols-[minmax(0,1fr)_52px_64px] gap-2 pb-1 text-[10.5px] uppercase tracking-[.12em] text-brume">
            <span>Rue{onRue ? " · un clic la mesure en entier" : ""}</span><span className="text-right">Taux</span><span className="text-right">Vac. / tot.</span>
          </div>
          <div className="border-y border-trait">
            {taux.rues.map((x) => (
              // Un clic mesure la rue entière, tronçon par tronçon (16 oct. 2026) : le rayon ne la coupe plus.
              <div key={x.voie} role={onRue ? "button" : undefined} tabIndex={onRue ? 0 : undefined} onClick={onRue ? () => onRue(x.voie) : undefined} onKeyDown={onRue ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onRue(x.voie); } } : undefined}
                className={`grid grid-cols-[minmax(0,1fr)_52px_64px] items-center gap-2 border-t border-trait py-1.5 text-[12.5px] first:border-t-0 ${onRue ? "cursor-pointer hover:bg-relief/40" : ""}`} title={onRue ? `Mesurer toute la rue, par tronçon${x.incertains ? ` · ${x.incertains} incertain${x.incertains > 1 ? "s" : ""}, à part` : ""}` : x.incertains ? `${x.incertains} incertain${x.incertains > 1 ? "s" : ""}, à part` : undefined}>
                <span className="min-w-0 truncate text-craie">{enMots(x.voie)}</span>
                <span className={`text-right tabular-nums ${x.fiable ? "text-encre" : "text-brume"}`}>{x.fiable ? pct(x.taux) : "—"}</span>
                <span className="text-right tabular-nums text-ardoise">{x.vacants} / {x.tranches}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <p className="m-0 mt-3 text-[11.5px] leading-[1.55] text-brume">
        Méthode {taux.parametres.version} : un local par adresse où un commerce ou un service en boutique est ouvert, ou a fermé depuis {taux.parametres.annees_historique} ans (SIRENE, {dateFr(taux.recense_le)}) ; vacant si plus personne n'y est ouvert, vérifié sur Google Maps et OpenStreetMap.
        {` ${t.vacants_confirmes} des ${t.vacants} vacants confirmés par une seconde source.`} Estimation reproductible, à valider sur un échantillon.
      </p>
    </div>
  );
}
