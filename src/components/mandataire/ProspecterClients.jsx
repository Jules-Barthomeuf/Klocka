import React, { useEffect, useMemo, useRef, useState } from "react";
import Loader from "@/components/ui/Loader";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown, ChevronLeft, ChevronRight, ListPlus, Loader2, MapPin, Menu, Radar, RefreshCw, Search, X } from "lucide-react";
import { Avatar } from "@/components/mandataire/AvatarClient";
import { base44 } from "@/api/base44Client";
import { JL } from "@/design/jetons";
import CarteGoogleSecteurs from "@/components/mandataire/CarteGoogleSecteurs";
import FicheMandataire from "@/components/mandataire/FicheMandataire";
import { toast } from "@/components/ui/avis";
import { PastilleExemple } from "@/components/mandataire/kit";
import { DRAPEAUX_COURTS, FenetreListe, LIENS, MenuFiltres, REPONSES } from "@/components/off-market/Simple";
import { Case, Vide, bouton, boutonPlein, champ, euros, pl } from "@/components/off-market/commun";
import { FILTRES_SIMPLE, nbFiltres, passeSimple } from "@/lib/off-market-simple";
import { budgetDe, exclusionsDe, veutEmplacement1, veutEnseigneNationale } from "@/lib/clients-commerces";

// Prospecter pour ses clients (24 oct. 2026, Jules) : à gauche, la carte de son
// secteur, toujours délimité ; à droite, ses clients en carrousel, seulement
// ceux qui cherchent dans une ville du secteur. « Prospecter » pose sur la
// carte quelques murs : dans ses villes, autour de son budget, avec des signaux
// de vente, propriétaire et exploitant connus (server/mandataire-prospecter.js).
// Puis la mise en page de « Tous les commerces » : les filtres en haut, le
// tableau des murs sous la carte (recherche, tri, pages, envoi vers une liste),
// et la fiche du commerce à droite, sous la carte du client repliée.

const API = "/api/mandataire/prospecter";
const MARGES = { top: 60, bottom: 40, left: 40, right: 40 };
// Les murs d'un client sont déjà choisis : le filtre d'emplacement part de « toute la ville ».
const FILTRES_DEPART = { ...FILTRES_SIMPLE, emplacement: "partout" };

