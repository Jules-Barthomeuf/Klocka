import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { ArrowLeft, ChevronRight, Plus, Search } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import { J } from "@/design/jetons";
import { BandeauExemples, BoutonFichier, Carte, Frise, LienFichier, PastilleExemple, euros, formDe } from "@/components/mandataire/kit";
import { ColonneDroite, PointNouveau } from "@/components/conversations/DossiersMandataire";
import { FicheDossier, depuisMandataire } from "@/components/conversations/EspaceConversations";
import { MenuEtapesDroite } from "@/components/preanalyse/EtapesDossier";
import ChatDashboard from "@/components/dashboard/ChatDashboard";
import FicheMandataire from "@/components/mandataire/FicheMandataire";
import { retenirBien } from "@/components/mandataire/BiensRecents";
import { DocumentTelephone } from "@/components/mandataire/GenerationDocument";
import ApercuMandat, { FenetreMandatPret } from "@/components/mandataire/ApercuMandat";
import Chargement from "@/components/ui/Chargement";
import { ETAPES_BIEN, bienDe, bienDuProprietaire, regrouperBiens } from "@/lib/biens-mandataire";
import { ApercuAvis } from "@/pages/MandataireEstimation";
import { Detail as DetailMarche, ETAPES_MARCHE } from "@/pages/MandataireMarche";

// Biens (24 oct. 2026, Jules) : tous les biens du mandataire en cartes,
// chacun à son statut (la section « Aujourd'hui » est retirée le même jour). Un bien ouvert se suit comme un
// dossier de l'équipe : ses sept étapes à droite (Contact, Estimation, Mandat,
// Analyse, Mise en marché, Offre, Vente), l'étape en cours mise en avant, les
// autres un clic plus loin. Une étape ne montre que ce bien : son estimation (le chat à
// gauche, l'avis à droite), son mandat, son dossier, sa mise en marché ; pas
// les listes des autres biens. Une étape pas encore faite se commence là.

const CHAT = "/api/mandataire";

export default function MandataireBiens() {
  const [params, setParams] = useSearchParams();
  const queryClient = useQueryClient();
  const estimations = useQuery({ queryKey: ["m-estimations"], queryFn: () => base44.request("GET", "/api/mandataire/estimations") });
  const mandats = useQuery({ queryKey: ["m-mandats"], queryFn: () => base44.request("GET", "/api/mandataire/mandats") });
  const dossiers = useQuery({ queryKey: ["m-dossiers"], queryFn: () => base44.request("GET", "/api/mandataire/dossiers"), refetchInterval: 20_000 });
  const marches = useQuery({ queryKey: ["m-marches"], queryFn: () => base44.request("GET", "/api/mandataire/marches") });
  const proprietaires = useQuery({ queryKey: ["m-proprietaires"], queryFn: () => base44.request("GET", "/api/mandataire/proprietaires") });
  const chargement = estimations.isLoading || mandats.isLoading || dossiers.isLoading || marches.isLoading || proprietaires.isLoading;
  const erreur = estimations.isError || mandats.isError || dossiers.isError || marches.isError || proprietaires.isError;
  const biens = useMemo(() => regrouperBiens({
    estimations: estimations.data?.estimations || [], mandats: mandats.data?.mandats || [],
    dossiers: dossiers.data?.dossiers || [], marches: marches.data?.marches || [], proprietaires: proprietaires.data?.proprietaires || [],
  }), [estimations.data, mandats.data, dossiers.data, marches.data, proprietaires.data]);

  const cle = params.get("bien");
  const nouveau = cle === "nouveau";
  // Un propriétaire « à contacter », ouvert depuis le matin, n'est pas encore dans les cartes : son étape Contact seule.
  const bien = nouveau ? null : bienDe(biens, cle) || bienDuProprietaire(proprietaires.data?.proprietaires || [], cle);
  const etape = ETAPES_BIEN.find((e) => e.id === params.get("etape"))?.id || (bien ? ETAPES_BIEN[bien.etape - 1].id : "estimation");

  // L'adresse ne porte que le bien et l'étape : les écrans d'étape ne lisent plus rien dans l'adresse.
  const aller = (cleBien, id) => setParams(new URLSearchParams({ bien: cleBien, etape: id }));
  const fermer = () => setParams(new URLSearchParams());
  // Une estimation commencée dans « Nouveau bien » : le bien prend son nom dans l'adresse, une fois la liste à jour.
  const surCree = async (type, id) => {
    await queryClient.refetchQueries({ queryKey: [type === "estimation" ? "m-estimations" : "m-mandats"] });
    if (nouveau) aller(`${type}:${id}`, etape);
  };

  if (cle && !nouveau && !bien && chargement) return <Chargement taille="grand" />;
  if (cle && (bien || nouveau)) return <BienOuvert bien={bien} etape={etape} onAller={(id) => aller(bien ? bien.cle : "nouveau", id)} onFermer={fermer} onCree={surCree} types={marches.data?.types_activite || {}} estimations={dossiers.data?.estimations || []} />;
  return <TousLesBiens biens={biens} chargement={chargement} erreur={erreur} onOuvrir={(b) => aller(b.cle, ETAPES_BIEN[b.etape - 1].id)} onNouveau={() => aller("nouveau", "estimation")} />;
}

