// La préanalyse par le chat : la question sur une fiche reçue, le oui et le
// non, l'avis d'AK, et le mail à l'agent qui ne part que sur « envoie ».
// Tout sans réseau : Google Chat est remplacé par des fonctions de test.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-ak-fiches-'));
const { Records, Meta } = await import('../db.js');
const avis = await import('./avis.js');
const fiches = await import('./fiches.js');
const { estUnEnvoi, afficher, suiteDeLEnvoi, brouillonEnAttente } = await import('./mail-agent.js');
const { estUnOui } = await import('./veille.js');
const { redigerMailIntention } = await import('../deal/mails-cycle.js');

// --- L'avis ------------------------------------------------------------------

test('le rendement visé est celui de la grille, sinon le seuil d\'AK', () => {
  assert.equal(avis.rendementVise([{ champ: 'rendement_aem', attendu: '≥ 6.5 %' }]), 6.5);
  assert.equal(avis.rendementVise([{ champ: 'rendement_aem', attendu: '≥ 7,2 %' }]), 7.2);
  assert.equal(avis.rendementVise([], { rendement_aem: { tourne: 7 } }), 7);
});

test('la négo amène le rendement acte en main au rendement visé, arrondie aux 5 k au-dessus', async () => {
  const n = avis.negoPourViser({ prixFai: 400000, loyer: 28000, vise: 6.5 });
  assert.equal(n.nego % 5000, 0);
  assert.ok(n.nego > 0 && n.nego < 60000, `négo ${n.nego}`);
  assert.ok(n.rendement >= 6.5, `à ${n.prix} le rendement est ${n.rendement}`);
  // 5 k de négo en moins ne suffisent pas : c'est bien la plus petite aux 5 k.
  const { calculerAEM } = await import('../deal/aem.js');
  assert.ok(calculerAEM({ prixFai: 400000, prixNegocie: n.prix + 5000, loyerAnnuel: 28000 }).rendement_aem < 6.5);
});

test('pas de négo quand le prix passe déjà, et hors de portée quand rien ne suffit', () => {
  assert.equal(avis.negoPourViser({ prixFai: 200000, loyer: 30000, vise: 6.5 }).nego, 0);
  assert.equal(avis.negoPourViser({ prixFai: 400000, loyer: 1000, vise: 6.5 }).hors_de_portee, true);
  assert.equal(avis.negoPourViser({ prixFai: null, loyer: 1000, vise: 6.5 }), null);
});

