// Off-market (10 oct. 2026) : les routes. L'équipe voit toutes les villes
// lues ; un mandataire K Partners celles de son secteur, avec son propre
// pipeline. Les deux passent par /api/off-market, le rôle décide de l'espace.

import { ok, wrap, currentUser } from '../contexte.js';

const L = () => import('../off-market/locaux.js');
const S = () => import('../off-market/suivi.js');

export function monterOffMarket(app) {
  const compte = (req, res) => {
    const user = currentUser(req);
    if (!['admin', 'mandataire'].includes(user?.role)) { res.status(403).json({ error: 'Réservé à l\'équipe et aux mandataires K Partners.' }); return null; }
    return user;
  };
  const rendre = (res, r) => (r?.ok ? ok(res, r) : res.status(/introuvable/i.test(r?.error || '') ? 404 : 400).json({ error: r?.error || 'Impossible.' }));
  const villesDe = async (user) => new Set((await (await L()).territoiresDe(user)).map((v) => v.id));

  // Les territoires, et ce qu'il y a à faire aujourd'hui.
  app.get('/api/off-market', wrap(async (req, res) => {
    const user = compte(req, res); if (!user) return;
    const Lm = await L(); const Sm = await S();
    const espace = Sm.espaceDe(user);
    ok(res, { espace, territoires: await Lm.territoiresDe(user), aujourdhui: Sm.aujourdhui(espace), statuts: Sm.LIBELLES_STATUTS, familles: (await import('../off-market/scores.js')).FAMILLES });
  }));

  // Lire une nouvelle ville : la ville est créée si besoin, puis la lecture
  // part en tâche de fond (rues classées, vitrines, propriétaires) ; l'écran
  // suit l'avancement sur le territoire. Un mandataire peut lancer une ville : elle rejoint ses territoires.
  // Les communes qui ressemblent à ce qu'on tape (Base adresse nationale), pour choisir sans faute de frappe.
  app.get('/api/off-market/communes', wrap(async (req, res) => {
    const user = compte(req, res); if (!user) return;
    const q = String(req.query.q || '').trim();
    if (q.length < 2) return ok(res, { communes: [] });
    try {
      const r = await fetch(`https://api-adresse.data.gouv.fr/search/?type=municipality&limit=6&q=${encodeURIComponent(q)}`, { signal: AbortSignal.timeout(8000) });
      const j = r.ok ? await r.json() : { features: [] };
      ok(res, { communes: (j.features || []).map((f) => ({ nom: f.properties.city || f.properties.name, code_postal: f.properties.postcode || null, code_insee: f.properties.citycode || null, contexte: f.properties.context || null })) });
    } catch { ok(res, { communes: [] }); }
  }));
  app.post('/api/off-market/territoires', wrap(async (req, res) => {
    const user = compte(req, res); if (!user) return;
    const { creerVille } = await import('../alx/index.js');
    const { lancer } = await import('../alx/parcours.js');
    const r = creerVille({ nom: req.body?.nom, code_postal: req.body?.code_postal || null, user });
    if (!r.ok) return res.status(400).json({ error: r.error });
    const l = lancer(r.ville.id, { user, tout: true });
    if (!l.ok) return res.status(409).json({ error: l.error });
    const Lm = await L();
    ok(res, { territoire: { id: r.ville.id, nom: r.ville.nom, deja: !!r.deja, lecture: Lm.lectureDe(l.ville) } });
  }));
  app.post('/api/off-market/territoires/:id/arreter', wrap(async (req, res) => {
    const user = compte(req, res); if (!user) return;
    const { arreter } = await import('../alx/parcours.js');
    const r = arreter(req.params.id);
    if (!r.ok) return res.status(409).json({ error: r.error });
    ok(res, { ok: true });
  }));

  // Le mode Simple (11 oct. 2026) : les commerces d'une ville, leurs propriétaires en fond, une adresse précise, les appels.
  const Si = () => import('../off-market/simple.js');
  // Les clients pour la ville affichée (24 oct. 2026, Jules : « on cherche en fonction des clients qu'on a ») : les
  // demandes visibles des mandataires, anonymisées, et pour chacune si sa zone couvre la ville (ville, département,
  // région). Les commerces qui lui répondent se trient à l'écran (src/lib/clients-commerces.js).
  app.get('/api/off-market/simple/villes/:id/clients', wrap(async (req, res) => {
    const user = compte(req, res); if (!user) return;
    const visibles = await villesDe(user);
    if (!visibles.has(req.params.id)) return res.status(404).json({ error: 'Ville introuvable.' });
    const { Records } = await import('../db.js');
    const v = Records.get('Ville', req.params.id);
    const { demandesVisibles } = await import('../mandataire-espace.js');
    const { geoDe, zoneCouvre } = await import('../mandataire-agent.js');
    const lieu = { ville: v?.nom || '', ...(v?.nom ? await geoDe(v.nom) : {}) };
    const clients = demandesVisibles().map((d) => {
      const zones = (d.zones || []).filter((z) => !/toute la france|^france$/i.test(z));
      const zone = zones.find((z) => zoneCouvre(z, lieu)) || null;
      return { ...d, couvre: !zones.length || !!zone, zone_couverte: zone };
    });
    ok(res, { ville: v?.nom || null, clients });
  }));
  app.get('/api/off-market/simple/villes/:id', wrap(async (req, res) => {
    const user = compte(req, res); if (!user) return;
    if (!(await villesDe(user)).has(req.params.id)) return res.status(404).json({ error: 'Ville introuvable.' });
    const S2 = await Si();
    const lecture = await S2.lireVilleSimple(req.params.id, { forcer: req.query.relire === '1' });
    if (!lecture.ok) return res.status(400).json({ error: lecture.error });
    if (!lecture.deja || S2.etatDe(req.params.id).a_faire) S2.demarrerFond(req.params.id);
    S2.demarrerPrix(req.params.id);
    ok(res, { commerces: S2.commercesDe(req.params.id, { moi: String(user.email || '').toLowerCase() }), etat: S2.etatDe(req.params.id), lecture });
  }));
  app.get('/api/off-market/simple/villes/:id/etat', wrap(async (req, res) => {
    const user = compte(req, res); if (!user) return;
    const S2 = await Si();
    ok(res, { commerces: S2.commercesDe(req.params.id, { moi: String(user.email || '').toLowerCase() }), etat: S2.etatDe(req.params.id) });
  }));
  app.get('/api/off-market/simple/commerces/:id', wrap(async (req, res) => {
    const user = compte(req, res); if (!user) return;
    const S2 = await Si();
    const { Records } = await import('../db.js');
    let c = Records.get(S2.COMMERCE, req.params.id);
    if (!c) return res.status(404).json({ error: 'Commerce introuvable.' });
    if (!c.contact_le) c = await S2.coordonnees(c.id);
    ok(res, { commerce: S2.fiche(c, { moi: String(user.email || '').toLowerCase() }) });
  }));
  app.post('/api/off-market/simple/commerces/:id/approfondir', wrap(async (req, res) => {
    const user = compte(req, res); if (!user) return;
    const S2 = await Si();
    const { ouvrirFlux } = await import('../flux.js');
    const flux = ouvrirFlux(res);
    try { const c = await S2.resoudreCommerce(req.params.id, { complet: true, surEtape: flux.etape }); flux.fin({ commerce: c ? S2.fiche(c, { moi: String(user.email || '').toLowerCase() }) : null }); } catch (e) { flux.erreur(e); }
  }));
  app.post('/api/off-market/simple/adresse', wrap(async (req, res) => {
    const user = compte(req, res); if (!user) return;
    const S2 = await Si();
    const { ouvrirFlux } = await import('../flux.js');
    const flux = ouvrirFlux(res);
    try { flux.fin(await S2.chercherAdresse(String(req.body?.adresse || '').slice(0, 200), { surEtape: flux.etape })); } catch (e) { flux.erreur(e); }
  }));
  app.post('/api/off-market/simple/commerces/:id/reponse', wrap(async (req, res) => {
    const user = compte(req, res); if (!user) return;
    const S2 = await Si(); const Sm = await S();
    rendre(res, S2.noterReponse(Sm.espaceDe(user), req.params.id, { choix: req.body?.choix, qui: req.body?.qui, note: req.body?.note, user }));
  }));
  app.post('/api/off-market/simple/villes/:id/zones', wrap(async (req, res) => {
    const user = compte(req, res); if (!user) return;
    if (!(await villesDe(user)).has(req.params.id)) return res.status(404).json({ error: 'Ville introuvable.' });
    const { zonesDeLaVille } = await import('../off-market/zones.js');
    const r = await zonesDeLaVille(req.params.id, { forcer: true });
    if (!r.ok) return res.status(400).json({ error: r.error });
    ok(res, { zones: r.zones.map((z) => ({ nom: z.nom, genre: z.genre, pourquoi: z.pourquoi, rues: z.rues })) });
  }));
  app.post('/api/off-market/simple/villes/:id/google', wrap(async (req, res) => {
    const user = compte(req, res); if (!user) return;
    if (!(await villesDe(user)).has(req.params.id)) return res.status(404).json({ error: 'Ville introuvable.' });
    ok(res, { lance: (await Si()).lancerGoogle(req.params.id, { forcer: true }) });
  }));
  app.post('/api/off-market/simple/villes/:id/trouver', wrap(async (req, res) => {
    const user = compte(req, res); if (!user) return;
    if (!(await villesDe(user)).has(req.params.id)) return res.status(404).json({ error: 'Ville introuvable.' });
    const { ouvrirFlux } = await import('../flux.js');
    const flux = ouvrirFlux(res);
    try { flux.fin(await (await Si()).trouverCommerce(req.params.id, String(req.body?.nom || '').slice(0, 80), { surEtape: flux.etape })); } catch (e) { flux.erreur(e); }
  }));
  app.post('/api/off-market/simple/commerces/:id/prix', wrap(async (req, res) => {
    const user = compte(req, res); if (!user) return;
    const { ouvrirFlux } = await import('../flux.js');
    const flux = ouvrirFlux(res);
    try { flux.fin(await (await Si()).estimerPrix(req.params.id, { surface: req.body?.surface ?? null, user, surEtape: flux.etape })); } catch (e) { flux.erreur(e); }
  }));
  app.get('/api/off-market/simple/listes', wrap(async (req, res) => {
    const user = compte(req, res); if (!user) return;
    ok(res, { listes: await (await Si()).listesDeCommerces(user) });
  }));
  app.post('/api/off-market/simple/listes/envoyer', wrap(async (req, res) => {
    const user = compte(req, res); if (!user) return;
    rendre(res, await (await Si()).envoyerVersListe(Array.isArray(req.body?.ids) ? req.body.ids : [], { liste_id: req.body?.liste_id || null, nom: req.body?.nom || null, user }));
  }));
  app.get('/api/off-market/simple/appels', wrap(async (req, res) => {
    const user = compte(req, res); if (!user) return;
    const S2 = await Si(); const Sm = await S();
    ok(res, { appels: S2.listerAppels(Sm.espaceDe(user)), reponses: S2.REPONSES });
  }));

  // Le score « Zone » du mode Simple et ses jugements (11 oct. 2026) : l'équipe Klocka seule.
  const Zj = () => import('../off-market/zone/jugements.js');
  const Zm = () => import('../off-market/zone/modele.js');
  const equipe = (req, res) => {
    const user = currentUser(req);
    if (user?.role !== 'admin') { res.status(403).json({ error: 'Réservé à l\'équipe Klocka.' }); return null; }
    return user;
  };
  app.get('/api/off-market/simple/villes/:id/zone', wrap(async (req, res) => {
    const user = equipe(req, res); if (!user) return;
    const Z = await Zj(); const M = await Zm(); const { CONFIG } = await import('../off-market/zone/score.js');
    const m = M.modeleActif();
    ok(res, { modele: { version: m.version, type: m.type }, seuil_faible: CONFIG.seuil_faible, points: Object.fromEntries(Z.zoneDesCommerces(req.params.id)) });
  }));
  app.get('/api/off-market/simple/villes/:id/zone/a-juger', wrap(async (req, res) => {
    const user = equipe(req, res); if (!user) return;
    ok(res, { points: (await Zj()).fileAJuger(req.params.id) });
  }));
  app.post('/api/off-market/simple/commerces/:id/zone/jugement', wrap(async (req, res) => {
    const user = equipe(req, res); if (!user) return;
    const b = req.body || {};
    rendre(res, await (await Zj()).enregistrerJugement({ point_id: req.params.id, user: user.email, verdict: b.verdict, commentaire: b.commentaire, score_affiche: b.score_affiche, model_version: b.model_version }));
  }));
  app.post('/api/off-market/simple/commerces/:id/zone/rue', wrap(async (req, res) => {
    const user = equipe(req, res); if (!user) return;
    rendre(res, await (await import('../off-market/zone/revue-rue.js')).noterRue(req.params.id));
  }));
  app.get('/api/off-market/zone/modele', wrap(async (req, res) => {
    const user = equipe(req, res); if (!user) return;
    ok(res, (await import('../off-market/zone/tableau.js')).tableauModele());
  }));
  app.post('/api/off-market/zone/modele/entrainer', wrap(async (req, res) => {
    const user = equipe(req, res); if (!user) return;
    const r = (await Zm()).trainZoneModel();
    (await Zm()).journaliser('a_la_main', { par: user.email, resultat: r.ok ? `version ${r.version}${r.active ? ' active' : ' refusée'}` : r.raison });
    ok(res, r);
  }));
  app.post('/api/off-market/zone/modele/revenir', wrap(async (req, res) => {
    const user = equipe(req, res); if (!user) return;
    const r = (await Zm()).revenir();
    if (r.ok) (await Zm()).journaliser('retour', { par: user.email, version: r.version });
    rendre(res, r);
  }));

  // Les locaux d'un ou plusieurs territoires, classés.
  app.get('/api/off-market/locaux', wrap(async (req, res) => {
    const user = compte(req, res); if (!user) return;
    const Lm = await L(); const Sm = await S();
    const visibles = await villesDe(user);
    const demandees = String(req.query.villes || '').split(',').filter(Boolean);
    const villes = (demandees.length ? demandees : [...visibles]).filter((v) => visibles.has(v));
    ok(res, { locaux: await Lm.listerLocaux(villes, { contacts: Sm.contactsDe(Sm.espaceDe(user)) }) });
  }));
  // Les rues d'un territoire, dans la teinte de leur emplacement (23 oct. 2026, Jules : « un bouton Rues à gauche du
  // plein écran, on clique et on voit les rues colorées ») : celles qu'ALX a classées 1, 1 bis ou 2, avec leur tracé.
  app.get('/api/off-market/rues', wrap(async (req, res) => {
    const user = compte(req, res); if (!user) return;
    const visibles = await villesDe(user);
    const id = String(req.query.ville || '');
    if (!visibles.has(id)) return res.status(404).json({ error: 'Ville introuvable.' });
    const { Records } = await import('../db.js');
    const v = Records.get('Ville', id);
    ok(res, { rues: (v?.rues || []).filter((r) => [1, 1.5, 2].includes(r.classe) && (r.trace || []).length).map(({ nom, classe, trace }) => ({ nom, classe, trace })) });
  }));
  app.get('/api/off-market/locaux/:id', wrap(async (req, res) => {
    const user = compte(req, res); if (!user) return;
    const Lm = await L(); const Sm = await S();
    const { Records } = await import('../db.js');
    const c = Records.get('Cible', req.params.id);
    if (!c || !(await villesDe(user)).has(c.ville_id)) return res.status(404).json({ error: 'Local introuvable.' });
    ok(res, { local: await Lm.ficheLocal(c.id, { contact: Sm.contactDe(Sm.espaceDe(user), Lm.cleProprietaire(c)) }) });
  }));
  // La photo de la devanture (Street View), gardée sur le disque après le premier appel :
  // la carte de bien la montre, et on ne paie l'image qu'une fois par local.
  app.get('/api/off-market/locaux/:id/photo', wrap(async (req, res) => {
    const user = compte(req, res); if (!user) return;
    const { Records, DATA_DIR } = await import('../db.js');
    const fs = await import('fs');
    const path = await import('path');
    const c = Records.get('Cible', req.params.id);
    if (!c || !(await villesDe(user)).has(c.ville_id)) return res.status(404).end();
    const dossier = path.join(DATA_DIR, 'off-market-photos');
    const fichier = path.join(dossier, `${c.id}.jpg`);
    res.setHeader('Cache-Control', 'private, max-age=604800');
    if (fs.existsSync(fichier)) return res.type('jpeg').send(fs.readFileSync(fichier));
    const { photo, streetViewConfigure } = await import('../alx/streetview.js');
    if (!streetViewConfigure() || !c.adresse) return res.status(404).end();
    const ville = Records.get('Ville', c.ville_id);
    try {
      const image = await photo(`${c.adresse}, ${ville?.code_postal || ''} ${c.ville || ville?.nom || ''}`.trim(), { largeur: 480, hauteur: 300 });
      fs.mkdirSync(dossier, { recursive: true });
      fs.writeFileSync(fichier, image);
      res.type('jpeg').send(image);
    } catch { res.status(404).end(); }
  }));

  app.get('/api/off-market/proprietaires/:cle', wrap(async (req, res) => {
    const user = compte(req, res); if (!user) return;
    const Lm = await L(); const Sm = await S();
    const visibles = await villesDe(user);
    const f = await Lm.ficheProprietaire(req.params.cle, { contact: Sm.contactDe(Sm.espaceDe(user), req.params.cle), villesVisibles: visibles });
    if (!f || !f.patrimoine.locaux.some((l) => visibles.has(l.ville_id))) return res.status(404).json({ error: 'Propriétaire introuvable.' });
    // Hors de son territoire, un mandataire ne voit que le compte des autres locaux.
    if (user.role !== 'admin') f.patrimoine = { ...f.patrimoine, locaux: f.patrimoine.locaux.filter((l) => visibles.has(l.ville_id)) };
    ok(res, { proprietaire: f });
  }));

  // Les listes et leur empilement.
  app.get('/api/off-market/listes', wrap(async (req, res) => {
    const user = compte(req, res); if (!user) return;
    const Sm = await S();
    ok(res, { listes: Sm.listesDe(Sm.espaceDe(user)).map((l) => ({ id: l.id, nom: l.nom, dynamique: l.dynamique, filtres: l.filtres, n: l.dynamique ? null : (l.locaux || []).length, cree_le: l.cree_le })) });
  }));
  app.post('/api/off-market/listes', wrap(async (req, res) => {
    const user = compte(req, res); if (!user) return;
    const Sm = await S();
    rendre(res, Sm.creerListe(Sm.espaceDe(user), req.body || {}, user));
  }));
  app.get('/api/off-market/listes/:id', wrap(async (req, res) => {
    const user = compte(req, res); if (!user) return;
    const Sm = await S();
    const l = await Sm.locauxDeLaListe(Sm.espaceDe(user), req.params.id, user);
    if (!l) return res.status(404).json({ error: 'Liste introuvable.' });
    ok(res, { liste: l });
  }));
  app.patch('/api/off-market/listes/:id', wrap(async (req, res) => {
    const user = compte(req, res); if (!user) return;
    const Sm = await S();
    rendre(res, Sm.modifierListe(Sm.espaceDe(user), req.params.id, req.body || {}));
  }));
  app.delete('/api/off-market/listes/:id', wrap(async (req, res) => {
    const user = compte(req, res); if (!user) return;
    const Sm = await S();
    rendre(res, Sm.supprimerListe(Sm.espaceDe(user), req.params.id));
  }));

  // Les courriers : préparés pour des propriétaires, relus, validés ou écartés.
  app.get('/api/off-market/courriers', wrap(async (req, res) => {
    const user = compte(req, res); if (!user) return;
    const Sm = await S();
    const espace = Sm.espaceDe(user);
    const { Records } = await import('../db.js');
    ok(res, { a_valider: Sm.courriersAValider(espace), envoyes: Records.filter(Sm.COURRIER, { espace }).filter((c) => c.etat === 'envoye').sort((a, b) => String(b.envoye_le).localeCompare(String(a.envoye_le))).slice(0, 100) });
  }));
  app.post('/api/off-market/courriers/preparer', wrap(async (req, res) => {
    const user = compte(req, res); if (!user) return;
    const Sm = await S();
    const cles = Array.isArray(req.body?.cles) ? req.body.cles.map(String) : [];
    if (!cles.length) return res.status(400).json({ error: 'Choisissez au moins un propriétaire.' });
    ok(res, await Sm.preparerCourriers(Sm.espaceDe(user), cles, user));
  }));
  app.post('/api/off-market/courriers/:id', wrap(async (req, res) => {
    const user = compte(req, res); if (!user) return;
    const Sm = await S();
    rendre(res, Sm.modifierCourrier(Sm.espaceDe(user), req.params.id, { texte: req.body?.texte }));
  }));
  app.post('/api/off-market/courriers/:id/valider', wrap(async (req, res) => {
    const user = compte(req, res); if (!user) return;
    const Sm = await S();
    rendre(res, Sm.validerCourrier(Sm.espaceDe(user), req.params.id, user, { texte: req.body?.texte ?? null }));
  }));
  app.post('/api/off-market/courriers/:id/ecarter', wrap(async (req, res) => {
    const user = compte(req, res); if (!user) return;
    const Sm = await S();
    rendre(res, Sm.ecarterCourrier(Sm.espaceDe(user), req.params.id, user));
  }));

  // Le pipeline : étape, réponse, dossier reçu, opposition, signal vu.
  app.get('/api/off-market/pipeline', wrap(async (req, res) => {
    const user = compte(req, res); if (!user) return;
    const Sm = await S();
    const { Records } = await import('../db.js');
    ok(res, { contacts: Records.filter(Sm.CONTACT, { espace: Sm.espaceDe(user) }).sort((a, b) => String(b.maj_le).localeCompare(String(a.maj_le))) });
  }));
  app.post('/api/off-market/pipeline/:cle/statut', wrap(async (req, res) => {
    const user = compte(req, res); if (!user) return;
    const Sm = await S();
    rendre(res, Sm.changerStatut(Sm.espaceDe(user), req.params.cle, req.body?.statut, user, { nom: req.body?.nom || null }));
  }));
  app.post('/api/off-market/pipeline/:cle/reponse', wrap(async (req, res) => {
    const user = compte(req, res); if (!user) return;
    const Sm = await S();
    rendre(res, Sm.noterReponse(Sm.espaceDe(user), req.params.cle, { canal: req.body?.canal || 'courrier', texte: req.body?.texte, positive: req.body?.positive !== false, user }));
  }));
  app.post('/api/off-market/pipeline/:cle/dossier', wrap(async (req, res) => {
    const user = compte(req, res); if (!user) return;
    const Sm = await S();
    rendre(res, await Sm.noterDossierRecu(Sm.espaceDe(user), req.params.cle, { local_id: req.body?.local_id || null, user }));
  }));
  app.post('/api/off-market/pipeline/:cle/interaction', wrap(async (req, res) => {
    const user = compte(req, res); if (!user) return;
    const Sm = await S();
    const canal = ['appel', 'mail', 'courrier', 'note'].includes(req.body?.canal) ? req.body.canal : 'note';
    rendre(res, Sm.noterInteraction(Sm.espaceDe(user), req.params.cle, { canal, texte: req.body?.texte || null, statut: req.body?.statut || null, prochaine: req.body?.prochaine === null ? null : req.body?.prochaine || undefined, user }, { nom: req.body?.nom || null }));
  }));
  app.post('/api/off-market/pipeline/:cle/opposer', wrap(async (req, res) => {
    const user = compte(req, res); if (!user) return;
    const Sm = await S();
    rendre(res, Sm.opposer(req.params.cle, user, { motif: req.body?.motif || null }));
  }));
  app.post('/api/off-market/pipeline/:cle/signal-vu', wrap(async (req, res) => {
    const user = compte(req, res); if (!user) return;
    const Sm = await S();
    rendre(res, Sm.marquerSignalVu(Sm.espaceDe(user), req.params.cle));
  }));

  // Le tableau de bord, et la veille à la demande (équipe).
  app.get('/api/off-market/bilan', wrap(async (req, res) => {
    const user = compte(req, res); if (!user) return;
    const Sm = await S();
    ok(res, await Sm.tableauDeBord(Sm.espaceDe(user), user));
  }));
  app.post('/api/off-market/veille', wrap(async (req, res) => {
    const user = compte(req, res); if (!user) return;
    if (user.role !== 'admin') return res.status(403).json({ error: 'Réservé à l\'équipe.' });
    ok(res, await (await S()).veilleNocturne({ max: Math.min(80, Number(req.body?.max) || 40) }));
  }));
}

/** Chaque nuit vers 4 h (Paris), sur Render ou si OFF_MARKET_VEILLE=true : le BODACC des propriétaires suivis. */
export function planifierVeilleOffMarket() {
  if (!process.env.RENDER && process.env.OFF_MARKET_VEILLE !== 'true') return null;
  let dernierJour = null;
  const tour = async () => {
    const d = new Date();
    const heure = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hour: '2-digit', hour12: false }).format(d)) % 24;
    const j = d.toISOString().slice(0, 10);
    if (heure < 4 || dernierJour === j) return;
    dernierJour = j;
    try { const r = await (await S()).veilleNocturne(); console.log(`[off-market] veille : ${r.relus} propriétaires relus, ${r.nouveaux} avec un nouveau signal`); } catch (e) { console.warn('[off-market] veille :', e?.message || e); }
  };
  const t = setInterval(tour, 30 * 60_000);
  t.unref?.();
  return t;
}
