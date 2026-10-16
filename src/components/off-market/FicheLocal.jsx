import React, { useState } from "react";
import { X, ArrowRight } from "lucide-react";
import FacadeLocal from "./FacadeLocal";
import { Fait, LIBELLES_CONFIANCE, LIBELLES_PROFILS, Pastille, SENS_SCORES, Score, Section, Tableau, bouton, boutonPlein, dateCourte, euros, useOffMarket } from "./commun";
import Chargement from "@/components/ui/Chargement";

// Off-market : la fiche des murs commerciaux, dans l'ordre de la spec : est-ce un bon
// mur ? qui le possède ? y a-t-il une raison de vendre ? Chaque fait avec sa
// source et sa date ; ce qui manque se voit (« non mesuré », « inconnu »),
// jamais deviné.

const ONGLETS = [["local", "Les murs"], ["proprietaire", "Propriétaire"], ["marche", "Marché"], ["signaux", "Signaux"], ["suivi", "Suivi"]];
const tonConfiance = { exacte: "bg-menthe/20 text-encre", probable: "bg-relief text-craie", a_confirmer: "bg-ambre/15 text-ambre", inconnu: "bg-relief text-brume" };

const etageLisible = (e) => {
  const s = String(e || "").trim();
  if (!s) return "niveau inconnu";
  if (/^0+$/.test(s) || /^rdc$/i.test(s)) return "RDC";
  const n = Number(s);
  if (Number.isFinite(n)) return n === 1 ? "1er" : `${n}e`;
  return s.toLowerCase();
};

/** Pure : les lots du cadastre en une ligne : « 16 lots : parcelle, RDC ×4, 1er ×5, 2e ×6 · propriétaire ». */
export function resumeLots(lots) {
  if (!lots?.length) return null;
  const etages = new Map();
  for (const x of lots) { const e = etageLisible(x.etage); etages.set(e, (etages.get(e) || 0) + 1); }
  const droits = [...new Set(lots.map((x) => x.droit).filter(Boolean))];
  const parEtage = [...etages].map(([e, n]) => (n > 1 ? `${e} ×${n}` : e)).join(", ");
  return `${lots.length > 1 ? `${lots.length} lots : ` : ""}${parEtage}${droits.length ? ` · ${droits.join(", ").toLowerCase()}` : ""}`;
}

