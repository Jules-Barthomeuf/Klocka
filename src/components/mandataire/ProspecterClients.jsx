import React, { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, ChevronLeft, ChevronRight, ListPlus, Loader2, Radar, RefreshCw, Search, X } from "lucide-react";
import { Avatar } from "@/components/mandataire/AvatarClient";
import { base44 } from "@/api/base44Client";
import { JL } from "@/design/jetons";
import CarteGoogleSecteurs from "@/components/mandataire/CarteGoogleSecteurs";
import FicheMandataire from "@/components/mandataire/FicheMandataire";
import { toast } from "@/components/ui/avis";
import { PastilleExemple } from "@/components/mandataire/kit";
import { DRAPEAUX_COURTS, Fiche, FenetreListe, LIENS, MenuFiltres, REPONSES } from "@/components/off-market/Simple";
import { Case, Vide, bouton, boutonPlein, champ, euros, pl } from "@/components/off-market/commun";
import { FILTRES_SIMPLE, nbFiltres, passeSimple } from "@/lib/off-market-simple";
import { budgetDe, exclusionsDe, pourquoiCible, veutEmplacement1, veutEnseigneNationale } from "@/lib/clients-commerces";

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
  const [prospecte, setProspecte] = useState(null); // l'id du client dont les murs sont sur la carte
  const [ouvert, setOuvert] = useState(null); // le commerce dont la fiche est ouverte
  const [replie, setReplie] = useState(false); // la carte du client, repliée quand une fiche s'ouvre
  const [filtres, setFiltres] = useState(FILTRES_DEPART);
  const client = clients[Math.min(i, Math.max(0, clients.length - 1))] || null;
  // Les clients déjà prospectés (25 oct. 2026, Jules) : leurs murs s'affichent d'eux-mêmes, sans recliquer « Prospecter ».
  // Le serveur garde la date ; un client prospecté pendant la visite s'ajoute ici.
  const [vusIci, setVusIci] = useState(() => ({}));
  const dejaLe = (c) => (c ? vusIci[c.id] || c.prospecte_le || null : null);
  useEffect(() => {
    if (!client) return;
    setProspecte(dejaLe(client) ? client.id : null);
  }, [client?.id]);
  const points = useQuery({
    queryKey: ["m-prospecter", "points", prospecte],
    queryFn: () => base44.request("GET", `${API}/clients/${prospecte}`),
    enabled: !!prospecte,
    refetchInterval: enPreparation ? 30_000 : false,
  });
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
  const clientProspecte = clients.find((c) => c.id === prospecte) || null;
  const aller = (k) => { setI((x) => (x + k + clients.length) % clients.length); setOuvert(null); setReplie(false); };
  // Une fiche ouverte replie la carte du client ; la fermer la rouvre.
  const ouvrir = (id) => { setOuvert(id); setReplie(!!id); };
  useEffect(() => { setFiltres(FILTRES_DEPART); }, [prospecte]);

  // Chargement, erreur, pas de secteur : la bascule reste, pour passer à « Tous les commerces ».
  const seul = (contenu) => <div className="flex flex-col gap-4"><div className="flex flex-wrap items-center gap-2">{bascule}</div>{contenu}</div>;
  if (isLoading) return seul(<p className="m-0 mt-6 inline-flex items-center gap-2 text-[13.5px] text-ardoise"><Loader2 className="h-4 w-4 animate-spin text-menthe" /> Votre secteur et vos clients…</p>);
  if (isError) return seul(<p className="m-0 mt-6 text-[13.5px] text-alerte">La prospection ne se charge pas. Rechargez la page.</p>);
  if (!data?.secteur) return seul(<p className="m-0 mt-12 text-center text-[14px] text-brume">Aucun secteur pour vous encore : Klocka vous en attribue un, puis vos clients s'affichent ici.</p>);

  return (
    <div className="flex flex-col gap-4 pb-10">
      {/* La barre du haut, comme « Tous les commerces » : la bascule, les filtres, où en sont les villes. */}
      <div className="flex flex-wrap items-center gap-2">
        {bascule}
        {prospecte && (
          <MenuFiltres filtres={filtres} setFiltres={setFiltres} commerces={murs} tous={murs} activites={activites} visibles={visibles.length} />
        )}
        {prospecte && (
          <span className="inline-flex h-10 items-center gap-2 rounded-full border border-menthe px-3.5 text-[12.5px] text-encre">
            {points.isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin text-menthe" /> : <span className="h-2 w-2 rounded-full bg-menthe" />}
            {points.isFetching ? "Les murs pour ce client…" : `${pl(visibles.length, "mur")} pour ${clientProspecte?.reference || "ce client"}`}
            <button type="button" onClick={() => { setProspecte(null); ouvrir(null); }} aria-label="Retirer les murs" title="Retirer les murs"
              className="grid h-5 w-5 place-items-center rounded-full text-ardoise hover:text-encre" style={{ background: "transparent" }}><X className="h-3 w-3" /></button>
          </span>
        )}
        <span className="flex-1" />
        {/* La préparation de ses villes, en fond : les murs s'ajoutent en direct à mesure. */}
        {enPreparation && <Preparation villes={data.villes} />}
      </div>

      {/* Au téléphone, une seule colonne à la largeur de l'écran (25 oct. 2026, Jules) : `minmax(0, 1fr)`, sinon la colonne
          implicite prend la largeur de son contenu et la carte déborde. */}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_460px] xl:grid-cols-[minmax(0,1fr)_520px]">
        {/* À gauche : le secteur, et les murs du client prospecté. */}
        <div className="relative h-[calc(100dvh-190px)] min-h-[560px] w-full min-w-0 overflow-hidden rounded-bloc border border-trait max-lg:h-[64dvh] max-lg:min-h-[380px]">
          <CarteGoogleSecteurs secteurs={secteurs} choisi={data.secteur.id} contourSeul={!!prospecte} margesChoisi={MARGES} marqueurs={marqueurs} marqueurActif={ouvert} onMarqueur={ouvrir} />
        </div>

        {/* À droite : le client (replié quand une fiche est ouverte), puis la fiche du commerce. */}
        <div className="flex h-[calc(100dvh-190px)] min-h-[560px] min-w-0 flex-col gap-3 max-lg:h-auto">
          {!(data.villes || []).length ? (
            <p className="m-0 rounded-bloc border border-trait px-5 py-6 text-[13.5px] leading-[1.6] text-ardoise">Klocka n'a pas encore choisi les villes de votre secteur : vos clients s'afficheront ici dès qu'elles le seront.</p>
          ) : !clients.length ? (
            <p className="m-0 rounded-bloc border border-trait px-5 py-6 text-[13.5px] leading-[1.6] text-ardoise">Aucun client ne cherche dans les villes de votre secteur pour l'instant ({data.villes.map((v) => v.nom).join(", ")}).</p>
          ) : (
            <CarteClient client={client} clients={clients} rang={clients.indexOf(client)} total={clients.length} onAller={aller} onChoisir={(k) => { setI(k); setOuvert(null); setReplie(false); }} actif={prospecte === client?.id}
              replie={replie} onReplier={() => setReplie((r) => !r)}
              prospecteLe={dejaLe(client)} prospectes={clients.filter((c) => dejaLe(c)).map((c) => c.id)} charge={points.isFetching}
              onProspecter={() => { if (prospecte === client.id) points.refetch(); setProspecte(client.id); setVusIci((v) => ({ ...v, [client.id]: new Date().toISOString() })); ouvrir(null); }} />
          )}
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-bloc border border-trait bg-surface max-lg:min-h-[320px]">
            {/* Fermer la fiche, ou changer de point, se fait en fondu (24 oct. 2026). */}
            <AnimatePresence mode="wait" initial={false}>
            {ouvert ? (
              <motion.div key={ouvert} className="min-h-0 flex-1 overflow-y-auto" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} transition={{ duration: 0.28, ease: "easeInOut" }}>
                <PointOuFiche point={murs.find((x) => x.id === ouvert)} id={ouvert} onFermer={() => ouvrir(null)} client={clientProspecte} pourquoi={pourquoiCible(murs.find((x) => x.id === ouvert), clientProspecte)} />
              </motion.div>
            ) : (
              <motion.div key="vide" className="grid flex-1 place-items-center px-6 py-8 text-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.28, ease: "easeInOut" }}>
                <p className="m-0 max-w-[36ch] text-[13.5px] leading-[1.6] text-ardoise">
                  {prospecte
                    ? (murs.length ? "Cliquez un point de la carte ou une ligne du tableau : la fiche du commerce s'ouvre ici." : points.isFetching ? "Les murs pour ce client arrivent…" : (points.data?.pourquoi_vide || "Aucun mur pour ce client pour l'instant."))
                    : "Choisissez un client, puis « Prospecter » : ses murs se posent sur la carte et dans le tableau."}
                </p>
              </motion.div>
            )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Le tableau des murs du client, sous la carte, comme « Tous les commerces ». */}
      {prospecte && (
        <TableauMurs murs={visibles} total={murs.length} filtres={filtres} setFiltres={setFiltres} ouvert={ouvert} onOuvrir={ouvrir} charge={points.isFetching} />
      )}
    </div>
  );
}

