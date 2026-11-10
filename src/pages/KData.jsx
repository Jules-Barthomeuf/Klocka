import React, { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowUp, Check, ChevronDown, Clock, Folder, Loader2, Search, Square, Wrench, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useUser } from "@/components/providers/UserProvider";
import { MODULES_KDATA, MODULES_LANCABLES } from "@/lib/kdata-modules";
import { toast } from "@/components/ui/avis";
import { J, alpha } from "@/design/jetons";
import { CLASSES_STATUT } from "@/lib/couleur-statut";
import { boutonCrm, outilCrm, Pilules } from "@/components/emailing/module/briques";

// Outils (K-Data jusqu'au 16 oct. 2026) : le point de départ commun des outils.
//
// Le geste tient en deux temps, comme le chat du tableau de bord Klocka : à
// gauche de la barre on choisit les outils, au milieu on donne l'adresse, et
// chaque analyse part de son côté. Dessous, la file : ce qui tourne encore en
// tête, puis les plus récentes. Une analyse prête s'ouvre dans son outil d'un
// clic ; plusieurs analyses cochées se rangent dans un dossier.
//
// Les dossiers sont les affaires de la page Dossiers — « CAFPI de Courbevoie »
// — où une analyse rangée apparaît en onglet, à côté du bail et du marché.
// Les outils restent en bas, en tuiles, pour qui veut entrer dans un outil seul ; depuis le 10 nov. 2026, la page
// prend le cadre du CRM (plus bas, KData).

const CLE_OUTILS = "kdata-outils";
const quand = (iso) => (iso ? new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "");
const MODULES_PAR_CLE = Object.fromEntries(MODULES_KDATA.map((m) => [m.cle, m]));

// La dernière sélection d'outils se garde dans le navigateur : on relance
// souvent les mêmes. Une lecture qui échoue rend une sélection vide.
const lireOutils = () => { try { return new Set(JSON.parse(localStorage.getItem(CLE_OUTILS) || "[]")); } catch { return new Set(); } };
const garderOutils = (s) => { try { localStorage.setItem(CLE_OUTILS, JSON.stringify([...s])); } catch { /* sans stockage, la sélection ne survit pas à la page */ } };

/** Le composeur : les outils à gauche, l'adresse au milieu, l'envoi à droite. */
// --- Les questions que les outils posent avant de partir --------------------
//
// Le schéma vient du serveur : les listes d'options ne sont pas recopiées ici,
// ce sont celles des barèmes des outils eux-mêmes. Cet écran ne fait que les
// poser, et le serveur revérifie tout au lancement.

const conditionOk = (si, v) => !si || String(v?.[si.cle] ?? "") === String(si.vaut);

const defautsDe = (liste) => {
  const d = {};
  for (const q of liste || []) {
    if (q.type === "criteres") d[q.cle] = {};
    else if (q.defaut !== undefined) d[q.cle] = q.defaut;
  }
  return d;
};

const repondu = (v) => String(v ?? "").trim() !== "";

/** Ce qui manque pour lancer un outil, dit en clair sous la barre. */
function manqueDe(liste, valeurs) {
  const v = { ...defautsDe(liste), ...valeurs };
  const defauts = defautsDe(liste);
  const entame = (liste || []).filter((q) => q.groupe).some((q) => repondu(v[q.cle]) && String(v[q.cle]) !== String(defauts[q.cle] ?? ""));
  return (liste || [])
    .filter((q) => q.requis)
    .filter((q) => !q.groupe || entame)
    .filter((q) => conditionOk(q.si, v) && conditionOk(q.requis === true ? null : q.requis, v))
    .filter((q) => !repondu(v[q.cle]))
    .map((q) => q.libelle.toLowerCase());
}

const PASTILLE = "rounded-full px-2.5 py-1 text-[12px] transition-colors";

