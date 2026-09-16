import React from "react";
import MarcheCases from "./MarcheCases";

// Le panneau du marché : les cases, et rien d'autre.
//
// Les interrupteurs de masquage, les secteurs comparables et les notes ont été
// retirés. Les sections de la page ne dépendent plus que de leurs chiffres :
// une section sans chiffre ne s'affiche pas, il n'y a donc rien à masquer à la
// main.

export default function ProjectFormMarcheTab({ formData, setFormData, projetId = null }) {
  return (
    <div className="mt-6">
      <MarcheCases formData={formData} setFormData={setFormData} projetId={projetId} />
    </div>
  );
}
