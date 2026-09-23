import React from "react";
import { Paperclip, X } from "lucide-react";

// Les pièces d'un brouillon de mail : ce que l'assistant a trouvé dans le
// projet, cochées d'office. On en retire une d'une croix ; rien ne s'ajoute
// ici, la liste vient du projet (onglet Documents, Drive de son dossier).

/** Le brouillon tel que l'assistant le rend, prêt pour l'état de la page. */
export function brouillonDepuis(resultat) {
  return {
    deal_id: resultat.deal_id,
    intention: resultat.intention,
    destinataire: resultat.destinataire || "",
    objet: resultat.objet || "",
    corps: resultat.corps || "",
    projet_id: resultat.projet_id || null,
    pieces: resultat.pieces || [],
    liens: resultat.liens || [],
    avertissement: resultat.avertissement || null,
  };
}

/** Ce que sendMail reçoit : les identifiants des pièces gardées, jamais un chemin. */
export function envoiDepuis(b) {
  return {
    to: b.destinataire,
    subject: b.objet,
    body: b.corps,
    deal_id: b.deal_id,
    intention: b.intention,
    ...(b.projet_id && b.pieces?.length ? { projet_id: b.projet_id, pieces: b.pieces.map((p) => p.id) } : {}),
  };
}

export default function PiecesBrouillon({ b, onChange }) {
  const pieces = b?.pieces || [];
  if (!pieces.length && !b?.avertissement && !b?.liens?.length) return null;
  return (
    <div className="mt-3 border-t border-trait pt-3">
      {pieces.length > 0 && (
        <>
          <p className="m-0 mb-2 flex items-center gap-1.5 text-[11px] text-brume">
            <Paperclip className="h-3 w-3" /> {pieces.length} pièce{pieces.length > 1 ? "s" : ""} jointe{pieces.length > 1 ? "s" : ""}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {pieces.map((p) => (
              <span key={p.id} className="inline-flex items-center gap-1.5 rounded-full border border-trait bg-encre/[0.03] py-1 pl-3 pr-1.5 text-[12px] text-craie">
                {p.nom}
                <button
                  type="button"
                  onClick={() => onChange({ ...b, pieces: pieces.filter((x) => x.id !== p.id) })}
                  aria-label={`Retirer ${p.nom}`}
                  className="flex h-4 w-4 items-center justify-center rounded-full text-brume hover:text-encre"
                  style={{ background: "transparent" }}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        </>
      )}
      {b?.liens?.length > 0 && (
        <p className="m-0 mt-2 text-[11.5px] text-brume">
          Ne se joignent pas, à citer dans le mail : {b.liens.map((l) => l.nom).join(", ")}.
        </p>
      )}
      {b?.avertissement && <p className="m-0 mt-2 text-[11.5px] text-ambre">{b.avertissement}</p>}
    </div>
  );
}
