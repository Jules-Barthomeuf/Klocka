import React from "react";
import CasesPanneau from "./CasesPanneau";

// Le panneau de la copropriété : les quatre cases des PV d'AG, celles que la
// page montre, lues dans les pièces et corrigeables ici.

export default function ProjectFormCoproTab({ formData, setFormData, projetId = null }) {
  return (
    <div className="mt-6">
      <CasesPanneau zone="copropriete" formData={formData} setFormData={setFormData} projetId={projetId} />
    </div>
  );
}
