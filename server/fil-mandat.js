// Le fil d'un mandat : la conversation entre le mandataire et Klocka, de la
// demande envoyée au mandat inscrit au registre (27 oct. 2026, Jules : « on
// reçoit le mandat créé sur la plateforme par le mandataire, c'est nous qui
// devons le mettre dans MyNotary et lui envoyer ; je veux pouvoir communiquer
// avec le mandataire »). Pas d'automatisme MyNotary : Klocka saisit le mandat
// à la main, l'envoie en signature depuis MyNotary (le mandataire ou Klocka,
// et le vendeur signent), puis joint le mandat signé dans cette conversation ;
// le mandataire passe alors à l'étape suivante (27 oct. 2026, Jules). Chaque
// étape s'écrit dans le fil.
// Côté mandataire, l'écran ne dit pas « Klocka » (27 oct. 2026, Jules) : la
// conversation s'appelle Conversation.
//
// Côté Klocka, le mandat va à l'analyste attitré du mandataire (sa fiche),
// sinon à Jules : une notification sans destinataire va à Jules seul.

import { Records } from './db.js';

const ENTITE = 'MessageMandat';
const MANDATS = 'MandatMandataire';
const maintenant = () => new Date().toISOString();
const bas = (e) => String(e || '').toLowerCase();

/** Qui suit les mandats d'un mandataire chez Klocka : son analyste attitré, sinon personne (Jules). */
export function responsable(mandat) {
  const fiche = Records.list('FicheMandataire').find((f) => bas(f.email) === bas(mandat?.mandataire_email));
  return bas(fiche?.analyste_email) || null;
}

export function poser(mandatId, { auteur_email = null, cote = 'systeme', texte, pieces = [], genre = 'message' }) {
  const t = String(texte || '').trim();
  if (!t && !pieces.length) return null;
  return Records.create(ENTITE, {
    mandat_id: mandatId, auteur_email: bas(auteur_email) || null, cote, genre,
    texte: t.slice(0, 6000), pieces: pieces.slice(0, 10), le: maintenant(), lu_par: auteur_email ? [bas(auteur_email)] : [],
  });
}

export const evenement = (mandatId, texte) => poser(mandatId, { cote: 'systeme', genre: 'evenement', texte });

export function filDuMandat(mandatId) {
  return Records.list(ENTITE).filter((m) => m.mandat_id === mandatId).sort((a, b) => String(a.le).localeCompare(String(b.le)));
}

export function marquerLu(mandatId, email) {
  for (const m of filDuMandat(mandatId).filter((x) => !(x.lu_par || []).includes(bas(email)))) {
    Records.update(ENTITE, m.id, { lu_par: [...(m.lu_par || []), bas(email)] });
  }
}

/** Les messages de l'autre côté pas encore lus (les événements ne comptent pas). */
export const nonLus = (mandatId, email) => filDuMandat(mandatId).filter((m) => m.genre !== 'evenement' && !(m.lu_par || []).includes(bas(email))).length;

const titreDe = (m) => m.bien || 'Mandat';
export const lienKlocka = (m) => `/Mandats?mandat=${m.id}`;
export const lienMandataire = (m) => `/Biens?bien=mandat:${m.id}&etape=mandat&vue=conversation`;
const estPdf = (p) => /\.pdf$/i.test(String(p?.nom || p?.url || ''));

async function prevenir(pour, titre, texte, lien, cle) {
  const { notifier } = await import('./notifications.js');
  notifier({ pour, titre, texte, lien, action: 'Ouvrir', cle });
}

/** Le mandataire écrit : Klocka est prévenue. */
export async function ecrireMandataire(mandat, user, { texte, pieces = [] }) {
  if (mandat.exemple) return { ok: false, error: "C'est le mandat d'exemple : la conversation ne s'ouvre que sur un vrai mandat." };
  const m = poser(mandat.id, { auteur_email: user.email, cote: 'mandataire', texte, pieces });
  if (!m) return { ok: false, error: 'Message vide.' };
  await prevenir(responsable(mandat), `Message sur un mandat · ${titreDe(mandat)}`, String(texte || pieces[0]?.nom || '').slice(0, 160), lienKlocka(mandat), `fil-mandat:${m.id}`);
  return { ok: true, message: m };
}

/**
 * Klocka écrit : le mandataire est prévenu. Le premier PDF joint à un mandat
 * « à saisir » est le mandat signé, revenu de MyNotary : il le rend prêt (le
 * mandataire peut passer à l'étape suivante), et une seule notification part,
 * « Votre mandat signé est arrivé ».
 */
