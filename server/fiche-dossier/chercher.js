// L'icône lien de la saisie (19 nov. 2026) : un champ, et les biens, les agents et les clients qui répondent.
// Les biens viennent de la plateforme (dossiers et projets) ; les agents et les clients de Twenty CRM, qui fait foi
// pour les contacts, puis de la base de la Prospection pour un agent que le CRM n'a pas encore.

import { Records } from '../db.js';
import { nomAgent } from '../nom-agent.js';

const sansAccent = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const repond = (texte, q) => {
  const t = sansAccent(texte);
  return sansAccent(q).split(/\s+/).filter(Boolean).every((m) => t.includes(m));
};

/** Les biens : un dossier, ou un projet sans dossier (un projet né d'un dossier partage sa fiche). */
export async function biens(q, { limite = 8 } = {}) {
  const { listerDossiers } = await import('../deal/index.js');
  const projets = Records.champs('Project', ['titre', 'adresse_complete', 'ville_secteur_champ1', 'archived', 'deal_id']).filter((p) => !p.archived);
  const projetDuDeal = new Map(projets.filter((p) => p.deal_id).map((p) => [p.deal_id, p]));
  const lignes = [];
  for (const d of listerDossiers(1000)) {
    if (d.archived || d.test) continue;
    const p = projetDuDeal.get(d.deal_id);
    const nom = p?.titre || d.titre || d.nom_fichier || 'Dossier';
    const detail = [p?.adresse_complete || d.lots?.[0]?.ville, d.statut].filter(Boolean).join(' · ');
    lignes.push({ cle: `deal:${d.deal_id}`, genre: 'bien', nom, detail, maj: d.maj_le || d.cree_le || '' });
  }
  for (const p of projets) {
    if (p.deal_id && lignes.some((l) => l.cle === `deal:${p.deal_id}`)) continue;
    lignes.push({ cle: `projet:${p.id}`, genre: 'bien', nom: p.titre || p.adresse_complete || 'Projet', detail: p.adresse_complete || p.ville_secteur_champ1 || '', maj: '' });
  }
  const t = String(q || '').trim();
  return lignes
    .filter((l) => !t || repond(`${l.nom} ${l.detail}`, t))
    .sort((a, b) => String(b.maj).localeCompare(String(a.maj)))
    .slice(0, limite)
    .map(({ maj, ...l }) => l);
}

/** Les agents de la Prospection (AgentImmo) : nom, agence, ville. */
function agentsLocaux(q, limite) {
  if (!String(q || '').trim()) return [];
  return Records.champs('AgentImmo', ['nom', 'prenom', 'nom_famille', 'agence', 'ville'])
    .map((a) => ({ cle: `agent:${a.id}`, genre: 'agent', nom: a.nom || [a.prenom, a.nom_famille].filter(Boolean).join(' ') || 'Agent', detail: [a.agence, a.ville].filter(Boolean).join(' · ') }))
    .filter((a) => repond(`${a.nom} ${a.detail}`, q))
    .slice(0, limite);
}

/** Une recherche dans un tableau de Twenty CRM ; rien (sans erreur) si le CRM ne répond pas. */
async function twenty(email, objet, genre, q, limite) {
  if (!String(q || '').trim()) return [];
  try {
    const { chercherLien } = await import('../crm/ecran.js');
    const r = await Promise.race([chercherLien(email, objet, q), new Promise((_, non) => setTimeout(() => non(new Error('délai')), 4000))]);
    return (r?.fiches || []).slice(0, limite).map((f) => ({ cle: `twenty:${objet}:${f.id}`, genre, nom: f.nom || 'Sans nom', detail: 'Twenty CRM' }));
  } catch {
    return [];
  }
}

/** Les fiches déjà suivies : celles qu'on retrouve en premier, champ vide compris. */
function suivies(q, genre, limite) {
  const t = String(q || '').trim();
  return Records.filter('FicheDossier', { genre })
    .filter((f) => !t || repond(f.nom, t))
    .sort((a, b) => String(b.maj_le || '').localeCompare(String(a.maj_le || '')))
    .slice(0, limite)
    .map((f) => ({ cle: f.cle, genre: f.genre, nom: f.nom, detail: f.etape || (f.cle.startsWith('twenty:') ? 'Twenty CRM' : '') }));
}

const sansDoublon = (l) => l.filter((x, i) => l.findIndex((y) => y.cle === x.cle) === i);

