import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-suivi-activite-'));
const { suiviActivite, fenetre, honorairesDuBien } = await import('./suivi-activite.js');

const maintenant = new Date('2026-11-04T12:00:00Z'); // un mercredi
const T = 'thomas@kpartners.fr';
const L = 'lea@kpartners.fr';
const tables = {
  users: [{ email: T, role: 'mandataire', full_name: 'Thomas' }, { email: L, role: 'mandataire', full_name: 'Léa' }],
  proprietaires: [
    { id: 'p1', mandataire_email: T, statut: 'a_appeler', historique: [] },
    // Appelée lundi puis mardi : deux appels, dont une relance, cette semaine.
    { id: 'p2', mandataire_email: T, statut: 'contacte', historique: [{ le: '2026-11-02T09:00:00Z', type: 'appel', texte: 'Sans réponse' }, { le: '2026-11-03T09:00:00Z', type: 'statut', texte: 'Statut : Contacté' }] },
    { id: 'p3', mandataire_email: T, commerce: 'Boulangerie', ville: 'Lyon', statut: 'rdv_pris', biens: { prochaine: { quoi: 'Présenter l’avis', le: '2026-11-06T09:00:00Z' } }, historique: [{ le: '2026-10-20T09:00:00Z', type: 'statut', texte: 'RDV pris (2026-10-22T10:00:00)' }] },
    { id: 'p5', mandataire_email: T, commerce: 'Essai', statut: 'rdv_pris', test: true, historique: [{ le: '2026-11-03T09:00:00Z', type: 'statut', texte: 'RDV pris' }] },
    { id: 'p6', mandataire_email: L, commerce: 'Tabac', statut: 'rdv_pris', historique: [{ le: '2026-11-03T10:00:00Z', type: 'statut', texte: 'RDV pris' }] },
  ],
  estimations: [
    { id: 'e3', mandataire_email: T, proprietaire_id: 'p3', statut: 'envoye', cree_le: '2026-10-22T10:00:00Z', envoye_le: '2026-10-24T10:00:00Z', avis: { chiffres: { valeur: 400000, honoraires_pct: 5 } } },
    { id: 'e9', mandataire_email: T, exemple: true, statut: 'envoye', cree_le: '2026-10-24T10:00:00Z' },
  ],
  mandats: [
    { id: 'm3', mandataire_email: T, estimation_id: 'e3', statut: 'signe', signe_le: '2026-10-30T10:00:00Z', prix: 400000, honoraires: 5 },
    // Vendu en mars : 14 400 € écrits en euros, mandat signé deux mois plus tôt.
    { id: 'm7', mandataire_email: T, bien: 'Ancien', statut: 'enregistre', signe_le: '2026-01-10T00:00:00Z', prix: 240000, honoraires: 14400 },
  ],
  dossiers: [{ id: 'd7', mandataire_email: T, mandat_id: 'm7', statut: 'go', bien: 'Ancien' }],
  marches: [{ id: 'k7', mandataire_email: T, dossier_id: 'd7', statut: 'acte', acte_le: '2026-03-12T10:00:00Z', offres: [{ id: 'o1', le: '2026-02-20T10:00:00Z', montant: 230000, reponse: 'acceptee' }] }],
};

test('les fenêtres : 30 jours glissants, le trimestre, l’année, et la même un an plus tôt', () => {
  assert.equal(new Date(fenetre('annee', maintenant).de).getFullYear(), 2026);
  assert.equal(new Date(fenetre('trimestre', maintenant).de).getMonth(), 9);
  assert.equal(new Date(fenetre('annee', maintenant).avant.de).getFullYear(), 2025);
});

test('les honoraires : pourcentage du prix de l’offre acceptée, ou euros quand le mandat les écrit ainsi', () => {
  assert.equal(honorairesDuBien({ mandat: { prix: 400000, honoraires: 5 } }), 20000);
  assert.equal(honorairesDuBien({ mandat: { prix: 400000, honoraires: 5 }, marche: { offres: [{ montant: 380000, reponse: 'acceptee' }] } }), 19000);
  assert.equal(honorairesDuBien({ mandat: { prix: 240000, honoraires: 14400 } }), 14400);
});

test("les statistiques d'un mandataire : indicateurs, mois, entonnoir, semaine, dossiers ; ni essais ni exemples ni les autres", () => {
  const r = suiviActivite({ periode: 'annee', maintenant, tables, email: T });
  const ind = Object.fromEntries(r.indicateurs.map((x) => [x.cle, x.valeur]));
  assert.equal(ind.honoraires, 14400);
  assert.equal(ind.mandats, 2);
  assert.equal(ind.passage, 100, '2 mandats pour 1 estimation : plafonné à 100 %');
  assert.equal(ind.delai, 2);
  assert.equal(r.mois[2].montant, 14400);
  assert.equal(r.mois[10].courant, true);
  assert.equal(r.mois[11].montant, null);
  const e = Object.fromEntries(r.entonnoir.map((x) => [x.cle, x.n]));
  assert.deepEqual(e, { appels: 3, estimations: 1, mandats: 2, offres: 1, ventes: 1 });
  const s = Object.fromEntries(r.cette_semaine.map((x) => [x.cle, x.n]));
  assert.deepEqual(s, { appels: 2, relances: 1, rdv: 0 });
  // Le bien vendu n'est plus en cours ; la boulangerie, sous mandat, garde la prochaine action de Haka.
  assert.equal(r.dossiers.length, 1);
  assert.equal(r.dossiers[0].prochaine.quoi, 'Présenter l’avis');
  assert.equal(r.dossiers[0].honoraires, 20000);
  assert.equal(r.mandataires, null);
});

test("l'équipe : tout le monde, et chaque mandataire", () => {
  const r = suiviActivite({ periode: 'annee', maintenant, tables });
  assert.equal(r.cette_semaine.find((x) => x.cle === 'rdv').n, 1, 'le RDV de Léa ; celui de l’essai est écarté');
  assert.deepEqual(r.mandataires.map((m) => m.nom), ['Thomas', 'Léa']);
});
