// Les comptes de la plateforme, un tableau du CRM comme les autres (6 nov. 2026, Jules : « Utilisateurs doit avoir la
// même structure que Clients : le titre, le tableau principal, d'autres tableaux, utilisateurs en cours, en attente ;
// même pour rechercher »). Ce n'est pas un objet de Twenty : les comptes restent dans Klocka (User), servis ici au
// format de l'écran du CRM (server/crm/ecran.js) : ses vues, ses champs, la recherche, les filtres, le tri, la fiche.
// Pour l'équipe seule, dans l'espace Klocka. Se modifient le nom, et les rôles (Admin, Mandataire) par un super
// administrateur, avec les règles de la page Utilisateurs (fixerRoles). Les invitations, l'étape (et son projet), le
// détail restent dans Administration > Utilisateurs.

import { Records } from '../db.js';

export const SINGULIER = 'utilisateurs';
const erreur = (status, message) => Object.assign(new Error(message), { status });
const bas = (t) => String(t || '').trim().toLowerCase();
const norm = (t) => bas(t).normalize('NFD').replace(/[̀-ͯ]/g, '');

const ETAPES = ['Compte', 'Acculturation', 'Stratégie', 'Recherche', 'Financement', 'Signature'];
const opt = (valeur, libelle, couleur) => ({ valeur, libelle, couleur });

/** Le tableau tel que l'écran le lit ; les rôles ne se cochent que pour un super administrateur. */
export function objet({ superAdmin = false } = {}) {
  const champ = (nom, libelle, type, extra = {}) => ({ id: `u-${nom}`, nom, libelle, type, options: [], modifiable: false, colonne: true, ...extra });
  const champs = [
    champ('name', 'Nom', 'TEXT', { modifiable: true }),
    champ('email', 'Adresse mail', 'TEXT'),
    champ('type', 'Type', 'SELECT', { options: [opt('CLIENT', 'Client', 'blue'), opt('EQUIPE', 'Équipe', 'turquoise'), opt('MANDATAIRE', 'Mandataire', 'purple')] }),
    champ('statut', 'Statut', 'SELECT', { options: [opt('EN_COURS', 'En cours', 'green'), opt('EN_ATTENTE', 'En attente', 'orange')] }),
    champ('admin', 'Admin', 'BOOLEAN', { modifiable: superAdmin }),
    champ('mandataire', 'Mandataire', 'BOOLEAN', { modifiable: superAdmin }),
    champ('etape', 'Étape', 'SELECT', { options: ETAPES.map((e, i) => opt(String(i), e, 'gray')) }),
    champ('villes', 'Villes', 'TEXT'),
    champ('createdAt', 'Créé le', 'DATE_TIME'),
  ];
  const colonnes = champs.map((c) => c.nom);
  const vue = (id, nom, filtres = []) => ({ id, nom, colonnes, tri: { champ: 'createdAt', sens: 'desc' }, filtres });
  return {
    singulier: SINGULIER, pluriel: SINGULIER, nom: 'Utilisateurs', nom_un: 'Utilisateur', niveau: 'klocka', klocka: true, principal: 'name',
    champs,
    vues: [
      vue('u-tout', 'Tout'),
      vue('u-en-cours', 'En cours', [{ champ: 'statut', op: 'parmi', valeur: ['EN_COURS'] }]),
      vue('u-en-attente', 'En attente', [{ champ: 'statut', op: 'parmi', valeur: ['EN_ATTENTE'] }]),
      vue('u-equipe', 'Équipe', [{ champ: 'type', op: 'parmi', valeur: ['EQUIPE'] }]),
      vue('u-mandataires', 'Mandataires', [{ champ: 'mandataire', op: 'est', valeur: true }]),
    ],
    tri: { champ: 'createdAt', sens: 'desc' },
    liees: [],
    deplacer: [],
  };
}

const estEquipe = (u) => u.role === 'admin' || u.role === 'mandataire' || !!u.aussi_mandataire;
const estMandataire = (u) => u.role === 'mandataire' || (u.role === 'admin' && !!u.aussi_mandataire);

