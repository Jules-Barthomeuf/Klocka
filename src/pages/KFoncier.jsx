import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, Loader2, X, ChevronLeft, Building2, Mail, Phone, ExternalLink, Clock } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useUser } from "@/components/providers/UserProvider";
import { toast } from "@/components/ui/avis";
import CarteParcelles from "@/components/kdata/CarteParcelles";
import FondHalo from "@/components/projet/FondHalo";
import { effectif } from "@/components/kzoning/FicheSociete";

// K-Foncier : les parcelles autour d'une adresse, et qui les possède.
//
// La carte est là dès l'arrivée, comme dans K-Zoning, avec le panneau de
// recherche en haut à gauche et les dernières recherches dessous. Une adresse
// posée, les parcelles se dessinent avec leur contenance : en vert celles
// dont on connaît au moins une personne morale propriétaire, cliquables ; en
// gris les autres. Une parcelle cliquée ouvre sa fiche en plein écran : les
// propriétaires à gauche, la vue de la rue et le plan de la parcelle à droite.
//
// Les personnes physiques ne sont pas publiques : une parcelle grise a peut-
// être un propriétaire, mais pas une société connue. L'écran le dit.

const CLE_MAPS = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";
const quand = (iso) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "");
const ANNEE = new Date().getFullYear();

const niveau = (n) => {
  if (n == null || n === "") return "—";
  const k = Number(n);
  if (!Number.isFinite(k)) return n;
  if (k === 0) return "RDC";
  if (k < 0) return `Sous-sol ${-k}`;
  return k === 1 ? "1er étage" : `${k}e étage`;
};
const initiales = (nom) => String(nom || "").split(/\s+/).filter(Boolean).slice(0, 2).map((m) => m[0]).join("").toUpperCase() || "?";
const chercherSurLeWeb = (q) => window.open(`https://www.google.com/search?q=${encodeURIComponent(q)}`, "_blank", "noopener");

function Ligne({ label, children }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-trait py-2 text-[13px]">
      <span className="flex-shrink-0 text-ardoise">{label}</span>
      <span className="min-w-0 text-right text-encre">{children ?? "—"}</span>
    </div>
  );
}

