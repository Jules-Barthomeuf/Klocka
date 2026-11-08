// Le fil d'un mandat : la conversation entre le mandataire et Klocka, de la
// demande envoyée au mandat inscrit au registre (27 oct. 2026, Jules : « on
// reçoit le mandat créé sur la plateforme par le mandataire, c'est nous qui
// devons le mettre dans MyNotary et lui envoyer ; je veux pouvoir communiquer
// avec le mandataire »). Pas d'automatisme MyNotary : Klocka saisit le mandat
// à la main, l'envoie en signature depuis MyNotary (le mandataire ou Klocka,
// et le vendeur signent), puis joint le mandat signé dans cette conversation ;
// le mandataire passe alors à l'étape suivante (27 oct. 2026, Jules). Chaque
// étape s'écrit dans le fil.
// Quatre temps depuis le 2 nov. 2026 (Jules) : envoyé ; Klocka joint le mandat
// rempli, à relire (`a_relire`) ; le mandataire le valide (`valide_le`) et
// Klocka l'envoie en signature ; Klocka joint le mandat signé (statut « pret »)
// et le mandataire dit « Mandat signé reçu » (statut « signe »). Le statut
// reste « demande_envoyee » pendant la relecture : rien d'autre ne change.
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

// La conversation avec l'équipe commence avant le mandat (2 nov. 2026, Jules : « quand on parle avec l'équipe pour
// l'avis de valeur, on retrouve cette discussion une fois le mandat fini et reçu par l'équipe ») : une par bien (sa
// fiche), rangée sous la clé `bien-<id de la fiche>` ; le mandat du bien la reprend telle quelle, à la suite.
export const cleDuBien = (pid) => `bien-${pid}`;
export const pidDeCle = (id) => (String(id || '').startsWith('bien-') ? String(id).slice(5) : null);

/** La fiche d'un mandat : la sienne, ou celle de son avis de valeur. */
export function pidDuMandat(m) {
  if (!m) return null;
  return pidDeCle(m.id) || m.proprietaire_id || (m.estimation_id ? Records.get('EstimationMandataire', m.estimation_id)?.proprietaire_id : null) || null;
}

/** Le bien avant son mandat, sous la forme d'un mandat pour le fil : titre, mandataire, aucun statut de mandat. */
export function mandatDuBien(pid) {
  const p = pid ? Records.get('ProprietaireMandataire', pid) : null;
  if (!p) return null;
  // Son avis de valeur, le plus récent : l'équipe le voit à droite de la conversation (2 nov. 2026, Jules).
  const estimation = Records.filter('EstimationMandataire', { proprietaire_id: pid }).filter((e) => !e.exemple)
    .sort((a, b) => String(b.updated_date || b.cree_le || '').localeCompare(String(a.updated_date || a.cree_le || '')))[0] || null;
  return { id: cleDuBien(pid), bien: [p.commerce || p.nom, p.ville].filter(Boolean).join(' · ') || 'Bien', mandataire_email: p.mandataire_email, statut: 'avant_mandat', avant_mandat: true, proprietaire_id: pid, estimation_id: estimation?.id || null };
}

export function filDuMandat(mandatId) {
  const ids = new Set([mandatId]);
  if (!pidDeCle(mandatId)) {
    const pid = pidDuMandat(Records.get(MANDATS, mandatId));
    if (pid) ids.add(cleDuBien(pid));
  }
  return Records.list(ENTITE).filter((m) => ids.has(m.mandat_id)).sort((a, b) => String(a.le).localeCompare(String(b.le)));
}

export function marquerLu(mandatId, email) {
  for (const m of filDuMandat(mandatId).filter((x) => !(x.lu_par || []).includes(bas(email)))) {
    Records.update(ENTITE, m.id, { lu_par: [...(m.lu_par || []), bas(email)] });
  }
}

/** Les messages de l'autre côté pas encore lus (les événements ne comptent pas). */
export const nonLus = (mandatId, email) => filDuMandat(mandatId).filter((m) => m.genre !== 'evenement' && !(m.lu_par || []).includes(bas(email))).length;

export const titreDe = (m) => m.bien || 'Mandat';
export const lienKlocka = (m) => `/Mandats?mandat=${m.id}`;
export const lienMandataire = (m) => (m.avant_mandat ? `/Biens?bien=proprietaire:${m.proprietaire_id}&etape=estimation&vue=conversation` : `/Biens?bien=mandat:${m.id}&etape=mandat&vue=conversation`);
export const estPdf = (p) => /\.pdf$/i.test(String(p?.nom || p?.url || ''));

async function prevenir(pour, titre, texte, lien, cle) {
  const { notifier } = await import('./notifications.js');
  notifier({ pour, titre, texte, lien, action: 'Ouvrir', cle });
}

/** Le mandataire prévenu d'une étape cochée par l'équipe (mandataire-portes.js, cocherEtapeMandat). */
export const prevenirMandataire = (mandat, titre, texte, cle) => prevenir(mandat.mandataire_email, titre, texte, lienMandataire(mandat), cle);

