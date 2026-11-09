import React, { useEffect, useMemo, useRef, useState } from "react";
import Loader from "@/components/ui/Loader";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown, ChevronLeft, ChevronRight, ListPlus, Loader2, Menu, Radar, RefreshCw, Search, X } from "lucide-react";
import { Avatar } from "@/components/mandataire/AvatarClient";
import { base44 } from "@/api/base44Client";
import { JL } from "@/design/jetons";
import CarteGoogleSecteurs from "@/components/mandataire/CarteGoogleSecteurs";
import FicheMandataire from "@/components/mandataire/FicheMandataire";
import { toast } from "@/components/ui/avis";
import { PastilleTest } from "@/components/mandataire/kit";
import { DRAPEAUX_COURTS, FenetreListe, LIENS, MenuFiltres, REPONSES } from "@/components/off-market/Simple";
import { Case, Vide, bouton, boutonPlein, champ, euros, pl } from "@/components/off-market/commun";
import { BUREAUX_COURTS, FILTRES_SIMPLE, FONDS_COURTS, comprendre, estFonds, nbFiltres, passeMurs, passeSimple, typesDe } from "@/lib/off-market-simple";
import jetons from "@/design/jetons.json";
import { montant } from "../../../server/montants.js";
import { budgetDe, exclusionsDe, veutEmplacement1, veutEnseigneNationale } from "@/lib/clients-commerces";
import { API_LIBRES, FILTRES_LIBRES, FicheLibre, TableauLibres, couleurLibre, duree, passeLibre } from "@/components/mandataire/MursLibres";
import { EnFond, PiluleVilles, memeVille } from "@/components/mandataire/VillesMandataire";

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
// Plus de points gris à l'arrivée (3 nov. 2026, Jules : « on arrive, on ne voit que les bleus et les verts ») : les
// propriétaires inconnus et les recherches en cours se cochent dans Filtrer, au Lien.
const FILTRES_DEPART = { ...FILTRES_SIMPLE, emplacement: "partout", liens: ["exploitant", "tiers"] };
// Le mode Fonds (3 nov. 2026, Jules) : une prospection du mandataire pour sa propre activité, sans client Klocka ; les
// commerces du secteur qui ont un signal de cession, filtrés par lui.
// Les bureaux sur la carte (3 nov. 2026) : la pervenche K Partners, en valeur (la carte Google ne lit pas les variables CSS).
const PERVENCHE = jetons.accents.pervenche.sombre;

