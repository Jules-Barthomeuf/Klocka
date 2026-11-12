import React, { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronRight, ExternalLink, Loader2, RotateCw } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import { RueDetail } from "@/components/outils/Rue";
import { Preuves, etatOutil } from "@/components/outils/ResultatsOutils";
import { cleOutilsDossier, marquerVu, useOutilsDossier } from "@/components/analyse/ControlesHorsDocuments";
import { CADRE_GRILLE, CELLULES, LIGNE_GRILLE } from "@/components/preanalyse/AnalysePieces";

// L'onglet Marché affiné (planche du 12 nov. 2026, /designer : « les trois alertes en un coup d'œil »). Trois
// changements face à outils/ResultatsOutils.jsx : une bande de verdicts en tête (un chiffre par outil), le chiffre avant
// la phrase dans chaque ligne (la ligne entière ouvre ses preuves), l'état de l'outil dans l'en-tête de son tableau
// (date, Relancer, Vérifié) au lieu d'une ligne dessous. Porté dans l'onglet Marché de l'Analyse le même jour (Jules).

// Deux colonnes (12 nov. 2026, Jules) : le point et ce qu'il dit ; la source se lit au clic, avec les preuves. À droite
// du tableau, la note de l'IA sur toute sa hauteur.
const COLONNES = "grid-cols-[170px_minmax(0,1fr)]";
// Le vert dilue le rouge : les lignes OK gardent un point gris, seuls l'ambre et l'alerte ont leur couleur.
const POINT = { ok: "bg-brume", a_voir: "bg-ambre", alerte: "bg-alerte", vide: "border border-brume" };
const MOT = { ok: "OK", a_voir: "À voir", alerte: "Alerte", vide: "Pas de donnée" };

const Point = ({ statut, className = "" }) => <span className={`h-2 w-2 flex-none rounded-full ${POINT[statut] || POINT.vide} ${className}`} aria-label={MOT[statut] || MOT.vide} />;

/** Pure : les montants en k€ et M€, le vrai signe moins. */
export function montants(texte) {
  return String(texte || "").replace(/(-?)(\d{1,3}(?:[\s\u00a0\u202f]\d{3})+) €(?!\/)/g, (tout, signe, n) => {
    const v = Number(n.replace(/\D/g, ""));
    const s = signe ? "−" : "";
    if (v >= 1e6) return `${s}${(v / 1e6).toLocaleString("fr-FR", { maximumFractionDigits: 2 })}\u00a0M€`;
    if (v >= 1e4) return `${s}${Math.round(v / 1000).toLocaleString("fr-FR")}\u00a0k€`;
    return tout.replace("-", "−");
  });
}

/** Pure : un message de service (« Google Maps a répondu 403. ») dit sans code. */
export function sansCode(texte) {
  const m = String(texte || "").match(/^(.+?) a répondu \d{3}\.?$/);
  return m ? `${m[1]} indisponible pour l'instant.` : texte;
}

/** Pure : la tête d'une phrase (le chiffre et son unité, ou le nom avant « · ») et la suite. */
export function teteEtSuite(texte) {
  const t = montants(texte);
  const n = t.match(/^([−-]?\d[\d\s\u00a0\u202f,.]*\s?(?:€\/m²\/an|€\/m²|k€|M€|€|%|\/\s?10))\s+(.*)$/);
  if (n) return [n[1].replace(/\s?\/\s?10$/, "/10"), n[2]];
  const point = t.indexOf(" · ");
  if (point > 0 && point < 48) return [t.slice(0, point), t.slice(point + 3)];
  return [t, ""];
}

/** Pure : une source en quelques mots ; l'explication reste dans les preuves. */
export function sourceCourte(s) {
  if (!s) return "—";
  if (/taux valid/i.test(s)) return "Taux Klocka";
  if (/Indice Klocka/i.test(s)) return "Indice Klocka";
  return [...new Set(String(s).split(" et "))].join(" et ").replace(/\s*\(.*\)\s*/g, " ").trim();
}

