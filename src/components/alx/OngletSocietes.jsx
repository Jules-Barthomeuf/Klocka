import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Bouton, Etiquette, Nombre, TEINTES, joliNom } from "@/components/alx/alx-commun";
import { J } from "@/design/jetons";

// L'onglet Sociétés : partir du bailleur plutôt que de la vitrine. La liste
// des sociétés qui possèdent des murs commerciaux dans la ville, classées par
// la chance qu'un de leurs murs se vende ; un clic ouvre leur portefeuille,
// rangé par le modèle, avec le décideur, l'accroche, et pour chaque bien de
// quoi aller voir ce que c'est : les commerces de l'adresse, la rue, DVF.

const pourcent = (x) => (x == null ? "—" : x > 0.99 ? "> 99 %" : `${String(Math.round(x * 1000) / 10).replace(".", ",")} %`);
const PROFILS = { rotateur: "Arbitre", liquidation: "Vend sans racheter", acheteur: "Achète sans vendre", transmission: "Transmission", stable: "Stable" };
const TRANCHE_MOT = { top_5: "Top 5 %", top_10: "Top 10 %", top_20: "Top 20 %", reste: "Au-delà du top 20 %" };
const teinteTranche = (cle) => (cle === "top_5" ? TEINTES.ecrire : cle === "top_10" || cle === "top_20" ? J["menthe-clair"] : TEINTES.muet);
const PILES_MOT = { appeler: "à appeler", ecrire: "à écrire", surveiller: "à surveiller", ecartee: "écartée" };
const TRIS = [["vente", "chance d'une vente"], ["meilleur", "meilleur bien"], ["murs", "nombre de murs"]];
const PAR_PAGE = 40;

/** Les liens externes d'une société : sa fiche publique, ailleurs. */
const liensSociete = (siren) => [
  ["Pappers", `https://www.pappers.fr/entreprise/${siren}`],
  ["Annuaire des entreprises", `https://annuaire-entreprises.data.gouv.fr/entreprise/${siren}`],
  ["Société.com", `https://www.societe.com/cgi-bin/search?champs=${siren}`],
];

/** Les liens d'un bien : la rue, la carte, les ventes, la parcelle. */
const liensBien = ({ lat, lon, adresse, ville }) => {
  const point = lat != null && lon != null ? `${lat},${lon}` : null;
  const requete = encodeURIComponent([adresse, ville].filter(Boolean).join(", "));
  return [
    point && ["Street View", `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${point}`],
    [adresse ? "Google Maps" : "Chercher sur Maps", point ? `https://www.google.com/maps/search/?api=1&query=${point}` : `https://www.google.com/maps/search/?api=1&query=${requete}`],
    point && ["Ventes DVF", `https://explore.data.gouv.fr/fr/immobilier?onglet=carte&filtre=tous&lat=${lat}&lng=${lon}&zoom=19.5`],
    point && ["Cadastre", `https://www.geoportail.gouv.fr/carte?c=${lon},${lat}&z=19&l0=CADASTRALPARCELS.PARCELLAIRE_EXPRESS(1)&permalink=yes`],
  ].filter(Boolean);
};

function Lien({ href, children }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
      className="rounded-full border border-bord-doux px-3 py-1 text-[12.5px] text-craie transition-colors hover:border-menthe hover:text-menthe">
      {children} ↗
    </a>
  );
}

function Pastille({ children, actif, onClick }) {
  return (
    <button onClick={onClick} className="rounded-full border px-3 py-1 text-[12.5px] transition-colors"
      style={{ borderColor: actif ? J["menthe"] : "rgba(255,255,255,0.1)", color: actif ? J["menthe"] : J["ardoise"], background: actif ? "rgba(150,192,184,0.1)" : "transparent" }}>
      {children}
    </button>
  );
}

/** La première lecture d'une ville : ce qu'ALX télécharge en ce moment. */
function Preparation({ etape }) {
  return (
    <div className="alx-entree mt-8 flex flex-col gap-1.5" role="status" aria-live="polite">
      <p className="m-0 text-[15px] text-encre">ALX prépare les portefeuilles de la ville</p>
      <p className="m-0 text-[13.5px] text-ardoise">{etape}</p>
      <p className="m-0 text-[12.5px] text-brume">Première ouverture : fichier des sociétés du département, ventes DVF, cadastre et vitrines se téléchargent, une à deux minutes. La page se met à jour seule.</p>
    </div>
  );
}

