// Les exemples de l'espace mandataire (10 oct. 2026) : posés une fois à
// l'arrivée, visibles du seul mandataire, et jamais sortis de la plateforme.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-exemples-'));
process.env.MONDAY_TOKEN = '';
const X = await import('./mandataire-exemples.js');
const P = await import('./mandataire-portes.js');
const { Records } = await import('./db.js');

const MOI = { email: 'nouveau@kpartners.fr', role: 'mandataire' };
const AUTRE = { email: 'autre@kpartners.fr', role: 'mandataire' };
const ADMIN = { email: 'admin@klocka.immo', role: 'admin' };

test("à la première visite, un exemple par page ; une seule fois, et chacun ne voit que les siens", () => {
  assert.equal(P.listerMandats(MOI).length, 1);
  const m = P.listerMandats(MOI)[0];
  assert.equal(m.exemple, true);
  assert.match(m.bien, /Basic-Fit/);
  assert.equal(m.statut, 'brouillon');
  assert.ok(m.questionnaire.prix > 0 && !m.questionnaire.duree_mois, 'presque complet : la durée reste à dire');
  assert.equal(P.listerEstimations(MOI).length, 1);
  assert.equal(P.listerDossiers(MOI).length, 2);
  const marche = P.listerMarches(MOI).find((m) => /pharmacie/.test(m.bien));
  assert.equal(marche.statut, 'offre');
  assert.ok(marche.offres[0].validee && marche.offres[0].argumentaire);
  // Une seconde visite ne repose rien.
  assert.equal(X.semerExemples(MOI), 0);
  assert.equal(P.listerDossiers(MOI).length, 2);
  // Un autre mandataire a les siens, pas ceux du premier.
  assert.ok(P.listerDossiers(AUTRE).every((d) => d.mandataire_email === AUTRE.email));
  // L'admin ne voit les exemples de personne, ni dans les listes, ni dans la file, ni au registre.
  assert.equal(P.listerDossiers(ADMIN).filter((d) => d.exemple).length, 0);
  assert.equal(P.fileDeValidation().filter((l) => /exemple/i.test(l.titre)).length, 0);
});

test("un exemple ne sort pas : ni transfert à Klocka, ni MyNotary, ni Sunday CRM", async () => {
  // Le dossier complet d'origine est devenu le bien en mise en marché (Carpentras, au go) le 25 oct. 2026.
  const d = P.listerDossiers(MOI).find((x) => /Carpentras/.test(x.bien));
  assert.ok(P.checklist(d).complet, 'le dossier complet a ses pièces');
  const r = await P.soumettreDossier(d.id, MOI, {});
  assert.equal(r.ok, false);
  assert.match(r.error, /exemple/);
  assert.equal(Records.get('DossierMandataire', d.id).statut, 'go');
  assert.equal((await P.pousserDossierMonday(d.id, { creer: true })).ok, false);
  const C = await import('./mandataire-mandat-chat.js');
  const m = P.listerMandats(MOI)[0];
  Records.update('MandatMandataire', m.id, { conversation_id: 'conv-exemple', questionnaire: { ...m.questionnaire, duree_mois: 12 } });
  const e = await C.envoyerMandat(MOI, 'conv-exemple');
  assert.equal(e.ok, false);
  assert.equal(e.exemple, true);
  assert.equal(Records.get('MandatMandataire', m.id).statut, 'brouillon');
  // Un mandat commencé dans le chat ne reprend jamais l'exemple.
  const neuf = C.commencerMandat({ bien: 'Mon vrai mandat' }, MOI, null);
  assert.notEqual(neuf.mandat_id, m.id);
});

test("les pièces d'exemple sont de vrais PDF, et un clic retire tous les exemples pour de bon", () => {
  const pdf = X.pdfSimple(['EXEMPLE - Bail commercial', 'Loyer : 111 000 €']);
  assert.match(pdf.toString('latin1'), /^%PDF-1\.4[\s\S]*%%EOF\n$/);
  const r = X.retirerExemples(MOI);
  assert.equal(r.retires, 10, "les cinq d'origine et les cinq posés pour voir chaque étape");
  assert.equal(P.listerDossiers(MOI).filter((d) => d.exemple).length, 0);
  assert.equal(P.listerMarches(MOI).length, 0, 'ils ne reviennent pas');
});

test('un bien d’exemple par étape de Biens, une seule fois, sans rien supprimer', async () => {
  const QUI = { email: 'etapes@kpartners.fr', role: 'mandataire' };
  P.listerMandats(QUI);
  const { regrouperBiens, ETAPES_BIEN } = await import('../src/lib/biens-mandataire.js');
  const avoir = (e) => Records.list(e).filter((x) => x.mandataire_email === QUI.email);
  const biens = regrouperBiens({
    estimations: avoir('EstimationMandataire'), mandats: avoir('MandatMandataire'), dossiers: avoir('DossierMandataire'),
    marches: avoir('MiseEnMarche'), proprietaires: avoir('ProprietaireMandataire'),
  });
  assert.deepEqual(biens.map((b) => ETAPES_BIEN[b.etape - 1].id).sort(), ETAPES_BIEN.map((e) => e.id).sort(), 'exactement un par étape');
  assert.ok(biens.every((b) => b.exemple));
  assert.equal(X.exemplesParEtape(QUI), 0, 'une seule fois');
  // Retirés, ils ne reviennent pas (les fiches de la Prospection d'exemple aussi).
  X.retirerExemples(QUI);
  assert.equal(avoir('ProprietaireMandataire').length, 0);
  // Un admin sans exemples n'en reçoit pas.
  assert.equal(X.exemplesParEtape({ email: 'admin2@klocka.immo', role: 'admin' }), 0);
});
