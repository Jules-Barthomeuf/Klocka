// Le parcours du mandataire, de bout en bout (PLAN.md T.1, 1er nov. 2026) : `npm run test:parcours`.
//
// Un commerce de la carte → sa fiche « À contacter » → Contacté → rendez-vous fixé (le bien entre dans Biens, étape
// Pré-visite, sa préparation est composée) → l'Avis de valeur commence depuis le bien, dans le fil du bien → la valeur
// par le taux de rendement → accord sur un prix (étape Mandat) → le mandat se prépare depuis l'avis, dans le même fil
// → signé : fin du périmètre de la V1.
//
// Les fonctions sont les vraies, sur une base à part. Deux gestes passent par un service et sont simulés ici : la
// rédaction de l'avis par le modèle (l'avis est posé tel que rediger le pose, chiffres calculés par le serveur), et
// la saisie MyNotary (le mandat passe à « signé »). Le navigateur n'est pas testé ici.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-parcours-'));
process.env.MONDAY_TOKEN = '';
const { Records } = await import('./db.js');
const E = await import('./mandataire-espace.js');
const FM = await import('./fiche-mandataire.js');
const B = await import('./bien-etapes.js');
const A = await import('./mandataire-avis.js');
const MC = await import('./mandataire-mandat-chat.js');
const F = await import('./fil-du-bien.js');
const C = await import('./assistant-conversations.js');
const { estimerParRendement } = await import('./taux-rendement.js');
const { regrouperBiens, etapeDuBien, statutDuBien } = await import('../src/lib/biens-mandataire.js');

const MOI = { email: 'parcours@kpartners.fr', role: 'mandataire', full_name: 'Marc Parcours' };
const lesBiens = () => regrouperBiens({
  estimations: Records.list('EstimationMandataire'), mandats: Records.list('MandatMandataire'), dossiers: [], marches: [],
  proprietaires: Records.list('ProprietaireMandataire').filter((p) => p.mandataire_email === MOI.email),
});
const leBien = (id) => lesBiens().find((b) => b.proprietaire?.id === id);

