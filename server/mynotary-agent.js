// L'agent MyNotary : à la demande de mandat d'un mandataire, il se connecte à
// app.mynotary.fr, crée un dossier, y crée le contrat demandé, remplit les
// champs du panneau de gauche, télécharge le PDF et le dépose sur la porte
// Mandat — en quelques secondes, au lieu d'une saisie à la main par Klocka.
//
// Le principe de sûreté, voulu par Jules : CE N'EST PAS UNE IA QUI SE PROMÈNE.
// C'est un parcours figé de quatre gestes (se connecter, créer, remplir,
// télécharger), et un gardien qui borde chaque requête du navigateur EN LISTE
// BLANCHE : sur mynotary.fr, tout ce qui n'est pas reconnu est REFUSÉ —
// l'inverse d'une liste d'interdits, qu'un chemin imprévu traverserait.
//   - la seule chose ouvrable est LE dossier que l'agent vient de créer ;
//   - l'URL se juge décodée (un %41 ne déguise rien), hôte normalisé,
//     chemin, query et fragment compris, et le corps des requêtes est fouillé ;
//   - méthodes en liste fermée, DELETE refusé quoi qu'il arrive ;
//   - chaque geste est journalisé (Records 'MyNotaryJournal'), capture à l'appui.
// Ce qui n'est pas reconnu ici ne passe pas : il n'existe ni « lister »,
// ni « chercher », ni « ouvrir un contrat existant ».
//
// MYNOTARY_AGENT=1 l'allume (éteint par défaut). En cas d'échec, rien ne casse :
// la demande reste dans la file de Klocka, comme avant, et l'équipe est prévenue.

import { Records, Meta } from './db.js';

const EMAIL = (process.env.MYNOTARY_EMAIL || '').trim();
const MDP = (process.env.MYNOTARY_MOT_DE_PASSE || '').trim();
const ACTIF = (process.env.MYNOTARY_AGENT || '').trim() === '1';
const PLAFOND_JOUR = Math.max(1, Number(process.env.MYNOTARY_PLAFOND_JOUR) || 20);

export const agentMyNotaryConfigure = () => !!(EMAIL && MDP);
export const agentMyNotaryActif = () => ACTIF && agentMyNotaryConfigure();

// ---------------------------------------------------------------------------
// Le gardien : ce que le navigateur a le droit de demander, et rien d'autre.
// ---------------------------------------------------------------------------

// Les méthodes qu'un parcours de création emploie. Tout le reste est refusé,
// DELETE en tête, et une graphie exotique (« delete », un espace) avec.
const METHODES = new Set(['GET', 'POST', 'PUT', 'PATCH', 'HEAD', 'OPTIONS']);

// Les mots de chemin que les quatre gestes peuvent croiser. Un segment qui
// n'est ni un mot connu, ni un fichier statique, ni un identifiant à nous,
// ferme la porte. La liste se resserrera au câblage, sur les chemins constatés.
const MOTS_CONNUS = new Set([
  '', 'fr', 'app', 'connexion', 'login', 'logout', 'auth', 'signin', 'session', 'sessions',
  'mot-de-passe', 'password', 'accueil', 'home', 'tableau-de-bord', 'dashboard',
  'api', 'graphql', 'v1', 'v2', 'me', 'user', 'users', 'organisation', 'organisations',
  'dossier', 'dossiers', 'record', 'records', 'contrat', 'contrats', 'operation', 'operations',
  'file', 'files', 'document', 'documents', 'modele', 'modeles', 'templates',
  'nouveau', 'nouvelle', 'new', 'create', 'creation',
  'download', 'telecharger', 'telechargement', 'export', 'pdf', 'generation',
]);
const FICHIER_STATIQUE = /\.(js|mjs|css|map|png|jpe?g|svg|gif|webp|ico|woff2?|ttf|otf|eot|mp4|webm)$/i;

// Un jeton qui a la tête d'un identifiant : UUID, hexadécimal long, ou un
// mélange lettres-chiffres d'au moins huit caractères. Un prix (« 450000 »),
// une date ou un mot n'en sont pas ; le format réel des ids MyNotary se
// resserrera au câblage.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEX_LONG = /^[0-9a-f]{16,}$/i;
const MIXTE = /^(?=.*[a-z])(?=.*\d)[a-z0-9_-]{8,}$/i;
export const ressembleAUnId = (t) => UUID.test(t) || HEX_LONG.test(t) || MIXTE.test(t);

