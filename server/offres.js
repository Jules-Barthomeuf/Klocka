// Les offres : chaque lettre d'intention d'achat (LOI) rédigée par l'équipe,
// gardée pour l'historique de la page Offres et pour être relue, retouchée,
// téléchargée en Word ou en PDF. Le texte vient de ak/loi.js (le modèle de la
// maison) ; ici, seulement ce qu'on a dit de chaque lettre : ses champs, les
// paragraphes retouchés à la main, le dossier d'où elle vient.

import { Records } from './db.js';

export const ENTITE = 'LettreIntention';
// Les lettres de l'équipe sont toujours aux couleurs de Klocka (26 oct. 2026, Jules : côté équipe, seulement Klocka ;
// côté mandataires, seulement K Partners). Le modèle K Partners se voit dans Administration > Modèles.
const MARQUE_EQUIPE = 'klocka';

/**
 * La marque d'une lettre (28 oct. 2026, Jules : « sur mandataire, le modèle de LOI est celui de KP ») : celle gardée sur
 * la lettre ; sinon K Partners quand le dossier vient d'un mandataire ; sinon Klocka.
 */
export function marqueDe(l) {
  if (l?.marque === 'kp' || l?.marque === 'klocka') return l.marque;
  const deal = l?.deal_id ? Records.findBy('Deal', 'deal_id', l.deal_id) : null;
  return deal?.origine === 'mandataire' ? 'kp' : MARQUE_EQUIPE;
}
const maintenant = () => new Date().toISOString();

/** Ce que la liste montre d'une lettre. Pure. */
export function resume(l) {
  const c = l.champs || {};
  return {
    id: l.id,
    adresse: c.adresse_bien || null,
    acquereur: [c.acquereur_nom, c.acquereur_societe].filter(Boolean).join(' · ') || null,
    vendeur: c.vendeur_societe || null,
    prix: c.prix ?? null,
    modele: l.modele || null,
    marque: marqueDe(l),
    deal_id: l.deal_id || null,
    projet_id: l.projet_id || null,
    conversation_id: l.conversation_id || null,
    cree_par: l.cree_par || null,
    cree_le: l.cree_le || null,
    maj_le: l.maj_le || l.cree_le || null,
  };
}

/** La lettre et son texte, bloc par bloc, pour l'éditeur. */
// `marque` : la vue qui lit (« kp » en vue mandataire, 28 oct. 2026) l'emporte sur celle de la lettre, sans rien écrire.
export async function lireLettre(id, { marque = null } = {}) {
  const l = Records.get(ENTITE, id);
  if (!l) return null;
  return lettreLue(marque === 'kp' ? { ...l, marque: 'kp' } : l);
}

/**
 * La lettre vierge (28 oct. 2026, Jules) : l'étape Offre d'un dossier s'ouvre
 * sur le modèle pas encore rempli, à droite du chat, avec ce que le dossier
 * sait déjà (l'adresse, la surface, le locataire, le bail, le prix) ; le reste
 * attend entre crochets. Rien n'est gardé tant qu'on n'y écrit pas : le
 * premier geste crée la lettre (POST /api/offres).
 */
export async function lettreVierge({ deal_id = null, marque = null } = {}) {
  const { champs, deal } = await champsDuDossier(deal_id);
  const { origines } = await champsDuDossier(deal_id);
  return lettreLue({ id: null, champs, origines, textes: {}, modele: 'classique', marque: marque === 'kp' ? 'kp' : null, deal_id: deal?.deal_id || null, projet_id: deal?.projet_id || null });
}

/** Ce que le dossier (et son projet) disent déjà de la lettre, et d'où chaque champ vient. */
async function champsDuDossier(dealId) {
  const deal = dealId ? Records.findBy('Deal', 'deal_id', String(dealId)) : null;
  if (!deal) return { champs: {}, origines: {}, deal: null };
  const { champsDepuisDeal, champsDepuisProjet } = await import('./ak/loi.js');
  const sansVide = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v != null && v !== ''));
  const projet = deal.projet_id ? Records.get('Project', deal.projet_id) : null;
  const duProjet = projet ? sansVide(champsDepuisProjet(projet)) : {};
  const champs = { ...sansVide(champsDepuisDeal(deal)), ...duProjet };
  return { champs, origines: Object.fromEntries(Object.keys(champs).map((k) => [k, k in duProjet ? 'projet' : 'dossier'])), deal };
}

