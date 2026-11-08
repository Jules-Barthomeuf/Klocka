import React from "react";

// Le conseil de l'assistant pour l'onglet ouvert de la Mise en vente (7 nov. 2026, Jules) : en tête de la colonne du
// chat, la phrase du serveur (GET vente-etat, `conseils`) et au plus deux gestes. Un geste avec `texte` part dans le
// chat, avec `onglet` ouvre cet onglet, avec `piste_id` ouvre la fiche de ce contact.

export const NOMS_ONGLETS = { dataroom: "Data room", diffusion: "Diffusion", acquereurs: "Acquéreurs", offres: "Offres", vendeur: "Vendeur" };

const PLEIN = "inline-flex h-9 items-center rounded-full bg-menthe px-4 text-[13.5px] text-sur-menthe hover:bg-menthe-survol";
const BORDE = "inline-flex h-9 items-center rounded-full border border-bord-vif px-3.5 text-[13px] text-craie hover:border-menthe hover:text-encre";

export default function ConseilVente({ conseil, onglet, onOnglet = null, onPiste = null }) {
  if (!conseil?.texte) return null;
  const actions = (conseil.actions || []).slice(0, 2);
  const faire = (a) => {
    if (a.texte) window.dispatchEvent(new CustomEvent("klocka:lancer", { detail: { texte: a.texte } }));
    else if (a.onglet) onOnglet?.(a.onglet);
    else if (a.piste_id) onPiste?.(a.piste_id);
  };
  return (
    <div className="text-left">
      <p className="m-0 text-[12.5px] text-ardoise">L'Assistant KPartners{NOMS_ONGLETS[onglet] ? ` · Onglet ${NOMS_ONGLETS[onglet]}` : ""}</p>
      <p className="m-0 mt-1 whitespace-pre-line text-[15px] leading-[1.55] text-encre">{conseil.texte}</p>
      {actions.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {actions.map((a, i) => (
            <button key={`${a.libelle}-${i}`} type="button" onClick={() => faire(a)} className={i === 0 ? PLEIN : BORDE}
              style={i === 0 ? undefined : { background: "transparent" }}>{a.libelle}</button>
          ))}
        </div>
      )}
    </div>
  );
}
