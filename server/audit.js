// Qui a fait quoi, et quand.
//
// L'application manipule les données financières de clients — patrimoine,
// revenus, budgets — et les dossiers de l'équipe. Il n'en restait aucune
// trace : on ne pouvait ni répondre à « qui a supprimé ce projet ? », ni
// constater qu'un compte lisait des dossiers qui ne le concernaient pas.
//
// Ce qui est retenu : les écritures (ce qui change quelque chose) et les
// lectures sensibles (un document déposé, la sauvegarde de la base). Les
// lectures ordinaires ne le sont pas : elles noieraient le reste, et la page
// de suivi les compte déjà.
//
// Ce qui n'est JAMAIS retenu : le corps des requêtes. Un mot de passe, une
// pièce de dossier ou un mail n'ont rien à faire dans un journal qu'on
// consulte à l'écran.

import db from './db.js';
import { randomUUID } from 'crypto';

// Un journal qui grossit sans fin finit par peser plus que la base qu'il
// surveille. Six mois couvrent largement ce à quoi il sert : remonter un
// incident, répondre à une question sur un dossier.
const RETENTION_JOURS = 180;

/** Les chemins dont la simple lecture mérite une trace. */
const LECTURES_SENSIBLES = [
  /^\/api\/admin\/sauvegarde$/, // toute la base part dans un fichier
  /^\/uploads\//, // un bail, une quittance, une photo de dossier
];

const estEcriture = (methode) => methode !== 'GET' && methode !== 'HEAD' && methode !== 'OPTIONS';

/**
 * Faut-il garder une trace de cette requête ?
 * @param {string} methode
 * @param {string} chemin
 * @param {number} [statut] - connu seulement une fois la réponse partie
 */
export function aTracer(methode, chemin, statut = 0) {
  // Le journal de navigation et le journal lui-même ne s'auto-alimentent pas.
  if (chemin.startsWith('/api/journal/') || chemin.startsWith('/api/monitoring/audit')) return false;
  if (!chemin.startsWith('/api/') && !chemin.startsWith('/uploads/')) return false;
  if (estEcriture(methode)) return true;
  // Une lecture refusée est le signal le plus utile du journal : un compte qui
  // sonde une surface qui ne le concerne pas répète des 401 et des 403.
  if (statut >= 400) return true;
  return LECTURES_SENSIBLES.some((re) => re.test(chemin));
}

const inserer = db.prepare(
  'INSERT INTO audit (id, le, email, role, methode, chemin, statut, ip) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
);

/**
 * Le middleware. Il écrit une fois la réponse partie : le journal ne doit
 * jamais retarder ni faire échouer ce que l'utilisateur demandait.
 * @param {(req: object) => object|null} resoudreUtilisateur
 */
export function journaliser(resoudreUtilisateur) {
  return (req, res, next) => {
    // Le chemin est relevé MAINTENANT, pas à la fin. Express réécrit `req.url`
    // en entrant dans un middleware monté sur un préfixe : au moment où la
    // réponse se termine, « /uploads/bail.pdf » est devenu « /bail.pdf », et
    // la trace se perdait exactement sur les documents qu'on voulait suivre.
    // Sans la chaîne de requête : elle porte parfois une adresse ou un nom de
    // dossier, et le chemin suffit à dire ce qui a été fait.
    const chemin = req.path;
    const methode = req.method;
    const ip = (req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim() || null;

    res.on('finish', () => {
      try {
        if (!aTracer(methode, chemin, res.statusCode)) return;
        const user = resoudreUtilisateur(req);
        inserer.run(
          randomUUID(),
          new Date().toISOString(),
          user?.email || null,
          user?.role || null,
          methode,
          chemin,
          res.statusCode,
          ip
        );
      } catch (e) {
        // Un journal qui casse ne doit pas casser l'application.
        console.warn('[audit]', e?.message || e);
      }
    });
    next();
  };
}

/**
 * Les dernières entrées, de la plus récente à la plus ancienne.
 * @param {{limite?: number, email?: string, depuisJours?: number}} [opts]
 */
export function lireAudit({ limite = 200, email = null, depuisJours = 30 } = {}) {
  const depuis = new Date(Date.now() - depuisJours * 86400000).toISOString();
  const n = Math.min(1000, Math.max(1, Number(limite) || 200));
  return email
    ? db.prepare('SELECT * FROM audit WHERE le >= ? AND email = ? ORDER BY le DESC LIMIT ?').all(depuis, email, n)
    : db.prepare('SELECT * FROM audit WHERE le >= ? ORDER BY le DESC LIMIT ?').all(depuis, n);
}

/** Ce que le journal a vu, par personne, sur la période. */
export function resumeAudit({ depuisJours = 30 } = {}) {
  const depuis = new Date(Date.now() - depuisJours * 86400000).toISOString();
  return db
    .prepare(
      `SELECT email, role, COUNT(*) AS actions,
              SUM(CASE WHEN statut >= 400 THEN 1 ELSE 0 END) AS refus,
              MAX(le) AS derniere
       FROM audit WHERE le >= ? GROUP BY email, role ORDER BY actions DESC`
    )
    .all(depuis);
}

/** Purge les entrées au-delà de la rétention. Appelée au démarrage. */
export function purgerAudit() {
  const limite = new Date(Date.now() - RETENTION_JOURS * 86400000).toISOString();
  const r = db.prepare('DELETE FROM audit WHERE le < ?').run(limite);
  return r.changes;
}