test('la phrase de renta dit la négo comme l\'équipe', () => {
  const petite = avis.phraseRenta({ prixFai: 300000, loyer: 20000, vise: 6.5, n: { nego: 20000, prix: 280000, actuel: 6.1 } });
  assert.match(petite, /^dossier pas mal, il faut une petite négo d'environ 20 k pour que ça devienne intéressant \(6,5 % AEM à 280 k au lieu de 300 k\)$/);
  const grosse = avis.phraseRenta({ prixFai: 300000, loyer: 10000, vise: 6.5, n: { nego: 90000, prix: 210000, actuel: 3.1 } });
  assert.match(grosse, /^la renta est horrible, 3,1 % AEM : il faudrait 90 k de négo \(30 %\)/);
  assert.match(avis.phraseRenta({ prixFai: 300000, loyer: 30000, vise: 6.5, n: { nego: 0, actuel: 8.4 } }), /passe en l'état : 8,4 % AEM pour 6,5 % visés/);
  assert.match(avis.phraseRenta({ prixFai: 300000, loyer: null, vise: 6.5, n: null }), /il manque le loyer/);
});

test('le marché en une phrase : « le loyer est un peu surévalué quand même, mais pas le prix »', () => {
  assert.equal(
    avis.phraseMarche({ prix: { jugement: { sens: 'juste', ecart: -4 } }, loyer: { jugement: { sens: 'haut', ecart: 18 } } }),
    'le loyer est un peu surévalué quand même (+18 % vs marché), mais pas le prix'
  );
  assert.equal(avis.phraseMarche({ prix: { jugement: { sens: 'juste' } }, loyer: { jugement: { sens: 'juste' } } }), 'prix et loyer dans le marché');
  assert.match(avis.phraseMarche({ prix: { jugement: { sens: 'haut', ecart: 40 } }, loyer: { kdata_en_cours: true } }), /loyer de marché est encore en lecture, le prix est surévalué \(\+40 %/);
  assert.match(avis.phraseMarche({ approche: { mode: 'quartier' }, prix: { jugement: { sens: 'juste' } }, loyer: { jugement: { sens: 'juste' } } }), /lu sur le quartier/);
  assert.equal(avis.phraseMarche({ prix: { jugement: { sens: 'haut', ecart: 101 } }, loyer: { jugement: { sens: 'haut', ecart: 62 } } }), 'le loyer et le prix sont surévalués (+62 % et +101 % vs marché)');
  assert.deepEqual(avis.autresPoints([{ champ: 'signature', critere: "Signature de l'enseigne", valeur: 'basse', attendu: '≠ basse', ok: false }, { champ: 'bail_echeance', critere: 'Échéance du bail', valeur: null, ok: false }]), ["signature de l'enseigne : basse, attendu autre que basse", 'échéance du bail : non renseigné']);
  assert.equal(avis.phraseMarche(null), null);
});

test('emplacement et preneur : ce qu\'AK ne voit pas, il le dit', () => {
  const lot = (extra = {}) => ({ enrichissement: { emplacement: 'a_qualifier' }, lot: { occupe: { valeur: true }, locataire_nom: { valeur: null }, ...extra } });
  assert.equal(avis.phraseInconnues(lot()), "emplacement à vérifier, et on sait pas qui est le preneur");
  assert.equal(avis.phraseInconnues(lot({ locataire_nom: { valeur: 'Devred' } })), 'emplacement à vérifier');
  assert.equal(avis.phraseInconnues({ enrichissement: { emplacement: 'n1' }, lot: { occupe: { valeur: false } } }), 'le local est vide');
});

test('l\'avis complet se lit de haut en bas et finit par la main tendue', () => {
  const dossier = {
    nom: 'Devred - Firminy',
    lots: [{
      lot: { prix_fai: { valeur: 400000 }, loyer_annuel_ht_hc: { valeur: 28000 }, occupe: { valeur: true }, locataire_nom: { valeur: null } },
      enrichissement: { emplacement: 'a_qualifier' },
      evaluation: { verdict: 'GO SOUS RÉSERVE', aem: { prix_fai: 400000 }, grille: [{ champ: 'rendement_aem', critere: 'Rendement AEM', attendu: '≥ 6.5 %', ok: false }, { champ: 'bail', critere: 'Durée ferme', valeur: '1 an', attendu: '≥ 3 ans', ok: false }] },
    }],
  };
  const texte = avis.avisPreanalyse({
    dossier,
    marche: { prix: { jugement: { sens: 'juste' } }, loyer: { jugement: { sens: 'haut', ecart: 12 } } },
    clients: { configure: true, clients: [{ nom: 'Martin' }] },
    lien: 'https://klocka.immo/Analyse?deal_id=d1',
  });
  const lignes = texte.split('\n');
  assert.equal(lignes[0], "c'est bon, le dossier Devred - Firminy est prêt : https://klocka.immo/Analyse?deal_id=d1");
  assert.match(lignes[1], /^dossier pas mal, il faut une (petite )?négo d'environ \d+ k/);
  assert.match(texte, /le loyer est un peu surévalué quand même \(\+12 % vs marché\), mais pas le prix/);
  assert.match(texte, /emplacement à vérifier, et on sait pas qui est le preneur/);
  assert.match(texte, /à noter aussi : durée ferme : 1 an, attendu ≥ 3 ans/);
  assert.match(texte, /1 client pourrait coller : Martin/);
  assert.equal(lignes.at(-1), 'dis-moi si tu veux que je fasse autre chose');
});

// --- La question sur une fiche -----------------------------------------------

test('une fiche : une pièce utile ou un texte long, pas un logo', () => {
  assert.equal(fiches.ressembleAUneFiche({ pieces_jointes: [{ nom: 'Fiche Devred.pdf' }] }), true);
  assert.equal(fiches.ressembleAUneFiche({ pieces_jointes: [{ nom: 'image001.png' }, { nom: 'logo.jpg' }], texte: 'Bonjour' }), false);
  assert.equal(fiches.ressembleAUneFiche({ pieces_jointes: [], texte: 'x'.repeat(500) }), true);
});

test('les fiches à proposer : nouvelles, sans dossier, jamais proposées à cette personne', () => {
  const maintenant = new Date('2026-09-24T10:00:00Z');
  const mails = [
    { id: 'a', date: '2026-09-24T09:00:00Z', pieces_jointes: ['a.pdf'] },
    { id: 'b', date: '2026-09-24T08:00:00Z', pieces_jointes: ['b.pdf'], deal_id: 'd' },
    { id: 'c', date: '2026-09-20T08:00:00Z', pieces_jointes: ['c.pdf'] },
    { id: 'd', date: '2026-09-24T07:00:00Z', pieces_jointes: ['d.pdf'] },
    { id: 'e', date: '2026-09-23T07:00:00Z', pieces_jointes: ['e.pdf'] },
  ];
  const questions = [{ mail_id: 'd', pour_email: 'jules@k.fr' }];
  const r = fiches.fichesAProposer({ mails, questions, pour: 'jules@k.fr', depuis: '2026-09-23T12:00:00Z', maintenant });
  assert.deepEqual(r.map((m) => m.id), ['a']);
  assert.deepEqual(fiches.fichesAProposer({ mails, questions, pour: 'nora@k.fr', depuis: '2026-09-23T12:00:00Z', maintenant }).map((m) => m.id), ['d', 'a']);
});

test('la question dit qui, quoi, et combien attendent derrière', () => {
  const q = fiches.questionPour({ de: 'Paul Agent <paul@agence.fr>', objet: 'Murs Devred Firminy', pieces_jointes: ['fiche.pdf', 'logo.png'] }, { apres: 2 });
  assert.match(q, /^nouvelle fiche de Paul Agent <paul@agence.fr> : « Murs Devred Firminy », 1 pièce : fiche\.pdf\. je la préanalyse \? oui ou non/);
  assert.match(q, /2 autres fiches derrière/);
});

test('le non se lit avant le oui', () => {
  for (const t of ['non', 'nan laisse tomber', 'non pas sûr', 'pas pertinent', 'rav']) assert.equal(fiches.estUnNon(t), true, t);
  for (const t of ['oui', 'vas-y', 'laisse-moi lire d\'abord', 'nouvelle idée']) assert.equal(fiches.estUnNon(t), false, t);
});

test('une question à la fois : la seconde fiche attend la réponse, le oui lance la tâche', async () => {
  process.env.AK_FICHES_POUR = 'jules.b@klocka.immo';
  const maintenant = new Date();
  Meta.set('ak.fiches.depuis', new Date(maintenant - 3600000).toISOString());
  const m1 = Records.create('MailRecu', { de: 'Paul <paul@agence.fr>', de_email: 'paul@agence.fr', objet: 'Fiche 1', date: new Date(maintenant - 1800000).toISOString(), pieces_jointes: [{ nom: 'f1.pdf' }], deal_id: null });
  const m2 = Records.create('MailRecu', { de: 'Paul <paul@agence.fr>', de_email: 'paul@agence.fr', objet: 'Fiche 2', date: new Date(maintenant - 600000).toISOString(), pieces_jointes: [{ nom: 'f2.pdf' }], deal_id: null });
  const envoyes = [];
  const outils = { assurerPrive: async (u) => { assert.equal(u, 'users/jules.b@klocka.immo'); return 'spaces/DM1'; }, envoyer: async (espace, texte) => envoyes.push({ espace, texte }) };

  assert.equal(await fiches.poserLesQuestions({ ...outils, pour: fiches.destinataires(), maintenant }), 1);
  assert.equal(envoyes.length, 1);
  assert.match(envoyes[0].texte, /« Fiche 1 ».*1 autre fiche derrière/s);
  // Un second passage ne repose rien tant que la première attend.
  assert.equal(await fiches.poserLesQuestions({ ...outils, pour: fiches.destinataires(), maintenant }), 0);

  // Une phrase qui n'est ni oui ni non repart au modèle, la question reste ouverte.
  assert.equal(fiches.repondreALaQuestion({ espace: 'spaces/DM1', texte: 'c\'est quoi le loyer ?' }, { estUnOui }), null);
  const oui = fiches.repondreALaQuestion({ espace: 'spaces/DM1', texte: 'oui vas-y' }, { estUnOui });
  assert.equal(oui.tache.genre, 'preanalyse');
  assert.equal(oui.tache.mail_id, m1.id);

  // La question suivante part au passage d'après.
  assert.equal(await fiches.poserLesQuestions({ ...outils, pour: fiches.destinataires(), maintenant }), 1);
  assert.match(envoyes[1].texte, /« Fiche 2 »/);
  const non = fiches.repondreALaQuestion({ espace: 'spaces/DM1', texte: 'non' }, { estUnOui, par: 'jules.b@klocka.immo' });
  assert.match(non.texte, /laisse tomber/);
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(Records.get('MailRecu', m2.id), null, 'le mail refusé sort de la pile');
  delete process.env.AK_FICHES_POUR;
});

test('une fiche préanalysée ailleurs ferme la question', () => {
  const m = Records.create('MailRecu', { objet: 'Fiche 3', date: new Date().toISOString(), pieces_jointes: ['f3.pdf'], deal_id: null });
  Records.create('AkQuestion', { genre: 'fiche', mail_id: m.id, pour_email: 'x@k.fr', espace: 'spaces/DM2', etat: 'posee', pose_le: new Date().toISOString() });
  Records.update('MailRecu', m.id, { deal_id: 'deal-x' });
  assert.equal(fiches.questionOuverte('spaces/DM2'), null);
});

test('sans destinataire, personne n\'est prévenu', async () => {
  assert.deepEqual(fiches.destinataires(''), []);
  assert.equal(await fiches.poserLesQuestions({ assurerPrive: async () => { throw new Error('pas appelé'); }, envoyer: async () => {}, pour: [] }), 0);
});

// --- Le mail à l'agent ---------------------------------------------------------

test('« envoie » envoie, « n\'envoie pas encore » non', () => {
  for (const t of ['envoie', 'ok envoie', 'vas-y envoie-le', 'balance', 'oui envoie stp']) assert.equal(estUnEnvoi(t), true, t);
  for (const t of ['n\'envoie pas encore', 'attends', 'oui', 'plus court stp', '']) assert.equal(estUnEnvoi(t), false, t);
});

test('le brouillon s\'affiche en entier, avec qui, depuis où, et comment le faire partir', () => {
  const t = afficher({ a: 'paul@agence.fr', de: 'sourcing@klocka.immo', objet: 'Retour sur votre proposition', corps: 'Bonjour,\n\nMerci.' }, 'Devred - Firminy');
  assert.match(t, /^le mail pour Devred - Firminy :\nà : paul@agence\.fr\nde : sourcing@klocka\.immo\nobjet : Retour sur votre proposition\n\nBonjour,\n\nMerci\.\n\ndis-moi « envoie » et il part$/);
  assert.equal(suiteDeLEnvoi('refus'), ', le dossier passe en abandonné');
  assert.equal(suiteDeLEnvoi('relance'), '');
});

test('le brouillon attend dans son espace, vingt-quatre heures au plus', () => {
  const frais = Records.create('AkBrouillon', { espace: 'spaces/DM3', etat: 'attente', cree_le: new Date().toISOString(), a: 'x@y.fr', objet: 'o', corps: 'c' });
  Records.create('AkBrouillon', { espace: 'spaces/DM4', etat: 'attente', cree_le: new Date(Date.now() - 30 * 3600000).toISOString() });
  assert.equal(brouillonEnAttente('spaces/DM3')?.id, frais.id);
  assert.equal(brouillonEnAttente('spaces/DM4'), null);
  assert.equal(brouillonEnAttente('spaces/DM5'), null);
});

test('le refus porte le retour de l\'équipe quand on le lui donne', async () => {
  const lot = { lot: { adresse: { valeur: { rue: '12 rue de la Paix', ville: 'Firminy' } } }, enrichissement: {}, evaluation: {} };
  const sans = await redigerMailIntention(lot, 'refus', { sansIA: true, signature: 'Jules' });
  const avec = await redigerMailIntention(lot, 'refus', { sansIA: true, signature: 'Jules', raisons: "l'emplacement ne correspond pas à ce que recherchent nos clients" });
  assert.match(sans.corps, /pas suite à cette opportunité pour le moment\./);
  assert.match(avec.corps, /pour le moment : l'emplacement ne correspond pas à ce que recherchent nos clients\./);
});

test('mail_agent poste le brouillon tel quel, et « envoie » fait avancer le dossier comme depuis la fiche', async () => {
  const { executerOutil } = await import('./agent.js');
  const { envoyerBrouillon } = await import('./mail-agent.js');
  const deal = Records.create('Deal', { deal_id: 'deal-mail-1', nom: 'Devred - Firminy', test: true, contact_agent_email: 'paul@agence.fr', statut: 'analyse', lots: [], suivi: [] });
  const postes = [];
  const user = { email: 'jules.b@klocka.immo', full_name: 'Jules Barthomeuf', role: 'admin' };
  const r = await executerOutil(
    { name: 'mail_agent', input: { deal_id: 'deal-mail-1', intention: 'refus', raisons: "l'emplacement ne nous convient pas" } },
    user,
    { apres: (t) => postes.push(t), message: { espace: 'spaces/DM9', auteur: { nom: 'users/1', affiche: 'Jules Barthomeuf' } } }
  );
  assert.equal(r.ok, true);
  assert.equal(postes.length, 1);
  assert.match(postes[0], /à : paul@agence\.fr/);
  assert.match(postes[0], /l'emplacement ne nous convient pas/);
  assert.match(postes[0], /dis-moi « envoie » et il part$/);

  const b = brouillonEnAttente('spaces/DM9');
  assert.ok(postes[0].includes(b.corps), 'ce qui partira est ce qui a été montré');
  const phrase = await envoyerBrouillon(b, user);
  assert.match(phrase, /rien n'est parti \(dossier de test\).*passe en abandonné/);
  assert.equal(brouillonEnAttente('spaces/DM9'), null);
  const apres = Records.get('Deal', deal.id);
  assert.ok((apres.suivi || []).some((s) => s.type === 'mail_envoye' && s.intention === 'refus'));
});

test('« préanalyse le mail du glacier » : déjà fait à l\'arrivée, l\'avis part tout de suite ; sinon une tâche de fond', async () => {
  const { executerOutil } = await import('./agent.js');
  const user = { email: 'jules.b@klocka.immo', role: 'admin' };
  Records.create('Deal', { deal_id: 'glacier-1', nom: 'Glacier', lots: [{ lot: { prix_fai: { valeur: 520000 }, loyer_annuel_ht_hc: { valeur: 34416 } }, enrichissement: {}, evaluation: { aem: { prix_fai: 520000 }, grille: [] } }], test: true });
  const deja = Records.create('MailRecu', { objet: 'Glacier Reaumur', deal_id: 'glacier-1', pieces_jointes: [{ nom: 'fiche.pdf' }] });
  const apres = []; const fond = [];
  const r1 = await executerOutil({ name: 'preanalyser_mail', input: { id: deja.id } }, user, { apres: (t) => apres.push(t), fond: (t) => fond.push(t) });
  assert.equal(r1.deja_cree, true);
  assert.equal(fond.length, 0);
  assert.match(apres[0], /^c'est bon, le dossier Glacier est prêt : .*deal_id=glacier-1/);

  const neuf = Records.create('MailRecu', { objet: 'Murs Devred Firminy', deal_id: null, pieces_jointes: [{ nom: 'fiche.pdf' }] });
  const r2 = await executerOutil({ name: 'preanalyser_mail', input: { id: neuf.id } }, user, { apres: (t) => apres.push(t), fond: (t) => fond.push(t) });
  assert.equal(r2.en_cours, true);
  assert.deepEqual(fond[0], { genre: 'preanalyse', libelle: 'la préanalyse de « Murs Devred Firminy »', mail_id: neuf.id });
});

test('l\'avis prévient quand le prix est net vendeur sans honoraires chiffrés', () => {
  const dossier = { nom: 'Glacier', lots: [{ lot: { prix_fai: { valeur: 520000, citation: 'Prix : 520 000 € Net vendeur' }, honoraires_inclus: { valeur: false }, loyer_annuel_ht_hc: { valeur: 34416 } }, enrichissement: {}, evaluation: { aem: { prix_fai: 520000 }, grille: [{ champ: 'rendement_aem', attendu: '≥ 7 %', ok: false }] } }] };
  const texte = avis.avisPreanalyse({ dossier });
  assert.match(texte, /à vérifier : attention, le prix est net vendeur, pas FAI\. les honoraires ne sont pas chiffrés, donc le FAI réel est plus haut et la renta comme la négo à revoir : demander le montant à l'agent/);
});

test('les photos jointes au message vont dans les images du projet, sans doublon', async () => {
  const { photosDuMessage, ajouterPhotos, executerOutil } = await import('./agent.js');
  const message = { espace: 'spaces/DMP', auteur: { nom: 'users/1' }, pieces: [
    { nom: 'facade.jpg', type: 'image/jpeg', chemin: '/tmp/ak-1-facade.jpg', url: '/uploads/ak-1-facade.jpg' },
    { nom: 'fiche.pdf', type: 'application/pdf', chemin: '/tmp/ak-1-fiche.pdf', url: '/uploads/ak-1-fiche.pdf' },
    { nom: 'vitrine.png', type: null, chemin: '/tmp/ak-1-vitrine.png', url: '/uploads/ak-1-vitrine.png' },
    { nom: 'ratee.jpg', type: 'image/jpeg', erreur: 'téléchargement impossible' },
  ] };
  assert.deepEqual(photosDuMessage(message), ['/uploads/ak-1-facade.jpg', '/uploads/ak-1-vitrine.png']);
  const p = Records.create('Project', { titre: 'Glacier - Paris', photos: ['/uploads/ancienne.jpg'] });
  assert.equal(ajouterPhotos(p.id, photosDuMessage(message)), 2);
  assert.equal(ajouterPhotos(p.id, photosDuMessage(message)), 0, 'déjà là');
  assert.deepEqual(Records.get('Project', p.id).photos, ['/uploads/ancienne.jpg', '/uploads/ak-1-facade.jpg', '/uploads/ak-1-vitrine.png']);
  const r = await executerOutil({ name: 'ajouter_photos_projet', input: { projet_id: p.id } }, { email: 'jules.b@klocka.immo' }, { message: { ...message, pieces: [{ nom: 'rue.webp', type: 'image/webp', chemin: '/tmp/x', url: '/uploads/ak-2-rue.webp' }] } });
  assert.equal(r.photos_ajoutees, 1);
  assert.equal((await executerOutil({ name: 'ajouter_photos_projet', input: { projet_id: p.id } }, {}, { message: { pieces: [] } })).ok, false);
});
