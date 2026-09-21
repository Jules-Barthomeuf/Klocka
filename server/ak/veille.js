// La veille du chat : AK relit les espaces, répond quand on lui parle, et
// revient dire quand une tâche de fond est finie.
//
// Un passage toutes les AK_INTERVALLE_S secondes. Chaque message déjà vu est
// noté (Meta), donc un redémarrage ne fait pas répondre deux fois. Les
// messages sont traités l'un après l'autre : deux demandes en même temps
// font deux réponses, dans l'ordre.

import fs from 'fs';
import path from 'path';
import { Records, Meta, CHEMIN_UPLOADS } from '../db.js';
import { chatDemande } from '../google-oauth.js';
import { compteAk, espacesSuivis, messagesDepuis, estPourAk, sansMention, envoyer, mention, telechargerPiece, NOM } from './chat.js';

const INTERVALLE_S = Math.max(5, Number(process.env.AK_INTERVALLE_S || 15));
// La flemme : une fois sur AK_FLEMME, AK refuse et ne fait rien. Jamais deux
// fois de suite dans le même espace : la personne insiste, il s'exécute. 0 :
// jamais. C'est une demande de Jules, pas une panne.
const FLEMME = Math.max(0, Number(process.env.AK_FLEMME ?? 6));
const FLEMME_REPIT_MS = 15 * 60 * 1000;
const CLE_FLEMME = 'ak.flemme';
const CLE_DEPUIS = 'ak.depuis';
const CLE_VUS = 'ak.vus';
const ENTITE_TACHE = 'AkTache';
// Après une réponse d'AK, la personne à qui il vient de parler peut lui
// répondre sans le mentionner, pendant ce délai : c'est une conversation.
const CLE_ATTENTE = 'ak.attente';
const ATTENTE_MS = 5 * 60 * 1000;
const MAX_VUS = 400;

let minuterie = null;
let enCours = false;
const dernier = { le: null, erreur: null, espaces: 0, repondus: 0 };

const vus = () => { try { return JSON.parse(Meta.get(CLE_VUS) || '[]'); } catch { return []; } };
const noterVu = (nom) => Meta.set(CLE_VUS, JSON.stringify([...vus(), nom].slice(-MAX_VUS)));

/** Les tâches de fond qui n'ont pas encore été annoncées. */
export const tachesEnCours = () => Records.filter(ENTITE_TACHE, { etat: 'en_cours' }).map((t) => ({ libelle: t.libelle, genre: t.genre, depuis: t.cree_le }));

function ouvrirTache(t, message) {
  return Records.create(ENTITE_TACHE, { ...t, espace: message.espace, fil: message.fil, pour: message.auteur, etat: 'en_cours', cree_le: new Date().toISOString(), fini_le: null, resultat: null, analyses: null });
}

/** Une préz se fabrique tout de suite ; la tâche se ferme quand elle est sur le Drive. */
async function lancerPrez(tache) {
  const { produirePrez } = await import('./agent.js');
  try {
    const resultat = await produirePrez(tache.projet_id);
    Records.update(ENTITE_TACHE, tache.id, { etat: 'finie', resultat, fini_le: new Date().toISOString() });
  } catch (e) {
    Records.update(ENTITE_TACHE, tache.id, { etat: 'ratee', resultat: { erreur: e?.message || String(e) }, fini_le: new Date().toISOString() });
  }
}

/** Les analyses K-Data d'une tâche : la tâche se ferme quand plus aucune ne tourne. */
function suivreKdata(tache) {
  const analyses = (tache.ids || []).map((id) => Records.get('AnalyseKData', id)).filter(Boolean);
  if (!analyses.length || analyses.some((a) => a.etat === 'en_cours')) return;
  Records.update(ENTITE_TACHE, tache.id, { etat: 'finie', analyses: analyses.map(({ outil, nom_outil, etat, resume, erreur, ref }) => ({ outil, nom_outil, etat, resume, erreur, ref })), fini_le: new Date().toISOString() });
}

