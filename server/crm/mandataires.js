// Les mandataires K Partners, un tableau du CRM (6 nov. 2026, Jules : « Mandataires aussi un tableau ; chaque champ,
// c'est une colonne »), comme Utilisateurs (server/crm/utilisateurs.js) : servis depuis Klocka (les comptes, leur
// FicheMandataire, leurs villes), au format de l'écran du CRM. Pour l'équipe seule, dans l'espace Klocka. Ses villes
// se corrigent dans leur colonne (« Lyon, Villeurbanne ») : une ville ajoutée part en lecture comme depuis sa fiche.

import { Records } from '../db.js';
import { choisir } from './utilisateurs.js';

export const SINGULIER = 'mandataires';
const erreur = (status, message) => Object.assign(new Error(message), { status });
const bas = (t) => String(t || '').trim().toLowerCase();
const norm = (t) => bas(t).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

// Les mentions de ses avis de valeur, saisies une fois par Klocka (la fiche de la page Mandataires).
const AVIS = [['nom_avis', 'Nom sur les avis'], ['qualite_avis', 'Qualité'], ['ville_rsac', 'Ville du RSAC'], ['carte_t', 'Carte T : structure et n° CPI'], ['email_avis', 'Email sur les avis'], ['ville_signature', 'Ville de signature']];

export function objet() {
  const champ = (nom, libelle, type, extra = {}) => ({ id: `m-${nom}`, nom, libelle, type, options: [], modifiable: false, colonne: true, ...extra });
  const champs = [
    champ('name', 'Nom', 'TEXT', { modifiable: true }),
    champ('email', 'Adresse mail', 'TEXT'),
    champ('villes', 'Villes', 'TEXT', { modifiable: true }),
    ...AVIS.map(([nom, libelle]) => champ(nom, libelle, 'TEXT', { modifiable: true })),
    champ('alertes', 'Alertes', 'TEXT'),
    champ('createdAt', 'Créé le', 'DATE_TIME'),
  ];
  const colonnes = champs.map((c) => c.nom);
  const vue = (id, nom, filtres = []) => ({ id, nom, colonnes, tri: { champ: 'name', sens: 'asc' }, filtres });
  return {
    singulier: SINGULIER, pluriel: SINGULIER, nom: 'Mandataires', nom_un: 'Mandataire', niveau: 'klocka', klocka: true, principal: 'name',
    champs,
    vues: [vue('m-tout', 'Tout'), vue('m-sans-ville', 'Sans ville', [{ champ: 'villes', op: 'vide' }]), vue('m-alertes', 'À relancer', [{ champ: 'alertes', op: 'non_vide' }])],
    tri: { champ: 'name', sens: 'asc' },
    liees: [],
    deplacer: [],
  };
}

const lignes = async () => {
  const { listerMandataires } = await import('../mandataire-espace.js');
  const comptes = new Map(Records.list('User').map((u) => [bas(u.email), u]));
  const secteurs = Records.list('SecteurMandataire');
  const { villesDuSecteurMandataire } = await import('../villes-secteur.js');
  return Promise.all(listerMandataires().map(async (m) => {
    const u = comptes.get(m.email) || {};
    const s = secteurs.find((x) => bas(x.mandataire_email) === m.email);
    const villes = s ? (await villesDuSecteurMandataire(s)).map((v) => v.nom) : [];
    return {
      id: u.id || m.email, name: m.nom || '', email: m.email, villes: villes.join(', '),
      ...Object.fromEntries(AVIS.map(([c]) => [c, m[c] || ''])),
      alertes: (m.alertes || []).join(' ; '), createdAt: u.created_date || u.cree_le || null,
    };
  }));
};

export async function page(options = {}) {
  const fiches = choisir(await lignes(), { ...options, tri: options.tri || 'name', sens: options.tri ? options.sens : 'asc' });
  return { fiches, liens: {}, suite: null, total: fiches.length };
}

async function uneLigne(id) {
  const l = (await lignes()).find((x) => x.id === id);
  if (!l) throw erreur(404, 'Mandataire introuvable.');
  return l;
}

export async function fiche(id) {
  return { fiche: await uneLigne(id), liens: {}, liees: [], notes: [], taches: [], pieces: [] };
}

/** Pure : les villes ajoutées et retirées d'une liste écrite « Lyon, Villeurbanne ». */
export function differenceVilles(avant = [], texte = '') {
  const voulues = [...new Map(String(texte || '').split(/[,;\n]/).map((v) => v.trim()).filter(Boolean).map((v) => [norm(v), v])).values()];
  const deja = new Set(avant.map((v) => norm(v.nom)));
  const gardees = new Set(voulues.map(norm));
  return { ajouts: voulues.filter((v) => !deja.has(norm(v))), retraits: avant.filter((v) => !gardees.has(norm(v.nom))) };
}

/** Les villes d'un mandataire, tapées « Lyon, Villeurbanne » (ou séparées par « ; ») : ajoutées en lecture, retirées. */
export async function changerVilles(email, saisie, par) {
  const V = await import('../villes-secteur.js');
  const s = V.secteurPour(email);
  const avant = s ? (await V.villesDuSecteurMandataire(s)).map((v) => ({ ...v, cle: V.cleVille(v) })) : [];
  const { ajouts, retraits } = differenceVilles(avant, saisie);
  for (const v of retraits) await V.retirerVille(email, v.cle, par?.email || null);
  for (const nom of ajouts) {
    const r = await V.ajouterVille(email, { nom }, par?.email || null);
    if (!r.ok) throw erreur(400, r.error);
  }
}

export async function changer(par, id, champ, saisie) {
  const l = await uneLigne(id);
  if (champ === 'name') {
    const u = Records.findBy('User', 'email', l.email);
    if (u) Records.update('User', u.id, { full_name: String(saisie || '').trim() || null });
  } else if (champ === 'villes') {
    await changerVilles(l.email, saisie, par);
  } else if (AVIS.some(([c]) => c === champ)) {
    const { poserFicheMandataire } = await import('../mandataire-espace.js');
    const r = poserFicheMandataire(l.email, { [champ]: String(saisie ?? '').trim() }, par);
    if (!r.ok) throw erreur(400, r.error);
  } else throw erreur(403, 'Ce champ ne se modifie pas ici.');
  return { fiche: await uneLigne(id), liens: {} };
}