// Une même personne vient souvent de deux sources : Twenty (« Twenty CRM », sans plus) et la Prospection (agence,
// ville). On n'en montre qu'une (19 nov. 2026, Jules : « pourquoi deux Alexandre LOURENCO ? ») : la première de la
// liste, la fiche déjà suivie d'abord, avec le détail le plus parlant. Deux homonymes d'agences différentes restent deux.
const nu = (d) => !d || d === 'Twenty CRM';
export function unParNom(l) {
  const garde = [];
  for (const x of sansDoublon(l)) {
    const meme = garde.find((y) => y.genre === x.genre && sansAccent(y.nom) === sansAccent(x.nom) && (nu(y.detail) || nu(x.detail) || y.detail === x.detail));
    if (!meme) garde.push({ ...x });
    else if (nu(meme.detail) && !nu(x.detail)) meme.detail = x.detail;
  }
  return garde;
}

/** Les trois listes, chacune courte : biens, agents, clients. */
export async function chercher(q, user, { limite = 6 } = {}) {
  const [b, at, ct] = await Promise.all([
    biens(q, { limite }),
    twenty(user?.email, 'agentImmobilier', 'agent', q, limite),
    twenty(user?.email, 'clients', 'client', q, limite),
  ]);
  return {
    biens: sansDoublon([...suivies(q, 'bien', 3), ...b]).slice(0, limite),
    // Un agent au même format partout (22 nov. 2026, Jules) : « Prénom Nom », avant d'écarter les doublons.
    agents: unParNom([...suivies(q, 'agent', 3), ...at, ...agentsLocaux(q, limite)].map((x) => ({ ...x, nom: nomAgent(x.nom) || x.nom }))).slice(0, limite),
    clients: unParNom([...suivies(q, 'client', 3), ...ct]).slice(0, limite),
  };
}

// Les liens proposés quand on clique sur « Lier » (19 nov. 2026, Jules : « au lieu de lier, ça propose des liens ») :
// les noms que la note écrit avec une majuscule et ceux d'une conversation WhatsApp importée, cherchés comme si on les
// tapait ; les biens dont le nom revient dans la note. Sans IA, en une seconde ou deux (Twenty borné à 4 s).
const MOTS_VIDES = new Set(sansAccent(`je tu il elle on nous vous ils elles le la les un une des du de au aux et ou mais donc or ni car
  ce cet cette ces mon ma mes ton ta tes son sa ses notre nos votre vos leur leurs pour par avec sans sur sous dans chez
  bonjour salut merci ok top super bien oui non ah oh bon alors aussi puis apres avant quand comment pourquoi qui que quoi
  lundi mardi mercredi jeudi vendredi samedi dimanche janvier fevrier mars avril mai juin juillet aout septembre octobre
  novembre decembre eu vu appele rappele appel rappel recu loi pv ag rdv visio sci sas sarl ttc ht fai klocka whatsapp mail appel note dossier agent client bien
  murs local commerce boutique rue avenue boulevard place vendeur acheteur banque notaire syndic bail`).split(/\s+/).filter(Boolean));
const motsDe = (t) => sansAccent(t).split(/[^a-z0-9]+/).filter((m) => m.length >= 4 && !MOTS_VIDES.has(m));

