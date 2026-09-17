import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useUser } from "@/components/providers/UserProvider";
import { EnTeteAlx, Carte, Stat, Etiquette } from "@/components/alx/alx-commun";
import { J } from "@/design/jetons";

// Le résultat de l'entraînement : ce que le modèle a appris des ventes
// réelles, et comment il l'explique.
//
// Trois blocs, du plus dur au plus parlant. La validation temporelle d'abord,
// parce qu'un modèle se juge sur un futur qu'il n'a pas vu — les AUC par pli
// et le lift en tête de liste sont les seuls chiffres qui engagent. Les poids
// globaux ensuite : la part de chaque variable dans les décisions (SHAP), et
// son sens. Chaque vente enfin, dépliable : pourquoi le modèle l'aurait
// crue probable un an avant, jauge par jauge.
//
// Tout vient de server/alx/data/ml/resultats.json, écrit par
// ml/train_explainer.py. Rien n'est calculé ici.

const virgule = (x, d = 2) => (x == null ? "—" : Number(x).toFixed(d).replace(".", ","));
const pctFr = (x, d = 0) => (x == null ? "—" : `${(x * 100).toFixed(d).replace(".", ",")} %`);
const quand = (iso) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : "—");

const SENS = {
  hausse: { mot: "pousse à la vente", teinte: J["menthe"] },
  baisse: { mot: "retient", teinte: J["alerte"] },
  mixte: { mot: "selon le contexte", teinte: J["ardoise"] },
};

/** Une jauge horizontale : la part d'une variable, teintée par son effet. */
function Jauge({ libelle, part, teinte, droite }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_120px_64px] items-center gap-3">
      <span className="truncate text-[12.5px] text-craie">{libelle}</span>
      <div className="h-2 rounded bg-white/[0.06]">
        <div className="h-2 rounded" style={{ width: `${Math.max(3, Math.min(100, part))}%`, background: teinte }} />
      </div>
      <span className="text-right text-[12.5px] tabular-nums text-ardoise">{droite}</span>
    </div>
  );
}

/** Une vente passée : la ligne, et le pourquoi qui se déplie. */
function Vente({ v, ouverte, onOuvrir }) {
  return (
    <div className="border-t border-trait first:border-t-0">
      <button onClick={onOuvrir} className="grid w-full grid-cols-[86px_minmax(0,1fr)_150px_64px] items-baseline gap-3 py-[10px] text-left">
        <span className="text-[12.5px] tabular-nums text-ardoise">{quand(v.date_vente)}</span>
        <span className="truncate text-[12.5px] text-craie">{v.enseignes || v.rue || v.parcelle} · {v.ville}</span>
        <span className="text-right text-[11px] uppercase tracking-[.1em] text-brume">lu le {quand(v.t_reference)}</span>
        <span className="text-right text-[12.5px] font-medium tabular-nums text-encre">{pctFr(v.proba, 1)}</span>
      </button>
      {ouverte && (
        <div className="flex flex-col gap-2 pb-4 pl-1 pr-1">
          <p className="m-0 flex flex-wrap items-baseline gap-x-4 text-[11px] uppercase tracking-[.14em] text-brume">
            <span>Pourquoi le modèle y aurait cru, un an avant</span>
            {v.prix_vente != null && <span className="text-craie">vendue {Math.round(v.prix_vente).toLocaleString("fr-FR")} €</span>}
            {v.confiance != null && <span>confiance {pctFr(v.confiance)}</span>}
            {v.part_decision_inconnues > 0.25 && <span className="text-ambre">{pctFr(v.part_decision_inconnues)} de la décision repose sur des trous</span>}
            {/* La donnée source, vérifiable : la carte DVF d'Etalab, centrée
                sur l'acte. Parcelle et date sont sur la ligne, le prix ici. */}
            {v.lat != null && v.lon != null && (
              <a href={`https://explore.data.gouv.fr/fr/immobilier?onglet=carte&filtre=tous&lat=${v.lat}&lng=${v.lon}&zoom=19.5`} target="_blank" rel="noreferrer" className="normal-case tracking-normal text-menthe hover:text-menthe-survol">
                Vérifier sur la carte DVF →
              </a>
            )}
          </p>
          {v.contributions.map((c) => (
            <Jauge
              key={c.feature}
              libelle={`${c.libelle}${c.valeur != null ? ` · ${String(c.valeur).replace(".", ",")}` : " · inconnue"}`}
              part={c.part_pct}
              // Une poussée née d'un trou n'est pas un signal : elle se voit
              // en gris, quel que soit son sens.
              teinte={c.inconnue ? J["bord-vif"] : c.shap > 0 ? J["menthe"] : J["alerte"]}
              droite={`${c.shap > 0 ? "+" : ""}${virgule(c.shap)}`}
            />
          ))}
          <p className="m-0 mt-1 text-[11px] leading-[1.5] text-brume">
            En vert, ce qui poussait vers la vente ; en corail, ce qui retenait ; en gris, une variable inconnue — le modèle devine, il ne sait pas. Les valeurs sont des poussées SHAP (log-odds), leur largeur est la part de chacune dans la décision.
          </p>
        </div>
      )}
    </div>
  );
}

