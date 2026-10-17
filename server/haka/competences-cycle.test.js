// Haka : le cycle de vie d'une compétence (spec du 17 oct. 2026). Format, test en lecture seule
// comparé à la version publiée, publication gardée, retour arrière, désactivation, diff,
// et les exécutions (version figée, rejets remontés à la compétence).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-haka-cycle-'));
process.env.HAKA_EXPORT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-haka-cycle-export-'));
process.env.SUPER_ADMIN_EMAILS = 'jules@test.local';
process.env.HAKA_FILE = '1';
const { Records } = await import('../db.js');
const C = await import('./competences.js');
const E = await import('./executions.js');
const T = await import('./taches.js');
const F = await import('./file.js');
const jules = { email: 'jules@test.local', role: 'admin' };

const champ = (valeur) => ({ valeur, absent: false, confiance: 'haute', citation: String(valeur) });
const deal = (id, nom, lot) => Records.create('Deal', { deal_id: id, nom, lots: [{ lot, synthese: { titre: nom } }] });
deal('d-bordeaux', 'ADG Bordeaux', { prix_fai: champ(1000000), loyer_annuel_ht_hc: champ(78400), occupe: champ(true), surface_m2: champ(100), type_actif: champ('Boulangerie') });
Records.update('Deal', Records.list('Deal')[0].id, { lots: [{ lot: Records.list('Deal')[0].lots[0].lot, synthese: { titre: 'ADG Bordeaux' }, comparaison_marche: { loyer: { median: 490 }, prix: { median: 10000 } } }] });
deal('d-lyon', 'Lyon Paul Santy', { prix_fai: champ(1000000), loyer_annuel_ht_hc: champ(48000), occupe: champ(true), surface_m2: champ(100), type_actif: champ('Pharmacie') });
C.amorcer();

test('validerFormat : les champs obligatoires, un par un', () => {
  const e = C.validerFormat({ nom: '', resume: '', declencheurs: [], entrees: [], outils: [], livrable: '', valide_par: 'x', mode_execution: 'x', destination: 'x', dossiers_test: ['un'] });
  assert.ok(e.length >= 10);
  assert.deepEqual(C.validerFormat(C.lire('pre-analyse-fiche')), [], 'la compétence n°1 est valide');
  assert.ok(C.validerFormat({ ...C.lire('pre-analyse-fiche'), dossiers_test: ['un'] }).some((x) => /deux dossiers de test/.test(x)));
  assert.ok(C.validerFormat({ ...C.lire('pre-analyse-fiche'), outils: [{ cle: 'dvf' }] }).some((x) => /source obligatoire/.test(x)));
});

test('tester : lecture seule, comparé à la version publiée ; seuls ses dossiers de test tournent', async () => {
  C.enregistrerBrouillon('pre-analyse-fiche', { regles: { rendement_brut_min: 4 } }, jules);
  const avant = Records.list('Deal').map((d) => JSON.stringify(d));
  const filesAvant = Records.list('HakaProposition').length;
  const r = await C.tester('pre-analyse-fiche');
  assert.equal(r.ok, true);
  assert.equal(r.tous_ont_tourne, true, 'ADG Bordeaux et Lyon Paul Santy existent : les deux dossiers de test ont tourné');
  const lyon = r.resultats.find((x) => x.titre === 'Lyon Paul Santy');
  assert.equal(lyon.publiee.verdict, 'ecarte');
  assert.equal(lyon.brouillon.verdict, 'conforme', 'à 4 % de seuil, 4,8 % passe');
  assert.match(lyon.ecarts[0], /Verdict : ecarte devient conforme/);
  assert.equal(r.resultats.find((x) => x.titre === 'ADG Bordeaux').publiee.points[0], 'Loyer à +60 % du marché : à loyer de marché, le rendement tomberait à 4,9 %');
  assert.deepEqual(Records.list('Deal').map((d) => JSON.stringify(d)), avant, 'aucune écriture sur les dossiers');
  assert.equal(Records.list('HakaProposition').length, filesAvant, 'rien dans la file');
  assert.equal(E.testsDe('pre-analyse-fiche').length, 2);
  // Un dossier de test introuvable : le test n'a pas tourné, la publication reste bloquée.
  C.enregistrerBrouillon('pre-analyse-fiche', { dossiers_test: ['ADG Bordeaux', 'Dossier fantôme'] }, jules);
  const fantome = await C.tester('pre-analyse-fiche');
  assert.equal(fantome.tous_ont_tourne, false);
  assert.match(fantome.resultats[1].erreur, /introuvable/);
  C.enregistrerBrouillon('pre-analyse-fiche', { dossiers_test: ['ADG Bordeaux', 'Lyon Paul Santy'] }, jules);
  await C.tester('pre-analyse-fiche');
});

