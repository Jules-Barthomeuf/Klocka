// AK : la lecture des messages du chat, la consigne, les outils, le texte
// des tâches finies. Tout sans réseau.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-ak-'));
process.env.AK_NOM = 'Assistant Klocka';
const { lireMessage, estPourAk, estDeAk, sansMention, mention } = await import('./chat.js');
const { CONSIGNE, consigne, OUTILS, decrireOutilsKdata, texteDeFin, utilisateurPour, imagesDe } = await import('./agent.js');

const brut = (texte, extra = {}) => ({
  name: 'spaces/AAA/messages/m1', createTime: '2026-09-21T10:00:00Z', text: texte, argumentText: texte.replace('@Assistant Klocka', ''),
  sender: { name: 'users/1', displayName: 'Jules Barthomeuf', type: 'HUMAN' }, thread: { name: 'spaces/AAA/threads/t1' },
  annotations: [{ type: 'USER_MENTION', userMention: { user: { name: 'users/999', displayName: 'Assistant Klocka', type: 'HUMAN' } } }],
  ...extra,
});

test('un message du chat se lit : qui, quoi, où, les mentions, les pièces', () => {
  const m = lireMessage(brut('@Assistant Klocka crée le projet pour devred de firminy'));
  assert.deepEqual(m.pieces, []);
  const avec = lireMessage(brut('@Assistant Klocka crée ce dossier', { attachment: [{ name: 'spaces/AAA/messages/m1/attachments/X', contentName: 'teaser.pdf', contentType: 'application/pdf', attachmentDataRef: { resourceName: 'REF' } }, { name: 'd', contentName: 'bail.pdf', driveDataRef: { driveFileId: 'DRV' } }] }));
  assert.deepEqual(avec.pieces, [{ nom: 'teaser.pdf', type: 'application/pdf', ref: 'REF', drive_id: null }, { nom: 'bail.pdf', type: null, ref: null, drive_id: 'DRV' }]);
  assert.equal(m.espace, 'spaces/AAA');
  assert.equal(m.fil, 'spaces/AAA/threads/t1');
  assert.equal(m.auteur.affiche, 'Jules Barthomeuf');
  assert.deepEqual(m.mentions, [{ nom: 'users/999', affiche: 'Assistant Klocka' }]);
  assert.equal(sansMention(m), 'crée le projet pour devred de firminy');
  assert.equal(mention(m.auteur), '<users/1>');
  assert.equal(mention({ affiche: 'Nora' }), 'Nora');
});

test("AK reconnaît ce qui lui est adressé, et ne se répond pas à lui-même", () => {
  const pourLui = lireMessage(brut('@Assistant Klocka fais la préz'));
  assert.equal(estPourAk(pourLui, { utilisateur: null }), true, 'par le nom de la mention');
  assert.equal(estPourAk(pourLui, { utilisateur: 'users/999' }), true, 'par son identifiant appris');
  const autre = lireMessage(brut('@Nora tu as fini ?', { annotations: [{ type: 'USER_MENTION', userMention: { user: { name: 'users/5', displayName: 'Nora' } } }] }));
  assert.equal(estPourAk(autre, { utilisateur: 'users/999' }), false);
  assert.equal(estPourAk(autre, { utilisateur: null, direct: true }), true, 'un message privé lui parle toujours');
  const texteSeul = lireMessage(brut('@Assistant Klocka ok', { annotations: [] }));
  assert.equal(estPourAk(texteSeul, { utilisateur: null }), true, 'la mention en texte suffit');
  const appel = lireMessage(brut('assistant crée un dossier Ben', { annotations: [], argumentText: null }));
  assert.equal(estPourAk(appel, { utilisateur: null }), true, '« assistant » en tête de message suffit');
  assert.equal(sansMention(appel), 'crée un dossier Ben');
  assert.equal(sansMention(lireMessage(brut('AK, t es là ?', { annotations: [], argumentText: null }))), 't es là ?');
  assert.equal(estPourAk(lireMessage(brut("l'assistant a planté ce matin", { annotations: [], argumentText: null })), { utilisateur: null }), false, 'au milieu d\'une phrase, ce n\'est pas pour lui');
  const deLui = lireMessage(brut("c'est bon c'est fait", { sender: { name: 'users/999', displayName: 'Assistant Klocka', type: 'HUMAN' }, annotations: [] }));
  assert.equal(estDeAk(deLui, { utilisateur: null }), true);
  assert.equal(estPourAk(deLui, { utilisateur: 'users/999', direct: true }), false, 'même en privé');
});

