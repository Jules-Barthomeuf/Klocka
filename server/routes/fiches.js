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

  // Les fiches reçues par analyste (15 nov. 2026, Jules) : dans Suivi > Appels, jamais dans la Prospection.
  app.get('/api/monitoring/fiches-analystes', wrap(async (req, res) => {
    if (!admin(req, res)) return;
    const { fiches } = await import('../prospection/index.js');
    const { fichesParAnalyste } = await import('../prospection/fiches-par-analyste.js');
    const { DEBUT_DES_MESURES, remiseAZero } = await import('../prospection/suivi-appels.js');
    const { EQUIPE } = await import('../prospection/equipe.js');
    const jours = Math.min(365, Math.max(1, Number(req.query.jours) || 30));
    const maintenant = new Date();
    let depuis = new Date(maintenant.getTime() - jours * 86400000).toISOString();
    const zero = remiseAZero();
    for (const borne of [DEBUT_DES_MESURES, zero?.le]) if (borne && borne > depuis) depuis = borne;
    // Les appels au téléphone, sans les essais ni ce qui a été remplacé ; ceux d'avant la période servent à la fenêtre.
    const appels = Records.list('AppelAgent').filter((x) => x.par && x.canal !== 'mail' && !x.essai && !x.essai_archive && !['remplace', 'abandonne'].includes(x.etat) && String(x.le) >= DEBUT_DES_MESURES);
    ok(res, fichesParAnalyste({
      fiches: await fiches(), appels, depuis, maintenant,
      agents: new Map(Records.list('AgentImmo').map((a) => [a.id, a])),
      agences: new Map(Records.list('AgenceProspect').map((a) => [a.id, a])),
      equipe: EQUIPE,
    }));
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