test('publier : tous les dossiers de test ont tourné, une note, et la version suit', async () => {
  const c = C.lire('pre-analyse-fiche');
  assert.equal(c.brouillon.tests_pour, C.empreinte(c.brouillon));
  assert.equal(C.publier('pre-analyse-fiche', jules, { note: '' }).statut, 400, 'la note est obligatoire');
  // Modifier le brouillon invalide le test.
  C.enregistrerBrouillon('pre-analyse-fiche', { regles: { rendement_brut_min: 4.5 } }, jules);
  assert.match(C.publier('pre-analyse-fiche', jules, { note: 'x' }).error, /n'ont pas tourné/);
  await C.tester('pre-analyse-fiche');
  const p = C.publier('pre-analyse-fiche', jules, { note: 'Seuil de rendement à 4,5 %' });
  assert.equal(p.ok, true);
  assert.equal(p.competence.version, 2);
  assert.equal(p.competence.regles.rendement_brut_min, 4.5);
  assert.equal(p.competence.versions.find((v) => v.version === 1).note, undefined);
  assert.equal(p.competence.versions.at(-1).note, 'Seuil de rendement à 4,5 %');
  assert.match(fs.readFileSync(path.join(process.env.HAKA_EXPORT_DIR, 'pre-analyse-fiche.md'), 'utf8'), /^---\nslug: pre-analyse-fiche/);
});

test('une exécution fige la version publiée ; une nouvelle version ne change pas celles en cours', () => {
  T.enregistrer('essai_cycle', { competence: 'pre-analyse-fiche', etapes: [{ nom: 'a', async run() { return { dossier: 'd-lyon' }; } }] });
  const t = T.enfiler('essai_cycle', {}, { lancer: false });
  const e = E.parTache(t.id);
  assert.equal(e.competence, 'pre-analyse-fiche');
  assert.equal(e.version, 2);
  C.republier('pre-analyse-fiche', 1, jules);
  assert.equal(C.lire('pre-analyse-fiche').version, 3);
  assert.equal(E.parTache(t.id).version, 2, 'figée pour toute l\'exécution');
});

test('exécution : statut, coût et rejet remontent à la compétence', async () => {
  const t = T.enfiler('essai_cycle', {}, { cle: 'cycle-2', lancer: false });
  await T.tourner();
  assert.equal(E.parTache(t.id).statut, 'faite');
  assert.equal(E.parTache(t.id).dossier, 'd-lyon');
  const p = await F.proposer({ type: 'reponse_equipe', titre: 'Une sortie', resume: 'x', charge: {}, sources: [], pour: 'jules@test.local', tache_id: t.id, cle: 'p1' });
  assert.equal(p.execution_id, E.parTache(t.id).id);
  const rej = await F.rejeter(p.id, jules, 'Mauvais seuil pour ce type de commerce');
  assert.equal(rej.ok, true);
  const s = E.stats('pre-analyse-fiche', { jours: 30 });
  assert.ok(s.executions >= 1);
  assert.equal(s.rejets, 1);
  assert.equal(s.rejets_recents[0].motif, 'Mauvais seuil pour ce type de commerce');
  const tr = E.trace(E.parTache(t.id).id);
  assert.equal(tr.propositions[0].motif_rejet, 'Mauvais seuil pour ce type de commerce');
  assert.equal(tr.etapes[0].nom, 'a');
});

test('républier : une ancienne version devient une NOUVELLE version, l\'historique reste', () => {
  const c = C.lire('pre-analyse-fiche');
  assert.equal(c.version, 3);
  assert.equal(c.regles.rendement_brut_min, 5, 'le contenu de la version 1');
  assert.deepEqual(c.versions.map((v) => v.version), [1, 2, 3]);
  assert.equal(c.versions.at(-1).note, 'Retour à la version 1');
  assert.equal(C.republier('pre-analyse-fiche', 3, jules).statut, 400);
  assert.equal(C.republier('pre-analyse-fiche', 9, jules).statut, 404);
});

test('désactiver : la compétence quitte les cartes ; la réactiver la rend', () => {
  assert.ok(C.pourDeclencheur('chat').some((x) => x.cle === 'pre-analyse-fiche'));
  C.basculerActivation('pre-analyse-fiche', false);
  assert.ok(!C.pourDeclencheur('chat').some((x) => x.cle === 'pre-analyse-fiche'));
  assert.equal(C.publiee('pre-analyse-fiche').version, 3, 'ses exécutions passées restent lisibles');
  C.basculerActivation('pre-analyse-fiche', true);
  assert.ok(C.pourDeclencheur('chat').some((x) => x.cle === 'pre-analyse-fiche'));
});

test('une compétence neuve est un brouillon : invisible de Haka et d\'AK tant qu\'elle n\'est pas publiée', () => {
  const r = C.creer({ nom: 'Refus courtois', resume: 'Prépare le mail de refus.' }, jules);
  assert.equal(r.ok, true);
  assert.equal(C.lire('refus-courtois').version, 0);
  assert.equal(C.publiee('refus-courtois'), null);
  assert.equal(C.pourAK('refus-courtois'), null);
  assert.ok(!C.pourDeclencheur('chat').some((x) => x.cle === 'refus-courtois'));
  assert.equal(C.creer({ nom: 'Refus courtois' }, jules).statut, 409);
  assert.equal(C.basculerActivation('refus-courtois', true).statut, 400);
  assert.ok(r.erreurs_format.length > 0);
});

test('diffTexte et diffVersions : ce qui change entre deux versions', () => {
  const d = C.diffTexte('a\nb\nc', 'a\nc\nd');
  assert.deepEqual(d.map((x) => x.genre + x.texte), ['=a', '-b', '=c', '+d']);
  const v = C.diffVersions('pre-analyse-fiche', 1, 2);
  assert.ok(v.entete.some((x) => x.champ === 'regles'));
  assert.equal(C.diffVersions('pre-analyse-fiche', 1, 99), null);
});

test('créer à partir d\'un exemple : Haka propose un brouillon complet, rien n\'est publié', async () => {
  const { depuisExemple } = await import('./competence-depuis-exemple.js');
  let vu = null;
  const r = await depuisExemple({ nom: 'Lire un bail commercial', texte: 'Voici une fiche bien faite : ...' }, jules, {
    ecrire: async (prompt) => { vu = prompt; return { resume: 'Lit un bail et rend la grille.', declencheurs: ['chat', 'nimporte'], entrees: ['Le bail'], outils: [{ cle: 'documents', obligatoire: true }, { cle: 'inconnu' }], livrable: 'La grille du bail', destination: 'dossier', mode_execution: 'temps_reel', corps: '1. Lire.\n\nNe jamais inventer.' }; },
  });
  assert.equal(r.ok, true);
  assert.match(vu, /Voici une fiche bien faite/);
  const c = C.lire('lire-un-bail-commercial');
  assert.equal(c.version, 0, 'rien n\'est publié');
  assert.deepEqual(c.brouillon.declencheurs, ['chat']);
  assert.deepEqual(c.brouillon.outils, [{ cle: 'documents', obligatoire: true }]);
  assert.match(c.brouillon.corps, /Ne jamais/);
  assert.equal(C.publiee('lire-un-bail-commercial'), null);
  assert.equal((await depuisExemple({ nom: 'Vide', texte: '  ' }, jules)).statut, 400);
  const panne = await depuisExemple({ nom: 'En panne', texte: 'x' }, jules, { ecrire: async () => { throw new Error('plus de crédits'); } });
  assert.equal(panne.brouillon_vide, true);
  assert.match(panne.avertissement, /plus de crédits/);
});
