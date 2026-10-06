import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Search, X, ArrowRight } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { createPageUrl } from "@/utils";
import { J } from "@/design/jetons";

// Les clients Klocka vus du mandataire (maquette « Clients Admin », 4 oct.
// 2026, reprise pour le côté mandataire) : des cartes ou un tableau, une
// recherche, des familles de commerce, et la fiche d'un client à droite.
// Les clients restent anonymes : des initiales, jamais un nom, un mail ou
// une société, ni le conseiller qui les suit.

const kEuros = (n) => (n == null ? null : `${Math.round(n / 1000).toLocaleString("fr-FR")} k€`);
const zonesDe = (d) => (d.zones?.length ? d.zones.join(", ") : "Toute la France");
const typeDe = (d) => (d.type_commerce ? d.type_commerce.charAt(0).toUpperCase() + d.type_commerce.slice(1) : "Tout commerce");
const nomDe = (d) => (/^client/i.test(d.reference || "") ? d.reference : `Client ${d.reference}`);
const rendementDe = (d) => (d.rendement_min ? `${String(d.rendement_min).replace(".", ",")} %` : "—");
const aProspecter = (d) => d.a_prospecter ?? 0;

/** La date d'entrée du client (celle de Monday) : « 12 mars 2026 ». */
const entreLe = (d, mois = "long") => {
  const t = Date.parse(d.entre_le || "");
  return Number.isFinite(t) ? new Date(t).toLocaleDateString("fr-FR", { day: "numeric", month: mois, year: mois === "long" ? "numeric" : undefined }) : null;
};

function budget(d) {
  if (d.budget_min && d.budget_max) return `${Math.round(d.budget_min / 1000).toLocaleString("fr-FR")} – ${kEuros(d.budget_max)}`;
  return kEuros(d.budget_max || d.budget_min) || "—";
}

// Les familles du filtre, lues dans le type de commerce demandé.
const FAMILLES = [
  ["Tous", null],
  ["Commerce de bouche", /bouche|boulang|p[aâ]tiss|boucher|traiteur|restaura|caf[eé]|bar|cave|[eé]picerie|primeur|fromag/i],
  ["Santé", /sant[eé]|pharma|m[eé]dic|optic|dentaire|kin[eé]|laborat|param[eé]d/i],
  ["Services", /service|coiff|beaut|tabac|presse|pressing|agence|banque|assurance|esth[eé]t|institut/i],
  ["Pieds d'immeuble", /immeuble|^commerce$|tout commerce|local/i],
];
const dansFamille = (d, re) => !re || re.test(d.type_commerce || "tout commerce");

