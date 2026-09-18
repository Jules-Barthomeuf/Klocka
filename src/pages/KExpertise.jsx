import React, { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, Play, Loader2, ChevronLeft, Trash2, Printer, X, Check, AlertTriangle, Clock } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useUser } from "@/components/providers/UserProvider";
import { toast } from "@/components/ui/avis";
import { Etoiles } from "@/components/alx/alx-commun";

// K-Expertise : l'étude d'implantation d'une adresse.
//
// Trois écrans. Le formulaire, avec les expertises déjà faites en dessous.
// Le chargement, une barre qui avance étape par étape — une étude prend
// plusieurs minutes, Data-B calcule ses flux à la demande. Puis le rapport,
// dans le verre de Klocka : les mêmes panneaux translucides que le panneau
// l'habit des six cartes du tableau de bord K-Data — bg-surface, filet trait,
// rayon de 18, sans flou — et non le bleu et l'orange du PDF Data-B : Klocka a
// son propre habillage, et le garde même quand la donnée vient d'ailleurs.
//
// Le PDF, c'est l'impression du navigateur : la feuille @media print
// d'index.css ne garde que le rapport et repasse la palette en clair. Le PDF
// n'est donc jamais qu'une autre vue du même rapport, avec son texte
// sélectionnable, et jamais un document à part qui pourrait en diverger.
//
// UNE ÉTUDE CONSOMME UN CRÉDIT DATA-B, sauf si la même adresse et la même
// activité ont été étudiées dans les trente jours : l'écran le dit avant de
// lancer, et le dit après.

