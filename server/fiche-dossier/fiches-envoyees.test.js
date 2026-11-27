import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-fiches-envoyees-'));
process.env.NODE_TEST_CONTEXT = '1';
const { Records } = await import('../db.js');
const E = await import('./fiches-envoyees.js');
const M = await import('./modele.js');

const bien = (x) => ({ origine: 'transfert', par: 'maxime@klocka.immo', recu_le: '2026-11-18T09:00:00Z', ...x });

test('un agent se reconnaît à son adresse, son téléphone, ou son nom quand l’agence ne le contredit pas', () => {
  const id = E.identiteAgent({ nom: 'Laurent Sebban', emails: ['Laurent.Sebban@pointdevente.fr'], telephones: ['06 20 41 12 06'], agence: 'Groupe Point de Vente' });
  assert.equal(E.venuDe({ agent_email: 'laurent.sebban@pointdevente.fr' }, id), 'adresse');
  assert.equal(E.venuDe({ agent: { telephone: '+33 6 20 41 12 06' } }, id), 'telephone');
  assert.equal(E.venuDe({ agent: { nom: 'SEBBAN Laurent', agence: 'Point de Vente Commerces' } }, id), 'nom');
  assert.equal(E.venuDe({ agent: { nom: 'Laurent Sebban', agence: 'Century 21 Lafage' } }, id), null, 'même nom, autre agence');
  assert.equal(E.venuDe({ agent: { nom: 'Laurent' } }, E.identiteAgent({ nom: 'Laurent' })), null, 'un prénom seul ne suffit pas');
  assert.equal(E.identiteAgent({ emails: ['maxime@klocka.immo'] }).emails.size, 0, 'jamais une adresse de l’équipe');
});

test('ses fiches : la plus récente d’abord, le même bien renvoyé compté une fois, la phrase de résumé', () => {
  const id = E.identiteAgent({ nom: 'Laurent Sebban', emails: ['laurent.sebban@pointdevente.fr'] });
  const biens = [
    bien({ id: 'a', agent_email: 'laurent.sebban@pointdevente.fr', ville: 'Nice', prix: 520000, type_actif: 'murs occupés', locataire_activite: 'glacier', mail_recu_id: 'm1', cle_adresse: 'x', agent: { telephone: '06 20 41 12 06', agence: 'Point de Vente' } }),
    bien({ id: 'b', agent_email: 'laurent.sebban@pointdevente.fr', ville: 'Nice', prix: 1300000, type_actif: 'murs occupés', recu_le: '2026-11-21T09:00:00Z', mail_recu_id: 'm2' }),
    bien({ id: 'c', agent_email: 'laurent.sebban@pointdevente.fr', ville: 'Nice', mail_recu_id: 'm3', cle_adresse: 'x', recu_le: '2026-11-19T09:00:00Z' }),
    bien({ id: 'd', agent_email: 'autre@agence.fr', ville: 'Cannes' }),
    bien({ id: 'e', agent_email: 'laurent.sebban@pointdevente.fr', ville: 'Antibes', supprime_le: '2026-11-22T09:00:00Z' }),
  ];
  const r = E.fichesDeLAgent(biens, id);
  assert.deepEqual(r.lignes.map((l) => l.id), ['b', 'a'], 'c est le même bien que a, e est supprimée, d est d’un autre');
  assert.equal(r.lignes[0].prix, '1,3 M€');
  assert.equal(r.lignes[1].titre, 'Glacier');
  assert.equal(r.contact.telephone, '06 20 41 12 06');
  assert.equal(E.resumeDesEnvois(r.lignes, { prenomDe: () => 'Maxime' }), '2 fiches envoyées : Nice (2) ; murs occupés ; la dernière le 21 nov., via Maxime.');
});

