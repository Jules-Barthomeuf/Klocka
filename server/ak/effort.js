// L'effort de réflexion des chats (12 oct. 2026) : « high » par défaut, AK_EFFORT pour le changer
// (low, medium, high, xhigh, max). Le même pour AK et pour les chats des mandataires.
const NIVEAUX = ['low', 'medium', 'high', 'xhigh', 'max'];
export const effortDuChat = () => { const e = String(process.env.AK_EFFORT || 'high').trim().toLowerCase(); return NIVEAUX.includes(e) ? e : 'high'; };
