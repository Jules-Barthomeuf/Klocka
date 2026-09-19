import React, { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, Play, Loader2, ChevronLeft, ChevronRight, Trash2, Check, X, Clock, Calculator } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useUser } from "@/components/providers/UserProvider";
import { toast } from "@/components/ui/avis";
import { MecaniqueEnLigne } from "@/components/kdata/Mecanique";

// K-Estimation : estimer des murs commerciaux par le rendement.
//
// Le parcours suit celui de K-Expertise, parce que c'est le même geste : une
// adresse, une attente, un résultat. L'écran de chargement calcule le taux de
// marché à l'adresse (commerces autour, niveau de vie de la zone) ; le
// formulaire en quatre étapes décrit le bien ; la dernière étape divise le
// loyer par le taux et montre, ligne à ligne, ce qui l'a fait bouger.
//
// L'habit est celui des cartes du tableau de bord K-Data : bg-surface, filet
// trait, rayon de 18, sans flou.

const CARTE = "rounded-[18px] border border-trait bg-surface";
const ETAPES_FORM = ["Base", "Bien", "Occupation", "Estimation"];

// La mécanique : dans quel ordre K-Estimation interroge quoi.
const ETAPES_MECANIQUE = [
  { source: "Base Adresse Nationale", quoi: "Localise l'adresse tapée." },
  { source: "OpenStreetMap", quoi: "La densité commerciale autour du point : le taux de marché en tient compte avant toute saisie." },
  { source: "INSEE Filosofi", quoi: "Le niveau de vie et la densité de population de la zone de 800 m." },
  { source: "Vos réponses", quoi: "État du bâtiment et du local, caractéristiques commerciales, situation locative : chaque réponse ajoute ou retire des points au taux." },
];

const euros = (n) => (n == null ? "—" : `${Math.round(n).toLocaleString("fr-FR")} €`);
const pct = (n) => (n == null ? "—" : `${String(n).replace(".", ",")} %`);
const quand = (iso) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "");

// ── Les briques du formulaire ──────────────────────────────────────────────

