import React, { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";
import { Loader2, ChevronLeft, Trash2, Printer, AlertTriangle, FileText } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { BoutonOutil, BoutonPrincipal, CLASSE_CARTE, Filtres, Statut, TRANSPARENT } from "@/components/mandataire/elements";
import { useUser } from "@/components/providers/UserProvider";
import { toast } from "@/components/ui/avis";
import { Etoiles } from "@/components/alx/alx-commun";
import { MecaniqueEnLigne } from "@/components/kdata/Mecanique";

// K-Expertise : l'étude d'implantation d'une adresse.
//
// Deux écrans (10 nov. 2026, Jules : écran d'arrivée) : l'arrivée (le
// formulaire sur une ligne, une carte par étude en cours, les rapports en
// grille, les chapitres à droite), puis le rapport. Une étude prend plusieurs minutes la première fois, le registre
// d'une grande ville se lit page par page : la ligne en cours le dit. Le rapport,
// dans le verre de Klocka : les mêmes panneaux translucides que le panneau
// l'habit des six cartes du tableau de bord K-Data — bg-surface, filet trait,
// rayon de 18, sans flou : Klocka a son propre habillage, et le garde même
// quand la donnée vient d'ailleurs.
//
// Le PDF, c'est l'impression du navigateur : la feuille @media print
// d'index.css ne garde que le rapport et repasse la palette en clair. Le PDF
// n'est donc jamais qu'une autre vue du même rapport, avec son texte
// sélectionnable, et jamais un document à part qui pourrait en diverger.
//
// Tout vient de sources ouvertes ; les flux sont une estimation, et chaque
// panneau dit d'où vient ce qu'il montre. Une même adresse et une même
// activité, dans les trente jours, reprennent l'étude en base.

const CLE_MAPS = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";

// La mécanique : dans quel ordre K-Expertise interroge quoi.
const ETAPES_MECANIQUE = [
  { source: "Base Adresse Nationale", quoi: "Localise l'adresse tapée." },
  { source: "Sirene (INSEE)", quoi: "Les établissements de la commune par famille de commerce : la rue, le tronçon numéro par numéro, l'ancienneté. Une grande ville se lit en plusieurs minutes la première fois, puis trente jours de cache." },
  { source: "OpenStreetMap", quoi: "Le tracé, la longueur et la classe de la rue ; les générateurs de flux dans 300 m : arrêts, gares, bouches de métro, supermarchés, hôpitaux, écoles." },
  { source: "IGN et INSEE", quoi: "Trois zones de chalandise à pied, 5, 10 et 15 minutes, en isochrones IGN, lues en carreaux Filosofi de 200 m et en IRIS du recensement (CSP, chômage, retraités)." },
  { source: "Klocka", quoi: "Le flux piéton et le flux voiture : une estimation à partir de la commercialité, des habitants, des établissements et des transports. Pas un comptage." },
  { source: "Google Maps", quoi: "Le plan et la vue de la rue, à l'écran seulement : le PDF ne les inclut pas." },
];

const nb = (n) => (n == null ? "—" : Math.round(n).toLocaleString("fr-FR"));
const euros = (n) => (n == null ? "—" : `${Math.round(n).toLocaleString("fr-FR")} €`);
const pct = (n, signe = false) => (n == null ? "—" : `${signe && n > 0 ? "+" : ""}${String(n).replace(".", ",")} %`);
const quand = (iso) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "");

// ── Les briques du rapport, dans le verre de Klocka ────────────────────────

/** Un panneau de section : le même verre que « Informations dans la zone ». */
function Panel({ titre, children, className = "", pourPdf = true }) {
  // `pourPdf` à faux : une section de cartes Google, qui s'imprimerait blanche.
  return (
    <section className={`${pourPdf ? "" : "k-sans-impression"} mt-7 border-t border-trait pt-7 first:mt-0 first:border-t-0 first:pt-0 ${className}`}>
      <div className="mb-4 flex items-center gap-2.5">
        <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-menthe" />
        <h2 className="alx-mont m-0 text-[12px] font-semibold uppercase tracking-[.16em] text-menthe-texte">{titre}</h2>
      </div>
      {children}
    </section>
  );
}

/** Un bloc plus clair, posé dans un panneau. */
function Bloc({ children, className = "" }) {
  return <div className={`rounded-[12px] border border-trait bg-surface p-4 ${className}`}>{children}</div>;
}

/** Étiquette + valeur, comme les lignes « Commercialité » du rapport source. */
function Etiquette({ label, children, etoiles = null }) {
  return (
    <div className="mb-1.5 flex items-center gap-3 rounded-[8px] border border-trait bg-surface px-3 py-2 text-[13px]">
      <span className="w-[190px] flex-shrink-0 text-[11.5px] max-md:w-[104px] max-md:text-[10.5px] uppercase tracking-[.06em] text-ardoise">{label}</span>
      <span className="min-w-0 flex-1 font-medium text-encre">{children}</span>
      {etoiles && <Etoiles note={etoiles.note} sur={etoiles.sur} taille={15} />}
    </div>
  );
}

