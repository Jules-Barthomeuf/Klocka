// Le tableau « Agences » de Twenty CRM (16 nov. 2026, Jules) : voir server/crm/agences-twenty.js.
//   1. l'objet Agences et ses champs (une option de ville par liste de la Prospection) ;
//   2. fermé au rôle Mandataire K Partners (outil de l'équipe Klocka) ;
//   3. rangé dans le dossier Klocka de la barre de gauche ;
//   4. les colonnes de la vue principale, puis une vue par ville (filtre Ville, tri par nom) ;
//   5. les agences des listes, une ligne chacune.
// Rejouable : rien n'est créé deux fois, une ligne mise à la corbeille dans Twenty n'est pas recréée.
//   node --env-file=.env scripts/crm/agences-twenty.mjs        (montre ce qui serait fait)
//   node --env-file=.env scripts/crm/agences-twenty.mjs --go   (le fait)
import { twentyConfigure } from '../../server/twenty.js';
import { AGENTS, PLURIEL, preparer, synchroniser, villesDesAgents } from '../../server/crm/agences-twenty.js';

if (!twentyConfigure()) {
  console.error('TWENTY_URL / TWENTY_API_KEY manquants');
  process.exit(1);
}
const go = process.argv.includes('--go');
const dire = (x) => console.log(`${go ? '' : '(à faire) '}${x}`);
// 1 à 4 : la structure (server/crm/agences-twenty.js, preparer), faite aussi par le serveur en ligne (entretenir).
const T = await import('../../server/twenty.js');
const agents = await T.lister(AGENTS).catch(() => []);
const { options, vues } = villesDesAgents(agents, await T.lister(PLURIEL));
const p = await preparer({ go, dire, villesEnPlus: options, vuesEnPlus: vues });
console.log(`Villes des listes : ${p.villes.join(', ')}`);
console.log(`Villes des agents : ${options.length} en option, vues pour ${vues.join(', ')}`);
if (!p.objet) { console.log('(le reste se fera une fois l’objet créé)'); process.exit(0); }

// 5. Les lignes.
const r = await synchroniser({ go, journal: console.log, agents });
dire(`lignes : ${r.nouvelles} nouvelle(s), ${r.agences_agents} née(s) des agents, ${r.retrouvees} retrouvée(s), ${r.majs} mise(s) à jour, ${r.inchangees} inchangée(s), ${r.corbeille} à la corbeille de Twenty (pas recréées)`);
dire(`agents : ${agents.length} lus, ${r.agents_lies} rattachés à une agence, ${r.sans_agence} sans entreprise ni domaine`);
process.exit(0);
