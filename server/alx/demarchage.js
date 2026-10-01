// Le démarchage off-market, après le parcours d'une ville : qui détient
// quels murs, comment le joindre, et quoi lui écrire.
//
//   Les sociétés  les cibles d'une ville regroupées par propriétaire (SIREN) :
//                 une SCI qui tient trois murs rue d'Antibes reçoit UN message
//                 qui cite ses trois murs, pas trois messages.
//   Les contacts  les gérants personnes physiques de chaque société privée,
//                 cherchés dans Apollo (APOLLO_API_KEY) : mail, LinkedIn, poste.
//                 On ne démarche pas les particuliers : seuls les murs détenus
//                 par une société sont publiés, et donc prospectés.
//   Le message    rédigé pour la société, avec l'adresse et l'enseigne de
//                 chacun de ses murs ; relu, il part de la boîte de qui clique.
//   La suite      l'envoi ouvre une approche par mur (le Bilan d'ALX la lit),
//                 la relance se prépare pour J+7 et attend un clic, une
//                 réponse du gérant arrête tout et prévient l'équipe.
//
// Rien ne part tout seul : ni le premier mail, ni la relance.

import { Records } from '../db.js';

const ENTITE = 'SocieteAlx';
const APOLLO = 'https://api.apollo.io/api/v1/people/match';
const CLE_APOLLO = () => (process.env.APOLLO_API_KEY || '').trim();
export const apolloConfigure = () => !!CLE_APOLLO();
const RELANCE_JOURS = 7;

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
const FORMES_PRIVEES = new Set(['SCI', 'SC', 'SARL', 'SAS', 'SASU', 'SA', 'STE', 'SNC', 'EURL', 'SCPI', 'SCP', 'SCA', 'SCS', 'SELARL', 'SELAS']);
const PUBLIC = /\b(commune|d[ée]partement|r[ée]gion|m[ée]tropole|office public|hlm|habitat|logement|[ée]tat|sncf|ratp|centre hospitalier|universit[ée]|chambre de commerce|syndicat des copropri)/i;

/** Pure : le propriétaire d'une cible, tel que le parcours l'a trouvé. */
export const proprietaireDe = (c) => {
  const s = c.societe || {};
  const p = c.proprietaire || c.foncier?.choix || {};
  const siren = s.siren || p.siren || null;
  const nom = s.nom || p.nom || null;
  return siren || nom ? { siren, nom, forme: s.forme || p.forme || null } : null;
};

/** Pure : une société privée, qu'on peut démarcher. */
export const estDemarchable = (p) => !!p && FORMES_PRIVEES.has(String(p.forme || '').toUpperCase()) && !PUBLIC.test(String(p.nom || ''));

