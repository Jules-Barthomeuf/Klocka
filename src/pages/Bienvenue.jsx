import React, { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { ConnexionPanel } from "@/components/auth/ConnexionDialog";
import { Loader2 } from "lucide-react";

// La porte d'entrée d'un client invité.
//
// L'équipe crée le compte et envoie un lien ; la personne l'ouvre, voit son
// prénom, choisit un mot de passe, entre. Ni adresse à taper, ni inscription,
// ni attente d'activation — le lien porte tout.

const MESSAGES = {
  inconnu: "Ce lien ne correspond à aucune invitation. Vérifiez qu'il est complet, ou demandez-en un nouveau à votre interlocuteur.",
  expire: "Ce lien a expiré : une invitation vaut quatorze jours. Demandez-en un nouveau à votre interlocuteur.",
  deja_actif: "Ce compte est déjà actif. Connectez-vous avec votre mot de passe.",
};

export default function Bienvenue() {
  const { search } = useLocation();
  const jeton = new URLSearchParams(search).get("jeton") || "";
  const [etat, setEtat] = useState({ chargement: true });

  useEffect(() => {
    if (!jeton) {
      setEtat({ chargement: false, raison: "inconnu" });
      return;
    }
    base44
      .request("GET", `/api/auth/invitation/${encodeURIComponent(jeton)}`)
      .then((r) => setEtat({ chargement: false, ...r }))
      .catch(() => setEtat({ chargement: false, raison: "inconnu" }));
  }, [jeton]);

  return (
    <div className="min-h-screen bg-[#000000] text-[#f2f3f5] flex flex-col">
      <nav className="px-8 md:px-16 py-6">
        <span className="text-[13px] tracking-[.22em] uppercase text-[#f2f3f5]">Klocka</span>
      </nav>

      <div className="flex-1 flex items-center justify-center px-6 pb-16">
        <div className="w-full max-w-md">
          {etat.chargement ? (
            <div className="flex justify-center py-16">
              <Loader2 className="w-6 h-6 text-[#9298a6] animate-spin" />
            </div>
          ) : etat.valide ? (
            <>
              <div className="w-10 h-0.5 bg-[#96c0b8] mb-8" />
              <p className="m-0 mb-8 text-[15px] leading-[1.7] text-[#9298a6]">
                Votre espace est prêt. Il ne manque que votre mot de passe.
              </p>
              <ConnexionPanel invitation={{ email: etat.email, prenom: etat.prenom, jeton }} />
            </>
          ) : (
            <>
              <div className="w-10 h-0.5 bg-[#96c0b8] mb-8" />
              <h1 className="m-0 text-[26px] font-light tracking-[-.02em] text-[#f2f3f5]">Lien inutilisable</h1>
              <p className="m-0 mt-4 text-[14.5px] leading-[1.7] text-[#9298a6]">{MESSAGES[etat.raison] || MESSAGES.inconnu}</p>
              <a
                href="/"
                className="inline-block mt-8 px-5 py-2.5 border border-[#2c3139] text-[11px] tracking-[.16em] uppercase text-[#f2f3f5] hover:bg-[#f2f3f5]/[0.06] transition-colors"
              >
                Aller à la connexion
              </a>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
