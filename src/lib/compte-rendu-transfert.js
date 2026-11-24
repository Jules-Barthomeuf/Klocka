// Le compte rendu d'un transfert à sourcing@ (23 nov. 2026, Jules : « une pop-up de base, on clique dessus, on arrive
// sur la conversation ; quand on la ferme, c'est mis dans À faire ; on clique dessus et ça ouvre la bonne
// conversation ») : les deux gestes, et l'ouverture de la conversation sur la page de l'assistant.
import { base44 } from "@/api/base44Client";
import { createPageUrl } from "@/utils";

/** Ouvre la conversation du compte rendu : marqué vu et ouvert, puis la page de l'assistant avec cette conversation. */
export async function ouvrirCompteRendu(mailId, navigate, conversationId = null) {
  const r = await base44.request("POST", `/api/assistant/comptes-rendus/${encodeURIComponent(mailId)}/ouvrir`).catch(() => null);
  const id = r?.conversation_id || conversationId;
  if (id) navigate(`${createPageUrl("Dashboard")}?conversation=${encodeURIComponent(id)}`);
}

/** La croix de la pop-up : vu, rangé dans « À faire ». */
export const compteRenduPlusTard = (mailId) => base44.request("POST", `/api/assistant/comptes-rendus/${encodeURIComponent(mailId)}/plus-tard`).catch(() => null);
