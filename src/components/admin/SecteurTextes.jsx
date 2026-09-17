import React from "react";
import { trouverVille, trouverSecteur } from "@/data/villes";
import { FField, FTextarea } from "./FormField";

// Les phrases du secteur, côté panneau.
//
// La page du client affiche celles du jeu de données des villes tant que le
// dossier n'en porte pas : le panneau restait donc vide en face d'un texte
// bien visible, et il n'y avait rien à corriger. Elles s'affichent maintenant
// ici telles qu'elles sont lues, et un bouton les reprend dans le dossier :
// à partir de là, ce sont celles du projet, et elles s'éditent.

const MAX = 5;

function Liste({ titre, aide, champ, formData, setFormData, reference }) {
  const valeurs = formData[champ] || [];
  const propre = valeurs.length > 0;
  const ecrire = (v) => setFormData({ ...formData, [champ]: v });

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[13px] text-encre">{titre}</span>
        {propre ? (
          valeurs.length < MAX && (
            <button type="button" onClick={() => ecrire([...valeurs, ""])} className="text-[12px] text-menthe hover:underline" style={{ background: "transparent" }}>
              Ajouter une phrase
            </button>
          )
        ) : reference?.length ? (
          <button type="button" onClick={() => ecrire(reference.slice(0, MAX))} className="text-[12px] text-menthe hover:underline" style={{ background: "transparent" }}>
            Reprendre pour ce projet
          </button>
        ) : (
          <button type="button" onClick={() => ecrire([""])} className="text-[12px] text-menthe hover:underline" style={{ background: "transparent" }}>
            Écrire une phrase
          </button>
        )}
      </div>
      <p className="m-0 text-[11.5px] text-brume">{aide}</p>

      {propre ? (
        valeurs.slice(0, MAX).map((texte, i) => (
          <div key={i} className="flex items-start gap-2">
            <FField className="flex-1">
              <FTextarea
                rows={2}
                value={texte}
                placeholder="Une phrase, pas deux."
                onChange={(e) => { const u = [...valeurs]; u[i] = e.target.value; ecrire(u); }}
              />
            </FField>
            <button
              type="button"
              onClick={() => ecrire(valeurs.filter((_, j) => j !== i))}
              aria-label="Retirer cette phrase"
              className="mt-2 text-[15px] leading-none text-ardoise hover:text-alerte"
              style={{ background: "transparent" }}
            >
              ×
            </button>
          </div>
        ))
      ) : reference?.length ? (
        <ul className="m-0 flex list-none flex-col gap-1.5 rounded-[10px] border border-trait bg-surface p-3 pl-3">
          {reference.slice(0, MAX).map((p, i) => (
            <li key={i} className="flex gap-2 text-[12.5px] leading-[1.6] text-craie">
              <span className="mt-[7px] h-1 w-1 flex-shrink-0 rounded-full bg-menthe" />
              <span>{p}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="m-0 text-[12.5px] text-ardoise">Rien pour cette adresse.</p>
      )}
    </div>
  );
}

export default function SecteurTextes({ formData, setFormData }) {
  const adresse = formData.adresse_complete;
  const ville = trouverVille(adresse);
  const secteur = trouverSecteur(ville, adresse);

  return (
    <div className="space-y-5">
      <Liste
        titre="Ce qu'il faut savoir sur la commune"
        aide="Cinq phrases au plus, une idée par phrase. Tant que rien n'est repris, le client lit celles du jeu de données."
        champ="ville_points"
        formData={formData}
        setFormData={setFormData}
        reference={ville?.points}
      />
      <Liste
        titre="Ce qu'il faut savoir sur le secteur"
        aide="Une seule phrase sur la rue : sa commercialité et la clientèle qui y passe."
        champ="secteur_points"
        formData={formData}
        setFormData={setFormData}
        reference={secteur?.points}
      />
    </div>
  );
}
