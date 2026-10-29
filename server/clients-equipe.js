// Les clients, côté équipe (16 oct. 2026, Jules) : une fiche par client,
// nourrie par ses appels. Paul enregistre l'appel depuis la fiche (ou colle le
// résumé) ; AK le lit, et d'un coup :
//   - la fiche se complète : critères, situation, ce qui le motive, ce qu'il
//     exclut, ce qu'il faut encore lui demander, la prochaine étape ;
//   - Monday (tableau Clients) reçoit les colonnes et le résumé en note ;
//   - le réseau des mandataires voit la recherche, anonymisée (la demande est
//     celle de leur page Clients : initiales, jamais le nom).
// Un client est une DemandeClient : la même fiche que les mandataires lisent,
// avec tout ce qui ne sort jamais d'ici (nom, contact, fiche, appels).
// « Annuler » remet la fiche comme avant l'appel, et dans Monday les colonnes
// qui avaient une valeur.

import { Records } from './db.js';

const APPELS = 'AppelClient';
const arrondi = (n, pas = 50000) => Math.max(pas, Math.round(n / pas) * pas);
const sansAccents = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
const texte = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const nombre = (v) => (typeof v === 'number' && v > 0 ? Math.round(v * 100) / 100 : null);
const liste = (v) => (Array.isArray(v) ? v.map(texte).filter(Boolean) : []);

// Ce que l'appel apporte en plus du compte rendu de découverte (server/clients-decouverte.js) :
// la recherche telle que les mandataires la lisent, et tout ce qui rend la fiche personnelle.
const EN_PLUS = {
  resume: { type: 'string', description: "ce qui s'est dit, en trois à cinq phrases, au passé composé" },
  type_commerce: { type: 'string', description: "les activités recherchées (« pharmacie, boulangerie ») ou chaîne vide" },
  zones: { type: 'array', items: { type: 'string' }, description: 'villes ou régions où il veut investir, une par entrée ; vide si partout ou non dit' },
  rendement_min: { type: 'number', description: 'rendement minimum attendu en %, 0 si non dit' },
  bail: { type: 'string', description: "ce qu'il exige du bail (durée restante, type, locataire), chaîne vide sinon" },
  motivation: { type: 'string', description: "pourquoi il investit, avec ses mots, chaîne vide sinon" },
  situation: { type: 'string', description: 'sa situation (famille, métier, fiscalité, patrimoine) en une ou deux lignes, chaîne vide sinon' },
  horizon: { type: 'string', description: "quand il veut acheter, chaîne vide si non dit" },
  financement: { type: 'string', description: 'banque, accord de principe, courtier, part de crédit ; chaîne vide sinon' },
  preferences: { type: 'array', items: { type: 'string' }, description: "ce qu'il aime ou demande en plus (emplacement, enseigne, état), une idée par entrée" },
  exclusions: { type: 'array', items: { type: 'string' }, description: "ce qu'il refuse, une idée par entrée" },
  points_attention: { type: 'array', items: { type: 'string' }, description: 'ce à quoi faire attention avec lui (hésitations, contraintes, susceptibilités)' },
  questions_ouvertes: { type: 'array', items: { type: 'string' }, description: "ce qu'il faut encore lui demander" },
  prochaine_etape: { type: 'string', description: 'la prochaine étape convenue, chaîne vide sinon' },
  date_prochaine_etape: { type: 'string', description: "la date dite pour cette étape, en mots (« jeudi prochain »), chaîne vide sinon" },
  pour_mandataires: { type: 'string', description: "sa recherche en une ou deux phrases pour des mandataires immobiliers : sans nom, sans contact, sans employeur, sans détail qui l'identifie" },
};

/** Le schéma de lecture : celui de la découverte, plus ce qui rend la fiche personnelle. */
export async function schemaAppel() {
  const { SCHEMA } = await import('./clients-decouverte.js');
  return { type: 'object', properties: { ...SCHEMA.properties, ...EN_PLUS }, required: ['resume'] };
}

