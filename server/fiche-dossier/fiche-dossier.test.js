// La fiche du dossier (19 nov. 2026) : une note liée, lue, rangée au OK, défaite ; la fiche et le jour qui s'en lisent.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-fiche-dossier-'));
const { Records } = await import('../db.js');
const M = await import('./modele.js');
const { normaliser, proposer, consigne, dejaDit } = await import('./ranger.js');

const maxime = { email: 'maxime.p@klocka.immo', role: 'admin' };
const maintenant = new Date('2026-11-19T10:00:00');

Records.create('Deal', { deal_id: 'd-cave', nom: 'Cave à vin Paris III', statut: 'analyse', lots: [] });
const agent = Records.create('AgentImmo', { nom: 'Bilel Haddad', agence: 'WallPartners', ville: 'Paris' });
const liens = [M.lienPropre({ cle: 'deal:d-cave' }), M.lienPropre({ cle: `agent:${agent.id}` })];

// Ce que le modèle pourrait rendre sur la note de Maxime.
const brut = {
  nature: 'note',
  titre: 'Cave à vin : vendeur moins souple, voir avec Paul',
  fiches: [
    { lien: 'L1', elements: [
      { genre: 'maj', texte: 'Moins de marge de négociation : le vendeur est plus capricieux.' },
      { genre: 'decision', texte: 'On ne présente pas sans négociation intégrée.', raison: "L'emplacement est prime mais le deal date un peu." },
      { genre: 'ressenti', texte: 'Le dossier semble dater.' },
    ], etape: 'Analyse', blocage: 'Vendeur peu souple', resume: 'Cave à vin Paris III, emplacement prime, vendeur peu souple sur le prix.' },
    { lien: 'L2', elements: [{ genre: 'ressenti', texte: 'Bon contact, réactif.' }], resume: 'Agent chez WallPartners, apporte la cave à vin.' },
    { lien: 'L9', elements: [{ genre: 'maj', texte: 'Fiche inconnue : écartée.' }] },
  ],
  actions: [
    { titre: 'Demander à Paul si on creuse la cave à vin sans négociation', qui: 'moi', echeance: '2026-11-19', liens: ['L1'] },
    { titre: 'Faire un retour à Bilel', qui: 'assistant', liens: ['L1', 'L2'], brouillon: { canal: 'whatsapp', a: 'Bilel', texte: 'Bonjour Bilel, je reviens vers toi après avoir vu Paul.' } },
    { titre: 'Relire la LOI', qui: 'Paul', echeance: 'lundi' },
  ],
  questions: [{ texte: 'Le prix visé est-il net vendeur ?', choix: ['Oui', 'Non'], lien: 'L1' }],
  mentions: [{ texte: 'Comtesse du Barry', genre: 'bien' }, { texte: 'cave à vin', genre: 'bien' }, { texte: 'Paul', genre: 'agent' }],
};

test('la réponse du modèle est ramenée aux fiches liées, avec des ids, des dates valides et des personnes de l\'équipe', () => {
  const p = normaliser(brut, liens, { auteur: maxime.email });
  assert.equal(p.nature, 'note');
  assert.deepEqual(p.fiches.map((f) => f.cle), ['deal:d-cave', `agent:${agent.id}`]);
  const bien = p.fiches[0];
  assert.equal(bien.etape, 'Analyse');
  assert.equal(bien.blocage, 'Vendeur peu souple');
  // Un ressenti reste un ressenti, sur un bien aussi (l'onglet Notes) ; la raison ne reste que sur une décision.
  assert.deepEqual(bien.elements.map((e) => e.genre), ['maj', 'decision', 'ressenti']);
  assert.equal(bien.elements[1].raison, "L'emplacement est prime mais le deal date un peu.");
  assert.equal(p.fiches[1].elements[0].genre, 'ressenti');
  assert.equal(p.fiches[1].blocage, undefined);
  assert.deepEqual(p.actions.map((a) => a.qui), ['moi', 'assistant', 'Paul']);
  assert.deepEqual(p.actions.map((a) => a.genre), ['tache', 'whatsapp', 'tache'], 'un message prêt fait une action WhatsApp');
  assert.equal(p.actions[1].pour, 'Bilel');
  assert.equal(p.actions[2].echeance, null, 'une date qui n\'est pas ISO est laissée vide');
  assert.deepEqual(p.actions[2].fiches, ['deal:d-cave', `agent:${agent.id}`], 'sans lien, une action va sur toutes les fiches liées, le bien et la personne (24 nov. 2026)');
  assert.equal(p.questions[0].fiche, 'deal:d-cave');
  assert.deepEqual(p.mentions.map((m) => m.texte), ['Comtesse du Barry'], 'une mention déjà liée, ou un collègue, n\'est pas reproposée');
  const ids = [...p.fiches.flatMap((f) => [f.id, ...f.elements.map((e) => e.id)]), ...p.actions.map((a) => a.id), ...p.questions.map((q) => q.id)];
  assert.equal(new Set(ids).size, ids.length);
});

test('un brouillon vide fait d\'une action « assistant » une tâche pour soi ; une relance garde son contexte', () => {
  const p = normaliser({ nature: 'note', fiches: [], actions: [
    { genre: 'whatsapp', titre: 'Écrire à Bilel', qui: 'assistant' },
    { genre: 'appel', titre: 'Relance : appeler Bilel pour la copropriété', qui: 'moi', pour: 'Bilel', contexte: ['Les PV d\'AG des trois dernières années', '  '] },
  ], questions: [], mentions: [] }, liens);
  assert.equal(p.actions[0].qui, 'moi');
  assert.equal(p.actions[0].genre, 'tache');
  assert.equal(p.actions[1].genre, 'appel');
  assert.deepEqual(p.actions[1].contexte, ["Les PV d'AG des trois dernières années"]);
});

test('la consigne donne la date, l\'auteur, ses collègues et ce que la fiche sait déjà', () => {
  const c = consigne('Bilel rappelle lundi', liens, maxime, { maintenant });
  assert.match(c, /jeudi 2026-11-19/);
  assert.match(c, /Auteur : Maxime/);
  assert.match(c, /Paul/);
  assert.match(c, /L1 : dossier « Cave à vin Paris III »/);
  assert.match(c, /L2 : agent immobilier « Bilel Haddad » \(WallPartners · Paris\)/);
});

test('une demande à l\'assistant n\'est pas gardée comme note ; une note, si, sans rien ranger', async () => {
  const d = await proposer({ texte: 'Fais la LOI de la cave à vin', liens }, maxime, { maintenant, lire: async () => ({ nature: 'demande', fiches: [], actions: [], questions: [], mentions: [] }) });
  assert.equal(d.nature, 'demande');
  assert.equal(Records.count('NoteDossier'), 0);
  const etapes = [];
  const n = await proposer({ texte: 'Cave à vin : vendeur plus capricieux…', liens }, maxime, { maintenant, lire: async () => brut, surEtape: (t) => etapes.push(t) });
  assert.equal(etapes[0], 'Je lis ta note');
  assert.ok(etapes.includes("J'écris le message WhatsApp pour Bilel"));
  assert.ok(etapes.includes('Il me manque 1 précision'));
  assert.equal(n.nature, 'note');
  assert.equal(Records.get('NoteDossier', n.note_id).etat, 'proposee');
  assert.equal(Records.count('EntreeDossier'), 0);
  assert.equal(Records.count('ActionDossier'), 0);
  assert.equal((await proposer({ texte: 'x', liens: [] }, maxime)).ok, false);
});

