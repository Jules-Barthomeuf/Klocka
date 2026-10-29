// Les offres (lettres d'intention d'achat) : la page Offres les liste, les
// ouvre, les retouche et les télécharge. Réservé à l'équipe.

import { ok, wrap, currentUser } from '../contexte.js';

/** Monte les routes « offres » sur l'application. */
export function monterOffres(app) {
  const admin = (req, res) => {
    const user = currentUser(req);
    if (user?.role !== 'admin') { res.status(403).json({ error: 'Réservé à l\'équipe.' }); return null; }
    return user;
  };
  const O = () => import('../offres.js');

  app.get('/api/offres', wrap(async (req, res) => {
    if (!admin(req, res)) return;
    ok(res, { offres: (await O()).listerLettres() });
  }));

  // Les modèles de lettre, remplis avec une lettre d'exemple (page Modèles de l'administration).
  app.get('/api/offres/exemple', wrap(async (req, res) => {
    if (!admin(req, res)) return;
    ok(res, await (await O()).exempleLettre(req.query.marque));
  }));

  // Un modèle d'exemple en PDF ou en Word, pour voir le fichier tel qu'il part.
  app.get('/api/offres/exemple/fichier', wrap(async (req, res) => {
    if (!admin(req, res)) return;
    const { pdf, docx } = await import('../ak/loi.js');
    const { CHAMPS_EXEMPLE } = await O();
    const brut = { ...CHAMPS_EXEMPLE, modele: req.query.modele === 'menthe' ? 'menthe' : 'classique', marque: req.query.marque === 'kp' ? 'kp' : 'klocka' };
    const word = req.query.format === 'docx';
    const contenu = word ? await docx(brut) : await pdf(brut);
    res.setHeader('Content-Type', word ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="LOI exemple ${brut.marque} ${brut.modele}.${word ? 'docx' : 'pdf'}"`);
    res.send(contenu);
  }));

  // La lettre vierge que la page ouvre à droite du chat ; rien n'est gardé.
  app.get('/api/offres/vierge', wrap(async (req, res) => {
    if (!admin(req, res)) return;
    ok(res, await (await O()).lettreVierge({ deal_id: req.query.deal_id || null, marque: req.query.marque || null }));
  }));

  // Le premier geste dans la lettre vierge la crée, avec ce geste.
  app.post('/api/offres', wrap(async (req, res) => {
    const user = admin(req, res);
    if (!user) return;
    const M = await O();
    const r = await M.creerLettreVierge({ champs: req.body?.champs || null, textes: req.body?.textes || null, styles: req.body?.styles || null, modele: req.body?.modele === undefined ? 'classique' : req.body.modele, deal_id: req.body?.deal_id || null, marque: req.body?.marque || null, user });
    if (!r.ok) return res.status(400).json({ error: r.error });
    ok(res, await M.lireLettre(r.lettre.id, { marque: req.body?.marque || null }));
  }));

  app.get('/api/offres/:id', wrap(async (req, res) => {
    if (!admin(req, res)) return;
    const d = await (await O()).lireLettre(req.params.id, { marque: req.query.marque || null });
    if (!d) return res.status(404).json({ error: 'LOI introuvable.' });
    ok(res, d);
  }));

  app.get('/api/offres/:id/sources', wrap(async (req, res) => {
    if (!admin(req, res)) return;
    const sources = await (await O()).sourcesDe(req.params.id);
    if (!sources) return res.status(404).json({ error: 'LOI introuvable.' });
    ok(res, { sources });
  }));

  app.patch('/api/offres/:id', wrap(async (req, res) => {
    if (!admin(req, res)) return;
    const M = await O();
    const r = M.modifierLettre(req.params.id, { champs: req.body?.champs || null, textes: req.body?.textes || null, styles: req.body?.styles || null, modele: req.body?.modele, conversation_id: req.body?.conversation_id });
    if (!r.ok) return res.status(r.error === 'LOI introuvable.' ? 404 : 400).json({ error: r.error });
    ok(res, await M.lireLettre(req.params.id, { marque: req.query.marque || null }));
  }));

  app.delete('/api/offres/:id', wrap(async (req, res) => {
    if (!admin(req, res)) return;
    const r = (await O()).supprimerLettre(req.params.id);
    if (!r.ok) return res.status(404).json({ error: r.error });
    ok(res, r);
  }));

  app.get('/api/offres/:id/fichier', wrap(async (req, res) => {
    if (!admin(req, res)) return;
    const f = await (await O()).fichierDe(req.params.id, req.query.format === 'docx' ? 'docx' : 'pdf', { marque: req.query.marque || null });
    if (!f) return res.status(404).json({ error: 'LOI introuvable.' });
    res.setHeader('Content-Type', f.type);
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(f.nom)}`);
    res.send(f.contenu);
  }));
}
