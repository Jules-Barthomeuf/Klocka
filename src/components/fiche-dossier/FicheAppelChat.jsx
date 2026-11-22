import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Mic, Phone, Sparkles } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { ouvrirFiche } from "@/lib/fiche-dossier";
import { Onde } from "@/components/fiche-dossier/ModeEnregistrement";

// La fiche d'appel dans le chat (20 nov. 2026, Jules : « on clique sur la relance dans À faire, on revient à la
// conversation, et en dessous : voici la fiche d'appel d'Alexandre, vous pouvez l'appeler directement ; le même style
// que la fiche du mode appel, en plus petit, au format du chat »). La carte du mode appel (k-verre, le nom et le numéro
// en tête, le résumé IA à gauche, ce qu'il faut obtenir à droite) ; « Enregistrer l'appel » passe la saisie en mode
// Enregistrement, déjà liée à la personne. Les notes s'écrivent dans la saisie du chat, sans bouton pour ça (Jules).

const mm = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/**
 * @param {{ action: object, fait?: { duree?: number, mode?: string } | null, enregistre?: boolean, onEnregistrer: () => void }} props
 */
export default function FicheAppelChat({ action: a, fait = null, enregistre = false, onEnregistrer }) {
  const personne = (a.fiches || []).find((f) => /^(agent|twenty|client)/.test(f.cle)) || (a.fiches || [])[0] || null;
  const { data: f } = useQuery({
    queryKey: ["fiche-dossier", personne?.cle],
    queryFn: () => base44.request("GET", `/api/fiche-dossier/fiche?cle=${encodeURIComponent(personne.cle)}`),
    enabled: !!personne?.cle, staleTime: 15_000, retry: false,
  });
  const nom = a.pour || personne?.nom || f?.nom || "le contact";
  const questions = a.contexte || [];
  const bouton = "inline-flex h-10 items-center gap-2 rounded-full px-5 text-[14px] transition-colors disabled:opacity-50";

  return (
    <div className="k-verre mt-3 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-5 py-4 max-md:px-4">
        <div className="min-w-0">
          {/* Sans le surtitre « Relance » (20 nov. 2026, Jules) : le nom suffit. */}
          <p className="m-0 break-words text-[19px] leading-[1.25] text-encre">{nom}</p>
          {f?.detail && f.detail !== "Twenty CRM" && <p className="m-0 mt-0.5 truncate text-[13px] text-ardoise">{f.detail}</p>}
        </div>
        {/* Le numéro en blanc, à composer sur son téléphone (comme le mode appel, pas de lien tel: sur l'ordinateur). */}
        {a.telephone
          ? <span className="inline-flex items-center gap-2 text-[15px] tabular-nums text-encre"><Phone className="h-4 w-4 flex-none" strokeWidth={1.8} /><span className="select-all">{a.telephone}</span></span>
          : <span className="text-[13px] text-ardoise">Pas de numéro sur sa fiche</span>}
      </div>
      <div aria-hidden className="h-px bg-trait" />
      <div className="grid md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4 px-5 py-4 max-md:px-4 md:border-r md:border-trait">
          <div className="flex flex-col gap-1.5">
            <span className="inline-flex items-center gap-2 text-[13px] text-menthe"><Sparkles className="h-3.5 w-3.5" strokeWidth={1.8} />Résumé IA</span>
            {/* Le résumé en entier (22 nov. 2026, Jules : « on ne peut pas voir le reste du résumé ») : plus de coupe à six lignes. */}
            {f ? <p className="m-0 text-[14px] leading-[1.6] text-encre [text-wrap:pretty]">{f.resume || "Rien encore sur sa fiche : ce que tu notes la remplira."}</p> : (
              <div aria-label="Résumé en cours" className="flex flex-col gap-2 pt-1">
                <span className="h-3 w-[92%] animate-pulse rounded-full bg-rail-actif" />
                <span className="h-3 w-[70%] animate-pulse rounded-full bg-rail-actif" />
              </div>
            )}
          </div>
        </div>
        <div aria-hidden className="h-px bg-trait md:hidden" />
        <div className="px-5 py-4 max-md:px-4">
          <p className="m-0 mb-2.5 text-[13px] text-ardoise">Ce qu'il faut obtenir{questions.length ? ` · ${questions.length}` : ""}</p>
          {questions.length ? (
            <ul className="k-serie m-0 list-none space-y-2 p-0">
              {questions.map((q) => <li key={q} className="flex gap-2.5 text-[14px] leading-[1.5] text-encre"><span className="mt-[8px] h-1.5 w-1.5 flex-none rounded-full bg-menthe" />{q}</li>)}
            </ul>
          ) : <p className="m-0 text-[14px] leading-[1.5] text-craie">{a.titre}</p>}
        </div>
      </div>

      <div aria-hidden className="h-px bg-trait" />
      <div className="flex flex-wrap items-center gap-2.5 px-5 py-3.5 max-md:px-4">
        {fait ? <span className="inline-flex items-center gap-2.5 text-[14px] text-ardoise"><Check className="h-4 w-4 text-menthe" />{fait.mode === "notes" ? "Notes envoyées" : fait.mode === "pas_de_reponse" ? "Pas de réponse" : fait.mode === "message" ? "Message laissé" : `Appel enregistré${fait.duree ? ` · ${mm(fait.duree)}` : ""}`}</span>
          : enregistre ? <span className="inline-flex items-center gap-2.5 text-[14px] text-encre"><Onde />Enregistrement en cours : tout se passe en bas du chat</span>
            : (
              <button type="button" onClick={onEnregistrer} title="Mets le téléphone sur haut-parleur près de l'ordinateur, compose le numéro : l'assistant écoute et met sa fiche à jour"
                className={`${bouton} bg-menthe text-sur-menthe hover:bg-menthe-survol`}><Mic className="h-4 w-4" strokeWidth={1.8} />Enregistrer l'appel</button>
            )}
        {/* Plus de « Dernier échange », « Dossiers », « Ressenti » dans la carte (20 nov. 2026, Jules : « il faut pouvoir
            juste ouvrir la fiche ») : « Voir la fiche » en bas à droite, sur la ligne d'« Enregistrer l'appel », l'ouvre à droite. */}
        {personne?.cle && (
          <>
            <span className="flex-1" />
            <button type="button" onClick={() => ouvrirFiche(personne.cle)} className={`${bouton} border border-trait text-craie hover:text-encre`} style={{ background: "transparent" }}>Voir la fiche</button>
          </>
        )}
      </div>
    </div>
  );
}