export default function FicheLocal({ id, onFermer, onProprietaire, onListe, onCourrier, onPreanalyse, espace }) {
  const q = useOffMarket(["local", id], `/locaux/${id}`, { enabled: !!id });
  const l = q.data?.local;
  // La fiche se lit par onglets (10 oct. 2026) : le local, le propriétaire, le marché, les signaux, le suivi.
  const [onglet, setOnglet] = useState("local");
  return (
    <aside className="k-grid flex h-full min-h-0 flex-col rounded-bloc border border-bord-doux bg-rail">
      <div className="flex items-start justify-between gap-3 px-5 pt-5">
        <div className="min-w-0">
          <p className="m-0 text-[11px] uppercase tracking-[.14em] text-brume">Murs commerciaux</p>
          <h2 className="m-0 mt-1 truncate text-[20px] font-normal leading-[1.2] text-encre">{l ? `${l.adresse}${l.ville ? `, ${l.ville}` : ""}` : "…"}</h2>
          {l && <p className="m-0 mt-1 text-[13.5px] text-ardoise">{[l.enseigne, l.activite].filter(Boolean).join(" · ") || "Occupant inconnu"}</p>}
        </div>
        <button type="button" onClick={onFermer} aria-label="Fermer" title="Fermer" className="grid h-8 w-8 flex-none place-items-center rounded-full text-ardoise hover:text-encre" style={{ background: "transparent" }}><X className="h-4 w-4" /></button>
      </div>
      {l && (
        <nav className="flex flex-none gap-1 overflow-x-auto border-b border-bord-vif px-5 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Les parties de la fiche">
          {ONGLETS.map(([k, mot]) => (
            <button key={k} type="button" onClick={() => setOnglet(k)} aria-pressed={onglet === k} className={`h-8 flex-none rounded-full px-3 text-[12.5px] transition-colors ${onglet === k ? "bg-encre text-fond" : "text-craie hover:text-encre"}`} style={onglet === k ? undefined : { background: "transparent" }}>{mot}{k === "signaux" && l.signaux_detail.length ? <span className={`ml-1 text-[11px] ${onglet === k ? "opacity-70" : "text-menthe"}`}>{l.signaux_detail.length}</span> : null}</button>
          ))}
        </nav>
      )}
      {q.isLoading && <Chargement taille="grand" />}
      {l && (
        <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-5 pb-6 pt-4">
          {/* La façade d'abord (Jules, 10 oct. 2026), puis les notes et le reste. */}
          <FacadeLocal adresse={l.adresse} ville={l.ville} lat={l.lat} lon={l.lon} nom={l.enseigne} />
          <div className="flex flex-col gap-3">
            <Score motivation={l.motivation} fit={l.fit} rang={l.rang} />
            <details className="group text-[12.5px] leading-[1.5] text-ardoise">
              <summary className="cursor-pointer list-none text-craie underline-offset-4 hover:underline [&::-webkit-details-marker]:hidden">Que veulent dire ces notes ?</summary>
              <ul className="m-0 mt-2 flex list-none flex-col gap-1.5 p-0">
                {["motivation", "fit", "priorite"].map((k) => <li key={k}>{SENS_SCORES[k]}</li>)}
                <li className="text-brume">Notes sur 100. Le détail, point par point, est dans l'onglet Signaux.</li>
              </ul>
            </details>
            <p className="m-0 text-[14px] leading-[1.55] text-craie">{l.explication}</p>
            {l.exclu && <Pastille ton="bg-relief text-brume">Exclu du classement : {l.exclu}</Pastille>}
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => onListe?.(l)} className={bouton}>Mettre en liste</button>
              {l.proprietaire && <button type="button" onClick={() => onCourrier?.(l)} className={bouton} disabled={l.confiance !== "exacte" || l.exclu}>Préparer le courrier</button>}
              <button type="button" onClick={() => onPreanalyse?.(l)} className={bouton}>Envoyer en pré-analyse</button>
            </div>
          </div>

          {onglet === "local" && (<>
          <Section titre="Les murs">
            <Tableau>
              <Fait libelle="Parcelle" valeur={l.local.parcelle} source={l.local.sources.parcelle} />
              <Fait libelle="Lots" valeur={resumeLots(l.local.lots)} />
              <Fait libelle="Surface estimée" valeur={l.local.surface_estimee ? `${l.local.surface_estimee[0]} à ${l.local.surface_estimee[1]} m²` : "non mesurée"} source={l.local.sources.surface} />
              <Fait libelle="Propriété" valeur={l.local.copropriete ? "copropriété" : "monopropriété (une seule personne morale sur la parcelle)"} />
            </Tableau>
          </Section>

          <Section titre="L'occupant">
            <Tableau>
              <Fait libelle="Enseigne" valeur={l.occupant.enseigne || "inconnue"} source={l.occupant.source} date={l.occupant.lu_le} />
              <Fait libelle="Activité" valeur={l.occupant.activite} />
              <Fait libelle="État" valeur={l.occupant.actif && !l.occupant.ferme ? "actif" : "fermé ou vide"} ton={l.occupant.actif && !l.occupant.ferme ? "text-encre" : "text-ambre"} />
              <Fait libelle="Signature" valeur={l.occupant.chaine ? "enseigne nationale" : l.occupant.enseigne ? "indépendant" : null} />
            </Tableau>
          </Section>

          <Section titre="Le bail (déduit)" aide="Pas de base des baux en France : estimation, à confirmer en pré-analyse.">
            <Tableau>
              <Fait libelle="Échéance" valeur={l.bail.echeance ? dateCourte(l.bail.echeance) : "inconnue"} source={l.bail.source} />
              {l.bail.cession.map((c, i) => <Fait key={i} libelle="Cession du fonds" valeur={`${dateCourte(c.date)}${c.detail ? ` · ${c.detail}` : ""}`} source={c.source} />)}
              {l.bail.procedures.map((c, i) => <Fait key={i} libelle="Procédure du locataire" valeur={`${c.type} · ${dateCourte(c.date)}`} source={c.source} ton="text-ambre" />)}
              <Fait libelle="Loyer du bail" valeur={l.bail.loyer_m2 ? `${l.bail.loyer_m2} €/m²/an` : null} />
            </Tableau>
          </Section>

          </>)}
          {onglet === "proprietaire" && (<>
          <Section titre="Le propriétaire">
            {l.proprietaire_detail ? (
              <div className="flex flex-col gap-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => onProprietaire?.(l.proprietaire.cle)} className="inline-flex items-center gap-1.5 p-0 text-[15px] text-encre underline-offset-4 hover:underline" style={{ background: "transparent" }}>{l.proprietaire_detail.nom}<ArrowRight className="h-3.5 w-3.5 text-menthe" /></button>
                  <Pastille>{LIBELLES_PROFILS[l.profil.cle] || l.profil.libelle}</Pastille>
                  <Pastille ton={tonConfiance[l.confiance]}>{LIBELLES_CONFIANCE[l.confiance]}</Pastille>
                </div>
                <Tableau>
                <Fait libelle="Forme" valeur={[l.proprietaire_detail.forme, l.proprietaire_detail.siren ? `SIREN ${l.proprietaire_detail.siren}` : null].filter(Boolean).join(" · ")} source={l.proprietaire_detail.source} date={l.proprietaire_detail.trouve_le} />
                <Fait libelle="Droit" valeur={l.proprietaire_detail.droit.join(", ")} />
                <Fait libelle="Depuis" valeur={l.proprietaire_detail.depuis ? dateCourte(l.proprietaire_detail.depuis.date) : "inconnu"} source={l.proprietaire_detail.depuis?.source} />
                <Fait libelle="Siège" valeur={l.proprietaire_detail.societe?.siege} source={l.proprietaire_detail.societe?.source} date={l.proprietaire_detail.societe?.lu_le} />
                <Fait libelle="Dirigeants" valeur={l.proprietaire_detail.gerants.length ? l.proprietaire_detail.gerants.map((g) => `${g.nom}${g.tranche_age ? ` (${g.tranche_age === "70+" ? "70 ans et plus" : g.tranche_age === "50-70" ? "50 à 70 ans" : "moins de 50 ans"})` : ""}`).join(", ") : "non lus"} />
                <Fait libelle="Capacité à décider" valeur={`${l.proprietaire_detail.capacite.libelle} : ${l.proprietaire_detail.capacite.pourquoi}`} />
                {l.proprietaire_detail.fiscal && <Fait libelle="Profil fiscal probable" valeur={l.proprietaire_detail.fiscal.phrase} source={l.proprietaire_detail.fiscal.source} />}
                </Tableau>
              </div>
            ) : <p className="m-0 text-[13.5px] text-brume">Propriétaire inconnu : le cadastre des personnes morales ne l'a pas donné (un particulier, probablement). Le terrain et le courrier à l'adresse des murs restent possibles.</p>}
          </Section>

          </>)}
          {onglet === "marche" && (<>
          <Section titre="Les mutations">
            {l.mutations.length ? <Tableau>{l.mutations.map((m, i) => <Fait key={i} libelle={m.du_local ? "Vente de ces murs" : `Vente sur la parcelle${m.distance_m != null ? `, à ${m.distance_m} m` : ""}`} valeur={[dateCourte(m.date), m.prix ? euros(m.prix) : null, m.surface ? `${m.surface} m²` : null].filter(Boolean).join(" · ")} source={m.source} />)}</Tableau> : <p className="m-0 text-[13.5px] text-brume">Aucune vente connue depuis 2014 sur cette parcelle (DVF).</p>}
          </Section>

          <Section titre="Le marché">
            <Tableau>
              <Fait libelle="Loyer de marché" valeur={l.marche.loyer_m2 ? `${l.marche.loyer_m2} €/m²/an${l.marche.loyer_fourchette ? ` (${l.marche.loyer_fourchette[0]} à ${l.marche.loyer_fourchette[1]})` : ""}` : "non mesuré"} source={l.marche.loyer_source} />
              <Fait libelle="Valeur estimée" valeur={l.marche.fourchette ? `${euros(l.marche.fourchette[0])} à ${euros(l.marche.fourchette[1])}` : "non mesurée"} source="estimation : loyer de marché ÷ rendement visé" />
              <Fait libelle="Rendement implicite" valeur={l.marche.rendement ? `${String(l.marche.rendement.rendement).replace(".", ",")} %` : "non mesuré"} source={l.marche.rendement?.source} />
              <Fait libelle="Rue" valeur={l.emplacement ? `emplacement n° ${l.emplacement === 1.5 ? "1 bis" : l.emplacement}` : null} source="classement des rues de la ville" />
            </Tableau>
          </Section>

          </>)}
          {onglet === "signaux" && (<>
          <Section titre="Les signaux" aide="Chaque signal, sa source, sa date et ses points. Un signal estimé ne compte pas tant qu'un second indice ne le relève pas.">
            {l.signaux_detail.length ? (
              <Tableau>
                {l.signaux_detail.map((s) => (
                  <Fait key={s.cle} libelle={s.libelle} valeur={`${s.points > 0 ? "+" : ""}${s.points}${s.compte === false ? " (hors score)" : ""}`} source={`${s.source} · ${s.valeur}`} date={s.date} ton={s.points < 0 ? "text-ardoise" : s.compte === false ? "text-brume" : "text-encre"} />
                ))}
                <Fait libelle="Familles de signaux" valeur={`${l.motivation_detail.familles}${l.motivation_detail.bonus ? ` · bonus d'empilement +${l.motivation_detail.bonus}` : ""}`} />
              </Tableau>
            ) : <p className="m-0 text-[13.5px] text-brume">Aucun signal dans les registres publics.</p>}
          </Section>

          <Section titre="Le fit">
            <Tableau>{l.fit_detail.criteres.map((c) => <Fait key={c.cle} libelle={c.libelle} valeur={`${c.points} / ${c.sur}`} source={`${c.valeur} · ${c.source}`} ton={c.valeur === "non mesuré" ? "text-brume" : "text-encre"} />)}</Tableau>
          </Section>

          {l.drapeaux_detail.length > 0 && (
            <Section titre="Faisabilité" aide="Lus à côté du score, jamais dedans.">
              <Tableau>{l.drapeaux_detail.map((d) => <Fait key={d.cle} libelle={d.libelle} valeur={d.detail} ton="text-craie" />)}</Tableau>
            </Section>
          )}

          </>)}
          {onglet === "suivi" && (<>
          <Section titre="Demande cliente">
            {l.demande.length ? <Tableau>{l.demande.map((d) => <Fait key={d.id} libelle={d.nom} valeur={[d.budget ? euros(d.budget) : null, d.zone, d.objectif].filter(Boolean).join(" · ")} source="Clients investisseurs" />)}</Tableau> : <p className="m-0 text-[13.5px] text-brume">Aucun mandat investisseur ne correspond pour l'instant.</p>}
          </Section>

          <Section titre="Historique">
            {l.contact?.interactions?.length ? <Tableau>{[...l.contact.interactions].reverse().map((i, k) => <Fait key={k} libelle={dateCourte(i.le)} valeur={i.texte || i.canal} source={i.par} />)}</Tableau> : <p className="m-0 text-[13.5px] text-brume">Jamais contacté{espace === "klocka" ? " par l'équipe" : ""}.</p>}
          </Section>
          {l.contact?.oppose && <Pastille ton="bg-alerte/15 text-alerte">A demandé à ne plus être contacté</Pastille>}
          </>)}
        </div>
      )}
    </aside>
  );
}