export default function MandataireClients() {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({ queryKey: ["mandataire-demandes"], queryFn: () => base44.request("GET", "/api/mandataire/demandes") });
  const demandes = useMemo(
    () => [...(data?.demandes || [])].sort((a, b) => aProspecter(b) - aProspecter(a) || (b.depuis_jours ?? 0) - (a.depuis_jours ?? 0)),
    [data]
  );
  const [vue, setVue] = useState(() => { try { return localStorage.getItem("k-clients-vue") || "cartes"; } catch { return "cartes"; } });
  const changerVue = (v) => { setVue(v); try { localStorage.setItem("k-clients-vue", v); } catch { /* sans stockage */ } };
  const [recherche, setRecherche] = useState("");
  const [famille, setFamille] = useState("Tous");
  const [ouverte, setOuverte] = useState(null);

  const q = recherche.trim().toLowerCase();
  const re = FAMILLES.find(([f]) => f === famille)?.[1] || null;
  const lignes = demandes
    .filter((d) => dansFamille(d, re))
    .filter((d) => !q || [nomDe(d), d.profil, d.type_commerce, zonesDe(d), d.bail].filter(Boolean).join(" ").toLowerCase().includes(q));
  const aTravailler = demandes.filter((d) => aProspecter(d) > 0).length;
  const d = demandes.find((x) => x.id === ouverte) || null;
  const prospecter = (x) => navigate(`${createPageUrl("MandataireProspection")}?demande=${x.id}`);

  return (
    <div className="mx-auto flex max-w-[1360px] flex-col gap-6 px-5 pb-16 pt-9 md:px-11 max-md:pt-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-baseline gap-3.5">
          <h1 className="m-0 text-[34px] font-medium leading-[1.05] tracking-[-0.01em] text-encre max-md:text-[26px]">Clients</h1>
          {demandes.length > 0 && (
            <span className="text-[15px] text-ardoise">{demandes.length} client{demandes.length > 1 ? "s" : ""} · {aTravailler} à prospecter</span>
          )}
        </div>
        <div className="flex gap-0.5 rounded-full bg-rail-actif p-1" role="tablist" aria-label="Affichage">
          {[["cartes", "Cartes"], ["tableau", "Tableau"]].map(([cle, mot]) => (
            <button key={cle} type="button" role="tab" aria-selected={vue === cle} onClick={() => changerVue(cle)}
              className={`rounded-full px-4 py-[9px] text-[14px] ${vue === cle ? "bg-relief text-encre" : "text-ardoise hover:text-craie"}`}
              style={vue === cle ? undefined : { background: "transparent" }}>{mot}</button>
          ))}
        </div>
      </header>

      <p className="m-0 -mt-3 text-[14px] text-ardoise">Les clients restent anonymes. Vous trouvez le bien, Klocka fait le lien avec eux.</p>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex h-12 min-w-[240px] flex-1 items-center gap-3 rounded-full border border-trait bg-surface px-5 focus-within:border-bord-doux max-md:basis-full">
          <Search className="h-4 w-4 flex-none text-ardoise" />
          <input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Ville, type de bien, profil…"
            className="w-full border-none bg-transparent text-[15px] text-encre outline-none placeholder:text-brume max-md:text-[16px]" />
        </div>
        {FAMILLES.map(([f]) => (
          <button key={f} type="button" onClick={() => setFamille(f)}
            className={`h-12 rounded-full border px-[18px] text-[15px] transition-colors max-md:h-10 max-md:px-4 max-md:text-[14px] ${famille === f ? "border-encre bg-encre text-fond" : "border-trait bg-surface text-craie hover:border-bord-doux hover:text-encre"}`}>
            {f}
          </button>
        ))}
      </div>

      {isLoading && <p className="m-0 text-[14px] text-brume">Lecture…</p>}
      {!isLoading && !demandes.length && (
        <p className="m-0 text-[14px] text-brume">Aucun client pour l'instant. Ils apparaissent ici dès que Klocka publie une recherche.</p>
      )}
      {!isLoading && demandes.length > 0 && !lignes.length && (
        <p className="m-0 rounded-[18px] border border-dashed border-trait p-12 text-center text-[15px] text-brume">Aucun client ne correspond.</p>
      )}

      {lignes.length > 0 && vue === "cartes" && (
        <div className="grid grid-cols-1 gap-[18px] sm:grid-cols-2 lg:grid-cols-3">
          {lignes.map((x) => <CarteClient key={x.id} d={x} onOuvrir={() => setOuverte(x.id)} />)}
        </div>
      )}

      {lignes.length > 0 && vue === "tableau" && <TableauClients lignes={lignes} onOuvrir={setOuverte} />}

      {d && <FicheClient d={d} onFermer={() => setOuverte(null)} onProspecter={() => prospecter(d)} />}
    </div>
  );
}

// Une icône par client, toujours la même : tirée de son identifiant, parmi
// les 24 de public/avatars. Un visage dessiné, jamais le vrai client.
const NB_AVATARS = 24;
const avatarDe = (d) => {
  let h = 0;
  for (const c of String(d.id || d.reference || "")) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `/avatars/client-${String((h % NB_AVATARS) + 1).padStart(2, "0")}.png`;
};

const Avatar = ({ d, taille = "h-[38px] w-[38px]" }) => (
  <img src={avatarDe(d)} alt="" aria-hidden="true" className={`block flex-none rounded-full ${taille}`} />
);

function PastilleEtat({ d }) {
  const n = aProspecter(d);
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-trait bg-fond px-2.5 py-[5px] text-[12px] text-craie">
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: n > 0 ? J["menthe"] : J["brume"] }} />
      {n > 0 ? "À prospecter" : (d.commerces_du_secteur ?? 0) > 0 ? "Tous dans votre liste" : "Rien dans votre secteur"}
    </span>
  );
}