/** Les tâches finies sont annoncées une fois, là où on les a demandées. */
async function annoncerLesTachesFinies() {
  const { texteDeFin } = await import('./agent.js');
  for (const t of Records.filter(ENTITE_TACHE, { etat: 'en_cours' })) if (t.genre === 'kdata') suivreKdata(t);
  for (const t of Records.list(ENTITE_TACHE).filter((x) => (x.etat === 'finie' || x.etat === 'ratee') && !x.annoncee_le)) {
    const texte = t.etat === 'ratee' ? `dsl, ${t.libelle} a planté : ${t.resultat?.erreur || 'sans détail'}` : texteDeFin(t);
    try {
      await envoyer(t.espace, `${mention(t.pour)} ${texte}`);
      Records.update(ENTITE_TACHE, t.id, { annoncee_le: new Date().toISOString() });
    } catch (e) {
      dernier.erreur = e?.message || String(e);
    }
  }
}

const ENTITE_REPONSE = 'AkReponse';

/**
 * Poste, ou garde pour le passage suivant. Une réponse calculée coûte un
 * appel au modèle et parfois une action : si Google refuse l'envoi (API
 * Chat non configurée, réseau), elle attend au lieu de disparaître.
 */
async function poster(espace, texte, fil) {
  try {
    await envoyer(espace, texte, { fil });
  } catch (e) {
    Records.create(ENTITE_REPONSE, { espace, fil, texte, erreur: e?.message || String(e), cree_le: new Date().toISOString() });
    throw e;
  }
}

async function reposterEnAttente() {
  for (const r of Records.list(ENTITE_REPONSE)) {
    try { await envoyer(r.espace, r.texte, { fil: r.fil }); Records.delete(ENTITE_REPONSE, r.id); } catch (e) { dernier.erreur = e?.message || String(e); return; }
  }
}

const attentes = () => { try { return JSON.parse(Meta.get(CLE_ATTENTE) || '{}'); } catch { return {}; } };
/** AK vient de parler à cette personne dans cet espace : ses prochains mots sont pour lui. */
function ouvrirAttente(message) {
  if (!message.auteur?.nom) return;
  Meta.set(CLE_ATTENTE, JSON.stringify({ ...attentes(), [message.espace]: { auteur: message.auteur.nom, fil: message.fil || null, jusqua: Date.now() + ATTENTE_MS } }));
}

/**
 * Pure : le message est-il la suite d'une conversation avec AK ? La même
 * personne dans le même espace, dans le délai, ou une réponse dans le fil
 * où AK a parlé.
 */
export function enConversation(message, { attente = attentes()[message.espace], maintenant = Date.now() } = {}) {
  if (!attente) return false;
  if (message.fil && attente.fil && message.fil === attente.fil) return true;
  return message.auteur?.nom === attente.auteur && maintenant < Number(attente.jusqua || 0);
}

/** Pure : la flemme tombe-t-elle sur ce message ? `tirage` entre 0 et 1. */
export function flemme(espace, { tirage = Math.random(), maintenant = Date.now(), dernieres = {}, un_sur = FLEMME } = {}) {
  if (!un_sur) return false;
  const derniere = Number(dernieres[espace] || 0);
  if (maintenant - derniere < FLEMME_REPIT_MS) return false;
  return tirage < 1 / un_sur;
}

const dernieresFlemmes = () => { try { return JSON.parse(Meta.get(CLE_FLEMME) || '{}'); } catch { return {}; } };

/**
 * Un message qui nous parle : on répond dans le flux de l'espace, pas dans
 * un fil. Dans un espace à fils, une réponse de fil se replie derrière
 * « 1 réponse » et personne ne la voit ; on mentionne la personne à la place.
 */
