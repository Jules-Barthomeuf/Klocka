// L assistant, le suivi d usage et le journal de navigation.
//
// Sorti de index.js, qui portait cent soixante-quatorze routes dans un seul
// fichier de près de trois mille lignes.

import { Records } from '../db.js';
import { listAccounts } from '../email.js';
import { APP_URL_PROD, PORT, compteAutorise, currentUser, ok, wrap } from '../contexte.js';

/** Monte les routes « assistant / journal / monitoring » sur l'application. */
export function monterAssistant(app) {
  // ---------------------------------------------------------------------------
  // Assistant : le plan de travail.
  // La pile est calculée à la demande depuis l'état en base — rien n'est stocké,
  // donc rien ne se périme. Aucune action n'est déclenchée ici.
  // ---------------------------------------------------------------------------
  app.get('/api/assistant/propositions', wrap(async (req, res) => {
    const user = currentUser(req);
    const { construirePropositions } = await import('../deal/propositions.js');
    const { etatVeille } = await import('../deal/veille-mails.js');
    // Chacun ne voit que les boîtes qu'il a connectées.
    const comptes = listAccounts(user?.email).map((c) => c.id);
    const propositions = await construirePropositions({ comptes });

    // Une proposition montrée est notée : sans cela, rien ne dit ce qui est suivi
    // d'effet et les priorités restent des constantes jamais confrontées.
    const { noterVues } = await import('../suivi-propositions.js');
    noterVues(propositions, user);

    ok(res, { propositions, veille: etatVeille() });
  }));

  // Relève immédiate, sans attendre le prochain passage de la veille.
  app.post('/api/assistant/relever', wrap(async (req, res) => {
    const { relever } = await import('../deal/veille-mails.js');
    ok(res, await relever());
  }));

  // Une proposition traitée : c'est ce qui ferme la boucle de mesure.
  app.post('/api/assistant/propositions/traitee', wrap(async (req, res) => {
    const { type, deal_id, mail_id, id, action } = req.body || {};
    if (!type) return res.status(400).json({ error: 'Type manquant' });
    const { noterTraitee } = await import('../suivi-propositions.js');
    const r = noterTraitee({ type, deal_id, mail_id, id, action, user: currentUser(req) });
    ok(res, { notee: !!r });
  }));

  // Ce que deviennent les propositions, et ce que coûte l'IA.
  app.get('/api/monitoring/propositions', wrap(async (req, res) => {
    if (currentUser(req)?.role !== 'admin') return res.status(403).json({ error: 'Réservé aux administrateurs.' });
    const { syntheseTraitement } = await import('../suivi-propositions.js');
    ok(res, syntheseTraitement(Number(req.query.jours) || 30));
  }));

  // Ce que coûte un geste, ramené à son unité : lire une pièce, rédiger un mail,
  // poser une question. Le journal parle en noms de code ; personne ne travaille
  // en ces termes.
  app.get('/api/monitoring/couts-par-action', wrap(async (req, res) => {
    if (currentUser(req)?.role !== 'admin') return res.status(403).json({ error: 'Réservé aux administrateurs.' });
    const { coutsParAction } = await import('../llm-couts.js');
    ok(res, coutsParAction(Number(req.query.jours) || 30));
  }));

  app.get('/api/monitoring/couts', wrap(async (req, res) => {
    if (currentUser(req)?.role !== 'admin') return res.status(403).json({ error: 'Réservé aux administrateurs.' });
    const { syntheseCouts } = await import('../llm-couts.js');
    ok(res, syntheseCouts(Number(req.query.jours) || 30, {
      limite: Math.min(2000, Number(req.query.limite) || 100),
      par: req.query.par ? String(req.query.par) : null,
    }));
  }));

  // Correction du tri par l'équipe. Elle vaut pour l'expéditeur entier : la
  // question ne se repose jamais deux fois.
  app.post('/api/assistant/mails/:id/tri', wrap(async (req, res) => {
    const { decision, motif, portee } = req.body || {};
    if (!['garder', 'ignorer'].includes(decision)) {
      return res.status(400).json({ error: 'Décision inconnue' });
    }
    const mail = Records.get('MailRecu', req.params.id);
    if (!mail) return res.status(404).json({ error: 'Mail introuvable' });

    const { apprendre } = await import('../deal/tri-mails.js');
    const email = String(mail.de_email || '').toLowerCase();
    const r = apprendre({
      email,
      decision,
      motif,
      // Défaut volontaire : ce mail-ci, pas tout l'expéditeur. Un agent envoie de
      // bons biens et des mails sans intérêt ; le faire taire serait pire.
      portee: ['expediteur', 'domaine'].includes(portee) ? portee : 'mail',
      exemple: mail,
      par: currentUser(req)?.email,
    });
    if (!r.ok) return res.status(400).json(r);

    // Un mail écarté n'a plus à figurer dans la pile : la correction le retire.
    if (decision === 'ignorer') Records.delete('MailRecu', mail.id);
    ok(res, { ...r, expediteur: mail.de_email });
  }));

  // Faire taire un expéditeur, ou le réhabiliter. Séparé de la correction d'un
  // mail : celui-ci est supprimé au passage, il ne peut plus servir de référence.
  app.post('/api/assistant/tri-expediteur', wrap(async (req, res) => {
    const { email, decision, motif, portee } = req.body || {};
    if (!['garder', 'ignorer'].includes(decision)) {
      return res.status(400).json({ error: 'Décision inconnue' });
    }
    if (!email) return res.status(400).json({ error: 'Expéditeur manquant' });

    const { apprendre } = await import('../deal/tri-mails.js');
    const r = apprendre({
      email,
      decision,
      motif,
      portee: portee === 'domaine' ? 'domaine' : 'expediteur',
      par: currentUser(req)?.email,
    });
    if (!r.ok) return res.status(400).json(r);

    // Les mails déjà remontés de cet expéditeur quittent la pile.
    let retires = 0;
    if (decision === 'ignorer') {
      for (const m of Records.filter('MailRecu', { de_email: String(email).toLowerCase() })) {
        if (m.deal_id) continue; // un mail rattaché à un dossier reste
        Records.delete('MailRecu', m.id);
        retires += 1;
      }
    }
    ok(res, { ...r, retires });
  }));

  // L'assistant de commande : une phrase, une action.
  app.post('/api/assistant/commande', wrap(async (req, res) => {
    const { messages, contexte } = req.body || {};
    if (!Array.isArray(messages) || !messages.length) {
      return res.status(400).json({ error: 'Message manquant' });
    }
    const user = currentUser(req);
    const { commander } = await import('../assistant-commande.js');
    const debut = Date.now();
    // La demande est mesurée : une seule question peut déclencher six appels au
    // modèle, ils comptent tous pour elle.
    const { mesurer } = await import('../llm-couts.js');
    const { resultat: r, consommation } = await mesurer(
      { operation: 'assistant', par: user?.email, sur: contexte?.deal_id || contexte?.projet_id },
      () => commander(messages.slice(-12), user, contexte)
    );

    // Chaque échange laisse une ligne : la question, la réponse, les outils
    // consultés et ceux qui ont agi.
    const { consignerRequete } = await import('../journal-usage.js');
    consignerRequete({
      question: messages[messages.length - 1]?.contenu,
      reponse: r.texte,
      outils: r.outils,
      actions: (r.actions || []).map((a) => a.name),
      user,
      duree_ms: Date.now() - debut,
      cout: consommation?.cout ?? null,
      jetons: consommation ? consommation.entree + consommation.sortie : null,
      contexte,
    });

    // Le fil survit au rechargement : il vit en base, pas dans l'onglet.
    const { enregistrerFil } = await import('../assistant-fil.js');
    enregistrerFil(user, [...messages, { role: 'assistant', contenu: r.texte }]);
    ok(res, r);
  }));

  // Consignation d'une page ouverte. Ouvert à tout utilisateur connecté : c'est
  // son propre passage qu'il déclare.
  app.post('/api/journal/page', wrap(async (req, res) => {
    const { consignerVisite } = await import('../journal-usage.js');
    consignerVisite({ page: req.body?.page, url: req.body?.url, user: currentUser(req) });
    ok(res, { consigne: true });
  }));

  // Centre de suivi : réservé aux administrateurs, il expose l'usage de chacun.
  app.get('/api/monitoring', wrap(async (req, res) => {
    const user = currentUser(req);
    if (user?.role !== 'admin') return res.status(403).json({ error: 'Réservé aux administrateurs.' });
    const { synthese } = await import('../journal-usage.js');
    ok(res, synthese(Number(req.query.jours) || 30));
  }));

  // L'historique complet des échanges avec l'assistant.
  app.get('/api/monitoring/requetes', wrap(async (req, res) => {
    const user = currentUser(req);
    if (user?.role !== 'admin') return res.status(403).json({ error: 'Réservé aux administrateurs.' });
    const { historiqueRequetes } = await import('../journal-usage.js');
    ok(
      res,
      historiqueRequetes({
        limite: Math.min(Number(req.query.limite) || 50, 200),
        depuis: Number(req.query.depuis) || 0,
        par: req.query.par || null,
      })
    );
  }));

  // Ce que la plateforme a fait toute seule, et ce que cette personne n'a pas
  // encore vu.
  app.get('/api/assistant/rapports', wrap(async (req, res) => {
    const { rapports } = await import('../rapport-auto.js');
    ok(res, rapports(currentUser(req), { jours: Number(req.query.jours) || 7 }));
  }));

  // Rattraper une opération manquée pendant la nuit, sans rejouer tout le passage.
  app.post('/api/assistant/rapports/:id/relancer', wrap(async (req, res) => {
    const { relancer } = await import('../rapport-auto.js');
    try {
      ok(res, await relancer(req.params.id, Number(req.body?.index)));
    } catch (e) {
      res.status(400).json({ error: e?.message || 'Relance impossible' });
    }
  }));

  app.post('/api/assistant/rapports/vus', wrap(async (req, res) => {
    const { marquerVus } = await import('../rapport-auto.js');
    ok(res, { marques: marquerVus(currentUser(req), req.body?.ids) });
  }));

  // Le registre des engagements : qui doit quoi, pour quand.
  // Les échéances : nos mails sans réponse, les promesses, les dossiers qui
  // dorment — les cartes du mode « Échéances » du chat du tableau de bord.
  // La boîte : un seul chat, ce qu'on y met est trié et fait.
  app.post('/api/assistant/boite', wrap(async (req, res) => {
    const texte = String(req.body?.texte || '').trim();
    if (!texte) return res.status(400).json({ error: 'Rien à traiter.' });
    const user = currentUser(req);
    const { traiterBoite } = await import('../assistant-boite.js');
    const { mesurer } = await import('../llm-couts.js');
    const { resultat } = await mesurer({ operation: 'boîte', par: user?.email || null }, () =>
      traiterBoite({ texte, historique: req.body?.historique, user, type: req.body?.type || null })
    );
    ok(res, resultat);
  }));

  // La note d'appel : la fiche de l'agent dans Monday (prénom, date, remarques,
  // prochaine relance), et le dossier si un bien est décrit.
  app.post('/api/assistant/note-appel', wrap(async (req, res) => {
    const texte = String(req.body?.texte || '').trim();
    if (!texte) return res.status(400).json({ error: 'Note vide.' });
    const { traiterNoteAppel } = await import('../deal/appels.js');
    ok(res, await traiterNoteAppel(texte, { user: currentUser(req) }));
  }));

  // Tout ce qui attend une relance, lu dans le tableau des agents.
  // Les rappels dits au chat : « rappelle-moi dans trois jours de rappeler Marc ».
  // L'avis sur une réponse de l'IA : la remarque est créée, et le prompt de
  // correction rédigé dans la foulée.
  app.post('/api/assistant/avis', wrap(async (req, res) => {
    const { enregistrerAvis } = await import('../avis.js');
    const r = await enregistrerAvis({ ...(req.body || {}), user: currentUser(req) });
    if (!r.ok) return res.status(400).json({ error: r.error });
    ok(res, r);
  }));

  app.post('/api/assistant/rappels', wrap(async (req, res) => {
    const { creerRappel } = await import('../rappels.js');
    const r = await creerRappel({ texte: req.body?.texte, user: currentUser(req) });
    if (!r.ok) return res.status(400).json({ error: r.error });
    ok(res, r);
  }));

  app.get('/api/assistant/rappels', wrap(async (req, res) => {
    const { listerRappels } = await import('../rappels.js');
    ok(res, listerRappels(currentUser(req)));
  }));

  app.post('/api/assistant/rappels/:id/fait', wrap(async (req, res) => {
    const { terminerRappel } = await import('../rappels.js');
    const r = terminerRappel(req.params.id, currentUser(req));
    if (!r.ok) return res.status(404).json({ error: r.error });
    ok(res, r);
  }));

  app.delete('/api/assistant/rappels/:id', wrap(async (req, res) => {
    const { supprimerRappel } = await import('../rappels.js');
    const r = supprimerRappel(req.params.id, currentUser(req));
    if (!r.ok) return res.status(404).json({ error: r.error });
    ok(res, r);
  }));

  // Ce qui vous attend : rappels, promesses des agents et relances de dossiers,
  // en une seule liste datée.
  app.get('/api/assistant/attend', wrap(async (req, res) => {
    const { ceQuiAttend } = await import('../attend.js');
    ok(res, ceQuiAttend(currentUser(req)));
  }));

  app.get('/api/assistant/relances', wrap(async (req, res) => {
    const { relancesEnAttente } = await import('../deal/appels.js');
    ok(res, await relancesEnAttente({ pour: currentUser(req) }));
  }));

  app.get('/api/assistant/echeances', wrap(async (req, res) => {
    const { echeances } = await import('../deal/echeances.js');
    ok(res, echeances());
  }));

  app.get('/api/assistant/engagements', wrap(async (req, res) => {
    const { tousLesEngagements, enRetard } = await import('../deal/engagements.js');
    ok(res, { engagements: tousLesEngagements().map((e) => ({ ...e, en_retard: enRetard(e) })) });
  }));

  app.post('/api/assistant/engagements/:id/tenu', wrap(async (req, res) => {
    const { clore } = await import('../deal/engagements.js');
    const r = clore(req.params.id, { user: currentUser(req), commentaire: req.body?.commentaire });
    if (!r.ok) return res.status(400).json({ error: r.error });
    ok(res, r);
  }));

  app.post('/api/assistant/engagements/:id/echeance', wrap(async (req, res) => {
    const { repousser } = await import('../deal/engagements.js');
    const r = repousser(req.params.id, req.body?.date, currentUser(req));
    if (!r.ok) return res.status(400).json({ error: r.error });
    ok(res, r);
  }));

  // Le fil de conversation de l'utilisateur, tel qu'il l'a laissé.
  app.get('/api/assistant/fil', wrap(async (req, res) => {
    const { lireFil } = await import('../assistant-fil.js');
    ok(res, { messages: lireFil(currentUser(req)) });
  }));

  app.delete('/api/assistant/fil', wrap(async (req, res) => {
    const { effacerFil } = await import('../assistant-fil.js');
    effacerFil(currentUser(req));
    ok(res, { efface: true });
  }));

  // CRM : les agents des dossiers deviennent des fiches contact, sans saisie.
  app.post('/api/assistant/crm/synchroniser', wrap(async (req, res) => {
    const { synchroniserAgents } = await import('../deal/crm-sync.js');
    ok(res, synchroniserAgents());
  }));

  // Agenda d'équipe : création de l'agenda partagé et report des échéances.
  app.get('/api/assistant/calendrier', wrap(async (req, res) => {
    const { lienCalendrier, calendrierConfigure } = await import('../google-calendar.js');
    const { calendarDemande } = await import('../google-oauth.js');
    ok(res, { actif: calendarDemande, configure: calendrierConfigure(), lien: lienCalendrier() });
  }));

  app.post('/api/assistant/calendrier/synchroniser', wrap(async (req, res) => {
    const user = currentUser(req);
    const { compte, partager } = req.body || {};
    if (!compte) return res.status(400).json({ error: 'Compte manquant' });
    if (!compteAutorise(req, compte)) return res.status(403).json({ error: 'Ce compte ne vous appartient pas.' });

    const { synchroniserEcheances, partagerCalendrier, lienCalendrier } = await import('../google-calendar.js');
    const r = await synchroniserEcheances(compte, APP_URL_PROD || `http://localhost:${PORT}`);

    // Partage avec l'équipe : tous les admins, sauf le compte propriétaire.
    let partage = null;
    if (partager !== false) {
      const admins = Records.filter('User', { role: 'admin' })
        .map((u) => u.email)
        .filter((e) => e && e.toLowerCase() !== String(compte).toLowerCase());
      if (admins.length) partage = await partagerCalendrier(compte, admins);
    }
    ok(res, { ...r, partage, lien: lienCalendrier(), par: user?.email || null });
  }));
}
