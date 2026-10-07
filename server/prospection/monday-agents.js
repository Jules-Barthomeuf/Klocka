// Le mode appel écrit dans « Agents immobiliers » (MONDAY_BOARD_AGENTS), le
// tableau de référence de l'équipe : une ligne = un contact chez une agence
// (spec du 7 oct. 2026, qui remplace la décision du 25 sept. de ne pas y
// écrire). Seuls les appels aboutis y entrent ; les sans-réponse restent dans
// la plateforme.
//
//   Retrouver la ligne : téléphone, puis mail, puis agence + ville, puis nom
//     du contact. Un doute entre deux lignes se demande à l'écran ; jamais de
//     doublon créé en silence.
//   Écrire, relire, comparer chaque champ : le reçu ne passe au vert que si
//     Monday a ce qu'on voulait y mettre.
//   Annuler : les valeurs d'avant reviennent, une ligne créée à l'instant est
//     retirée.
//
// Propriétés et Priorité ne sont jamais touchées. Remarques s'allonge d'une
// ligne datée par appel, sans rien écraser.

import * as R from './regles.js';
import { telephoneInternational } from './compris.js';

const TITRES = {
  prenom: ['Prénom'], spoc: ['SPOC', 'Analyste'], email: ['E-mail', 'Email'], telephone: ['Téléphone'],
  ville: ['Ville'], entreprise: ['Entreprise', 'Agence'], remarques: ['Remarques'], relance: ['Prochaine relance'],
  // Date : le jour du dernier appel abouti.
  date_contact: ['Date'],
  // Les colonnes ajoutées le 7 oct. 2026 : Statut (la dernière issue), Dernier
  // contact (« 07/10/2026 · Nora »), Liste de diffusion (Oui / Non).
  statut: ['Statut'], dernier_contact: ['Dernier contact'], diffusion: ['Liste de diffusion'],
};

export const CONTACT_VIDE = '\u200b';
export const tableauAgents = () => (process.env.MONDAY_BOARD_AGENTS || '').trim();
export const lienLigne = (id, tableau = tableauAgents()) => `https://klocka-company.monday.com/boards/${tableau}/pulses/${id}`;

/** Pure : les colonnes du tableau par leur titre, avec leur type. */
export function colonnesParTitre(liste) {
  const out = {};
  for (const [cle, titres] of Object.entries(TITRES)) {
    const voulus = titres.map(R.norm);
    const c = liste.find((x) => voulus.includes(R.norm(x.title)));
    if (c) out[cle] = { id: c.id, type: c.type };
  }
  return out;
}

const emailsDe = (t) => String(t || '').toLowerCase().match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/g) || [];
const nomNorm = (n) => R.norm(n).replace(/\b(madame|monsieur|mme|m)\b/g, '').replace(/\s+/g, ' ').trim();

/** Pure : les lignes du tableau, lisibles. */
export function lignesDuTableau(items, cols) {
  const t = (it, k) => (cols[k] ? String(it.colonnes?.[cols[k].id] ?? '').trim() : '');
  return (items || []).map((it) => ({
    id: String(it.id), nom: it.nom || '', telephone: t(it, 'telephone'), emails: emailsDe(t(it, 'email')),
    entreprise: t(it, 'entreprise'), ville: t(it, 'ville'), remarques: t(it, 'remarques'), relance: t(it, 'relance'),
    spoc: t(it, 'spoc'), prenom: t(it, 'prenom'),
  }));
}

const resume = (l) => ({ id: l.id, nom: l.nom, entreprise: l.entreprise || null, ville: l.ville || null, telephone: l.telephone || null, email: l.emails[0] || null, lien: lienLigne(l.id) });

/**
 * Pure : la ligne d'un contact. Rend { etat: 'trouvee' | 'doute' | 'nouvelle',
 * ligne?, par?, candidates? }. Le téléphone d'abord, puis le mail, puis
 * l'agence et la ville, puis le nom du contact.
 */