/** La dernière lettre d'un dossier, ou null. */
export function derniereLettreDuDossier(dealId) {
  return listerLettres().find((l) => l.deal_id === dealId) || null;
}

async function lettreLue(l) {
  const { blocs, parties, cadre, manquants, MODELES, completer, champsDepuisDeal, champsDepuisProjet } = await import('./ak/loi.js');
  // Dans l'éditeur, les lignes des parties restent même vides : tout s'y remplit sur place.
  const version = (modele) => { const brut = { ...(l.champs || {}), textes: l.textes || {}, modele, marque: marqueDe(l) }; return { blocs: blocs(brut), parties: parties(brut, { vides: true }), cadre: cadre(brut) }; };
  return {
    lettre: { ...resume(l), champs: l.champs || {}, textes: l.textes || {}, styles: l.styles || {} },
    ...version(l.modele || 'classique'),
    // Tant que le modèle n'est pas choisi, la page montre les deux versions côte à côte.
    ...(l.modele ? {} : { versions: Object.fromEntries(MODELES.map((m) => [m, version(m)])) }),
    manquants: manquants(l.champs || {}),
    // Le mode Sources de l'éditeur : d'où vient chaque champ, au survol.
    sources_champs: sourcesDesChamps(l, { completer, champsDepuisDeal, champsDepuisProjet }),
  };
}

export function listerLettres() {
  return Records.list(ENTITE).map(resume).sort((a, b) => String(b.maj_le || '').localeCompare(String(a.maj_le || '')));
}

export function creerLettre({ champs, origines = {}, deal_id = null, projet_id = null, user = null, modele = undefined, marque = null }) {
  return Records.create(ENTITE, { champs, origines, textes: {}, deal_id, projet_id, ...(marque === 'kp' ? { marque: 'kp' } : {}), ...(modele !== undefined ? { modele } : {}), cree_par: user?.email || null, cree_le: maintenant(), maj_le: maintenant() });
}

/** La lettre vierge qu'on commence à écrire dans l'éditeur : créée avec ce premier geste (champs, texte ou modèle). */
export async function creerLettreVierge({ champs = null, textes = null, styles = null, modele = 'classique', deal_id = null, user = null, marque = null } = {}) {
  if (modele !== null && !['classique', 'menthe'].includes(modele)) return { ok: false, error: 'Modèle inconnu.' };
  const du = await champsDuDossier(deal_id);
  const l = creerLettre({ champs: du.champs, origines: du.origines, deal_id: du.deal?.deal_id || null, projet_id: du.deal?.projet_id || null, user, modele, marque });
  return modifierLettre(l.id, { champs, textes, styles });
}

/**
 * Une retouche : des champs (le prix, l'acquéreur), ou le texte d'un
 * paragraphe. Un paragraphe remis à vide reprend le texte du modèle.
 */
/** Pure : la mise en forme d'éléments fusionnée (le panneau de l'Éditeur, 28 oct. 2026) ; null retire celle d'un élément. */
export function fusionnerStyles(avant = {}, patch = {}) {
  const suite = { ...(avant || {}) };
  for (const [cible, st] of Object.entries(patch || {}).slice(0, 60)) {
    const k = String(cible).slice(0, 80);
    if (st === null) { delete suite[k]; continue; }
    if (typeof st !== 'object') continue;
    const propre = Object.fromEntries(Object.entries(st).slice(0, 30).filter(([, v]) => ['string', 'number', 'boolean'].includes(typeof v)));
    if (Object.keys(propre).length) suite[k] = propre; else delete suite[k];
  }
  return suite;
}