export default function ProspecterClients({ bascule = null }) {
  // Relu à chaque ouverture : un secteur redessiné ou réattribué par Klocka se voit tout de suite.
  // En direct (24 oct. 2026, Jules : « dès qu'il fait une recherche, ça s'affiche en direct ») : tant qu'une ville de son
  // secteur se prépare (lecture, propriétaires, prix), les clients et les murs se relisent toutes les trente secondes.
  const { data, isLoading, isError } = useQuery({ queryKey: ["m-prospecter"], queryFn: () => base44.request("GET", API),
    refetchInterval: (q) => ((q.state.data?.villes || []).some((v) => v.preparation?.en_cours) ? 30_000 : false) });
  const enPreparation = (data?.villes || []).some((v) => v.preparation?.en_cours);
  const clients = useMemo(() => data?.clients || [], [data]);
  const [i, setI] = useState(0);
  // Le client est un filtre de la même vue (25 oct. 2026, Jules) : on arrive sur tous les commerces du secteur, et les flèches
  // de la carte passent à un client, dont les murs remplacent la liste. `tous` : aucun client choisi.
  const [tous, setTous] = useState(true);
  const [prospecte, setProspecte] = useState("tous"); // « tous », ou l'id du client dont les murs sont sur la carte
  const [ouvert, setOuvert] = useState(null); // le commerce dont la fiche est ouverte
  const [replie, setReplie] = useState(false); // la carte du client, repliée quand une fiche s'ouvre
  const [filtres, setFiltres] = useState(FILTRES_DEPART);
  const client = clients[Math.min(i, Math.max(0, clients.length - 1))] || null;
  // Les clients déjà prospectés (25 oct. 2026, Jules) : leurs murs s'affichent d'eux-mêmes, sans recliquer « Prospecter ».
  // Le serveur garde la date ; un client prospecté pendant la visite s'ajoute ici.
  const [vusIci, setVusIci] = useState(() => ({}));
  const dejaLe = (c) => (c ? vusIci[c.id] || c.prospecte_le || null : null);
  useEffect(() => {
    if (tous) { setProspecte("tous"); return; }
    if (!client) return;
    setProspecte(dejaLe(client) ? client.id : null);
  }, [tous, client?.id]);
  // Passer d'un client à l'autre ne prospecte jamais (25 oct. 2026, Jules) : seul le bouton envoie `?prospecter=1` ; un
  // client déjà prospecté se réaffiche depuis le cache, sans attente ni rechargement visible.
  const qc = useQueryClient();
  const geste = useRef(null);
  const points = useQuery({
    queryKey: ["m-prospecter", "points", prospecte],
    queryFn: () => {
      const noter = geste.current === prospecte;
      geste.current = null;
      return base44.request("GET", prospecte === "tous" ? `${API}/tous` : `${API}/clients/${prospecte}${noter ? "?prospecter=1" : ""}`);
    },
    enabled: !!prospecte,
    staleTime: 5 * 60_000,
    refetchInterval: enPreparation ? 30_000 : false,
  });
  const attente = points.isLoading;
  const murs = useMemo(() => (prospecte ? points.data?.points || [] : []), [prospecte, points.data]);
  const visibles = useMemo(() => {
    const t = filtres.texte.trim().toLowerCase();
    return murs.filter((c) => passeSimple(c, filtres) && (!t || `${c.titre || ""} ${c.enseigne || ""} ${c.nom || ""} ${c.activite || ""} ${c.adresse || ""} ${c.proprietaire || ""} ${c.ville || ""}`.toLowerCase().includes(t)));
  }, [murs, filtres]);
  const activites = useMemo(() => { const n = {}; for (const c of murs) if (c.activite) n[c.activite] = (n[c.activite] || 0) + 1; return Object.entries(n).sort((a, b) => b[1] - a[1]).map(([v, k]) => ({ v, mot: v, n: k })); }, [murs]);
  // Au survol d'un point : le commerce et son signal le plus fort.
  // Un point dont la fiche est dans Biens devient noir (24 oct. 2026).
  const marqueurs = useMemo(() => visibles.map((p) => ({ id: p.id, lat: p.lat, lon: p.lon, titre: [p.titre, p.fiche?.dans_biens ? "dans Biens" : null, p.signaux?.[0]].filter(Boolean).join(" · "), couleur: p.fiche?.dans_biens ? JL.fond : LIENS[p.lien]?.couleur || JL.menthe })), [visibles]);
  const secteurs = useMemo(() => (data?.secteur ? [{ ...data.secteur, teinte: data.secteur.teinte || JL.menthe }] : []), [data]);
  const clientProspecte = prospecte === "tous" ? null : clients.find((c) => c.id === prospecte) || null;
  // Le choix du client se fait dans la liste déroulante de la carte (25 oct. 2026, Jules) : « tous les commerces » en
  // premier, puis chaque client ; on saute directement à n'importe lequel.
  const choisir = (k) => {
    if (k == null) setTous(true); else { setTous(false); setI(k); }
    setOuvert(null); setReplie(false);
  };
  const selecteur = { clients, tous, courant: Math.min(i, Math.max(0, clients.length - 1)), onChoisir: choisir, vus: clients.filter((c) => dejaLe(c)).map((c) => c.id) };
  // Une fiche ouverte replie la carte du client ; la fermer la rouvre.
  const ouvrir = (id) => { setOuvert(id); setReplie(!!id); };
  useEffect(() => { setFiltres(FILTRES_DEPART); }, [prospecte]);

  // Chargement, erreur, pas de secteur : la bascule reste, pour passer à « Tous les commerces ».
  const seul = (contenu) => <div className="flex flex-col gap-4">{bascule && <div className="flex flex-wrap items-center gap-2">{bascule}</div>}{contenu}</div>;
  if (isLoading) return seul(<Loader titre="Votre secteur et vos clients…" />);
  if (isError) return seul(<p className="m-0 mt-6 text-[13.5px] text-alerte">La prospection ne se charge pas. Rechargez la page.</p>);
  if (!data?.secteur) return seul(<p className="m-0 mt-12 text-center text-[14px] text-brume">Aucun secteur pour vous encore : K Partners vous en attribue un, puis vos clients s'affichent ici.</p>);

  return (
    <div className="flex flex-col gap-4 pb-10">
      {/* Deux colonnes dès le haut (25 oct. 2026, Jules) : à gauche la barre puis la carte, à droite la carte du client
          dont le haut s'aligne sur la bascule « Pour mes clients / Tous les commerces ». Au téléphone, une seule colonne à la
          largeur de l'écran (`minmax(0, 1fr)`, sinon la colonne implicite prend la largeur de son contenu et déborde). */}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_460px] xl:grid-cols-[minmax(0,1fr)_520px]">
      <div className="flex min-w-0 flex-col gap-4">
      {/* La barre du haut, comme « Tous les commerces » : la bascule, les filtres, où en sont les villes. */}
      <div className="flex flex-wrap items-center gap-2">
        {bascule}
        {prospecte && (
          <MenuFiltres filtres={filtres} setFiltres={setFiltres} commerces={murs} tous={murs} activites={activites} visibles={visibles.length} />
        )}
        {/* Plus de pastille « n murs pour … » (25 oct. 2026, Jules) : le nombre est sur la carte du client et au-dessus du
            tableau, le chargement sur « Mettre à jour », et changer de client remplace les murs. */}
        <span className="flex-1" />
        {/* La préparation de ses villes, en fond : les murs s'ajoutent en direct à mesure. */}
        {enPreparation && <Preparation villes={data.villes} />}
      </div>

        {/* À gauche : le secteur, et les murs du client prospecté. */}
        <div className="relative h-[62vh] min-h-[460px] w-full min-w-0 overflow-hidden rounded-bloc border border-trait max-md:h-[380px] max-md:min-h-0">
          <CarteGoogleSecteurs secteurs={secteurs} choisi={data.secteur.id} contourSeul={!!prospecte} margesChoisi={MARGES} marqueurs={marqueurs} marqueurActif={ouvert} onMarqueur={ouvrir} />
        </div>
      </div>

        {/* À droite, du haut de la barre au bas de la carte, exactement (25 oct. 2026, Jules) : à partir de `lg`, la colonne
            prend la hauteur de la rangée de la grille, celle de la colonne de gauche (barre + carte), et son contenu est posé
            en absolu : il ne peut pas l'allonger. Dessous, une hauteur propre, le client puis la fiche l'un sous l'autre. */}
        <div className="relative min-w-0 max-lg:h-[62vh] max-lg:min-h-[460px] max-md:h-auto">
        <div className="flex min-w-0 flex-col gap-3 lg:absolute lg:inset-0 max-lg:h-full max-md:h-auto">
          {!(data.villes || []).length ? (
            <p className="m-0 rounded-bloc border border-trait px-5 py-6 text-[13.5px] leading-[1.6] text-ardoise">K Partners n'a pas encore choisi les villes de votre secteur : vos clients s'afficheront ici dès qu'elles le seront.</p>
          ) : !clients.length ? (
            <CarteTous n={points.data?.total ?? murs.length} villes={data.villes} charge={attente} seule />
          ) : (
            tous ? <CarteTous n={points.data?.total ?? murs.length} villes={data.villes} charge={attente} selecteur={selecteur} replie={replie} onReplier={() => setReplie((r) => !r)} />
            : <CarteClient client={client} selecteur={selecteur} actif={prospecte === client?.id}
              replie={replie} onReplier={() => setReplie((r) => !r)}
              prospecteLe={dejaLe(client)} charge={points.isFetching}
              onProspecter={() => { geste.current = client.id; if (prospecte === client.id) points.refetch(); else qc.invalidateQueries({ queryKey: ["m-prospecter", "points", client.id] }); setProspecte(client.id); setVusIci((v) => ({ ...v, [client.id]: new Date().toISOString() })); ouvrir(null); }} />
          )}
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[18px] border border-bord-doux bg-rail max-lg:min-h-[320px]">
            {/* Fermer la fiche, ou changer de point, se fait en fondu (24 oct. 2026). */}
            <AnimatePresence mode="wait" initial={false}>
            {ouvert ? (
              <motion.div key={ouvert} className="min-h-0 flex-1 overflow-y-auto" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} transition={{ duration: 0.28, ease: "easeInOut" }}>
                <PointOuFiche point={murs.find((x) => x.id === ouvert)} id={ouvert} onFermer={() => ouvrir(null)} />
              </motion.div>
            ) : (
              <motion.div key="vide" className="grid flex-1 place-items-center px-6 py-8 text-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.28, ease: "easeInOut" }}>
                <p className="m-0 max-w-[36ch] text-[13.5px] leading-[1.6] text-ardoise">
                  {prospecte
                    ? (murs.length ? "Cliquez un point de la carte ou une ligne du tableau : la fiche du commerce s'ouvre ici." : attente ? "Les murs pour ce client arrivent…" : (points.data?.pourquoi_vide || "Aucun mur pour ce client pour l'instant."))
                    : "Choisissez un client, puis « Prospecter » : ses murs se posent sur la carte et dans le tableau."}
                </p>
              </motion.div>
            )}
            </AnimatePresence>
          </div>
        </div>
        </div>
      </div>

      {/* Le tableau des murs du client, sous la carte, comme « Tous les commerces ». */}
      {prospecte && (
        <TableauMurs murs={visibles} total={murs.length} filtres={filtres} setFiltres={setFiltres} ouvert={ouvert} onOuvrir={ouvrir} charge={attente} />
      )}
    </div>
  );
}

