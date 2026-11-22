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
    const fiches = listerFiches({ deals: Records.list('Deal'), mails: Records.list('MailRecu'), projets: Records.list('Project') }, { estInterne: await estInterneDe() });
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
    for (const borne of [DEBUT_DES_MESURES, zero?.le]) if (borne && borne > depuis) depuis = borne;
    // Les appels au téléphone, sans les essais ni ce qui a été remplacé ; ceux d'avant la période servent à la fenêtre.
    const appels = Records.list('AppelAgent').filter((x) => x.par && x.canal !== 'mail' && !x.essai && !x.essai_archive && !['remplace', 'abandonne'].includes(x.etat) && String(x.le) >= DEBUT_DES_MESURES);
    // La période d'avant, de même longueur, jamais avant le début des mesures.
    let avant = new Date(maintenant.getTime() - 2 * jours * 86400000).toISOString();
    for (const borne of [DEBUT_DES_MESURES, zero?.le]) if (borne && borne > avant) avant = borne;
    const resultat = fichesParAnalyste({
      fiches: await fiches(), appels, depuis, avant: avant < depuis ? avant : null, maintenant, semaines: Math.min(52, Math.max(8, Math.ceil(jours / 7))),
      agents: new Map(Records.list('AgentImmo').map((a) => [a.id, a])),
      agences: new Map(Records.list('AgenceProspect').map((a) => [a.id, a])),
      equipe: EQUIPE,
    });
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
    ok(res, parJourPersonne({
      email: String(req.query.email || user.email), jours, fiches: lignes,
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
    const { aMontrer } = await import('../record-equipe.js');
    if (!aMontrer(user)) return ok(res, { montrer: false });
    const r = (await calculerFichesAnalystes(7)).record_analyste;
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

  // La correction d'une fiche dans ce tableau : « pas une fiche », le nombre de biens, la personne à qui elle revient.
  app.post('/api/monitoring/fiches-analystes/:id', wrap(async (req, res) => {
    const user = admin(req, res);
    if (!user) return;
    const id = String(req.params.id);
    const record = id.startsWith('mail:') ? Records.get('MailRecu', id.slice(5)) : Records.findBy('Deal', 'deal_id', id);
    if (!record) return res.status(404).json({ error: 'Fiche introuvable.' });
    const avant = record.fiche_compte || {};
    const b = req.body || {};
    const compte = { ...avant };
    if ('pas_fiche' in b) compte.pas_fiche = !!b.pas_fiche;
    if ('biens' in b) { const n = Number(b.biens); if (b.biens == null || b.biens === '') delete compte.biens; else if (Number.isInteger(n) && n >= 0 && n <= 50) compte.biens = n; }
    if ('analyste' in b) { if (b.analyste) compte.analyste = String(b.analyste).toLowerCase().slice(0, 120); else delete compte.analyste; }
    compte.par = user.email;
    compte.le = new Date().toISOString();
    Records.update(id.startsWith('mail:') ? 'MailRecu' : 'Deal', record.id, { fiche_compte: compte });
    ok(res, { ok: true, compte });
  }));
}