/** Décode une URL jusqu'au point fixe : un double encodage ne déguise rien. */
export function decoderAFond(texte, tours = 3) {
  let t = String(texte || '');
  for (let i = 0; i < tours; i += 1) {
    let d;
    try { d = decodeURIComponent(t); } catch { break; }
    if (d === t) break;
    t = d;
  }
  return t;
}

const normaliserHote = (h) => String(h || '').toLowerCase().replace(/\.+$/, '');
const surMyNotary = (h) => /(^|\.)mynotary\.fr$/.test(normaliserHote(h));

/**
 * Pure : cette requête est-elle permise ? `etat.ids` porte les identifiants que
 * l'agent a lui-même créés pendant CE parcours : seuls eux sont ouvrables.
 * Sur mynotary.fr, tout ce qui n'est pas reconnu est refusé — liste blanche.
 * `corps` (postData) est fouillé : un identifiant qui n'est pas à nous le bloque.
 */
export function requeteAutorisee({ url, methode = 'GET', corps = null }, etat = { ids: new Set() }, { mode = 'parcours' } = {}) {
  const m = String(methode || 'GET').trim().toUpperCase();
  if (m === 'DELETE') return { ok: false, raison: 'DELETE interdit, quoi qu’il arrive' };
  if (!METHODES.has(m)) return { ok: false, raison: `méthode inattendue : ${m || '(vide)'}` };
  // L'éclairage regarde sans toucher : lire est libre (une lecture ne modifie
  // aucun contrat), écrire sur l'existant est interdit (PUT, PATCH), et le
  // POST reste permis pour la connexion et la vie de la page. Chaque requête
  // est journalisée par l'éclaireur : c'est d'elles que la liste blanche du
  // mode « parcours » tirera ses vrais chemins.
  if (mode === 'eclairage') {
    // Seules les ressources à protéger (dossiers, contrats, records,
    // documents...) sont intouchables — SAUF celle que l'éclaireur vient de
    // créer : poser le nom de SON dossier de test fait partie du parcours.
    // Le « vu pour la dernière fois » posé sur l'utilisateur passe aussi.
    const RESSOURCES_PROTEGEES = /\b(dossiers?|records?|contrats?|operations?|files?|documents?|modeles?|templates)\b/i;
    if ((m === 'PUT' || m === 'PATCH') && RESSOURCES_PROTEGEES.test(decoderAFond(url))) {
      let u2;
      try { u2 = new URL(url); } catch { return { ok: false, raison: 'URL illisible' }; }
      const sienne = decoderAFond(u2.pathname).split('/').every((seg) => !seg
        || MOTS_CONNUS.has(seg.toLowerCase()) || /^api-[a-z-]+$/i.test(seg)
        || etat.ids.has(seg) || !/^[A-Za-z0-9_-]{3,}$/.test(seg));
      if (!sienne) return { ok: false, raison: `${m} sur une ressource qui n’est pas à nous : l’éclairage regarde, il ne modifie pas` };
    }
    return { ok: true };
  }
  let u;
  try { u = new URL(url); } catch { return { ok: false, raison: 'URL illisible' }; }
  // Hors MyNotary : les ressources de la page (polices, tuiles, mesures) ne
  // touchent aucun contrat. Les domaines de téléchargement de PDF constatés à
  // l'éclairage se borneront ici.
  if (!surMyNotary(u.hostname)) return { ok: true };

  // Le chemin, décodé : chaque segment doit être un mot connu, un fichier
  // statique, ou un identifiant créé par ce parcours.
  const chemin = decoderAFond(u.pathname);
  for (const segment of chemin.split('/')) {
    if (MOTS_CONNUS.has(segment.toLowerCase())) continue;
    if (/^api-[a-z-]+$/i.test(segment)) continue; // api-mynotary, api-auth...
    if (FICHIER_STATIQUE.test(segment)) continue;
    if (etat.ids.has(segment)) continue;
    return { ok: false, raison: `segment inconnu dans le chemin : « ${segment.slice(0, 60)} »` };
  }
  // La query : une clé en ...id/ids porte un identifiant (les ids MyNotary
  // sont souvent numériques, qu'aucune « forme d'id » ne distingue d'un prix :
  // c'est la clé qui le dit). Il doit être à nous.
  for (const [cle, valeur] of u.searchParams) {
    if (!/ids?$/i.test(cle.replace(/[_-]/g, ''))) continue;
    for (const v of decoderAFond(valeur).split(/[^A-Za-z0-9_-]+/)) {
      if (v && !MOTS_CONNUS.has(v.toLowerCase()) && !etat.ids.has(v)) {
        return { ok: false, raison: `identifiant étranger en query (${cle}) : ${v.slice(0, 40)}` };
      }
    }
  }
  // Le fragment : un routage d'application (#/operation/123) se juge comme un
  // chemin ; et tout jeton en forme d'identifiant doit être à nous.
  const fragment = decoderAFond(u.hash.replace(/^#/, ''));
  if (fragment.startsWith('/')) {
    for (const segment of fragment.split('?')[0].split('/')) {
      if (!segment || MOTS_CONNUS.has(segment.toLowerCase()) || FICHIER_STATIQUE.test(segment) || etat.ids.has(segment)) continue;
      return { ok: false, raison: `segment inconnu dans le fragment : « ${segment.slice(0, 60)} »` };
    }
  }
  for (const morceau of [decoderAFond(u.search), fragment]) {
    for (const jeton of morceau.split(/[^A-Za-z0-9_-]+/)) {
      if (!jeton || MOTS_CONNUS.has(jeton.toLowerCase()) || etat.ids.has(jeton)) continue;
      if (ressembleAUnId(jeton)) return { ok: false, raison: `identifiant étranger dans l’URL : ${jeton.slice(0, 40)}` };
    }
  }
  // Le corps (API, GraphQL) : même règle. Les champs libres (prix, adresses)
  // n'ont pas la tête d'un identifiant et passent.
  if (corps) {
    const texte = decoderAFond(String(corps));
    // Les identifiants nommés : "operationId": 86518831, id: "X", ids: [...].
    for (const m2 of texte.matchAll(/"?([A-Za-z_]*[iI]ds?)"?\s*:\s*\[?\s*"?([A-Za-z0-9_-]{3,})/g)) {
      const v = m2[2];
      if (!MOTS_CONNUS.has(v.toLowerCase()) && !etat.ids.has(v)) {
        return { ok: false, raison: `identifiant étranger dans le corps (${m2[1]}) : ${v.slice(0, 40)}` };
      }
    }
    for (const jeton of texte.split(/[^A-Za-z0-9_-]+/)) {
      if (!jeton || etat.ids.has(jeton)) continue;
      if (ressembleAUnId(jeton)) return { ok: false, raison: `identifiant étranger dans le corps : ${jeton.slice(0, 40)}` };
    }
  }
  return { ok: true };
}

/**
 * Pure : relève L'identifiant créé — le premier segment inconnu qui suit le mot
 * de ressource attendu — et lui seul. Tout autre segment en forme d'identifiant
 * est rendu en anomalie : le parcours le journalise et s'arrête, il ne le bénit pas.
 */
export function releverIdCree(url, etat, ressource = 'dossiers') {
  let u;
  try { u = new URL(url); } catch { return { id: null, anomalies: ['URL illisible'] }; }
  const segments = decoderAFond(u.pathname).split('/');
  let id = null;
  const anomalies = [];
  for (let i = 0; i < segments.length; i += 1) {
    const s = segments[i];
    if (MOTS_CONNUS.has(s.toLowerCase()) || FICHIER_STATIQUE.test(s) || etat.ids.has(s) || !s) continue;
    if (!id && segments[i - 1]?.toLowerCase() === ressource.toLowerCase()) { id = s; continue; }
    anomalies.push(s.slice(0, 60));
  }
  if (id) etat.ids.add(id);
  return { id, anomalies };
}

// ---------------------------------------------------------------------------
// Les champs du mandat, du vocabulaire de la porte à celui du formulaire.
// ---------------------------------------------------------------------------

/** Pure : ce que l'agent saisira, depuis la demande de mandat (porte 2). */
export function champsDepuisMandat(mandat, fiche = null) {
  if (!mandat) return null;
  // Un mandat préparé dans le chat porte son questionnaire complet : il fait foi.
  if (mandat.questionnaire && Object.keys(mandat.questionnaire).length) {
    const q = mandat.questionnaire;
    return {
      ...q,
      type: q.type_mandat || (mandat.type === 'exclusif' ? 'exclusif' : 'simple'),
      honoraires_charge: q.honoraires_charge === 'acquereur' ? 'acquereur' : 'vendeur',
      duree_mois: Number(q.duree_mois) || 12,
    };
  }
  return {
    type: mandat.type === 'exclusif' ? 'exclusif' : 'simple',
    vendeur: mandat.vendeur || null,
    vendeur_contact: mandat.vendeur_contact || null,
    bien: mandat.bien || null,
    adresse: fiche?.adresse ? [fiche.adresse, fiche.ville].filter(Boolean).join(', ') : null,
    prix: Number(mandat.prix) || null,
    honoraires: Number(mandat.honoraires) || null,
    honoraires_charge: mandat.honoraires_charge === 'acquereur' ? 'acquereur' : 'vendeur',
    duree_mois: Number(mandat.duree_mois) || 12,
  };
}

/** Pure : plafond du jour — « 20 » autorise bien vingt parcours. */
export function plafondAtteint(dejaFaits, plafond = PLAFOND_JOUR) {
  return Number(dejaFaits) >= plafond;
}

const jourDeParis = () => new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris' }).format(new Date());
const cleJour = () => `mynotary-jour:${jourDeParis()}`;

/** Un crédit du jour : pris seulement si le plafond le permet. */
function prendreCredit() {
  const deja = Number(Meta.get(cleJour()) || 0);
  if (plafondAtteint(deja)) return { ok: false, deja };
  Meta.set(cleJour(), String(deja + 1));
  return { ok: true, deja: deja + 1 };
}

// Un seul parcours à la fois par mandat : un double-clic ou un renvoi réseau
// ne lance pas deux navigateurs sur la même demande.
const EN_VOL_MS = 10 * 60000;
function poserVerrou(mandatId) {
  const cle = `mynotary-en-vol:${mandatId}`;
  const depuis = Number(Meta.get(cle) || 0);
  if (depuis && Date.now() - depuis < EN_VOL_MS) return false;
  Meta.set(cle, String(Date.now()));
  return true;
}
const leverVerrou = (mandatId) => Meta.set(`mynotary-en-vol:${mandatId}`, '');

function journaliser(entree) {
  try {
    Records.create('MyNotaryJournal', { le: new Date().toISOString(), ...entree });
    const tout = Records.list('MyNotaryJournal');
    if (tout.length > 500) {
      for (const v of tout.sort((a, b) => String(a.le).localeCompare(String(b.le))).slice(0, tout.length - 500)) Records.delete('MyNotaryJournal', v.id);
    }
  } catch (e) { console.warn('[mynotary] journal impossible :', e?.message || e); }
}

// ---------------------------------------------------------------------------
// Le parcours dans l'écran. Les gestes sont ceux dictés par Jules :
// se connecter → « Nouveau dossier » → le type demandé → (titre inchangé) →
// « Nouveau contrat » → le contrat voulu → remplir les champs à gauche →
// « Télécharger ». Les repères d'écran (sélecteurs) se posent à l'éclairage
// (node server/mynotary-eclaireur.js) ; d'ici là, le parcours se refuse.
// ---------------------------------------------------------------------------

export const PARCOURS_CABLE = false;

async function parcoursCreerMandat(/* mandat, { champs, surEtape } */) {
  if (!PARCOURS_CABLE) {
    throw new Error(
      "Le parcours MyNotary n'est pas encore câblé : il faut une passe d'éclairage " +
      "sur app.mynotary.fr pour poser les repères d'écran. La demande reste dans la file Klocka."
    );
  }
  // (au câblage : rend { document: {nom, url}, mynotary_url, dossier_id })
  throw new Error('Parcours déclaré câblé mais non écrit.');
}

// ---------------------------------------------------------------------------
// Les deux entrées : créer le mandat d'une demande, corriger le sien.
// ---------------------------------------------------------------------------

/**
 * Crée le mandat sur MyNotary et le dépose « prêt » sur la porte. Tout échec
 * laisse la demande telle quelle (file Klocka) et prévient l'équipe.
 */
export async function lancerAgentMandat(mandatId, { surEtape = null } = {}) {
  const { notifier } = await import('./notifications.js');
  const m = Records.get('MandatMandataire', mandatId);
  if (!m) return { ok: false, error: 'Mandat introuvable.' };
  if (!agentMyNotaryActif()) return { ok: false, error: 'Agent MyNotary éteint (MYNOTARY_AGENT).' };
  if (m.statut !== 'demande_envoyee') return { ok: false, error: `Le mandat est « ${m.statut} » : rien à créer.` };
  if (!poserVerrou(mandatId)) return { ok: false, error: 'Un parcours est déjà en vol pour ce mandat.' };

  try {
    const credit = prendreCredit();
    if (!credit.ok) {
      journaliser({ mandat_id: mandatId, geste: 'refus', ok: false, erreur: `plafond du jour atteint (${PLAFOND_JOUR})` });
      return { ok: false, error: `Plafond du jour atteint (${PLAFOND_JOUR} parcours) : la demande part à Klocka.` };
    }
    journaliser({ mandat_id: mandatId, geste: 'depart', ok: true, bien: m.bien, par: m.mandataire_email });
    const r = await parcoursCreerMandat(m, { champs: champsDepuisMandat(m), surEtape });
    journaliser({ mandat_id: mandatId, geste: 'cree', ok: true, mynotary_url: r.mynotary_url });
    return { ok: true, ...r };
  } catch (e) {
    journaliser({ mandat_id: mandatId, geste: 'echec', ok: false, erreur: String(e?.message || e) });
    // La demande reste « demande_envoyee » : la file de Klocka la montre déjà.
    notifier({
      pour: null, genre: 'erreur',
      titre: `Mandat à saisir à la main · ${m.bien}`,
      texte: `L'agent MyNotary n'a pas pu créer le mandat (${String(e?.message || e).slice(0, 180)}). La demande de ${m.mandataire_email} attend dans la file.`,
      lien: '/AdminValidations', action: 'Ouvrir la file',
      cle: `mynotary-echec:${mandatId}`,
    });
    return { ok: false, error: String(e?.message || e) };
  } finally {
    leverVerrou(mandatId);
  }
}

/**
 * Une correction demandée par le mandataire dans le chat. Le mandat doit être
 * LE SIEN ; au-delà d'un changement de champs, la demande part à l'équipe,
 * mot pour mot.
 */
export async function corrigerAgentMandat(mandatId, demande, user) {
  const { notifier } = await import('./notifications.js');
  const m = Records.get('MandatMandataire', mandatId);
  // Même règle que les portes : le mandataire ses mandats, l'admin tout.
  const sien = m && (user?.role === 'admin' || m.mandataire_email === String(user?.email || '').toLowerCase());
  if (!sien) return { ok: false, error: 'Mandat introuvable.' };
  const texte = String(demande || '').trim();
  if (!texte) return { ok: false, error: 'Dites ce qu’il faut corriger.' };
  if (!['demande_envoyee', 'pret'].includes(m.statut)) return { ok: false, error: `Le mandat est « ${m.statut} » : il ne se corrige plus, demandez à Klocka.` };

  // Tant que le parcours n'est pas câblé (ou agent éteint), la demande va à
  // l'équipe, précise et datée : c'est la branche « trop compliqué » de Jules.
  journaliser({ mandat_id: mandatId, geste: 'correction-demandee', ok: true, demande: texte.slice(0, 300), par: user?.email || null });
  Records.update('MandatMandataire', m.id, {
    historique: [...(m.historique || []), { le: new Date().toISOString(), par: user?.email || null, action: `correction demandée : ${texte.slice(0, 200)}` }],
  });
  notifier({
    pour: null, genre: 'info',
    titre: `Correction de mandat · ${m.bien}`,
    texte: `${user?.email || 'Un mandataire'} demande : « ${texte.slice(0, 240)} »`,
    lien: '/AdminValidations', action: 'Ouvrir la file',
    cle: `mynotary-correction:${mandatId}:${(m.historique || []).length}`,
  });
  return { ok: true, transmis: 'equipe', note: 'Demande transmise à l’équipe Klocka, trace posée sur le mandat : dis-le en une ligne.' };
}