function Fil({ etape }) {
  return (
    <div className="mb-7 flex flex-wrap items-center gap-2">
      {ETAPES_FORM.map((nom, i) => {
        const n = i + 1;
        const fait = n < etape;
        const ici = n === etape;
        return (
          <React.Fragment key={nom}>
            {i > 0 && <span className="h-px w-5 bg-trait" />}
            <span className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] uppercase tracking-[.12em] ${ici ? "bg-menthe/[0.12] text-menthe-texte" : fait ? "text-menthe-texte" : "text-brume"}`}>
              <span className={`flex h-5 w-5 items-center justify-center rounded-full border text-[10px] ${ici || fait ? "border-menthe/50" : "border-bord"}`}>
                {fait ? <Check className="h-3 w-3" /> : n}
              </span>
              {nom}
            </span>
          </React.Fragment>
        );
      })}
    </div>
  );
}

function Champ({ label, obligatoire = false, children, aide = null }) {
  return (
    <div className="mb-4">
      <label className="alx-mont mb-1.5 block text-[10.5px] uppercase tracking-[.14em] text-encre">
        {label}{obligatoire && <span className="text-menthe-texte"> *</span>}
      </label>
      {children}
      {aide && <p className="m-0 mt-1 text-[11px] text-brume">{aide}</p>}
    </div>
  );
}

/** Un nombre avec son unité collée au champ. */
function Nombre({ valeur, onChange, unite, placeholder = "" }) {
  return (
    <div className="flex items-center gap-2 rounded-[10px] border border-bord bg-surface px-3 focus-within:border-menthe">
      <input
        type="text" inputMode="decimal" value={valeur ?? ""} placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 w-full bg-transparent text-[14px] tabular-nums text-encre outline-none placeholder:text-brume"
      />
      <span className="flex-shrink-0 text-[13px] text-ardoise">{unite}</span>
    </div>
  );
}

/** Le choix en pastilles : c'est la forme du formulaire d'origine. */
function Pastilles({ options, valeur, onChange }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const actif = valeur === o.valeur;
        return (
          <button
            key={o.valeur} type="button" onClick={() => onChange(o.valeur)}
            className={`rounded-full border px-3.5 py-1.5 text-[12.5px] transition-colors ${actif ? "border-menthe bg-menthe/[0.14] text-menthe-texte" : "border-bord text-ardoise hover:border-bord-doux hover:text-encre"}`}
          >
            {o.nom}
          </button>
        );
      })}
    </div>
  );
}

function Boutons({ onRetour, onSuivant, labelSuivant = "Continuer", occupe = false, desactive = false }) {
  return (
    <div className="mt-7 flex items-center gap-2 border-t border-trait pt-5">
      <button onClick={onRetour} className="inline-flex h-10 items-center gap-1.5 rounded-full border border-bord px-4 text-[12px] uppercase tracking-[.12em] text-ardoise hover:text-encre">
        <ChevronLeft className="h-3.5 w-3.5" />Retour
      </button>
      <button onClick={onSuivant} disabled={desactive || occupe}
        className="inline-flex h-10 items-center gap-1.5 rounded-full bg-menthe px-5 text-[12px] font-medium uppercase tracking-[.12em] text-sur-menthe disabled:opacity-50">
        {occupe ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}{labelSuivant}
        {!occupe && <ChevronRight className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

// ── L'écran de chargement, le même geste que pour une expertise ────────────

function Chargement({ estimation: e }) {
  return (
    <div className="mx-auto max-w-[620px] px-4 pt-16 text-center">
      <p className="alx-mont m-0 text-[11px] uppercase tracking-[.2em] text-menthe-texte">Calcul du marché</p>
      <h2 className="mt-2 mb-1 text-[24px] font-light text-encre">{e?.libelle || e?.adresse}</h2>
      <p className="m-0 text-[13px] text-ardoise">{e?.activite}</p>
      <div className="mx-auto mt-8 h-3 w-full overflow-hidden rounded-full bg-relief">
        <div className="h-full rounded-full bg-menthe transition-[width] duration-700" style={{ width: `${Math.max(4, e?.progression || 0)}%` }} />
      </div>
      <p className="m-0 mt-2 text-[12px] tabular-nums text-brume">{e?.progression || 0} %</p>
      <ul className="mx-auto mt-8 m-0 max-w-[460px] list-none space-y-2 p-0 text-left">
        {(e?.etapes || []).map((s) => (
          <li key={s.cle} className="flex items-start gap-3 text-[13px]">
            <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border border-bord">
              {s.etat === "faite" ? <Check className="h-3 w-3 text-vert" /> : s.etat === "ratee" ? <X className="h-3 w-3 text-alerte" /> : s.etat === "en_cours" ? <Loader2 className="h-3 w-3 animate-spin text-menthe" /> : <Clock className="h-3 w-3 text-brume" />}
            </span>
            <span className="min-w-0">
              <span className={`block ${s.etat === "a_faire" ? "text-brume" : "text-encre"}`}>{s.nom}</span>
              {s.detail && <span className="block text-[11.5px] text-ardoise">{s.detail}</span>}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-8 mb-0 text-[11.5px] leading-[1.6] text-brume">Le taux de marché se calcule sur des sources ouvertes : aucun crédit n&apos;est dépensé.</p>
    </div>
  );
}

// ── L'écran d'explication, avant le formulaire ─────────────────────────────

function Explication({ onCommencer }) {
  const etapes = [
    "Vous renseignez le loyer, le local et la situation locative.",
    "L'outil ajuste automatiquement le ratio selon les informations saisies.",
    "Vous obtenez une estimation basse, moyenne et haute des murs.",
  ];
  return (
    <div className={`${CARTE} p-7 max-md:p-4`}>
      <h2 className="m-0 mb-1 text-[19px] font-medium text-encre">Comprendre le fonctionnement de l&apos;estimation</h2>
      <div className="mt-4 space-y-3 text-[13.5px] leading-[1.75] text-craie">
        <p className="m-0">L&apos;outil estime les murs commerciaux suivant le principe de rendement attendu par un investisseur.</p>
        <p className="m-0">
          L&apos;estimation se base sur le taux de rendement de marché correspondant au niveau de rentabilité attendu par les
          investisseurs pour acquérir des murs commerciaux sur un secteur donné, en fonction notamment de l&apos;emplacement,
          du risque locatif et de l&apos;attractivité du marché.
        </p>
        <p className="m-0 rounded-[12px] border border-trait bg-relief p-4 text-[13px]">
          <span className="font-medium text-encre">Lecture :</span> plus le rendement exigé est faible, plus les investisseurs
          acceptent de payer cher les murs commerciaux, ce qui augmente leur valeur. À l&apos;inverse, un rendement élevé
          traduit généralement un niveau de risque plus important et donc une valeur plus faible.
        </p>
      </div>

      <p className="alx-mont mt-7 mb-3 text-[10.5px] uppercase tracking-[.14em] text-brume">Créer l&apos;estimation en 3 étapes</p>
      <ol className="m-0 list-none space-y-2 p-0">
        {etapes.map((t, i) => (
          <li key={i} className="flex items-start gap-3 rounded-[12px] border border-trait bg-relief px-4 py-3 text-[13px] text-craie">
            <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border border-menthe/50 text-[11px] text-menthe-texte">{i + 1}</span>
            {t}
          </li>
        ))}
      </ol>

      <button onClick={onCommencer}
        className="mt-7 inline-flex h-11 items-center gap-2 rounded-full bg-menthe px-6 text-[12.5px] font-medium uppercase tracking-[.12em] text-sur-menthe">
        <Play className="h-4 w-4" />Commencer l&apos;estimation
      </button>
    </div>
  );
}

// ── Le résultat ────────────────────────────────────────────────────────────

function Resultat({ estimation: e }) {
  const r = e.resultat;
  const marche = e.marche || {};
  const lignes = [...(r.facteurs_marche || []).map((f) => ({ ...f, origine: "Marché" })), ...(r.facteurs || []).map((f) => ({ ...f, origine: "Bien" }))];

  return (
    <div className={`${CARTE} p-7 max-md:p-4`}>
      <div className="grid gap-3 md:grid-cols-3">
        {[["Estimation basse", r.valeurs.basse, r.taux_fourchette.haut], ["Estimation moyenne", r.valeurs.moyenne, r.taux_fourchette.moyen], ["Estimation haute", r.valeurs.haute, r.taux_fourchette.bas]].map(([titre, valeur, taux], i) => (
          <div key={titre} className={`overflow-hidden rounded-[12px] border ${i === 1 ? "border-menthe/40" : "border-bord"}`}>
            <p className="m-0 bg-relief px-3 py-1.5 text-center text-[11px] uppercase tracking-[.08em] text-brume">{titre}</p>
            <p className={`m-0 py-4 text-center text-[24px] font-semibold tabular-nums ${i === 1 ? "text-menthe-texte" : "text-encre"}`}>{euros(valeur)}</p>
            <p className="m-0 border-t border-trait px-3 py-1.5 text-center text-[11px] text-ardoise">rendement de {pct(taux)}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <div className="rounded-[12px] border border-trait bg-relief px-4 py-3">
          <p className="m-0 text-[11px] uppercase tracking-[.08em] text-brume">Loyer annuel retenu</p>
          <p className="m-0 mt-1 text-[16px] font-medium tabular-nums text-encre">{euros(r.loyer_annuel)}</p>
        </div>
        <div className="rounded-[12px] border border-trait bg-relief px-4 py-3">
          <p className="m-0 text-[11px] uppercase tracking-[.08em] text-brume">Taux d&apos;effort</p>
          <p className="m-0 mt-1 text-[16px] font-medium tabular-nums text-encre">{r.taux_effort == null ? "Non communiqué" : pct(r.taux_effort)}</p>
        </div>
        <div className="rounded-[12px] border border-trait bg-relief px-4 py-3">
          <p className="m-0 text-[11px] uppercase tracking-[.08em] text-brume">Prix au m²</p>
          <p className="m-0 mt-1 text-[16px] font-medium tabular-nums text-encre">{r.prix_m2 == null ? "Surface non renseignée" : `${r.prix_m2.toLocaleString("fr-FR")} €`}</p>
        </div>
      </div>

      <h3 className="alx-mont mt-8 mb-3 text-[10.5px] uppercase tracking-[.14em] text-brume">Pourquoi ce taux</h3>
      <div className="rounded-[12px] border border-trait bg-relief px-4 py-3">
        <div className="flex items-baseline justify-between border-b border-trait py-2 text-[13px]">
          <span className="text-craie">Point de départ du modèle</span>
          <span className="tabular-nums text-encre">{pct(marche.pivot ?? null)}</span>
        </div>
        {lignes.map((f, i) => (
          <div key={i} className="flex items-baseline justify-between gap-4 border-b border-trait py-2 text-[13px]">
            <span className="min-w-0 text-craie">
              <span className="alx-mont mr-2 text-[10px] uppercase tracking-[.1em] text-brume">{f.origine}</span>
              {f.libelle}
            </span>
            <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[12px] font-medium tabular-nums ${f.points < 0 ? "bg-vert/15 text-vert" : "bg-alerte/15 text-alerte"}`}>
              {f.points > 0 ? "+" : ""}{String(f.points).replace(".", ",")} pt
            </span>
          </div>
        ))}
        <div className="flex items-baseline justify-between py-2 text-[13px]">
          <span className="font-medium text-encre">Taux retenu</span>
          <span className="font-semibold tabular-nums text-menthe-texte">{pct(r.taux)}</span>
        </div>
      </div>

      <p className="mt-4 mb-0 text-[11px] italic leading-[1.6] text-brume">
        Valeur = loyer annuel ÷ taux de rendement. Le taux de marché vient des commerces relevés autour du point
        (OpenStreetMap) et de la zone de chalandise de {marche.rayon_zone_m || 800} m (INSEE Filosofi) ; les ajustements
        viennent de vos réponses. Une estimation n&apos;est pas une expertise : elle situe, elle ne vaut pas avis de valeur.
      </p>

      <MecaniqueEnLigne etapes={ETAPES_MECANIQUE} titre="La mécanique : d'où vient ce taux" className="mt-4" />
    </div>
  );
}