/** Pure : le chiffre qui résume un outil dans la bande de verdicts. */
export function chiffreDe(o) {
  const r = o.lancement?.resultat;
  if (!r) return o.lancement?.statut === "en_cours" ? "…" : "—";
  const pts = r.points || [];
  const ecart = (p) => { const m = String(p?.resultat || "").match(/(\d+)\s*%\s*(au-dessus|en dessous|en-dessous)/); return m ? `${m[2] === "au-dessus" ? "+" : "−"}${m[1]} %` : null; };
  if (o.cle === "loyer") return ecart(pts.find((p) => p.cle === "loyer_marche")) || "—";
  if (o.cle === "prix") return ecart(pts.find((p) => p.cle === "verdict_prix")) || "—";
  if (o.cle === "emplacement") { const p = pts.find((x) => x.cle === "passage"); return p && p.statut !== "vide" ? teteEtSuite(p.resultat)[0] : "—"; }
  if (o.cle === "locataire") {
    // Une procédure en cours passe avant les comptes : c'est elle qu'on doit voir d'abord.
    const proc = pts.find((p) => p.cle === "procedures");
    if (proc?.statut === "alerte") { const m = String(proc.resultat).match(/Liquidation|Redressement|sauvegarde/i); if (m) return m[0][0].toUpperCase() + m[0].slice(1).toLowerCase(); }
    const c = pts.find((p) => p.cle === "comptes")?.detail?.exercices?.[0];
    if (c?.resultat_net != null) return montants(`${c.resultat_net < 0 ? "-" : ""}${Math.abs(c.resultat_net).toLocaleString("fr-FR")} €`);
  }
  return r.statut === "vide" ? "—" : MOT[r.statut] || "—";
}