/**
 * Un point de la carte (24 oct. 2026, Jules) : tant que le mandataire n'a rien fait, c'est de la donnée brute (la fiche
 * du commerce, à personne) avec deux gestes qui font naître sa fiche : « Je l'appelle », « J'y suis passé ». Une fois
 * sa fiche créée, c'est elle qui s'ouvre (la sienne : aucun autre mandataire ne peut la prendre).
 */
function PointOuFiche({ id, onFermer, point }) {
  // La fiche des listes, la même partout (25 oct. 2026, Jules) : celle de la carte d'une liste ; sans fiche encore, son
  // aperçu, avec « Ajouter à ma liste » qui la fait naître.
  return <FicheMandataire id={point?.fiche?.id || null} commerceId={id} onFermer={onFermer} />;
}

/** Où en est la préparation des villes (lecture, propriétaires, prix) : une pastille, le détail au survol. */
function Preparation({ villes }) {
  const p = villes.map((v) => v.preparation || {});
  const somme = (k) => p.reduce((n, x) => n + (x[k] || 0), 0);
  const aLire = villes.filter((v) => v.etat !== "lue").map((v) => v.nom);
  const reste = somme("proprietaires_a_faire");
  const detail = villes.map((v) => `${v.nom} : ${v.etat !== "lue" ? "lecture à venir" : `${v.preparation?.proprietaires_faits || 0} propriétaires cherchés sur ${v.preparation?.commerces || 0}, ${v.preparation?.avec_prix || 0} prix`}`).join("\n");
  return (
    <span title={detail} className="inline-flex h-10 items-center gap-2 rounded-full border border-bord-doux bg-rail px-4 text-[14px] text-encre">
      <Loader2 className="h-3.5 w-3.5 animate-spin text-menthe" />
      {aLire.length ? `Lecture de ${aLire.join(", ")}` : reste ? `Propriétaires : ${reste} à chercher` : "Prix en cours d'estimation"}
      <span className="text-ardoise">· les murs s'ajoutent en direct</span>
    </span>
  );
}