/** Pure : la lecture brute du modèle, nettoyée (ce qui n'est pas dit reste vide). */
export function nettoyerLecture(c = {}, LISTES = { objectif: [], statut: [] }) {
  const dans = (v, l) => (l.includes(v) ? v : null);
  return {
    prenom: texte(c.prenom), nom: texte(c.nom), email: texte(c.email)?.toLowerCase() || null, telephone: texte(c.telephone),
    fonction: texte(c.fonction), localisation: texte(c.localisation), patrimoine: texte(c.patrimoine),
    budget: nombre(c.budget), fonds_propres: nombre(c.fonds_propres), revenu: nombre(c.revenu),
    objectif: dans(c.objectif, LISTES.objectif), statut: dans(c.statut, LISTES.statut),
    profil_investisseur: dans(c.profil_investisseur, ['equilibriste', 'risk_taker', 'collectionneur', 'visionnaire']),
    remarque: texte(c.remarque), information: texte(c.information),
    resume: texte(c.resume) || texte(c.remarque),
    type_commerce: texte(c.type_commerce), zones: liste(c.zones).slice(0, 6), rendement_min: nombre(c.rendement_min), bail: texte(c.bail),
    motivation: texte(c.motivation), situation: texte(c.situation), horizon: texte(c.horizon), financement: texte(c.financement),
    preferences: liste(c.preferences), exclusions: liste(c.exclusions), points_attention: liste(c.points_attention), questions_ouvertes: liste(c.questions_ouvertes),
    prochaine_etape: texte(c.prochaine_etape), date_prochaine_etape: texte(c.date_prochaine_etape),
    pour_mandataires: texte(c.pour_mandataires),
  };
}

/** AK lit l'appel (transcription ou résumé collé). */
export async function lireAppelClient(contenu, { client = null, par = null } = {}) {
  const { invokeLLM } = await import('./llm.js');
  const { mesurer } = await import('./llm-couts.js');
  const { NOTE_KLOCKA } = await import('./klocka-nom.js');
  const { LISTES } = await import('./clients-decouverte.js');
  const connu = client ? `Ce qu'on savait déjà de ce client (${client.client_nom || 'sans nom'}) : ${JSON.stringify(ficheCourte(client))}. ` : '';
  const { resultat } = await mesurer({ operation: 'appel client', par: par?.email || null }, async () => invokeLLM({
    prompt: `Tu es l'assistant de l'équipe Klocka (investissement en murs commerciaux loués). ${NOTE_KLOCKA} Voici un appel entre un conseiller Klocka et un client investisseur. ${connu}Relève ce que l'appel apprend du CLIENT (pas du conseiller), pour une fiche client très personnelle. Ne devine rien : un montant non dit vaut 0, un champ non dit vaut chaîne vide, une liste vide si rien n'est dit. Les montants en « k » sont des milliers d'euros (« 300 k » = 300000). Un budget dit en fourchette : son milieu. Si l'appel corrige ce qu'on savait, la nouvelle valeur l'emporte.

--- APPEL ---
${String(contenu || '').slice(0, 30000)}
--- FIN ---`,
    response_json_schema: await schemaAppel(),
  }));
  return nettoyerLecture(resultat || {}, LISTES);
}

/** Pure : l'essentiel d'une fiche, pour que le modèle sache ce qui est déjà connu. */
export function ficheCourte(d) {
  return Object.fromEntries(Object.entries({
    budget: d.budget || d.budget_max, apport: d.apport, zones: d.zones, type_commerce: d.type_commerce, rendement_min: d.rendement_min, bail: d.bail,
    objectif: d.objectif, ...(d.fiche || {}), prochaine_etape: d.prochaine_etape?.texte,
  }).filter(([, v]) => v != null && v !== '' && !(Array.isArray(v) && !v.length)));
}

const unir = (a = [], b = [], max = 12) => {
  const vus = new Set();
  return [...a, ...b].filter((x) => { const k = sansAccents(x); if (!k || vus.has(k)) return false; vus.add(k); return true; }).slice(0, max);
};

/**
 * Pure : ce que la lecture change sur la fiche. Une valeur dite remplace l'ancienne ; ce qui n'est pas dit
 * ne touche à rien ; les listes s'ajoutent. Rend les champs à écrire et leur valeur d'avant.
 */