/** Le grand chiffre, avec ses évolutions dessous. */
function Compteur({ titre, valeur, evolutions = null }) {
  return (
    <div className="overflow-hidden rounded-[12px] border border-bord">
      <p className="m-0 bg-surface px-3 py-1.5 text-center text-[11.5px] uppercase tracking-[.08em] text-ardoise">{titre}</p>
      <p className="m-0 bg-relief py-3 text-center text-[22px] font-semibold tabular-nums text-encre">{valeur}</p>
      {evolutions && (
        <div className="bg-surface px-3 py-2 text-[11.5px]">
          {Object.entries(evolutions).map(([k, v]) => (
            <div key={k} className="flex items-center justify-between py-0.5">
              <span className="text-ardoise">{k}</span>
              <span className={`rounded-full px-2 py-0.5 font-medium ${v > 0 ? "bg-vert/15 text-vert" : v < 0 ? "bg-alerte/15 text-alerte" : "bg-relief text-ardoise"}`}>{pct(v, true)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Une ligne « intitulé — valeur » d'un tableau du rapport. */
function Ligne({ label, children, sous = false }) {
  return (
    <div className={`flex items-baseline justify-between border-b border-trait py-1.5 text-[13px] max-md:gap-3 ${sous ? "pl-4" : ""}`}>
      <span className={sous ? "text-ardoise" : "font-medium text-encre"}>{sous ? `– ${label}` : label}</span>
      <span className="tabular-nums text-encre">{children ?? "—"}</span>
    </div>
  );
}

function Sources({ children }) {
  return <p className="mt-3 mb-0 text-right text-[10.5px] italic text-brume">Sources : {children}</p>;
}

// ── Le rapport ─────────────────────────────────────────────────────────────

function Rapport({ expertise: e, user, onRetour, onSupprimer }) {
  const r = e.resultat || {};
  const d = r.etude || r.data_b || null;
  const p = r.point;
  const zones = r.zones || [];
  const fluxP = d?.flux_pieton;
  const fluxV = d?.flux_voiture;
  const rue = d?.rue;
  const troncon = d?.troncon;
  const numeros = d?.commerces_troncon?.numeros || [];
  const pair = numeros.filter((n) => n.cote === "pair");
  const impair = numeros.filter((n) => n.cote === "impair");

  // Le navigateur imprime, et sa boîte de dialogue propose « Enregistrer au
  // format PDF ». Le rapport s'y rend seul : la feuille @media print d'index.css
  // masque le reste de l'application et repasse la palette en clair.
  const voirPdf = () => window.print();

  const Numero = ({ n }) => (
    <div className="mb-2 overflow-hidden rounded-[10px] border border-trait bg-surface">
      <div className="flex items-center justify-between border-b border-trait px-3 py-1.5">
        <span className="text-[13px] font-semibold text-menthe-texte">N°{n.numero}</span>
        <span className="alx-mont text-[10px] uppercase tracking-[.12em] text-ardoise">
          {n.habitation ? "Habitation" : n.entreprise ? "Entreprise" : `${n.commerces.length} commerce${n.commerces.length > 1 ? "s" : ""}`}
        </span>
      </div>
      {n.commerces?.map((c, i) => (
        <div key={i} className="flex items-center gap-2.5 px-3 py-1.5">
          <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-menthe" />
          <span className="min-w-0">
            <span className="block text-[11px] text-ardoise">{c.activite}</span>
            <span className="block truncate text-[12.5px] font-medium text-encre">{c.enseigne}</span>
          </span>
        </div>
      ))}
    </div>
  );

  const ZoneCarte = ({ z }) => {
    const i = z.insee;
    return (
      <Panel titre={`${z.nom} à ${z.marche}`}>
        {!i ? <p className="m-0 text-[12.5px] text-alerte">{z.erreur || "Zone non lue."}</p> : (
          <div className="grid gap-4 md:grid-cols-2">
            <Bloc>
              <p className="alx-mont m-0 mb-2 text-[10.5px] uppercase tracking-[.12em] text-ardoise">Résidents</p>
              <Ligne label="Population">{nb(i.population.habitants)}</Ligne>
              <Ligne label="0-17 ans" sous>{pct(i.population.ages["0-17 ans"])}</Ligne>
              <Ligne label="65 ans et plus" sous>{pct(i.population.part_65_plus)}</Ligne>
              <Ligne label="Ménages">{nb(i.menages.menages)}</Ligne>
              <Ligne label="Personnes seules">{pct(i.menages.part_une_personne)}</Ligne>
              <Ligne label="Familles monoparentales">{pct(i.menages.part_monoparentales)}</Ligne>
              <Ligne label="Taux de pauvreté">{pct(i.revenus.taux_pauvrete)}</Ligne>
              <Ligne label="Niveau de vie moyen">{euros(i.revenus.niveau_de_vie_moyen)}</Ligne>
            </Bloc>
            <Bloc>
              <p className="alx-mont m-0 mb-2 text-[10.5px] uppercase tracking-[.12em] text-ardoise">Logements</p>
              <Ligne label="Densité">{nb(i.population.densite_km2)} hab./km²</Ligne>
              <Ligne label="En immeuble">{pct(i.logement.part_collectif)}</Ligne>
              <Ligne label="En maison">{pct(i.logement.part_maisons)}</Ligne>
              <Ligne label="Propriétaires">{pct(i.menages.part_proprietaires)}</Ligne>
              <Ligne label="Logement social">{pct(i.logement.part_social)}</Ligne>
              <Ligne label="Surface moyenne">{nb(i.logement.surface_moyenne_m2)} m²</Ligne>
              <Ligne label="Emprise">{z.approximation ? `rayon de ${z.rayon_m} m` : `isochrone ${z.marche}`} · {i.carreaux} carreaux INSEE</Ligne>
            </Bloc>
          </div>
        )}
        <Sources>INSEE Filosofi, carreaux de 200 m. {z.approximation ? `Rayon de ${z.rayon_m} m, l'équivalent de ${z.marche} : l'IGN n'a pas rendu l'isochrone.` : `Isochrone IGN à pied, ${z.marche}.`}</Sources>
      </Panel>
    );
  };

  return (
    <div className="k-impression mx-auto max-w-[1100px] px-4 pb-20">
      {/* La barre d'actions ne s'imprime pas : k-sans-impression la retire. */}
      {/* Les boutons de la planche (10 nov. 2026, Jules : planche Outils) ; le rapport, lui, ne change pas. */}
      <div className="k-sans-impression mb-6 flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={onRetour} style={TRANSPARENT} className="inline-flex items-center gap-1.5 text-[13px] text-ardoise hover:text-encre"><ChevronLeft className="h-4 w-4" />Toutes les expertises</button>
        <div className="flex items-center gap-2">
          <BoutonOutil onClick={onSupprimer} className="hover:!border-alerte hover:!text-alerte"><Trash2 className="h-3.5 w-3.5" />Supprimer</BoutonOutil>
          <BoutonPrincipal onClick={voirPdf}><Printer className="h-3.5 w-3.5" />Voir en PDF</BoutonPrincipal>
        </div>
      </div>

      {/* Un seul fond de verre derrière tout le rapport — le même que les
          panneaux de K-Zoning — plutôt qu'une carte par section, qui donnait
          des blocs flottants sans lien entre eux. */}
      <div className="rounded-[18px] border border-trait bg-surface p-7 max-md:p-4">
      {/* La couverture */}
        <section className="pb-2 text-center">
        <p className="alx-mont m-0 inline-block rounded-full border border-menthe/30 bg-menthe/10 px-4 py-1 text-[11px] uppercase tracking-[.2em] text-menthe-texte">Rapport d&apos;implantation</p>
        <h1 className="mt-3 mb-0 text-[32px] font-light max-md:text-[26px] tracking-[-0.01em] text-encre">Étude d&apos;expertise</h1>
        <div className="mx-auto my-4 h-px w-28 bg-menthe/40" />
        <p className="m-0 text-[21px] font-medium text-encre max-md:text-[18px]">{p?.libelle || e.adresse}</p>
        <p className="m-0 mt-1 text-[13px] text-ardoise">{e.activite}</p>
        <p className="m-0 mt-4 text-[13px] text-encre">Étude préparée par <strong>{e.par || user?.full_name || user?.email}</strong></p>
        <p className="m-0 mt-1 text-[11.5px] text-brume">Document généré par les outils Klocka le {quand(e.fini_le || e.cree_le)}{r.sources?.length ? ` · sources : ${r.sources.join(", ")}` : ""}</p>
        {d?.du_cache && <p className="m-0 mt-2 text-[11.5px] text-menthe-texte">Étude reprise de la base, moins de trente jours.</p>}
        {(r.etude_erreur || r.data_b_erreur) && <p className="m-0 mt-2 inline-flex items-center gap-1.5 text-[12px] text-alerte"><AlertTriangle className="h-3.5 w-3.5" />Étude d&apos;implantation : {r.etude_erreur || r.data_b_erreur}</p>}
        {d?.manques?.length > 0 && <p className="m-0 mt-2 text-[11.5px] text-ardoise">Lectures manquantes : {d.manques.join(" · ")}</p>}
      </section>

      <div className="mt-7 border-t border-trait pt-7">
        <MecaniqueEnLigne etapes={ETAPES_MECANIQUE} titre="La mécanique : d'où viennent ces chiffres" />
      </div>

      {/* Descriptif de l'emplacement */}
      <Panel titre="Descriptif de l'emplacement" pourPdf={false}>
        <div className="grid gap-4 md:grid-cols-2">
          {CLE_MAPS && p ? (
            <>
              <iframe title="Plan" className="h-[280px] w-full rounded-[12px] border border-trait" loading="lazy"
                src={`https://www.google.com/maps/embed/v1/place?key=${CLE_MAPS}&q=${p.lat},${p.lon}&zoom=16`} />
              <iframe title="Vue de la rue" className="h-[280px] w-full rounded-[12px] border border-trait" loading="lazy"
                src={`https://www.google.com/maps/embed/v1/streetview?key=${CLE_MAPS}&location=${p.lat},${p.lon}&fov=90`} />
            </>
          ) : <p className="m-0 text-[12.5px] text-brume">Plan indisponible.</p>}
        </div>
        <Sources>Base Adresse Nationale, Google Maps — plan et vue de la rue visibles à l&apos;écran, non inclus dans le PDF</Sources>
      </Panel>

      {/* Présentation du quartier */}
      {d && (
        <Panel titre="Présentation du quartier">
          <div className="grid gap-4 md:grid-cols-2">
            <Bloc>
              <Etiquette label="Revenu annuel">{euros(d.en_tete?.revenu_annuel_quartier)} {d.en_tete?.revenu_vs_france != null && <span className="text-ardoise">(France : {pct(d.en_tete.revenu_vs_france, true)})</span>}</Etiquette>
              <Etiquette label="CSP majoritaire">{d.en_tete?.csp_majoritaire || "—"}</Etiquette>
              <Etiquette label="Population">{nb(d.demographie?.habitants)} personnes</Etiquette>
              <Etiquette label="Taux de chômage">{pct(d.revenu?.taux_chomage)}</Etiquette>
            </Bloc>
            <Bloc>
              <Etiquette label="CSP +">{nb(d.revenu?.csp_plus)}</Etiquette>
              <Etiquette label="Retraités">{nb(d.revenu?.retraites)}</Etiquette>
              <Etiquette label="Revenu moyen">{euros(d.revenu?.revenu_moyen_annuel)}</Etiquette>
              <Etiquette label="Entreprises (zone)">{nb(d.zone_primaire?.entreprises)}</Etiquette>
            </Bloc>
          </div>
          <Sources>INSEE recensement et Filosofi sur les zones à pied, Sirene</Sources>
        </Panel>
      )}

      {/* L'emplacement classé (lot 8, 18 oct. 2026, boîte à outils allumée) : le code calcule l'indice et le classement. */}
      {r.emplacement && (
        <Panel titre="Emplacement">
          <div className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
            <Compteur titre={r.emplacement.classement?.libelle || "Classement"} valeur={`${r.emplacement.flux?.indice ?? "—"} / 100`} />
            <Bloc>
              {(r.emplacement.flux?.composantes || []).map((c) => (
                <Ligne key={c.cle} label={c.libelle}>{c.note} / 100 <span className="text-brume">· poids {Math.round(c.poids * 100)} %</span></Ligne>
              ))}
              <p className="m-0 mt-2 text-[11.5px] text-brume">Indice de flux : {r.emplacement.flux?.nature} ; {r.emplacement.flux?.sur}.</p>
            </Bloc>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Bloc>
              <p className="m-0 mb-2 text-[12px] uppercase tracking-[.08em] text-ardoise">Activités</p>
              {(r.emplacement.classement?.activites?.adaptees || []).map((a) => <p key={a} className="m-0 py-0.5 text-[13px] text-encre">Adapté : {a}</p>)}
              {(r.emplacement.classement?.activites?.deconseillees || []).map((a) => <p key={a} className="m-0 py-0.5 text-[13px] text-ardoise">Déconseillé : {a}</p>)}
            </Bloc>
            <Bloc>
              <p className="m-0 mb-2 text-[12px] uppercase tracking-[.08em] text-ardoise">Urbanisme, risques, transports</p>
              <Ligne label="Zone du PLU">{r.emplacement.urbanisme?.zone?.code || "—"}</Ligne>
              <Ligne label="Linéaire commercial protégé">{r.emplacement.urbanisme ? (r.emplacement.urbanisme.lineaire_commercial ? "oui" : "non") : "—"}</Ligne>
              <Ligne label="Gare la plus proche">{r.emplacement.gares?.[0] ? `${r.emplacement.gares[0].nom}, ${r.emplacement.gares[0].distance_m} m${r.emplacement.gares[0].voyageurs ? `, ${nb(r.emplacement.gares[0].voyageurs)} voyageurs en ${r.emplacement.gares[0].annee}` : ""}` : "aucune à 1,5 km"}</Ligne>
              <Ligne label="Arrêts à moins de 300 m">{r.emplacement.arrets?.filter((a) => a.distance_m <= 300).length ?? "—"}</Ligne>
              {r.emplacement.loyer?.central && <Ligne label="Loyer de marché (déjà lu)">{`${r.emplacement.loyer.bas} à ${r.emplacement.loyer.haut} €/m²/an`}</Ligne>}
              {(r.emplacement.classement?.reserves || []).map((x) => <p key={x} className="m-0 mt-2 text-[12.5px] text-ambre">{x}</p>)}
            </Bloc>
          </div>
          <Sources>{(r.emplacement.sources || []).join(", ") || "étude interne"} ; classement estimé, à étalonner sur celui des analystes</Sources>
        </Panel>
      )}

      {/* Générateurs de flux */}
      <Panel titre="Générateurs de flux">
        {!r.generateurs?.length ? <p className="m-0 text-[12.5px] text-brume">Aucun générateur cartographié dans 300 m.</p> :
          ["Moins de 50 mètres", "De 50 à 100 mètres", "Plus de 100 mètres"].map((bande) => {
            const lot = r.generateurs.filter((g) => g.bande === bande);
            if (!lot.length) return null;
            return (
              <div key={bande} className="mb-4">
                <p className="alx-mont m-0 mb-2 text-[11px] uppercase tracking-[.12em] text-brume">{bande} de l&apos;emplacement</p>
                {lot.map((g) => (
                  <div key={g.rang} className="mb-1.5 flex items-center gap-3 rounded-[8px] border border-trait bg-surface px-3 py-2 text-[12.5px]">
                    <span className="w-14 flex-shrink-0 rounded-[6px] bg-relief py-1 text-center font-medium tabular-nums text-encre">{g.distance_m} m</span>
                    <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-menthe/20 text-[10px] font-bold text-menthe-texte">{g.rang}</span>
                    <span className="min-w-0 flex-1"><strong className="text-encre">{g.genre}</strong> <span className="text-encre">{g.nom || ""}</span><span className="block text-[11px] text-brume">{g.famille}</span></span>
                    <span className="flex-shrink-0 text-[11px] uppercase text-ardoise max-md:max-w-[96px] max-md:truncate">{g.adresse || ""}</span>
                  </div>
                ))}
              </div>
            );
          })}
        <Sources>OpenStreetMap</Sources>
      </Panel>

      {/* Flux piéton */}
      {fluxP && (
        <Panel titre="Estimation du flux piéton dans la zone">
          <div className="grid gap-4 md:grid-cols-[1fr_260px]">
            <div className="grid gap-4 sm:grid-cols-2">
              <Bloc className="border-t-2 border-t-vert text-center">
                <p className="m-0 text-[13px] font-medium text-encre">Estimation basse par heure</p>
                <p className="alx-mont my-3 rounded-[8px] bg-relief py-2 text-[14px] font-bold uppercase text-menthe-texte">Entre {nb(fluxP.par_heure?.basse?.min)} et {nb(fluxP.par_heure?.basse?.max)} piétons</p>
                <p className="m-0 text-[12px] text-ardoise">Flux par jour : entre {nb(fluxP.par_jour?.basse?.min)} et {nb(fluxP.par_jour?.basse?.max)}</p>
              </Bloc>
              <Bloc className="border-t-2 border-t-alerte text-center">
                <p className="m-0 text-[13px] font-medium text-encre">Estimation haute par heure</p>
                <p className="alx-mont my-3 rounded-[8px] bg-relief py-2 text-[14px] font-bold uppercase text-menthe-texte">Entre {nb(fluxP.par_heure?.haute?.min)} et {nb(fluxP.par_heure?.haute?.max)} piétons</p>
                <p className="m-0 text-[12px] text-ardoise">Flux par jour : entre {nb(fluxP.par_jour?.haute?.min)} et {nb(fluxP.par_jour?.haute?.max)}</p>
              </Bloc>
            </div>
            <Bloc>
              <p className="alx-mont m-0 text-[10.5px] uppercase tracking-[.14em] text-ardoise">Densité du flux</p>
              <div className="my-2 rounded-[8px] bg-relief py-2 text-center"><Etoiles note={fluxP.note?.note ?? 0} sur={fluxP.note?.sur ?? 5} taille={20} /></div>
              {Object.entries(fluxP.sous_notes || {}).map(([k, v]) => (
                <div key={k} className="flex items-center justify-between border-b border-trait py-1.5 text-[12.5px]"><span className="capitalize text-encre">{k}</span><Etoiles note={v.note} sur={v.sur} taille={14} /></div>
              ))}
            </Bloc>
          </div>
          <Sources>{fluxP.methode || "Estimation algorithmique, pas un comptage sur site."}</Sources>
        </Panel>
      )}

      {/* Flux voiture */}
      {fluxV && (
        <Panel titre="Estimation du flux voiture dans la zone">
          <Bloc className="text-center">
            <p className="alx-mont m-0 text-[10.5px] uppercase tracking-[.14em] text-ardoise">Densité du flux</p>
            {fluxV.indisponible ? <p className="m-0 mt-2 text-[12.5px] text-ardoise">Pas de classe de voie connue pour cette rue : le flux voiture n&apos;est pas estimé.</p>
              : <div className="mt-2 inline-block rounded-[8px] bg-relief px-6 py-2"><Etoiles note={fluxV.note?.note ?? 0} sur={fluxV.note?.sur ?? 5} taille={24} /></div>}
          </Bloc>
          <Sources>{fluxV.methode || "Estimation d'après la classe de la voie."}</Sources>
        </Panel>
      )}

      {/* La rue */}
      {rue && (
        <Panel titre="Présentation de la rue">
          <Bloc>
            <p className="m-0 mb-3 text-center text-[14px] text-encre">Il y a <strong className="text-[22px] text-menthe-texte">{rue.commerces}</strong> commerces en activité dans cette rue longue de <strong>{rue.longueur_m} m</strong></p>
            <div className="mb-4 grid grid-cols-2 gap-x-6 gap-y-1 md:grid-cols-3">
              {(rue.familles || []).map((f) => (
                <p key={f.famille} className="m-0 flex items-center gap-2 text-[12.5px]"><span className="h-1.5 w-1.5 rounded-full bg-menthe" /><strong className="text-encre">{f.n}</strong><span className="text-ardoise">en {f.famille}</span></p>
              ))}
            </div>
            <Etiquette label="Commercialité de la rue" etoiles={rue.note}>{rue.libelle || `${rue.commerces} commerces`}{rue.rang?.rang ? ` · ${rue.rang.rang}e rue commerçante sur ${rue.rang.sur} dans la ville` : ""}</Etiquette>
            {rue.anciennete?.length > 0 && <Etiquette label="Ancienneté des commerces">{rue.anciennete.map((t) => `${t.tranche} : ${t.n} (${t.part} %)`).join(" · ")}</Etiquette>}
          </Bloc>
          <Sources>Sirene pour les commerces et leur ancienneté, OpenStreetMap pour la longueur</Sources>
        </Panel>
      )}

      {/* Le tronçon */}
      {troncon && (
        <Panel titre="Présentation du tronçon de rue">
          <Bloc><Etiquette label="Commercialité du tronçon" etoiles={troncon.note}>{troncon.libelle}{troncon.bornes ? ` · du n°${troncon.bornes.du} au n°${troncon.bornes.au}` : ""}</Etiquette></Bloc>
          <Sources>Sirene, dans {troncon.rayon_m || 100} m autour de l&apos;adresse</Sources>
        </Panel>
      )}
      {numeros.length > 0 && (
        <Panel titre="Activité commerciale du tronçon de rue">
          <div className="grid grid-cols-[1fr_20px_1fr] gap-3 max-md:grid-cols-[1fr_2px_1fr] max-md:gap-2">
            <div>
              <p className="alx-mont m-0 mb-3 text-right text-[10.5px] font-semibold uppercase tracking-[.16em] text-ardoise">Côté pair</p>
              {pair.map((n, i) => <Numero key={`${n.numero}-${i}`} n={n} />)}
            </div>
            <div className="rounded-full bg-trait" />
            <div>
              <p className="alx-mont m-0 mb-3 text-[10.5px] font-semibold uppercase tracking-[.16em] text-ardoise">Côté impair</p>
              {impair.map((n, i) => <Numero key={`${n.numero}-${i}`} n={n} />)}
            </div>
          </div>
          <Sources>Sirene : établissements actifs des familles de commerce, numéro par numéro</Sources>
        </Panel>
      )}

      {/* Zones de chalandise */}
      {zones.map((z) => <ZoneCarte key={z.cle} z={z} />)}
      {zones.some((z) => z.insee) && (
        <Panel titre="Zone de chalandise | Récapitulatif">
          <Bloc className="overflow-x-auto">
            <table className="w-full border-collapse text-[12.5px]">
              <thead><tr className="border-b border-bord text-left">
                <th className="alx-mont px-3 py-2 text-[10.5px] uppercase tracking-[.12em] text-ardoise">Résidents</th>
                {zones.map((z) => <th key={z.cle} className="alx-mont px-3 py-2 text-[10.5px] uppercase tracking-[.12em] text-ardoise">{z.marche}</th>)}
              </tr></thead>
              <tbody>
                {[["Population", "population", "habitants"], ["Ménages", "menages", "menages"], ["Ménages pauvres", "revenus", "menages_pauvres"]].map(([label, k, s]) => (
                  <tr key={label} className="border-b border-trait"><td className="px-3 py-1.5 font-medium text-encre">{label}</td>
                    {zones.map((z) => <td key={z.cle} className="px-3 py-1.5 tabular-nums text-encre">{nb(z.insee?.[k]?.[s])}</td>)}</tr>
                ))}
                <tr className="border-b border-trait"><td className="px-3 py-1.5 font-medium text-encre">Niveau de vie moyen</td>
                  {zones.map((z) => <td key={z.cle} className="px-3 py-1.5 tabular-nums text-encre">{euros(z.insee?.revenus?.niveau_de_vie_moyen)}</td>)}</tr>
              </tbody>
            </table>
          </Bloc>
          <Sources>INSEE Filosofi. Les zones s&apos;emboîtent : chaque colonne contient la précédente, il n&apos;y a pas de total à faire.</Sources>
        </Panel>
      )}

      {/* Démographie et revenu du quartier, avec les évolutions */}
      {d?.demographie && (
        <Panel titre="Étude démographique et revenu de la zone">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Compteur titre="Habitants" valeur={nb(d.demographie.habitants)} evolutions={d.demographie.evolution && { "Évolution à 3 ans": d.demographie.evolution.a_3_ans, "à 5 ans": d.demographie.evolution.a_5_ans, "à 10 ans": d.demographie.evolution.a_10_ans }} />
            <Compteur titre="Revenu moyen" valeur={`${nb(d.revenu?.revenu_moyen_annuel)} € / an`} evolutions={d.revenu?.revenu_evolution && { "Évolution à 3 ans": d.revenu.revenu_evolution.a_3_ans, "à 5 ans": d.revenu.revenu_evolution.a_5_ans }} />
            <Compteur titre="CSP +" valeur={nb(d.revenu?.csp_plus)} evolutions={d.revenu?.csp_plus_evolution && { "Évolution à 3 ans": d.revenu.csp_plus_evolution.a_3_ans, "à 5 ans": d.revenu.csp_plus_evolution.a_5_ans }} />
            <Compteur titre="Taux de chômage" valeur={pct(d.revenu?.taux_chomage)} />
          </div>
          <Sources>INSEE recensement (IRIS) et Filosofi, zone à 15 minutes à pied. Les évolutions attendent un second millésime.</Sources>
        </Panel>
      )}

      {/* Logement */}
      {d?.zone_primaire && (
        <Panel titre="Portrait du logement dans la zone">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Compteur titre="Logements" valeur={nb(d.zone_primaire.logements)} />
            <Compteur titre="Maisons" valeur={nb(d.zone_primaire.maisons)} />
            <Compteur titre="Appartements" valeur={nb(d.zone_primaire.appartements)} />
            <Compteur titre="Propriétaires" valeur={nb(d.zone_primaire.proprietaires)} />
          </div>
          <Sources>INSEE Filosofi, zone à 5 minutes à pied : ménages, dont ménages propriétaires.</Sources>
        </Panel>
      )}

      {/* Synthèse */}
      <Panel titre="Synthèse de l'expertise">
        <div className="grid gap-4 md:grid-cols-2">
          <Bloc>
            <p className="alx-mont m-0 mb-2 text-[10.5px] uppercase tracking-[.12em] text-ardoise">Le quartier</p>
            <Etiquette label="Population">{nb(d?.demographie?.habitants)}</Etiquette>
            <Etiquette label="Revenu moyen">{euros(d?.revenu?.revenu_moyen_annuel)} / an</Etiquette>
            <Etiquette label="Commerces (zone)">{nb(d?.zone_primaire?.commerces)}</Etiquette>
          </Bloc>
          <Bloc>
            <p className="alx-mont m-0 mb-2 text-[10.5px] uppercase tracking-[.12em] text-ardoise">La rue et le tronçon</p>
            <Etiquette label="Commercialité">{rue ? `${rue.commerces} commerces sur ${rue.longueur_m} m` : "—"}</Etiquette>
            <Etiquette label="Tronçon" etoiles={troncon?.note}>{troncon?.libelle || "—"}</Etiquette>
            <Etiquette label="Flux piéton" etoiles={fluxP?.note}>{fluxP ? `${nb(fluxP.par_heure?.basse?.min)} à ${nb(fluxP.par_heure?.haute?.max)} piétons / h` : "—"}</Etiquette>
            <Etiquette label="Flux voiture" etoiles={fluxV?.note && !fluxV.indisponible ? fluxV.note : null}>{fluxV?.indisponible ? "non calculé" : fluxV ? "" : "—"}</Etiquette>
          </Bloc>
        </div>
      </Panel>

      <Panel titre="Sources et responsabilités">
        <Bloc className="text-[12.5px] leading-[1.7] text-ardoise">
          <p className="m-0"><strong className="text-encre">Sources.</strong> La rue et le tronçon numéro par numéro viennent du registre Sirene de l&apos;INSEE ; la longueur et la classe de la rue, et les générateurs de flux, d&apos;OpenStreetMap. Les zones de chalandise sont des isochrones à pied de l&apos;IGN (5, 10, 15 minutes), lues en carreaux Filosofi de 200 m et en IRIS du recensement. Le plan et la vue de la rue viennent de Google.</p>
          <p className="m-0 mt-3"><strong className="text-encre">Nature des résultats.</strong> Un outil d&apos;aide à la décision, daté du jour de sa génération. Les flux piéton et voiture sont une estimation de Klocka à partir de la commercialité, des habitants, des établissements et des transports : pas un comptage sur site. Ce qu&apos;aucune source ne donne n&apos;est pas affiché.</p>
        </Bloc>
      </Panel>
      </div>
    </div>
  );
}

// ── L'écran d'arrivée ──────────────────────────────────────────────────────

// L'écran d'arrivée (10 nov. 2026, Jules : écran d'arrivée) : le titre au style du cadre des Outils, le lancement
// sur une ligne, une carte par étude qui tourne, puis les rapports en grille de trois. À droite, ce que contient
// le rapport, chapitre par chapitre. Le rapport imprimé, lui, ne change pas.

const CHAPITRES = [
  ["Le quartier", "Revenus, CSP, population, entreprises."],
  ["L'emplacement", "PLU, transports."],
  ["Les flux", "Indice sur 100, générateurs de flux."],
  ["La rue", "Commerces et ancienneté."],
  ["Le tronçon", "Côté pair et côté impair."],
  ["Les zones de chalandise", "Résidents, ménages et revenus à 5, 10 et 15 minutes à pied."],
];

// « jules@klocka.immo » devient « Jules ».
const PAR = (email) => {
  const n = email ? String(email).split("@")[0] : "";
  return n ? n.charAt(0).toUpperCase() + n.slice(1) : "";
};
const minuscule = (s) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : "");
const CHAMP = "h-10 w-full rounded-[8px] border border-bord-doux bg-fond px-3 text-[14px] text-encre outline-none placeholder:text-brume focus:border-menthe max-md:text-[16px]";

/** Une étude qui tourne : l'adresse, la barre, le pourcentage et l'étape du moment. */
function EnCours({ expertise: x }) {
  const avance = x.progression || 0;
  return (
    <div className={`${CLASSE_CARTE} flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3`}>
      <span className="min-w-0 truncate text-[14px] font-medium text-encre">
        {x.libelle || x.adresse}{x.activite && <span className="font-normal text-ardoise"> · {minuscule(x.activite)}</span>}
      </span>
      <span className="h-1 min-w-[120px] flex-[1_1_200px] overflow-hidden rounded-full bg-relief">
        <span className="block h-full rounded-full bg-menthe transition-[width] duration-700" style={{ width: `${Math.max(4, avance)}%` }} />
      </span>
      <span className="text-[12.5px] tabular-nums text-craie">{avance} %{x.etape ? ` · ${x.etape}` : ""}</span>
    </div>
  );
}

/** Un rapport : l'icône et l'état en tête, l'adresse, puis l'indice en grand. Échoué : « À relancer ». */
function CarteRapport({ expertise: x, onClick }) {
  const echec = x.etat === "echec";
  return (
    <button type="button" onClick={onClick}
      className={`${CLASSE_CARTE} !bg-rail flex min-h-[195px] w-full flex-col p-4 text-left transition-colors hover:border-bord-doux`}>
      <span className="flex w-full items-center justify-between gap-2">
        <FileText className="h-4 w-4 text-ardoise" />
        <Statut>{echec ? "Échouée" : "Terminée"}</Statut>
      </span>
      <span className="mt-4 block w-full truncate text-[14px] font-medium text-encre" title={x.libelle || x.adresse}>{x.libelle || x.adresse}</span>
      <span className="mt-0.5 block w-full truncate text-[12.5px] text-ardoise">{x.activite}</span>
      <span className="mt-auto block pt-6 text-[20px] font-medium tabular-nums text-encre">{echec ? "À relancer" : x.indice != null ? `${x.indice} / 100` : "Sans indice"}</span>
      <span className="mt-0.5 block text-[12.5px] text-ardoise">{[echec ? null : "Indice d'emplacement", PAR(x.par), quand(x.fini_le || x.cree_le)].filter(Boolean).join(" · ")}</span>
    </button>
  );
}

export default function KExpertise() {
  const user = useUser();
  const qc = useQueryClient();
  const [activite, setActivite] = useState("");
  const [adresse, setAdresse] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  // L'adresse retenue dans la liste : le champ la contient, on ne repropose rien.
  const choisie = useRef("");
  const [ouverte, setOuverte] = useState(null);
  const [filtre, setFiltre] = useState("tous");
  const [mecanique, setMecanique] = useState(false);

  // La liste se relit tant qu'une étude tourne : les cartes « En cours » avancent seules.
  const { data } = useQuery({
    queryKey: ["kexpertise"],
    queryFn: () => base44.request("GET", "/api/kexpertise"),
    enabled: user?.role === "admin",
    refetchInterval: (q) => ((q.state.data?.expertises || []).some((x) => x.etat === "en_cours") ? 2500 : false),
  });
  const expertises = data?.expertises || [];

  // L'expertise ouverte se relit toutes les deux secondes tant qu'elle avance.
  const { data: detail } = useQuery({
    queryKey: ["kexpertise", ouverte],
    queryFn: () => base44.request("GET", `/api/kexpertise/${ouverte}`),
    enabled: !!ouverte,
    refetchInterval: (q) => (q.state.data?.expertise?.etat === "en_cours" ? 2000 : false),
  });
  const e = detail?.expertise;
  useEffect(() => {
    if (e && e.etat !== "en_cours") qc.invalidateQueries({ queryKey: ["kexpertise"] });
  }, [e?.etat, qc]);

  useEffect(() => {
    const q = adresse.trim();
    if (q.length < 3 || q === choisie.current) { setSuggestions([]); return; }
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`https://data.geopf.fr/geocodage/search/?autocomplete=1&limit=5&q=${encodeURIComponent(q)}`);
        const f = r.ok ? (await r.json()).features || [] : [];
        setSuggestions(f.map((x) => x.properties?.label).filter(Boolean));
      } catch { /* BAN injoignable */ }
    }, 250);
    return () => clearTimeout(t);
  }, [adresse]);

  // Lancer prend l'adresse et l'activité en paramètre : le formulaire, ou une carte échouée qu'on relance telle quelle.
  const lancer = useMutation({
    mutationFn: (v) => base44.request("POST", "/api/kexpertise", { body: v }),
    onSuccess: (r) => { setOuverte(r.id); setSuggestions([]); qc.invalidateQueries({ queryKey: ["kexpertise"] }); },
    onError: (err) => toast.error(err?.message || "Lancement impossible"),
  });
  const supprimer = useMutation({
    mutationFn: (id) => base44.request("DELETE", `/api/kexpertise/${id}`),
    onSuccess: () => { setOuverte(null); qc.invalidateQueries({ queryKey: ["kexpertise"] }); },
  });

  const dejaEnBase = useMemo(() => expertises.find((x) => x.etat === "terminee" && x.adresse.trim().toLowerCase() === adresse.trim().toLowerCase()), [expertises, adresse]);

  // Les études qui tournent ont leurs cartes ; la grille ne garde que les rapports, tous ou les miens.
  const enCours = expertises.filter((x) => x.etat === "en_cours");
  const rapports = expertises.filter((x) => x.etat !== "en_cours");
  const visibles = filtre === "miens" ? rapports.filter((x) => x.par && x.par === user?.email) : rapports;

  // Ouverte depuis la file de K-Data : « ?id=… » désigne l'expertise à lire.
  const { search } = useLocation();
  const vuUrl = useRef("");
  useEffect(() => {
    if (vuUrl.current === search) return;
    const id = new URLSearchParams(search).get("id");
    if (!id) return;
    vuUrl.current = search;
    setOuverte(id);
  }, [search]);

  if (!user || user.role !== "admin") return null;

  // Le rapport ne change pas : c'est le document imprimé en PDF.
  if (ouverte && e && e.etat !== "en_cours" && e.etat !== "echec") {
    return <div className="min-h-screen py-[22px]"><Rapport expertise={e} user={user} onRetour={() => setOuverte(null)} onSupprimer={() => { if (window.confirm("Supprimer cette expertise ?")) supprimer.mutate(e.id); }} /></div>;
  }

  const lancerSiPret = (ev) => { ev.preventDefault(); if (!lancer.isPending && adresse.trim().length >= 5) lancer.mutate({ adresse, activite }); };
  const relancer = (x) => { if (!lancer.isPending) lancer.mutate({ adresse: x.adresse, activite: x.activite }); };

  return (
    <div className="px-10 pb-12 pt-6 text-encre max-md:px-4 max-md:pt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="m-0 text-[20px] font-medium text-encre">K-Expertise{expertises.length ? <span className="ml-2 text-[14px] font-normal tabular-nums text-ardoise">{expertises.length}</span> : null}</h1>
        <button type="button" onClick={() => setMecanique((o) => !o)} aria-expanded={mecanique} style={TRANSPARENT}
          className="inline-flex h-8 items-center rounded-[8px] border border-bord-doux px-3 text-[13.5px] text-craie hover:border-bord-vif hover:text-encre">D&apos;où viennent les chiffres</button>
      </div>
      <p className="m-0 mt-1 text-[13.5px] text-ardoise">L&apos;étude d&apos;implantation d&apos;une adresse, rendue en un rapport.</p>
      {mecanique && <MecaniqueEnLigne etapes={ETAPES_MECANIQUE} titre="La mécanique : d'où viennent ces chiffres" className="mt-4" ouvertDepart />}

      <div className="mt-5 grid gap-8 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="flex min-w-0 flex-col">
          {/* Le lancement tient sur une ligne. */}
          <form onSubmit={lancerSiPret} className={`${CLASSE_CARTE} p-4`}>
            <div className="flex flex-wrap items-end gap-2.5">
              <label className="flex min-w-0 flex-[1_1_220px] flex-col gap-1.5 text-[12.5px] text-ardoise">Type de commerce
                <input value={activite} onChange={(ev) => setActivite(ev.target.value)} placeholder="Boulangerie, restaurant… ou vide pour tous" className={CHAMP} />
              </label>
              <div className="relative flex min-w-0 flex-[1.7_1_320px] flex-col gap-1.5">
                <label htmlFor="kexpertise-adresse" className="text-[12.5px] text-ardoise">Adresse précise</label>
                <input id="kexpertise-adresse" value={adresse} onChange={(ev) => setAdresse(ev.target.value)} placeholder="48 rue Basfroi, 75011 Paris" autoComplete="off" className={CHAMP} />
                {suggestions.length > 0 && (
                  <ul className="absolute left-0 right-0 top-full z-20 m-0 mt-1 list-none overflow-hidden rounded-[12px] border border-bord bg-surface-pleine p-0 shadow-[0_18px_40px_rgb(0_0_0/0.18)]">
                    {suggestions.map((s) => <li key={s}><button type="button" style={TRANSPARENT} onClick={() => { choisie.current = s; setAdresse(s); setSuggestions([]); }} className="block w-full px-3 py-2 text-left text-[13.5px] text-craie hover:!bg-relief hover:text-encre">{s}</button></li>)}
                  </ul>
                )}
              </div>
              <BoutonPrincipal type="submit" disabled={lancer.isPending || adresse.trim().length < 5} className="!h-10 !rounded-[8px] !px-4">
                {lancer.isPending && <Loader2 className="h-4 w-4 animate-spin" />}Lancer l&apos;expertise
              </BoutonPrincipal>
            </div>
          </form>
          <p className="m-0 mt-2 text-[12.5px] text-ardoise">
            {dejaEnBase ? "Cette adresse a déjà une expertise terminée : la relancer reprend l'étude en base si elle a moins de trente jours."
              : "Une même adresse et une même activité, dans les trente jours, reprennent l'étude en base."}
          </p>

          {/* L'échec d'une étude qu'on vient de lancer : une ligne, avec son message. */}
          {ouverte && e?.etat === "echec" && (
            <div className={`${CLASSE_CARTE} mt-4 flex flex-wrap items-center gap-x-3.5 gap-y-2 px-4 py-3`}>
              <AlertTriangle className="h-4 w-4 flex-none text-alerte" />
              <span className="min-w-0 flex-1 text-[14px] text-alerte">{e.erreur || "L'expertise n'a pas abouti."}</span>
              <span className="text-[13px] text-ardoise">{e.libelle || e.adresse}</span>
              <BoutonOutil onClick={() => setOuverte(null)}>Fermer</BoutonOutil>
            </div>
          )}

          {enCours.length > 0 && (
            <section aria-labelledby="t-en-cours" className="mt-6 flex flex-col gap-2.5">
              <h2 id="t-en-cours" className="m-0 text-[15px] font-medium text-encre">En cours<span className="ml-2 text-[13px] font-normal tabular-nums text-ardoise">{enCours.length}</span></h2>
              {enCours.map((x) => <EnCours key={x.id} expertise={x} />)}
            </section>
          )}

          <section aria-labelledby="t-rapports" className="mt-6 flex flex-col gap-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <h2 id="t-rapports" className="m-0 text-[15px] font-medium text-encre">Rapports{rapports.length ? <span className="ml-2 text-[13px] font-normal tabular-nums text-ardoise">{rapports.length}</span> : null}</h2>
              <Filtres label="Filtres des rapports" valeur={filtre} onChange={setFiltre} options={[["tous", "Tous"], ["miens", "Les miens"]]} />
            </div>
            {!visibles.length ? <p className="m-0 text-[13.5px] text-brume">{rapports.length ? "Aucun dans ce filtre." : "Aucun rapport pour l'instant."}</p> : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {visibles.map((x) => <CarteRapport key={x.id} expertise={x} onClick={() => (x.etat === "echec" ? relancer(x) : setOuverte(x.id))} />)}
              </div>
            )}
          </section>
        </div>

        {/* Ce que contient le rapport, chapitre par chapitre. */}
        <aside aria-labelledby="t-chapitres" className="min-w-0">
          <h2 id="t-chapitres" className="m-0 mb-3 text-[14px] font-medium text-encre">Le rapport, chapitre par chapitre</h2>
          <ol className="m-0 list-none border-t border-trait p-0">
            {CHAPITRES.map(([titre, detail], i) => (
              <li key={titre} className="flex gap-4 border-b border-trait py-2.5">
                <span className="w-3 flex-none text-[12.5px] tabular-nums text-menthe-texte">{i + 1}</span>
                <span className="min-w-0">
                  <span className="block text-[14px] text-encre">{titre}</span>
                  <span className="block text-[12.5px] leading-[1.45] text-ardoise">{detail}</span>
                </span>
              </li>
            ))}
          </ol>
          <p className="m-0 mt-3 text-[12.5px] leading-[1.55] text-ardoise">Sources : Sirene, OpenStreetMap, IGN, INSEE. Le rapport s&apos;imprime tel quel en PDF.</p>
        </aside>
      </div>
    </div>
  );
}