export default function ALXEntrainement() {
  const user = useUser();
  const [ouverte, setOuverte] = useState(null);
  const [filtreVille, setFiltreVille] = useState(null);
  const { data, isLoading } = useQuery({
    queryKey: ["alx-ml"],
    queryFn: () => base44.request("GET", "/api/alx/ml?ventes=400"),
    staleTime: 60000,
  });

  if (!user || user.role !== "admin") return null;

  const m = data?.metrics;
  const plis = m?.validation_temporelle || [];
  const holdout = m?.holdout_final;
  const villes = [...new Set((data?.ventes || []).map((v) => v.ville))];
  const ventes = (data?.ventes || []).filter((v) => !filtreVille || v.ville === filtreVille).slice(0, 120);

  return (
    <div className="alx sur-halo min-h-screen px-8 pb-16 max-md:px-4">
      <div className="mx-auto max-w-[1200px] pt-[22px]">
        <EnTeteAlx titre="Ce que le modèle a appris" sous={m ? `Entraîné le ${quand(m.le)} sur ${m.dataset.lignes} observations gelées un an avant leur issue — ${m.dataset.villes?.map((v) => v.nom).join(", ")}.` : "XGBoost + SHAP sur l'historique DVF, à date gelée."} />

        {isLoading ? (
          <p className="text-ardoise">Lecture…</p>
        ) : !data?.pret ? (
          <Carte>
            <p className="m-0 text-[13.5px] leading-[1.7] text-craie">Aucun entraînement encore. Deux commandes, dans l'ordre :</p>
            <pre className="mt-3 overflow-x-auto rounded-md border border-trait bg-surface px-4 py-3 font-mono text-[12px] leading-[1.8] text-ardoise">{data?.comment}</pre>
          </Carte>
        ) : (
          <div className="flex flex-col gap-4">
            {/* --- Ce que ça vaut, sur un futur jamais vu ---------------- */}
            <Carte>
              <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
                <Etiquette>La validation, dans l'ordre du temps</Etiquette>
                <span className="text-[12.5px] text-brume">le passé apprend, l'avenir juge — jamais l'inverse</span>
              </div>
              <div className="flex flex-wrap items-baseline gap-x-8 gap-y-4">
                <Stat label="ROC-AUC (repli final)" valeur={virgule(holdout?.roc_auc)} teinte={J["menthe"]} detail={`${holdout?.n} observations jamais vues · 0,5 = hasard`} />
                <Stat label="PR-AUC" valeur={virgule(holdout?.pr_auc)} detail={`prévalence ${pctFr(holdout?.prevalence)} : c'est la base à battre`} />
                {holdout?.lift_en_tete?.top_10 && (
                  <Stat label="Top 10 % des scores" valeur={`×${virgule(holdout.lift_en_tete.top_10.lift, 2)}`} teinte={J["menthe"]} detail={`${pctFr(holdout.lift_en_tete.top_10.taux_vente)} de ventes réelles dans le haut de la liste`} />
                )}
              </div>
              <div className="mt-5">
                <div className="grid grid-cols-[70px_minmax(0,1fr)_86px_86px] items-center gap-3 pb-2">
                  <Etiquette className="!text-[10px]">Pli</Etiquette><span /><Etiquette className="!text-[10px] text-right">ROC-AUC</Etiquette><Etiquette className="!text-[10px] text-right">PR-AUC</Etiquette>
                </div>
                {plis.map((p) => (
                  <div key={p.pli} className="grid grid-cols-[70px_minmax(0,1fr)_86px_86px] items-center gap-3 border-t border-trait py-2 text-[12.5px]">
                    <span className="text-ardoise">{p.pli}</span>
                    <span className="truncate text-brume">{p.periode_test[0]} → {p.periode_test[1]}</span>
                    <span className="text-right tabular-nums text-craie">{virgule(p.roc_auc, 3)}</span>
                    <span className="text-right tabular-nums text-encre">{virgule(p.pr_auc, 3)}</span>
                  </div>
                ))}
              </div>
              {/* L'ablation : le même modèle, sans l'historique DVF du local.
                  Ce qui reste est ce qu'il sait dire du PROFIL — et c'est ce
                  que la prospection lui demandera sur un bien jamais vendu. */}
              {m?.ablation_sans_dvf?.holdout && (
                <div className="mt-5 border-t border-trait pt-4">
                  <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
                    <Etiquette>Le test d'ablation : sans l'historique DVF du local</Etiquette>
                    <span className="text-[12.5px] text-brume">retirées : dernière mutation, prix, déjà muté, en bloc</span>
                  </div>
                  <div className="flex flex-wrap items-baseline gap-x-8 gap-y-4">
                    <Stat label="ROC-AUC" valeur={virgule(m.ablation_sans_dvf.holdout.roc_auc)} detail={`contre ${virgule(holdout?.roc_auc)} avec tout`} />
                    <Stat label="PR-AUC" valeur={virgule(m.ablation_sans_dvf.holdout.pr_auc)} detail={`contre ${virgule(holdout?.pr_auc)} avec tout`} />
                    {m.ablation_sans_dvf.holdout.lift_en_tete?.top_10 && (
                      <Stat label="Top 10 %" valeur={`×${virgule(m.ablation_sans_dvf.holdout.lift_en_tete.top_10.lift, 2)}`} detail="ce que le profil seul sait faire" />
                    )}
                    {m.confiance && <Stat label="Confiance moyenne" valeur={pctFr(m.confiance.moyenne)} detail="part renseignée des variables, pondérée" />}
                  </div>
                </div>
              )}
              <p className="m-0 mt-4 border-t border-trait pt-3.5 text-[12.5px] leading-[1.65] text-brume">{m?.avertissement}</p>
            </Carte>

            {/* --- La matrice des signaux : qui pèse, dans quel sens ------ */}
            <Carte>
              <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
                <Etiquette>Ce qui déclenche une vente, d'après l'historique</Etiquette>
                <span className="text-[12.5px] text-brume">part de chaque variable dans les décisions du modèle (SHAP)</span>
              </div>
              <div className="flex flex-col gap-2.5">
                {(data.poids || []).map((p) => (
                  <div key={p.feature} className="grid grid-cols-[minmax(0,1fr)_130px_60px_150px] items-center gap-3 max-md:grid-cols-[minmax(0,1fr)_90px_50px]">
                    <span className="truncate text-[12.5px] text-craie" title={`renseignée sur ${pctFr(p.taux_renseigne)} des lignes`}>{p.libelle}</span>
                    <div className="h-2 rounded bg-white/[0.06]">
                      <div className="h-2 rounded" style={{ width: `${Math.max(3, p.poids_pct * (100 / Math.max(1, data.poids[0]?.poids_pct || 100)))}%`, background: SENS[p.sens]?.teinte || J["ardoise"] }} />
                    </div>
                    <span className="text-right text-[12.5px] tabular-nums text-encre">{virgule(p.poids_pct, 1)} %</span>
                    <span className="text-[11px] uppercase tracking-[.1em] max-md:hidden" style={{ color: SENS[p.sens]?.teinte }}>{SENS[p.sens]?.mot}</span>
                  </div>
                ))}
              </div>
              <p className="m-0 mt-4 border-t border-trait pt-3.5 text-[12.5px] leading-[1.65] text-brume">
                Ces poids sont mesurés sur des milliers de ventes, à date gelée — c'est ce que signaux.json approximait à la main sur quarante-trois vendeurs. Ils ne se recopient pas tels quels : l'univers est DVF, et une variable absente y est un trou, pas un zéro.
              </p>
            </Carte>

            {/* --- Chaque vente, expliquée -------------------------------- */}
            <Carte>
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
                <Etiquette>Les ventes passées, une par une</Etiquette>
                <div className="flex items-center gap-2">
                  {[null, ...villes].map((v) => (
                    <button key={v || "toutes"} onClick={() => setFiltreVille(v)} className={`rounded-full border px-3 py-1 text-[12px] transition-colors ${filtreVille === v ? "border-menthe text-menthe" : "border-bord text-ardoise hover:text-encre"}`}>
                      {v || "Toutes"}
                    </button>
                  ))}
                </div>
              </div>
              <p className="m-0 mb-2 text-[12.5px] text-brume">{data.ventes_total} ventes expliquées · les {ventes.length} plus récentes affichées · la colonne de droite est la probabilité que le modèle aurait donnée un an avant l'acte.</p>
              <div>
                {ventes.map((v, i) => (
                  <Vente key={`${v.parcelle}-${v.date_vente}-${i}`} v={v} ouverte={ouverte === i} onOuvrir={() => setOuverte(ouverte === i ? null : i)} />
                ))}
              </div>
            </Carte>
          </div>
        )}
      </div>
    </div>
  );
}
