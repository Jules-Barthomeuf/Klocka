// Les fiches commerciales : ce que l'onglet Fiches lit, et la correction de
// l'agent d'une fiche. Réservé à l'équipe.

import { Records } from '../db.js';
import { ok, wrap, currentUser } from '../contexte.js';

/** Monte les routes « fiches » sur l'application. */
export function monterFiches(app) {
  const admin = (req, res) => {
    const user = currentUser(req);
    if (user?.role !== 'admin') { res.status(403).json({ error: 'Réservé à l\'équipe.' }); return null; }
    return user;
  };
  const estInterneDe = async () => {
    const { referentielTri } = await import('../deal/tri-mails.js');
    const ref = referentielTri();
    return (email) => {
      const e = String(email || '').toLowerCase();
      return ref.internes.has(e) || ref.domaines.has(e.split('@')[1] || '');
    };
  };

  app.get('/api/fiches', wrap(async (req, res) => {
    if (!admin(req, res)) return;
    const { listerFiches, statsParSemaine, recordDeFiches, COMPTE_DEPUIS } = await import('../deal/fiches-stats.js');
    const semaines = Math.min(52, Math.max(4, Number(req.query.semaines) || 12));
    const fiches = listerFiches({ deals: Records.list('Deal'), mails: Records.list('MailRecu'), projets: Records.list('Project'), biensMemoire: Records.list('BienMemoire'), manuelles: Records.list('FicheManuelle') }, { estInterne: await estInterneDe() });
    ok(res, { fiches: fiches.slice(0, 400), total: fiches.length, semaines: statsParSemaine(fiches, { semaines }), record: recordDeFiches(fiches), depuis: COMPTE_DEPUIS });
  }));

  // L'agent d'une fiche, corrigé à la main : un nom ou une adresse. Sur un
  // dossier sans vrai contact agent (vide ou quelqu'un de l'équipe), l'adresse
  // devient aussi son contact agent, pour que la demande de documents parte au bon.
  app.post('/api/fiches/:id/agent', wrap(async (req, res) => {
    const user = admin(req, res);
    if (!user) return;
    const saisi = String(req.body?.agent || '').trim().slice(0, 160);
    const email = (saisi.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/) || [])[0]?.toLowerCase() || null;
    const nom = saisi.replace(/<?[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}>?/, '').replace(/[,;]+$/, '').trim() || null;
    const correction = saisi ? { email, nom: nom || email, par: user.email, le: new Date().toISOString() } : null;
    const id = String(req.params.id);
    if (id.startsWith('mail:')) {
      const m = Records.get('MailRecu', id.slice(5));
      if (!m) return res.status(404).json({ error: 'Fiche introuvable.' });
      Records.update('MailRecu', m.id, { fiche_agent: correction });
      return ok(res, { ok: true });
    }
    const d = Records.findBy('Deal', 'deal_id', id);
    if (!d) return res.status(404).json({ error: 'Fiche introuvable.' });
    const estInterne = await estInterneDe();
    const contactVide = !d.contact_agent_email || estInterne(d.contact_agent_email);
    Records.update('Deal', d.id, { fiche_agent: correction, ...(email && contactVide ? { contact_agent_email: email } : {}) });
    ok(res, { ok: true });
  }));

  // Les fiches reçues par analyste, sur `jours` jours : la page Statistiques et la pop-up du record.
  const calculerFichesAnalystes = async (jours) => {
    const { fiches } = await import('../prospection/index.js');
    const { fichesParAnalyste } = await import('../prospection/fiches-par-analyste.js');
    const { DEBUT_DES_MESURES, remiseAZero } = await import('../prospection/suivi-appels.js');
    const { EQUIPE } = await import('../prospection/equipe.js');
    const maintenant = new Date();
    let depuis = new Date(maintenant.getTime() - jours * 86400000).toISOString();
    const zero = remiseAZero();
    // Les statistiques partent du lundi 16 novembre 2026, minuit à Paris (24 nov. 2026, Jules).
    const DEPART = '2026-11-15T23:00:00.000Z';
    for (const borne of [DEBUT_DES_MESURES, zero?.le, DEPART]) if (borne && borne > depuis) depuis = borne;
    // Les appels au téléphone, sans les essais ni ce qui a été remplacé ; ceux d'avant la période servent à la fenêtre.
    const appels = Records.list('AppelAgent').filter((x) => x.par && x.canal !== 'mail' && !x.essai && !x.essai_archive && !['remplace', 'abandonne'].includes(x.etat) && String(x.le) >= DEBUT_DES_MESURES);
    // La période d'avant, de même longueur, jamais avant le début des mesures.
    let avant = new Date(maintenant.getTime() - 2 * jours * 86400000).toISOString();
    for (const borne of [DEBUT_DES_MESURES, zero?.le, DEPART]) if (borne && borne > avant) avant = borne;
    const resultat = fichesParAnalyste({
      fiches: await fiches(), appels, depuis, avant: avant < depuis ? avant : null, maintenant, semaines: Math.min(52, Math.max(8, Math.ceil(jours / 7))),
      agents: new Map(Records.list('AgentImmo').map((a) => [a.id, a])),
      agences: new Map(Records.list('AgenceProspect').map((a) => [a.id, a])),
      equipe: EQUIPE,
    });
    // La courbe des semaines part aussi de la semaine du 16 novembre.
    if (Array.isArray(resultat.semaines)) resultat.semaines = resultat.semaines.filter((s) => s.semaine >= '2026-11-16');
    // Le record se compte dans la Mémoire, semaine complète par semaine complète (24 nov. 2026, Jules) :
    // server/memoire/record-memoire.js ; vérifié chaque dimanche soir.
    const { recordGarde, lignesDeLaMemoire, carteFichesRecues, jourParis } = await import('../memoire/record-memoire.js');
    // La carte « Fiches reçues » : toute l'équipe, comptée dans la Mémoire, depuis le lundi (24 nov. 2026, Jules).
    resultat.memoire = carteFichesRecues(lignesDeLaMemoire(), { aujourdhui: jourParis(maintenant.toISOString()) });
    // La carte « Dossiers étudiés » : les nouveaux dossiers créés depuis le lundi, toute l'équipe (24 nov. 2026, Jules).
    const { carteDossiersEntres, carteSemaine } = await import('../statistiques.js');
    const aujourdhui = jourParis(maintenant.toISOString());
    resultat.dossiers_semaine = carteDossiersEntres(Records.list('Deal'), { aujourdhui });
    // Projets entrés : les projets créés depuis le lundi ; offres faites : les LOI rédigées depuis le lundi (24 nov. 2026, Jules).
    resultat.projets_semaine = carteSemaine(Records.list('Project').map((p) => p.created_date), { aujourdhui });
    resultat.offres_semaine = carteSemaine(Records.list('LettreIntention').map((l) => l.cree_le || l.created_date), { aujourdhui });
    const { prenomDe } = await import('../prospection/equipe.js');
    const rm = recordGarde({ maintenant });
    resultat.record_analyste = rm ? { email: rm.email, prenom: prenomDe(rm.email), semaine: rm.semaine, fiches: rm.fiches, biens: rm.fiches } : null;
    // La photo de qui tient le record : la même que dans la Prospection (Compte, public/equipe, puis Google).
    const r = resultat.record_analyste;
    if (r) r.photo = (await import('../prospection/agent-ia.js')).photoDe(Records.findBy('User', 'email', r.email) || { email: r.email });
    return resultat;
  };

  // Les fiches reçues par analyste (15 nov. 2026, Jules) : la page Statistiques.
  app.get('/api/monitoring/fiches-analystes', wrap(async (req, res) => {
    if (!admin(req, res)) return;
    ok(res, await calculerFichesAnalystes(Math.min(365, Math.max(1, Number(req.query.jours) || 30))));
  }));

  // « Mes statistiques » (22 nov. 2026, maquette de Jules) : une personne, par jour sur 30 jours, et les 30 d'avant.
  app.get('/api/statistiques/personne', wrap(async (req, res) => {
    const user = admin(req, res);
    if (!user) return;
    const { parJourPersonne } = await import('../statistiques.js');
    const jours = 30;
    const { fiches: lignes } = await calculerFichesAnalystes(2 * jours);
    // Les fiches de la personne, comptées dans la Mémoire comme la carte et le record (24 nov. 2026, Jules : « idem pour
    // la personne si on enlève une fiche de la Mémoire »).
    const { lignesDeLaMemoire } = await import('../memoire/record-memoire.js');
    ok(res, parJourPersonne({
      email: String(req.query.email || user.email), jours, fiches: lignes, fichesMemoire: lignesDeLaMemoire().map((l) => ({ le: l.jour, analyste: l.qui })),
      // Ses dossiers : ceux qu'elle a créés (`cree_par`), à leur date de création, ni test ni essai.
      dossiersCrees: Records.list('Deal').filter((d) => !d.test && !d.essai_marche && !d.essai).map((d) => ({ le: d.cree_le || d.created_date, par: d.cree_par || d.created_by })),
      projets: Records.list('Project'), presentations: Records.list('PresentationBancaire'),
    }));
  }));

  // Les meilleurs agents (22 nov. 2026, Jules) : un classement commun, vide au départ ; on ajoute un agent (de Klocka ou
  // du CRM), on le place, on le retire. Chacun a sa photo, importée ou trouvée d'elle-même (server/photos-fiches.js).
  const CLASSEMENT = 'ClassementAgents';
  const CLE_AGENT = /^(agent:|twenty:agentImmobilier:)[\w-]+$/;
  // Le nom et les adresses d'un agent du CRM sans fiche dans Klocka : relus dans Twenty (lecture seule), gardés dans le
  // classement ; les adresses retrouvent ses fiches reçues et sa ville.
  const lireCrm = async (cle) => {
    try {
      const { lire } = await import('../twenty.js');
      const { nomDe } = await import('../crm/ecran.js');
      const t = await Promise.race([lire('agentImmobilierListe', cle.split(':').slice(2).join(':')), new Promise((_, non) => setTimeout(() => non(new Error('délai')), 4000))]);
      const emails = [t?.eMail?.primaryEmail, ...(t?.eMail?.additionalEmails || [])].filter(Boolean).map((e) => String(e).toLowerCase());
      return { nom: nomDe(t) || null, emails };
    } catch { return { nom: null, emails: [] }; }
  };
  // Sa fiche de Klocka porte son nom : la fiche ouverte d'un clic, la recherche et les notes le retrouvent.
  const nommerFiche = async (cle, nom) => {
    if (!nom) return;
    const { fiche } = await import('../fiche-dossier/modele.js');
    const f = fiche(cle, { nom, genre: 'agent' });
    if (!f.nom || ['Fiche du CRM', 'Sans nom'].includes(f.nom)) Records.update('FicheDossier', f.id, { nom });
  };
  app.get('/api/statistiques/meilleurs-agents', wrap(async (req, res) => {
    if (!admin(req, res)) return;
    const { objetDe } = await import('../fiche-dossier/modele.js');
    const { photoDe } = await import('../photos-fiches.js');
    const { cleNom } = await import('../prospection/photos-equipe.js');
    const { nomAgent } = await import('../nom-agent.js');
    const { agents_tous: parFiches } = await calculerFichesAnalystes(30);
    const pose = Records.list(CLASSEMENT)[0] || null;
    const infos = { ...(pose?.infos || {}) };
    let repare = false;
    const agents = [];
    for (const cle of (pose?.ordre || []).filter((k) => CLE_AGENT.test(k))) {
      const o = objetDe(cle);
      if (!o) continue;
      // Un agent du CRM sans fiche : son nom gardé à l'ajout, sinon relu dans Twenty une fois.
      if (cle.startsWith('twenty:') && !infos[cle]?.lu) {
        const lu = await lireCrm(cle);
        infos[cle] = { ...(infos[cle] || {}), nom: infos[cle]?.nom || lu.nom, emails: lu.emails, lu: true };
        repare = true;
      }
      const brut = o.nom && o.nom !== 'Fiche du CRM' ? o.nom : infos[cle]?.nom;
      const nom = nomAgent(brut) || brut || 'Agent du CRM';
      if (cle.startsWith('twenty:') && brut && o.nom === 'Fiche du CRM') await nommerFiche(cle, nom);
      // Ses fiches reçues : par une de ses adresses, sinon par son nom.
      const emails = cle.startsWith('agent:') ? (Records.get('AgentImmo', cle.slice(6))?.emails || []).map((e) => String(e).toLowerCase()) : infos[cle]?.emails || [];
      const f = parFiches.find((x) => emails.includes(x.cle)) || parFiches.find((x) => cleNom(x.nom) && cleNom(x.nom) === cleNom(nom));
      // Toujours le même format (22 nov. 2026, Jules) : « Prénom Nom », puis « Agence · Ville ».
      const connu = [Records.findBy('FicheDossier', 'cle', cle)?.detail, o.detail, infos[cle]?.detail].find((x) => x && x !== 'Twenty CRM');
      agents.push({ cle, nom, detail: connu || f?.ville || null, photo: photoDe(cle)?.url || o.photo || null, fiches: f?.fiches || 0, analyste_email: f?.analyste_email || null });
    }
    if (repare && pose) {
      Records.update(CLASSEMENT, pose.id, { infos });
      // Son nom retrouvé, sa photo se cherche aussi.
      const { photoAuto } = await import('../photos-fiches.js');
      for (const a of agents) if (!a.photo && infos[a.cle]) photoAuto(a.cle, infos[a.cle]);
    }
    ok(res, { agents, par: pose?.par || null, le: pose?.le || null });
  }));
  // Les agents favoris (24 nov. 2026, Jules : « dans Statistiques, sous le record, un tableau des agents favoris, ceux avec
  // une étoile ») : chaque agent étoilé par l'équipe, le plus étoilé d'abord, avec qui l'a étoilé et ses fiches reçues
  // sur la période de la page. Même ligne que l'ancien classement des meilleurs agents.
  app.get('/api/statistiques/agents-favoris', wrap(async (req, res) => {
    if (!admin(req, res)) return;
    const jours = [7, 30, 90, 365].includes(Number(req.query.jours)) ? Number(req.query.jours) : 30;
    const { objetDe, prenomDe } = await import('../fiche-dossier/modele.js');
    const { photoDe } = await import('../photos-fiches.js');
    const { cleNom } = await import('../prospection/photos-equipe.js');
    const { nomAgent } = await import('../nom-agent.js');
    const { agents_tous: parFiches } = await calculerFichesAnalystes(jours);
    const parAgent = new Map();
    for (const x of Records.list('AgentPrefere')) {
      if (!CLE_AGENT.test(x.cle)) continue;
      const e = parAgent.get(x.cle) || { cle: x.cle, nom_pose: x.nom, par: [], le: '' };
      e.par.push({ email: x.par, prenom: prenomDe(x.par) || String(x.par).split('@')[0] });
      if (String(x.le) > e.le) e.le = String(x.le);
      parAgent.set(x.cle, e);
    }
    const agents = [];
    for (const e of parAgent.values()) {
      const o = objetDe(e.cle);
      const brut = o?.nom && o.nom !== 'Fiche du CRM' ? o.nom : e.nom_pose;
      const nom = (o?.nom_crm && o.nom) || nomAgent(brut) || brut || 'Agent du CRM';
      const emails = e.cle.startsWith('agent:') ? (Records.get('AgentImmo', e.cle.slice(6))?.emails || []).map((m) => String(m).toLowerCase()) : [];
      const f = parFiches.find((x) => emails.includes(x.cle)) || parFiches.find((x) => cleNom(x.nom) && cleNom(x.nom) === cleNom(nom));
      const connu = [Records.findBy('FicheDossier', 'cle', e.cle)?.detail, o?.detail].find((x) => x && x !== 'Twenty CRM');
      agents.push({ cle: e.cle, nom, detail: connu || f?.ville || null, photo: photoDe(e.cle)?.url || o?.photo || null, fiches: f?.fiches || 0, par: e.par, le: e.le });
    }
    agents.sort((a, b) => b.par.length - a.par.length || b.fiches - a.fiches || b.le.localeCompare(a.le));
    ok(res, { agents, jours });
  }));
  app.post('/api/statistiques/meilleurs-agents', wrap(async (req, res) => {
    const user = admin(req, res);
    if (!user) return;
    const { nomAgent } = await import('../nom-agent.js');
    const pose = Records.list(CLASSEMENT)[0];
    const avant = new Set(pose?.ordre || []);
    const recus = req.body?.infos && typeof req.body.infos === 'object' ? req.body.infos : {};
    const infos = { ...(pose?.infos || {}) };
    const ordre = [];
    for (let k of (Array.isArray(req.body?.ordre) ? req.body.ordre : []).map(String).filter((x) => CLE_AGENT.test(x)).slice(0, 20)) {
      // Un agent du CRM ajouté : son agent de Klocka quand il en a un (nom, agence, photo, fiches), sinon son nom gardé ici.
      if (!avant.has(k) && k.startsWith('twenty:')) {
        const { ficheKlocka } = await import('../crm/klocka.js');
        const lie = await ficheKlocka('agentImmobilier', k.split(':').slice(2).join(':')).catch(() => null);
        if (lie?.type === 'agent') k = `agent:${lie.id}`;
        else {
          const r = recus[k] || {};
          const nom = String(r.nom || '').slice(0, 120);
          const crm = await lireCrm(k);
          const lu = nomAgent(nom) || (nom && nom !== 'Fiche du CRM' ? nom : null) || nomAgent(crm.nom) || crm.nom;
          infos[k] = { nom: lu, detail: r.detail && r.detail !== 'Twenty CRM' ? String(r.detail).slice(0, 160) : null, emails: crm.emails, lu: true };
          await nommerFiche(k, lu);
        }
      }
      if (!ordre.includes(k)) ordre.push(k);
    }
    for (const k of Object.keys(infos)) if (!ordre.includes(k)) delete infos[k];
    const donnees = { ordre, infos, par: user.email, le: new Date().toISOString() };
    if (pose) Records.update(CLASSEMENT, pose.id, donnees); else Records.create(CLASSEMENT, donnees);
    // Un agent ajouté a sa photo : cherchée d'elle-même s'il n'en a pas.
    const { photoAuto } = await import('../photos-fiches.js');
    for (const k of ordre) if (!avant.has(k)) photoAuto(k, infos[k]);
    ok(res, { ok: true, ordre });
  }));

  // La pop-up « Record de l'équipe » (22 nov. 2026, Jules) : aux admins, une fois par semaine (server/record-equipe.js).
  // Déjà vue cette semaine : la réponse part tout de suite, sans calcul.
  app.get('/api/record-equipe', wrap(async (req, res) => {
    const user = admin(req, res);
    if (!user) return;
    const { aMontrer, semaineDe } = await import('../record-equipe.js');
    if (!aMontrer(user)) return ok(res, { montrer: false });
    const r = (await calculerFichesAnalystes(7)).record_analyste;
    // Vue dès qu'on dit de la montrer (22 nov. 2026, Jules : « ça s'affiche tout le temps, mets-la juste une fois ») :
    // une seule réponse « à montrer » par semaine, quoi que fasse l'écran ensuite.
    if (r) Records.update('User', user.id, { record_vu_semaine: semaineDe() });
    ok(res, r ? { montrer: true, record: r } : { montrer: false });
  }));
  app.post('/api/record-equipe/vu', wrap(async (req, res) => {
    const user = admin(req, res);
    if (!user) return;
    const { semaineDe } = await import('../record-equipe.js');
    Records.update('User', user.id, { record_vu_semaine: semaineDe() });
    ok(res, { ok: true });
  }));

  // Les projets entrés et les offres faites, mois par mois (20 nov. 2026, Jules), pour la page Statistiques.
  app.get('/api/statistiques/mois', wrap(async (req, res) => {
    if (!admin(req, res)) return;
    const { parMois } = await import('../statistiques.js');
    const mois = Math.min(24, Math.max(3, Number(req.query.mois) || 12));
    ok(res, parMois({ projets: Records.list('Project'), lettres: Records.list('LettreIntention'), mois }));
  }));

  // Des fiches reçues ailleurs, ajoutées à la main (23 nov. 2026, Jules : « en live ça met 19 alors que c'est 25 ») : un
  // nombre, la personne à qui elles reviennent, un mot, le jour. Elles comptent comme les autres, corrigées pareil.
  app.post('/api/monitoring/fiches-manuelles', wrap(async (req, res) => {
    const user = admin(req, res);
    if (!user) return;
    const b = req.body || {};
    const nombre = Number(b.nombre);
    if (!Number.isInteger(nombre) || nombre < 1 || nombre > 50) return res.status(400).json({ error: 'Un nombre de fiches entre 1 et 50.' });
    const le = /^\d{4}-\d{2}-\d{2}/.test(String(b.le || '')) ? new Date(`${String(b.le).slice(0, 10)}T12:00:00Z`).toISOString() : new Date().toISOString();
    const x = Records.create('FicheManuelle', { nombre, le, analyste: b.analyste ? String(b.analyste).toLowerCase().slice(0, 120) : null, titre: String(b.titre || '').trim().slice(0, 160) || null, par: user.email }, user.email);
    ok(res, { ok: true, id: `main:${x.id}` });
  }));

  // La correction d'une fiche dans ce tableau : « pas une fiche », le nombre de biens, la personne à qui elle revient.
  app.post('/api/monitoring/fiches-analystes/:id', wrap(async (req, res) => {
    const user = admin(req, res);
    if (!user) return;
    const id = String(req.params.id);
    // Une fiche envoyée sur WhatsApp (« wa:… ») : la correction se pose sur le premier bien de l'envoi en Mémoire.
    const entite = id.startsWith('mail:') ? 'MailRecu' : id.startsWith('wa:') ? 'BienMemoire' : id.startsWith('main:') ? 'FicheManuelle' : 'Deal';
    const record = entite === 'MailRecu' ? Records.get('MailRecu', id.slice(5)) : entite === 'BienMemoire' ? Records.filter('BienMemoire', { envoi_id: id })[0] : entite === 'FicheManuelle' ? Records.get('FicheManuelle', id.slice(5)) : Records.findBy('Deal', 'deal_id', id);
    if (!record) return res.status(404).json({ error: 'Fiche introuvable.' });
    // Ce que la machine avait compté, avant ce geste : la mesure de sa justesse (corrigerCompte).
    const { fiches } = await import('../prospection/index.js');
    const { corrigerCompte } = await import('../deal/justesse-compte.js');
    const ligne = (await fiches()).find((f) => f.id === id);
    const auto = ligne ? (ligne.liste ? 0 : ligne.biens) : null;
    const compte = corrigerCompte(record.fiche_compte || {}, req.body || {}, { auto, par: user.email });
    Records.update(entite, record.id, { fiche_compte: compte });
    ok(res, { ok: true, compte });
  }));
}