export function trouverLigne(lignes, { telephones = [], emails = [], agence = null, ville = null, contact = null } = {}) {
  const contactN = contact ? nomNorm(contact) : '';
  const parContact = (l) => contactN && nomNorm(l.nom) === contactN;
  const trancher = (trouvees, par) => {
    if (trouvees.length === 1) return { etat: 'trouvee', ligne: resume(trouvees[0]), par };
    const memeContact = trouvees.filter(parContact);
    if (memeContact.length === 1) return { etat: 'trouvee', ligne: resume(memeContact[0]), par: `${par} et nom` };
    return { etat: 'doute', par, candidates: trouvees.slice(0, 4).map(resume) };
  };
  const tels = telephones.map(R.normTel).filter(Boolean);
  if (tels.length) {
    const t = lignes.filter((l) => R.normTel(l.telephone) && tels.includes(R.normTel(l.telephone)));
    if (t.length) return trancher(t, 'téléphone');
  }
  const mails = emails.map(R.normEmail).filter(Boolean);
  if (mails.length) {
    const t = lignes.filter((l) => l.emails.some((e) => mails.includes(e)));
    if (t.length) return trancher(t, 'mail');
  }
  if (agence) {
    const a = R.norm(agence);
    const v = R.norm(ville);
    const t = lignes.filter((l) => R.norm(l.entreprise) === a && (!v || !l.ville || R.norm(l.ville) === v));
    if (t.length) {
      const memeContact = t.filter(parContact);
      if (memeContact.length === 1) return { etat: 'trouvee', ligne: resume(memeContact[0]), par: 'agence et nom' };
      // Une ligne = un contact : un autre interlocuteur de la même agence est
      // une ligne de plus, mais on le demande plutôt que de le décider.
      return { etat: 'doute', par: 'agence', candidates: t.slice(0, 4).map(resume) };
    }
  }
  if (contactN) {
    const t = lignes.filter(parContact);
    const memeVille = t.filter((l) => ville && R.norm(l.ville) === R.norm(ville));
    if (memeVille.length === 1) return { etat: 'trouvee', ligne: resume(memeVille[0]), par: 'nom et ville' };
    if (t.length) return { etat: 'doute', par: 'nom', candidates: t.slice(0, 4).map(resume) };
  }
  return { etat: 'nouvelle' };
}

/** Pure : la ligne datée des Remarques : « 07/10/2026 · Nora · Pas de bien pour l'instant · résumé ». */
export function ligneDeRemarque({ jour, analyste, issue, resume: r = '', ne_plus_appeler = false }) {
  const j = String(jour || '').slice(0, 10);
  const date = j ? `${j.slice(8, 10)}/${j.slice(5, 7)}/${j.slice(0, 4)}` : '';
  return [date, analyste, issue, ne_plus_appeler ? 'Ne plus appeler' : null, String(r || '').replace(/\s+/g, ' ').trim().slice(0, 300)].filter(Boolean).join(' · ');
}

/**
 * Pure : ce qu'on écrit sur la ligne, ce qu'on doit y relire, et l'aperçu
 * « avant → après » de l'écran d'actions. `ligne` : la ligne existante, ou
 * null pour en créer une.
 */
