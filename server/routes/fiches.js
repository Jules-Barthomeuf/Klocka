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
}