export async function ecrireKlocka(mandat, user, { texte, pieces = [] }) {
  const redige = mandat.statut === 'demande_envoyee' ? pieces.find(estPdf) : null;
  const m = poser(mandat.id, { auteur_email: user.email, cote: 'analyste', texte: texte || (redige ? 'Voici le mandat signé.' : ''), pieces });
  if (!m) return { ok: false, error: 'Message vide.' };
  if (redige) {
    const { deposerMandatPret } = await import('./mandataire-portes.js');
    const document = { nom: redige.nom, url: redige.url };
    const r = deposerMandatPret(mandat.id, { document }, user);
    if (!r.ok) return r;
    return { ok: true, message: m, mandat: Records.update(MANDATS, mandat.id, { document_signe: document }) };
  }
  const { nomAnalyste } = await import('./fil-dossier.js');
  await prevenir(mandat.mandataire_email, `${nomAnalyste(user.email)} vous a écrit · ${titreDe(mandat)}`, String(texte || pieces[0]?.nom || '').slice(0, 160), lienMandataire(mandat), `fil-mandat:${m.id}`);
  return { ok: true, message: m };
}

/**
 * Chaque étape du mandat s'écrit dans son fil, et prévient celui qui doit agir :
 * Klocka à la demande (saisir sur MyNotary) et au mandat signé (l'inscrire au
 * registre), le mandataire au mandat prêt (le faire signer). Le registre ne
 * prévient personne : le fil suffit.
 */
export async function surEtape(mandat, statut) {
  if (!mandat || mandat.exemple) return;
  const bien = titreDe(mandat);
  if (statut === 'demande_envoyee') {
    evenement(mandat.id, 'Mandat envoyé : il est saisi sur MyNotary et envoyé en signature. Le mandat signé arrivera dans cette conversation.');
    await prevenir(responsable(mandat), `Mandat à saisir sur MyNotary · ${bien}`, `${mandat.vendeur || ''}${mandat.prix ? ` · ${Number(mandat.prix).toLocaleString('fr-FR')} €` : ''}`.replace(/^ · /, '') || null, lienKlocka(mandat), `mandat-demande:${mandat.id}`);
  } else if (statut === 'pret') {
    // Le PDF est déjà dans la conversation (le message qui le porte) : la notification suffit.
    await prevenir(mandat.mandataire_email, `Votre mandat signé est arrivé · ${bien}`, 'Il est dans la conversation : passez à l’étape suivante.', lienMandataire(mandat), `mandat-pret:${mandat.id}:${mandat.document?.url || ''}`);
  } else if (statut === 'signe') {
    evenement(mandat.id, 'Le mandataire est passé à l’étape suivante : le mandat est à inscrire au registre.');
    await prevenir(responsable(mandat), `Mandat signé · ${bien}`, 'À inscrire au registre des mandats.', lienKlocka(mandat), `mandat-signe:${mandat.id}`);
  } else if (statut === 'enregistre') {
    evenement(mandat.id, `Inscrit au registre des mandats${mandat.numero_registre ? `, n° ${mandat.numero_registre}` : ''}.`);
  }
}

/** Les mandats que Klocka traite : tout ce qui est parti, sauf les exemples ; ce qui attend un geste d'abord. */
export function mandatsPourKlocka(moi) {
  const aFaire = (m) => (m.statut === 'demande_envoyee' || m.statut === 'signe' ? 1 : 0);
  return Records.list(MANDATS)
    .filter((m) => !m.exemple && m.statut && m.statut !== 'brouillon')
    .map((m) => {
      const fil = filDuMandat(m.id);
      const dernier = fil[fil.length - 1] || null;
      const u = Records.findBy('User', 'email', bas(m.mandataire_email));
      return {
        ...m,
        mandataire_nom: u?.full_name || m.mandataire_email,
        non_lus: nonLus(m.id, moi),
        a_faire: !!aFaire(m),
        dernier: dernier ? { texte: String(dernier.texte || (dernier.pieces || []).map((p) => p.nom).join(', ')).slice(0, 140), le: dernier.le, cote: dernier.cote } : null,
        activite: dernier?.le || m.demande_envoyee_le || m.cree_le || null,
      };
    })
    .sort((a, b) => aFaire(b) - aFaire(a) || (b.non_lus > 0) - (a.non_lus > 0) || String(b.activite || '').localeCompare(String(a.activite || '')));
}