export function valeursPour(ligne, cols, d) {
  const valeurs = {};
  const attendus = [];
  const apercu = [];
  const avant = ligne || {};
  const poser = (cle, titre, valeur, attendu, montre, mode = 'egal') => {
    if (!cols[cle]) return;
    valeurs[cols[cle].id] = valeur;
    attendus.push({ cle, titre, colonne: cols[cle].id, attendu, mode });
    apercu.push({ titre, avant: avant[cle] ?? '', apres: montre ?? attendu });
  };
  // Le nom de la ligne : l'interlocuteur, rien s'il n'est pas sûr (7 oct. 2026 : Jules ne veut pas
  // « Accueil »). Monday refuse un nom vide : un espace de largeur nulle laisse la case blanche.
  // Une ligne existante garde le sien, sauf s'il est vide ou « Accueil ».
  const contact = d.contact || null;
  const nom = !ligne ? contact || CONTACT_VIDE : (['', 'accueil'].includes(R.norm(ligne.nom)) && contact ? contact : null);
  if (nom) { valeurs.name = nom; attendus.push({ cle: 'nom', titre: 'Contact', colonne: 'name', attendu: nom }); apercu.push({ titre: 'Contact', avant: ligne?.nom || '', apres: nom }); }
  if (d.ville && R.norm(avant.ville) !== R.norm(d.ville)) poser('ville', 'Ville', String(d.ville), String(d.ville));
  if (d.agence && !avant.entreprise) poser('entreprise', 'Entreprise', cols.entreprise?.type === 'dropdown' ? { labels: [String(d.agence).slice(0, 100)] } : String(d.agence), String(d.agence).slice(0, 100));
  if (d.remarque && !String(avant.remarques || '').includes(d.remarque)) {
    const texte = [avant.remarques, d.remarque].filter(Boolean).join('\n');
    poser('remarques', 'Remarques', cols.remarques?.type === 'long_text' ? { text: texte } : texte, d.remarque, `+ ${d.remarque}`, 'contient');
  }
  // Prochaine relance : la date, ou vide pour « Pas intéressé ».
  const relance = d.relance || '';
  if (String(avant.relance || '').slice(0, 10) !== relance) poser('relance', 'Prochaine relance', relance ? { date: relance } : '', relance);
  const tel = telephoneInternational(d.telephone);
  if (tel && !avant.telephone) poser('telephone', 'Téléphone', cols.telephone?.type === 'phone' ? { phone: tel, countryShortName: 'FR' } : tel, tel, d.telephone, 'telephone');
  const email = R.normEmail(d.email);
  if (email && !(avant.emails || []).length) poser('email', 'E-mail', cols.email?.type === 'email' ? { email, text: email } : email, email, email, 'contient');
  if (d.analyste_monday_id && !avant.spoc) poser('spoc', 'SPOC', { personsAndTeams: [{ id: Number(d.analyste_monday_id), kind: 'person' }] }, d.analyste_nom || '', d.analyste_nom || '', 'non_vide');
  const prenom = contact ? String(contact).replace(/^(madame|monsieur)\s+/i, '').split(/\s+/)[0] : null;
  if (prenom && !avant.prenom && !ligne) poser('prenom', 'Prénom', prenom, prenom);
  const jourFr = d.dernier_contact ? `${d.dernier_contact.slice(8, 10)}/${d.dernier_contact.slice(5, 7)}/${d.dernier_contact.slice(0, 4)}` : null;
  if (d.dernier_contact && cols.date_contact) poser('date_contact', 'Date', cols.date_contact.type === 'date' ? { date: d.dernier_contact } : jourFr, cols.date_contact.type === 'date' ? d.dernier_contact : jourFr);
  if (d.statut) poser('statut', 'Statut', cols.statut?.type === 'status' ? { label: d.statut } : d.statut, d.statut);
  if (d.dernier_contact && cols.dernier_contact) {
    const t = cols.dernier_contact.type;
    const texte = [jourFr, d.analyste_nom].filter(Boolean).join(' · ');
    poser('dernier_contact', 'Dernier contact', t === 'date' ? { date: d.dernier_contact } : t === 'long_text' ? { text: texte } : texte, t === 'date' ? d.dernier_contact : texte);
  }
  if (d.diffusion != null && cols.diffusion) {
    const t = cols.diffusion.type;
    const oui = d.diffusion ? 'Oui' : 'Non';
    if (t === 'checkbox') poser('diffusion', 'Liste de diffusion', d.diffusion ? { checked: 'true' } : '', d.diffusion ? 'v' : '', null, 'non_vide');
    else poser('diffusion', 'Liste de diffusion', t === 'status' ? { label: oui } : t === 'dropdown' ? { labels: [oui] } : oui, oui);
  }
  return { valeurs, attendus, apercu };
}

/** Pure : les écarts entre la ligne relue et ce qu'on voulait y lire. */
export function ecartsDe(lu, attendus) {
  const ecarts = [];
  for (const x of attendus) {
    const v = x.colonne === 'name' ? String(lu?.nom || '') : String(lu?.colonnes?.[x.colonne] ?? '');
    const ok = x.mode === 'contient' ? R.norm(v).includes(R.norm(x.attendu))
      : x.mode === 'telephone' ? R.normTel(v) === R.normTel(x.attendu)
        : x.mode === 'non_vide' ? (!x.attendu ? !v.trim() : !!v.trim())
          : R.norm(v) === R.norm(x.attendu);
    if (!ok) ecarts.push(`${x.titre} : Monday affiche « ${v.slice(0, 60) || 'rien'} »`);
  }
  return ecarts;
}

