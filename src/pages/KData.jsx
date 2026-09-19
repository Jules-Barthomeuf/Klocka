import React, { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { ArrowUp, ArrowUpRight, Check, ChevronDown, Clock, Folder, FolderPlus, Loader2, Search, Wrench, X, XCircle } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useUser } from "@/components/providers/UserProvider";
import { MODULES_KDATA } from "@/lib/kdata-modules";
import { toast } from "@/components/ui/avis";
import { J, alpha } from "@/design/jetons";

// K-Data : le point de départ commun des huit outils.
//
// Le geste tient en deux temps, comme le chat du tableau de bord Klocka : à
// gauche de la barre on choisit les outils, au milieu on donne l'adresse, et
// chaque analyse part de son côté. Dessous, la file : ce qui tourne encore en
// tête, puis les plus récentes. Une analyse prête s'ouvre dans son outil d'un
// clic ; plusieurs analyses cochées se rangent dans un dossier.
//
// Les dossiers sont ceux de K-Zoning, qui rangeaient déjà des zones : une
// seule notion pour tout K-Data. Les cartes des outils restent en bas, pour
// qui veut entrer dans un outil seul.

const CARTE = "rounded-[18px] border border-trait bg-surface";
const CLE_OUTILS = "kdata-outils";
const quand = (iso) => (iso ? new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "");
const MODULES_PAR_CLE = Object.fromEntries(MODULES_KDATA.map((m) => [m.cle, m]));

// La dernière sélection d'outils se garde dans le navigateur : on relance
// souvent les mêmes. Une lecture qui échoue rend une sélection vide.
const lireOutils = () => { try { return new Set(JSON.parse(localStorage.getItem(CLE_OUTILS) || "[]")); } catch { return new Set(); } };
const garderOutils = (s) => { try { localStorage.setItem(CLE_OUTILS, JSON.stringify([...s])); } catch { /* sans stockage, la sélection ne survit pas à la page */ } };