/** Pure : les gérants personnes physiques d'une société, en prénom et nom. */
export function gerantsPersonnes(societe) {
  return (societe?.gerants || [])
    .filter((g) => !g.personne_morale && g.nom)
    .map((g) => {
      const famille = String(g.nom_famille || '').trim();
      const sansParenthese = String(g.nom).replace(/\(.*\)/, '').trim();
      const mots = sansParenthese.split(/\s+/);
      const nom = famille || mots.at(-1);
      const prenom = (famille ? sansParenthese.replace(new RegExp(`\\s*${famille.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i'), '') : mots.slice(0, -1).join(' ')).split(/\s+/)[0] || '';
      const casse = (t) => t.toLowerCase().replace(/(^|[\s-])([a-zà-ÿ])/g, (m, a, b) => a + b.toUpperCase());
      return { prenom: casse(prenom), nom: casse(nom), qualite: g.qualite || null, tranche_age: g.tranche_age || null };
    })
    .filter((g) => g.prenom && g.nom);
}

/** Pure : depuis quand la société tient ce mur : l'achat daté si on l'a, sinon sa création. */
export function depuisDe(c) {
  if (c.mutation?.du_local && c.mutation?.date) return { date: c.mutation.date, source: 'dernière vente DVF du local' };
  if (c.detention?.depuis) return { date: c.detention.depuis, source: 'fichiers DGFiP' };
  if (c.societe?.creation) return { date: c.societe.creation, source: 'création de la société (au plus tôt)' };
  return null;
}

const ORDRE_PILES = { appeler: 0, ecrire: 1, surveiller: 2, ecartee: 3 };

/**
 * Pure : les sociétés d'une ville, chacune avec ses murs, ses gérants, son
 * contact et l'état du démarchage. Les plus prometteuses d'abord (pile, puis
 * nombre de murs).
 */
export function societesDe(cibles, suivis = {}) {
  const par = new Map();
  for (const c of cibles || []) {
    const p = proprietaireDe(c);
    if (!p) continue;
    const cle = p.siren || `nom:${norm(p.nom)}`;
    const s = par.get(cle) || { cle, siren: p.siren, nom: p.nom, forme: p.forme, demarchable: estDemarchable(p), gerants: gerantsPersonnes(c.societe), siege: c.societe?.siege?.adresse || null, creation: c.societe?.creation || null, murs: [] };
    if (!s.gerants.length) s.gerants = gerantsPersonnes(c.societe);
    s.murs.push({ cible_id: c.id, enseigne: c.enseigne || null, activite: c.activite || null, categorie_activite: c.categorie_activite || null, adresse: c.adresse, lat: c.lat ?? null, lon: c.lon ?? null, rue: c.rue || null, emplacement: c.emplacement ?? null, pile: c.pile || null, depuis: depuisDe(c), mutation: c.mutation?.date ? { date: c.mutation.date, prix: c.mutation.prix ?? null, du_local: !!c.mutation.du_local } : null, fourchette: c.valorisation?.fourchette_estimee || null });
    par.set(cle, s);
  }
  return [...par.values()]
    .map((s) => {
      const suivi = suivis[s.cle] || {};
      const meilleure = Math.min(...s.murs.map((m) => ORDRE_PILES[m.pile] ?? 3));
      return { ...s, pile: Object.keys(ORDRE_PILES).find((k) => ORDRE_PILES[k] === meilleure) || null, contacts: suivi.contacts || [], message: suivi.message || null, etat: suivi.etat || (s.demarchable ? 'a_preparer' : 'non_demarchable'), envoye_le: suivi.envoye_le || null, relance: suivi.relance || null, reponse: suivi.reponse || null, suivi_id: suivi.id || null };
    })
    .sort((a, b) => (a.demarchable === b.demarchable ? 0 : a.demarchable ? -1 : 1) || (ORDRE_PILES[a.pile] ?? 3) - (ORDRE_PILES[b.pile] ?? 3) || b.murs.length - a.murs.length || String(a.nom).localeCompare(String(b.nom)));
}

const suivisDe = (villeId) => Object.fromEntries(Records.filter(ENTITE, { ville_id: villeId }).map((x) => [x.cle, x]));
function poserSuivi(villeId, cle, champs) {
  const s = Records.filter(ENTITE, { ville_id: villeId, cle })[0];
  return s ? Records.update(ENTITE, s.id, { ...champs, maj_le: new Date().toISOString() }) : Records.create(ENTITE, { ville_id: villeId, cle, ...champs, maj_le: new Date().toISOString() });
}

/**
 * Tous les murs d'une société, dans toutes les villes parcourues : la carte
 * de son panneau les montre en France, pas seulement dans la ville ouverte.
 * Seule une société à SIREN se retrouve d'une ville à l'autre ; une clé par
 * nom reste dans sa ville.
 */
export function mursEnFrance(cle) {
  if (!/^\d{9}$/.test(String(cle))) return [];
  const ids = Records.champs('Cible', ['societe.siren', 'proprietaire.siren', 'foncier.choix.siren'])
    .filter((c) => (c['societe.siren'] || c['proprietaire.siren'] || c['foncier.choix.siren']) === cle)
    .map((c) => c.id);
  const villes = new Map();
  return ids.map((id) => Records.get('Cible', id)).filter((c) => c && proprietaireDe(c)?.siren === cle).map((c) => {
    if (!villes.has(c.ville_id)) villes.set(c.ville_id, Records.get('Ville', c.ville_id)?.nom || null);
    return { cible_id: c.id, ville_id: c.ville_id, ville: villes.get(c.ville_id), enseigne: c.enseigne || null, activite: c.activite || null, categorie_activite: c.categorie_activite || null, adresse: c.adresse, lat: c.lat ?? null, lon: c.lon ?? null, emplacement: c.emplacement ?? null, pile: c.pile || null, depuis: depuisDe(c) };
  });
}

export const societesDeLaVille = (villeId, cibles = Records.filter('Cible', { ville_id: villeId })) => societesDe(cibles, suivisDe(villeId));

// ---------------------------------------------------------------------------
// Apollo : le mail des gérants
// ---------------------------------------------------------------------------

/** Pure : ce qu'on garde d'une réponse Apollo. */
export function contactApollo(reponse, gerant) {
  const p = reponse?.person || null;
  if (!p) return null;
  const emails = [p.email, ...(p.personal_emails || []), ...((p.contact?.contact_emails || []).map((e) => e.email))].filter(Boolean);
  const tel = (p.phone_numbers || p.contact?.phone_numbers || [])[0]?.sanitized_number
    || p.organization?.sanitized_phone || p.organization?.phone || null;
  if (!emails.length && !tel && !p.linkedin_url) return null;
  return {
    gerant: `${gerant.prenom} ${gerant.nom}`, email: emails[0] || null, email_statut: p.email_status || null,
    telephone: tel, linkedin: p.linkedin_url || null, poste: p.title || null, entreprise: p.organization?.name || null, source: 'Apollo',
  };
}

export async function chercherGerant(gerant, societe) {
  const cle = `${norm(gerant.prenom)}|${norm(gerant.nom)}|${norm(societe.nom)}`;
  const deja = Records.filter('ApolloRecherche', { cle })[0];
  if (deja && Date.now() - Date.parse(deja.le) < 90 * 86400000) return deja.contact;
  const r = await fetch(APOLLO, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': CLE_APOLLO(), 'cache-control': 'no-cache' },
    body: JSON.stringify({ first_name: gerant.prenom, last_name: gerant.nom, organization_name: societe.nom, reveal_personal_emails: true }),
    signal: AbortSignal.timeout(30000),
  });
  if (r.status === 401 || r.status === 403) throw new Error('Apollo refuse la clé (APOLLO_API_KEY).');
  if (r.status === 429) throw new Error('Apollo : trop de demandes, on reprendra plus tard.');
  const contact = r.ok ? contactApollo(await r.json().catch(() => null), gerant) : null;
  if (deja) Records.update('ApolloRecherche', deja.id, { contact, le: new Date().toISOString() });
  else Records.create('ApolloRecherche', { cle, contact, le: new Date().toISOString() });
  return contact;
}

/**
 * Le contact du propriétaire des murs d'une cible : ses gérants personnes
 * physiques, cherchés dans Apollo (un crédit par gérant, mémorisé 90 jours).
 * Rend le meilleur contact — téléphone d'abord, sinon mail — ou null.
 */
export async function contactDuProprietaire(cible, { max = 2 } = {}) {
  if (!apolloConfigure() || !cible?.societe) return null;
  const nomSociete = cible.societe.nom || cible.proprietaire?.nom || null;
  if (!nomSociete) return null;
  const contacts = [];
  for (const g of gerantsPersonnes(cible.societe).slice(0, max)) {
    try {
      const c = await chercherGerant(g, { nom: nomSociete });
      if (c) contacts.push(c);
      if (c?.telephone) break;
    } catch {
      break; // clé refusée ou quota : on n'insiste pas, on réessaiera plus tard
    }
  }
  return contacts.find((c) => c.telephone) || contacts.find((c) => c.email) || null;
}

/**
 * Cherche dans Apollo les gérants des sociétés démarchables de la ville qui
 * n'ont pas encore de contact, les plus prometteuses d'abord, au plus `max`
 * recherches (chaque recherche coûte un crédit Apollo).
 */
export async function chercherContacts(villeId, { max = 120, journal = () => {} } = {}) {
  if (!apolloConfigure()) return { ok: false, error: 'Apollo n\'est pas branché : APOLLO_API_KEY manque.' };
  let recherches = 0;
  let trouves = 0;
  for (const s of societesDeLaVille(villeId).filter((x) => x.demarchable && x.pile !== 'ecartee' && !x.contacts.length && x.gerants.length)) {
    if (recherches >= max) break;
    const contacts = [];
    for (const g of s.gerants.slice(0, 3)) {
      recherches += 1;
      try { const c = await chercherGerant(g, s); if (c) contacts.push(c); } catch (e) { journal(e.message); return { ok: false, error: e.message, recherches, trouves }; }
    }
    poserSuivi(villeId, s.cle, { contacts, contacts_le: new Date().toISOString() });
    if (contacts.some((c) => c.email)) trouves += 1;
    if (recherches % 20 === 0) journal(`Apollo : ${recherches} gérants cherchés, ${trouves} sociétés joignables par mail.`);
  }
  return { ok: true, recherches, trouves };
}

// ---------------------------------------------------------------------------
// Le message
// ---------------------------------------------------------------------------

/**
 * Rédige le message à une société : ses murs de la ville, un par un, qui
 * nous sommes en deux lignes, achat direct sans commission, une question.
 */
export async function redigerPourSociete(villeId, cle, user) {
  const s = societesDeLaVille(villeId).find((x) => x.cle === cle);
  if (!s) return { ok: false, error: 'Société introuvable.' };
  const { invokeLLM, llmEnabled } = await import('../llm.js');
  const gerant = s.contacts.find((c) => c.email)?.gerant || (s.gerants[0] ? `${s.gerants[0].prenom} ${s.gerants[0].nom}` : null);
  const murs = s.murs.filter((m) => m.pile !== 'ecartee');
  const lignes = (murs.length ? murs : s.murs).map((m) => `- ${m.adresse}${m.enseigne ? `, où se trouve ${m.enseigne}` : ''}${m.activite ? ` (${m.activite})` : ''}`).join('\n');
  const signature = [user?.full_name || user?.email || 'Klocka', 'Klocka', user?.telephone || ''].filter(Boolean).join('\n');
  let mail = null;
  if (llmEnabled) {
    mail = await invokeLLM({
      prompt: `Tu écris, pour Klocka, un premier mail à ${gerant || 'la gérance'}, gérant de ${s.nom}, société propriétaire de murs commerciaux que nous n'avons jamais contactée.

Klocka achète des murs commerciaux occupés, en direct, pour des investisseurs privés dont le financement est en place. Sans mandat, sans commission, sans intermédiaire.

Les murs que ${s.nom} détient, d'après les fichiers publics :
${lignes}

Le mail : il prouve dès la première phrase que ce n'est pas un envoi de masse (cite l'adresse et l'enseigne, ou les adresses s'il y en a plusieurs), dit qui nous sommes en deux lignes, pose UNE question : seriez-vous ouvert à en parler, même pour plus tard ? Vouvoiement, sobre, six à dix lignes. Aucun prix, aucun chiffre inventé, aucune pression. Pas de markdown. Pas de signature (elle est ajoutée).`,
      response_json_schema: { type: 'object', properties: { objet: { type: 'string' }, corps: { type: 'string' } }, required: ['objet', 'corps'] },
      effort: 'low',
    }).catch(() => null);
  }
  if (!mail?.corps) {
    mail = { objet: `Vos murs ${murs[0] ? `au ${murs[0].adresse}` : ''}`.trim(), corps: `Bonjour${gerant ? ` ${gerant}` : ''},\n\nKlocka achète des murs commerciaux occupés, en direct, pour des investisseurs privés, sans mandat ni commission. ${s.nom} détient, d'après les fichiers publics :\n${lignes}\n\nSeriez-vous ouvert à en parler, même pour plus tard ?` };
  }
  const message = { objet: mail.objet, corps: `${String(mail.corps).trim()}\n\nBien à vous,\n${signature}`, redige_le: new Date().toISOString(), par: user?.email || null };
  poserSuivi(villeId, cle, { message, etat: 'pret' });
  return { ok: true, message };
}

/** Rédige les messages des sociétés joignables par mail qui n'en ont pas encore, au plus `max`. */
export async function preparerMessages(villeId, user, { max = 60, journal = () => {} } = {}) {
  let n = 0;
  for (const s of societesDeLaVille(villeId).filter((x) => x.demarchable && x.pile !== 'ecartee' && !x.message && x.contacts.some((c) => c.email))) {
    if (n >= max) break;
    await redigerPourSociete(villeId, s.cle, user);
    n += 1;
    if (n % 10 === 0) journal(`${n} messages rédigés.`);
  }
  return n;
}

export function modifierMessage(villeId, cle, { objet, corps, a }) {
  const s = Records.filter(ENTITE, { ville_id: villeId, cle })[0];
  if (!s?.message) return { ok: false, error: 'Pas de message pour cette société.' };
  const message = { ...s.message, ...(objet !== undefined ? { objet: String(objet).slice(0, 300) } : {}), ...(corps !== undefined ? { corps: String(corps).slice(0, 20000) } : {}), ...(a !== undefined ? { a: String(a).trim().toLowerCase() || null } : {}) };
  Records.update(ENTITE, s.id, { message });
  return { ok: true, message };
}

// ---------------------------------------------------------------------------
// L'envoi, l'appel, la relance, la réponse
// ---------------------------------------------------------------------------

const dansJours = (n) => new Date(Date.now() + n * 86400000).toISOString();

/** Envoie le message relu, depuis la boîte de qui clique, et ouvre une approche par mur. */
export async function envoyer(villeId, cle, user) {
  const s = societesDeLaVille(villeId).find((x) => x.cle === cle);
  if (!s?.message) return { ok: false, error: 'Aucun message prêt pour cette société.' };
  const a = s.message.a || s.contacts.find((c) => c.email)?.email;
  if (!a) return { ok: false, error: 'Pas d\'adresse mail pour cette société : appelle, ou écris-lui par courrier.' };
  const { functions } = await import('../functions.js');
  const r = await functions.sendMail({ to: a, subject: s.message.objet, body: s.message.corps }, { user }).catch((e) => ({ success: false, error: e?.message }));
  if (!r?.success && !r?.simulated) return { ok: false, error: r?.error || 'Envoi raté.' };
  const { enregistrerApproche } = await import('./index.js');
  for (const m of s.murs.filter((x) => x.pile !== 'ecartee')) enregistrerApproche({ cible_id: m.cible_id, canal: 'mail', message: s.message.corps, destinataire: a, relance_le: dansJours(RELANCE_JOURS), user });
  poserSuivi(villeId, cle, { etat: r.success ? 'envoye' : 'simule', envoye_le: new Date().toISOString(), envoye_a: a, envoye_par: user?.email || null, relance: { le: dansJours(RELANCE_JOURS).slice(0, 10), etat: 'prevue' } });
  return { ok: true, a, simule: !r.success };
}

/** Un appel au gérant, noté : l'approche est ouverte, la relance se cale. */
export async function noterAppel(villeId, cle, { issue = 'sans_reponse', note = null, user }) {
  const s = societesDeLaVille(villeId).find((x) => x.cle === cle);
  if (!s) return { ok: false, error: 'Société introuvable.' };
  const { enregistrerApproche } = await import('./index.js');
  for (const m of s.murs.filter((x) => x.pile !== 'ecartee')) enregistrerApproche({ cible_id: m.cible_id, canal: 'telephone', message: note, relance_le: dansJours(issue === 'interesse' ? 3 : RELANCE_JOURS), user });
  poserSuivi(villeId, cle, { etat: issue === 'interesse' ? 'en_discussion' : issue === 'pas_interesse' ? 'refus' : 'appele', dernier_appel: { le: new Date().toISOString(), issue, note, par: user?.email || null }, relance: issue === 'pas_interesse' ? null : { le: dansJours(issue === 'interesse' ? 3 : RELANCE_JOURS).slice(0, 10), etat: 'prevue' } });
  return { ok: true };
}

/**
 * Chaque jour : les relances dont le jour est venu se préparent (un mail
 * court, qui attend un clic), et une réponse du gérant arrête tout.
 * @returns {{relances: number, reponses: object[]}}
 */
export async function suivre({ maintenant = new Date() } = {}) {
  const auj = maintenant.toISOString().slice(0, 10);
  const mails = Records.list('MailRecu');
  const reponses = [];
  let relances = 0;
  for (const s of Records.list(ENTITE).filter((x) => ['envoye', 'simule', 'relance_prete', 'relance_envoyee'].includes(x.etat))) {
    const rep = s.envoye_a ? mails.find((m) => String(m.de_email || '').toLowerCase() === s.envoye_a && String(m.date) > s.envoye_le) : null;
    if (rep) {
      Records.update(ENTITE, s.id, { etat: 'repondu', reponse: { le: rep.date, objet: rep.objet, mail_id: rep.id }, relance: null });
      reponses.push({ ville_id: s.ville_id, cle: s.cle, par: s.envoye_par, objet: rep.objet });
      continue;
    }
    if (s.relance?.etat === 'prevue' && s.relance.le <= auj && s.message) {
      const corps = `Bonjour,\n\nJe me permets de revenir vers vous au sujet de mon message du ${String(s.envoye_le).slice(8, 10)}/${String(s.envoye_le).slice(5, 7)} concernant vos murs commerciaux. Seriez-vous ouvert à un court échange, même pour plus tard ?\n\n${s.message.corps.split('Bien à vous,').pop().trim() ? `Bien à vous,\n${s.message.corps.split('Bien à vous,').pop().trim()}` : ''}`;
      Records.update(ENTITE, s.id, { etat: 'relance_prete', relance: { ...s.relance, etat: 'prete', objet: /^re\s*:/i.test(s.message.objet) ? s.message.objet : `Re : ${s.message.objet}`, corps } });
      relances += 1;
    }
  }
  return { relances, reponses };
}

/** Envoie la relance préparée, après relecture. */
// ---------------------------------------------------------------------------
// L'enrichissement en lot, choisi à la main, avec suivi de progression
// ---------------------------------------------------------------------------
//
// Deux phases visibles : Apollo cherche les gérants des sociétés choisies,
// puis les messages s'écrivent pour celles qui ont un mail. En mémoire, un
// travail à la fois par ville ; la page interroge son avancement.

const travaux = new Map();
const PLAFOND_LOT = 150;

export function travailEnCours(villeId) {
  for (const t of travaux.values()) if (t.ville_id === villeId && t.etat !== 'fini' && t.etat !== 'erreur') return t;
  return null;
}
export const etatEnrichissement = (id) => travaux.get(id) || null;

/**
 * Lance l'enrichissement Apollo puis la rédaction pour les sociétés choisies.
 * Rend l'identifiant du travail tout de suite ; la page l'interroge.
 */
export function lancerEnrichissement(villeId, cles, user) {
  if (!apolloConfigure()) return { ok: false, error: 'Apollo n\'est pas branché : APOLLO_API_KEY manque.' };
  const dejaEnCours = travailEnCours(villeId);
  if (dejaEnCours) return { ok: true, id: dejaEnCours.id };
  const id = `${villeId}-${Date.now()}`;
  const liste = [...new Set(cles)].slice(0, PLAFOND_LOT);
  const travail = { id, ville_id: villeId, etat: 'apollo', avance: 0, total: liste.length, recherches: 0, trouves: 0, messages: 0, erreur: null, tronque: cles.length > liste.length };
  travaux.set(id, travail);
  (async () => {
    try {
      for (const cle of liste) {
        const s = societesDeLaVille(villeId).find((x) => x.cle === cle);
        travail.avance += 1;
        if (!s?.demarchable || s.contacts.length || !s.gerants.length) continue;
        const contacts = [];
        for (const g of s.gerants.slice(0, 3)) {
          travail.recherches += 1;
          const c = await chercherGerant(g, s).catch((e) => { travail.erreur = e.message; return null; });
          if (c) contacts.push(c);
        }
        poserSuivi(villeId, cle, { contacts, contacts_le: new Date().toISOString() });
        if (contacts.some((c) => c.email)) travail.trouves += 1;
      }
      travail.etat = 'messages';
      travail.avance = 0;
      for (const cle of liste) {
        const s = societesDeLaVille(villeId).find((x) => x.cle === cle);
        travail.avance += 1;
        if (s?.demarchable && !s.message && s.contacts.some((c) => c.email)) {
          await redigerPourSociete(villeId, cle, user);
          travail.messages += 1;
        }
      }
      travail.etat = 'fini';
    } catch (e) {
      travail.etat = 'erreur';
      travail.erreur = e?.message || String(e);
    }
  })();
  return { ok: true, id };
}

export async function envoyerRelance(villeId, cle, user) {
  const s = Records.filter(ENTITE, { ville_id: villeId, cle })[0];
  if (s?.relance?.etat !== 'prete') return { ok: false, error: 'Pas de relance prête.' };
  const { functions } = await import('../functions.js');
  const r = await functions.sendMail({ to: s.envoye_a, subject: s.relance.objet, body: s.relance.corps }, { user }).catch((e) => ({ success: false, error: e?.message }));
  if (!r?.success && !r?.simulated) return { ok: false, error: r?.error || 'Envoi raté.' };
  Records.update(ENTITE, s.id, { etat: 'relance_envoyee', relance: { ...s.relance, etat: 'envoyee', envoyee_le: new Date().toISOString() } });
  return { ok: true };
}