export default function ProspecterClients({ bascule = null }) {
  // Relu à chaque ouverture : un secteur redessiné ou réattribué par Klocka se voit tout de suite.
  // En direct (24 oct. 2026, Jules : « dès qu'il fait une recherche, ça s'affiche en direct ») : tant qu'une ville de son
  // secteur se prépare (lecture, propriétaires, prix), les clients et les murs se relisent toutes les trente secondes.
  const { data, isLoading, isError } = useQuery({ queryKey: ["m-prospecter"], queryFn: () => base44.request("GET", API),
    // Le dernier résultat arrive tout de suite (1er nov. 2026) ; s'il se recalcule en fond (`a_jour` faux), relu dans 5 s.
    refetchInterval: (q) => (q.state.data?.a_jour === false ? 5_000 : (q.state.data?.villes || []).some((v) => v.preparation?.en_cours) ? 30_000 : false) });
  const enPreparation = (data?.villes || []).some((v) => v.preparation?.en_cours);
  // La carte aussi arrive gardée (3 nov. 2026) : quand le calcul en fond s'achève (`a_jour` repasse vrai), on la relit.
  const qc = useQueryClient();
  const aJour = data?.a_jour;
  const etaitVieux = useRef(false);
  useEffect(() => {
    if (aJour === false) etaitVieux.current = true;
    else if (aJour && etaitVieux.current) { etaitVieux.current = false; qc.invalidateQueries({ queryKey: ["m-prospecter", "points", "tous"] }); }
  }, [aJour, qc]);
  const clients = useMemo(() => data?.clients || [], [data]);
  const [i, setI] = useState(0);
  // Le client est un filtre de la même vue (25 oct. 2026, Jules) : on arrive sur tous les commerces du secteur, et les flèches
  // de la carte passent à un client, dont les murs remplacent la liste. `tous` : aucun client choisi.
  const [tous, setTous] = useState(true);
  const [prospecte, setProspecte] = useState("tous"); // « tous », ou l'id du client dont les murs sont sur la carte
  const [ouvert, setOuvert] = useState(null); // le commerce dont la fiche est ouverte
  const [replie, setReplie] = useState(false); // la carte du client, repliée quand une fiche s'ouvre
  // La ville regardée (6 nov. 2026, Jules) : null, toutes ses villes.
  const [villeVue, setVilleVue] = useState(null);
  // Le type d'actif (3 nov. 2026, Jules) : la pilule Fonds · Murs · Bureaux, hors du menu Filtrer (« remets les modes en
  // dehors des filtres ») ; Occupés · Libres, premier choix du menu des Murs. Un type à la fois dans `filtres.types` ;
  // le reste de l'écran sait en montrer plusieurs, chacun sa source.
  const depart = FILTRES_DEPART;
  const [filtres, setFiltres] = useState(FILTRES_DEPART);
  const types = typesDe(filtres);
  const aMurs = types.includes("murs");
  const aFonds = types.includes("fonds");
  const aBureaux = types.includes("bureaux");
  // Le mode Bureaux en développement (4 nov. 2026, Jules : « je ne veux pas voir de points pour l'instant ») : la pilule
  // reste, la carte et le tableau laissent place à un écran d'attente ; rien n'est demandé au serveur.
  const bureauxEnDev = aBureaux;
  const aLibres = types.includes("libres");
  const typeUnique = types[0];
  const choisirType = (k) => {
    const suivant = k === "murs" ? (typeUnique === "libres" ? "libres" : "murs") : k;
    if (suivant === typeUnique) return;
    // Seuls les murs ont des clients : un autre type repart de tous les commerces du secteur, la fiche se ferme.
    if (suivant !== "murs") setTous(true);
    setOuvert(null); setReplie(false);
    setFiltres({ ...FILTRES_DEPART, types: [suivant] });
  };
  const choixOccupation = (
    <div className="flex flex-col gap-2">
      <span className="text-[12px] text-brume">Occupation</span>
      <span className="flex flex-wrap gap-1.5">
        {[["murs", "Occupés"], ["libres", "Libres"]].map(([k, mot]) => (
          <button key={k} type="button" aria-pressed={typeUnique === k} onClick={() => { if (k !== typeUnique) { setOuvert(null); setFiltres((f) => ({ ...f, types: [k] })); } }}
            className={`inline-flex h-8 items-center rounded-full border px-3 text-[13.5px] ${typeUnique === k ? "border-pervenche bg-pervenche/10 text-encre" : "border-trait text-craie hover:text-encre"}`}
            style={typeUnique === k ? undefined : { background: "transparent" }}>{mot}</button>
        ))}
      </span>
    </div>
  );
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
  const geste = useRef(null);
  // Les commerces (murs occupés et fonds) : ceux du secteur, ou les murs du client prospecté.
  const points = useQuery({
    queryKey: ["m-prospecter", "points", prospecte],
    queryFn: () => {
      const noter = geste.current === prospecte;
      geste.current = null;
      return base44.request("GET", prospecte === "tous" ? `${API}/tous` : `${API}/clients/${prospecte}${noter ? "?prospecter=1" : ""}`);
    },
    enabled: !!prospecte && (aMurs || aFonds),
    staleTime: 5 * 60_000,
    refetchInterval: enPreparation ? 30_000 : false,
  });
  // Les bureaux, un point par immeuble (3 nov. 2026, Jules), et les locaux vides : chacun sa requête, seulement coché.
  const bureauxQ = useQuery({ queryKey: ["m-prospecter", "points", "bureaux"], queryFn: () => base44.request("GET", `${API}/bureaux`), enabled: aBureaux && tous && !bureauxEnDev, staleTime: 5 * 60_000 });
  const libresQ = useQuery({ queryKey: ["m-prospecter", "libres"], queryFn: () => base44.request("GET", API_LIBRES), enabled: aLibres && tous, staleTime: 60_000,
    refetchInterval: (q) => (q.state.data?.en_preparation?.length || q.state.data?.en_verification ? 20_000 : false) });
  const attente = (aMurs || aFonds) && points.isLoading;
  const murs = useMemo(() => (prospecte && (aMurs || aFonds) ? points.data?.points || [] : []), [prospecte, aMurs, aFonds, points.data]);
  const bureaux = useMemo(() => (aBureaux && tous ? bureauxQ.data?.points || [] : []), [aBureaux, tous, bureauxQ.data]);
  const tousPoints = useMemo(() => [...murs, ...bureaux], [murs, bureaux]);
  const cherche = (c, t) => !t || `${c.titre || ""} ${c.enseigne || ""} ${c.nom || ""} ${c.activite || ""} ${c.adresse || ""} ${c.proprietaire || ""} ${c.ville || ""} ${(c.noms || []).join(" ")}`.toLowerCase().includes(t);
  const visibles = useMemo(() => {
    const t = filtres.texte.trim().toLowerCase();
    return tousPoints.filter((c) => (!villeVue || memeVille(c.ville, villeVue)) && passeSimple(c, filtres) && cherche(c, t));
  }, [tousPoints, filtres, villeVue]);
  const estBureau = (c) => (c.classe || "commerce") === "bureau";
  // Un commerce montré pour son fonds seul : en ambre ; ses murs gardent le menthe (exploitant) et le bleu (bailleur).
  const commeFonds = (c) => !estBureau(c) && aFonds && !(aMurs && passeMurs(c, filtres));
  const visiblesCommerces = useMemo(() => visibles.filter((c) => !estBureau(c)), [visibles]);
  const visiblesBureaux = useMemo(() => visibles.filter(estBureau), [visibles]);
  // Les activités des types cochés seulement (les fonds sans les autres commerces, 3 nov. 2026).
  const activites = useMemo(() => {
    const n = {};
    for (const c of tousPoints) {
      if (!c.activite) continue;
      const garde = estBureau(c) ? aBureaux : (aMurs || estFonds(c));
      if (garde) n[c.activite] = (n[c.activite] || 0) + 1;
    }
    return Object.entries(n).sort((a, b) => b[1] - a[1]).map(([v, k]) => ({ v, mot: v, n: k }));
  }, [tousPoints, aMurs, aBureaux]);
  // Les murs libres (3 nov. 2026, Jules) : les locaux vides du secteur, une autre source et d'autres filtres.
  const [filtresLibres, setFiltresLibres] = useState(FILTRES_LIBRES);
  const pointsLibres = useMemo(() => (aLibres && tous ? libresQ.data?.points || [] : []), [aLibres, tous, libresQ.data]);
  const visiblesLibres = useMemo(() => pointsLibres.filter((p) => passeLibre(p, filtresLibres) && cherche(p, filtres.texte.trim().toLowerCase())), [pointsLibres, filtresLibres, filtres.texte]);
  const marqueursLibres = useMemo(() => visiblesLibres.map((p) => ({ id: p.id, lat: p.lat, lon: p.lon, titre: [p.titre, p.mois_vide != null ? `vide depuis ${duree(p.mois_vide)}` : null, p.fiche?.dans_biens ? "dans Biens" : null].filter(Boolean).join(" · "), couleur: couleurLibre(p) })), [visiblesLibres]);
  // Au survol d'un point : son nom et son signal le plus fort. Un point dont la fiche est dans Biens devient noir (24 oct.
  // 2026). Les bureaux en pervenche (3 nov. 2026).
  const marqueursPoints = useMemo(() => visibles.map((p) => {
    const bureau = estBureau(p);
    const fonds = commeFonds(p);
    const signal = bureau ? BUREAUX_COURTS[p.bureaux?.[0]] : fonds ? FONDS_COURTS[p.fonds?.[0]] : p.signaux?.[0];
    return { id: p.id, lat: p.lat, lon: p.lon, titre: [p.titre, bureau && p.occupants > 1 ? `${p.occupants} occupants` : null, p.fiche?.dans_biens ? "dans Biens" : null, signal].filter(Boolean).join(" · "),
      couleur: p.fiche?.dans_biens ? JL.fond : bureau ? PERVENCHE : fonds ? JL.ambre : LIENS[p.lien]?.couleur || JL.menthe };
  }), [visibles, aMurs, aFonds, filtres]);
  const marqueurs = useMemo(() => [...marqueursPoints, ...marqueursLibres], [marqueursPoints, marqueursLibres]);
  const secteurs = useMemo(() => (data?.secteur ? [{ ...data.secteur, teinte: data.secteur.teinte || JL.menthe }] : []), [data]);
  // Le choix du client se fait dans la liste déroulante de la carte (25 oct. 2026, Jules) : « tous les commerces » en
  // premier, puis chaque client ; on saute directement à n'importe lequel.
  const choisir = (k) => {
    if (k == null) setTous(true); else { setTous(false); setI(k); }
    setOuvert(null); setReplie(false);
  };
  const selecteur = { clients, tous, courant: Math.min(i, Math.max(0, clients.length - 1)), onChoisir: choisir, vus: clients.filter((c) => dejaLe(c)).map((c) => c.id) };
  // Une fiche ouverte replie la carte du client ; la fermer la rouvre.
  const ouvrir = (id) => { setOuvert(id); setReplie(!!id); };
  const boiteFiche = useRef(null);
  useEffect(() => {
    if (!ouvert || !window.matchMedia("(max-width: 767px)").matches) return;
    requestAnimationFrame(() => boiteFiche.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, [ouvert]);
  // Un autre client : ses filtres repartent du départ, les types cochés restent.
  useEffect(() => { setFiltres((f) => ({ ...FILTRES_DEPART, types: f.types })); }, [prospecte]);
  // Les clients ne se rapprochent que des murs : sans Murs occupés coché, on revient à tous les commerces.
  useEffect(() => { if (!aMurs && !tous) choisir(null); }, [aMurs]);
  // Prospecter depuis le chat (2 nov. 2026, Jules : « je veux que des boulangeries propriétaires exploitants ») : l'assistant
  // ouvre la page avec `?recherche=` ; la phrase devient les filtres de tous les commerces du secteur, une fois.
  const demande = useRef((() => { try { return new URLSearchParams(window.location.search).get("recherche"); } catch { return null; } })());
  useEffect(() => {
    if (!demande.current || prospecte !== "tous" || !murs.length) return;
    const phrase = demande.current;
    demande.current = null;
    const { filtres: f, compris } = comprendre(phrase, activites);
    setFiltres({ ...FILTRES_DEPART, ...f, liens: f.liens.length ? f.liens : FILTRES_DEPART.liens });
    try { const u = new URL(window.location.href); u.searchParams.delete("recherche"); window.history.replaceState(null, "", u); } catch { /* adresse inchangée */ }
    toast.success(compris.length ? `Filtré : ${compris.join(", ")}` : `Je n'ai rien reconnu dans « ${phrase} »`);
  }, [prospecte, murs, activites]);
  // La fiche ouverte : un local vide, un immeuble de bureaux, ou un commerce (vu comme fonds ou comme murs).
  const pointLibre = pointsLibres.find((x) => x.id === ouvert) || null;
  const pointOuvert = tousPoints.find((x) => x.id === ouvert) || null;
  // Le type de chaque commerce envoyé vers une liste (3 nov. 2026, Jules) : ce qu'on prospectait, comme la fiche ouverte.
  const typeProspecte = (id) => { const c = tousPoints.find((x) => x.id === id); return !c ? "murs_commerce" : estBureau(c) ? "bureaux" : commeFonds(c) ? "fonds_commerce" : "murs_commerce"; };
  const modeFiche = pointOuvert && estBureau(pointOuvert) ? "bureaux" : pointOuvert && commeFonds(pointOuvert) ? "fonds" : "murs";
  const seulementFonds = aFonds && !aMurs && !aBureaux && !aLibres;

  // Chargement, erreur, pas de secteur : la bascule reste, pour passer à « Tous les commerces ».
  const seul = (contenu) => <div className="flex flex-col gap-4"><div className="flex flex-wrap items-center gap-2">{bascule}<PiluleVilles choisie={villeVue} onChoisir={setVilleVue} /></div>{contenu}<EnFond /></div>;
  // Les locaux vides en fond : une commune pas encore recensée, des locaux à vérifier sur Google Maps (3 nov. 2026).
  const autresEnFond = !aLibres ? [] : (libresQ.data?.en_preparation || []).length
    ? [{ cle: "recensement", titre: "Locaux vides", detail: `Recensement de ${libresQ.data.en_preparation.join(", ")}` }]
    : libresQ.data?.en_verification > 0 ? [{ cle: "verification", titre: "Locaux vides", detail: `Vérification sur Google Maps : ${libresQ.data.en_verification} locaux` }] : [];
  if (isLoading) return seul(<Loader titre="Vos villes et vos clients…" />);
  if (isError) return seul(<p className="m-0 mt-6 text-[13.5px] text-alerte">La prospection ne se charge pas. Rechargez la page.</p>);
  if (!data?.secteur) return seul(<p className="m-0 mt-12 text-center text-[14px] text-brume">Tapez une ville pour commencer : ses commerces et vos clients qui y cherchent s'affichent ici.</p>);

  return (
    <div className="flex flex-col gap-4 pb-10">
      <EnFond autres={autresEnFond} />
      {/* Deux colonnes dès le haut (25 oct. 2026, Jules) : à gauche la barre puis la carte, à droite la carte du client
          dont le haut s'aligne sur la bascule « Pour mes clients / Tous les commerces ». Au téléphone, une seule colonne à la
          largeur de l'écran (`minmax(0, 1fr)`, sinon la colonne implicite prend la largeur de son contenu et déborde). */}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_460px] xl:grid-cols-[minmax(0,1fr)_520px]">
      <div className="flex min-w-0 flex-col gap-4">
      {/* La barre du haut : la bascule, Mode Libre / Mode Clients (les murs seulement), Filtrer, où en sont les villes. */}
      <div className="flex flex-wrap items-center gap-2">
        {bascule}
        <PiluleVilles choisie={villeVue} onChoisir={setVilleVue} />
        <SelecteurActif actif={typeUnique === "libres" ? "murs" : typeUnique} onChange={choisirType} />
        {aMurs && clients.length > 0 && <BasculeMode clients={!tous} onChange={(oui) => choisir(oui ? i : null)} />}
        {prospecte && !bureauxEnDev && (
          <MenuFiltres filtres={filtres} setFiltres={setFiltres} commerces={tousPoints} tous={tousPoints} activites={activites} visibles={visibles.length + visiblesLibres.length} depart={depart}
            entete={(aMurs || aLibres) && tous ? choixOccupation : null} libres={tous ? { filtres: filtresLibres, setFiltres: setFiltresLibres, points: pointsLibres } : null} />
        )}
        {/* Plus de pastille « n murs pour … » (25 oct. 2026, Jules) : le nombre est sur la carte du client et au-dessus du
            tableau, le chargement sur « Mettre à jour », et changer de client remplace les murs. */}
        <span className="flex-1" />
        {/* Ce qui tourne en fond (lecture des villes, propriétaires, recensement des locaux vides) quitte la barre
            (6 nov. 2026, Jules : « ça gêne la vue ») : le bouton En fond, en bas à gauche. */}
      </div>

        {/* À gauche : le secteur, et ce que les types cochés y posent. */}
        <div className="relative h-[48vh] min-h-[400px] w-full min-w-0 overflow-hidden rounded-[12px] border border-trait max-md:h-[380px] max-md:min-h-0">
          {bureauxEnDev ? (
            <div className="grid h-full place-items-center bg-rail px-6 text-center">
              <div>
                <p className="m-0 text-[20px] text-encre">Mode Bureaux en développement</p>
                <p className="m-0 mt-2 max-w-[44ch] text-[13.5px] leading-[1.6] text-ardoise">Les bureaux vides de votre secteur arrivent bientôt ici. En attendant, les Murs et les Fonds sont prêts.</p>
              </div>
            </div>
          ) : <CarteGoogleSecteurs secteurs={secteurs} choisi={data.secteur.id} contourSeul={!!prospecte} margesChoisi={MARGES} marqueurs={marqueurs} marqueurActif={ouvert} onMarqueur={ouvrir} />}
        </div>
      </div>

        {/* À droite, du haut de la barre au bas de la carte, exactement (25 oct. 2026, Jules) : à partir de `lg`, la colonne
            prend la hauteur de la rangée de la grille, celle de la colonne de gauche (barre + carte), et son contenu est posé
            en absolu : il ne peut pas l'allonger. Dessous, une hauteur propre, le client puis la fiche l'un sous l'autre. */}
        <div className="relative min-w-0 max-lg:h-[62vh] max-lg:min-h-[460px] max-md:h-auto">
        <div className="flex min-w-0 flex-col gap-3 lg:absolute lg:inset-0 max-lg:h-full max-md:h-auto">
          {!aMurs ? null : !(data.villes || []).length ? (
            <p className="m-0 rounded-bloc border border-trait px-5 py-6 text-[13.5px] leading-[1.6] text-ardoise">Ajoutez une ville : vos clients qui y cherchent s'afficheront ici.</p>
          ) : !clients.length ? (
            <CarteTous n={points.data?.total ?? murs.length} villes={data.villes} charge={attente} seule />
          ) : (
            tous ? <CarteTous n={points.data?.total ?? murs.length} villes={data.villes} charge={attente} seule replie={replie} onReplier={() => setReplie((r) => !r)} />
            : <CarteClient client={client} selecteur={selecteur} actif={prospecte === client?.id}
              replie={replie} onReplier={() => setReplie((r) => !r)}
              prospecteLe={dejaLe(client)} charge={points.isFetching}
              onProspecter={() => { geste.current = client.id; if (prospecte === client.id) points.refetch(); else qc.invalidateQueries({ queryKey: ["m-prospecter", "points", client.id] }); setProspecte(client.id); setVusIci((v) => ({ ...v, [client.id]: new Date().toISOString() })); ouvrir(null); }} />
          )}
          {/* Au téléphone, une fiche ouverte prend presque tout l'écran, et la page descend jusqu'à elle (31 oct. 2026, Jules). */}
          <div ref={boiteFiche} className={`flex min-h-0 flex-1 flex-col overflow-hidden rounded-[12px] border border-bord-doux bg-fond max-lg:min-h-[320px] ${ouvert ? "max-md:h-[86dvh] max-md:flex-none" : ""}`}>
            {/* Fermer la fiche, ou changer de point, se fait en fondu (24 oct. 2026). */}
            <AnimatePresence mode="wait" initial={false}>
            {ouvert ? (
              <motion.div key={ouvert} className="min-h-0 flex-1 overflow-y-auto" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} transition={{ duration: 0.28, ease: "easeInOut" }}>
                {pointLibre ? (pointLibre.fiche ? <FicheMandataire id={pointLibre.fiche.id} onFermer={() => ouvrir(null)} /> : <FicheLibre id={ouvert} point={pointLibre} onFermer={() => ouvrir(null)} />)
                  : <PointOuFiche point={pointOuvert} id={ouvert} onFermer={() => ouvrir(null)} mode={modeFiche} />}
              </motion.div>
            ) : (
              <motion.div key="vide" className="grid flex-1 place-items-center px-6 py-8 text-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.28, ease: "easeInOut" }}>
                <p className="m-0 max-w-[36ch] text-[13.5px] leading-[1.6] text-ardoise">
                  {!prospecte
                    ? "Choisissez un client, puis « Prospecter » : ses murs se posent sur la carte et dans le tableau."
                    : !tous && !murs.length && !attente ? (points.data?.pourquoi_vide || "Aucun mur pour ce client pour l'instant.")
                    : attente || (aBureaux && bureauxQ.isLoading) || (aLibres && libresQ.isLoading) ? "Les points de votre secteur arrivent…"
                    : "Cliquez un point de la carte ou une ligne d'un tableau : sa fiche s'ouvre ici."}
                </p>
              </motion.div>
            )}
            </AnimatePresence>
          </div>
        </div>
        </div>
      </div>

      {/* Un tableau par type coché, sous la carte. */}
      {prospecte && (aMurs || aFonds) && (
        <TableauMurs murs={visiblesCommerces} total={murs.length} filtres={filtres} setFiltres={setFiltres} ouvert={ouvert} onOuvrir={ouvrir} charge={attente} depart={depart} fonds={seulementFonds} typesParId={typeProspecte} />
      )}
      {tous && aBureaux && !bureauxEnDev && (
        <TableauMurs murs={visiblesBureaux} total={bureaux.length} filtres={filtres} setFiltres={setFiltres} ouvert={ouvert} onOuvrir={ouvrir} charge={bureauxQ.isLoading} depart={depart} bureaux typesParId={() => "bureaux"} />
      )}
      {tous && aLibres && (
        <TableauLibres points={visiblesLibres} total={pointsLibres.length} filtres={filtresLibres} setFiltres={setFiltresLibres} ouvert={ouvert} onOuvrir={ouvrir} charge={libresQ.isLoading} />
      )}
    </div>
  );
}

/**
 * Un point de la carte (24 oct. 2026, Jules) : tant que le mandataire n'a rien fait, c'est de la donnée brute (la fiche
 * du commerce, à personne) avec deux gestes qui font naître sa fiche : « Je l'appelle », « J'y suis passé ». Une fois
 * sa fiche créée, c'est elle qui s'ouvre (la sienne : aucun autre mandataire ne peut la prendre).
 */
function PointOuFiche({ id, onFermer, point, mode = "murs" }) {
  // La fiche des listes, la même partout (25 oct. 2026, Jules) : celle de la carte d'une liste ; sans fiche encore, son
  // aperçu, avec « Ajouter à ma liste » qui la fait naître.
  return <FicheMandataire id={point?.fiche?.id || null} commerceId={id} onFermer={onFermer} mode={mode} />;
}

const TRAIT = "border-trait";
const GESTE = "inline-flex h-8 items-center gap-1.5 rounded-full border border-trait px-3 text-[13.5px] text-craie hover:text-encre disabled:opacity-50";
const GESTE_PLEIN = "inline-flex h-8 items-center gap-1.5 rounded-full bg-menthe px-3 text-[13.5px] text-sur-menthe hover:bg-menthe-survol";

/** Le tableau des murs : la recherche, « Tout afficher », l'envoi vers une liste, le tri par colonne, les pages. */
function TableauMurs({ murs, total, filtres, setFiltres, ouvert, onOuvrir, charge, depart = FILTRES_DEPART, fonds = false, bureaux = false, typesParId = null }) {
  const qc = useQueryClient();
  const [tri, setTri] = useState({ cle: "force", sens: -1 });
  const [page, setPage] = useState(0);
  const [coches, setCoches] = useState(() => new Set());
  const [versListe, setVersListe] = useState(false);
  const PAR_PAGE = 50;
  useEffect(() => { setPage(0); }, [filtres, tri]);
  const tries = useMemo(() => {
    const val = (c) => (tri.cle === "force" ? c.force : tri.cle === "commerce" ? (c.titre || "") : tri.cle === "prix" ? (c.prix?.moyenne || 0) : tri.cle === "signaux" ? (bureaux ? c.bureaux?.length || 0 : fonds ? c.fonds?.length || 0 : c.drapeaux.length) : ["ca", "resultat", "occupants"].includes(tri.cle) ? Number(c[tri.cle]) || 0 : tri.cle === "lien" ? (c.lien || "") : (c[tri.cle] || ""));
    return [...murs].sort((a, b) => { const x = val(a), y = val(b); return (typeof x === "number" ? x - y : String(x).localeCompare(String(y), "fr")) * tri.sens; });
  }, [murs, tri]);
  const pages = Math.max(1, Math.ceil(tries.length / PAR_PAGE));
  const vue = tries.slice(page * PAR_PAGE, (page + 1) * PAR_PAGE);
  const cocher = (c) => { if (c.liste) return; setCoches((s) => { const n = new Set(s); if (n.has(c.id)) n.delete(c.id); else n.add(c.id); return n; }); };
  const libres = vue.filter((c) => !c.liste);
  const tousCoches = libres.length > 0 && libres.every((c) => coches.has(c.id));
  // En mode Fonds (3 nov. 2026) : le signal de cession et les chiffres publics, à la place des murs et du prix.
  // Les bureaux (3 nov. 2026) : un immeuble par ligne, ses occupants, son signal, son propriétaire.
  const colonnes = bureaux ? [["commerce", "Immeuble"], ["adresse", "Adresse"], ["occupants", "Occupants"], ["signaux", "Signal"], ["proprietaire", "Propriétaire des murs"], ["appel", "Appel"]]
    : fonds ? [["commerce", "Commerce"], ["adresse", "Adresse"], ["nom", "Exploitant"], ["signaux", "Signal"], ["ca", "Chiffre d'affaires"], ["resultat", "Résultat"], ["appel", "Appel"]]
    : [["commerce", "Commerce"], ["adresse", "Adresse"], ["nom", "Exploitant"], ["proprietaire", "Propriétaire des murs"], ["lien", "Lien"], ["signaux", "Raison de vendre"], ["prix", "Prix pour lui"], ["appel", "Appel"]];
  return (
    // Au dessin du tableau d'une liste (30 oct. 2026, Jules) : la zone à points, la barre (recherche en pilule, chiffres,
    // gestes), puis le tableau à traits continus, les deux premières colonnes fixes, tout en 13,5 px. La raison de vendre
    // prend la couleur des notes de l'IA de l'Analyse (`lu-ia`).
    <section data-zone="murs" className="mt-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex h-8 w-[320px] items-center gap-2 rounded-full bg-relief px-3.5 focus-within:ring-1 focus-within:ring-bord-doux max-md:h-10 max-md:w-full">
          <Search className="h-3.5 w-3.5 flex-none text-ardoise" />
          <input value={filtres.texte} onChange={(e) => setFiltres((f) => ({ ...f, texte: e.target.value }))} placeholder={bureaux ? "Occupant, rue, propriétaire" : "Enseigne, activité, rue, propriétaire"}
            className="w-full border-none bg-transparent text-[13.5px] text-encre outline-none placeholder:text-brume max-md:text-[16px]" />
        </div>
        {JSON.stringify({ ...filtres, emplacement: "partout" }) !== JSON.stringify({ ...depart, types: filtres.types }) && <button type="button" onClick={() => setFiltres((f) => ({ ...depart, types: f.types }))} className={GESTE} style={{ background: "transparent" }}><X className="h-3.5 w-3.5" />Tout afficher</button>}
        <button type="button" onClick={() => setVersListe(true)} disabled={!coches.size} className={coches.size ? GESTE_PLEIN : GESTE} style={coches.size ? undefined : { background: "transparent" }}><ListPlus className="h-3.5 w-3.5" />Envoyer vers une liste{coches.size ? ` (${coches.size})` : ""}</button>
        {coches.size > 0 && <button type="button" onClick={() => setCoches(new Set())} className="text-[13.5px] text-ardoise hover:text-encre" style={{ background: "transparent" }}>Tout décocher</button>}
        <span className="ml-auto text-[13.5px] text-ardoise max-md:ml-0">
          <span className="tabular-nums text-menthe">{tries.length}</span> {bureaux ? `immeuble${tries.length > 1 ? "s" : ""} de bureaux` : fonds ? "fonds" : `mur${tries.length > 1 ? "s" : ""}`}{tries.length !== total ? <> sur <span className="tabular-nums text-encre">{total}</span>{fonds ? " commerces" : ""}</> : null}
          {pages > 1 && <> · {page * PAR_PAGE + 1} à {Math.min(tries.length, (page + 1) * PAR_PAGE)}</>}
        </span>
        {pages > 1 && (
          <span className="flex gap-1">
            <button type="button" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} aria-label="Page précédente" title="Page précédente" className={`${GESTE} w-8 justify-center px-0`} style={{ background: "transparent" }}><ChevronDown className="h-4 w-4 rotate-90" /></button>
            <button type="button" onClick={() => setPage((p) => Math.min(pages - 1, p + 1))} disabled={page >= pages - 1} aria-label="Page suivante" title="Page suivante" className={`${GESTE} w-8 justify-center px-0`} style={{ background: "transparent" }}><ChevronDown className="h-4 w-4 -rotate-90" /></button>
          </span>
        )}
      </div>
      {/* Le cadre a le trait des lignes, sans trait doublé en bas (Jules, 31 oct. 2026, comme le tableau d'une liste). */}
      <div className={`mt-4 overflow-x-auto rounded-[12px] border ${TRAIT} bg-rail`}>
        <table className="min-w-full border-separate border-spacing-0 text-left text-[13.5px] [&_tr>*:last-child]:border-r-0 [&_tbody>tr:last-child>td]:border-b-0">
          <thead>
            <tr>
              <th className={`sticky left-0 z-30 border-b border-r ${TRAIT} bg-rail px-0 h-[35px] py-0`} style={{ width: 44, minWidth: 44, maxWidth: 44 }}>
                <span className="grid place-items-center"><Case bord={TRAIT} oui={tousCoches} disabled={!libres.length} label="Cocher toute la page" onBasculer={() => setCoches((s) => { const n = new Set(s); for (const c of libres) { if (tousCoches) n.delete(c.id); else n.add(c.id); } return n; })} /></span>
              </th>
              {colonnes.map(([cle, mot], i) => (
                <th key={cle} className={`border-b border-r ${TRAIT} bg-rail h-[35px] py-0 text-[12.5px] font-normal text-ardoise ${i === 0 ? "sticky left-[44px] z-30 min-w-[220px] px-2.5 max-md:min-w-[140px]" : "px-2.5 text-center"}`}>
                  <button type="button" onClick={() => setTri((t) => (t.cle === cle ? { cle, sens: -t.sens } : { cle, sens: 1 }))} className="inline-flex items-center gap-1 whitespace-nowrap p-0 text-ardoise hover:text-encre" style={{ background: "transparent" }}>{mot}{tri.cle === cle && <ChevronDown className={`h-3 w-3 ${tri.sens < 0 ? "rotate-180" : ""}`} />}</button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {vue.map((c) => {
              const cellule = `h-[36px] overflow-hidden whitespace-nowrap border-b border-r ${TRAIT} px-2.5 py-0 text-center align-middle text-craie`;
              return (
                <tr key={c.id} onClick={() => onOuvrir(c.id)} className={`group cursor-pointer transition-colors ${ouvert === c.id ? "bg-menthe/[0.05]" : "hover:bg-relief/30"}`}>
                  <td className={`sticky left-0 z-10 border-b border-r ${TRAIT} bg-rail px-0 h-[36px] py-0 align-middle`} style={{ width: 44, minWidth: 44, maxWidth: 44 }} onClick={(e) => e.stopPropagation()}>
                    <span className="grid place-items-center"><Case bord={TRAIT} oui={coches.has(c.id)} onBasculer={() => cocher(c)} label={c.liste ? `Déjà dans la liste « ${c.liste.nom} »` : "Choisir pour une liste"} className={c.liste ? "opacity-35" : ""} /></span>
                  </td>
                  <td className={`sticky left-[44px] z-10 border-b border-r ${TRAIT} bg-rail h-[36px] overflow-hidden whitespace-nowrap py-0 px-2.5 align-middle`}>
                                          <span className="block max-w-[340px] truncate"><span className="text-encre group-hover:text-menthe">{c.titre}</span>{(bureaux ? c.noms?.length : c.activite) && <span className="text-ardoise"> · {bureaux ? c.noms.join(", ") : c.activite}</span>}</span>
                  </td>
                  <td className={`${cellule} max-w-[240px]`}><span className="block truncate">{c.adresse}<span className="text-ardoise"> · {c.ville}</span></span></td>
                  {bureaux ? (<>
                  <td className={`${cellule} tabular-nums`}>{c.occupants || 1}</td>
                  <td className={`${cellule} min-w-[200px]`}>{c.bureaux?.length
                    ? <span className="block truncate text-lu-ia">{c.bureaux.slice(0, 2).map((d) => BUREAUX_COURTS[d] || d).join(" · ")}{c.bureaux.length > 2 ? ` · +${c.bureaux.length - 2}` : ""}</span>
                    : <span className="text-brume">—</span>}</td>
                  <td className={`${cellule} max-w-[240px]`}><span className="block truncate">{c.proprietaire || <span className="text-brume">À trouver</span>}</span></td>
                  </>) : (<>
                  <td className={`${cellule} max-w-[220px]`}><span className="block truncate">{c.exploitant || c.nom || c.titre}</span></td>
                  {fonds ? (<>
                  <td className={`${cellule} min-w-[200px]`}>{c.fonds?.length
                    ? <span className="block truncate text-lu-ia">{c.fonds.slice(0, 2).map((d) => FONDS_COURTS[d] || d).join(" · ")}{c.fonds.length > 2 ? ` · +${c.fonds.length - 2}` : ""}</span>
                    : <span className="text-brume">—</span>}</td>
                  <td className={`${cellule} tabular-nums`}>{c.ca ? montant(c.ca) : <span className="text-brume">—</span>}</td>
                  <td className={`${cellule} tabular-nums ${Number(c.resultat) > 0 ? "text-encre" : "text-ardoise"}`}>{c.resultat ? montant(c.resultat) : <span className="text-brume">—</span>}</td>
                  </>) : (<>
                  <td className={`${cellule} max-w-[240px]`}><span className="block truncate">{c.proprietaire || <span className="text-brume">À trouver</span>}</span></td>
                  <td className={`${cellule}`}>{(LIENS[c.lien]?.mot || "").replace(" (probable)", "") || <span className="text-brume">—</span>}</td>
                  {/* Murs et fonds ensemble : un commerce sans raison de vendre ses murs montre sa raison de céder le fonds. */}
                  <td className={`${cellule} min-w-[200px]`}>{c.drapeaux.length
                    ? <span className="block truncate text-lu-ia">{c.drapeaux.slice(0, 2).map((d) => DRAPEAUX_COURTS[d] || d).join(" · ")}{c.drapeaux.length > 2 ? ` · +${c.drapeaux.length - 2}` : ""}</span>
                    : c.fonds?.length ? <span className="block truncate text-ambre">Fonds : {FONDS_COURTS[c.fonds[0]] || c.fonds[0]}</span>
                    : <span className="text-brume">—</span>}</td>
                  <td className={`${cellule} tabular-nums`}>{c.prix?.moyenne
                    ? <span className={c.dans_budget === false ? "text-brume" : "text-encre"} title={c.prix.au_rendement ? `Le prix qui lui donne ${String(c.prix.au_rendement).replace(".", ",")} % (prix estimé : ${euros(c.prix_estime?.moyenne)})` : `Prix indicatif, entre ${euros(c.prix.basse)} et ${euros(c.prix.haute)}`}>{euros(c.prix.moyenne)}{c.dans_budget === false ? " · hors budget" : ""}</span>
                    : <span className="text-ambre" title="Aucune estimation pour ce local encore : à vérifier avec le propriétaire">Prix à vérifier</span>}</td>
                  </>)}
                  </>)}
                  <td className={`border-b border-r ${TRAIT} h-[36px] whitespace-nowrap px-2.5 py-0 text-center align-middle`}>{c.reponse ? <span className="text-menthe">{REPONSES[c.reponse]?.split(",")[0] || "Appelé"}</span> : c.liste ? <span className="text-ardoise">Liste « {c.liste.nom} »</span> : <span className="text-brume">—</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!tries.length && !charge && <Vide>{bureaux ? "Aucun immeuble de bureaux avec ces filtres." : fonds ? "Aucun fonds avec ces filtres." : "Aucun mur avec ces filtres."}</Vide>}
      </div>
      {versListe && <FenetreListe ids={[...coches]} typesParId={typesParId ? Object.fromEntries([...coches].map((id) => [id, typesParId(id)])) : null} onFermer={() => setVersListe(false)} onFait={() => { setVersListe(false); setCoches(new Set()); qc.invalidateQueries({ queryKey: ["m-prospecter", "points"] }); }} />}
    </section>
  );
}

/** Fonds · Murs · Bureaux (3 nov. 2026, Jules), la pilule des types d'actif, hors du menu Filtrer. */
function SelecteurActif({ actif, onChange }) {
  return (
    <div className="flex h-8 max-md:h-10 items-center gap-0.5 rounded-full border border-bord-doux bg-rail p-0.5" role="tablist" aria-label="Fonds, murs ou bureaux">
      {[["fonds", "Fonds"], ["murs", "Murs"], ["bureaux", "Bureaux"]].map(([k, mot]) => (
        <button key={k} type="button" role="tab" aria-selected={actif === k} onClick={() => onChange(k)}
          className={`h-full rounded-full px-3.5 text-[13.5px] transition-colors ${actif === k ? "bg-relief text-encre" : "text-ardoise hover:text-craie"}`}
          style={actif === k ? undefined : { background: "transparent" }}>{mot}</button>
      ))}
    </div>
  );
}

/**
 * L'interrupteur Mode Libre / Mode Clients (2 nov. 2026, Jules : « pas intuitif pour voir les clients ») : à la place de
 * « Tous les commerces » dans la liste des clients. Libre : tous les commerces du secteur ; Clients : les murs d'un client.
 */
function BasculeMode({ clients, onChange }) {
  return (
    <button type="button" role="switch" aria-checked={clients} onClick={() => onChange(!clients)}
      className="inline-flex h-8 max-md:h-10 items-center gap-3 rounded-full border border-bord-doux bg-rail px-4 text-[13.5px] hover:border-bord-vif">
      <span className={`transition-colors duration-300 ${clients ? "text-ardoise" : "text-encre"}`}>Libre</span>
      <span aria-hidden className={`relative h-[20px] w-[36px] flex-none rounded-full transition-colors duration-300 ${clients ? "bg-menthe" : "bg-relief"}`}>
        <span className={`absolute top-[2px] h-[16px] w-[16px] rounded-full bg-fond shadow-sm transition-all duration-300 ease-out ${clients ? "left-[18px]" : "left-[2px]"}`} />
      </span>
      <span className={`transition-colors duration-300 ${clients ? "text-encre" : "text-ardoise"}`}>Clients</span>
    </button>
  );
}

/**
 * Le choix du client, dans l'en-tête de la carte (25 oct. 2026, Jules) : le nom du client ouvre la liste de ses clients,
 * et on saute directement à n'importe lequel. Un point menthe marque les clients déjà prospectés. « Tous les commerces »
 * n'y est plus : c'est le Mode Libre de l'interrupteur (2 nov. 2026). Sans client, rien à choisir : un simple titre.
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
      {client ? <Avatar d={client} taille="h-10 w-10" /> : <img src="/avatars/commerces.svg" alt="" aria-hidden="true" className="block h-10 w-10 flex-none rounded-full" />}
      <span className="min-w-0 flex-1 text-left">
        <span className="m-0 flex items-center text-[15px] text-encre"><span className="truncate">{client ? client.reference : "Tous les commerces"}</span>{client && <PastilleTest x={client} />}</span>
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
            {clients.map((c, k) => {
              const actif = !tous && k === courant;
              return (
                <li key={c.id} role="option" aria-selected={actif}>
                  <button type="button" onClick={() => { setOuvert(false); onChoisir(k); }} className={`flex w-full items-center gap-3 rounded-[10px] px-3 py-2 text-left ${actif ? "bg-rail-actif" : "hover:bg-rail-actif"}`} style={actif ? undefined : { background: "transparent" }}>
                    <Avatar d={c} taille="h-8 w-8" />
                    <span className="min-w-0 flex-1"><span className="flex min-w-0 items-center text-[14px] text-encre"><span className="truncate">{c.reference}</span><PastilleTest x={c} /></span><span className="block truncate text-[12.5px] text-ardoise">{c.type_commerce || "Tout commerce"} · {budgetDe(c)}</span></span>
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
    <div className="relative z-20 flex-none rounded-[12px] border border-bord-doux bg-rail">
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
            <span className="text-[12.5px] leading-[1.45] text-ardoise">En Mode Clients, seuls les murs du client choisi restent sur la carte.</span>
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
    <div className="relative z-20 flex-none rounded-[12px] border border-bord-doux bg-rail">
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
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-trait px-4 py-3">
        <span className="min-w-0 text-[13.5px]">
          {/* Plus de « n murs pour lui » (3 nov. 2026, Jules) : la carte et le tableau les montrent. */}
          {prospecteLe && <span className="block text-[12px] text-brume">Prospecté le {new Date(prospecteLe).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}</span>}
        </span>
        {/* Déjà prospecté : ses murs sont déjà sur la carte ; le bouton les remet à jour. Sinon, « Prospecter ». */}
        {prospecteLe && actif ? (
          <button type="button" onClick={onProspecter} disabled={charge}
            className="inline-flex h-8 max-md:h-10 flex-none items-center gap-2 rounded-full border border-trait px-4 text-[13.5px] text-craie hover:text-encre disabled:opacity-60" style={{ background: "transparent" }}>
            <RefreshCw className={`h-4 w-4 ${charge ? "animate-spin" : ""}`} /> Mettre à jour
          </button>
        ) : (
          <button type="button" onClick={onProspecter} disabled={actif}
            className="inline-flex h-8 max-md:h-10 flex-none items-center gap-2 rounded-full bg-menthe px-5 text-[13.5px] text-sur-menthe hover:bg-menthe-survol disabled:opacity-60">
            <Radar className="h-4 w-4" /> {actif ? "Sur la carte" : prospecteLe ? "Voir ses murs" : "Prospecter"}
          </button>
        )}
      </div>
      </div>
      </div>
    </div>
  );
}
