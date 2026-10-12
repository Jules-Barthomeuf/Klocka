// L'agent testeur (10 oct. 2026) : les routes. Lancer un audit sur la page
// que l'on regarde, suivre l'avancement, lire les rapports, arrêter. Équipe
// seulement : chaque audit ouvre un bac à sable et appelle le modèle.

import { ok, wrap, currentUser } from '../contexte.js';
import { Records } from '../db.js';
import { estSuperAdmin } from '../acces-pages.js';

const R = () => import('../testeur/rapport.js');

export function monterTesteur(app) {
  // Réservé aux super admins (12 oct. 2026) : chaque audit ouvre un bac à sable et appelle le modèle.
  const admin = (req, res) => {
    const user = currentUser(req);
    if (user?.role !== 'admin' || !estSuperAdmin(user)) { res.status(403).json({ error: 'Réservé aux super admins.' }); return null; }
    return user;
  };
  const leger = (r) => ({ id: r.id, page: r.page, url: r.url, vue: r.vue, note: r.note, lance_par: r.lance_par, lance_le: r.lance_le, fini_le: r.fini_le, etat: r.etat, avancement: r.avancement, notes: r.notes, variation: r.variation, n_problemes: (r.problemes || []).length, n_bloquants: (r.problemes || []).filter((p) => p.gravite === 'bloquant').length, cout_usd: r.cout_usd ?? null, mail: r.mail || null, erreur: r.erreur || null });

  app.post('/api/testeur/lancer', wrap(async (req, res) => {
    const user = admin(req, res); if (!user) return;
    const Rm = await R();
    const { page, url, vue, note, contexte } = req.body || {};
    const r = Rm.demarrer({ user, page: String(page || '').slice(0, 80), url: String(url || '').slice(0, 500), vue: ['admin', 'mandataire', 'client'].includes(vue) ? vue : 'admin', note, contexte: contexte && typeof contexte === 'object' ? contexte : null });
    if (!r.ok) return res.status(r.code || 400).json({ error: r.error });
    ok(res, r);
  }));
  app.get('/api/testeur/etat', wrap(async (req, res) => {
    const user = admin(req, res); if (!user) return;
    const Rm = await R();
    const vol = Rm.enVol();
    const courant = vol ? Records.get(Rm.RAPPORT, vol.id) : null;
    const dernier = Records.list(Rm.RAPPORT).filter((r) => r.etat !== 'en_cours').sort((a, b) => String(b.lance_le).localeCompare(String(a.lance_le)))[0] || null;
    ok(res, { en_cours: courant ? leger(courant) : null, dernier: dernier ? leger(dernier) : null, aujourdhui: Rm.lancementsDuJour(), plafond: Rm.PLAFOND_JOUR });
  }));
  app.get('/api/testeur/rapports', wrap(async (req, res) => {
    const user = admin(req, res); if (!user) return;
    const Rm = await R();
    ok(res, { rapports: Records.list(Rm.RAPPORT).sort((a, b) => String(b.lance_le).localeCompare(String(a.lance_le))).slice(0, 100).map(leger) });
  }));
  app.get('/api/testeur/rapports/:id', wrap(async (req, res) => {
    const user = admin(req, res); if (!user) return;
    const Rm = await R();
    const r = Records.get(Rm.RAPPORT, req.params.id);
    if (!r) return res.status(404).json({ error: 'Rapport introuvable.' });
    ok(res, { rapport: r });
  }));
  app.post('/api/testeur/rapports/:id/arreter', wrap(async (req, res) => {
    const user = admin(req, res); if (!user) return;
    const Rm = await R();
    Rm.demanderArret(req.params.id);
    ok(res, { ok: true });
  }));
  app.post('/api/testeur/rapports/:id/renvoyer', wrap(async (req, res) => {
    const user = admin(req, res); if (!user) return;
    const Rm = await R();
    const r = Records.get(Rm.RAPPORT, req.params.id);
    if (!r || r.etat !== 'fini') return res.status(404).json({ error: 'Rapport introuvable ou pas fini.' });
    ok(res, { envoi: await Rm.envoyerRapport(r) });
  }));
}