export default function OngletSocietes({ villeId, onOuvrirCible }) {
  const [siren, setSiren] = useState(null);
  const [recherche, setRecherche] = useState("");
  const [filtres, setFiltres] = useState({ plusieurs: true });
  const [tri, setTri] = useState("vente");
  const [page, setPage] = useState(1);
  const { data, isLoading, error } = useQuery({
    queryKey: ["alx-societes", villeId],
    queryFn: () => base44.request("GET", `/api/alx/villes/${villeId}/societes`),
    staleTime: 10 * 60 * 1000,
    // La première ouverture d'une ville télécharge ses sources : on repasse.
    refetchInterval: (q) => (q.state.data?.en_preparation ? 4000 : false),
    retry: false,
  });

  if (siren) return <FicheSociete villeId={villeId} siren={siren} onRetour={() => setSiren(null)} onOuvrirCible={onOuvrirCible} />;
  if (isLoading) return <p className="alx-entree m-0 mt-8 text-[13.5px] text-ardoise">ALX lit le fichier des sociétés propriétaires et classe leurs murs…</p>;
  if (error) return <p className="alx-entree m-0 mt-8 text-[13.5px] text-ardoise">{error.message}</p>;
  if (data?.en_preparation) return <Preparation etape={data.etape} />;

  const simple = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const q = simple(recherche.trim());
  const bascule = (cle) => { setFiltres((f) => ({ ...f, [cle]: !f[cle] })); setPage(1); };
  const toutes = data?.societes || [];
  const liste = toutes
    .filter((s) => !filtres.plusieurs || s.murs >= 2)
    .filter((s) => !filtres.sci || /^SC/.test(s.forme || ""))
    .filter((s) => ["rotateur", "liquidation", "acheteur", "transmission"].every((p) => !filtres[p] || s.profils.includes(p)))
    .filter((s) => !q || simple(`${s.nom} ${s.siren} ${s.meilleur?.adresse || ""}`).includes(q))
    .sort((a, b) => (tri === "meilleur" ? b.meilleur.proba - a.meilleur.proba : tri === "murs" ? b.murs - a.murs || b.proba_vente - a.proba_vente : b.proba_vente - a.proba_vente || b.ventes_attendues - a.ventes_attendues));

  return (
    <div className="alx-entree">
      <div className="mt-6 flex items-center gap-3 rounded-full border border-trait bg-fond py-[7px] pl-5 pr-3 focus-within:border-menthe/50">
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke={J["ardoise"]} strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
        <input value={recherche} onChange={(e) => { setRecherche(e.target.value); setPage(1); }} placeholder="Chercher une société, un SIREN, une adresse" className="min-w-0 flex-1 border-0 bg-transparent py-1.5 text-[15px] text-encre outline-none" />
        {recherche && <button onClick={() => setRecherche("")} className="px-1.5 text-[15px] leading-none text-ardoise hover:text-encre" style={{ background: "transparent" }}>×</button>}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Pastille actif={filtres.plusieurs} onClick={() => bascule("plusieurs")}>2 murs et plus</Pastille>
        <Pastille actif={filtres.sci} onClick={() => bascule("sci")}>SCI et sociétés civiles</Pastille>
        <Pastille actif={filtres.rotateur} onClick={() => bascule("rotateur")}>Arbitres</Pastille>
        <Pastille actif={filtres.liquidation} onClick={() => bascule("liquidation")}>Vendent sans racheter</Pastille>
        <Pastille actif={filtres.acheteur} onClick={() => bascule("acheteur")}>Achètent sans vendre</Pastille>
        <Pastille actif={filtres.transmission} onClick={() => bascule("transmission")}>Transmission</Pastille>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-[12.5px] text-ardoise">
        <span className="flex items-center gap-3">
          <span>Trier</span>
          {TRIS.map(([k, mot]) => <button key={k} onClick={() => setTri(k)} className="hover:text-encre" style={{ background: "transparent", color: tri === k ? J["encre"] : J["ardoise"] }}>{mot}</button>)}
        </span>
        <span className="text-brume">{liste.length} sur {toutes.length} sociétés · fichier DGFiP {data?.millesimes?.[data.millesimes.length - 1]}</span>
      </div>

      <div className="mt-6 grid grid-cols-[minmax(0,1.2fr)_90px_minmax(0,1fr)_minmax(0,180px)_110px] items-center gap-x-4 border-b border-trait px-1.5 pb-3 max-md:grid-cols-[minmax(0,1fr)_90px]">
        <Etiquette>Société</Etiquette>
        <Etiquette className="text-right max-md:hidden">Murs</Etiquette>
        <Etiquette className="max-md:hidden">Le premier à sortir</Etiquette>
        <Etiquette className="max-md:hidden">Profil</Etiquette>
        <Etiquette className="text-right" title="La chance, selon le modèle, qu'au moins un de ses murs se vende dans l'année">Une vente</Etiquette>
      </div>
      {liste.length === 0 && <p className="m-0 px-1.5 py-6 text-[13.5px] text-ardoise">Aucune société avec ces filtres.</p>}
      {liste.slice(0, page * PAR_PAGE).map((s) => (
        <div key={s.siren} onClick={() => setSiren(s.siren)}
          className="alx-entree grid cursor-pointer grid-cols-[minmax(0,1.2fr)_90px_minmax(0,1fr)_minmax(0,180px)_110px] items-center gap-x-4 border-b border-trait px-1.5 py-[15px] transition-colors hover:bg-white/[0.028] max-md:grid-cols-[minmax(0,1fr)_90px]">
          <span className="min-w-0">
            <span className="block truncate text-[15px] font-light text-encre">{joliNom(s.nom)}</span>
            <span className="block truncate text-[12.5px] text-ardoise">{s.forme} · {s.siren}{s.ventes || s.achats ? ` · ${s.ventes} vente${s.ventes > 1 ? "s" : ""}, ${s.achats} achat${s.achats > 1 ? "s" : ""}` : ""}</span>
          </span>
          <span className="text-right max-md:hidden"><Nombre taille={15} teinte={J["encre"]}>{s.murs}</Nombre>{s.parcelles_commune > s.murs && <span className="block text-[11px] text-brume">{s.parcelles_commune} parcelles</span>}</span>
          <span className="min-w-0 max-md:hidden">
            <span className="block truncate text-[13.5px] text-craie">{s.meilleur?.adresse || `Parcelle ${s.meilleur?.parcelle}`}</span>
            {s.meilleur?.tranche && <span className="text-[12.5px]" style={{ color: teinteTranche(s.meilleur.tranche) }}>{TRANCHE_MOT[s.meilleur.tranche]} · {pourcent(s.meilleur.proba)}</span>}
          </span>
          <span className="flex min-w-0 flex-wrap gap-1.5 max-md:hidden">
            {s.profils.map((p) => <Etiquette key={p} teinte={TEINTES.muet} className="!text-[10px]">{PROFILS[p]}</Etiquette>)}
          </span>
          <span className="text-right"><Nombre taille={15} teinte={s.meilleur?.tranche === "top_5" ? TEINTES.ecrire : J["encre"]}>{pourcent(s.proba_vente)}</Nombre></span>
        </div>
      ))}
      {liste.length > page * PAR_PAGE && <button onClick={() => setPage(page + 1)} className="w-full px-1.5 py-3 text-left text-[12.5px] text-menthe hover:text-menthe-clair" style={{ background: "transparent" }}>Voir {Math.min(PAR_PAGE, liste.length - page * PAR_PAGE)} de plus</button>}
      <div className="mt-[22px] flex flex-col gap-1 pb-[22px] text-[13.5px] text-ardoise">
        <p className="m-0">Les sociétés privées propriétaires de murs commerciaux à {data?.ville}. Cliquez pour ouvrir le portefeuille.</p>
        <p className="m-0 text-[12.5px] text-brume">« Une vente » grandit avec le nombre de murs : une société de vingt murs a presque sûrement une vente dans l'année. Pour comparer des portefeuilles de tailles différentes, triez par meilleur bien.</p>
      </div>
    </div>
  );
}

