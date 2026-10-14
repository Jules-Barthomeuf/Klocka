import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import PlanDeTravail from "@/components/dashboard/PlanDeTravail";
import ChatDashboard, { HistoriqueColonne } from "@/components/dashboard/ChatDashboard";
import BoiteMail from "@/components/dashboard/BoiteMail";
import { Link, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
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
  // Le Cerveau (14 oct. 2026) : un rappel des faits à valider, rien d'autre ; et la question
  // d'une décision sans motif, ouverte depuis sa notification, posée dans le chat.
  const { data: cerveau } = useQuery({ queryKey: ["cerveau", "etat"], queryFn: () => base44.request("GET", "/api/cerveau/etat"), staleTime: 60 * 1000 });
  const { search } = useLocation();
  useEffect(() => {
    const id = new URLSearchParams(search).get("cerveau_question");
    if (!id) return;
    base44.request("GET", `/api/cerveau/questions/${id}`).then(({ question }) => {
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
          {!conversation && cerveau?.a_valider > 0 && (
            <Link to="/Cerveau" className="mb-4 flex items-center justify-between gap-3 rounded-[14px] bg-rail px-5 py-3 text-[14px] text-encre no-underline hover:bg-rail-actif">
              <span>{cerveau.a_valider} élément{cerveau.a_valider > 1 ? "s" : ""} à valider au Cerveau</span>
              <span className="text-[13px] text-menthe">Valider</span>
            </Link>
          )}
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
