// L'Intelligence (spec MVP du 14 oct. 2026) : les routes de la page Intelligence et des onglets Historique.
// Réservé à l'équipe ; seul Jules valide (les super-admins).

import fs from 'fs';
import { currentUser, ok, wrap, upload } from '../contexte.js';

const C = () => import('../layer.js');

export function monterLayer(app) {
  // L'ancienne adresse de l'API (« Cerveau », jusqu'au 15 oct. 2026) reste servie : elle mène aux mêmes routes.
  app.use((req, res, next) => { if (req.url === '/api/cerveau' || req.url.startsWith('/api/cerveau/')) req.url = `/api/layer${req.url.slice(12)}`; next(); });
  const equipe = (req, res) => {
    const user = currentUser(req);
    if (user?.role !== 'admin') { res.status(403).json({ error: 'Réservé à l\'équipe.' }); return null; }
    return user;
  };
  // Phase 4 : le validateur d'un fait est l'auteur de sa source (appel, débrief) ou Jules (le reste) ; Jules valide tout.
  const Y = () => import('../layer-cycle.js');
  // Relancer une extraction, importer les appels : Jules seul.
  const jules = async (req, res) => {
    const user = equipe(req, res);
    if (!user) return null;
    if (!(await C()).peutValider(user)) { res.status(403).json({ error: 'Réservé à Jules.' }); return null; }
    return user;
  };
  const valideurDe = async (req, res, faitId) => {
    const user = equipe(req, res);
    if (!user) return null;
    const { Records } = await import('../db.js');
    const f = Records.get('CerveauFait', faitId);
    if (!f) { res.status(404).json({ error: 'Fait introuvable.' }); return null; }
    if (!(await Y()).peutValiderFait(user, f)) { res.status(403).json({ error: 'Ce fait revient à un autre validateur.' }); return null; }
    return user;
  };

  app.get('/api/layer/etat', wrap(async (req, res) => {
    const user = equipe(req, res); if (!user) return;
    const M = await C();
    const lots = await M.aValider(user);
    ok(res, { a_valider: lots.reduce((n, l) => n + l.faits.length, 0), a_valider_tous: M.nombreAValider(), peut_valider: true, tout_voir: M.peutValider(user), mesures: M.mesures(), manuel: (await Y()).partManuelle() });
  }));
  app.get('/api/layer/a-valider', wrap(async (req, res) => { const user = equipe(req, res); if (!user) return; ok(res, { lots: await (await C()).aValider(user) }); }));
  // `?tous=1` : les rejetés aussi (onglet Faits, filtre statut).
  app.get('/api/layer/faits', wrap(async (req, res) => { if (!equipe(req, res)) return; ok(res, { faits: (await C()).tousLesFaits({ rejetes: req.query.tous === '1' }) }); }));
  // Phase 7 : les indicateurs de la page et leurs courbes.
  app.get('/api/layer/tableau', wrap(async (req, res) => { if (!equipe(req, res)) return; ok(res, await (await Y()).tableauDeBord({ jours: Math.min(90, Math.max(7, Number(req.query.jours) || 30)) })); }));
  app.get('/api/layer/savoir', wrap(async (req, res) => { if (!equipe(req, res)) return; ok(res, { faits: (await C()).savoir() }); }));
  app.get('/api/layer/sources', wrap(async (req, res) => { if (!equipe(req, res)) return; ok(res, { sources: (await C()).sources() }); }));
  app.get('/api/layer/sources/:id', wrap(async (req, res) => {
    if (!equipe(req, res)) return;
    const s = (await C()).source(req.params.id);
    if (!s) return res.status(404).json({ error: 'Source introuvable.' });
    ok(res, { source: s });
  }));
  app.get('/api/layer/historique/:type/:id', wrap(async (req, res) => {
    if (!equipe(req, res)) return;
    ok(res, { faits: (await C()).historique(req.params.type, req.params.id) });
  }));
  app.get('/api/layer/candidats', wrap(async (req, res) => {
    if (!equipe(req, res)) return;
    ok(res, { candidats: (await C()).candidatsPour(String(req.query.type || ''), String(req.query.q || ''), { limite: 8 }) });
  }));

  // Une source collée ou déposée (compte rendu) : le journal brut, puis l'extraction.
  app.post('/api/layer/sources', upload.single('fichier'), wrap(async (req, res) => {
    const user = equipe(req, res); if (!user) return;
    let contenu = String(req.body?.contenu || '');
    let titre = req.body?.titre || null;
    if (req.file) {
      try {
        const buffer = fs.readFileSync(req.file.path);
        if (/^text\/|\.(txt|md|vtt|srt)$/i.test(`${req.file.mimetype} ${req.file.originalname}`)) contenu = buffer.toString('utf8');
        else contenu = String((await (await import('../deal/ingest.js')).ingerer({ buffer, filename: req.file.originalname, mimetype: req.file.mimetype }))?.texte || '');
        titre = titre || req.file.originalname;
      } catch (e) {
        return res.status(400).json({ error: `Fichier illisible : ${e?.message || e}` });
      }
    }
    const M = await C();
    const s = M.ajouterSource({ type: 'compte_rendu', auteur: user.email, date: req.body?.date || null, titre, contenu, lien_original: req.body?.lien_original || null });
    if (!s.ok) return res.status(400).json({ error: s.error });
    if (s.deja) return ok(res, { source_id: s.source.id, deja: true });
    const r = await M.extraire(s.source.id);
    ok(res, { source_id: s.source.id, ...r });
  }));
  app.post('/api/layer/sources/:id/extraire', wrap(async (req, res) => {
    if (!(await jules(req, res))) return;
    ok(res, await (await C()).extraire(req.params.id));
  }));
  app.post('/api/layer/importer-appels', wrap(async (req, res) => {
    if (!(await jules(req, res))) return;
    ok(res, (await C()).importerAppelsGardes());
  }));

  // Phase 5 : ce qu'on sait d'une fiche (synthèse, engagements, derniers faits), les synthèses, une régénération à la main (Jules).
  const SY = () => import('../layer-syntheses.js');
  app.get('/api/layer/fiches/:type/:id', wrap(async (req, res) => { if (!equipe(req, res)) return; ok(res, (await SY()).ficheLayer(req.params.type, req.params.id)); }));
  // Phase 6 : les branchements (pré-analyse, matching investisseur, Ma journée).
  app.get('/api/layer/deja-su/:dealId', wrap(async (req, res) => { if (!equipe(req, res)) return; const r = await (await SY()).dejaSu(req.params.dealId, Number(req.query.lot) || 0); return r.ok ? ok(res, r) : res.status(404).json({ error: r.error }); }));
  app.get('/api/layer/investisseurs/:email', wrap(async (req, res) => { if (!equipe(req, res)) return; ok(res, (await SY()).ficheInvestisseur(req.params.email)); }));
  app.get('/api/layer/journee', wrap(async (req, res) => { const user = equipe(req, res); if (!user) return; ok(res, await (await SY()).journee(user)); }));
  app.get('/api/layer/syntheses', wrap(async (req, res) => {
    if (!equipe(req, res)) return;
    const M = await C();
    ok(res, { syntheses: (await SY()).syntheses().map((s) => ({ ...s, libelle: M.libelleEntite(s.type_entite, s.entite_id) || s.entite_id, lien: M.lienEntite(s.type_entite, s.entite_id) })) });
  }));
  app.post('/api/layer/syntheses/:type/:id/regenerer', wrap(async (req, res) => {
    if (!(await jules(req, res))) return;
    const r = await (await SY()).generer(req.params.type, req.params.id);
    return r.ok ? ok(res, r) : res.status(400).json({ error: r.error });
  }));

  // La validation : valider, corriger, rejeter ; un lot par source.
  app.post('/api/layer/faits/:id', wrap(async (req, res) => {
    const user = await valideurDe(req, res, req.params.id); if (!user) return;
    const action = req.body?.action;
    // Le cycle de vie (phase 4) : remplacer le fait contredit, ou garder les deux.
    if (action === 'remplacer') {
      const r = (await Y()).remplacer(req.params.id, String(req.body?.remplace || ''), { par: user.email });
      return r.ok ? ok(res, r) : res.status(400).json({ error: r.error });
    }
    if (action === 'garder') return ok(res, (await Y()).garderLesDeux(req.params.id, { par: user.email }));
    const r = (await C()).trancher(req.params.id, { ...req.body, par: user.email });
    if (!r.ok) return res.status(400).json({ error: r.error });
    ok(res, r);
  }));
  app.post('/api/layer/sources/:id/valider', wrap(async (req, res) => {
    const user = equipe(req, res); if (!user) return;
    ok(res, await (await C()).validerLot(req.params.id, { par: user.email, user }));
  }));
  // Un engagement tenu, rouvert ou échu à la main : toute l'équipe (c'est un fait du terrain, pas une validation).
  app.post('/api/layer/engagements/:id', wrap(async (req, res) => {
    const user = equipe(req, res); if (!user) return;
    const r = (await Y()).marquerEngagement(req.params.id, String(req.body?.statut || ''), { par: user.email });
    return r.ok ? ok(res, r) : res.status(400).json({ error: r.error });
  }));

  // La question d'une décision sans motif, et sa réponse.
  app.get('/api/layer/questions/:id', wrap(async (req, res) => {
    const user = equipe(req, res); if (!user) return;
    const { Records } = await import('../db.js');
    const q = Records.get('CerveauQuestion', req.params.id);
    if (!q || q.pour !== String(user.email).toLowerCase()) return res.status(404).json({ error: 'Question introuvable.' });
    ok(res, { question: q });
  }));
}
