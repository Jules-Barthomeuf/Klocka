// L'agent MyNotary : le gardien (liste blanche), les champs, le plafond, les
// verrous. Tout sans réseau — le parcours d'écran se vérifie à l'éclairage.
// Les cas viennent de la revue adverse du 1er octobre 2026 : chaque trou
// confirmé par le panel a son test ici.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-mynotary-'));
const { requeteAutorisee, releverIdCree, decoderAFond, ressembleAUnId, champsDepuisMandat, plafondAtteint, agentMyNotaryActif, PARCOURS_CABLE } = await import('./mynotary-agent.js');

const etatVide = () => ({ ids: new Set() });
const mien = () => ({ ids: new Set(['abc123xyz9']) });

test('le gardien : liste blanche — tout chemin inconnu de mynotary.fr est refusé', () => {
  assert.equal(requeteAutorisee({ url: 'https://app.mynotary.fr/dossiers/abc123xyz9/contrats/nouveau' }, mien()).ok, true, 'son dossier, oui');
  assert.equal(requeteAutorisee({ url: 'https://app.mynotary.fr/dossiers/nouveau' }, etatVide()).ok, true, 'l’écran de création, oui');
  assert.equal(requeteAutorisee({ url: 'https://app.mynotary.fr/connexion' }, etatVide()).ok, true, 'la connexion, oui');
  assert.equal(requeteAutorisee({ url: 'https://app.mynotary.fr/runtime.a71218.js' }, etatVide()).ok, true, 'un fichier statique, oui');
  assert.equal(requeteAutorisee({ url: 'https://fonts.googleapis.com/css' }, etatVide()).ok, true, 'hors MyNotary : les ressources de page passent');
  // Et tout le reste se ferme, y compris ce que personne n'a prévu.
  assert.equal(requeteAutorisee({ url: 'https://app.mynotary.fr/dossiers/AUTRE999x' }, mien()).ok, false, 'un autre dossier, jamais');
  assert.equal(requeteAutorisee({ url: 'https://app.mynotary.fr/annexes/AUTRE999x' }, mien()).ok, false, 'une ressource inconnue, jamais');
  assert.equal(requeteAutorisee({ url: 'https://app.mynotary.fr/dossiers/123' }, mien()).ok, false, 'un id court reste un segment inconnu');
});

test('le gardien : l’encodage ne déguise rien (pour-cent, double encodage, hôte à point)', () => {
  assert.equal(requeteAutorisee({ url: 'https://app.mynotary.fr/dossiers/%41UTRE999x' }, mien()).ok, false, '%41 = A');
  assert.equal(requeteAutorisee({ url: 'https://app.mynotary.fr/dossiers%2FAUTRE999x' }, mien()).ok, false, '%2F = /');
  assert.equal(requeteAutorisee({ url: 'https://app.mynotary.fr/dossiers/%2541UTRE999x' }, mien()).ok, false, 'double encodage');
  assert.equal(requeteAutorisee({ url: 'https://app.mynotary.fr./dossiers/AUTRE999x' }, mien()).ok, false, 'le point final DNS ne sort pas du périmètre');
  assert.equal(decoderAFond('%252F'), '/', 'décodage au point fixe');
});

test('le gardien : query, fragment et corps sont fouillés', () => {
  assert.equal(requeteAutorisee({ url: 'https://app.mynotary.fr/contrat?dossier=AUTRE999x' }, mien()).ok, false, 'id étranger en query');
  assert.equal(requeteAutorisee({ url: 'https://app.mynotary.fr/#/dossiers/AUTRE999x' }, mien()).ok, false, 'routage par fragment');
  assert.equal(requeteAutorisee({ url: 'https://app.mynotary.fr/app?onglet=dossiers' }, etatVide()).ok, true, 'une query de mots connus passe');
  const graphql = requeteAutorisee({ url: 'https://api.mynotary.fr/graphql', methode: 'POST', corps: '{"query":"{ dossier(id: \\"e3b0c44298fc1c14-9afb\\") { pdf } }"}' }, mien());
  assert.equal(graphql.ok, false, 'un id étranger dans le corps bloque');
  const sain = requeteAutorisee({ url: 'https://api.mynotary.fr/graphql', methode: 'POST', corps: '{"prix":450000,"adresse":"12 rue Carnot, 71000 Macon","bail":"3/6/9"}' }, mien());
  assert.equal(sain.ok, true, 'des champs libres (prix, adresse) ne sont pas des ids');
  assert.equal(requeteAutorisee({ url: 'https://api.mynotary.fr/graphql', methode: 'POST', corps: 'lie au dossier abc123xyz9' }, mien()).ok, true, 'son propre id dans le corps passe');
});

