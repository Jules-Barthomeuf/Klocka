// « Il me rappelle » (spec du 8 oct. 2026) : les notes font foi, les candidats
// (l'appel sans réponse d'abord), chercher par les quatre derniers chiffres,
// identifier (« Ne plus appeler », la relance d'un collègue libérée), « Rien
// de nouveau », abandonner, et le bandeau « Rappel à terminer ».

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.MONDAY_TOKEN = '';
process.env.MONDAY_BOARD_AGENTS = '';
process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-rappels-'));
const RP = await import('./rappels.js');
const RL = await import('./relances.js');
const { Records } = await import('../db.js');

const NORA = { email: 'nora.l@klocka.immo' };
const MAXIME = { email: 'maxime.p@klocka.immo' };
const MAINTENANT = new Date('2026-10-08T14:00:00Z');

test('les notes font foi : leur email et leur numéro remplacent ceux entendus ; un email mal tapé est signalé', () => {
  const compris = { champs: { email: { valeur: 'marc.dupon@riviera.fr', source: 'mon mail c\'est marc dupon' }, interlocuteur: { valeur: 'Marc Dupont' } } };
  const c = RP.notesFontFoi(compris, 'email : marc.dupont@riviera-immo.fr, tel 06 12 34 56 78');
  assert.equal(c.champs.email.valeur, 'marc.dupont@riviera-immo.fr');
  assert.equal(c.champs.email.note, true);
  assert.equal(R_norm(c.champs.telephone.valeur), '0612345678');
  assert.equal(c.champs.interlocuteur.valeur, 'Marc Dupont', 'le reste ne bouge pas');
  assert.deepEqual(RP.lireNotes('marc.dupont@riviera').avertissements, ['« marc.dupont@riviera » n\'est pas une adresse valide']);
  assert.match(RP.texteAAnalyser('Bonjour, Marc de Riviera.', 'email marc@riviera.fr'), /Notes de l'analyste \(elles font foi/);
  assert.match(RP.texteAAnalyser(null, 'Rien en ce moment, rappeler en décembre'), /^Résumé de l'appel par l'analyste/, 'sans enregistrement, les notes sont le récit');
  assert.equal(RP.sansContenu('Allô ? Oui.', ''), true);
  assert.equal(RP.sansContenu('Allô ? Oui.', 'il a un local'), false);
});
const R_norm = (t) => String(t).replace(/\D/g, '');

test("les candidats : l'appel sans réponse d'abord, un numéro tapé passe devant tout, deux homonymes restent deux", () => {
  const agents = [
    { id: 'a1', nom: 'Marc Dupont', agence: 'Riviera Immo', ville: 'Nice', telephones: ['0611111111'] },
    { id: 'a2', nom: 'Sophie Martin', agence: 'Azur Commerces', ville: 'Nice', telephones: ['0622222222'] },
    { id: 'a3', nom: 'Marc Dupont', agence: 'Dupont Conseil', ville: 'Lyon', telephones: ['0633333333'] },
  ];
  const sansReponse = [{ agent_id: 'a1', le: '2026-10-07T08:12:00Z' }];
  const c = RP.classer({ sansReponse, agents, texte: 'Bonjour, vous avez essayé de me joindre hier.', maintenantD: MAINTENANT });
  assert.equal(c[0].agent_id, 'a1');
  assert.equal(c[0].raison, 'appelé hier à 10 h 12');
  // Le nom entendu : les deux Marc Dupont, chacun avec son agence et sa ville.
  const h = RP.classer({ agents, texte: 'Oui bonjour, Marc Dupont à l\'appareil.', maintenantD: MAINTENANT });
  assert.deepEqual(h.map((x) => x.agent_id).sort(), ['a1', 'a3']);
  assert.ok(h.every((x) => x.agence && x.ville));
  // Le numéro des notes l'emporte sur l'appel sans réponse.
  const n = RP.classer({ sansReponse, agents, notes: 'rappeler au 06 22 22 22 22', maintenantD: MAINTENANT });
  assert.equal(n[0].agent_id, 'a2');
  assert.equal(n[0].raison, 'numéro des notes');
  assert.equal(n.length, 2);
  assert.ok(RP.classer({ agents: Array.from({ length: 6 }, (_, i) => ({ id: `x${i}`, nom: `Agent Commun${i}`, agence: 'Riviera Immo' })), texte: 'Riviera Immo' }).length <= 3, 'trois au plus');
});

test("un rappel de bout en bout : ouvrir, Stop, candidats, chercher par quatre chiffres, identifier, « Ne plus appeler » levé, abandon", async () => {
  const l = Records.create('ListeAgences', { ville: 'Nice' });
  const f = Records.create('AgentImmo', { nom: 'Marc Dupont', agence: 'Riviera Immo', ville: 'Nice', telephones: ['06 11 11 11 11'], ne_plus_appeler: true, statut: 'archive', ne_plus_appeler_le: '2026-10-08T09:00:00Z' });
  const g = Records.create('AgenceProspect', { liste_id: l.id, nom: 'Riviera Immo', telephone: '04 93 00 00 01', carnet_id: f.id, sources: ['Google Maps'] });
  Records.create('AppelAgent', { agent_id: f.id, agence_id: g.id, par: NORA.email, issue: 'pas_de_reponse', etat: 'valide', le: new Date(Date.now() - 86400000).toISOString() });

  const o = RP.ouvrir(NORA);
  assert.equal(o.rappel.etat, 'enregistrement');
  assert.deepEqual(RP.enCours(NORA).map((x) => x.id), [o.rappel.id], 'le bandeau « Rappel à terminer » le montre déjà');
  assert.deepEqual(RP.enCours(MAXIME), [], 'chacun ses rappels');
  const fin = await RP.finir(o.rappel.id, { morceaux: ['Bonjour, vous m\'avez appelé hier, c\'est pour mon local.'], notes: '', duree_s: 42 }, NORA);
  assert.equal(fin.rappel.etat, 'a_identifier');
  assert.equal(fin.rappel.candidats[0].agent_id, f.id);
  assert.equal(fin.rappel.candidats[0].ne_plus_appeler, true);
  assert.ok(RP.chercher('1111').some((x) => x.agent_id === f.id), 'les quatre derniers chiffres');
  assert.ok(RP.chercher('riviera').some((x) => x.agent_id === f.id));

  // Rien ne s'exécute avant l'identification.
  assert.equal((await RP.analyser(o.rappel.id, {}, NORA)).ok, false);
  // Maxime avait pris sa relance : le rappel passe devant, la ligne est libérée.
  RL.oublierPrises();
  RL.prendre(f.id, MAXIME);
  const id = await RP.identifier(o.rappel.id, { agent_id: f.id }, NORA);
  assert.equal(id.ok, true);
  assert.equal(id.rappel.agence.id, g.id);
  assert.deepEqual(id.rappel.avertissements.map((x) => x.genre), ['ne_plus_appeler', 'pris']);
  assert.match(id.rappel.avertissements[0].texte, /^Ne plus appeler, depuis le 8 octobre/);
  assert.match(id.rappel.avertissements[1].texte, /^En cours chez Maxime/);
  assert.equal(RL.prises()[f.id], undefined);
  const lv = await RP.lever(o.rappel.id, NORA);
  assert.deepEqual(lv.rappel.avertissements.map((x) => x.genre), ['pris']);
  assert.equal(Records.get('AgentImmo', f.id).ne_plus_appeler, false);
  assert.equal(Records.get('AgentImmo', f.id).statut, 'a_rappeler');

  assert.equal(RP.abandonner(o.rappel.id, NORA).ok, true);
  assert.equal(Records.get('RappelEntrant', o.rappel.id).transcription, null, 'la transcription s\'efface');
  assert.deepEqual(RP.enCours(NORA), []);
});

test("« Rien de nouveau » : agent identifié, dernier contact aujourd'hui, la retentative tombe, rien d'autre ; un nouveau contact se crée", async () => {
  const f = Records.create('AgentImmo', { nom: 'Lucie Bref', telephones: ['0644444444'], statut: 'a_rappeler', tentatives: 1, prochaine: { le: '2026-10-09', quoi: 'rappeler (essai 2 sur 3), plutôt le matin' } });
  const o = RP.ouvrir(NORA);
  await RP.finir(o.rappel.id, { morceaux: ['Allô ? Oui.'], notes: '' }, NORA);
  await RP.identifier(o.rappel.id, { agent_id: f.id }, NORA);
  const a = await RP.analyser(o.rappel.id, {}, NORA);
  assert.equal(a.rien_de_nouveau, true);
  const v = await RP.rienDeNouveau(o.rappel.id, NORA, { maintenantD: MAINTENANT });
  assert.equal(v.ok, true);
  const apres = Records.get('AgentImmo', f.id);
  assert.equal(apres.dernier_contact_le, MAINTENANT.toISOString());
  assert.match(apres.prochaine.quoi, /point du mois/);
  assert.equal(apres.statut, 'en_discussion');
  assert.equal(apres.tentatives, 0);
  assert.equal(Records.get('RappelEntrant', o.rappel.id).etat, 'valide');
  assert.ok(Records.list('AppelAgent').some((x) => x.agent_id === f.id && x.issue === 'rien_de_nouveau' && x.rappel_entrant));
  assert.ok(Records.list('ProspectionMail').every((m) => m.agent_id !== f.id), 'aucun mail');

  // Un inconnu : nouveau contact, avec le numéro tapé dans les notes.
  const o2 = RP.ouvrir(NORA);
  await RP.finir(o2.rappel.id, { morceaux: [], notes: 'Paul Neuf, 07 55 55 55 55' }, NORA);
  const n = await RP.identifier(o2.rappel.id, { nouveau: { nom: 'Paul Neuf', agence: 'Agence Neuve', ville: 'Antibes' } }, NORA);
  assert.equal(n.ok, true);
  const cree = Records.get('AgentImmo', Records.get('RappelEntrant', o2.rappel.id).agent_id);
  assert.equal(cree.nom, 'Paul Neuf');
  assert.ok((cree.telephones || []).some((t) => R_norm(t) === '0755555555'));
  assert.equal(n.rappel.agence.nom, 'Agence Neuve');
  RP.abandonner(o2.rappel.id, NORA);
});

test("l'heure dite départage : « vous m'avez appelé à 10h » écarte l'appel de 20 h 47, « Probablement » seulement s'il se détache", () => {
  const agents = [
    { id: 'p', nom: 'Petrova Investissement', agence: 'Petrova Investissement Immobilier', ville: 'Nice', telephones: ['0611111111'] },
    { id: 'r', nom: 'Riviera Commerce', agence: 'Riviera Commerce', ville: 'Nice', telephones: ['0622222222'] },
  ];
  const hier = (h, m) => new Date(Date.UTC(2026, 9, 7, h - 2, m)).toISOString(); // heure de Paris (UTC+2)
  // Le sans-réponse le plus récent (20 h 47) ne colle pas à l'heure dite : il n'est pas proposé.
  const seul = RP.classer({ sansReponse: [{ agent_id: 'p', le: hier(20, 47) }], agents, texte: "Oui bonjour, vous m'avez appelé à 10h.", maintenantD: MAINTENANT });
  assert.deepEqual(seul, []);
  // Celui de 10 h 05 passe devant, avec « l'heure dite ».
  const deux = RP.classer({ sansReponse: [{ agent_id: 'p', le: hier(20, 47) }, { agent_id: 'r', le: hier(10, 5) }], agents, texte: "Vous m'avez appelé hier à dix heures.", maintenantD: MAINTENANT });
  assert.equal(deux[0].agent_id, 'r');
  assert.match(deux[0].raison, /appelé hier à 10 h 05, l'heure dite/);
  assert.equal(deux[0].probable, true);
  assert.equal(deux.length, 1);
  // Sans heure dite, deux sans-réponse proches : « Peut-être », l'analyste choisit.
  const flou = RP.classer({ sansReponse: [{ agent_id: 'p', le: hier(20, 47) }, { agent_id: 'r', le: hier(10, 5) }], agents, texte: 'Bonjour, vous avez essayé de me joindre.', maintenantD: MAINTENANT });
  assert.equal(flou.length, 2);
  assert.equal(flou[0].probable, false);
});

test('la remarque Twenty CRM : la date et ce que l\'agent a dit, ni qui a appelé ni l\'issue', async () => {
  const { ligneDeRemarque } = await import('./monday-agents.js');
  assert.equal(ligneDeRemarque({ jour: '2026-10-08', analyste: 'Jules', issue: "Pas de bien pour l'instant", resume: "L'agent a un bien vide actuellement et prévoit de prendre un mandat sur un commerce bien placé d'ici 2 à 3 semaines." }),
    "08/10/2026 · L'agent a un bien vide actuellement et prévoit de prendre un mandat sur un commerce bien placé d'ici 2 à 3 semaines.");
  assert.equal(ligneDeRemarque({ jour: '2026-10-08', issue: 'Pas intéressé', ne_plus_appeler: true }), '08/10/2026 · Ne plus appeler · Pas intéressé');
});

test("rappel d'un autre interlocuteur : « Contact modifié », son nom, son numéro et son email remplacent ceux de la ligne Twenty CRM", async () => {
  const MO = await import('./monday-agents.js');
  const cols = MO.colonnesParTitre(MO.COLONNES_DU_TABLEAU);
  const ligne = { id: '1', nom: 'Sophie Martin', prenom: 'Sophie', telephone: '+33611111111', emails: ['sophie@valoris.fr'], entreprise: 'Valoris Real Estate' };
  const base = { agence: 'Valoris Real Estate', contact: 'Florian Donzel', telephone: '06 22 33 44 55', email: 'florian@valoris.fr', dernier_contact: '2026-10-13' };
  const v = MO.valeursPour(ligne, cols, { ...base, remplacer: { contact: 'Florian Donzel', telephone: '06 22 33 44 55', email: 'florian@valoris.fr' } });
  assert.equal(v.contact_modifie, true);
  assert.equal(v.valeurs.name, 'Florian Donzel');
  const titres = Object.fromEntries(v.apercu.map((x) => [x.titre, x]));
  assert.equal(titres.Contact.avant, 'Sophie Martin');
  assert.equal(titres['Prénom'].apres, 'Florian');
  assert.equal(R_norm(titres['Téléphone'].apres), '0622334455');
  assert.equal(titres['E-mail'].apres, 'florian@valoris.fr');
  // Un appel sortant ordinaire ne touche pas un contact déjà là.
  const s = MO.valeursPour(ligne, cols, base);
  assert.equal(s.contact_modifie, false);
  assert.equal(s.valeurs.name, undefined);
  // Le même interlocuteur qui rappelle : rien ne change.
  assert.equal(MO.valeursPour(ligne, cols, { ...base, remplacer: { contact: 'Sophie Martin', telephone: '06 11 11 11 11', email: 'sophie@valoris.fr' } }).contact_modifie, false);
});

test("le numéro appelé ne remplace jamais celui de la ligne : seul un numéro entendu ou noté compte", async () => {
  const MA = await import('./mode-appel.js');
  const d = MA.donneesMonday({ appel: { le: '2026-10-13T10:00:00Z', rappel_entrant: true, compris: { champs: { interlocuteur: { valeur: 'Florian Donzel' }, telephone: { valeur: '05 57 00 00 00', appele: true } } } }, agence: { nom: 'Valoris Real Estate' }, fiche: null, issue: 'pas_de_murs', user: MAXIME });
  assert.equal(d.remplacer.contact, 'Florian Donzel');
  assert.equal(d.remplacer.telephone, null);
  assert.equal(MA.donneesMonday({ appel: { le: '2026-10-13T10:00:00Z', compris: {} }, agence: { nom: 'X' }, fiche: null, issue: 'pas_de_murs', user: MAXIME }).remplacer, undefined, 'un appel sortant ne remplace rien');
});

test("chercher à plusieurs mots, et les appels déjà faits par l'équipe : un clic retrouve l'agence qu'il rappelle", () => {
  const f = Records.create('AgentImmo', { nom: 'Sophie Martin', agence: 'Valoris Real Estate', ville: 'Antibes', telephones: ['0493112233'] });
  assert.ok(RP.chercher('Valoris immobilier').some((x) => x.agent_id === f.id), '« immobilier » ne compte pas, « Valoris » suffit');
  const quand = new Date(MAINTENANT.getTime() - 3600000).toISOString();
  Records.create('AppelAgent', { agent_id: f.id, agent: f.nom, par: MAXIME.email, le: quand, issue: 'pas_de_reponse', numero: '04 93 11 22 33', etat: 'valide' });
  const faits = RP.appelsFaits('valoris', { maintenantD: MAINTENANT });
  assert.equal(faits[0].agent_id, f.id);
  assert.match(faits[0].raison, /appelé par .* aujourd'hui à .*pas de réponse/i);
  assert.equal(RP.appelsFaits('2233', { maintenantD: MAINTENANT })[0].agent_id, f.id, 'par les derniers chiffres');
  assert.equal(RP.appelsFaits('inconnue', { maintenantD: MAINTENANT }).length, 0);
});

test("appel rapide et échange raconté : le même chemin qu'un rappel, seul le sens change (19 oct. 2026)", async () => {
  const f = Records.create('AgentImmo', { nom: 'Martin Sens', agence: 'ERA Cannes', telephones: ['0633333333'], statut: 'en_discussion' });
  // L'appel rapide : on l'appelle, le reste est un rappel.
  const o = RP.ouvrir(NORA, { sens: 'sortant' });
  assert.equal(o.rappel.sens, 'sortant');
  await RP.finir(o.rappel.id, { morceaux: ['Allô ? Oui.'], notes: '' }, NORA);
  await RP.identifier(o.rappel.id, { agent_id: f.id }, NORA);
  await RP.analyser(o.rappel.id, {}, NORA);
  await RP.rienDeNouveau(o.rappel.id, NORA, { maintenantD: MAINTENANT });
  assert.ok((Records.get('AgentImmo', f.id).journal || []).some((j) => /Appel rapide : rien de nouveau/.test(j.texte)) || Records.list('AppelAgent').some((x) => x.agent_id === f.id && x.issue === 'rien_de_nouveau'));
  // Un sens inconnu redevient un rappel entrant.
  assert.equal(RP.ouvrir(NORA, { sens: 'nimporte' }).rappel.sens, 'entrant');
  // Raconté : le récit tient lieu d'appel, l'agent est proposé par son nom.
  assert.equal((await RP.raconter('ok', NORA)).ok, false, 'un récit vide est refusé');
  const r = await RP.raconter("Martin Sens d'ERA Cannes m'a écrit : le bail est renouvelé, il m'envoie le dossier lundi.", NORA);
  assert.equal(r.ok, true);
  assert.equal(r.rappel.sens, 'raconte');
  assert.equal(r.rappel.etat, 'a_identifier');
  assert.ok(r.rappel.candidats.some((c) => c.agent_id === f.id || c.id === f.id), 'Martin Sens est proposé');
  RP.abandonner(r.rappel.id, NORA);
});

// « Ça se trompe pour reconnaître qui a appelé » (19 oct. 2026, Jules) : ce que la personne dit d'elle l'emporte.
test('le nom entendu passe devant le dernier appel sans réponse, même mal transcrit ou réduit au nom de famille', () => {
  const MAINTENANT = new Date('2026-10-19T09:00:00Z');
  const agents = [
    { id: 'paul', nom: 'Paul Lefebvre', agence: 'Azur Immo', ville: 'Nice' },
    { id: 'sophie', nom: 'Sophie Martin', agence: 'Riviera Commerce', ville: 'Nice' },
  ];
  const sansReponse = [{ agent_id: 'paul', le: '2026-10-19T08:30:00Z' }];
  const c = RP.classer({ sansReponse, agents, texte: 'Oui bonjour, Sophie Martin, vous avez cherché à me joindre ?', maintenantD: MAINTENANT });
  assert.equal(c[0].agent_id, 'sophie');
  assert.equal(c[0].probable, true);
  // Une lettre de travers dans la transcription.
  assert.equal(RP.classer({ sansReponse, agents, texte: 'Bonjour, Sophie Martain à l appareil.', maintenantD: MAINTENANT })[0].agent_id, 'sophie');
  // Le nom de famille seul, avec l'agence.
  const f = RP.classer({ sansReponse, agents, texte: 'Madame Martin, de Riviera Commerce.', maintenantD: MAINTENANT });
  assert.equal(f[0].agent_id, 'sophie');
  assert.match(f[0].raison, /nom de famille entendu/);
  // Sans rien de dit, l'appel sans réponse reste candidat, mais pas « Probablement ».
  const r = RP.classer({ sansReponse, agents, texte: 'Bonjour, vous m avez appelé ?', maintenantD: MAINTENANT });
  assert.equal(r[0].agent_id, 'paul');
  assert.equal(r[0].probable, false);
  assert.equal(RP.nomEntendu('Sophie Martin', 'bonjour sophie martain'), 'complet');
  assert.equal(RP.nomEntendu('Jean Roux', 'jean roux'), 'complet');
  assert.equal(RP.nomEntendu('Sophie Martin', 'rien a voir'), null);
});

test("« Manon de l'agence Primo Immobilier » : l'agence qui se présente l'emporte, la ville dictée dans un mail ne désigne pas une agence (19 oct. 2026)", () => {
  const texte = "Oui, bonjour, Manon de l'agence Primo Immobilier. Vous avez tenté de nous joindre ? Les commerciaux ne sont pas là, envoyez-moi un mail. Donc c'est Lyon, comme la ville, arobase, agence, point com.";
  const t = (x) => x.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  assert.equal(RP.agenceEntendue('Primo Immobilier', t(texte), 'Lyon'), 'presentee');
  assert.equal(RP.agenceEntendue('Agence Lyon Immo', t(texte), 'Lyon'), null, 'la ville seule ne compte pas');
  assert.equal(RP.agenceEntendue('Orpi Primo', t(texte), 'Villeurbanne'), null);
  const agences = [
    { id: 'g1', nom: 'Primo Immobilier', ville: 'Lyon' },
    { id: 'g3', nom: 'Agence Lyon Immo', ville: 'Lyon' },
    { id: 'g2', nom: 'Century 21 Lyon Centre', ville: 'Lyon' },
  ];
  const maintenantD = new Date('2026-10-19T15:00:00Z');
  const sansReponse = [
    { agence_id: 'g3', agent: 'Agence Lyon Immo', issue: 'sans_reponse', le: '2026-10-19T14:40:00Z' },
    { agence_id: 'g2', agent: 'Century 21 Lyon Centre', issue: 'sans_reponse', le: '2026-10-19T14:20:00Z' },
  ];
  for (const sr of [sansReponse, []]) {
    const c = RP.classer({ sansReponse: sr, agents: [], agences, texte, maintenantD });
    assert.equal(c[0].agence, 'Primo Immobilier');
    assert.equal(c[0].probable, true);
  }
});

test("essai, identification avant le Stop, « Pas la bonne personne », pas de doublon (19 oct. 2026)", async () => {
  const JULES = { email: 'jules.b@klocka.immo', role: 'admin' };
  // Essai : la liste fictive, ses agences pour la recherche, un nouveau contact qui reste dans l'essai.
  const e = await RP.ouvrirEssaiRappel(JULES, { sens: 'sortant' });
  assert.equal(e.rappel.essai, true);
  const r0 = Records.get('RappelEntrant', e.rappel.id);
  const trouves = RP.chercher('Riviera', { essaiListeId: r0.essai_liste_id });
  assert.equal(trouves[0].agence, 'Riviera Test Immobilier');
  assert.ok(!RP.chercher('', { essaiListeId: r0.essai_liste_id }).some((x) => !/Essai|Test|Démo|Fictive/.test(x.agence)), 'rien du carnet réel');
  const avant = Records.list('AgentImmo').filter((a) => !a.essai).length;
  const n = await RP.identifier(e.rappel.id, { nouveau: { nom: 'Paul Inconnu', agence: 'Agence Nouvelle Vague', telephone: '0611223344' } }, JULES);
  assert.equal(n.ok, true);
  assert.equal(Records.list('AgentImmo').filter((a) => !a.essai).length, avant, 'le carnet réel ne bouge pas');
  // Identifié pendant l'appel : il le reste au Stop.
  const f = await RP.finir(e.rappel.id, { morceaux: ['Allô Paul, c\'est Jules de Klocka, je vous appelle pour faire le point.'], notes: '' }, JULES);
  assert.equal(f.rappel.etat, 'identifie');
  // Pas la bonne personne : retour à l'identification.
  const ri = RP.reidentifier(e.rappel.id, JULES);
  assert.equal(ri.rappel.etat, 'a_identifier');
  assert.equal(ri.rappel.agent, null);
  // Hors essai : un nouveau contact qui existe déjà (même numéro) est repris, pas doublé.
  const existant = Records.create('AgentImmo', { nom: 'Claire Double', agence: 'Agence Double', telephones: ['0677889900'], statut: 'nouveau' });
  const o = RP.ouvrir(JULES);
  await RP.finir(o.rappel.id, { morceaux: [], notes: 'Claire, 06 77 88 99 00' }, JULES);
  const id = await RP.identifier(o.rappel.id, { nouveau: { nom: 'Claire D.', agence: 'Agence Double', telephone: '06 77 88 99 00' } }, JULES);
  assert.equal(id.ok, true);
  assert.equal(Records.get('RappelEntrant', o.rappel.id).agent_id, existant.id);
  RP.abandonner(o.rappel.id, JULES);
});

test("les appels manqués d'un collègue comptent, et disent qui a appelé", () => {
  const c = RP.classer({
    sansReponse: [{ agence_id: 'g1', agent: 'Primo Immobilier', issue: 'pas_de_reponse', le: '2026-10-19T09:00:00Z', par: 'maxime.p@klocka.immo' }],
    agents: [], agences: [{ id: 'g1', nom: 'Primo Immobilier', ville: 'Lyon' }], texte: 'Bonjour, vous avez essayé de nous joindre ?', maintenantD: new Date('2026-10-19T15:00:00Z'), moi: 'nora.l@klocka.immo',
  });
  assert.equal(c[0].agence, 'Primo Immobilier');
  assert.match(c[0].raison, /par Maxime/);
});

// La note vocale (21 oct. 2026, Jules : « il ne faut pas que ça devine ») : ce qui est dit, cherché à l'identique.
test('trouverDepuisNote : le numéro, puis le nom avec l\'agence ; sinon les fiches de la note et un contact rempli, jamais une devinette', () => {
  const agents = [
    { id: 'manon', nom: 'Manon Dupuis', agence: 'Primo Immobilier', ville: 'Lyon', telephones: ['06 12 34 56 78'] },
    { id: 'manon2', nom: 'Manon Leroy', agence: 'Azur Immo', ville: 'Nice' },
    { id: 'paul', nom: 'Paul Martin', agence: 'Primo Immobilier', ville: 'Lyon' },
  ];
  const agences = [{ id: 'g-primo', nom: 'Primo Immobilier', ville: 'Lyon' }, { id: 'g-neuf', nom: 'Cabinet Rhône', ville: 'Lyon' }];
  // Le prénom et l'agence suffisent quand ils désignent une seule fiche.
  assert.deepEqual(RP.trouverDepuisNote({ nom: 'Manon', agence: 'Primo' }, { agents, agences }).agent_id, 'manon');
  // Le numéro dit l'emporte.
  assert.equal(RP.trouverDepuisNote({ nom: 'Quelqu\'un', telephone: '0612345678' }, { agents, agences }).agent_id, 'manon');
  // « Manon » sans agence : deux fiches, on demande, on ne choisit pas.
  const deux = RP.trouverDepuisNote({ nom: 'Manon' }, { agents, agences });
  assert.equal(deux.agent_id, undefined);
  assert.deepEqual(deux.candidats.map((c) => c.agent_id).sort(), ['manon', 'manon2']);
  // Une personne inconnue d'une agence connue : un nouveau contact rattaché à l'agence, rempli avec la note.
  const nouvelle = RP.trouverDepuisNote({ nom: 'Julie Bernard', agence: 'Cabinet Rhône', ville: 'Lyon', email: 'julie@rhone.fr' }, { agents, agences });
  assert.equal(nouvelle.agent_id, undefined);
  assert.equal(nouvelle.nouveau.agence_id, 'g-neuf');
  assert.equal(nouvelle.nouveau.email, 'julie@rhone.fr');
  assert.equal(nouvelle.nouveau.nom, 'Julie Bernard');
});

test('finir avec une note vocale : la note en tête des notes, et l\'appel identifié d\'après elle', async () => {
  const fiche = Records.create('AgentImmo', { nom: 'Sandrine Note', agence: 'Agence Témoin', ville: 'Annecy', telephones: ['06 98 76 54 32'] });
  const { rappel } = RP.ouvrir(NORA);
  const r = await RP.finir(rappel.id, { morceaux: ['Bonjour, oui, je vous rappelle pour le local.'], audios: [], notes: '', duree_s: 40, note_vocale: "C'était Sandrine, de l'agence Témoin, au 06 98 76 54 32, elle veut le dossier par mail." }, NORA);
  assert.equal(r.ok, true, r.error);
  assert.equal(r.rappel.etat, 'identifie');
  assert.equal(r.rappel.agent.id, fiche.id);
  assert.match(r.rappel.notes, /^C'était Sandrine/);
  assert.ok(r.rappel.note_vocale);
});

// « Il est dans Monday, je ne vais pas créer un contact » (21 oct. 2026, Jules) : le tableau Agent immobilier est lu.
test('trouverDansMonday : le nom dicté retrouve la ligne, trait d\'union compris ; plusieurs lignes : on demande', () => {
  const lignes = [
    { id: '11', nom: 'Louis de la Roche-Baron', prenom: '', entreprise: 'Barnes Côte Basque', ville: 'Biarritz', telephone: '06 11 22 33 44', emails: [] },
    { id: '12', nom: 'Martin', prenom: 'Sophie', entreprise: 'Riviera Commerce', ville: 'Nice', telephone: '', emails: ['sophie@riviera.fr'] },
    { id: '13', nom: 'Martin', prenom: 'Paul', entreprise: 'Azur Immo', ville: 'Cannes', telephone: '', emails: [] },
  ];
  assert.equal(RP.trouverDansMonday({ nom: 'Louis de la Roche Baron' }, lignes).ligne.id, '11');
  // Comme dans le vrai Monday : « Louis de LARROCHE BARON », dicté « Louis de la Roche-Baron », ou le nom seul.
  const vrai = [{ id: '29', nom: 'Louis de LARROCHE BARON', prenom: 'Louis', entreprise: '', ville: 'Bordeaux', telephone: '', emails: [] }, ...lignes.slice(1)];
  assert.equal(RP.trouverDansMonday({ nom: 'Louis de la Roche-Baron' }, vrai).ligne.id, '29');
  assert.equal(RP.trouverDansMonday({ nom: 'de la Roche Baron' }, vrai).ligne.id, '29');
  assert.equal(RP.trouverDansMonday({ nom: 'Roche Baron' }, vrai).ligne.id, '29');
  // Une ressemblance lointaine ne suffit pas.
  assert.equal(RP.trouverDansMonday({ nom: 'Louis Rocher' }, vrai).ligne, undefined);
  assert.equal(RP.trouverDansMonday({ nom: 'Sophie Martin', agence: 'Riviera' }, lignes).ligne.id, '12');
  assert.equal(RP.trouverDansMonday({ nom: 'X', email: 'sophie@riviera.fr' }, lignes).ligne.id, '12');
  assert.deepEqual(RP.trouverDansMonday({ nom: 'Martin' }, lignes).lignes.map((l) => l.id), ['12', '13']);
  assert.equal(RP.nomMonday(lignes[1]), 'Sophie Martin');
  assert.equal(RP.nomMonday(lignes[0]), 'Louis de la Roche-Baron');
  // Au carnet local aussi, le trait d'union ne sépare plus.
  assert.equal(RP.trouverDepuisNote({ nom: 'Louis de la Roche Baron' }, { agents: [{ id: 'l', nom: 'Louis DE LA ROCHE-BARON', agence: 'Barnes' }], agences: [] }).agent_id, 'l');
});

// Les essais de Jules (21 oct. 2026) : en mode Essai, la note retrouve le vrai contact, et c'est une copie d'essai
// qui est identifiée ; le vrai carnet n'est pas touché.
test('en essai, la note retrouve le vrai carnet et identifie une copie d\'essai, jamais « Créer le contact »', async () => {
  const vrai = Records.create('AgentImmo', { nom: 'Louis de LARROCHE BARON', agence: 'Barnes Bordeaux', ville: 'Bordeaux', telephones: ['06 55 44 33 22'] });
  const avant = Records.list('AgentImmo').filter((a) => !a.essai).length;
  const o = await RP.ouvrirEssaiRappel(NORA, { sens: 'entrant' });
  assert.equal(o.ok, true, o.error);
  const r = await RP.finir(o.rappel.id, { morceaux: [], audios: [], notes: '', duree_s: 20, note_vocale: "C'était Louis de la Roche-Baron, il rappelle pour le local." }, NORA);
  assert.equal(r.ok, true, r.error);
  assert.equal(r.rappel.etat, 'identifie');
  assert.notEqual(r.rappel.agent.id, vrai.id, 'une copie, pas la vraie fiche');
  assert.match(r.rappel.agent.nom, /LARROCHE BARON/);
  assert.equal(Records.get('AgentImmo', r.rappel.agent.id).essai, true);
  assert.equal(Records.list('AgentImmo').filter((a) => !a.essai).length, avant, 'le vrai carnet n\'a rien gagné');
});

test("essai : l'agence fictive qui se présente sort en candidate (la « ville » Essai n'efface plus son nom, 21 oct. 2026)", async () => {
  const JULES = { email: 'jules.b@klocka.immo', role: 'admin' };
  const e = await RP.ouvrirEssaiRappel(JULES, { sens: 'entrant' });
  const r = await RP.finir(e.rappel.id, { morceaux: ["Allô, bonjour, Sophie Essai de l'Agence Essai Commerces, vous m'avez appelée hier ?"], notes: '' }, JULES);
  assert.ok((r.rappel.candidats || []).some((c) => c.agence === 'Agence Essai Commerces'), JSON.stringify(r.rappel.candidats));
  RP.abandonner(e.rappel.id, JULES);
});