// ── Le formulaire, quatre étapes ───────────────────────────────────────────

function Formulaire({ estimation: e, choix, onCalculee, onQuitter }) {
  const [etape, setEtape] = useState(e.resultat ? 4 : 0);
  const [rep, setRep] = useState(() => e.reponses || {});
  const poser = (cle, v) => setRep((r) => ({ ...r, [cle]: v }));

  const enregistrer = useMutation({
    mutationFn: () => base44.request("PATCH", `/api/kestimation/${e.id}`, { body: { reponses: rep } }),
    onSuccess: (r) => { onCalculee(r.estimation); setEtape(4); },
    onError: (err) => toast.error(err?.message || "Estimation impossible"),
  });

  const Options = ({ cle }) => <Pastilles options={choix?.[cle]?.options || []} valeur={rep[cle]} onChange={(v) => poser(cle, v)} />;

  if (etape === 0) return <Explication onCommencer={() => setEtape(1)} />;

  return (
    <div className={`${CARTE} p-7 max-md:p-4`}>
      <Fil etape={etape} />

      {etape === 1 && (
        <>
          <h2 className="m-0 mb-1 text-[19px] font-medium text-encre">Données de base</h2>
          <p className="m-0 mb-6 text-[13px] text-ardoise">Commencez par les deux informations les plus importantes.</p>
          <Champ label="Loyer annuel (HT / HC)" obligatoire>
            <Nombre valeur={rep.loyer_annuel} onChange={(v) => poser("loyer_annuel", v)} unite="€" placeholder="30 000" />
          </Champ>
          <Champ label="Dernier chiffre d'affaires HT" aide="Facultatif. Il sert à mesurer le taux d'effort du locataire.">
            <Nombre valeur={rep.ca_ht} onChange={(v) => poser("ca_ht", v)} unite="€" placeholder="250 000" />
          </Champ>
          <Boutons onRetour={onQuitter} onSuivant={() => setEtape(2)} desactive={!String(rep.loyer_annuel || "").trim()} />
        </>
      )}

      {etape === 2 && (
        <>
          <h2 className="m-0 mb-1 text-[19px] font-medium text-encre">Qualité et potentiel du bien</h2>
          <p className="m-0 mb-6 text-[13px] text-ardoise">Décrivez le bâtiment, le local et ses caractéristiques commerciales.</p>
          <Champ label="État général du bâtiment"><Options cle="etat_batiment" /></Champ>
          <Champ label="État général du local"><Options cle="etat_local" /></Champ>
          <div className="grid gap-4 md:grid-cols-2">
            <Champ label="Surface du local"><Nombre valeur={rep.surface_m2} onChange={(v) => poser("surface_m2", v)} unite="m²" placeholder="80" /></Champ>
            <Champ label="Longueur de vitrine"><Nombre valeur={rep.vitrine_m} onChange={(v) => poser("vitrine_m", v)} unite="m" placeholder="6" /></Champ>
          </div>
          <Champ label="Local d'angle ?"><Options cle="angle" /></Champ>
          <Champ label="Extraction ?"><Options cle="extraction" /></Champ>
          <Champ label="Parking disponible ?"><Options cle="parking" /></Champ>
          <Champ label="Accessibilité PMR"><Options cle="pmr" /></Champ>
          <Boutons onRetour={() => setEtape(1)} onSuivant={() => setEtape(3)} />
        </>
      )}

      {etape === 3 && (
        <>
          <h2 className="m-0 mb-1 text-[19px] font-medium text-encre">Occupation et situation locative</h2>
          <p className="m-0 mb-6 text-[13px] text-ardoise">Précisez la présence d&apos;un logement et le profil de l&apos;occupant.</p>
          <Champ label="Présence d'un logement ?"><Options cle="logement" /></Champ>
          <Champ label="Situation locative"><Options cle="situation" /></Champ>
          {/* Ce qui suit décrit l'occupant : sur un local vide, il n'y a rien à
              en dire, et ces questions ne se posent pas. */}
          {rep.situation === "occupe" && (
            <>
              <Champ label="Date du prochain renouvellement">
                <input type="date" value={rep.renouvellement || ""} onChange={(ev) => poser("renouvellement", ev.target.value)}
                  className="h-11 w-full rounded-[10px] border border-bord bg-surface px-3 text-[14px] text-encre outline-none focus:border-menthe" />
              </Champ>
              <Champ label="Réseau d'enseigne ?"><Options cle="reseau" /></Champ>
              <Champ label="Ancienneté de l'activité dans le local"><Options cle="anciennete" /></Champ>
              <Champ label="Retards de paiement ?"><Options cle="retards" /></Champ>
              <Champ label="Licence IV ?"><Options cle="licence_iv" /></Champ>
            </>
          )}
          <Boutons onRetour={() => setEtape(2)} onSuivant={() => enregistrer.mutate()} labelSuivant="Estimer" occupe={enregistrer.isPending} />
        </>
      )}

      {etape === 4 && e.resultat && (
        <>
          <Resultat estimation={e} />
          <div className="mt-5 flex items-center gap-2">
            <button onClick={() => setEtape(1)} className="inline-flex h-10 items-center gap-1.5 rounded-full border border-bord px-4 text-[12px] uppercase tracking-[.12em] text-ardoise hover:text-encre">
              <ChevronLeft className="h-3.5 w-3.5" />Revoir les réponses
            </button>
          </div>
        </>
      )}
      {etape === 4 && !e.resultat && <p className="m-0 text-[13px] text-ardoise">Le calcul n&apos;a pas abouti.</p>}
    </div>
  );
}