/**
 * Un point de la carte (24 oct. 2026, Jules) : tant que le mandataire n'a rien fait, c'est de la donnée brute (la fiche
 * du commerce, à personne) avec deux gestes qui font naître sa fiche : « Je l'appelle », « J'y suis passé ». Une fois
 * sa fiche créée, c'est elle qui s'ouvre (la sienne : aucun autre mandataire ne peut la prendre).
 */
function PointOuFiche({ point, id, onFermer, client, pourquoi }) {
  const qc = useQueryClient();
  const [ficheId, setFicheId] = useState(point?.fiche?.id || null);
  const [enCours, setEnCours] = useState(null);
  useEffect(() => { setFicheId(point?.fiche?.id || null); }, [id, point?.fiche?.id]);
  const naitre = async (statut) => {
    setEnCours(statut);
    try {
      const r = await base44.request("POST", `/api/mandataire/commerces/${id}/fiche`, { body: { statut } });
      setFicheId(r.proprietaire.id);
      qc.invalidateQueries({ queryKey: ["m-prospecter", "points"] });
      qc.invalidateQueries({ queryKey: ["m-listes"] });
      if (statut === "a_appeler" && r.proprietaire.telephone) window.location.href = `tel:${String(r.proprietaire.telephone).replace(/[^\d+]/g, "")}`;
    } catch (e) { toast.error(e?.message || "Impossible de créer la fiche"); }
    setEnCours(null);
  };
  if (ficheId) return <FicheMandataire id={ficheId} onFermer={onFermer} />;
  return (
    <>
      <div className="flex flex-wrap items-center gap-2 border-b border-trait px-5 py-3">
        <span className="mr-auto text-[12.5px] text-ardoise">Vous agissez : la fiche est créée, à vous.</span>
        <button type="button" onClick={() => naitre("a_appeler")} disabled={!!enCours} className={boutonPlein}>{enCours === "a_appeler" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}Je l'appelle</button>
        <button type="button" onClick={() => naitre("contacte")} disabled={!!enCours} className={bouton}>{enCours === "contacte" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}J'y suis passé</button>
      </div>
      <Fiche id={id} onFermer={onFermer} client={client} pourquoi={pourquoi} />
    </>
  );
}

