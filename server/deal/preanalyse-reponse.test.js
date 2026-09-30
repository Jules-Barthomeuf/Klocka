// La garde de preanalyserMail : une réponse dans la conversation d'un
// dossier, ou une fiche déjà traitée, rattache le mail au lieu de recréer
// un dossier — c'est le bug de l'agente qui répondait dans son fil et dont
// la fiche repartait en double dans la plateforme.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-reponse-'));
const { Records } = await import('../db.js');
const { preanalyserMail } = await import('./preanalyser-mail.js');
const { dossierDeLaConversation } = await import('./fiches-auto.js');
const { fichesAProposer } = await import('../ak/fiches.js');

const deal = Records.create('Deal', {
  deal_id: 'd-macon', nom: 'Parashop - Mâcon', contact_agent_email: 'theo@quorner.com',
  source_mail: { mail_recu_id: 'x', de: 'Théo Dupré <theo@quorner.com>', objet: 'Fiches murs commerciaux' },
  lots: [{ synthese: { titre: 'Parashop - Mâcon' } }],
});
const origine = Records.create('MailRecu', {
  compte: 'sourcing@klocka.immo', thread_id: 't-1', deal_id: 'd-macon', objet: 'Fiches murs commerciaux',
  de_email: 'theo@quorner.com', date: new Date().toISOString(),
  pieces_jointes: [{ nom: 'M_MACON_FD_2026.pdf', piece_id: 'p1' }],
});
Records.update('Deal', deal.id, { source_mail: { ...deal.source_mail, mail_recu_id: origine.id } });

test('une réponse dans le même fil est rattachée, pas recréée', async () => {
  const reponse = Records.create('MailRecu', {
    compte: 'sourcing@klocka.immo', thread_id: 't-1', objet: 'Re: Fiches murs commerciaux',
    de_email: 'theo@quorner.com', date: new Date().toISOString(), pieces_jointes: [],
  });
  const d = await preanalyserMail(reponse, { user: null });
  assert.equal(d.repris_conversation, true);
  assert.equal(d.deal_id, 'd-macon');
  assert.equal(Records.get('MailRecu', reponse.id).deal_id, 'd-macon');
  assert.match(Records.findBy('Deal', 'deal_id', 'd-macon').suivi.at(-1).detail, /répond à la conversation/);
});

test('une réponse arrivée dans une AUTRE boîte est retrouvée par le sujet et l\'agent', () => {
  const autre = { id: 'b2', compte: 'jules.b@klocka.immo', thread_id: 't-99', objet: 'RE: Fiches murs commerciaux', de_email: 'theo@quorner.com' };
  const ctx = { mails: Records.list('MailRecu'), envois: [], deals: Records.list('Deal') };
  assert.equal(dossierDeLaConversation(autre, ctx), 'd-macon');
});

test('la même fiche renvoyée hors fil est un doublon, rattachée elle aussi', async () => {
  const renvoi = Records.create('MailRecu', {
    compte: 'sourcing@klocka.immo', thread_id: 't-2', objet: 'Voici les biens',
    de_email: 'autre@agence.fr', date: new Date().toISOString(),
    pieces_jointes: [{ nom: 'm_macon_fd_2026.PDF', piece_id: 'p9' }],
  });
  const d = await preanalyserMail(renvoi, { user: null });
  assert.equal(d.doublon, true);
  assert.equal(d.deal_id, 'd-macon');
});

test('AK ne propose ni la réponse ni le doublon comme nouvelles fiches', () => {
  const reponse = { id: 'r1', thread_id: 't-1', objet: 'Re: Fiches murs commerciaux', de_email: 'theo@quorner.com', date: new Date().toISOString(), texte: 'x'.repeat(500) };
  const ctx = { mails: [...Records.list('MailRecu'), reponse], envois: [], deals: Records.list('Deal') };
  const liste = fichesAProposer({ mails: ctx.mails.filter((m) => !m.deal_id), questions: [], pour: 'jules.b@klocka.immo', depuis: '2020-01-01', contexte: ctx });
  assert.ok(!liste.some((m) => m.id === 'r1'));
});
