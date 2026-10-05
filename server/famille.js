// Une famille : plusieurs comptes, chacun avec son adresse et son mot de passe,
// qui voient le même dossier, celui du titulaire. Les autres sont rattachés.
//
// Le rattachement tient en trois champs, repris de Base44 : sur le membre,
// `est_compte_shadow` et `compte_maitre_email` ; sur le titulaire, la liste
// `comptes_lies`. Jusqu'ici seul l'écran les lisait, et le serveur, qui filtre
// par adresse, ne montrait rien au compte rattaché. Ils sont désormais posés
// ici seulement, jamais par le client lui-même (voir CHAMPS_PROTEGES).

import { Records } from './db.js';
import { normEmail } from './contexte.js';
import { creerInvitation } from './clients-invitation.js';

/**
 * Ce qui reste propre à chaque personne. Tout le reste du compte (étape,
 * projet retenu, profil investisseur, budget, dossier bancaire...) est le
 * dossier, et c'est celui du titulaire que voit chaque membre.
 */
const CHAMPS_PERSONNELS = new Set([
  'id', 'email', 'full_name', 'role', 'mot_de_passe', 'mot_de_passe_defini', 'mot_de_passe_defini_le',
  'invitation_jeton', 'invitation_expire_le', 'invite_par', 'invite_le',
  'picture', 'preferences', 'telephone', 'phone',
  'est_compte_shadow', 'compte_maitre_email', 'comptes_lies',
  'created_date', 'updated_date', 'created_by',
  'acces', 'inscrit_le', 'inscription_via', 'promu_client_le', 'promu_par',
]);

const parAdresse = (email) => (email ? Records.findBy('User', 'email', normEmail(email)) : null);

/** Le titulaire dont ce compte voit le dossier, ou null s'il n'est rattaché à personne. */
export function titulaireDe(user) {
  if (!user?.est_compte_shadow || !user.compte_maitre_email) return null;
  const t = parAdresse(user.compte_maitre_email);
  return t && t.id !== user.id ? t : null;
}

/** Le titulaire et ses membres, dans cet ordre ; null pour un compte seul. */
export function familleDe(user) {
  if (!user) return null;
  const titulaire = titulaireDe(user) || user;
  const membres = (titulaire.comptes_lies || [])
    .map(parAdresse)
    .filter((u) => u && u.id !== titulaire.id && normEmail(u.compte_maitre_email) === normEmail(titulaire.email));
  if (!membres.length) return null;
  return { titulaire, membres };
}

const prenomDe = (u) => String(u?.full_name || u?.email?.split('@')[0] || '').trim().split(/\s+/)[0];

/**
 * Le compte tel que la personne le voit : son identité, le dossier du
 * titulaire. Ajoute `famille` (les prénoms, le sien d'abord) pour l'accueil.
 */
export function vueDuCompte(user) {
  if (!user) return user;
  const f = familleDe(user);
  if (!f) return user;
  const tous = [f.titulaire, ...f.membres];
  const famille = {
    titulaire_id: f.titulaire.id,
    titulaire_nom: f.titulaire.full_name || f.titulaire.email,
    prenoms: [user, ...tous.filter((u) => u.id !== user.id)].map(prenomDe).filter(Boolean),
  };
  if (f.titulaire.id === user.id) return { ...user, famille };
  const dossier = Object.fromEntries(Object.entries(f.titulaire).filter(([k]) => !CHAMPS_PERSONNELS.has(k)));
  const personnel = Object.fromEntries(Object.entries(user).filter(([k]) => CHAMPS_PERSONNELS.has(k)));
  return { ...dossier, ...personnel, famille };
}

/**
 * Une modification faite par un membre : ce qui touche au dossier va chez le
 * titulaire, ce qui est à lui reste chez lui. Le patch arrive déjà nettoyé
 * des champs protégés.
 * @returns {object} le compte mis à jour, vu par la personne
 */
export function ecrireCompte(user, patch) {
  const t = titulaireDe(user);
  if (!t) return Records.update('User', user.id, patch);
  const aLui = {};
  const auDossier = {};
  for (const [k, v] of Object.entries(patch || {})) (CHAMPS_PERSONNELS.has(k) ? aLui : auDossier)[k] = v;
  if (Object.keys(auDossier).length) Records.update('User', t.id, auDossier);
  const maj = Object.keys(aLui).length ? Records.update('User', user.id, aLui) : Records.get('User', user.id);
  return vueDuCompte(maj);
}

const estClient = (u) => u && u.role !== 'admin' && u.role !== 'mandataire';

/** Retire un membre de sa famille : il retrouve son propre dossier. */
export function delier(membreId) {
  const m = Records.get('User', membreId);
  if (!m) return { ok: false, error: 'Compte introuvable.' };
  const t = parAdresse(m.compte_maitre_email);
  if (t) Records.update('User', t.id, { comptes_lies: (t.comptes_lies || []).filter((e) => normEmail(e) !== normEmail(m.email)) });
  Records.update('User', m.id, { est_compte_shadow: false, compte_maitre_email: null });
  return { ok: true };
}

/**
 * Rattache des comptes au dossier d'un titulaire. Un membre déjà rattaché
 * ailleurs change de famille ; un membre qui était lui-même titulaire emmène
 * les siens.
 */
