import React, { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, Play, Loader2, ChevronLeft, Trash2, Star, X, Check, AlertTriangle, Clock } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useUser } from "@/components/providers/UserProvider";
import { toast } from "@/components/ui/avis";

// K-Expertise : l'étude d'implantation d'une adresse.
//
// Trois écrans. Le formulaire, avec les expertises déjà faites en dessous.
// Le chargement, une barre qui avance étape par étape — une étude prend
// plusieurs minutes, Data-B calcule ses flux à la demande. Puis le rapport,
// dans la structure et les couleurs du rapport Data-B : un bandeau bleu
// profond à bouchon orange par section, des étiquettes orange, des étoiles.
//
// UNE ÉTUDE CONSOMME UN CRÉDIT DATA-B, sauf si la même adresse et la même
// activité ont été étudiées dans les trente jours : l'écran le dit avant de
// lancer, et le dit après.

const CLE_MAPS = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";

const nb = (n) => (n == null ? "—" : Math.round(n).toLocaleString("fr-FR"));
const euros = (n) => (n == null ? "—" : `${Math.round(n).toLocaleString("fr-FR")} €`);
const pct = (n, signe = false) => (n == null ? "—" : `${signe && n > 0 ? "+" : ""}${String(n).replace(".", ",")} %`);
const quand = (iso) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "");

// ── Les briques du rapport ─────────────────────────────────────────────────

/** Le bandeau d'une section : bleu profond, bouchon orange à droite. */
function Bandeau({ children }) {
  return (
    <div className="relative mb-4 overflow-hidden rounded-full bg-rapport-bleu py-2.5 text-center text-[15px] font-semibold text-rapport-sur-bleu">
      {children}
      <span className="absolute inset-y-0 right-0 w-8 bg-rapport-orange" />
    </div>
  );
}

/** Une carte blanche du rapport. */
function Carte({ children, className = "" }) {
  return <div className={`rounded-[14px] border border-bord bg-surface-pleine p-4 ${className}`}>{children}</div>;
}

/** Étiquette orange + valeur, comme les lignes « Commercialité » du rapport. */
function Etiquette({ label, children, etoiles = null }) {
  return (
    <div className="mb-1.5 flex items-stretch gap-0 overflow-hidden rounded-[6px] text-[13px]">
      <span className="w-[190px] flex-shrink-0 bg-rapport-orange px-3 py-1.5 font-semibold text-rapport-sur-bleu">{label}</span>
      <span className="flex-1 bg-rapport-orange/10 px-3 py-1.5 text-encre">{children}</span>
      {etoiles && <span className="flex items-center px-3"><Etoiles note={etoiles.note} sur={etoiles.sur} /></span>}
    </div>
  );
}

function Etoiles({ note, sur = 5, taille = "h-4 w-4" }) {
  return (
    <span className="inline-flex gap-0.5" aria-label={`${note} sur ${sur}`}>
      {Array.from({ length: sur }).map((_, i) => (
        <Star key={i} className={`${taille} ${i < note ? "fill-rapport-orange text-rapport-orange" : "text-bord-vif"}`} />
      ))}
    </span>
  );
}

