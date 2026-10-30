// Le CRUD générique des entités, et son contrôle d accès.
//
// Sorti de index.js, qui portait cent soixante-quatorze routes dans un seul
// fichier de près de trois mille lignes.

import { Records } from '../db.js';
import { filtrerListe, verdictAcces, visiblePar } from '../acces-entites.js';
import { currentUser, normEmail, ok, retirerChampsProteges, sansSecret, wrap } from '../contexte.js';
import { ecrireCompte } from '../famille.js';

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

  // La liste des Projets par pages (30 oct. 2026, Jules : « que les plus récents ») : 20 par page, le plus récent
  // d'abord, la recherche et les archivés filtrés ici ; la page n'envoie plus les centaines de projets d'un coup.
  // Mêmes droits que la liste générique.
  app.get('/api/projets/page', wrap((req, res) => {
    const user = accesEntite(req, res, 'Project');
    if (!user) return;
    const PAR_PAGE = 20;
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const q = String(req.query.q || '').trim().toLowerCase();
    const archives = req.query.archives === '1';
    const statut = String(req.query.statut || 'all');
    const visibles = filtrerListe(user, 'Project', Records.list('Project', { sort: '-created_date' }));
    const gardes = visibles.filter((p) => (archives ? p.archived : !p.archived)
      && (statut === 'all' || p.statut === statut)
      && (!q || [p.titre, p.adresse_complete, p.client_email].some((x) => String(x || '').toLowerCase().includes(q))));
    ok(res, {
      projets: gardes.slice((page - 1) * PAR_PAGE, page * PAR_PAGE),
      total: gardes.length,
      page,
      par_page: PAR_PAGE,
      nb_projets: visibles.length,
      nb_archives: visibles.filter((p) => p.archived).length,
    });
  }));
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
    ok(res, nettoyer(req.params.entity, Records.create(req.params.entity, corps, user?.email)));
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
      if (estAdmin && ['admin', 'user', 'mandataire'].includes(req.body?.role)) { patch.role = req.body.role; if (req.body.role !== 'admin') patch.aussi_mandataire = false; }
    }

    // Un non-admin ne modifie que ce qui le concerne — un projet où il figure,
    // sa propre stratégie. Le contrôle ne visait que les projets : la stratégie
    // et la remarque d'un autre se modifiaient en connaissant leur identifiant.
    const visible = visiblePar(user, entity);
    if (visible) {
      const rec = Records.get(entity, id);
      if (!rec || !visible(rec)) return res.status(404).json({ error: 'Not found' });
    }

    // Son propre compte, pour un membre d'une famille : le dossier va chez le titulaire.
    const rec = estUser(entity) && user.role !== 'admin' ? ecrireCompte(user, patch) : Records.update(entity, id, patch);
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
