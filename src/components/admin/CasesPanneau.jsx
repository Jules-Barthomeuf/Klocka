import React from "react";
import { useCasesProjet } from "@/components/projet/CasesProjet";
import { FField, FInput } from "./FormField";

// Les cases d'une zone, en face de celles de la page.
//
// La page lit ses cases sur le serveur (projet-cases), qui les tire des pièces
// du dossier. Le panneau montre les mêmes, dans le même ordre, avec ce que le
// serveur a lu ; taper dedans le remplace, et la correction vit dans le projet
// (cases_forcees), là où la page va la chercher. Vider une case revient à la
// lecture.

function Case({ cle, titre, lu, detailLu, forcee, onChange }) {
  const valeur = forcee?.valeur ?? "";
  const detail = forcee?.detail ?? "";
  return (
    <div className="rounded-[12px] border border-trait bg-surface p-3.5">
      <FField label={titre} className="!border-0 !bg-transparent !p-0">
        <FInput
          value={valeur}
          placeholder={lu || "—"}
          onChange={(e) => onChange(cle, { ...(forcee || {}), valeur: e.target.value })}
        />
      </FField>
      <FInput
        value={detail}
        placeholder={detailLu || "détail, en une ligne"}
        onChange={(e) => onChange(cle, { ...(forcee || {}), detail: e.target.value })}
        className="mt-1.5 !text-[12.5px] text-craie"
      />
      <div className="mt-1.5 flex items-baseline justify-between gap-3 text-[11px] text-brume">
        <span>{lu ? "lu dans les pièces" : "rien lu dans les pièces"}</span>
        {(valeur || detail) && (
          <button type="button" onClick={() => onChange(cle, null)} className="text-menthe hover:underline" style={{ background: "transparent" }}>
            Revenir à la lecture
          </button>
        )}
      </div>
    </div>
  );
}

export default function CasesPanneau({ zone, formData, setFormData, projetId = null }) {
  const cases = useCasesProjet({ id: projetId }, !projetId);
  const liste = cases?.[zone] || [];
  const forcees = formData.cases_forcees || {};

  const changer = (cle, valeur) => {
    const suite = { ...forcees };
    if (valeur) suite[cle] = valeur; else delete suite[cle];
    setFormData({ ...formData, cases_forcees: suite });
  };

  if (!projetId) return <p className="m-0 text-[12.5px] text-ardoise">Enregistrez le projet une première fois : les cases se lisent ensuite dans ses pièces.</p>;
  if (!liste.length) return <p className="m-0 text-[12.5px] text-ardoise">Lecture des pièces…</p>;

  return (
    <div className="grid grid-cols-2 gap-3">
      {liste.map((c) => {
        const cle = `${zone}.${c.id}`;
        return <Case key={cle} cle={cle} titre={c.titre} lu={c.valeur} detailLu={c.detail} forcee={forcees[cle]} onChange={changer} />;
      })}
    </div>
  );
}