/** Un client en carte : l'état et le type sur la grille de points, ses critères, ce que votre secteur a pour lui. */
function CarteClient({ d, onOuvrir }) {
  const n = aProspecter(d);
  return (
    <article onClick={onOuvrir} className="flex cursor-pointer flex-col overflow-hidden rounded-[18px] border border-trait bg-rail transition-colors hover:border-bord-doux">
      <div className="k-grid k-grid-toujours relative h-24 flex-none border-b border-trait">
        <span className="absolute left-4 top-4"><PastilleEtat d={d} /></span>
        {entreLe(d, "short") && <span className="absolute right-4 top-[18px] text-[12px] text-brume">Depuis le {entreLe(d, "short")}</span>}
        <span className="absolute bottom-3.5 left-4 rounded-full border border-trait bg-fond px-2.5 py-1 text-[12px] text-craie">{typeDe(d)}</span>
      </div>
      <div className="flex flex-1 flex-col gap-4 px-5 pb-5 pt-[18px]">
        <div className="flex items-center gap-3">
          <Avatar d={d} />
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate text-[17px] font-medium text-encre">{nomDe(d)}</span>
            <span className="truncate text-[13px] text-ardoise">{d.profil}</span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-x-3.5 gap-y-3">
          <Critere mot="Budget" valeur={budget(d)} />
          <Critere mot="Rendement min." valeur={rendementDe(d)} />
          <Critere mot="Zones" valeur={zonesDe(d)} large />
          {d.bail && <Critere mot="Bail" valeur={d.bail} large doux />}
        </div>
        <div className="mt-auto flex items-center justify-between gap-2.5 border-t border-trait pt-3.5 max-md:flex-wrap">
          <span className="text-[14px]">
            <span className="text-menthe tabular-nums">{n}</span>{" "}
            <span className="text-ardoise">{n > 1 ? "commerces à prospecter" : n === 1 ? "commerce à prospecter" : "rien à prospecter pour l'instant"}</span>
          </span>
          <span className="flex-none text-[13px] text-ardoise">Voir les critères →</span>
        </div>
      </div>
    </article>
  );
}

const Critere = ({ mot, valeur, large = false, doux = false }) => (
  <div className={`flex min-w-0 flex-col gap-0.5 ${large ? "col-span-2" : ""}`}>
    <span className="text-[12px] text-brume">{mot}</span>
    <span className={`${large ? "text-[14px] leading-[1.45]" : "text-[15px] tabular-nums"} ${doux ? "text-craie" : "text-encre"}`}>{valeur}</span>
  </div>
);

const COLONNES = "grid-cols-[minmax(0,1.3fr)_minmax(0,1.3fr)_minmax(0,1.3fr)_140px_100px_minmax(0,1.5fr)_110px]";

