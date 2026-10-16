import React, { useEffect, useState } from "react";
import { JourneeLayer } from "@/components/layer/CeQueKlockaSait";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import PlanDeTravail from "@/components/dashboard/PlanDeTravail";
import ChatDashboard, { HistoriqueColonne } from "@/components/dashboard/ChatDashboard";
import BoiteMail from "@/components/dashboard/BoiteMail";
import ObjectionsAResoudre from "@/components/dashboard/ObjectionsAResoudre";
import AKNouveauLook from "@/components/AKNouveauLook";
import QuoiDeNeuf from "@/components/QuoiDeNeuf";
import { useLocation } from "react-router-dom";
import { base44 } from "@/api/base44Client";

// Le dashboard admin, c'est le plan de travail — rien d'autre.
//
// Les agrégats d'activité (compteurs clients/projets, pipeline, carte CRM) ont
// été retirés : ils décrivaient l'état de la plateforme sans jamais dire quoi
// faire. Ces chiffres restent consultables sur leurs pages respectives.

export default function AdminDashboardView() {
  const [conversation, setConversation] = useState(false);
  // Sur ordinateur, la pilule des boîtes rejoint le coin en haut à droite, à côté de « Rappel » (8 oct. 2026).
  const [coin, setCoin] = useState(null);
  useEffect(() => { setCoin(document.getElementById("k-haut-droite")); }, []);
  const [historique, setHistorique] = useState(false);
  // L'Intelligence (14 oct. 2026) : un rappel des faits à valider, rien d'autre ; et la question
  // d'une décision sans motif, ouverte depuis sa notification, posée dans le chat.
  const { search } = useLocation();
  useEffect(() => {
    const id = new URLSearchParams(search).get("layer_question") || new URLSearchParams(search).get("cerveau_question");
    if (!id) return;
    base44.request("GET", `/api/layer/questions/${id}`).then(({ question }) => {
      if (!question || question.etat === "repondue") return;
      window.dispatchEvent(new CustomEvent("klocka:ouvrir-conversation", { detail: { id: null, api: "/api/assistant", qs: "", secours: [{ role: "assistant", reprise: true, contenu: question.texte }] } }));
    }).catch(() => {});
  }, [search]);
  return (
    <div className="min-h-screen">
      <div className={`mx-auto max-w-[1100px] px-5 md:px-8 ${conversation ? "" : "pb-14 pt-4"}`}>
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          {/* Les boîtes d'envoi, en haut à droite : sans elles, la moitié de
              ce qui se décide ici ne part nulle part. */}
          {!conversation && (
            <>
              <div className={`flex justify-end ${coin ? "md:hidden" : ""}`}>
                <BoiteMail />
              </div>
              {coin && createPortal(<BoiteMail />, coin)}
            </>
          )}
          {/* L'Intelligence (phase 6, 15 oct. 2026) : mes engagements du jour, mes faits à valider, mes questions « pourquoi ? ». */}
          {!conversation && <JourneeLayer className="mb-4" />}
          {/* « AK a un nouveau look » (16 oct. 2026) : une fois par personne et par navigateur. */}
          <AKNouveauLook />
          {/* « Quoi de neuf » : le briefing du jour, une fois par jour, après l'annonce d'AK. */}
          <QuoiDeNeuf />
          {/* Les objections non levées, quinze secondes chacune, à résoudre ensemble (16 oct. 2026). */}
          {!conversation && <ObjectionsAResoudre className="mb-4 md:mt-14" />}
          <PlanDeTravail
            conversation={conversation}
            historique={historique ? <HistoriqueColonne /> : null}
            chat={<ChatDashboard onConversation={setConversation} onHistorique={setHistorique} />}
          />
        </motion.div>
      </div>
    </div>
  );
}