export function changementsDeFiche(d, l, { maintenant = new Date(), masquer = (t) => t } = {}) {
  const apres = {};
  const poser = (k, v) => { if (v == null || (Array.isArray(v) && !v.length)) return; if (JSON.stringify(v) !== JSON.stringify(d[k] ?? null)) apres[k] = v; };
  const nom = [l.prenom, l.nom].filter(Boolean).join(' ');
  if (!d.client_nom && nom) poser('client_nom', nom);
  poser('client_email', l.email);
  poser('telephone', l.telephone);
  poser('fonction', l.fonction);
  poser('localisation', l.localisation);
  poser('patrimoine', l.patrimoine);
  poser('revenu', l.revenu);
  poser('objectif', l.objectif);
  poser('profil_investisseur', l.profil_investisseur);
  if (l.budget) { poser('budget', l.budget); poser('budget_min', arrondi(l.budget * 0.85)); poser('budget_max', arrondi(l.budget * 1.15)); }
  poser('apport', l.fonds_propres);
  poser('type_commerce', l.type_commerce);
  poser('zones', l.zones.length ? l.zones : null);
  poser('rendement_min', l.rendement_min);
  poser('bail', l.bail);
  const f0 = d.fiche || {};
  const fiche = {
    ...f0,
    ...Object.fromEntries(['motivation', 'situation', 'horizon', 'financement'].filter((k) => l[k]).map((k) => [k, l[k]])),
    ...Object.fromEntries(['preferences', 'exclusions', 'points_attention'].map((k) => [k, unir(f0[k], l[k])])),
    // Les questions ouvertes : celles de cet appel, les anciennes ayant pu trouver réponse.
    questions_ouvertes: l.questions_ouvertes.length ? l.questions_ouvertes.slice(0, 8) : f0.questions_ouvertes || [],
  };
  poser('fiche', fiche);
  if (l.prochaine_etape) poser('prochaine_etape', { texte: l.prochaine_etape, date_dite: l.date_prochaine_etape, le: maintenant.toISOString() });
  // Le réseau des mandataires : la recherche, sans rien qui identifie le client.
  if (l.pour_mandataires) poser('information', masquer(l.pour_mandataires, nom || d.client_nom).slice(0, 400));
  const avant = Object.fromEntries(Object.keys(apres).map((k) => [k, d[k] ?? null]));
  return { apres, avant };
}

/** Pure : un client se retrouve par son adresse, sinon par son nom exact (accents et casse oubliés). */
export function retrouverClient(clients, { email = null, nom = null }) {
  if (email) { const x = clients.find((c) => sansAccents(c.client_email) === sansAccents(email)); if (x) return x; }
  const n = sansAccents(nom);
  return n ? clients.find((c) => sansAccents(c.client_nom) === n) || null : null;
}

// --- Monday --------------------------------------------------------------------

/** Pure : les colonnes du tableau Clients que la fiche change. */
export function colonnesMonday(apres, COL) {
  const c = {};
  if (apres.client_email) c[COL.email] = { email: apres.client_email, text: apres.client_email };
  if (apres.telephone) c[COL.telephone] = { phone: apres.telephone.replace(/\s+/g, ''), countryShortName: 'FR' };
  if (apres.budget) c[COL.budget] = apres.budget;
  if (apres.apport) c[COL.fonds_propres] = apres.apport;
  if (apres.revenu) c[COL.revenu] = apres.revenu;
  if (apres.zones) c[COL.lieu_recherche] = apres.zones.join(' / ');
  if (apres.objectif) c[COL.objectif] = { label: apres.objectif };
  if (apres.patrimoine) c[COL.patrimoine] = apres.patrimoine;
  if (apres.fonction) c[COL.fonction] = apres.fonction;
  return c;
}

/** Pure : la note Monday de l'appel. */
export function noteMonday(l, { par, maintenant = new Date(), source }) {
  const jour = maintenant.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', timeZone: 'Europe/Paris' });
  return [
    `Appel du ${jour}${par ? ` (${par})` : ''}${source === 'colle' ? ', résumé collé' : ', enregistré sur Klocka'}`,
    l.resume,
    l.prochaine_etape ? `Prochaine étape : ${l.prochaine_etape}${l.date_prochaine_etape ? ` (${l.date_prochaine_etape})` : ''}` : null,
    l.questions_ouvertes.length ? `À lui demander : ${l.questions_ouvertes.join(' ; ')}` : null,
  ].filter(Boolean).join('\n\n');
}

