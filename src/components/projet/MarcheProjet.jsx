import React, { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { nf, useSecteurProjet } from "./SecteurChiffres";
import { trouverVille, REFERENCES_FR } from "@/data/villes";
import { EnTeteOnglet, Carte, TitreCarte, Chiffre, Pastille, RangeeCarte } from "./Cartes";

// L'onglet Marché (maquette du 28 septembre) : une carte à trois chiffres
// (habitants, revenus, prix résidentiel), puis deux cartes : la courbe du
// résidentiel, et le commercial en barres (le prix des murs, puis le loyer,
// qu'on fait défiler).
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

function Revenus({ revenu, nomVille }) {
  const reference = REFERENCES_FR.revenuMedian;
  const ecart = ((revenu / reference) - 1) * 100;
  const plafond = Math.max(revenu, reference);
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] text-ardoise">Revenus</span>
        <Pastille ton={ecart < 0 ? "alerte" : "menthe"}>{pourcent(ecart)} vs. France</Pastille>
      </div>
      <span className="text-[32px] max-md:text-[26px] font-medium tracking-[-0.02em] text-encre" style={{ fontVariantNumeric: "tabular-nums" }}>≈{nf.format(Math.round(revenu / 100) * 100)} €</span>
      <div className="mt-1 grid grid-cols-[64px_minmax(0,1fr)_auto] items-center gap-x-2.5 gap-y-1.5 text-[12px]" style={{ fontVariantNumeric: "tabular-nums" }}>
        <span className="truncate text-craie">{nomVille || "Ville"}</span>
        <div className="h-1 rounded-sm bg-relief"><div className="h-1 rounded-sm bg-menthe" style={{ width: `${(revenu / plafond) * 100}%` }} /></div>
        <span className="text-craie">{nf.format(Math.round(revenu / 100) * 100)} €</span>
        <span className="text-ardoise">France</span>
        <div className="h-1 rounded-sm bg-relief"><div className="h-1 rounded-sm bg-ardoise" style={{ width: `${(reference / plafond) * 100}%` }} /></div>
        <span className="text-ardoise">{nf.format(reference)} €</span>
      </div>
    </div>
  );
}

function PrixResidentiel({ prix, evo1, evo5 }) {
  return (
    <Chiffre label="Prix résidentiel · secteur" valeur={nf.format(prix)} unite="€/m²">
      {(evo1 != null || evo5 != null) && (
        <div className="mt-1 flex flex-wrap gap-2">
          {evo1 != null && <Pastille ton={evo1 < 0 ? "alerte" : "menthe"}>{pourcent(evo1)} sur 1 an</Pastille>}
          {evo5 != null && <Pastille ton={evo5 < 0 ? "alerte" : "menthe"}>{pourcent(evo5)} sur 5 ans</Pastille>}
        </div>
      )}
    </Chiffre>
  );
}