/** Le grand chiffre à en-tête bleu, avec ses évolutions dessous. */
function Compteur({ titre, valeur, evolutions = null }) {
  return (
    <div className="overflow-hidden rounded-[12px] border border-bord">
      <p className="m-0 bg-surface px-3 py-1.5 text-center text-[12px] font-medium text-ardoise">{titre}</p>
      <p className="m-0 bg-rapport-bleu py-2.5 text-center text-[22px] font-semibold tabular-nums text-rapport-sur-bleu">{valeur}</p>
      {evolutions && (
        <div className="bg-surface-pleine px-3 py-2 text-[11.5px]">
          {Object.entries(evolutions).map(([k, v]) => (
            <div key={k} className="flex items-center justify-between py-0.5">
              <span className="text-ardoise">{k}</span>
              <span className={`rounded-full px-2 py-0.5 font-medium ${v > 0 ? "bg-vert/20 text-vert" : v < 0 ? "bg-alerte/20 text-alerte" : "bg-relief text-encre"}`}>{pct(v, true)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Une ligne « intitulé  valeur » d'un tableau du rapport. */
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

  const Numero = ({ n }) => (
    <div className="mb-2 overflow-hidden rounded-[10px] border border-bord bg-surface-pleine">
      <div className="flex items-center justify-between border-b border-trait px-3 py-1.5">
        <span className="text-[13px] font-semibold text-rapport-bleu">N°{n.numero}</span>
        <span className="alx-mont text-[10px] uppercase tracking-[.12em] text-ardoise">
          {n.habitation ? "Habitation" : n.entreprise ? "Entreprise" : `${n.commerces.length} commerce${n.commerces.length > 1 ? "s" : ""}`}
        </span>
      </div>
      {n.commerces?.map((c, i) => (
        <div key={i} className="flex items-center gap-2.5 px-3 py-1.5">
          <span className="h-2 w-2 flex-shrink-0 rounded-full bg-rapport-orange" />
          <span className="min-w-0">
            <span className="block text-[11px] text-ardoise">{c.activite}</span>
            <span className="block truncate text-[12.5px] font-semibold text-encre">{c.enseigne}</span>
          </span>
        </div>
      ))}
    </div>
  );

  const ZoneCarte = ({ z }) => {
    const i = z.insee;
    return (
      <section className="mb-6">
        <Bandeau>{z.nom} à {z.marche}</Bandeau>
        {!i ? <p className="m-0 text-[12.5px] text-alerte">{z.erreur || "Zone non lue."}</p> : (
          <div className="grid gap-4 md:grid-cols-2">
            <Carte>
              <p className="alx-mont m-0 mb-2 rounded-t-[8px] bg-rapport-bleu px-3 py-1.5 text-[11px] uppercase tracking-[.12em] text-rapport-sur-bleu">Résidents</p>
              <Ligne label="Population">{nb(i.population.habitants)}</Ligne>
              <Ligne label="0-17 ans" sous>{pct(i.population.ages["0-17 ans"])}</Ligne>
              <Ligne label="65 ans et plus" sous>{pct(i.population.part_65_plus)}</Ligne>
              <Ligne label="Ménages">{nb(i.menages.menages)}</Ligne>
              <Ligne label="Personnes seules">{pct(i.menages.part_une_personne)}</Ligne>
              <Ligne label="Familles monoparentales">{pct(i.menages.part_monoparentales)}</Ligne>
              <Ligne label="Taux de pauvreté">{pct(i.revenus.taux_pauvrete)}</Ligne>
              <Ligne label="Niveau de vie moyen">{euros(i.revenus.niveau_de_vie_moyen)}</Ligne>
            </Carte>
            <Carte>
              <p className="alx-mont m-0 mb-2 rounded-t-[8px] bg-rapport-bleu px-3 py-1.5 text-[11px] uppercase tracking-[.12em] text-rapport-sur-bleu">Logements</p>
              <Ligne label="Densité">{nb(i.population.densite_km2)} hab./km²</Ligne>
              <Ligne label="En immeuble">{pct(i.logement.part_collectif)}</Ligne>
              <Ligne label="En maison">{pct(i.logement.part_maisons)}</Ligne>
              <Ligne label="Propriétaires">{pct(i.menages.part_proprietaires)}</Ligne>
              <Ligne label="Logement social">{pct(i.logement.part_social)}</Ligne>
              <Ligne label="Surface moyenne">{nb(i.logement.surface_moyenne_m2)} m²</Ligne>
              <Ligne label="Rayon">{z.rayon_m} m · {i.carreaux} carreaux INSEE</Ligne>
            </Carte>
          </div>
        )}
        <Sources>INSEE Filosofi, carreaux de 200 m. Rayon de {z.rayon_m} m, l&apos;équivalent de {z.marche}.</Sources>
      </section>
    );
  };

  return (
    <div className="mx-auto max-w-[1100px] px-4 pb-20">
      {/* La couverture */}
      <div className="mb-8 flex items-start justify-between gap-4">
        <button onClick={onRetour} className="inline-flex items-center gap-1.5 text-[12px] text-ardoise hover:text-encre"><ChevronLeft className="h-4 w-4" />Toutes les expertises</button>
        <button onClick={onSupprimer} className="inline-flex items-center gap-1.5 text-[12px] text-brume hover:text-alerte"><Trash2 className="h-3.5 w-3.5" />Supprimer</button>
      </div>
      <div className="mb-10 text-center">
        <p className="alx-mont m-0 inline-block rounded-full bg-rapport-orange/15 px-4 py-1 text-[11px] uppercase tracking-[.2em] text-rapport-orange">Rapport d&apos;implantation</p>
        <h1 className="mt-3 mb-0 text-[34px] font-light tracking-[-0.01em] text-rapport-bleu">Étude d&apos;expertise</h1>
        <div className="mx-auto my-4 h-1.5 w-28 rounded-full bg-gradient-to-r from-rapport-bleu to-rapport-orange" />
        <p className="m-0 text-[22px] font-semibold text-encre">{p?.libelle || e.adresse}</p>
        <p className="m-0 mt-1 text-[13px] text-ardoise">{e.activite}</p>
        <p className="m-0 mt-4 text-[13px] text-encre">Étude préparée par <strong>{e.par || user?.full_name || user?.email}</strong></p>
        <p className="m-0 mt-1 text-[11.5px] text-brume">Document généré par K-Data le {quand(e.fini_le || e.cree_le)}{r.sources?.length ? ` · sources : ${r.sources.join(", ")}` : ""}</p>
        {d?.du_cache && <p className="m-0 mt-2 text-[11.5px] text-menthe-texte">Étude Data-B reprise de la base, aucun crédit dépensé.</p>}
        {r.data_b_erreur && <p className="m-0 mt-2 inline-flex items-center gap-1.5 text-[12px] text-alerte"><AlertTriangle className="h-3.5 w-3.5" />Data-B : {r.data_b_erreur}</p>}
      </div>

      {/* Descriptif de l'emplacement */}
      <section className="mb-8">
        <Bandeau>Descriptif de l&apos;emplacement</Bandeau>
        <div className="grid gap-4 md:grid-cols-2">
          {CLE_MAPS && p ? (
            <>
              <iframe title="Plan" className="h-[300px] w-full rounded-[12px] border border-bord" loading="lazy"
                src={`https://www.google.com/maps/embed/v1/place?key=${CLE_MAPS}&q=${p.lat},${p.lon}&zoom=16`} />
              <iframe title="Vue de la rue" className="h-[300px] w-full rounded-[12px] border border-bord" loading="lazy"
                src={`https://www.google.com/maps/embed/v1/streetview?key=${CLE_MAPS}&location=${p.lat},${p.lon}&fov=90`} />
            </>
          ) : <p className="m-0 text-[12.5px] text-brume">Plan indisponible.</p>}
        </div>
        <Sources>Base Adresse Nationale, Google Maps</Sources>
      </section>

      {/* Présentation du quartier */}
      {d && (
        <section className="mb-8">
          <Bandeau>Présentation du quartier</Bandeau>
          <div className="grid gap-4 md:grid-cols-2">
            <Carte>
              <Etiquette label="Revenu annuel">{euros(d.en_tete?.revenu_annuel_quartier)} {d.en_tete?.revenu_vs_france != null && <span className="text-ardoise">(France : {pct(d.en_tete.revenu_vs_france, true)})</span>}</Etiquette>
              <Etiquette label="CSP majoritaire">{d.en_tete?.csp_majoritaire || "—"}</Etiquette>
              <Etiquette label="Population">{nb(d.demographie?.habitants)} personnes</Etiquette>
              <Etiquette label="Taux de chômage">{pct(d.revenu?.taux_chomage)}</Etiquette>
            </Carte>
            <Carte>
              <Etiquette label="CSP +">{nb(d.revenu?.csp_plus)}</Etiquette>
              <Etiquette label="Retraités">{nb(d.revenu?.retraites)}</Etiquette>
              <Etiquette label="Revenu moyen">{euros(d.revenu?.revenu_moyen_annuel)}</Etiquette>
              <Etiquette label="Entreprises (zone)">{nb(d.zone_primaire?.entreprises)}</Etiquette>
            </Carte>
          </div>
          <Sources>Data-B, INSEE RGP, SIRENE</Sources>
        </section>
      )}

      {/* Générateurs de flux */}
      <section className="mb-8">
        <Bandeau>Générateurs de flux</Bandeau>
        {!r.generateurs?.length ? <p className="m-0 text-[12.5px] text-brume">Aucun générateur cartographié dans 300 m.</p> :
          ["Moins de 50 mètres", "De 50 à 100 mètres", "Plus de 100 mètres"].map((bande) => {
            const lot = r.generateurs.filter((g) => g.bande === bande);
            if (!lot.length) return null;
            return (
              <div key={bande} className="mb-4">
                <p className="alx-mont m-0 mb-2 rounded-full bg-rapport-orange py-1.5 text-center text-[12px] font-semibold uppercase tracking-[.14em] text-rapport-sur-bleu">{bande} de l&apos;emplacement</p>
                {lot.map((g) => (
                  <div key={g.rang} className="mb-1.5 flex items-center gap-3 rounded-[8px] border border-trait bg-surface-pleine px-3 py-2 text-[12.5px]">
                    <span className="w-14 flex-shrink-0 rounded-[6px] bg-rapport-orange/10 py-1 text-center font-semibold tabular-nums text-encre">{g.distance_m} m</span>
                    <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-rapport-orange text-[10px] font-bold text-rapport-sur-bleu">{g.rang}</span>
                    <span className="min-w-0 flex-1"><strong className="text-encre">{g.genre}</strong> <span className="text-encre">{g.nom || ""}</span><span className="block text-[11px] text-brume">{g.famille}</span></span>
                    <span className="flex-shrink-0 text-[11px] uppercase text-ardoise">{g.adresse || ""}</span>
                  </div>
                ))}
              </div>
            );
          })}
        <Sources>OpenStreetMap</Sources>
      </section>

      {/* Flux piéton */}
      {fluxP && (
        <section className="mb-8">
          <Bandeau>Estimation du flux piéton dans la zone</Bandeau>
          <div className="grid gap-4 md:grid-cols-[1fr_280px]">
            <div className="grid gap-4 sm:grid-cols-2">
              <Carte className="border-t-4 border-t-vert text-center">
                <p className="m-0 text-[14px] font-semibold text-rapport-bleu">Estimation basse par heure</p>
                <p className="alx-mont my-3 rounded-[8px] bg-rapport-orange/10 py-2 text-[15px] font-bold uppercase text-rapport-orange">Entre {nb(fluxP.par_heure?.basse?.min)} et {nb(fluxP.par_heure?.basse?.max)} piétons</p>
                <p className="m-0 text-[12px] text-ardoise">Flux par jour : entre {nb(fluxP.par_jour?.basse?.min)} et {nb(fluxP.par_jour?.basse?.max)}</p>
              </Carte>
              <Carte className="border-t-4 border-t-alerte text-center">
                <p className="m-0 text-[14px] font-semibold text-rapport-bleu">Estimation haute par heure</p>
                <p className="alx-mont my-3 rounded-[8px] bg-rapport-orange/10 py-2 text-[15px] font-bold uppercase text-rapport-orange">Entre {nb(fluxP.par_heure?.haute?.min)} et {nb(fluxP.par_heure?.haute?.max)} piétons</p>
                <p className="m-0 text-[12px] text-ardoise">Flux par jour : entre {nb(fluxP.par_jour?.haute?.min)} et {nb(fluxP.par_jour?.haute?.max)}</p>
              </Carte>
            </div>
            <Carte>
              <p className="alx-mont m-0 text-[10.5px] uppercase tracking-[.14em] text-brume">Densité du flux</p>
              <div className="my-2 rounded-[8px] bg-rapport-orange/10 py-2 text-center"><Etoiles note={fluxP.note?.note ?? 0} sur={fluxP.note?.sur ?? 5} taille="h-5 w-5" /></div>
              {Object.entries(fluxP.sous_notes || {}).map(([k, v]) => (
                <div key={k} className="flex items-center justify-between border-b border-trait py-1.5 text-[12.5px]"><span className="capitalize text-encre">{k}</span><Etoiles note={v.note} sur={v.sur} taille="h-3.5 w-3.5" /></div>
              ))}
            </Carte>
          </div>
          <Sources>Data-B. Estimation algorithmique, pas un comptage sur site.</Sources>
        </section>
      )}

      {/* Flux voiture */}
      {fluxV && (
        <section className="mb-8">
          <Bandeau>Estimation du flux voiture dans la zone</Bandeau>
          <Carte className="text-center">
            <p className="alx-mont m-0 text-[10.5px] uppercase tracking-[.14em] text-brume">Densité du flux</p>
            {fluxV.indisponible ? <p className="m-0 mt-2 text-[12.5px] text-ardoise">Data-B ne l&apos;a pas calculée à cette adresse.</p>
              : <div className="mt-2 inline-block rounded-[8px] bg-rapport-orange/10 px-6 py-2"><Etoiles note={fluxV.note?.note ?? 0} sur={fluxV.note?.sur ?? 5} taille="h-6 w-6" /></div>}
          </Carte>
          <Sources>Data-B</Sources>
        </section>
      )}

      {/* La rue */}
      {rue && (
        <section className="mb-8">
          <Bandeau>Présentation de la rue</Bandeau>
          <Carte>
            <p className="m-0 mb-3 text-center text-[14px] text-encre">Il y a <strong className="text-[22px] text-rapport-orange">{rue.commerces}</strong> commerces en activité dans cette rue longue de <strong>{rue.longueur_m} m</strong></p>
            <div className="mb-4 grid grid-cols-2 gap-x-6 gap-y-1 md:grid-cols-3">
              {(rue.familles || []).map((f) => (
                <p key={f.famille} className="m-0 flex items-center gap-2 text-[12.5px]"><span className="h-2 w-2 rounded-full bg-rapport-orange" /><strong className="text-encre">{f.n}</strong><span className="text-ardoise">en {f.famille}</span></p>
              ))}
            </div>
            <Etiquette label="Commercialité de la rue">{rue.commerces} commerces</Etiquette>
          </Carte>
          <Sources>Data-B, SIRENE, OpenStreetMap</Sources>
        </section>
      )}

      {/* Le tronçon */}
      {troncon && (
        <section className="mb-8">
          <Bandeau>Présentation du tronçon de rue</Bandeau>
          <Carte><Etiquette label="Commercialité du tronçon" etoiles={troncon.note}>{troncon.libelle}</Etiquette></Carte>
          <Sources>Data-B, SIRENE</Sources>
        </section>
      )}
      {numeros.length > 0 && (
        <section className="mb-8">
          <Bandeau>Activité commerciale du tronçon de rue</Bandeau>
          <div className="grid grid-cols-[1fr_28px_1fr] gap-3">
            <div>
              <p className="alx-mont m-0 mb-3 rounded-full bg-rapport-orange py-1.5 text-right text-[10.5px] font-semibold uppercase tracking-[.16em] text-rapport-sur-bleu pr-4">Côté pair</p>
              {pair.map((n, i) => <Numero key={`${n.numero}-${i}`} n={n} />)}
            </div>
            <div className="rounded-full bg-rapport-bleu" style={{ backgroundImage: "repeating-linear-gradient(to bottom, transparent 0 14px, rgb(255 255 255 / .7) 14px 22px)", backgroundSize: "3px 100%", backgroundRepeat: "no-repeat", backgroundPosition: "center" }} />
            <div>
              <p className="alx-mont m-0 mb-3 rounded-full bg-rapport-orange py-1.5 pl-4 text-[10.5px] font-semibold uppercase tracking-[.16em] text-rapport-sur-bleu">Côté impair</p>
              {impair.map((n, i) => <Numero key={`${n.numero}-${i}`} n={n} />)}
            </div>
          </div>
          <Sources>Data-B, SIRENE, INPI</Sources>
        </section>
      )}

      {/* Zones de chalandise */}
      {zones.map((z) => <ZoneCarte key={z.cle} z={z} />)}
      {zones.some((z) => z.insee) && (
        <section className="mb-8">
          <Bandeau>Zone de chalandise | Récapitulatif</Bandeau>
          <Carte className="overflow-x-auto">
            <table className="w-full border-collapse text-[12.5px]">
              <thead><tr className="bg-rapport-bleu text-left text-rapport-sur-bleu">
                <th className="alx-mont px-3 py-2 text-[10.5px] uppercase tracking-[.12em]">Résidents</th>
                {zones.map((z) => <th key={z.cle} className="alx-mont px-3 py-2 text-[10.5px] uppercase tracking-[.12em]">{z.marche}</th>)}
                <th className="alx-mont bg-rapport-orange px-3 py-2 text-[10.5px] uppercase tracking-[.12em]">Total</th>
              </tr></thead>
              <tbody>
                {[["Population", "population", "habitants"], ["Ménages", "menages", "menages"], ["Ménages pauvres", "revenus", "menages_pauvres"]].map(([label, k, s]) => (
                  <tr key={label} className="border-b border-trait"><td className="px-3 py-1.5 font-medium text-encre">{label}</td>
                    {zones.map((z) => <td key={z.cle} className="px-3 py-1.5 tabular-nums text-encre">{nb(z.insee?.[k]?.[s])}</td>)}
                    <td className="px-3 py-1.5 font-semibold tabular-nums text-encre">{nb(totalZones(k, s))}</td></tr>
                ))}
                <tr className="border-b border-trait"><td className="px-3 py-1.5 font-medium text-encre">Niveau de vie moyen</td>
                  {zones.map((z) => <td key={z.cle} className="px-3 py-1.5 tabular-nums text-encre">{euros(z.insee?.revenus?.niveau_de_vie_moyen)}</td>)}<td /></tr>
              </tbody>
            </table>
          </Carte>
          <Sources>INSEE Filosofi. Les zones s&apos;emboîtent : le total additionne trois rayons, pas trois couronnes.</Sources>
        </section>
      )}

      {/* Démographie et revenu du quartier, avec les évolutions */}
      {d?.demographie && (
        <section className="mb-8">
          <Bandeau>Étude démographique et revenu de la zone</Bandeau>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Compteur titre="Habitants" valeur={nb(d.demographie.habitants)} evolutions={d.demographie.evolution && { "Évolution à 3 ans": d.demographie.evolution.a_3_ans, "à 5 ans": d.demographie.evolution.a_5_ans, "à 10 ans": d.demographie.evolution.a_10_ans }} />
            <Compteur titre="Revenu moyen" valeur={`${nb(d.revenu?.revenu_moyen_annuel)} € / an`} evolutions={d.revenu?.revenu_evolution && { "Évolution à 3 ans": d.revenu.revenu_evolution.a_3_ans, "à 5 ans": d.revenu.revenu_evolution.a_5_ans }} />
            <Compteur titre="CSP +" valeur={nb(d.revenu?.csp_plus)} evolutions={d.revenu?.csp_plus_evolution && { "Évolution à 3 ans": d.revenu.csp_plus_evolution.a_3_ans, "à 5 ans": d.revenu.csp_plus_evolution.a_5_ans }} />
            <Compteur titre="Taux de chômage" valeur={pct(d.revenu?.taux_chomage)} />
          </div>
          <Sources>Data-B, INSEE RGP</Sources>
        </section>
      )}

      {/* Logement */}
      {d?.zone_primaire && (
        <section className="mb-8">
          <Bandeau>Portrait du logement dans la zone</Bandeau>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Compteur titre="Logements" valeur={nb(d.zone_primaire.logements)} />
            <Compteur titre="Maisons" valeur={nb(d.zone_primaire.maisons)} />
            <Compteur titre="Appartements" valeur={nb(d.zone_primaire.appartements)} />
            <Compteur titre="Propriétaires" valeur={nb(d.zone_primaire.proprietaires)} />
          </div>
          <Sources>Data-B, INSEE RGP</Sources>
        </section>
      )}

      {/* Synthèse */}
      <section className="mb-8">
        <Bandeau>Synthèse de l&apos;expertise</Bandeau>
        <div className="grid gap-4 md:grid-cols-2">
          <Carte>
            <p className="alx-mont m-0 mb-2 rounded-t-[8px] bg-rapport-bleu px-3 py-1.5 text-[11px] uppercase tracking-[.12em] text-rapport-sur-bleu">Le quartier</p>
            <Etiquette label="Population">{nb(d?.demographie?.habitants)}</Etiquette>
            <Etiquette label="Revenu moyen">{euros(d?.revenu?.revenu_moyen_annuel)} / an</Etiquette>
            <Etiquette label="Commerces (zone)">{nb(d?.zone_primaire?.commerces)}</Etiquette>
          </Carte>
          <Carte>
            <p className="alx-mont m-0 mb-2 rounded-t-[8px] bg-rapport-bleu px-3 py-1.5 text-[11px] uppercase tracking-[.12em] text-rapport-sur-bleu">La rue et le tronçon</p>
            <Etiquette label="Commercialité">{rue ? `${rue.commerces} commerces sur ${rue.longueur_m} m` : "—"}</Etiquette>
            <Etiquette label="Tronçon" etoiles={troncon?.note}>{troncon?.libelle || "—"}</Etiquette>
            <Etiquette label="Flux piéton" etoiles={fluxP?.note}>{fluxP ? `${nb(fluxP.par_heure?.basse?.min)} à ${nb(fluxP.par_heure?.haute?.max)} piétons / h` : "—"}</Etiquette>
            <Etiquette label="Flux voiture" etoiles={fluxV?.note && !fluxV.indisponible ? fluxV.note : null}>{fluxV?.indisponible ? "non calculé" : fluxV ? "" : "—"}</Etiquette>
          </Carte>
        </div>
      </section>

      <section>
        <Bandeau>Sources et responsabilités</Bandeau>
        <Carte className="text-[12.5px] leading-[1.7] text-ardoise">
          <p className="m-0"><strong className="text-encre">Sources.</strong> Les flux piéton et voiture, la rue et le tronçon numéro par numéro, la démographie et le revenu du quartier viennent de l&apos;étude d&apos;implantation Data-B, lancée depuis Klocka. Les générateurs de flux viennent d&apos;OpenStreetMap. Les zones de chalandise viennent de l&apos;INSEE (Filosofi, carreaux de 200 m), sur trois rayons de 400, 800 et 1 200 m et non sur des isochrones. Le plan et la vue de la rue viennent de Google.</p>
          <p className="m-0 mt-3"><strong className="text-encre">Nature des résultats.</strong> Un outil d&apos;aide à la décision, daté du jour de sa génération. Le flux piéton est une estimation algorithmique, pas un comptage sur site. Ce qu&apos;aucune source ne donne n&apos;est pas affiché.</p>
        </Carte>
      </section>
    </div>
  );
}

// ── Le chargement ──────────────────────────────────────────────────────────

function Chargement({ expertise: e }) {
  const etapes = e?.etapes || [];
  return (
    <div className="mx-auto max-w-[620px] px-4 pt-16 text-center">
      <p className="alx-mont m-0 text-[11px] uppercase tracking-[.2em] text-rapport-orange">Expertise en cours</p>
      <h2 className="mt-2 mb-1 text-[24px] font-light text-encre">{e?.libelle || e?.adresse}</h2>
      <p className="m-0 text-[13px] text-ardoise">{e?.activite}</p>
      <div className="mx-auto mt-8 h-3 w-full overflow-hidden rounded-full bg-relief">
        <div className="h-full rounded-full bg-gradient-to-r from-rapport-bleu to-rapport-orange transition-[width] duration-700" style={{ width: `${Math.max(4, e?.progression || 0)}%` }} />
      </div>
      <p className="m-0 mt-2 text-[12px] tabular-nums text-brume">{e?.progression || 0} %</p>
      <ul className="mx-auto mt-8 m-0 max-w-[460px] list-none space-y-2 p-0 text-left">
        {etapes.map((s) => (
          <li key={s.cle} className="flex items-start gap-3 text-[13px]">
            <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border border-bord">
              {s.etat === "faite" ? <Check className="h-3 w-3 text-vert" /> : s.etat === "ratee" ? <X className="h-3 w-3 text-alerte" /> : s.etat === "en_cours" ? <Loader2 className="h-3 w-3 animate-spin text-rapport-orange" /> : <Clock className="h-3 w-3 text-brume" />}
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
  useEffect(() => { if (e && e.etat !== "en_cours") qc.invalidateQueries({ queryKey: ["kexpertise"] }); }, [e?.etat]);

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
      <p className="alx-mont m-0 text-[11px] uppercase tracking-[.2em] text-rapport-orange">K-Expertise</p>
      <h1 className="mt-2 mb-6 text-[30px] font-light tracking-[-0.01em] text-encre">Étude d&apos;implantation d&apos;une adresse</h1>

      <div className="rounded-[16px] border border-bord bg-surface-pleine p-5">
        <label className="alx-mont mb-1.5 block text-[10.5px] uppercase tracking-[.14em] text-brume">Type de commerce</label>
        <input value={activite} onChange={(ev) => setActivite(ev.target.value)} placeholder="Boulangerie, restaurant, opticien… ou vide pour tous les commerces"
          className="mb-4 h-11 w-full rounded-[10px] border border-bord bg-surface px-3 text-[14px] text-encre outline-none placeholder:text-brume focus:border-rapport-orange" />
        <label className="alx-mont mb-1.5 block text-[10.5px] uppercase tracking-[.14em] text-brume">Adresse précise</label>
        <div className="relative">
          <div className="flex items-center gap-2 rounded-[10px] border border-bord bg-surface px-3 focus-within:border-rapport-orange">
            <Search className="h-4 w-4 flex-shrink-0 text-brume" />
            <input value={adresse} onChange={(ev) => setAdresse(ev.target.value)} placeholder="48 rue Basfroi, 75011 Paris"
              className="h-11 w-full bg-transparent text-[14px] text-encre outline-none placeholder:text-brume" />
          </div>
          {suggestions.length > 0 && (
            <ul className="absolute left-0 right-0 top-[48px] z-20 m-0 list-none overflow-hidden rounded-[10px] border border-bord bg-surface-pleine p-0 shadow-[0_18px_40px_rgba(0,0,0,0.35)]">
              {suggestions.map((s) => <li key={s}><button onClick={() => { setAdresse(s); setSuggestions([]); }} className="block w-full px-3 py-2 text-left text-[13px] text-craie hover:bg-relief hover:text-encre">{s}</button></li>)}
            </ul>
          )}
        </div>
        <p className="mt-3 mb-0 text-[11.5px] leading-[1.6] text-brume">
          {dejaEnBase ? "Cette adresse a déjà une expertise terminée : la relancer ne dépensera pas de crédit Data-B si elle a moins de trente jours."
            : "Une expertise lance une étude Data-B, qui consomme un crédit. Une même adresse et une même activité, dans les trente jours, n'en consomment pas de second."}
        </p>
        <button onClick={() => lancer.mutate()} disabled={lancer.isPending || adresse.trim().length < 5}
          className="mt-4 inline-flex h-11 items-center gap-2 rounded-full bg-rapport-orange px-6 text-[12.5px] font-semibold uppercase tracking-[.12em] text-rapport-sur-bleu disabled:opacity-50">
          {lancer.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}Lancer l&apos;expertise
        </button>
      </div>

      <h2 className="mt-10 mb-3 text-[17px] font-medium text-encre">Expertises réalisées</h2>
      {!expertises.length ? <p className="m-0 text-[13px] text-brume">Aucune pour l&apos;instant.</p> : (
        <ul className="m-0 list-none p-0">
          {expertises.map((x) => (
            <li key={x.id}>
              <button onClick={() => setOuverte(x.id)} className="flex w-full items-center gap-4 border-b border-trait py-3 text-left hover:bg-surface">
                <span className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${x.etat === "terminee" ? "bg-vert" : x.etat === "echec" ? "bg-alerte" : "bg-rapport-orange animate-pulse"}`} />
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
