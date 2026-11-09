// Le module Emailing (8 nov. 2026, Jules) : automatisations, file à valider, scores MQL et SQL, réponses, oppositions,
// expéditeurs, formulaires, webinaires. Réservé à l'équipe, sauf les formulaires publics.

import { ok, wrap, currentUser } from '../contexte.js';

const A = () => import('../emailing/automatisations.js');
const M = () => import('../emailing/moteur.js');
const J = () => import('../emailing/journal.js');
const P = () => import('../emailing/pilotage.js');
const R = () => import('../emailing/reponses.js');
const S = () => import('../emailing/scores.js');
const C = () => import('../emailing/capture.js');
const X = () => import('../emailing/expediteurs.js');

export function monterModuleEmailing(app) {
  const route = (methode, chemin, fn, { code = 400 } = {}) => app[methode](`/api/emailing/m${chemin}`, wrap(async (req, res) => {
    const user = currentUser(req);
    if (user?.role !== 'admin') return res.status(403).json({ error: 'Réservé à l\'équipe.' });
    (await import('../emailing/departs.js')).initialiser();
    const r = await fn(req, user);
    if (r == null) return res.status(404).json({ error: 'Introuvable.' });
    if (r.ok === false) return res.status(code).json({ error: r.error || 'Impossible.' });
    ok(res, r);
  }));

  // --- Le tableau de bord ---
  route('get', '/tableau', async (req) => (await P()).tableau({ jours: Math.min(365, Number(req.query.jours) || 30) }));
  route('get', '/resultats', async () => ({ automatisations: (await P()).resultats() }));
  route('get', '/moteur', async () => (await M()).etatMoteur());

  // --- Les automatisations ---
  route('get', '/automatisations', async (req) => {
    const Am = await A();
    return { automatisations: Am.liste({ nature: req.query.nature || null }), declencheurs: Am.DECLENCHEURS, sorties: Am.EVENEMENTS_SORTIE };
  });
  route('post', '/automatisations', async (req, user) => (await A()).creer(req.body || {}, user));
  route('get', '/automatisations/:id', async (req) => (await A()).une(req.params.id));
  route('patch', '/automatisations/:id', async (req) => (await A()).modifier(req.params.id, req.body || {}));
  route('delete', '/automatisations/:id', async (req) => (await A()).supprimer(req.params.id));
  route('post', '/automatisations/:id/statut', async (req) => (await A()).changerStatut(req.params.id, req.body?.statut));
  route('post', '/automatisations/:id/dupliquer', async (req, user) => (await A()).dupliquer(req.params.id, user));
  route('post', '/automatisations/:id/inscrire', async (req, user) => (await C()).inscrire(req.params.id, req.body?.ids || [], user));

  // --- À valider ---
  route('get', '/a-valider', async () => ({ lignes: (await P()).fileAValider() }));
  route('post', '/a-valider/valider', async (req, user) => (await M()).valider(req.body?.ids || [], user));
  route('post', '/a-valider/ecarter', async (req, user) => (await M()).ecarter(req.body?.ids || [], user));
  route('patch', '/a-valider/:id', async (req) => (await M()).modifierLigne(req.params.id, req.body || {}));

  // --- Les scores ---
  route('get', '/contacts', async (req) => ({ contacts: (await P()).contactsScores({ stade: req.query.stade || null, q: String(req.query.q || ''), limite: Math.min(500, Number(req.query.limite) || 200) }), repartition: (await S()).repartition() }));
  route('get', '/contacts/:id', async (req) => (await P()).ficheContact(req.params.id));
  route('get', '/fiche', async (req) => (await P()).ficheParEmail(String(req.query.email || '')));
  route('get', '/bareme', async () => ({ bareme: (await S()).bareme(), defaut: (await S()).BAREME_DEFAUT }));
  route('put', '/bareme', async (req) => {
    const Sm = await S();
    const r = Sm.poserBareme(req.body || {});
    return { ...r, recalcules: Sm.toutRecalculer() };
  });

  // --- Les réponses ---
  route('get', '/reponses', async (req) => ({ reponses: (await R()).reponses({ statut: String(req.query.statut || 'a_traiter') }) }));
  route('post', '/reponses/:id/traiter', async (req) => (await R()).traiter(req.params.id, req.body?.statut));
  route('post', '/reponses/:id/ne-plus-ecrire', async (req, user) => (await R()).nePlusEcrire(req.params.id, user));

  // --- Les oppositions ---
  route('get', '/oppositions', async (req) => ({ oppositions: (await J()).oppositions({ q: String(req.query.q || '') }) }));
  route('post', '/oppositions', async (req, user) => (await J()).poserOpposition(req.body?.email, { motif: 'equipe', source: 'ecran', par: user.email }));
  route('delete', '/oppositions/:email', async (req, user) => (await J()).leverOpposition(req.params.email, user.email));

  // --- Les expéditeurs ---
  route('get', '/expediteurs', async () => (await X()).tableau());
  route('put', '/expediteurs/:email', async (req) => (await X()).poserPlafond(req.params.email, req.body?.plafond));

  // --- Les formulaires et les webinaires ---
  route('get', '/formulaires', async () => ({ formulaires: (await C()).formulaires() }));
  route('post', '/formulaires', async (req, user) => (await C()).creerFormulaire(req.body || {}, user));
  route('patch', '/formulaires/:id', async (req) => (await C()).modifierFormulaire(req.params.id, req.body || {}));
  route('delete', '/formulaires/:id', async (req) => (await C()).supprimerFormulaire(req.params.id));
  route('get', '/webinaires', async () => ({ webinaires: (await C()).webinaires() }));
  route('post', '/webinaires', async (req, user) => (await C()).creerWebinaire(req.body || {}, user));
  route('patch', '/webinaires/:id', async (req) => (await C()).modifierWebinaire(req.params.id, req.body || {}));
  route('post', '/webinaires/:id/inscrits', async (req) => (await C()).importerInscrits(req.params.id, req.body?.texte));
  route('post', '/webinaires/:id/presence', async (req) => (await C()).noterPresence(req.params.id, req.body?.texte));

  // --- Une vue du CRM devient une liste ---
  route('post', '/vue-crm', async (req, user) => (await C()).importerVue(user.email, req.body || {}));

  // --- Les formulaires publics ---
  app.get('/api/emailing/public/f/:slug', wrap(async (req, res) => {
    const f = (await C()).formulairePublic(req.params.slug);
    return f ? ok(res, f) : res.status(404).json({ error: 'Ce formulaire n\'est plus ouvert.' });
  }));
  app.post('/api/emailing/public/f/:slug', wrap(async (req, res) => {
    const r = (await C()).soumettre(req.params.slug, req.body || {}, { ip: req.ip });
    res.status(r.ok ? 200 : 400).json(r.ok ? r : { error: r.error });
  }));
}