async function traiter(message) {
  const { repondre } = await import('./agent.js');
  const { mesurer } = await import('../llm-couts.js');
  const texte = sansMention(message);
  if (flemme(message.espace, { dernieres: dernieresFlemmes() })) {
    Meta.set(CLE_FLEMME, JSON.stringify({ ...dernieresFlemmes(), [message.espace]: Date.now() }));
    await poster(message.espace, `${mention(message.auteur)} Non j'ai la flemme de le faire débrouille-toi`, null);
    dernier.repondus += 1;
    return;
  }
  // Les pièces jointes descendent dans les uploads, comme un fichier glissé
  // sur l'écran : AK les lit par leur chemin.
  const pieces = [];
  for (const p of message.pieces || []) {
    try {
      const buffer = await telechargerPiece(p);
      const nomFichier = `ak-${Date.now()}-${String(p.nom).replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      fs.mkdirSync(CHEMIN_UPLOADS, { recursive: true });
      fs.writeFileSync(path.join(CHEMIN_UPLOADS, nomFichier), buffer);
      pieces.push({ nom: p.nom, type: p.type, chemin: path.join(CHEMIN_UPLOADS, nomFichier), url: `/uploads/${nomFichier}`, octets: buffer.length });
    } catch (e) {
      pieces.push({ nom: p.nom, type: p.type, erreur: e?.message || String(e) });
    }
  }
  const { resultat: r } = await mesurer({ operation: 'ak', par: message.auteur.affiche || message.auteur.nom }, () => repondre({ ...message, texte, pieces }));
  for (const t of r.fond || []) {
    const tache = ouvrirTache(t, message);
    if (t.genre === 'prez') lancerPrez(tache).catch(() => {});
  }
  await poster(message.espace, `${mention(message.auteur)} ${r.texte}`, null);
  ouvrirAttente(message);
  dernier.repondus += 1;
}

/** Un passage : relire, répondre, annoncer. */
export async function relever() {
  if (enCours) return { ok: false, error: 'un passage est déjà en cours' };
  enCours = true;
  try {
    const c = compteAk();
    if (!c.ok) { dernier.erreur = c.error; return { ok: false, error: c.error }; }
    const depuis = Meta.get(CLE_DEPUIS) || new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const suivis = await espacesSuivis();
    dernier.espaces = suivis.length;
    let plusRecent = depuis;
    let traites = 0;
    for (const espace of suivis) {
      const messages = await messagesDepuis(espace.nom, depuis);
      for (const m of messages) {
        if (m.le > plusRecent) plusRecent = m.le;
        if (vus().includes(m.nom)) continue;
        noterVu(m.nom);
        if (!estPourAk(m, { direct: espace.type === 'DIRECT_MESSAGE' || enConversation(m) })) continue;
        try { await traiter(m); traites += 1; } catch (e) {
          dernier.erreur = e?.message || String(e);
          // L'envoi lui-même a échoué : la réponse attend, inutile d'en poster une autre.
          if (!/Google Chat a répondu/.test(dernier.erreur)) {
            try { await envoyer(m.espace, `${mention(m.auteur)} dsl, ça a planté de mon côté : ${dernier.erreur}`); } catch { /* on le dira au passage suivant */ }
          }
        }
      }
    }
    Meta.set(CLE_DEPUIS, plusRecent);
    await reposterEnAttente();
    await annoncerLesTachesFinies();
    dernier.le = new Date().toISOString();
    dernier.erreur = null;
    return { ok: true, espaces: suivis.length, traites };
  } catch (e) {
    dernier.erreur = e?.message || String(e);
    return { ok: false, error: dernier.erreur };
  } finally {
    enCours = false;
  }
}

export const etatVeille = () => ({ ...dernier, active: !!minuterie, intervalle_s: INTERVALLE_S, nom: NOM, compte: compteAk().ok ? 'connecté' : compteAk().error, taches: tachesEnCours(), reponses_en_attente: Records.list(ENTITE_REPONSE).length });

/** Démarre la veille si la portée Chat est demandée ; rend vrai si elle tourne. */
export function demarrerVeille() {
  if (!chatDemande || minuterie) return !!minuterie;
  relever().catch(() => {});
  minuterie = setInterval(() => relever().catch(() => {}), INTERVALLE_S * 1000);
  return true;
}

export function arreterVeille() {
  if (minuterie) clearInterval(minuterie);
  minuterie = null;
}
