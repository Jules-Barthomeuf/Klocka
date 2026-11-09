// Ce qui fait entrer un contact (8 nov. 2026, Jules) : les formulaires publics des lead magnets, les webinaires, et les
// vues du CRM reprises comme audiences. Un formulaire garde le texte exact du consentement et sa date : c'est ce qui
// autorise à écrire ensuite à un particulier.

import { randomBytes } from 'crypto';
import { Records } from '../db.js';
import { listeDuNom } from './schema.js';
import * as J from './journal.js';

export const FORMULAIRE = 'EmailingFormulaire';
export const WEBINAIRE = 'EmailingWebinaire';
export const CONSENTEMENT_DEFAUT = 'J\'accepte de recevoir les conseils et les opportunités de Klocka sur l\'investissement en murs commerciaux. Je peux me désinscrire à tout moment.';

const slug = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
const base = () => (process.env.APP_URL || '').replace(/\/$/, '');

// --- Les formulaires ---------------------------------------------------------------------

export const formulaireParSlug = (s) => Records.list(FORMULAIRE).find((f) => f.slug === s) || null;

export function formulaires() {
  return Records.list(FORMULAIRE).map((f) => ({ ...f, lien: `${base()}/Formulaire?f=${f.slug}` })).sort((a, b) => String(a.nom).localeCompare(String(b.nom)));
}

export function creerFormulaire({ nom = '', ...reste } = {}, user = null) {
  const n = String(nom || '').trim();
  if (!n) return { ok: false, error: 'Nommez le formulaire.' };
  let s = slug(n);
  if (formulaireParSlug(s)) s = `${s}-${randomBytes(2).toString('hex')}`;
  return { ok: true, formulaire: Records.create(FORMULAIRE, {
    nom: n, slug: s, titre: n, sous_titre: '', bouton: 'Recevoir', page: '', consentement: CONSENTEMENT_DEFAUT, liste_nom: null, actif: true, pris: 0, cree_par: user?.email || null, cree_le: J.maintenant(), ...reste,
  }) };
}

export function modifierFormulaire(id, patch) {
  if (!Records.get(FORMULAIRE, id)) return null;
  const champs = {};
  for (const k of ['nom', 'titre', 'sous_titre', 'bouton', 'page', 'consentement', 'liste_nom']) if (patch[k] !== undefined) champs[k] = String(patch[k] || '').trim();
  if (patch.actif !== undefined) champs.actif = !!patch.actif;
  return { ok: true, formulaire: Records.update(FORMULAIRE, id, champs) };
}

export function supprimerFormulaire(id) {
  const f = Records.get(FORMULAIRE, id);
  if (!f) return null;
  if (f.pris) return { ok: false, error: 'Ce formulaire a déjà servi. Désactivez-le plutôt : la preuve des consentements reste.' };
  Records.delete(FORMULAIRE, id);
  return { ok: true };
}

/** Ce que la page publique peut lire. */
export function formulairePublic(s) {
  const f = formulaireParSlug(s);
  if (!f?.actif) return null;
  const w = f.webinaire_id ? Records.get(WEBINAIRE, f.webinaire_id) : null;
  return { titre: f.titre, sous_titre: f.sous_titre, bouton: f.bouton, consentement: f.consentement, webinaire: w ? { nom: w.nom, date: w.date } : null };
}

const tentatives = new Map();
/** Pure sur l'horloge donnée : au plus 10 envois par adresse IP sur 10 minutes. */
export function tropDeTentatives(ip, quand = Date.now()) {
  const recentes = (tentatives.get(ip) || []).filter((t) => quand - t < 600000);
  recentes.push(quand);
  tentatives.set(ip, recentes);
  return recentes.length > 10;
}

/**
 * Une personne remplit un formulaire public. Le consentement est obligatoire. Rend la page où aller ensuite, avec son
 * jeton personnel : le lead magnet saura qui l'utilise.
 */
