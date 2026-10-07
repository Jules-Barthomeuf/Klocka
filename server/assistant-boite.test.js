import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classerParRegles, consigneEnTete } from './assistant-boite.js';

const MAIL_AGENT = `Bonjour Jules,

Je reviens vers vous avec plusieurs nouveaux actifs en vente, ainsi que des baisses de prix.

Levallois-Perret (92) – 95 rue Jean Jaurès – Réf. MG1-947
Deux boutiques occupées (65 m² et 35 m²). Bail commercial 3/6/9.
Loyer : 70 620 € HT/an.
Nouveau prix : 1 100 000 € FAI (1 050 000 € hors honoraires), soit un rendement brut d'environ 6,4 %.

Paris 19e – 140 avenue Jean Jaurès – Réf. MG1-1009 – Exclusivité
Deux murs commerciaux vendus occupés, 85 m² au total. Loyer : 66 000 € HT/an. Prix : 901 000 € FAI.

Paris 15e – Charles Michels – Réf. MG1-1019
Immeuble de rapport, 320 m² sur 3 niveaux. Prix : 2 548 000 € FAI (2 450 000 € hors honoraires).

Bien cordialement.
Axel`;

test('07/10 · une consigne posée avant un mail d\'agent collé va au chat, pas en fiche', () => {
  const r = classerParRegles(`Fais-lui un email de retour pour lui dire que y'a rien d'intéressant : ${MAIL_AGENT}`);
  assert.equal(r.type, 'assistant');
  assert.equal(r.sur, true);
  for (const debut of ['Réponds-lui que ça ne nous intéresse pas :', 'Rédige une réponse polie\n', 'Peux-tu résumer ce mail ?\n', 'Résume :']) {
    assert.equal(classerParRegles(`${debut} ${MAIL_AGENT}`).type, 'assistant', debut);
  }
});

test('07/10 · le mail d\'un agent collé seul reste une fiche', () => {
  const r = classerParRegles(MAIL_AGENT);
  assert.equal(r.type, 'fiche');
  assert.equal(consigneEnTete(MAIL_AGENT), false);
});

test('07/10 · une note d\'appel reste une note', () => {
  assert.equal(consigneEnTete("J'ai eu Marc de l'agence Foncia, il me rappelle jeudi pour le local de Lyon"), false);
});