/** Le mandataire écrit : Klocka est prévenue. */
export async function ecrireMandataire(mandat, user, { texte, pieces = [] }) {
  if (mandat.exemple) return { ok: false, error: "C'est le mandat d'exemple : la conversation ne s'ouvre que sur un vrai mandat." };
  const m = poser(mandat.id, { auteur_email: user.email, cote: 'mandataire', texte, pieces });
  if (!m) return { ok: false, error: 'Message vide.' };
  await prevenir(responsable(mandat), `${mandat.avant_mandat ? 'Message sur un bien' : 'Message sur un mandat'} · ${titreDe(mandat)}`, String(texte || pieces[0]?.nom || '').slice(0, 160), lienKlocka(mandat), `fil-mandat:${m.id}`);
  return { ok: true, message: m };
}

/** Pure : où en est le mandat dans ses quatre temps (2 nov. 2026). */
export function tempsDuMandat(m) {
  if (!m || !m.statut || m.statut === 'brouillon') return null;
  if (m.statut === 'signe' || m.statut === 'enregistre') return 'recu';
  if (m.statut === 'pret') return 'signe';
  if (m.valide_le) return 'en_signature';
  if (m.a_relire) return 'a_relire';
  return 'envoye';
}

/**
 * Klocka écrit : le mandataire est prévenu. Un PDF joint n'avance plus le mandat de lui-même (2 nov. 2026, Jules :
 * « cliquer sur les étapes pour les valider au lieu que ça se fasse automatiquement ») : l'équipe coche l'étape, et
 * le dernier PDF joint devient le mandat rempli ou signé (mandataire-portes.js, cocherEtapeMandat).
 */
export async function ecrireKlocka(mandat, user, { texte, pieces = [] }) {
  const m = poser(mandat.id, { auteur_email: user.email, cote: 'analyste', texte: texte || '', pieces });
  if (!m) return { ok: false, error: 'Message vide.' };
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
    evenement(mandat.id, 'Mandat envoyé : il est saisi sur MyNotary au plus vite, puis vous arrive ici pour relecture. Après votre validation, il part en signature, et le mandat signé arrivera dans cette conversation.');
    // Un mandat de location se saisit sur le modèle de location de MyNotary (6 nov. 2026) : le titre le dit.
    await prevenir(responsable(mandat), `Mandat${mandat.transaction === 'location' ? ' de location' : ''} à saisir sur MyNotary · ${bien}`, `${mandat.vendeur || ''}${mandat.prix ? ` · ${Number(mandat.prix).toLocaleString('fr-FR')} €` : mandat.loyer ? ` · location, ${Number(mandat.loyer).toLocaleString('fr-FR')} € HT HC par an` : ''}`.replace(/^ · /, '') || null, lienKlocka(mandat), `mandat-demande:${mandat.id}`);
  } else if (statut === 'valide') {
    evenement(mandat.id, 'Mandat validé : il part en signature.');
    await prevenir(responsable(mandat), `Mandat validé · ${bien}`, 'À envoyer en signature sur MyNotary.', lienKlocka(mandat), `mandat-valide:${mandat.id}`);
  } else if (statut === 'pret') {
    // Le PDF est déjà dans la conversation (le message qui le porte) : la notification suffit.
    await prevenir(mandat.mandataire_email, `Votre mandat signé est arrivé · ${bien}`, 'Il est dans la conversation : passez à l’étape suivante.', lienMandataire(mandat), `mandat-pret:${mandat.id}:${mandat.document?.url || ''}`);
  } else if (statut === 'signe') {
    evenement(mandat.id, 'Mandat signé reçu : il est à inscrire au registre.');
    await prevenir(responsable(mandat), `Mandat signé · ${bien}`, 'À inscrire au registre des mandats.', lienKlocka(mandat), `mandat-signe:${mandat.id}`);
  } else if (statut === 'enregistre') {
    evenement(mandat.id, `Inscrit au registre des mandats${mandat.numero_registre ? `, n° ${mandat.numero_registre}` : ''}.`);
  }
}

/** Les mandats que Klocka traite : tout ce qui est parti, sauf les exemples ; ce qui attend un geste d'abord. */
export function mandatsPourKlocka(moi) {
  // À Klocka d'agir : saisir, envoyer en signature une fois validé, inscrire au registre ; pas pendant la relecture.
  const aFaire = (m) => ((m.statut === 'demande_envoyee' && (!m.a_relire || m.valide_le)) || m.statut === 'signe' ? 1 : 0);
  const partis = Records.list(MANDATS).filter((m) => !m.exemple && m.statut && m.statut !== 'brouillon');
  // Les biens dont on parle avec l'équipe avant le mandat : une ligne chacun, jusqu'à ce que leur mandat parte (il
  // reprend alors la conversation).
  const avecMandat = new Set(partis.map(pidDuMandat).filter(Boolean));
  const avant = [...new Set(Records.list(ENTITE).map((x) => pidDeCle(x.mandat_id)).filter(Boolean))]
    .filter((pid) => !avecMandat.has(pid)).map(mandatDuBien).filter(Boolean);
  return [...partis, ...avant]
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