function Ligne({ p, onSiren, apercu }) {
  const [ouvert, setOuvert] = useState(false);
  const preuves = Preuves({ p });
  const [tete, suite] = p.statut === "vide" ? [sansCode(p.resultat), ""] : teteEtSuite(p.resultat);
  // Toute ligne qui a une source s'ouvre : on y lit la source, son lien et les preuves.
  const ouvrable = !!(preuves || p.source || (p.cle === "societe" && p.detail?.siren));
  const basculer = ouvrable ? () => setOuvert((v) => !v) : undefined;
  return (
    <>
      <div onClick={basculer} role={ouvrable ? "button" : undefined} tabIndex={ouvrable ? 0 : undefined} aria-expanded={ouvrable ? ouvert : undefined}
        onKeyDown={ouvrable ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); basculer(); } } : undefined}
        className={`group grid ${COLONNES} ${CELLULES} ${LIGNE_GRILLE} ${ouvrable ? "cursor-pointer" : ""}`}>
        <span className="text-[13.5px] text-craie max-lg:text-[12.5px] max-lg:text-brume">{p.libelle}</span>
        <span className="flex min-w-0 items-start gap-2.5">
          <Point statut={p.statut} className="mt-[7px]" />
          <span className="min-w-0 flex-1 leading-[1.5]">
            <span className={`text-[14.5px] tabular-nums ${p.statut === "vide" ? "text-brume" : "text-encre"}`}>{tete}</span>
            {suite && <span className="text-[13.5px] text-ardoise"> {suite}</span>}
            {p.cle === "societe" && p.detail?.autres?.length > 0 && !p.detail?.confirme && <span className="text-[12.5px] text-ambre"> · {p.detail.autres.length} autre{p.detail.autres.length > 1 ? "s" : ""} possible{p.detail.autres.length > 1 ? "s" : ""}</span>}
          </span>
          {ouvrable && <ChevronRight className={`mt-[5px] h-3.5 w-3.5 flex-none text-brume transition-[transform,opacity] duration-200 ${ouvert ? "rotate-90 opacity-100" : "opacity-0 group-hover:opacity-100 max-lg:opacity-100"}`} aria-hidden="true" />}
        </span>
      </div>
      {ouvert && (
        <div className={`grid ${COLONNES} border-t border-trait max-lg:grid-cols-1`}>
          <span className="max-lg:hidden" />
          <div className="flex min-w-0 flex-col gap-2 px-2.5 py-3">
            {preuves}
            {p.cle === "societe" && !apercu && onSiren && <ChoixSociete d={p.detail || {}} onSiren={onSiren} />}
            {p.source && (
              <p className="m-0 flex flex-wrap items-baseline gap-x-2 text-[12.5px] text-ardoise">
                Source : {p.source}
                {p.lien && <a href={p.lien} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-menthe hover:underline">ouvrir <ExternalLink className="h-3 w-3" /></a>}
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}

/**
 * Fixer la société du locataire (12 nov. 2026, Jules : « fiable tout le temps ») : « C'est la bonne société » garde son
 * SIREN pour ce dossier ; les autres sociétés possibles, trouvées au même local ou au même nom, se choisissent d'un clic.
 */
function ChoixSociete({ d, onSiren }) {
  return (
    <div className="flex flex-col gap-1.5" onClick={(e) => e.stopPropagation()}>
      {d.confirme ? (
        <p className="m-0 flex flex-wrap items-center gap-x-3 text-[12.5px] text-ardoise">
          <span className="inline-flex items-center gap-1 text-menthe"><Check className="h-3.5 w-3.5" /> {d.origine === "SIREN du Kbis" ? "SIREN lu sur le Kbis" : "Société confirmée"} · {d.siren}</span>
          {d.origine !== "SIREN du Kbis" && <button type="button" onClick={() => onSiren(null)} className="text-ardoise hover:text-encre" style={{ background: "transparent" }}>Retirer</button>}
        </p>
      ) : (
        <button type="button" onClick={() => onSiren(d.siren)} className="inline-flex h-8 items-center gap-1.5 self-start rounded-full border border-trait px-3 text-[12.5px] text-craie hover:border-bord-vif hover:text-encre" style={{ background: "transparent" }}>
          <Check className="h-3.5 w-3.5" /> C'est la bonne société
        </button>
      )}
      {!d.confirme && d.autres?.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="m-0 text-[12.5px] text-brume">Autres sociétés possibles</p>
          {d.autres.map((x) => (
            <p key={x.siren} className="m-0 flex flex-wrap items-baseline gap-x-2 text-[13px] text-craie">
              <span>{x.nom || x.enseigne || x.siren}</span>
              <span className="text-[12.5px] text-brume">{[x.enseigne && x.enseigne !== x.nom ? x.enseigne : null, x.depuis ? `depuis ${String(x.depuis).slice(0, 4)}` : null, x.siren].filter(Boolean).join(" · ")}</span>
              <button type="button" onClick={() => onSiren(x.siren)} className="text-[12.5px] text-menthe hover:underline" style={{ background: "transparent" }}>Choisir</button>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

/** La note de l'IA : son avis en deux phrases au plus ; écrite après l'outil, en quelques secondes. */
function NoteIA({ l }) {
  const note = l?.resultat?.note_ia;
  const recent = l?.fini_le && Date.now() - Date.parse(l.fini_le) < 3 * 60000;
  if (!l || l.statut === "en_cours") return <p className="m-0 text-[13px] text-brume">La note viendra quand l'outil aura fini.</p>;
  if (!note) return recent ? <p className="m-0 flex items-center gap-2 text-[13px] text-ardoise"><Loader2 className="h-3.5 w-3.5 animate-spin" /> L'IA lit le résultat…</p> : <p className="m-0 text-[13px] text-brume">Pas de note pour ce lancement : relancez l'outil.</p>;
  if (note.erreur) return <p className="m-0 text-[13px] text-brume">La note n'a pas pu s'écrire. Relancez l'outil.</p>;
  // Deux phrases au plus, sans liste « À vérifier » (12 nov. 2026, Jules).
  return <p className="m-0 text-[13.5px] leading-[1.6] text-craie">{montants(note.avis)}</p>;
}

// L'en-tête n'a pas de filet du bas : la première ligne porte le sien (LIGNE_GRILLE), deux filets faisaient un trait épais.
// Le nom de l'outil, la date et les gestes à gauche ; à droite, sur toute la hauteur du cadre, la note de l'IA.
function Tableau({ o, onRelancer, onVerifier, onSiren, relance, apercu }) {
  const [rue, setRue] = useState(false);
  const l = o.lancement;
  const e = etatOutil(o);
  const r = l?.resultat;
  const icone = "grid h-7 w-7 place-items-center rounded-full transition-colors hover:bg-relief disabled:opacity-50";
  return (
    <section id={`outil-${o.cle}`} className="scroll-mt-6">
      <div className={CADRE_GRILLE}>
        <div className="grid grid-cols-[minmax(0,1fr)_340px] max-xl:grid-cols-[minmax(0,1fr)_280px] max-lg:grid-cols-1">
          <div className="min-w-0">
            <header className="flex min-h-[44px] flex-wrap items-center gap-x-3 gap-y-1 px-2.5 py-1.5 max-lg:px-0">
              <h2 className="m-0 text-[14px] font-normal text-encre">{o.nom}</h2>
              {l && <span className="text-[12.5px] text-brume">{l.statut === "en_cours" ? "En cours…" : `Lu le ${new Date(l.fini_le || l.lance_le).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}`}</span>}
              {o.a_relancer && <span className="text-[12.5px] text-ambre" title={o.a_relancer}>À relancer</span>}
              <span className="flex items-center gap-0.5">
                {!apercu && <button type="button" onClick={() => onRelancer([o.cle])} disabled={relance || l?.statut === "en_cours"} aria-label={`Relancer ${o.nom}`} title="Relancer" className={`${icone} text-ardoise hover:text-encre`} style={{ background: "transparent" }}>
                  {l?.statut === "en_cours" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCw className="h-3.5 w-3.5" />}
                </button>}
                {!apercu && l?.statut === "fini" && (
                  <button type="button" onClick={() => onVerifier(l.id, !l.verifie)} aria-label={l.verifie ? "Revenir à « lu »" : "Marquer vérifié"} title={l.verifie ? `Vérifié par ${(l.verifie.par || "").split("@")[0]}` : "Marquer vérifié"}
                    className={`${icone} ${l.verifie ? "text-menthe" : "text-ardoise hover:text-encre"}`} style={{ background: "transparent" }}>
                    <Check className="h-3.5 w-3.5" />
                  </button>
                )}
              </span>
              {o.cle === "emplacement" && r?.rue && <button type="button" onClick={() => setRue((v) => !v)} className="rounded-full px-2 py-1 text-[12.5px] text-ardoise hover:bg-relief hover:text-encre" style={{ background: "transparent" }}>{rue ? "Replier la rue" : "La rue"}</button>}
            </header>
            {(r?.points || []).map((p) => <Ligne key={p.cle} p={p} apercu={apercu} onSiren={o.cle === "locataire" ? onSiren : null} />)}
            {!r?.points?.length && <p className="m-0 border-t border-trait px-2.5 py-3 text-[13.5px] text-brume">{l?.statut === "en_cours" ? "Lecture en cours ; les autres outils s'affichent déjà." : e.texte}</p>}
          </div>
          <aside aria-label={`Note de l'IA sur ${o.nom.toLowerCase()}`} className="flex min-w-0 flex-col border-l border-trait max-lg:border-l-0 max-lg:border-t">
            <p className="m-0 flex min-h-[44px] items-center px-4 text-[12.5px] text-brume">Note de l'IA</p>
            <div className="border-t border-trait px-4 py-3">
              <NoteIA l={l} />
            </div>
          </aside>
        </div>
      </div>
      {rue && r?.rue && <div className="mt-3 rounded-[12px] border border-trait p-5 max-md:p-4"><RueDetail x={r.rue} id={r.rue_id} /></div>}
    </section>
  );
}

export default function MarcheAffine({ dealId, index = 0, apercu = false }) {
  const queryClient = useQueryClient();
  const q = useOutilsDossier(dealId, index);
  const lancer = useMutation({
    mutationFn: (outils) => base44.request("POST", `/api/preanalyse/dossiers/${encodeURIComponent(dealId)}/lots/${index}/outils`, { body: outils ? { outils } : {} }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: cleOutilsDossier(dealId, index) }),
    onError: (e) => toast.error(e?.data?.error || e?.message || "Les outils n'ont pas pu partir"),
  });
  const siren = useMutation({
    mutationFn: (valeur) => base44.request("POST", `/api/preanalyse/dossiers/${encodeURIComponent(dealId)}/lots/${index}/locataire-siren`, { body: { siren: valeur } }),
    onSuccess: (r) => { toast.success(r.siren ? "Société fixée : l'outil Locataire repart avec elle" : "Société retirée : l'outil cherche à nouveau"); queryClient.invalidateQueries({ queryKey: cleOutilsDossier(dealId, index) }); },
    onError: (e) => toast.error(e?.data?.error || e?.message || "La société n'a pas pu être fixée"),
  });
  const verifier = useMutation({
    mutationFn: ({ id, verifie }) => base44.request("POST", `/api/outils/lancements/${id}/verifier`, { body: { verifie } }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: cleOutilsDossier(dealId, index) }),
  });
  // Un dossier créé avant les outils n'a jamais été lancé : la première ouverture le fait.
  const lanceUneFois = useRef(false);
  useEffect(() => {
    if (apercu || !q.data || lanceUneFois.current) return;
    if (q.data.outils.some((o) => o.lancement)) return;
    if (!q.data.entrees?.adresse && !q.data.entrees?.locataire) return;
    lanceUneFois.current = true;
    lancer.mutate(null);
  }, [q.data, apercu]);
  // L'onglet ouvert : ce qui est arrivé est vu, la pastille « nouveau » s'éteint.
  useEffect(() => { if (!apercu && q.data) marquerVu(dealId, q.data); }, [q.data, dealId, apercu]);

  if (q.isLoading) return <div className="flex items-center gap-2 py-8 text-[13.5px] text-ardoise"><Loader2 className="h-4 w-4 animate-spin" /> Chargement…</div>;
  if (q.isError) return <p className="py-8 text-[13.5px] text-alerte">{q.error?.message || "Les outils ne se lisent pas."}</p>;
  const { outils = [], entrees = {} } = q.data || {};
  const lu = [entrees.adresse?.split(",")[0], entrees.locataire, entrees.surface ? `${entrees.surface} m²` : null, entrees.loyer ? montants(`loyer ${entrees.loyer.toLocaleString("fr-FR")} €`) : null, entrees.prix ? montants(`${entrees.prix.toLocaleString("fr-FR")} €`) : null].filter(Boolean);

  return (
    <div className="flex flex-col">
      {!lu.length && <p className="m-0 -mt-3 mb-6 text-[12.5px] text-brume">Ajoutez l'adresse ou le locataire dans la préanalyse : les outils partiront seuls.</p>}
      {lu.length > 0 && <p className="m-0 -mt-3 mb-6 text-[12.5px] text-brume">{lu.join(" · ")}</p>}
      <nav aria-label="Verdicts" className="grid grid-cols-5 border-b border-trait pb-5 max-md:grid-cols-2 max-md:gap-y-4">
        {outils.map((o) => {
          const statut = o.lancement?.resultat?.statut || (o.lancement?.statut === "en_cours" ? null : "vide");
          return (
            <button key={o.cle} type="button" onClick={() => document.getElementById(`outil-${o.cle}`)?.scrollIntoView({ behavior: "smooth", block: "start" })}
              className="flex flex-col items-start gap-1 rounded-[10px] px-2.5 py-1.5 text-left transition-colors hover:bg-relief" style={{ background: "transparent" }}>
              <span className="text-[12.5px] text-brume">{o.nom}</span>
              <span className="flex items-center gap-2">
                {statut ? <Point statut={statut} /> : <Loader2 className="h-3 w-3 animate-spin text-brume" />}
                <span className={`text-[18px] tabular-nums ${statut === "vide" ? "text-brume" : "text-encre"}`}>{chiffreDe(o)}</span>
              </span>
            </button>
          );
        })}
      </nav>
      <div className="mt-8 flex flex-col gap-6">
        {outils.map((o) => <Tableau key={o.cle} o={o} apercu={apercu} onSiren={(v) => siren.mutate(v)} onRelancer={(c) => lancer.mutate(c)} onVerifier={(id, v) => verifier.mutate({ id, verifie: v })} relance={lancer.isPending} />)}
        {!apercu && <button type="button" onClick={() => lancer.mutate(null)} disabled={lancer.isPending} className="inline-flex h-8 items-center gap-1.5 self-start rounded-full border border-trait px-3.5 text-[13px] text-craie hover:border-bord-vif hover:text-encre disabled:opacity-50" style={{ background: "transparent" }}>
          {lancer.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCw className="h-3.5 w-3.5" />}Tout relancer
        </button>}
      </div>
    </div>
  );
}
