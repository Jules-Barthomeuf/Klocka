import React from "react";
import { CarteConnexion, ConnexionPanel } from "@/components/auth/ConnexionDialog";

// Page d'accueil : la carte de connexion seule, centrée sur un fond noir
// (maquette « Connexion »). Le noir est posé ici, quel que soit le fond choisi
// dans Personnalisation : personne n'est encore connecté.
export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-black px-4 py-10 text-encre">
      <CarteConnexion>
        <ConnexionPanel />
      </CarteConnexion>
    </div>
  );
}