/** Pure : de quoi remettre une ligne comme avant, d'après ses valeurs relues avant l'écriture. */
export function valeursDeRetour(avantLu, attendus, cols) {
  const v = {};
  const type = (colId) => Object.values(cols).find((c) => c.id === colId)?.type;
  for (const x of attendus) {
    if (x.colonne === 'name') { v.name = avantLu?.nom || CONTACT_VIDE; continue; }
    const texte = String(avantLu?.colonnes?.[x.colonne] ?? '');
    const t = type(x.colonne);
    if (!texte) v[x.colonne] = t === 'people' ? { personsAndTeams: [] } : '';
    else if (t === 'date') v[x.colonne] = { date: texte.slice(0, 10) };
    else if (t === 'dropdown') v[x.colonne] = { labels: texte.split(',').map((s) => s.trim()).filter(Boolean) };
    else if (t === 'phone') v[x.colonne] = { phone: texte.replace(/\s/g, ''), countryShortName: 'FR' };
    else if (t === 'email') v[x.colonne] = { email: texte, text: texte };
    else if (t === 'status') v[x.colonne] = { label: texte };
    else if (t === 'long_text') v[x.colonne] = { text: texte };
    else if (t !== 'people') v[x.colonne] = texte;
  }
  return v;
}

// ---------------------------------------------------------------------------
// Avec Monday
// ---------------------------------------------------------------------------

let colonnesCache = null;
let lignesCache = null;

async function api() { return import('../monday.js'); }

export async function colonnes() {
  if (colonnesCache) return colonnesCache;
  const M = await api();
  colonnesCache = colonnesParTitre(await M.colonnesDuTableau(tableauAgents()));
  return colonnesCache;
}

/** Les lignes du tableau, relues au plus toutes les deux minutes (et après chaque écriture). */
export async function lignes({ frais = false } = {}) {
  if (!frais && lignesCache && Date.now() - lignesCache.le < 120000) return lignesCache.lignes;
  const M = await api();
  const cols = await colonnes();
  const l = lignesDuTableau(await M.lireTableau(tableauAgents(), 10000), cols);
  lignesCache = { le: Date.now(), lignes: l };
  return l;
}

// Les tests (node --test) n'écrivent jamais dans le vrai tableau, même si le
// .env est chargé par une dépendance : le 7 oct. 2026, un essai y a laissé une ligne.
export const mondayAgentsBranche = async () => !process.env.NODE_TEST_CONTEXT && !!tableauAgents() && (await api()).mondayConfigure();

/** La ligne d'un contact et l'aperçu de ce qui va changer, pour l'écran d'actions. Ne lève jamais : Monday absent rend « indisponible ». */
export async function preparer(cible, donnees) {
  try {
    if (!(await mondayAgentsBranche())) return { etat: 'indisponible', texte: "Monday n'est pas branché ici" };
    const [cols, toutes] = await Promise.all([colonnes(), lignes()]);
    const m = trouverLigne(toutes, cible);
    const ligne = m.etat === 'trouvee' ? toutes.find((l) => l.id === m.ligne.id) : null;
    return { ...m, apercu: valeursPour(ligne, cols, donnees).apercu };
  } catch (e) {
    return { etat: 'indisponible', texte: 'Monday ne répond pas : la ligne sera retrouvée à la validation', erreur: String(e?.message || e).slice(0, 200) };
  }
}

/**
 * Écrit le contact sur sa ligne (ou en crée une), relit, compare. Rend
 * { etat: 'ok' | 'attente', item_id, cree, avant, attendus, texte, lien, ecarts? }.
 * `ligne_id` : la ligne choisie à l'écran ('nouvelle' pour en créer une).
 */
