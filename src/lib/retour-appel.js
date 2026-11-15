// Le chat d'après l'appel propose son analyse (15 nov. 2026, Jules) : un « oui » à cette offre, ou une demande d'analyse,
// de conseils ou de retour, lance le retour d'AK au lieu de l'assistant des actions.

const sansAccents = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Pure : ce message demande-t-il le retour sur l'appel ? `offert` : le chat vient de le proposer (le simple « oui » vaut alors demande). */
export function demandeRetour(message, { offert = true } = {}) {
  const t = sansAccents(message).replace(/[.!?,;]+$/g, "").trim();
  if (!t) return false;
  if (/^(oui|ouais|ok|d'accord|allez)?[ ,]*(regardons|regardons[- ]le|on regarde|allons[- ]y|on y va)( ensemble)?$/.test(t)) return offert;
  if (/\b(ton analyse|votre analyse|analyse (de |sur )?(mon |l'|cet )?appel|analyse[- ]moi|analyser mon appel|ce que je (peux|pourrais|dois) ameliorer|m'ameliorer|ameliorer|feedback|un retour|ton retour|votre retour|des conseils|tes conseils|vos conseils|coach|debrief)\b/.test(t)) return true;
  if (!offert) return false;
  return /^(oui|ouais|ok|okay|d'accord|vas[- ]y|allez[- ]y|go|volontiers|avec plaisir|je veux bien|oui merci|oui vas[- ]y|oui allez[- ]y|oui stp|oui s'il te plait|oui s'il vous plait|carrement|bien sur|grave|yes)( merci)?$/.test(t);
}