test("la consigne est le document de Jules, mot pour mot, puis le cadre de la plateforme", () => {
  assert.match(CONSIGNE, /^PERSONNALITÉ ET REGLES DE COMMUNICATION DE L'AGENT AK/);
  assert.match(CONSIGNE, /"préz bancaire" \(jamais "présentation bancaire"\)/);
  assert.match(CONSIGNE, /Sois très poli avec Jules et appelle-le maître/);
  assert.match(CONSIGNE, /Non je suis en train de faire autre chose rappelle-moi plus tard/);
  const c = consigne();
  assert.ok(c.startsWith(CONSIGNE));
  assert.match(c, /Tu n'envoies jamais rien/);
});

test("les outils d'AK : ceux de l'assistant sans l'envoi de mail, plus les siens", () => {
  const noms = OUTILS.map((o) => o.name);
  for (const n of ['chercher_dossier', 'chercher_projet', 'analyser_fiche', 'ajouter_document', 'renommer_dossier', 'supprimer_dossier', 'creer_client_monday', 'creer_projet_depuis_dossier', 'outils_kdata', 'lancer_kdata', 'generer_prez_bancaire', 'taches_en_cours', 'pousser_projet_monday']) assert.ok(noms.includes(n), n);
  assert.ok(!noms.includes('envoyer_mail'), 'décidé : AK n\'envoie pas de mail');
  const creer = OUTILS.find((o) => o.name === 'creer_dossier');
  assert.match(creer.description, /rien d'autre : pas de Monday/, 'le creer_dossier d\'AK, pas celui de l\'assistant');
  assert.equal(new Set(noms).size, noms.length, 'aucun doublon');
  const kd = decrireOutilsKdata();
  assert.ok(kd.length >= 8);
  const zoning = kd.find((x) => x.outil === 'kzoning');
  assert.equal(zoning.nom, 'K-Zoning');
  assert.equal(zoning.questions[0].cle, 'rayon_m');
  assert.ok(zoning.questions[0].options.includes(500));
  const estimation = kd.find((x) => x.outil === 'kestimation');
  assert.ok(estimation.questions.every((q) => q.cle === 'activite'), 'le formulaire de valorisation reste sur la page');
});

test("le mot de la fin d'une tâche dit ce qui a marché, ce qui a raté, et où c'est", () => {
  const t = texteDeFin({ genre: 'kdata', libelle: 'K-Data sur 12 rue X : K-Zoning, K-Expertise', deal_id: 'D1', analyses: [
    { outil: 'kzoning', nom_outil: 'K-Zoning', etat: 'terminee', resume: 'zone de 500 m posée, à lire', ref: { id: 'z1' } },
    { outil: 'kexpertise', nom_outil: 'K-Expertise', etat: 'echec', erreur: 'adresse introuvable' },
  ] });
  assert.match(t, /^c'est bon, K-Data sur 12 rue X/);
  assert.match(t, /rangé dans le dossier/);
  assert.match(t, /K-Zoning : zone de 500 m posée, à lire .*\/kzoning\?zone=z1/);
  assert.match(t, /K-Expertise : raté \(adresse introuvable\)/);
  assert.match(texteDeFin({ genre: 'prez', libelle: 'préz bancaire de Devred', resultat: { slides: 'https://docs.google.com/x' } }), /sur le Drive : https:\/\/docs\.google\.com\/x/);
  assert.match(texteDeFin({ genre: 'prez', libelle: 'préz bancaire de Devred', resultat: { slides: null, pptx: 'http://k/p.pptx', erreur_drive: 'pas de Drive' } }), /prête ici : http:\/\/k\/p\.pptx \(le Drive a refusé : pas de Drive\)/);
});

test("la personne qui parle est reconnue parmi les comptes de l'équipe, jamais le premier admin venu", () => {
  const equipe = [
    { email: 'coralie.g@klocka.immo', full_name: 'Guillaud Coralie', role: 'admin' },
    { email: 'nora.l@klocka.immo', full_name: 'Nora Lorinquer', role: 'admin' },
    { email: 'jules.btmf@gmail.com', full_name: 'Jules Barthomeuf', role: 'admin' },
    { email: 'jules.b@klocka.immo', full_name: 'Jules Barthomeuf', role: 'admin' },
    { email: 'maxime.p@klocka.immo', full_name: 'maxime.p', role: 'admin' },
    { email: 'paul.dz@klocka.immo', full_name: 'Paul de Zulueta', role: 'admin' },
  ];
  assert.equal(utilisateurPour({ affiche: 'Jules Barthomeuf' }, equipe).email, 'jules.b@klocka.immo', "l'adresse klocka.immo avant la gmail");
  assert.equal(utilisateurPour({ affiche: 'Coralie Guillaud' }, equipe).email, 'coralie.g@klocka.immo', 'nom et prénom dans l\'autre ordre');
  assert.equal(utilisateurPour({ affiche: 'Nora Lorinquer' }, equipe).email, 'nora.l@klocka.immo');
  assert.equal(utilisateurPour({ affiche: 'Maxime Perrin' }, equipe).email, 'maxime.p@klocka.immo', 'prénom.initiale');
  assert.equal(utilisateurPour({ affiche: 'Paul de Zulueta' }, equipe).email, 'paul.dz@klocka.immo');
  assert.equal(utilisateurPour({ affiche: 'Quelqu\'un Inconnu' }, equipe), null);
  assert.equal(utilisateurPour({ affiche: '' }, equipe), null);
});

test("la flemme tombe une fois sur n, jamais deux fois de suite dans le même espace", async () => {
  const { flemme } = await import('./veille.js');
  assert.equal(flemme('s', { tirage: 0.1, un_sur: 6 }), true);
  assert.equal(flemme('s', { tirage: 0.5, un_sur: 6 }), false);
  assert.equal(flemme('s', { tirage: 0.1, un_sur: 0 }), false, 'désactivée');
  assert.equal(flemme('s', { tirage: 0.1, un_sur: 6, maintenant: 1000000, dernieres: { s: 1000000 - 60000 } }), false, 'elle vient de tomber : on s\'exécute');
  assert.equal(flemme('s', { tirage: 0.1, un_sur: 6, maintenant: 1000000, dernieres: { autre: 1000000 } }), true);
});

test("après une réponse d'AK, la même personne peut enchaîner sans le mentionner, cinq minutes durant", async () => {
  const { enConversation } = await import('./veille.js');
  const m = { espace: 'spaces/A', fil: 'spaces/A/threads/t9', auteur: { nom: 'users/1' } };
  const attente = { auteur: 'users/1', fil: 'spaces/A/threads/t1', jusqua: 1000000 };
  assert.equal(enConversation(m, { attente, maintenant: 999000 }), true, 'même personne, dans le délai');
  assert.equal(enConversation(m, { attente, maintenant: 1000001 }), false, 'délai passé');
  assert.equal(enConversation({ ...m, auteur: { nom: 'users/2' } }, { attente, maintenant: 999000 }), false, 'quelqu\'un d\'autre');
  assert.equal(enConversation({ ...m, auteur: { nom: 'users/2' }, fil: 'spaces/A/threads/t1' }, { attente, maintenant: 2000000 }), true, 'dans le fil où AK a parlé');
  assert.equal(enConversation(m, { attente: undefined }), false);
});

test("une capture d'écran jointe part au modèle en image, un pdf ou un fichier trop lourd non", async () => {
  const { provider } = await import('../llm.js');
  const lire = () => Buffer.from('img');
  const blocs = imagesDe([
    { nom: 'a.png', type: 'image/png', chemin: '/x/a.png', octets: 10 },
    { nom: 'b.pdf', type: 'application/pdf', chemin: '/x/b.pdf', octets: 10 },
    { nom: 'c.jpg', type: 'image/jpeg', chemin: '/x/c.jpg', octets: 9 * 1024 * 1024 },
    { nom: 'd.png', type: 'image/png', erreur: 'raté' },
  ], lire);
  if (provider !== 'anthropic') { assert.deepEqual(blocs, []); return; }
  assert.equal(blocs.length, 1);
  assert.equal(blocs[0].source.media_type, 'image/png');
  assert.equal(blocs[0].source.data, Buffer.from('img').toString('base64'));
});

test("devant un pavé AK râle, et un oui court le remet au travail", async () => {
  const { meriteUnRale, estUnOui } = await import('./veille.js');
  assert.equal(meriteUnRale({ texte: 'x'.repeat(2000), pieces: [] }), true);
  assert.equal(meriteUnRale({ texte: 'crée le projet devred', pieces: [] }), false);
  assert.equal(meriteUnRale({ texte: 'tiens', pieces: [{}, {}, {}] }), true, 'trois pièces');
  assert.equal(meriteUnRale({ texte: 'x'.repeat(2000) }, { seuil: 0 }), false, 'désactivé');
  for (const t of ['oui', 'Ouais vas-y', 'go', 'fais le stp', 'oui t\'es obligé', 'OK']) assert.equal(estUnOui(t), true, t);
  for (const t of ['non laisse', 'crée plutôt le projet de lorient', 'x'.repeat(80) + ' oui']) assert.equal(estUnOui(t), false, t);
});

test("le couperet : ça tourne, c'est limite, c'est dead, avec les seuils de l'équipe", async () => {
  const { couperet, finDeBail, chercherBiens } = await import('./outils.js');
  const le = new Date('2026-09-21');
  const bon = couperet({ prix_fai: 1000000, loyer: 80000, bail_fin: new Date('2034-07-06') }, le);
  assert.equal(bon.verdict, 'tourne');
  assert.equal(bon.aem, 1075000);
  assert.equal(bon.rendement_aem, 7.44);
  assert.equal(bon.rendement_fai, 8);
  assert.equal(bon.bail_restant_ans, 7.8);
  assert.equal(couperet({ prix_fai: 1000000, loyer: 50000, bail_fin: new Date('2034-07-06') }, le).verdict, 'dead', 'rendement trop bas');
  assert.equal(couperet({ prix_fai: 1000000, loyer: 80000, bail_fin: new Date('2028-06-01') }, le).verdict, 'limite', 'bail court');
  assert.equal(couperet({ prix_fai: 1000000, loyer: 80000, bail_fin: new Date('2027-06-01'), ca: 400000 }, le).verdict, 'dead', "taux d'effort 20 %");
  assert.equal(couperet({ prix_fai: 139000, loyer: 13560, honoraires_inclus: false, honoraires: 10000 }, le).aem, 160175);
  assert.equal(couperet({ prix_fai: null, loyer: 1 }).verdict, null);
  assert.equal(finDeBail('06/07/2034').toISOString().slice(0, 10), '2034-07-06');
  assert.equal(finDeBail({ valeur: '2028-01-31' }).toISOString().slice(0, 10), '2028-01-31');
  assert.equal(finDeBail('janvier 2028').toISOString().slice(0, 10), '2028-01-31');
  assert.equal(finDeBail('fin 2030').toISOString().slice(0, 10), '2030-12-31');
  assert.equal(finDeBail(''), null);

  const deals = [
    { deal_id: 'd1', nom: 'Lyon 3e', lots: [{ lot: { prix_fai: { valeur: 450000 }, loyer_annuel_ht_hc: { valeur: 36000 }, surface_m2: { valeur: 80 }, locataire_activite: { valeur: 'Boulangerie' }, bail_echeance: { valeur: '01/01/2034' }, adresse: { valeur: { ville: 'Lyon' } } } }] },
    { deal_id: 'd2', nom: 'Lyon Part-Dieu', lots: [{ lot: { prix_fai: { valeur: 900000 }, loyer_annuel_ht_hc: { valeur: 60000 }, adresse: { valeur: { ville: 'Lyon' } } } }] },
    { deal_id: 'd3', nom: 'Nice', archived: true, lots: [{ lot: { prix_fai: { valeur: 100000 }, adresse: { valeur: { ville: 'Lyon' } } } }] },
  ];
  const projets = [{ id: 'p1', titre: 'Devred - Firminy', ville_secteur_champ1: 'Firminy', prix_acquisition: 139000, loyer_annuel_ht: 13560, echeance_bail: '31/01/2028' }];
  const r = chercherBiens({ ville: 'lyon', prix_max: 500000, bail_min_ans: 6 }, { deals, projets }, le);
  assert.deepEqual(r.map((x) => x.id), ['d1']);
  assert.equal(r[0].rendement, 8);
  assert.equal(chercherBiens({}, { deals, projets }, le).length, 3, "l'archivé ne sort pas");
  assert.equal(chercherBiens({ rendement_min: 9 }, { deals, projets }, le)[0].id, 'p1');
});

test("le mot du matin : jours ouvrés, une fois, après l'heure ; et l'on sait mentionner quelqu'un par son mail", async () => {
  const { estLeMoment } = await import('./matin.js');
  const { mentionDe } = await import('./chat.js');
  const lundi = new Date('2026-09-21T09:00:00');
  assert.equal(estLeMoment(lundi, { heure: '08:30', dernierJour: null }), true);
  assert.equal(estLeMoment(new Date('2026-09-21T08:10:00'), { heure: '08:30', dernierJour: null }), false, 'trop tôt');
  assert.equal(estLeMoment(lundi, { heure: '08:30', dernierJour: '2026-09-21' }), false, 'déjà fait');
  assert.equal(estLeMoment(new Date('2026-09-20T10:00:00'), { heure: '08:30', dernierJour: null }), false, 'dimanche');
  assert.equal(estLeMoment(lundi, { heure: '', dernierJour: null }), false, 'désactivé');
  const vues = { 'Nora Lorinquer': 'users/5', 'Jules Barthomeuf': 'users/1' };
  const utilisateurs = [{ email: 'nora.l@klocka.immo', full_name: 'Nora Lorinquer' }, { email: 'jules.b@klocka.immo', full_name: 'Jules Barthomeuf' }];
  assert.equal(mentionDe('nora.l@klocka.immo', { vues, utilisateurs }), '<users/5>');
  assert.equal(mentionDe('Nora', { vues, utilisateurs }), '<users/5>');
  assert.equal(mentionDe('jules', { vues, utilisateurs }), '<users/1>');
  assert.equal(mentionDe('marc@agence.fr', { vues, utilisateurs }), 'Marc', 'inconnu du chat : son prénom');
  assert.equal(mentionDe('', { vues, utilisateurs }), '');
});

test("AK se propose : ce qui manque à un dossier, la phrase, les heures de bureau", async () => {
  const { manques, phrase, heureDeBureau } = await import('./proactif.js');
  const deal = { deal_id: 'd', nom: 'Debieu', contact_agent_email: null, projet_id: null };
  const liste = manques(deal, { manquants: [{ type: 'bail', libelle: 'le bail commercial' }, { type: 'rcp', libelle: 'le règlement de copropriété' }], analyses: [], engagementsEnRetard: [{ quoi: 'PV promis', echeance: '2026-09-15' }] });
  assert.deepEqual(liste.slice(0, 3), ['il manque bail commercial, règlement de copropriété', "pas d'agent rattaché", 'aucune analyse K-Data']);
  assert.equal(liste.length, 5);
  assert.equal(manques(deal, { manquants: [{}, {}, {}, {}, {}], analyses: [{}] })[0], 'aucun doc reçu');
  assert.match(phrase(deal, liste, '<users/1>'), /^<users\/1> le dossier Debieu est pas complet : il manque bail commercial.*tu me files l'agent et je relance \?$/);
  assert.deepEqual(manques({ contact_agent_email: 'a@b.fr', projet_id: 'p' }, { analyses: [{}], manquants: [] }), []);
  assert.equal(heureDeBureau(new Date('2026-09-21T10:00:00')), true);
  assert.equal(heureDeBureau(new Date('2026-09-21T20:00:00')), false);
  assert.equal(heureDeBureau(new Date('2026-09-19T10:00:00')), false, 'samedi');
});

test("les corrections et les compliments se reconnaissent, et deviennent des exemples", async () => {
  const { estUneCorrection, estUnCompliment, leconsPourConsigne, souvenirsPourConsigne } = await import('./lecons.js');
  for (const t of ['non c\'est pas ça', 'Non', 'pas comme ça', 't\'as tout faux', 'trop corporate', 'refais']) assert.equal(estUneCorrection(t), true, t);
  for (const t of ['nickel', 'parfait merci', 'bg', 'c\'est ça']) { assert.equal(estUnCompliment(t), true, t); assert.equal(estUneCorrection(t), false, t); }
  assert.equal(estUneCorrection('crée le projet de nice'), false);
  assert.equal(estUnCompliment('merci de créer le projet de nice stp et de le pousser dans monday avec tout ce qu\'il faut dedans, puis de me faire la préz, et aussi une analyse k-data complète'), false, 'trop long pour un compliment');
  const bloc = leconsPourConsigne([{ verdict: 'correction', par: 'Jules', demande: 'crée un dossier', reponse: 'Dossier créé : /Analyse?deal_id=…', retour: 'trop corporate' }, { verdict: 'bien', par: 'Max', demande: 'pousse le', reponse: 'c bon', retour: 'nickel' }]);
  assert.match(bloc, /CE QUE L'ÉQUIPE T'A APPRIS/);
  assert.match(bloc, /Jules a corrigé : « trop corporate »/);
  assert.match(bloc, /Bien : à « pousse le »/);
  assert.equal(leconsPourConsigne([]), '');
  assert.match(souvenirsPourConsigne([{ sujet: 'Devred', fait: 'c\'est Firminy', par: 'Jules' }]), /\[Devred\] c'est Firminy \(Jules\)/);
});

test("le bilan d'AK compte ce qu'il a fait, pour qui, et ce qu'on lui a repris", async () => {
  const { bilanDe, bilanEnMarkdown } = await import('./bilan.js');
  const le = new Date().toISOString();
  const b = bilanDe({
    actions: [{ outil: 'creer_dossier', par: 'jules.b@klocka.immo (AK pour Jules)', le }, { outil: 'creer_dossier', par: 'maxime.p@klocka.immo (AK pour Max)', le, echec: true }, { outil: 'pousser_dossier_monday', par: 'jules.b@klocka.immo', le }],
    couts: [{ operation: 'ak', cout: 0.03, le }, { operation: 'ak', cout: 0.01, le }, { operation: 'assistant', cout: 5, le }],
    taches: [{ genre: 'kdata', etat: 'finie', cree_le: le }, { genre: 'prez', etat: 'ratee', cree_le: le }],
    lecons: [{ verdict: 'correction', le }, { verdict: 'bien', le }],
  });
  assert.equal(b.demandes, 2);
  assert.equal(b.cout_total, 0.04);
  assert.equal(b.actions, 2, "l'action de l'assistant de la plateforme ne compte pas");
  assert.equal(b.echecs, 1);
  assert.deepEqual(b.par_personne, [{ qui: 'Jules', n: 1 }, { qui: 'Max', n: 1 }]);
  assert.equal(b.taux_correction, 50);
  assert.match(bilanEnMarkdown(b), /2 demandes, 2 actions faites \(1 ratées\)/);
  assert.match(bilanEnMarkdown(bilanDe({})), /Personne ne lui a parlé/);
});

test("la boîte reçue se lit sans réseau, et un mail avec une fiche se signale une fois", async () => {
  const { trierBoite: boiteRecue } = await import('./outils.js');
  const { mailsASignaler } = await import('./proactif.js');
  const le = new Date().toISOString();
  const mails = [
    { id: 'm1', de: 'Marc <marc@agence.fr>', de_email: 'marc@agence.fr', objet: 'Local Lyon', date: le, extrait: 'Bonjour, ci-joint la fiche', pieces_jointes: ['fiche.pdf'], deal_id: null },
    { id: 'm2', de: 'Nora', objet: 'Re: Lorient', date: '2026-09-01T10:00:00Z', extrait: '', pieces_jointes: [], deal_id: 'd1' },
    { id: 'm3', de: 'Pub', objet: 'Promo', date: '2026-09-20T10:00:00Z', extrait: '', pieces_jointes: [], deal_id: null },
  ];
  const b = boiteRecue(mails);
  assert.deepEqual(b.map((m) => m.id), ['m1', 'm3'], 'les rattachés ne sortent pas, les récents d\'abord');
  assert.equal(boiteRecue(mails, { non_rattaches: false }).length, 3);
  const s = mailsASignaler({ mails });
  assert.equal(s.length, 1);
  assert.match(s[0].texte, /un mail de Marc <marc@agence.fr> vient d'arriver : « Local Lyon », avec 1 pièce jointe\. je pré-analyse \?/);
});

test("l'oreille : le JSON du modèle se lit, la phrase dit ce qui a été retenu, et le moment de relire se calcule", async () => {
  const { lireExtraction, phrase, estLeMoment } = await import('./oreille.js');
  const e = lireExtraction('voilà : {"decisions":["Devred en stand-by"],"taches":[{"qui":"Max","quoi":"la préz de Firminy"}],"engagements":[{"de":"Marc","quoi":"envoyer le PV","echeance":"2026-09-25","dossier":"Lorient"}],"faits":[{"sujet":"client Dupont","fait":"budget 300 k"}],"doutes":[]}');
  assert.equal(e.decisions[0], 'Devred en stand-by');
  const t = phrase(e, { mentionner: (x) => `<${x}>` });
  assert.match(t, /^j'ai entendu :/);
  assert.match(t, /- décision : Devred en stand-by/);
  assert.match(t, /- <Max> à faire : la préz de Firminy/);
  assert.match(t, /- Marc doit envoyer le PV \(Lorient\) pour le 25\/09\/2026, c'est au registre/);
  assert.match(t, /- noté : budget 300 k \(client Dupont\)/);
  assert.equal(phrase({ decisions: [], taches: [], engagements: [], faits: [], doutes: [] }), '');
  assert.equal(lireExtraction('rien'), null);
  const recent = [{ texte: 'x'.repeat(100), le: new Date(Date.now() - 60000).toISOString() }];
  const ancien = [{ texte: 'x'.repeat(100), le: new Date(Date.now() - 10 * 60000).toISOString() }];
  assert.equal(estLeMoment([]), false);
  assert.equal(estLeMoment(recent, { dernier: Date.now() - 60000 }), false, 'trop tôt et trop court');
  assert.equal(estLeMoment(ancien, { dernier: Date.now() - 10 * 60000 }), true, 'assez de temps');
  assert.equal(estLeMoment([{ texte: 'x'.repeat(900), le: new Date().toISOString() }], { dernier: Date.now() }), true, 'assez de texte');
});

test("la LOI : les nombres en lettres, les champs manquants, le texte de la maison", async () => {
  const { enLettres, manquants, lettre, champsDepuisDeal } = await import('./loi.js');
  assert.equal(enLettres(200000), 'deux cent mille');
  assert.equal(enLettres(40000), 'quarante mille');
  assert.equal(enLettres(1134000), 'un million cent trente-quatre mille');
  assert.equal(enLettres(71), 'soixante et onze');
  assert.equal(enLettres(80), 'quatre-vingts');
  assert.equal(enLettres(99), 'quatre-vingt-dix-neuf');
  assert.equal(enLettres(1000), 'mille');
  assert.equal(enLettres(300), 'trois cents');
  assert.equal(enLettres(305), 'trois cent cinq');
  assert.deepEqual(manquants({ acquereur_nom: 'X', prix: 1 }).map((m) => m.cle), ['vendeur_societe', 'adresse_bien', 'apport']);
  const c = champsDepuisDeal({ lots: [{ lot: { adresse: { valeur: { rue: '1 avenue Mirabeau', code_postal: '06000', ville: 'Nice' } }, surface_m2: { valeur: 40 }, locataire_nom: { valeur: 'Cookietelier' }, bail_echeance: { valeur: '30/04/2032' }, prix_fai: { valeur: 200000 } } }] });
  assert.equal(c.adresse_bien, '1 avenue Mirabeau, 06000 Nice');
  const h = lettre({ ...c, acquereur_nom: 'Olivier LUCCIONI', acquereur_societe: 'FONCIERE ANGULARIS', acquereur_adresse: 'LOT 12, STILETTO, 20090 AJACCIO', vendeur_societe: 'PAX AVENUE', vendeur_representant: 'Monsieur Jérôme ABECASSIS', vendeur_adresse: '85 rue de France, 06000 Nice', apport: 40000, date: '2026-09-16', validite: '2026-09-23', fin_exclusivite: '2026-10-09', limite_documents: '2026-09-25' });
  assert.match(h, /Lettre d'intention d'achat d'un local commercial situé au 1 avenue Mirabeau, 06000 Nice/);
  assert.match(h, /<b>Le prix de vente FAI TTC proposé est de 200[\s\u202f]000 € \(deux cent mille euros\)\.<\/b>/);
  assert.match(h, /apport personnel de 40[\s\u202f]000 € \(quarante mille euros\)/);
  assert.match(h, /durée maximale de 20 ans avec un taux cible de 4%/);
  assert.match(h, /s'achèvera le 09\/10\/2026, sous réserve[\s\S]*d'ici le 25\/09\/2026/);
  assert.match(h, /valable jusqu'au 23\/09\/2026/);
  assert.match(h, /Le Kbis de la société Cookietelier/);
  assert.match(h, /échéance le 30\/04\/2032/);
  assert.match(h, /CPI75012024000000529/);
  assert.match(h, /À Nice, le 16\/09\/2026/);
  assert.ok(!/<script/.test(h));
  const { pdf } = await import('./loi.js');
  const b = await pdf({ acquereur_nom: 'X', vendeur_societe: 'Y', adresse_bien: 'Z', prix: 200000, apport: 40000 });
  assert.equal(b.slice(0, 5).toString(), '%PDF-', 'un PDF sort sans navigateur');
  const { docx } = await import('./loi.js');
  const w = await docx({ acquereur_nom: 'X', vendeur_societe: 'Y', adresse_bien: 'Z', prix: 200000, apport: 40000 });
  assert.equal(w.slice(0, 2).toString(), 'PK', 'un Word sort aussi (une archive zip)');
  assert.ok(w.length > 3000);
});

test("un dossier s'appelle « Enseigne - Ville »", async () => {
  const { titreCourt } = await import('./agent.js');
  assert.equal(titreCourt({ nom: 'Devred', ville: 'Firminy' }), 'Devred - Firminy');
  assert.equal(titreCourt({ enseigne: 'Cookietelier', activite: 'Pâtisserie', ville: 'Nice' }), 'Cookietelier - Nice');
  assert.equal(titreCourt({ activite: 'Boulangerie', ville: 'Châtenay-Malabry' }), 'Boulangerie - Châtenay-Malabry');
  assert.equal(titreCourt({ nom: 'Devred - Firminy', ville: 'Firminy' }), 'Devred - Firminy', 'pas deux fois la ville');
  assert.equal(titreCourt({ nom: 'Ben' }), 'Ben');
  assert.equal(titreCourt({ ville: 'Lyon' }), 'Local - Lyon');
});

test("« fais tout » : l'adresse d'un dossier se lit, et un mail de l'équipe ne fait pas un agent", async () => {
  const { adresseDuDeal, estInterne, OUTILS_TOUT } = await import('./outils.js');
  assert.equal(adresseDuDeal({ lots: [{ lot: { adresse: { valeur: { rue: '1 avenue Mirabeau', code_postal: '06000', ville: 'Nice' } } } }] }), '1 avenue Mirabeau, 06000 Nice');
  assert.equal(adresseDuDeal({ lots: [{ lot: { adresse: { valeur: 'Place Garibaldi, Nice' } } }] }), 'Place Garibaldi, Nice');
  assert.equal(adresseDuDeal({}), null);
  assert.equal(estInterne('paul.dz@klocka.immo', { domaines: ['klocka.immo'] }), true);
  assert.equal(estInterne('marc@agence-immo.fr', { domaines: ['klocka.immo'] }), false);
  assert.equal(estInterne('', { domaines: ['klocka.immo'] }), false);
  assert.deepEqual(OUTILS_TOUT, ['kzoning', 'kexpertise', 'kestimation']);
  const { ordonnerMails } = await import('./outils.js');
  const docs = { id: 'a', date: '2026-09-22T10:00:00Z', pieces_jointes: [{ nom: 'bail.pdf' }] };
  const fiche = { id: 'b', date: '2026-09-22T12:00:00Z', pieces_jointes: [{ nom: 'teaser.pdf' }, { nom: 'photo.jpg' }] };
  const sans = { id: 'c', date: '2026-09-21T09:00:00Z', pieces_jointes: [] };
  assert.deepEqual(ordonnerMails([fiche, sans, docs]).map((m) => m.id), ['a', 'b', 'c'], 'un PDF d\'abord, le plus ancien en tête, le sans-pièce en dernier');
  const noms = OUTILS.map((o) => o.name);
  assert.ok(noms.includes('faire_tout'));
  assert.ok(noms.includes('deposer_mail'));
});

test("un mail de l'équipe avec une pièce utile entre dans la boîte, marqué interne ; sans pièce, il reste dehors", async () => {
  const { trierMail } = await import('../deal/tri-mails.js');
  const ref = { internes: new Set(['jules.b@klocka.immo']), domaines: new Set(['klocka.immo']), ignores: new Set(), apprises: null, attendus: new Set(), agents: new Set() };
  const avec = trierMail({ de_email: 'paul.dz@klocka.immo', objet: 'Due diligence', extrait: '', pieces_jointes: [{ nom: 'Teaser Firminy.pdf' }] }, ref);
  assert.equal(avec.garder, true);
  assert.equal(avec.interne, true);
  assert.match(avec.raison, /transféré par l'équipe/);
  const sans = trierMail({ de_email: 'jules.b@klocka.immo', objet: 'Re: réunion', extrait: 'ok pour 14h', pieces_jointes: [] }, ref);
  assert.equal(sans.garder, false);
  assert.equal(sans.raison, 'échange interne, sans pièce');
  const logo = trierMail({ de_email: 'jules.b@klocka.immo', objet: 'x', extrait: '', pieces_jointes: [{ nom: 'logo.png' }] }, ref);
  assert.equal(logo.garder, false, 'une signature n\'est pas une pièce');
  const externe = trierMail({ de_email: 'marc@agence.fr', objet: 'Local à vendre', extrait: '', pieces_jointes: [{ nom: 'fiche.pdf' }] }, ref);
  assert.equal(externe.garder, true);
  assert.equal(externe.interne, undefined);
});