test('au OK, seul ce qui est gardé se range ; la fiche, le jour et l\'annulation suivent', async () => {
  const n = await proposer({ texte: 'Cave à vin : vendeur plus capricieux, emplacement prime.', liens }, maxime, { maintenant, lire: async () => brut });
  const p = n.proposition;
  const bien = p.fiches[0];
  const garde = [bien.elements[0].id, bien.elements[1].id, `${bien.id}-etape`, `${bien.id}-blocage`, p.fiches[1].elements[0].id, p.actions[0].id, p.actions[1].id, p.actions[2].id];
  const r = M.rangerNote(Records.get('NoteDossier', n.note_id), {
    garde,
    modifs: { [p.actions[1].id]: { brouillon: 'Salut Bilel, je reviens vers toi lundi.' }, [p.actions[2].id]: { echeance: '2026-11-24' } },
    reponses: { [p.questions[0].id]: 'Oui' },
  }, maxime, { maintenant: () => maintenant });
  assert.equal(r.ok, true);
  assert.equal(r.actions, 3);

  const vue = M.ficheVue('deal:d-cave');
  assert.equal(vue.nom, 'Cave à vin Paris III');
  assert.equal(vue.etape, 'Analyse');
  assert.equal(vue.blocage, 'Vendeur peu souple');
  assert.match(vue.resume, /emplacement prime/);
  assert.equal(vue.decisions.length, 1);
  assert.match(vue.decisions[0].raison, /prime/);
  assert.equal(vue.journal.length, 1);
  assert.equal(vue.journal[0].brut, 'Cave à vin : vendeur plus capricieux, emplacement prime.');
  assert.ok(vue.journal[0].lignes.some((l) => l.genre === 'precision' && /net vendeur \? Réponse : Oui\./.test(l.texte)));
  assert.ok(!vue.journal[0].lignes.some((l) => /date/.test(l.texte)), 'un élément décoché ne se range pas');
  assert.equal(vue.prochaine.titre, 'Demander à Paul si on creuse la cave à vin sans négociation');
  assert.equal(vue.liees.length, 1);
  assert.equal(vue.liees[0].ressenti, 'Bon contact, réactif.');
  // La fiche de l'agent voit le bien.
  assert.equal(M.ficheVue(`agent:${agent.id}`).liees[0].cle, 'deal:d-cave');
  // L'assistant relit la note brute sur le dossier.
  assert.equal(Records.findBy('Deal', 'deal_id', 'd-cave').notes_equipe.length, 1);

  // L'action de Paul va chez Paul, à la date changée ; le message prêt chez Maxime.
  const jourMax = M.aujourdhui(maxime, { maintenant: () => maintenant });
  assert.deepEqual(jourMax.dues.map((a) => a.titre), ['Demander à Paul si on creuse la cave à vin sans négociation']);
  assert.equal(jourMax.prets[0].brouillon.texte, 'Salut Bilel, je reviens vers toi lundi.');
  const jourPaul = M.aujourdhui({ email: 'paul.dz@klocka.immo' }, { maintenant: () => maintenant });
  assert.equal(jourPaul.bientot[0].echeance, '2026-11-24');

  // Faite : une ligne au journal ; rouverte : la ligne s'en va.
  const action = jourMax.dues[0];
  M.changerAction(action.id, { statut: 'faite' }, maxime, { maintenant: () => new Date('2026-11-19T11:00:00') });
  assert.equal(M.ficheVue('deal:d-cave').journal[0].source, 'action');
  M.changerAction(action.id, { statut: 'ouverte' }, maxime);
  assert.equal(M.ficheVue('deal:d-cave').journal.length, 1);

  // Annulée : plus de journal, plus d'actions, plus de note sur le dossier ; une seconde fois, refusé.
  const note = Records.get('NoteDossier', n.note_id);
  assert.equal(M.rangerNote(note, {}, maxime).ok, false, 'une note rangée ne se range pas deux fois');
  assert.equal(M.annulerNote(note, maxime).ok, true);
  assert.equal(M.ficheVue('deal:d-cave').journal.length, 0);
  assert.equal(M.aujourdhui(maxime, { maintenant: () => maintenant }).dues.length, 0);
  assert.equal(Records.findBy('Deal', 'deal_id', 'd-cave').notes_equipe.length, 0);
  assert.equal(M.annulerNote(Records.get('NoteDossier', n.note_id), maxime).ok, false);
});

test('un lien inconnu de la plateforme est refusé ; une fiche du CRM garde le nom reçu', () => {
  assert.equal(M.lienPropre({ cle: 'deal:inconnu' }), null);
  assert.equal(M.lienPropre({ cle: 'n_importe_quoi' }), null);
  assert.deepEqual(M.lienPropre({ cle: 'twenty:agentImmobilier:abc', nom: 'Matis Breemesch' }), { cle: 'twenty:agentImmobilier:abc', genre: 'agent', nom: 'Matis Breemesch' });
  assert.equal(M.cleDuBien({ deal_id: 'd-cave' }), 'deal:d-cave');
});