// ── La page ────────────────────────────────────────────────────────────────

export default function KEstimation() {
  const user = useUser();
  const qc = useQueryClient();
  // Une seule partie pour l'instant : on y entre directement depuis le menu
  // Apps, sans passer par un accueil de module qui n'aurait qu'une carte.
  const [partie, setPartie] = useState("murs");
  const [activite, setActivite] = useState("");
  const [adresse, setAdresse] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  // L'adresse retenue dans la liste : le champ la contient, on ne repropose rien.
  const choisie = useRef("");
  const [ouverte, setOuverte] = useState(null);

  const { data } = useQuery({ queryKey: ["kestimation"], queryFn: () => base44.request("GET", "/api/kestimation"), enabled: user?.role === "admin" });
  const estimations = data?.estimations || [];
  const choix = data?.choix;

  const { data: detail } = useQuery({
    queryKey: ["kestimation", ouverte],
    queryFn: () => base44.request("GET", `/api/kestimation/${ouverte}`),
    enabled: !!ouverte,
    refetchInterval: (q) => (q.state.data?.estimation?.etat === "en_cours" ? 1500 : false),
  });
  const e = detail?.estimation;
  useEffect(() => {
    if (e && e.etat !== "en_cours") qc.invalidateQueries({ queryKey: ["kestimation"] });
  }, [e?.etat, qc]);

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

  const lancer = useMutation({
    mutationFn: () => base44.request("POST", "/api/kestimation", { body: { adresse, activite } }),
    onSuccess: (r) => { setOuverte(r.id); setSuggestions([]); qc.invalidateQueries({ queryKey: ["kestimation"] }); },
    onError: (err) => toast.error(err?.message || "Lancement impossible"),
  });
  const supprimer = useMutation({
    mutationFn: (id) => base44.request("DELETE", `/api/kestimation/${id}`),
    onSuccess: () => { setOuverte(null); qc.invalidateQueries({ queryKey: ["kestimation"] }); },
  });

  const titre = useMemo(() => e?.libelle || e?.adresse || "", [e]);

  if (!user || user.role !== "admin") return null;

  // Une estimation ouverte : chargement, puis formulaire.
  if (ouverte && e) {
    if (e.etat === "en_cours") return <div className="min-h-screen pt-2"><Chargement estimation={e} /></div>;
    if (e.etat === "echec") return (
      <div className="mx-auto max-w-[620px] px-4 pt-16 text-center">
        <p className="m-0 text-[15px] text-alerte">{e.erreur || "Le calcul de marché n'a pas abouti."}</p>
        <button onClick={() => setOuverte(null)} className="mt-6 text-[12.5px] text-ardoise hover:text-encre">Revenir</button>
      </div>
    );
    return (
      <div className="mx-auto min-h-screen max-w-[900px] px-4 pb-20 pt-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <button onClick={() => setOuverte(null)} className="inline-flex items-center gap-1.5 text-[12.5px] text-ardoise hover:text-encre">
            <ChevronLeft className="h-4 w-4" />Toutes les estimations
          </button>
          <button onClick={() => { if (window.confirm("Supprimer cette estimation ?")) supprimer.mutate(e.id); }}
            className="inline-flex items-center gap-1.5 text-[12px] text-brume hover:text-alerte"><Trash2 className="h-3.5 w-3.5" />Supprimer</button>
        </div>
        <p className="alx-mont m-0 text-[11px] uppercase tracking-[.2em] text-menthe-texte">Ajouter l&apos;estimation des murs commerciaux</p>
        <h1 className="mt-2 mb-1 text-[26px] font-light tracking-[-0.01em] text-encre">{titre}</h1>
        <p className="m-0 mb-6 text-[13px] text-ardoise">
          {e.activite}
          {e.marche?.taux != null && <span> · taux de marché de {pct(e.marche.taux)}</span>}
        </p>
        <Formulaire estimation={e} choix={choix}
          onCalculee={(estimation) => { qc.setQueryData(["kestimation", e.id], { estimation }); qc.invalidateQueries({ queryKey: ["kestimation"], exact: true }); }}
          onQuitter={() => setOuverte(null)} />
      </div>
    );
  }

  // L'accueil du module : ses parties. Une seule pour l'instant.
  if (!partie) {
    return (
      <div className="mx-auto max-w-[900px] px-4 pb-20 pt-10">
        <p className="alx-mont m-0 text-[11px] uppercase tracking-[.2em] text-menthe-texte">K-Data</p>
        <h1 className="mt-2 mb-2 text-[30px] font-light tracking-[-0.01em] text-encre">Estimation</h1>
        <p className="m-0 mb-7 max-w-[620px] text-[13.5px] leading-[1.7] text-ardoise">
          Estimer un bien commercial à partir de ce qu&apos;il rapporte, et de ce qu&apos;un investisseur exige pour l&apos;acheter.
        </p>
        <button onClick={() => setPartie("murs")} className={`${CARTE} group block w-full p-[22px] text-left transition-colors hover:border-menthe/40`}>
          <span className="flex h-10 w-10 items-center justify-center rounded-[10px] border border-trait bg-relief">
            <Calculator className="h-5 w-5 text-menthe" />
          </span>
          <span className="mt-4 block text-[17px] font-medium text-encre">Estimation de murs commerciaux</span>
          <span className="mt-1 block text-[13px] leading-[1.6] text-ardoise">
            Le loyer, le local et la situation locative donnent le taux de rendement exigé, et le taux donne la valeur.
          </span>
        </button>
      </div>
    );
  }

  // Le départ : un type de commerce, une adresse.
  return (
    <div className="mx-auto max-w-[900px] px-4 pb-20 pt-10">
      <button onClick={() => setPartie(null)} className="mb-4 inline-flex items-center gap-1.5 text-[12.5px] text-ardoise hover:text-encre">
        <ChevronLeft className="h-4 w-4" />Estimation
      </button>
      <h1 className="mt-2 mb-6 text-[30px] font-light tracking-[-0.01em] text-encre">Estimation de murs commerciaux</h1>

      <div className={`${CARTE} p-5`}>
        <label className="alx-mont mb-1.5 block text-[10.5px] uppercase tracking-[.14em] text-encre">Type de commerce</label>
        <input value={activite} onChange={(ev) => setActivite(ev.target.value)} placeholder="Boulangerie, restaurant, opticien… ou vide pour tous les commerces"
          className="mb-4 h-11 w-full rounded-[10px] border border-bord bg-surface px-3 text-[14px] text-encre outline-none placeholder:text-brume focus:border-menthe" />
        <label className="alx-mont mb-1.5 block text-[10.5px] uppercase tracking-[.14em] text-encre">Adresse précise</label>
        <div className="relative">
          <div className="flex items-center gap-2 rounded-[10px] border border-bord bg-surface px-3 focus-within:border-menthe">
            <Search className="h-4 w-4 flex-shrink-0 text-brume" />
            <input value={adresse} onChange={(ev) => setAdresse(ev.target.value)} placeholder="48 rue Basfroi, 75011 Paris"
              className="h-11 w-full bg-transparent text-[14px] text-encre outline-none placeholder:text-brume" />
          </div>
          {suggestions.length > 0 && (
            <ul className="absolute left-0 right-0 top-[48px] z-20 m-0 list-none overflow-hidden rounded-[10px] border border-bord bg-fond p-0 shadow-[0_18px_40px_rgba(0,0,0,0.35)]">
              {suggestions.map((s) => <li key={s}><button onClick={() => { choisie.current = s; setAdresse(s); setSuggestions([]); }} className="block w-full px-3 py-2 text-left text-[13px] text-craie hover:bg-relief hover:text-encre">{s}</button></li>)}
            </ul>
          )}
        </div>
        <p className="mt-3 mb-0 text-[11.5px] leading-[1.6] text-brume">
          Le calcul de marché lit les commerces autour du point et la zone de chalandise. Sources ouvertes : aucun crédit n&apos;est dépensé.
        </p>
        <button onClick={() => lancer.mutate()} disabled={lancer.isPending || adresse.trim().length < 5}
          className="mt-4 inline-flex h-11 items-center gap-2 rounded-full bg-menthe px-6 text-[12.5px] font-medium uppercase tracking-[.12em] text-sur-menthe disabled:opacity-50">
          {lancer.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}Commencer l&apos;estimation
        </button>
      </div>

      <h2 className="mt-10 mb-3 text-[17px] font-medium text-encre">Estimations réalisées</h2>
      {!estimations.length ? <p className="m-0 text-[13px] text-brume">Aucune pour l&apos;instant.</p> : (
        <ul className="m-0 list-none p-0">
          {estimations.map((x) => (
            <li key={x.id}>
              <button onClick={() => setOuverte(x.id)} className="flex w-full items-center gap-4 border-b border-trait py-3 text-left hover:bg-surface">
                <span className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${x.etat === "terminee" ? "bg-vert" : x.etat === "echec" ? "bg-alerte" : "bg-menthe animate-pulse"}`} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-medium text-encre">{x.libelle || x.adresse}</span>
                  <span className="block text-[11.5px] text-brume">{x.activite} · {x.etat === "en_cours" ? `${x.progression} %` : quand(x.fini_le || x.cree_le)}</span>
                </span>
                {x.valeur != null && <span className="flex-shrink-0 text-[13px] font-medium tabular-nums text-menthe-texte">{euros(x.valeur)}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
