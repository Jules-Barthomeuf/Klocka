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
    { id: 'p1', mandataire_email: T, statut: 'a_appeler', created_date: '2026-10-28T09:00:00Z', historique: [] },
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

test('les fenêtres : la semaine depuis lundi, le mois, l’année, la même un an plus tôt, et leurs tranches', () => {
  const a = fenetre('annee', maintenant);
  assert.equal(new Date(a.de).getFullYear(), 2026);
  assert.equal(new Date(a.avant.de).getFullYear(), 2025);
  assert.equal(a.tranches.length, 11);
  assert.equal(a.etendue, 'Janvier → novembre');
  assert.equal(new Date(fenetre('mois', maintenant).de).getDate(), 1);
  assert.equal(fenetre('mois', maintenant).etendue, 'Novembre');
  assert.equal(new Date(fenetre('semaine', maintenant).de).getDay(), 1);
  assert.equal(fenetre('semaine', maintenant).tranches.length, 3, 'lundi, mardi, mercredi');
});

test('les honoraires : pourcentage du prix de l’offre acceptée, ou euros quand le mandat les écrit ainsi', () => {
  assert.equal(honorairesDuBien({ mandat: { prix: 400000, honoraires: 5 } }), 20000);
  assert.equal(honorairesDuBien({ mandat: { prix: 400000, honoraires: 5 }, marche: { offres: [{ montant: 380000, reponse: 'acceptee' }] } }), 19000);
  assert.equal(honorairesDuBien({ mandat: { prix: 240000, honoraires: 14400 } }), 14400);
});

test("les statistiques d'un mandataire : indicateurs et courbes, semaine, entonnoir ; ni essais ni exemples ni les autres", () => {
  const r = suiviActivite({ periode: 'annee', maintenant, tables, email: T });
  const ind = Object.fromEntries(r.indicateurs.map((x) => [x.cle, x.valeur]));
  assert.equal(ind.honoraires, 14400);
  assert.equal(ind.mandats, 2);
  assert.equal(ind.passage, 100, '2 mandats pour 1 rendez-vous : plafonné à 100 %');
  assert.equal(ind.delai, 2);
  const courbe = Object.fromEntries(r.indicateurs.map((x) => [x.cle, x.courbe]));
  assert.equal(courbe.honoraires.length, 11);
  assert.equal(courbe.honoraires[2], 14400, 'encaissés en mars');
  assert.deepEqual(courbe.mandats.slice(0, 1).concat(courbe.mandats.slice(-1)), [1, 2], 'cumulés');
  assert.equal(r.etendue, 'Janvier → novembre');
  const e = Object.fromEntries(r.entonnoir.map((x) => [x.cle, x.n]));
  assert.deepEqual(e, { appels: 3, rdv: 1, mandats: 2, offres: 1, ventes: 1 });
  const s = Object.fromEntries(r.cette_semaine.map((x) => [x.cle, x.n]));
  assert.deepEqual(s, { reperes: 0, appels: 2, rdv: 0 });
  const prospections = r.cette_semaine.find((x) => x.cle === 'appels').jours;
  assert.deepEqual(prospections.map((j) => j.n), [1, 1, 0, null, null], 'lundi, mardi ; jeudi et vendredi à venir');
  assert.equal(r.mandataires, null);
});

test("l'équipe : tout le monde, et chaque mandataire", () => {
  const r = suiviActivite({ periode: 'annee', maintenant, tables });
  assert.equal(r.cette_semaine.find((x) => x.cle === 'rdv').n, 1, 'le RDV de Léa ; celui de l’essai est écarté');
  assert.deepEqual(r.mandataires.map((m) => m.nom), ['Thomas', 'Léa']);
  const reperes = r.cette_semaine.find((x) => x.cle === 'reperes');
  assert.equal(reperes.avant, 1, 'la fiche créée le mercredi précédent');
  assert.equal(reperes.jours[2].avant, 1);
});