const TRAIT = "border-[color-mix(in_srgb,var(--k-bord-doux)_45%,transparent)]";
const GESTE = "inline-flex h-8 items-center gap-1.5 rounded-full border border-trait px-3 text-[13.5px] text-craie hover:text-encre disabled:opacity-50";
const GESTE_PLEIN = "inline-flex h-8 items-center gap-1.5 rounded-full bg-menthe px-3 text-[13.5px] text-sur-menthe hover:bg-menthe-survol";

/** Le tableau des murs : la recherche, « Tout afficher », l'envoi vers une liste, le tri par colonne, les pages. */
function TableauMurs({ murs, total, filtres, setFiltres, ouvert, onOuvrir, charge }) {
  const qc = useQueryClient();
  const [tri, setTri] = useState({ cle: "force", sens: -1 });
  const [page, setPage] = useState(0);
  const [coches, setCoches] = useState(() => new Set());
  const [versListe, setVersListe] = useState(false);
  const PAR_PAGE = 50;
  useEffect(() => { setPage(0); }, [filtres, tri]);
  const tries = useMemo(() => {
    const val = (c) => (tri.cle === "force" ? c.force : tri.cle === "commerce" ? (c.titre || "") : tri.cle === "prix" ? (c.prix?.moyenne || 0) : tri.cle === "signaux" ? c.drapeaux.length : tri.cle === "lien" ? (c.lien || "") : (c[tri.cle] || ""));
    return [...murs].sort((a, b) => { const x = val(a), y = val(b); return (typeof x === "number" ? x - y : String(x).localeCompare(String(y), "fr")) * tri.sens; });
  }, [murs, tri]);
  const pages = Math.max(1, Math.ceil(tries.length / PAR_PAGE));
  const vue = tries.slice(page * PAR_PAGE, (page + 1) * PAR_PAGE);
  const cocher = (c) => { if (c.liste) return; setCoches((s) => { const n = new Set(s); if (n.has(c.id)) n.delete(c.id); else n.add(c.id); return n; }); };
  const libres = vue.filter((c) => !c.liste);
  const tousCoches = libres.length > 0 && libres.every((c) => coches.has(c.id));
  const colonnes = [["commerce", "Commerce"], ["adresse", "Adresse"], ["nom", "Exploitant"], ["proprietaire", "Propriétaire des murs"], ["lien", "Lien"], ["signaux", "Raison de vendre"], ["prix", "Prix pour lui"], ["appel", "Appel"]];
  return (
    // Au dessin du tableau d'une liste (30 oct. 2026, Jules) : la zone à points, la barre (recherche en pilule, chiffres,
    // gestes), puis le tableau à traits continus, les deux premières colonnes fixes, tout en 13,5 px. La raison de vendre
    // prend la couleur des notes de l'IA de l'Analyse (`lu-ia`).
    <section data-zone="murs" className="k-points relative rounded-[12px] bg-rail px-5 pb-5 pt-4 max-md:px-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-[240px] max-w-[420px] flex-1 items-center gap-3 rounded-full border border-trait bg-surface px-4 py-2.5 focus-within:border-bord-doux max-md:min-w-0 max-md:max-w-none max-md:basis-full">
          <Search className="h-3.5 w-3.5 flex-none text-ardoise" />
          <input value={filtres.texte} onChange={(e) => setFiltres((f) => ({ ...f, texte: e.target.value }))} placeholder="Enseigne, activité, rue, propriétaire"
            className="w-full border-none bg-transparent text-[13.5px] text-encre outline-none placeholder:text-brume max-md:text-[16px]" />
        </div>
        {nbFiltres({ ...filtres, emplacement: "centre" }) > 0 && <button type="button" onClick={() => setFiltres(FILTRES_DEPART)} className={GESTE} style={{ background: "transparent" }}><X className="h-3.5 w-3.5" />Tout afficher</button>}
        <button type="button" onClick={() => setVersListe(true)} disabled={!coches.size} className={coches.size ? GESTE_PLEIN : GESTE} style={coches.size ? undefined : { background: "transparent" }}><ListPlus className="h-3.5 w-3.5" />Envoyer vers une liste{coches.size ? ` (${coches.size})` : ""}</button>
        {coches.size > 0 && <button type="button" onClick={() => setCoches(new Set())} className="text-[13.5px] text-ardoise hover:text-encre" style={{ background: "transparent" }}>Tout décocher</button>}
        <span className="ml-auto text-[13.5px] text-ardoise max-md:ml-0">
          <span className="tabular-nums text-menthe">{tries.length}</span> mur{tries.length > 1 ? "s" : ""}{tries.length !== total ? <> sur <span className="tabular-nums text-encre">{total}</span></> : null}
          {pages > 1 && <> · {page * PAR_PAGE + 1} à {Math.min(tries.length, (page + 1) * PAR_PAGE)}</>}
        </span>
        {pages > 1 && (
          <span className="flex gap-1">
            <button type="button" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} aria-label="Page précédente" title="Page précédente" className={`${GESTE} w-8 justify-center px-0`} style={{ background: "transparent" }}><ChevronDown className="h-4 w-4 rotate-90" /></button>
            <button type="button" onClick={() => setPage((p) => Math.min(pages - 1, p + 1))} disabled={page >= pages - 1} aria-label="Page suivante" title="Page suivante" className={`${GESTE} w-8 justify-center px-0`} style={{ background: "transparent" }}><ChevronDown className="h-4 w-4 -rotate-90" /></button>
          </span>
        )}
      </div>
      <div className="mt-4 overflow-x-auto rounded-[14px] border border-bord-doux bg-rail">
        <table className="min-w-full border-separate border-spacing-0 text-left text-[13.5px]">
          <thead>
            <tr>
              <th className={`sticky left-0 z-30 border-b border-r ${TRAIT} bg-rail px-0 py-3.5`} style={{ width: 44, minWidth: 44, maxWidth: 44 }}>
                <span className="grid place-items-center"><Case oui={tousCoches} disabled={!libres.length} label="Cocher toute la page" onBasculer={() => setCoches((s) => { const n = new Set(s); for (const c of libres) { if (tousCoches) n.delete(c.id); else n.add(c.id); } return n; })} /></span>
              </th>
              {colonnes.map(([cle, mot], i) => (
                <th key={cle} className={`border-b ${i < colonnes.length - 1 ? "border-r" : ""} ${TRAIT} bg-rail py-3.5 text-[13.5px] font-normal text-encre ${i === 0 ? "sticky left-[44px] z-30 min-w-[220px] pl-2 pr-4 max-md:min-w-[140px]" : "px-4"}`}>
                  <button type="button" onClick={() => setTri((t) => (t.cle === cle ? { cle, sens: -t.sens } : { cle, sens: 1 }))} className="inline-flex items-center gap-1 whitespace-nowrap p-0 text-encre hover:text-menthe" style={{ background: "transparent" }}>{mot}{tri.cle === cle && <ChevronDown className={`h-3 w-3 ${tri.sens < 0 ? "rotate-180" : ""}`} />}</button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {vue.map((c) => {
              const cellule = `border-b border-r ${TRAIT} px-4 py-4 align-middle`;
              return (
                <tr key={c.id} onClick={() => onOuvrir(c.id)} className={`group cursor-pointer transition-colors ${ouvert === c.id ? "bg-menthe/[0.05]" : "hover:bg-relief/30"}`}>
                  <td className={`sticky left-0 z-10 border-b border-r ${TRAIT} bg-rail px-0 py-4 align-middle`} style={{ width: 44, minWidth: 44, maxWidth: 44 }} onClick={(e) => e.stopPropagation()}>
                    <span className="grid place-items-center"><Case oui={coches.has(c.id)} onBasculer={() => cocher(c)} label={c.liste ? `Déjà dans la liste « ${c.liste.nom} »` : "Choisir pour une liste"} className={c.liste ? "opacity-35" : ""} /></span>
                  </td>
                  <td className={`sticky left-[44px] z-10 border-b border-r ${TRAIT} bg-rail py-4 pl-2 pr-4 align-middle`}>
                    <span className="flex items-center gap-2.5"><span className="inline-block h-2.5 w-2.5 flex-none rounded-full" style={{ background: LIENS[c.lien]?.couleur || JL.brume }} />
                      <span className="min-w-0"><span className="block max-w-[240px] truncate text-encre group-hover:text-menthe">{c.titre}</span><span className="block max-w-[240px] truncate text-ardoise">{c.activite}</span></span></span>
                  </td>
                  <td className={`${cellule} max-w-[240px]`}><span className="block truncate text-encre">{c.adresse}</span><span className="block truncate text-ardoise">{c.ville}</span></td>
                  <td className={`${cellule} max-w-[220px]`}><span className="block truncate text-encre">{c.exploitant || c.nom || c.titre}</span></td>
                  <td className={`${cellule} max-w-[240px]`}><span className="block truncate text-encre">{c.proprietaire || <span className="text-brume">À trouver</span>}</span></td>
                  <td className={`${cellule} whitespace-nowrap text-encre`}>{(LIENS[c.lien]?.mot || "").replace(" (probable)", "") || <span className="text-brume">—</span>}</td>
                  <td className={`${cellule} min-w-[200px]`}>{c.drapeaux.length
                    ? <span className="line-clamp-2 leading-[1.5] text-lu-ia">{c.drapeaux.slice(0, 2).map((d) => DRAPEAUX_COURTS[d] || d).join(" · ")}{c.drapeaux.length > 2 ? ` · +${c.drapeaux.length - 2}` : ""}</span>
                    : <span className="text-brume">—</span>}</td>
                  <td className={`${cellule} whitespace-nowrap tabular-nums`}>{c.prix?.moyenne
                    ? <span className={c.dans_budget === false ? "text-brume" : "text-encre"} title={c.prix.au_rendement ? `Le prix qui lui donne ${String(c.prix.au_rendement).replace(".", ",")} % (prix estimé : ${euros(c.prix_estime?.moyenne)})` : `Prix indicatif, entre ${euros(c.prix.basse)} et ${euros(c.prix.haute)}`}>{euros(c.prix.moyenne)}{c.dans_budget === false ? " · hors budget" : ""}</span>
                    : <span className="text-ambre" title="Aucune estimation pour ce local encore : à vérifier avec le propriétaire">Prix à vérifier</span>}</td>
                  <td className={`border-b ${TRAIT} whitespace-nowrap px-4 py-4 align-middle`}>{c.reponse ? <span className="text-menthe">{REPONSES[c.reponse]?.split(",")[0] || "Appelé"}</span> : c.liste ? <span className="text-ardoise">Liste « {c.liste.nom} »</span> : <span className="text-brume">—</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!tries.length && !charge && <Vide>Aucun mur avec ces filtres.</Vide>}
      </div>
      {versListe && <FenetreListe ids={[...coches]} onFermer={() => setVersListe(false)} onFait={() => { setVersListe(false); setCoches(new Set()); qc.invalidateQueries({ queryKey: ["m-prospecter", "points"] }); }} />}
    </section>
  );
}

/**
 * Le choix du client, dans l'en-tête de la carte (25 oct. 2026, Jules) : le nom de ce qui est affiché (« Tous les
 * commerces » ou un client) ouvre une liste, « Tous les commerces » d'abord puis les clients, et on saute directement à
 * n'importe lequel. Un point menthe marque les clients déjà prospectés. Sans client, rien à choisir : un simple titre.
 */
function SelecteurClient({ selecteur, vue, seule = false }) {
  const [ouvert, setOuvert] = useState(false);
  const racine = useRef(null);
  useEffect(() => {
    if (!ouvert) return undefined;
    const dehors = (e) => { if (racine.current && !racine.current.contains(e.target)) setOuvert(false); };
    const echap = (e) => { if (e.key === "Escape") setOuvert(false); };
    document.addEventListener("pointerdown", dehors); document.addEventListener("keydown", echap);
    return () => { document.removeEventListener("pointerdown", dehors); document.removeEventListener("keydown", echap); };
  }, [ouvert]);
  const { clients = [], tous = true, courant = 0, onChoisir = () => {}, vus = [] } = selecteur || {};
  const client = vue === "client" ? clients[courant] : null;
  const entete = (
    <>
      {client ? <Avatar d={client} taille="h-10 w-10" /> : <span className="grid h-10 w-10 flex-none place-items-center rounded-full border-2 border-encre text-encre"><MapPin className="h-5 w-5" strokeWidth={2} /></span>}
      <span className="min-w-0 flex-1 text-left">
        <span className="m-0 flex items-center text-[15px] text-encre"><span className="truncate">{client ? client.reference : "Tous les commerces"}</span>{client && <PastilleExemple x={client} />}</span>
        {/* Sous le nom, ses critères seuls : ce qu'il cherche et son budget (25 oct. 2026, Jules). */}
        <span className="m-0 block truncate text-[12.5px] text-ardoise">{client ? `${client.type_commerce || "Tout commerce"} · ${budgetDe(client)}` : "De votre secteur · tous les clients"}</span>
      </span>
    </>
  );
  if (seule || !clients.length) return <div className="flex min-w-0 flex-1 items-center gap-3">{entete}</div>;
  return (
    <div ref={racine} className="min-w-0 flex-1">
      <button type="button" onClick={() => setOuvert((o) => !o)} aria-haspopup="listbox" aria-expanded={ouvert} aria-label="Choisir un client"
        className="flex w-full min-w-0 items-center gap-3 rounded-[12px] text-left" style={{ background: "transparent" }}>
        {entete}
        <Menu className={`h-[18px] w-[18px] flex-none transition-colors ${ouvert ? "text-encre" : "text-ardoise"}`} aria-hidden />
      </button>
      <AnimatePresence>
        {ouvert && (
          <motion.ul role="listbox" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2, ease: "easeInOut" }}
            className="absolute inset-x-2 top-[70px] z-30 m-0 max-h-[340px] list-none overflow-y-auto rounded-[14px] border border-bord-doux bg-surface-pleine p-1.5 shadow-[0_16px_40px_rgb(0_0_0/0.35)]">
            <li role="option" aria-selected={tous}>
              <button type="button" onClick={() => { setOuvert(false); onChoisir(null); }} className={`flex w-full items-center gap-3 rounded-[10px] px-3 py-2 text-left ${tous ? "bg-rail-actif" : "hover:bg-rail-actif"}`} style={tous ? undefined : { background: "transparent" }}>
                <span className="grid h-8 w-8 flex-none place-items-center rounded-full border-2 border-encre text-encre"><MapPin className="h-4 w-4" strokeWidth={2} /></span>
                <span className="min-w-0 flex-1"><span className="block truncate text-[14px] text-encre">Tous les commerces</span><span className="block truncate text-[12.5px] text-ardoise">De votre secteur · tous les clients</span></span>
                {tous && <Check className="h-4 w-4 flex-none text-pervenche" />}
              </button>
            </li>
            {clients.map((c, k) => {
              const actif = !tous && k === courant;
              return (
                <li key={c.id} role="option" aria-selected={actif}>
                  <button type="button" onClick={() => { setOuvert(false); onChoisir(k); }} className={`flex w-full items-center gap-3 rounded-[10px] px-3 py-2 text-left ${actif ? "bg-rail-actif" : "hover:bg-rail-actif"}`} style={actif ? undefined : { background: "transparent" }}>
                    <Avatar d={c} taille="h-8 w-8" />
                    <span className="min-w-0 flex-1"><span className="block truncate text-[14px] text-encre">{c.reference}</span><span className="block truncate text-[12.5px] text-ardoise">{c.type_commerce || "Tout commerce"} · {budgetDe(c)}</span></span>
                    {vus.includes(c.id) && <span className="h-2 w-2 flex-none rounded-full bg-menthe" title="Déjà prospecté" />}
                    {actif && <Check className="h-4 w-4 flex-none text-pervenche" />}
                  </button>
                </li>
              );
            })}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * La carte « tous les commerces » (25 oct. 2026, Jules) : la même place et le même dessin que celle d'un client, sans
 * client choisi. Les flèches passent aux clients (leurs murs filtrent la liste) ; sans client, elle est seule.
 */
function CarteTous({ n, villes = [], charge = false, selecteur = null, replie = false, onReplier = null, seule = false }) {
  return (
    <div className="relative z-20 flex-none rounded-[18px] border border-bord-doux bg-rail">
      <div className={`flex items-center gap-3 px-4 py-3 transition-colors duration-500 ${replie ? "" : "border-b border-trait"}`}>
        <SelecteurClient selecteur={selecteur} seule={seule} vue="tous" />
        {onReplier && (
          <button type="button" onClick={onReplier} aria-expanded={!replie} aria-label={replie ? "Déplier" : "Replier"} title={replie ? "Déplier" : "Replier"}
            className="grid h-8 w-8 place-items-center rounded-full text-ardoise hover:text-encre" style={{ background: "transparent" }}><ChevronDown className={`h-4 w-4 transition-transform duration-500 ease-in-out ${replie ? "" : "rotate-180"}`} /></button>
        )}
      </div>
      <div className="grid transition-[grid-template-rows,opacity] duration-500 ease-in-out" style={{ gridTemplateRows: replie ? "0fr" : "1fr", opacity: replie ? 0 : 1 }} aria-hidden={replie}>
        <div className="min-h-0 overflow-hidden">
          <div className="flex flex-col gap-2.5 px-4 py-3.5">
            <span className="flex flex-wrap gap-1.5">{villes.map((v) => <span key={v.id} className="rounded-full bg-menthe/15 px-2.5 py-0.5 text-[12.5px] text-menthe">{v.nom}</span>)}</span>
            <span className="text-[13.5px]">
              {charge ? <span className="inline-flex items-center gap-2 text-ardoise"><Loader2 className="h-3.5 w-3.5 animate-spin text-menthe" />Les commerces de votre secteur…</span>
                : <><span className="tabular-nums text-menthe">{pl(n, "commerce")}</span> <span className="text-ardoise">dans votre secteur</span></>}
            </span>
            {!seule && selecteur?.clients.length > 0 && <span className="text-[12.5px] leading-[1.45] text-ardoise">Choisissez l'un de vos {selecteur.clients.length} clients ci-dessus : seuls ses murs restent sur la carte.</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

/** La carte d'un client : ce qu'il cherche, où dans le secteur, son budget, ses règles ; « Prospecter » en bas. */
function CarteClient({ client, selecteur, onProspecter, actif, replie = false, onReplier = null, prospecteLe = null, charge = false }) {
  const rendement = client.rendement_min ? `${String(client.rendement_min).replace(".", ",")} % minimum` : "Non précisé";
  const regles = [
    veutEmplacement1(client) && { mot: "Emplacement n°1 seulement", ton: "bg-pervenche/15 text-pervenche" },
    veutEnseigneNationale(client) && { mot: "Enseigne nationale seulement", ton: "bg-pervenche/15 text-pervenche" },
    ...exclusionsDe(client).map((f) => ({ mot: `Pas de ${f.mot}`, ton: "bg-ambre/15 text-ambre" })),
  ].filter(Boolean);
  return (
    <div className="relative z-20 flex-none rounded-[18px] border border-bord-doux bg-rail">
      <div className={`flex items-center gap-3 px-4 py-3 transition-colors duration-500 ${replie ? "" : "border-b border-trait"}`}>
        <SelecteurClient selecteur={selecteur} vue="client" />
        {onReplier && (
          <button type="button" onClick={onReplier} aria-expanded={!replie} aria-label={replie ? "Déplier le client" : "Replier le client"} title={replie ? "Déplier" : "Replier"}
            className="grid h-8 w-8 place-items-center rounded-full text-ardoise hover:text-encre" style={{ background: "transparent" }}><ChevronDown className={`h-4 w-4 transition-transform duration-500 ease-in-out ${replie ? "" : "rotate-180"}`} /></button>
        )}
      </div>
      {/* Le repli glisse, doucement (500 ms) : la hauteur passe de 0 à son contenu. */}
      <div className="grid transition-[grid-template-rows,opacity] duration-500 ease-in-out" style={{ gridTemplateRows: replie ? "0fr" : "1fr", opacity: replie ? 0 : 1 }} aria-hidden={replie}>
      <div className="min-h-0 overflow-hidden">
      <div className="grid grid-cols-2 gap-x-3.5 gap-y-3 px-4 py-3.5">
        <div className="col-span-2 flex flex-col gap-0.5"><span className="text-[12px] text-brume">Cherche</span><span className="text-[15px] text-encre">{client.type_commerce || "Tout commerce"}</span></div>
        <div className="flex flex-col gap-0.5"><span className="text-[12px] text-brume">Budget</span><span className="text-[14.5px] tabular-nums text-encre">{budgetDe(client)}</span></div>
        <div className="flex flex-col gap-0.5"><span className="text-[12px] text-brume">Rendement</span><span className="text-[14.5px] tabular-nums text-encre">{rendement}</span></div>
        <div className="col-span-2 flex flex-col gap-1">
          <span className="text-[12px] text-brume">Dans votre secteur</span>
          <span className="flex flex-wrap gap-1.5">{(client.villes || []).map((v) => <span key={v.id} className="rounded-full bg-menthe/15 px-2.5 py-0.5 text-[12.5px] text-menthe">{v.nom}</span>)}</span>
          {(client.zones || []).length > 0 && <span className="text-[12.5px] text-ardoise">Il cherche : {client.zones.join(", ")}</span>}
        </div>
        {regles.length > 0 && <div className="col-span-2 flex flex-wrap gap-1.5">{regles.map((r) => <span key={r.mot} className={`rounded-full px-2.5 py-0.5 text-[12px] ${r.ton}`}>{r.mot}</span>)}</div>}
        {client.remarque && <p className="col-span-2 m-0 text-[12.5px] leading-[1.45] text-ardoise">« {client.remarque} »</p>}
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-trait px-4 py-3">
        <span className="min-w-0 text-[13.5px]">
          <span className="tabular-nums text-menthe">{client.n}</span> <span className="text-ardoise">mur{client.n > 1 ? "s" : ""} pour lui</span>
          {prospecteLe && <span className="block text-[12px] text-brume">Prospecté le {new Date(prospecteLe).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}</span>}
        </span>
        {/* Déjà prospecté : ses murs sont déjà sur la carte ; le bouton les remet à jour. Sinon, « Prospecter ». */}
        {prospecteLe && actif ? (
          <button type="button" onClick={onProspecter} disabled={charge}
            className="inline-flex h-10 flex-none items-center gap-2 rounded-full border border-trait px-4 text-[13.5px] text-craie hover:text-encre disabled:opacity-60" style={{ background: "transparent" }}>
            <RefreshCw className={`h-4 w-4 ${charge ? "animate-spin" : ""}`} /> Mettre à jour
          </button>
        ) : (
          <button type="button" onClick={onProspecter} disabled={actif}
            className="inline-flex h-10 flex-none items-center gap-2 rounded-full bg-menthe px-5 text-[14px] text-sur-menthe hover:bg-menthe-survol disabled:opacity-60">
            <Radar className="h-4 w-4" /> {actif ? "Sur la carte" : prospecteLe ? "Voir ses murs" : "Prospecter"}
          </button>
        )}
      </div>
      </div>
      </div>
    </div>
  );
}
