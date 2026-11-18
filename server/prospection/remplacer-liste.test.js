import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-remplacer-'));
const { Records } = await import('../db.js');
const R = await import('./remplacer-liste.js');

test('remplacer la liste d\'une ville : rien du travail fait n\'est perdu, le reste sort, Twenty suit', async () => {
  const vieille = Records.create('ListeAgences', { ville: 'Grenoble', etat: 'fini' });
  const commune = Records.create('AgenceProspect', { liste_id: vieille.id, nom: 'Cimm Immobilier', telephone: '04 76 00 00 01', place_id: 'pl-1', carnet_id: 'carnet-1', twenty_agence_id: 'tw-vieux-1', agents: [{ nom: 'Paul Martin' }] });
  const appelee = Records.create('AgenceProspect', { liste_id: vieille.id, nom: 'Agence du Parc', telephone: '04 76 00 00 02', twenty_agence_id: 'tw-vieux-2' });
  Records.create('AgentAppel', {});
  Records.create('AppelAgent', { agence_id: appelee.id, etat: 'valide' });
  const oubliee = Records.create('AgenceProspect', { liste_id: vieille.id, nom: 'Jamais Appelée Immo', telephone: '04 76 00 00 03', twenty_agence_id: 'tw-vieux-3' });
  // Une seconde liste de la ville (« Grenoble · Apollo ») : son mandataire déjà appelé passe dans la nouvelle, et la liste est archivée.
  const autre = Records.create('ListeAgences', { ville: 'Grenoble · Apollo', etat: 'fini' });
  const mandataire = Records.create('AgenceProspect', { liste_id: autre.id, nom: 'Léa Martin', genre: 'mandataire', carnet_id: 'carnet-2' });
  // La même agence que « Agence du Parc », au carnet, dans la seconde liste : une seule ligne, le carnet passe sur elle.
  const jumelle = Records.create('AgenceProspect', { liste_id: autre.id, nom: 'Agence du Parc', telephone: '0476000002', carnet_id: 'carnet-3', twenty_agence_id: 'tw-jumelle' });
  Records.create('ListeAgences', { ville: 'Nice', etat: 'fini' });
  const donnees = {
    liste: { id: 'liste-g2', ville: 'Grenoble 2', journal: [] },
    agences: [
      { id: 'n-1', nom: 'Cimm immobilier Grenoble', telephone: '+33 4 76 00 00 01', place_id: 'pl-1', site: 'https://cimm.fr', twenty_agence_id: 'tw-g2-1', agents: [{ nom: 'Léa Dupont', telephone: '06 00 00 00 01' }], apollo_equipe: { gens: [{ nom: 'Léa D.', nom_complet: 'Léa Dupont' }], par_personnes: true }, photos_equipe: { par_nom: { 'lea dupont': 'https://x/lea.jpg' } }, sources: ['Apollo', 'Google Maps'] },
      { id: 'n-2', nom: 'Les Z\'Agents', telephone: '04 76 00 00 09', twenty_agence_id: 'tw-g2-2', sources: ['Apollo', 'Google Maps'] },
      { id: 'n-3', nom: 'Jamais Appelée Immo', telephone: '04 76 00 00 03', twenty_agence_id: 'tw-g2-3', sources: ['Apollo'] },
    ],
  };
  const jetees = [];
  const T = { supprimer: async (pluriel, id) => { jetees.push(id); } };
  const r = await R.remplacerListe({ ville: 'Grenoble', donnees, T, journal: () => {} });
  assert.deepEqual({ nouvelles: r.nouvelles, fondues: r.fondues, gardees: r.gardees_travaillees, sorties: r.sorties }, { nouvelles: 1, fondues: 2, gardees: 2, sorties: 0 });
  assert.equal(Records.get('AgenceProspect', mandataire.id).liste_id, r.liste);
  assert.equal(r.doublons, 1);
  assert.equal(Records.get('AgenceProspect', jumelle.id).hors_cible, true);
  assert.equal(Records.get('AgenceProspect', appelee.id).carnet_id, 'carnet-3', 'le carnet de la jumelle passe sur la ligne gardée');
  assert.equal(Records.get('ListeAgences', autre.id).archivee, true);
  assert.equal(Records.list('ListeAgences').find((l) => l.ville === 'Nice').archivee, undefined, 'une autre ville n\'est pas touchée');
  const nouvelle = Records.get('ListeAgences', r.liste);
  assert.equal(nouvelle.ville, 'Grenoble');
  assert.equal(Records.get('ListeAgences', vieille.id).archivee, true, 'l\'ancienne liste archivée, pas supprimée');
  const c = Records.get('AgenceProspect', commune.id);
  assert.equal(c.liste_id, nouvelle.id);
  assert.equal(c.carnet_id, 'carnet-1', 'le carnet (et donc les appels) gardé');
  assert.equal(c.twenty_agence_id, 'tw-vieux-1', 'travaillée (au carnet) : sa ligne Twenty gardée');
  assert.deepEqual(c.agents.map((x) => x.nom), ['Paul Martin', 'Léa Dupont']);
  assert.equal(c.site, 'https://cimm.fr');
  assert.equal(c.apollo_equipe.gens[0].nom_complet, 'Léa Dupont');
  assert.equal(Records.get('AgenceProspect', appelee.id).liste_id, nouvelle.id, 'une agence déjà appelée reste dans la ville');
  const o = Records.get('AgenceProspect', oubliee.id);
  assert.equal(o.liste_id, r.liste, 'jamais travaillée mais dans la nouvelle : elle reste');
  assert.equal(o.twenty_agence_id, 'tw-g2-3', 'jamais travaillée : la ligne Twenty de la nouvelle est gardée');
  assert.equal(Records.get('AgenceProspect', 'n-2').liste_id, nouvelle.id);
  assert.deepEqual(jetees.sort(), ['tw-g2-1', 'tw-jumelle', 'tw-vieux-3'], 'à la corbeille : le doublon de la nouvelle, la jumelle et l\'ancienne sortie');
});
