// Les enregistrements d'écran des appels (14 oct. 2026). L'audience de la plateforme est supprimée (6 nov. 2026, Jules).

import fs from 'fs';
import express from 'express';
import { currentUser, ok, wrap } from '../contexte.js';

export function monterAudience(app) {
  // Les enregistrements d'écran : l'analyste dépose le sien, seuls les super-admins les regardent.
  app.post('/api/journal/ecran', express.raw({ type: 'application/octet-stream', limit: '60mb' }), wrap(async (req, res) => {
    const user = currentUser(req);
    if (user?.role !== 'admin') return res.status(403).json({ error: 'Réservé à l\'équipe.' });
    const q = req.query || {};
    const r = (await import('../enregistrements-ecran.js')).deposer({ contenu: req.body, par: user.email, appel_id: q.appel_id || null, agence_id: q.agence_id || null, agent: q.agent || null, debut: q.debut || null, fin: q.fin || null, evenements: q.evenements });
    if (!r.ok) return res.status(400).json({ error: r.error });
    ok(res, r);
  }));
  const superAdmin = async (req, res) => {
    const user = currentUser(req);
    const { estSuperAdmin } = await import('../acces-pages.js');
    if (!estSuperAdmin(user)) { res.status(403).json({ error: 'Réservé à Jules.' }); return null; }
    return user;
  };
  app.get('/api/monitoring/enregistrements', wrap(async (req, res) => {
    if (!(await superAdmin(req, res))) return;
    ok(res, { enregistrements: (await import('../enregistrements-ecran.js')).liste({ appel_id: req.query.appel_id || null }) });
  }));
  app.get('/api/monitoring/enregistrements/:id', wrap(async (req, res) => {
    if (!(await superAdmin(req, res))) return;
    const p = (await import('../enregistrements-ecran.js')).fichier(req.params.id);
    if (!p) return res.status(404).json({ error: 'Enregistrement introuvable ou effacé (30 jours).' });
    // La taille annoncée : un fichier coupé en route se voit tout de suite, au lieu d'un JSON tronqué (« illisible »).
    let taille;
    try { taille = fs.statSync(p).size; } catch { return res.status(404).json({ error: 'Enregistrement introuvable ou effacé (30 jours).' }); }
    res.set({ 'Content-Type': 'application/json', 'Content-Encoding': 'gzip', 'Content-Length': String(taille), 'Cache-Control': 'private, max-age=3600' });
    fs.createReadStream(p).on('error', () => res.destroy()).pipe(res);
  }));
}