/** Où en est la préparation des villes (lecture, propriétaires, prix) : une pastille, le détail au survol. */
function Preparation({ villes }) {
  const p = villes.map((v) => v.preparation || {});
  const somme = (k) => p.reduce((n, x) => n + (x[k] || 0), 0);
  const aLire = villes.filter((v) => v.etat !== "lue").map((v) => v.nom);
  const reste = somme("proprietaires_a_faire");
  const detail = villes.map((v) => `${v.nom} : ${v.etat !== "lue" ? "lecture à venir" : `${v.preparation?.proprietaires_faits || 0} propriétaires cherchés sur ${v.preparation?.commerces || 0}, ${v.preparation?.avec_prix || 0} prix`}`).join("\n");
  return (
    <span title={detail} className="inline-flex h-10 items-center gap-2 rounded-full border border-menthe/50 px-3.5 text-[12.5px] text-encre">
      <Loader2 className="h-3.5 w-3.5 animate-spin text-menthe" />
      {aLire.length ? `Lecture de ${aLire.join(", ")}` : reste ? `Propriétaires : ${reste} à chercher` : "Prix en cours d'estimation"}
      <span className="text-ardoise">· les murs s'ajoutent en direct</span>
    </span>
  );
}

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
    <section className="overflow-hidden rounded-bloc border border-trait bg-surface">
      <div className="flex flex-wrap items-center gap-2 border-b border-trait px-4 py-3">
        <h3 className="m-0 mr-2 text-[16px] font-normal text-encre">{pl(tries.length, "mur")}{tries.length !== total ? <span className="text-ardoise"> sur {total}</span> : null}</h3>
        <div className="relative w-[280px] max-w-full">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-brume" />
          <input value={filtres.texte} onChange={(e) => setFiltres((f) => ({ ...f, texte: e.target.value }))} placeholder="Enseigne, activité, rue, propriétaire" className={`${champ} w-full pl-8`} />
        </div>
        {nbFiltres({ ...filtres, emplacement: "centre" }) > 0 && <button type="button" onClick={() => setFiltres(FILTRES_DEPART)} className={bouton}><X className="h-3.5 w-3.5" />Tout afficher</button>}
        <button type="button" onClick={() => setVersListe(true)} disabled={!coches.size} className={coches.size ? boutonPlein : bouton}><ListPlus className="h-3.5 w-3.5" />Envoyer vers une liste{coches.size ? ` (${coches.size})` : ""}</button>
        {coches.size > 0 && <button type="button" onClick={() => setCoches(new Set())} className={bouton}>Décocher</button>}
        <span className="flex-1" />
        <span className="text-[12.5px] text-ardoise">{tries.length ? `${page * PAR_PAGE + 1} à ${Math.min(tries.length, (page + 1) * PAR_PAGE)}` : "0"}</span>
        <button type="button" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} aria-label="Page précédente" title="Page précédente" className={`${bouton} px-2.5`}><ChevronDown className="h-4 w-4 rotate-90" /></button>
        <button type="button" onClick={() => setPage((p) => Math.min(pages - 1, p + 1))} disabled={page >= pages - 1} aria-label="Page suivante" title="Page suivante" className={`${bouton} px-2.5`}><ChevronDown className="h-4 w-4 -rotate-90" /></button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1080px] border-collapse text-left">
          <thead>
            <tr>
              <th className="w-10 border-b border-trait py-2.5 pl-4 pr-0"><Case oui={tousCoches} disabled={!libres.length} label="Cocher toute la page" onBasculer={() => setCoches((s) => { const n = new Set(s); for (const c of libres) { if (tousCoches) n.delete(c.id); else n.add(c.id); } return n; })} /></th>
              {colonnes.map(([cle, mot]) => (
                <th key={cle} className="border-b border-trait px-4 py-2.5 text-[12px] font-normal text-ardoise">
                  <button type="button" onClick={() => setTri((t) => (t.cle === cle ? { cle, sens: -t.sens } : { cle, sens: 1 }))} className="inline-flex items-center gap-1 p-0 text-ardoise hover:text-encre" style={{ background: "transparent" }}>{mot}{tri.cle === cle && <ChevronDown className={`h-3 w-3 ${tri.sens < 0 ? "rotate-180" : ""}`} />}</button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {vue.map((c) => (
              <tr key={c.id} onClick={() => onOuvrir(c.id)} className={`cursor-pointer border-b border-trait last:border-b-0 ${ouvert === c.id ? "bg-menthe/10" : "hover:bg-relief/40"}`}>
                <td className="w-10 py-2.5 pl-4 pr-0" onClick={(e) => e.stopPropagation()}><Case oui={coches.has(c.id)} onBasculer={() => cocher(c)} label={c.liste ? `Déjà dans la liste « ${c.liste.nom} »` : "Choisir pour une liste"} className={c.liste ? "opacity-35" : ""} /></td>
                <td className="px-4 py-2.5"><span className="flex items-center gap-2.5"><span className="inline-block h-2.5 w-2.5 flex-none rounded-full" style={{ background: LIENS[c.lien]?.couleur || JL.brume }} /><span className="min-w-0"><span className="block max-w-[240px] truncate text-[14px] text-encre">{c.titre}</span><span className="block max-w-[240px] truncate text-[12px] text-ardoise">{c.activite}</span></span></span></td>
                <td className="max-w-[220px] px-4 py-2.5 text-[13px] text-craie"><span className="block truncate">{c.adresse}</span><span className="block truncate text-[12px] text-ardoise">{c.ville}</span></td>
                <td className="max-w-[200px] truncate px-4 py-2.5 text-[13px] text-craie">{c.exploitant || c.nom}</td>
                <td className="max-w-[220px] truncate px-4 py-2.5 text-[13px] text-encre">{c.proprietaire}</td>
                <td className="whitespace-nowrap px-4 py-2.5 text-[13px] text-craie">{(LIENS[c.lien]?.mot || "").replace(" (probable)", "") || "…"}</td>
                <td className="px-4 py-2.5"><span className="flex flex-wrap gap-1">{c.drapeaux.slice(0, 2).map((d) => <span key={d} className="whitespace-nowrap rounded-full bg-relief px-2 py-0.5 text-[11.5px] text-craie">{DRAPEAUX_COURTS[d] || d}</span>)}{c.drapeaux.length > 2 && <span className="text-[11.5px] text-brume">+{c.drapeaux.length - 2}</span>}</span></td>
                <td className="whitespace-nowrap px-4 py-2.5 text-[12.5px] tabular-nums">{c.prix?.moyenne
                  ? <span className={c.dans_budget === false ? "text-brume" : "text-encre"} title={c.prix.au_rendement ? `Le prix qui lui donne ${String(c.prix.au_rendement).replace(".", ",")} % (prix estimé : ${euros(c.prix_estime?.moyenne)})` : `Prix indicatif, entre ${euros(c.prix.basse)} et ${euros(c.prix.haute)}`}>{euros(c.prix.moyenne)}{c.dans_budget === false ? " · hors budget" : ""}</span>
                  : <span className="text-ambre" title="Aucune estimation pour ce local encore : à vérifier avec le propriétaire">Prix à vérifier</span>}</td>
                <td className="whitespace-nowrap px-4 py-2.5 text-[12.5px]">{c.reponse ? <span className="text-menthe">{REPONSES[c.reponse]?.split(",")[0] || "Appelé"}</span> : c.liste ? <span className="text-ardoise">Liste « {c.liste.nom} »</span> : <span className="text-brume">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!tries.length && !charge && <Vide>Aucun mur avec ces filtres.</Vide>}
      </div>
      {versListe && <FenetreListe ids={[...coches]} onFermer={() => setVersListe(false)} onFait={() => { setVersListe(false); setCoches(new Set()); qc.invalidateQueries({ queryKey: ["m-prospecter", "points"] }); }} />}
    </section>
  );
}

/** La carte d'un client : ce qu'il cherche, où dans le secteur, son budget, ses règles ; « Prospecter » en bas. */
function CarteClient({ client, clients = [], rang, total, onAller, onChoisir = null, onProspecter, actif, replie = false, onReplier = null, prospecteLe = null, prospectes = [], charge = false }) {
  const rendement = client.rendement_min ? `${String(client.rendement_min).replace(".", ",")} % minimum` : "Non précisé";
  const regles = [
    veutEmplacement1(client) && { mot: "Emplacement n°1 seulement", ton: "bg-pervenche/15 text-pervenche" },
    veutEnseigneNationale(client) && { mot: "Enseigne nationale seulement", ton: "bg-pervenche/15 text-pervenche" },
    ...exclusionsDe(client).map((f) => ({ mot: `Pas de ${f.mot}`, ton: "bg-ambre/15 text-ambre" })),
  ].filter(Boolean);
  return (
    <div className="flex-none overflow-hidden rounded-[18px] border border-bord-doux bg-rail">
      {/* Les petites têtes des clients (24 oct. 2026, Jules) : un clic passe au client. */}
      {total > 1 && onChoisir && (
        <div className="flex items-center gap-1.5 px-4 pt-3" role="tablist" aria-label="Vos clients">
          {clients.slice(0, 9).map((c, i) => (
            <button key={c.id} type="button" role="tab" aria-selected={i === rang} onClick={() => onChoisir(i)} title={`${c.reference} · ${c.type_commerce || "tout commerce"}`}
              className={`flex-none rounded-full transition-all duration-500 ease-out ${i === rang ? "scale-110 ring-2 ring-menthe" : "opacity-60 hover:opacity-100"}`} style={{ background: "transparent" }}>
              <span className="relative block">
                <Avatar d={c} taille="h-8 w-8" />
                {/* Déjà prospecté : un point menthe au coin de sa tête. */}
                {prospectes.includes(c.id) && <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-rail bg-menthe" aria-hidden />}
              </span>
              <span className="sr-only">{c.reference}{prospectes.includes(c.id) ? ", déjà prospecté" : ""}</span>
            </button>
          ))}
          {total > 9 && <span className="text-[11.5px] tabular-nums text-brume">+{total - 9}</span>}
        </div>
      )}
      <div className={`flex items-center gap-3 px-4 py-3 transition-colors duration-500 ${replie ? "" : "border-b border-trait"}`}>
        <Avatar d={client} taille="h-10 w-10" />
        <div className="min-w-0 flex-1">
          <p className="m-0 flex items-center truncate text-[15px] text-encre">{client.reference}<PastilleExemple x={client} /></p>
          <p className="m-0 truncate text-[12.5px] text-ardoise">{replie ? `${client.type_commerce || "Tout commerce"} · ${budgetDe(client)}` : `${client.profil} · client ${rang + 1} sur ${total}`}</p>
        </div>
        {onReplier && (
          <button type="button" onClick={onReplier} aria-expanded={!replie} aria-label={replie ? "Déplier le client" : "Replier le client"} title={replie ? "Déplier" : "Replier"}
            className="grid h-8 w-8 place-items-center rounded-full text-ardoise hover:text-encre" style={{ background: "transparent" }}><ChevronDown className={`h-4 w-4 transition-transform duration-500 ease-in-out ${replie ? "" : "rotate-180"}`} /></button>
        )}
        {total > 1 && (
          <>
            <button type="button" onClick={() => onAller(-1)} aria-label="Client précédent" title="Client précédent" className="grid h-8 w-8 place-items-center rounded-full border border-trait text-craie hover:text-encre" style={{ background: "transparent" }}><ChevronLeft className="h-4 w-4" /></button>
            <button type="button" onClick={() => onAller(1)} aria-label="Client suivant" title="Client suivant" className="grid h-8 w-8 place-items-center rounded-full border border-trait text-craie hover:text-encre" style={{ background: "transparent" }}><ChevronRight className="h-4 w-4" /></button>
          </>
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