export async function ecrire({ cible, donnees: donnees0, ligne_id = null, item_cree = null }, { fonctions = null } = {}) {
  let donnees = donnees0;
  const M = fonctions || (await api());
  const tableau = tableauAgents();
  const cols = fonctions?.cols || (await colonnes());
  const toutes = fonctions?.lignes || (await lignes({ frais: true }));
  // Un nouvel essai après une création dont la relecture a échoué : on reprend la ligne créée.
  let id = item_cree || (ligne_id && ligne_id !== 'nouvelle' ? String(ligne_id) : null);
  if (!id && ligne_id !== 'nouvelle') {
    const m = trouverLigne(toutes, cible);
    if (m.etat === 'trouvee') id = m.ligne.id;
    else if (m.etat === 'doute') return { etat: 'doute', candidates: m.candidates, texte: "C'est bien cette ligne ? Choisissez-la à l'écran" };
  }
  const ligne = id ? toutes.find((l) => l.id === id) || null : null;
  const avantLu = id ? await M.lireElement(id) : null;
  // Le SPOC : l'analyste, retrouvé dans Monday par son adresse.
  if (donnees.analyste_email && !donnees.analyste_monday_id && M.personneMonday) {
    try { const p = await M.personneMonday({ email: donnees.analyste_email }); if (p?.id) donnees = { ...donnees, analyste_monday_id: p.id, analyste_nom: donnees.analyste_nom || p.name }; } catch { /* le SPOC attendra */ }
  }
  if (id && !avantLu) return { etat: 'attente', texte: 'La ligne Monday choisie ne se relit plus', erreur: 'ligne introuvable' };
  const { valeurs, attendus } = valeursPour(ligne, cols, donnees);
  const cree = !id;
  if (cree) {
    const { name, ...reste } = valeurs;
    const it = await M.creerElement(tableau, String(name || CONTACT_VIDE).slice(0, 250), reste, { labels: true });
    id = it?.id ? String(it.id) : null;
    if (!id) throw new Error("Monday n'a pas rendu d'identifiant");
  } else if (Object.keys(valeurs).length) {
    await M.majElement(tableau, id, valeurs, { labels: true });
  }
  lignesCache = null;
  const lu = await M.lireElement(id);
  if (!lu) return { etat: 'attente', item_id: id, cree, avant: avantLu, attendus, texte: 'Monday en attente, nouvel essai en cours', erreur: 'la ligne écrite ne se relit pas' };
  const ecarts = ecartsDe(lu, attendus);
  const base = { item_id: id, cree, avant: avantLu, attendus, lien: lienLigne(id, tableau) };
  if (ecarts.length) return { ...base, etat: 'attente', texte: 'Monday en attente, nouvel essai en cours', erreur: ecarts.join(' ; '), ecarts };
  const entreprise = cols.entreprise ? lu.colonnes?.[cols.entreprise.id] : null;
  return { ...base, etat: 'ok', texte: [entreprise || donnees.agence, lu.nom, donnees.issue].filter((x) => String(x || '').replace(/\u200b/g, '').trim()).join(' · '), relu_le: new Date().toISOString() };
}

/** Annuler : la ligne reprend ses valeurs d'avant ; une ligne créée à l'instant est retirée. */
export async function restaurer({ item_id, cree, avant, attendus }, { fonctions = null } = {}) {
  if (!item_id) return { ok: true, rien: true };
  const M = fonctions || (await api());
  if (cree) { await M.supprimerElement(item_id); lignesCache = null; return { ok: true, retiree: true }; }
  const cols = fonctions?.cols || (await colonnes());
  const v = valeursDeRetour(avant, attendus || [], cols);
  if (Object.keys(v).length) await M.majElement(tableauAgents(), item_id, v, { labels: true });
  lignesCache = null;
  return { ok: true };
}

/** La relance annulée (la fiche est arrivée) : « Prochaine relance » passe à la suivante, ou se vide. */
export async function viderRelance(itemId, suivante = null) {
  if (!(await mondayAgentsBranche())) return { ok: false };
  const cols = await colonnes();
  if (!cols.relance || !itemId) return { ok: false };
  const M = await api();
  await M.majElement(tableauAgents(), itemId, { [cols.relance.id]: suivante ? { date: suivante } : '' });
  lignesCache = null;
  return { ok: true };
}