test('le gardien : méthodes en liste fermée, DELETE sous toutes ses graphies', () => {
  const e = mien();
  assert.match(requeteAutorisee({ url: 'https://app.mynotary.fr/dossiers/abc123xyz9', methode: 'DELETE' }, e).raison, /DELETE/);
  assert.equal(requeteAutorisee({ url: 'https://app.mynotary.fr/dossiers/abc123xyz9', methode: ' delete ' }, e).ok, false, 'les espaces ne déguisent rien');
  assert.equal(requeteAutorisee({ url: 'https://app.mynotary.fr/dossiers/abc123xyz9', methode: 'TRACE' }, e).ok, false, 'méthode hors liste');
  assert.equal(requeteAutorisee({ url: 'https://app.mynotary.fr/dossiers/abc123xyz9', methode: 'POST' }, e).ok, true);
});

test('releverIdCree : un seul id béni, les autres sont des anomalies', () => {
  const etat = etatVide();
  const r = releverIdCree('https://app.mynotary.fr/dossiers/NOUVEAU123x/records/MODELE_PARTAGE9', etat);
  assert.equal(r.id, 'NOUVEAU123x', 'l’id qui suit « dossiers » est relevé');
  assert.deepEqual(r.anomalies, ['MODELE_PARTAGE9'], 'le second id n’est PAS béni : anomalie');
  assert.equal(etat.ids.has('NOUVEAU123x'), true);
  assert.equal(etat.ids.has('MODELE_PARTAGE9'), false);
});

test('ressembleAUnId : uuid et mixtes oui, prix et mots non', () => {
  assert.equal(ressembleAUnId('e3b0c442-98fc-1c14-9afb-4c8996fb9242'), true);
  assert.equal(ressembleAUnId('abc123xyz9'), true);
  assert.equal(ressembleAUnId('450000'), false, 'un prix n’est pas un id');
  assert.equal(ressembleAUnId('boulangerie'), false);
  assert.equal(ressembleAUnId('2026-10-01'), false, 'une date n’est pas un id');
});

test('les champs du mandat passent au formulaire sans rien inventer', () => {
  const c = champsDepuisMandat({ vendeur: 'M. Martin', bien: 'Boulangerie Martin', prix: 450000, honoraires: 5, type: 'exclusif', duree_mois: 12, honoraires_charge: 'acquereur' }, { adresse: '12 rue Carnot', ville: 'Mâcon' });
  assert.equal(c.vendeur, 'M. Martin');
  assert.equal(c.adresse, '12 rue Carnot, Mâcon');
  assert.equal(c.honoraires_charge, 'acquereur');
  assert.equal(champsDepuisMandat(null), null);
  assert.equal(champsDepuisMandat({ bien: 'X' }).type, 'simple', 'simple par défaut');
});

test('le plafond du jour : « 20 » autorise vingt parcours, et l’interrupteur est éteint', () => {
  assert.equal(plafondAtteint(19, 20), false, 'le vingtième passe');
  assert.equal(plafondAtteint(20, 20), true, 'le vingt-et-unième non');
  assert.equal(plafondAtteint(0, 1), false, 'plafond 1 = un parcours, pas zéro');
  assert.equal(agentMyNotaryActif(), false, 'éteint par défaut : MYNOTARY_AGENT=1 est un choix explicite');
  assert.equal(PARCOURS_CABLE, false, 'le parcours attend l’éclairage : rien ne part tout seul');
});

test('une correction part à l’équipe — mais seulement sur SON mandat', async () => {
  const { Records } = await import('./db.js');
  const { corrigerAgentMandat } = await import('./mynotary-agent.js');
  const m = Records.create('MandatMandataire', { mandataire_email: 'm@kpartners.fr', vendeur: 'M. X', bien: 'Presse du Centre', statut: 'pret', historique: [], cree_le: new Date().toISOString() });
  const r = await corrigerAgentMandat(m.id, 'Le prix est 460 000, pas 450 000', { email: 'm@kpartners.fr', role: 'mandataire' });
  assert.equal(r.ok, true);
  assert.equal(r.transmis, 'equipe');
  assert.match(JSON.stringify(Records.get('MandatMandataire', m.id).historique), /460 000/);
  assert.equal(Records.list('Notification').some((n) => (n.titre || '').includes('Correction de mandat')), true, 'l’équipe est prévenue');
  // Le mandat d'un autre : introuvable, même avec son identifiant exact.
  const autre = await corrigerAgentMandat(m.id, 'baisse le prix', { email: 'intrus@kpartners.fr', role: 'mandataire' });
  assert.equal(autre.ok, false);
  assert.match(autre.error, /introuvable/i);
  // Un admin, lui, peut transmettre.
  assert.equal((await corrigerAgentMandat(m.id, 'ajuste la durée', { email: 'jules.b@klocka.immo', role: 'admin' })).ok, true);
  // Un mandat enregistré ne se corrige plus.
  const signe = Records.create('MandatMandataire', { mandataire_email: 'm@kpartners.fr', bien: 'Signé', statut: 'enregistre', historique: [] });
  assert.equal((await corrigerAgentMandat(signe.id, 'change le prix', { email: 'm@kpartners.fr' })).ok, false);
});