// La courbe du résidentiel, dessinée à la main comme la maquette : une aire,
// trois lignes de grille, le dernier point marqué avec son prix.
function Evolution({ serie, nom }) {
  if (serie.length < 2) return null;
  const valeurs = serie.map((p) => p.prix);
  const brut = { bas: Math.min(...valeurs), haut: Math.max(...valeurs) };
  const marge = Math.max(50, Math.round((brut.haut - brut.bas) * 0.12));
  const haut = brut.haut + marge;
  const bas = brut.bas - marge;
  const pas = 640 / (serie.length - 1);
  const pts = serie.map((p, k) => [k * pas, ((haut - p.prix) / (haut - bas)) * 200]);
  const ligne = pts.map(([x, y], k) => `${k ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const fin = pts[pts.length - 1][1] / 2;
  const dernier = serie[serie.length - 1];
  return (
    <Carte className="flex-[2_1_520px] min-w-0 p-7 max-md:p-5 flex flex-col gap-6">
      <TitreCarte titre="Évolution du prix résidentiel" sous={`${nom ? `${nom} · ` : ""}${serie[0].annee} – ${dernier.annee}`} />
      <div className="grid grid-cols-[64px_minmax(0,1fr)] gap-3">
        <div className="flex h-[220px] flex-col justify-between text-right text-[11px] text-ardoise" style={{ fontVariantNumeric: "tabular-nums" }}>
          <span className="-translate-y-1.5">{nf.format(Math.round(haut / 10) * 10)} €</span>
          <span>{nf.format(Math.round((haut + bas) / 20) * 10)} €</span>
          <span className="translate-y-1.5">{nf.format(Math.round(bas / 10) * 10)} €</span>
        </div>
        <div className="flex min-w-0 flex-col gap-2.5">
          <div className="relative h-[220px]">
            <svg viewBox="0 0 640 200" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
              <path d="M0 0H640M0 100H640M0 200H640" className="stroke-trait" strokeWidth="1" vectorEffect="non-scaling-stroke" fill="none" />
              <path d={`${ligne} L640 200 L0 200 Z`} className="fill-menthe/[0.14]" />
              <path d={ligne} className="stroke-menthe" fill="none" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
            </svg>
            <span className="absolute -right-[5px] -mt-[5px] h-2.5 w-2.5 rounded-full bg-menthe ring-4 ring-[rgb(var(--k-surface-pleine-rgb))]" style={{ top: `${fin}%` }} />
            <span className="absolute right-3 -mt-[34px] whitespace-nowrap rounded-lg bg-relief px-2 py-1 text-[12px] font-medium text-encre" style={{ top: `${fin}%`, fontVariantNumeric: "tabular-nums" }}>{nf.format(dernier.prix)} €/m²</span>
          </div>
          <div className="flex justify-between text-[11px] text-ardoise">{serie.map((p) => <span key={p.annee}>{p.annee}</span>)}</div>
        </div>
      </div>
      <span className="text-[12px] leading-[1.5] text-ardoise">Courbe reconstituée à partir du prix d'aujourd'hui et de ses évolutions sur 1 et 5 ans (Le Figaro Immobilier).</span>
    </Carte>
  );
}

function Commercial({ prixAutour, prixProjet, loyerAutour, loyerProjet, nom }) {
  const cartes = [
    (prixAutour > 0 || prixProjet > 0) && { cle: "prix", titre: "Prix au m² — commerces", unite: "€/m²", autour: prixAutour, projet: prixProjet },
    (loyerAutour > 0 || loyerProjet > 0) && { cle: "loyer", titre: "Loyer au m² / an — commerces", unite: "€/m²/an", autour: loyerAutour, projet: loyerProjet },
  ].filter(Boolean);
  const [i, setI] = useState(0);
  if (!cartes.length) return null;
  const c = cartes[Math.min(i, cartes.length - 1)];
  const plafond = Math.max(c.autour, c.projet) / 0.78 || 1;
  const ecart = c.autour > 0 && c.projet > 0 ? ((c.projet / c.autour) - 1) * 100 : null;
  const fleches = cartes.length > 1 && (
    <div className="flex items-center gap-2">
      <button type="button" aria-label="Carte précédente" onClick={() => setI((v) => (v - 1 + cartes.length) % cartes.length)}
        className="grid h-7 w-7 place-items-center rounded-full border border-trait text-craie transition-colors hover:border-bord-vif hover:text-encre">
        <ChevronLeft className="h-3.5 w-3.5" />
      </button>
      <button type="button" aria-label="Carte suivante" onClick={() => setI((v) => (v + 1) % cartes.length)}
        className="grid h-7 w-7 place-items-center rounded-full border border-trait text-craie transition-colors hover:border-bord-vif hover:text-encre">
        <ChevronRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );
  const barre = (valeur, accent) => (
    <div className="flex h-full flex-1 flex-col justify-end gap-2.5">
      <span className={`text-[15px] font-medium ${accent ? "text-menthe" : "text-encre"}`} style={{ fontVariantNumeric: "tabular-nums" }}>{valeur > 0 ? `${nf.format(Math.round(valeur))} ${c.unite}` : "—"}</span>
      <div className={accent ? "rounded-t-[10px] bg-menthe" : "rounded-t-[10px] border border-b-0 border-trait bg-relief"} style={{ height: `${valeur > 0 ? Math.max(4, (valeur / plafond) * 100) : 0}%` }} />
    </div>
  );
  return (
    <Carte className="flex-[1_1_300px] min-w-0 p-7 max-md:p-5 flex flex-col gap-6">
      <TitreCarte titre={`Commercial${nom ? ` · ${nom}` : ""}`} sous={c.titre} droite={fleches} />
      <div className="flex h-[200px] items-end gap-5 border-b border-trait px-2">
        {barre(c.autour, false)}
        {barre(c.projet, true)}
      </div>
      <div className="-mt-3 flex gap-5 px-2 text-[13px] text-craie"><span className="flex-1">Autour</span><span className="flex-1">Le projet</span></div>
      {ecart != null && (
        <div className="mt-auto flex items-center justify-between gap-3 rounded-xl bg-menthe/[0.14] px-4 py-3.5">
          <span className="text-[13px] text-craie">Écart avec le marché</span>
          <span className="text-[18px] font-medium text-menthe" style={{ fontVariantNumeric: "tabular-nums" }}>{pourcent(ecart, 0)}</span>
        </div>
      )}
    </Carte>
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
  const serie = useMemo(() => serieResidentielle({ prix: prixResidentiel, evo1, evo5 }), [prixResidentiel, evo1, evo5]);

  const prixAutour = rue?.prix_m2 || Number(project.marche_prix_m2_median) || 0;
  const loyerAutour = Number(project.marche_offre_moyenne) || rue?.loyer_m2_an || Number(project.marche_baux_moyenne) || 0;

  const contexte = nomVille ? `Ville · ${nomVille}` : agglomeration && donnees?.agglomeration?.nom ? `Agglomération · ${donnees.agglomeration.nom}` : null;
  const entete = <EnTeteOnglet titre="Marché" contexte={contexte} source={prixResidentiel > 0 ? "Source : Le Figaro Immobilier" : null} className="" />;

  const rienDuTout = !habitants && !revenu && !prixResidentiel && !prixAutour && !loyerAutour && !prixM2Revient && !loyerM2;
  if (rienDuTout) return <div className="mb-5">{entete}</div>;

  return (
    <div className="flex flex-col gap-5">
      {entete}
      <RangeeCarte cellules={[
        habitants > 0 && <Chiffre label={`Habitants${agglomeration ? " · agglomération" : ""}`} valeur={nf.format(habitants)} />,
        revenu > 0 && <Revenus revenu={revenu} nomVille={nomVille} />,
        prixResidentiel > 0 && <PrixResidentiel prix={serie.length ? serie[serie.length - 1].prix : prixResidentiel} evo1={evo1} evo5={evo5} />,
      ]} />
      {(serie.length > 1 || prixAutour > 0 || loyerAutour > 0 || prixM2Revient > 0 || loyerM2 > 0) && (
        <div className="flex flex-wrap gap-5">
          <Evolution serie={serie} nom={r?.nom} />
          <Commercial prixAutour={prixAutour} prixProjet={prixM2Revient} loyerAutour={loyerAutour} loyerProjet={loyerM2} nom={rue?.nom} />
        </div>
      )}
    </div>
  );
}
