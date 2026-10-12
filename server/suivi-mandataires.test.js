import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-suivi-mandataires-'));
const { suiviMandataires } = await import('./suivi-mandataires.js');

const maintenant = new Date('2026-10-09T12:00:00Z');
const tables = {
  users: [
    { email: 'thomas@kpartners.fr', role: 'mandataire', full_name: 'Thomas', created_date: '2026-09-01T00:00:00Z' },
    { email: 'lea@kpartners.fr', role: 'mandataire', full_name: 'Léa' },
    { email: 'jules@klocka.immo', role: 'admin' },
  ],
  visites: [
    { page: 'MandataireProspection', par: 'thomas@kpartners.fr', role: 'mandataire', le: '2026-10-08T09:00:00Z' },
    { page: 'MandataireProspection', par: 'thomas@kpartners.fr', role: 'mandataire', le: '2026-10-08T10:00:00Z' },
    { page: 'MandataireMandat', par: 'thomas@kpartners.fr', role: 'mandataire', le: '2026-10-06T10:00:00Z' },
    { page: 'Dashboard', par: 'thomas@kpartners.fr', role: 'mandataire', le: '2026-08-01T10:00:00Z' },
    { page: 'Dashboard', par: 'jules@klocka.immo', role: 'admin', le: '2026-10-08T10:00:00Z' },
  ],
  proprietaires: [
    { mandataire_email: 'thomas@kpartners.fr', nom: 'M. Girard', statut: 'rdv_pris', cree_le: '2026-10-01T00:00:00Z', historique: [
      { le: '2026-10-01T00:00:00Z', type: 'creation', texte: 'Fiche créée' },
      { le: '2026-10-02T00:00:00Z', type: 'appel', texte: 'Appel sans réponse' },
      { le: '2026-10-03T00:00:00Z', type: 'statut', texte: 'RDV pris' },
      { le: '2026-08-03T00:00:00Z', type: 'appel', texte: 'Trop ancien' },
    ] },
    { mandataire_email: 'jules@klocka.immo', statut: 'rdv_pris', historique: [{ le: '2026-10-03T00:00:00Z', type: 'appel', texte: 'Essai admin' }] },
  ],
  prospections: [{ mandataire_email: 'thomas@kpartners.fr', nom: 'Boulangeries Mâcon', cree_le: '2026-10-04T00:00:00Z' }],
  trouvailles: [],
  estimations: [{ mandataire_email: 'lea@kpartners.fr', bien: 'Cave', cree_le: '2026-10-02T00:00:00Z', envoye_le: '2026-10-05T00:00:00Z' }],
  mandats: [{ mandataire_email: 'thomas@kpartners.fr', bien: 'Boulangerie', cree_le: '2026-10-02T00:00:00Z', signe_le: '2026-10-03T00:00:00Z' }],
  dossiers: [{ mandataire_email: 'thomas@kpartners.fr', bien: 'Boulangerie', cree_le: '2026-10-03T00:00:00Z', go_le: '2026-10-05T00:00:00Z' }],
  ventes: [],
  couts: [{ par: 'thomas@kpartners.fr', cout: 1, le: '2026-10-05T00:00:00Z' }, { par: 'thomas@kpartners.fr', cout: 5, le: '2026-07-05T00:00:00Z' }],
};

test('suivi des mandataires : la période, les comptes mandataires seuls, et le journal', () => {
  const r = suiviMandataires({ jours: 30, maintenant, tables });
  assert.deepEqual(r.mandataires.map((m) => m.email), ['thomas@kpartners.fr', 'lea@kpartners.fr']);
  const t = r.mandataires[0];
  assert.equal(t.visites, 3);
  assert.equal(t.jours_actifs, 2);
  assert.equal(t.derniere_visite, '2026-10-08T10:00:00Z');
  assert.equal(t.pages[0].page, 'MandataireProspection');
  assert.equal(t.contacts, 2);
  assert.equal(t.rdv, 1);
  assert.equal(t.prospections, 1);
  assert.equal(t.mandats_signes, 1);
  assert.equal(t.dossiers_go, 1);
  assert.equal(t.cout_ia_eur, 0.92);
  const l = r.mandataires[1];
  assert.equal(l.visites, 0);
  assert.equal(l.derniere_visite, null);
  assert.equal(l.avis_envoyes, 1);
  assert.equal(r.equipe.actifs, 1);
  assert.equal(r.equipe.rdv, 1);
  assert.equal(r.par_jour.length, 30);
  assert.equal(r.par_jour.find((j) => j.jour === '2026-10-08').visites, 2);
  assert.ok(!r.journal.some((x) => x.email === 'jules@klocka.immo'));
  assert.equal(r.journal[0].quoi, 'Dossier');
  assert.match(r.journal[0].detail, /GO : Boulangerie/);
});
