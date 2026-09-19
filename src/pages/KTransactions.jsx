import React, { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, Play, Loader2, Clock, Building2, Store, ExternalLink } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useUser } from "@/components/providers/UserProvider";
import { toast } from "@/components/ui/avis";

// K-Transactions : ce que les murs et les fonds se sont vraiment vendus.
//
// Deux marchés, deux sources, deux colonnes, et l'écran ne les confond pas.
// Les MURS viennent de DVF : les ventes enregistrées par l'administration
// fiscale, dans un rayon. Les FONDS viennent du BODACC : le prix de cession
// écrit en clair dans l'annonce légale.
//
// Une différence de maille à dire franchement : DVF est localisé au point, le
// BODACC à l'adresse postale. Les comparables de fonds se rapprochent donc par
// nom de rue, pas par distance — et l'écran l'écrit plutôt que d'afficher des
// mètres inventés.

const CARTE = "rounded-[18px] border border-trait bg-surface";
const ANNEES = [2, 5, 10];
const euros = (n) => (n == null ? "—" : `${Math.round(n).toLocaleString("fr-FR")} €`);
const quand = (iso) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "");

function Chiffre({ titre, valeur, detail }) {
  return (
    <div className={`${CARTE} p-4`}>
      <p className="m-0 text-[10.5px] uppercase tracking-[.08em] text-brume">{titre}</p>
      <p className="m-0 mt-0.5 text-[20px] font-semibold tabular-nums text-encre">{valeur}</p>
      {detail && <p className="m-0 mt-1 text-[11.5px] leading-[1.5] text-ardoise">{detail}</p>}
    </div>
  );
}