/** Les noms propres d'une note : une à trois majuscules qui se suivent (« Bilel Djaber », « Diamond Shop »). */
export function nomsPropres(texte, { exclure = [] } = {}) {
  const ex = new Set(exclure.map((x) => sansAccent(x)));
  const vus = new Map();
  const re = /\b([A-ZÀ-ÖØ-Þ][\p{L}'-]+(?:\s+(?:de\s+|du\s+|d'|le\s+)?[A-ZÀ-ÖØ-Þ][\p{L}'-]+){0,2})/gu;
  const garder = (nom) => {
    const mots = sansAccent(nom).split(/\s+/);
    if (mots.every((x) => MOTS_VIDES.has(x) || x.length < 3) || ex.has(mots[0]) || ex.has(sansAccent(nom))) return;
    vus.set(sansAccent(nom), { nom, fois: (vus.get(sansAccent(nom))?.fois || 0) + 1 });
  };
  for (const m of String(texte || '').matchAll(re)) {
    // Le premier mot d'une phrase prend une majuscule sans être un nom (« Eu Bilel Djaber au téléphone ») : on l'ôte
    // quand c'est un mot vide ou court, et en début de phrase on essaie aussi le nom sans lui.
    const tous = m[1].trim().split(/\s+/);
    let mots = tous;
    while (mots.length > 1 && (MOTS_VIDES.has(sansAccent(mots[0])) || mots[0].length <= 2)) mots = mots.slice(1);
    const avant = String(texte).slice(Math.max(0, m.index - 3), m.index);
    const debutPhrase = m.index === 0 || /[.!?:\n]\s*$/.test(avant);
    if (debutPhrase && mots.length === tous.length && mots.length > 1) garder(mots.slice(1).join(' '));
    garder(mots.join(' '));
  }
  return [...vus.values()].sort((a, b) => b.fois - a.fois || b.nom.length - a.nom.length).map((x) => x.nom);
}

/**
 * Les fiches à proposer : `{ cle, genre, nom, detail, pourquoi }`, les plus sûres d'abord.
 * @param {{ texte?: string, noms?: string[] }} indices  noms : les participants d'une conversation importée
 */
export async function suggerer({ texte = '', noms = [] } = {}, user, { equipe = [] } = {}) {
  const prenoms = equipe.map((p) => sansAccent(p));
  const deConversation = (noms || []).map((n) => String(n || '').trim()).filter((n) => n && !prenoms.includes(sansAccent(n).split(/\s+/)[0]));
  const aChercher = [...new Set([...deConversation, ...nomsPropres(texte, { exclure: equipe })])].slice(0, 5);
  const trouves = await Promise.all(aChercher.map(async (nom) => {
    const r = await chercher(nom, user, { limite: 2 });
    const source = deConversation.includes(nom) ? 'dans la conversation' : 'dans la note';
    // Une personne n'est proposée que si c'est son nom qui répond (« Dieppe » ne propose pas un agent de Dieppe).
    const personnes = [...r.agents, ...r.clients].filter((x) => repond(x.nom, nom));
    // Un seul mot qui répond à plusieurs biens (une ville) ne désigne aucun d'eux.
    const parNom = r.biens.filter((x) => repond(x.nom, nom));
    const lesBiens = parNom.length > 1 && !/\s/.test(nom) ? [] : parNom;
    return [...personnes, ...lesBiens].slice(0, 2).map((x) => ({ ...x, pourquoi: `« ${nom} » ${source}` }));
  }));
  // Les biens dont deux mots du nom (ou un mot rare, une enseigne) reviennent dans la note.
  const dansLaNote = new Set(motsDe(texte));
  const parMots = dansLaNote.size ? (await biens('', { limite: 2000 }))
    .map((b) => ({ b, communs: motsDe(b.nom).filter((m) => dansLaNote.has(m)) }))
    .filter(({ communs }) => communs.length >= 2)
    .sort((x, y) => y.communs.length - x.communs.length)
    .slice(0, 3)
    .map(({ b, communs }) => ({ ...b, pourquoi: `« ${communs.slice(0, 2).join(' ')} » dans la note` })) : [];
  return unParNom([...trouves.flat(), ...parMots]).slice(0, 6);
}

// ---------------------------------------------------------------------------
// Lier tout seul (19 nov. 2026, Jules : « c'est énervant de lier à chaque fois, il faudrait que ça le fasse
// automatiquement ») : pendant qu'on écrit, ce qui est sûr se lie de soi-même ; ce qui hésite (« lorient » : trois
// biens) se propose en un tap. Sûr : une personne dont le nom répond, un bien dont le nom répond, le seul bien d'une
// ville. Les noms se cherchent aussi en minuscules (« sébastien robic », « lorient »).
// ---------------------------------------------------------------------------

const POSITION_LISIBLE = { presente: 'Présenté', visio: 'Visio faite', positionne: 'Positionné', interesse: 'Positionné', offre: 'Offre', signe: 'Signé', abandon: 'Pas poursuivi' };

/** Les villes et les noms complets que la note écrit, même sans majuscule. */
function motsDeLaNote(texte) {
  const t = sansAccent(texte);
  return { t, mots: new Set(t.split(/[^a-z0-9'-]+/).filter((m) => m.length >= 3 && !MOTS_VIDES.has(m))) };
}

/**
 * @returns {Promise<{ surs: object[], choix: Array<{ mot: string, options: object[] }> }>}
 */
export async function suggererPourLier({ texte = '', noms = [], liens = [] } = {}, user, { equipe = [] } = {}) {
  const deja = await suggerer({ texte, noms }, user, { equipe });
  // Un prénom seul (« Christophe ») n'est pas sûr : il l'est s'il répond à une personne déjà liée à un bien sûr (le
  // client du dossier), sinon il se choisit.
  const motDe = (x) => (String(x.pourquoi || '').match(/« (.+?) »/) || [])[1] || '';
  // Un mot qui appartient au nom d'un bien reconnu (« Shop » dans « Diamond Shop ») ne désigne personne.
  const nomsBiens = deja.filter((x) => x.genre === 'bien').map((b) => sansAccent(b.nom));
  const dansUnBien = (x) => x.genre !== 'bien' && !/\s/.test(motDe(x).trim()) && nomsBiens.some((n) => n.includes(sansAccent(motDe(x))));
  const surs = deja.filter((x) => !dansUnBien(x) && (x.genre === 'bien' || /\s/.test(motDe(x).trim())));
  const prenomsSeuls = new Map();
  for (const x of deja.filter((y) => y.genre !== 'bien' && !dansUnBien(y) && !/\s/.test(motDe(y).trim()))) prenomsSeuls.set(motDe(x), [...(prenomsSeuls.get(motDe(x)) || []), x]);
  const { t, mots } = motsDeLaNote(texte);
  const ajouter = (x, pourquoi) => { if (!surs.some((s) => s.cle === x.cle)) surs.push({ ...x, pourquoi }); };

  // Les personnes nommées en entier, majuscules ou non (prénom et nom qui se suivent).
  for (const f of Records.champs('FicheDossier', ['cle', 'genre', 'nom']).filter((f) => f.genre !== 'bien')) {
    const n = sansAccent(f.nom).trim();
    if (n.includes(' ') && n.length >= 6 && t.includes(n)) ajouter({ cle: f.cle, genre: f.genre, nom: f.nom, detail: '' }, `« ${f.nom} » dans la note`);
  }
  for (const a of Records.champs('AgentImmo', ['nom', 'agence', 'ville'])) {
    const n = sansAccent(a.nom).trim();
    if (n.includes(' ') && n.length >= 6 && t.includes(n)) ajouter({ cle: `agent:${a.id}`, genre: 'agent', nom: a.nom, detail: [a.agence, a.ville].filter(Boolean).join(' · ') }, `« ${a.nom} » dans la note`);
  }

  // Les biens par leur ville : seul de sa ville, il est sûr ; à plusieurs, on choisit.
  const tous = await biens('', { limite: 2000 });
  const parVille = new Map();
  for (const b of tous) {
    const d = sansAccent(b.detail).split(/[^a-z0-9'-]+/);
    for (const m of mots) if (m.length >= 4 && d.includes(m)) parVille.set(m, [...(parVille.get(m) || []), b]);
  }
  const choix = [];
  for (const [mot, liste] of parVille) {
    if (surs.some((s) => s.genre === 'bien' && liste.some((b) => b.cle === s.cle)) || liste.some((b) => (liens || []).includes(b.cle))) continue;
    if (liste.length === 1) ajouter(liste[0], `« ${mot} » dans la note`);
    else choix.push({ mot: mot.charAt(0).toUpperCase() + mot.slice(1), options: liste.slice(0, 5) });
  }
  // Les prénoms seuls : la personne liée à un bien sûr qui le porte, sinon le choix entre ceux qui répondent.
  // Le contexte, c'est le dossier (19 nov. 2026, Jules : « on a décidé de le présenter à tel client, deux jours après
  // Max met une note : il n'y a pas 25 clients qui se sont vus présenter ce projet ») : les biens reconnus, et ceux déjà
  // liés à la main ; leurs personnes liées passent devant tout le reste.
  const clesBiens = [...new Set([...surs.filter((x) => x.genre === 'bien').map((b) => b.cle), ...(liens || []).filter((c) => /^(deal|projet):/.test(c))])];
  const lieesDesBiens = clesBiens.flatMap((c) => Records.findBy('FicheDossier', 'cle', c)?.liees || []).filter((l) => l.genre !== 'bien');
  for (const [mot, liste] of prenomsSeuls) {
    const lie = lieesDesBiens.find((l) => repond(l.nom, mot));
    if (lie) ajouter({ cle: lie.cle, genre: lie.genre, nom: lie.nom, detail: '' }, `« ${mot} », lié au dossier`);
    else if (liste.length) choix.push({ mot, options: unParNom(liste).slice(0, 4) });
  }
  // Une personne décrite sans être nommée (« mec sérieux en banque à la SG ») : les mots rares que la note partage avec
  // le résumé d'un client (un sigle, une ville, un métier) le proposent, sans le lier d'office.
  const dejaLies = new Set([...(liens || []), ...surs.map((x) => x.cle)]);
  if (![...dejaLies].some((c) => /^(twenty:clients|client):/.test(c))) {
    // La position telle que la carte du dossier la lit (notée, ou déduite d'une offre en négociation).
    const { carteDuBien } = await import('./modele.js');
    const positions = new Map(clesBiens.flatMap((c) => carteDuBien(c, Records.findBy('FicheDossier', 'cle', c))?.clients || []).map((c) => [c.cle, c.position]));
    const duDossier = unParNom(lieesDesBiens.filter((l) => l.genre === 'client')).map((l) => ({ cle: l.cle, genre: 'client', nom: l.nom, detail: POSITION_LISIBLE[positions.get(l.cle) || l.position] || 'Présenté' }));
    const devine = clientsDecrits(texte, { lies: lieesDesBiens, sauf: [...parVille.keys()] });
    const options = [...duDossier, ...devine.filter((c) => !duDossier.some((d) => d.cle === c.cle))].filter((c) => !dejaLies.has(c.cle)).slice(0, 4);
    if (options.length) choix.push({ mot: 'Client ?', options });
  }
  return { surs: unParNom(surs).slice(0, 6), choix: choix.slice(0, 3) };
}

// Les mots de tous les jours, qui ne désignent personne (« faire », « sérieux », « offre ») : écartés pour deviner un client.
const COURANTS = new Set(sansAccent(`faire fait autre autres serieux serieuse hesite hesiter rappele rappelle offre offres contre signee signe
  envoyer envoye attend attendre toujours aussi avoir etre veut veux pense penser voit voir plus tres moins bien bon bonne
  dossier projet client clients agent vendeur acheteur prix euros mois semaine jour lundi mardi mercredi jeudi vendredi
  local locaux murs commerce bail banque financement taux recherche cherche budget mandat objectif fonds propres revenus
  dans avec pour sans sous chez comme mais donc encore deja apres avant quand alors cette ceux celle leur leurs nous vous
  personne sujet sujets place region amis accompagne raisonne management`).split(/\s+/).filter(Boolean));

/** Les jetons d'un texte : les mots peu courants de quatre lettres et plus, et les sigles en majuscules (« SG », « MDI »). */
function jetons(texte) {
  const sigles = (String(texte || '').match(/\b[A-Z]{2,5}\b/g) || []).filter((x) => !['LOI', 'PV', 'AG', 'HT', 'TTC', 'FAI', 'SCI', 'SAS', 'SARL', 'RDV'].includes(x)).map((x) => `#${x.toLowerCase()}`);
  return new Set([...motsDe(texte).filter((m) => !COURANTS.has(m)), ...sigles]);
}

/**
 * Les clients que la note décrit : la somme des raretés des jetons partagés avec leur résumé (un jeton présent dans
 * peu de fiches pèse lourd) ; un client déjà lié au bien de la note passe devant.
 */
export function clientsDecrits(texte, { lies = [], limite = 3, sauf = [] } = {}) {
  const fiches = Records.champs('FicheDossier', ['cle', 'genre', 'nom', 'resume']).filter((f) => f.genre === 'client' && f.resume);
  if (!fiches.length) return [];
  const parFiche = fiches.map((f) => ({ f, j: jetons(`${f.resume}`) }));
  const df = new Map();
  for (const { j } of parFiche) for (const m of j) df.set(m, (df.get(m) || 0) + 1);
  const n = parFiche.length;
  // Une ville qui désigne déjà des biens (« lorient ») ne dit rien du client : ceux qui y vivent ne sont pas visés.
  const note = new Set([...jetons(texte)].filter((m) => !sauf.includes(m)));
  const notes = parFiche.map(({ f, j }) => {
    let score = 0;
    const communs = [];
    for (const m of note) if (j.has(m)) { score += Math.log(n / df.get(m)); communs.push(m.replace(/^#/, '').toUpperCase()); }
    if (lies.some((l) => l.cle === f.cle)) score += 3;
    return { f, score, communs };
  });
  // Le seuil suit le nombre de fiches : un jeton présent dans deux fiches au plus suffit.
  const seuil = Math.log(n / 2);
  return notes.filter((x) => x.score > 0 && x.score >= seuil).sort((a, b) => b.score - a.score).slice(0, limite)
    .map(({ f, communs }) => ({ cle: f.cle, genre: 'client', nom: f.nom, detail: communs.slice(0, 3).join(', ') }));
}