export function modifierLettre(id, { champs = null, textes = null, styles = null, modele = undefined, origines = null, conversation_id = undefined } = {}) {
  const l = Records.get(ENTITE, id);
  if (!l) return { ok: false, error: 'LOI introuvable.' };
  if (modele !== undefined && modele !== null && !['classique', 'menthe'].includes(modele)) return { ok: false, error: 'Modèle inconnu.' };
  const propres = (o) => Object.fromEntries(Object.entries(o || {}).filter(([k]) => k !== 'textes'));
  const nouveauxChamps = champs ? { ...(l.champs || {}), ...propres(champs) } : l.champs;
  // Sans origine dite (l'éditeur de la page), un champ qui change a été saisi à la main.
  const nouvellesOrigines = origines || { ...(l.origines || {}), ...Object.fromEntries(Object.keys(propres(champs)).filter((k) => String(champs[k]) !== String(l.champs?.[k])).map((k) => [k, 'main'])) };
  let nouveauxTextes = l.textes || {};
  if (textes) {
    nouveauxTextes = { ...nouveauxTextes };
    for (const [cle, t] of Object.entries(textes)) {
      if (t == null || !String(t).trim()) delete nouveauxTextes[cle];
      else nouveauxTextes[cle] = String(t);
    }
  }
  return { ok: true, lettre: Records.update(ENTITE, id, { champs: nouveauxChamps, origines: nouvellesOrigines, textes: nouveauxTextes, ...(styles ? { styles: fusionnerStyles(l.styles, styles) } : {}), ...(modele !== undefined ? { modele } : {}), ...(conversation_id ? { conversation_id: String(conversation_id).slice(0, 80) } : {}),
    // Relier la lettre à sa conversation ne la remonte pas dans la liste.
    ...(champs || textes || styles || modele !== undefined ? { maj_le: maintenant() } : {}) }) };
}

export function supprimerLettre(id) {
  if (!Records.get(ENTITE, id)) return { ok: false, error: 'LOI introuvable.' };
  Records.delete(ENTITE, id);
  return { ok: true };
}

