import React, { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { nf, useSecteurProjet } from "./SecteurChiffres";
import { trouverVille, REFERENCES_FR } from "@/data/villes";
import { EnTeteOnglet } from "./Cartes";
import { GridPatternCard, GridPatternCardBody } from "@/components/ui/card-with-grid-ellipsis-pattern";
import { Bloc, ValeurEditable, ValeurForcee, forcee, nombreForce } from "./EditionEnPlace";

// L'onglet Marché (maquette « Projet Detail 1b ») : trois cartes (habitants,
// revenus, prix résidentiel), puis deux : la courbe du résidentiel, et le
// commercial comparé au marché (le prix des murs, puis le loyer, qu'on fait
// défiler). Les cartes à chiffres portent le motif de grille (GridPatternCard).
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

const CHIFFRES = { fontVariantNumeric: "tabular-nums" };
const signe = (v) => (v < 0 ? "alerte" : "menthe");

/**
 * Une carte de l'onglet : la carte à grille, au fond d'un onglet au repos.
 * `id` et `titre` en font un bloc qu'on masque dans l'éditeur.
 */
function CarteMarche({ id, titre, grille = true, className = "", children }) {
  return (
    <Bloc id={id} titre={titre} className={`min-w-0 ${className}`}>
      <GridPatternCard className="h-full min-w-0 rounded-[16px]" patternClassName={grille ? "" : "!bg-none"}>
        <GridPatternCardBody>{children}</GridPatternCardBody>
      </GridPatternCard>
    </Bloc>
  );
}

/** L'en-tête d'une carte : le libellé à gauche, la précision à droite, un filet dessous. */
function EnTeteCarte({ libelle, precision = null }) {
  return (
    <div className="mb-5 flex items-center justify-between gap-3 border-b border-trait pb-3">
      <span className="min-w-0 truncate text-[16px] font-medium text-encre">{libelle}</span>
      {precision && <span className="flex-none text-[12.5px] text-ardoise">{precision}</span>}
    </div>
  );
}

/** Une pastille : un point de couleur et un texte court. */
function Pastille({ ton = "ardoise", children }) {
  const point = ton === "alerte" ? "bg-alerte" : ton === "menthe" ? "bg-menthe" : "bg-ardoise";
  return (
    <span className="inline-flex h-7 flex-none items-center gap-2 whitespace-nowrap rounded-full border border-trait bg-relief px-3 text-[12px] text-craie" style={CHIFFRES}>
      <span className={`h-1.5 w-1.5 flex-none rounded-full ${point}`} />{children}
    </span>
  );
}

/** Le grand chiffre d'une carte, avec son unité en petit. */
function Grand({ children, unite = null, taille = "text-[34px] max-md:text-[28px]", teinte = "text-encre" }) {
  return (
    <div className="flex items-baseline gap-1.5" style={CHIFFRES}>
      <span className={`${taille} leading-[1.1] tracking-[-0.02em] whitespace-nowrap ${teinte}`}>{children}</span>
      {unite && <span className="text-[14px] text-ardoise">{unite}</span>}
    </div>
  );
}

/** Une ligne de comparaison : point, libellé, valeur à droite, barre fine dessous. */
function Comparaison({ libelle, valeur, part, accent = false }) {
  return (
    <div className="flex flex-col gap-2" style={CHIFFRES}>
      <div className="flex items-center justify-between gap-3 text-[14px]">
        <span className="flex min-w-0 items-center gap-2 text-craie">
          <span className={`h-1.5 w-1.5 flex-none rounded-full ${accent ? "bg-menthe" : "bg-ardoise"}`} />
          <span className="truncate">{libelle}</span>
        </span>
        <span className={`whitespace-nowrap ${accent ? "text-menthe" : "text-encre"}`}>{valeur}</span>
      </div>
      <div className="h-1.5 rounded-full bg-encre/10">
        <div className={`h-1.5 rounded-full ${accent ? "bg-menthe" : "bg-ardoise"}`} style={{ width: `${Math.max(0, Math.min(100, part * 100))}%` }} />
      </div>
    </div>
  );
}

function Habitants({ habitants, agglomeration, contexte }) {
  return (
    <CarteMarche id="marche-habitants" titre="Habitants" className="flex-[1_1_260px]">
      <EnTeteCarte libelle="Habitants" precision={agglomeration ? "agglomération" : null} />
      <Grand><ValeurEditable champ="ville_habitants_agglo">{nf.format(habitants)}</ValeurEditable></Grand>
      {contexte && <div className="mt-auto pt-8"><Pastille ton="menthe"><ValeurForcee cle="marche_contexte" type="text">{contexte}</ValeurForcee></Pastille></div>}
    </CarteMarche>
  );
}

function Revenus({ revenu, nomVille, reference }) {
  const ecart = ((revenu / reference) - 1) * 100;
  const plafond = Math.max(revenu, reference);
  const arrondi = Math.round(revenu / 100) * 100;
  return (
    <CarteMarche id="marche-revenus" titre="Revenus" className="flex-[1_1_300px]">
      <EnTeteCarte libelle="Revenus" precision={`${pourcent(ecart)} vs. France`} />
      <Grand>≈<ValeurEditable champ="ville_revenu_median">{`${nf.format(arrondi)} €`}</ValeurEditable></Grand>
      <div className="mt-6 flex flex-col gap-4">
        <Comparaison libelle={<ValeurEditable champ="ville_secteur_champ1" type="text">{nomVille || "Ville"}</ValeurEditable>} valeur={<ValeurEditable champ="ville_revenu_median">{`${nf.format(arrondi)} €`}</ValeurEditable>} part={revenu / plafond} accent />
        <Comparaison libelle="France" valeur={<ValeurForcee cle="revenu_france">{`${nf.format(reference)} €`}</ValeurForcee>} part={reference / plafond} />
      </div>
    </CarteMarche>
  );
}

function PrixResidentiel({ prix, evo1, evo5 }) {
  return (
    <CarteMarche id="marche-residentiel" titre="Prix résidentiel" className="flex-[1_1_260px]">
      <EnTeteCarte libelle="Prix résidentiel" precision="secteur" />
      <Grand unite="€/m²"><ValeurEditable champ="marche_rue_prix_m2">{nf.format(prix)}</ValeurEditable></Grand>
      {(evo1 != null || evo5 != null) && (
        <div className="mt-auto flex flex-wrap gap-2 pt-8">
          {evo1 != null && <Pastille ton={signe(evo1)}><ValeurEditable champ="marche_evolution_1an">{pourcent(evo1)}</ValeurEditable> sur 1 an</Pastille>}
          {evo5 != null && <Pastille ton={signe(evo5)}><ValeurEditable champ="marche_evolution_5ans">{pourcent(evo5)}</ValeurEditable> sur 5 ans</Pastille>}
        </div>
      )}
    </CarteMarche>
  );
}

// La courbe du résidentiel, dessinée à la main : une aire, trois graduations,
// un point par année. Les points sont posés en HTML par-dessus le SVG, qui
// s'étire : un cercle dans le SVG deviendrait une ellipse.
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
  const premier = serie[0];
  const dernier = serie[serie.length - 1];
  const variation = ((dernier.prix / premier.prix) - 1) * 100;
  return (
    <CarteMarche id="marche-evolution" titre="Évolution du prix résidentiel" grille={false} className="flex-[2_1_520px]">
      <EnTeteCarte libelle="Évolution du prix résidentiel" precision={`${nom ? `${nom} · ` : ""}${premier.annee} – ${dernier.annee}`} />
      <div className="mb-6 flex flex-wrap items-center gap-2.5">
        <Pastille>{premier.annee} · {nf.format(premier.prix)} €/m²</Pastille>
        <span className="text-[16px] text-ardoise" aria-hidden="true">→</span>
        <Pastille ton="menthe">{dernier.annee} · {nf.format(dernier.prix)} €/m²</Pastille>
        <Pastille ton={signe(variation)}>{pourcent(variation)}</Pastille>
      </div>
      <div className="grid grid-cols-[64px_minmax(0,1fr)] gap-3">
        <div className="flex h-[220px] flex-col justify-between text-right text-[11px] text-ardoise" style={CHIFFRES}>
          <span className="-translate-y-1.5">{nf.format(Math.round(haut / 10) * 10)} €</span>
          <span>{nf.format(Math.round((haut + bas) / 20) * 10)} €</span>
          <span className="translate-y-1.5">{nf.format(Math.round(bas / 10) * 10)} €</span>
        </div>
        <div className="flex min-w-0 flex-col gap-2.5">
          <div className="relative h-[220px]">
            <svg viewBox="0 0 640 200" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
              <path d="M0 0H640M0 100H640M0 200H640" className="stroke-trait" strokeWidth="1" vectorEffect="non-scaling-stroke" fill="none" />
              <path d={`${ligne} L640 200 L0 200 Z`} className="fill-menthe/[0.14]" />
              <path d={ligne} className="stroke-menthe" fill="none" strokeWidth="2" vectorEffect="non-scaling-stroke" />
            </svg>
            {pts.map(([x, y], k) => {
              const bout = k === 0 || k === pts.length - 1;
              return (
                <span key={serie[k].annee}
                  className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full ${bout ? "h-2.5 w-2.5" : "h-1.5 w-1.5"} ${k === 0 ? "bg-ardoise" : "bg-menthe"}`}
                  style={{ left: `${(x / 640) * 100}%`, top: `${(y / 200) * 100}%` }} />
              );
            })}
          </div>
          <div className="flex justify-between text-[11px] text-ardoise">{serie.map((p) => <span key={p.annee}>{p.annee}</span>)}</div>
        </div>
      </div>
      <span className="mt-5 text-[12px] leading-[1.5] text-ardoise">Courbe reconstituée à partir du prix d'aujourd'hui et de ses évolutions sur 1 et 5 ans (Le Figaro Immobilier).</span>
    </CarteMarche>
  );
}

function Commercial({ prixAutour, prixProjet, loyerAutour, loyerProjet, nom }) {
  const cartes = [
    (prixAutour > 0 || prixProjet > 0) && { cle: "prix", precision: "prix au m²", unite: "€/m²", autour: prixAutour, projet: prixProjet },
    (loyerAutour > 0 || loyerProjet > 0) && { cle: "loyer", precision: "loyer au m² / an", unite: "€/m²/an", autour: loyerAutour, projet: loyerProjet },
  ].filter(Boolean);
  // Chaque chiffre se modifie au clic : « Autour » dans les champs du
  // panneau Marché, « Le projet » en valeur forcée (il se déduit du Simulateur).
  const AUTOUR = { prix: "marche_commercial_prix_m2", loyer: "marche_offre_moyenne" };
  const forcer = (c, qui, texte) => (qui === "autour"
    ? <ValeurEditable champ={AUTOUR[c.cle]}>{texte}</ValeurEditable>
    : <ValeurForcee cle={`commercial_${c.cle}_projet`}>{texte}</ValeurForcee>);
  const [i, setI] = useState(0);
  if (!cartes.length) return null;
  const c = cartes[Math.min(i, cartes.length - 1)];
  const plafond = Math.max(c.autour, c.projet) || 1;
  const ecart = c.autour > 0 && c.projet > 0 ? ((c.projet / c.autour) - 1) * 100 : null;
  const difference = c.autour > 0 && c.projet > 0 ? Math.round(c.autour - c.projet) : null;
  const valeur = (v) => (v > 0 ? `${nf.format(Math.round(v))} ${c.unite}` : "—");
  // Deux vues (le prix, le loyer) : la précision de l'en-tête les fait défiler.
  const precision = cartes.length > 1 ? (
    <span className="flex items-center gap-1.5">
      <button type="button" aria-label="Vue précédente" onClick={() => setI((v) => (v - 1 + cartes.length) % cartes.length)}
        className="grid h-5 w-5 place-items-center rounded-full border-0 bg-transparent p-0 text-ardoise transition-colors hover:text-encre">
        <ChevronLeft className="h-3.5 w-3.5" />
      </button>
      {c.precision}
      <button type="button" aria-label="Vue suivante" onClick={() => setI((v) => (v + 1) % cartes.length)}
        className="grid h-5 w-5 place-items-center rounded-full border-0 bg-transparent p-0 text-ardoise transition-colors hover:text-encre">
        <ChevronRight className="h-3.5 w-3.5" />
      </button>
    </span>
  ) : c.precision;
  return (
    <CarteMarche id="marche-commercial" titre="Commercial" className="flex-[1_1_300px]">
      <EnTeteCarte libelle={<>Commercial{nom ? <> · <ValeurForcee cle="commercial_rue" type="text">{nom}</ValeurForcee></> : ""}</>} precision={precision} />
      {ecart != null && (
        <div className="mb-6 flex flex-col gap-1.5">
          <span className="text-[13px] text-ardoise">Écart avec le marché</span>
          <Grand taille="text-[48px] max-md:text-[38px]" teinte="text-menthe">{pourcent(ecart, 0)}</Grand>
        </div>
      )}
      <div className="flex flex-col gap-4">
        <Comparaison libelle="Autour" valeur={forcer(c, "autour", valeur(c.autour))} part={c.autour / plafond} />
        <Comparaison libelle="Le projet" valeur={forcer(c, "projet", valeur(c.projet))} part={c.projet / plafond} accent />
      </div>
      {difference != null && difference !== 0 && (
        <div className="mt-auto pt-8">
          <div className="border-t border-trait pt-4 text-[13px] text-craie" style={CHIFFRES}>
            {nf.format(Math.abs(difference))} {c.unite} {difference > 0 ? "sous le" : "au-dessus du"} {c.cle === "loyer" ? "loyer" : "prix"} autour
          </div>
        </div>
      )}
    </CarteMarche>
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
  const revenuFrance = nombreForce(project, "revenu_france") ?? REFERENCES_FR.revenuMedian;
  const agglomeration = !Number(project.ville_habitants_agglo) && !!donnees?.agglomeration?.population;
  // La commune saisie dans le panneau l'emporte sur celle lue dans l'adresse.
  const nomVille = project.ville_secteur_champ1 || ville?.nom || null;
  const revenu = Number(project.ville_revenu_median) || ville?.revenu || 0;

  const prixResidentiel = Number(project.marche_rue_prix_m2) || r?.prix_m2 || Number(project.marche_prix_m2_median) || 0;
  const evo1 = duDossier(project.marche_evolution_1an, r?.evolution_1_an?.valeur);
  const evo5 = duDossier(project.marche_evolution_5ans, r?.evolution_5_ans?.valeur);
  const serie = useMemo(() => serieResidentielle({ prix: prixResidentiel, evo1, evo5 }), [prixResidentiel, evo1, evo5]);

  // Ce que le dossier porte l'emporte sur la rue ; ce qui est forcé dans
  // l'éditeur l'emporte sur le calcul.
  const prixAutour = Number(project.marche_commercial_prix_m2) || rue?.prix_m2 || Number(project.marche_prix_m2_median) || 0;
  const loyerAutour = Number(project.marche_offre_moyenne) || rue?.loyer_m2_an || Number(project.marche_baux_moyenne) || 0;
  const prixProjet = nombreForce(project, "commercial_prix_projet") ?? prixM2Revient;
  const loyerProjet = nombreForce(project, "commercial_loyer_projet") ?? loyerM2;
  const nomRue = forcee(project, "commercial_rue") || rue?.nom || null;

  const contexte = forcee(project, "marche_contexte") || (nomVille ? `Ville · ${nomVille}` : agglomeration && donnees?.agglomeration?.nom ? `Agglomération · ${donnees.agglomeration.nom}` : null);
  const entete = <EnTeteOnglet titre="Marché" source={prixResidentiel > 0 ? "Source : Le Figaro Immobilier" : null} className="" />;

  const rienDuTout = !habitants && !revenu && !prixResidentiel && !prixAutour && !loyerAutour && !prixProjet && !loyerProjet;
  if (rienDuTout) return <div className="mb-5">{entete}</div>;

  return (
    <div className="flex flex-col gap-4">
      {entete}
      {(habitants > 0 || revenu > 0 || prixResidentiel > 0) && (
        <div className="flex flex-wrap gap-4">
          {habitants > 0 && <Habitants habitants={habitants} agglomeration={agglomeration} contexte={contexte} />}
          {revenu > 0 && <Revenus revenu={revenu} nomVille={nomVille} reference={revenuFrance} />}
          {prixResidentiel > 0 && <PrixResidentiel prix={serie.length ? serie[serie.length - 1].prix : prixResidentiel} evo1={evo1} evo5={evo5} />}
        </div>
      )}
      {(serie.length > 1 || prixAutour > 0 || loyerAutour > 0 || prixProjet > 0 || loyerProjet > 0) && (
        <div className="flex flex-wrap gap-4">
          <Evolution serie={serie} nom={r?.nom} />
          <Commercial prixAutour={prixAutour} prixProjet={prixProjet} loyerAutour={loyerAutour} loyerProjet={loyerProjet} nom={nomRue} />
        </div>
      )}
    </div>
  );
}
