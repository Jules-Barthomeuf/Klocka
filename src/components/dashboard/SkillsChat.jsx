import React, { useEffect } from "react";
import { motion } from "framer-motion";
import { Bell, FileSignature, FileText, Mail, MessageCircle, Paperclip, Phone, User, X } from "lucide-react";
import { GridPatternCard, GridPatternCardBody } from "@/components/ui/card-with-grid-ellipsis-pattern";
import { J, alpha } from "@/design/jetons";

// La pop-up des skills d'un chat : ce que l'agent sait faire, une carte à
// grille de points (celle de la connexion) par geste. Un clic choisit le
// mode dans le chat, et le champ dit alors exactement quoi donner. Elle se
// centre sur la zone de contenu, à droite de la barre de navigation
// (--k-barre-largeur, posée par le Layout).

const SKILLS_MANDATAIRE = [
  { mode: "note", icone: Phone, titre: "Note d'appel", description: "Racontez l'appel en une phrase : la fiche prend le statut, la relance se pose toute seule (J+2, J+5, J+10).", exemple: "« Pas de réponse pour le tabac de Mâcon »" },
  { mode: "contact", icone: User, titre: "Nouveau contact", description: "Un propriétaire rencontré : sa fiche naît, part dans vos listes et chez Klocka.", exemple: "« Nouveau contact : M. Durand, pharmacie cours Vitton, 06… »" },
  { mode: "estimation", icone: FileText, titre: "Estimation", description: "La photo du bail, ou le loyer et la surface : le rapport se rédige avec le marché de la rue, la fourchette arrive dans la minute.", exemple: "« Estime la boulangerie Martin, 12 rue Carnot »" },
  { mode: "mandat", icone: FileSignature, titre: "Mandat", description: "Le vendeur, le bien, le prix, les honoraires : Klocka rédige le mandat et le renvoie prêt à signer sous 48 h.", exemple: "« Mandat exclusif, boulangerie Martin, 450 000 €, 5 % acquéreur »" },
  { mode: null, icone: Paperclip, titre: "Ranger une pièce", description: "Joignez un document avec le + (bail, quittances, Kbis, diagnostics…) : il se range dans le bon dossier, la checklist avance.", exemple: "« Le bail de la boulangerie Martin » + pièce jointe" },
  { mode: "mail", icone: Mail, titre: "Mail", description: "Décrivez le mail au propriétaire : le brouillon est prêt à relire, vous l'envoyez vous-même.", exemple: "« Relance M. Martin pour les quittances »" },
  { mode: "question", icone: MessageCircle, titre: "Question & marché", description: "Ce que cherchent les clients Klocka, un avis de loyer à une adresse, l'état de vos dossiers et relances.", exemple: "« Combien vaut le local 12 rue Carnot ? »" },
  { mode: "rappel", icone: Bell, titre: "Rappel", description: "Dites quoi et quand : il s'affiche dans vos Rappels le jour venu, avec le téléphone s'il est connu.", exemple: "« Dans 3 jours, rappeler le tabac de Mâcon »" },
];

const SKILLS_ADMIN = [
  { mode: "note", icone: Phone, titre: "Note d'appel", description: "Racontez l'appel en raccrochant : la fiche Monday de l'agent se met à jour, le dossier naît si un bien est décrit, la relance se pose.", exemple: "« J'ai eu Marc de l'agence X, il me rappelle jeudi »" },
  { mode: "fiche", icone: FileText, titre: "Fiche d'agent", description: "Collez le mail ou l'annonce, ou joignez le PDF : le dossier naît, nommé et analysé, avec les clients qui correspondent.", exemple: "Collez la fiche, ou déposez-la avec le +" },
  { mode: "client", icone: User, titre: "Compte rendu client", description: "Collez le compte rendu de découverte : la fiche client est prête à valider — Monday, compte Klocka, lien d'invitation.", exemple: "Collez les notes de l'appel de découverte" },
  { mode: "mail", icone: Mail, titre: "Mail", description: "Décrivez le mail ou partez d'un mail type : le brouillon se relit, puis part de la boîte connectée.", exemple: "« Relance l'agent du dossier de Dieppe »" },
  { mode: "question", icone: MessageCircle, titre: "Question & dossiers", description: "AK répond : l'état des dossiers, ce qui attend une réponse, le marché, Monday, une simulation.", exemple: "« Qu'est-ce qui attend aujourd'hui ? »" },
  { mode: "rappel", icone: Bell, titre: "Rappel", description: "Dites quoi et quand : il s'affiche sur le tableau de bord le jour venu.", exemple: "« Dans 3 jours, relancer M. Lardeux au 06… »" },
];
const LISTES = { mandataire: SKILLS_MANDATAIRE, admin: SKILLS_ADMIN };

export default function SkillsChat({ ouvert, onFermer, onChoisir, espace = "mandataire" }) {
  const skills = LISTES[espace] || SKILLS_MANDATAIRE;
  // Échap ferme, comme toute pop-up.
  useEffect(() => {
    if (!ouvert) return undefined;
    const clavier = (e) => { if (e.key === "Escape") onFermer?.(); };
    window.addEventListener("keydown", clavier);
    return () => window.removeEventListener("keydown", clavier);
  }, [ouvert, onFermer]);
  if (!ouvert) return null;

  return (
    // Centrée sur la partie à droite de la barre de navigation, pas sur l'écran.
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 md:left-[var(--k-barre-largeur,0px)]" role="dialog" aria-modal="true" aria-label="Les skills du chat">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onFermer} />
      <motion.div initial={{ opacity: 0, y: 14, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
        className="relative max-h-[85vh] w-full max-w-[880px] overflow-y-auto rounded-[20px] border border-bord-vif bg-fond p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_40px_120px_-24px_rgba(0,0,0,0.8)] max-md:p-4">
        <button type="button" onClick={onFermer} aria-label="Fermer" className="absolute right-4 top-4 z-10 grid h-9 w-9 place-items-center rounded-full text-ardoise transition-colors hover:text-encre" style={{ background: "transparent" }}>
          <X className="h-4 w-4" />
        </button>
        <div className="grid justify-center gap-3 pt-6 sm:grid-cols-2">
          {skills.map((s) => {
            const Icone = s.icone;
            return (
              <button key={s.titre} type="button" onClick={() => onChoisir?.(s.mode)} className="block w-full text-left" style={{ background: "transparent", padding: 0, border: 0 }}>
                <GridPatternCard className="h-full cursor-pointer transition-colors hover:border-menthe/50">
                  <GridPatternCardBody className="p-4 md:p-5">
                    <span className="flex items-center gap-3">
                      <span className="grid h-9 w-9 flex-none place-items-center rounded-[10px]" style={{ background: alpha("menthe", 0.12), color: J["menthe"] }}>
                        <Icone className="h-4 w-4" />
                      </span>
                      <span className="text-[15px] text-encre">{s.titre}</span>
                    </span>
                    <span className="mt-2.5 block text-[13px] leading-[1.55] text-ardoise">{s.description}</span>
                    <span className="mt-auto block pt-2 text-[12.5px] text-brume">{s.exemple}</span>
                  </GridPatternCardBody>
                </GridPatternCard>
              </button>
            );
          })}
        </div>
      </motion.div>
    </div>
  );
}
