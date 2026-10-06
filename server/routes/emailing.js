// L'emailing (page Emailing) : campagnes, séquences, contacts, templates,
// statistiques, et le panneau AK. Réservé à l'équipe, sauf la désinscription
// (le lien en pied de chaque email marketing) et le webhook de Resend
// (vérifié par sa signature).

import fs from 'fs';
import { ok, wrap, currentUser, upload } from '../contexte.js';

const E = () => import('../emailing/index.js');
const K = () => import('../emailing/contacts.js');
const C = () => import('../emailing/campagnes.js');
const T = () => import('../emailing/templates.js');
const S = () => import('../emailing/stats.js');
const IA = () => import('../emailing/ia.js');

/** Monte les routes « emailing » sur l'application. */
export function monterEmailing(app) {
  const admin = (req, res) => {
    const user = currentUser(req);
    if (user?.role !== 'admin') { res.status(403).json({ error: 'Réservé à l\'équipe.' }); return null; }
    return user;
  };
  const refus = (res, r, code = 400) => res.status(code).json({ error: r.error || 'Impossible.' });
  /** Une route d'équipe : vérifie le rôle, appelle, rend le résultat ou le refus. */
  const route = (methode, chemin, fn, { code = 400 } = {}) => app[methode](chemin, wrap(async (req, res) => {
    const user = admin(req, res);
    if (!user) return;
    const r = await fn(req, user);
    if (r == null) return res.status(404).json({ error: 'Introuvable.' });
    if (r.ok === false) return refus(res, r, code);
    ok(res, r);
  }));

  // --- État ---
  route('get', '/api/emailing/etat', async () => {
    const { resendConfigure, EXPEDITEUR } = await import('../emailing/resend.js');
    const { envoiReel, adresseDeTest } = await import('../emailing/envoi.js');
    return { resend: resendConfigure(), expediteur: EXPEDITEUR(), envois: (await E()).envoisRecents(30), auto: !!process.env.RENDER || process.env.EMAILING_AUTO === 'true', reel: envoiReel(), test_to: adresseDeTest() };
  });

  // --- Contacts ---
  route('get', '/api/emailing/contacts', async (req) => {
    const M = await E();
    return { contacts: M.contacts({ liste: req.query.liste || null }), listes: M.listes() };
  });
  route('get', '/api/emailing/contacts/recherche', async (req) => (await K()).rechercher({
    q: req.query.q || '', liste: req.query.liste || null, segment: req.query.segment || null, tag: req.query.tag || null,
    statut: req.query.statut || null, type: req.query.type || null, page: Number(req.query.page) || 1, parPage: Math.min(200, Number(req.query.par_page) || 50),
  }));
  route('get', '/api/emailing/contacts/referentiel', async () => {
    const Mk = await K();
    return { listes: (await E()).listes(), segments: Mk.segments(), tags: Mk.tags(), champs: Mk.champs() };
  });
  route('post', '/api/emailing/contacts/masse', async (req) => (await K()).enMasse(req.body?.ids || [], { action: req.body?.action, valeur: req.body?.valeur ?? null }));
  // L'import en deux temps : l'aperçu et la correspondance des colonnes, puis l'import.
  route('post', '/api/emailing/contacts/analyser', async (req) => (await K()).analyserImport(req.body?.texte));
  route('post', '/api/emailing/contacts/importer', async (req, user) => (req.body?.correspondance
    ? (await K()).importer(req.body.texte, { correspondance: req.body.correspondance, liste: req.body.liste || null, tags: req.body.tags || [], source: req.body.source || 'import', par: user.email })
    : (await E()).importerContacts(req.body?.texte, { liste: req.body?.liste, source: req.body?.source || 'webinaire', par: user.email })));
  // Un fichier Excel devient du CSV, que l'écran montre avant l'import.
  app.post('/api/emailing/contacts/convertir', upload.single('fichier'), wrap(async (req, res) => {
    if (!admin(req, res)) { if (req.file) fs.promises.unlink(req.file.path).catch(() => {}); return; }
    if (!req.file) return res.status(400).json({ error: 'Aucun fichier.' });
    const buffer = fs.readFileSync(req.file.path);
    fs.promises.unlink(req.file.path).catch(() => {});
    try {
      ok(res, await (await E()).excelEnCsv(buffer, req.file.originalname || ''));
    } catch (e) {
      res.status(400).json({ error: e?.message || 'Fichier illisible.' });
    }
  }));
  route('get', '/api/emailing/contacts/:id', async (req) => (await K()).fiche(req.params.id));
  route('post', '/api/emailing/contacts', async (req, user) => (await K()).creerContact(req.body || {}, { par: user.email }));
  route('patch', '/api/emailing/contacts/:id', async (req) => (await K()).modifierContact(req.params.id, req.body || {}));
  route('delete', '/api/emailing/contacts/:id', async (req) => (await E()).supprimerContact(req.params.id), { code: 404 });

  // --- Listes, segments, champs ---
  route('post', '/api/emailing/listes', async (req, user) => (await K()).creerListe(req.body?.nom, user.email));
  route('patch', '/api/emailing/listes/:id', async (req) => (await K()).renommerListe(req.params.id, req.body?.nom));
  route('delete', '/api/emailing/listes/:id', async (req) => (await K()).supprimerListe(req.params.id), { code: 404 });
  route('post', '/api/emailing/segments', async (req, user) => (await K()).enregistrerSegment(req.body || {}, user.email));
  route('patch', '/api/emailing/segments/:id', async (req, user) => (await K()).enregistrerSegment({ ...(req.body || {}), id: req.params.id }, user.email));
  route('delete', '/api/emailing/segments/:id', async (req) => (await K()).supprimerSegment(req.params.id), { code: 404 });
  route('post', '/api/emailing/audience', async (req) => (await K()).compterAudience(req.body || {}));
  route('post', '/api/emailing/champs', async (req) => (await K()).creerChamp(req.body || {}));
  route('delete', '/api/emailing/champs/:id', async (req) => (await K()).supprimerChamp(req.params.id), { code: 404 });

  // --- Campagnes ---
  route('get', '/api/emailing/campagnes', async () => ({ campagnes: (await C()).campagnes() }));
  route('post', '/api/emailing/campagnes', async (req, user) => {
    const tpl = req.body?.template ? (await T()).template(req.body.template) : null;
    return (await C()).creerCampagne({ nom: req.body?.nom, design: tpl?.design || null, objet: tpl?.objet || '', apercu: tpl?.apercu || '' }, user);
  });
  route('get', '/api/emailing/campagnes/:id', async (req) => (await C()).campagne(req.params.id));
  route('patch', '/api/emailing/campagnes/:id', async (req) => {
    const r = (await C()).modifierCampagne(req.params.id, req.body || {});
    return r.ok ? (await C()).campagne(req.params.id) : r;
  });
  route('delete', '/api/emailing/campagnes/:id', async (req) => (await C()).supprimer(req.params.id));
  route('post', '/api/emailing/campagnes/:id/dupliquer', async (req, user) => (await C()).dupliquer(req.params.id, user));
  route('get', '/api/emailing/campagnes/:id/verification', async (req) => (await C()).verification(req.params.id));
  route('post', '/api/emailing/campagnes/:id/test', async (req, user) => {
    const r = await (await C()).envoyerTest(req.params.id, req.body?.a || user.email, { contactId: req.body?.contact_id || null });
    return r.ok ? { ok: true, a: req.body?.a || user.email } : r;
  });
  route('post', '/api/emailing/campagnes/:id/envoyer', async (req) => (await C()).programmer(req.params.id, req.body?.quand || null));
  route('post', '/api/emailing/campagnes/:id/annuler', async (req) => (await C()).annuler(req.params.id));
  route('get', '/api/emailing/campagnes/:id/stats', async (req) => (await S()).deCampagne(req.params.id));

  // --- Séquences ---
  route('get', '/api/emailing/sequences', async () => ({ sequences: (await E()).sequences() }));
  route('post', '/api/emailing/sequences', async (req, user) => (await E()).creerSequence({ nom: req.body?.nom, liste: req.body?.liste, declencheur: req.body?.declencheur || null }, user));
  route('get', '/api/emailing/sequences/:id', async (req) => (await E()).sequence(req.params.id));
  route('patch', '/api/emailing/sequences/:id', async (req) => {
    const M = await E();
    const r = M.modifierSequence(req.params.id, req.body || {});
    return r.ok ? M.sequence(req.params.id) : r;
  }, { code: 404 });
  route('delete', '/api/emailing/sequences/:id', async (req) => (await E()).supprimerSequence(req.params.id), { code: 404 });
  route('post', '/api/emailing/sequences/:id/statut', async (req) => {
    const M = await E();
    const r = M.changerStatut(req.params.id, req.body?.statut);
    return r.ok ? { ...r, sequence: M.sequence(req.params.id) } : r;
  });
  route('post', '/api/emailing/sequences/:id/inscrire', async (req) => (await E()).inscrireContacts(req.params.id, req.body?.ids || []));
  route('post', '/api/emailing/sequences/:id/test', async (req, user) => {
    const r = await (await E()).envoyerTest(req.params.id, req.body?.etape_id, req.body?.a || user.email);
    return r.ok ? { ok: true, a: req.body?.a || user.email } : r;
  });
  route('get', '/api/emailing/sequences/:id/stats', async (req) => (await S()).deSequence(req.params.id));

  // --- Templates (et les mails de la plateforme) ---
  route('get', '/api/emailing/templates', async () => (await T()).templates());
  route('post', '/api/emailing/templates', async (req, user) => (await T()).enregistrer(req.body || {}, user));
  route('patch', '/api/emailing/templates/:id', async (req) => (await T()).modifier(req.params.id, req.body || {}));
  route('delete', '/api/emailing/templates/:id', async (req) => (await T()).supprimer(req.params.id), { code: 404 });
  route('get', '/api/emailing/modeles', async () => ({ modeles: (await E()).modelesPlateforme() }));
  route('patch', '/api/emailing/modeles/:cle', async (req, user) => (await E()).modifierModele(req.params.cle, req.body || {}, user), { code: 404 });
  route('delete', '/api/emailing/modeles/:cle', async (req) => (await E()).retablirModele(req.params.cle));
  route('post', '/api/emailing/modeles/:cle/test', async (req, user) => {
    const prenom = (user.full_name || '').split(' ')[0] || 'Jules';
    const r = await (await E()).envoyerPlateforme(req.params.cle, { a: user.email, vars: { prenom, lien: `${(process.env.APP_URL || '').replace(/\/$/, '')}/Bienvenue`, expediteur: prenom }, repondreA: user.email, testeur: user.email });
    return r.ok ? { ok: true, a: user.email } : r;
  });

  // --- Statistiques ---
  route('get', '/api/emailing/stats', async (req) => {
    const M = await S();
    return { globales: M.globales({ jours: Math.min(365, Number(req.query.jours) || 30) }), ...M.tableau() };
  });

  // --- AK dans l'éditeur ---
  route('post', '/api/emailing/ia/retoucher', async (req, user) => (await IA()).retoucher(req.body || {}, user));
  route('post', '/api/emailing/ia/objets', async (req, user) => (await IA()).objets(req.body || {}, user));
  route('post', '/api/emailing/ia/relire', async (req, user) => (await IA()).relire(req.body || {}, user));

  // --- Le webhook de Resend : public, vérifié par sa signature Svix ---
  app.post('/api/emailing/webhook', wrap(async (req, res) => {
    const W = await import('../emailing/webhook.js');
    const secret = (process.env.RESEND_WEBHOOK_SECRET || '').trim();
    const valable = W.signatureValable({ corps: req.corpsBrut, id: req.headers['svix-id'], timestamp: req.headers['svix-timestamp'], signature: req.headers['svix-signature'], secret });
    if (!valable) return res.status(401).json({ error: 'Signature invalide.' });
    ok(res, W.traiter(req.body, { svixId: req.headers['svix-id'] }));
  }));

  // --- La désinscription : publique, depuis le lien du mail ---
  const desinscrire = wrap(async (req, res) => {
    const r = (await E()).desinscrire(req.params.jeton, req.query?.s || null);
    if (req.method === 'POST') return res.status(r.ok ? 200 : 404).end();
    res.type('html').send(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Klocka</title></head>
<body style="margin:0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f3f4f2;color:#1c1d1c;display:flex;min-height:100vh;align-items:center;justify-content:center">
<div style="max-width:420px;padding:32px;text-align:center"><p style="font-size:20px;margin:0 0 10px">${r.ok ? 'Vous êtes désinscrit.' : 'Lien inconnu.'}</p>
<p style="font-size:14px;color:#6b6f6c;margin:0">${r.ok ? 'Vous ne recevrez plus nos emails.' : 'Ce lien de désinscription ne correspond à aucune adresse.'}</p></div></body></html>`);
  });
  app.get('/api/emailing/desinscription/:jeton', desinscrire);
  app.post('/api/emailing/desinscription/:jeton', desinscrire);
}
