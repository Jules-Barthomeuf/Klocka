import React from "react";
import { useNavigate } from "react-router-dom";
import CarteProjet from "@/components/projet/CarteProjet";

// La carte d'un projet chez le client : la carte commune, sans les actions de
// l'admin. Le conseiller y garde sa photo, et la flèche dit que la carte
// s'ouvre. Tout le reste (bordure, chiffres, calcul du prix de revient) vient
// de CarteProjet, pour que les deux vues ne divergent plus.

const CONSEILLER = "https://media.base44.com/images/public/68f0bd18555df3520e1740ca/03bb5f5c4_Capturedecran2026-06-24a120022.png";

export default function ClientProjectCard2({ project }) {
  const navigate = useNavigate();
  return (
    <CarteProjet
      project={project}
      onOuvrir={() => navigate(`/ProjetDetail?id=${project.id}`)}
      avatar={CONSEILLER}
      fleche
    />
  );
}