const CLE_MAPS = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";

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
      <span className="w-[190px] flex-shrink-0 text-[11.5px] uppercase tracking-[.06em] text-ardoise">{label}</span>
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
    <div className={`flex items-baseline justify-between border-b border-trait py-1.5 text-[13px] ${sous ? "pl-4" : ""}`}>
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
  const d = r.data_b || null;
  const p = r.point;
  const zones = r.zones || [];
  const fluxP = d?.flux_pieton;
  const fluxV = d?.flux_voiture;
  const rue = d?.rue;
  const troncon = d?.troncon;
  const numeros = d?.commerces_troncon?.numeros || [];
  const pair = numeros.filter((n) => n.cote === "pair");
  const impair = numeros.filter((n) => n.cote === "impair");
  const totalZones = (cle, sous = null) => zones.reduce((s, z) => s + (sous ? z.insee?.[cle]?.[sous] ?? 0 : z.insee?.[cle] ?? 0), 0);

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
              <Ligne label="Rayon">{z.rayon_m} m · {i.carreaux} carreaux INSEE</Ligne>
            </Bloc>
          </div>
        )}
        <Sources>INSEE Filosofi, carreaux de 200 m. Rayon de {z.rayon_m} m, l&apos;équivalent de {z.marche}.</Sources>
      </Panel>
    );
  };

  return (
    <div className="k-impression mx-auto max-w-[1100px] px-4 pb-20">
      {/* La barre d'actions ne s'imprime pas : k-sans-impression la retire. */}
      <div className="k-sans-impression mb-6 flex flex-wrap items-center justify-between gap-3">
        <button onClick={onRetour} className="inline-flex items-center gap-1.5 text-[12px] text-ardoise hover:text-encre"><ChevronLeft className="h-4 w-4" />Toutes les expertises</button>
        <div className="flex items-center gap-4">
          <button onClick={voirPdf}
            className="inline-flex h-9 items-center gap-2 rounded-full border border-menthe/40 bg-menthe/10 px-4 text-[12px] font-medium uppercase tracking-[.08em] text-menthe-texte hover:bg-menthe/20">
            <Printer className="h-3.5 w-3.5" />Voir en PDF
          </button>
          <button onClick={onSupprimer} className="inline-flex items-center gap-1.5 text-[12px] text-brume hover:text-alerte"><Trash2 className="h-3.5 w-3.5" />Supprimer</button>
        </div>
      </div>

      {/* Un seul fond de verre derrière tout le rapport — le même que les
          panneaux de K-Zoning — plutôt qu'une carte par section, qui donnait
          des blocs flottants sans lien entre eux. */}
      <div className="rounded-[18px] border border-trait bg-surface p-7 max-md:p-4">
      {/* La couverture */}
        <section className="pb-2 text-center">
        <p className="alx-mont m-0 inline-block rounded-full border border-menthe/30 bg-menthe/10 px-4 py-1 text-[11px] uppercase tracking-[.2em] text-menthe-texte">Rapport d&apos;implantation</p>
        <h1 className="mt-3 mb-0 text-[32px] font-light tracking-[-0.01em] text-encre">Étude d&apos;expertise</h1>
        <div className="mx-auto my-4 h-px w-28 bg-menthe/40" />
        <p className="m-0 text-[21px] font-medium text-encre">{p?.libelle || e.adresse}</p>
        <p className="m-0 mt-1 text-[13px] text-ardoise">{e.activite}</p>
        <p className="m-0 mt-4 text-[13px] text-encre">Étude préparée par <strong>{e.par || user?.full_name || user?.email}</strong></p>
        <p className="m-0 mt-1 text-[11.5px] text-brume">Document généré par K-Data le {quand(e.fini_le || e.cree_le)}{r.sources?.length ? ` · sources : ${r.sources.join(", ")}` : ""}</p>
        {d?.du_cache && <p className="m-0 mt-2 text-[11.5px] text-menthe-texte">Étude Data-B reprise de la base, aucun crédit dépensé.</p>}
        {r.data_b_erreur && <p className="m-0 mt-2 inline-flex items-center gap-1.5 text-[12px] text-alerte"><AlertTriangle className="h-3.5 w-3.5" />Data-B : {r.data_b_erreur}</p>}
      </section>

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
          <Sources>Data-B, INSEE RGP, SIRENE</Sources>
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
                    <span className="flex-shrink-0 text-[11px] uppercase text-ardoise">{g.adresse || ""}</span>
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
          <Sources>Data-B. Estimation algorithmique, pas un comptage sur site.</Sources>
        </Panel>
      )}

      {/* Flux voiture */}
      {fluxV && (
        <Panel titre="Estimation du flux voiture dans la zone">
          <Bloc className="text-center">
            <p className="alx-mont m-0 text-[10.5px] uppercase tracking-[.14em] text-ardoise">Densité du flux</p>
            {fluxV.indisponible ? <p className="m-0 mt-2 text-[12.5px] text-ardoise">Data-B ne l&apos;a pas calculée à cette adresse.</p>
              : <div className="mt-2 inline-block rounded-[8px] bg-relief px-6 py-2"><Etoiles note={fluxV.note?.note ?? 0} sur={fluxV.note?.sur ?? 5} taille={24} /></div>}
          </Bloc>
          <Sources>Data-B</Sources>
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
            <Etiquette label="Commercialité de la rue">{rue.commerces} commerces</Etiquette>
          </Bloc>
          <Sources>Data-B, SIRENE, OpenStreetMap</Sources>
        </Panel>
      )}

      {/* Le tronçon */}
      {troncon && (
        <Panel titre="Présentation du tronçon de rue">
          <Bloc><Etiquette label="Commercialité du tronçon" etoiles={troncon.note}>{troncon.libelle}</Etiquette></Bloc>
          <Sources>Data-B, SIRENE</Sources>
        </Panel>
      )}
      {numeros.length > 0 && (
        <Panel titre="Activité commerciale du tronçon de rue">
          <div className="grid grid-cols-[1fr_20px_1fr] gap-3">
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
          <Sources>Data-B, SIRENE, INPI</Sources>
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
                <th className="alx-mont px-3 py-2 text-[10.5px] uppercase tracking-[.12em] text-menthe-texte">Total</th>
              </tr></thead>
              <tbody>
                {[["Population", "population", "habitants"], ["Ménages", "menages", "menages"], ["Ménages pauvres", "revenus", "menages_pauvres"]].map(([label, k, s]) => (
                  <tr key={label} className="border-b border-trait"><td className="px-3 py-1.5 font-medium text-encre">{label}</td>
                    {zones.map((z) => <td key={z.cle} className="px-3 py-1.5 tabular-nums text-encre">{nb(z.insee?.[k]?.[s])}</td>)}
                    <td className="px-3 py-1.5 font-semibold tabular-nums text-menthe-texte">{nb(totalZones(k, s))}</td></tr>
                ))}
                <tr className="border-b border-trait"><td className="px-3 py-1.5 font-medium text-encre">Niveau de vie moyen</td>
                  {zones.map((z) => <td key={z.cle} className="px-3 py-1.5 tabular-nums text-encre">{euros(z.insee?.revenus?.niveau_de_vie_moyen)}</td>)}<td /></tr>
              </tbody>
            </table>
          </Bloc>
          <Sources>INSEE Filosofi. Les zones s&apos;emboîtent : le total additionne trois rayons, pas trois couronnes.</Sources>
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
          <Sources>Data-B, INSEE RGP</Sources>
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
          <Sources>Data-B, INSEE RGP</Sources>
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
          <p className="m-0"><strong className="text-encre">Sources.</strong> Les flux piéton et voiture, la rue et le tronçon numéro par numéro, la démographie et le revenu du quartier viennent de l&apos;étude d&apos;implantation Data-B, lancée depuis Klocka. Les générateurs de flux viennent d&apos;OpenStreetMap. Les zones de chalandise viennent de l&apos;INSEE (Filosofi, carreaux de 200 m), sur trois rayons de 400, 800 et 1 200 m et non sur des isochrones. Le plan et la vue de la rue viennent de Google.</p>
          <p className="m-0 mt-3"><strong className="text-encre">Nature des résultats.</strong> Un outil d&apos;aide à la décision, daté du jour de sa génération. Le flux piéton est une estimation algorithmique, pas un comptage sur site. Ce qu&apos;aucune source ne donne n&apos;est pas affiché.</p>
        </Bloc>
      </Panel>
      </div>
    </div>
  );
}

