// Ce que l'assistant dit au mandataire au mandat signé. Depuis le 2 nov. 2026 au soir (Jules, son propre texte : « Mandat
// signé, bien joué ! J'ai préparé un mail à envoyer au propriétaire pour donner accès à la data room… La priorité c'est…
// On a déjà le bail donc je l'ai mis dans la data room. Je compte relancer si je n'ai pas de documents d'ici 3 jours. Le
// mail est écrit dans l'écran de droite ») : l'assistant arrive avec le travail fait, il ne demande rien qu'il sache déjà.
// Le droit de préférence du locataire (art. L. 145-46-1 du Code de commerce) est rappelé, sauf bien vendu libre ou
// exception notée. Ni les chiffres du mandat (il vient de les signer), ni le registre.
// Le message s'écrit dans le fil du bien, au clic sur « Mandat signé reçu » comme au dépôt d'un mandat signé à la main.
// Un mandat sans fiche (fait sans avis de valeur) n'a pas de fil de bien : le message va dans sa propre conversation,
// celle que « Parler à l'assistant » rouvre à l'étape Mandat.

import { Records } from './db.js';

const minuscule = (t) => String(t || '').charAt(0).toLowerCase() + String(t || '').slice(1);
// La pièce dite dans une phrase, avec son article (« le bail », « les trois dernières quittances »).
const ARTICLES = {
  bail: 'le bail', quittances: 'les trois dernières quittances', diagnostics: 'les diagnostics (DPE, amiante…)', taxe_fonciere: 'la dernière taxe foncière',
  kbis: 'le Kbis du locataire', copropriete: 'le règlement de copropriété', titre: 'le titre de propriété', charges: "le dernier appel de charges", plans: 'les plans',
  statuts_vendeur: 'les statuts de la société', kbis_vendeur: 'le Kbis de la société', pouvoirs: 'les pouvoirs du gérant pour vendre',
};
export const dite = (p) => (typeof p === 'string' ? minuscule(p) : ARTICLES[p?.cle] || minuscule(p?.mot));
const liste = (mots) => (mots.length > 1 ? `${mots.slice(0, -1).join(', ')} et ${mots.at(-1)}` : mots[0] || '');

/**
 * Pure : le message. `occupe` : true, false ou null (inconnu : le locataire est rappelé par prudence). `deja` : les
 * pièces reprises dans la Data room ; `manquantes` : les requises qui manquent ; `priorite` : { mot, raison } ;
 * `email` : l'adresse du propriétaire est connue ; `mail` : le premier mail est prêt à droite.
 */
export function messageMandatSigne({ occupe = null, exception = false, deja = [], manquantes = [], priorite = null, email = true, mail = true, photos = 0, delai = 3 } = {}) {
  const locataire = occupe !== false && !exception
    ? "\n\nLe locataire a un droit de préférence : il doit recevoir l'offre de vente avant tout acheteur, et il a un mois pour répondre. Je préparerai sa notification."
    : '';
  const pluriel = deja.length > 1 || /^les /.test(dite(deja[0]));
  const dejaLa = deja.length ? ` On a déjà ${liste(deja.map(dite))}, je ${pluriel ? 'les ai mis' : "l'ai mis"} dans la Data room.` : '';
  if (!manquantes.length) {
    return `Mandat signé, bien joué !${dejaLa} Les pièces du dossier sont toutes là.${locataire}\n\n${photos < 6 ? `Il faut maintenant six à huit photos du local, de la façade et de la rue${photos ? ` (vous en avez ${photos})` : ''} : vous me les envoyez ici ?` : 'On prépare le teaser ?'}`;
  }
  const prio = priorite ? ` La priorité, c'est ${dite(priorite)} : ${priorite.raison}.` : '';
  const suite = !email
    ? "\n\nIl me manque son adresse e-mail : vous me la donnez ? Le mail part dès que je l'ai."
    : mail ? '\n\nLe mail est écrit dans l’écran de droite : un tap sur « Envoyer » et il part.' : '';
  return `Mandat signé, bien joué ! J'ai préparé un mail au propriétaire pour lui donner accès à la Data room, où il dépose ses documents quand il le souhaite.${prio}${dejaLa}${suite}\n\nSans documents d'ici ${delai} jours, je vous prépare la relance.${locataire}`;
}

/** Le fil où l'assistant parle au mandataire d'un dossier : celui du bien, sinon la conversation du mandat. */
function filDuMandat(mandat) {
  const e = mandat?.estimation_id ? Records.get('EstimationMandataire', mandat.estimation_id) : null;
  return mandat?.proprietaire_id || e?.proprietaire_id || null;
}

/**
 * L'assistant écrit au mandataire, de lui-même (une pièce arrivée, une relance prête, un blocage) : dans le fil du bien,
 * sinon dans la conversation du mandat. `avant` : la ligne du mandataire qui précède (un geste qui tient lieu de message).
 */
export async function direAuMandataire(mandat, contenu, { avant = null, boutons = null, user = null } = {}) {
  if (!mandat || mandat.exemple || !contenu) return false;
  const lui = { ...(user || {}), email: mandat.mandataire_email, role: user?.role || 'mandataire' };
  const le = new Date().toISOString();
  const echange = [...(avant ? [{ role: 'user', contenu: avant, le }] : []), { role: 'assistant', contenu, le, ...(boutons?.length ? { boutons } : {}) }];
  const pid = filDuMandat(mandat);
  if (pid) {
    const { rejoindreLeFil } = await import('./fil-du-bien.js');
    return !!rejoindreLeFil(lui, pid, echange)?.ok;
  }
  const C = await import('./assistant-conversations.js');
  const espace = 'mandataire-mandat';
  const deja = mandat.conversation_id ? C.lireConversation(lui, mandat.conversation_id, { espace }) : null;
  const r = C.enregistrerConversation(lui, { id: deja?.id || null, messages: [...(deja?.messages || []), ...echange], espace });
  if (r?.ok && r.id !== mandat.conversation_id) Records.update('MandatMandataire', mandat.id, { conversation_id: r.id });
  return !!r?.ok;
}

/** Le mandat signé reçu : le premier mail se prépare, puis le message rejoint le fil. Rend true s'il est écrit. */
export async function direLaSuite(mandat, dossier, user) {
  if (!mandat || mandat.exemple) return false;
  const q = mandat.questionnaire || {};
  let manquantes = [];
  let deja = [];
  let priorite = null;
  let photos = 0;
  let mail = false;
  let email = true;
  if (dossier) {
    const P = await import('./mandataire-portes.js');
    const V = await import('./dossier-vente.js');
    const c = P.checklist(dossier);
    manquantes = c.manquantes.filter((l) => l.cle !== 'autres').map((l) => l.mot);
    deja = c.lignes.filter((l) => l.recue).map((l) => ({ cle: l.cle, mot: l.mot }));
    priorite = V.prioriteDesPieces(c.manquantes);
    photos = (dossier.photos || []).length;
    email = String(dossier.proprietaire_email || '').includes('@');
    // Le mail est prêt avant que le mandataire n'arrive : il n'a qu'à l'envoyer.
    if (manquantes.length) mail = !!(await V.veilleDuDossier(dossier.id, { notifier: false }));
  }
  const contenu = messageMandatSigne({
    occupe: typeof q.bien_occupe === 'boolean' ? q.bien_occupe : null,
    exception: !!dossier?.preference?.exception,
    deja, manquantes, priorite, email, mail, photos,
  });
  // Le geste du mandataire tient lieu de sa ligne : « Mandat signé reçu », puis la réponse.
  return direAuMandataire(mandat, contenu, { avant: 'Mandat signé reçu.', user });
}