/** Pure : la ligne d'un compte. */
export function ligne(u, secteurs = []) {
  const s = secteurs.find((x) => bas(x.mandataire_email) === bas(u.email));
  const villes = s ? (s.villes_seules ? (s.villes_choisies || []).map((v) => v.nom) : [s.nom]).filter(Boolean).join(', ') : '';
  const etape = Number(u.etape_actuelle ?? 0);
  return {
    id: u.id,
    name: u.full_name || '',
    email: bas(u.email),
    type: estMandataire(u) && u.role !== 'admin' ? 'MANDATAIRE' : estEquipe(u) ? 'EQUIPE' : 'CLIENT',
    // En attente : un client qui n'a pas encore commencé (étape 0), comme la page Utilisateurs.
    statut: !estEquipe(u) && etape === 0 ? 'EN_ATTENTE' : 'EN_COURS',
    admin: u.role === 'admin',
    mandataire: estMandataire(u),
    etape: estEquipe(u) ? null : String(Math.min(Math.max(etape, 0), ETAPES.length - 1)),
    villes: estMandataire(u) ? villes : '',
    createdAt: u.created_date || u.cree_le || null,
  };
}

/** Pure : une ligne passe-t-elle un filtre de l'écran ({ champ, op, valeur }) ? */
export function passe(l, { champ, op, valeur } = {}) {
  const v = l[champ];
  const texte = norm(v);
  switch (op) {
    case 'contient': return !String(valeur || '').trim() || texte.includes(norm(valeur));
    case 'ne_contient_pas': return !String(valeur || '').trim() || !texte.includes(norm(valeur));
    case 'parmi': { const t = (Array.isArray(valeur) ? valeur : [valeur]).filter(Boolean); return !t.length || t.includes(v); }
    case 'hors': { const t = (Array.isArray(valeur) ? valeur : [valeur]).filter(Boolean); return !t.length || !t.includes(v); }
    case 'est': return typeof v === 'boolean' ? v === (valeur === true || valeur === 'true') : !valeur || v === valeur;
    case 'vide': return v == null || v === '';
    case 'non_vide': return !(v == null || v === '');
    case 'avant': return !valeur || (v && String(v) < String(valeur));
    case 'apres': return !valeur || (v && String(v) > String(valeur));
    default: return true;
  }
}

/** Pure : les lignes cherchées, filtrées, triées. */
export function choisir(lignes, { q = '', tri = null, sens = 'asc', filtres = [] } = {}) {
  const t = norm(q);
  const champ = tri || 'createdAt';
  const sensVu = tri ? sens : 'desc';
  return lignes
    .filter((l) => !t || `${norm(l.name)} ${l.email} ${norm(l.villes)}`.includes(t))
    .filter((l) => (Array.isArray(filtres) ? filtres : []).every((f) => passe(l, f || {})))
    .sort((a, b) => {
      const x = a[champ] ?? '';
      const y = b[champ] ?? '';
      const c = typeof x === 'boolean' ? Number(x) - Number(y) : String(x).localeCompare(String(y), 'fr', { numeric: true });
      return sensVu === 'desc' ? -c : c;
    });
}

const lignes = () => {
  const secteurs = Records.list('SecteurMandataire');
  return Records.list('User').filter((u) => u.email).map((u) => ligne(u, secteurs));
};

export function page(options = {}) {
  const fiches = choisir(lignes(), options);
  return { fiches, liens: {}, suite: null, total: fiches.length };
}

export function fiche(id) {
  const u = Records.get('User', id);
  if (!u) throw erreur(404, 'Compte introuvable.');
  return { fiche: ligne(u, Records.list('SecteurMandataire')), liens: {}, liees: [], notes: [], taches: [], pieces: [] };
}

/** Changer le nom, ou un rôle (super administrateur, règles de fixerRoles). */
export async function changer(par, id, champ, saisie) {
  const u = Records.get('User', id);
  if (!u) throw erreur(404, 'Compte introuvable.');
  if (champ === 'name') {
    Records.update('User', id, { full_name: String(saisie || '').trim() || null });
  } else if (champ === 'admin' || champ === 'mandataire') {
    const { fixerRoles } = await import('../equipe.js');
    const avant = ligne(u);
    const oui = saisie === true || saisie === 'true';
    const r = fixerRoles(par, u.email, { admin: champ === 'admin' ? oui : avant.admin, mandataire: champ === 'mandataire' ? oui : avant.mandataire });
    if (!r.ok) throw erreur(r.code || 400, r.error);
  } else throw erreur(403, 'Ce champ ne se modifie pas ici.');
  return { fiche: fiche(id).fiche, liens: {} };
}
