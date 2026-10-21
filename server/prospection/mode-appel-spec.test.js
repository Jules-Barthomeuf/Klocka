// Les scénarios de la spec du mode appel (7 oct. 2026), rejoués sans Monday
// ni boîte mail : ce qui a été compris, les modèles, la validation unique,
// « Annuler », « Pas intéressé », la fiche qui annule la relance.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

// Jamais le vrai Monday ni la vraie boîte : dotenv ne remplace pas une variable déjà posée.
process.env.MONDAY_TOKEN = '';
process.env.MONDAY_BOARD_AGENTS = '';
// Jamais de vrai modèle non plus (13 oct. 2026) : avec le .env chargé, ce fichier appelait l'IA, et son
// résultat dépendait de la machine (« pas_de_murs » avec une clé, « autre » sans).
process.env.LLM_PROVIDER = 'aucun';
process.env.ANTHROPIC_API_KEY = '';
process.env.GEMINI_API_KEY = '';
process.env.GOOGLE_AI_API_KEY = '';
process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-mode-appel-spec-'));
const MA = await import('./mode-appel.js');
const { comprisDe, telephoneValide } = await import('./compris.js');
const { remplirModele, cahierDuModele } = await import('./modeles-appel.js');
const { DEFAULT_TEMPLATES } = await import('../mail.js');
const { Records } = await import('../db.js');

const MERCREDI = new Date('2026-10-07T09:00:00+02:00');
const nora = { email: 'nora.l@klocka.immo', role: 'admin', full_name: 'Nora Lorinquer' };

let numero = 10;
function ville(nom) {
  numero += 1;
  const L = Records.create('ListeAgences', { ville: nom, etat: 'fini', journal: [] });
  const ag = Records.create('AgenceProspect', { liste_id: L.id, nom: `Riviera Commerce ${nom}`, telephone: `04 93 11 22 ${numero}`, email: `contact@riviera-${nom.toLowerCase()}.fr`, agents: [], gerants: [], sources: ['Google Maps'] });
  return { L, ag };
}

test('ce qui a été compris : rien sans sa phrase, les formats vérifiés, la date calculée par le code, le nom douteux surligné', () => {
  const lu = {
    interlocuteur: { nom: 'Marting', civilite: 'Madame' },
    telephone_direct: '06 12 34 56',
    email_donne: 's.martin@riviera.fr',
    biens: ['local rue de France, 80 m²'],
    date_en_mots: 'dans un mois',
    issue_entendue: 'a_des_murs',
    citations: { interlocuteur: 'Bonjour, Madame Marting à l\'appareil', telephone: 'mon direct, c\'est le 06 12 34 56', date: 'j\'aurai peut-être un bien dans un mois', biens: '' },
  };
  const c = comprisDe(lu, { issue: 'pas_de_murs', connus: ['Sophie Martin'], maintenant: MERCREDI });
  assert.match(c.champs.interlocuteur.incertain, /proche de « Sophie Martin »/, 'scénario 7 : nom mal transcrit, surligné');
  assert.equal(c.salutation, 'Bonjour,', 'salutation générique');
  assert.equal(c.champs.telephone.incertain, 'format de numéro invalide', 'jamais corrigé en silence');
  assert.equal(c.champs.email, undefined, 'sans phrase, le mail reste vide');
  assert.equal(c.champs.biens, undefined, 'sans phrase, les biens restent vides');
  assert.equal(c.date_dite, '2026-11-09', 'scénario 3 : « dans un mois » calculé par le code (le 7 nov. est un samedi)');
  assert.match(c.avertissement, /semble dire « A un bien intéressant »/, "l'issue tapée est gardée, la contradiction se signale");
  const sur = comprisDe({ interlocuteur: { nom: 'Sophie Martin', civilite: 'Madame' }, citations: { interlocuteur: 'Sophie Martin, bonjour' } }, { issue: 'pas_de_murs', connus: ['Sophie Martin'] });
  assert.equal(sur.salutation, 'Bonjour Madame Martin,');
  assert.equal(telephoneValide('+33 6 12 34 56 78'), true);
});

