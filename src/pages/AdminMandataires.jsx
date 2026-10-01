import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import CarteGoogleSecteurs from "@/components/mandataire/CarteGoogleSecteurs";
import { TYPES_CARTE } from "@/components/kzoning/CarteGoogleZones";
import { AlertTriangle, Check, ChevronDown, Eye, EyeOff, PenLine, Plus, RefreshCw, Search, Trash2, Undo2, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import { useUser } from "@/components/providers/UserProvider";
// Les couleurs des secteurs passent en JL (littérales) : Google dessine en SVG.
import { J, JL, alpha } from "@/design/jetons";

// L'administration de l'espace mandataire (spécification V1, section 13) :
// les secteurs tracés sur la carte de France (admin seulement, sans
// chevauchement, avec historique), les fiches des mandataires (RSAC, RC pro,
// attestation — alerte avant expiration), les demandes clients servies
// anonymisées, et l'œil sur leurs prospections.

const API = "/api/mandataire/admin";
const ONGLETS = [["secteurs", "Secteurs"], ["mandataires", "Mandataires"], ["demandes", "Demandes clients"], ["prospections", "Prospections"]];

export default function AdminMandataires() {
  const [onglet, setOnglet] = useState("secteurs");
  return (
    <div className="mx-auto max-w-[1100px] px-5 pb-16 pt-6 md:px-8">
      <h1 className="m-0 text-[22px] font-medium tracking-[-0.01em] text-encre">Mandataires</h1>
      <p className="m-0 mt-1 text-[13.5px] text-ardoise">K Partners : les secteurs, les fiches, les demandes clients et leurs prospections.</p>
      <div className="mt-5 flex gap-1 rounded-full bg-rail-actif p-1 w-fit max-md:flex-wrap max-md:rounded-[14px]">
        {ONGLETS.map(([k, mot]) => (
          <button key={k} type="button" onClick={() => setOnglet(k)} aria-pressed={onglet === k}
            className={`rounded-full px-3.5 py-1.5 text-[13px] transition-colors ${onglet === k ? "bg-surface-pleine text-encre" : "text-ardoise hover:text-encre"}`}
            style={onglet === k ? undefined : { background: "transparent" }}>
            {mot}
          </button>
        ))}
      </div>
      {onglet === "secteurs" && <Secteurs />}
      {onglet === "mandataires" && <Mandataires />}
      {onglet === "demandes" && <Demandes />}
      {onglet === "prospections" && <Prospections />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Secteurs : la carte de France, les contours posés point par point, une
// teinte et un nom par secteur. Même traitement que la carte des rues d'ALX
// (fond assombri, clair sous le thème clair), et tout se pilote depuis un
// panneau posé sur la carte : on trace sans quitter la carte des yeux.
// ---------------------------------------------------------------------------

// Une teinte par secteur, dans la palette : assez distinctes côte à côte.
const TEINTES_SECTEUR = ["menthe", "ambre", "bleu", "emplacement-1", "vert", "appel", "jaune", "emplacement-2"];
const teinteDe = (i) => JL[TEINTES_SECTEUR[i % TEINTES_SECTEUR.length]];

// Les façons de faire un contour : à la main, ou par le découpage officiel.
const MODES_TRACE = [["dessin", "Dessiner"], ["commune", "Communes"], ["departement", "Départements"], ["region", "Régions"]];

/** Choisir des communes, des départements ou des régions : une liste qui se coche. */
function ChoixDecoupage({ niveau, choisies, onBasculer }) {
  const [q, setQ] = useState("");
  const [recherche, setRecherche] = useState("");
  // La commune se cherche (il y en a 35 000) ; départements et régions se listent.
  React.useEffect(() => {
    const t = setTimeout(() => setRecherche(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  const commune = niveau === "commune";
  const { data, isLoading, error } = useQuery({
    queryKey: ["decoupage", niveau, commune ? recherche : ""],
    queryFn: () => base44.request("GET", `${API}/decoupage/${niveau}${commune ? `?q=${encodeURIComponent(recherche)}` : ""}`),
    enabled: !commune || recherche.length >= 2,
    staleTime: 24 * 3600 * 1000,
  });
  const unites = (data?.unites || []).filter((u) => commune || !q.trim() || `${u.code} ${u.nom}`.toLowerCase().includes(q.trim().toLowerCase()));
  const estChoisie = (u) => choisies.some((c) => c.niveau === niveau && c.code === u.code);
  return (
    <div>
      <div className="flex items-center gap-2 rounded-full border border-bord bg-surface px-3">
        <Search className="h-3.5 w-3.5 flex-shrink-0 text-brume" />
        <input value={q} onChange={(e) => setQ(e.target.value)} autoFocus
          placeholder={commune ? "Nom ou code postal de la commune" : niveau === "departement" ? "Nom ou numéro du département" : "Nom de la région"}
          className="h-8 w-full bg-transparent text-[12.5px] text-encre outline-none placeholder:text-brume" />
      </div>
      <div className="mt-2 max-h-[220px] overflow-y-auto rounded-[10px] border border-trait">
        {error ? <p className="m-0 px-3 py-3 text-[12px] text-alerte">{error.message}</p>
          : isLoading ? <p className="m-0 px-3 py-3 text-[12px] text-brume">Lecture…</p>
          : commune && recherche.length < 2 ? <p className="m-0 px-3 py-3 text-[12px] text-brume">Tapez deux lettres au moins.</p>
          : !unites.length ? <p className="m-0 px-3 py-3 text-[12px] text-brume">Rien de ce nom.</p>
          : unites.map((u) => {
            const oui = estChoisie(u);
            return (
              <button key={u.code} type="button" onClick={() => onBasculer(niveau, u)}
                className="flex w-full items-center gap-2.5 border-b border-trait px-3 py-2 text-left last:border-b-0 hover:bg-surface"
                style={{ background: oui ? alpha("menthe", 0.08) : "transparent" }}>
                <span className="grid h-4 w-4 flex-none place-items-center rounded border" style={{ borderColor: oui ? J["menthe"] : J["bord-vif"], background: oui ? J["menthe"] : "transparent" }}>
                  {oui && <Check className="h-3 w-3" style={{ color: J["sur-menthe"] }} />}
                </span>
                <span className="min-w-0 flex-1 truncate text-[12.5px] text-encre">
                  {niveau === "departement" ? `${u.code} · ${u.nom}` : u.nom}
                </span>
                {commune && <span className="flex-none text-[11px] text-brume">{u.departement}</span>}
              </button>
            );
          })}
      </div>
    </div>
  );
}

function Secteurs() {
  const queryClient = useQueryClient();
  const [typeCarte, setTypeCarte] = useState("roadmap");
  const { data } = useQuery({ queryKey: ["admin-secteurs"], queryFn: () => base44.request("GET", `${API}/secteurs`) });
  const { data: mand } = useQuery({ queryKey: ["admin-mandataires"], queryFn: () => base44.request("GET", `${API}/mandataires`) });
  const secteurs = data?.secteurs || [];
  const mandataires = mand?.mandataires || [];
  const nomDe = (email) => mandataires.find((m) => m.email === email)?.nom || email;

  const [trace, setTrace] = useState(false); // on pose des points
  const [points, setPoints] = useState([]);
  const [nom, setNom] = useState("");
  const [email, setEmail] = useState("");
  const [enEdition, setEnEdition] = useState(null); // l'id du secteur redessiné
  const [choisi, setChoisi] = useState(null); // le secteur ouvert
  const [modeTrace, setModeTrace] = useState("dessin");
  const [unites, setUnites] = useState([]); // [{niveau, code, nom}]
  const [contours, setContours] = useState({}); // "niveau:code" → anneaux
  const [menuMandataire, setMenuMandataire] = useState(false);

  const cleUnite = (u) => `${u.niveau}:${u.code}`;
  const apercu = React.useMemo(() => unites.flatMap((u) => contours[cleUnite(u)] || []), [unites, contours]);
  const chargerContours = async (niveau, codes) => {
    if (!codes.length) return;
    try {
      const r = await base44.request("GET", `${API}/contours/${niveau}?codes=${codes.map(encodeURIComponent).join(",")}`);
      setContours((c) => ({ ...c, ...Object.fromEntries((r.contours || []).map((x) => [`${niveau}:${x.code}`, x.anneaux])) }));
    } catch (e) {
      toast.error(e?.message || "Contours indisponibles");
    }
  };
  const basculerUnite = (niveau, u) => {
    const cle = `${niveau}:${u.code}`;
    if (unites.some((x) => cleUnite(x) === cle)) { setUnites((l) => l.filter((x) => cleUnite(x) !== cle)); return; }
    setUnites((l) => [...l, { niveau, code: u.code, nom: u.nom }]);
    if (!contours[cle]) chargerContours(niveau, [u.code]);
    // Un nom vide prend celui de la première unité choisie.
    if (!nom.trim()) setNom(u.nom);
  };

  const fermer = () => { setTrace(false); setPoints([]); setNom(""); setEmail(""); setEnEdition(null); setUnites([]); setModeTrace("dessin"); };
  const poser = useMutation({
    mutationFn: () => base44.request("POST", `${API}/secteurs`, { body: { id: enEdition, nom: nom.trim() || "Secteur", mandataire_email: email || null, points, polygones: apercu, unites } }),
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ["admin-secteurs"] });
      queryClient.invalidateQueries({ queryKey: ["admin-mandataires"] });
      fermer();
      setChoisi(r?.secteur?.id || null);
      toast.success(enEdition ? "Secteur redessiné" : "Secteur créé");
    },
    onError: (e) => toast.error(e?.message || "Impossible"),
  });
  const supprimer = useMutation({
    mutationFn: (id) => base44.request("DELETE", `${API}/secteurs/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin-secteurs"] }); setChoisi(null); },
    onError: (e) => toast.error(e?.message || "Impossible"),
  });

  const commencer = () => { fermer(); setChoisi(null); setTrace(true); };
  const redessiner = (s) => {
    setChoisi(null); setEnEdition(s.id); setNom(s.nom); setEmail(s.mandataire_email || ""); setTrace(true);
    if (s.unites?.length) {
      setUnites(s.unites); setPoints([]); setModeTrace(s.unites[0].niveau);
      for (const niveau of [...new Set(s.unites.map((u) => u.niveau))]) chargerContours(niveau, s.unites.filter((u) => u.niveau === niveau).map((u) => u.code));
    } else {
      setUnites([]); setPoints(s.points || []); setModeTrace("dessin");
    }
  };
  const attribuer = useMutation({
    mutationFn: ({ id, email: e }) => base44.request("POST", `${API}/secteurs/${id}/mandataire`, { body: { mandataire_email: e } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-secteurs"] });
      queryClient.invalidateQueries({ queryKey: ["admin-mandataires"] });
      setMenuMandataire(false);
      toast.success("Mandataire changé");
    },
    onError: (e) => toast.error(e?.message || "Impossible"),
  });
  const ouvert = secteurs.find((s) => s.id === choisi) || null;
  React.useEffect(() => { setMenuMandataire(false); }, [choisi]);
  const indexDe = (id) => Math.max(0, secteurs.findIndex((s) => s.id === id));
  const [filtre, setFiltre] = useState("");
  const [masques, setMasques] = useState(() => new Set());
  const listes = filtre.trim()
    ? secteurs.filter((s) => `${s.nom} ${s.mandataire_email || ""} ${nomDe(s.mandataire_email) || ""}`.toLowerCase().includes(filtre.trim().toLowerCase()))
    : secteurs;
  const champ = "w-full rounded-[10px] border border-bord bg-surface px-3 py-2 text-[13px] text-encre outline-none placeholder:text-brume focus:border-menthe";
  const panneauDroit = trace || ouvert;

  return (
    // La mise en page de K-Zoning : la carte en plein cadre, la liste vitrée à
    // gauche, l'élément ouvert vitré à droite.
    <div className="relative mt-5 h-[calc(100vh-13rem)] min-h-[520px] overflow-hidden rounded-[16px] border border-bord">
      <div className="absolute inset-0">
        <CarteGoogleSecteurs
          secteurs={secteurs.filter((s) => s.id !== enEdition && !masques.has(s.id)).map((s) => ({ ...s, teinte: teinteDe(indexDe(s.id)) }))}
          choisi={choisi}
          trace={trace && modeTrace === "dessin"}
          points={points}
          apercu={apercu}
          type={typeCarte}
          onSecteur={(id) => setChoisi(id)}
          onPoint={(p) => setPoints((pts) => [...pts, p])}
          onErreur={(m) => toast.error(m)}
        />
      </div>
      {/* Le fond, comme dans K-Zoning : plan, satellite, hybride, relief. */}
      <div className="absolute bottom-4 left-1/2 z-[500] -translate-x-1/2 rounded-full border border-bord bg-fond/80 p-1 backdrop-blur-xl max-md:hidden">
        <div className="flex items-center gap-0.5">
          {TYPES_CARTE.map((t) => (
            <button key={t.cle} type="button" onClick={() => setTypeCarte(t.cle)}
              className={`rounded-full px-3 py-1.5 text-[11.5px] transition-colors ${t.cle === typeCarte ? "bg-encre/[0.09] text-encre" : "text-ardoise hover:text-encre"}`}
              style={t.cle === typeCarte ? undefined : { background: "transparent" }}>
              {t.nom}
            </button>
          ))}
        </div>
      </div>

      {/* Le panneau de gauche : tracer, chercher, retrouver. */}
      <div className="absolute left-4 top-4 z-[500] flex max-h-[calc(100%-2rem)] w-[320px] max-w-[calc(100%-2rem)] flex-col overflow-hidden rounded-[16px] border border-bord bg-fond/70 backdrop-blur-xl max-md:max-h-[42%]">
        <div className="flex-shrink-0 p-3">
          <button type="button" onClick={commencer} disabled={trace}
            className="flex w-full items-center justify-center gap-2 rounded-[10px] bg-menthe px-3 py-2.5 text-[13px] font-medium text-sur-menthe hover:bg-menthe-survol disabled:opacity-50">
            <Plus className="h-4 w-4" /> Tracer un secteur
          </button>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2 border-t border-trait px-3 py-2.5">
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-bord bg-surface px-3">
            <Search className="h-3.5 w-3.5 flex-shrink-0 text-brume" />
            <input value={filtre} onChange={(e) => setFiltre(e.target.value)} placeholder="Chercher un secteur ou un mandataire"
              className="h-8 w-full bg-transparent text-[12.5px] text-encre outline-none placeholder:text-brume" />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto pb-2">
          <p className="alx-mont m-0 px-3 pb-1 pt-3 text-[11px] uppercase tracking-[.16em] text-brume">Secteurs · {secteurs.length}</p>
          {listes.length ? listes.map((s) => {
            const actif = s.id === choisi;
            const visible = !masques.has(s.id);
            const teinte = teinteDe(indexDe(s.id));
            const qui = s.mandataire_email ? nomDe(s.mandataire_email) : null;
            return (
              <div key={s.id} className="px-3 pb-2">
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => { if (!trace) setChoisi(s.id); }}
                  onKeyDown={(e) => { if (e.key === "Enter" && !trace) setChoisi(s.id); }}
                  className={`group relative cursor-pointer overflow-hidden rounded-[12px] border bg-surface px-3.5 py-3 transition-colors ${actif ? "border-menthe/60" : "border-trait hover:border-bord"} ${visible ? "" : "opacity-50"}`}
                >
                  <span className="absolute inset-y-0 left-0 w-[3px]" style={{ background: teinte }} />
                  <div className="flex items-start gap-2">
                    <p className="alx-mont m-0 min-w-0 flex-1 truncate text-[12px] font-medium uppercase tracking-[.08em] text-encre">{s.nom}</p>
                    <button type="button" onClick={(e) => { e.stopPropagation(); setMasques((m) => { const n = new Set(m); n.has(s.id) ? n.delete(s.id) : n.add(s.id); return n; }); }}
                      className="flex-shrink-0 text-brume hover:text-encre" title={visible ? "Masquer sur la carte" : "Montrer sur la carte"} style={{ background: "transparent" }}>
                      {visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                  <div className="mt-2.5 flex items-center gap-2">
                    <span className="grid h-6 w-6 flex-none place-items-center rounded-full text-[11px] font-medium"
                      style={{ background: qui ? alpha("menthe", 0.16) : J["barre-relief"], color: qui ? J["menthe"] : J["brume"] }}>
                      {qui ? qui.charAt(0).toUpperCase() : "?"}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[12.5px] text-craie">{qui || "Non attribué"}</span>
                    <span className="flex-none text-[11px] tabular-nums text-brume">{s.villes?.length || 0} ville{(s.villes?.length || 0) > 1 ? "s" : ""}</span>
                  </div>
                  {actif && (
                    <div className="mt-3 flex items-center gap-2 border-t border-trait pt-2.5">
                      <button type="button" onClick={(e) => { e.stopPropagation(); redessiner(s); }}
                        className="inline-flex items-center gap-1.5 text-[12px] text-craie hover:text-menthe" style={{ background: "transparent" }}>
                        <PenLine className="h-3.5 w-3.5" /> Redessiner
                      </button>
                      <button type="button" onClick={(e) => { e.stopPropagation(); if (window.confirm(`Supprimer le secteur « ${s.nom} » ?`)) supprimer.mutate(s.id); }}
                        className="ml-auto inline-flex items-center gap-1.5 text-[12px] text-brume hover:text-alerte" style={{ background: "transparent" }}>
                        <Trash2 className="h-3.5 w-3.5" /> Supprimer
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          }) : (
            <p className="m-0 px-3 py-6 text-center text-[12.5px] leading-[1.6] text-brume">
              {secteurs.length ? "Aucun secteur de ce nom." : "Tracez le contour, attribuez-le : le premier secteur se pose en deux gestes."}
            </p>
          )}
        </div>
      </div>

      {/* Le panneau de droite : le tracé en cours, ou le secteur ouvert. */}
      {panneauDroit && (
        <div className="absolute right-4 top-4 z-[500] flex max-h-[calc(100%-2rem)] w-[360px] max-w-[calc(100%-2rem)] flex-col overflow-hidden rounded-[16px] border border-bord bg-fond/70 backdrop-blur-xl max-md:bottom-4 max-md:left-4 max-md:top-auto max-md:w-auto">
          <div className="flex flex-shrink-0 items-start gap-3 border-b border-trait p-4">
            <div className="min-w-0 flex-1">
              <p className="alx-mont m-0 text-[11px] uppercase tracking-[.16em] text-menthe-texte">
                {trace ? (enEdition ? "Redessiner le secteur" : "Nouveau secteur") : "Secteur"}
              </p>
              <h2 className="mt-1 mb-0 truncate text-[17px] font-medium text-encre">
                {trace ? (nom.trim() || "Sans nom") : ouvert.nom}
              </h2>
            </div>
            <button type="button" onClick={() => (trace ? fermer() : setChoisi(null))} className="flex-shrink-0 text-brume hover:text-encre" aria-label="Fermer" style={{ background: "transparent" }}>
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {trace ? (
              <>
                <div className="grid grid-cols-4 gap-0.5 rounded-full border border-bord bg-surface p-0.5">
                  {MODES_TRACE.map(([k, mot]) => (
                    <button key={k} type="button" onClick={() => setModeTrace(k)} aria-pressed={modeTrace === k}
                      className={`rounded-full px-1 py-1.5 text-[11.5px] transition-colors ${modeTrace === k ? "bg-encre/[0.09] text-encre" : "text-ardoise hover:text-encre"}`}
                      style={modeTrace === k ? undefined : { background: "transparent" }}>
                      {mot}
                    </button>
                  ))}
                </div>
                <div className="mt-3">
                  {modeTrace === "dessin" ? (
                    <div className="rounded-[10px] border border-menthe/30 bg-menthe/[0.06] p-3">
                      <p className="m-0 text-[12.5px] leading-[1.55] text-craie">
                        {points.length < 3
                          ? `Touchez la carte pour poser le contour : encore ${3 - points.length} point${3 - points.length > 1 ? "s" : ""} au moins.`
                          : `${points.length} points posés. Continuez le contour, ou enregistrez.`}
                      </p>
                    </div>
                  ) : (
                    <ChoixDecoupage niveau={modeTrace} choisies={unites} onBasculer={basculerUnite} />
                  )}
                </div>
                {unites.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {unites.map((u) => (
                      <span key={cleUnite(u)} className="inline-flex items-center gap-1.5 rounded-full border border-bord px-2.5 py-1 text-[11.5px] text-craie">
                        {contours[cleUnite(u)] ? null : <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-menthe" />}
                        {u.niveau === "departement" ? `${u.code} · ${u.nom}` : u.nom}
                        <button type="button" onClick={() => basculerUnite(u.niveau, u)} aria-label={`Retirer ${u.nom}`} className="text-brume hover:text-alerte" style={{ background: "transparent" }}>
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="mt-3 space-y-2">
                  <input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Nom du secteur (« Mâconnais »)" className={champ} />
                  <select value={email} onChange={(e) => setEmail(e.target.value)} className={champ}>
                    <option value="">Sans mandataire pour l'instant</option>
                    {mandataires.map((m) => <option key={m.email} value={m.email}>{m.nom || m.email}{m.admin ? " (admin)" : ""}</option>)}
                  </select>
                </div>
                <div className="mt-4 flex items-center gap-2">
                  {modeTrace === "dessin" && (
                    <button type="button" onClick={() => setPoints((p) => p.slice(0, -1))} disabled={!points.length}
                      className="inline-flex items-center gap-1.5 rounded-full border border-bord px-3 py-1.5 text-[12px] text-craie hover:text-encre disabled:opacity-30" style={{ background: "transparent" }}>
                      <Undo2 className="h-3.5 w-3.5" /> Dernier point
                    </button>
                  )}
                  <button type="button" onClick={() => poser.mutate()} disabled={(points.length < 3 && !apercu.length) || poser.isPending || unites.some((u) => !contours[cleUnite(u)])}
                    className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-menthe px-3.5 py-1.5 text-[12.5px] font-medium text-sur-menthe hover:bg-menthe-survol disabled:opacity-40">
                    <Check className="h-3.5 w-3.5" /> Enregistrer
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setMenuMandataire((v) => !v)} aria-expanded={menuMandataire}
                    className={`rounded-[12px] border bg-surface px-3.5 py-3 text-left transition-colors ${menuMandataire ? "border-menthe/60" : "border-trait hover:border-bord"}`}>
                    <p className="m-0 flex items-center gap-1.5 text-[15px] font-medium text-encre">
                      <span className="truncate">{ouvert.mandataire_email ? nomDe(ouvert.mandataire_email) : "—"}</span>
                      <ChevronDown className={`h-3.5 w-3.5 flex-none text-brume transition-transform ${menuMandataire ? "rotate-180" : ""}`} />
                    </p>
                    <p className="alx-mont m-0 mt-1 text-[10.5px] uppercase tracking-[.12em] text-brume">Mandataire</p>
                  </button>
                  <div className="rounded-[12px] border border-trait bg-surface px-3.5 py-3">
                    <p className="m-0 text-[20px] font-medium tabular-nums text-encre">{ouvert.villes?.length || 0}</p>
                    <p className="alx-mont m-0 mt-1 text-[10.5px] uppercase tracking-[.12em] text-brume">Villes chargées</p>
                  </div>
                </div>
                {menuMandataire && (
                  <div className="mt-2 overflow-hidden rounded-[12px] border border-trait bg-surface">
                    {[{ email: null, nom: "Personne (non attribué)" }, ...mandataires].map((m) => {
                      const actuel = (ouvert.mandataire_email || null) === m.email;
                      const pris = m.email && secteurs.find((x) => x.id !== ouvert.id && x.mandataire_email === m.email);
                      return (
                        <button key={m.email || "aucun"} type="button" disabled={actuel || !!pris || attribuer.isPending}
                          onClick={() => attribuer.mutate({ id: ouvert.id, email: m.email })}
                          className="flex w-full items-center gap-2.5 border-b border-trait px-3 py-2.5 text-left last:border-b-0 hover:bg-relief disabled:cursor-default disabled:hover:bg-transparent"
                          style={{ background: "transparent" }}>
                          <span className="grid h-6 w-6 flex-none place-items-center rounded-full text-[11px] font-medium"
                            style={{ background: m.email ? alpha("menthe", 0.16) : J["barre-relief"], color: m.email ? J["menthe"] : J["brume"] }}>
                            {m.email ? (m.nom || m.email).charAt(0).toUpperCase() : "–"}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className={`block truncate text-[13px] ${pris ? "text-brume" : "text-encre"}`}>{m.nom || m.email}{m.admin ? " · admin" : ""}</span>
                            {pris && <span className="block truncate text-[11px] text-brume">a déjà « {pris.nom} »</span>}
                          </span>
                          {actuel && <Check className="h-3.5 w-3.5 flex-none text-menthe" />}
                        </button>
                      );
                    })}
                  </div>
                )}
                {ouvert.unites?.length > 0 && (
                  <p className="m-0 mt-3 text-[12.5px] leading-[1.6] text-craie">
                    {ouvert.unites.map((u) => (u.niveau === "departement" ? `${u.code} · ${u.nom}` : u.nom)).join(", ")}
                  </p>
                )}
                <p className="m-0 mt-3 text-[12.5px] leading-[1.6] text-ardoise">
                  {ouvert.villes?.length ? ouvert.villes.join(", ") : "Aucune ville ALX dans ce contour : la prospection n'y trouvera rien tant qu'ALX n'y a pas de ville."}
                </p>
                {ouvert.historique?.length > 0 && (
                  <div className="mt-4 border-t border-trait pt-3">
                    <p className="alx-mont m-0 mb-2 text-[10.5px] uppercase tracking-[.12em] text-brume">Historique</p>
                    {[...ouvert.historique].reverse().slice(0, 5).map((h, i) => (
                      <p key={i} className="m-0 mt-1 text-[12px] text-ardoise">
                        {h.action.charAt(0).toUpperCase() + h.action.slice(1)} le {new Date(h.le).toLocaleDateString("fr-FR")} · {h.par || "?"}
                      </p>
                    ))}
                  </div>
                )}
                <div className="mt-4 flex items-center gap-2 border-t border-trait pt-3">
                  <button type="button" onClick={() => redessiner(ouvert)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-bord px-3 py-1.5 text-[12px] text-craie hover:border-menthe/40 hover:text-encre" style={{ background: "transparent" }}>
                    <PenLine className="h-3.5 w-3.5" /> Redessiner
                  </button>
                  <button type="button" onClick={() => { if (window.confirm(`Supprimer le secteur « ${ouvert.nom} » ?`)) supprimer.mutate(ouvert.id); }}
                    className="ml-auto inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[12px] text-brume hover:text-alerte" style={{ background: "transparent" }}>
                    <Trash2 className="h-3.5 w-3.5" /> Supprimer
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

    </div>
  );
}

// ---------------------------------------------------------------------------
// Mandataires : la fiche réglementaire, et l'alerte avant l'expiration.
// ---------------------------------------------------------------------------

const CHAMPS_FICHE = [
  ["rsac", "N° RSAC", "text"],
  ["telephone", "Téléphone", "text"],
  ["arrivee_le", "Arrivé le", "date"],
  ["rc_pro_expire_le", "RC pro expire le", "date"],
  ["attestation_expire_le", "Attestation expire le", "date"],
  ["analyste_email", "Analyste binôme", "text"],
];

function Mandataires() {
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ["admin-mandataires"], queryFn: () => base44.request("GET", `${API}/mandataires`) });
  const [brouillons, setBrouillons] = useState({});
  const poser = useMutation({
    mutationFn: ({ email, champs }) => base44.request("POST", `${API}/mandataires/${encodeURIComponent(email)}`, { body: champs }),
    onSuccess: (_, { email }) => {
      queryClient.invalidateQueries({ queryKey: ["admin-mandataires"] });
      setBrouillons((b) => ({ ...b, [email]: undefined }));
      toast.success("Fiche enregistrée");
    },
    onError: (e) => toast.error(e?.message || "Impossible"),
  });
  const moi = useMutation({
    mutationFn: (actif) => base44.request("POST", `${API}/moi`, { body: { actif } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-mandataires"] }),
    onError: (e) => toast.error(e?.message || "Impossible"),
  });
  const mandataires = data?.mandataires || [];
  const utilisateur = useUser();
  const dejaMoi = mandataires.some((m) => m.email === String(utilisateur?.email || "").toLowerCase());
  return (
    <div className="mt-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="m-0 text-[13px] text-ardoise">
          Un compte devient mandataire depuis la page Clients (« Promouvoir mandataire ») ; sa fiche réglementaire se tient ici.
          Un admin peut l'être aussi, sans rien perdre de ses droits.
        </p>
        <button type="button" onClick={() => moi.mutate(!dejaMoi)} disabled={moi.isPending}
          className="rounded-full border border-trait px-3.5 py-1.5 text-[12.5px] text-craie hover:border-menthe hover:text-menthe disabled:opacity-50"
          style={{ background: "transparent" }}>
          {dejaMoi ? "Ne plus être mandataire" : "Être aussi mandataire"}
        </button>
      </div>
      {mandataires.length === 0 && <p className="m-0 mt-5 text-[13.5px] text-brume">Aucun compte mandataire pour l'instant.</p>}
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {mandataires.map((m) => {
          const b = brouillons[m.email] || {};
          // Un champ date veut « AAAA-MM-JJ » : une valeur ISO complète se coupe.
          const valeur = (c, type) => (b[c] !== undefined ? b[c] : type === "date" ? String(m[c] || "").slice(0, 10) : m[c] || "");
          return (
            <div key={m.email} className="rounded-[16px] border border-trait bg-surface px-5 py-4">
              <p className="m-0 text-[15px] text-encre">{m.nom || m.email}{m.admin && <span className="ml-2 text-[11px] uppercase tracking-[.14em] text-brume">admin</span>}</p>
              <p className="m-0 mt-0.5 text-[12.5px] text-ardoise">{m.email} · secteur : {m.secteur?.nom || "aucun"}</p>
              {m.alertes.length > 0 && (
                <div className="mt-2 space-y-1">
                  {m.alertes.map((a, i) => (
                    <p key={i} className="m-0 inline-flex items-center gap-1.5 text-[12.5px] text-alerte"><AlertTriangle className="h-3.5 w-3.5" /> {a}</p>
                  ))}
                </div>
              )}
              <div className="mt-3 grid grid-cols-2 gap-2">
                {CHAMPS_FICHE.map(([c, mot, type]) => (
                  <label key={c} className="text-[11.5px] uppercase tracking-[.1em] text-brume">
                    {mot}
                    <input type={type} value={valeur(c, type)}
                      onChange={(e) => setBrouillons((x) => ({ ...x, [m.email]: { ...b, [c]: e.target.value } }))}
                      className="mt-1 w-full rounded-champ border border-trait bg-surface px-2.5 py-1.5 text-[13.5px] normal-case tracking-normal text-encre outline-none" />
                  </label>
                ))}
              </div>
              {brouillons[m.email] && (
                <button type="button" onClick={() => poser.mutate({ email: m.email, champs: brouillons[m.email] })} disabled={poser.isPending}
                  className="mt-3 rounded-full bg-menthe px-4 py-1.5 text-[12px] font-semibold text-fond hover:bg-menthe-survol disabled:opacity-50">
                  Enregistrer
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Demandes clients : l'admin écrit, le mandataire lira anonymisé.
// ---------------------------------------------------------------------------

const DEMANDE_VIDE = { profil: "Investisseur privé", type_commerce: "", zones: "", budget_min: "", budget_max: "", rendement_min: "", bail: "", client_email: "" };

function Demandes() {
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ["admin-demandes"], queryFn: () => base44.request("GET", `${API}/demandes`) });
  const [forme, setForme] = useState(DEMANDE_VIDE);
  const rafraichir = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-demandes"] });
    queryClient.invalidateQueries({ queryKey: ["mandataire-demandes"] });
  };
  const poser = useMutation({
    mutationFn: (corps) => base44.request("POST", `${API}/demandes`, { body: corps }),
    onSuccess: () => { rafraichir(); setForme(DEMANDE_VIDE); },
    onError: (e) => toast.error(e?.message || "Impossible"),
  });
  const supprimer = useMutation({
    mutationFn: (id) => base44.request("DELETE", `${API}/demandes/${id}`),
    onSuccess: rafraichir,
    onError: (e) => toast.error(e?.message || "Impossible"),
  });
  const demandes = data?.demandes || [];
  const synchro = data?.synchro || null;
  const synchroniser = useMutation({
    mutationFn: () => base44.request("POST", `${API}/demandes/synchroniser`),
    onSuccess: (r) => { rafraichir(); toast.success(`Monday : ${r.crees} nouvelle${r.crees > 1 ? "s" : ""}, ${r.mises_a_jour} mise${r.mises_a_jour > 1 ? "s" : ""} à jour, ${r.fermees} fermée${r.fermees > 1 ? "s" : ""}`); },
    onError: (e) => toast.error(e?.message || "Monday n'a pas répondu"),
  });
  const champ = (cle, placeholder, type = "text", largeur = "") => (
    <input type={type} value={forme[cle]} placeholder={placeholder}
      onChange={(e) => setForme((f) => ({ ...f, [cle]: e.target.value }))}
      className={`rounded-champ border border-trait bg-surface px-2.5 py-2 text-[13.5px] text-encre outline-none placeholder:text-brume ${largeur}`} />
  );
  return (
    <div className="mt-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="m-0 max-w-[70ch] text-[13px] text-ardoise">
          Les clients Monday en « Recherche » ou « Def Strategie » arrivent seuls, un peu anonymisés : sans nom, sans fonds propres ni revenus, le budget en fourchette.
          Le mandataire les lit sous « Client A », « Client B »… Une demande retouchée ici n'est plus réécrite par l'import.
        </p>
        <div className="flex items-center gap-3">
          {synchro?.le && <span className="text-[12px] text-brume">Import du {new Date(synchro.le).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>}
          <button type="button" onClick={() => synchroniser.mutate()} disabled={synchroniser.isPending}
            className="inline-flex items-center gap-1.5 rounded-full border border-bord px-3.5 py-1.5 text-[12.5px] text-craie hover:border-menthe/40 hover:text-encre disabled:opacity-50" style={{ background: "transparent" }}>
            <RefreshCw className={`h-3.5 w-3.5 ${synchroniser.isPending ? "animate-spin" : ""}`} /> Synchroniser Monday
          </button>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {champ("profil", "Profil (SCI familiale…)", "text", "w-44")}
        {champ("type_commerce", "Type (boulangerie…)", "text", "w-44")}
        {champ("zones", "Zones, séparées par des virgules", "text", "w-56")}
        {champ("budget_min", "Budget min €", "number", "w-32")}
        {champ("budget_max", "Budget max €", "number", "w-32")}
        {champ("rendement_min", "Rdt min %", "number", "w-24")}
        {champ("bail", "Bail accepté", "text", "w-32")}
        {champ("client_email", "Client (jamais montré)", "text", "w-52")}
        <button type="button" onClick={() => poser.mutate(forme)} disabled={poser.isPending}
          className="rounded-full bg-menthe px-4 py-2 text-[12px] font-semibold text-fond hover:bg-menthe-survol disabled:opacity-50">
          Ajouter
        </button>
      </div>
      <div className="mt-5">
        {demandes.map((d) => (
          <div key={d.id} className="flex items-center gap-3 border-t border-trait py-3 first:border-t-0">
            <div className="min-w-0 flex-1">
              <p className="m-0 text-[14px] text-encre">
                {d.source === "monday" && <span className="mr-2 rounded border border-bord px-1.5 py-0.5 text-[10.5px] uppercase tracking-[.1em] text-ardoise">Monday</span>}
                {[d.profil, d.type_commerce, d.zones?.length ? d.zones.join(", ") : d.zone_libre].filter(Boolean).join(" · ")}
                {(d.client_nom || d.client_email) && <span className="text-brume"> · {d.client_nom || d.client_email}</span>}
                {d.active === false && <span className="ml-2 text-[12px] text-brume">(fermée : le client ne cherche plus)</span>}
              </p>
              <p className="m-0 mt-0.5 text-[12.5px] text-ardoise">
                {[d.budget_min || d.budget_max ? `${d.budget_min ? Math.round(d.budget_min / 1000) : "?"} à ${d.budget_max ? Math.round(d.budget_max / 1000) : "?"} k€` : null,
                  d.rendement_min ? `≥ ${d.rendement_min} %` : null, d.bail].filter(Boolean).join(" · ") || "Sans critère chiffré"}
              </p>
            </div>
            <button type="button" onClick={() => poser.mutate({ ...d, visible: d.visible === false })}
              className={`text-[12.5px] ${d.visible === false ? "text-brume" : "text-menthe"}`} style={{ background: "transparent" }}
              title={d.visible === false ? "Cachée aux mandataires : cliquer pour la montrer" : "Visible des mandataires : cliquer pour la cacher"}>
              {d.visible === false ? "Cachée" : "Visible"}
            </button>
            <button type="button" onClick={() => { if (window.confirm("Supprimer cette demande ?")) supprimer.mutate(d.id); }}
              aria-label="Supprimer" title="Supprimer" className="grid h-9 w-9 place-items-center rounded-full text-brume hover:text-alerte" style={{ background: "transparent" }}>
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Prospections : ce que chaque mandataire cherche, et où il en est.
// ---------------------------------------------------------------------------

function Prospections() {
  const { data } = useQuery({ queryKey: ["admin-prospections"], queryFn: () => base44.request("GET", `${API}/prospections`) });
  const prospections = data?.prospections || [];
  if (!prospections.length) return <p className="m-0 mt-6 text-[13.5px] text-brume">Aucune prospection lancée pour l'instant.</p>;
  return (
    <div className="mt-5">
      {prospections.map((p) => (
        <div key={p.id} className="border-t border-trait py-3 first:border-t-0">
          <p className="m-0 text-[14px] text-encre">{p.nom} <span className="text-ardoise">· {p.mandataire}</span></p>
          <p className="m-0 mt-0.5 text-[12.5px] text-ardoise">
            {new Date(p.cree_le).toLocaleDateString("fr-FR")} · {p.trouves} trouvés · {p.ajoutes} ajoutés · {p.contactes} contactés · {p.rdv} RDV
          </p>
        </div>
      ))}
    </div>
  );
}
