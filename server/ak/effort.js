// L'effort de réflexion des chats (12 oct. 2026) : AK_EFFORT pour le changer (low, medium, high, xhigh, max).
// Le même pour AK et pour les chats des mandataires. « medium » par défaut depuis le 18 oct. 2026 (Jules : « baisse
// les crédits le plus possible ») : la réflexion se paie au prix de la sortie ; « high » avant.
const NIVEAUX = ['low', 'medium', 'high', 'xhigh', 'max'];
export const effortDuChat = () => { const e = String(process.env.AK_EFFORT || 'medium').trim().toLowerCase(); return NIVEAUX.includes(e) ? e : 'medium'; };