const mondayParDefaut = async () => {
  const M = await import('./monday.js');
  if (!M.mondayConfigure() || !M.TABLEAUX.investisseurs) return null;
  return { tableau: M.TABLEAUX.investisseurs, lire: M.lireElement, poser: M.poserElement, creer: M.creerElement, maj: M.majElement, commenter: M.commenter };
};

async function ecrireMonday(d, l, apres, { par, source, maintenant, monday }) {
  const m = await (monday === undefined ? mondayParDefaut() : monday);
  if (!m) return { etat: 'ignore', texte: "Sunday CRM n'est pas branché ici : rien n'y a été écrit." };
  const { COL } = await import('./clients-decouverte.js');
  const colonnes = colonnesMonday(apres, COL);
  try {
    let id = d.monday_id || null;
    let cree = false;
    let avant = {};
    if (id) {
      // Ce que Monday avait, pour pouvoir le remettre.
      const lu = await m.lire(id).catch(() => null);
      avant = Object.fromEntries(Object.keys(colonnes).map((k) => [k, lu?.colonnes?.[k] ?? null]));
      if (Object.keys(colonnes).length) await m.maj(m.tableau, id, colonnes, { labels: false });
    } else {
      const { LISTES } = await import('./clients-decouverte.js');
      const statut = l.statut && LISTES.statut.includes(l.statut) ? l.statut : 'Def Strategie';
      const r = await m.creer(m.tableau, d.client_nom || [l.prenom, l.nom].filter(Boolean).join(' ') || 'Client', { ...colonnes, [COL.statut]: { label: statut }, ...(l.remarque ? { [COL.remarque]: { text: l.remarque } } : {}) });
      id = r?.id ? String(r.id) : null;
      cree = !!id;
    }
    if (id) await m.commenter(id, noteMonday(l, { par, maintenant, source }));
    return { etat: 'ok', id, cree, avant, colonnes: Object.keys(colonnes), texte: cree ? 'Fiche Sunday CRM créée, avec la note de l\'appel' : `${Object.keys(colonnes).length} colonne${Object.keys(colonnes).length > 1 ? 's' : ''} Sunday CRM mise${Object.keys(colonnes).length > 1 ? 's' : ''} à jour, note de l'appel ajoutée` };
  } catch (e) {
    return { etat: 'echec', texte: `Sunday CRM a refusé : ${String(e?.message || e).slice(0, 160)}` };
  }
}

// --- L'appel ---------------------------------------------------------------------

/**
 * Un appel lu et appliqué. `client_id` : la fiche ouverte ; sans lui, le client se retrouve (adresse, nom)
 * ou naît. `source` : 'enregistre' (transcription du micro) ou 'colle' (résumé collé).
 */
