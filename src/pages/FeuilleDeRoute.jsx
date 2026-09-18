import React, { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ArrowRight, Loader2, Check, MapPin, Store, TrendingUp, CalendarDays, Phone } from "lucide-react";
import FondHalo from "@/components/projet/FondHalo";

// « Ma feuille de route » : la page ouverte à tous, sans compte.
//
// On y dit son objectif, ses fonds et son quartier ; elle rend le nombre
// d'acquisitions à faire, leur prix, leur loyer, leur année, et un commerce
// réel du quartier en exemple. Puis elle propose un appel.
//
// Deux choses s'y disent franchement, parce qu'une page qui attire des gens
// de l'extérieur engage plus qu'une page interne : les commerces montrés ne
// sont pas à vendre, ce sont des devantures existantes qui disent le niveau
// du quartier ; et les hypothèses du calcul sont affichées, pas cachées
// derrière un chiffre rond.

const LIEN_RDV = import.meta.env.VITE_LM_LIEN_RDV || "mailto:sourcing@klocka.immo?subject=Je%20souhaite%20un%20appel%20Klocka";
const CARTE = "rounded-[18px] border border-trait bg-surface";
const euros = (n) => (n == null ? "—" : `${Math.round(n).toLocaleString("fr-FR")} €`);

const HORIZONS = [3, 5, 10, 15];

function Champ({ label, aide = null, children }) {
  return (
    <div className="mb-4">
      <label className="alx-mont mb-1.5 block text-[10.5px] uppercase tracking-[.14em] text-encre">{label}</label>
      {children}
      {aide && <p className="m-0 mt-1 text-[11px] text-brume">{aide}</p>}
    </div>
  );
}

function Nombre({ valeur, onChange, unite, placeholder }) {
  return (
    <div className="flex items-center gap-2 rounded-[10px] border border-bord bg-surface px-3 focus-within:border-menthe">
      <input type="text" inputMode="numeric" value={valeur} placeholder={placeholder} onChange={(e) => onChange(e.target.value)}
        className="h-11 w-full bg-transparent text-[14px] tabular-nums text-encre outline-none placeholder:text-brume" />
      <span className="flex-shrink-0 text-[13px] text-ardoise">{unite}</span>
    </div>
  );
}

function Etape({ e, dernier }) {
  return (
    <div className="relative pl-8">
      {!dernier && <span className="absolute left-[11px] top-7 bottom-0 w-px bg-trait" />}
      <span className="absolute left-0 top-1 flex h-6 w-6 items-center justify-center rounded-full border border-menthe/50 text-[11px] text-menthe-texte">{e.rang}</span>
      <div className={`${CARTE} mb-3 p-4`}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="m-0 text-[15px] font-medium text-encre">Acquisition {e.rang} · {e.annee === 0 ? "dès maintenant" : `dans ${e.annee} an${e.annee > 1 ? "s" : ""}`}</p>
          <span className="rounded-full border border-menthe/40 bg-menthe/10 px-2.5 py-0.5 text-[11px] text-menthe-texte">rendement cible {e.rendement_cible} %</span>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-4">
          {[["Prix du local", euros(e.prix)], ["Apport", euros(e.apport)], ["Loyer annuel", euros(e.loyer_annuel)], ["Cash-flow", `${euros(e.cash_flow_mensuel)} / mois`]].map(([k, v]) => (
            <div key={k} className="rounded-[10px] border border-trait bg-relief px-3 py-2">
              <p className="m-0 text-[10.5px] uppercase tracking-[.08em] text-brume">{k}</p>
              <p className="m-0 mt-0.5 text-[15px] font-semibold tabular-nums text-encre">{v}</p>
            </div>
          ))}
        </div>
        <p className="m-0 mt-2 text-[11.5px] text-ardoise">
          {e.surface_indicative ? `Environ ${e.surface_indicative} m² au prix du quartier · ` : ""}
          Revenu cumulé après cette acquisition : <span className="font-medium text-menthe-texte">{euros(e.cumul_mensuel)} par mois</span>
        </p>
      </div>
    </div>
  );
}