/** Ce qu'il y a exactement à l'adresse : les vitrines, l'annuaire, les cibles. */
function CommercesDuBien({ villeId, parcelle, ouvert, onOuvrirCible }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["alx-parcelle-commerces", villeId, parcelle],
    queryFn: () => base44.request("GET", `/api/alx/villes/${villeId}/parcelles/${parcelle}/commerces`),
    enabled: ouvert,
    staleTime: 10 * 60 * 1000,
    retry: false,
  });
  if (!ouvert) return null;
  if (isLoading) return <p className="m-0 mt-3 text-[12.5px] text-ardoise">ALX lit l'adresse dans l'annuaire des entreprises…</p>;
  if (error) return <p className="m-0 mt-3 text-[12.5px] text-ardoise">{error.message}</p>;
  const rien = !data?.vitrines?.length && !data?.etablissements?.length && !data?.cibles?.length;
  return (
    <div className="mt-3 flex flex-col gap-2 border-t border-trait pt-3">
      {rien && <p className="m-0 text-[12.5px] text-ardoise">Rien de relevé à cette adresse : ouvrez Street View.</p>}
      {data?.cibles?.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {data.cibles.map((c) => <Bouton key={c.id} discret onClick={() => onOuvrirCible(c.id)}>Fiche ALX · {joliNom(c.enseigne) || c.adresse} · {PILES_MOT[c.pile] || c.pile}</Bouton>)}
        </div>
      )}
      {[["Les commerces à cette adresse", (data?.etablissements || []).filter((e) => e.commerce)],
        ["Autres sociétés domiciliées ici", (data?.etablissements || []).filter((e) => !e.commerce)]].map(([titre, liste]) => (
        liste.length > 0 && (
          <div key={titre} className="flex flex-col gap-1.5">
            <Etiquette className="!text-[10px]">{titre}</Etiquette>
            {liste.map((e) => (
              <span key={e.siret} className="flex flex-wrap items-baseline gap-x-2 text-[13.5px] text-craie">
                <span className="text-encre">{joliNom(e.enseigne) || joliNom(e.nom)}</span>
                <span className="text-[12.5px] text-ardoise">
                  {[e.activite || (e.ape ? `code ${e.ape}` : null), e.depuis ? `depuis ${String(e.depuis).slice(0, 4)}` : null, e.chaine ? "enseigne de réseau" : null].filter(Boolean).join(" · ")}
                </span>
                {e.siren && <a href={`https://www.pappers.fr/entreprise/${e.siren}`} target="_blank" rel="noopener noreferrer" className="text-[12.5px] text-menthe hover:text-menthe-clair">Pappers ↗</a>}
              </span>
            ))}
          </div>
        )
      ))}
      {data?.vitrines?.length > 0 && (
        <p className="m-0 text-[12.5px] text-ardoise">
          Vitrines relevées : {data.vitrines.map((v) => [joliNom(v.enseigne), v.type].filter(Boolean).join(" (") + (v.enseigne && v.type ? ")" : "")).join(" · ")}
        </p>
      )}
    </div>
  );
}