export function soumettre(s, corps = {}, { ip = '' } = {}) {
  const f = formulaireParSlug(s);
  if (!f?.actif) return { ok: false, error: 'Ce formulaire n\'est plus ouvert.' };
  if (ip && tropDeTentatives(ip)) return { ok: false, error: 'Trop de tentatives. Réessayez dans quelques minutes.' };
  // Le champ caché : un robot le remplit, une personne ne le voit pas.
  if (corps.site) return { ok: true, message: 'Merci.' };
  const email = J.norm(corps.email);
  if (!J.emailValide(email)) return { ok: false, error: 'Cette adresse mail ne semble pas valide.' };
  if (corps.consentement !== true) return { ok: false, error: 'Merci de cocher la case pour continuer.' };
  const le = J.maintenant();
  const liste = listeDuNom(f.liste_nom || `Formulaire · ${f.nom}`);
  // Un nouveau consentement explicite annule une ancienne désinscription, jamais une plainte ni un rebond.
  const o = J.opposition(email);
  if (o?.portee === 'marketing') J.leverOpposition(email, `formulaire:${f.slug}`);
  const c = J.contactPour(email, {
    prenom: String(corps.prenom || '').trim().slice(0, 80), nom: String(corps.nom || '').trim().slice(0, 80), source: `formulaire:${f.slug}`, listes: liste ? [liste.id] : [],
    tags: f.webinaire_id ? ['Webinaire'] : ['Lead magnet'], base_legale: 'consentement', consentement: { texte: f.consentement, le, formulaire: f.slug },
  });
  if (!c) return { ok: false, error: 'Inscription impossible.' };
  Records.update(FORMULAIRE, f.id, { pris: (f.pris || 0) + 1 });
  if (f.webinaire_id) emettreWebinaire('webinaire_inscrit', Records.get(WEBINAIRE, f.webinaire_id), c, le);
  else J.emettre('lead_magnet_pris', { email, contact_id: c.id, source: f.slug, charge: { formulaire: f.slug, nom: f.nom }, le, cle: `lm:${f.slug}:${c.id}` });
  const page = String(f.page || '').trim();
  return { ok: true, message: 'C\'est fait, merci.', redirection: page ? `${page}${page.includes('?') ? '&' : '?'}k=${encodeURIComponent(c.jeton)}` : null };
}

// --- Les webinaires ----------------------------------------------------------------------

