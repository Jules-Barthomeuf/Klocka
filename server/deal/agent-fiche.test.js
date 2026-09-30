import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

// Base jetable, et Monday coupé : aucun test n'écrit dans le vrai CRM.
process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-agent-'));
process.env.MONDAY_TOKEN = '';
const { Records } = await import('../db.js');
const { agentDuDossier, phraseAgent, rattacherAgent } = await import('./agent-fiche.js');
const { verifierAgent } = await import('./extract.js');
const { ceQuiAttend, agirSurLigne } = await import('../attend.js');

const interne = (e) => e.endsWith('@klocka.immo');

test("une fiche transférée par l'équipe prend l'agent écrit dans la fiche", () => {
  const a = agentDuDossier({
    contact: 'jules.b@klocka.immo',
    extrait: { nom: 'Jérôme Leviathan', email: 'j.leviathan@agence-azur.fr', telephone: '06 12 34 56 78', agence: 'Agence Azur' },
  }, interne);
  assert.deepEqual(a, { email: 'j.leviathan@agence-azur.fr', nom: 'Jérôme Leviathan', telephone: '06 12 34 56 78', agence: 'Agence Azur' });
});

test("l'expéditeur externe reste l'agent ; la fiche complète s'il s'agit du même", () => {
  const meme = agentDuDossier({ contact: 'J.Leviathan@agence-azur.fr', extrait: { nom: 'Jérôme Leviathan', email: 'j.leviathan@agence-azur.fr', telephone: '0612345678' } }, interne);
  assert.equal(meme.email, 'j.leviathan@agence-azur.fr');
  assert.equal(meme.telephone, '0612345678');
  // Une autre personne dans la fiche (un collègue) ne prête pas son numéro.
  const autre = agentDuDossier({ contact: 'marc@agence.fr', extrait: { nom: 'Paul', email: 'paul@autre.fr', telephone: '0600000000' } }, interne);
  assert.deepEqual(autre, { email: 'marc@agence.fr', nom: null, telephone: null, agence: null });
});

test("sans adresse dans la fiche, l'en-tête du transfert la donne", () => {
  const a = agentDuDossier({ contact: null, extrait: null, origine: { email: 'laurent@cabinet.fr', nom: 'Laurent Sebban' } }, interne);
  assert.equal(a.email, 'laurent@cabinet.fr');
  assert.equal(a.nom, 'Laurent Sebban');
  assert.equal(agentDuDossier({ contact: 'jules.b@klocka.immo' }, interne), null, "personne de l'équipe, jamais");
});

test('une coordonnée absente du document est écartée', () => {
  const texte = 'Votre contact : Jérôme Leviathan - Agence Azur\nTél. +33 6 12 34 56 78\nj.leviathan@agence-azur.fr';
  assert.deepEqual(
    verifierAgent({ nom: 'Jérôme Leviathan', email: 'J.Leviathan@agence-azur.fr', telephone: '06.12.34.56.78', agence: 'Agence Azur' }, texte),
    { nom: 'Jérôme Leviathan', email: 'j.leviathan@agence-azur.fr', telephone: '06.12.34.56.78', agence: 'Agence Azur' }
  );
  const invente = verifierAgent({ nom: 'Jérôme Leviathan', email: 'contact@inventee.fr', telephone: '0699999999', agence: 'Century 21' }, texte);
  assert.deepEqual(invente, { nom: 'Jérôme Leviathan', email: null, telephone: null, agence: null });
  assert.equal(verifierAgent({ email: 'jules.b@klocka.immo' }, 'jules.b@klocka.immo'), null);
  assert.equal(verifierAgent(null, texte), null);
});