test('les modèles : texte fixe, variables remplies, corrections de la spec', () => {
  const murs = DEFAULT_TEMPLATES.find((t) => t.slug === 'demande-documents');
  // Réécrite le 13 oct. 2026 dans le ton des canevas : les pièces, puis qui nous sommes.
  assert.match(murs.contenu, /• Bail commercial/);
  // « Présentation seule » n'est plus livrée (12 oct. 2026) : un seul mail de présentation.
  assert.equal(DEFAULT_TEMPLATES.find((t) => t.slug === 'presentation'), undefined);
  const m = remplirModele(murs, { analyste: 'Nora Lorinquer', salutation: 'Bonjour Madame Martin,', type_bien: 'les murs d\'une boulangerie', ville: 'Antibes' });
  assert.equal(m.objet, 'Suite à notre échange – Documents du dossier Antibes');
  assert.match(m.corps, /^Bonjour Madame Martin,\n\nMerci pour votre temps lors de notre échange téléphonique\.\n\nComme évoqué, afin d'étudier le dossier concernant les murs d'une boulangerie situé à Antibes/);
  assert.match(m.corps, /Au plaisir de travailler ensemble,\n\{signature\}$/, "la signature se pose à l'envoi");
  // Les deux canevas de Jules du 12 oct. 2026, mot pour mot.
  const pres = remplirModele(DEFAULT_TEMPLATES.find((t) => t.slug === 'presentation-cahier'), { analyste: 'Nora Lorinquer' });
  assert.match(pres.corps, /^Bonjour,\n\nMerci pour votre temps lors de notre échange téléphonique\./);
  assert.match(pres.corps, /• 70 % : autour de 300 000 €\n• 20 % : entre 300 000 € et 800 000 €\n• 10 % : de 800 000 € à environ 2 M€/);
  assert.match(pres.corps, /Au plaisir de travailler ensemble,\n\{signature\}$/);
  assert.equal(pres.objet, 'Suite à notre échange – Murs commerciaux occupés');
  assert.deepEqual(cahierDuModele(DEFAULT_TEMPLATES.find((t) => t.slug === 'presentation-cahier')), ['70 % : autour de 300 000 €', '20 % : entre 300 000 € et 800 000 €', '10 % : de 800 000 € à environ 2 M€']);
  const dossier = DEFAULT_TEMPLATES.find((t) => t.slug === 'demande-fiche');
  const d1 = remplirModele(dossier, { salutation: 'Bonjour Madame Martin,', type_bien: "les murs d'une boulangerie", ville: 'Antibes', contexte: null });
  assert.equal(d1.objet, 'Suite à notre échange – Dossier Antibes');
  assert.match(d1.corps, /^Bonjour Madame Martin,\n\nRavi d'avoir échangé avec vous et d'entamer cette collaboration\.\n\nComme évoqué ensemble, je serais ravi de découvrir le dossier concernant les murs d'une boulangerie situé à Antibes, lorsque/);
  assert.match(d1.corps, /• 70 % : autour de 300 000 €/);
  const d2 = remplirModele(dossier, {});
  assert.equal(d2.objet, 'Suite à notre échange – Dossier', 'sans ville, un objet propre');
  assert.match(d2.corps, /concernant \[type de bien\] situé à \[ville\]/, 'non dits, à compléter');
});

test("scénarios 2 et 11 : « Pas de bien pour l'instant », un double tap ne fait qu'une validation ; rien d'affirmé sans vérification", async () => {
  const { L, ag } = ville('Antibes');
  const s = MA.ouvrirSession(L.id, nora).session;
  const r = await MA.noterIssue({ agence_id: ag.id, issue: 'pas_de_murs', session_id: s.id, user: nora });
  assert.equal(r.ok, true);
  const ids = r.appel.propositions.map((p) => p.id);
  assert.deepEqual(ids.slice(0, 4), ['monday', 'mail', 'diffusion', 'relance']);
  const mail = r.appel.propositions.find((p) => p.id === 'mail');
  assert.equal(mail.modele, 'presentation-cahier');
  assert.equal(mail.variantes.length, 1, 'un seul mail de présentation depuis le 12 oct. 2026');
  assert.equal(mail.objet, 'Suite à notre échange – Murs commerciaux occupés');
  const choix = r.appel.propositions.filter((p) => p.coche !== false).map((p) => p.id);
  const [v1, v2] = await Promise.all([
    MA.validerIssue({ appel_id: r.appel.id, choix, cle: 'v-1', session_id: s.id, user: nora, issue: 'pas_de_murs' }),
    MA.validerIssue({ appel_id: r.appel.id, choix, cle: 'v-1', session_id: s.id, user: nora, issue: 'pas_de_murs' }),
  ]);
  assert.equal(v1.ok, true);
  assert.deepEqual(v1.recu, v2.recu);
  const v3 = await MA.validerIssue({ appel_id: r.appel.id, choix, cle: 'v-1', user: nora, issue: 'pas_de_murs' });
  assert.equal(v3.deja, true, 'un nouvel essai rend le même reçu');
  assert.equal(Records.list('ProspectionMail').filter((m) => m.appel_id === r.appel.id).length, 1, 'un seul mail');
  const { E } = await import('../emailing/schema.js');
  const contacts = Records.list(E.CONTACT).filter((c) => c.email === 'contact@riviera-antibes.fr');
  assert.equal(contacts.length, 1, 'un seul ajout à la liste');
  assert.equal(v1.recu.diffusion.etat, 'ok');
  // Sans boîte connectée, le reçu ne dit pas « envoyé » : brouillon à ouvrir.
  assert.equal(v1.recu.mail.etat, 'brouillon');
  assert.match(v1.recu.mail.mailto, /^mailto:contact%40riviera-antibes\.fr\?subject=/);
  // Monday absent ici : orange, jamais vert.
  assert.equal(v1.recu.monday.etat, 'attente');
  assert.match(v1.recu.relance.texte, /novembre/, 'J+30');
  const recap = MA.recapSession(s.id);
  assert.equal(recap.pas_de_bien, 1);
  assert.equal(recap.monday_a_jour, false);
  assert.ok(recap.echecs.some((e) => e.quoi === 'brouillon'));
  assert.match(recap.progression.texte, /^Antibes : 1 \/ 1 agences contactées$/);
});

test('scénario 12 : « Annuler » dans les 10 secondes remet tout comme avant', async () => {
  const { L, ag } = ville('Cannes');
  const s = MA.ouvrirSession(L.id, nora).session;
  const r = await MA.noterIssue({ agence_id: ag.id, issue: 'pas_de_murs', session_id: s.id, user: nora });
  const agentId = Records.get('AgenceProspect', ag.id).carnet_id;
  const avant = Records.get('AgentImmo', agentId);
  const choix = r.appel.propositions.filter((p) => p.coche !== false).map((p) => p.id);
  const v = await MA.validerIssue({ appel_id: r.appel.id, choix, cle: 'c-1', session_id: s.id, user: nora, issue: 'pas_de_murs' });
  assert.ok(Records.get('AgentImmo', agentId).prochaine?.le);
  const a = await MA.annulerValidation(r.appel.id, nora);
  assert.equal(a.ok, true);
  assert.equal(Records.get('ProspectionMail', v.recu.mail.mail_id).etat, 'ecarte', 'mail non envoyé');
  const { E } = await import('../emailing/schema.js');
  assert.ok(!Records.list(E.CONTACT).some((c) => c.email === 'contact@riviera-cannes.fr'), 'agent retiré de la liste');
  const apres = Records.get('AgentImmo', agentId);
  assert.equal(apres.statut, avant.statut);
  assert.deepEqual(apres.prochaine ?? null, avant.prochaine ?? null);
  assert.equal(Records.get('AppelAgent', r.appel.id).etat, 'a_valider', "retour à l'écran d'actions");
  assert.equal(MA.recapSession(s.id).appels, 0);
  const tard = await MA.annulerValidation(r.appel.id, nora);
  assert.equal(tard.ok, false);
});

test('scénario 5 : « Pas intéressé » : ne plus appeler, aucune relance, absente des files', async () => {
  const { L, ag } = ville('Grasse');
  const r = await MA.noterIssue({ agence_id: ag.id, issue: 'pas_interesse', user: nora });
  // 21 oct. 2026 : mail, liste et relance restent à l'écran, décochés ; on valide ce qui est coché.
  assert.ok(['mail', 'diffusion', 'relance'].every((id) => r.appel.propositions.some((p) => p.id === id && p.coche === false)));
  assert.ok(r.appel.propositions.some((p) => p.id === 'ne_plus_appeler'));
  const v = await MA.validerIssue({ appel_id: r.appel.id, choix: r.appel.propositions.filter((p) => p.coche !== false).map((p) => p.id), user: nora, issue: 'pas_interesse' });
  assert.match(v.recu.relance.texte, /Ne plus appeler/);
  const agentId = Records.get('AgenceProspect', ag.id).carnet_id;
  assert.equal(Records.get('AgentImmo', agentId).prochaine, null);
  assert.ok(!MA.fileDAppel(L.id, nora, { maintenantD: new Date('2027-03-01T09:00:00Z') }).file.some((x) => x.id === ag.id));
});

test('scénario 4 : « A un bien intéressant » : relance J+3 ouvrés, annulée quand la fiche arrive', async () => {
  const { ag } = ville('Menton');
  const r = await MA.noterIssue({ agence_id: ag.id, issue: 'a_des_murs', user: nora });
  assert.equal(r.appel.propositions.find((p) => p.id === 'mail').modele, 'demande-fiche', 'la fiche commerciale seule, par défaut');
  const relance = r.appel.propositions.find((p) => p.id === 'relance');
  assert.equal(relance.prochaine.si_fiche, true);
  await MA.validerIssue({ appel_id: r.appel.id, choix: r.appel.propositions.filter((p) => p.coche !== false).map((p) => p.id), user: nora, issue: 'a_des_murs' });
  const agentId = Records.get('AgenceProspect', ag.id).carnet_id;
  assert.ok(Records.get('AgentImmo', agentId).prochaine?.si_fiche);
  const { rattacherFiches } = await import('./index.js');
  await rattacherFiches([{ deal_id: 'D-1', agent_email: 'contact@riviera-menton.fr', titre: 'Murs rue de France', le: new Date(Date.now() + 1000).toISOString(), etape: 'recue' }]);
  assert.equal(Records.get('AgentImmo', agentId).prochaine, null, 'la fiche est là : plus de rappel');
});

test('scénario 8 : sans enregistrement ni note, l\'écran d\'actions s\'ouvre sur l\'issue seule', async () => {
  const { ag } = ville('Vence');
  const r = await MA.noterIssue({ agence_id: ag.id, issue: 'pas_de_murs', user: nora });
  assert.equal(r.ok, true);
  assert.equal(r.appel.sans_details, true);
  assert.deepEqual(Object.keys(r.appel.compris.champs), ['telephone'], 'seul le numéro appelé, sûr');
  assert.equal(r.appel.compris.champs.telephone.appele, true);
  const v = await MA.validerIssue({ appel_id: r.appel.id, choix: ['statut', 'relance'], note: 'Rappeler après les vacances', user: nora, issue: 'pas_de_murs' });
  assert.equal(v.ok, true);
  const agentId = Records.get('AgenceProspect', ag.id).carnet_id;
  assert.ok(Records.get('AgentImmo', agentId).journal.some((j) => /Note : Rappeler après les vacances/.test(j.texte)));
});

test("sans boutons : AK déduit l'issue de la transcription faite en direct, l'écran d'actions s'ouvre toujours, l'issue se change d'un geste", async () => {
  const { issueDuModeAppel } = await import('./appel.js');
  // 12 oct. 2026 : plus de repli sur « Pas de bien » ; un secrétariat qui transmet reste « à rappeler ».
  assert.deepEqual(['veut_mail', 'autre', 'invalide', 'a_des_murs', 'a_rappeler', 'n_importe'].map(issueDuModeAppel), ['veut_mail', 'autre', 'pas_de_reponse', 'a_des_murs', 'a_rappeler', 'autre']);
  const { ag } = ville('Mougins');
  // Rien d'entendu : pas de réponse, mais l'écran s'ouvre (relance seule, pas de Monday).
  const vide = await MA.noterIssue({ agence_id: ag.id, issue: 'auto', transcription: '', user: nora });
  assert.equal(vide.simple, false);
  assert.equal(vide.appel.issue_tapee, 'pas_de_reponse');
  assert.equal(vide.appel.issue_deduite, true);
  assert.ok(!vide.appel.propositions.some((p) => p.id === 'monday'));
  // Une conversation : sans modèle ici, AK rend « autre » (plus de repli sur « Pas de bien » depuis le 12 oct.) ;
  // l'écran des actions s'ouvre quand même, l'issue s'y choisit.
  const parle = await MA.noterIssue({ agence_id: ag.id, issue: 'auto', transcription: "Bonjour, je n'ai rien en murs commerciaux pour le moment, rappelez-moi plus tard dans l'année.", user: nora });
  assert.equal(parle.simple, false);
  assert.equal(parle.appel.issue_tapee, 'autre');
  // Changée à la main : l'ancien appel est remplacé, l'écran reste celui des actions.
  const change = await MA.noterIssue({ agence_id: ag.id, issue: 'a_des_murs', remplace: parle.appel.id, transcription: 'Il a un local à vendre.', user: nora });
  assert.equal(change.simple, false);
  assert.equal(change.appel.propositions.find((p) => p.id === 'mail').modele, 'demande-fiche');
  assert.equal(Records.get('AppelAgent', parle.appel.id).etat, 'remplace');
});

test("un bien et un mandat annoncé : la fiche commerciale seule, et deux relances", () => {
  const lu = {
    biens: ['Carrefour Market, Nice'], demande_documents: 'fiche_commerciale',
    mandat_a_venir: { quoi: "un mandat qu'elle rentre", echeance_en_mots: 'dans deux semaines' },
    citations: { biens: 'on a un Carrefour Market à Nice', mandat: "j'ai peut-être un mandat d'ici deux semaines" },
  };
  const c = comprisDe(lu, { issue: 'a_des_murs', maintenant: MERCREDI });
  assert.equal(c.demande, 'fiche_commerciale');
  assert.equal(c.champs.mandat.date, '2026-10-21');
  assert.equal(comprisDe({ ...lu, demande_documents: 'documents' }, { issue: 'a_des_murs', maintenant: MERCREDI }).demande, 'documents');
  assert.equal(comprisDe({ ...lu, citations: { biens: lu.citations.biens } }, { issue: 'a_des_murs' }).champs.mandat, undefined, 'sans phrase, pas de mandat');
});

test("13 oct. : appeler associe l'agence à celui qui appelle ; un appel compte par son agence ; « Message laissé » ouvre les actions", async () => {
  const { ag } = ville('Menton');
  const IA = await import('./agent-ia.js');
  const p = await IA.pourAppeler(ag.id, {}, nora);
  assert.equal(p.ok, true);
  assert.deepEqual(Records.get('AgenceProspect', ag.id).pour, [nora.email], 'qui appelle quoi : la ligne est à Nora');
  // Un appel posé sur l'agence, sans la fiche du carnet : elle n'est plus « jamais contactée ».
  const { ag: autre } = ville('Monaco');
  Records.create('AppelAgent', { agence_id: autre.id, agent_id: 'fiche-inconnue', par: nora.email, le: MERCREDI.toISOString(), issue: 'pas_de_reponse', etat: 'valide' });
  const [lu] = MA.annoter([Records.get('AgenceProspect', autre.id)], MERCREDI);
  assert.equal(lu.statut.appelee, true);
  assert.notEqual(lu.statut.etat, 'jamais');
  const r = await MA.noterIssue({ agence_id: ag.id, agent_id: p.agent_id, issue: 'repondeur', user: nora });
  assert.equal(r.ok, true);
  assert.equal(r.simple, false, 'message laissé : les actions proposées, pas une validation d\'office');
});

test("13 oct. : sans nom, la case Contact de Monday prend le nom de l'agence, remplacé dès qu'un nom arrive", async () => {
  const MO = await import('./monday-agents.js');
  const cols = MO.colonnesParTitre(MO.COLONNES_DU_TABLEAU);
  assert.equal(MO.valeursPour(null, cols, { agence: 'Riviera Commerce' }).valeurs.name, 'Riviera Commerce');
  const v = MO.valeursPour({ id: '1', nom: 'Riviera Commerce', entreprise: 'Riviera Commerce' }, cols, { agence: 'Riviera Commerce', contact: 'Paul Durand' });
  assert.equal(v.valeurs.name, 'Paul Durand');
});

test("13 oct. : le Suivi marque un appel validé ou non à la main, sans rien envoyer", async () => {
  const S = await import('./suivi-appels.js');
  const x = Records.create('AppelAgent', { agence_id: null, agent_id: null, par: nora.email, le: MERCREDI.toISOString(), issue: 'pas_de_murs', etat: 'a_valider' });
  assert.equal(S.marquerValidation(x.id, true, nora).etat, 'valide');
  assert.equal(Records.get('AppelAgent', x.id).validation_main.at(-1).par, nora.email);
  assert.equal(S.marquerValidation(x.id, false, nora).etat, 'a_valider');
  assert.equal(S.marquerValidation('rien', true, nora).ok, false);
});

test("13 oct. : ses propres mails (Compte > Mails) passent devant ceux de l'équipe ; revenir efface sa version", async () => {
  const MP = await import('../mails-perso.js');
  const { modele } = await import('./modeles-appel.js');
  const liste = await MP.mesMails(nora);
  assert.deepEqual(liste.map((m) => m.slug), ['presentation-cahier', 'demande-fiche', 'demande-documents']);
  assert.equal(liste[0].perso, null);
  assert.equal(MP.enregistrer(nora, 'presentation-cahier', { objet: 'Notre échange', contenu: '{{salutation}}\n\nMa version.\n{{signature}}' }).ok, true);
  assert.equal((await modele('presentation-cahier', { par: nora.email })).objet, 'Notre échange');
  assert.notEqual((await modele('presentation-cahier', { par: 'paul@klocka.immo' })).objet, 'Notre échange', 'chacun la sienne');
  assert.equal(MP.enregistrer(nora, 'loi', { objet: 'x', contenu: 'y' }).ok, false);
  MP.revenir(nora, 'presentation-cahier');
  assert.equal((await modele('presentation-cahier', { par: nora.email })).objet, 'Suite à notre échange – Murs commerciaux occupés');
});

test("13 oct. : « dernier interlocuteur » seulement si on lui a parlé ; les Remarques Monday sans lignes vides en tête", async () => {
  const a = { nom: 'Riviera Commerce', telephone: '0493000000' };
  assert.equal(MA.contactsDe(a, { nom: 'Jean Gérant', telephones: [] }).some((c) => c.source === 'Dernier interlocuteur'), false);
  assert.equal(MA.contactsDe(a, { nom: 'Jean Gérant', telephones: [], dernier_contact_le: '2026-10-01' }).some((c) => c.source === 'Dernier interlocuteur'), true);
  const MO = await import('./monday-agents.js');
  const cols = MO.colonnesParTitre(MO.COLONNES_DU_TABLEAU);
  const v = MO.valeursPour({ id: '1', nom: 'Paul', remarques: '\n\n​\n01/10/2026 · ancien' }, cols, { agence: 'X', remarque: '13/10/2026 · nouveau' });
  assert.equal(v.valeurs[cols.remarques.id], '01/10/2026 · ancien\n13/10/2026 · nouveau');
});

test("13 oct. : « envoyer un mail » dans les notes propose le mail, même après un message laissé", async () => {
  const { ag } = ville('Cagnes');
  const r = await MA.noterIssue({ agence_id: ag.id, issue: 'repondeur', notes: 'Message laissé, lui envoyer un mail de présentation', user: nora });
  assert.equal(r.ok, true);
  assert.ok(r.appel.propositions.some((p) => p.type === 'mail' && p.coche !== false), 'le mail de présentation est proposé, coché');
  const r2 = await MA.noterIssue({ agence_id: ag.id, issue: 'repondeur', notes: 'pas de mail pour lui', user: nora });
  assert.ok(r2.appel.propositions.some((p) => p.type === 'mail' && p.coche === false), 'toujours là, mais décoché');
});

test("21 oct. : l'email, la liste et la relance sont toujours à l'écran, décochés quand l'issue ne les prévoit pas", async () => {
  const { ag } = ville('Vence');
  const r = await MA.noterIssue({ agence_id: ag.id, issue: 'a_rappeler', recit: 'Le secrétariat transmet au responsable, rappeler la semaine prochaine', user: nora });
  assert.equal(r.ok, true);
  const p = (id) => r.appel.propositions.find((x) => x.id === id);
  assert.ok(p('mail') && p('mail').coche === false, 'Email décoché');
  assert.ok(p('diffusion') && p('diffusion').coche === false, 'liste décochée');
  assert.ok(p('relance'), 'la relance prévue pour « à rappeler »');
  const v = await MA.validerIssue({ appel_id: r.appel.id, choix: r.appel.propositions.filter((x) => x.coche !== false).map((x) => x.id), user: nora, issue: 'a_rappeler' });
  assert.equal(v.ok, true);
  assert.equal(v.recu.mail, null, 'décoché : aucun mail ne part');
});
