// Les alertes des sites d'annonces, reçues dans nos boîtes : SeLoger,
// Leboncoin, BureauxLocaux, Geolocaux… On ne va pas lire leurs sites (leurs
// conditions l'interdisent) : on crée une alerte chez eux une fois, sur nos
// villes et nos types de biens, et ce qu'ils nous envoient arrive ici.
//
// La relève Gmail les met de côté (AlerteAnnonce) au lieu de les écarter ;
// la nuit, le modèle en tire les annonces et leurs agences, et les agences
// qu'on ne connaît pas rejoignent la prospection.

import { Records } from '../db.js';
import { normEmail, normTel, telAffiche } from './regles.js';

const ENTITE = 'AlerteAnnonce';

// Les expéditeurs d'alertes, par domaine (sous-domaines compris).
export const SITES = {
  'seloger.com': 'SeLoger',
  'leboncoin.fr': 'Leboncoin',
  'bureauxlocaux.com': 'BureauxLocaux',
  'geolocaux.com': 'Geolocaux',
  'logic-immo.com': 'Logic-Immo',
  'bienici.com': 'Bien\'ici',
  'cessionpme.com': 'CessionPME',
  'leboutiquier.fr': 'Le Boutiquier',
  'avendrealouer.fr': 'AVendreALouer',
  'figaroimmo.fr': 'Figaro Immo',
  'equimmox.com': 'Equimmox',
};

/** Pure : le site d'une alerte (« SeLoger »), ou null si le mail n'en est pas une. */
export function siteDeLAlerte(mail) {
  const domaine = String(mail?.de_email || '').toLowerCase().split('@')[1] || '';
  for (const [d, nom] of Object.entries(SITES)) if (domaine === d || domaine.endsWith(`.${d}`)) return nom;
  return null;
}

/** Garde une alerte reçue, pour la lecture de la nuit. */
export function garderAlerte(mail) {
  const site = siteDeLAlerte(mail);
  if (!site) return null;
  if (Records.filter(ENTITE, { gmail_message_id: mail.gmail_message_id }).length) return null;
  return Records.create(ENTITE, {
    site, compte: mail.compte, gmail_message_id: mail.gmail_message_id, de_email: mail.de_email,
    objet: String(mail.objet || '').slice(0, 200), date: mail.date, texte: String(mail.texte || '').slice(0, 15000),
    etat: 'a_lire', recue_le: new Date().toISOString(),
  });
}

const SCHEMA = {
  type: 'object',
  properties: {
    annonces: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          titre: { type: 'string' },
          ville: { type: 'string' },
          prix: { type: 'number' },
          surface: { type: 'number' },
          vente: { type: 'boolean', description: 'true pour une vente, false pour une location' },
          agence: { type: 'string', description: "le nom de l'agence ou du professionnel qui publie, vide si absent" },
          telephone: { type: 'string' },
          email: { type: 'string' },
          lien: { type: 'string' },
        },
        required: ['titre'],
      },
    },
  },
  required: ['annonces'],
};

/** Pure : les candidats tirés des annonces lues, un par agence. */
export function candidatsDesAnnonces(annonces, site) {
  const par = new Map();
  for (const a of annonces || []) {
    const agence = String(a.agence || '').trim();
    if (!agence || /particulier/i.test(agence)) continue;
    const cle = normEmail(a.email) || normTel(a.telephone) || agence.toLowerCase();
    const c = par.get(cle) || { nom: agence, agence, email: normEmail(a.email), telephone: normTel(a.telephone) ? telAffiche(a.telephone) : null, ville: a.ville || null, adresse: null, source: `alerte ${site}`, annonces: 0, titres: [] };
    c.annonces += 1;
    c.titres.push(a.titre);
    par.set(cle, c);
  }
  return [...par.values()].map((c) => ({ ...c, remarque: `Alerte ${site} : ${c.annonces} annonce${c.annonces > 1 ? 's' : ''}${c.ville ? ` à ${c.ville}` : ''} (${c.titres.slice(0, 2).join(' ; ')}).` }));
}

/** Lit les alertes en attente (au plus `max`) et rend les agences qu'elles citent. */
export async function candidatsDesAlertes({ max = 20 } = {}) {
  const { invokeLLM, llmEnabled } = await import('../llm.js');
  const aLire = Records.filter(ENTITE, { etat: 'a_lire' }).slice(0, max);
  if (!aLire.length || !llmEnabled) return { candidats: [], lues: 0 };
  const candidats = [];
  for (const al of aLire) {
    try {
      const r = await invokeLLM({
        prompt: `Voici une alerte d'annonces immobilières envoyée par ${al.site}. Liste chaque annonce qu'elle contient : titre, ville, prix, surface, vente ou location, et le professionnel qui la publie (agence, mail, téléphone) quand l'alerte le donne. N'invente rien : un champ absent reste vide.\n\nObjet : ${al.objet}\n\n${al.texte}`,
        response_json_schema: SCHEMA,
        effort: 'low',
      });
      const annonces = (r?.annonces || []).slice(0, 60);
      const c = candidatsDesAnnonces(annonces, al.site);
      candidats.push(...c);
      Records.update(ENTITE, al.id, { etat: 'lue', annonces, agences: c.length, lue_le: new Date().toISOString() });
    } catch (e) {
      Records.update(ENTITE, al.id, { etat: 'ratee', erreur: e?.message || String(e) });
    }
  }
  return { candidats, lues: aLire.length };
}

/** Ce que les alertes ont apporté, pour la page. */
export function etatDesAlertes() {
  const toutes = Records.list(ENTITE);
  const parSite = {};
  for (const a of toutes) {
    const s = (parSite[a.site] ||= { site: a.site, recues: 0, annonces: 0, derniere: null });
    s.recues += 1;
    s.annonces += (a.annonces || []).length;
    if (!s.derniere || String(a.date) > s.derniere) s.derniere = a.date;
  }
  return { a_lire: toutes.filter((a) => a.etat === 'a_lire').length, sites: Object.values(parSite) };
}
