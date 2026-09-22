import React, { useEffect, useMemo, useState } from "react";
import { ComposedChart, Area, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from "recharts";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { nf, useSecteurProjet } from "./SecteurChiffres";
import { trouverVille, REFERENCES_FR } from "@/data/villes";
import { J } from "@/design/jetons";

// L'onglet Marché, en deux temps : la ville (habitants, revenus), puis le
// secteur (le résidentiel en courbe, le commercial en deux cartes qu'on fait
// défiler : le prix des murs, puis le loyer).
//
// Chaque chiffre a une valeur de référence, lue chez Le Figaro pour le
// résidentiel et déduite des ventes pour la rue. Le dossier peut la
// corriger : ce qu'il porte l'emporte toujours, sinon on corrigerait dans le
// vide.

/** La tranche de surface sur laquelle se lisent les loyers commerciaux. */
export function trancheSurface(surface) {
  const s = Number(surface) || 0;
  if (!s) return null;
  return { bas: Math.round(s * 0.7), haut: Math.round(s * 1.3), surface: Math.round(s) };
}

const pourcent = (v, decimales = 1) => (v == null ? null : `${v > 0 ? "+" : ""}${String(Number(v).toFixed(decimales)).replace(".", ",")} %`);

/**
 * Pure : la courbe du résidentiel, reconstituée à partir du prix d'aujourd'hui
 * et de ses évolutions sur un an et cinq ans. Le Figaro ne publie pas la
 * série année par année : entre deux points connus, la courbe suit un taux
 * constant. Chaque point porte le prix et l'écart, en %, au premier point.
 */
export function serieResidentielle({ prix, evo1 = null, evo5 = null, annee = new Date().getFullYear() }) {
  if (!(prix > 0)) return [];
  // Les points connus, par année : aujourd'hui, il y a un an, il y a cinq ans.
  const connus = new Map([[annee, prix]]);
  if (evo1 != null) connus.set(annee - 1, prix / (1 + evo1 / 100));
  if (evo5 != null) connus.set(annee - 5, prix / (1 + evo5 / 100));
  if (connus.size < 2) return [];
  const premiere = Math.min(...connus.keys());
  const points = [];
  for (let a = premiere; a <= annee; a += 1) {
    if (connus.has(a)) { points.push({ annee: a, prix: connus.get(a) }); continue; }
    // Entre deux points connus, un taux constant.
    const avant = Math.max(...[...connus.keys()].filter((k) => k < a));
    const apres = Math.min(...[...connus.keys()].filter((k) => k > a));
    const taux = Math.pow(connus.get(apres) / connus.get(avant), 1 / (apres - avant));
    points.push({ annee: a, prix: connus.get(avant) * Math.pow(taux, a - avant) });
  }
  const base = points[0].prix;
  return points.map((p) => ({ annee: p.annee, prix: Math.round(p.prix), evolution: Math.round(((p.prix / base) - 1) * 1000) / 10 }));
}

const Etiquette = ({ children }) => <div className="text-[10.5px] tracking-[0.2em] uppercase text-ardoise">{children}</div>;

function Ville({ habitants, revenu, agglomeration = false }) {
  if (!(habitants > 0) && !(revenu > 0)) return null;
  const reference = REFERENCES_FR.revenuMedian;
  const ecart = revenu > 0 ? ((revenu / reference) - 1) * 100 : null;
  const plafond = Math.max(revenu, reference) * 1.2;
  return (
    <div className="grid md:grid-cols-2 border-y border-encre/[0.12]">
      {habitants > 0 && (
        <div className="py-5 md:pr-8">
          <div className="text-[26px] font-light text-encre leading-none" style={{ fontVariantNumeric: "tabular-nums" }}>{nf.format(habitants)}</div>
          <div className="text-[11px] text-ardoise mt-2">Habitants{agglomeration ? " · agglomération" : ""}</div>
        </div>
      )}
      {revenu > 0 && (
        <div className={`py-5 ${habitants > 0 ? "md:pl-8 md:border-l md:border-encre/[0.12] max-md:border-t max-md:border-encre/[0.12]" : ""}`}>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="text-[26px] font-light text-encre leading-none" style={{ fontVariantNumeric: "tabular-nums" }}>≈{nf.format(Math.round(revenu / 100) * 100)} €</div>
            {ecart != null && (
              <span className={`text-[10.5px] px-2.5 py-1 rounded-full ${ecart < 0 ? "bg-red-400/[0.12] text-red-300" : "bg-menthe/[0.14] text-menthe-clair"}`} style={{ fontVariantNumeric: "tabular-nums" }}>
                {pourcent(ecart)} vs. France
              </span>
            )}
          </div>
          <div className="text-[11px] text-ardoise mt-2">Revenus · moyenne française {nf.format(reference)} €</div>
          <div className="relative h-[3px] mt-3 bg-encre/[0.12] rounded-full">
            <div className="absolute inset-y-0 left-0 rounded-full bg-menthe" style={{ width: `${Math.min(100, (revenu / plafond) * 100)}%` }} />
            <div className="absolute top-1/2 -translate-y-1/2 w-[2px] h-[11px] bg-encre/70" style={{ left: `${(reference / plafond) * 100}%` }} title={`Moyenne française : ${nf.format(reference)} €`} />
          </div>
        </div>
      )}
    </div>
  );
}

function Residentiel({ prix, evo1, evo5, nom }) {
  const serie = useMemo(() => serieResidentielle({ prix, evo1, evo5 }), [prix, evo1, evo5]);
  const [i, setI] = useState(serie.length - 1);
  useEffect(() => { setI(serie.length - 1); }, [serie.length]);
  if (!(prix > 0)) return null;
  const choisi = serie[i] || serie[serie.length - 1];
  const annee = choisi?.annee ?? new Date().getFullYear();
  const montre = choisi?.prix ?? prix;
  const bas = serie.length ? Math.min(...serie.map((p) => p.prix)) : prix;
  const haut = serie.length ? Math.max(...serie.map((p) => p.prix)) : prix;
  const marge = Math.max(50, Math.round((haut - bas) * 0.15));
  const amplitude = serie.length ? Math.max(...serie.map((p) => Math.abs(p.evolution))) : 0;

  return (
    <div>
      <Etiquette>Résidentiel{nom ? ` · ${nom}` : ""} — {annee}</Etiquette>
      <div className="flex items-end justify-between gap-6 flex-wrap mt-3">
        <div className="text-[34px] max-md:text-[28px] font-light text-encre leading-none" style={{ fontVariantNumeric: "tabular-nums" }}>
          {nf.format(montre)} <span className="text-[16px] text-ardoise">€/m²</span>
        </div>
        <div className="flex gap-6">
          {evo1 != null && (
            <div className="text-right">
              <div className={`text-[16px] ${evo1 < 0 ? "text-red-400" : "text-menthe-clair"}`} style={{ fontVariantNumeric: "tabular-nums" }}>{pourcent(evo1)}</div>
              <div className="text-[9.5px] tracking-[0.18em] uppercase text-ardoise mt-0.5">sur 1 an</div>
            </div>
          )}
          {evo5 != null && (
            <div className="text-right">
              <div className={`text-[16px] ${evo5 < 0 ? "text-red-400" : "text-menthe-clair"}`} style={{ fontVariantNumeric: "tabular-nums" }}>{pourcent(evo5)}</div>
              <div className="text-[9.5px] tracking-[0.18em] uppercase text-ardoise mt-0.5">sur 5 ans</div>
            </div>
          )}
        </div>
      </div>

      {serie.length > 1 && (
        <>
          <div className="h-[230px] max-md:h-[190px] w-full mt-6">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={serie} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="marche-res-fond" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={J.menthe} stopOpacity={0.22} />
                    <stop offset="100%" stopColor={J.menthe} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={J.trait} vertical={false} />
                <XAxis dataKey="annee" tick={{ fill: J.ardoise, fontSize: 10 }} axisLine={false} tickLine={false} dy={6} />
                <YAxis yAxisId="prix" domain={[bas - marge, haut + marge]} tick={{ fill: J.ardoise, fontSize: 10 }} axisLine={false} tickLine={false} width={56} tickFormatter={(v) => `${nf.format(Math.round(v / 10) * 10)} €`} />
                <YAxis yAxisId="evolution" orientation="right" tick={{ fill: J.ardoise, fontSize: 10 }} axisLine={false} tickLine={false} width={48} tickFormatter={(v) => pourcent(v, amplitude < 5 ? 1 : 0)} />
                <Tooltip
                  cursor={{ stroke: J.trait }}
                  contentStyle={{ background: J["surface-pleine"], border: `1px solid ${J.bord}`, borderRadius: 10, fontSize: 12 }}
                  labelStyle={{ color: J.encre }}
                  formatter={(v, cle) => (cle === "prix" ? [`${nf.format(v)} €/m²`, "Prix moyen"] : [pourcent(v), `Depuis ${serie[0].annee}`])}
                />
                <ReferenceLine yAxisId="prix" x={annee} stroke={J.ardoise} strokeDasharray="3 4" />
                <Area yAxisId="prix" type="monotone" dataKey="prix" stroke={J.menthe} strokeWidth={1.6} fill="url(#marche-res-fond)" dot={false}
                  activeDot={{ r: 4, fill: J["surface-pleine"], stroke: J.menthe, strokeWidth: 1.5 }} />
                <Line yAxisId="evolution" type="monotone" dataKey="evolution" stroke={J.ardoise} strokeWidth={1} strokeDasharray="2 4" dot={false} activeDot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <input
            id="marche-residentiel-annee"
            type="range"
            min={0}
            max={serie.length - 1}
            step={1}
            value={Math.min(i, serie.length - 1)}
            onChange={(e) => setI(Number(e.target.value))}
            aria-label="Année affichée"
            className="w-full mt-2"
          />
          <p className="text-[11px] text-brume mt-2 mb-0">Courbe reconstituée à partir du prix d'aujourd'hui et de ses évolutions sur 1 et 5 ans (Le Figaro Immobilier) ; à droite, l'écart au premier point.</p>
        </>
      )}
    </div>
  );
}

function CarteCommerciale({ titre, unite, autour, projet }) {
  const plafond = Math.max(autour, projet) * 1.1 || 1;
  const ligne = (label, valeur, accent) => (
    <div className="mt-4 first:mt-0">
      <div className="flex justify-between items-baseline gap-4">
        <span className="text-[12px] text-craie">{label}</span>
        <span className={`text-[15px] ${accent ? "text-encre" : "text-craie"}`} style={{ fontVariantNumeric: "tabular-nums" }}>{valeur > 0 ? `${nf.format(Math.round(valeur))} ${unite}` : "—"}</span>
      </div>
      <div className="h-[3px] mt-2 bg-encre/[0.12] rounded-full">
        <div className={`h-full rounded-full ${accent ? "bg-menthe" : "bg-ardoise/60"}`} style={{ width: `${valeur > 0 ? Math.min(100, (valeur / plafond) * 100) : 0}%` }} />
      </div>
    </div>
  );
  return (
    <div className="border border-encre/[0.12] rounded-xl px-5 py-5 bg-surface">
      <Etiquette>{titre}</Etiquette>
      <div className="mt-4">
        {ligne("Autour", autour, false)}
        {ligne("Le projet", projet, true)}
      </div>
    </div>
  );
}

function Commercial({ prixAutour, prixProjet, loyerAutour, loyerProjet, nom }) {
  const cartes = [
    (prixAutour > 0 || prixProjet > 0) && { cle: "prix", titre: "Prix au m² — commerces", unite: "€/m²", autour: prixAutour, projet: prixProjet },
    (loyerAutour > 0 || loyerProjet > 0) && { cle: "loyer", titre: "Loyer au m² / an — commerces", unite: "€/m²/an", autour: loyerAutour, projet: loyerProjet },
  ].filter(Boolean);
  const [i, setI] = useState(0);
  if (!cartes.length) return null;
  const carte = cartes[Math.min(i, cartes.length - 1)];
  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <Etiquette>Commercial{nom ? ` · ${nom}` : ""}</Etiquette>
        {cartes.length > 1 && (
          <div className="flex items-center gap-2">
            <button type="button" aria-label="Carte précédente" onClick={() => setI((v) => (v - 1 + cartes.length) % cartes.length)}
              className="w-7 h-7 rounded-full border border-bord-doux text-craie hover:text-encre hover:border-bord-vif flex items-center justify-center transition-colors">
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span className="flex gap-1.5" aria-hidden="true">
              {cartes.map((c, k) => <span key={c.cle} className={`w-1.5 h-1.5 rounded-full ${k === i ? "bg-menthe" : "bg-encre/25"}`} />)}
            </span>
            <button type="button" aria-label="Carte suivante" onClick={() => setI((v) => (v + 1) % cartes.length)}
              className="w-7 h-7 rounded-full border border-bord-doux text-craie hover:text-encre hover:border-bord-vif flex items-center justify-center transition-colors">
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
      <div className="mt-3">
        <CarteCommerciale key={carte.cle} {...carte} />
      </div>
    </div>
  );
}

export default function MarcheProjet({ project, isPublic = false, prixM2Revient = 0, loyerM2 = 0 }) {
  const { data: donnees } = useSecteurProjet(project, !isPublic);
  const r = donnees?.residentiel;
  const rue = donnees?.rue;
  const ville = useMemo(() => trouverVille(project.adresse_complete || ""), [project.adresse_complete]);

  // Ce que le dossier porte l'emporte sur la source, à condition qu'il porte
  // quelque chose : le formulaire écrit 0 dans les cases vides, et un zéro
  // affiché à la place d'une évolution connue serait un mensonge.
  const duDossier = (valeur, source) => (Number(valeur) ? Number(valeur) : source ?? null);
  const habitants = Number(project.ville_habitants_agglo) || donnees?.agglomeration?.population || ville?.pop || 0;
  const agglomeration = !Number(project.ville_habitants_agglo) && !!donnees?.agglomeration?.population;
  const nomVille = project.ville_secteur_champ1 || ville?.nom || null;
  const revenu = Number(project.ville_revenu_median) || ville?.revenu || 0;

  const prixResidentiel = Number(project.marche_rue_prix_m2) || r?.prix_m2 || Number(project.marche_prix_m2_median) || 0;
  const evo1 = duDossier(project.marche_evolution_1an, r?.evolution_1_an?.valeur);
  const evo5 = duDossier(project.marche_evolution_5ans, r?.evolution_5_ans?.valeur);

  const prixAutour = rue?.prix_m2 || Number(project.marche_prix_m2_median) || 0;
  const loyerAutour = Number(project.marche_offre_moyenne) || rue?.loyer_m2_an || Number(project.marche_baux_moyenne) || 0;

  const rienDuTout = !habitants && !revenu && !prixResidentiel && !prixAutour && !loyerAutour && !prixM2Revient && !loyerM2;
  if (rienDuTout) return null;

  return (
    <div className="space-y-10 max-md:space-y-7">
      {(habitants > 0 || revenu > 0) && (
        <section>
          <Etiquette>{nomVille ? `Ville · ${nomVille}` : agglomeration && donnees?.agglomeration?.nom ? `Agglomération · ${donnees.agglomeration.nom}` : "Ville"}</Etiquette>
          <div className="mt-3"><Ville habitants={habitants} revenu={revenu} agglomeration={agglomeration} /></div>
        </section>
      )}
      {(prixResidentiel > 0 || prixAutour > 0 || loyerAutour > 0 || prixM2Revient > 0 || loyerM2 > 0) && (
        <section className="space-y-8 max-md:space-y-6">
          <Etiquette>Secteur</Etiquette>
          <Residentiel prix={prixResidentiel} evo1={evo1} evo5={evo5} nom={r?.nom} />
          <Commercial prixAutour={prixAutour} prixProjet={prixM2Revient} loyerAutour={loyerAutour} loyerProjet={loyerM2} nom={rue?.nom} />
        </section>
      )}
    </div>
  );
}
