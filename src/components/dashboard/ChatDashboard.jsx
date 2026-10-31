import React, { useEffect, useRef, useState } from "react";
import { apercuDuFichier, genreDeFichier, pieceDuTexte } from "@/lib/apercu-fichier";
import { PointsEnCours, PointFait } from "@/components/ui/PointsEtape";
import { iconeEtape } from "@/lib/icone-etape";
import { motion } from "framer-motion";
import PiecesBrouillon, { brouillonDepuis, envoiDepuis } from "@/components/mails/PiecesBrouillon";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useDictee } from "@/lib/dictee";
import { demanderNotifications } from "@/lib/notifications";
import SkillsChat from "@/components/dashboard/SkillsChat";
import ChoixDossier from "@/components/haka/ChoixDossier";
import { BasculeSortie, BoutonSources, Depliant } from "@/components/haka/ReglagesDemande";
import { sourceDe } from "@/lib/sources";
import { avis, poser, toast } from "@/components/ui/avis";
import { ArrowLeftRight, ArrowRight, ArrowUp, Bell, Check, ChevronDown, ChevronLeft, Copy, FileSignature, FileText, History, Lightbulb, Loader2, Mail, MessageCircle, Mic, Paperclip, Pencil, Phone, Plus, Search, Send, SlidersHorizontal, Sparkles, Square, Trash2, User, X } from "lucide-react";
import BoiteSaisie, { BoutonBarre } from "@/components/BoiteSaisie";
import BarreEcoute, { useAuraPosee } from "@/components/haka/BarreEcoute";
import { ListeRelances } from "./RelancesEnAttente";
import { SuggestionsMail } from "@/components/preanalyse/gabaritsMail";
import { telLisible } from "@/components/dashboard/CeQuiVousAttend";
import PenseeIA from "@/components/PenseeIA";
import AvatarAK from "@/components/AvatarAK";
import { usePersonnalisation } from "@/components/providers/PersonnalisationProvider";
import Message from "@/components/MessageIA";
import SourcesLoi from "@/components/offres/SourcesLoi";
import { J, alpha } from "@/design/jetons";
import { CarteCriteres, FenetreMulticriteres } from "@/components/mandataire/ProspecterDataB";
import Chargement from "@/components/ui/Chargement";
import { lienCrm } from "@/lib/crm";

// Les modes du chat : on choisit d'abord ce qu'on apporte, puis on écrit.
// Sans mode, la boîte fait le tri elle-même.
// Les commandes que le bouton « Cmd » propose : un clic les écrit, il reste à
// remplacer ce qui est entre crochets.
const COMMANDES = [
  { texte: "J'ai eu [prénom] de [agence], il me rappelle [jour] pour [bien]", mode: "note" },
  { texte: "Crée un dossier depuis cette fiche : [collez le mail de l'agent]", mode: "fiche" },
  { texte: "Prépare un mail de relance à [email de l'agent] pour [adresse du bien]", mode: "mail" },
  { texte: "Rappelle-moi dans 3 jours de relancer Monsieur Lardeux au 06 12 34 56 78", mode: "rappel" },
  { texte: "Qu'est-ce qui attend ?", mode: "question" },
  { texte: "Où en est le dossier [ville ou adresse] ?", mode: "question" },
];

const MODES = [
  { id: "note", label: "Note d'appel", icone: Phone, type: "note", placeholder: "J'ai eu Marc de l'agence X, il me rappelle jeudi…" },
  { id: "fiche", label: "Fiche d'agent", icone: FileText, type: "fiche", placeholder: "Collez le mail ou l'annonce de l'agent : le dossier naît, nommé et analysé." },
  { id: "mail", label: "Mail", icone: Mail, type: "assistant", placeholder: "Décrivez le mail à écrire, ou choisissez un mail type et remplacez les valeurs entre crochets…" },
  { id: "client", label: "Client", icone: User, type: "client", placeholder: "Collez le compte rendu de l'appel de découverte : la fiche client est à valider ensuite." },
  { id: "question", label: "Question", icone: MessageCircle, type: "assistant", placeholder: "Une question, un ordre : dossiers, mails, Twenty CRM, simulation…" },
  { id: "rappel", label: "Rappel", icone: Bell, type: "rappel", placeholder: "Ce que vous voulez, en disant quand : « dans 3 jours, relancer Monsieur Lardeux au 06… »" },
];

// Le même chat pour le mandataire K Partners : les mêmes gestes, ses mots
// à lui. Il parle de propriétaires et de commerces, pas d'agents ni de
// dossiers ; tout passe par l'agent du mandataire (/api/mandataire/chat).
// Chaque mode porte son instruction : choisi, elle devient le texte du champ,
// pour qu'on sache exactement quoi donner.
const MODES_MANDATAIRE = [
  { id: "note", label: "Note d'appel", icone: Phone, type: "assistant", placeholder: "Racontez l'appel : « Pas de réponse pour le commerce à Mâcon », « Il est intéressé, RDV jeudi 14 h »…" },
  { id: "contact", label: "Nouveau contact", icone: User, type: "assistant", placeholder: "Nouveau contact : M. Durand, propriétaire de la pharmacie cours Vitton, 06…" },
  { id: "estimation", label: "Estimation", icone: FileText, type: "assistant", placeholder: "Déposez le PDF ou la photo du bail (le +), nommez le commerce et son adresse : « Estime la boulangerie Martin, 12 rue Carnot ». Sans bail : donnez le loyer annuel, la surface et l'état." },
  { id: "mandat", label: "Mandat", icone: FileSignature, type: "assistant", placeholder: "Demandez le mandat : vendeur, bien, prix net vendeur, honoraires — « Mandat exclusif pour la boulangerie Martin, 450 000 €, 5 % acquéreur, 12 mois »." },
  { id: "mail", label: "Mail", icone: Mail, type: "assistant", placeholder: "Décrivez le mail à écrire au propriétaire : je prépare le brouillon, vous l'envoyez." },
  { id: "question", label: "Question", icone: MessageCircle, type: "assistant", placeholder: "Posez votre question : ce que cherchent les clients, un avis de marché, vos relances…" },
  { id: "rappel", label: "Rappel", icone: Bell, type: "assistant", placeholder: "Dites quoi et quand : « dans 3 jours, rappeler le tabac de Mâcon »" },
];
const COMMANDES_MANDATAIRE = [
  { texte: "Pas de réponse pour [commerce ou propriétaire]", mode: "note" },
  { texte: "Il est intéressé, RDV [jour] [heure] avec [propriétaire]", mode: "note" },
  { texte: "Pas vendeur, rappelle-le dans 6 mois : [commerce]", mode: "note" },
  { texte: "Nouveau contact : [nom], propriétaire de [commerce] à [ville], [téléphone]", mode: "contact" },
  { texte: "Qu'est-ce que cherchent les clients à [ville] ?", mode: "question" },
  { texte: "Combien vaut le local [adresse] ?", mode: "question" },
  { texte: "Estime [commerce] : loyer [montant] €/an, [surface] m²", mode: "question" },
];

// La prospection du mandataire : le même chat, où chaque phrase lance une
// recherche de commerces dans son secteur. Le résultat part à la page (liste
// et carte), le fil garde ce qu'on a cherché.
// L'estimation, deux façons : le bail lu puis les seules questions qui
// manquent, ou rien qu'une dictée et des champs à compléter dans l'éditeur.
const MODES_ESTIMATION = [
  { id: "document", label: "Avec le bail", icone: FileText, type: "assistant", placeholder: "Joignez le bail avec +, dites ce que vous savez du bien, puis « fais l'estimation »" },
  { id: "sans_document", label: "Sans document", icone: Mic, type: "assistant", placeholder: "Dites tout ce que vous savez : le bien, l'adresse, la surface, le loyer, le locataire… le reste se complète à la main" },
];
const MODES_PROSPECTION = [
  { id: "libre", label: "Recherche libre", icone: Search, type: "assistant", placeholder: "« Les boulangeries en emplacement n°1 à Mâcon »" },
  { id: "client", label: "Pour un client", icone: User, type: "assistant", placeholder: "« Pour le client B », ou « pour le client A à Mâcon »" },
];
const COMMANDES_PROSPECTION = [
  { texte: "Les boulangeries en emplacement n°1 à [ville]", mode: "libre" },
  { texte: "Les pharmacies de mon secteur", mode: "libre" },
  { texte: "Les locaux vides en emplacement n°2", mode: "libre" },
  { texte: "Pour le client [lettre]", mode: "client" },
];

// Un espace, c'est une adresse d'API et ce que la barre propose. Le design et
// les gestes sont les mêmes : un seul composant, pas deux chats à tenir.
const ESPACES = {
  // La boîte d'envoi sort du chat (16 oct. 2026, Jules) : les boîtes connectées se voient en haut à droite.
  admin: { api: "/api/assistant", modes: MODES, commandes: COMMANDES, fichier: true, boiteEnvoi: false, avis: "dashboard", mailsTypes: true },
  mandataire: { api: "/api/mandataire", modes: MODES_MANDATAIRE, commandes: COMMANDES_MANDATAIRE, fichier: true, boiteEnvoi: false, avis: null, mailsTypes: false },
  // Le chat du mandataire en bas d'une prospection ouverte : le même agent,
  // sans modes ni commandes, rangé dans l'historique de la Prospection.
  // Les suggestions de l'affinage : un clic les pose dans le champ, prêtes à corriger.
  affinage: { api: "/api/mandataire", qs: "?espace=affinage", modesAGauche: true, modes: [], suggestionsAGauche: true, commandes: [
    { texte: "Trouve aussi les assurances" },
    { texte: "Enlève les boulangeries" },
    { texte: "Seulement en emplacement n°1" },
    { texte: "Tous les emplacements" },
    { texte: "Combien de commerces dans la liste ?" },
    { texte: "Pourquoi la liste est vide ?" },
  ], fichier: false, boiteEnvoi: false, avis: null, mailsTypes: false, placeholder: "Affinez : « trouve aussi les assurances », « seulement en n°1 »…" },
  // L'estimation : le questionnaire de l'avis de valeur, un bail joint en « + ».
  estimation: { api: "/api/mandataire", qs: "?espace=estimation", modesAGauche: true, modeParDefaut: "document", modes: MODES_ESTIMATION, commandes: [], fichier: true, boiteEnvoi: false, avis: null, mailsTypes: false, placeholder: "Quel bien estimez-vous ? « Les murs de la boulangerie, 14 rue du Marché à Annecy, occupés »" },
  // Le mandat : les questions du mandat de vente, l'aperçu à côté, puis MyNotary.
  mandat: { api: "/api/mandataire", qs: "?espace=mandat", modesAGauche: false, modes: [], commandes: [], fichier: true, boiteEnvoi: false, avis: null, mailsTypes: false, placeholder: "Quel mandat préparez-vous ? « Mandat exclusif pour les murs de la boulangerie Martin, 12 rue Carnot à Mâcon, 450 000 € »" },
  // L'emailing (équipe) : le chat d'AK conçoit et réécrit les séquences d'emails.
  // L'atelier des newsletters (9 oct. 2026) : le chat en colonne à gauche, la newsletter à droite.
  newsletter: { api: "/api/assistant", page: "emailing", modesAGauche: true, modes: [], commandes: [], fichier: false, boiteEnvoi: false, avis: "dashboard", mailsTypes: false, placeholder: "Quelle newsletter ? « Pour les inscrits du webinaire du 12 oct. : un mail tous les 14 jours, de la valeur, le simulateur en appel à l'action »" },
  sequence: { api: "/api/assistant", page: "emailing", modesAGauche: true, modes: [], commandes: [], fichier: false, boiteEnvoi: false, avis: "dashboard", mailsTypes: false, placeholder: "Quelle séquence ? « Après notre webinaire du 12 oct. sur les murs commerciaux : amener les inscrits jusqu'à un appel découverte » " },
  // Les offres (équipe) : le chat d'AK, qui rédige et corrige les lettres
  // d'intention de la page Offres ; la lettre ouverte lui est donnée.
  offre: { api: "/api/assistant", page: "offres", modesAGauche: true, modes: [], commandes: [], fichier: true, boiteEnvoi: false, avis: "dashboard", mailsTypes: false, placeholder: "Pour qui, sur quel bien ? « Fais l'offre d'Olivier Luccioni sur le dossier du 1 avenue Mirabeau, 200 000 €, apport 40 000 € »" },
  // Les présentations bancaires (équipe, 12 oct. 2026) : le chat d'AK crée la
  // présentation d'un projet et retouche celle ouverte à droite.
  presentation: { api: "/api/assistant", page: "presentations", modesAGauche: true, modes: [], commandes: [], fichier: false, boiteEnvoi: false, avis: "dashboard", mailsTypes: false, placeholder: "Quel projet ? « Fais la présentation bancaire du projet de Dieppe, à l'attention du Crédit Agricole »" },
  // Un dossier ouvert (équipe, 17 oct. 2026) : AK à gauche, le dossier à droite, à toutes les étapes.
  dossier: { api: "/api/assistant", page: "dossiers", modesAGauche: true, modes: [], commandes: [], fichier: true, boiteEnvoi: false, avis: "dashboard", mailsTypes: false, placeholder: "Une question sur ce dossier ? « Qu'est-ce qui manque ? », « Le loyer est de 24 000 € HT »" },
  // L'éditeur de projet (équipe, 14 oct. 2026) : le chat d'AK retouche les chiffres du projet ouvert à droite, avec leurs sources.
  projet: { api: "/api/assistant", page: "projets", modesAGauche: true, modes: [], commandes: [], fichier: true, boiteEnvoi: false, avis: "dashboard", mailsTypes: false, placeholder: "Que corriger ? « Le loyer est trop bas, va chercher des chiffres plus cohérents »" },
  // La présentation vue du client (16 oct. 2026, Jules : « le même design que la partie admin ») : le même chat,
  // sur sa route à lui ; AK n'y touche qu'à la présentation ouverte à droite.
  presentation_client: { api: "/api/client/ak", client: true, modesAGauche: true, modes: [], commandes: [], fichier: false, boiteEnvoi: false, avis: null, mailsTypes: false, placeholder: "Que voulez-vous changer ? « Raccourcissez le texte de la couverture », « mettez le titre plus simplement »…" },
  prospection: { api: "/api/mandataire", qs: "?espace=prospection", modesAGauche: true, modeParDefaut: "libre", modes: MODES_PROSPECTION, commandes: COMMANDES_PROSPECTION, fichier: false, boiteEnvoi: false, avis: null, mailsTypes: false, placeholder: "Quelle zone prospectez-vous ? « Mâcon », « la rue Carnot », « les boulangeries indépendantes à Charnay »" },
};

// Le chat du tableau de bord : une seule zone, on y met ce qu'on veut, il
// fait le tri — et le nécessaire.
//
//   Une note en raccrochant  → la fiche de l'agent (prénom, date, remarques,
//                              relance), le dossier si un bien est décrit.
//   Le mail ou la fiche d'un agent → le dossier naît, nommé, analysé, avec
//                              les clients qui correspondent.
//   Un compte rendu de découverte → la fiche client à valider d'un clic :
//                              Monday, compte Klocka, lien d'invitation.
//   Une question, un ordre   → l'assistant.
//   « Qu'est-ce qui attend ? » → les cartes : sans réponse, rien parti.


const CHAMPS = [
  ["prenom", "Prénom"], ["nom", "Nom"], ["email", "E-mail"], ["telephone", "Téléphone"],
  ["fonction", "Fonction"], ["localisation", "Localisation"], ["lieu_recherche", "Lieu de recherche"],
  ["budget", "Budget", "€"], ["fonds_propres", "Fonds propres", "€"], ["revenu", "Revenu annuel", "€"],
  ["epargne_annuelle", "Épargne annuelle", "€"], ["duree_emprunt", "Durée d'emprunt", "ans"],
  ["objectif", "Objectif"], ["profil_investisseur", "Profil Klocka"], ["statut", "Statut client"],
  ["source", "Source"], ["mandat_signe", "Mandat signé"], ["patrimoine", "Patrimoine"], ["information", "Information"],
];