/** L'arrivée : tous les biens, en cartes, chacun à son statut. « Aujourd'hui » retiré le 24 oct. 2026 (Jules). */
function TousLesBiens({ biens, chargement, erreur, onOuvrir, onNouveau }) {
  const [recherche, setRecherche] = useState("");
  const liste = useMemo(() => {
    const t = recherche.trim().toLowerCase();
    return biens.filter((b) => !t || `${b.titre} ${b.adresse || ""}`.toLowerCase().includes(t));
  }, [biens, recherche]);
  return (
    <div className="mx-auto w-full max-w-[1500px] px-5 py-6 md:px-8 md:py-7">
      <header className="grid items-center gap-4 md:grid-cols-[1fr_auto_1fr] md:gap-6">
        <label className="flex h-11 w-full max-w-[340px] items-center gap-2.5 rounded-full border border-trait px-[18px] text-ardoise max-md:order-2 max-md:max-w-none">
          <Search className="h-4 w-4 flex-none" />
          <input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Rechercher un bien…" aria-label="Rechercher un bien"
            className="min-w-0 flex-1 border-0 bg-transparent text-[15px] text-encre outline-none placeholder:text-brume max-md:text-[16px]" />
        </label>
        <h1 className="m-0 text-center text-[30px] font-medium tracking-[-0.01em] text-encre max-md:order-1 max-md:text-left max-md:text-[26px]">Vos biens</h1>
        <div className="flex max-md:order-3 md:justify-end">
          <button type="button" onClick={onNouveau} className="inline-flex h-11 items-center gap-2 rounded-full bg-encre px-5 text-[14px] font-medium text-fond hover:opacity-90">
            <Plus className="h-3.5 w-3.5" /> Nouveau bien
          </button>
        </div>
      </header>


      {chargement && <Chargement taille="grand" />}
      {erreur && !chargement && <p className="m-0 mt-8 text-[13.5px] text-alerte">Les biens ne se chargent pas. Rechargez la page.</p>}
      {!chargement && !erreur && !biens.length && <p className="m-0 mt-16 text-center text-[14px] text-brume">Aucun bien encore : un propriétaire contacté en devient un, ou commencez par une estimation avec « Nouveau bien ».</p>}
      {!!biens.length && !liste.length && <p className="m-0 mt-10 text-center text-[13.5px] text-brume">Rien ne correspond.</p>}

      <BandeauExemples liste={biens} />
      {!!liste.length && (
        <div className="mt-[26px] grid grid-cols-1 gap-[18px] md:grid-cols-2 xl:grid-cols-3">
          {liste.map((b) => <CarteBien key={b.cle} b={b} onOuvrir={() => onOuvrir(b)} />)}
        </div>
      )}
    </div>
  );
}

