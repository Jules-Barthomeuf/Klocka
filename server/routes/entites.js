// Le CRUD générique des entités, et son contrôle d accès.
//
// Sorti de index.js, qui portait cent soixante-quatorze routes dans un seul
// fichier de près de trois mille lignes.

import { Records } from '../db.js';
import { filtrerListe, verdictAcces, visiblePar } from '../acces-entites.js';
import { currentUser, normEmail, ok, retirerChampsProteges, sansSecret, wrap } from '../contexte.js';

// L'entité User est traitée à part : ses enregistrements portent l'empreinte du
// mot de passe et le rôle. On les nettoie en lecture, et on interdit d'y
// toucher via ce CRUD générique — le rôle se change entre admins seulement,
// le mot de passe uniquement par son propriétaire.
const estUser = (entity) => entity === 'User';
const nettoyer = (entity, data) =>
  !estUser(entity) ? data : Array.isArray(data) ? data.map(sansSecret) : sansSecret(data);

// Les règles d'accès vivent dans leur propre module, avec leur test : une entité
// qui se rouvre par erreur ne casse aucun écran et n'apparaît dans aucun
// journal. Voir server/acces-entites.js.
//
// Renvoie l'utilisateur, ou null après avoir répondu 401/403.
// @param {boolean} [ecriture] - la requête modifie-t-elle quelque chose ?
function accesEntite(req, res, entity, { ecriture = false } = {}) {
  const user = currentUser(req);
  const verdict = verdictAcces(user, entity, { ecriture });
  if (!verdict.ok) {
    res.status(verdict.statut).json({ error: verdict.erreur });
    return null;
  }
  return user;
}

/** Monte les routes « entities » sur l'application. */
export function monterEntites(app) {
  app.get('/api/entities/:entity', wrap((req, res) => {
    const { entity } = req.params;
    const user = accesEntite(req, res, entity);
    if (!user) return;
    const { sort, limit, skip } = req.query;
    let data = Records.list(entity, {
      sort,
      limit: limit != null ? Number(limit) : undefined,
      skip: skip != null ? Number(skip) : undefined,
    });
    ok(res, nettoyer(entity, filtrerListe(user, entity, data)));
  }));

  app.post('/api/entities/:entity/filter', wrap((req, res) => {
    const { entity } = req.params;
    const user = accesEntite(req, res, entity);
    if (!user) return;
    const { query, sort, limit } = req.body || {};
    let data = Records.filter(entity, query, { sort, limit: limit != null ? Number(limit) : undefined });
    ok(res, nettoyer(entity, filtrerListe(user, entity, data)));
  }));

  app.get('/api/entities/:entity/:id', wrap((req, res) => {
    const user = accesEntite(req, res, req.params.entity);
    if (!user) return;
    const rec = Records.get(req.params.entity, req.params.id);
    if (!rec) return res.status(404).json({ error: 'Not found' });
    // Même réponse qu'un enregistrement inexistant : ne pas révéler l'existence
    // d'un dossier auquel on n'a pas accès.
    const visible = visiblePar(user, req.params.entity);
    if (visible && !visible(rec)) return res.status(404).json({ error: 'Not found' });
    ok(res, nettoyer(req.params.entity, rec));
  }));

  app.post('/api/entities/:entity', wrap((req, res) => {
    const user = accesEntite(req, res, req.params.entity, { ecriture: true });
    if (!user) return;
    if (estUser(req.params.entity) && user?.role !== 'admin') {
      return res.status(403).json({ error: 'Seul un administrateur peut créer un compte.' });
    }
    const corps = estUser(req.params.entity)
      ? { ...retirerChampsProteges(req.body), email: normEmail(req.body?.email), role: req.body?.role === 'admin' ? 'admin' : 'user' }
      : req.body || {};
    const rec = Records.create(req.params.entity, corps, user?.email);
    // Une remarque déposée par l'équipe ouvre un chantier : l'atelier va
    // chercher la cause et proposer une correction en pull request. Il ne
    // répond de rien si la machine n'a pas Claude Code — voir server/atelier.js.
    if (req.params.entity === 'Suggestion') {
      import('../atelier.js')
        .then((m) => m.surNouvelleRemarque(rec, user))
        .catch((e) => console.error('[atelier] remarque non prise :', e.message));
    }
    ok(res, nettoyer(req.params.entity, rec));
  }));

  app.put('/api/entities/:entity/:id', wrap((req, res) => {
    const { entity, id } = req.params;
    const user = accesEntite(req, res, entity, { ecriture: true });
    if (!user) return;
    let patch = req.body || {};

    if (estUser(entity)) {
      const estAdmin = user?.role === 'admin';
      if (!estAdmin && user?.id !== id) {
        return res.status(403).json({ error: 'Vous ne pouvez modifier que votre propre compte.' });
      }
      // Le mot de passe ne passe jamais par ici. Le rôle, seulement entre admins.
      patch = retirerChampsProteges(patch);
      if (estAdmin && (req.body?.role === 'admin' || req.body?.role === 'user')) patch.role = req.body.role;
    }

    // Un non-admin ne modifie que ce qui le concerne — un projet où il figure,
    // sa propre stratégie. Le contrôle ne visait que les projets : la stratégie
    // et la remarque d'un autre se modifiaient en connaissant leur identifiant.
    const visible = visiblePar(user, entity);
    if (visible) {
      const rec = Records.get(entity, id);
      if (!rec || !visible(rec)) return res.status(404).json({ error: 'Not found' });
    }

    const rec = Records.update(entity, id, patch);
    if (!rec) return res.status(404).json({ error: 'Not found' });
    ok(res, nettoyer(entity, rec));
  }));

  app.delete('/api/entities/:entity/:id', wrap(async (req, res) => {
    const user = accesEntite(req, res, req.params.entity, { ecriture: true });
    if (!user) return;
    // La suppression est un geste d'administrateur, quelle que soit l'entité.
    if (user.role !== 'admin') {
      return res.status(403).json({ error: 'Réservé aux administrateurs.' });
    }
    const supprime = Records.delete(req.params.entity, req.params.id);
    // Un projet supprimé libère son dossier : sans cela le dossier reste marqué
    // « projet créé » en pointant un projet disparu, et refuse d'en créer un autre.
    let dossier_libere = null;
    if (req.params.entity === 'Project') {
      const { delierProjet } = await import('../deal/projet.js');
      dossier_libere = delierProjet(req.params.id, user);
    }
    ok(res, { ...(supprime && typeof supprime === 'object' ? supprime : {}), dossier_libere });
  }));
}