const euros = (n) => (typeof n === "number" ? `${Math.round(n).toLocaleString("fr-FR")} €` : null);
const dateCourte = (iso) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : "");
const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? "s" : ""}`;
const INTENTIONS_LIBELLES = { demande_documents: "la demande de documents", relance: "la relance", presentation_client: "la présentation client", refus: "le refus", abandon: "l'abandon" };

// La boîte qui envoie, en pilule sous le champ : l'adresse par défaut, et
// les autres d'un clic quand il y en a plusieurs. Rien de plus ici : les
// boîtes s'ajoutent et se retirent dans la pilule en haut à droite.
function BoiteEnvoi({ versLeHaut = false }) {
  const queryClient = useQueryClient();
  const [ouvert, setOuvert] = useState(false);
  const { data: statut } = useQuery({ queryKey: ["mail-status"], queryFn: () => base44.functions.invoke("getMailStatus", {}) });
  const comptes = (statut?.accounts || []).filter((c) => c.peut_envoyer !== false);
  const principale = comptes.find((c) => c.par_defaut) || comptes[0];
  const defaut = useMutation({
    mutationFn: (email) => base44.functions.invoke("setDefaultMailAccount", { email }),
    onSuccess: (r) => { if (r?.success) { queryClient.invalidateQueries({ queryKey: ["mail-status"] }); setOuvert(false); } else toast.error(r?.error || "Impossible de changer de boîte"); },
  });
  if (!principale) return null;
  return (
    <div className="relative min-w-0">
      <button type="button" onClick={() => comptes.length > 1 && setOuvert((v) => !v)} aria-haspopup={comptes.length > 1 ? "menu" : undefined} aria-expanded={ouvert} title={`Les mails partent de ${principale.email}`}
        className="inline-flex max-w-[260px] items-center gap-1.5 rounded-full px-3 py-1.5 text-[13.5px] text-craie max-md:max-w-[180px]" style={{ background: J["barre-relief"] }}>
        <Mail className="h-3.5 w-3.5 flex-none text-ardoise" />
        <span className="truncate">{principale.email}</span>
        {comptes.length > 1 && <ChevronDown className="h-3.5 w-3.5 flex-none text-ardoise" />}
      </button>
      {ouvert && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOuvert(false)} />
          <div role="menu" className={`animate-in fade-in duration-150 absolute left-0 z-20 max-h-[60vh] min-w-[280px] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-[14px] border border-trait p-1.5 shadow-[0_18px_40px_rgb(0_0_0/0.14)] ${versLeHaut ? "bottom-full mb-2 slide-in-from-bottom-1" : "top-full mt-2 slide-in-from-top-1"}`} style={{ background: J["barre"] }}>
            {comptes.map((c) => (
              <button key={c.email} role="menuitem" type="button" onClick={() => defaut.mutate(c.email)} disabled={defaut.isPending}
                className="flex w-full items-center gap-3 rounded-[10px] px-3 py-2 text-left text-[14px] text-craie transition-colors hover:bg-encre/[0.05] hover:text-encre" style={{ background: "transparent" }}>
                {c.par_defaut ? <Check className="h-4 w-4 flex-none text-menthe" /> : <span className="h-4 w-4 flex-none" />}
                <span className="truncate">{c.email}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// Les suggestions sous le composeur (maquette) : ce qui est dû aujourd'hui
// ou en retard d'abord, puis trois gestes courants. Un clic remplit le champ,
// ou ouvre le dossier quand la ligne en a un.
function Suggestions({ onChoisir, espace = "admin" }) {
  const navigate = useNavigate();
  const mandataire = espace === "mandataire";
  const prospection = espace === "prospection";
  const { data } = useQuery({
    queryKey: prospection ? ["mandataire-prospections"] : mandataire ? ["mandataire-jour"] : ["ce-qui-attend"],
    queryFn: () => base44.request("GET", prospection ? "/api/mandataire/prospections" : mandataire ? "/api/mandataire/jour" : "/api/assistant/attend"),
    // Le client n'a pas « ce qui attend » de l'équipe (16 oct. 2026).
    enabled: espace !== "presentation_client",
    staleTime: 30 * 1000,
  });
  const { data: demandes } = useQuery({
    queryKey: ["mandataire-demandes"],
    queryFn: () => base44.request("GET", "/api/mandataire/demandes"),
    enabled: prospection,
    staleTime: 60 * 1000,
  });
  if (prospection) {
    const chips = [
      ...(data?.prospections || []).slice(0, 3).map((p) => ({ cle: p.id, mot: p.nom, teinte: J["menthe"], faire: () => onChoisir(p.nom, "libre", true) })),
      ...(demandes?.demandes || []).filter((d) => d.commerces_du_secteur > 0).slice(0, 2).map((d) => ({
        cle: d.id, mot: `Pour ${d.reference}`, teinte: J["ambre"], faire: () => onChoisir(`Pour ${d.reference}`, "client", true),
      })),
    ];
    return chips.length ? <Pastilles chips={chips} /> : null;
  }
  if (mandataire) {
    // Les modes, pas des gestes tout faits : on en choisit un, le champ dit
    // alors exactement quoi donner (le placeholder est l'instruction).
    return null;
  }
  // Tableau de bord admin : pas de pastilles pour l'instant (les gestes
  // proposés ne collaient pas au métier). À reprendre : rappels et gestes courants.
  return null;
}

function Pastilles({ chips }) {
  return (
    <div className="mt-4 flex flex-wrap justify-center gap-2">
      {chips.map((c) => (
        <button key={c.cle} type="button" onClick={c.faire} className="inline-flex items-center gap-2 rounded-full border border-trait bg-surface-pleine px-3.5 py-1.5 text-[13.5px] text-encre shadow-[0_2px_8px_rgb(0_0_0/0.04)] transition-colors hover:border-bord-doux">
          <span className="h-[7px] w-[7px] flex-none rounded-full" style={{ background: c.teinte }} />
          {c.mot}
        </button>
      ))}
    </div>
  );
}

/** « à l'instant », « il y a 50 min », « il y a 3 h », « il y a 1 jour », « il y a 2 jours ». */
export const ilYa = (iso) => {
  const s = Math.max(0, (Date.now() - Date.parse(iso || 0)) / 1000);
  if (!Number.isFinite(s)) return "";
  if (s < 60) return "à l'instant";
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
  const j = Math.floor(s / 86400);
  if (j < 31) return `il y a ${j} jour${j > 1 ? "s" : ""}`;
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
};

/**
 * L'historique en grande colonne, à la place de « Ce qui vous attend » et
 * « Reprendre » : le titre, le temps écoulé, renommer, supprimer. Un clic
 * rouvre la conversation dans le chat (par un évènement : le chat est plus haut).
 */
export function HistoriqueColonne({ espace = "admin" }) {
  const E = ESPACES[espace] || ESPACES.admin;
  const qs = E.qs || "";
  const queryClient = useQueryClient();
  const cle = ["assistant-conversations", E.api, qs];
  const { data, isLoading } = useQuery({ queryKey: cle, queryFn: () => base44.request("GET", `${E.api}/conversations${qs}`) });
  const [edition, setEdition] = useState(null);
  const [titre, setTitre] = useState("");
  const conversations = data?.conversations || [];
  const rafraichir = () => queryClient.invalidateQueries({ queryKey: cle });
  const renommer = (id) => {
    const t = titre.trim();
    setEdition(null);
    if (!t) return;
    base44.request("PATCH", `${E.api}/conversations/${id}${qs}`, { body: { titre: t } }).then(rafraichir).catch((e) => toast.error(e?.message || "Impossible de renommer"));
  };
  const supprimer = (c) => {
    if (!window.confirm(`Supprimer « ${c.titre} » ?`)) return;
    base44.request("DELETE", `${E.api}/conversations/${c.id}${qs}`).then(rafraichir).catch((e) => toast.error(e?.message || "Suppression impossible"));
  };
  const ouvrir = (c) => window.dispatchEvent(new CustomEvent("klocka:ouvrir-conversation", { detail: { id: c.id, api: E.api, qs } }));

  return (
    <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="mx-auto max-w-[880px]">
      <div className="mb-1 border-b border-bord pb-2.5">
        <p className="m-0 text-[13.5px] text-craie">Historique{conversations.length ? <span className="text-brume"> · {conversations.length}</span> : null}</p>
      </div>
      {isLoading && <Chargement taille="petit" />}
      {!isLoading && !conversations.length && <p className="m-0 py-3 text-[13.5px] text-brume">Rien encore : chaque échange avec l'assistant se range ici, et se rouvre d'un clic.</p>}
      {conversations.map((c) => (
        <div key={c.id} className="group flex items-center gap-4 border-t border-trait py-3 first:border-t-0">
          {edition === c.id ? (
            <form className="flex min-w-0 flex-1 items-center gap-2" onSubmit={(e) => { e.preventDefault(); renommer(c.id); }}>
              <input autoFocus value={titre} onChange={(e) => setTitre(e.target.value)} onBlur={() => renommer(c.id)} onKeyDown={(e) => { if (e.key === "Escape") setEdition(null); }}
                className="min-w-0 flex-1 rounded-champ border border-menthe bg-surface px-3 py-1.5 text-[14.5px] text-encre outline-none" />
            </form>
          ) : (
            <button type="button" onClick={() => ouvrir(c)} className="min-w-0 flex-1 text-left" style={{ background: "transparent" }}>
              <span className="block truncate text-[14.5px] leading-[1.45] text-encre">{c.titre}</span>
              <span className="mt-0.5 block text-[13px] text-ardoise">{c.nb} message{c.nb > 1 ? "s" : ""}</span>
            </button>
          )}
          <span className="flex-none text-[13px] tabular-nums text-brume">{ilYa(c.maj_le)}</span>
          <button type="button" onClick={() => { setEdition(c.id); setTitre(c.titre); }} aria-label={`Renommer « ${c.titre} »`} title="Renommer"
            className="inline-flex flex-none items-center gap-1.5 text-[12.5px] text-ardoise transition-colors hover:text-encre" style={{ background: "transparent" }}>
            <Pencil className="h-3.5 w-3.5" /> <span className="max-md:hidden">Renommer</span>
          </button>
          <button type="button" onClick={() => supprimer(c)} aria-label={`Supprimer « ${c.titre} »`} title="Supprimer"
            className="flex-none text-brume opacity-0 transition-opacity hover:text-alerte group-hover:opacity-100 max-md:opacity-100" style={{ background: "transparent" }}>
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </motion.section>
  );
}

// L'historique : les conversations passées, qu'on rouvre et qu'on continue.
const quandConversation = (iso) => {
  const s = Math.max(0, (Date.now() - Date.parse(iso || 0)) / 1000);
  if (!Number.isFinite(s)) return "";
  if (s < 3600) return `il y a ${Math.max(1, Math.floor(s / 60))} min`;
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
  const j = Math.floor(s / 86400);
  return j === 1 ? "hier" : j < 30 ? `il y a ${j} j` : new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
};

function HistoriqueConversations({ actuelle, onOuvrir, onNouvelle, api = "/api/assistant", qs = "" }) {
  const queryClient = useQueryClient();
  const cle = ["assistant-conversations", api, qs];
  const { data, isLoading } = useQuery({ queryKey: cle, queryFn: () => base44.request("GET", `${api}/conversations${qs}`) });
  const conversations = data?.conversations || [];
  const ouvrir = (id) =>
    base44.request("GET", `${api}/conversations/${id}${qs}`)
      .then((c) => onOuvrir(c))
      .catch(() => toast.error("Conversation introuvable"));
  const supprimer = (id) =>
    base44.request("DELETE", `${api}/conversations/${id}${qs}`)
      .then(() => { queryClient.invalidateQueries({ queryKey: cle }); if (id === actuelle) onNouvelle(); })
      .catch((e) => toast.error(e?.message || "Suppression impossible"));
  return (
    <div className="animate-in fade-in slide-in-from-top-1 duration-150 mt-4 rounded-[16px] border border-trait bg-surface-pleine p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="m-0 text-[11px] uppercase tracking-[.14em] text-brume">Conversations</p>
        <button type="button" onClick={onNouvelle} className="inline-flex items-center gap-1.5 rounded-full border border-trait px-3 py-1 text-[12.5px] text-craie transition-colors hover:text-encre" style={{ background: "transparent" }}>
          <Plus className="h-3.5 w-3.5" /> Nouvelle conversation
        </button>
      </div>
      {isLoading ? <Chargement taille="petit" />
        : !conversations.length ? <p className="m-0 text-[14px] text-ardoise">Rien encore : chaque échange avec l'assistant se range ici, et se rouvre d'un clic.</p>
        : (
          <ul className="m-0 flex max-h-[320px] list-none flex-col gap-1 overflow-y-auto p-0">
            {conversations.map((c) => (
              <li key={c.id} className="group flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => ouvrir(c.id)}
                  className={`flex min-w-0 flex-1 items-baseline justify-between gap-3 rounded-[10px] px-3 py-2 text-left transition-colors hover:bg-relief ${c.id === actuelle ? "bg-relief" : ""}`}
                  style={{ background: c.id === actuelle ? undefined : "transparent" }}
                >
                  <span className="min-w-0 truncate text-[14px] text-encre">{c.titre}</span>
                  <span className="flex-none text-[12px] text-brume" style={{ fontVariantNumeric: "tabular-nums" }}>{quandConversation(c.maj_le)}</span>
                </button>
                <button type="button" onClick={() => supprimer(c.id)} aria-label={`Supprimer « ${c.titre} »`} title="Supprimer"
                  className="grid h-7 w-7 flex-none place-items-center rounded-full border-0 p-0 text-brume opacity-0 transition-opacity hover:text-alerte group-hover:opacity-100"
                  style={{ background: "transparent" }}>
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
    </div>
  );
}

// Un brouillon de mail à relire : rien ne part sans un clic humain.
function Brouillon({ b, onChange, onEnvoyer, onFermer, enCours, messagerie = false, de = null }) {
  return (
    <div className="border border-menthe/40 rounded-xl bg-surface px-5 py-4">
      <div className="flex items-baseline justify-between gap-4 mb-3">
        <p className="m-0 text-[11px] tracking-[.18em] uppercase text-menthe">Brouillon{b.intention ? ` — ${INTENTIONS_LIBELLES[b.intention] || b.intention}` : ""}</p>
        <button onClick={onFermer} className="text-brume hover:text-encre" aria-label="Fermer"><X className="w-4 h-4" /></button>
      </div>
      {[["destinataire", "À"], ["objet", "Objet"]].map(([cle, libelle]) => (
        <label key={cle} className="flex items-baseline gap-3 py-1.5 border-b border-trait">
          <span className="text-[11px] text-brume w-[60px] flex-shrink-0">{libelle}</span>
          <input
            value={b[cle]}
            onChange={(e) => onChange({ ...b, [cle]: e.target.value })}
            className="flex-1 min-w-0 bg-transparent border-0 outline-none text-[12.5px] text-encre"
          />
        </label>
      ))}
      <textarea
        value={b.corps}
        onChange={(e) => onChange({ ...b, corps: e.target.value })}
        rows={Math.min(14, Math.max(6, b.corps.split("\n").length + 1))}
        className="w-full mt-3 bg-transparent border-0 outline-none resize-y text-[13.5px] leading-[1.65] text-encre"
      />
      {!messagerie && !de && <PiecesBrouillon b={b} onChange={onChange} />}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <span className="text-[11px] text-brume">{messagerie ? "Relisez, puis envoyez-le de votre messagerie : Klocka n'envoie rien." : de ? `Relisez : il part de ${de}.` : "Relisez : rien ne part sans vous."}</span>
        {messagerie ? (
          <a
            href={`mailto:${encodeURIComponent(b.destinataire || "")}?subject=${encodeURIComponent(b.objet || "")}&body=${encodeURIComponent(b.corps || "")}`}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-menthe text-fond text-[11px] tracking-[.14em] uppercase font-semibold hover:bg-menthe-survol rounded-full"
          >
            <Send className="w-3.5 h-3.5" /> Ouvrir dans ma messagerie
          </a>
        ) : (
        <button
          onClick={onEnvoyer}
          disabled={enCours || !String(b.destinataire || "").trim()}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-menthe text-fond text-[11px] tracking-[.14em] uppercase font-semibold hover:bg-menthe-survol disabled:opacity-40 rounded-full"
        >
          {enCours ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          Envoyer
        </button>
        )}
      </div>
    </div>
  );
}

// La fiche extraite, à relire — et à corriger sur place avant de valider.
function FicheClient({ champs, onChange, onValider, enCours }) {
  const [edition, setEdition] = useState(null);
  const manqueEmail = !champs.email;
  return (
    <div className="border border-menthe/40 rounded-xl bg-surface px-5 py-4">
      <div className="flex items-baseline justify-between gap-4 mb-3">
        <p className="m-0 text-[11px] tracking-[.18em] uppercase text-menthe">Ce que j'ai lu</p>
        <p className="m-0 text-[11px] text-brume">Cliquez une valeur pour la corriger</p>
      </div>
      <dl className="m-0 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1.5">
        {CHAMPS.map(([cle, libelle, unite]) => {
          const v = champs[cle];
          const affiche = v == null || v === "" ? null : unite === "€" ? euros(v) : unite ? `${v} ${unite}` : String(v);
          return (
            <div key={cle} className="flex items-baseline gap-3 py-1 border-b border-trait min-w-0">
              <dt className="text-[11px] text-brume w-[120px] flex-shrink-0">{libelle}</dt>
              {edition === cle ? (
                <input
                  autoFocus
                  defaultValue={v ?? ""}
                  onBlur={(e) => { onChange(cle, e.target.value, unite); setEdition(null); }}
                  onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") setEdition(null); }}
                  className="flex-1 min-w-0 bg-transparent border-b border-menthe text-[12.5px] text-encre outline-none"
                />
              ) : (
                <dd
                  onClick={() => setEdition(cle)}
                  className={`m-0 flex-1 min-w-0 text-[12.5px] truncate cursor-text ${affiche ? "text-encre" : cle === "email" ? "text-alerte" : "text-bord-vif italic"}`}
                  title={affiche || "non dit — cliquez pour saisir"}
                >
                  {affiche || (cle === "email" ? "manquant — sans lui, pas de compte Klocka" : "non dit")}
                  <Pencil className="w-3 h-3 inline ml-1.5 opacity-0 group-hover:opacity-100" />
                </dd>
              )}
            </div>
          );
        })}
      </dl>
      {champs.remarque && (
        <p className="m-0 mt-3 text-[12.5px] leading-[1.65] text-ardoise border-l-2 border-bord pl-3 whitespace-pre-wrap">{champs.remarque}</p>
      )}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <span className="text-[11px] text-brume">
          {manqueEmail ? "La fiche Twenty CRM sera créée ; le compte et le lien attendent l'adresse." : "Fiche Twenty CRM, compte Klocka pré-rempli, lien d'invitation."}
        </span>
        <button
          onClick={onValider}
          disabled={enCours}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-menthe text-fond text-[11px] tracking-[.14em] uppercase font-semibold hover:bg-menthe-survol disabled:opacity-40 rounded-full"
        >
          {enCours ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          Créer le client
        </button>
      </div>
    </div>
  );
}

function ResultatClient({ r }) {
  const [copie, setCopie] = useState(false);
  const copier = async () => {
    try {
      await navigator.clipboard.writeText(r.invitation.lien);
      setCopie(true);
      setTimeout(() => setCopie(false), 1800);
    } catch {
      window.prompt("Copiez le lien :", r.invitation.lien);
    }
  };
  return (
    <div className="border border-trait rounded-xl bg-surface px-5 py-4 space-y-3">
      {r.fait.map((f) => (
        <p key={f} className="m-0 text-[13.5px] text-encre">
          <Check className="w-3.5 h-3.5 inline mr-2 text-menthe align-[-2px]" />{f}
        </p>
      ))}
      {r.rates.map((f) => (
        <p key={f} className="m-0 text-[12.5px] text-alerte">{f}</p>
      ))}
      {r.invitation?.lien && (
        <div className="pt-2">
          <p className="m-0 text-[11px] tracking-[.18em] uppercase text-ardoise mb-2">Lien d'invitation — à envoyer à {r.invitation.email}</p>
          <div className="flex flex-wrap items-center gap-3">
            <code className="text-[12.5px] text-craie break-all bg-fond px-3 py-2 border border-trait flex-1 min-w-[240px]">{r.invitation.lien}</code>
            <button onClick={copier} className="inline-flex items-center gap-2 px-4 py-2 border border-bord-doux text-encre text-[11px] tracking-[.16em] uppercase hover:bg-encre/[0.06]">
              {copie ? <Check className="w-3.5 h-3.5 text-menthe" /> : <Copy className="w-3.5 h-3.5" />}
              {copie ? "Copié" : "Copier"}
            </button>
          </div>
          <p className="m-0 mt-2 text-[11px] text-brume">Valable quatorze jours. La personne ouvre le lien, choisit son mot de passe, retrouve un profil déjà rempli.</p>
        </div>
      )}
      {r.monday?.id && (
        <a
          href={lienCrm(2110621760, r.monday.id)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-[12.5px] text-menthe hover:text-encre"
        >
          Ouvrir la fiche du CRM <ArrowRight className="w-3 h-3" />
        </a>
      )}
    </div>
  );
}

// Le dossier né d'une fiche : son nom, son verdict, ce qu'il faut savoir.
function ResultatFiche({ r, clients }) {
  const navigate = useNavigate();
  const lot = r.lot || {};
  const ev = lot.evaluation || {};
  const verdict = String(ev.verdict || "");
  const teinte = /NO/.test(verdict) ? "text-alerte border-alerte/40" : /RÉSERVE|RESERVE/.test(verdict) ? "text-ambre border-ambre/40" : "text-menthe border-menthe/40";
  const s = lot.synthese || {};
  // Les champs extraits portent valeur, citation et confiance ; on ne montre
  // qu'une valeur présente.
  const val = (c) => (c && c.absent === false ? c.valeur : c && typeof c !== "object" ? c : null);
  const x = lot.lot || {};
  const adresse = val(x.adresse);
  const ville = typeof adresse === "string" ? adresse : adresse?.ville || adresse?.commune || null;
  const prix = val(x.prix_fai);
  const surface = val(x.surface_m2);
  const loyer = val(x.loyer_annuel_ht_hc);
  const activite = val(x.locataire_activite);
  const faits = [ville, prix ? euros(prix) : null, surface ? `${surface} m²` : null, loyer ? `${euros(loyer)} / an` : null, activite].filter(Boolean);
  const grille = ev.grille || [];
  const ratees = grille.filter((g) => g.ok === false);
  return (
    <div className="border border-trait rounded-xl bg-surface px-5 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="min-w-0">
          <p className="m-0 text-[11px] tracking-[.18em] uppercase text-ardoise">Dossier créé</p>
          <h3 className="m-0 mt-1 text-[18px] font-semibold tracking-[-.01em] text-encre truncate">{r.titre || s.titre || "Sans titre"}</h3>
        </div>
        {verdict && <span className={`px-3 py-1 border text-[11px] tracking-[.16em] uppercase ${teinte}`}>{verdict}</span>}
      </div>
      {faits.length > 0 && <p className="m-0 mt-2 text-[12.5px] text-craie">{faits.join(" · ")}</p>}
      {ratees.length > 0 && (
        <ul className="m-0 mt-3 pl-0 list-none space-y-1">
          {ratees.slice(0, 4).map((g, i) => (
            <li key={i} className="text-[12.5px] text-ardoise"><span className="text-alerte mr-2">✕</span>{g.critere} — {g.motif || g.valeur}</li>
          ))}
        </ul>
      )}
      {clients && (
        <p className="m-0 mt-3 text-[12.5px] text-craie">
          {clients.length ? `${pluriel(clients.length, "client")} correspondant${clients.length > 1 ? "s" : ""} : ${clients.slice(0, 3).map((c) => c.nom || c.full_name || c.email).join(", ")}${clients.length > 3 ? "…" : ""}` : "Aucun client ne correspond pour l'instant."}
        </p>
      )}
      {r.agent_fiche?.phrase && (
        <p className={`m-0 mt-3 text-[12.5px] ${["sans_email", "introuvable", "erreur"].includes(r.agent_fiche.etat) ? "text-ambre" : "text-craie"}`}>
          {r.agent_fiche.phrase}
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-3">
        <button onClick={() => navigate(`/Dossiers?deal_id=${r.deal_id}`)} className="inline-flex items-center gap-2 px-4 py-2 bg-menthe text-fond text-[11px] tracking-[.14em] uppercase font-semibold hover:bg-menthe-survol rounded-full">
          Ouvrir le dossier <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

// Une carte d'échéance : un fait, une date, un geste.
function Carte({ titre, sous, teinte = J["bord"], actions }) {
  return (
    <div className="border border-trait rounded-xl bg-surface px-4 py-3.5 flex gap-3">
      <div className="w-[2px] flex-none self-stretch" style={{ background: teinte }} />
      <div className="min-w-0 flex-1">
        <p className="m-0 text-[13.5px] leading-[1.55] text-encre">{titre}</p>
        {sous && <p className="m-0 mt-0.5 text-[12.5px] text-brume">{sous}</p>}
        <div className="mt-2.5 flex flex-wrap gap-2">
          {actions.map((a) => (
            <button
              key={a.libelle}
              onClick={a.onClick}
              disabled={a.enCours}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] tracking-[.14em] uppercase transition-colors disabled:opacity-40 ${
                a.principal ? "bg-menthe text-fond hover:bg-menthe-survol font-semibold" : "border border-bord-doux text-craie hover:border-menthe hover:text-menthe"
              }`}
            >
              {a.enCours ? <Loader2 className="w-3 h-3 animate-spin" /> : null}{a.libelle}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Echeances({ onBrouillon }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["echeances"],
    queryFn: () => base44.request("GET", "/api/assistant/echeances"),
    refetchInterval: 120000,
  });
  const [enCours, setEnCours] = useState(null);

  const rediger = async (dealId, intention, cle) => {
    setEnCours(cle);
    try {
      const m = await base44.request("POST", `/api/preanalyse/dossiers/${dealId}/mail`, { body: { intention } });
      onBrouillon({ deal_id: dealId, intention, destinataire: m.destinataire || "", objet: m.objet || "", corps: m.corps || "" });
    } catch (e) {
      toast.error(e?.message || "Rédaction impossible");
    } finally {
      setEnCours(null);
    }
  };

  if (isLoading) return <p className="m-0 text-[12.5px] text-ardoise inline-flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Je relis les échanges…</p>;
  const { sans_reponse = [], silencieux = [] } = data || {};
  if (!sans_reponse.length && !silencieux.length) {
    return (
      <div className="space-y-6">
        <ListeRelances />
        <p className="m-0 text-[13.5px] text-ardoise">Côté mails, rien n'attend : chacun a sa réponse.</p>
      </div>
    );
  }
  const ouvrir = (dealId) => ({ libelle: "Ouvrir", onClick: () => navigate(`/Dossiers?deal_id=${dealId}`) });
  return (
    <div className="space-y-4">
      <ListeRelances />
      {sans_reponse.length > 0 && (
        <section>
          <p className="m-0 mb-2 text-[11px] tracking-[.18em] uppercase text-ardoise">Sans réponse</p>
          <div className="space-y-2">
            {sans_reponse.map((s) => (
              <Carte
                key={s.deal_id}
                teinte={s.jours >= 7 ? J["alerte"] : J["ambre"]}
                titre={<><span className="font-medium">{s.agent || s.destinataire}</span> a reçu {INTENTIONS_LIBELLES[s.intention] || "notre mail"} il y a {pluriel(s.jours, "jour")} — pas de réponse.</>}
                sous={`${s.dossier} · envoyé le ${dateCourte(s.envoye_le)}${s.objet ? ` · « ${s.objet} »` : ""}`}
                actions={[
                  { libelle: "Relancer", principal: true, enCours: enCours === `r-${s.deal_id}`, onClick: () => rediger(s.deal_id, "relance", `r-${s.deal_id}`) },
                  ouvrir(s.deal_id),
                ]}
              />
            ))}
          </div>
        </section>
      )}
      {silencieux.length > 0 && (
        <section>
          <p className="m-0 mb-2 text-[11px] tracking-[.18em] uppercase text-ardoise">Rien n'est parti</p>
          <div className="space-y-2">
            {silencieux.map((d) => (
              <Carte
                key={d.deal_id}
                titre={<><span className="font-medium">{d.dossier}</span> est ouvert depuis {pluriel(d.jours, "jour")} — aucun mail envoyé, aucun document reçu.</>}
                sous={d.agent || d.destinataire ? `Agent : ${d.agent || d.destinataire}` : "Aucun agent rattaché au dossier"}
                actions={[
                  ...(d.destinataire ? [{ libelle: "Demander les documents", principal: true, enCours: enCours === `d-${d.deal_id}`, onClick: () => rediger(d.deal_id, "demande_documents", `d-${d.deal_id}`) }] : []),
                  ouvrir(d.deal_id),
                ]}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Le fil de conversation (prototype 1a) : une fois le message envoyé, le
// tableau de bord laisse la place à la conversation. Les étapes d'analyse
// défilent, se replient une fois finies ; ce qui a été fait s'affiche en
// cartes, avec de quoi l'ouvrir ou l'annuler.
// ---------------------------------------------------------------------------

// Ce que l'écran annonce pendant que le serveur travaille. Les étapes finales
// viennent de la réponse (le contact reconnu, les outils consultés).
const ETAPES_PREVUES = {
  note: ["Lecture de la note", "Recherche du contact", "Préparation des actions"],
  fiche: ["Lecture de la fiche", "Extraction du bien", "Passage à la grille"],
  client: ["Lecture du compte rendu", "Extraction de la fiche client", "Préparation de la fiche"],
  rappel: ["Lecture du rappel", "Calcul de la date", "Création du rappel"],
  piece: ["Lecture de la pièce jointe", "Reconnaissance du document et du bien", "Rangement dans le dossier"],
  defaut: ["Lecture du message", "Recherche dans vos dossiers", "Préparation de la réponse"],
};
const OUTILS_LUS = {
  trouver_bien: "Recherche du bien", chercher_dossier: "Recherche du dossier", chercher_projet: "Recherche du projet", etat_dossier: "Lecture du dossier",
  etat_projet: "Lecture du projet", marche_ville: "Lecture du marché de la ville", data_b: "Lecture Data-B", verifier: "Vérification des chiffres",
  interroger_documents: "Lecture des documents", simuler_dossier: "Simulation", plan_du_jour: "Lecture du plan du jour",
  registre_engagements: "Lecture des engagements", historique_actions: "Lecture de l'historique", preparer_mail: "Rédaction du mail",
  noter_relance: "Création de la relance", noter_rdv: "Création du rendez-vous", nouveau_contact: "Création de la fiche propriétaire",
  appel_sans_reponse: "Relance suivante de la séquence", resultat_appel: "Mise à jour de la fiche", demandes_clients: "Lecture des demandes clients",
  rediger_loi: "Rédaction de la lettre d'intention", rediger_sequence: "Rédaction de la séquence", rediger_newsletter: "Rédaction de la newsletter", avis_de_marche: "Lecture du marché", mes_rappels: "Lecture de vos rappels", mes_proprietaires: "Lecture de vos propriétaires",
};
const ACTIONS_FAITES = {
  pousser_dossier_monday: "Dossier poussé dans Twenty CRM", pousser_projet_monday: "Projet poussé dans Twenty CRM", creer_drive_dossier: "Dossier Drive créé",
  extraire_documents: "Documents lus et rangés", creer_agent_monday: "Agent ajouté dans Twenty CRM", envoyer_mail: "Mail envoyé",
  noter_engagement: "Engagement noté", tenir_engagement: "Engagement tenu", creer_dossier: "Dossier créé",
  analyser_fiche: "Fiche analysée", faire_tout: "Mail traité de bout en bout", deposer_mail: "Mail déposé sur le dossier",
  preanalyser_mail: "Préanalyse lancée", ranger_drive: "Rangé sur le Drive", bloquer_rdv: "Rendez-vous posé dans l'agenda",
  lancer_kdata: "Analyse lancée dans Outils", generer_prez_bancaire: "Présentation bancaire en préparation",
  lancer_alx: "Prospection ALX lancée", ajouter_document: "Document ajouté au dossier", creer_client_monday: "Client créé dans Twenty CRM",
  renommer_dossier: "Dossier renommé", supprimer_dossier: "Dossier supprimé", creer_projet_depuis_dossier: "Projet créé",
  ajouter_photos_projet: "Photos ajoutées au projet", ajouter_prospect: "Agent ajouté au carnet de prospection",
  noter_appel: "Appel noté", retenir: "Retenu", oublier: "Oublié", lancer_design: "Chantier de design lancé",
};

/** Les étapes réellement faites, lues dans la réponse du serveur. */
function etapesDe(r, prevues) {
  if (r?.type === "note") {
    return ["Lecture de la note", r.agent?.nom ? `Contact reconnu : ${r.agent.nom}` : "Contact recherché dans Twenty CRM", r.dossier ? `Dossier : ${r.dossier.titre}` : "Préparation des actions"];
  }
  const lus = [...new Set((r?.outils || []).map((o) => OUTILS_LUS[o] || ACTIONS_FAITES[o]).filter(Boolean))];
  return lus.length ? ["Lecture du message", ...lus.slice(0, 5)] : prevues;
}

/** Ce qui a été fait, en cartes. */
export function cartesDe(r) {
  if (r?.type === "note") {
    return [
      ...(r.fait || []).map((f) => ({ titre: f.charAt(0).toUpperCase() + f.slice(1), etat: "fait", lien: /agent/.test(f) ? r.agent?.url || null : /dossier/.test(f) ? r.dossier?.lien || null : null })),
      ...(r.rates || []).map((f) => ({ titre: f, etat: "rate" })),
    ];
  }
  const taches = (r?.taches || []).map((t) => ({ titre: `En cours : ${t}`, detail: "Une notification arrivera quand ce sera prêt.", etat: "fait" }));
  // Les fichiers qu'AK a écrits dans son bac à sable (un Excel, un CSV, un graphique) : à télécharger d'un clic (13 oct. 2026).
  const ko = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1).replace(".", ",")} Mo` : `${Math.max(1, Math.round(n / 1024))} Ko`);
  const fichiers = (r?.fichiers || []).filter((f) => f?.url && f?.nom).map((f) => ({ titre: f.nom, detail: `Fichier préparé par AK${f.taille ? ` · ${ko(f.taille)}` : ""}`, etat: "fait", lien: `fichier:${f.url}`, action: "Télécharger" }));
  // Parlé d'un bien depuis le dashboard : l'échange est rangé dans le fil de ce bien (25 oct. 2026), une carte y mène.
  const fil = r?.fil_bien ? [{ titre: `Rangé dans le fil de ${r.fil_bien.titre}`, detail: "Tout ce qui s'est dit sur ce bien", etat: "fait", lien: r.fil_bien.lien || null, action: r.fil_bien.lien ? "Ouvrir" : undefined }] : [];
  return [...fil, ...fichiers, ...taches, ...(r?.actions || [])
    // Une étape à confirmer n'est pas faite : elle n'a pas de carte, seulement son bouton « Confirmer » (25 oct. 2026).
    .filter((a) => a.type !== "confirmer_etape" && a.type !== "confirmer_restitution" && a.type !== "confirmer_vente" && !["preparer_mail", "mail_agent", "mail_libre", "retoucher_brouillon"].includes(a.name) && (ACTIONS_FAITES[a.name] || a.titre))
    .map((a) => ({
      titre: a.titre || (a.name === "creer_drive_dossier" && a.resultat?.deja_cree ? "Dossier Drive complété" : ACTIONS_FAITES[a.name]),
      detail: a.pour || a.resultat?.message || a.resultat?.titre || null,
      etat: a.etat === "rate" ? "rate" : "fait",
      lien: a.lien || a.resultat?.url || (a.resultat?.deal_id ? `/Dossiers?deal_id=${a.resultat.deal_id}` : null),
    }))];
}

/**
 * Une suite sous la réponse : la pastille habituelle, ou — quand elle porte un
 * `detail` — un vrai bouton de choix (« Recherche multicritère » /
 * « Suggestion intelligente »), plus grand, avec sa ligne d'explication.
 */
function BoutonSuite({ x, onClick }) {
  if (x.detail) {
    return (
      <button type="button" onClick={onClick}
        className={`min-w-[220px] max-w-[300px] flex-1 rounded-[16px] px-5 py-4 text-left transition-colors ${x.principal ? "bg-menthe text-fond hover:bg-menthe-survol" : "border border-trait text-encre hover:border-menthe"}`}
        style={x.principal ? undefined : { background: "transparent" }}>
        <span className="block text-[15px] font-medium">{x.libelle}</span>
        <span className={`mt-1 block text-[12.5px] leading-[1.45] ${x.principal ? "opacity-80" : "text-ardoise"}`}>{x.detail}</span>
      </button>
    );
  }
  return (
    <button type="button" onClick={onClick}
      className={`rounded-full px-3.5 py-1.5 text-[12.5px] transition-colors ${x.principal ? "bg-menthe font-medium text-fond hover:bg-menthe-survol" : "border border-trait text-craie hover:border-menthe hover:text-menthe"}`}
      style={x.principal ? undefined : { background: "transparent" }}>
      {x.libelle}
    </button>
  );
}

/** Les étapes : pendant l'analyse, celle en cours porte un point ; ensuite, une ligne qui se déplie. */
function Etapes({ etapes, courante = null }) {
  const [ouvert, setOuvert] = useState(false);
  const enCours = courante != null;
  if (!etapes?.length) return null;
  if (!enCours && !ouvert) {
    return (
      <button type="button" onClick={() => setOuvert(true)} className="mb-4 inline-flex items-center gap-1.5 text-[14.5px] text-brume transition-colors hover:text-craie" style={{ background: "transparent" }}>
        Analyse terminée · {etapes.length} étape{etapes.length > 1 ? "s" : ""} <ChevronDown className="h-3.5 w-3.5" />
      </button>
    );
  }
  const vues = enCours ? etapes.slice(0, courante + 1) : etapes;
  return (
    <div className="mb-4">
      {vues.map((e, i) => {
        const faite = !enCours || i < courante;
        const ici = enCours && i === courante;
        const derniere = i === vues.length - 1;
        const Icone = iconeEtape(e);
        return (
          // La frise de raisonnement (18 oct. 2026, Jules) : une coche dans un rond blanc pour l'étape faite, l'icône de ce que Haka
          // fait pour l'étape en cours, dont le texte est balayé d'un reflet ; un trait relie les étapes.
          <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: "easeOut", delay: enCours ? 0 : i * 0.03 }}
            className="flex items-stretch gap-3.5 text-[15px]">
            <span className="flex w-5 flex-none flex-col items-center">
              <span className="grid h-5 w-5 flex-none place-items-center">
                {faite ? (
                  <motion.span initial={enCours ? { scale: 0.4, opacity: 0 } : false} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 420, damping: 22 }}
                    className="grid h-5 w-5 place-items-center rounded-full" style={{ background: J["encre"], color: J["fond"] }}><Check className="h-3 w-3" strokeWidth={3} /></motion.span>
                ) : (
                  <Icone className="h-[18px] w-[18px]" strokeWidth={1.7} style={{ color: J["craie"] }} />
                )}
              </span>
              {(!derniere || ici) && <motion.span initial={{ scaleY: 0 }} animate={{ scaleY: 1 }} transition={{ duration: 0.3, ease: "easeOut" }} className="my-1 w-px flex-1 origin-top" style={{ background: J["bord-vif"], minHeight: 14 }} />}
            </span>
            <span className={`pb-2.5 leading-[20px] ${ici ? "k-raisonne" : ""}`} style={faite ? { color: J["encre"] } : undefined}>{e}</span>
          </motion.div>
        );
      })}
      {!enCours && (
        <button type="button" onClick={() => setOuvert(false)} className="inline-flex items-center gap-1 text-[13px] text-brume hover:text-craie" style={{ background: "transparent" }}>
          Replier <ChevronDown className="h-3 w-3 rotate-180" />
        </button>
      )}
    </div>
  );
}


/** Une action faite : son titre, son détail, de quoi l'ouvrir. */
function CarteAction({ c, onOuvrir }) {
  const rate = c.etat === "rate";
  const annule = c.etat === "annule";
  const pilule = "inline-flex h-11 items-center rounded-full px-5 text-[15px]";
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}
      className={`flex items-center gap-4 rounded-[18px] border px-6 py-5 max-md:flex-wrap max-md:px-4 ${annule ? "opacity-50" : ""}`}
      style={{ borderColor: rate ? alpha("alerte", 0.45) : J["trait"], background: J["surface-pleine"] }}>
      <div className="min-w-0 flex-1">
        <p className={`m-0 text-[16px] ${annule ? "text-brume line-through" : "text-encre"}`}>{c.titre}</p>
        {c.detail && <p className="m-0 mt-1 text-[14.5px] leading-[1.5] text-ardoise">{c.detail}</p>}
      </div>
      <div className="flex flex-none items-center gap-2.5">
        {c.lien && !annule && (
          <button type="button" onClick={() => onOuvrir(c.lien)} className={`${pilule} ${c.action ? "font-medium" : "border border-trait text-craie hover:text-encre"} transition-colors`}
            style={c.action ? { background: J["pervenche"], color: J["sur-menthe-pale"] } : { background: "transparent" }}>
            {c.action || "Ouvrir"}
          </button>
        )}
        {!c.action && (
          <span className={pilule} style={rate ? { border: `1px solid ${alpha("alerte", 0.45)}`, color: J["alerte"] } : annule ? { border: `1px solid ${J["trait"]}`, color: J["brume"] } : { background: J["pervenche"], color: J["sur-menthe-pale"] }}>
            {rate ? "Pas fait" : annule ? "Annulé" : "✓ Fait"}
          </span>
        )}
      </div>
    </motion.div>
  );
}

/**
 * « Pour un client » : les demandes des clients Klocka, anonymes, en tableau.
 * On coche un ou plusieurs clients, puis on prospecte pour eux d'un coup.
 */
function ChoixClient({ onLancer, disabled }) {
  const { data, isLoading } = useQuery({ queryKey: ["mandataire-demandes"], queryFn: () => base44.request("GET", "/api/mandataire/demandes"), staleTime: 60 * 1000 });
  const demandes = [...(data?.demandes || [])].sort((a, b) => (b.a_prospecter ?? 0) - (a.a_prospecter ?? 0));
  const [coches, setCoches] = useState(() => new Set());
  if (isLoading) return <span className="text-[12.5px] text-brume">Lecture des demandes…</span>;
  if (!demandes.length) return <span className="text-[12.5px] text-brume">Aucune demande client ouverte pour l'instant.</span>;
  const k = (n) => (n == null ? null : `${Math.round(n / 1000).toLocaleString("fr-FR")} k€`);
  const basculer = (id) => setCoches((c) => { const n = new Set(c); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const tous = coches.size === demandes.length;
  const choisies = demandes.filter((d) => coches.has(d.id));
  const caseDe = (oui) => (
    <span className="grid h-[17px] w-[17px] place-items-center rounded-[5px] border" style={{ borderColor: oui ? J["menthe"] : J["bord-vif"], background: oui ? J["menthe"] : "transparent" }}>
      {oui && <Check className="h-3 w-3" style={{ color: J["sur-menthe"] }} />}
    </span>
  );
  return (
    <div className="w-full overflow-hidden rounded-[16px] border border-trait text-left" style={{ background: J["surface-pleine"] }}>
      <div className="max-h-[300px] overflow-auto">
        <table className="w-full text-[13px]">
          <thead className="sticky top-0" style={{ background: J["surface-pleine"] }}>
            <tr className="border-b border-trait text-left text-[11px] uppercase tracking-[.1em] text-ardoise">
              <th className="w-10 px-3 py-2.5 font-normal">
                <button type="button" onClick={() => setCoches(tous ? new Set() : new Set(demandes.map((d) => d.id)))} aria-label={tous ? "Tout décocher" : "Tout cocher"} style={{ background: "transparent" }}>{caseDe(tous)}</button>
              </th>
              <th className="px-2 py-2.5 font-normal">Client</th>
              <th className="px-2 py-2.5 font-normal">Recherche</th>
              <th className="px-2 py-2.5 font-normal max-md:hidden">Zone</th>
              <th className="px-2 py-2.5 font-normal max-md:hidden">Budget</th>
              <th className="px-2 py-2.5 font-normal max-md:hidden">Rdt min</th>
              <th className="px-3 py-2.5 text-right font-normal">À prospecter</th>
            </tr>
          </thead>
          <tbody>
            {demandes.map((d) => {
              const oui = coches.has(d.id);
              return (
                <tr key={d.id} onClick={() => basculer(d.id)} className="cursor-pointer border-b border-trait last:border-b-0 hover:bg-encre/[0.03]" style={oui ? { background: alpha("menthe", 0.07) } : undefined}>
                  <td className="px-3 py-2.5">{caseDe(oui)}</td>
                  <td className="whitespace-nowrap px-2 py-2.5 text-encre">{d.reference}<span className="block text-[11.5px] text-brume">{d.profil}</span></td>
                  <td className="px-2 py-2.5 text-craie">{d.type_commerce ? `Murs de ${d.type_commerce}` : "Murs commerciaux"}</td>
                  <td className="px-2 py-2.5 text-craie max-md:hidden">{d.zones?.length ? d.zones.slice(0, 2).join(", ") : "Toute la France"}</td>
                  <td className="whitespace-nowrap px-2 py-2.5 tabular-nums text-craie max-md:hidden">{d.budget_min && d.budget_max ? `${Math.round(d.budget_min / 1000)} – ${k(d.budget_max)}` : k(d.budget_max || d.budget_min) || "—"}</td>
                  <td className="px-2 py-2.5 tabular-nums text-craie max-md:hidden">{d.rendement_min ? `${d.rendement_min} %` : "—"}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-menthe">{d.a_prospecter ?? d.commerces_du_secteur ?? 0}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-trait px-4 py-3">
        <span className="text-[12.5px] text-ardoise">{coches.size ? `${coches.size} client${coches.size > 1 ? "s" : ""} choisi${coches.size > 1 ? "s" : ""}` : "Cochez un ou plusieurs clients"}</span>
        <button type="button" disabled={!coches.size || disabled}
          onClick={() => { onLancer(choisies.map((d) => d.id), choisies.map((d) => d.reference)); setCoches(new Set()); }}
          className="inline-flex h-9 items-center rounded-full px-4 text-[13px] font-medium disabled:opacity-40" style={{ background: J["pervenche"], color: J["sur-menthe-pale"] }}>
          Prospecter pour {coches.size > 1 ? `ces ${coches.size} clients` : "ce client"}
        </button>
      </div>
    </div>
  );
}

/** Les étapes de l'agent dans une notification : faites, puis celle en cours. */
function EtapesNotif({ etapes = [], enCours = false }) {
  if (!etapes.length) return null;
  return (
    <ul className="m-0 mt-1 space-y-1 p-0">
      {etapes.map((t, i) => {
        const courante = enCours && i === etapes.length - 1;
        return (
          <li key={i} className="flex list-none items-start gap-2 text-[13px] leading-[1.45] transition-colors duration-300" style={{ color: courante ? J["encre"] : J["craie"] }}>
            <span className="mt-[2px] grid h-4 w-4 flex-none place-items-center">
              {courante ? <PointsEnCours /> : <PointFait anime={enCours} />}
            </span>
            <span>{t}</span>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * `prospectionId` : le chat parle depuis une prospection ouverte, l'agent peut
 * l'affiner. `embarque` : le chat vit en bas d'une page ; il ne déroule pas
 * de fil, une notification en haut à droite montre ce qu'il fait (les étapes,
 * en direct), puis sa réponse.
 */
// Le fil compact de l'assistant Klocka (16 oct. 2026, Jules) : la date entre deux jours, l'heure sous chaque réponse.
const jourDe = (m) => { const d = m?.le || m?.ak_le; return d ? new Date(d).toDateString() : null; };
const heureDe = (m) => { const d = m?.le || m?.ak_le; return d ? new Date(d).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : null; };
function SeparateurJour({ iso }) {
  const d = new Date(iso);
  const hier = new Date(); hier.setDate(hier.getDate() - 1);
  const mot = d.toDateString() === new Date().toDateString() ? "Aujourd'hui" : d.toDateString() === hier.toDateString() ? "Hier" : d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  return (
    <div className="flex items-center gap-4" role="separator">
      <span className="h-px flex-1 bg-trait" />
      <span className="text-[12px] uppercase tracking-[.12em] text-brume">{mot}</span>
      <span className="h-px flex-1 bg-trait" />
    </div>
  );
}

/** La carte d'une pièce jointe : la vignette du document (première page d'un PDF, l'image), son type en pastille. */
function CartePiece({ piece }) {
  return (
    <div className="relative h-[120px] w-[120px] overflow-hidden rounded-[14px] border border-bord-doux" style={{ background: J["barre"] }} title={piece.nom}>
      {piece.apercu
        ? <img src={piece.apercu} alt={piece.nom} className="h-full w-full object-cover object-top" />
        : <span className="grid h-full w-full place-items-center px-3 text-center text-[12px] leading-[1.35] text-ardoise"><span className="line-clamp-3 break-all">{piece.nom}</span></span>}
      <span className="absolute bottom-2 left-2 rounded-[6px] bg-black/60 px-1.5 py-0.5 text-[11px] font-medium tracking-[.04em] text-white">{piece.genre}</span>
    </div>
  );
}

/** Le message de la personne : la carte de la pièce s'il y en a une, puis la phrase seule dans la bulle. */
function MessageAvecPiece({ m }) {
  // Une pièce (m.piece, avant le 27 oct. 2026) ou plusieurs (m.pieces) ; un fil relu n'a que le texte, « a.pdf · b.jpg ».
  const lues = m.pieces?.length ? m.pieces : m.piece ? [m.piece] : null;
  const duTexte = pieceDuTexte(m.contenu);
  const pieces = lues || (duTexte ? duTexte.nom.split(" · ").map((nom) => ({ nom, genre: genreDeFichier(nom), apercu: null })) : null);
  const texte = pieces ? duTexte?.texte ?? "" : m.contenu;
  return (
    <>
      {pieces && <div className="flex max-w-[80%] flex-wrap justify-end gap-2">{pieces.map((p, i) => <CartePiece key={p.pid || i} piece={p} />)}</div>}
      {texte && <div className="max-w-[80%] whitespace-pre-wrap rounded-[22px] rounded-br-[6px] px-6 py-4 text-[16px] leading-[1.6] text-encre" style={{ background: J["barre"] }}>{texte}</div>}
    </>
  );
}

// `lueur` : une lumière fait lentement le tour du cadre de la saisie, pour qu'on la voie (la fiche d'un commerce, 25 oct. 2026, Jules).
// Dans tous les chats depuis le 26 oct. 2026 (Jules : « dans le dashboard, dans admin, dans tous les chats ») : `lueur={false}` l'éteint.
// `dansLeFil` : ce chat est la conversation du bien (Biens) ; sans lui, le serveur range l'échange dans le fil du bien.
export default function ChatDashboard({ dansLeFil = false, lueur = true, espace = "admin", onRecherche = null, onConversation = null, onHistorique = null, onOuvrirResultats = null, prospectionId = null, embarque = false, onMode = null, onReponse = null, avisACote = false, selectionAvis = null, onEffacerSelection = null, barreApercu = false, onTravail = null, contexte = null, onConversationId = null, sansBarreHaut = false, filVide = null, lireEcran = null, retour = null, cible = null, compact = false , libelleAccueil = null, sansSkills = false, choixDossier = false, onDossier = null, placeholderAccueil = null, reglages = null, menusVersLeHaut = false, proprietaireId = null, contour = null, epure = false, sousSaisie = null, placeholderFil = null, dossierVenteId = null, marcheId = null, avantRetour = null, ouverture = null, onOuverture = null, reprendre = false, onReprise = null }) {
  const E = ESPACES[espace] || ESPACES.admin;
  // Le chat d'une fiche du mandataire garde ses conversations à elle (31 oct. 2026).
  const qs = espace === "mandataire" && proprietaireId ? `?espace=fiche&fiche=${encodeURIComponent(proprietaireId)}` : (E.qs || "");
  const prospection = espace === "prospection";
  const estimation = espace === "estimation";
  const mandatEspace = espace === "mandat";
  // Le mandataire, au tableau de bord, en prospection ou en estimation : ses routes, pas celles de l'équipe.
  // L'espace du client parle comme celui d'un mandataire : `${E.api}/chat`, la réponse en `texte`.
  const mandataire = espace === "mandataire" || espace === "affinage" || prospection || estimation || mandatEspace || espace === "presentation_client";
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [texte, setTexte] = useState("");
  // Le dossier choisi dans la saisie de l'Accueil (17 oct. 2026) : la demande part avec lui, comme depuis le dossier ouvert.
  const [dossierChoisi, setDossierChoisi] = useState(null);
  useEffect(() => { onDossier?.(dossierChoisi); }, [dossierChoisi, onDossier]);
  const pageEnvoi = E.page || (choixDossier && dossierChoisi ? "dossiers" : null);
  // Les réglages de Haka (sources, répondre ou produire), tenus par la page : ils partent avec chaque demande.
  // Paramètres > Haka (18 oct. 2026) : la longueur des réponses et les tableaux partent avec chaque demande.
  const { prefs: prefsHaka } = usePersonnalisation();
  const reglagesRef = useRef(reglages);
  reglagesRef.current = reglages;
  const avecContexte = !!(pageEnvoi || reglages);
  // La prospection choisit toujours entre ses deux modes : pas de « mode auto ».
  const [mode, setMode] = useState((ESPACES[espace] || ESPACES.admin).modeParDefaut || null);
  useEffect(() => { onMode?.(mode); }, [mode, onMode]);
  const [commandes, setCommandes] = useState(false);
  const [suggestionsOuvertes, setSuggestionsOuvertes] = useState(false);
  const [skillsOuvert, setSkillsOuvert] = useState(false);
  const [fil, setFil] = useState([]); // { role, contenu } et blocs { role: "bloc", type, donnees }
  // `ouverture` (30 oct. 2026, Jules) : un premier message de l'assistant, posé en arrivant (un projet qui vient d'être
  // rentré demande ce qui lui manque). Une seule fois ; `onOuverture` dit qu'il a été montré.
  const ouvertureMontree = useRef(false);
  useEffect(() => {
    if (!ouverture || ouvertureMontree.current) return;
    ouvertureMontree.current = true;
    setFil((f) => (f.length ? f : [{ role: "assistant", contenu: ouverture, reprise: true }]));
    onOuverture?.();
  }, [ouverture]);
  const [brouillon, setBrouillon] = useState(null);
  const [suites, setSuites] = useState([]);
  const [fiche, setFiche] = useState(null); // compte rendu client extrait, à valider
  // Les pièces jointes du message à venir (plusieurs depuis le 27 oct. 2026, Jules) : dix au plus, sans doublon.
  const [jointes, setJointes] = useState([]);
  const joindre = (liste) => {
    const nouvelles = Array.from(liste || []);
    if (!nouvelles.length) return;
    setJointes((l) => {
      const toutes = [...l, ...nouvelles.filter((f) => !l.some((x) => x.name === f.name && x.size === f.size))];
      if (toutes.length > 10) toast.warning("Dix pièces au plus par message");
      return toutes.slice(0, 10);
    });
  };
  const [glisse, setGlisse] = useState(false);
  const [enCoursTexte, setEnCoursTexte] = useState("");
  const finRef = useRef(null);
  const fichierRef = useRef(null);
  const champRef = useRef(null);
  const [historiqueOuvert, setHistoriqueOuvert] = useState(false);
  // Les étapes annoncées pendant que le serveur travaille, et celle en cours.
  const [etapesPrevues, setEtapesPrevues] = useState([]);
  const [etapeCourante, setEtapeCourante] = useState(0);
  const etapesRef = useRef([]);
  // Les clients cochés dans le tableau « Pour un client », envoyés avec la prochaine prospection.
  const clientsChoisis = useRef([]);
  const [etapesVives, setEtapesVives] = useState([]);
  const vivesRef = useRef([]);
  const [enFlux, setEnFlux] = useState(false);
  const annoncer = (cle) => {
    const e = ETAPES_PREVUES[cle] || ETAPES_PREVUES.defaut;
    etapesRef.current = e; setEtapesPrevues(e); setEtapeCourante(0);
    vivesRef.current = []; setEtapesVives([]); fileRef.current = [];
  };
  // Les étapes arrivent parfois par rafale (le tri est instantané) : une file
  // les révèle une à une, jamais plus vite qu'une toutes les 0,45 s.
  const fileRef = useRef([]);
  const surEtape = (t) => { fileRef.current.push(t); };
  // Le texte du modèle au fil de l'eau (12 oct. 2026) : on montre celui du tour en cours ; un nouveau tour repart de zéro.
  const [texteVif, setTexteVif] = useState("");
  const tourVif = useRef(-1);
  const surTexte = (morceau, tour) => { if (tour !== tourVif.current) { tourVif.current = tour; setTexteVif(morceau); } else setTexteVif((t) => t + morceau); };
  const vider = () => new Promise((fini) => {
    const t = setInterval(() => { if (!fileRef.current.length) { clearInterval(t); fini(); } }, 80);
    setTimeout(() => { clearInterval(t); fini(); }, 5000);
  });
  // La conversation en cours : créée au premier échange, complétée ensuite.
  const [conversationId, setConversationId] = useState(null);
  // Le titre enregistré (renommable) ; sans lui, le premier message en tient lieu.
  const [titreSauve, setTitreSauve] = useState(null);
  const [titreEdite, setTitreEdite] = useState(null);
  const sauvegarde = useRef(null);
  useEffect(() => {
    if (!fil.some((m) => m.role === "user")) return undefined;
    clearTimeout(sauvegarde.current);
    sauvegarde.current = setTimeout(() => {
      base44.request("POST", `${E.api}/conversations${qs}`, { body: { id: conversationId, messages: fil } })
        .then((r) => {
          if (r?.id && r.id !== conversationId) setConversationId(r.id);
          if (r?.titre) setTitreSauve(r.titre);
          queryClient.invalidateQueries({ queryKey: ["assistant-conversations", E.api, qs] });
        })
        .catch(() => { /* l'historique attendra le prochain échange */ });
    }, 800);
    return () => clearTimeout(sauvegarde.current);
  }, [fil, conversationId, queryClient, E.api, qs]);

  useEffect(() => { onConversationId?.(conversationId); }, [conversationId, onConversationId]);
  // Rouvrir une conversation, ou en commencer une neuve : le fil change de peau.
  const ouvrirConversation = (c) => {
    // La réponse en cours appartient à l'ancien fil : elle ne doit pas atterrir ici.
    controleur.current?.abort();
    setFil(c.messages || []);
    setConversationId(c.id || null);
    setTitreSauve(c.titre || null); setTitreEdite(null);
    // Le dernier message attend un tap (« De ce que je sais… », 29 oct. 2026) : ses boutons reviennent avec le fil.
    const dernier = (c.messages || []).at(-1);
    setSuites(dernier?.role === "assistant" && Array.isArray(dernier.boutons) ? dernier.boutons.map((b) => ({ cle: b.libelle, libelle: b.libelle, texte: b.texte, href: b.href || null, principal: !!b.principal })) : []);
    setBrouillon(null); setFiche(null);
    setHistoriqueOuvert(false);
    onHistorique?.(false);
  };
  // `reprendre` : la fiche rouverte retrouve sa dernière conversation, une fois (31 oct. 2026, Jules).
  const repris = useRef(null);
  useEffect(() => {
    if (!reprendre || !proprietaireId || repris.current === proprietaireId) return;
    repris.current = proprietaireId;
    base44.request("GET", `${E.api}/conversations${qs}`)
      .then((r) => { const derniere = r?.conversations?.[0]; return derniere ? base44.request("GET", `${E.api}/conversations/${derniere.id}${qs}`) : null; })
      .then((c) => { if (c?.messages?.length && repris.current === proprietaireId) { onReprise?.(); ouvrirConversation(c); } })
      .catch(() => { /* sans elle, le chat repart à vide */ });
  }, [reprendre, proprietaireId, qs]);
  const nouvelleConversation = () => {
    controleur.current?.abort();
    setFil([]); setConversationId(null);
    setTitreSauve(null); setTitreEdite(null);
    setSuites([]); setBrouillon(null); setFiche(null);
    setHistoriqueOuvert(false);
    onHistorique?.(false);
    setTimeout(() => champRef.current?.focus(), 30);
  };
  // Le rail demande l'assistant : ici, c'est le champ qui prend la main.
  useEffect(() => {
    const focaliser = () => champRef.current?.focus();
    window.addEventListener("klocka:assistant", focaliser);
    // Une carte de compétence (Haka, 17 oct. 2026) remplit le champ ; la personne envoie.
    const composer = (e) => { const t = e?.detail?.texte; if (!t) return; setTexte(t); if (e.detail.competence) reglagesRef.current?.choisirCompetence?.(e.detail.competence, e.detail.eteintes || []); if (e.detail.sortie) reglagesRef.current?.setSortie?.(e.detail.sortie); if (choixDossier && e.detail.contexte?.deal_id) setDossierChoisi({ deal_id: e.detail.contexte.deal_id, titre: e.detail.contexte.titre || e.detail.contexte.deal_id }); setTimeout(() => { champRef.current?.focus(); champRef.current?.setSelectionRange?.(t.length, t.length); }, 30); };
    window.addEventListener("klocka:composer", composer);
    // Un mot de l'assistant posé par la page (l'avis envoyé, 27 oct. 2026) : il entre dans le fil, sans appel au modèle.
    const dire = (e) => { const t = e?.detail?.texte; if (t) pousser({ role: "assistant", contenu: t }); };
    window.addEventListener("klocka:dire", dire);
    return () => { window.removeEventListener("klocka:assistant", focaliser); window.removeEventListener("klocka:composer", composer); window.removeEventListener("klocka:dire", dire); };
  }, [choixDossier]);

  const historique = () => fil.filter((m) => m.role === "user" || m.role === "assistant").slice(-12);
  // Les sources cochées et la compétence choisie, pour les chats de l'avis et du mandat (26 oct. 2026).
  const reglagesEnvoyes = () => ({
    ...(reglagesRef.current?.sources?.length ? { sources: reglagesRef.current.sources } : {}),
    ...(reglagesRef.current?.competence ? { competence: reglagesRef.current.competence.nom } : {}),
    ...(reglagesRef.current?.vue ? { vue: reglagesRef.current.vue } : {}),
  });
  const pousser = (m) => setFil((f) => [...f, m.le ? m : { ...m, le: new Date().toISOString() }]);
  // Une pièce jointe envoyée (19 oct. 2026, Jules) : le texte reste « 📎 nom — phrase » (titre, historique pour
  // Haka) ; l'écran montre la vignette du document au-dessus de la bulle, calculée juste après l'envoi.
  // Plusieurs pièces (27 oct. 2026) : « 📎 a.pdf · b.jpg — phrase », une vignette chacune.
  const pousserPiece = (liste, t) => {
    const lot = liste.map((f) => ({ f, pid: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}` }));
    pousser({ role: "user", contenu: `📎 ${liste.map((f) => f.name).join(" · ")}${t ? ` — ${t}` : ""}`, pieces: lot.map(({ f, pid }) => ({ pid, nom: f.name, genre: genreDeFichier(f.name, f.type), apercu: null })) });
    for (const { f, pid } of lot) {
      apercuDuFichier(f).then((apercu) => {
        if (apercu) setFil((l) => l.map((x) => (x.pieces?.some((p) => p.pid === pid) ? { ...x, pieces: x.pieces.map((p) => (p.pid === pid ? { ...p, apercu } : p)) } : x)));
      });
    }
  };

  const rafraichir = () => {
    for (const k of prospectionId
      ? [["m-prospection", prospectionId], ["m-listes"], ["mandataire-prospections"]]
      : prospection
      ? ["mandataire-prospections"]
      : mandataire
      ? ["mandataire-jour", "mandataire-proprietaires", "mandataire-prospections", "m-dossier-vente", "m-teaser"]
      : ["assistant-propositions", "echeances", "relances-agents", "dossiers", "all-users", "projets-clients"]) {
      queryClient.invalidateQueries({ queryKey: Array.isArray(k) ? k : [k] });
    }
  };

  const lireActions = (r) => {
    const mail = (r.actions || []).find((a) => a.name === "preparer_mail" && a.resultat?.brouillon);
    if (mail) {
      setBrouillon(brouillonDepuis(mail.resultat));
    }
    const propositions = [];
    for (const a of (r.actions || []).filter((a) => a.name !== "preparer_mail")) {
      if (a.resultat?.url) propositions.push({ libelle: "Ouvrir la fiche", principal: true, href: a.resultat.url });
      if (a.resultat?.deal_id && a.name === "creer_dossier") propositions.push({ libelle: "Ouvrir le dossier", principal: true, href: `/Dossiers?deal_id=${a.resultat.deal_id}` });
      if (a.resultat?.cree) propositions.push({ libelle: "Annuler", texte: "annule ça" });
    }
    return propositions.slice(0, 3);
  };

  // Le mandataire : chaque écriture revient avec de quoi la défaire.
  const annulerAction = async (a) => {
    try {
      if (a.type === "proprietaire") await base44.request("DELETE", `/api/mandataire/proprietaires/${encodeURIComponent(a.id)}`);
      else await base44.request("POST", `/api/mandataire/rappels/${encodeURIComponent(a.id)}/supprimer`);
      setFil((f) => f.map((m) => (m.cartes ? { ...m, cartes: m.cartes.map((c) => (c.titre === a.titre ? { ...c, etat: "annule" } : c)) } : m)));
      pousser({ role: "assistant", contenu: `Annulé : ${a.titre}.` });
      setSuites((l) => l.filter((x) => x.cle !== a.id));
      rafraichir();
    } catch (e) {
      toast.error(e?.message || "Annulation impossible");
    }
  };
  // Une étape de bien proposée par Haka se confirme d'un tap (25 oct. 2026, Jules) : rien n'est écrit avant.
  const confirmerEtape = async (a) => {
    try {
      // La mise en vente proposée par Haka (27 oct. 2026) : elle se fait au tap.
      if (a.type === "confirmer_vente") {
        await base44.request("POST", `/api/mandataire/dossiers/${encodeURIComponent(a.dossier_id)}/vente`);
        pousser({ role: "assistant", contenu: `C'est fait : ${a.titre} est en vente. La commercialisation s'ouvre : les visites, puis les offres, se suivent ici.` });
        setSuites((l) => l.filter((x) => x.cle !== a.id));
        ["m-dossiers", "m-marches", "m-dossier-vente"].forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }));
        return;
      }
      // La restitution de l'avis (27 oct. 2026) : le statut et la relance datée s'écrivent au tap.
      if (a.type === "confirmer_restitution") {
        const r = await base44.request("POST", `/api/mandataire/proprietaires/${encodeURIComponent(a.proprietaire_id)}/restitution`, { body: { cas: a.cas, prix: a.prix, date: a.date, motif: a.motif, relance_le: a.relance_le, relance_quoi: a.relance_quoi, canal: a.canal } });
        const accord = r?.plan?.statut === "prix_accord";
        pousser({ role: "assistant", contenu: accord
          ? `C'est noté : ${a.mot} pour ${a.titre}, le prix est sur la fiche du bien. On passe au mandat.`
          : `C'est noté : ${a.titre} passe en ${a.mot}. ${r?.plan?.relance ? `Prochaine action : ${r.plan.relance.quoi}, le ${new Date(r.plan.relance.le).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}.` : ""}`.trim() });
        if (a.alerte) toast.warning(a.alerte);
        setSuites((l) => l.filter((x) => x.cle !== a.id));
        rafraichir();
        // Le prix d'accord noté, le bien passe au Mandat (27 oct. 2026, Jules) : la page du bien ouvre l'étape.
        if (accord) setTimeout(() => window.dispatchEvent(new CustomEvent("klocka:aller-etape", { detail: { proprietaire_id: a.proprietaire_id, etape: "mandat" } })), 1200);
        return;
      }
      if (a.etape === "prix_accord" && a.prix) await base44.request("POST", `/api/mandataire/proprietaires/${encodeURIComponent(a.proprietaire_id)}/prix-accord`, { body: { prix: a.prix } });
      else await base44.request("POST", `/api/mandataire/proprietaires/${encodeURIComponent(a.proprietaire_id)}/etape`, { body: { etape: a.etape } });
      pousser({ role: "assistant", contenu: `C'est noté : ${a.titre} passe en ${a.mot}.` });
      setSuites((l) => l.filter((x) => x.cle !== a.id));
      rafraichir();
    } catch (e) {
      toast.error(e?.message || "Étape non enregistrée");
    }
  };
  const suitesMandataire = (r) => (r.actions || []).filter((a) => a.type !== "monday" && a.type !== "piece").slice(0, 3).map((a) => (a.type === "confirmer_etape" || a.type === "confirmer_restitution" || a.type === "confirmer_vente" ? {
    cle: a.id,
    libelle: `Confirmer · ${a.mot}`,
    principal: true,
    faire: () => confirmerEtape(a),
  } : {
    cle: a.id,
    libelle: (r.actions || []).length > 1 ? `Annuler · ${a.titre}` : "Annuler",
    faire: () => annulerAction(a),
  }));

  // La boîte : le serveur classe et fait ; on affiche selon ce qu'il a fait.
  // Une requête qu'on ne veut plus attendre s'interrompt.
  // La recherche multicritère ouverte en grand : { ville, rue } déjà donnés dans le fil.
  const [fenetre, setFenetre] = useState(null);
  const controleur = useRef(null);
  // Quitter la page coupe la requête : la réponse n'a plus où s'afficher.
  useEffect(() => () => controleur.current?.abort(), []);
  // Les actions déjà faites, reçues au fil de l'eau : un Stop ne les efface pas.
  const actionsVives = useRef([]);
  const boite = useMutation({
    mutationFn: async ({ t, type, piece = null }) => {
      controleur.current = new AbortController();
      // Une pièce jointe du mandataire : envoyée avec le message, lue par le
      // serveur — en flux, pour que la lecture et chaque étape s'affichent au
      // moment où elles se font, au lieu d'un point qui clignote sans rien dire.
      if (mandataire && piece?.length) {
        const form = new FormData();
        for (const f of piece) form.append("fichier", f);
        form.append("texte", t || "");
        form.append("historique", JSON.stringify(historique()));
        if (prospectionId) form.append("prospection_id", prospectionId);
        if (proprietaireId) form.append("proprietaire_id", proprietaireId);
        if (dossierVenteId) form.append("dossier_vente_id", dossierVenteId);
        if (marcheId) form.append("marche_id", marcheId);
        if (proprietaireId && dansLeFil) form.append("dans_le_fil", "1");
        if (espace === "mandataire" && reglagesRef.current?.sortie) form.append("sortie", reglagesRef.current.sortie);
        if (espace === "mandataire" && choixDossier && dossierChoisi) form.append("dossier_id", dossierChoisi.deal_id);
        if (reglagesRef.current?.competence) form.append("competence", reglagesRef.current.competence.nom);
        if (reglagesRef.current?.sources?.length) form.append("sources", JSON.stringify(reglagesRef.current.sources));
        if (reglagesRef.current?.vue) form.append("vue", JSON.stringify(reglagesRef.current.vue));
        if (estimation && mode) form.append("mode", mode);
        if ((estimation || mandatEspace) && conversationId) form.append("conversation_id", conversationId);
        if (estimation && selectionAvis?.chemin) form.append("selection", JSON.stringify({ chemin: selectionAvis.chemin, texte: selectionAvis.texte || null }));
        setEnFlux(true);
        actionsVives.current = [];
        const r = await base44.flux(`${E.api}/chat?flux=1${estimation ? "&espace=estimation" : mandatEspace ? "&espace=mandat" : ""}`, {
          body: form, isForm: true, signal: controleur.current.signal, surEtape, surTexte,
          surAction: (a) => actionsVives.current.push(a),
        });
        await vider();
        return r;
      }
      if (estimation) {
        setEnFlux(true);
        const r = await base44.flux(`${E.api}/chat?flux=1&espace=estimation`, { body: { texte: t, historique: historique(), mode, conversation_id: conversationId, selection: selectionAvis?.chemin ? { chemin: selectionAvis.chemin, texte: selectionAvis.texte || null } : null, ...reglagesEnvoyes() }, signal: controleur.current.signal, surEtape });
        await vider();
        return r;
      }
      if (mandatEspace) {
        setEnFlux(true);
        const r = await base44.flux(`${E.api}/chat?flux=1&espace=mandat`, { body: { texte: t, historique: historique(), conversation_id: conversationId, ...reglagesEnvoyes() }, signal: controleur.current.signal, surEtape });
        await vider();
        return r;
      }
      if (prospection) {
        setEnFlux(true);
        const demande_ids = clientsChoisis.current;
        clientsChoisis.current = [];
        // « Pour un client » garde le moteur ALX ; le reste passe par le chat
        // Data Prospective, même structure que le chat du dashboard.
        const r = demande_ids.length
          ? await base44.flux(`${E.api}/prospections/lancer?flux=1`, { body: { phrase: t, demande_ids }, signal: controleur.current.signal, surEtape })
          : await base44.flux(`${E.api}/chat?flux=1&espace=prospection`, { body: { texte: t, historique: historique() }, signal: controleur.current.signal, surEtape });
        await vider();
        return r;
      }
      // Le serveur dit ce qu'il fait au moment où il le fait : les étapes arrivent une à une.
      setEnFlux(true);
      actionsVives.current = [];
      // Une pièce jointe avec une phrase (12 oct. 2026, « vérifie ma préz ») : AK reçoit les deux, au lieu d'en faire d'office un dossier.
      if (!mandataire && piece?.length) {
        const form = new FormData();
        for (const f of piece) form.append("fichier", f);
        form.append("texte", t);
        form.append("historique", JSON.stringify(historique()));
        if (avecContexte) form.append("contexte", JSON.stringify(contexteEnvoye()));
        const r = await base44.flux("/api/assistant/boite?flux=1", { body: form, isForm: true, signal: controleur.current.signal, surEtape, surTexte });
        await vider();
        return r;
      }
      const r = mandataire
        ? await base44.flux(`${E.api}/chat?flux=1`, { body: { texte: t, historique: historique(), ...(prospectionId ? { prospection_id: prospectionId } : {}), ...(proprietaireId ? { proprietaire_id: proprietaireId, ...(dansLeFil ? { dans_le_fil: true } : {}) } : {}), ...(dossierVenteId ? { dossier_vente_id: dossierVenteId } : {}), ...(marcheId ? { marche_id: marcheId } : {}),
          // Haka du mandataire (19 oct. 2026) : « Répondre / Produire » et le dossier choisi partent avec le message.
          ...(espace === "mandataire" && reglagesRef.current?.sortie ? { sortie: reglagesRef.current.sortie } : {}),
          ...(espace === "mandataire" && choixDossier && dossierChoisi ? { dossier_id: dossierChoisi.deal_id } : {}),
          ...(espace === "mandataire" && reglagesRef.current?.competence ? { competence: reglagesRef.current.competence.nom } : {}),
          // Les sources cochées par le mandataire (26 oct. 2026) : Haka ne lit qu'elles.
          ...(espace === "mandataire" && reglagesRef.current?.sources?.length ? { sources: reglagesRef.current.sources } : {}), ...(E.client ? { presentation_id: contexte?.presentation_id || null } : {}) }, signal: controleur.current.signal, surEtape, surTexte, surAction: (a) => actionsVives.current.push(a) })
        : await base44.flux("/api/assistant/boite?flux=1", { body: { texte: t, historique: historique(), type: pageEnvoi ? "assistant" : type, ...(avecContexte ? { contexte: contexteEnvoye() } : {}) }, signal: controleur.current.signal, surEtape, surTexte });
      // La réponse attend que la dernière étape se soit affichée.
      await vider();
      return r;
    },
    onSettled: () => { setEnFlux(false); setTexteVif(); tourVif.current = -1; },
    onSuccess: (r) => {
      rafraichir();
      // La mémoire des outils (ce qu'AK a lu ou fait) part avec le message : au tour suivant, il s'en souvient (13 oct. 2026).
      const extra = { etapes: vivesRef.current.length ? vivesRef.current : etapesDe(r, etapesRef.current), cartes: cartesDe(r), ...(r.memoire ? { memoire: r.memoire } : {}) };
      if (estimation) {
        pousser({
          role: "assistant",
          contenu: r.texte || "(sans réponse)",
          etapes: vivesRef.current.length ? vivesRef.current : etapesRef.current,
          ...(r.avis || r.envoi ? { cartes: [
            ...(r.avis ? [{ titre: "Avis de valeur", detail: r.avis.valeur ? `${Number(r.avis.valeur).toLocaleString("fr-FR")} € · fourchette ${Number(r.avis.bas).toLocaleString("fr-FR")} – ${Number(r.avis.haut).toLocaleString("fr-FR")} €` : "Valeur et champs manquants à compléter dans l'éditeur", etat: "fait", lien: `avis:${r.avis.estimation_id}`, action: "Ouvrir l'avis" }] : []),
            ...(r.envoi ? [{ titre: "Mail au propriétaire", detail: `${r.envoi.objet} · l'avis en PDF joint`, etat: "fait", lien: `envoi:${r.envoi.estimation_id}`, action: "Relire et envoyer" }] : []),
          ] } : {}),
        });
        if (r.avis) onRecherche?.({ avis_id: r.avis.estimation_id });
        if (r.envoi) window.dispatchEvent(new CustomEvent("klocka:envoyer-avis", { detail: { estimation_id: r.envoi.estimation_id } }));
        onReponse?.(r);
        setSuites(suitesMandataire(r));
        return;
      }
      if (mandatEspace) {
        const m = r.mandat;
        const pret = m && (m.document || m.mynotary_url);
        pousser({
          role: "assistant",
          contenu: r.texte || "(sans réponse)",
          etapes: vivesRef.current.length ? vivesRef.current : etapesRef.current,
          ...(pret ? { cartes: [{ titre: "Mandat MyNotary", detail: "Le PDF téléchargé et le lien pour le compléter sur MyNotary", etat: "fait", lien: `mandat:${m.mandat_id}`, action: "Ouvrir" }] } : {}),
        });
        // Le PDF revenu : la fenêtre s'ouvre d'elle-même.
        if (pret) onRecherche?.({ mandat_id: m.mandat_id });
        onReponse?.(r);
        setSuites([]);
        return;
      }
      if (prospection) {
        // Le moteur ALX (« pour un client ») rend une prospection ALX.
        if (r.prospection_id) {
          const c = r.criteres || {};
          pousser({
            role: "assistant",
            contenu: `C'est parti pour ${c.ville || "votre secteur"}. La prospection s'ouvre sur sa page : la carte d'ALX, les rues qui se tracent, puis les commerces à cocher et à exporter vers une liste.`,
            etapes: vivesRef.current.length ? vivesRef.current : etapesRef.current,
            cartes: [{ titre: r.prospection_nom || "Prospection", detail: [c.activites?.length ? c.activites.join(", ") : "tous les commerces", c.ville].filter(Boolean).join(" · "), etat: "fait", lien: `resultats:${r.prospection_id}`, action: "Voir la prospection" }],
          });
          setSuites([]);
          onRecherche?.(r);
          return;
        }
        // Le chat Data Prospective : une réponse, parfois le formulaire, parfois la prospective lancée.
        const extra2 = { etapes: vivesRef.current.length ? vivesRef.current : etapesRef.current, ...(r.memoire ? { memoire: r.memoire } : {}) };
        pousser({
          role: "assistant",
          contenu: r.texte || "(sans réponse)",
          ...extra2,
          ...(r.prospective ? { cartes: [{ titre: r.prospective.nom, detail: "Data Prospective", etat: "fait", lien: `datab:${r.prospective.jeton}`, action: "Voir les résultats" }] } : {}),
        });
        if (r.formulaire) {
          const zone = { ville: r.formulaire.ville || null, rue: r.formulaire.rue || null };
          pousser({ role: "bloc", type: "criteres", donnees: zone });
          setFenetre(zone);
        }
        if (r.prospective) onRecherche?.({ datab_jeton: r.prospective.jeton });
        // La question du mode arrive avec ses deux boutons : un clic envoie le choix.
        setSuites(Array.isArray(r.boutons) ? r.boutons : []);
        return;
      }
      if (mandataire) {
        if (embarque) {
          poser("succes", r.prospection_modifiee ? "Prospection mise à jour" : "Réponse", {
            id: notif.current || undefined,
            duration: 12000,
            description: <><EtapesNotif etapes={vivesRef.current} />{r.texte && <p className="m-0 mt-2 text-[14px] leading-[1.55] text-encre">{r.texte}</p>}</>,
          });
          notif.current = null;
        }
        if (r.prospection_modifiee && prospectionId) {
          queryClient.invalidateQueries({ queryKey: ["m-prospection", prospectionId] });
          queryClient.invalidateQueries({ queryKey: ["mandataire-prospections"] });
        }
        // Le client : la présentation à droite se relit si AK l'a retouchée.
        if (E.client) onReponse?.(r);
        pousser({ role: "assistant", contenu: r.texte || "(sans réponse)", ...extra });
        if (r.brouillon) setBrouillon({ destinataire: r.brouillon.destinataire || "", objet: r.brouillon.objet || "", corps: r.brouillon.corps || "", dossier_vente: r.brouillon.dossier_vente || null });
        // Les réponses en un tap que l'assistant propose (« Passer à l'estimation ? » Oui / Non, 27 oct. 2026).
        setSuites([...suitesMandataire(r), ...(Array.isArray(r.boutons) ? r.boutons.map((b) => ({ cle: b.libelle, libelle: b.libelle, texte: b.texte, href: b.href || null, principal: !!b.principal })) : [])]);
        return;
      }
      if (r.type === "note") {
        pousser({ role: "assistant", contenu: r.texte || "Noté.", ...extra });
        onReponse?.(r);
        const p = [];
        if (r.dossier?.lien) p.push({ libelle: "Ouvrir le dossier", principal: true, href: r.dossier.lien });
        if (r.agent?.url) p.push({ libelle: "Fiche Twenty CRM de l'agent", externe: r.agent.url });
        setSuites(p);
      } else if (r.type === "fiche") {
        pousser({ role: "assistant", contenu: "La fiche est lue : le dossier est créé.", ...extra });
        pousser({ role: "bloc", type: "fiche", donnees: r });
        setSuites([]);
        onReponse?.(r);
      } else if (r.type === "client") {
        setFiche(r.champs);
        pousser({ role: "assistant", contenu: "J'ai lu un compte rendu d'appel de découverte : voici la fiche. Relisez, corrigez, puis créez le client.", ...extra });
        setSuites([]);
      } else if (r.type === "echeances") {
        pousser({ role: "assistant", contenu: "Voici ce qui attend.", ...extra });
        pousser({ role: "bloc", type: "echeances", donnees: r });
        setSuites([]);
      } else {
        pousser({ role: "assistant", contenu: r.texte || "(sans réponse)", ...extra, ...(r.sources ? { sources: r.sources } : {}) });
        if (r.brouillon) setBrouillon(brouillonDepuis(r.brouillon));
        const suitesAk = lireActions(r);
        // Ce qu'AK a choisi de faire et que l'écran montre (1.8) : la fiche analysée, la fiche client, les échéances, la note d'appel.
        for (const b of r.blocs || []) {
          if (b.type === "client") setFiche(b.champs);
          if (b.type === "echeances") pousser({ role: "bloc", type: "echeances", donnees: {} });
          if (b.type === "note") { if (b.dossier) suitesAk.push({ libelle: "Ouvrir le dossier", principal: true, href: b.dossier }); if (b.agent) suitesAk.push({ libelle: "Fiche Twenty CRM de l'agent", externe: b.agent }); }
          if (b.type === "fiche") {
            Promise.all([
              base44.request("GET", `/api/preanalyse/dossiers/${b.deal_id}`).catch(() => null),
              base44.request("GET", `/api/preanalyse/dossiers/${b.deal_id}/clients`).catch(() => null),
            ]).then(([d, c]) => pousser({ role: "bloc", type: "fiche", donnees: { deal_id: b.deal_id, lot: d?.lots?.[0] || null, titre: d?.titre || null, clients: c?.clients || [] } }));
          }
        }
        setSuites(suitesAk);
        onReponse?.(r);
      }
    },
    onError: (e) => {
      if (embarque) {
        if (e?.name === "AbortError") avis.fermer(notif.current); else poser("erreur", "Je n'ai pas pu le faire", { id: notif.current || undefined, description: e?.message || "erreur" });
        notif.current = null;
      }
      if (e?.name === "AbortError") {
        // Arrêté en route : ce qui a été fait avant le Stop reste, avec son Annuler.
        if (actionsVives.current.length) {
          rafraichir();
          pousser({
            role: "assistant",
            contenu: "Arrêté. Ce qui était déjà fait reste en place :",
            etapes: vivesRef.current,
            cartes: actionsVives.current.filter((a) => a.type !== "confirmer_etape" && a.type !== "confirmer_restitution").map((a) => ({ titre: a.titre, detail: a.pour || null, etat: a.etat === "rate" ? "rate" : "fait", lien: a.lien || null })),
          });
          setSuites(suitesMandataire({ actions: actionsVives.current }));
          actionsVives.current = [];
        }
        return null;
      }
      // Plus de crédit chez Anthropic : une phrase, pas le JSON de l'API (16 oct. 2026, Jules).
      // Le serveur envoie déjà la phrase ; l'ancienne erreur brute de l'API est aussi reconnue (un serveur pas encore mis à jour).
      if (/credit balance is too low|je n'ai plus de crédits/i.test(String(e?.message || ""))) return pousser({ role: "assistant", contenu: "Désolé je n'ai plus de crédits ! :(" });
      return pousser({ role: "assistant", contenu: prospection ? e?.message || "Recherche impossible" : `Impossible : ${e?.message || "erreur"}` });
    },
  });

  const analyser = useMutation({
    mutationFn: async (f) => {
      const form = new FormData();
      form.append("fichier", f);
      controleur.current = new AbortController();
      const r = await base44.request("POST", "/api/preanalyse/analyser", { body: form, isForm: true, signal: controleur.current.signal });
      let titre = null;
      let clients = null;
      try {
        const d = await base44.request("GET", `/api/preanalyse/dossiers/${r.deal_id}`);
        titre = d?.titre || null;
      } catch { /* le titre du lot suffit */ }
      try {
        const c = await base44.request("GET", `/api/preanalyse/dossiers/${r.deal_id}/clients`);
        clients = c?.clients || [];
      } catch { /* sans Twenty CRM, pas de correspondance */ }
      return { ...r, titre, clients };
    },
    onSuccess: (r) => {
      rafraichir();
      setJointes([]);
      pousser({ role: "assistant", contenu: "La fiche est lue : le dossier est créé.", etapes: etapesRef.current });
      pousser({ role: "bloc", type: "fiche", donnees: r });
    },
    onError: (e) => e?.name === "AbortError" ? null : pousser({ role: "assistant", contenu: `Analyse impossible : ${e?.message || "erreur"}` }),
  });

  // Le mandataire envoie de sa propre boîte quand elle est connectée (28 oct. 2026, Jules) ; sinon sa messagerie.
  const boiteMandataire = useQuery({ queryKey: ["m-boite"], queryFn: () => base44.request("GET", "/api/mandataire/boite"), enabled: mandataire, staleTime: 60_000 });
  const saBoite = mandataire ? boiteMandataire.data?.boite?.email || null : null;
  const envoyerMail = useMutation({
    mutationFn: () => (mandataire
      ? base44.request("POST", "/api/mandataire/mail/envoyer", { body: { a: brouillon.destinataire, objet: brouillon.objet, corps: brouillon.corps, dossier_vente: brouillon.dossier_vente || null } }).then((r) => ({ success: true, ...r }))
      : base44.functions.invoke("sendMail", envoiDepuis(brouillon))),
    onSuccess: (r) => {
      if (r?.success || r?.simulated) {
        toast.success(r?.simulated ? "Envoi simulé" : "Mail envoyé", { description: brouillon.destinataire });
        const n = r?.pieces_jointes?.length || 0;
        pousser({ role: "assistant", contenu: `Mail envoyé à ${brouillon.destinataire}${n ? `, avec ${n} pièce${n > 1 ? "s" : ""} jointe${n > 1 ? "s" : ""}` : ""}.` });
        setBrouillon(null);
        rafraichir();
      } else toast.error(r?.error || "Envoi impossible");
    },
    onError: (e) => toast.error(e?.message || "Envoi impossible"),
  });

  const creer = useMutation({
    mutationFn: (champs) => base44.request("POST", "/api/admin/clients/decouverte/creer", { body: { champs } }),
    onSuccess: (r) => {
      setFiche(null);
      pousser({ role: "bloc", type: "client", donnees: r });
      rafraichir();
      if (r.rates?.length && !r.fait?.length) toast.error(r.rates[0]);
    },
    onError: (e) => toast.error(e?.message || "Création impossible"),
  });

  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [fil, fiche, brouillon]);

  const enCours = boite.isPending || analyser.isPending;

  // Un rappel : la phrase est lue, le rappel est noté, il reviendra sous le chat.
  const rappeler = useMutation({
    // L'autorisation de notifier se demande ici : au moment où l'on pose un
    // rappel, pas au chargement de la page où elle n'aurait aucun sens.
    mutationFn: (t) => { demanderNotifications(); return base44.request("POST", "/api/assistant/rappels", { body: { texte: t } }); },
    onSuccess: (r) => {
      const d = new Date(r.rappel.echeance);
      pousser({ role: "assistant", etapes: etapesRef.current, cartes: [{ titre: `Rappel créé : ${r.rappel.titre || "rappel"}`, detail: d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }), etat: "fait" }], contenu: `Noté : ${r.rappel.titre || "rappel"}${r.rappel.telephone ? ` au ${telLisible(r.rappel.telephone)}` : ""} le ${d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}. Le rappel s'affichera ici ce jour-là.` });
      queryClient.invalidateQueries({ queryKey: ["ce-qui-attend"] });
    },
    onError: (e) => pousser({ role: "assistant", contenu: e?.message || "Je n'ai pas pu noter ce rappel." }),
  });

  const travaille = enCours || rappeler.isPending;
  // Embarqué : la notification suit le travail de l'agent, étape par étape.
  // Fermée à la croix, elle ne revient pas ; la réponse finale s'affiche quand même.
  const notif = useRef(null);
  const notifFermee = useRef(false);
  useEffect(() => {
    if (!embarque || !travaille) return;
    if (!notif.current) { notif.current = `chat-${Date.now()}`; notifFermee.current = false; }
    if (notifFermee.current) return;
    poser("en_cours", "Je m'en occupe", { id: notif.current, surFermeture: () => { notifFermee.current = true; }, description: <EtapesNotif etapes={etapesVives.length ? etapesVives : ["Lecture de la demande"]} enCours /> });
  }, [embarque, travaille, etapesVives]);
  // La page voisine (l'aperçu à droite) suit le travail en cours et ses étapes.
  useEffect(() => { onTravail?.({ enCours: travaille, etapes: etapesVives }); }, [onTravail, travaille, etapesVives]);
  useEffect(() => {
    if (!enFlux) return undefined;
    const t = setInterval(() => {
      if (!fileRef.current.length) return;
      vivesRef.current = [...vivesRef.current, fileRef.current.shift()];
      setEtapesVives(vivesRef.current);
    }, 450);
    return () => clearInterval(t);
  }, [enFlux]);
  useEffect(() => {
    if (!travaille) return undefined;
    const t = setInterval(() => setEtapeCourante((i) => Math.min(i + 1, Math.max(0, etapesRef.current.length - 1))), 950);
    return () => clearInterval(t);
  }, [travaille]);

  // Le fil prend l'écran dès le premier message envoyé (tableau de bord seulement).
  // `filVide` (éditeur de projet, 14 oct. 2026, Jules) : le chat s'ouvre déjà en fil, barre du haut et saisie en bas, cette phrase au milieu tant qu'il est vide.
  // `lireEcran` (14 oct. 2026) : la page dit ce qu'elle affiche au moment de l'envoi (texte, élément cliqué, saisie pas encore enregistrée).
  const contexteEnvoye = () => {
    let ecran = null;
    try { ecran = lireEcran?.() || null; } catch { ecran = null; }
    const r = reglagesRef.current;
    return { page: pageEnvoi, ...(choixDossier && dossierChoisi ? { deal_id: dossierChoisi.deal_id } : {}), ...(r ? { sortie: r.sortie, sources: (r.sources || []).map((c) => ({ cle: c, nom: sourceDe(c).nom })), ...(r.competence ? { competence: r.competence.cle, sources_eteintes: (r.eteintes || []).map((c) => ({ cle: c, nom: sourceDe(c).nom })) } : {}) } : {}), ...(contexte || {}), ...(ecran ? { ecran } : {}), haka: { longueur: prefsHaka.haka_longueur, tableaux: prefsHaka.haka_tableaux } };
  };
  const conversation = (!!onConversation && fil.some((m) => m.role === "user" || m.reprise)) || !!filVide;
  useEffect(() => { onConversation?.(conversation); }, [conversation, onConversation]);
  // « Dashboard » ou « Nouveau chat » dans la barre latérale : retour au départ.
  const location = useLocation();
  const cleLieu = useRef(location.key);
  useEffect(() => {
    if (location.key === cleLieu.current) return;
    cleLieu.current = location.key;
    if (onConversation) nouvelleConversation();
    // Seul le changement de clé compte : la fonction change à chaque rendu.
     
  }, [location.key]);
  const titreConversation = titreSauve || (fil.find((m) => m.role === "user")?.contenu || "Conversation").replace(/\s+/g, " ").slice(0, 70);
  const renommerConversation = () => {
    const t = (titreEdite || "").replace(/\s+/g, " ").trim();
    setTitreEdite(null);
    if (!t || t === titreConversation || !conversationId) return;
    const avant = titreSauve;
    setTitreSauve(t);
    base44.request("PATCH", `${E.api}/conversations/${conversationId}${qs}`, { body: { titre: t } })
      .then((r) => { if (r?.titre) setTitreSauve(r.titre); queryClient.invalidateQueries({ queryKey: ["assistant-conversations", E.api, qs] }); })
      .catch((e) => { setTitreSauve(avant); toast.error(e?.message || "Impossible de renommer"); });
  };
  // La page tient la colonne Historique : le bouton la bascule, un clic dans
  // la liste rouvre la conversation ici.
  const basculerHistorique = () => setHistoriqueOuvert((v) => { const n = !v; onHistorique?.(n); return n; });
  useEffect(() => {
    if (!onHistorique) return undefined;
    const ouvrirDepuis = (e) => {
      if (e.detail?.api !== E.api || (e.detail?.qs || "") !== qs) return;
      // Deux chats sur la même page (les messages d'AK en bas à gauche, 16 oct. 2026) : chacun n'ouvre que ce qui le vise.
      if ((e.detail?.cible || null) !== cible) return;
      // Sans conversation gardée (une offre d'avant, celle d'un collègue), le fil part du message de reprise.
      const secours = e.detail.secours;
      if (!e.detail.id && secours) { ouvrirConversation({ id: null, messages: secours }); return; }
      base44.request("GET", `${E.api}/conversations/${e.detail.id}${qs}`)
        .then((c) => { ouvrirConversation(c); onHistorique(false); })
        .catch(() => { if (secours) ouvrirConversation({ id: null, messages: secours }); else toast.error("Conversation introuvable"); });
    };
    window.addEventListener("klocka:ouvrir-conversation", ouvrirDepuis);
    return () => window.removeEventListener("klocka:ouvrir-conversation", ouvrirDepuis);
    // La conversation s'ouvre avec les fonctions du rendu courant.
     
  }, [onHistorique, E.api, qs, cible]);
  const ouvrirLien = (lien) =>
    String(lien).startsWith("resultats:") ? onOuvrirResultats?.(String(lien).slice(10))
    : String(lien).startsWith("datab:") ? onRecherche?.({ datab_jeton: String(lien).slice(6) })
    : String(lien).startsWith("avis:") ? onRecherche?.({ avis_id: String(lien).slice(5) })
    : String(lien).startsWith("mandat:") ? onRecherche?.({ mandat_id: String(lien).slice(7) })
    // Le mail qui part avec l'avis (27 oct. 2026) : la page du bien ouvre sa fenêtre d'envoi.
    : String(lien).startsWith("envoi:") ? window.dispatchEvent(new CustomEvent("klocka:envoyer-avis", { detail: { estimation_id: String(lien).slice(6) } }))
    : String(lien).startsWith("fichier:") ? telecharger(String(lien).slice(8))
    : ouvrirLienExterne(lien);
  // Un fichier d'AK : le navigateur le télécharge avec son nom (le serveur l'a rangé dans uploads/ak).
  const telecharger = (url) => {
    const a = document.createElement("a");
    a.href = url;
    a.download = decodeURIComponent(url.split("/").pop() || "fichier").replace(/^[^-]+-/, "");
    document.body.appendChild(a);
    a.click();
    a.remove();
  };
  const ouvrirLienExterne = (lien) => (/^https?:/.test(lien) ? window.open(lien, "_blank", "noopener") : navigate(lien));

  const envoiEnVol = useRef(false);
  useEffect(() => { if (!boite.isPending && !analyser.isPending && !rappeler.isPending) envoiEnVol.current = false; }, [boite.isPending, analyser.isPending, rappeler.isPending]);
  const lancer = (contenu, type = null) => {
    // Une compétence choisie se lance sans texte : sa phrase part, avec le dossier s'il y en a un.
    const parDefaut = reglagesRef.current?.competence ? `${reglagesRef.current.competence.nom}${dossierChoisi ? ` du dossier « ${dossierChoisi.titre} »` : ""}.` : "";
    const t = (contenu ?? texte).trim() || parDefaut;
    // Une garde qui ne dépend pas du rendu (12 oct. 2026) : deux Entrée rapides partaient deux fois.
    if (enCours || rappeler.isPending || envoiEnVol.current) return;
    // Envoyer clôt la dictée : sinon le micro reste ouvert et la suite de ce
    // qu'on dit s'écrit dans la question suivante. On note l'envoi : arrêter la
    // dictée déclenche `onFin`, qui sans cela renverrait le même texte.
    // Aussi pendant la relecture finale (« finalisation ») : le texte propre ne
    // doit pas revenir remplir le champ après l'envoi.
    if (ecoute || finalisation) { envoiFait.current = true; if (ecoute) arreter(); }
    // « Rappelle-moi demain de… » dit dans le fil (19 oct. 2026) : un rappel, comme en mode Rappel.
    const ditUnRappel = !mode && espace === "admin" && /^\s*(rappelle[- ]moi|(mets|pose)[- ](moi )?un rappel)\b/i.test(t);
    if ((mode === "rappel" || ditUnRappel) && !jointes.length && !mandataire) {
      if (!t) return;
      annoncer("rappel");
      pousser({ role: "user", contenu: t });
      setTexte("");
      envoiEnVol.current = true; rappeler.mutate(t);
      return;
    }
    if (jointes.length && mandataire && !prospection) {
      pousserPiece(jointes, t);
      setTexte("");
      setSuites([]);
      setEnCoursTexte(jointes.length > 1 ? "Je lis les pièces…" : "Je lis la pièce…");
      annoncer("piece");
      const piece = jointes;
      setJointes([]);
      envoiEnVol.current = true; boite.mutate({ t, type: null, piece });
      return;
    }
    // Une pièce, avec ou sans phrase (1.8) : AK la lit et décide (fiche à analyser, préz à vérifier, pièce à ranger…).
    if (jointes.length && !prospection) {
      pousserPiece(jointes, t);
      setTexte("");
      setSuites([]);
      setEnCoursTexte(jointes.length > 1 ? "Je lis les pièces…" : "Je lis la pièce…");
      annoncer("piece");
      const piece = jointes;
      setJointes([]);
      envoiEnVol.current = true; boite.mutate({ t, type: null, piece });
      return;
    }
    if (jointes.length) {
      pousserPiece(jointes.slice(0, 1), t);
      setTexte("");
      setEnCoursTexte("Je lis la fiche et passe le bien à la grille…");
      annoncer("fiche");
      envoiEnVol.current = true; analyser.mutate(jointes[0]);
      return;
    }
    if (!t) return;
    pousser({ role: "user", contenu: t });
    setTexte("");
    setSuites([]);
    const choisi = E.modes.find((m) => m.id === mode) || null;
    setEnCoursTexte(choisi ? "Je m'en occupe…" : "Je fais le tri…");
    annoncer(type || choisi?.id || (/^(j'ai eu|eu au t|appel avec|note|pas de r[ée]ponse)/i.test(t) ? "note" : "defaut"));
    // En mode Mail, la consigne n'accompagne que le premier message du fil.
    // Ajoutée à chaque tour, elle contredisait la conversation : « Envoie »
    // arrivait au modèle enveloppé de « sans l'envoyer », et il s'abstenait en
    // disant que la demande se contredisait. Le refus d'envoyer sans accord est
    // déjà une règle du serveur, sa place est là-bas.
    const premierDuFil = !fil.some((m) => m.role === "user");
    envoiEnVol.current = true; boite.mutate({ t: mode === "mail" && premierDuFil ? `Écris un mail : ${t}` : t, type: type || choisi?.type || null });
  };
  // Un geste proposé par la page (le dossier de vente, 27 oct. 2026) part dans la conversation comme si on l'avait tapé.
  const lancerRef = useRef(lancer);
  lancerRef.current = lancer;
  useEffect(() => {
    const surLancer = (e) => { const t = e?.detail?.texte; if (t) lancerRef.current(t); };
    window.addEventListener("klocka:lancer", surLancer);
    return () => window.removeEventListener("klocka:lancer", surLancer);
  }, []);


  // Le micro : la dictée remplit le champ, et part quand on se tait si la
  // phrase ressemble à une note d'appel ; sinon on relit.
  // Vrai le temps d'un envoi déclenché à la main : la fin de dictée qui suit
  // ne doit pas renvoyer le même texte une seconde fois.
  const envoiFait = useRef(false);
  // Ce qui était déjà tapé au moment du clic reste en tête : la dictée s'y ajoute.
  const avantDictee = useRef("");
  // Une dictée annulée (la croix du mode micro, Échap) : son texte ne revient pas.
  const dicteeAnnulee = useRef(false);
  const { supporte, ecoute, demarrer, arreter, erreur, finalisation, niveau } = useDictee({
    onTexte: (t) => { if (!envoiFait.current && !dicteeAnnulee.current) setTexte([avantDictee.current, t].filter(Boolean).join(" ")); },
    onFin: (t) => {
      if (dicteeAnnulee.current) return;
      if (envoiFait.current) { envoiFait.current = false; return; }
      // Une note d'appel dictée part seule (admin) ; le reste attend d'être relu.
      // Elle part sans étiquette (1.8) : AK reconnaît lui-même une note d'appel.
      if (!mandataire && /^(j'ai eu|eu au t|appel avec|note)/i.test((t || "").trim())) lancer([avantDictee.current, t].filter(Boolean).join(" "));
    },
  });

  const cadreAura = useRef(null);
  // La lumière de la dictée s'éteint dès l'envoi (ou l'arrêt), sans attendre la fin de la transcription.
  const aura = lueur || (ecoute && !finalisation);
  useAuraPosee(cadreAura, ecoute);

  const corriger = (cle, valeur, unite) => {
    const v = valeur.trim();
    setFiche((f) => ({ ...f, [cle]: v === "" ? null : unite ? Number(String(v).replace(/[^\d.,]/g, "").replace(",", ".")) || null : v }));
  };

  const deposer = (e) => {
    e.preventDefault();
    setGlisse(false);
    joindre(e.dataTransfer?.files);
  };

  const aDuContenu = fil.length > 0 || fiche || brouillon;

  // Le mode choisi, et sa vignette. Sans mode, la barre fait le tri.
  const modeCourant = E.modes.find((m) => m.id === mode) || null;
  const IconeMode = modeCourant?.icone || SlidersHorizontal;
  // Une note collée tient rarement sur une ligne : la pilule s'arrondit.
  const multiligne = texte.includes("\n") || texte.length > 90;

  const annulerDictee = () => {
    dicteeAnnulee.current = true;
    arreter();
    setTexte(avantDictee.current);
    setTimeout(() => champRef.current?.focus(), 30);
  };
  const dicter = () => {
    if (!supporte) { toast.error("La dictée n'est pas prise en charge par ce navigateur", { description: "Chrome ou Edge la proposent." }); return; }
    if (ecoute) { arreter(); return; }
    dicteeAnnulee.current = false;
    avantDictee.current = texte.trim();
    demarrer();
  };
  // La page demande la dictée (26 oct. 2026, la Pré-visite : « Raconter la visite » ouvre Haka micro allumé).
  const ecouteRef = useRef(ecoute);
  ecouteRef.current = ecoute;
  const dicterRef = useRef(dicter);
  dicterRef.current = dicter;
  useEffect(() => {
    const ecouterDemande = () => { if (!ecouteRef.current) dicterRef.current(); };
    window.addEventListener("klocka:dicter", ecouterDemande);
    return () => window.removeEventListener("klocka:dicter", ecouterDemande);
  }, []);

  const barre = (
        <>
        {/* L'aura de la maquette de Jules (25 oct. 2026) : un halo flou qui tourne derrière la saisie, et un filet net sur
            son bord, synchronisés (index.css, « k-aura »). Toujours pour le chat des fiches ; pour tous pendant la dictée,
            où la lumière se pose sous le chat (l'horizon). Un message envoyé n'allume rien (25 oct. 2026, Jules). */}
        <div ref={cadreAura} className={aura ? "relative isolate" : "contents"}>
        {aura && <div className="k-aura-halo" aria-hidden />}
        {aura && <div className="k-aura-horizon" aria-hidden />}
        <div
          // Écrire se voit (26 oct. 2026, Jules : « on clique, on a rien ») : un clic n'importe où dans le cadre (hors boutons)
          // met le curseur dans le champ, et le cadre s'éclaire tant qu'on écrit.
          onMouseDown={(e) => { if (!e.target.closest("button, a, input, select, textarea, [role=menu], [role=listbox]")) { e.preventDefault(); champRef.current?.focus(); } }}
          className={`${aura ? "k-aura-filet relative " : ""}k-saisie-chat cursor-text rounded-[20px] border ${contour || "border-trait"} bg-barre px-5 pb-3 pt-4 max-md:px-4 max-md:pt-4 ${choixDossier && !conversation ? "shadow-[0_18px_40px_rgb(0_0_0/0.18)]" : "shadow-[0_12px_32px_rgb(0_0_0/0.07)]"}`}
          style={glisse ? { boxShadow: `0 0 0 1px ${J["menthe"]}` } : undefined}
        >
          <textarea
            ref={champRef}
            rows={Math.min(10, Math.max(choixDossier && !conversation ? 3 : 2, texte.split("\n").length))}
            value={texte}
            onChange={(e) => setTexte(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && (texte.trim() || jointes.length || reglages?.competence) && !enCours) { e.preventDefault(); lancer(); } }}
            placeholder={ecoute ? "Je vous écoute…" : glisse ? (mandataire ? "Déposez la pièce ici." : "Déposez la fiche ici.") : conversation && fil.length ? placeholderFil || "Répondre ou ajouter une précision…" : modeCourant?.placeholder || placeholderAccueil || E.placeholder || "Collez votre note, ou posez une question…"}
            disabled={enCours}
            className="block w-full resize-none border-0 bg-transparent text-[15px] leading-[1.5] text-encre outline-none placeholder:text-brume disabled:opacity-50 max-md:text-[16px]"
          />
          <input ref={fichierRef} type="file" accept=".pdf,.doc,.docx,.rtf,image/*,.txt,.md,.csv,.eml" multiple className="hidden" onChange={(e) => { joindre(e.target.files); e.target.value = ""; }} />

          {/* Pendant la dictée, la barre du mode micro : Annuler, l'onde, le minuteur, Envoyer. */}
          {ecoute && <BarreEcoute niveau={niveau} cadre={cadreAura} onAnnuler={annulerDictee} onEnvoyer={() => lancer()} />}
          <div className={`mt-4 flex flex-wrap items-center gap-1.5 max-md:flex-nowrap ${ecoute ? "hidden" : ""}`}>
            {E.fichier && <button
              type="button"
              onClick={() => fichierRef.current?.click()}
              aria-label={mandataire || espace === "dossier" ? "Joindre une pièce (bail, quittances, Kbis, photo…)" : "Déposer une fiche (PDF, Word, image, mail) — elle devient un dossier"}
              title={mandataire || espace === "dossier" ? "Joindre une pièce (bail, quittances, Kbis, photo…)" : "Déposer une fiche (PDF, Word, image, mail) — elle devient un dossier"}
              className="grid h-8 w-8 flex-none place-items-center rounded-full text-ardoise transition-colors hover:bg-barre-relief hover:text-encre"
              style={{ background: "transparent" }}
            >
              <Plus className="h-[18px] w-[18px]" strokeWidth={1.7} />
            </button>}
            {/* Les pièces jointes, dans la barre, à droite du « + » : une pastille chacune, retirable. */}
            {jointes.map((f) => (
              <span key={`${f.name}-${f.size}`} className="inline-flex min-w-0 max-w-[260px] items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] text-craie max-md:max-w-[160px]" style={{ background: J["barre-relief"] }}>
                <Paperclip className="h-3.5 w-3.5 flex-none text-menthe" />
                <span className="truncate">{f.name}</span>
                <button onClick={() => setJointes((l) => l.filter((x) => x !== f))} className="flex-none text-brume hover:text-alerte" aria-label={`Retirer ${f.name}`} title="Retirer" style={{ background: "transparent" }}><X className="h-3.5 w-3.5" /></button>
              </span>
            ))}
            {choixDossier && <ChoixDossier valeur={dossierChoisi} onChoisir={setDossierChoisi} versLeHaut={conversation || menusVersLeHaut} mandataire={espace === "mandataire"} />}
            {reglages?.competence && (
              <span className="inline-flex h-8 min-w-0 max-w-[260px] items-center gap-1.5 rounded-full bg-menthe/10 pl-2.5 pr-1 text-[13px] text-encre">
                <Sparkles className="h-3.5 w-3.5 flex-none text-menthe" />
                <span className="truncate">{reglages.competence.nom}</span>
                <button type="button" onClick={() => reglages.choisirCompetence(null)} aria-label="Retirer la compétence" title="Retirer la compétence" className="grid h-6 w-6 flex-none place-items-center rounded-full text-ardoise hover:text-encre" style={{ background: "transparent" }}><X className="h-3 w-3" /></button>
              </span>
            )}
            {/* Sans `setSortie` (le chat d'un dossier, 18 oct. 2026, Jules), pas de bascule : l'assistant choisit selon la demande. */}
            {reglages?.setSortie && <BasculeSortie sortie={reglages.sortie} onChange={reglages.setSortie} />}
            {E.boiteEnvoi && <BoiteEnvoi versLeHaut={conversation || menusVersLeHaut} />}
            {/* L'ampoule, en bas à gauche : des phrases toutes prêtes, posées
                dans le champ d'un clic, jamais envoyées toutes seules. */}
            {E.suggestionsAGauche && E.commandes.length > 0 && (
              <div className="relative">
                <button type="button" onClick={() => setSuggestionsOuvertes((o) => !o)} aria-expanded={suggestionsOuvertes} aria-haspopup="menu"
                  aria-label="Suggestions" title="Suggestions"
                  className="grid h-8 w-8 flex-none place-items-center rounded-full transition-colors hover:bg-barre-relief"
                  style={{ background: suggestionsOuvertes ? alpha("menthe", 0.12) : "transparent", color: suggestionsOuvertes ? J["menthe"] : J["craie"] }}>
                  <Lightbulb className="h-4 w-4" strokeWidth={1.7} />
                </button>
                {suggestionsOuvertes && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setSuggestionsOuvertes(false)} />
                    <div role="menu" className="animate-in fade-in slide-in-from-bottom-1 duration-150 absolute bottom-full left-0 z-20 mb-3 w-[300px] max-w-[calc(100vw-2rem)] rounded-bloc border border-trait p-1.5 text-left shadow-[0_20px_50px_rgb(0_0_0/0.16)]" style={{ background: J["barre"] }}>
                      {E.commandes.map((c) => (
                        <button key={c.texte} role="menuitem" type="button"
                          onClick={() => { setTexte(c.texte); setSuggestionsOuvertes(false); setTimeout(() => champRef.current?.focus(), 30); }}
                          className="w-full rounded-champ px-3 py-2 text-left text-[13px] leading-[1.5] text-craie transition-colors hover:bg-encre/[0.05] hover:text-encre"
                          style={{ background: "transparent" }}>
                          {c.texte}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
            {/* Une estimation lancée : le mode est choisi, il ne se rechoisit plus. */}
            {/* `epure` (le chat d'une fiche, 24 oct. 2026) : ni modes, ni historique. */}
            {!epure && E.modesAGauche && E.modes.length > 0 && !(estimation && conversation) && (
              <div className="flex items-center gap-0.5 rounded-full p-0.5" style={{ background: J["barre-relief"] }}>
                {E.modes.map((m) => {
                  const Icone = m.icone;
                  const actif = mode === m.id;
                  return (
                    <button key={m.id} type="button" onClick={() => { setMode(m.id); champRef.current?.focus(); }} aria-pressed={actif} title={m.placeholder}
                      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] transition-colors"
                      style={{ background: actif ? J["surface-pleine"] : "transparent", color: actif ? J["encre"] : J["ardoise"], boxShadow: actif ? "0 1px 3px rgb(0 0 0 / 0.08)" : "none" }}>
                      <Icone className="h-3.5 w-3.5" style={{ color: actif ? J["menthe"] : undefined }} />
                      <span className="max-md:hidden">{m.label}</span>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="ml-auto flex items-center gap-1.5">
              {/* Le mode : ce qu'on apporte. Sans mode, la boîte fait le tri. */}
              {reglages?.onOuvrirSources && <BoutonSources sources={reglages.sources} ouvert={reglages.sourcesOuvert} onOuvrir={reglages.onOuvrirSources} />}
              {!epure && !E.modesAGauche && !reglages && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setCommandes((o) => !o)}
                  aria-expanded={commandes}
                  aria-haspopup="menu"
                  aria-label={modeCourant ? `Mode ${modeCourant.label}` : "Choisir un mode"}
                  title={modeCourant ? modeCourant.label : "Choisir ce que vous apportez : une note, une fiche, un mail, un rappel"}
                  className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[13.5px] transition-colors hover:bg-barre-relief"
                  style={{ background: modeCourant ? alpha("menthe", 0.12) : "transparent", color: modeCourant ? J["menthe"] : J["craie"] }}
                >
                  {modeCourant ? <IconeMode className="h-3.5 w-3.5" /> : <ArrowLeftRight className="h-3.5 w-3.5" />}
                  <span className="max-md:hidden">{modeCourant ? modeCourant.label : "Mode auto"}</span>
                </button>
                {commandes && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setCommandes(false)} />
                    <div
                      role="menu"
                      className={`animate-in fade-in duration-150 absolute right-0 z-20 max-h-[min(70vh,560px)] w-[340px] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-bloc border border-trait text-left shadow-[0_20px_50px_rgb(0_0_0/0.16)] ${conversation || menusVersLeHaut ? "bottom-full mb-3 slide-in-from-bottom-1" : "top-full mt-3 slide-in-from-top-1"}`}
                      style={{ background: J["barre"] }}
                    >
                      <div className="border-b border-trait px-4 pb-2.5 pt-3.5">
                        <span className="font-pill text-[11px] font-medium uppercase tracking-[.16em] text-ardoise">Ce que vous apportez</span>
                      </div>
                      <div className="p-1.5">
                        {E.modes.map((m) => {
                          const Icone = m.icone;
                          const actif = mode === m.id;
                          return (
                            <button
                              key={m.id}
                              role="menuitem"
                              onClick={() => { const suivant = actif ? null : m.id; setMode(suivant); if (suivant && m.gabarit && !texte.trim()) setTexte(m.gabarit); setCommandes(false); }}
                              className="flex w-full items-center gap-3 rounded-champ px-3 py-2.5 text-left transition-colors hover:bg-encre/[0.05]"
                              style={{ background: actif ? alpha("menthe", 0.1) : "transparent" }}
                              title={m.placeholder}
                            >
                              <Icone className="h-4 w-4 flex-none" style={{ color: actif ? J["menthe"] : J["ardoise"] }} />
                              <span className="text-[13.5px]" style={{ color: actif ? J["menthe"] : J["craie"] }}>{m.label}</span>
                              {actif && <Check className="ml-auto h-3.5 w-3.5 flex-none" style={{ color: J["menthe"] }} />}
                            </button>
                          );
                        })}
                      </div>
                      <div className="border-t border-trait px-4 pb-2.5 pt-3.5">
                        <span className="font-pill text-[11px] font-medium uppercase tracking-[.16em] text-ardoise">Commandes types</span>
                      </div>
                      <div className="p-1.5 pb-2">
                        {E.commandes.map((c) => (
                          <button
                            key={c.texte}
                            role="menuitem"
                            onClick={() => { setTexte(c.texte); setMode(c.mode || null); setCommandes(false); }}
                            className="w-full rounded-champ px-3 py-2 text-left text-[12.5px] leading-[1.5] text-brume transition-colors hover:bg-encre/[0.05] hover:text-craie"
                            style={{ background: "transparent" }}
                          >
                            {c.texte}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
              )}

              <button
                type="button"
                aria-pressed={ecoute}
                aria-busy={finalisation}
                disabled={enCours || finalisation}
                onClick={dicter}
                aria-label={finalisation ? "Texte dicté en cours d'écriture" : ecoute ? "Arrêter la dictée" : "Dicter : le texte s'écrit pendant que vous parlez, un clic pour arrêter"}
                title={finalisation ? "Texte dicté en cours d'écriture" : ecoute ? "Arrêter la dictée" : "Dicter : le texte s'écrit pendant que vous parlez, un clic pour arrêter"}
                className={`grid h-8 w-8 flex-none place-items-center rounded-full transition-colors hover:bg-barre-relief ${finalisation ? "" : "disabled:opacity-40"}`}
                style={{ background: ecoute || finalisation ? alpha("menthe", 0.2) : "transparent", color: ecoute || finalisation ? J["menthe"] : J["craie"] }}
              >
                {finalisation ? <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.7} /> : <Mic className="h-4 w-4" strokeWidth={1.7} />}
              </button>

              <button
                type="button"
                onClick={() => (enCours ? controleur.current?.abort() : lancer())}
                disabled={!enCours && !texte.trim() && !jointes.length && !reglages?.competence}
                aria-label={enCours ? "Interrompre la requête en cours" : "Envoyer"}
                title={enCours ? "Interrompre la requête en cours" : "Envoyer"}
                className="grid h-9 w-9 flex-none place-items-center rounded-full bg-menthe text-sur-menthe transition-colors hover:bg-menthe-survol disabled:cursor-default"
              >
                {enCours ? <Square className="h-3 w-3" fill="currentColor" /> : <ArrowUp className="h-4 w-4" strokeWidth={2} />}
              </button>
            </div>
          </div>
        </div>
        </div>
        </>
  );

  const sousBarre = (erreur || (mode === "mail" && E.mailsTypes) || (prospection && mode === "client")) && (
    <div className="mt-3 flex flex-wrap items-center justify-center gap-3">
      {prospection && mode === "client" && (
        // Le tableau des clients sort de la colonne du chat : il prend toute la
        // largeur de la page (moins la barre latérale), centré sous le chat.
        <div className={conversation ? "w-full" : "w-full flex-none md:w-[min(1320px,calc(100vw_-_var(--k-barre-largeur,228px)_-_80px))]"}>
          <ChoixClient disabled={enCours} onLancer={(ids, refs) => {
            clientsChoisis.current = ids;
            // La ville, si elle a été tapée dans le champ, accompagne la demande.
            lancer(`Pour ${refs.join(", ")}${texte.trim() ? ` · ${texte.trim()}` : ""}`);
          }} />
        </div>
      )}
      {erreur && <span className="text-[12.5px] text-alerte">{erreur}</span>}
      {mode === "mail" && E.mailsTypes && <SuggestionsMail onChoisir={setTexte} disabled={enCours} />}
    </div>
  );

  // La recherche multicritère : un portail par-dessus la page, monté dans les
  // deux mises en page (le fil, et l'accueil).
  const fenetreEl = fenetre && (
    <FenetreMulticriteres
      ville={fenetre.ville}
      rue={fenetre.rue}
      onFermer={() => setFenetre(null)}
      onLance={(p) => {
        setFenetre(null);
        pousser({ role: "assistant", contenu: `C'est lancé : ${p.nom}. La page s'ouvre avec les résultats.`, cartes: [{ titre: p.nom, detail: "Data Prospective", etat: "fait", lien: `datab:${p.jeton}`, action: "Voir les résultats" }] });
        onRecherche?.({ datab_jeton: p.jeton });
      }}
    />
  );

  // Le fil de conversation : le tableau de bord laisse la place à l'échange.
  if (conversation) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        // Au téléphone, la hauteur vient de Layout (barre du haut, onglets, clavier) : index.css, .k-chat-hauteur.
        // `sansBarreHaut` (atelier des newsletters, 9 oct. 2026) : la page pose sa propre barre au-dessus, le chat prend la hauteur qu'on lui laisse,
        // au téléphone aussi (la conversation d'une fiche, 25 oct. 2026).
        className={`flex ${sansBarreHaut ? "h-full" : "k-chat-hauteur h-[100dvh]"} flex-col`}
        onDragOver={(e) => { if (!E.fichier) return; e.preventDefault(); setGlisse(true); }}
        onDragLeave={() => setGlisse(false)}
        onDrop={(e) => { if (E.fichier) deposer(e); }}
      >
        {/* À côté d'un aperçu, la barre du haut est la même des deux côtés : fond et hauteur. */}
        <div className={`flex flex-none items-center gap-3 border-b border-trait ${sansBarreHaut ? "hidden" : ""} ${barreApercu ? "k-barre-apercu -mx-5 h-14 px-5" : "py-3"}`}>
          {/* `avantRetour` (29 oct. 2026, Offres) : ce que la page pose avant le retour, les flèches Retour et Avant. */}
          {avantRetour}
          {/* `retour` (14 oct. 2026, éditeur de projet) : « Retour » ramène à la page d'où l'on vient, au lieu de vider le chat. */}
          <button type="button" onClick={retour ? retour.onClick : nouvelleConversation} className="inline-flex flex-none items-center gap-1 text-[13.5px] text-craie hover:text-encre" style={{ background: "transparent" }}>
            <ChevronLeft className="h-4 w-4" /> {retour ? retour.libelle || "Retour" : libelleAccueil || "Assistant KPartners"}
          </button>
          {/* À côté d'un aperçu, pas de titre : il collait à « Dashboard » (3 oct. 2026). */}
          {barreApercu ? <span className="flex-1" /> : titreEdite != null ? (
            <form className="flex min-w-0 flex-1 justify-center" onSubmit={(e) => { e.preventDefault(); renommerConversation(); }}>
              <input autoFocus value={titreEdite} maxLength={80} onChange={(e) => setTitreEdite(e.target.value)} onBlur={renommerConversation}
                onKeyDown={(e) => { if (e.key === "Escape") setTitreEdite(null); }} aria-label="Nom de la conversation"
                className="w-full max-w-[420px] rounded-champ border border-menthe bg-surface px-3 py-1 text-center text-[14px] text-encre outline-none max-md:text-[16px]" />
            </form>
          ) : conversationId ? (
            <button type="button" onClick={() => setTitreEdite(titreConversation)} title="Renommer la conversation"
              className="group inline-flex min-w-0 flex-1 items-center justify-center gap-1.5 text-[14px] text-encre" style={{ background: "transparent" }}>
              <span className="truncate">{titreConversation}</span>
              <Pencil className="h-3 w-3 flex-none text-brume opacity-0 transition-opacity group-hover:opacity-100 max-md:opacity-100" />
            </button>
          ) : (
            <p className="m-0 min-w-0 flex-1 truncate text-center text-[14px] text-encre">{titreConversation}</p>
          )}
          {!epure && <button type="button" onClick={basculerHistorique} aria-expanded={historiqueOuvert} className="inline-flex flex-none items-center gap-1.5 text-[13.5px] text-craie hover:text-encre" style={{ background: "transparent" }}>
            <History className="h-3.5 w-3.5" /> Historique
          </button>}
        </div>
        {historiqueOuvert && <div className="mx-auto w-full max-w-[760px] flex-none"><HistoriqueConversations api={E.api} qs={qs} actuelle={conversationId} onOuvrir={ouvrirConversation} onNouvelle={nouvelleConversation} /></div>}

        <div className={`min-h-0 flex-1 overflow-y-auto overscroll-contain ${barreApercu ? "-mr-5 pr-5" : ""}`}>
        {filVide && !fil.length && !travaille && (
          <div className="grid h-full place-items-center px-6 text-center">
            <p className="m-0 max-w-[30ch] text-[19px] font-medium tracking-[-0.01em] text-encre">{filVide}</p>
          </div>
        )}
        <div className={`mx-auto w-full max-w-[760px] ${compact ? "space-y-6 py-6" : "space-y-8 py-8"} ${filVide && !fil.length && !travaille ? "hidden" : ""}`}>
          {fil.map((m, i) => [
            compact && jourDe(m) && jourDe(m) !== jourDe(fil.slice(0, i).reverse().find((x) => jourDe(x))) && <SeparateurJour key={`j-${i}`} iso={m.le || m.ak_le} />,
            m.role === "user" ? (
              <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="flex flex-col items-end gap-2">
                <MessageAvecPiece m={m} />
              </motion.div>
            ) : m.role === "bloc" ? (
              <div key={i} className={compact ? "" : "pl-[3.25rem]"}>
                {m.type === "fiche" ? <ResultatFiche r={m.donnees} clients={m.donnees.clients} />
                  : m.type === "client" ? <ResultatClient r={m.donnees} />
                  : m.type === "echeances" ? <Echeances onBrouillon={setBrouillon} />
                  : m.type === "criteres" ? <CarteCriteres donnees={m.donnees} onOuvrir={() => setFenetre(m.donnees || { ville: null, rue: null })} />
                  : null}
              </div>
            ) : (
              <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="flex gap-4">
                {!compact && <AvatarAK />}
                <div className={`min-w-0 flex-1 text-[16px] ${compact ? "" : "pt-1.5"}`}>
                  <Etapes etapes={m.etapes} />
                  <Message m={m} question={[...fil].slice(0, i).reverse().find((x) => x.role === "user")?.contenu || null} surface={E.avis} heure={compact ? heureDe(m) : null} />
                  <SourcesLoi sources={m.sources} />
                  {/* L'avis affiché à côté du chat : sa carte « Ouvrir l'avis » ne servirait à rien. */}
                  {m.cartes?.filter((c) => !(avisACote && String(c.lien || "").startsWith("avis:"))).length > 0 && (
                    <div className="mt-5 space-y-3">{m.cartes.filter((c) => !(avisACote && String(c.lien || "").startsWith("avis:"))).map((c, n) => <CarteAction key={n} c={c} onOuvrir={ouvrirLien} />)}</div>
                  )}
                </div>
              </motion.div>
            ),
          ])}
          {travaille && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }} className="flex gap-4">
              {!compact && <AvatarAK />}
              <div className="min-w-0 flex-1 pt-2">
                {enFlux
                  ? <Etapes etapes={etapesVives.length ? etapesVives : ["Réflexion…"]} courante={Math.max(0, etapesVives.length - 1)} />
                  : <Etapes etapes={etapesPrevues} courante={etapeCourante} />}
                {texteVif && <p className="m-0 mt-3 whitespace-pre-wrap text-[15px] leading-[1.65] text-encre">{texteVif}</p>}
              </div>
            </motion.div>
          )}
          {(fiche || brouillon || (suites.length > 0 && !travaille)) && (
            <div className={`space-y-4 ${compact ? "" : "pl-[3.25rem]"}`}>
              {fiche && <FicheClient champs={fiche} onChange={corriger} onValider={() => creer.mutate(fiche)} enCours={creer.isPending} />}
              {brouillon && <Brouillon b={brouillon} onChange={setBrouillon} onEnvoyer={() => envoyerMail.mutate()} onFermer={() => setBrouillon(null)} enCours={envoyerMail.isPending} messagerie={mandataire && !saBoite} de={saBoite} />}
              {suites.length > 0 && !travaille && (
                <div className="flex flex-wrap gap-2">
                  {suites.map((x) => <BoutonSuite key={x.cle || x.libelle} x={x} onClick={() => (x.faire ? x.faire() : x.externe ? window.open(x.externe, "_blank", "noopener") : x.href ? navigate(x.href) : lancer(x.texte))} />)}
                </div>
              )}
            </div>
          )}
          <div ref={finRef} />
        </div>
        </div>

        <div className="mx-auto w-full max-w-[760px] flex-none pb-5 pt-3">
          {/* En bas de l'écran, ce qui accompagne la barre passe au-dessus d'elle. */}
          {sousBarre && <div className="mb-3 max-h-[30vh] overflow-y-auto [&>div]:mt-0">{sousBarre}</div>}
          {/* Les sources de Haka, ouvertes depuis la barre pendant une conversation. */}
          {/* Sans cadre (18 oct. 2026, Jules) : les pastilles à même le chat, le fil remonte au-dessus d'elles. */}
          {reglages?.panneau && <Depliant ouvert={!!reglages.sourcesOuvert}><div className="pb-4 pt-1">{reglages.panneau}</div></Depliant>}
          {/* L'élément cliqué dans l'avis, à côté : « ça » le désigne dans le message. */}
          {estimation && selectionAvis?.chemin && (
            <div className="mb-2 flex items-center gap-1.5 text-[12.5px] text-menthe">
              <span className="truncate">Sélection dans l'avis : {selectionAvis.libelle || selectionAvis.chemin}</span>
              {onEffacerSelection && (
                <button type="button" onClick={onEffacerSelection} aria-label="Désélectionner" className="grid h-5 w-5 flex-none place-items-center rounded-full text-brume hover:text-encre" style={{ background: "transparent" }}><X className="h-3 w-3" /></button>
              )}
            </div>
          )}
          {barre}
          {sousSaisie}
        </div>
        {fenetreEl}
      </motion.div>
    );
  }

  return (
    <div>
      {aDuContenu && !embarque && (
        <div className="mb-6 space-y-7">
          {fil.map((m, i) =>
            m.role === "bloc" ? (
              m.type === "fiche" ? <ResultatFiche key={i} r={m.donnees} clients={m.donnees.clients} />
              : m.type === "client" ? <ResultatClient key={i} r={m.donnees} />
              : m.type === "echeances" ? <Echeances key={i} onBrouillon={setBrouillon} />
              : null
            ) : (
              <React.Fragment key={i}>
                <Message
                  m={m}
                  question={m.role === "assistant" ? [...fil].slice(0, i).reverse().find((x) => x.role === "user")?.contenu || null : null}
                  surface={m.role === "assistant" ? E.avis : null}
                />
                <SourcesLoi sources={m.sources} />
              </React.Fragment>
            )
          )}
          {fiche && <FicheClient champs={fiche} onChange={corriger} onValider={() => creer.mutate(fiche)} enCours={creer.isPending} />}
          {brouillon && (
            <Brouillon b={brouillon} onChange={setBrouillon} onEnvoyer={() => envoyerMail.mutate()} onFermer={() => setBrouillon(null)} enCours={envoyerMail.isPending} messagerie={mandataire && !saBoite} de={saBoite} />
          )}
          {enCours && (
            <PenseeIA etat={/lis la fiche/i.test(enCoursTexte) ? "searching" : "working"} taille={64} texte={enCoursTexte} />
          )}
          {enCours && texteVif && <p className="m-0 whitespace-pre-wrap text-[15px] leading-[1.65] text-encre">{texteVif}</p>}
          {suites.length > 0 && !enCours && (
            <div className="flex flex-wrap gap-2">
              {suites.map((s) => (
                <button
                  key={s.cle || s.libelle}
                  onClick={() => (s.faire ? s.faire() : s.externe ? window.open(s.externe, "_blank", "noopener") : s.href ? navigate(s.href) : lancer(s.texte))}
                  className={`px-3 py-1.5 text-[11px] tracking-[.14em] uppercase transition-colors ${s.principal ? "bg-menthe text-fond hover:bg-menthe-survol font-semibold" : "border border-bord-doux text-craie hover:border-menthe hover:text-menthe"}`}
                >
                  {s.libelle}
                </button>
              ))}
            </div>
          )}
          <div ref={finRef} />
        </div>
      )}

      {/* Le composeur (maquette) : une carte blanche. Ce qu'on tape en haut ;
          en bas, à gauche la pièce jointe et la boîte qui envoie, à droite le
          mode, la voix et l'envoi. Une note collée sur plusieurs lignes fait
          grandir la carte. */}
      <div
        className="relative"
        onDragOver={(e) => { if (!E.fichier) return; e.preventDefault(); setGlisse(true); }}
        onDragLeave={() => setGlisse(false)}
        onDrop={(e) => { if (E.fichier) deposer(e); }}
      >
        <div className={embarque || epure ? "hidden" : "mb-2 flex justify-end"}>
          <button type="button" onClick={basculerHistorique} aria-expanded={historiqueOuvert} className="inline-flex items-center gap-1.5 text-[13.5px] text-craie transition-colors hover:text-encre" style={{ background: "transparent" }}>
            <History className="h-3.5 w-3.5" /> Historique
          </button>
        </div>
        {barre}
        {/* Sous la saisie, ce que la page y pose (les compétences et le « + » des sources, 26 oct. 2026), puis le choix des sources. */}
        {sousSaisie}
        {reglages?.panneau && <Depliant ouvert={!!reglages.sourcesOuvert}><div className="pb-1 pt-4">{reglages.panneau}</div></Depliant>}

        {/* Embarqué : le brouillon de mail et les gestes de suite s'affichent
            sous la barre — la notification ne montre que le texte. */}
        {embarque && (brouillon || fiche || suites.length > 0) && (
          <div className="mt-3 space-y-3">
            {fiche && <FicheClient champs={fiche} onChange={corriger} onValider={() => creer.mutate(fiche)} enCours={creer.isPending} />}
            {brouillon && <Brouillon b={brouillon} onChange={setBrouillon} onEnvoyer={() => envoyerMail.mutate()} onFermer={() => setBrouillon(null)} enCours={envoyerMail.isPending} messagerie={mandataire && !saBoite} de={saBoite} />}
            {suites.length > 0 && !travaille && (
              <div className="flex flex-wrap gap-2">
                {suites.map((x) => <BoutonSuite key={x.cle || x.libelle} x={x} onClick={() => (x.faire ? x.faire() : x.externe ? window.open(x.externe, "_blank", "noopener") : x.href ? navigate(x.href) : lancer(x.texte))} />)}
              </div>
            )}
          </div>
        )}

        {fenetreEl}
        {/* La pièce jointe, l'erreur, les mails types : sous la barre. */}
        {sousBarre}
        {/* Les cartes de compétences de Haka remplacent « Connecter un skill » quand il est allumé (17 oct. 2026). */}
        {!embarque && !sansSkills && (espace === "mandataire" || espace === "admin") && (
          <>
            <div className="mt-2.5 flex justify-start">
              <button type="button" onClick={() => setSkillsOuvert(true)}
                className="inline-flex items-center gap-1.5 text-[13px] text-ardoise transition-colors hover:text-encre" style={{ background: "transparent" }}>
                <Sparkles className="h-3.5 w-3.5" style={{ color: J["menthe"] }} />
                {modeCourant ? `Skill : ${modeCourant.label}` : "Connecter un skill"}
              </button>
            </div>
            <SkillsChat espace={espace} ouvert={skillsOuvert} onFermer={() => setSkillsOuvert(false)}
              onChoisir={(m) => { setSkillsOuvert(false); setMode(m); setTimeout(() => champRef.current?.focus(), 60); }} />
          </>
        )}
        {!embarque && !estimation && !mandatEspace && <Suggestions espace={espace} onChoisir={(t, m, direct = false) => {
          // Une recherche déjà faite, ou un client : elle repart d'un toucher.
          if (direct) { setMode(m); lancer(t); return; }
          setTexte(t); setMode(m); setTimeout(() => champRef.current?.focus(), 30);
        }} />}
        {historiqueOuvert && !onHistorique && <HistoriqueConversations api={E.api} qs={qs} actuelle={conversationId} onOuvrir={ouvrirConversation} onNouvelle={nouvelleConversation} />}
      </div>
    </div>
  );
}