/** La carte d'un bien, au dessin de celle d'un dossier : le statut et la date sur la grille de points, le bien, puis les sept étapes en segments. */
function CarteBien({ b, onOuvrir }) {
  const e = ETAPES_BIEN[b.etape - 1];
  const nonLus = b.dossier?.transfere ? b.dossier.fil_non_lus || 0 : 0;
  const ecarte = b.dossier?.statut === "no_go" && !b.marche;
  const prix = b.mandat?.prix || b.dossier?.carte?.prix || b.dossier?.prix || null;
  const fourchette = b.estimation?.rapport?.prix_bas ? `${euros(b.estimation.rapport.prix_bas)} – ${euros(b.estimation.rapport.prix_haut)}` : null;
  const lieu = [b.dossier?.carte?.ville, b.dossier?.carte?.surface_m2 ? `${b.dossier.carte.surface_m2} m²` : null, prix ? euros(prix) : fourchette].filter(Boolean).join(" · ") || b.adresse || "Adresse à compléter";
  return (
    <article className="relative flex cursor-pointer flex-col rounded-[18px] border border-trait bg-rail transition-colors hover:border-bord-doux" onClick={onOuvrir}
      role="button" tabIndex={0} onKeyDown={(ev) => { if (ev.key === "Enter") onOuvrir(); }}>
      <div className="k-grid k-grid-toujours relative h-[112px] flex-none rounded-t-[17px] border-b border-trait">
        <span className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full border border-trait bg-fond px-2.5 py-[5px] text-[12px] text-craie">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: ecarte ? J["alerte"] : J["menthe"] }} />{b.statut || e.label}
        </span>
        <span className="absolute right-4 top-[18px] inline-flex items-center gap-2 text-[12px] tabular-nums text-brume">
          <PointNouveau n={nonLus} />{b.modifie ? new Date(b.modifie).toLocaleDateString("fr-FR") : ""}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-3.5 px-5 pb-5 pt-[18px]">
        <div className="flex min-w-0 flex-col gap-2">
          <p className="m-0 flex min-w-0 items-center text-[17px] font-medium text-encre" title={b.titre}><span className="truncate">{b.titre}</span><PastilleExemple x={b} /></p>
          <p className="m-0 flex min-w-0 flex-wrap items-center gap-2">
            {b.dossier?.transfere && <span className="flex-none rounded-full border border-menthe/40 px-2.5 py-[3px] text-[12px] text-menthe">Chez {b.dossier.analyste_nom || "Klocka"}</span>}
            <span className="truncate text-[13px] text-ardoise">{lieu}</span>
          </p>
        </div>
        <div className="flex flex-col gap-1.5" aria-label={`Étape ${e.n} sur ${ETAPES_BIEN.length} : ${e.label}`}>
          <div className="flex justify-between text-[12px] text-ardoise"><span>Étapes</span><span className="tabular-nums">{e.n} / {ETAPES_BIEN.length}</span></div>
          <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${ETAPES_BIEN.length}, minmax(0, 1fr))` }}>
            {ETAPES_BIEN.map((x) => <span key={x.id} className={`h-1 rounded-full ${b.faites.has(x.id) ? "bg-menthe" : x.n === e.n ? "bg-menthe/45" : "bg-encre/[0.12]"}`} />)}
          </div>
        </div>
      </div>
    </article>
  );
}

/** Un écran assez large pour le chat et le document côte à côte, comme les pages Estimation et Mandat. */
function useEcranLarge() {
  const requete = "(min-width: 1024px)";
  const [large, setLarge] = useState(() => typeof window !== "undefined" && window.matchMedia(requete).matches);
  useEffect(() => {
    const m = window.matchMedia(requete);
    const changer = () => setLarge(m.matches);
    m.addEventListener("change", changer);
    return () => m.removeEventListener("change", changer);
  }, []);
  return large;
}

/**
 * Le titre d'un bien ouvert, un seul (25 oct. 2026, Jules) : « Tous les biens › le nom du bien › l'étape », en fil
 * d'Ariane ; au téléphone il remplace la frise.
 */
function EnTeteBien({ bien, etape, onFermer, className = "" }) {
  return (
    <nav aria-label="Fil d'Ariane" className={`flex min-h-[56px] min-w-0 items-center gap-1.5 text-[13.5px] ${className}`}>
      <button type="button" onClick={onFermer} className="flex flex-none items-center gap-1.5 text-ardoise transition-colors hover:text-encre max-md:min-h-[36px]" style={{ background: "transparent" }}>
        <ArrowLeft className="h-3.5 w-3.5" /> Tous les biens
      </button>
      <ChevronRight className="h-3.5 w-3.5 flex-none text-brume" />
      <span className="min-w-0 truncate text-craie">{bien ? bien.titre : "Nouveau bien"}</span>
      <ChevronRight className="h-3.5 w-3.5 flex-none text-brume" />
      <span className="flex-none text-encre">{ETAPES_BIEN.find((e) => e.id === etape)?.label}</span>
    </nav>
  );
}

/**
 * Un bien ouvert : l'écran de son étape, et ses six étapes à droite (au téléphone, la frise en haut).
 * Estimation et Mandat, sur grand écran, prennent l'écran comme un dossier de l'équipe en mode IA : le chat à
 * gauche (le retour à tous les biens en tête), le document à droite.
 */
function BienOuvert({ bien, etape, onAller, onFermer, onCree, types, estimations }) {
  const queryClient = useQueryClient();
  const valider = useMutation({
    mutationFn: (id) => base44.request("POST", `/api/mandataire/proprietaires/${bien.proprietaire.id}/etape`, { body: { etape: id } }),
    onSuccess: () => ["m-proprietaires", "m-fiche"].forEach((k) => queryClient.invalidateQueries({ queryKey: [k] })),
    onError: (e) => toast.error(e?.message || "Étape non enregistrée"),
  });
  const large = useEcranLarge();
  // Le bien ouvert rejoint les accès rapides sous « Biens » dans le menu.
  useEffect(() => { if (bien?.cle) retenirBien(bien.cle, bien.titre); }, [bien?.cle, bien?.titre]);
  const faites = bien?.faites || new Set();
  const items = ETAPES_BIEN.map((e) => ({ cle: e.id, titre: e.label, n: e.n, faite: faites.has(e.id) }));
  const chat = etape === "estimation" || etape === "mandat";
  const plein = chat && large;
  useEffect(() => {
    if (!plein) return undefined;
    document.documentElement.classList.add("k-sans-defilement", "k-sans-ak");
    window.scrollTo(0, 0);
    return () => document.documentElement.classList.remove("k-sans-defilement", "k-sans-ak");
  }, [plein]);
  const entete = <EnTeteBien bien={bien} etape={etape} onFermer={onFermer} />;
  return (
    <div className="relative w-full">
      {/* Un seul titre et plus de frise (25 oct. 2026, Jules) : l'Estimation et le Mandat portent le titre dans leur colonne de chat. */}
      {!chat && <EnTeteBien bien={bien} etape={etape} onFermer={onFermer} className="px-5 pt-3 md:px-10 md:pr-20" />}
      <div key={etape} className="animate-in fade-in duration-500 ease-out">
        {["rdv", "visite", "prix_accord"].includes(etape) && <EtapeFiche bien={bien} />}
        {etape === "estimation" && <EtapeChat espace="estimation" bien={bien} objet={bien?.estimation} large={large} entete={entete} onFermer={onFermer} onCree={(id) => onCree("estimation", id)} />}
        {etape === "mandat" && <EtapeChat espace="mandat" bien={bien} objet={bien?.mandat} large={large} entete={entete} onFermer={onFermer} onCree={(id) => onCree("mandat", id)} />}
        {etape === "analyse" && <EtapeDossier bien={bien} estimations={estimations} onFermer={onFermer} />}
        {["marche", "offre", "vente"].includes(etape) && <EtapeMarche bien={bien} types={types} />}
      </div>
      {/* Le check à droite d'une étape la valide, avec celles d'avant, comme dans les dossiers de l'équipe : seulement pour
          un bien né d'une fiche de la Prospection (24 oct. 2026). */}
      <MenuEtapesDroite items={items} valeur={etape} onChange={onAller} onValider={bien?.proprietaire ? (n) => valider.mutate(ETAPES_BIEN[n - 1].id) : null} occupe={valider.isPending} telephone />
    </div>
  );
}

const TEXTES = {
  estimation: { api: "/api/mandataire/estimations", cle: "estimation_id", titre: "Commencez l'estimation de ce bien", sous: "Joignez le bail avec « + » : il est lu, seul ce qui manque est demandé.", document: "Voir l'avis de valeur" },
  mandat: { api: "/api/mandataire/mandats", cle: "mandat_id", titre: "Préparez le mandat de ce bien", sous: "Dites le vendeur, le prix et les honoraires : seul ce qui manque est demandé, puis le mandat part dans MyNotary.", document: "Voir le mandat" },
};

/**
 * Estimation ou Mandat d'un bien : sa conversation rouverte d'elle-même et son document à côté ;
 * sans objet encore, le chat qui le commence. Aucune liste : seulement ce bien.
 */
function EtapeChat({ espace, bien, objet, large, entete, onFermer, onCree }) {
  const t = TEXTES[espace];
  const qs = `?espace=${espace}`;
  const queryClient = useQueryClient();
  const [courant, setCourant] = useState(objet?.id || null);
  const [conversation, setConversation] = useState(false);
  const [fenetre, setFenetre] = useState(null);
  // Le chat n'écoute « ouvrir une conversation » que si la page tient un historique : on le lui dit, sans en montrer.
  const sansHistorique = useCallback(() => {}, []);
  // L'objet du bien : sa conversation se rouvre (recréée au besoin par le serveur avec ce qu'on sait déjà).
  useEffect(() => {
    if (!objet?.id) return undefined;
    setCourant(objet.id);
    let fini = false;
    base44.request("POST", `${t.api}/${objet.id}/conversation`)
      .then((r) => { if (!fini) window.dispatchEvent(new CustomEvent("klocka:ouvrir-conversation", { detail: { id: r.conversation_id, api: CHAT, qs } })); })
      .catch((e) => toast.error(e?.message || "Impossible d'ouvrir la conversation"));
    return () => { fini = true; };
  }, [objet?.id, t.api, qs]);
  const rafraichir = () => {
    queryClient.invalidateQueries({ queryKey: [espace === "estimation" ? "m-estimations" : "m-mandats"] });
    queryClient.invalidateQueries({ queryKey: [espace === "estimation" ? "m-apercu" : "m-apercu-mandat"] });
  };
  const nouvelObjet = async (id) => {
    if (!id || id === objet?.id) return;
    setCourant(id);
    // Ce qui naît dans un bien y reste : le mandat garde l'estimation du bien ; une estimation faite après coup
    // se rattache au mandat et au dossier du bien.
    const lier = (url, estimationId) => base44.request("PATCH", url, { body: { estimation_id: estimationId } }).catch(() => {});
    if (espace === "mandat" && bien?.estimation && !objet) await lier(`${t.api}/${id}/estimation`, bien.estimation.id);
    if (espace === "estimation" && !objet) {
      if (bien?.proprietaire) await base44.request("PATCH", `${t.api}/${id}`, { body: { proprietaire_id: bien.proprietaire.id } }).catch(() => {});
      if (bien?.mandat && !bien.mandat.estimation_id) await lier(`/api/mandataire/mandats/${bien.mandat.id}/estimation`, id);
      if (bien?.dossier && !bien.dossier.estimation) await lier(`/api/mandataire/dossiers/${bien.dossier.id}/estimation`, id);
    }
    onCree(id);
  };
  const surReponse = (r) => { rafraichir(); nouvelObjet(r?.[t.cle]); };
  const surRecherche = (r) => { const id = espace === "estimation" ? r?.avis_id : r?.mandat_id; if (id) { rafraichir(); nouvelObjet(id); } };

  const signe = useMutation({
    mutationFn: (f) => base44.request("POST", `${t.api}/${objet.id}/signe`, { body: formDe(f), isForm: true }),
    onSuccess: () => { rafraichir(); toast.success("Mandat signé reçu : Klocka l'inscrit au registre"); },
    onError: (e) => toast.error(e?.message || "Impossible"),
  });
  const mandat = espace === "mandat" ? objet : null;
  const gestesMandat = mandat && (mandat.statut === "pret" || mandat.document_signe) ? (
    <div className="flex flex-wrap items-center gap-3 pb-3">
      {mandat.statut === "pret" && <BoutonFichier principal mot="Déposer le mandat signé" onFichier={(f) => signe.mutate(f)} enCours={signe.isPending} accept=".pdf,image/*" />}
      {mandat.document_signe && <LienFichier f={{ ...mandat.document_signe, nom: "Mandat signé" }} />}
    </div>
  ) : null;
  const document = espace === "estimation"
    // Dans un bien, la barre ne dit pas « n informations encore attendues · vos retouches sont gardées » (24 oct. 2026, Jules).
    ? <ApercuAvis id={courant} sansStatut />
    : <ApercuMandat id={courant} onOuvrirPret={setFenetre} />;
  const mandatFenetre = fenetre && mandat?.id === fenetre ? mandat : null;

  const colonne = (
    <div className={large ? "k-colonne-chat flex h-[100dvh] min-h-0 min-w-0 flex-col px-5" : "flex flex-col px-5"}>
      {(!conversation || !large) && entete}
      {!conversation && (
        <div className={large ? "flex min-h-0 flex-1 flex-col justify-center gap-2 overflow-y-auto py-6 text-center" : "pb-6 pt-4 text-center"}>
          <h1 className="k-balayage m-0 font-normal leading-[1.15] tracking-[-0.02em] text-encre" style={{ fontSize: "clamp(22px, 2.1vw, 28px)" }}>{objet ? bien?.titre : t.titre}</h1>
          <p className="m-0 text-[14px] text-ardoise">{objet ? "Sa conversation se rouvre…" : t.sous}</p>
        </div>
      )}
      {gestesMandat}
      <div className={conversation ? (large ? "min-h-0 w-full flex-1" : "w-full") : "w-full flex-none pb-5"}>
        <ChatDashboard espace={espace} onConversation={setConversation} onHistorique={sansHistorique} onReponse={surReponse} onRecherche={surRecherche}
          menusVersLeHaut avisACote={espace === "estimation" && large} barreApercu={large && conversation} retour={{ libelle: "Tous les biens", onClick: onFermer }} />
      </div>
    </div>
  );
  return (
    <>
      {large ? (
        // Les classes de l'Analyse de l'équipe en mode IA : le fond choisi passe sous le chat et sous le document,
        // séparés par une fine ligne (index.css, « k-bien-ia »).
        <div className="k-page-presentation k-dossier-ia k-bien-ia grid h-[100dvh] grid-cols-[minmax(360px,440px)_minmax(0,1fr)] overflow-hidden">
          {colonne}
          <div className="k-apercu-bien min-h-0 min-w-0">{document}</div>
        </div>
      ) : (
        <>
          {colonne}
          {courant && <DocumentTelephone libelle={t.document}>{document}</DocumentTelephone>}
        </>
      )}
      {espace === "mandat" && <FenetreMandatPret mandat={mandatFenetre} onFermer={() => setFenetre(null)} />}
    </>
  );
}

/** L'Analyse d'un bien : son dossier seul (pièces, photos, envoi à l'analyste, conversation), sans les onglets des autres. */
function EtapeDossier({ bien, estimations, onFermer }) {
  const c = useMemo(() => (bien?.dossier ? depuisMandataire(bien.dossier) : null), [bien?.dossier]);
  const [mode, setMode] = useState(() => (c?.transfere && c.non_lus > 0 ? "conversation" : "pieces"));
  if (!c) return <PasEncore texte="Le dossier s'ouvre seul quand le mandat est signé : pièces, photos, puis l'envoi à un analyste Klocka pour son go." />;
  return (
    <div className="px-5 pb-8 pt-3 md:px-8 md:pr-20">
      <div className="flex min-h-[560px] overflow-hidden rounded-[16px] border border-bord-doux bg-rail max-lg:flex-col">
        <FicheDossier key={c.id} c={c} cote="mandataire" estimations={estimations} onSupprime={onFermer}
          droite={<ColonneDroite c={c} mode={mode} onMode={setMode} />} />
      </div>
    </div>
  );
}

/** Mise en marché, Offre et Vente d'un bien : sa mise en marché seule, ouverte (dossier investisseur, vidéo, offres, suivi jusqu'à l'acte). */
function EtapeMarche({ bien, types }) {
  const queryClient = useQueryClient();
  const m = bien?.marche;
  if (!m) return <PasEncore texte="Le bien part en mise en marché au go de l'analyste : le dossier investisseur, la vidéo, puis les offres et la vente se suivent ici." />;
  return (
    <div className="mx-auto max-w-[900px] px-5 pb-16 pt-3 md:px-8">
      <Carte actif>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="m-0 text-[15.5px] text-encre">{m.bien}<PastilleExemple x={m} /></p>
          <span className="text-[12.5px] text-ardoise">{(m.activite || []).length} signe{(m.activite || []).length > 1 ? "s" : ""} d'intérêt · {(m.offres || []).length} offre{(m.offres || []).length > 1 ? "s" : ""}</span>
        </div>
        <div className="mt-3"><Frise etapes={ETAPES_MARCHE} statut={m.statut} /></div>
      </Carte>
      <DetailMarche m={m} types={types} rafraichir={() => queryClient.invalidateQueries({ queryKey: ["m-marches"] })} />
    </div>
  );
}

const PasEncore = ({ texte }) => <p className="m-0 mx-auto max-w-[56ch] px-5 py-20 text-center text-[14px] leading-[1.6] text-brume">{texte}</p>;

/**
 * Rendez-vous fixé, Visité, Prix d'accord : la fiche du bien sur une page, et sa dictée (24 oct. 2026). Un bien qui
 * n'est pas né d'une fiche de la Prospection n'en a pas.
 */
function EtapeFiche({ bien }) {
  if (!bien?.proprietaire) return <PasEncore texte="Ce bien n'est pas né d'une fiche de la Prospection : il commence à l'estimation." />;
  return (
    <div className="mx-auto max-w-[820px] px-5 pb-16 pt-3 md:px-8">
      <div className="k-grid rounded-[18px] border border-trait"><FicheMandataire id={bien.proprietaire.id} /></div>
    </div>
  );
}