export async function noterAppelClient({ client_id = null, contenu, source = 'colle', duree_s = null, user, lire = lireAppelClient, monday = undefined, maintenant = new Date() }) {
  const brut = String(contenu || '').trim();
  if (brut.length < 20) return { ok: false, error: "L'appel est trop court pour en tirer quelque chose." };
  let d = client_id ? Records.get('DemandeClient', client_id) : null;
  if (client_id && !d) return { ok: false, error: 'Client introuvable.' };
  const l = await lire(brut, { client: d, par: user });
  let nouveau = false;
  if (!d) d = retrouverClient(Records.list('DemandeClient'), { email: l.email, nom: [l.prenom, l.nom].filter(Boolean).join(' ') });
  if (!d) {
    const nom = [l.prenom, l.nom].filter(Boolean).join(' ');
    if (!nom && !l.email) return { ok: false, error: "Le client n'est pas nommé dans l'appel : ouvrez sa fiche, puis enregistrez depuis elle." };
    d = Records.create('DemandeClient', { client_nom: nom || null, profil: 'Investisseur privé', source: 'equipe', active: true, visible: false, ouverte_le: maintenant.toISOString(), cree_par: user?.email || null });
    nouveau = true;
  }
  const { masquerNom } = await import('./mandataire-espace.js');
  const { apres, avant } = changementsDeFiche(d, l, { maintenant, masquer: masquerNom });
  const m = await ecrireMonday({ ...d, ...apres }, l, apres, { par: user?.full_name || user?.email, source, maintenant, monday });
  // Un client né d'un appel : le réseau des mandataires le voit dès qu'on sait ce qu'il cherche, sauf si l'équipe l'a caché.
  const cherche = (apres.budget || d.budget_max) || (apres.zones || d.zones || []).length || apres.type_commerce || d.type_commerce;
  const fiche = Records.update('DemandeClient', d.id, {
    ...apres,
    ...(cherche && d.source === 'equipe' && !d.visible_choisi && d.visible === false ? { visible: true } : {}),
    ...(m.id && !d.monday_id ? { monday_id: m.id } : {}),
    // Retouchée par l'équipe : l'import de Monday ne la réécrit plus.
    edit_manuel: true, maj_le: maintenant.toISOString(), maj_par: user?.email || null, dernier_appel: maintenant.toISOString(),
  });
  const appel = Records.create(APPELS, {
    client_id: d.id, le: maintenant.toISOString(), par: user?.email || null, source, duree_s: Number(duree_s) || null,
    // Le contenu de l'appel est gardé avec lui : c'est le contexte complet du client.
    transcription: source === 'enregistre' ? brut : null, resume_colle: source === 'colle' ? brut : null,
    resume: l.resume, lecture: l, avant, apres, nouveau,
    monday: { etat: m.etat, texte: m.texte, id: m.id || d.monday_id || null, cree: !!m.cree, avant: m.avant || null },
  });
  // L'Intelligence lit l'appel comme une source (16 oct. 2026) : extraction en fond, jamais dans les tests.
  if (!process.env.NODE_TEST_CONTEXT) import('./layer-sources.js').then((x) => x.depuisAppelClient(appel)).catch((e) => console.error('[layer] appel client :', e?.message || e));
  return { ok: true, client: fiche, appel, nouveau };
}

/** « Annuler » : la fiche revient comme avant l'appel ; dans Monday, les colonnes qui avaient une valeur. */
export async function annulerAppelClient(id, { user, monday = undefined } = {}) {
  const a = Records.get(APPELS, id);
  if (!a) return { ok: false, error: 'Appel introuvable.' };
  if (a.annule_le) return { ok: false, error: 'Cet appel est déjà annulé.' };
  const d = Records.get('DemandeClient', a.client_id);
  if (d) Records.update('DemandeClient', d.id, a.avant || {});
  let mondayTexte = null;
  const av = a.monday?.avant || {};
  const remis = Object.entries(av).filter(([, v]) => v != null && v !== '');
  const restes = Object.entries(av).filter(([, v]) => v == null || v === '').length;
  if (a.monday?.id && remis.length) {
    const m = await (monday === undefined ? mondayParDefaut() : monday);
    if (m) {
      const { COL } = await import('./clients-decouverte.js');
      const etiquettes = new Set([COL.objectif, COL.statut]);
      try {
        await m.maj(m.tableau, a.monday.id, Object.fromEntries(remis.map(([k, v]) => [k, etiquettes.has(k) ? { label: v } : /^numeric/.test(k) ? Number(String(v).replace(/[^\d.-]/g, '')) : v])), { labels: false });
        mondayTexte = `${remis.length} colonne${remis.length > 1 ? 's' : ''} Sunday CRM remise${remis.length > 1 ? 's' : ''}`;
      } catch (e) { mondayTexte = `Sunday CRM n'a pas pu être remis : ${String(e?.message || e).slice(0, 120)}`; }
    }
  }
  if (restes) mondayTexte = [mondayTexte, `${restes} colonne${restes > 1 ? 's' : ''} vide${restes > 1 ? 's' : ''} avant l'appel, à vider à la main dans Sunday CRM`].filter(Boolean).join(' ; ');
  if (a.monday?.cree) mondayTexte = [mondayTexte, 'la fiche Sunday CRM créée par cet appel reste'].filter(Boolean).join(' ; ');
  Records.update(APPELS, id, { annule_le: new Date().toISOString(), annule_par: user?.email || null });
  return { ok: true, monday: mondayTexte, client: d ? Records.get('DemandeClient', d.id) : null };
}

