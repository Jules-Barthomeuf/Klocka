import React, { useState } from "react";
import {
  ChevronLeft, ChevronRight, Search, FileText, ClipboardCheck, Calculator,
  Mail, ScanText, MapPin, ListTodo, Upload, FolderPlus, UserPlus, MessageCircleQuestion,
  BookOpen, Undo2, History,
} from "lucide-react";

// La page Assistant : ce qu'il sait faire, une compétence par vue.
//
// Écrite pour être lue avant d'essayer. Chaque compétence dit ce qu'elle fait,
// donne une phrase à recopier telle quelle, et — c'est le plus utile — annonce
// sa limite. Un outil dont on ignore les bords se retourne contre son usager.

const COMPETENCES = [
  {
    id: "chercher",
    icone: Search,
    titre: "Trouver un dossier ou un projet",
    quoi: "Il cherche par nom, ville, adresse, locataire ou adresse de l'agent. Une recherche ambiguë n'est jamais tranchée au hasard : il liste ce qui correspond et demande lequel.",
    exemples: ["Trouve le dossier de Lyon", "Cherche le projet de la boulangerie à Marseille"],
    limite: "Il ne devine pas. Sans correspondance, il le dit plutôt que d'inventer.",
  },
  {
    id: "etat",
    icone: FileText,
    titre: "Donner les chiffres d'un bien",
    quoi: "Prix FAI et prix acte en main, loyer, surface, rendements, locataire et activité, bail, commune — plus la projection financière : prix de revient, apport, rentabilité, cash-flow.",
    exemples: ["Quel est le prix du dossier de Mitry-Mory ?", "Où en est le dossier Monoprix ?"],
    limite: "Sur un dossier à plusieurs lots, il répond sur le premier.",
  },
  {
    id: "verifier",
    icone: ClipboardCheck,
    titre: "Vérifier ce qui manque",
    quoi: "Il passe le dossier en revue — dossier Drive, présence dans Monday, fiche de l'agent, documents extraits ou non, pièces absentes, relance échue — et propose l'action qui lève chaque manque, une à la fois.",
    exemples: ["Vérifie le dossier Monoprix", "Qu'est-ce qui manque sur ce projet ?"],
    limite: "Ce qui n'a pas d'action automatique est signalé comme à faire à la main, jamais promis.",
  },
  {
    id: "simuler",
    icone: Calculator,
    titre: "Rejouer la simulation",
    quoi: "Prix négocié, apport, taux et durée : il rejoue le calcul avec vos hypothèses et rend prix de revient, apport, mensualité, rentabilité, cash-flow et TRI. C'est le moteur du simulateur, pas une approximation.",
    exemples: ["Le dossier de Lyon avec 25 % d'apport sur 25 ans, ça donne quoi ?", "Et si on négocie à 340 000 ?"],
    limite: "Les hypothèses accompagnent toujours le résultat : un chiffre sans elles se prend pour une certitude.",
  },
  {
    id: "mail",
    icone: Mail,
    titre: "Rédiger un mail à l'agent",
    quoi: "Cinq intentions du cycle : demande de documents, relance, refus, abandon, présentation client. Le brouillon s'affiche dans le panneau, modifiable — destinataire, objet, corps — et part d'un bouton. Le rédacteur ne voit jamais le verdict ni la grille d'analyse.",
    exemples: ["Prépare la relance de l'agent sur Mitry-Mory", "Rédige la demande de documents pour ce dossier"],
    limite: "Rien ne part sans que vous ayez lu le texte et cliqué. Un envoi ne se rattrape pas.",
  },
  {
    id: "documents",
    icone: BookOpen,
    titre: "Lire les documents du dossier",
    quoi: "Il ouvre les pièces elles-mêmes — bail, PV d'assemblée générale, règlement de copropriété, quittances, diagnostics — et répond sur leur contenu.",
    exemples: ["Que dit le bail sur les charges ?", "Le PV d'AG parle-t-il de travaux ?"],
    limite: "Il lit ce qui est au dossier. Une pièce absente reste absente : il le dit plutôt que de supposer.",
  },
  {
    id: "extraire",
    icone: ScanText,
    titre: "Lancer l'extraction des documents",
    quoi: "Chaque pièce est lue et ses données relevées, avec la page et la citation d'origine. Le traitement se poursuit en arrière-plan.",
    exemples: ["Lance l'extraction du dossier Monoprix"],
    limite: "Un document à la fois : compter en minutes sur un dossier fourni.",
  },
  {
    id: "marche",
    icone: MapPin,
    titre: "Interroger la mémoire d'une ville",
    quoi: "Prix au m², loyers observés, et les biens déjà analysés puis écartés dans cette ville, avec le motif du refus.",
    exemples: ["On a déjà vu quoi à Bayonne ?", "Le marché à Lyon"],
    limite: "C'est la mémoire de Klocka, pas une recherche web. Sans historique, il le dit.",
  },
  {
    id: "plan",
    icone: ListTodo,
    titre: "Donner le plan du jour",
    quoi: "Les mails à traiter, les relances dues, les documents manquants, les dossiers prêts à entrer en plateforme — la même pile que le tableau de bord, en conversation.",
    exemples: ["Qu'est-ce que je dois faire aujourd'hui ?", "Quoi de neuf ?"],
    limite: "La pile est calculée en clair depuis l'état des dossiers, jamais devinée par le modèle.",
  },
  {
    id: "monday",
    icone: Upload,
    titre: "Envoyer dans Monday",
    quoi: "Le bien est posé dans le tableau « Propriétés » avec son adresse géolocalisée, son prix, son loyer, sa surface, son statut, et l'agent relié à sa fiche.",
    exemples: ["Mets le dossier de Lyon dans Monday", "Mets ce projet dans Monday"],
    limite: "Rejouer l'envoi met à jour le même élément : jamais de doublon.",
  },
  {
    id: "drive",
    icone: FolderPlus,
    titre: "Créer le dossier Drive",
    quoi: "Il crée le dossier du projet et y classe les documents déjà déposés, avec le compte Google de la personne qui parle.",
    exemples: ["Crée le dossier Drive du dossier Monoprix"],
    limite: "Il faut un compte Google autorisant le Drive, connecté depuis le tableau de bord.",
  },
  {
    id: "agent",
    icone: UserPlus,
    titre: "Inscrire un agent au CRM",
    quoi: "Un agent qui vient d'apporter un dossier n'a pas encore de fiche dans Monday : il l'y inscrit et la relie au bien.",
    exemples: ["L'agent de ce dossier n'est pas dans Monday, ajoute-le"],
    limite: "Une fiche existante n'est jamais dupliquée : la recherche se fait sur l'adresse mail.",
  },
  {
    id: "annuler",
    icone: Undo2,
    titre: "Annuler la dernière action",
    quoi: "Un élément Monday créé par erreur, une fiche agent en double, un dossier Drive de trop : il défait. Le Drive part à la corbeille, pas à la destruction.",
    exemples: ["Annule", "Annule ce que tu viens de faire"],
    limite: "Une mise à jour et un envoi ne se défont pas — il le dit franchement au lieu de faire semblant.",
  },
  {
    id: "historique",
    icone: History,
    titre: "Rendre compte de ce qu'il a fait",
    quoi: "Chaque action qui touche Monday, le Drive ou un envoi laisse une trace : qui l'a demandée, ce qui a réellement été exécuté, et si elle se défait encore.",
    exemples: ["Qu'est-ce que tu as fait récemment ?"],
    limite: "Le texte de l'assistant n'est jamais la preuve d'une action : seule la trace l'est.",
  },
  {
    id: "questions",
    icone: MessageCircleQuestion,
    titre: "Répondre aux questions de fond",
    quoi: "Droit des baux commerciaux, financement, fiscalité, méthode d'analyse : il répond directement, sans outil et sans détour.",
    exemples: ["Différence entre un bail 3/6/9 et un bail dérogatoire ?", "Comment se calcule un prix acte en main ?"],
    limite: "Il dit franchement quand il ne sait pas, et n'invente jamais un chiffre sur un bien.",
  },
];

