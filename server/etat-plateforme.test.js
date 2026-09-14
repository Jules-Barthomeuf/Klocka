// Ce que le digest de continuité doit dire, et ce qu'il ne doit pas inventer.
//
// Le fichier docs/etat-plateforme.md est lu par une session de travail au lieu
// de reposer les mêmes questions. Un digest qui se trompe est pire qu'aucun
// digest : on agirait sur des chiffres faux sans les vérifier.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-etat-'));

const { enMarkdown } = await import('./etat-plateforme.js');
const { LEVIERS, resoudreLevier } = await import('./llm-couts.js');

const ETAT = {
  jours: 30,
  le: '2026-09-14T10:00:00.000Z',
  usage: {
    totaux: { personnes: 2, visites: 1540, requetes: 1, actions: 4 },
    personnes: [
      { email: 'jules.b@klocka.immo', role: 'admin', visites: 670, requetes: 1, actions: 2, derniere: '2026-09-14T16:29:00.000Z' },
      { email: 'info@ineslamy.com', role: 'user', visites: 19, requetes: 0, actions: 0, derniere: '2026-09-08T15:45:00.000Z' },
    ],
    pages: [{ page: 'Analyse', visites: 572 }, { page: 'Dashboard', visites: 279 }],
  },
  couts: { total: { cout: 107.2, appels: 3037, entree: 14000000, sortie: 986000 } },
  gestes: {
    part_fond: 0.47,
    part_cache: 0.12,
    actions: [
      { cle: 'lecture_piece', libelle: 'Lire une pièce du dossier', unite: 'par document', mediane: 0.152, cout: 33.2, unites: 115, duree_moyenne_ms: 54000, fond: false },
      { cle: 'veille', libelle: 'Juger un mail entrant', unite: 'par mail douteux', mediane: 0.0039, cout: 4.9, unites: 1240, duree_moyenne_ms: 4000, fond: true },
    ],
    non_classees: [],
    leviers: LEVIERS.map((l) => resoudreLevier(l, { actions: [{ cle: 'lecture_piece', mediane: 0.152 }, { cle: 'veille', mediane: 0.0039 }], part_cache: 0.12 })),
  },
};

test('le digest porte sa date et sa fenêtre', () => {
  const md = enMarkdown(ETAT);
  assert.match(md, /Écrit le 14\/09\/2026/);
  assert.match(md, /sur les 30 derniers jours/);
  assert.match(md, /il est réécrit/);
});

test('les chiffres sont ceux du journal, en euros', () => {
  const md = enMarkdown(ETAT);
  // 107,20 $ au taux de 0,92.
  assert.match(md, /98,62 €/);
  // Le séparateur de milliers du français est une espace fine insécable.
  assert.match(md, /2 personnes, 1\s540 pages ouvertes/);
  assert.match(md, /47 % part en tâche de fond/);
  assert.match(md, /12 % des jetons d'entrée/);
});

test("l'écran le plus ouvert est nommé, avec sa part", () => {
  const md = enMarkdown(ETAT);
  assert.match(md, /\*\*Analyse\*\* — 572 \(67 %\)/);
  assert.match(md, /L'écran de travail, c'est \*\*Analyse\*\* : 67 %/);
});

test('les leviers qui attendent sont séparés de ceux qui sont posés', () => {
  const md = enMarkdown(ETAT);
  assert.match(md, /Ne les reproposez pas comme des idées neuves/);
  assert.match(md, /\*\*L'espacement de la veille\*\* \(un réglage\)/);
  assert.match(md, /\*\*Le traitement différé\*\* \(une décision\)/);
  assert.match(md, /Déjà en place, à ne pas défaire : le cache des pièces/);
});

test('un jalon de levier prend la médiane de la période', () => {
  const l = resoudreLevier(LEVIERS.find((x) => x.cle === 'pas_de_relecture'), { actions: [{ cle: 'lecture_piece', mediane: 0.152 }], part_cache: 0.3 });
  assert.equal(l.effet, '0,14 € économisés par relecture évitée');
  // Sans chiffre sur la période, la phrase de repli, jamais un « — » nu.
  const vide = resoudreLevier(LEVIERS.find((x) => x.cle === 'pas_de_relecture'), { actions: [], part_cache: 0 });
  assert.equal(vide.effet, 'une lecture entière économisée');
});

test('le cache annonce sa part, et se justifie tant qu il est jeune', () => {
  const jeune = resoudreLevier(LEVIERS.find((x) => x.cle === 'cache'), { actions: [], part_cache: 0.02 });
  assert.match(jeune.texte, /2 % de jetons servis par le cache/);
  assert.match(jeune.texte, /le chiffre montera de lui-même/);
  const mur = resoudreLevier(LEVIERS.find((x) => x.cle === 'cache'), { actions: [], part_cache: 0.4 });
  assert.match(mur.texte, /40 % de jetons servis par le cache sur cette période\./);
  assert.doesNotMatch(mur.texte, /montera de lui-même/);
});

test('une opération non rangée est signalée, pas cachée', () => {
  const md = enMarkdown({ ...ETAT, gestes: { ...ETAT.gestes, non_classees: [{ operation: 'POST /api/truc', cout: 0.5 }] } });
  assert.match(md, /Pas encore rangé dans un geste/);
  assert.match(md, /POST \/api\/truc \(0,46 €\)/);
});