function Resultat({ r, onRetour }) {
  const murs = r.murs;
  const fonds = r.fonds;
  return (
    <div className="mx-auto max-w-[1280px] px-4 pb-20 pt-8">
      <button onClick={onRetour} className="mb-3 text-[12.5px] text-ardoise hover:text-encre">Toutes les analyses</button>
      <h1 className="m-0 text-[24px] font-light tracking-[-0.01em] text-encre">{r.point.label}</h1>
      <p className="m-0 mt-1 mb-6 text-[12.5px] text-ardoise">
        murs vendus dans {r.rayon} m · fonds cédés dans la commune sur {r.annees} ans
      </p>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Les murs : DVF */}
        <div>
          <h2 className="m-0 mb-3 flex items-center gap-2 text-[17px] font-medium text-encre"><Building2 className="h-4 w-4 text-menthe" />Les murs</h2>
          {!murs ? (
            <div className={`${CARTE} p-4`}><p className="m-0 text-[12.5px] text-ardoise">{r.murs_erreur || "Aucune vente publiée."}</p></div>
          ) : (
            <>
              <div className="mb-3 grid gap-3 sm:grid-cols-3">
                <Chiffre titre="Prix médian" valeur={murs.prix_m2 ? `${euros(murs.prix_m2.median)} / m²` : "—"}
                  detail={murs.prix_m2 ? `de ${euros(murs.prix_m2.bas)} à ${euros(murs.prix_m2.haut)}` : `moins de ${murs.n_minimum} ventes`} />
                <Chiffre titre="Ventes" valeur={String(murs.n)} detail={murs.annees?.join(", ")} />
                <Chiffre titre="Rayon" valeur={`${murs.rayon} m`} detail={murs.commune} />
              </div>
              <div className={`${CARTE} p-4`}>
                <p className="alx-mont m-0 mb-2 text-[10.5px] uppercase tracking-[.14em] text-brume">Les ventes les plus proches</p>
                <div className="max-h-[360px] overflow-y-auto">
                  {(murs.ventes || []).slice(0, 25).map((v, i) => (
                    <div key={i} className="flex items-baseline justify-between gap-3 border-b border-trait py-2 last:border-b-0 text-[12.5px]">
                      <span className="min-w-0">
                        <span className="block truncate text-encre">{v.adresse || v.commune || "Vente"}</span>
                        <span className="block text-[11px] text-brume">{quand(v.date)}{v.surface ? ` · ${v.surface} m²` : ""}{v.distance_m != null ? ` · ${v.distance_m} m` : ""}</span>
                      </span>
                      <span className="flex-shrink-0 text-right">
                        <span className="block tabular-nums text-encre">{euros(v.prix)}</span>
                        {v.prix_m2 != null && <span className="block text-[11px] tabular-nums text-menthe-texte">{euros(v.prix_m2)} / m²</span>}
                      </span>
                    </div>
                  ))}
                </div>
                {murs.lien && <a href={murs.lien} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[.1em] text-ardoise hover:text-encre"><ExternalLink className="h-3.5 w-3.5" />Voir sur DVF</a>}
              </div>
            </>
          )}
        </div>

        {/* Les fonds : BODACC */}
        <div>
          <h2 className="m-0 mb-3 flex items-center gap-2 text-[17px] font-medium text-encre"><Store className="h-4 w-4 text-menthe" />Les fonds de commerce</h2>
          {!fonds ? (
            <div className={`${CARTE} p-4`}><p className="m-0 text-[12.5px] text-ardoise">{r.fonds_erreur || "Aucune cession publiée."}</p></div>
          ) : (
            <>
              <div className="mb-3 grid gap-3 sm:grid-cols-3">
                <Chiffre titre="Prix médian" valeur={fonds.prix ? euros(fonds.prix.median) : "—"}
                  detail={fonds.prix ? `de ${euros(fonds.prix.min)} à ${euros(fonds.prix.max)}` : "aucun prix publié"} />
                <Chiffre titre="Cessions" valeur={`${fonds.n_avec_prix} / ${fonds.n}`} detail="avec un prix publié" />
                <Chiffre titre="Sur la rue" valeur={fonds.prix_rue ? euros(fonds.prix_rue) : "—"}
                  detail={fonds.comparables_rue.length ? `${fonds.comparables_rue.length} cession${fonds.comparables_rue.length > 1 ? "s" : ""}` : "aucune sur cette rue"} />
              </div>
              <div className={`${CARTE} p-4`}>
                <p className="alx-mont m-0 mb-2 text-[10.5px] uppercase tracking-[.14em] text-brume">
                  {fonds.comparables_rue.length ? "Les comparables de la rue" : "Les cessions de la commune"}
                </p>
                <div className="max-h-[360px] overflow-y-auto">
                  {(fonds.comparables_rue.length ? fonds.comparables_rue : r.cessions).slice(0, 25).map((c) => (
                    <div key={c.id} className="border-b border-trait py-2 last:border-b-0">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="min-w-0 truncate text-[12.5px] text-encre">{c.acquereur || "Acquéreur non nommé"}</span>
                        <span className="flex-shrink-0 tabular-nums text-[12.5px] font-medium text-menthe-texte">{euros(c.prix)}</span>
                      </div>
                      <p className="m-0 truncate text-[11px] text-brume">
                        {quand(c.date)}{c.adresse ? ` · ${c.adresse}` : ""}{c.vendeur ? ` · cédé par ${c.vendeur}` : ""}
                      </p>
                      {c.activite && <p className="m-0 mt-0.5 line-clamp-2 text-[11px] text-ardoise">{c.activite}</p>}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <p className="m-0 mt-5 text-[10.5px] italic leading-[1.6] text-brume">
        Les murs viennent de DVF, les ventes enregistrées par l&apos;administration fiscale, localisées au point.
        Les fonds viennent du BODACC, où le prix de cession est écrit dans l&apos;annonce légale : il est localisé à l&apos;adresse
        postale, jamais au mètre près — les comparables se rapprochent donc par nom de rue.
        Une annonce de vente sur deux ne porte pas de prix (fusion, apport, cession entre associés) : elle compte dans le total, pas dans la médiane.
        {r.du_cache ? " Cessions reprises du cache." : ""}
      </p>
    </div>
  );
}

export default function KTransactions() {
  const user = useUser();
  const qc = useQueryClient();
  const [adresse, setAdresse] = useState("");
  const [annees, setAnnees] = useState(5);
  const [suggestions, setSuggestions] = useState([]);
  const choisie = useRef("");
  const [vue, setVue] = useState(null);

  const { data } = useQuery({ queryKey: ["ktransactions"], queryFn: () => base44.request("GET", "/api/ktransactions"), enabled: user?.role === "admin" });
  const recherches = data?.recherches || [];

  React.useEffect(() => {
    const q = adresse.trim();
    if (q.length < 3 || q === choisie.current) { setSuggestions([]); return; }
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`https://api-adresse.data.gouv.fr/search/?autocomplete=1&limit=5&q=${encodeURIComponent(q)}`);
        const f = r.ok ? (await r.json()).features || [] : [];
        setSuggestions(f.map((x) => x.properties?.label).filter(Boolean));
      } catch { /* BAN injoignable */ }
    }, 250);
    return () => clearTimeout(t);
  }, [adresse]);

  const analyser = useMutation({
    mutationFn: (texte) => base44.request("POST", "/api/ktransactions", { body: { adresse: texte, annees } }),
    onSuccess: (r) => { setVue(r); setSuggestions([]); qc.invalidateQueries({ queryKey: ["ktransactions"] }); },
    onError: (e) => toast.error(e?.message || "Analyse impossible"),
  });

  if (!user || user.role !== "admin") return null;
  if (vue) return <Resultat r={vue} onRetour={() => setVue(null)} />;

  return (
    <div className="mx-auto max-w-[900px] px-4 pb-20 pt-10">
      <p className="alx-mont m-0 text-[11px] uppercase tracking-[.2em] text-menthe-texte">K-Data</p>
      <h1 className="mt-2 mb-2 text-[30px] font-light tracking-[-0.01em] text-encre">K-Transactions</h1>
      <p className="m-0 mb-7 max-w-[620px] text-[13.5px] leading-[1.7] text-ardoise">
        Ce que les murs et les fonds se sont vraiment vendus autour d&apos;une adresse : prix au m² des locaux, prix de cession
        des fonds de commerce, et les comparables de la rue.
      </p>

      <div className={`${CARTE} p-5`}>
        <label className="alx-mont mb-1.5 block text-[10.5px] uppercase tracking-[.14em] text-encre">Adresse</label>
        <div className="relative">
          <div className="flex items-center gap-2 rounded-[10px] border border-bord bg-surface px-3 focus-within:border-menthe">
            <Search className="h-4 w-4 flex-shrink-0 text-brume" />
            <input value={adresse} onChange={(e) => setAdresse(e.target.value)} placeholder="49 rue Dabray, 06000 Nice"
              onKeyDown={(e) => { if (e.key === "Enter" && adresse.trim().length >= 5) analyser.mutate(adresse); }}
              className="h-11 w-full bg-transparent text-[14px] text-encre outline-none placeholder:text-brume" />
          </div>
          {suggestions.length > 0 && (
            <ul className="absolute left-0 right-0 top-[48px] z-20 m-0 list-none overflow-hidden rounded-[10px] border border-bord bg-surface-pleine p-0 shadow-[0_18px_40px_rgba(0,0,0,0.35)]">
              {suggestions.map((s) => <li key={s}><button onClick={() => { choisie.current = s; setAdresse(s); setSuggestions([]); }} className="block w-full px-3 py-2 text-left text-[13px] text-craie hover:bg-relief hover:text-encre">{s}</button></li>)}
            </ul>
          )}
        </div>

        <label className="alx-mont mb-1.5 mt-4 block text-[10.5px] uppercase tracking-[.14em] text-encre">Profondeur d&apos;historique</label>
        <div className="flex h-11 items-center gap-1 rounded-[10px] border border-bord bg-surface px-1">
          {ANNEES.map((x) => (
            <button key={x} onClick={() => setAnnees(x)} className={`flex-1 rounded-[8px] py-1.5 text-[12px] tabular-nums ${annees === x ? "bg-menthe/[0.14] text-menthe-texte" : "text-ardoise hover:text-encre"}`}>{x} ans</button>
          ))}
        </div>

        <p className="mt-4 mb-0 text-[11.5px] leading-[1.6] text-brume">
          Les murs viennent de DVF, les fonds du BODACC. Sources ouvertes, aucun crédit dépensé.
        </p>
        <button onClick={() => analyser.mutate(adresse)} disabled={analyser.isPending || adresse.trim().length < 5}
          className="mt-4 inline-flex h-11 items-center gap-2 rounded-full bg-menthe px-6 text-[12.5px] font-medium uppercase tracking-[.12em] text-sur-menthe disabled:opacity-50">
          {analyser.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}Analyser le marché
        </button>
      </div>

      <h2 className="mt-10 mb-3 text-[17px] font-medium text-encre">Analyses récentes</h2>
      {!recherches.length ? <p className="m-0 text-[13px] text-brume">Aucune pour l&apos;instant.</p> : (
        <ul className="m-0 list-none p-0">
          {recherches.map((x) => (
            <li key={x.id}>
              <button onClick={() => { choisie.current = x.adresse; setAdresse(x.adresse); analyser.mutate(x.adresse); }} disabled={analyser.isPending}
                className="flex w-full items-center gap-3 border-b border-trait py-3 text-left hover:bg-surface disabled:opacity-60">
                <Clock className="h-3.5 w-3.5 flex-shrink-0 text-brume" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] text-encre">{x.adresse}</span>
                  <span className="block text-[11px] text-brume">{quand(x.le)}{x.par ? ` · ${x.par}` : ""}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
