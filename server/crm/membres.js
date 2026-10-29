// Les personnes des fiches (SPOC, Personnes, Personne, Collaborateurs) en membres de Sunday CRM, avec leur photo
// (28 oct. 2026, Jules).
//
// Monday disait « qui » par des noms ; Twenty les a importés en texte. Pour voir des têtes, chaque champ texte a un
// jumeau « membres » : une liste de membres de l'espace (relation vers une petite table de jonction, que Twenty affiche
// comme les avatars des membres). Posé par scripts/crm/personnes-twenty.mjs.
//   - Klocka et la synchronisation écrivent le texte (comme dans Monday) : accorder() en tire les membres.
//   - Une personne coche ou retire un membre dans Sunday CRM : texteDesMembres() refait le texte, qui repart vers Monday.
// Un nom sans compte Sunday CRM reste dans le texte et attend : il devient un membre quand la personne rejoint.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as T0 from '../twenty.js';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let T = T0;
let objetsSchema = null;
let equipeFixe = null;
let branche = false;
/** Pour les tests : sans branchement, rien ne part vers Twenty sous NODE_TEST_CONTEXT. */
export function brancherPourTests({ twenty = null, objets = null, equipe = null } = {}) {
  if (!process.env.NODE_TEST_CONTEXT) return;
  branche = !!twenty;
  T = twenty || T0;
  objetsSchema = objets;
  equipeFixe = equipe;
  membresCache = null;
}
const objets = () => (objetsSchema ||= JSON.parse(fs.readFileSync(path.join(RACINE, 'crm/schema.json'), 'utf8')).objets);
/** Nom Monday → adresse (crm/equipe.json, figé le 28 oct.). */
const equipe = () => equipeFixe || (equipeFixe = Object.fromEntries(Object.entries(JSON.parse(fs.readFileSync(path.join(RACINE, 'crm/equipe.json'), 'utf8'))).filter(([k]) => !k.startsWith('_'))));

const majuscule = (s) => s[0].toUpperCase() + s.slice(1);
/** Les champs Personnes d'un objet du schéma, avec leur table de jonction. */
export function champsPersonnes(o) {
  return (o?.champs || []).filter((c) => c.mondayType === 'people').map((c) => {
    const singulier = `${o.nameSingular}${majuscule(c.name)}Membre`;
    return { champ: c.name, label: c.label, mondayColonne: c.mondayColonne, jonction: { nameSingular: singulier, namePlural: `${singulier}Liste` }, inverse: `${c.name}Membres` };
  });
}
export const objetDeJonction = (singulier) => {
  for (const o of objets()) for (const p of champsPersonnes(o)) if (p.jonction.nameSingular === singulier) return { o, p };
  return null;
};

let membresCache = null;
export async function membres() {
  if (membresCache && Date.now() - membresCache.le < 600000) return membresCache.liste;
  const liste = await T.lister('workspaceMembers', { limite: 500 });
  membresCache = { le: Date.now(), liste };
  return liste;
}
export const oublierMembres = () => { membresCache = null; };

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const nomComplet = (m) => [m.name?.firstName, m.name?.lastName].filter(Boolean).join(' ');

/** Pure : les noms d'un texte (« A, B ») → ids de membres ; les noms sans compte restent à part. */
export function idsDesNoms(texte, liste, eq) {
  const ids = [];
  const sans = [];
  for (const nom of String(texte || '').split(/\s*,\s*/).map((x) => x.trim()).filter(Boolean)) {
    const email = norm(eq[nom] || (nom.includes('@') ? nom : ''));
    const m = liste.find((x) => (email && norm(x.userEmail) === email) || norm(nomComplet(x)) === norm(nom));
    if (m && !ids.includes(m.id)) ids.push(m.id);
    else if (!m) sans.push(nom);
  }
  return { ids, sans };
}

/** Pure : les membres → le texte, sous le nom qu'ils portaient dans Monday (ce que Monday et Klocka relisent). */
export function texteDesIds(ids, liste, eq) {
  const parEmail = new Map(Object.entries(eq).map(([nom, email]) => [norm(email), nom]));
  return ids.map((id) => liste.find((x) => x.id === id)).filter(Boolean).map((m) => parEmail.get(norm(m.userEmail)) || nomComplet(m) || m.userEmail).join(', ');
}

// Les liens d'une fiche : la table de jonction a deux relations, « fiche » et « membre ».
async function liens(o, p, ficheId) {
  return T.lister(p.jonction.namePlural, { filtre: `ficheId[eq]:${JSON.stringify(String(ficheId))}` });
}

/** Les membres d'une fiche suivent le texte de son champ Personnes. Les noms sans compte attendent dans le texte. */
export async function accorder(o, p, ficheId, texte) {
  const { ids } = idsDesNoms(texte, await membres(), equipe());
  const actuels = await liens(o, p, ficheId);
  const deja = new Set(actuels.map((l) => l.membreId));
  for (const id of ids) if (!deja.has(id)) await T.creer(p.jonction.namePlural, { ficheId, membreId: id });
  for (const l of actuels) if (!ids.includes(l.membreId)) await T.supprimer(p.jonction.namePlural, l.id);
  return ids;
}

/** Après une écriture dans une fiche Twenty : les membres de chaque champ Personnes écrit suivent son texte. */
export async function apresEcriture(nameSingular, ficheId, valeurs = {}) {
  if (process.env.NODE_TEST_CONTEXT && !branche) return;
  const o = objets().find((x) => x.nameSingular === nameSingular);
  if (!o || !ficheId) return;
  for (const p of champsPersonnes(o)) {
    if (!(p.champ in valeurs)) continue;
    try {
      await accorder(o, p, ficheId, valeurs[p.champ]);
    } catch (e) {
      // Table de jonction pas encore posée (scripts/crm/personnes-twenty.mjs) : le texte suffit en attendant.
      if (!/not found|introuvable|404|400/i.test(e?.message || '')) console.error('[crm] membres :', e?.message || e);
    }
  }
}

/** Une personne a changé les membres d'une fiche dans Sunday CRM : le texte suit, en gardant les noms sans compte. */
export async function texteDesMembres(o, p, ficheId) {
  const liste = await membres();
  const ids = (await liens(o, p, ficheId)).map((l) => l.membreId);
  const fiche = await T.lire(o.namePlural, ficheId);
  const { sans } = idsDesNoms(fiche?.[p.champ], liste, equipe());
  const texte = [texteDesIds(ids, liste, equipe()), ...sans].filter(Boolean).join(', ');
  if ((fiche?.[p.champ] || '') !== texte) await T.modifier(o.namePlural, ficheId, { [p.champ]: texte });
  return { texte, emails: ids.map((id) => liste.find((m) => m.id === id)?.userEmail).filter(Boolean), fiche };
}