export function lier(titulaireId, membreIds = []) {
  const t = Records.get('User', titulaireId);
  if (!estClient(t)) return { ok: false, error: 'Le titulaire doit être un compte client.' };
  if (titulaireDe(t)) {
    return { ok: false, error: `${t.full_name || t.email} voit déjà le dossier d'un autre compte : retirez-le de cette famille d'abord.` };
  }
  const aRattacher = [];
  for (const id of membreIds) {
    if (id === t.id || aRattacher.some((x) => x.id === id)) continue;
    const m = Records.get('User', id);
    if (!estClient(m)) return { ok: false, error: 'Seuls des comptes clients peuvent former une famille.' };
    aRattacher.push(m);
    // Ceux qu'il portait le suivent.
    for (const e of m.comptes_lies || []) {
      const sien = parAdresse(e);
      if (sien && sien.id !== t.id && !aRattacher.some((x) => x.id === sien.id)) aRattacher.push(sien);
    }
  }
  const lies = new Set((t.comptes_lies || []).map(normEmail));
  for (const m of aRattacher) {
    const ancien = parAdresse(m.compte_maitre_email);
    if (ancien && ancien.id !== t.id) {
      Records.update('User', ancien.id, { comptes_lies: (ancien.comptes_lies || []).filter((e) => normEmail(e) !== normEmail(m.email)) });
    }
    Records.update('User', m.id, { est_compte_shadow: true, compte_maitre_email: normEmail(t.email), comptes_lies: [] });
    lies.add(normEmail(m.email));
  }
  Records.update('User', t.id, { comptes_lies: [...lies], est_compte_shadow: false, compte_maitre_email: null });
  return { ok: true, titulaire: Records.get('User', t.id) };
}

/** Choisit un autre titulaire dans la même famille : tous voient désormais son dossier. */
export function changerTitulaire(nouveauId) {
  const n = Records.get('User', nouveauId);
  const f = familleDe(n);
  if (!f) return { ok: false, error: "Ce compte n'est dans aucune famille." };
  if (f.titulaire.id === n.id) return { ok: true };
  const autres = [f.titulaire, ...f.membres].filter((u) => u.id !== n.id).map((u) => u.id);
  Records.update('User', f.titulaire.id, { comptes_lies: [] });
  Records.update('User', n.id, { est_compte_shadow: false, compte_maitre_email: null });
  return lier(n.id, autres);
}

/** Les familles, pour l'onglet de l'admin : titulaire puis membres. */
export function listerFamilles() {
  const users = Records.list('User');
  return users
    .filter((u) => estClient(u) && !u.est_compte_shadow && (u.comptes_lies || []).length)
    .map((t) => familleDe(t))
    .filter(Boolean)
    .map(({ titulaire, membres }) => ({
      titulaire_id: titulaire.id,
      comptes: [titulaire, ...membres].map((u) => ({
        id: u.id,
        full_name: u.full_name || '',
        email: u.email,
        titulaire: u.id === titulaire.id,
        actif: !!u.mot_de_passe,
        etape_actuelle: u.etape_actuelle ?? 0,
      })),
    }));
}

/**
 * Invite une famille d'un coup : chaque ligne reçoit son propre lien. La
 * première est le titulaire. Une adresse déjà active n'a pas de lien à
 * recevoir : elle est simplement rattachée.
 * @param {{membres: {full_name?: string, email: string}[], admin: object, base: string}} p
 */
export function inviterFamille({ membres = [], admin, base }) {
  const lignes = (Array.isArray(membres) ? membres : [])
    .map((m) => ({ full_name: String(m?.full_name || '').trim(), email: normEmail(m?.email) }))
    .filter((m) => m.email);
  if (lignes.length < 2) return { ok: false, error: 'Une famille compte au moins deux adresses.' };
  if (new Set(lignes.map((l) => l.email)).size !== lignes.length) return { ok: false, error: 'La même adresse figure deux fois.' };
  // Avant de créer quoi que ce soit : un compte de l'équipe ne rejoint pas une
  // famille, et le titulaire ne peut pas déjà voir le dossier d'un autre.
  for (const [i, l] of lignes.entries()) {
    const existant = parAdresse(l.email);
    if (existant && !estClient(existant)) return { ok: false, error: `${l.email} est un compte de l'équipe.` };
    if (i === 0 && titulaireDe(existant)) {
      return { ok: false, error: `${l.email} voit déjà le dossier d'un autre compte : retirez-le de cette famille d'abord.` };
    }
  }

  const resultats = [];
  for (const l of lignes) {
    const r = creerInvitation({ email: l.email, full_name: l.full_name, admin, base });
    if (r.ok) {
      resultats.push({ email: r.user.email, full_name: r.user.full_name || '', user_id: r.user.id, lien: r.lien, deja_actif: false });
    } else if (r.user?.mot_de_passe && estClient(r.user)) {
      resultats.push({ email: r.user.email, full_name: r.user.full_name || '', user_id: r.user.id, lien: null, deja_actif: true });
    } else {
      return { ok: false, error: `${l.email} : ${r.error}`, resultats };
    }
  }
  const [titulaire, ...autres] = resultats;
  const liaison = lier(titulaire.user_id, autres.map((r) => r.user_id));
  if (!liaison.ok) return { ok: false, error: liaison.error, resultats };
  return { ok: true, resultats };
}
