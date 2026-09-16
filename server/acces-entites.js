// Qui a le droit de lire et d'écrire quoi, dans le CRUD générique des entités.
//
// Ce fichier existe séparément pour être testable : les règles d'accès sont la
// seule chose de l'application dont une régression ne se voit pas. Une entité
// qui s'ouvre par erreur ne casse aucun écran, ne lève aucune exception, et
// n'apparaît dans aucun journal — elle se contente de répondre à qui demande.
// Le test qui l'accompagne ferme cette porte.

/**
 * Ces entités portent des jetons (sessions, jetons de rafraîchissement Google)
 * ou des gabarits internes : elles ne transitent JAMAIS par le CRUD HTTP, quel
 * que soit le rôle. Les modules serveur y accèdent en direct.
 */
export const ENTITES_INTERDITES = new Set([
  'Session',
  'MailAccount',
  'CodeInscription',
  'TemplateMatrice',
  'MemoireMatrice',
]);

/**
 * Ce qu'un compte non-admin peut atteindre — et rien d'autre.
 *
 * C'était l'inverse jusqu'ici : une liste des entités réservées à l'équipe, et
 * tout le reste ouvert. Chaque nouvelle entité arrivait donc ouverte, et il
 * fallait penser à la fermer. Cinq l'avaient manqué — le journal de marché,
 * l'étude d'implantation, le BODACC, le DVF et les dossiers de documents
 * laissaient lire aux comptes clients les adresses, les loyers, les verdicts
 * et les pièces des dossiers de l'équipe.
 *
 * Sens de lecture : 'lecture' = consultable, jamais modifiable par un client ;
 * 'ecriture' = le client peut aussi créer et modifier, dans la limite du filtre
 * de VISIBILITE qui ne lui montre que ce qui le concerne. Ce qui n'est pas ici
 * est réservé à l'équipe, y compris ce qui sera ajouté demain.
 *
 * @type {Map<string, 'lecture' | 'ecriture'>}
 */
export const ENTITES_CLIENT = new Map([
  ['Project', 'ecriture'],              // filtré : les projets où il figure
  ['User', 'ecriture'],                 // filtré : son propre compte
  ['Suggestion', 'ecriture'],           // filtré : ses propres remarques
  ['Strategy', 'lecture'],              // filtré : sa propre stratégie, écrite par l'équipe
  ['PresentationBancaire', 'lecture'],  // filtré : ses propres présentations
  ['Resource', 'lecture'],              // catalogue commun, en lecture seule
  ['AppSettings', 'lecture'],           // réglages d'affichage, en lecture seule
]);

/**
 * Le verdict d'accès, sans rien connaître d'Express : c'est ce qui le rend
 * testable.
 * @param {{role?: string} | null} user - l'utilisateur résolu, ou null
 * @param {string} entity
 * @param {{ecriture?: boolean}} [opts]
 * @returns {{ok: true} | {ok: false, statut: number, erreur: string}}
 */
export function verdictAcces(user, entity, { ecriture = false } = {}) {
  if (ENTITES_INTERDITES.has(entity)) {
    return { ok: false, statut: 403, erreur: 'Cette entité n’est pas accessible par l’API.' };
  }
  // La garde globale répond déjà 401 en amont ; on ne s'y fie pas. Un compte
  // supprimé pendant que sa session court ne doit pas devenir un utilisateur
  // vide, que le contrôle laisserait passer.
  if (!user) return { ok: false, statut: 401, erreur: 'Not authenticated' };
  if (user.role === 'admin') return { ok: true };

  const droit = ENTITES_CLIENT.get(entity);
  if (!droit) return { ok: false, statut: 403, erreur: 'Réservé aux administrateurs.' };
  if (ecriture && droit !== 'ecriture') {
    return { ok: false, statut: 403, erreur: 'Lecture seule : seule l’équipe peut modifier cette donnée.' };
  }
  return { ok: true };
}

/**
 * Le rattachement d'un enregistrement à un client passe par son adresse. La
 * comparaison est insensible à la casse : une adresse saisie à la main dans
 * l'admin ne s'écrit pas toujours comme celle du compte. Une valeur vide
 * n'appartient à personne — surtout pas au visiteur dont l'email est vide.
 */
export const sienPar = (champ) => (user) => (rec) => {
  const a = String(rec?.[champ] || '').trim().toLowerCase();
  const b = String(user?.email || '').trim().toLowerCase();
  return !!a && !!b && a === b;
};

/** Un non-admin ne voit que les projets où il figure, jamais les archivés. */
export const projetVisiblePar = (user) => (p) =>
  !p.archived &&
  (p.admin_principal === user.email ||
    // Plusieurs collaborateurs peuvent suivre un projet : le principal porte
    // sa carte, les autres y ont les mêmes droits.
    (Array.isArray(p.admins) && p.admins.includes(user.email)) ||
    p.client_email === user.email ||
    (Array.isArray(p.client_emails) && p.client_emails.includes(user.email)) ||
    p.created_by === user.email);

/**
 * Qui voit quoi, pour un compte non-admin. Une entité de ENTITES_CLIENT absente
 * d'ici est visible en entier : ne l'y mettre que si elle est réellement commune
 * à tous (le catalogue de ressources, les réglages d'affichage).
 */
export const VISIBILITE_CLIENT = {
  Project: projetVisiblePar,
  // L'équipe et les mandataires voient la liste des comptes, un client lui-même.
  User: (user) => (u) => ['admin', 'mandataire'].includes(user.role) || u.id === user.id,
  // Une remarque porte un échange de dossier : elle n'appartient qu'à l'équipe
  // et à celui qui l'a écrite.
  Suggestion: sienPar('client_email'),
  Strategy: sienPar('client_email'),
  // Une présentation bancaire porte le plan de financement d'un client : le
  // front la filtrait déjà par adresse, le serveur ne le vérifiait pas.
  PresentationBancaire: sienPar('client_email'),
};

/** Le prédicat de visibilité pour cet utilisateur, ou null si tout est visible. */
export const visiblePar = (user, entity) =>
  user.role === 'admin' ? null : VISIBILITE_CLIENT[entity]?.(user) || null;

/**
 * Applique ce prédicat à une liste. Un seul point de passage : la lecture
 * unitaire et la lecture en liste ne peuvent plus diverger.
 */
export const filtrerListe = (user, entity, data) => {
  const visible = visiblePar(user, entity);
  if (!visible || !Array.isArray(data)) return data;
  return data.filter(visible);
};