export default function Assistant() {
  const [index, setIndex] = useState(0);
  const c = COMPETENCES[index];
  const Icone = c.icone;

  const aller = (pas) => setIndex((i) => (i + pas + COMPETENCES.length) % COMPETENCES.length);

  return (
    <div className="bg-[#0a0c0c] min-h-screen text-[#edeae5]">
      <div className="max-w-[900px] mx-auto px-4 md:px-8 py-8 md:py-12">
        <div className="text-[11px] tracking-[.16em] uppercase text-[#8b9391] mb-2.5">Assistant</div>
        <h1 className="m-0 text-[30px] max-md:text-[24px] font-light tracking-[-.02em]">Ce qu'il sait faire</h1>
        <p className="mt-3 mb-0 max-w-[64ch] text-[13.5px] leading-[1.7] text-[#9aa19e]">
          La barre en bas à droite est toujours là : on lui écrit comme on parlerait à un collègue.
          Il cherche, vérifie, calcule, rédige et range — mais il ne décide jamais à votre place, et
          rien ne part vers l'extérieur sans que vous l'ayez relu. Il sait sur quel dossier vous êtes :
          « mets-le dans Monday » suffit quand il est ouvert devant vous. Et la conversation survit au
          rechargement de la page.
        </p>

        {/* Le carrousel : une compétence à la fois, pour qu'on la lise vraiment. */}
        <div className="relative mt-9 border border-[#282b2a] rounded-lg bg-[#0c0e0d] p-6 md:p-8">
          <div className="flex items-start gap-4 mb-5">
            <span className="w-10 h-10 rounded-md bg-[#35a79b]/15 text-[#7fd3c9] flex items-center justify-center flex-shrink-0">
              <Icone className="w-5 h-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="m-0 text-[10px] tracking-[.16em] uppercase text-[#6b7270]">
                {index + 1} / {COMPETENCES.length}
              </p>
              <h2 className="m-0 mt-1 text-[20px] font-medium leading-snug">{c.titre}</h2>
            </div>
          </div>

          <p className="m-0 text-[14px] leading-[1.75] text-[#d3d8d6]">{c.quoi}</p>

          <div className="mt-6">
            <p className="m-0 mb-2.5 text-[10px] tracking-[.16em] uppercase text-[#6b7270]">À lui dire</p>
            <div className="space-y-2">
              {c.exemples.map((e) => (
                <p
                  key={e}
                  className="m-0 text-[13.5px] text-[#edeae5] border border-[#242726] rounded-md px-3.5 py-2.5 bg-[#0a0c0c]"
                >
                  « {e} »
                </p>
              ))}
            </div>
          </div>

          <p className="m-0 mt-6 text-[12.5px] leading-[1.6] text-[#e0c9a0]/80 border-t border-[#242726] pt-4">
            {c.limite}
          </p>

          <button
            onClick={() => aller(-1)}
            title="Précédent"
            className="absolute -left-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-[#0a0c0c] border border-[#303332] flex items-center justify-center text-[#d3d8d6] hover:text-[#edeae5] hover:border-[#edeae5]/[0.3] transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => aller(1)}
            title="Suivant"
            className="absolute -right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-[#0a0c0c] border border-[#303332] flex items-center justify-center text-[#d3d8d6] hover:text-[#edeae5] hover:border-[#edeae5]/[0.3] transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Pastilles de navigation : on voit d'un coup l'étendue du sujet. */}
        <div className="flex flex-wrap items-center justify-center gap-1.5 mt-5">
          {COMPETENCES.map((x, i) => (
            <button
              key={x.id}
              onClick={() => setIndex(i)}
              title={x.titre}
              className={`h-1.5 rounded-full transition-all ${i === index ? "w-6 bg-[#35a79b]" : "w-1.5 bg-[#edeae5]/20 hover:bg-[#edeae5]/40"}`}
            />
          ))}
        </div>

        <p className="mt-10 mb-0 text-[12.5px] leading-[1.7] text-[#6b7270] border-t border-[#242726] pt-5">
          Deux choses qu'il ne fait pas, volontairement. Il ne décide pas : les verdicts sont produits
          par le moteur de règles, en clair, et se relisent. Et il n'envoie rien de lui-même — un mail
          maladroit chez un agent coûte plus cher que trente secondes de relecture.
        </p>
      </div>
    </div>
  );
}