test('le parcours de la V1 : de la carte au mandat signé, un seul bien, un seul fil', async () => {
  // La carte : un commerce de Cannes, avec son propriétaire et son exploitant.
  const ville = Records.create('Ville', { nom: 'Cannes', centre: { lat: 43.55, lon: 7.01 } });
  const commerce = Records.create('CommerceSimple', { ville_id: ville.id, ville: 'Cannes', enseigne: 'Boulangerie Dupain', nom: 'DUPAIN SARL', activite: 'Boulangerie', adresse: '19 RUE D ANTIBES', lat: 43.552, lon: 7.018, proprietaire: { nom: 'SCI LES TILLEULS' } });

  // 1. Le point devient une fiche « À contacter », qui appartient au mandataire.
  const f = await FM.ficheDuCommerce(commerce.id, MOI);
  assert.equal(f.ok, true, f.error);
  const id = f.proprietaire?.id || f.id || f.proprietaire_id;
  assert.ok(id, 'la fiche a un identifiant');
  assert.equal(Records.get('ProprietaireMandataire', id).statut, 'a_appeler');
  assert.equal(statutDuBien({ proprietaire: Records.get('ProprietaireMandataire', id) }), 'À contacter');

  // On en parle à l'assistant depuis la fiche : le fil du bien commence, le commerce est prospecté.
  E.noterParole(id, MOI);
  const debut = F.rejoindreLeFil(MOI, id, [{ role: 'user', contenu: "J'ai eu le propriétaire, il veut vendre." }, { role: 'assistant', contenu: 'Noté sur la fiche.' }]);
  assert.equal(debut.ok, true);
  assert.ok(Records.get('ProprietaireMandataire', id).prospecte_le);

  // 2. Contacté, puis rendez-vous fixé : le bien entre dans Biens, étape Pré-visite.
  assert.equal(E.noterResultat(id, { statut: 'contacte', texte: 'Joint au téléphone' }, MOI).ok, true);
  assert.equal(E.noterResultat(id, { statut: 'rdv_pris', texte: 'RDV mardi 10 h' }, MOI).ok, true);
  assert.equal(etapeDuBien(leBien(id)), 1, 'Pré-visite');

  // 3. L'Avis de valeur commence depuis le bien, et s'écrit dans le même fil.
  const avis = await A.avisDepuisLeBien({ proprietaire_id: id }, MOI);
  assert.equal(avis.ok, true, avis.error);
  const conv = await A.conversationDeLEstimation(avis.estimation_id, MOI);
  assert.equal(conv.conversation_id, debut.id, "l'avis rejoint le fil du bien");
  assert.equal(etapeDuBien(leBien(id)), 2, 'Avis de valeur');

  // La valeur, par le taux de rendement : le taux de base validé, ajusté par le bien.
  const q = { occupe: true, loyer_annuel_hc: 25200, taux_base: 6.5, rang_rue: 'n1', profil_locataire: 'solide', date_effet: '2021-03-01', echeance: '2030-02-28', charges_refacturees: 'oui', taxe_fonciere_refacturee: 'oui' };
  const valeur = estimerParRendement(q, { loyer: 25200, aujourdhui: new Date(2026, 10, 1) });
  assert.equal(valeur.taux, 6);
  assert.equal(valeur.moyenne, 420000);
  // Simulé : l'avis tel que rediger le pose, puis envoyé au propriétaire.
  const chiffres = A.chiffrer({ ...q, type_bien: 'murs_commerce', surface_utile: 60 }, { taux: valeur.taux, prix_m2: null, dataB: { moyenne: valeur.moyenne, basse: valeur.basse, haute: valeur.haute } });
  Records.update('EstimationMandataire', avis.estimation_id, {
    questionnaire: { ...q, type_bien: 'murs_commerce', adresse: '19 rue d’Antibes, 06400 Cannes', surface_utile: 60 }, questionnaire_en_cours: false,
    avis: { version: 1, methode: 'rendement', type_bien: 'murs_commerce', occupe: true, chiffres, methodes: { taux: valeur.taux, rendement: { taux_base: 6.5, ajustements: valeur.ajustements } } },
    statut: 'envoye', prete_le: new Date().toISOString(), envoye_le: new Date().toISOString(),
  });
  assert.equal(etapeDuBien(leBien(id)), 2, "envoyé, l'avis attend la réponse du propriétaire");

  // 4. Le propriétaire est d'accord sur un prix : le bien passe au Mandat.
  assert.equal(B.noterPrixAccord(id, 420000, MOI).ok, true);
  assert.equal(etapeDuBien(leBien(id)), 3, 'Mandat');

  // 5. Le mandat se prépare depuis l'avis, et s'écrit lui aussi dans le fil du bien.
  const mandat = MC.preparerMandat({ estimation_id: avis.estimation_id }, MOI);
  assert.equal(mandat.ok, true, mandat.error);
  const convMandat = await MC.conversationDuMandat(mandat.mandat_id, MOI);
  assert.equal(convMandat.conversation_id, debut.id, 'le mandat rejoint le même fil');

  // 6. Simulé : MyNotary rend le mandat signé. Fin du périmètre de la V1.
  Records.update('MandatMandataire', mandat.mandat_id, { statut: 'signe', signe_le: new Date().toISOString() });
  assert.equal(etapeDuBien(leBien(id)), 4, 'Mandat signé : la Commercialisation suit');

  // Un seul bien, un seul fil, tout ce qui s'est dit dedans.
  assert.equal(lesBiens().filter((b) => b.proprietaire?.id === id).length, 1);
  const fil = C.lireConversation(MOI, debut.id, { espace: F.espaceDuBien(id) });
  assert.match(fil.messages[0].contenu, /veut vendre/);
  assert.equal(C.listerConversations(MOI, { espace: F.espaceDuBien(id) }).length, 1);
});