test('sur la fiche d’un agent de la Prospection, ses fiches arrivent seules, ses coordonnées comblent le vide', () => {
  const a = Records.create('AgentImmo', { nom: 'Claire Vasseur', emails: ['claire@vasseur-immo.fr'], telephones: [] });
  Records.create('BienMemoire', bien({ agent_email: 'claire@vasseur-immo.fr', ville: 'Grenoble', prix: 450000, agent: { telephone: '06 11 22 33 44', agence: 'Vasseur Immobilier' } }));
  const f = M.ficheVue(`agent:${a.id}`);
  assert.equal(f.envois.total, 1);
  assert.match(f.envois.resume, /^1 fiche envoyée : Grenoble/);
  assert.equal(f.envois.contact.telephone, '06 11 22 33 44');
  assert.deepEqual(f.envois.contact.lues_sur_fiches, ['telephone', 'agence']);
  const vide = Records.create('AgentImmo', { nom: 'Bruno Rey', emails: ['bruno@rey.fr'] });
  assert.equal(M.ficheVue(`agent:${vide.id}`).envois, null, 'aucune fiche : rien à montrer');
});

// 27 nov. 2026, Jules : « dès qu'il nous envoie des fiches, dans l'historique ça rajoute un échange de mail ».
test("l'historique : une ligne par mail reçu, datée de sa réception, écrite une fois, rien d'autre touché", () => {
  const lignes = E.lignesDesEnvois([
    { envoi: 'm2', jour: '2026-11-16', recu_le: '2026-11-16T15:10:00Z', origine: 'transfert', qui: 'maxime.p@klocka.immo', titre: 'Local commercial', ou: 'LE CRES', prix: '178 k€', loyer: '10 k€ de loyer' },
    { envoi: 'm2', jour: '2026-11-16', recu_le: '2026-11-16T15:10:00Z', origine: 'transfert', qui: 'maxime.p@klocka.immo', titre: 'Local commercial', ou: null, prix: '225 k€', loyer: null },
    { envoi: 'm1', jour: '2026-11-02', recu_le: '2026-11-02T09:00:00Z', origine: 'whatsapp', qui: 'personne', titre: 'Boulangerie', ou: 'Nîmes', prix: null, loyer: null },
  ]);
  assert.equal(lignes.length, 2);
  assert.equal(lignes[0].texte, 'Message WhatsApp reçu : une fiche, Boulangerie à Nîmes');
  assert.equal(lignes[1].texte, 'Mail reçu par maxime.p@klocka.immo : 2 fiches, Local commercial à LE CRES (178 k€, 10 k€ de loyer) ; Local commercial (225 k€)');
  assert.equal(lignes[1].le, '2026-11-16T15:10:00Z');

  const agent = Records.create('AgentImmo', { nom: 'Laurent Aliaga', emails: ['aliaga.laurent@orange.fr'] });
  const cle = `agent:${agent.id}`;
  M.fiche(cle, { genre: 'agent', nom: 'Laurent Aliaga' });
  const mienne = Records.create('EntreeDossier', { fiche_cle: cle, genre: 'ressenti', texte: 'Fiable, répond vite.', le: '2026-11-20T10:00:00Z' });
  Records.create('BienMemoire', bien({ id: undefined, agent_email: 'aliaga.laurent@orange.fr', par: 'maxime.p@klocka.immo', ville: 'LE CRES', prix: 178000, loyer_annuel: 10000, type_actif: 'local commercial', mail_recu_id: 'mail-1', recu_le: '2026-11-16T15:10:00Z' }));
  assert.equal(E.historiqueDesEnvois(cle), 1);
  assert.equal(E.historiqueDesEnvois(cle), 0, 'relire la fiche ne double rien');
  const entrees = Records.filter('EntreeDossier', { fiche_cle: cle });
  assert.equal(entrees.length, 2);
  assert.match(entrees.find((x) => x.envoi_cle).texte, /^Mail reçu par Maxime : une fiche, Local commercial à LE CRES \(178 k€, 10 k€ de loyer\)$/);
  assert.equal(Records.get('EntreeDossier', mienne.id).texte, 'Fiable, répond vite.');
});