/** Une carte de module : le nom, ce qu'il fait, son état. */
function CarteModule({ module: m }) {
  const Icone = m.icone;
  return (
    <Link to={m.chemin} className={`${CARTE} group block p-[18px] transition-colors duration-300 hover:border-menthe/40`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[10px] border border-trait bg-relief">
          <Icone className="h-[17px] w-[17px] text-menthe" />
        </div>
        <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border border-bord transition-colors group-hover:border-menthe">
          <ArrowUpRight className="h-3.5 w-3.5 text-ardoise transition-colors group-hover:text-menthe-clair" />
        </div>
      </div>
      <h2 className="m-0 mt-4 text-[15px] font-medium tracking-[-0.01em] text-encre">{m.nom}</h2>
      <p className="mt-1.5 mb-0 text-[12.5px] leading-[1.6] text-ardoise">{m.phrase}</p>
    </Link>
  );
}

/** Le composeur : les outils à gauche, l'adresse au milieu, l'envoi à droite. */
function Composeur({ onLancer, enCours }) {
  const [outils, setOutils] = useState(lireOutils);
  const [menu, setMenu] = useState(false);
  const [adresse, setAdresse] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const choisie = useRef("");

  useEffect(() => { garderOutils(outils); }, [outils]);

  useEffect(() => {
    const q = adresse.trim();
    if (q.length < 3 || q === choisie.current) { setSuggestions([]); return undefined; }
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`https://api-adresse.data.gouv.fr/search/?autocomplete=1&limit=5&q=${encodeURIComponent(q)}`);
        const f = r.ok ? (await r.json()).features || [] : [];
        setSuggestions(f.map((x) => x.properties?.label).filter(Boolean));
      } catch { /* la Base Adresse ne répond pas : on saisit à la main */ }
    }, 250);
    return () => clearTimeout(t);
  }, [adresse]);

  const basculer = (cle) => setOutils((s) => { const n = new Set(s); n.has(cle) ? n.delete(cle) : n.add(cle); return n; });
  const tous = outils.size === MODULES_KDATA.length;
  const pret = adresse.trim().length >= 5 && outils.size > 0 && !enCours;
  const envoyer = () => { if (!pret) return; onLancer({ adresse: adresse.trim(), outils: [...outils] }); setAdresse(""); choisie.current = ""; setSuggestions([]); };

  return (
    <div className="relative">
      <div className="flex items-center gap-3 rounded-full py-3 pl-4 pr-3" style={{ background: J["barre"], border: `1px solid ${alpha("craie", 0.11)}` }}>
        {/* Les outils : un menu à cocher, comme le mode du chat Klocka. */}
        <div className="relative flex-none">
          <button type="button" onClick={() => setMenu((o) => !o)} aria-expanded={menu} aria-haspopup="menu"
            title="Choisir les outils à lancer"
            className="flex items-center gap-1.5 rounded-full px-3 py-2 transition-colors"
            style={{ background: outils.size ? alpha("menthe", 0.16) : J["barre-relief"] }}>
            <Wrench className="h-4 w-4" style={{ color: outils.size ? J["menthe"] : J["ardoise"] }} />
            <span className="text-[12.5px]" style={{ color: outils.size ? J["menthe"] : J["ardoise"] }}>{outils.size ? `${outils.size} outil${outils.size > 1 ? "s" : ""}` : "Outils"}</span>
            <ChevronDown className={`h-2.5 w-2.5 text-ardoise transition-transform ${menu ? "rotate-180" : ""}`} />
          </button>
          {menu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
              <div role="menu" className="absolute left-0 top-full z-20 mt-3 w-[360px] overflow-hidden rounded-bloc text-left shadow-[0_20px_50px_rgba(0,0,0,.6)]" style={{ background: J["barre"] }}>
                <div className="flex items-center justify-between border-b border-bord px-4 pb-2.5 pt-3.5">
                  <span className="font-pill text-[11px] font-medium uppercase tracking-[.16em] text-ardoise">Les outils à lancer</span>
                  <button type="button" onClick={() => setOutils(tous ? new Set() : new Set(MODULES_KDATA.map((m) => m.cle)))} className="text-[11px] text-menthe-texte hover:text-encre">
                    {tous ? "Aucun" : "Tous"}
                  </button>
                </div>
                <div className="p-1.5">
                  {MODULES_KDATA.map((m) => {
                    const Icone = m.icone;
                    const actif = outils.has(m.cle);
                    return (
                      <button key={m.cle} role="menuitemcheckbox" aria-checked={actif} onClick={() => basculer(m.cle)}
                        className="flex w-full items-center gap-3 rounded-champ px-3 py-2.5 text-left transition-colors hover:bg-encre/[0.05]"
                        style={{ background: actif ? alpha("menthe", 0.1) : "transparent" }} title={m.phrase}>
                        <span className={`flex h-4 w-4 flex-none items-center justify-center rounded-[4px] border ${actif ? "border-menthe bg-menthe" : "border-bord-vif"}`}>
                          {actif && <Check className="h-3 w-3" style={{ color: J["sur-menthe"] }} />}
                        </span>
                        <Icone className="h-4 w-4 flex-none" style={{ color: actif ? J["menthe"] : J["ardoise"] }} />
                        <span className="text-[13.5px]" style={{ color: actif ? J["menthe"] : J["craie"] }}>{m.nom}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>

        <input value={adresse} onChange={(e) => setAdresse(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); envoyer(); } }}
          placeholder={outils.size ? "L'adresse à analyser : 49 rue Dabray, 06000 Nice" : "Choisissez d'abord des outils, puis donnez l'adresse"}
          disabled={enCours}
          className="min-w-0 flex-1 border-0 bg-transparent py-1 text-[15px] text-encre outline-none placeholder:text-brume disabled:opacity-50" />

        <button type="button" onClick={envoyer} disabled={!pret} aria-label="Lancer les analyses" title="Lancer les analyses"
          className="grid h-11 w-11 flex-none place-items-center rounded-full transition-opacity disabled:opacity-40"
          style={{ background: J["menthe"], color: J["sur-menthe"] }}>
          {enCours ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-[17px] w-[17px]" strokeWidth={2} />}
        </button>
      </div>
      {suggestions.length > 0 && (
        <ul className="absolute left-[120px] right-16 top-[58px] z-20 m-0 list-none overflow-hidden rounded-[10px] border border-bord bg-surface-pleine p-0 shadow-[0_18px_40px_rgba(0,0,0,0.35)]">
          {suggestions.map((s) => (
            <li key={s}><button type="button" onClick={() => { choisie.current = s; setAdresse(s); setSuggestions([]); }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-craie hover:bg-relief hover:text-encre"><Search className="h-3.5 w-3.5 text-brume" />{s}</button></li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Une analyse dans la file : sa case, son outil, son adresse, son état. */
function Ligne({ a, cochee, onCocher, onOuvrir }) {
  const m = MODULES_PAR_CLE[a.outil];
  const Icone = m?.icone || Wrench;
  const ouvrable = !!a.lien;
  return (
    <div className={`flex items-center gap-3 border-b border-trait py-2.5 last:border-b-0 ${ouvrable ? "cursor-pointer hover:bg-relief" : ""}`} onClick={() => ouvrable && onOuvrir(a)}>
      <label className="flex h-9 w-9 flex-shrink-0 cursor-pointer items-center justify-center" onClick={(e) => e.stopPropagation()}>
        <input type="checkbox" checked={cochee} onChange={() => onCocher(a.id)} className="h-4 w-4 accent-menthe" aria-label={`Cocher ${a.nom_outil || a.outil}`} />
      </label>
      <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-[8px] border border-trait bg-relief">
        <Icone className="h-4 w-4 text-menthe" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-[13.5px] font-medium text-encre">{a.nom_outil || m?.nom || a.outil}</span>
          <span className="truncate text-[12.5px] text-ardoise">{a.libelle || a.adresse}</span>
        </span>
        <span className={`block truncate text-[11.5px] ${a.etat === "echec" ? "text-alerte" : "text-brume"}`}>
          {a.etat === "en_cours" ? "en cours…" : a.etat === "echec" ? a.erreur || "échec" : a.resume || "prête"}
        </span>
      </span>
      <span className="flex flex-shrink-0 items-center gap-2 text-[11px] text-brume">
        {a.dossier_nom && <span className="inline-flex items-center gap-1 rounded-full border border-trait px-2 py-0.5 text-ardoise"><Folder className="h-3 w-3" />{a.dossier_nom}</span>}
        {a.etat === "en_cours" ? <Loader2 className="h-3.5 w-3.5 animate-spin text-menthe" /> : a.etat === "echec" ? <XCircle className="h-3.5 w-3.5 text-alerte" /> : <Check className="h-3.5 w-3.5 text-vert" />}
        <span className="tabular-nums">{quand(a.cree_le)}</span>
        {ouvrable && <ArrowUpRight className="h-3.5 w-3.5 text-ardoise" />}
      </span>
    </div>
  );
}

export default function KData() {
  const user = useUser();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [coches, setCoches] = useState(() => new Set());
  const [dossierChoisi, setDossierChoisi] = useState("");
  const [filtre, setFiltre] = useState("tous");

  const { data } = useQuery({
    queryKey: ["kdata-analyses"],
    queryFn: () => base44.request("GET", "/api/kdata/analyses"),
    enabled: user?.role === "admin",
    // Tant qu'une analyse tourne, la file se relit toutes les trois secondes.
    refetchInterval: (q) => ((q.state.data?.analyses || []).some((a) => a.etat === "en_cours") ? 3000 : false),
  });
  const analyses = data?.analyses || [];
  const dossiers = data?.dossiers || [];
  const invalider = () => qc.invalidateQueries({ queryKey: ["kdata-analyses"] });

  const lancer = useMutation({
    mutationFn: (corps) => base44.request("POST", "/api/kdata/analyses", { body: corps }),
    onSuccess: (r) => { invalider(); toast.success(`${r.ids.length} analyse${r.ids.length > 1 ? "s" : ""} lancée${r.ids.length > 1 ? "s" : ""}`); },
    onError: (e) => toast.error(e?.message || "Lancement impossible"),
  });
  const ranger = useMutation({
    mutationFn: ({ ids, dossier_id }) => base44.request("PATCH", "/api/kdata/analyses", { body: { ids, dossier_id } }),
    onSuccess: (r, v) => { invalider(); setCoches(new Set()); toast.success(v.dossier_id ? `${r.rangees} analyse${r.rangees > 1 ? "s" : ""} rangée${r.rangees > 1 ? "s" : ""}` : "Sorties du dossier"); },
    onError: (e) => toast.error(e?.message || "Rangement impossible"),
  });
  const nouveauDossier = useMutation({
    mutationFn: (nom) => base44.request("POST", "/api/kdata/dossiers", { body: { nom } }),
    onSuccess: (r) => { invalider(); setDossierChoisi(r.dossier.id); },
    onError: (e) => toast.error(e?.message || "Création impossible"),
  });
  const supprimer = useMutation({
    mutationFn: (id) => base44.request("DELETE", `/api/kdata/analyses/${id}`),
    onSuccess: () => { invalider(); setCoches(new Set()); },
    onError: (e) => toast.error(e?.message || "Suppression impossible"),
  });

  const visibles = useMemo(() => analyses.filter((a) => filtre === "tous" || (filtre === "sans" ? !a.dossier_id : a.dossier_id === filtre)), [analyses, filtre]);
  const enCours = analyses.filter((a) => a.etat === "en_cours");
  const cocher = (id) => setCoches((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  if (!user || user.role !== "admin") return null;

  return (
    <div className="min-h-screen text-encre">
      <div className="mx-auto max-w-[1100px] px-6 pb-20 pt-8">
        <header className="mb-6">
          <p className="alx-mont m-0 text-[11px] font-medium uppercase tracking-[.18em] text-menthe">K-Data</p>
          <h1 className="mt-2 mb-0 text-[30px] font-light leading-tight tracking-[-0.02em] text-encre">Une adresse, les analyses que vous voulez</h1>
          <p className="mt-2 mb-0 max-w-[62ch] text-[14px] leading-[1.7] text-ardoise">
            Choisissez les outils, donnez l&apos;adresse : chaque analyse part de son côté et se range ensuite dans le dossier de votre choix.
          </p>
        </header>

        <Composeur onLancer={(c) => lancer.mutate(c)} enCours={lancer.isPending} />

        {/* La file : ce qui tourne, puis le plus récent. */}
        <section className={`${CARTE} mt-6 p-4`}>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
            <p className="alx-mont m-0 text-[10.5px] uppercase tracking-[.14em] text-brume">
              Vos analyses{enCours.length ? ` · ${enCours.length} en cours` : ""} <span className="normal-case tracking-normal">· {visibles.length}</span>
            </p>
            <select value={filtre} onChange={(e) => setFiltre(e.target.value)} className="h-8 rounded-full border border-bord bg-surface px-3 text-[12px] text-ardoise outline-none">
              <option value="tous">Tous les dossiers</option>
              <option value="sans">Sans dossier</option>
              {dossiers.map((d) => <option key={d.id} value={d.id}>{d.nom}</option>)}
            </select>
          </div>

          {/* La barre de rangement : elle n'apparaît qu'avec une case cochée. */}
          {coches.size > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-[12px] border border-menthe/30 bg-menthe/[0.06] px-3 py-2">
              <span className="text-[12.5px] text-encre">{coches.size} cochée{coches.size > 1 ? "s" : ""} ·</span>
              <select value={dossierChoisi} onChange={(e) => setDossierChoisi(e.target.value)} className="h-8 rounded-full border border-bord bg-surface px-3 text-[12px] text-encre outline-none">
                <option value="">Choisir un dossier…</option>
                {dossiers.map((d) => <option key={d.id} value={d.id}>{d.nom}</option>)}
              </select>
              <button type="button" onClick={() => { const nom = window.prompt("Nom du nouveau dossier"); if (nom?.trim()) nouveauDossier.mutate(nom.trim()); }}
                className="inline-flex h-8 items-center gap-1.5 rounded-full border border-bord px-3 text-[11px] uppercase tracking-[.1em] text-ardoise hover:text-encre">
                <FolderPlus className="h-3.5 w-3.5" />Nouveau
              </button>
              <button type="button" disabled={!dossierChoisi || ranger.isPending} onClick={() => ranger.mutate({ ids: [...coches], dossier_id: dossierChoisi })}
                className="inline-flex h-8 items-center gap-1.5 rounded-full bg-menthe px-4 text-[11px] font-medium uppercase tracking-[.1em] text-sur-menthe disabled:opacity-50">
                {ranger.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Folder className="h-3.5 w-3.5" />}Envoyer dans le dossier
              </button>
              <button type="button" onClick={() => ranger.mutate({ ids: [...coches], dossier_id: null })} className="text-[11px] text-brume hover:text-encre">Sortir du dossier</button>
              <button type="button" onClick={() => { if (window.confirm(`Supprimer ${coches.size} analyse${coches.size > 1 ? "s" : ""} de la file ?`)) [...coches].forEach((id) => supprimer.mutate(id)); }} className="text-[11px] text-brume hover:text-alerte">Supprimer</button>
              <button type="button" onClick={() => setCoches(new Set())} className="ml-auto text-brume hover:text-encre" aria-label="Tout décocher"><X className="h-3.5 w-3.5" /></button>
            </div>
          )}

          {!visibles.length ? (
            <p className="m-0 flex items-center gap-2 py-3 text-[13px] text-brume"><Clock className="h-3.5 w-3.5" />Aucune analyse{filtre !== "tous" ? " dans ce dossier" : " pour l'instant"}. Lancez-en une ci-dessus.</p>
          ) : (
            <div>
              {visibles.map((a) => <Ligne key={a.id} a={a} cochee={coches.has(a.id)} onCocher={cocher} onOuvrir={(x) => navigate(x.lien)} />)}
            </div>
          )}
        </section>

        <h2 className="alx-mont mt-10 mb-3 text-[10.5px] uppercase tracking-[.14em] text-brume">Les outils, un par un</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {MODULES_KDATA.map((m) => <CarteModule key={m.cle} module={m} />)}
        </div>
      </div>
    </div>
  );
}
