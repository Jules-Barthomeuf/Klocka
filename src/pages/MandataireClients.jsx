import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { X, ArrowRight } from "lucide-react";
import { Avatar } from "@/components/mandataire/AvatarClient";
import { base44 } from "@/api/base44Client";
import { createPageUrl } from "@/utils";
import MesAcquereurs from "@/components/mandataire/MesAcquereurs";
import MesVendeurs from "@/components/mandataire/MesVendeurs";
import { Onglets } from "@/components/ui/kit";
import { Filtres, Recherche, Statut, TitrePage } from "@/components/mandataire/elements";
import { J } from "@/design/jetons";
import Chargement from "@/components/ui/Chargement";
import { PastilleTest } from "@/components/mandataire/kit";
import { exclusionsDe, kEuros, fourchetteEuros } from "@/lib/clients-commerces";
import VillesCotees from "@/components/clients/VillesCotees";
import { resumeVillesCotees } from "../../server/villes-cotees.js";

// Les clients Klocka vus du mandataire (maquette « Clients Admin », 4 oct.
// 2026, reprise pour le côté mandataire) : des cartes ou un tableau, une
// recherche, et la fiche d'un client à droite.
// Les clients restent anonymes : des initiales, jamais un nom, un mail ou
// une société, ni le conseiller qui les suit.

// Sans zone précise, les villes cotées (6 nov. 2026, Jules) : leur détail au clic sur « +n villes ».
const zonesDe = (d) => (d.zones?.length ? d.zones.join(", ") : resumeVillesCotees());
const zonesVues = (d) => (d.zones?.length ? d.zones.join(", ") : <VillesCotees />);
const typeDe = (d) => (d.type_commerce ? d.type_commerce.charAt(0).toUpperCase() + d.type_commerce.slice(1) : "Tout commerce");
const nomDe = (d) => (/^client/i.test(d.reference || "") ? d.reference : `Client ${d.reference}`);
const rendementDe = (d) => (d.rendement_min ? `${String(d.rendement_min).replace(".", ",")} %` : "—");
// null le temps du premier calcul du secteur (1er nov. 2026) : l'écran dit « … » et redemande.
const aProspecter = (d) => d.a_prospecter ?? null;
const chiffre = (n) => (n == null ? "…" : n);

// Les exclusions du client, déjà lues par le serveur (« boîte de nuit », « santé ») : un critère, jamais sa remarque.
const exclusionsTexte = (d) => `Sauf ${exclusionsDe(d).map((f) => f.mot).join(", ")}`;
// Qui est le client, en une ligne (31 oct. 2026, Jules) : où il vit, ce qu'il fait.
const quiEst = (d) => [d.lieu_vie ? `Vit à ${d.lieu_vie}` : null, d.fonction].filter(Boolean).join(" · ");

function budget(d) {
  if (d.budget_min && d.budget_max) return fourchetteEuros(d.budget_min, d.budget_max);
  return kEuros(d.budget_max || d.budget_min) || "—";
}