function Roadmap({ r, prenom, onRecommencer }) {
  return (
    <div className="mx-auto max-w-[840px] px-4 pb-24 pt-10">
      <p className="alx-mont m-0 text-[11px] uppercase tracking-[.2em] text-menthe-texte">Votre feuille de route</p>
      <h1 className="mt-2 mb-2 text-[32px] font-light leading-[1.15] tracking-[-0.01em] text-encre">
        {prenom}, voici le chemin vers {euros(r.objectif_mensuel)} par mois
      </h1>
      <p className="m-0 mb-8 text-[14px] leading-[1.7] text-ardoise">
        {r.nombre_acquisitions} acquisition{r.nombre_acquisitions > 1 ? "s" : ""} de commerce, soit {euros(r.patrimoine_vise)} de patrimoine
        produisant {euros(r.loyer_annuel_vise)} de loyers par an. {r.quartier ? `Chiffré sur ${r.quartier}.` : ""}
      </p>

      <div className="mb-8 grid gap-3 sm:grid-cols-3">
        {[
          ["Objectif atteint", r.annee_objectif === 0 ? "dès la première année" : `en ${r.annee_objectif} ans`, CalendarDays],
          ["Revenu au terme", `${euros(r.atteint_mensuel)} / mois`, TrendingUp],
          ["Prix du quartier", r.marche ? `${euros(r.marche.m2)} / m²` : "non publié", MapPin],
        ].map(([k, v, Icone]) => (
          <div key={k} className={`${CARTE} p-4`}>
            <Icone className="h-4 w-4 text-menthe" />
            <p className="m-0 mt-2 text-[10.5px] uppercase tracking-[.08em] text-brume">{k}</p>
            <p className="m-0 mt-0.5 text-[17px] font-semibold text-encre">{v}</p>
          </div>
        ))}
      </div>

      {!r.dans_horizon && (
        <div className="mb-8 rounded-[14px] border border-ambre/40 bg-ambre/[0.08] px-4 py-3 text-[13px] leading-[1.6] text-craie">
          Votre objectif demande {r.annee_objectif} ans, un peu plus que les {r.horizon_ans} ans que vous visez. C'est dit franchement :
          avec plus d'apport de départ, ou un objectif un peu moins haut, le calendrier se resserre. Nous en parlons volontiers.
        </div>
      )}

      <h2 className="mb-4 text-[19px] font-medium text-encre">Les acquisitions, une par une</h2>
      {r.etapes.map((e, i) => <Etape key={e.rang} e={e} dernier={i === r.etapes.length - 1} />)}

      <div className={`${CARTE} mt-6 p-5`}>
        <h3 className="m-0 mb-1 text-[16px] font-medium text-encre">Voyez la première acquisition en détail</h3>
        <p className="m-0 mb-4 text-[13px] leading-[1.6] text-ardoise">
          Le même calcul, poste par poste, dans notre simulateur : crédit, charges, impôt, revente. Tous les curseurs sont manipulables.
        </p>
        <a href={r.lien_simulateur} target="_blank" rel="noreferrer"
          className="inline-flex h-11 items-center gap-2 rounded-full bg-menthe px-6 text-[12.5px] font-medium uppercase tracking-[.12em] text-sur-menthe">
          Ouvrir le simulateur<ArrowRight className="h-4 w-4" />
        </a>
      </div>

      {r.exemples?.length > 0 && (
        <div className="mt-6">
          <h2 className="mb-1 text-[19px] font-medium text-encre">À quoi ça ressemble, près de chez vous</h2>
          <p className="m-0 mb-4 text-[12.5px] leading-[1.6] text-ardoise">
            Ces commerces existent dans votre quartier. <span className="text-encre">Ils ne sont pas à vendre</span> : ils montrent le type de
            bien et le niveau de prix sur lesquels votre feuille de route est calculée.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {r.exemples.map((c, i) => (
              <div key={i} className={`${CARTE} flex items-center gap-3 p-3`}>
                <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-trait bg-relief"><Store className="h-4 w-4 text-menthe" /></span>
                <span className="min-w-0">
                  <span className="block truncate text-[13.5px] font-medium text-encre">{c.nom}</span>
                  <span className="block truncate text-[11.5px] text-ardoise">{c.metier}{c.adresse ? ` · ${c.adresse}` : ""}{c.distance_m != null ? ` · à ${c.distance_m} m` : ""}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-10 rounded-[20px] border border-menthe/30 bg-menthe/[0.07] p-7 text-center">
        <h2 className="m-0 mb-2 text-[24px] font-light text-encre">Vous souhaitez commencer dès maintenant ?</h2>
        <p className="mx-auto m-0 mb-6 max-w-[520px] text-[14px] leading-[1.7] text-craie">
          Un appel gratuit, sans engagement : nous reprenons votre feuille de route ensemble et vous dites si la suite vous intéresse.
        </p>
        <a href={LIEN_RDV} target={LIEN_RDV.startsWith("http") ? "_blank" : undefined} rel="noreferrer"
          className="inline-flex h-12 items-center gap-2 rounded-full bg-menthe px-8 text-[13px] font-medium uppercase tracking-[.12em] text-sur-menthe">
          <Phone className="h-4 w-4" />Réserver mon appel gratuit
        </a>
      </div>

      <details className="mt-8">
        <summary className="cursor-pointer text-[12.5px] text-ardoise hover:text-encre">Sur quoi ce plan est-il calculé ?</summary>
        <div className="mt-3 space-y-2 text-[12px] leading-[1.7] text-brume">
          <p className="m-0">Rendement brut visé : {r.hypotheses.rendement_cible} %. Part du loyer qui reste en poche une fois le crédit, les charges, la gestion et l&apos;impôt payés : {Math.round(r.hypotheses.part_cash_flow * 100)} %. Apport par acquisition : {Math.round(r.hypotheses.part_apport * 100)} % du prix. Épargne supposée : {Math.round(r.hypotheses.part_epargne * 100)} % de vos revenus nets.</p>
          {r.marche && <p className="m-0">Prix du quartier : médiane de {r.marche.ventes} ventes de locaux commerciaux ({r.marche.annees?.join(", ")}) publiées par l&apos;administration fiscale, entre {euros(r.marche.bas)} et {euros(r.marche.haut)} le m². <a className="text-menthe-texte" href={r.marche.lien} target="_blank" rel="noreferrer">Voir les ventes</a>.</p>}
          <p className="m-0">Ce plan est une simulation, pas un conseil en investissement, et ne vaut pas engagement. Les rendements passés ne préjugent pas des rendements futurs.</p>
        </div>
      </details>

      <button onClick={onRecommencer} className="mt-6 text-[12.5px] text-ardoise hover:text-encre">Refaire avec d&apos;autres chiffres</button>
    </div>
  );
}

export default function FeuilleDeRoute() {
  const [f, setF] = useState({ nom: "", email: "", telephone: "", objectif_mensuel: "", revenus_annuels: "", fonds_propres: "", quartier: "", horizon_ans: 10, consentement: false });
  const [suggestions, setSuggestions] = useState([]);
  const [roadmap, setRoadmap] = useState(null);
  const poser = (k, v) => setF((x) => ({ ...x, [k]: v }));

  useEffect(() => {
    const q = f.quartier.trim();
    if (q.length < 3 || roadmap) { setSuggestions([]); return; }
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`https://api-adresse.data.gouv.fr/search/?type=municipality&autocomplete=1&limit=5&q=${encodeURIComponent(q)}`);
        const d = r.ok ? (await r.json()).features || [] : [];
        setSuggestions(d.map((x) => x.properties?.label).filter(Boolean));
      } catch { /* la Base Adresse ne répond pas : on saisit à la main */ }
    }, 250);
    return () => clearTimeout(t);
  }, [f.quartier, roadmap]);

  const envoyer = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/lm/feuille-de-route/roadmap", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(f),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.error || "Nous n'avons pas pu calculer votre feuille de route.");
      return d;
    },
    onSuccess: (d) => { setRoadmap(d.roadmap); window.scrollTo({ top: 0, behavior: "smooth" }); },
  });

  const pret = f.nom.trim() && /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(f.email) && f.quartier.trim().length >= 3 && Number(f.objectif_mensuel) > 0 && f.consentement;

  return (
    <div className="relative min-h-screen">
      <FondHalo />
      <div className="relative z-10">
        {roadmap ? (
          <Roadmap r={roadmap} prenom={f.nom.trim().split(" ")[0]} onRecommencer={() => setRoadmap(null)} />
        ) : (
          <div className="mx-auto max-w-[680px] px-4 pb-24 pt-14">
            <div className="mb-8 text-center">
              <img src="/logo-klocka.svg" alt="Klocka" className="mx-auto mb-6 h-10 w-10 rounded-[8px]" draggable={false} />
              <h1 className="m-0 mb-3 text-[34px] font-light leading-[1.15] tracking-[-0.01em] text-encre">
                Combien de commerces pour vivre de vos loyers ?
              </h1>
              <p className="mx-auto m-0 max-w-[520px] text-[15px] leading-[1.7] text-ardoise">
                En deux minutes, vous repartez avec le nombre d&apos;acquisitions à faire, leur prix, leur loyer et leur année — chiffrés sur les
                ventes réelles de votre quartier.
              </p>
            </div>

            <div className={`${CARTE} p-6 max-md:p-4`}>
              <div className="grid gap-x-4 sm:grid-cols-2">
                <Champ label="Votre prénom">
                  <input value={f.nom} onChange={(e) => poser("nom", e.target.value)} placeholder="Camille"
                    className="h-11 w-full rounded-[10px] border border-bord bg-surface px-3 text-[14px] text-encre outline-none placeholder:text-brume focus:border-menthe" />
                </Champ>
                <Champ label="Votre e-mail">
                  <input type="email" value={f.email} onChange={(e) => poser("email", e.target.value)} placeholder="camille@exemple.fr"
                    className="h-11 w-full rounded-[10px] border border-bord bg-surface px-3 text-[14px] text-encre outline-none placeholder:text-brume focus:border-menthe" />
                </Champ>
              </div>

              <Champ label="Votre objectif de revenu" aide="Ce que vous aimeriez toucher chaque mois, une fois les crédits et les charges payés.">
                <Nombre valeur={f.objectif_mensuel} onChange={(v) => poser("objectif_mensuel", v.replace(/[^\d]/g, ""))} unite="€ / mois" placeholder="2 000" />
              </Champ>

              <div className="grid gap-x-4 sm:grid-cols-2">
                <Champ label="Vos revenus nets annuels">
                  <Nombre valeur={f.revenus_annuels} onChange={(v) => poser("revenus_annuels", v.replace(/[^\d]/g, ""))} unite="€ / an" placeholder="55 000" />
                </Champ>
                <Champ label="Vos fonds propres">
                  <Nombre valeur={f.fonds_propres} onChange={(v) => poser("fonds_propres", v.replace(/[^\d]/g, ""))} unite="€" placeholder="60 000" />
                </Champ>
              </div>

              <Champ label="Votre ville ou quartier" aide="C'est là que nous prenons les prix réels et les commerces en exemple.">
                <div className="relative">
                  <div className="flex items-center gap-2 rounded-[10px] border border-bord bg-surface px-3 focus-within:border-menthe">
                    <MapPin className="h-4 w-4 flex-shrink-0 text-brume" />
                    <input value={f.quartier} onChange={(e) => poser("quartier", e.target.value)} placeholder="Nantes, Saint-Nazaire…"
                      className="h-11 w-full bg-transparent text-[14px] text-encre outline-none placeholder:text-brume" />
                  </div>
                  {suggestions.length > 0 && (
                    <ul className="absolute left-0 right-0 top-[48px] z-20 m-0 list-none overflow-hidden rounded-[10px] border border-bord bg-surface-pleine p-0 shadow-[0_18px_40px_rgba(0,0,0,0.35)]">
                      {suggestions.map((s) => (
                        <li key={s}><button type="button" onClick={() => { poser("quartier", s); setSuggestions([]); }}
                          className="block w-full px-3 py-2 text-left text-[13px] text-craie hover:bg-relief hover:text-encre">{s}</button></li>
                      ))}
                    </ul>
                  )}
                </div>
              </Champ>

              <Champ label="Votre horizon">
                <div className="flex gap-1.5">
                  {HORIZONS.map((h) => (
                    <button key={h} type="button" onClick={() => poser("horizon_ans", h)}
                      className={`flex-1 rounded-[10px] border py-2.5 text-[13px] transition-colors ${f.horizon_ans === h ? "border-menthe bg-menthe/[0.14] text-menthe-texte" : "border-bord text-ardoise hover:text-encre"}`}>
                      {h} ans
                    </button>
                  ))}
                </div>
              </Champ>

              <Champ label="Votre téléphone" aide="Facultatif. Seulement si vous préférez qu'on vous appelle.">
                <input value={f.telephone} onChange={(e) => poser("telephone", e.target.value)} placeholder="06 12 34 56 78"
                  className="h-11 w-full rounded-[10px] border border-bord bg-surface px-3 text-[14px] text-encre outline-none placeholder:text-brume focus:border-menthe" />
              </Champ>

              <label className="mt-2 flex cursor-pointer items-start gap-2.5 text-[12px] leading-[1.6] text-ardoise">
                <input type="checkbox" checked={f.consentement} onChange={(e) => poser("consentement", e.target.checked)} className="mt-0.5 h-4 w-4 flex-shrink-0 accent-[#96c0b8]" />
                <span>
                  J&apos;accepte que Klocka conserve ces informations pour me recontacter au sujet de ma feuille de route. Elles ne sont ni
                  revendues ni transmises. Vous pouvez demander leur suppression à tout moment à sourcing@klocka.immo.
                </span>
              </label>

              {envoyer.isError && <p className="m-0 mt-4 text-[13px] text-alerte">{envoyer.error.message}</p>}

              <button onClick={() => envoyer.mutate()} disabled={!pret || envoyer.isPending}
                className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-menthe px-6 text-[13px] font-medium uppercase tracking-[.12em] text-sur-menthe disabled:opacity-50">
                {envoyer.isPending ? <><Loader2 className="h-4 w-4 animate-spin" />Nous calculons votre feuille de route…</> : <>Voir ma feuille de route<ArrowRight className="h-4 w-4" /></>}
              </button>
              <p className="m-0 mt-3 text-center text-[11px] text-brume">Gratuit, sans engagement, et sans création de compte.</p>
            </div>

            <div className="mt-8 flex flex-wrap justify-center gap-x-6 gap-y-2 text-[11.5px] text-brume">
              {["Chiffré sur les ventes réelles publiées par l'administration", "Des commerces de votre quartier en exemple", "Toutes les hypothèses affichées"].map((t) => (
                <span key={t} className="flex items-center gap-1.5"><Check className="h-3 w-3 text-menthe" />{t}</span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
