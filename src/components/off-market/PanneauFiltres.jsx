import React, { useEffect, useMemo, useState } from "react";
import { ChevronDown, X } from "lucide-react";
import { FAMILLES_FILTRES, FILTRES_VIDES, RAPIDES, filtrer, nbCriteres } from "@/lib/off-market-filtres";
import { Case, LIBELLES_PROFILS, LIBELLES_SIGNAUX, bouton, boutonPlein, champ, nMurs, pl } from "./commun";

// Off-market : le panneau de filtres, plein écran sur le même territoire. À
// gauche les familles de critères avec le nombre de critères actifs ; à droite
// les critères de la famille ouverte ; en haut le compteur qui se recalcule à
// chaque geste, Effacer, Sauvegarder, les recherches sauvegardées.

const EVENEMENTS = ["dissolution", "proprietaire_procedure", "locataire_procedure", "deces_dirigeant", "changement_gerant", "cession_fonds", "marchand_recent"];
const PROFILS = ["sci_familiale", "sci", "sci_pro", "societe", "marchand", "holding", "fonciere", "institutionnel", "particulier", "occupant"];

function Trois({ valeur, onChange, oui = "Oui", non = "Non" }) {
  const o = (v, mot) => (
    <button key={v} type="button" onClick={() => onChange(v)} aria-pressed={valeur === v} className={`h-9 flex-1 rounded-full text-[13px] transition-colors ${valeur === v ? "bg-encre text-fond" : "text-craie hover:text-encre"}`} style={valeur === v ? undefined : { background: "transparent" }}>{mot}</button>
  );
  return <div className="inline-flex w-full max-w-[340px] rounded-full border border-bord-vif p-[3px]">{o("any", "Indifférent")}{o("oui", oui)}{o("non", non)}</div>;
}

function Puces({ options, valeurs, onChange, tout = true }) {
  const basculer = (v) => onChange(valeurs.includes(v) ? valeurs.filter((x) => x !== v) : [...valeurs, v]);
  const complet = valeurs.length === options.length;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tout && <button type="button" onClick={() => onChange(complet ? [] : options.map((o) => o.cle))} className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12.5px] transition-colors ${complet ? "border-menthe text-encre" : "border-bord-vif text-ardoise hover:text-encre"}`} style={{ background: "transparent" }}><span className={`inline-block h-3.5 w-3.5 rounded-full border ${complet ? "border-menthe bg-menthe" : "border-trait"}`} />Tout</button>}
      {options.map((o) => <button key={o.cle} type="button" onClick={() => basculer(o.cle)} aria-pressed={valeurs.includes(o.cle)} title={o.aide || undefined} className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12.5px] transition-colors ${valeurs.includes(o.cle) ? "border-menthe bg-menthe/10 text-encre" : "border-bord-vif text-craie hover:text-encre"}`} style={valeurs.includes(o.cle) ? undefined : { background: "transparent" }}>{o.nom}{o.n != null && <span className="text-brume">{o.n}</span>}</button>)}
    </div>
  );
}

function Plage({ min, max, onMin, onMax, unite = "", pas = 1, placeholderMin = "Min", placeholderMax = "Max", type = "number" }) {
  const lire = (e) => (e.target.value === "" ? null : type === "number" ? Number(e.target.value) : e.target.value);
  return (
    <div className="flex max-w-[400px] items-center gap-2">
      <input type={type} step={pas} value={min ?? ""} onChange={(e) => onMin(lire(e))} placeholder={placeholderMin} className={`${champ} w-full`} />
      <span className="text-[12.5px] text-brume">à</span>
      <input type={type} step={pas} value={max ?? ""} onChange={(e) => onMax(lire(e))} placeholder={placeholderMax} className={`${champ} w-full`} />
      {unite && <span className="flex-none text-[12.5px] text-ardoise">{unite}</span>}
    </div>
  );
}

function Critere({ titre, aide, children }) {
  return (
    <div className="flex flex-col gap-2.5 border-b border-trait py-6 first:pt-0 last:border-b-0">
      <div><p className="m-0 text-[15px] text-encre">{titre}</p>{aide && <p className="m-0 mt-0.5 text-[12.5px] text-brume">{aide}</p>}</div>
      {children}
    </div>
  );
}