/** Un propriétaire : ses lots, puis sa société. */
function Proprietaire({ p }) {
  const s = p.societe;
  const [ouvert, setOuvert] = useState(true);
  return (
    <div className="mb-3 overflow-hidden rounded-[14px] border border-trait bg-surface">
      <button onClick={() => setOuvert((o) => !o)} className="flex w-full items-start gap-3 px-4 py-3 text-left">
        <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[10px] border border-trait bg-relief text-[12px] font-semibold text-menthe-texte">{initiales(p.nom)}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-medium text-encre">{p.nom || "Personne morale"}</span>
          <span className="block text-[11.5px] text-ardoise">{p.droit || "Propriétaire"}{p.forme ? ` · ${p.forme}` : ""}</span>
        </span>
        <span className="alx-mont flex-shrink-0 rounded-full border border-trait px-2.5 py-1 text-[10.5px] uppercase tracking-[.1em] text-ardoise">
          {p.lots.length} lot{p.lots.length > 1 ? "s" : ""} concerné{p.lots.length > 1 ? "s" : ""}
        </span>
      </button>

      {ouvert && (
        <div className="border-t border-trait px-4 pb-4">
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="text-left text-[10.5px] uppercase tracking-[.1em] text-brume">
                  <th className="py-1.5 pr-3 font-medium">Niveau</th><th className="py-1.5 pr-3 font-medium">Bâtiment</th><th className="py-1.5 pr-3 font-medium">Entrée</th><th className="py-1.5 font-medium">Porte</th>
                </tr>
              </thead>
              <tbody>
                {p.lots.map((l, i) => (
                  <tr key={i} className="border-t border-trait text-encre">
                    <td className="py-1.5 pr-3">{niveau(l.niveau)}</td><td className="py-1.5 pr-3">{l.batiment || "—"}</td><td className="py-1.5 pr-3">{l.entree || "—"}</td><td className="py-1.5 tabular-nums">{l.porte || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="alx-mont mt-4 mb-1 text-[10.5px] uppercase tracking-[.14em] text-menthe-texte">Informations sur l&apos;entreprise</p>
          {s ? (
            <>
              <Ligne label="SIREN"><span className="tabular-nums">{s.siren}</span></Ligne>
              <Ligne label="Adresse">{s.siege ? `${s.siege.adresse || ""}`.trim() || `${s.siege.code_postal || ""} ${s.siege.commune || ""}` : "—"}</Ligne>
              <Ligne label="Activité">{s.activite_code ? `NAF ${s.activite_code}` : "—"}</Ligne>
              <Ligne label="Création">{s.creation || "—"}</Ligne>
              <Ligne label="Effectif">{effectif(s.effectif_societe)}</Ligne>
              {!s.active && <p className="m-0 mt-2 text-[12px] text-alerte">Société fermée au registre.</p>}

              {s.dirigeants?.length > 0 && (
                <>
                  <p className="alx-mont mt-4 mb-2 text-[10.5px] uppercase tracking-[.14em] text-menthe-texte">
                    {s.dirigeants.length} dirigeant{s.dirigeants.length > 1 ? "s" : ""}
                  </p>
                  {s.dirigeants.map((d, i) => (
                    <div key={i} className="mb-1.5 flex items-center gap-3 rounded-[10px] border border-trait bg-relief px-3 py-2">
                      <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-trait text-[11px] font-semibold text-encre">{initiales(d.nom)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium text-encre">
                          {d.nom}{d.annee_naissance ? ` - ${ANNEE - Number(d.annee_naissance)} ans` : ""}
                        </span>
                        <span className="block text-[11.5px] text-ardoise">
                          {d.qualite || (d.morale ? "Personne morale" : "Dirigeant")}{d.morale ? " · via la holding" : ""}
                        </span>
                      </span>
                    </div>
                  ))}
                </>
              )}

              <div className="mt-4 flex flex-wrap gap-1.5">
                <button onClick={() => chercherSurLeWeb(`${s.nom} ${s.siege?.commune || ""} email`)} className="inline-flex items-center gap-1.5 rounded-full border border-bord px-3 py-1.5 text-[11px] uppercase tracking-[.1em] text-ardoise hover:text-encre">
                  <Mail className="h-3.5 w-3.5" />Trouver l&apos;email
                </button>
                <button onClick={() => chercherSurLeWeb(`${s.nom} ${s.siege?.commune || ""} téléphone`)} className="inline-flex items-center gap-1.5 rounded-full border border-bord px-3 py-1.5 text-[11px] uppercase tracking-[.1em] text-ardoise hover:text-encre">
                  <Phone className="h-3.5 w-3.5" />Trouver le téléphone
                </button>
                <a href={`https://annuaire-entreprises.data.gouv.fr/entreprise/${s.siren}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-full border border-bord px-3 py-1.5 text-[11px] uppercase tracking-[.1em] text-ardoise hover:text-encre">
                  <ExternalLink className="h-3.5 w-3.5" />Annuaire
                </a>
              </div>
            </>
          ) : (
            <p className="m-0 text-[12.5px] text-ardoise">
              {p.siren ? "L'annuaire des entreprises n'a pas rendu de fiche pour ce SIREN." : "Pas de SIREN au fichier : une personne morale sans immatriculation (copropriété, collectivité, association)."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** La fiche d'une parcelle, en plein écran. */
function FicheParcelle({ parcelle: p, voisines, point, onFermer }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["kfoncier", "parcelle", p.idu],
    queryFn: () => base44.request("GET", `/api/kfoncier/parcelle?${new URLSearchParams({ insee: p.code_insee, section: p.section, numero: p.numero })}`),
  });
  useEffect(() => {
    const k = (e) => { if (e.key === "Escape") onFermer(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onFermer]);

  const centre = (() => {
    const g = p.geometry;
    const anneau = g?.type === "MultiPolygon" ? g.coordinates?.[0]?.[0] : g?.coordinates?.[0];
    if (!anneau?.length) return point;
    const pts = anneau.length > 3 ? anneau.slice(0, -1) : anneau;
    return { lat: pts.reduce((s, x) => s + x[1], 0) / pts.length, lon: pts.reduce((s, x) => s + x[0], 0) / pts.length };
  })();
  const proprietaires = data?.proprietaires || [];

  return (
    <div className="fixed inset-0 z-[600] flex flex-col">
      <FondHalo />
      <div className="relative z-10 mx-auto flex w-full max-w-[1240px] flex-1 flex-col overflow-hidden px-4 pt-6">
        <div className="mb-4 flex flex-shrink-0 items-start justify-between gap-4">
          <div>
            <button onClick={onFermer} className="mb-2 inline-flex items-center gap-1.5 text-[12.5px] text-ardoise hover:text-encre"><ChevronLeft className="h-4 w-4" />Retour à la carte</button>
            <p className="alx-mont m-0 text-[10.5px] uppercase tracking-[.16em] text-menthe-texte">Parcelle {p.section} {p.numero}</p>
            <h1 className="m-0 mt-1 text-[24px] font-light text-encre">{p.contenance != null ? `${p.contenance.toLocaleString("fr-FR")} m²` : "Contenance inconnue"} · {point?.label}</h1>
            <p className="m-0 mt-1 text-[12px] text-ardoise">
              {isLoading ? "Lecture du fichier des personnes morales…" : `${proprietaires.length} propriétaire${proprietaires.length > 1 ? "s" : ""} personne${proprietaires.length > 1 ? "s" : ""} morale${proprietaires.length > 1 ? "s" : ""}`}
              {data?.annee ? ` · situation au 1er janvier ${data.annee}` : ""}
            </p>
          </div>
          <button onClick={onFermer} title="Fermer" className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-bord text-ardoise hover:text-encre"><X className="h-4 w-4" /></button>
        </div>

        <div className="grid min-h-0 flex-1 gap-4 pb-6 lg:grid-cols-[minmax(0,1fr)_460px]">
          <div className="min-h-0 overflow-y-auto rounded-[18px] border border-trait bg-surface p-4">
            <p className="alx-mont m-0 mb-3 text-[10.5px] uppercase tracking-[.14em] text-brume">Propriétaires détenant un bien à cette adresse</p>
            {error && <p className="m-0 text-[13px] text-alerte">{error.message}</p>}
            {isLoading && <p className="m-0 flex items-center gap-2 text-[13px] text-ardoise"><Loader2 className="h-4 w-4 animate-spin" />Lecture…</p>}
            {!isLoading && !proprietaires.length && !error && <p className="m-0 text-[13px] text-ardoise">Aucune personne morale au fichier pour cette parcelle.</p>}
            {proprietaires.map((x) => <Proprietaire key={x.cle} p={x} />)}
            <p className="m-0 mt-2 text-[10.5px] italic leading-[1.5] text-brume">
              Source : fichier des locaux des personnes morales (DGFiP, licence ouverte) et annuaire des entreprises. Les personnes physiques ne sont pas publiques.
            </p>
          </div>

          <div className="flex min-h-0 flex-col gap-4">
            <div className="overflow-hidden rounded-[18px] border border-trait bg-surface">
              <p className="alx-mont m-0 border-b border-trait px-4 py-2.5 text-[10.5px] uppercase tracking-[.14em] text-brume">Vue de la rue</p>
              {CLE_MAPS && centre ? (
                <iframe title="Vue de la rue" className="block h-[260px] w-full border-0" loading="lazy" referrerPolicy="no-referrer-when-downgrade" allowFullScreen
                  src={`https://www.google.com/maps/embed/v1/streetview?key=${CLE_MAPS}&location=${centre.lat},${centre.lon}&heading=0&pitch=0&fov=90`} />
              ) : <p className="m-0 px-4 py-6 text-[12.5px] text-ardoise">Clé Google Maps absente.</p>}
            </div>
            <div className="relative min-h-[300px] flex-1 overflow-hidden rounded-[18px] border border-trait bg-surface">
              <CarteParcelles point={null} centre={centre} parcelles={voisines} misesEnAvant={[p.idu]} zoom={19} interactif={false} onErreur={() => {}} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function KFoncier() {
  const user = useUser();
  const qc = useQueryClient();
  const [adresse, setAdresse] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const choisie = useRef("");
  const [vue, setVue] = useState(null);
  const [ouverte, setOuverte] = useState(null);

  const { data } = useQuery({ queryKey: ["kfoncier"], queryFn: () => base44.request("GET", "/api/kfoncier"), enabled: user?.role === "admin" });
  const recherches = data?.recherches || [];

  useEffect(() => {
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
    mutationFn: (texte) => base44.request("POST", "/api/kfoncier", { body: { adresse: texte } }),
    onSuccess: (r) => { setVue(r); setOuverte(null); setSuggestions([]); qc.invalidateQueries({ queryKey: ["kfoncier"] }); },
    onError: (err) => toast.error(err?.message || "Analyse impossible"),
  });
  const ouvrirParcelle = useCallback((p) => setOuverte(p), []);

  if (!user || user.role !== "admin") return null;

  const carteCentre = vue?.point || null;
  const voisines = ouverte && vue ? vue.parcelles.filter((x) => x.section === ouverte.section) : [];

  return (
    <div className="relative h-[calc(100dvh-56px)] overflow-hidden">
      <CarteParcelles point={carteCentre} parcelles={vue?.parcelles || []} onParcelle={ouvrirParcelle} onErreur={(m) => toast.error(m)} />

      <div className="absolute left-4 top-4 z-[500] flex max-h-[calc(100%-2rem)] w-[340px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-[16px] border border-bord bg-fond/70 backdrop-blur-xl">
        <div className="border-b border-trait p-3">
          <div className="relative">
            <div className="flex items-center gap-2 rounded-[10px] border border-bord bg-surface px-3 focus-within:border-menthe">
              <Search className="h-4 w-4 flex-shrink-0 text-brume" />
              <input value={adresse} onChange={(ev) => setAdresse(ev.target.value)} placeholder="Une adresse à analyser"
                onKeyDown={(ev) => { if (ev.key === "Enter" && adresse.trim().length >= 5) analyser.mutate(adresse); }}
                className="h-10 w-full bg-transparent text-[13.5px] text-encre outline-none placeholder:text-brume" />
              {analyser.isPending && <Loader2 className="h-4 w-4 animate-spin text-menthe" />}
            </div>
            {suggestions.length > 0 && (
              <ul className="absolute left-0 right-0 top-[44px] z-20 m-0 list-none overflow-hidden rounded-[10px] border border-bord bg-surface-pleine p-0 shadow-[0_18px_40px_rgba(0,0,0,0.45)]">
                {suggestions.map((s) => <li key={s}><button onClick={() => { choisie.current = s; setAdresse(s); setSuggestions([]); analyser.mutate(s); }} className="block w-full px-3 py-2 text-left text-[13px] text-craie hover:bg-relief hover:text-encre">{s}</button></li>)}
              </ul>
            )}
          </div>
        </div>

        {vue ? (
          <div className="border-b border-trait px-4 py-3">
            <p className="m-0 truncate text-[13px] font-medium text-encre" title={vue.point.label}>{vue.point.label}</p>
            <p className="m-0 mt-1 text-[12px] text-ardoise">
              {vue.total} parcelle{vue.total > 1 ? "s" : ""} dans 150 m · {vue.avec_proprietaires} avec propriétaire{vue.avec_proprietaires > 1 ? "s" : ""} connu{vue.avec_proprietaires > 1 ? "s" : ""}
            </p>
            <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-ardoise">
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-vert" />Avec propriétaires : cliquable</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-ardoise" />Sans personne morale connue</span>
            </div>
            <p className="m-0 mt-2 text-[10.5px] leading-[1.5] text-brume">
              {vue.annee ? `Fichier des personnes morales, situation au 1er janvier ${vue.annee}. ` : ""}Les personnes physiques ne sont pas publiques.
              {vue.erreurs?.length ? ` Sections non lues : ${vue.erreurs.join(" ; ")}.` : ""}
            </p>
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto">
          <p className="alx-mont m-0 px-4 pb-1 pt-3 text-[10.5px] uppercase tracking-[.14em] text-brume">Dernières recherches</p>
          {!recherches.length ? <p className="m-0 px-4 pb-3 text-[12.5px] text-brume">Aucune pour l&apos;instant.</p> : recherches.map((r) => (
            <button key={r.id} onClick={() => { choisie.current = r.adresse; setAdresse(r.adresse); analyser.mutate(r.adresse); }} disabled={analyser.isPending}
              className="flex w-full items-center gap-2.5 border-b border-trait px-4 py-2.5 text-left hover:bg-surface disabled:opacity-60">
              <Clock className="h-3.5 w-3.5 flex-shrink-0 text-brume" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] text-encre">{r.adresse}</span>
                <span className="block text-[11px] text-brume">{quand(r.le)}{r.par ? ` · ${r.par}` : ""}</span>
              </span>
            </button>
          ))}
        </div>
      </div>

      {!vue && !analyser.isPending && (
        <div className="absolute bottom-6 left-1/2 z-[500] -translate-x-1/2 rounded-full border border-bord bg-fond/80 px-4 py-2 text-[12px] text-ardoise backdrop-blur-xl">
          <Building2 className="mr-1.5 inline h-3.5 w-3.5 text-menthe" />Choisissez une adresse : les parcelles autour s&apos;affichent avec leur contenance.
        </div>
      )}

      {ouverte && createPortal(
        <FicheParcelle parcelle={ouverte} voisines={voisines} point={vue?.point} onFermer={() => setOuverte(null)} />,
        document.body,
      )}
    </div>
  );
}