test('la phrase dit ce qui a été fait, ou ce qui manque', () => {
  const agent = { nom: 'Jérôme Leviathan', email: 'j@azur.fr', telephone: null, agence: 'Agence Azur' };
  assert.match(phraseAgent(agent, { etat: 'cree' }), /ajouté dans Monday/);
  assert.match(phraseAgent(agent, { etat: 'existant' }), /déjà dans Monday/);
  assert.match(phraseAgent(agent, { etat: 'erreur', raison: 'fetch failed' }), /n'a pas répondu/);
  assert.match(phraseAgent({ ...agent, email: null }, null), /sans adresse mail/);
  assert.match(phraseAgent(null, null), /Aucun agent/);
});

test("le dossier garde l'agent, et le tableau de bord réclame l'adresse qui manque", async () => {
  Records.create('Deal', { deal_id: 'd-agent', nom: 'Tabac - Nice', statut: 'analyse', suivi: [] });
  const r = await rattacherAgent('d-agent', { extrait: { nom: 'Jérôme Leviathan', email: 'j@azur.fr', telephone: '0612345678', agence: 'Agence Azur' } });
  const d = Records.findBy('Deal', 'deal_id', 'd-agent');
  assert.equal(d.contact_agent_email, 'j@azur.fr');
  assert.equal(d.apercu.agent_nom, 'Jérôme Leviathan');
  assert.equal(d.agent_rattache.etat, 'rattache', 'sans Monday configuré, rien à annoncer');
  assert.equal(d.suivi.at(-1).type, 'agent');
  assert.match(r.phrase, /rattaché au dossier/);

  Records.create('Deal', { deal_id: 'd-sans', nom: 'Boulangerie - Lyon', statut: 'analyse', suivi: [] });
  await rattacherAgent('d-sans', { extrait: { nom: 'Paul Martin' } });
  const ligne = ceQuiAttend({ email: 'x@klocka.immo' }).lignes.find((l) => l.source === 'agent');
  assert.equal(ligne.deal_id, 'd-sans');
  assert.match(ligne.titre, /Paul Martin : son adresse mail manque/);
  assert.equal(ligne.nouveau, true);

  // L'adresse ajoutée à la main : la ligne s'en va.
  Records.update('Deal', Records.findBy('Deal', 'deal_id', 'd-sans').id, { contact_agent_email: 'paul@martin.fr' });
  assert.equal(ceQuiAttend({ email: 'x@klocka.immo' }).lignes.some((l) => l.source === 'agent'), false);
});

test('chaque ligne de « Ce qui vous attend » se fait ou se supprime, même en retard', async () => {
  const hier = new Date(Date.now() - 86400000).toISOString();
  const user = { email: 'jules.b@klocka.immo', role: 'admin' };
  Records.create('Deal', { deal_id: 'd-relance', nom: 'Pharmacie - Tours', statut: 'documents_demandes', relance_prevue_le: hier, suivi: [] });
  const promesse = Records.create('Engagement', { deal_id: 'd-relance', quoi: 'Envoie le bail', echeance: hier, statut: 'ouvert' });
  const lignes = () => ceQuiAttend(user).lignes;
  assert.ok(lignes().filter((l) => l.dans < 0).every((l) => l.cloturable), 'une ligne en retard a ses boutons');

  assert.equal((await agirSurLigne('dossier', 'd-relance', 'fait', user)).ok, true);
  const relance = lignes().find((l) => l.source === 'dossier' && l.id === 'd-relance');
  assert.ok(relance.dans > 0, 'relance faite : la suivante est replanifiée');
  await agirSurLigne('dossier', 'd-relance', 'supprimer', user);
  assert.equal(lignes().some((l) => l.source === 'dossier' && l.id === 'd-relance'), false);

  await agirSurLigne('promesse', promesse.id, 'supprimer', user);
  assert.equal(Records.get('Engagement', promesse.id), null);

  Records.create('Deal', { deal_id: 'd-vu', nom: 'Fleuriste - Pau', statut: 'analyse', agent_rattache: { le: new Date().toISOString(), etat: 'cree', nom: 'Anne' }, suivi: [] });
  assert.ok(lignes().some((l) => l.source === 'agent' && l.id === 'd-vu'));
  await agirSurLigne('agent', 'd-vu', 'supprimer', user);
  assert.equal(lignes().some((l) => l.source === 'agent' && l.id === 'd-vu'), false);
  assert.equal((await agirSurLigne('inconnue', 'x', 'fait', user)).ok, false);
});

test('les relances ne se montrent qu\'à qui les mène', async () => {
  const hier = new Date(Date.now() - 86400000).toISOString();
  Records.create('Deal', { deal_id: 'd-perso', nom: 'Caviste - Nantes', statut: 'documents_demandes', relance_prevue_le: hier, suivi: [] });
  const relances = (email) => ceQuiAttend({ email }).lignes.filter((l) => l.source === 'dossier' && l.id === 'd-perso');
  assert.equal(relances('jules.b@klocka.immo').length, 1);
  assert.equal(relances('nora.l@klocka.immo').length, 0);
  assert.equal((await agirSurLigne('dossier', 'd-perso', 'supprimer', { email: 'nora.l@klocka.immo' })).ok, false);
});