function emettreWebinaire(type, w, c, le = J.maintenant()) {
  J.emettre(type, {
    email: c.email, contact_id: c.id, source: w.id, le, cle: `${type}:${w.id}:${c.id}`,
    charge: { webinaire_id: w.id, webinaire_nom: w.nom, webinaire_date: w.date, webinaire_jour: new Date(w.date).toLocaleString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' }), lien_webinaire: w.lien || '', lien_replay: w.replay || '' },
  });
}

const inscritsDe = (w) => Records.list('EmailingContact').filter((c) => (c.listes || []).includes(w.liste_id));

export function webinaires() {
  return Records.list(WEBINAIRE).map((w) => {
    const inscrits = inscritsDe(w);
    const f = Records.list(FORMULAIRE).find((x) => x.webinaire_id === w.id);
    return { ...w, inscrits: inscrits.length, lien_formulaire: f ? `${base()}/Formulaire?f=${f.slug}` : null };
  }).sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

export function creerWebinaire({ nom = '', date = '', lien = '' } = {}, user = null) {
  const n = String(nom || '').trim();
  if (!n || Number.isNaN(Date.parse(date))) return { ok: false, error: 'Donnez un nom et une date.' };
  const liste = listeDuNom(`Webinaire · ${n}`, user?.email || null);
  const w = Records.create(WEBINAIRE, { nom: n, date: new Date(date).toISOString(), lien: String(lien || '').trim(), replay: '', liste_id: liste.id, cree_par: user?.email || null, cree_le: J.maintenant() });
  const { formulaire } = creerFormulaire({ nom: `Webinaire ${n}`, titre: n, bouton: 'Je m\'inscris', liste_nom: liste.nom, webinaire_id: w.id }, user);
  return { ok: true, webinaire: w, formulaire };
}

export function modifierWebinaire(id, patch) {
  if (!Records.get(WEBINAIRE, id)) return null;
  const champs = {};
  for (const k of ['nom', 'lien', 'replay']) if (patch[k] !== undefined) champs[k] = String(patch[k] || '').trim();
  if (patch.date && !Number.isNaN(Date.parse(patch.date))) champs.date = new Date(patch.date).toISOString();
  return { ok: true, webinaire: Records.update(WEBINAIRE, id, champs) };
}

const emailsDe = (texte) => [...new Set(String(texte || '').toLowerCase().match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/g) || [])];

/** Des adresses collées deviennent des inscrits. Seules des personnes qui se sont inscrites ailleurs (import de l'outil de webinaire). */
export function importerInscrits(id, texte) {
  const w = Records.get(WEBINAIRE, id);
  if (!w) return null;
  let n = 0;
  for (const email of emailsDe(texte)) {
    const c = J.contactPour(email, { source: `webinaire:${w.id}`, listes: [w.liste_id], tags: ['Webinaire'], base_legale: 'inscription_webinaire' });
    if (!c) continue;
    emettreWebinaire('webinaire_inscrit', w, c);
    n += 1;
  }
  return { ok: true, importes: n };
}

/** Les présents collés : ils passent présents, tous les autres inscrits passent absents. */
export function noterPresence(id, texte) {
  const w = Records.get(WEBINAIRE, id);
  if (!w) return null;
  const presents = new Set(emailsDe(texte));
  if (!presents.size) return { ok: false, error: 'Collez les adresses des présents.' };
  let p = 0;
  let a = 0;
  for (const c of inscritsDe(w)) {
    if (presents.has(c.email)) { emettreWebinaire('webinaire_present', w, c); p += 1; } else { emettreWebinaire('webinaire_absent', w, c); a += 1; }
  }
  Records.update(WEBINAIRE, id, { presence_le: J.maintenant(), presents: p, absents: a });
  return { ok: true, presents: p, absents: a };
}

// --- Les vues du CRM ---------------------------------------------------------------------

/** Pure : l'adresse et le nom d'une fiche de Twenty. Le champ « mandataireEmail » n'est pas l'adresse de la fiche. */
export function contactDeFiche(f) {
  let email = null;
  for (const [cle, v] of Object.entries(f || {})) {
    if (/mandataire/i.test(cle)) continue;
    if (v && typeof v === 'object' && v.primaryEmail) { email = J.norm(v.primaryEmail); break; }
  }
  const n = f?.name;
  const nom = typeof n === 'string' ? n : [n?.firstName, n?.lastName].filter(Boolean).join(' ');
  return { email, nom: String(nom || '').trim(), twenty_id: f?.id || null };
}

/** Une vue du CRM devient une liste : Twenty fait foi, un désinscrit le reste. Relue à la demande, jamais écrite dans Twenty. */
export async function importerVue(emailUser, { singulier, filtres = [], nom = '', type = 'lead' }) {
  const { page } = await import('../crm/ecran.js');
  const titre = String(nom || '').trim() || `CRM · ${singulier}`;
  const liste = listeDuNom(titre, emailUser);
  const gardes = new Set();
  let apres = null;
  for (let i = 0; i < 100; i += 1) {
    const r = await page(emailUser, singulier, { filtres, apres });
    for (const f of r.fiches || []) {
      const x = contactDeFiche(f);
      if (!J.emailValide(x.email)) continue;
      const [prenom, ...reste] = x.nom.split(' ');
      const c = J.contactPour(x.email, { prenom, nom: reste.join(' '), type, source: `crm:${singulier}`, listes: [liste.id], tags: ['CRM'] });
      if (c) { gardes.add(c.id); if (x.twenty_id && !c.twenty_id) Records.update('EmailingContact', c.id, { twenty_id: x.twenty_id }); }
    }
    apres = r.suite;
    if (!apres) break;
  }
  // Qui a quitté la vue quitte la liste.
  let retires = 0;
  for (const c of Records.list('EmailingContact')) {
    if ((c.listes || []).includes(liste.id) && !gardes.has(c.id)) { Records.update('EmailingContact', c.id, { listes: c.listes.filter((x) => x !== liste.id) }); retires += 1; }
  }
  Records.update('EmailingListe', liste.id, { vue_crm: { singulier, filtres, type }, relue_le: J.maintenant() });
  return { ok: true, liste: liste.id, nom: titre, contacts: gardes.size, retires };
}

/** Inscrit à la main des contacts dans une automatisation. */
export async function inscrire(automatisationId, ids, user) {
  const { entrer } = await import('./moteur.js');
  const a = Records.get('EmailingAutomatisation', automatisationId);
  if (!a) return null;
  if (a.statut !== 'active') return { ok: false, error: 'Activez d\'abord cette automatisation.' };
  let n = 0;
  for (const id of ids) if (entrer(a, Records.get('EmailingContact', id), { boite: a.nature === 'prospection' ? (a.expediteur || user?.email) : null })) n += 1;
  return { ok: true, inscrits: n, ignores: ids.length - n };
}
