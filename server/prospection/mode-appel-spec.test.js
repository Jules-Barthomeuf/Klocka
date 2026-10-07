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
  // Le canevas de Jules (7 oct. 2026), mot pour mot.
  assert.match(murs.contenu, /- Diagnostiques \(si déjà faits\)/);
  assert.match(murs.contenu, /Pour rappel nous travaillons avec des mandats de recherche vos honoraires resteront inchangés\./);
  const seule = remplirModele(DEFAULT_TEMPLATES.find((t) => t.slug === 'presentation'), { analyste: 'Nora Lorinquer' });
  assert.equal(seule.objet, 'Présentation de notre activité – Klocka');
  assert.match(seule.corps, /Je suis Nora Lorinquer, analyste/);
  assert.match(seule.corps, /Je vous souhaite une excellente journée\.\n\nBien cordialement\n\{signature\}$/);
  const m = remplirModele(murs, { analyste: 'Nora Lorinquer', salutation: 'Bonjour Madame Martin,', contexte: 'Comme évoqué, le local de la rue de France nous intéresse.' });
  assert.equal(m.objet, 'Murs commerciaux - Klocka');
  assert.match(m.corps, /^Bonjour Madame Martin,\n\nComme évoqué, le local de la rue de France nous intéresse\.\n\nPour faire suite/);
  assert.match(m.corps, /Bien à vous,\n\{signature\}$/);
  assert.match(m.corps, /\{signature\}$/, "la signature se pose à l'envoi");
  const pres = remplirModele(DEFAULT_TEMPLATES.find((t) => t.slug === 'presentation-cahier'), { analyste: 'Nora Lorinquer' });
  assert.match(pres.corps, /^Bonjour,\n/);
  assert.match(pres.corps, /Je suis Nora Lorinquer, analyste/);
  assert.equal(pres.objet, 'Présentation de notre activité et cahier des charges – Klocka');
  assert.deepEqual(cahierDuModele(DEFAULT_TEMPLATES.find((t) => t.slug === 'presentation-cahier')).slice(0, 2), ['Type de bien : murs commerciaux occupés', 'Rendement : 5 % à 7 % AEM']);
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
  assert.equal(mail.variantes[1].slug, 'presentation', 'Présentation seule en un clic');
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
  assert.ok(!r.appel.propositions.some((p) => ['mail', 'diffusion', 'relance'].includes(p.id)));
  assert.ok(r.appel.propositions.some((p) => p.id === 'ne_plus_appeler'));
  const v = await MA.validerIssue({ appel_id: r.appel.id, choix: r.appel.propositions.map((p) => p.id), user: nora, issue: 'pas_interesse' });
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
  assert.deepEqual(['veut_mail', 'autre', 'invalide', 'a_des_murs'].map(issueDuModeAppel), ['pas_de_murs', 'pas_de_murs', 'pas_de_reponse', 'a_des_murs']);
  const { ag } = ville('Mougins');
  // Rien d'entendu : pas de réponse, mais l'écran s'ouvre (relance seule, pas de Monday).
  const vide = await MA.noterIssue({ agence_id: ag.id, issue: 'auto', transcription: '', user: nora });
  assert.equal(vide.simple, false);
  assert.equal(vide.appel.issue_tapee, 'pas_de_reponse');
  assert.equal(vide.appel.issue_deduite, true);
  assert.ok(!vide.appel.propositions.some((p) => p.id === 'monday'));
  // Une conversation : sans modèle ici, AK rend « autre », qui devient « Pas de bien pour l'instant ».
  const parle = await MA.noterIssue({ agence_id: ag.id, issue: 'auto', transcription: "Bonjour, je n'ai rien en murs commerciaux pour le moment, rappelez-moi plus tard dans l'année.", user: nora });
  assert.equal(parle.appel.issue_tapee, 'pas_de_murs');
  assert.ok(parle.appel.propositions.some((p) => p.id === 'mail'));
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
