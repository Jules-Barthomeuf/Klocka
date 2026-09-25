// AK, l'assistant de l'équipe dans Google Chat : son état, et un passage à la
// demande. Réservé à l'équipe : rien ici ne parle au chat sans elle.

import { ok, wrap, currentUser } from '../contexte.js';

/** Monte les routes « ak » sur l'application. */
export function monterAk(app) {
  const admin = (req, res) => {
    const user = currentUser(req);
    if (user?.role !== 'admin') { res.status(403).json({ error: 'Réservé à l\'équipe.' }); return null; }
    return user;
  };

  app.get('/api/ak/etat', wrap(async (req, res) => {
    if (!admin(req, res)) return;
    const { etatVeille } = await import('../ak/veille.js');
    ok(res, etatVeille());
  }));

  // Relire le chat tout de suite, sans attendre le passage suivant.
  app.post('/api/ak/relever', wrap(async (req, res) => {
    if (!admin(req, res)) return;
    const { relever } = await import('../ak/veille.js');
    ok(res, await relever());
  }));

  // Ce qu'il a servi, et ce que l'équipe lui a appris.
  app.get('/api/ak/bilan', wrap(async (req, res) => {
    if (!admin(req, res)) return;
    const { bilanAk } = await import('../ak/bilan.js');
    ok(res, bilanAk(Number(req.query.jours) || 30));
  }));
  // Le questionnaire de l'assistant : les questions, et les réponses de la personne connectée.
  app.get('/api/ak/questionnaire', wrap(async (req, res) => {
    const user = admin(req, res);
    if (!user) return;
    const { questionsPubliques, profilDe, consignesDuProfil } = await import('../ak/questionnaire.js');
    const profil = profilDe(user.email);
    ok(res, { questions: questionsPubliques(), reponses: profil?.reponses || {}, maj_le: profil?.maj_le || null, consignes: consignesDuProfil(profil?.reponses || {}) });
  }));
  app.post('/api/ak/questionnaire', wrap(async (req, res) => {
    const user = admin(req, res);
    if (!user) return;
    const { enregistrerProfil } = await import('../ak/questionnaire.js');
    const r = enregistrerProfil(user.email, req.body?.reponses || {});
    if (!r.ok) return res.status(400).json(r);
    ok(res, r);
  }));

  app.get('/api/ak/lecons', wrap(async (req, res) => {
    if (!admin(req, res)) return;
    const { lecons, souvenirs } = await import('../ak/lecons.js');
    ok(res, { lecons: lecons(100), souvenirs: souvenirs(100) });
  }));

  // L'oreille : le navigateur envoie ce qu'il entend, AK relit toutes les
  // quelques minutes. Réservé à l'équipe : personne d'autre n'a de micro ici.
  app.post('/api/ak/oreille', wrap(async (req, res) => {
    const user = admin(req, res);
    if (!user) return;
    const { deposer } = await import('../ak/oreille.js');
    const r = deposer({ texte: req.body?.texte, par: user.full_name || user.email });
    if (!r.ok) return res.status(400).json({ error: r.error });
    ok(res, r);
  }));
  app.get('/api/ak/oreille', wrap(async (req, res) => {
    if (!admin(req, res)) return;
    const { enAttente } = await import('../ak/oreille.js');
    const { Records } = await import('../db.js');
    ok(res, { en_attente: enAttente().length, lectures: Records.list('AkEcouteLecture').slice(0, 20) });
  }));

  // Les espaces où le compte est membre : pour régler AK_ESPACE sans deviner.
  app.get('/api/ak/espaces', wrap(async (req, res) => {
    if (!admin(req, res)) return;
    const { espaces } = await import('../ak/chat.js');
    ok(res, { espaces: await espaces() });
  }));
}