function TableauClients({ lignes, onOuvrir }) {
  return (
    <div className="overflow-x-auto rounded-[18px] border border-trait bg-rail">
      <div className="min-w-[980px]">
        <div className={`grid ${COLONNES} gap-[18px] border-b border-trait px-6 py-3.5 text-[12px] tracking-[0.12em] text-brume`}>
          <span>CLIENT</span><span>TYPE DE BIEN</span><span>ZONES</span><span>BUDGET</span><span>RENDEMENT</span><span>BAIL</span><span>À PROSPECTER</span>
        </div>
        {lignes.map((d) => (
          <div key={d.id} onClick={() => onOuvrir(d.id)} className={`grid ${COLONNES} cursor-pointer items-center gap-[18px] border-b border-trait px-6 py-4 last:border-b-0 hover:bg-surface`}>
            <div className="flex min-w-0 items-center gap-3">
              <Avatar d={d} taille="h-[34px] w-[34px]" />
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate text-[15px] font-medium text-encre">{nomDe(d)}</span>
                <span className="truncate text-[13px] text-ardoise">{d.profil}</span>
              </div>
            </div>
            <span className="text-[14px] text-encre">{typeDe(d)}</span>
            <span className="text-[14px] text-craie">{zonesDe(d)}</span>
            <span className="text-[14px] tabular-nums text-encre">{budget(d)}</span>
            <span className="text-[14px] tabular-nums text-encre">{rendementDe(d)}</span>
            <span className="text-[13px] leading-[1.4] text-ardoise">{d.bail || "—"}</span>
            <span className="text-[14px] tabular-nums text-menthe">{aProspecter(d)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** La fiche d'un client, à droite : ses critères, le mot de l'équipe, ce que votre secteur a pour lui. */
function FicheClient({ d, onFermer, onProspecter }) {
  useEffect(() => {
    const echap = (e) => { if (e.key === "Escape") onFermer(); };
    window.addEventListener("keydown", echap);
    return () => window.removeEventListener("keydown", echap);
  }, [onFermer]);
  const criteres = [
    ["Type de bien", typeDe(d)],
    ["Zones", zonesDe(d)],
    ["Budget", budget(d)],
    ["Apport possible", kEuros(d.apport) || "—"],
    ["Rendement minimum", rendementDe(d)],
    ["Bail", d.bail || "—"],
  ];
  return createPortal(
    <div className="fixed inset-0 z-[80]">
      <div className="absolute inset-0 bg-fond/60 backdrop-blur-[2px]" onClick={onFermer} />
      <aside role="dialog" aria-modal="true" aria-label={nomDe(d)}
        className="absolute inset-y-0 right-0 flex w-[520px] max-w-full flex-col overflow-y-auto border-l border-trait bg-surface-pleine animate-in slide-in-from-right duration-200">
        <div className="flex items-start justify-between gap-4 border-b border-trait px-7 pb-5 pt-7 max-md:px-5 max-md:pt-5">
          <div className="flex min-w-0 items-center gap-3.5">
            <Avatar d={d} taille="h-12 w-12" />
            <div className="flex min-w-0 flex-col gap-1">
              <span className="text-[22px] font-medium text-encre max-md:text-[20px]">{nomDe(d)}</span>
              <span className="text-[13px] text-ardoise">{[d.profil, entreLe(d) ? `client depuis le ${entreLe(d)}` : null].filter(Boolean).join(" · ")}</span>
            </div>
          </div>
          <button type="button" onClick={onFermer} aria-label="Fermer" title="Fermer"
            className="grid h-[34px] w-[34px] flex-none place-items-center rounded-[10px] text-ardoise hover:bg-relief hover:text-encre" style={{ background: "transparent" }}>
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-col px-7 py-5 max-md:px-5">
          <p className="m-0 pb-1.5 text-[12px] tracking-[0.14em] text-ardoise">CRITÈRES</p>
          {criteres.map(([mot, valeur]) => (
            <div key={mot} className="grid grid-cols-[150px_1fr] gap-4 border-b border-trait py-3 max-md:grid-cols-[112px_1fr] max-md:gap-3">
              <span className="text-[13px] text-ardoise">{mot}</span>
              <span className="text-[14px] leading-[1.5] text-encre">{valeur}</span>
            </div>
          ))}
        </div>

        {(d.remarque || d.information) && (
          <div className="flex flex-col gap-2 px-7 pb-5 pt-1 max-md:px-5">
            <p className="m-0 text-[12px] tracking-[0.14em] text-ardoise">MOT DE L'ÉQUIPE</p>
            {d.remarque && <p className="m-0 whitespace-pre-line text-[14px] leading-[1.55] text-craie">{d.remarque}</p>}
            {d.information && <p className="m-0 text-[13.5px] leading-[1.55] text-ardoise">{d.information}</p>}
          </div>
        )}

        <div className="flex flex-col gap-2.5 px-7 pb-7 pt-1 max-md:px-5">
          <p className="m-0 text-[12px] tracking-[0.14em] text-ardoise">DANS VOTRE SECTEUR</p>
          <div className="grid grid-cols-3 overflow-hidden rounded-[12px] border border-trait bg-surface">
            <Compte n={d.commerces_du_secteur ?? 0} mot="correspondent" />
            <Compte n={d.dans_ma_liste ?? 0} mot="dans votre liste" />
            <Compte n={aProspecter(d)} mot="à prospecter" accent />
          </div>
          <p className="m-0 mt-1 text-[13.5px] leading-[1.55] text-ardoise">Vous ne contactez pas ce client. Quand vous trouvez un bien, Klocka fait le lien.</p>
          <button type="button" onClick={onProspecter}
            className="mt-2 inline-flex h-12 items-center justify-center gap-2 rounded-full bg-menthe px-6 text-[15px] font-medium text-sur-menthe hover:bg-menthe-survol">
            Prospecter pour ce client <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </aside>
    </div>,
    document.body,
  );
}

const Compte = ({ n, mot, accent = false }) => (
  <div className="min-w-0 border-trait px-4 py-3.5 max-md:px-3 [&:not(:first-child)]:border-l">
    <p className={`m-0 text-[22px] leading-none tabular-nums ${accent ? "text-menthe" : "text-encre"}`}>{n}</p>
    <p className="m-0 mt-1.5 text-[12.5px] text-ardoise">{mot}</p>
  </div>
);