export default function MandataireClients() {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({ queryKey: ["mandataire-demandes"], queryFn: () => base44.request("GET", "/api/mandataire/demandes"),
    refetchInterval: (q) => ((q.state.data?.demandes || []).some((d) => d.a_prospecter == null) ? 4000 : false) });
  const demandes = useMemo(
    () => [...(data?.demandes || [])].sort((a, b) => aProspecter(b) - aProspecter(a)),
    [data]
  );
  const [vue, setVue] = useState(() => { try { return localStorage.getItem("k-clients-vue") || "cartes"; } catch { return "cartes"; } });
  const changerVue = (v) => { setVue(v); try { localStorage.setItem("k-clients-vue", v); } catch { /* sans stockage */ } };
  const [recherche, setRecherche] = useState("");
  const [ouverte, setOuverte] = useState(null);
  // Deux onglets (30 oct. 2026, Jules) : les clients de Klocka, et le fichier acquéreurs du mandataire.
  const [onglet, setOnglet] = useState("klocka");

  const q = recherche.trim().toLowerCase();
  const lignes = demandes
    .filter((d) => !q || [nomDe(d), d.type_commerce, zonesDe(d)].filter(Boolean).join(" ").toLowerCase().includes(q));
  // Le compte ne dit que les clients réels (31 oct. 2026, Jules) : les clients test, visibles par l'équipe seule, n'y entrent pas.
  const reels = demandes.filter((d) => !d.test);
  const aTravailler = reels.filter((d) => aProspecter(d) > 0).length;
  const d = demandes.find((x) => x.id === ouverte) || null;
  const prospecter = (x) => navigate(`${createPageUrl("MandataireProspection")}?demande=${x.id}`);

  return (
    <div className="mx-auto flex max-w-[1500px] flex-col gap-3.5 px-5 pb-16 pt-[22px] md:px-8">
      <TitrePage titre="Clients" nombre={onglet === "klocka" && demandes.length > 0 ? `${reels.length} · ${aTravailler} à prospecter` : null}
        actions={onglet === "klocka" ? <Filtres label="Affichage" valeur={vue} onChange={changerVue} options={[["cartes", "Cartes"], ["tableau", "Tableau"]]} /> : null} />

      <Onglets taille="page" valeur={onglet} onChange={setOnglet} items={[{ cle: "klocka", titre: "Clients Klocka" }, { cle: "acquereurs", titre: "Mes acquéreurs" }, { cle: "vendeurs", titre: "Mes vendeurs" }]} />
      {onglet === "vendeurs" ? <MesVendeurs /> : onglet === "acquereurs" ? <MesAcquereurs /> : (<>

      <div className="flex flex-wrap items-center gap-2.5">
        <Recherche value={recherche} onChange={setRecherche} placeholder="Ville, type de bien, profil" className="w-full md:w-[320px]" />
      </div>
      <p className="m-0 text-[13px] text-ardoise">Les clients restent anonymes. Vous trouvez le bien, Klocka fait le lien avec eux.</p>

      {isLoading && <Chargement taille="grand" />}
      {!isLoading && !demandes.length && (
        <p className="m-0 text-[14px] text-brume">Aucun client pour l'instant. Ils apparaissent ici dès que Klocka publie une recherche.</p>
      )}
      {!isLoading && demandes.length > 0 && !lignes.length && (
        <p className="m-0 rounded-[12px] border border-dashed border-trait p-12 text-center text-[15px] text-brume">Aucun client ne correspond.</p>
      )}

      {lignes.length > 0 && vue === "cartes" && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {lignes.map((x) => <CarteClient key={x.id} d={x} onOuvrir={() => setOuverte(x.id)} />)}
        </div>
      )}

      {lignes.length > 0 && vue === "tableau" && <TableauClients lignes={lignes} onOuvrir={setOuverte} />}

      {d && <FicheClient d={d} onFermer={() => setOuverte(null)} onProspecter={() => prospecter(d)} />}
      </>)}
    </div>
  );
}