test('le dossier : identité tirée du projet, avancement du plus récent au plus ancien, relance d\'une LOI sans réponse', async () => {
  const D = await import('./dossier.js');
  const maintenant2 = new Date('2026-11-19T10:00:00');
  Records.create('Deal', { deal_id: 'd-pharma', nom: 'Pharmacie', cree_le: '2026-10-02T09:00:00Z', statut: 'projet_cree',
    lots: [{ lot: { prix_fai: { valeur: 650000, absent: false }, locataire_activite: { valeur: 'Pharmacie', absent: false } }, evaluation: { verdict: 'FAVORABLE SOUS RÉSERVE' } }],
    documents_espace: [{ categorie: 'bail', nom: 'bail.pdf' }, { categorie: 'quittances', nom: 'q.pdf' }],
    suivi: [{ le: '2026-10-03T09:00:00Z', type: 'analyse', detail: 'FAVORABLE' }, { le: '2026-10-10T09:00:00Z', type: 'statut', vers: 'documents_recus' }] });
  Records.create('Project', { titre: 'Murs de pharmacie', deal_id: 'd-pharma', ville_secteur_champ1: 'Antibes', prix_acquisition: 650000, loyer_annuel_ht: 42250, created_date: '2026-10-18T09:00:00Z' });
  Records.create('LettreIntention', { deal_id: 'd-pharma', champs: { prix: '600000' }, cree_le: '2026-11-05T09:00:00Z' });
  const d = D.donneesDuBien('deal:d-pharma', { entrees: [], maintenant: maintenant2 });
  assert.equal(d.identite.ville, 'Antibes');
  assert.equal(d.identite.prix_lisible, '650 k€');
  assert.equal(d.identite.rendement_lisible, '6,5 %');
  assert.deepEqual(d.avancement.etapes.map((e) => e.nom), ['LOI', 'Projet', 'Documents', 'Pré-analyse', 'Fiche reçue']);
  assert.equal(d.avancement.etapes[0].courante, true);
  assert.equal(d.avancement.etapes[0].detail, '600 k€ proposés');
  assert.match(d.avancement.etapes[2].detail, /^2 reçus, PV d'AG et règlement de copropriété manquants/);
  assert.equal(d.avancement.etapes[3].detail, 'Favorable sous réserve');
  assert.equal(d.negociation.resume, 'Offre 600 k€ sur 650 k€ demandés');
  assert.match(d.suggestion.texte, /pas de réponse à la LOI depuis 14 jours/);
  // Une note récente fait taire la relance.
  assert.equal(D.donneesDuBien('deal:d-pharma', { entrees: [{ genre: 'maj', texte: 'x', le: '2026-11-18T09:00:00Z' }], maintenant: maintenant2 }).suggestion, null);
});

test('Une conversation WhatsApp importée : lue à part du texte tapé, jamais une demande, gardée sur la note', async () => {
  const conv = ['12/11/2026 09:15 - Maxime: Salut Bilel, le PV d\'AG ?', '12/11/2026 10:02 - Bilel Haddad: Le syndic traîne', '13/11/2026 18:40 - Bilel Haddad: Tu peux m\'envoyer le modèle de LOI ?'].join('\n');
  const etapes = [];
  let prompt = null;
  const r = await proposer({ texte: 'Il faut surtout noter le retard du syndic', liens, conversation: conv }, maxime, {
    maintenant, surEtape: (t) => etapes.push(t),
    lire: async () => { prompt = consigne('Il faut surtout noter le retard du syndic', liens, maxime, { maintenant, conversation: (await import('./whatsapp.js')).lireConversation(conv), ajout: 'Il faut surtout noter le retard du syndic' }); return { ...brut, nature: 'demande' }; },
  });
  assert.equal(r.nature, 'note');
  assert.match(etapes[0], /^Je lis la conversation WhatsApp : 3 messages/);
  assert.match(prompt, /écrit en l'important.*retard du syndic/);
  assert.match(prompt, /jamais une demande/);
  const n = Records.get('NoteDossier', r.note_id);
  assert.match(n.texte, /^Il faut surtout noter le retard du syndic\n\nConversation WhatsApp importée : 3 messages/);
  assert.equal(n.conversation, conv);
  const refus = await proposer({ texte: '', liens, conversation: 'pas une conversation' }, maxime, { maintenant, lire: async () => brut });
  assert.equal(refus.ok, false);
  assert.match(refus.error, /pas une conversation WhatsApp/);
});

test('« Lier » propose les fiches que la note nomme', async () => {
  const { nomsPropres, suggerer } = await import('./chercher.js');
  assert.deepEqual(nomsPropres('Appel avec Bilel Haddad ce matin. Maxime le rappelle lundi. Le vendeur est à Paris.', { exclure: ['Maxime'] }), ['Bilel Haddad', 'Paris']);
  const s = await suggerer({ texte: 'Bilel Haddad dit que la cave de Paris descend à 310 k€', noms: [] }, maxime, { equipe: ['Maxime'] });
  const agentPropose = s.find((x) => x.cle === `agent:${agent.id}`);
  assert.ok(agentPropose, JSON.stringify(s));
  assert.equal(agentPropose.pourquoi, '« Bilel Haddad » dans la note');
  const deConv = await suggerer({ texte: '', noms: ['Maxime', 'Bilel Haddad'] }, maxime, { equipe: ['Maxime'] });
  assert.equal(deConv[0].cle, `agent:${agent.id}`);
  assert.equal(deConv[0].pourquoi, '« Bilel Haddad » dans la conversation');
});

test('Pas de « Qui est … ? » sur une personne liée, connue ou de l\'équipe', async () => {
  const questions = [
    { texte: 'Qui est Bilel Haddad ?', choix: ['Un agent immobilier', 'Le courtier'] },
    { texte: 'Qui est Alexandre Lourenço ?', choix: ['Un agent immobilier', 'Le courtier'] },
    { texte: 'Qui est Rachel ?', choix: ['Une cliente', 'La banquière'] },
    { texte: 'Le prix de 310 k€ est-il net vendeur ?', choix: ['Oui', 'Non'] },
  ];
  const p = normaliser({ ...brut, questions }, liens, { auteur: maxime.email, connus: [{ cle: 'agent:x', genre: 'agent', nom: 'Alexandre LOURENCO' }] });
  assert.deepEqual(p.questions.map((q) => q.texte), ['Qui est Rachel ?', 'Le prix de 310 k€ est-il net vendeur ?']);
  assert.ok(p.questions.every((q) => q.choix.length === 0), 'aucun choix deviné : on répond dans le chat');
  const regle = consigne('Offre acceptée', liens, maxime, { maintenant });
  assert.match(regle, /Les fiches liées répondent d'abord/);
  assert.match(regle, /Jamais de choix proposés/);
  assert.match(regle, /L'agent lié, Bilel Haddad \(L2\), est celui qui a présenté le dossier/);
  assert.match(regle, /Le dossier lié, Cave à vin Paris III \(L1\)/);
  const avecClient = dejaDit([{ cle: 'twenty:clients:x', genre: 'client', nom: 'Thibaud COESSIN' }]);
  assert.match(avecClient, /Le client lié, Thibaud COESSIN \(L1\), est celui dont parle la note : « leur offre »/);
  assert.match(avecClient, /sans demander de qui elle vient/);
  const c = consigne('Alexandre Lourenço a appelé', liens, maxime, { maintenant, connus: [{ cle: 'agent:x', genre: 'agent', nom: 'Alexandre LOURENCO', detail: 'Citya · Dieppe' }] });
  assert.match(c, /- Alexandre LOURENCO : agent immobilier \(Citya · Dieppe\)/);
});

test('Pas de question pour faire confirmer ce qui est su (20 nov. 2026, Jules : « est-ce que c\'est bien ce dossier »)', () => {
  const questions = [
    { texte: "Quelle offre est concernée : est-ce bien l'offre MACSF, et sur quel dossier précisément ?" },
    { texte: 'Pour la date limite de la LOI, c\'est bien le 30 novembre 2026 ?' },
    { texte: 'La crèche concernée est-elle bien celle présentée par Alexandre Lourenço ?' },
    { texte: 'Quel est le montant de l\'offre acceptée ?' },
  ];
  const p = normaliser({ ...brut, questions }, liens, { auteur: maxime.email });
  assert.deepEqual(p.questions.map((q) => q.texte), ['Quel est le montant de l\'offre acceptée ?']);
  assert.match(consigne('Des nouvelles du dossier ?', liens, maxime, { maintenant }), /Jamais une question pour faire confirmer ce que tu sais déjà/);
  assert.match(dejaDit([{ cle: 'agent:x', genre: 'agent', nom: 'Sébastien ROBIC' }]), /« Le dossier », « l'offre », « les nouvelles » sans nom : le dossier que sa fiche dit en cours/);
});

test('Un nom en début de phrase, derrière un mot qui n\'en est pas un', async () => {
  const { nomsPropres } = await import('./chercher.js');
  assert.ok(nomsPropres('Eu Bilel Djaber au téléphone : le syndic a enfin envoyé le PV.').includes('Bilel Djaber'));
  assert.ok(nomsPropres('Rappelé Alexandre Lourenço ce matin.').includes('Alexandre Lourenço'));
});

test('Une même personne venue de Twenty et de la Prospection n\'apparaît qu\'une fois, avec son agence', async () => {
  const { unParNom } = await import('./chercher.js');
  const r = unParNom([
    { cle: 'twenty:agentImmobilier:1', genre: 'agent', nom: 'Alexandre LOURENCO', detail: 'Twenty CRM' },
    { cle: 'agent:a', genre: 'agent', nom: 'Alexandre Lourenço', detail: 'Citya · Dieppe' },
    { cle: 'agent:b', genre: 'agent', nom: 'Alexandre JOURDAN', detail: 'Abault · Montpellier' },
    { cle: 'agent:c', genre: 'agent', nom: 'Alexandre JOURDAN', detail: 'Orpi · Lyon' },
  ]);
  assert.deepEqual(r.map((x) => [x.cle, x.detail]), [
    ['twenty:agentImmobilier:1', 'Citya · Dieppe'],
    ['agent:b', 'Abault · Montpellier'],
    ['agent:c', 'Orpi · Lyon'],
  ]);
});

test('La fiche d\'un client de Twenty : son statut, ses moyens, ce qu\'il cherche, en quelques phrases', async () => {
  const { resumeClient } = await import('./clients-twenty.js');
  const r = resumeClient({ name: 'Christophe LEPAS', statutClient: 'RECHERCHE', mandatSigne: 'MANDAT_SIGNE', budget: 700000, fondPropre: 130000, revenu: 50000,
    lieuDeRecherche: 'Proche Bretagne / Normandie', localisation: { addressCity: 'Saint-Lô' }, patrimoine: '3 IDR', fonction: '', information: '', remarque: 'pas de restaurant', source: 'LA_MARTINGALE', personnes: 'Paul De Zulueta' });
  assert.equal(r, 'En recherche, mandat signé. Budget 700 k€, fonds propres 130 k€, revenus 50 k€ par an. Cherche : Proche Bretagne / Normandie. Vit à Saint-Lô. Patrimoine : 3 IDR. À noter : pas de restaurant. Venu par La Martingale, suivi par Paul De Zulueta.');
  assert.equal(resumeClient({ name: 'Vide', patrimoine: 'RAS' }), null);
});

test('Les dossiers d\'un agent que la plateforme connaît : son nom dans l\'analyse, ou son adresse dans le mail transféré', async () => {
  const { dossiersQuiNomment } = await import('./modele.js');
  const { Records } = await import('../db.js');
  const a = Records.create('Deal', { deal_id: `test-nomme-${Date.now()}`, statut: 'analyse', lots: [{ synthese: { titre: 'Local Quimper' }, evaluation: { lignes: [{ element: 'Agence', constat: 'conseiller Yannick KERVELLA, secteur Quimper' }] } }] });
  const b = Records.create('Deal', { deal_id: `test-nomme-b-${Date.now()}`, statut: 'analyse', source: { texte_source: 'y kervella <ykervella@exemple-agence.bzh>' } });
  const trouves = dossiersQuiNomment('Yannick KERVELLA', { emails: ['ykervella@exemple-agence.bzh'] }).map((d) => d.cle);
  assert.ok(trouves.includes(`deal:${a.deal_id}`));
  assert.ok(trouves.includes(`deal:${b.deal_id}`));
  assert.deepEqual(dossiersQuiNomment('Yannick', {}), []);
});

test('L\'étape est celle que la note dit : « Offre · non contresignée » passe devant « Projet » de la plateforme', async () => {
  const { avancement } = await import('./dossier.js');
  const deal = { deal_id: 'x', cree_le: '2026-10-29T07:00:00.000Z', suivi: [{ vers: 'projet_cree', le: '2026-10-30T14:57:00.000Z' }] };
  const av = avancement({ deal, projet: null }, { etapesNotees: [{ etape: 'Offre', detail: 'non contresignée pour l\'instant', le: '2026-11-19T14:15:00.000Z' }] });
  assert.deepEqual(av.etapes.slice(0, 2).map((e) => [e.nom, e.detail || null, e.courante]), [['Offre', 'non contresignée pour l\'instant', true], ['Projet', null, false]]);
  const p = normaliser({ nature: 'note', titre: 'MACSF', fiches: [{ lien: 'L1', elements: [], etape: 'Offre', etat: 'non contresignée pour l\'instant' }], actions: [], questions: [], mentions: [] },
    [{ cle: 'deal:x', genre: 'bien', nom: 'MACSF' }], { auteur: 'jules@klocka.immo' });
  assert.equal(p.fiches[0].etape, 'Offre');
  assert.equal(p.fiches[0].etat, 'non contresignée pour l\'instant');
});

test('La carte du dossier : le client et sa position, le vendeur, l\'agent, et qui de l\'équipe y a travaillé', async () => {
  const deal = Records.create('Deal', { deal_id: `carte-${Date.now()}`, statut: 'projet_cree', lots: [] });
  const bien = { cle: `deal:${deal.deal_id}`, genre: 'bien', nom: 'Local Vannes' };
  const client = { cle: 'twenty:clients:carte-1', genre: 'client', nom: 'Hélène Morvan' };
  const autre = { cle: 'twenty:clients:carte-2', genre: 'client', nom: 'Yves Le Bihan' };
  const lus = [bien, client, autre];
  const n = await proposer({ texte: 'Vannes : Hélène fait une offre, Yves ne suit pas. Les vendeurs sont deux frères.', liens: lus }, maxime, { maintenant, lire: async () => ({
    nature: 'note', titre: 'Vannes', actions: [], questions: [], mentions: [],
    fiches: [
      { lien: 'L1', elements: [{ genre: 'maj', texte: 'Deux acheteurs positionnés.' }], vendeur: 'deux frères' },
      { lien: 'L2', elements: [], position: 'offre' },
      { lien: 'L3', elements: [], position: 'abandon' },
    ],
  }) });
  assert.equal(M.rangerNote(Records.get('NoteDossier', n.note_id), {}, maxime).ok, true);
  const carte = M.ficheVue(bien.cle).carte;
  assert.equal(carte.vendeur, 'deux frères');
  assert.deepEqual(carte.clients.map((c) => [c.nom, c.position]), [['Hélène Morvan', 'offre'], ['Yves Le Bihan', 'abandon']]);
  assert.equal(carte.equipe[0].prenom, 'Maxime');
  assert.ok(carte.equipe[0].liens.includes(bien.cle));
});

test('Une relance dite au chat devient une prochaine action de la fiche, et sort dans « Aujourd\'hui » le jour venu', () => {
  Records.create('Deal', { deal_id: 'd-relance', nom: 'MACSF Lorient', statut: 'analyse', lots: [], contact: { email: 'srobic@exemple.bzh' } });
  const seb = Records.create('AgentImmo', { nom: 'Sébastien Robic', emails: ['srobic@exemple.bzh'] });
  const r = M.poserProchaineAction({ dealId: 'd-relance', quoi: "relancer l'agent pour l'offre contresignée du vendeur", echeance: '2026-11-20', user: maxime }, { maintenant: () => maintenant });
  assert.equal(r.ok, true);
  assert.equal(r.action.genre, 'appel');
  assert.equal(r.action.titre, "Relancer l'agent pour l'offre contresignée du vendeur");
  assert.equal(r.action.pour, 'Sébastien Robic');
  assert.deepEqual(r.action.fiches.map((f) => f.cle), ['deal:d-relance', `agent:${seb.id}`]);
  assert.ok(M.ficheVue('deal:d-relance').actions.some((a) => a.id === r.action.id), "dans l'onglet Prochaine action");
  assert.ok(M.aujourdhui(maxime, { maintenant: () => maintenant }).bientot.some((a) => a.id === r.action.id), 'dans les sept jours la veille');
  assert.ok(M.aujourdhui(maxime, { maintenant: () => new Date('2026-11-20T09:00:00') }).dues.some((a) => a.id === r.action.id), 'due le jour même');
  assert.equal(M.poserProchaineAction({ dealId: 'inconnu', quoi: 'x', user: maxime }).ok, false);
  assert.equal(M.retirerProchaineAction(r.action.id).ok, true);
  assert.equal(M.ficheVue('deal:d-relance').actions.length, 0);
});

test('Les mails d\'un agent : lus sans la partie citée, proposés comme une note liée à lui et à ses dossiers, relus seulement s\'il a écrit depuis', async () => {
  const { lireAgent, sansCitation } = await import('./mails-agents.js');
  assert.equal(sansCitation('Bonjour, la taxe foncière est jointe.\n\nLe 12 nov. 2026 à 10:02, Jules a écrit :\n> tu as la taxe ?'), 'Bonjour, la taxe foncière est jointe.');
  const agent = Records.create('AgentImmo', { nom: 'Gwenaël TANGUY', emails: ['g.tanguy@agence-exemple.bzh'] });
  Records.create('Deal', { deal_id: `mails-${Date.now()}`, statut: 'analyse', lots: [{ evaluation: { lignes: [{ constat: 'conseiller Gwenaël TANGUY' }] } }] });
  const boite = {
    m1: { gmail_message_id: 'm1', date: '2026-11-10T09:00:00.000Z', de: 'Gwenaël TANGUY <g.tanguy@agence-exemple.bzh>', de_email: 'g.tanguy@agence-exemple.bzh', objet: 'Local Quimperlé', texte: 'Bonjour, le vendeur accepte 280 k€.\n\nLe 9 nov. Jules a écrit :\n> une offre à 270 ?' },
    m2: { gmail_message_id: 'm2', date: '2026-11-08T09:00:00.000Z', de: 'Jules <jules.b@klocka.immo>', de_email: 'jules.b@klocka.immo', objet: 'Local Quimperlé', texte: 'Peux-tu demander au vendeur ?' },
  };
  const vus = [];
  const proposerFaux = async (n) => { vus.push(n); return { ok: true, note_id: 'note-mails-1' }; };
  const o = { comptes: ['jules.b@klocka.immo'], user: maxime, lister: async () => ({ ids: ['m1', 'm2'] }), lire: async (_c, id) => boite[id], proposer: proposerFaux, maintenant: new Date('2026-11-19T12:00:00Z') };
  const r = await lireAgent(agent, o);
  assert.equal(r.mails, 2);
  assert.equal(r.note_id, 'note-mails-1');
  assert.deepEqual(vus[0].liens.map((l) => l.genre), ['agent', 'bien']);
  assert.match(vus[0].texte, /de Gwenaël TANGUY · objet : Local Quimperlé/);
  assert.ok(vus[0].texte.indexOf('Peux-tu demander') < vus[0].texte.indexOf('le vendeur accepte'), 'du plus ancien au plus récent');
  assert.doesNotMatch(vus[0].texte, /une offre à 270/);
  const encore = await lireAgent(agent, o);
  assert.equal(encore.rien, 'rien de neuf');
  assert.equal(vus.length, 1);
});

test('Mes notes : les siennes, de la plus récente à la plus ancienne, avec leur état et une recherche ; une note ouverte dit ce qui en a été rangé', () => {
  const notes = M.mesNotes(maxime);
  assert.ok(notes.length >= 2);
  assert.ok(notes.every((n, i) => i === 0 || String(notes[i - 1].le) >= String(n.le)));
  assert.ok(notes.every((n) => ['En attente de validation', 'Rangée', 'Écartée', 'Annulée'].includes(n.etat_lisible)));
  assert.ok(M.mesNotes({ email: 'personne@klocka.immo' }).length === 0, 'les notes des autres ne sont pas les miennes');
  const vannes = M.mesNotes(maxime, { q: 'vannes yves' });
  assert.equal(vannes.length, 1);
  const r = M.noteEtRangement(vannes[0].id);
  assert.equal(r.etat_lisible, 'Rangée');
  assert.match(r.texte, /Hélène fait une offre/);
  assert.ok(r.rangement.some((f) => f.lignes.some((l) => l.texte === 'Deux acheteurs positionnés.')));
});

test('Les fiches récentes : celles que la personne a ouvertes, la plus récente en haut, rien de celles des autres', () => {
  const moi = { email: 'recentes@klocka.immo' };
  M.noterOuverture('twenty:clients:carte-1', moi, { maintenant: new Date('2026-11-19T09:00:00Z') });
  M.noterOuverture('twenty:clients:carte-2', moi, { maintenant: new Date('2026-11-19T10:00:00Z') });
  M.noterOuverture('twenty:clients:carte-1', moi, { maintenant: new Date('2026-11-19T11:00:00Z') });
  const r = M.fichesRecentesDe(moi);
  assert.deepEqual(r.map((f) => f.cle), ['twenty:clients:carte-1', 'twenty:clients:carte-2']);
  assert.equal(r[0].sous.split(' · ')[0], 'Client');
  assert.deepEqual(M.fichesRecentesDe({ email: 'autre@klocka.immo' }), [], 'chacun sa liste');
});

test('Lier tout seul : un client décrit sans être nommé se propose par ce qui le distingue (un sigle), pas par les mots de tous les jours', async () => {
  const { clientsDecrits } = await import('./chercher.js');
  Records.create('FicheDossier', { cle: 'twenty:clients:devine-1', genre: 'client', nom: 'Adrien TESTMINA', resume: 'En recherche, mandat signé. Budget 400 k€. SG Private Banking + consultante. Vit à Nice.', liees: [] });
  Records.create('FicheDossier', { cle: 'twenty:clients:devine-2', genre: 'client', nom: 'Paul TESTAUTRE', resume: 'En recherche. Client sérieux, veut faire une offre. Vit à Lyon.', liees: [] });
  for (let i = 0; i < 8; i++) Records.create('FicheDossier', { cle: `twenty:clients:devine-x${i}`, genre: 'client', nom: `Client ${i}`, resume: `En recherche, budget ${i}00 k€, vit à Paris.`, liees: [] });
  const r = clientsDecrits('Mec sérieux en banque à la SG, il pense faire une offre à 340 000 €');
  assert.equal(r[0]?.nom, 'Adrien TESTMINA');
  assert.ok(!r.some((c) => c.nom === 'Paul TESTAUTRE'), '« sérieux », « faire », « offre » ne désignent personne');
  assert.deepEqual(clientsDecrits('Vit à Lyon, rien d\'autre', { sauf: ['lyon'] }), []);
});

test('Lier tout seul : le contexte, c\'est le dossier ; ses clients passent devant toute devinette, avec leur position', async () => {
  const { suggererPourLier } = await import('./chercher.js');
  const deal = Records.create('Deal', { deal_id: `ctx-${Date.now()}`, statut: 'analyse', lots: [] });
  const cle = `deal:${deal.deal_id}`;
  Records.create('FicheDossier', { cle, genre: 'bien', nom: 'Local Brest', liees: [{ cle: 'twenty:clients:ctx-1', genre: 'client', nom: 'Morgane KERDILES', position: 'positionne' }] });
  const r = await suggererPourLier({ texte: 'Il a rappelé, il hésite sur le financement, la banque traîne', liens: [cle] }, maxime);
  const c = r.choix.find((x) => x.mot === 'Client ?');
  assert.deepEqual(c?.options[0], { cle: 'twenty:clients:ctx-1', genre: 'client', nom: 'Morgane KERDILES', detail: 'Positionné' });
  const deja = await suggererPourLier({ texte: 'Il a rappelé, il hésite', liens: [cle, 'twenty:clients:ctx-1'] }, maxime);
  assert.ok(!deja.choix.some((x) => x.mot === 'Client ?'), 'un client déjà lié : plus de question');
});

test('Les questions préparées pour l\'agent restent toutes sur la relance', () => {
  const qs = ['Le vendeur a-t-il contresigné ?', 'Le locataire reste-t-il ?', 'Le bail a-t-il été renouvelé ?', 'Y a-t-il des travaux votés ?', 'La taxe foncière est-elle refacturée ?', 'Quel délai pour le compromis ?'];
  const r = M.poserProchaineAction({ dealId: 'd-relance', quoi: "Rappeler l'agent", aDemander: qs, user: maxime }, { maintenant: () => maintenant });
  assert.deepEqual(r.action.contexte, qs, 'six questions, dans l\'ordre, aucune fusionnée');
  const n = normaliser({ nature: 'note', titre: 't', fiches: [], actions: [{ titre: 'Relance : appeler Bilel', genre: 'appel', qui: 'moi', contexte: [...qs, ...qs], liens: ['L1'] }] }, liens);
  assert.equal(n.actions[0].contexte.length, 10, 'jusqu\'à dix depuis une note');
  M.retirerProchaineAction(r.action.id);
});

test('Une date dite avec ses mots : lundi, demain, dans deux semaines, le 28, 3 décembre, fin du mois', async () => {
  const { dateDite } = await import('../../src/lib/date-dite.js');
  const jeudi = new Date(2026, 10, 19, 15, 0); // jeudi 19 nov. 2026
  const cas = {
    lundi: '2026-11-23', 'Lundi matin': '2026-11-23', jeudi: '2026-11-26', demain: '2026-11-20', 'après-demain': '2026-11-21',
    "aujourd'hui": '2026-11-19', 'ce soir': '2026-11-19', 'dans 3 jours': '2026-11-22', 'dans deux semaines': '2026-12-03',
    'dans un mois': '2026-12-19', 'la semaine prochaine': '2026-11-23', 'fin de semaine': '2026-11-20', 'fin du mois': '2026-11-30',
    'le 28': '2026-11-28', 'le 5': '2026-12-05', '3 décembre': '2026-12-03', '1er décembre': '2026-12-01', '28/11': '2026-11-28',
    'jeudi 27': '2026-11-27', 'mardi en huit': '2026-12-01', 'dans quinze jours': '2026-12-03',
  };
  for (const [dit, attendu] of Object.entries(cas)) assert.equal(dateDite(dit, jeudi), attendu, dit);
  assert.equal(dateDite('je ne sais pas', jeudi), null);
});

test('L\'onglet Notes : les ressentis d\'une fiche, à part de l\'historique', () => {
  const cle = 'twenty:clients:notes-1';
  Records.create('FicheDossier', { cle, genre: 'client', nom: 'Client NOTES', liees: [] });
  Records.create('EntreeDossier', { fiche_cle: cle, genre: 'ressenti', texte: 'Raisonne comme un banquier, prudent.', note_id: 'n-notes', par: 'maxime@klocka.immo', le: '2026-11-19T10:00:00.000Z' });
  Records.create('EntreeDossier', { fiche_cle: cle, genre: 'maj', texte: 'Budget 400 k€.', note_id: 'n-notes', par: 'maxime@klocka.immo', le: '2026-11-19T10:00:00.000Z' });
  const v = M.ficheVue(cle);
  assert.deepEqual(v.notes.map((x) => x.texte), ['Raisonne comme un banquier, prudent.']);
  assert.ok(v.journal.every((j) => j.lignes.every((l) => l.genre !== 'ressenti')), 'plus dans l\'historique');
});

test('Le classement de Jules : l\'événement fait la ligne d\'historique, un chiffre du bien se reporte dans le projet sur un oui, une promesse devient une attente avec sa relance', async () => {
  const projet = Records.create('Project', { titre: 'Local Quimper', taxe_fonciere_an: null });
  const bien = { cle: `projet:${projet.id}`, genre: 'bien', nom: 'Local Quimper' };
  const agent = Records.create('AgentImmo', { nom: 'Yann LE GOFF', emails: [] });
  const lAgent = { cle: `agent:${agent.id}`, genre: 'agent', nom: 'Yann LE GOFF' };
  const n = await proposer({ texte: 'Eu Le Goff : la taxe foncière est de 2 400 €, il me l\'envoie par mail demain. Un peu lent mais fiable.', liens: [bien, lAgent] }, maxime, { maintenant, lire: async () => ({
    nature: 'note', titre: 'Taxe foncière Quimper', mentions: [], questions: [],
    fiches: [
      { lien: 'L1', elements: [{ genre: 'evenement', texte: 'Appel avec Yann Le Goff à propos de la taxe foncière' }, { genre: 'maj', texte: 'Taxe foncière : 2 400 € par an.' }], donnees: [{ champ: 'taxe_fonciere_an', valeur: '2 400' }, { champ: 'inconnu', valeur: 'x' }] },
      { lien: 'L2', elements: [{ genre: 'evenement', texte: 'Appel à propos de la taxe foncière de Quimper' }, { genre: 'ressenti', texte: 'Un peu lent mais fiable.' }] },
    ],
    actions: [
      { genre: 'attente', titre: 'Recevoir le mail de Yann Le Goff avec la taxe foncière', qui: 'moi', echeance: '2026-11-20', liens: ['L1', 'L2'] },
      { genre: 'appel', titre: 'Relancer Yann Le Goff si la taxe foncière n\'est pas arrivée', qui: 'moi', pour: 'Yann Le Goff', liens: ['L2'] },
    ],
  }) });
  const note = Records.get('NoteDossier', n.note_id);
  const q = note.proposition.questions.find((x) => x.maj_projet);
  assert.equal(q.texte, 'Je mets à jour le projet Local Quimper : la taxe foncière à 2 400 € par an ?');
  assert.deepEqual(q.choix, ['Oui', 'Non']);
  assert.equal(note.proposition.questions.filter((x) => x.maj_projet).length, 1, 'un champ inconnu est écarté');
  assert.equal(note.proposition.actions[0].genre, 'attente');
  const relance = note.proposition.actions[1].id;
  assert.equal(M.rangerNote(note, { reponses: { [q.id]: 'oui' }, modifs: { [relance]: { echeance: '2026-11-23' } } }, maxime).ok, true);
  assert.equal(Records.get('Project', projet.id).taxe_fonciere_an, 2400);
  const vb = M.ficheVue(bien.cle);
  assert.equal(vb.journal[0].titre, 'Appel avec Yann Le Goff à propos de la taxe foncière');
  assert.ok(vb.journal[0].lignes.some((l) => l.genre === 'projet' && /Taxe foncière 2/.test(l.texte)));
  assert.ok(vb.journal[0].lignes.every((l) => l.genre !== 'evenement'));
  const va = M.ficheVue(lAgent.cle);
  assert.equal(va.journal[0].titre, 'Appel à propos de la taxe foncière de Quimper');
  assert.deepEqual(va.notes.map((x) => x.texte), ['Un peu lent mais fiable.']);
  assert.deepEqual(va.actions.map((a) => [a.genre, a.echeance]).sort(), [['appel', '2026-11-23'], ['attente', '2026-11-20']]);
});

test('Un client a son avancement : l\'étape d\'un client est gardée', () => {
  const p = normaliser({ nature: 'note', titre: 'x', fiches: [{ lien: 'L1', elements: [], etape: 'En recherche' }], actions: [], questions: [], mentions: [] },
    [{ cle: 'twenty:clients:av-1', genre: 'client', nom: 'Client AV' }], { auteur: 'jules@klocka.immo' });
  assert.equal(p.fiches[0].etape, 'En recherche');
});

test('« À faire » : les actions ouvertes de la personne, le dû d\'abord, puis les dates, puis sans date', () => {
  const moi = { email: 'afaire@klocka.immo' };
  const cree = (titre, echeance) => Records.create('ActionDossier', { titre, echeance, statut: 'ouverte', responsable: moi.email, fiches: [], genre: 'appel' });
  cree('Sans date', null);
  cree('Plus tard', '2026-11-27');
  cree('En retard', '2026-11-18');
  cree('Aujourd\'hui', '2026-11-20');
  Records.create('ActionDossier', { titre: 'Pas à moi', echeance: '2026-11-20', statut: 'ouverte', responsable: 'autre@klocka.immo', fiches: [] });
  const r = M.mesActions(moi, { maintenant: new Date('2026-11-20T09:00:00') });
  assert.deepEqual(r.map((a) => [a.titre, a.du]), [['En retard', true], ['Aujourd\'hui', true], ['Plus tard', false], ['Sans date', false]]);
});

test('Après l\'appel : la relance prévue se ferme avec le OK, ses questions sans réponse passent sur la suivante, le numéro de l\'agent la suit', async () => {
  const agent = Records.create('AgentImmo', { nom: 'Alexandre LOURENCO', telephones: ['06 60 76 41 04'], emails: [] });
  const lAgent = { cle: `agent:${agent.id}`, genre: 'agent', nom: 'Alexandre LOURENCO' };
  const prevue = Records.create('ActionDossier', { titre: 'Relance : appeler Alexandre Lourenço pour Basic Fit et la crèche', genre: 'appel', pour: 'Alexandre Lourenço', statut: 'ouverte', responsable: maxime.email, fiches: [lAgent.cle],
    contexte: ['Le bail Basic Fit est-il de 10 ans fermes ?', 'Le loyer de la crèche est-il HC HT ?', 'Vos honoraires sont-ils inclus ?'] });
  assert.equal(M.ficheVue(lAgent.cle).actions.find((a) => a.id === prevue.id).telephone, '06 60 76 41 04');
  let prompt = '';
  const n = await proposer({ texte: 'Eu Alexandre : Basic Fit 10 ans fermes, honoraires inclus. La crèche il ne sait pas. Je le rappelle jeudi.', liens: [lAgent] }, maxime, { maintenant, lire: async () => {
    return { nature: 'note', titre: 'Appel Lourenço', mentions: [], questions: [],
      fiches: [{ lien: 'L1', elements: [{ genre: 'evenement', texte: 'Appel avec Alexandre Lourenço à propos de Basic Fit et de la crèche' }] }],
      faites: [{ action: 'A1', restees: ['Le loyer de la crèche est-il HC HT ?'] }, { action: 'A9' }],
      actions: [{ genre: 'appel', titre: 'Relance : rappeler Alexandre Lourenço pour la crèche', qui: 'moi', pour: 'Alexandre Lourenço', echeance: '2026-11-26', liens: ['L1'], contexte: ['Lui dire que la crèche nous intéresse'] }] };
  } });
  prompt = consigne('x', [lAgent], maxime, { maintenant, prevues: M.prevuesDes([lAgent]) });
  assert.match(prompt, /A1 : Relance : appeler Alexandre Lourenço pour Basic Fit/);
  assert.match(prompt, /- Le loyer de la crèche est-il HC HT \?/);
  const note = Records.get('NoteDossier', n.note_id);
  assert.equal(note.proposition.faites.length, 1, 'une référence inconnue est écartée');
  assert.equal(note.proposition.faites[0].libelle, 'Appel à Alexandre Lourenço fait');
  const suite = note.proposition.actions[0];
  assert.deepEqual(suite.contexte, ['Lui dire que la crèche nous intéresse', 'Le loyer de la crèche est-il HC HT ?']);
  assert.equal(suite.reprises, 1);
  assert.equal(suite.telephone, '06 60 76 41 04');
  const r = M.rangerNote(note, {}, maxime);
  assert.equal(r.faites, 1);
  assert.equal(Records.get('ActionDossier', prevue.id).statut, 'faite');
  const vue = M.ficheVue(lAgent.cle);
  assert.ok(vue.journal.every((j) => j.source !== 'action'), 'pas de « Fait : » en plus de l\'événement');
  assert.ok(!M.mesActions(maxime).some((a) => a.id === prevue.id));
  // Annuler la note rouvre la relance.
  M.annulerNote(Records.get('NoteDossier', n.note_id), maxime);
  assert.equal(Records.get('ActionDossier', prevue.id).statut, 'ouverte');
});

test('Une relance faite sans suite proposée : ses questions restées deviennent une relance à programmer', () => {
  const agent = Records.create('AgentImmo', { nom: 'Paul Martin', telephones: [] });
  const l = { cle: `agent:${agent.id}`, genre: 'agent', nom: 'Paul Martin' };
  const prevues = [{ ref: 'A1', id: 'x1', genre: 'appel', titre: 'Appeler Paul', pour: 'Paul Martin', contexte: [], fiches: [l.cle] }];
  const p = normaliser({ nature: 'note', titre: 'x', fiches: [], actions: [], questions: [], mentions: [], faites: [{ action: 'a1', restees: ['La surface exacte ?'] }] }, [l], { prevues });
  assert.equal(p.faites[0].action_id, 'x1');
  assert.equal(p.actions.length, 1);
  assert.equal(p.actions[0].genre, 'appel');
  assert.equal(p.actions[0].echeance, null);
  assert.deepEqual(p.actions[0].contexte, ['La surface exacte ?']);
  assert.deepEqual(p.actions[0].fiches, [l.cle]);
});

test('La fiche d\'appel du chat : la note prise depuis elle est le compte rendu de la relance ; un enregistrement se lit comme une transcription', async () => {
  const agent = Records.create('AgentImmo', { nom: 'Claire Benoit', telephones: ['06 11 22 33 44'] });
  const l = { cle: `agent:${agent.id}`, genre: 'agent', nom: 'Claire Benoit' };
  const a = Records.create('ActionDossier', { titre: 'Relance : appeler Claire Benoit', genre: 'appel', pour: 'Claire Benoit', statut: 'ouverte', responsable: maxime.email, fiches: [l.cle], contexte: ['Le loyer ?'] });
  const prevues = M.prevuesDes([l]);
  const c = consigne('bla', [l], maxime, { maintenant, prevues, suite: a.id, transcription: true });
  assert.match(c, /transcription automatique/);
  assert.match(c, /compte rendu de l'action A1/);
  assert.doesNotMatch(consigne('bla', [l], maxime, { maintenant, prevues }), /compte rendu de l'action/);
  const n = await proposer({ texte: 'Bonjour Claire, le loyer est de 30 000 euros hors charges.', liens: [l], action_id: a.id, transcription: true }, maxime, { maintenant, lire: async () => ({ nature: 'note', titre: 'Appel Claire', fiches: [], actions: [], questions: [], mentions: [], faites: [{ action: 'A1', restees: [] }] }) });
  const note = Records.get('NoteDossier', n.note_id);
  assert.equal(note.action_id, a.id);
  assert.equal(note.transcription, true);
  assert.equal(note.proposition.faites[0].action_id, a.id);
});

test('Le mode Enregistrement : les morceaux à leur rang, un morceau renvoyé remplace l\'ancien, un long texte garde son début et sa fin', async () => {
  const E = await import('./enregistrement.js');
  const e = E.creer(maxime);
  E.poserMorceau(e, 1, 'deuxième');
  E.poserMorceau(Records.get('EnregistrementRdv', e.id), 0, 'premier');
  const apres = E.poserMorceau(Records.get('EnregistrementRdv', e.id), 1, 'deuxième, renvoyé');
  assert.equal(E.texteDe(apres), 'premier\ndeuxième, renvoyé');
  assert.equal(E.vue(apres).prochain, 2);
  assert.equal(E.enCoursDe(maxime).id, e.id);
  assert.equal(E.lire(e.id, { email: 'autre@klocka.immo' }), null, 'l\'enregistrement d\'un autre ne se lit pas');
  E.finir(apres);
  assert.equal(E.enCoursDe(maxime), null);
  const long = `${'a'.repeat(30000)}${'b'.repeat(30000)}`;
  const l = E.lisible(long, 40000);
  assert.ok(l.length < 40100 && l.startsWith('a') && l.endsWith('b') && /omis/.test(l));
});

test('Une réponse d\'un trait aux questions d\'une note se répartit entre elles, sans en inventer', async () => {
  const { repartirReponses } = await import('./ranger.js');
  const note = { reponses: { q1: 'déjà répondu' }, proposition: { questions: [{ id: 'q1', texte: 'Le prix ?' }, { id: 'q2', texte: 'Qui vend ?' }, { id: 'q3', texte: 'La surface ?', choix: ['80 m²', '120 m²'] }, { id: 'q4', texte: 'Le locataire ?' }] } };
  let prompt = '';
  const r = await repartirReponses(note, 'Ce sont les héritiers Le Goff qui vendent, et c\'est 120 m².', maxime, { lire: async () => ({ reponses: [{ question: 'Q1 : Qui vend ?', reponse: 'les héritiers Le Goff' }, { question: 'Q2', reponse: '120 m²' }, { question: 'Q9', reponse: 'x' }] }) });
  assert.deepEqual(r.reponses, { q2: 'les héritiers Le Goff', q3: '120 m²' });
  assert.equal(prompt, '');
  assert.deepEqual((await repartirReponses(note, '', maxime, { lire: async () => ({}) })).reponses, {});
});

test('Mode Enregistrement : les fiches se mettent à jour à la fin d\'un sujet, pas à heure fixe', async () => {
  const E = await import('./enregistrement.js');
  assert.deepEqual(await E.sujetClos('Bonjour, oui ça va.', maxime, { lire: () => { throw new Error('pas lu'); } }), { clos: false, raison: 'trop court' }, 'trop court : aucun appel au modèle');
  const passage = "Le loyer est de 42 000 euros par an, le bail a été renouvelé en 2022 pour neuf ans, le locataire est une pharmacie installée depuis vingt ans. Et du coup, pour le financement, vous partiriez sur combien d'apport ?";
  const vu = [];
  const r = await E.sujetClos(passage, maxime, { lire: async () => { vu.push(1); return { clos: true, raison: 'passe du bail au financement' }; } });
  assert.deepEqual(r, { clos: true, raison: 'passe du bail au financement' });
  assert.equal(vu.length, 1);
  const c = E.consigneSujet(passage);
  assert.match(c, /un autre sujet/);
  assert.match(c, /pose une question/);
  assert.ok(c.includes(passage));
});

test('Les agents préférés : une étoile par personne et par agent, cinq au plus, toute l\'équipe les voit', async () => {
  const P = await import('./preferes.js');
  const moi = { email: 'etoiles@klocka.immo' };
  const autre = { email: 'coralie.e@klocka.immo' };
  const agents = Array.from({ length: 6 }, (_, i) => Records.create('AgentImmo', { nom: `Agent Étoile ${i}` }));
  for (const a of agents.slice(0, 5)) assert.equal(P.basculerPrefere(moi, `agent:${a.id}`).ok, true);
  const refus = P.basculerPrefere(moi, `agent:${agents[5].id}`);
  assert.equal(refus.ok, false);
  assert.match(refus.error, /5 agents préférés/);
  assert.equal(P.basculerPrefere(moi, `agent:${agents[0].id}`).etoile, false, 'un second clic retire l\'étoile');
  assert.equal(P.basculerPrefere(moi, `agent:${agents[5].id}`).ok, true);
  P.basculerPrefere(autre, `agent:${agents[1].id}`);
  const vue = P.etoiles(moi);
  const a1 = vue.agents.find((x) => x.cle === `agent:${agents[1].id}`);
  assert.equal(a1.moi, true);
  assert.equal(a1.par.length, 2);
  assert.equal(a1.nom, 'Agent Étoile 1');
  assert.equal(P.etoiles(autre).agents.find((x) => x.cle === `agent:${agents[2].id}`).moi, false);
  assert.equal(P.basculerPrefere(moi, 'deal:x').ok, false);
});

test('Une note écrite sur la fiche, onglet Notes : gardée telle quelle, sans l\'assistant', () => {
  const a = Records.create('AgentImmo', { nom: 'Sébastien Robic', agence: 'Robic Immobilier' });
  const cle = `agent:${a.id}`;
  assert.equal(M.noterSurLaFiche(cle, '   ', maxime).ok, false);
  assert.equal(M.noterSurLaFiche('agent:inconnu', 'x', maxime).ok, false);
  const r = M.noterSurLaFiche(cle, '  Va bientôt envoyer de nouveaux dossiers :  demander les documents. ', maxime, { maintenant });
  assert.equal(r.ok, true);
  assert.equal(r.note.texte, 'Va bientôt envoyer de nouveaux dossiers : demander les documents.');
  const n = M.ficheVue(cle).notes.find((x) => x.id === r.note.id);
  assert.equal(n.rangee, false);
  assert.equal(n.par, 'Maxime');
});

test('Retirer un dossier de la fiche d\'un agent : par la note (sans action), ou d\'une croix ; un dossier de la plateforme ne revient pas ; Annuler relie', async () => {
  const ag = Records.create('AgentImmo', { nom: 'Alexis Testretrait', agence: 'Agence du Centre', ville: 'Toulouse' });
  const cleAg = `agent:${ag.id}`;
  Records.create('Deal', { deal_id: 'd-pau-r', nom: 'Dossier Pau', statut: 'analyse', lots: [] });
  Records.create('Deal', { deal_id: 'd-tls-r', nom: 'Local Toulouse', statut: 'analyse', lots: [] });
  // Un dossier que la plateforme rattache seule : son analyse nomme l'agent.
  Records.create('Deal', { deal_id: 'd-naz-r', nom: 'Basic Fit Nazelles', statut: 'analyse', lots: [{ evaluation: { lignes: [{ constat: 'transmis par Alexis Testretrait' }] } }] });
  const lienAg = M.lienPropre({ cle: cleAg });
  const premiere = await proposer({ texte: 'Alexis nous a envoyé Pau et Toulouse.', liens: [lienAg, M.lienPropre({ cle: 'deal:d-pau-r' }), M.lienPropre({ cle: 'deal:d-tls-r' })] }, maxime, { maintenant, lire: async () => ({ nature: 'note', titre: 'Dossiers d\'Alexis', fiches: [], actions: [], questions: [], mentions: [] }) });
  M.rangerNote(Records.get('NoteDossier', premiere.note_id), {}, maxime, { maintenant: () => maintenant });
  assert.deepEqual(M.lieesDe(cleAg).map((l) => l.cle).sort(), ['deal:d-naz-r', 'deal:d-pau-r', 'deal:d-tls-r']);

  // La note qui demande de retirer : la consigne nomme les dossiers liés, la réponse les retire, l'action en double tombe.
  const deja = (await import('./ranger.js')).rattaches([lienAg]);
  const refs = Object.fromEntries(deja.map((d) => [d.nom, d.ref]));
  assert.match(consigne('Enlève Pau', [lienAg], maxime, { maintenant, deja }), /déjà liés à cette fiche : .*D\d+ dossier « Dossier Pau »/);
  const n = await proposer({ texte: 'Il ne nous a pas envoyé Pau ni Basic Fit Nazelles, enlève-les de la fiche d\'Alexis.', liens: [lienAg] }, maxime, { maintenant, lire: async () => ({
    nature: 'note', titre: 'Retrait de deux dossiers',
    fiches: [{ lien: 'L1', elements: [], retirer: [refs['Dossier Pau'], refs['Basic Fit Nazelles'], 'D99'] }],
    actions: [{ titre: 'Retirer de la fiche d\'Alexis les dossiers de Pau et Basic Fit Nazelles', qui: 'moi' }], questions: [], mentions: [],
  }) });
  assert.deepEqual(n.proposition.retraits.map((r) => r.nom).sort(), ['Basic Fit Nazelles', 'Dossier Pau']);
  assert.equal(n.proposition.actions.length, 0);
  const r = M.rangerNote(Records.get('NoteDossier', n.note_id), {}, maxime, { maintenant: () => maintenant });
  assert.equal(r.retraits, 2);
  assert.deepEqual(M.lieesDe(cleAg).map((l) => l.cle), ['deal:d-tls-r']);
  assert.ok(!M.lieesDe('deal:d-pau-r').some((l) => l.cle === cleAg));
  assert.ok(!M.ficheVue('deal:d-naz-r').carte.agents.some((a) => a.cle === cleAg));
  assert.ok(!M.ficheVue(cleAg).journal.some((j) => /Retrait/.test(j.titre || '')));
  M.annulerNote(Records.get('NoteDossier', n.note_id), maxime);
  assert.equal(M.lieesDe(cleAg).length, 3);

  // La croix : délié des deux côtés, puis relié tel qu'il était.
  const d = M.delier(cleAg, 'deal:d-tls-r');
  assert.equal(d.ok, true);
  assert.ok(!M.lieesDe(cleAg).some((l) => l.cle === 'deal:d-tls-r'));
  assert.ok(!M.lieesDe('deal:d-tls-r').some((l) => l.cle === cleAg));
  M.relier(d.avant);
  assert.ok(M.lieesDe(cleAg).some((l) => l.cle === 'deal:d-tls-r'));
  assert.ok(M.lieesDe('deal:d-tls-r').some((l) => l.cle === cleAg));
});

test('Une étoile se pose sur un agent du CRM sans fiche de Klocka, et se retire', async () => {
  const P = await import('./preferes.js');
  const qui = { email: 'etoile.crm@klocka.immo' };
  assert.deepEqual(P.basculerPrefere(qui, 'twenty:agentImmobilier:322d7040-c63c-4af8-83cd-f393a1a0f2c4'), { ok: true, etoile: true });
  assert.deepEqual(P.basculerPrefere(qui, 'twenty:agentImmobilier:322d7040-c63c-4af8-83cd-f393a1a0f2c4'), { ok: true, etoile: false });
  assert.equal(P.basculerPrefere(qui, 'twenty:clients:abc').ok, false);
});

test('Une seule fiche par chose (25 nov. 2026) : la demande de Rachel et sa ligne du CRM ouvrent la même fiche, rien n\'est perdu', async () => {
  const U = await import('./une-cle.js');
  const d = Records.create('DemandeClient', { client_nom: 'Rachel UNIQUE', twenty_id: 'rachel-tw' });
  const crm = 'twenty:clients:rachel-tw';
  assert.equal(U.cleUnique(`client:${d.id}`), crm);
  // Une fiche née sous la demande (le CRM l'ouvrait), une autre sous la ligne du CRM (l'assistant) : elles se fondent.
  Records.create('FicheDossier', { cle: `client:${d.id}`, genre: 'client', nom: 'Rachel UNIQUE', etape: null, resume: null, comment_parler: 'Par WhatsApp.', liees: [{ cle: 'deal:d-unique', genre: 'bien', nom: 'Dieppe' }] });
  Records.create('FicheDossier', { cle: crm, genre: 'client', nom: 'Rachel UNIQUE', resume: 'Cliente, compromis à Dieppe.', liees: [] });
  Records.create('EntreeDossier', { fiche_cle: `client:${d.id}`, genre: 'ressenti', texte: 'Prudente.', le: '2026-11-20T10:00:00Z' });
  const note = Records.create('NoteDossier', { texte: 'Rachel a reçu son offre', liens: [{ cle: `client:${d.id}`, genre: 'client', nom: 'Rachel' }, { cle: crm, genre: 'client', nom: 'Rachel' }] });
  const v1 = M.ficheVue(`client:${d.id}`);
  const v2 = M.ficheVue(crm);
  assert.equal(v1.cle, crm);
  assert.deepEqual(v1, v2, 'la même fiche, des deux côtés');
  assert.equal(v2.resume, 'Cliente, compromis à Dieppe.', 'la fiche qui fait foi garde ce qu\'elle avait');
  assert.equal(v2.comment_parler, 'Par WhatsApp.', 'et reçoit ce que l\'autre avait en plus');
  assert.ok(v2.notes.some((n) => n.texte === 'Prudente.'));
  assert.ok(v2.liees.some((l) => l.cle === 'deal:d-unique'));
  assert.deepEqual(Records.get('NoteDossier', note.id).liens.map((l) => l.cle), [crm], 'un seul lien vers Rachel');
  const ancienne = Records.findBy('FicheDossier', 'cle', `fondue:client:${d.id}`);
  assert.equal(ancienne?.fondue_dans, crm, 'l\'ancienne fiche est gardée, marquée fondue');
  assert.equal(M.lienPropre({ cle: `client:${d.id}`, nom: 'Rachel' }).cle, crm, 'un lien posé sur la demande va sur la fiche du CRM');
});

test('Une seule fiche par chose : un agent du CRM rejoint l\'agent de Klocka, un projet rejoint son dossier', async () => {
  const U = await import('./une-cle.js');
  const a = Records.create('AgentImmo', { nom: 'Agent UNIQUE', twenty_id: 'agent-tw' });
  assert.equal(U.cleUnique('twenty:agentImmobilier:agent-tw'), `agent:${a.id}`);
  assert.equal(U.cleUnique('twenty:agentImmobilier:inconnu'), 'twenty:agentImmobilier:inconnu', 'sans agent de Klocka, sa ligne du CRM reste sa fiche');
  Records.create('FicheDossier', { cle: 'twenty:agentImmobilier:agent-tw', genre: 'agent', nom: 'Agent UNIQUE', resume: 'Réactif.', liees: [] });
  assert.equal(M.ficheVue(`agent:${a.id}`).resume, 'Réactif.', 'ouverte par sa clé de Klocka, la fiche du CRM y est');
  Records.create('Deal', { deal_id: 'd-unique-p', statut: 'analyse', lots: [] });
  const p = Records.create('Project', { titre: 'Local UNIQUE', deal_id: 'd-unique-p' });
  assert.equal(U.cleUnique(`projet:${p.id}`), 'deal:d-unique-p');
  const sans = Records.create('Project', { titre: 'Sans dossier' });
  assert.equal(U.cleUnique(`projet:${sans.id}`), `projet:${sans.id}`);
  assert.equal(U.fondre('deal:jamais-ecrit', 'deal:autre'), 0, 'une clé écrite nulle part ne fait rien relire');
});

test('une action cochée entre dans l\'historique au passé, datée (25 nov. 2026, Jules)', async () => {
  const { ligneFaite } = await import('./modele.js');
  const le = '2026-11-25T10:00:00Z';
  assert.equal(ligneFaite('Relancer Sébastien Robic', le), 'Relancé Sébastien Robic, le 25 novembre');
  assert.equal(ligneFaite('Écrire un mail à Arthur Duranson.', le), 'Écrit un mail à Arthur Duranson, le 25 novembre');
  assert.equal(ligneFaite('Vérifier le bail', le), 'Vérifié le bail, le 25 novembre');
  // Un premier mot qui n'est pas un verbe d'action : pas de faux participe (« Dossié »).
  assert.equal(ligneFaite('Dossier Nice à boucler', le), 'Fait : Dossier Nice à boucler, le 25 novembre');
  // Minuit à Paris : la date est celle de Paris, pas celle de Londres.
  assert.equal(ligneFaite('Appeler Paul', '2026-11-25T23:30:00Z'), 'Appelé Paul, le 26 novembre');
});