function Pastille({ actif, onClick, enfant, barre = false, titre = null }) {
  return (
    <button type="button" onClick={onClick} disabled={barre} title={titre || undefined}
      className={`${PASTILLE} ${barre ? "cursor-not-allowed line-through opacity-40" : ""}`}
      style={{ background: actif ? alpha("menthe", 0.16) : J["barre-relief"], color: actif ? J["menthe"] : J["ardoise"] }}>
      {enfant}
    </button>
  );
}

function Question({ q, valeur, onChange }) {
  const etiquette = (
    <p className="m-0 mb-1 text-[11.5px] text-craie">
      {q.libelle}{q.unite ? <span className="text-brume"> ({q.unite})</span> : null}
    </p>
  );

  if (q.type === "choix") {
    return (
      <div>
        {etiquette}
        <div className="flex flex-wrap gap-1.5">
          {q.options.map((o) => (
            <Pastille key={String(o.valeur)} actif={String(valeur ?? "") === String(o.valeur)}
              onClick={() => onChange(o.valeur)} enfant={o.nom} />
          ))}
        </div>
        {q.aide && <p className="m-0 mt-1 text-[10.5px] text-brume">{q.aide}</p>}
      </div>
    );
  }

  if (q.type === "criteres") {
    const choisis = valeur || {};
    const basculer = (gcle, v) => {
      const actuels = choisis[gcle] || [];
      const suite = actuels.includes(v) ? actuels.filter((x) => x !== v) : [...actuels, v];
      onChange({ ...choisis, [gcle]: suite });
    };
    return (
      <div className="sm:col-span-2">
        {etiquette}
        {q.aide && <p className="m-0 mb-2 text-[10.5px] text-brume">{q.aide}</p>}
        <div className="flex flex-col gap-2.5">
          {(q.groupes || []).map((g) => (
            <div key={g.cle}>
              <p className="m-0 mb-1 text-[10.5px] uppercase tracking-[.1em] text-brume">{g.nom}</p>
              <div className="flex flex-wrap gap-1.5">
                {g.options.map((o) => (
                  <Pastille key={o.valeur} actif={(choisis[g.cle] || []).includes(o.valeur)}
                    barre={!!o.indisponible} titre={o.pourquoi}
                    onClick={() => basculer(g.cle, o.valeur)} enfant={o.nom} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      {etiquette}
      <input
        type={q.type === "date" ? "date" : "text"}
        inputMode={q.type === "nombre" ? "decimal" : undefined}
        value={valeur ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={q.exemple || ""}
        className="h-9 w-full rounded-champ border border-bord bg-surface px-3 text-[13px] text-encre outline-none placeholder:text-brume focus:border-menthe max-md:h-10 max-md:text-[16px]" />
      {q.aide && <p className="m-0 mt-1 text-[10.5px] text-brume">{q.aide}</p>}
    </div>
  );
}

/** Un outil et ses questions, repliable : on voit d'abord ce qu'on a choisi. */
function BlocOutil({ outil, liste, note, valeurs, onChange }) {
  const [ouvert, setOuvert] = useState(true);
  const m = MODULES_KDATA.find((x) => x.cle === outil);
  const v = { ...defautsDe(liste), ...valeurs };
  const manque = manqueDe(liste, valeurs);
  const Icone = m?.icone;
  return (
    <section className="border-b border-trait py-3 last:border-b-0 first:pt-0">
      <button type="button" onClick={() => setOuvert((o) => !o)} className="flex w-full items-center gap-2 text-left">
        {Icone && <Icone className="h-3.5 w-3.5 flex-none text-menthe" />}
        <span className="text-[13px] font-medium text-encre">{m?.nom || outil}</span>
        {manque.length > 0 && <span className="text-[11px] text-ambre">il manque {manque.join(", ")}</span>}
        <span className="flex-1" />
        <ChevronDown className={`h-3 w-3 flex-none text-ardoise transition-transform ${ouvert ? "rotate-180" : ""}`} />
      </button>
      {ouvert && (
        <>
          {note && <p className="m-0 mt-1.5 text-[11px] leading-[1.5] text-brume">{note}</p>}
          <div className="mt-2.5 grid gap-3 sm:grid-cols-2">
            {liste.filter((q) => conditionOk(q.si, v)).map((q) => (
              <Question key={q.cle} q={q} valeur={valeurs?.[q.cle] ?? (q.type === "criteres" ? {} : q.defaut)}
                onChange={(x) => onChange(q.cle, x)} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function Composeur({ onLancer, enCours, questions, notes }) {
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
        const r = await fetch(`https://data.geopf.fr/geocodage/search/?autocomplete=1&limit=5&q=${encodeURIComponent(q)}`);
        const f = r.ok ? (await r.json()).features || [] : [];
        setSuggestions(f.map((x) => x.properties?.label).filter(Boolean));
      } catch { /* la Base Adresse ne répond pas : on saisit à la main */ }
    }, 250);
    return () => clearTimeout(t);
  }, [adresse]);

  const basculer = (cle) => setOutils((s) => { const n = new Set(s); n.has(cle) ? n.delete(cle) : n.add(cle); return n; });
  const tous = outils.size === MODULES_LANCABLES.length;

  // Les réponses aux questions des outils choisis. Un outil décoché garde les
  // siennes de côté : le recocher ne fait pas tout resaisir.
  const [reglages, setReglages] = useState({});
  const repondre = (outil, cle, valeur) => setReglages((r) => ({ ...r, [outil]: { ...(r[outil] || {}), [cle]: valeur } }));

  // Dans l'ordre des cartes, pour que le panneau ne saute pas d'un clic à l'autre.
  const aQuestionner = MODULES_LANCABLES
    .filter((m) => outils.has(m.cle) && (questions?.[m.cle] || []).length > 0)
    .map((m) => m.cle);
  const manques = aQuestionner
    .map((o) => ({ outil: o, manque: manqueDe(questions[o], reglages[o]) }))
    .filter((x) => x.manque.length);

  const pret = adresse.trim().length >= 5 && outils.size > 0 && !enCours && manques.length === 0;
  const envoyer = () => {
    if (!pret) return;
    onLancer({ adresse: adresse.trim(), outils: [...outils], reglages });
    setAdresse(""); choisie.current = ""; setSuggestions([]);
  };

  return (
    <div className="relative">
      <div className="flex items-center gap-3 rounded-[12px] border border-bord-doux bg-crm-tableau py-2 pl-2.5 pr-2 max-md:gap-2">
        {/* Les outils : un menu à cocher, comme le mode du chat Klocka. */}
        <div className="relative flex-none">
          <button type="button" onClick={() => setMenu((o) => !o)} aria-expanded={menu} aria-haspopup="menu"
            title="Choisir les outils à lancer"
            className="flex h-8 items-center gap-1.5 rounded-[8px] border border-trait bg-rail-actif px-2.5 transition-colors">
            <Wrench className="h-4 w-4 text-ardoise" />
            <span className="text-[13px] text-encre">{outils.size ? `${outils.size} outil${outils.size > 1 ? "s" : ""}` : "Outils"}</span>
            <ChevronDown className={`h-2.5 w-2.5 text-ardoise transition-transform ${menu ? "rotate-180" : ""}`} />
          </button>
          {menu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
              <div role="menu" className="animate-in fade-in slide-in-from-top-1 duration-150 absolute left-0 top-full z-20 mt-3 w-[360px] overflow-hidden rounded-bloc max-md:max-h-[70vh] max-md:w-[calc(100vw-40px)] max-md:overflow-y-auto text-left shadow-[0_20px_50px_rgba(0,0,0,.6)]" style={{ background: J["barre"] }}>
                <div className="flex items-center justify-between border-b border-bord px-4 pb-2.5 pt-3.5">
                  <span className="font-pill text-[11px] font-medium uppercase tracking-[.16em] text-ardoise">Les outils à lancer</span>
                  <button type="button" onClick={() => setOutils(tous ? new Set() : new Set(MODULES_LANCABLES.map((m) => m.cle)))} className="text-[11px] text-menthe-texte hover:text-encre">
                    {tous ? "Aucun" : "Tous"}
                  </button>
                </div>
                <div className="p-1.5">
                  {MODULES_LANCABLES.map((m) => {
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
                        <span className="min-w-0">
                          <span className="block text-[13.5px]" style={{ color: actif ? J["menthe"] : J["craie"] }}>{m.nom}</span>
                          <span className="block truncate text-[11.5px] text-ardoise">{m.phrase}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>

        <input value={adresse} onChange={(e) => setAdresse(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            // Quand des outils ont des questions, la touche Entrée ne lance
            // plus : on descend remplir, et on lance sous les champs. Sinon
            // l'adresse tapée partirait avant qu'on ait réglé quoi que ce soit.
            if (!aQuestionner.length) envoyer();
          }}
          placeholder={outils.size ? "L'adresse à analyser : 49 rue Dabray, 06000 Nice" : "Choisissez d'abord des outils, puis donnez l'adresse"}
          disabled={enCours}
          className="min-w-0 flex-1 border-0 bg-transparent py-1 text-[15px] text-encre outline-none placeholder:text-brume disabled:opacity-50 max-md:text-[16px]" />

        {/* Sans question à poser, la flèche lance d'ici. Dès qu'un outil en a,
            le lancement descend sous les champs : un seul bouton, au bout du
            formulaire, là où l'on finit de le remplir. */}
        {aQuestionner.length === 0 && (
          <button type="button" onClick={envoyer} disabled={!pret} aria-label="Lancer les analyses" title="Lancer les analyses"
            className="grid h-9 w-9 flex-none place-items-center rounded-full bg-menthe text-sur-menthe transition-opacity disabled:opacity-30">
            {enCours ? <Square className="h-3.5 w-3.5" fill="currentColor" /> : <ArrowUp className="h-4 w-4" strokeWidth={2} />}
          </button>
        )}
      </div>
      {/* Les outils choisis, sous la barre (planche du 10 nov. 2026) : un clic en ajoute ou en retire un. */}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {MODULES_LANCABLES.map((m) => (
          <button key={m.cle} type="button" onClick={() => basculer(m.cle)} aria-pressed={outils.has(m.cle)}
            className={`h-7 rounded-[8px] px-2.5 text-[13px] transition-colors ${outils.has(m.cle) ? "bg-rail-actif text-encre" : "border border-trait text-ardoise hover:text-encre"}`}
            style={outils.has(m.cle) ? undefined : { background: "transparent" }}>{m.nom}</button>
        ))}
      </div>
      {suggestions.length > 0 && (
        <ul className="absolute left-[120px] right-16 top-[54px] z-20 max-md:left-0 max-md:right-0 max-md:top-[54px] m-0 list-none overflow-hidden rounded-[10px] border border-bord bg-surface-pleine p-0 shadow-[0_18px_40px_rgba(0,0,0,0.35)]">
          {suggestions.map((s) => (
            <li key={s}><button type="button" onClick={() => { choisie.current = s; setAdresse(s); setSuggestions([]); }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-craie hover:bg-relief hover:text-encre"><Search className="h-3.5 w-3.5 text-brume" />{s}</button></li>
          ))}
        </ul>
      )}

      {/* Une adresse ne suffit pas à tous les outils : le rayon d'une zone, les
          années d'un marché, le loyer d'un local. On les demande avant de
          lancer, plutôt que de partir sur des valeurs que personne n'a choisies. */}
      {aQuestionner.length > 0 && (
        <div className="mt-3 rounded-[12px] border border-trait bg-crm-tableau px-4 py-3">
          <p className="alx-mont m-0 mb-1 text-[10.5px] uppercase tracking-[.14em] text-brume">
            Ce que ces outils demandent en plus de l&apos;adresse
          </p>
          {aQuestionner.map((o) => (
            <BlocOutil key={o} outil={o} liste={questions[o]} note={notes?.[o]}
              valeurs={reglages[o]} onChange={(cle, v) => repondre(o, cle, v)} />
          ))}

          {/* Le lancement, au bout du formulaire. Remplir un champ ne déclenche
              rien : tant qu'on n'a pas cliqué ici, aucune analyse ne part. */}
          <div className="mt-3 flex flex-col gap-2.5 border-t border-trait pt-3 sm:flex-row sm:items-center sm:justify-between">
            {manques.length > 0 ? (
              <p className="m-0 text-[11.5px] leading-[1.5] text-ambre">
                {manques.map((x) => `${MODULES_PAR_CLE[x.outil]?.nom || x.outil} : il manque ${x.manque.join(", ")}`).join(" · ")}
              </p>
            ) : adresse.trim().length < 5 ? (
              <p className="m-0 text-[11.5px] text-brume">Donnez l&apos;adresse au-dessus, puis lancez.</p>
            ) : (
              <p className="m-0 text-[11.5px] text-brume">Rien ne part tant que vous n&apos;avez pas lancé.</p>
            )}
            <button type="button" onClick={envoyer} disabled={!pret}
              className="inline-flex h-10 flex-none items-center justify-center gap-2 rounded-full px-5 text-[12.5px] font-medium transition-opacity disabled:opacity-40"
              style={{ background: J["menthe"], color: J["sur-menthe"] }}>
              {enCours ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" strokeWidth={2} />}
              Lancer {outils.size} analyse{outils.size > 1 ? "s" : ""}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// La page principale des Outils (10 nov. 2026, Jules : planche « Outils dans le cadre du CRM »). Le cadre (bande,
// logo « outils_ », panneau des outils) est posé par Layout autour de toutes les pages des Outils
// (components/kdata/CadreOutils.jsx) ; ici, le tableau de bord et la vue Analyses (?p=analyses, ?q= pour chercher).
const DERNIERES = 8;

/** L'état d'une analyse, en case colorée sur toute la cellule, comme au CRM. */
const ETATS = { en_cours: ["En cours", "bleu"], echec: ["Échouée", "corail"] };
const etatDe = (a) => ETATS[a.etat] || (a.dossier_id ? ["Rangée", "ambre"] : ["Prête", "menthe"]);

/** La file des analyses, au dessin des tableaux du CRM : cocher, ouvrir, l'état en couleur. */
function TableAnalyses({ lignes, coches, onCocher, onOuvrir }) {
  const TH = "h-[35px] whitespace-nowrap border-b border-r border-trait px-3 text-left text-[12.5px] font-normal text-ardoise last:border-r-0";
  const TD = "h-[36px] border-b border-r border-trait px-3 text-[13.5px] last:border-r-0";
  return (
    <div className="overflow-x-auto rounded-[12px] border border-trait border-t-[3px] border-t-menthe bg-crm-tableau">
      <table className="w-full min-w-[720px] border-collapse [&_tbody_tr:last-child_td]:border-b-0">
        <thead><tr>
          <th className={`${TH} w-10`}><span className="sr-only">Cocher</span></th>
          <th className={TH}>Adresse</th><th className={TH}>Outil</th><th className={TH}>Dossier</th>
          <th className={`${TH} w-[120px] text-center`}>État</th><th className={`${TH} w-[120px] text-center`}>Lancée</th>
        </tr></thead>
        <tbody>
          {lignes.map((a) => {
            const m = MODULES_PAR_CLE[a.outil];
            const [mot, couleur] = etatDe(a);
            const ouvrable = !!a.lien;
            return (
              <tr key={a.id} onClick={() => ouvrable && onOuvrir(a)} className={ouvrable ? "cursor-pointer hover:bg-relief" : ""}>
                <td className={TD} onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" checked={coches.has(a.id)} onChange={() => onCocher(a.id)} aria-label={`Cocher ${a.libelle || a.adresse}`} className="h-4 w-4 accent-menthe" />
                </td>
                <td className={`${TD} max-w-[360px] truncate text-encre`}>{a.libelle || a.adresse}</td>
                <td className={`${TD} whitespace-nowrap text-craie`}>{a.nom_outil || m?.nom || a.outil}</td>
                <td className={`${TD} max-w-[200px] truncate text-craie`}>{a.dossier_nom || ""}</td>
                <td className={`${TD} whitespace-nowrap text-center ${CLASSES_STATUT[couleur]}`}>
                  {a.etat === "en_cours" && <Loader2 className="mr-1.5 inline h-3.5 w-3.5 animate-spin" />}{mot}
                </td>
                <td className={`${TD} whitespace-nowrap text-center tabular-nums text-ardoise`}>{quand(a.cree_le)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function KData() {
  const user = useUser();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const page = params.get("p") === "analyses" ? "analyses" : "bord";
  const [coches, setCoches] = useState(() => new Set());
  const [dossierChoisi, setDossierChoisi] = useState("");
  const [filtre, setFiltre] = useState("tous");
  const [dossierFiltre, setDossierFiltre] = useState("");
  const recherche = params.get("q") || "";

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
  const supprimer = useMutation({
    mutationFn: (id) => base44.request("DELETE", `/api/kdata/analyses/${id}`),
    onSuccess: () => { invalider(); setCoches(new Set()); },
    onError: (e) => toast.error(e?.message || "Suppression impossible"),
  });

  const visibles = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return analyses
      .filter((a) => filtre === "tous" || (filtre === "en_cours" ? a.etat === "en_cours" : !!a.dossier_id))
      .filter((a) => !dossierFiltre || (dossierFiltre === "sans" ? !a.dossier_id : a.dossier_id === dossierFiltre))
      .filter((a) => !q || `${a.libelle || ""} ${a.adresse || ""} ${a.nom_outil || ""} ${a.dossier_nom || ""}`.toLowerCase().includes(q));
  }, [analyses, filtre, dossierFiltre, recherche]);
  const enCours = analyses.filter((a) => a.etat === "en_cours");
  const cocher = (id) => setCoches((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const aller = (p) => setParams(p === "bord" ? {} : { p }, { replace: false });

  if (!user || user.role !== "admin") return null;

  const lignes = page === "bord" ? visibles.slice(0, DERNIERES) : visibles;
  const file = (
    <section className="mt-6">
      <div className="mb-2.5 flex min-h-8 flex-wrap items-center justify-between gap-2">
        {coches.size > 0 ? (
          <div className="flex flex-1 flex-wrap items-center gap-2">
            <span className="text-[13.5px] text-encre">{coches.size} cochée{coches.size > 1 ? "s" : ""}</span>
            <select value={dossierChoisi} onChange={(e) => setDossierChoisi(e.target.value)} className="h-8 rounded-[8px] border border-bord-doux bg-transparent px-2.5 text-[13px] text-encre outline-none max-md:text-[16px]">
              <option value="">Choisir un dossier…</option>
              {dossiers.map((d) => <option key={d.id} value={d.id}>{d.nom}</option>)}
            </select>
            <button type="button" disabled={!dossierChoisi || ranger.isPending} onClick={() => ranger.mutate({ ids: [...coches], dossier_id: dossierChoisi })} className={boutonCrm}>
              {ranger.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Folder className="h-4 w-4" />}Ranger dans le dossier
            </button>
            <button type="button" onClick={() => ranger.mutate({ ids: [...coches], dossier_id: null })} className={outilCrm} style={{ background: "transparent" }}>Sortir du dossier</button>
            <button type="button" onClick={() => { if (window.confirm(`Supprimer ${coches.size} analyse${coches.size > 1 ? "s" : ""} de la file ?`)) [...coches].forEach((id) => supprimer.mutate(id)); }} className={outilCrm} style={{ background: "transparent" }}>Supprimer</button>
            <button type="button" onClick={() => setCoches(new Set())} className="ml-auto grid h-8 w-8 place-items-center rounded-full text-ardoise hover:text-encre" style={{ background: "transparent" }} aria-label="Tout décocher"><X className="h-4 w-4" /></button>
          </div>
        ) : (
          <>
            <h2 className="m-0 text-[15px] font-medium text-encre">
              {page === "bord" ? "Les dernières analyses" : "Les analyses"}<span className="ml-2 text-[13px] font-normal tabular-nums text-ardoise">{visibles.length}</span>
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              <Pilules options={[["tous", "Toutes"], ["en_cours", `En cours${enCours.length ? ` · ${enCours.length}` : ""}`], ["rangees", "Rangées"]]} valeur={filtre} onChange={setFiltre} />
              {page === "analyses" && (
                <select value={dossierFiltre} onChange={(e) => setDossierFiltre(e.target.value)} aria-label="Dossier" className="h-8 rounded-[8px] border border-bord-doux bg-transparent px-2.5 text-[13px] text-craie outline-none max-md:text-[16px]">
                  <option value="">Tous les dossiers</option>
                  <option value="sans">Sans dossier</option>
                  {dossiers.map((d) => <option key={d.id} value={d.id}>{d.nom}</option>)}
                </select>
              )}
            </div>
          </>
        )}
      </div>
      {!lignes.length ? (
        <p className="m-0 flex items-center gap-2 rounded-[12px] border border-trait bg-crm-tableau px-4 py-6 text-[13.5px] text-ardoise"><Clock className="h-4 w-4" />Aucune analyse{filtre !== "tous" || dossierFiltre || recherche ? " ici" : " pour l'instant"}. Donnez une adresse au-dessus.</p>
      ) : (
        <TableAnalyses lignes={lignes} coches={coches} onCocher={cocher} onOuvrir={(x) => navigate(x.lien)} />
      )}
      {page === "bord" && visibles.length > DERNIERES && (
        <button type="button" onClick={() => aller("analyses")} className="mt-2 text-[13px] text-menthe-texte hover:underline" style={{ background: "transparent" }}>Voir les {visibles.length} analyses</button>
      )}
    </section>
  );

  const contenu = (
    <div className="min-w-0 px-10 pb-12 pt-6 max-md:px-4 max-md:pt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="m-0 text-[20px] font-medium text-encre">{page === "bord" ? "Tableau de bord" : "Analyses"}</h1>
      </div>
      {page === "bord" && (
        <div className="mt-4">
          <Composeur onLancer={(c) => lancer.mutate(c)} enCours={lancer.isPending} questions={data?.questions} notes={data?.notes} />
        </div>
      )}
      {file}
      {page === "bord" && (
        <section className="mt-8">
          <h2 className="m-0 mb-2.5 text-[15px] font-medium text-encre">Les outils</h2>
          <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">
            {MODULES_KDATA.map((m) => {
              const Icone = m.icone;
              return (
                <Link key={m.cle} to={m.chemin} className="flex items-start gap-3 rounded-[12px] border border-trait bg-crm-tableau px-3.5 py-3 transition-colors hover:border-bord-doux">
                  <span className="grid h-7 w-7 flex-none place-items-center rounded-[8px] bg-relief text-menthe"><Icone className="h-4 w-4" strokeWidth={1.8} /></span>
                  <span className="min-w-0">
                    <span className="block text-[14px] font-medium text-encre">{m.nom}</span>
                    <span className="block text-[12.5px] leading-[1.4] text-ardoise">{m.phrase}</span>
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );

  return <div className="text-encre">{contenu}</div>;
}