// --- Les lectures ----------------------------------------------------------------

/** Pure : la ligne d'un client dans la liste de l'équipe. */
export function ligneClient(d, appels = []) {
  const siens = appels.filter((a) => a.client_id === d.id && !a.annule_le);
  return {
    id: d.id, nom: d.client_nom || 'Client sans nom', email: d.client_email || null, telephone: d.telephone || null,
    profil: d.profil || 'Investisseur privé', objectif: d.objectif || null, statut: d.statut || null,
    type_commerce: d.type_commerce || null, zones: d.zones?.length ? d.zones : d.zone_libre ? [d.zone_libre] : [],
    budget: d.budget || null, budget_min: d.budget_min ?? null, budget_max: d.budget_max ?? null, apport: d.apport ?? null,
    rendement_min: d.rendement_min ?? null, bail: d.bail || null, entre_le: d.entre_le || d.ouverte_le || null,
    visible: d.visible !== false, active: d.active !== false, source: d.source || null, monday_id: d.monday_id || null,
    appels: siens.length, dernier_appel: siens.map((a) => a.le).sort().at(-1) || null,
    prochaine_etape: d.prochaine_etape || null,
  };
}

export function listerClients() {
  const appels = Records.list(APPELS);
  return Records.list('DemandeClient').map((d) => ligneClient(d, appels))
    .sort((a, b) => Number(b.active) - Number(a.active) || String(b.dernier_appel || b.entre_le || '').localeCompare(String(a.dernier_appel || a.entre_le || '')));
}

export async function ficheClient(id) {
  const d = Records.get('DemandeClient', id);
  if (!d) return null;
  const appels = Records.list(APPELS).filter((a) => a.client_id === id).sort((a, b) => String(b.le).localeCompare(String(a.le)));
  const { demandeAnonyme } = await import('./mandataire-espace.js');
  return {
    ...ligneClient(d, appels), fiche: d.fiche || {}, remarque: d.remarque || null, information: d.information || null,
    fonction: d.fonction || null, localisation: d.localisation || null, patrimoine: d.patrimoine || null, revenu: d.revenu || null,
    // Ce que les mandataires en voient, tel quel.
    vu_des_mandataires: demandeAnonyme(d),
    historique: appels.map((a) => ({ id: a.id, le: a.le, par: a.par, source: a.source, duree_s: a.duree_s, resume: a.resume, annule_le: a.annule_le || null, monday: a.monday?.texte || null, contenu: a.transcription || a.resume_colle || null, changes: Object.keys(a.apres || {}) })),
  };
}

/** Une retouche à la main sur la fiche (visible des mandataires, actif). */
export function retoucherClient(id, champs, user) {
  const d = Records.get('DemandeClient', id);
  if (!d) return { ok: false, error: 'Client introuvable.' };
  const permis = {};
  if ('visible' in champs) { permis.visible = !!champs.visible; permis.visible_choisi = true; }
  if ('active' in champs) permis.active = !!champs.active;
  if (typeof champs.client_nom === 'string' && champs.client_nom.trim()) permis.client_nom = champs.client_nom.trim();
  return { ok: true, client: Records.update('DemandeClient', id, { ...permis, maj_par: user?.email || null }) };
}

/** Un client créé à la main, avant son premier appel. */
export function creerClient({ nom, email = null, telephone = null }, user) {
  const n = texte(nom);
  if (!n) return { ok: false, error: 'Le nom du client manque.' };
  const deja = retrouverClient(Records.list('DemandeClient'), { email, nom: n });
  if (deja) return { ok: true, client: deja, deja: true };
  return { ok: true, client: Records.create('DemandeClient', { client_nom: n, client_email: texte(email)?.toLowerCase() || null, telephone: texte(telephone), profil: 'Investisseur privé', source: 'equipe', active: true, visible: false, edit_manuel: true, ouverte_le: new Date().toISOString(), cree_par: user?.email || null }) };
}