/** Le fichier à télécharger : Word (à retoucher) ou PDF (à envoyer). */
export async function fichierDe(id, format = 'pdf', { marque = null } = {}) {
  const brutLettre = Records.get(ENTITE, id);
  if (!brutLettre) return null;
  const l = marque === 'kp' ? { ...brutLettre, marque: 'kp' } : brutLettre;
  const { pdf, docx } = await import('./ak/loi.js');
  const brut = { ...(l.champs || {}), textes: l.textes || {}, modele: l.modele || 'classique', marque: marqueDe(l) };
  const contenu = format === 'docx' ? await docx(brut) : await pdf(brut);
  const base = `LOI ${String(l.champs?.adresse_bien || 'local').replace(/[^\p{L}\p{N} .,-]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 60)}`;
  return { contenu, nom: `${base}.${format === 'docx' ? 'docx' : 'pdf'}`, type: format === 'docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'application/pdf' };
}

/** Ce que le chat de la page Offres sait de la lettre ouverte, pour la retoucher. */
export async function contexteLettre(id) {
  const d = await lireLettre(id);
  if (!d) return null;
  const c = d.lettre.champs;
  const champs = Object.entries(c).filter(([, v]) => v != null && v !== '').map(([k, v]) => `${k}=${v}`).join(' ; ');
  const paragraphes = d.blocs.filter((b) => b.type === 'p').map((b) => `${b.cle} : ${String(b.texte).replace(/\*\*/g, '').slice(0, 90)}${b.retouche ? ' (retouché)' : ''}`).join('\n');
  // Une lettre commencée à la main depuis la page vierge : l'offre décrite au chat la remplit, sans en créer une autre.
  const commencee = d.manquants.length ? `\nElle est partie vierge et n'est pas finie (manque : ${d.manquants.map((m) => m.cle).join(', ')}) : l'offre décrite au chat la remplit, avec ce loi_id.` : '';
  return `La LOI ouverte à droite : loi_id=${id}.\nSes champs : ${champs || 'aucun'}\nSes paragraphes (clé : début) :\n${paragraphes}${commencee}`;
}

// Les sources d'une lettre : d'où vient chacun de ses champs. Le dossier
// (la fiche ou le mail reçu, avec la phrase relevée), le projet, ce qui a été
// dit au chat, ce qui a été saisi dans la lettre, et les valeurs du modèle.
// Une lettre d'avant les origines : un champ égal à celui du projet ou du
// dossier en vient, le reste a été dit au chat.

const LIBELLES = {
  acquereur_nom: "L'acquéreur", acquereur_societe: "La société de l'acquéreur", acquereur_adresse: "L'adresse de l'acquéreur",
  vendeur_societe: 'Le vendeur (signature)', attention_nom: "Le destinataire (À l'attention de)", attention_representant: 'Le représentant du destinataire', attention_adresse: "L'adresse du destinataire",
  adresse_bien: 'Le bien', surface_m2: 'La surface', locataire: 'Le locataire', fin_bail: 'La fin du bail',
  prix: 'Le prix', apport: "L'apport", duree_ans: 'La durée du crédit', taux: 'Le taux', lieu: 'Le lieu de signature',
  validite: "La validité de l'offre", limite_documents: 'La remise des documents', fin_exclusivite: "La fin de l'exclusivité",
};
// Le champ de la lettre, et celui du lot relevé dans le dossier.
const DU_LOT = { adresse_bien: 'adresse', surface_m2: 'surface_m2', locataire: 'locataire_nom', fin_bail: 'bail_echeance', prix: 'prix_fai' };
const DEFAUTS = ['lieu', 'duree_ans', 'taux', 'validite', 'limite_documents', 'fin_exclusivite'];

function valeurLisible(cle, v) {
  if (v == null || v === '') return '';
  if (['prix', 'apport'].includes(cle)) return `${Math.round(Number(v)).toLocaleString('fr-FR')} €`;
  if (cle === 'surface_m2') return `${v} m²`;
  if (cle === 'taux') return `${v} %`;
  if (cle === 'duree_ans') return `${v} ans`;
  if (/^\d{4}-\d{2}-\d{2}/.test(String(v))) return new Date(v).toLocaleDateString('fr-FR', { timeZone: 'UTC' });
  return String(v);
}

/** L'origine d'un champ : celle gardée, sinon déduite (une lettre d'avant les origines). */
function originesDe(l, { champsDepuisDeal, champsDepuisProjet }) {
  const champs = l.champs || {};
  const projet = l.projet_id ? Records.get('Project', l.projet_id) : null;
  const deal = l.deal_id ? Records.findBy('Deal', 'deal_id', l.deal_id) : null;
  const duProjet = projet ? champsDepuisProjet(projet) : {};
  const duDossier = deal ? champsDepuisDeal(deal) : {};
  const egal = (a, b) => a != null && b != null && String(a) === String(b);
  return {
    deal, projet,
    origine: (cle) => l.origines?.[cle] || (egal(champs[cle], duProjet[cle]) ? 'projet' : egal(champs[cle], duDossier[cle]) ? 'dossier' : 'chat'),
  };
}

// Ce que la fiche de source dit d'une origine (le mot en tête, la phrase dessous).
const NATURE_ORIGINE = {
  dossier: ['dossier', 'Relevé dans la fiche ou le mail du dossier.'],
  projet: ['projet', 'Repris de la fiche du projet.'],
  chat: ['chat', 'Dit dans le chat.'],
  main: ['main', 'Saisi dans la lettre.'],
};

/**
 * La source de chaque champ de la lettre, pour le mode Sources de l'éditeur (28 oct. 2026, Jules) :
 * { cle: { nature, origine, detail, citation? } }. Un champ requis vide est « À compléter » ; une
 * valeur par défaut vient du modèle.
 */
function sourcesDesChamps(l, fns) {
  const champs = l.champs || {};
  const { deal, origine } = originesDe(l, fns);
  const c = fns.completer(champs);
  const requis = new Set(['acquereur_nom', 'vendeur_societe', 'adresse_bien', 'prix', 'apport']);
  const out = {};
  for (const cle of Object.keys(LIBELLES)) {
    const v = champs[cle];
    if (v == null || v === '') {
      if (requis.has(cle)) out[cle] = { nature: 'a_remplir', origine: LIBELLES[cle], detail: 'Pas encore dit : écrivez-le dans la lettre, ou dites-le au chat.' };
      else if (DEFAUTS.includes(cle)) out[cle] = { nature: 'modele', origine: `${LIBELLES[cle]} : ${valeurLisible(cle, c[cle])}`, detail: 'Valeur par défaut du modèle de la maison.' };
      continue;
    }
    const o = origine(cle);
    const [nature, detail] = NATURE_ORIGINE[o] || NATURE_ORIGINE.chat;
    const citation = o === 'dossier' ? deal?.lots?.[0]?.lot?.[DU_LOT[cle]]?.citation || null : null;
    out[cle] = { nature, origine: `${LIBELLES[cle]} : ${valeurLisible(cle, v)}`, detail, ...(citation ? { calcul: `« ${String(citation).slice(0, 240)} »` } : {}) };
  }
  return out;
}

/** Les sources, groupées par origine, pour la fenêtre « Sources » de la page Offres. */
export async function sourcesDe(id) {
  const l = Records.get(ENTITE, id);
  if (!l) return null;
  const { champsDepuisDeal, champsDepuisProjet } = await import('./ak/loi.js');
  const champs = l.champs || {};
  const projet = l.projet_id ? Records.get('Project', l.projet_id) : null;
  const deal = l.deal_id ? Records.findBy('Deal', 'deal_id', l.deal_id) : null;
  const duProjet = projet ? champsDepuisProjet(projet) : {};
  const duDossier = deal ? champsDepuisDeal(deal) : {};
  const egal = (a, b) => a != null && b != null && String(a) === String(b);
  const origine = (cle) => l.origines?.[cle]
    || (egal(champs[cle], duProjet[cle]) ? 'projet' : egal(champs[cle], duDossier[cle]) ? 'dossier' : 'chat');
  const groupes = { dossier: [], projet: [], chat: [], main: [] };
  for (const [cle, v] of Object.entries(champs)) {
    if (v == null || v === '' || !LIBELLES[cle]) continue;
    const o = origine(cle);
    const ligne = { cle, libelle: LIBELLES[cle], valeur: valeurLisible(cle, v) };
    if (o === 'dossier') ligne.citation = deal?.lots?.[0]?.lot?.[DU_LOT[cle]]?.citation || null;
    (groupes[o] || groupes.chat).push(ligne);
  }
  const { completer } = await import('./ak/loi.js');
  const c = completer(champs);
  const defauts = DEFAUTS.filter((k) => champs[k] == null || champs[k] === '').map((cle) => ({ cle, libelle: LIBELLES[cle], valeur: valeurLisible(cle, c[cle]) }));
  const src = deal?.source || {};
  const sources = [];
  if (groupes.dossier.length) {
    sources.push({
      id: 'dossier', type: 'dossier',
      titre: src.nom_fichier || (src.type === 'texte' ? 'Le message reçu' : 'La fiche du dossier'),
      detail: 'Relevé dans le dossier',
      champs: groupes.dossier,
      document: { nom: src.nom_fichier || null, url: src.url || null, texte: src.texte_source ? String(src.texte_source).slice(0, 40000) : null },
      lien: `/Dossiers?deal_id=${deal.deal_id}`,
    });
  }
  if (groupes.projet.length) sources.push({ id: 'projet', type: 'projet', titre: projet.titre || projet.adresse_complete || 'Le projet', detail: 'La fiche du projet', champs: groupes.projet, lien: `/Projet?id=${projet.id}` });
  if (groupes.chat.length) sources.push({ id: 'chat', type: 'chat', titre: 'Votre demande', detail: 'Dit dans le chat', champs: groupes.chat });
  if (groupes.main.length) sources.push({ id: 'main', type: 'main', titre: 'La lettre', detail: 'Saisi dans la lettre', champs: groupes.main });
  if (defauts.length) sources.push({ id: 'modele', type: 'modele', titre: 'Le modèle de la maison', detail: 'Valeurs par défaut', champs: defauts });
  return sources;
}

/**
 * Une lettre d'exemple, jamais gardée : la page Modèles de l'administration (26 oct. 2026, Jules) montre chaque
 * modèle de chaque marque rempli avec elle.
 */
export const CHAMPS_EXEMPLE = {
  acquereur_nom: 'Camille Exemple', acquereur_societe: 'SCI Les Exemples', acquereur_adresse: '12 rue de la Paix, 75002 Paris',
  vendeur_societe: 'SAS Murs du Centre', attention_nom: 'SAS Murs du Centre', attention_representant: 'Mme Claire Exemple', attention_adresse: '8 place Bellecour, 69002 Lyon',
  adresse_bien: '24 rue de la République, 69002 Lyon', surface_m2: 85, locataire: 'Boulangerie Exemple', fin_bail: '2032-03-31',
  prix: 420000, apport: 90000, lieu: 'Lyon',
};

export async function exempleLettre(marque = 'klocka') {
  const { blocs, parties, cadre, MODELES } = await import('./ak/loi.js');
  const m = marque === 'kp' ? 'kp' : 'klocka';
  const version = (modele) => { const brut = { ...CHAMPS_EXEMPLE, textes: {}, modele, marque: m }; return { blocs: blocs(brut), parties: parties(brut), cadre: cadre(brut) }; };
  return { lettre: { id: null, marque: m, champs: CHAMPS_EXEMPLE, textes: {} }, versions: Object.fromEntries(MODELES.map((x) => [x, version(x)])) };
}