// ── Le chargement ──────────────────────────────────────────────────────────

function Chargement({ expertise: e }) {
  const etapes = e?.etapes || [];
  return (
    <div className="mx-auto max-w-[620px] px-4 pt-16 text-center">
      <p className="alx-mont m-0 text-[11px] uppercase tracking-[.2em] text-menthe-texte">Expertise en cours</p>
      <h2 className="mt-2 mb-1 text-[24px] font-light text-encre">{e?.libelle || e?.adresse}</h2>
      <p className="m-0 text-[13px] text-ardoise">{e?.activite}</p>
      <div className="mx-auto mt-8 h-3 w-full overflow-hidden rounded-full bg-relief">
        <div className="h-full rounded-full bg-menthe transition-[width] duration-700" style={{ width: `${Math.max(4, e?.progression || 0)}%` }} />
      </div>
      <p className="m-0 mt-2 text-[12px] tabular-nums text-brume">{e?.progression || 0} %</p>
      <ul className="mx-auto mt-8 m-0 max-w-[460px] list-none space-y-2 p-0 text-left">
        {etapes.map((s) => (
          <li key={s.cle} className="flex items-start gap-3 text-[13px]">
            <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border border-bord">
              {s.etat === "faite" ? <Check className="h-3 w-3 text-vert" /> : s.etat === "ratee" ? <X className="h-3 w-3 text-alerte" /> : s.etat === "en_cours" ? <Loader2 className="h-3 w-3 animate-spin text-menthe" /> : <Clock className="h-3 w-3 text-brume" />}
            </span>
            <span className="min-w-0">
              <span className={`block ${s.etat === "a_faire" ? "text-brume" : "text-encre"}`}>{s.nom}</span>
              {s.detail && <span className="block text-[11.5px] text-ardoise">{s.detail}</span>}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-8 mb-0 text-[11.5px] leading-[1.6] text-brume">Data-B calcule ses flux à la demande : comptez plusieurs minutes. Vous pouvez quitter cette page, l&apos;expertise continue et vous attendra dans la liste.</p>
    </div>
  );
}

// ── La page ────────────────────────────────────────────────────────────────

export default function KExpertise() {
  const user = useUser();
  const qc = useQueryClient();
  const [activite, setActivite] = useState("");
  const [adresse, setAdresse] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [ouverte, setOuverte] = useState(null);

  const { data } = useQuery({ queryKey: ["kexpertise"], queryFn: () => base44.request("GET", "/api/kexpertise"), enabled: user?.role === "admin" });
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
    if (q.length < 3) { setSuggestions([]); return; }
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`https://api-adresse.data.gouv.fr/search/?autocomplete=1&limit=5&q=${encodeURIComponent(q)}`);
        const f = r.ok ? (await r.json()).features || [] : [];
        setSuggestions(f.map((x) => x.properties?.label).filter(Boolean));
      } catch { /* BAN injoignable */ }
    }, 250);
    return () => clearTimeout(t);
  }, [adresse]);

  const lancer = useMutation({
    mutationFn: () => base44.request("POST", "/api/kexpertise", { body: { adresse, activite } }),
    onSuccess: (r) => { setOuverte(r.id); setSuggestions([]); qc.invalidateQueries({ queryKey: ["kexpertise"] }); },
    onError: (err) => toast.error(err?.message || "Lancement impossible"),
  });
  const supprimer = useMutation({
    mutationFn: (id) => base44.request("DELETE", `/api/kexpertise/${id}`),
    onSuccess: () => { setOuverte(null); qc.invalidateQueries({ queryKey: ["kexpertise"] }); },
  });

  const dejaEnBase = useMemo(() => expertises.find((x) => x.etat === "terminee" && x.adresse.trim().toLowerCase() === adresse.trim().toLowerCase()), [expertises, adresse]);

  if (!user || user.role !== "admin") return null;

  if (ouverte && e) {
    if (e.etat === "en_cours") return <div className="min-h-screen pt-2"><Chargement expertise={e} /></div>;
    if (e.etat === "echec") return (
      <div className="mx-auto max-w-[620px] px-4 pt-16 text-center">
        <p className="m-0 text-[15px] text-alerte">{e.erreur || "L'expertise n'a pas abouti."}</p>
        <button onClick={() => setOuverte(null)} className="mt-6 text-[12.5px] text-ardoise hover:text-encre">Revenir</button>
      </div>
    );
    return <div className="min-h-screen pt-6"><Rapport expertise={e} user={user} onRetour={() => setOuverte(null)} onSupprimer={() => { if (window.confirm("Supprimer cette expertise ?")) supprimer.mutate(e.id); }} /></div>;
  }

  return (
    <div className="mx-auto max-w-[900px] px-4 pb-20 pt-10">
      <p className="alx-mont m-0 text-[11px] uppercase tracking-[.2em] text-menthe-texte">K-Expertise</p>
      <h1 className="mt-2 mb-6 text-[30px] font-light tracking-[-0.01em] text-encre">Étude d&apos;implantation d&apos;une adresse</h1>

      <div className="rounded-[18px] border border-trait bg-surface p-5">
        <label className="alx-mont mb-1.5 block text-[10.5px] uppercase tracking-[.14em] text-brume">Type de commerce</label>
        <input value={activite} onChange={(ev) => setActivite(ev.target.value)} placeholder="Boulangerie, restaurant, opticien… ou vide pour tous les commerces"
          className="mb-4 h-11 w-full rounded-[10px] border border-bord bg-surface px-3 text-[14px] text-encre outline-none placeholder:text-brume focus:border-menthe" />
        <label className="alx-mont mb-1.5 block text-[10.5px] uppercase tracking-[.14em] text-brume">Adresse précise</label>
        <div className="relative">
          <div className="flex items-center gap-2 rounded-[10px] border border-bord bg-surface px-3 focus-within:border-menthe">
            <Search className="h-4 w-4 flex-shrink-0 text-brume" />
            <input value={adresse} onChange={(ev) => setAdresse(ev.target.value)} placeholder="48 rue Basfroi, 75011 Paris"
              className="h-11 w-full bg-transparent text-[14px] text-encre outline-none placeholder:text-brume" />
          </div>
          {suggestions.length > 0 && (
            <ul className="absolute left-0 right-0 top-[48px] z-20 m-0 list-none overflow-hidden rounded-[10px] border border-bord bg-fond p-0 shadow-[0_18px_40px_rgba(0,0,0,0.35)]">
              {suggestions.map((s) => <li key={s}><button onClick={() => { setAdresse(s); setSuggestions([]); }} className="block w-full px-3 py-2 text-left text-[13px] text-craie hover:bg-relief hover:text-encre">{s}</button></li>)}
            </ul>
          )}
        </div>
        <p className="mt-3 mb-0 text-[11.5px] leading-[1.6] text-brume">
          {dejaEnBase ? "Cette adresse a déjà une expertise terminée : la relancer ne dépensera pas de crédit Data-B si elle a moins de trente jours."
            : "Une expertise lance une étude Data-B, qui consomme un crédit. Une même adresse et une même activité, dans les trente jours, n'en consomment pas de second."}
        </p>
        <button onClick={() => lancer.mutate()} disabled={lancer.isPending || adresse.trim().length < 5}
          className="mt-4 inline-flex h-11 items-center gap-2 rounded-full bg-menthe px-6 text-[12.5px] font-medium uppercase tracking-[.12em] text-sur-menthe disabled:opacity-50">
          {lancer.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}Lancer l&apos;expertise
        </button>
      </div>

      <h2 className="mt-10 mb-3 text-[17px] font-medium text-encre">Expertises réalisées</h2>
      {!expertises.length ? <p className="m-0 text-[13px] text-brume">Aucune pour l&apos;instant.</p> : (
        <ul className="m-0 list-none p-0">
          {expertises.map((x) => (
            <li key={x.id}>
              <button onClick={() => setOuverte(x.id)} className="flex w-full items-center gap-4 border-b border-trait py-3 text-left hover:bg-surface">
                <span className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${x.etat === "terminee" ? "bg-vert" : x.etat === "echec" ? "bg-alerte" : "bg-menthe animate-pulse"}`} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-medium text-encre">{x.libelle || x.adresse}</span>
                  <span className="block text-[11.5px] text-brume">{x.activite} · {x.etat === "en_cours" ? `${x.progression} %` : quand(x.fini_le || x.cree_le)}{x.par ? ` · ${x.par}` : ""}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
