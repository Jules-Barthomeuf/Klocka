// Les listes tirées de Monday (9 oct. 2026) : lecture seule, contacts sans
// doublon, listes recalculées à chaque lecture, une liste supprimée ne revient pas.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-listes-monday-'));
const L = await import('./listes-monday.js');
const { Records } = await import('../db.js');
const { E } = await import('./schema.js');

const col = (...titres) => titres.map((title, i) => ({ id: `c${i}`, title }));
const ligne = (id, nom, valeurs) => ({ id, nom, colonnes: Object.fromEntries(valeurs.map((v, i) => [`c${i}`, v])) });
const AGENTS = col('Prénom', 'E-mail', 'Date', 'Dernier contact', 'Statut', 'Priorité', 'Liste de diffusion', 'Propriétés', 'Ville', 'Entreprise');
const CLIENTS = col('E-mail', 'Statut Client');
const PROSPECTS = col('Texte', 'Email', 'Statut');

const monday = (agents) => async (_id, k) => ({
  agents: { colonnes: AGENTS, lignes: agents },
  clients: { colonnes: CLIENTS, lignes: [ligne('c1', 'Pierre YOKEL', ['p.yokel@gmail.com', 'Recherche']), ligne('c2', 'Louis VIDAL', ['louis@x.fr', 'Projet Signé']), ligne('c3', 'Ana B', ['ana@x.fr', 'Stand-by'])] },
  prospects: { colonnes: PROSPECTS, lignes: [ligne('p1', 'Charles DESLIS', ['Charles', 'charl@x.fr', 'No show']), ligne('p2', 'Out Man', ['', 'out@x.fr', 'Out']), ligne('p3', 'Double', ['', 'p.yokel@gmail.com', 'R1 Visio'])] },
}[k]);
const AUJ = new Date('2026-10-09T10:00:00Z');
const agentsV1 = [
  ligne('a1', 'Laurent JOUANIN', ['Laurent', 'laurent@lifehomme.fr - laurent.j@x.fr', '', '', '', 'No rep', '', '', 'Lille', '']),
  ligne('a2', 'Victor SPINNEWYN', ['Victor', 'victor@ab-lille.fr', '2026-10-01', '', '', 'Moyenne', '', 'Local rue X', 'Lille', 'AB Lille']),
  ligne('a3', 'Mort Agent', ['', 'mort@x.fr', '', '', '', 'MORT', '', '', '', '']),
  ligne('a4', 'Sans Diffusion', ['', 'non@x.fr', '', '', '', '', 'Non', '', '', '']),
  ligne('a5', 'Vieux Contact', ['', 'vieux@x.fr', '2026-07-02', '', '', '', '', '', '', '']),
  ligne('a6', 'Sans Mail', ['', '', '', '', '', '', '', '', '', '']),
];
const dans = (cle, email) => {
  const id = L.etat().ids[cle];
  return (Records.list(E.CONTACT).find((c) => c.email === email)?.listes || []).includes(id);
};

test('jourDe et nomEtPrenom', () => {
  assert.equal(L.jourDe('08/10/2026 · Jules'), '2026-10-08');
  assert.equal(L.jourDe('2025-11-25 08:59'), '2025-11-25');
  assert.equal(L.jourDe(''), null);
  assert.deepEqual(L.nomEtPrenom('Laurent JOUANIN', 'Laurent'), { prenom: 'Laurent', nom: 'JOUANIN' });
  assert.deepEqual(L.nomEtPrenom('Pierre YOKEL'), { prenom: 'Pierre', nom: 'YOKEL' });
});

test('la première lecture crée les listes et les contacts, sans doublon ni ligne sans adresse', async () => {
  Records.create('AgentImmo', { nom: 'Laurent', emails: ['laurent@lifehomme.fr'], dernier_contact_le: '2026-09-30T09:00:00Z', statut: 'envoie_des_fiches' });
  const r = await L.synchroniser({ lire: monday(agentsV1), quand: AUJ });
  assert.equal(r.ok, true);
  assert.equal(Records.list(E.CONTACT).length, 9, '5 agents (sans « Non » ni sans mail), 3 clients, 2 prospects dont un déjà client');
  assert.equal(Records.list(E.LISTE).filter((l) => l.monday).length, L.LISTES.length);
  const laurent = Records.list(E.CONTACT).find((c) => c.email === 'laurent@lifehomme.fr');
  assert.equal(laurent.prenom, 'Laurent');
  assert.equal(laurent.type, 'mandataire');
  assert.equal(laurent.champs.dernier_contact, '2026-09-30', 'le carnet de la plateforme compte');
  assert.equal(dans('agents_sans_nouvelles', 'laurent@lifehomme.fr'), false, 'appelé il y a 9 jours');
  assert.equal(dans('agents_sans_nouvelles', 'vieux@x.fr'), true, 'plus de 60 jours');
  assert.equal(dans('agents_sans_nouvelles', 'mort@x.fr'), false, 'MORT écarté de la relance');
  assert.equal(dans('agents', 'mort@x.fr'), true);
  assert.equal(dans('agents_biens', 'victor@ab-lille.fr'), true);
  assert.equal(dans('agents_biens', 'laurent@lifehomme.fr'), true, 'd\'après le carnet');
  assert.equal(Records.list(E.CONTACT).some((c) => c.email === 'non@x.fr'), false, 'liste de diffusion « Non »');
  assert.equal(dans('clients_recherche', 'p.yokel@gmail.com'), true);
  assert.equal(dans('clients_signes', 'louis@x.fr'), true);
  assert.equal(dans('clients_pause', 'ana@x.fr'), true);
  assert.equal(dans('prospects_relancer', 'charl@x.fr'), true);
  assert.equal(dans('prospects', 'out@x.fr'), false);
});

test('une relecture recalcule les listes, garde le statut et les listes à la main ; une liste supprimée ne revient pas', async () => {
  const vieux = Records.list(E.CONTACT).find((c) => c.email === 'vieux@x.fr');
  const main = Records.create(E.LISTE, { nom: 'Webinaire 12 oct.' });
  Records.update(E.CONTACT, vieux.id, { statut: 'desinscrit', listes: [...vieux.listes, main.id] });
  Records.delete(E.LISTE, L.etat().ids.clients_pause);
  const v2 = agentsV1.map((l) => (l.id === 'a5' ? ligne('a5', 'Vieux Contact', ['', 'vieux@x.fr', '2026-10-08', '', '', '', '', '', '', '']) : l)).filter((l) => l.id !== 'a2');
  await L.synchroniser({ lire: monday(v2), quand: AUJ });
  const v = Records.get(E.CONTACT, vieux.id);
  assert.equal(v.statut, 'desinscrit');
  assert.ok(v.listes.includes(main.id), 'la liste faite à la main reste');
  assert.equal(dans('agents_sans_nouvelles', 'vieux@x.fr'), false, 'rappelé hier');
  assert.equal(dans('agents', 'victor@ab-lille.fr'), false, 'sorti de Twenty CRM, sorti des listes Twenty CRM');
  assert.ok(Records.list(E.CONTACT).some((c) => c.email === 'victor@ab-lille.fr'), 'mais reste contact');
  assert.equal(Records.list(E.LISTE).filter((l) => l.monday === 'clients_pause').length, 0, 'supprimée, elle ne revient pas');
  assert.equal(Records.list(E.CONTACT).filter((c) => c.email === 'laurent@lifehomme.fr').length, 1);
});

test('le tour du jour ne relit pas Twenty CRM deux fois dans la journée', async () => {
  assert.equal(await L.tourMonday({ quand: new Date(Date.parse(L.etat().le) + 3600000) }), null);
});