export default function PanneauFiltres({ ouvert, onFermer, f, onAppliquer, locaux, territoire, recherches = [], onSauvegarder, onCharger, statuts = {} }) {
  const [d, setD] = useState(f);
  const [famille, setFamille] = useState("rapides");
  const [nom, setNom] = useState("");
  const [sauver, setSauver] = useState(false);
  const [menu, setMenu] = useState(false);
  useEffect(() => { if (ouvert) { setD(f); setSauver(false); setMenu(false); } }, [ouvert]);
  useEffect(() => {
    if (!ouvert) return undefined;
    const k = (e) => { if (e.key === "Escape") onFermer(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [ouvert, onFermer]);
  const n = useMemo(() => (ouvert ? filtrer(locaux, d).length : 0), [ouvert, locaux, d]);
  const comptes = useMemo(() => { const c = {}; for (const l of locaux) { for (const s of l.signaux) c[s] = (c[s] || 0) + 1; for (const r of l.rapides || []) c[`r:${r}`] = (c[`r:${r}`] || 0) + 1; c[`p:${l.profil?.cle}`] = (c[`p:${l.profil?.cle}`] || 0) + 1; } return c; }, [locaux]);
  const set = (cle, v) => setD((x) => ({ ...x, [cle]: v }));
  if (!ouvert) return null;
  const fam = FAMILLES_FILTRES.find((x) => x.cle === famille) || FAMILLES_FILTRES[0];
  return (
    <div role="dialog" aria-modal="true" aria-label="Les filtres" className="fixed inset-0 z-[90] flex flex-col bg-fond md:left-[var(--k-barre-largeur,0px)]">
      <header className="flex flex-wrap items-center gap-3 border-b border-trait px-6 py-4 max-md:px-4">
        <span className="inline-flex h-10 items-center rounded-full border border-bord-vif px-3.5 text-[14px] text-encre">{territoire?.nom || "Territoire"}<span className="ml-2 text-[12.5px] text-ardoise">{nMurs(locaux.length)}</span></span>
        <button type="button" onClick={() => setD({ ...FILTRES_VIDES })} className={bouton}>Effacer les filtres</button>
        {sauver ? (
          <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); if (nom.trim()) { onSauvegarder(nom.trim(), d); setNom(""); setSauver(false); } }}>
            <input autoFocus value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Nom de la recherche" className={`${champ} w-[260px]`} />
            <button type="submit" disabled={!nom.trim()} className={boutonPlein}>Enregistrer</button>
            <button type="button" onClick={() => setSauver(false)} className={bouton}>Annuler</button>
          </form>
        ) : <button type="button" onClick={() => setSauver(true)} className={boutonPlein} title="La recherche devient une liste dynamique, rejouable et surveillée">Sauvegarder</button>}
        <div className="relative">
          <button type="button" onClick={() => setMenu((m) => !m)} className={bouton} aria-expanded={menu}>Recherches sauvegardées<ChevronDown className="h-3.5 w-3.5" /></button>
          {menu && (
            <div className="absolute left-0 top-11 z-10 w-[320px] rounded-bloc border border-bord-doux bg-surface-pleine p-2 shadow-xl">
              {!recherches.length && <p className="m-0 px-3 py-3 text-[13px] text-brume">Aucune recherche sauvegardée.</p>}
              {recherches.map((r) => <button key={r.id} type="button" onClick={() => { setMenu(false); onCharger(r); setD({ ...FILTRES_VIDES, ...(r.filtres || {}) }); }} className="flex w-full items-center justify-between gap-2 rounded-champ px-3 py-2 text-left text-[13.5px] text-encre hover:bg-relief" style={{ background: "transparent" }}><span className="truncate">{r.nom}</span><span className="flex-none text-[12px] text-brume">{nbCriteres(r.filtres || {})} critères</span></button>)}
            </div>
          )}
        </div>
        <span className="flex-1" />
        <button type="button" onClick={() => { onAppliquer(d); onFermer(); }} className={`${boutonPlein} h-10 px-5 text-[14px]`}>Voir {nMurs(n)}</button>
        <button type="button" onClick={onFermer} aria-label="Fermer" className="grid h-10 w-10 place-items-center rounded-full text-ardoise hover:text-encre" style={{ background: "transparent" }}><X className="h-5 w-5" /></button>
      </header>
      <div className="grid min-h-0 flex-1 md:grid-cols-[320px_minmax(0,1fr)]">
        <nav className="overflow-y-auto border-r border-trait px-3 py-4 max-md:flex max-md:gap-1 max-md:overflow-x-auto max-md:border-b max-md:border-r-0">
          {FAMILLES_FILTRES.map((x) => {
            const k = nbCriteres(d, x.cle);
            return (
              <button key={x.cle} type="button" onClick={() => setFamille(x.cle)} aria-current={famille === x.cle} className={`flex w-full items-center gap-3 rounded-bloc px-4 py-3.5 text-left transition-colors max-md:w-auto max-md:flex-none ${famille === x.cle ? "bg-rail" : "hover:bg-relief/50"}`} style={famille === x.cle ? undefined : { background: "transparent" }}>
                <span className="min-w-0 flex-1"><span className="block text-[16px] text-encre">{x.nom}</span><span className="block text-[12.5px] text-ardoise max-md:hidden">{x.aide}</span></span>
                {k > 0 && <span className="grid h-6 w-6 flex-none place-items-center rounded-full bg-menthe text-[11.5px] text-sur-menthe">{k}</span>}
              </button>
            );
          })}
        </nav>
        <section className="overflow-y-auto px-10 py-8 max-md:px-4">
          <h2 className="m-0 mb-2 text-[30px] font-normal leading-[1.1] tracking-[-0.02em] text-encre">{fam.nom}</h2>
          <p className="m-0 mb-4 text-[13.5px] text-ardoise">{fam.aide}</p>

          {famille === "rapides" && (
            <Critere titre="Listes rapides" aide="Plusieurs listes cochées : les murs doivent être dans chacune (empilement).">
              <Puces tout={false} options={RAPIDES.map((r) => ({ ...r, n: comptes[`r:${r.cle}`] || 0 }))} valeurs={d.rapides} onChange={(v) => set("rapides", v)} />
            </Critere>
          )}

          {famille === "local" && (<>
            <Critere titre="Emplacement de la rue" aide="Classement des rues de la ville.">
              <Puces options={[{ cle: "1", nom: "N° 1" }, { cle: "1.5", nom: "N° 1 bis" }, { cle: "2", nom: "N° 2" }]} valeurs={d.emplacements} onChange={(v) => set("emplacements", v)} />
            </Critere>
            <Critere titre="Activité de l'occupant" aide="Un mot suffit : pharmacie, banque, restaurant…">
              <input value={d.activite} onChange={(e) => set("activite", e.target.value)} placeholder="Activité" className={`${champ} w-full max-w-[400px]`} />
            </Critere>
            <Critere titre="Occupé" aide="Lecture de la vitrine.">
              <Trois valeur={d.occupe} onChange={(v) => set("occupe", v)} />
            </Critere>
            <Critere titre="Surface estimée" aide="Quand elle est mesurée.">
              <Plage min={d.surface_min} max={d.surface_max} onMin={(v) => set("surface_min", v)} onMax={(v) => set("surface_max", v)} unite="m²" />
            </Critere>
          </>)}

          {famille === "scores" && (<>
            <Critere titre="Motivation au moins" aide="Une raison de vendre : les signaux publics, plafonnés par famille.">
              <div className="flex max-w-[400px] items-center gap-3"><input type="range" min={0} max={100} step={5} value={d.motivation_min} onChange={(e) => set("motivation_min", Number(e.target.value))} className="flex-1 accent-[rgb(var(--k-menthe-rgb))]" /><span className="w-8 text-right tabular-nums text-encre">{d.motivation_min}</span></div>
            </Critere>
            <Critere titre="Fit au moins" aide="Un mur que Klocka veut : enseigne, emplacement, rendement, lot, commune, demande.">
              <div className="flex max-w-[400px] items-center gap-3"><input type="range" min={0} max={100} step={5} value={d.fit_min} onChange={(e) => set("fit_min", Number(e.target.value))} className="flex-1 accent-[rgb(var(--k-menthe-rgb))]" /><span className="w-8 text-right tabular-nums text-encre">{d.fit_min}</span></div>
            </Critere>
            <Critere titre="Familles de signaux" aide="Propriétaire, occupant, événement, marché : on part de ceux qui en cumulent.">
              <Puces tout={false} options={[1, 2, 3].map((k) => ({ cle: k, nom: `${k} ou plus` }))} valeurs={d.familles_min ? [d.familles_min] : []} onChange={(v) => set("familles_min", v.length ? Math.max(...v.map(Number)) : 0)} />
            </Critere>
          </>)}

          {famille === "proprietaire" && (<>
            <Critere titre="Profil du propriétaire">
              <Puces options={PROFILS.map((p) => ({ cle: p, nom: LIBELLES_PROFILS[p], n: comptes[`p:${p}`] || 0 }))} valeurs={d.profils} onChange={(v) => set("profils", v)} />
            </Critere>
            <Critere titre="Propriétaire résolu" aide="Exact : SIREN au cadastre des personnes morales, seul niveau qui permet une campagne.">
              <div className="inline-flex w-full max-w-[420px] rounded-full border border-bord-vif p-[3px]">{[["any", "Indifférent"], ["resolu", "Résolu"], ["exacte", "Exact seulement"]].map(([v, mot]) => <button key={v} type="button" onClick={() => set("confiance", v)} className={`h-9 flex-1 rounded-full text-[13px] ${d.confiance === v ? "bg-encre text-fond" : "text-craie hover:text-encre"}`} style={d.confiance === v ? undefined : { background: "transparent" }}>{mot}</button>)}</div>
            </Critere>
            <Critere titre="Années de détention" aide="DVF, sinon cadastre, sinon création de la société (au plus tôt).">
              <Plage min={d.detention_min} max={d.detention_max} onMin={(v) => set("detention_min", v)} onMax={(v) => set("detention_max", v)} unite="ans" />
            </Critere>
            <Critere titre="Siège à plus de 100 km" aide="Le propriétaire absent de PropStream, à notre échelle.">
              <Trois valeur={d.siege_loin} onChange={(v) => set("siege_loin", v)} />
            </Critere>
            <Critere titre="Taille du portefeuille" aide="Combien de murs du territoire le même propriétaire détient.">
              <Plage min={d.murs_min} max={d.murs_max} onMin={(v) => set("murs_min", v)} onMax={(v) => set("murs_max", v)} unite="murs" />
            </Critere>
            <Critere titre="Âge du gérant" aide="Par tranche, au registre des entreprises : jamais de date de naissance.">
              <Puces options={[{ cle: "70+", nom: "70 ans et plus" }, { cle: "50-70", nom: "50 à 70 ans" }, { cle: "-50", nom: "Moins de 50 ans" }]} valeurs={d.gerants} onChange={(v) => set("gerants", v)} />
            </Critere>
            <Critere titre="Propriété démembrée" aide="Usufruit et nue-propriété séparés au cadastre.">
              <Trois valeur={d.demembrement} onChange={(v) => set("demembrement", v)} />
            </Critere>
          </>)}

          {famille === "evenements" && (
            <Critere titre="Au moins un de ces événements" aide="BODACC, relu chaque nuit pour les propriétaires suivis. Pas de divorce ni de faillite personnelle : ces registres n'existent pas en France.">
              <Puces options={EVENEMENTS.map((s) => ({ cle: s, nom: LIBELLES_SIGNAUX[s], n: comptes[s] || 0 }))} valeurs={d.evenements} onChange={(v) => set("evenements", v)} />
            </Critere>
          )}

          {famille === "valeur" && (<>
            <Critere titre="Dernière mutation" aide="DVF : la dernière vente connue de ces murs ou de leur parcelle.">
              <Plage type="date" min={d.mutation_depuis} max={d.mutation_avant} onMin={(v) => set("mutation_depuis", v)} onMax={(v) => set("mutation_avant", v)} placeholderMin="Depuis" placeholderMax="Avant" />
            </Critere>
            <Critere titre="Prix de la dernière mutation">
              <Plage min={d.prix_min} max={d.prix_max} onMin={(v) => set("prix_min", v)} onMax={(v) => set("prix_max", v)} unite="€" pas={1000} />
            </Critere>
            <Critere titre="Valeur estimée" aide="Loyer de marché de la rue divisé par le rendement visé.">
              <Plage min={d.valeur_min} max={d.valeur_max} onMin={(v) => set("valeur_min", v)} onMax={(v) => set("valeur_max", v)} unite="€" pas={1000} />
            </Critere>
            <Critere titre="Rendement implicite" aide="Loyer de marché sur le dernier prix payé.">
              <Plage min={d.rendement_min} max={d.rendement_max} onMin={(v) => set("rendement_min", v)} onMax={(v) => set("rendement_max", v)} unite="%" pas={0.5} />
            </Critere>
            <Critere titre="Seuils de plus-value" aide="22 ans : exonération d'impôt ; 30 ans : exonération des prélèvements sociaux (SCI à l'IR).">
              <Puces tout={false} options={[{ cle: "22", nom: "22 ans ou plus" }, { cle: "30", nom: "30 ans ou plus" }]} valeurs={d.seuils} onChange={(v) => set("seuils", v)} />
            </Critere>
          </>)}

          {famille === "suivi" && (<>
            <Critere titre="Jamais contacté">
              <span className="flex items-center gap-2.5 text-[13.5px] text-craie"><Case oui={d.jamais_contacte} onBasculer={() => set("jamais_contacte", !d.jamais_contacte)} label="Seulement les propriétaires à qui l'on n'a jamais écrit" />Seulement les propriétaires à qui l'on n'a jamais écrit</span>
            </Critere>
            <Critere titre="Statut dans le pipeline">
              <Puces options={Object.entries(statuts).map(([cle, nom]) => ({ cle, nom }))} valeurs={d.statuts} onChange={(v) => set("statuts", v)} />
            </Critere>
          </>)}
        </section>
      </div>
    </div>
  );
}