function FicheSociete({ villeId, siren, onRetour, onOuvrirCible }) {
  const qc = useQueryClient();
  const [ouvert, setOuvert] = useState(null); // la parcelle dépliée
  const cle = ["alx-societe", villeId, siren];
  const { data: s, isLoading, error, isFetching } = useQuery({
    queryKey: cle,
    queryFn: () => base44.request("GET", `/api/alx/villes/${villeId}/societes/${siren}`),
    staleTime: 10 * 60 * 1000,
    refetchInterval: (q) => (q.state.data?.en_preparation ? 4000 : false),
    retry: false,
  });
  const relire = async () => {
    const r = await base44.request("GET", `/api/alx/villes/${villeId}/societes/${siren}?forcer=1`);
    qc.setQueryData(cle, r);
  };

  return (
    <div className="alx-entree mt-6">
      <button onClick={onRetour} className="inline-flex items-center gap-2 text-[13.5px] text-ardoise hover:text-encre" style={{ background: "transparent" }}>← Toutes les sociétés</button>
      {isLoading && <p className="m-0 mt-6 text-[13.5px] text-ardoise">ALX lit le portefeuille, l'annuaire et le BODACC…</p>}
      {error && <p className="m-0 mt-6 text-[13.5px] text-ardoise">{error.message}</p>}
      {s?.en_preparation && <Preparation etape={s.etape} />}
      {s && !s.en_preparation && (
        <>
          <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
              <h2 className="alx-mont m-0 text-[30px] font-medium tracking-[-.02em] text-encre max-md:text-[24px]">{joliNom(s.societe.nom)}</h2>
              <div className="mt-1 text-[13.5px] text-ardoise">{s.societe.forme} · SIREN {s.societe.siren} · {s.murs.length} mur{s.murs.length > 1 ? "s" : ""} commercia{s.murs.length > 1 ? "ux" : "l"} à {s.ville}</div>
              <div className="mt-3 flex flex-wrap gap-2">
                {liensSociete(s.societe.siren).map(([mot, href]) => <Lien key={mot} href={href}>{mot}</Lien>)}
              </div>
              {s.profils.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">{s.profils.map((p) => <Etiquette key={p.cle} teinte={TEINTES.ecrire} title={p.detail}>{p.mot}</Etiquette>)}</div>
              )}
            </div>
            <div className="text-right">
              <Etiquette>Une vente dans l'année</Etiquette>
              <div className="mt-1"><Nombre taille={30} teinte={TEINTES.ecrire}>{pourcent(s.proba_vente)}</Nombre></div>
              {s.moyenne_adresse != null && <div className="text-[12.5px] text-ardoise">une adresse moyenne : {pourcent(s.moyenne_adresse)}</div>}
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
            <div className="flex flex-col gap-6 rounded-[20px] border border-trait bg-surface p-7">
              {s.accroche && (
                <div className="rounded-[14px] border px-5 py-4" style={{ borderColor: `${TEINTES.ecrire}47` }}>
                  <Etiquette teinte={TEINTES.ecrire}>L'accroche</Etiquette>
                  <p className="m-0 mt-2 text-[15px] leading-[1.6] text-encre">{s.accroche}</p>
                </div>
              )}
              <div>
                <Etiquette>L'analyse</Etiquette>
                <div className="mt-2 flex flex-col gap-2 text-[15px] leading-[1.6] text-craie">{s.analyse.map((l, i) => <p key={i} className="m-0">{l}</p>)}</div>
                {s.profils.length > 0 && <div className="mt-3 flex flex-col gap-1.5 text-[13.5px] text-ardoise">{s.profils.map((p) => <span key={p.cle}><span className="text-craie">{p.mot} :</span> {p.detail}</span>)}</div>}
              </div>
              <div>
                <div className="flex items-baseline justify-between gap-3">
                  <Etiquette>Le décideur</Etiquette>
                  <button onClick={relire} disabled={isFetching} className="text-[12.5px] text-menthe hover:text-menthe-clair disabled:opacity-50" style={{ background: "transparent" }}>Relire l'annuaire</button>
                </div>
                {s.decideur ? (
                  <div className="mt-2 flex flex-col">
                    {(s.decideur.gerants || []).slice(0, 6).map((g, i) => (
                      <div key={i} className="flex items-baseline justify-between gap-3 border-t border-trait py-[10px]">
                        <span className="text-[15px] text-encre">{joliNom(g.nom)}{g.qualite ? <span className="text-ardoise"> · {g.qualite}</span> : null}</span>
                        <Nombre taille={13.5} teinte={J["craie"]}>{g.tranche_age ? `${g.tranche_age} ans` : "—"}</Nombre>
                      </div>
                    ))}
                    <div className="border-t border-trait pt-[10px] text-[13.5px] text-ardoise">
                      Siège : {[s.decideur.siege?.adresse, s.decideur.siege?.ville].filter(Boolean).join(", ") || "non publié"}
                      {s.decideur.creation ? ` · créée en ${s.decideur.creation.slice(0, 4)}` : ""}{s.decideur.active === false ? " · fermée" : ""}
                    </div>
                    {s.decideur.siege?.adresse && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Lien href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([s.decideur.siege.adresse, s.decideur.siege.ville].filter(Boolean).join(", "))}`}>Le siège sur Maps</Lien>
                      </div>
                    )}
                  </div>
                ) : <p className="m-0 mt-2 text-[13.5px] text-ardoise">L'annuaire n'a rien rendu pour ce SIREN.</p>}
              </div>
              {s.evenements.length > 0 && (
                <div>
                  <Etiquette>BODACC, 36 mois</Etiquette>
                  <div className="mt-2 flex flex-col gap-1.5 text-[13.5px] text-craie">{s.evenements.slice(0, 6).map((e, i) => <span key={i}><span className="text-ardoise">{String(e.date).slice(0, 10)}</span> · {e.type}{e.detail ? ` · ${e.detail}` : ""}</span>)}</div>
                </div>
              )}
              {s.mouvements.length > 0 && (
                <div>
                  <Etiquette>Achats et ventes depuis {s.mouvements[s.mouvements.length - 1].date.slice(0, 4)}</Etiquette>
                  <div className="mt-2 flex flex-col gap-1.5 text-[13.5px] text-craie">{s.mouvements.map((m, i) => <span key={i}><span style={{ color: m.type === "vente" ? TEINTES.ecrire : J["ardoise"] }}>{m.type === "vente" ? "Vendu" : "Acheté"}</span> · {m.adresse || m.parcelle} · {m.date.slice(0, 7)}</span>)}</div>
                </div>
              )}
              <div className="border-t border-trait pt-4 text-[12.5px] leading-[1.6] text-brume">{s.limites.map((l, i) => <p key={i} className="m-0 mb-1">{l}</p>)}</div>
            </div>

            <div className="flex flex-col gap-3">
              <Etiquette>Le portefeuille à {s.ville}, dans l'ordre où le proposer</Etiquette>
              {s.murs.map((m) => (
                <div key={m.parcelle} className="rounded-[16px] border px-5 py-4" style={{ borderColor: m.rang === 1 ? `${TEINTES.ecrire}66` : "rgba(255,255,255,0.08)", background: m.rang === 1 ? "rgba(150,192,184,0.05)" : "transparent" }}>
                  <div className="flex flex-wrap items-baseline justify-between gap-3">
                    <span className="min-w-0 text-[15px] text-encre">
                      <span className="mr-2 text-ardoise">n°{m.rang}</span>{m.adresse || `Parcelle ${m.parcelle}`}
                      {m.rang === 1 && <span className="ml-2 text-[12.5px]" style={{ color: TEINTES.ecrire }}>à proposer en premier</span>}
                    </span>
                    <span className="flex items-baseline gap-3">
                      {m.tranche && <span className="text-[12.5px]" style={{ color: teinteTranche(m.tranche.cle) }}>{TRANCHE_MOT[m.tranche.cle]}</span>}
                      <Nombre taille={15} teinte={J["encre"]}>{pourcent(m.proba)}</Nombre>
                    </span>
                  </div>
                  <div className="mt-1 text-[12.5px] text-ardoise">
                    {[m.enseignes.length ? m.enseignes.join(", ") : null, m.vitrines ? `${m.vitrines} vitrine${m.vitrines > 1 ? "s" : ""}` : null, `${m.locaux} local${m.locaux > 1 ? "aux" : ""} à la société${m.rez_de_chaussee ? ", dont le rez-de-chaussée" : ""}`,
                      m.detention ? `${m.detention.censuree ? "détenu depuis au moins" : "détenu depuis"} ${m.detention.depuis}` : null,
                      m.derniere_vente ? `dernière vente ${m.derniere_vente.date.slice(0, 4)}${m.derniere_vente.prix ? ` à ${Math.round(m.derniere_vente.prix / 1000)} k€` : ""}` : null].filter(Boolean).join(" · ")}
                  </div>
                  {m.raisons.length > 0 && (
                    <div className="mt-2 flex flex-col gap-1 text-[13.5px] text-craie">
                      {m.raisons.map((r) => <span key={r.variable}><span style={{ color: r.sens > 0 ? TEINTES.ecrire : J["ardoise"] }}>{r.sens > 0 ? "↑" : "↓"}</span> {r.phrase}</span>)}
                    </div>
                  )}
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button onClick={() => setOuvert((p) => (p === m.parcelle ? null : m.parcelle))}
                      className="rounded-full border px-3 py-1 text-[12.5px] transition-colors"
                      style={{ borderColor: ouvert === m.parcelle ? J["menthe"] : "rgba(255,255,255,0.1)", color: ouvert === m.parcelle ? J["menthe"] : J["ardoise"], background: "transparent" }}>
                      {ouvert === m.parcelle ? "Masquer le détail" : "Voir les commerces"}
                    </button>
                    {liensBien({ lat: m.lat, lon: m.lon, adresse: m.adresse, ville: s.ville }).map(([mot, href]) => <Lien key={mot} href={href}>{mot}</Lien>)}
                  </div>
                  <CommercesDuBien villeId={villeId} parcelle={m.parcelle} ouvert={ouvert === m.parcelle} onOuvrirCible={onOuvrirCible} />
                </div>
              ))}
              {s.autres_parcelles > 0 && <p className="m-0 text-[12.5px] text-ardoise">Et {s.autres_parcelles} autre{s.autres_parcelles > 1 ? "s" : ""} parcelle{s.autres_parcelles > 1 ? "s" : ""} dans la commune, sans vitrine connue : hors du classement du modèle.</p>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
