import React from "react";
import LocataireCases from "./LocataireCases";

// Le panneau du locataire : les six cases de la page, et rien d'autre.
// La vente de fonds, l'analyse rédigée, les liens, les bilans et les notes
// en sont sortis : la page ne les montre pas, le panneau ne les tient plus.

export default function ProjectFormLocataireTab({ formData, setFormData }) {
  return (
    <div className="mt-6">
      <LocataireCases formData={formData} setFormData={setFormData} />
    </div>
  );
}