/** Un client en carte compacte (8 nov. 2026, Jules) : son nom et son type, ses critères, ce que votre secteur a pour lui. */
function CarteClient({ d, onOuvrir }) {
  const n = aProspecter(d);
  return (
    <article onClick={onOuvrir} className="flex cursor-pointer flex-col gap-2 k-verre px-3.5 py-3 transition-colors hover:border-bord-doux">
      <div className="min-w-0">
        <div className="flex min-w-0 items-center justify-between gap-2">
          <span className="flex min-w-0 items-center text-[15px] text-encre"><span className="truncate">{nomDe(d)}</span><PastilleTest x={d} /></span>
          <Statut className="flex-none">{typeDe(d)}</Statut>
        </div>
        <p className="m-0 mt-0.5 truncate text-[13.5px] text-ardoise">{[budget(d), rendementDe(d)].filter(Boolean).join(" · ")}</p>
        <p className="m-0 truncate text-[13.5px] text-ardoise">{zonesVues(d)}</p>
      </div>
      <div className="flex items-center justify-between gap-2.5 text-[13px]">
        <span className="min-w-0 truncate text-ardoise">{n !== 0 && <span className="tabular-nums text-encre">{chiffre(n)} </span>}{n == null ? "commerces : calcul en cours" : n > 1 ? "commerces à prospecter" : n === 1 ? "commerce à prospecter" : "rien à prospecter pour l'instant"}</span>
        <span className="flex-none text-ardoise">Voir les critères</span>
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

// Les traits verticaux des tableaux (8 nov. 2026, Jules) : portés par chaque case de la grille.
const CELLULES = "[&>*]:flex [&>*]:min-w-0 [&>*]:items-center [&>*]:border-r [&>*]:border-trait [&>*]:px-4 [&>*:last-child]:border-r-0";

function TableauClients({ lignes, onOuvrir }) {
  return (
    <div className="overflow-x-auto k-verre">
      <div className="min-w-[980px]">
        <div className={`grid ${COLONNES} ${CELLULES} border-b border-trait text-[12.5px] text-ardoise [&>*]:h-[35px]`}>
          <span>Client</span><span>Type de bien</span><span>Zones</span><span>Budget</span><span>Rendement</span><span>Exclusions</span><span>À prospecter</span>
        </div>
        {lignes.map((d) => (
          <div key={d.id} onClick={() => onOuvrir(d.id)} className={`grid ${COLONNES} ${CELLULES} cursor-pointer border-b border-trait last:border-b-0 hover:bg-surface [&>*]:min-h-11 [&>*]:py-1`}>
            <div className="flex min-w-0 items-center gap-3">
              <Avatar d={d} taille="h-[34px] w-[34px]" />
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="flex min-w-0 items-center text-[15px] font-medium text-encre"><span className="truncate">{nomDe(d)}</span><PastilleTest x={d} /></span>
                {!!quiEst(d) && <span className="truncate text-[13px] text-craie">{quiEst(d)}</span>}
                {!!exclusionsDe(d).length && <span className="truncate text-[13px] text-ardoise">{exclusionsTexte(d)}</span>}
              </div>
            </div>
            <span className="text-[14px] text-encre">{typeDe(d)}</span>
            <span className="text-[14px] text-craie">{zonesVues(d)}</span>
            <span className="text-[14px] tabular-nums text-encre">{budget(d)}</span>
            <span className="text-[14px] tabular-nums text-encre">{rendementDe(d)}</span>
            <span className="text-[13px] leading-[1.4] text-ardoise">{exclusionsDe(d).map((f) => f.mot).join(", ") || "—"}</span>
            <span className="text-[14px] tabular-nums text-menthe">{chiffre(aProspecter(d))}</span>
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
    ["Zones", zonesVues(d)],
    ["Budget", budget(d)],
    ["Rendement minimum", rendementDe(d)],
    ["Exclusions", exclusionsDe(d).length ? exclusionsDe(d).map((f) => f.mot).join(", ") : "—"],
  ];
  return createPortal(
    <div className="fixed inset-0 z-[80]">
      <div className="absolute inset-0 bg-fond/60 backdrop-blur-[2px]" onClick={onFermer} />
      <aside role="dialog" aria-modal="true" aria-label={nomDe(d)}
        className="absolute inset-y-0 right-0 flex w-[520px] max-w-full flex-col overflow-y-auto border-l border-trait bg-fond animate-in slide-in-from-right duration-200">
        <div className="flex items-start justify-between gap-4 border-b border-trait px-7 pb-5 pt-7 max-md:px-5 max-md:pt-5">
          <div className="flex min-w-0 items-center gap-3.5">
            <Avatar d={d} taille="h-12 w-12" />
            <div className="flex min-w-0 flex-col gap-1">
              <span className="text-[22px] font-medium text-encre max-md:text-[20px]">{nomDe(d)}</span>
            </div>
          </div>
          <button type="button" onClick={onFermer} aria-label="Fermer" title="Fermer"
            className="grid h-[34px] w-[34px] flex-none place-items-center rounded-[10px] text-ardoise hover:bg-relief hover:text-encre" style={{ background: "transparent" }}>
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-col px-7 py-5 max-md:px-5">
          {!!(d.lieu_vie || d.fonction) && (
            <>
              <p className="m-0 pb-1.5 text-[12px] tracking-[0.14em] text-ardoise">LE CLIENT</p>
              {[["Vit à", d.lieu_vie], ["Fonction", d.fonction]].filter(([, v]) => v).map(([mot, valeur]) => (
                <div key={mot} className="grid grid-cols-[150px_1fr] gap-4 border-b border-trait py-3 max-md:grid-cols-[112px_1fr] max-md:gap-3">
                  <span className="text-[13px] text-ardoise">{mot}</span>
                  <span className="text-[14px] leading-[1.5] text-encre">{valeur}</span>
                </div>
              ))}
              <div className="h-5" />
            </>
          )}
          <p className="m-0 pb-1.5 text-[12px] tracking-[0.14em] text-ardoise">CRITÈRES</p>
          {criteres.map(([mot, valeur]) => (
            <div key={mot} className="grid grid-cols-[150px_1fr] gap-4 border-b border-trait py-3 max-md:grid-cols-[112px_1fr] max-md:gap-3">
              <span className="text-[13px] text-ardoise">{mot}</span>
              <span className="text-[14px] leading-[1.5] text-encre">{valeur}</span>
            </div>
          ))}
        </div>

        {!!(d.remarque || d.information) && (
          <div className="flex flex-col gap-2 px-7 pb-5 max-md:px-5">
            <p className="m-0 text-[12px] tracking-[0.14em] text-ardoise">LE MOT DE L&apos;ÉQUIPE</p>
            {[d.information, d.remarque].filter(Boolean).map((t, i) => (
              <p key={i} className="m-0 whitespace-pre-line text-[14px] leading-[1.55] text-encre">{t}</p>
            ))}
          </div>
        )}


        <div className="flex flex-col gap-2.5 px-7 pb-7 pt-1 max-md:px-5">
          <p className="m-0 text-[12px] tracking-[0.14em] text-ardoise">DANS VOTRE SECTEUR</p>
          <div className="grid grid-cols-3 overflow-hidden k-verre">
            <Compte n={d.commerces_du_secteur ?? 0} mot="correspondent" />
            <Compte n={d.dans_ma_liste ?? 0} mot="dans votre liste" />
            <Compte n={chiffre(aProspecter(d))} mot="à prospecter" accent />
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
