import React from "react";
import { useNavigate } from "react-router-dom";
import CarteProjet from "@/components/projet/CarteProjet";

// La carte d'un projet chez le client : la carte commune, sans les actions de
// l'admin. La flèche dit que la carte s'ouvre. Tout le reste (bordure,
// chiffres, calcul du prix de revient) vient de CarteProjet, pour que les deux
// vues ne divergent plus.

export default function ClientProjectCard2({ project }) {
  const navigate = useNavigate();
  return (
    <CarteProjet
      project={project}
      onOuvrir={() => navigate(`/ProjetDetail?id=${project.id}`)}
      fleche
    />
  );
}