test('demanderMandat : un double-clic ne crée pas deux mandats', async () => {
  const { demanderMandat } = await import('./mandataire-portes.js');
  const { Records } = await import('./db.js');
  const QUI = { email: 'double@kpartners.fr', role: 'mandataire' };
  const champs = { vendeur: 'Mme Double', bien: 'Tabac du Double', prix: 200000, honoraires: 5, type: 'simple', duree_mois: 12 };
  const a = demanderMandat(champs, QUI);
  const b = demanderMandat(champs, QUI);
  assert.equal(a.ok, true);
  assert.equal(b.ok, true);
  assert.equal(b.deja, true, 'la seconde demande renvoie la première');
  assert.equal(a.mandat.id, b.mandat.id);
  assert.equal(Records.list('MandatMandataire').filter((x) => x.bien === 'Tabac du Double').length, 1);
});

test("le mode éclairage : lire librement, ne jamais modifier l'existant", async () => {
  const e = { ids: new Set() };
  const opts = { mode: 'eclairage' };
  assert.equal(requeteAutorisee({ url: 'https://app.mynotary.fr/assets/images/flag-fr.svg' }, e, opts).ok, true, 'les ressources de page passent');
  assert.equal(requeteAutorisee({ url: 'https://app.mynotary.fr/nimporte/quoi' }, e, opts).ok, true, 'lire, c’est libre');
  assert.equal(requeteAutorisee({ url: 'https://api.mynotary.fr/auth/token', methode: 'POST' }, e, opts).ok, true, 'la connexion passe');
  assert.equal(requeteAutorisee({ url: 'https://api.mynotary.fr/records/AUTRE999x', methode: 'PUT' }, e, opts).ok, false, 'modifier un record, jamais');
  assert.equal(requeteAutorisee({ url: 'https://api.mynotary.fr/records/AUTRE999x', methode: 'PATCH' }, e, opts).ok, false);
  assert.equal(requeteAutorisee({ url: 'https://api.production.mynotary.fr/api-mynotary/v1/users/156116/latest', methode: 'PUT' }, e, opts).ok, true, 'le « vu dernièrement » du compte passe : ce n\u2019est pas un contrat');
  assert.equal(requeteAutorisee({ url: 'https://api.mynotary.fr/records/AUTRE999x', methode: 'DELETE' }, e, opts).ok, false, 'DELETE jamais, éclairage compris');
  // Et le mode par défaut reste le parcours strict.
  assert.equal(requeteAutorisee({ url: 'https://app.mynotary.fr/nimporte/quoi' }, e).ok, false, 'sans mode : liste blanche stricte');
});

test('les identifiants numériques (MyNotary) : la clé les dénonce, le chemin aussi', async () => {
  const e = { ids: new Set(['86518832']) };
  assert.equal(requeteAutorisee({ url: 'https://api.mynotary.fr/operations?operationId=86518832' }, e).ok, true, 'notre dossier en query');
  assert.equal(requeteAutorisee({ url: 'https://api.mynotary.fr/operations?operationId=86518831' }, e).ok, false, 'un autre id numérique, bloqué par sa clé');
  assert.equal(requeteAutorisee({ url: 'https://api.mynotary.fr/operations?organizationId=9453&page=0' }, { ids: new Set(['9453']) }).ok, true, 'l’organisation déclarée passe');
  assert.equal(requeteAutorisee({ url: 'https://app.mynotary.fr/#/operation/86518831/contrats' }, e).ok, false, 'routage par fragment : segment étranger');
  assert.equal(requeteAutorisee({ url: 'https://app.mynotary.fr/#/operation/86518832/contrats' }, e).ok, true, 'routage par fragment : notre dossier');
  const corps = requeteAutorisee({ url: 'https://api.production.mynotary.fr/api-mynotary/v1/records', methode: 'POST', corps: '{"operationId":86518831,"nom":"x"}' }, e);
  assert.equal(corps.ok, false, 'id numérique étranger dans le corps, dénoncé par sa clé');
  assert.equal(requeteAutorisee({ url: 'https://api.production.mynotary.fr/api-mynotary/v1/records', methode: 'POST', corps: '{"operationId":86518832,"prix":450000}' }, e).ok, true, 'notre id et un prix passent');
});

test('éclairage : modifier SON dossier de test passe, celui d’un autre jamais', async () => {
  const opts = { mode: 'eclairage' };
  const e = { ids: new Set(['86518832']) };
  assert.equal(requeteAutorisee({ url: 'https://api.production.mynotary.fr/api-mynotary/v1/operations/86518832', methode: 'PUT' }, e, opts).ok, true, 'poser le nom de son dossier de test');
  assert.equal(requeteAutorisee({ url: 'https://api.production.mynotary.fr/api-mynotary/v1/operations/86518831', methode: 'PUT' }, e, opts).ok, false, 'le dossier d’un autre, jamais');
  assert.equal(requeteAutorisee({ url: 'https://api.production.mynotary.fr/api-mynotary/v1/operations/86518832', methode: 'DELETE' }, e, opts).ok, false, 'DELETE jamais, même le sien');
});
