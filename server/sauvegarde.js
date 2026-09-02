// La sauvegarde : toute la base dans un fichier, et retour.
//
// Chez un hébergeur sans disque persistant, chaque déploiement efface tout —
// comptes, dossiers, clients, registre. En attendant le disque (la vraie
// réparation), on peut emporter la base : un fichier JSON téléchargé avant de
// déployer, restauré après. La restauration fusionne par identifiant : elle
// n'efface rien, elle ramène.
//
// Les fichiers déposés (documents, photos) ne voyagent pas ici : seul le
// disque persistant les garde.

import db from './db.js';

export function exporterTout() {
  return {
    format: 'klocka-sauvegarde',
    version: 1,
    le: new Date().toISOString(),
    records: db.prepare('SELECT id, entity, data, created_date, updated_date, created_by FROM records').all(),
    conversations: db.prepare('SELECT id, agent_name, metadata, messages, created_date, updated_date, created_by FROM conversations').all(),
    meta: db.prepare('SELECT key, value FROM meta').all(),
  };
}

export function restaurerTout(dump) {
  if (!dump || dump.format !== 'klocka-sauvegarde' || !Array.isArray(dump.records)) {
    throw new Error("Ce fichier n'est pas une sauvegarde Klocka.");
  }
  const poserRecord = db.prepare(
    'INSERT OR REPLACE INTO records (id, entity, data, created_date, updated_date, created_by) VALUES (@id, @entity, @data, @created_date, @updated_date, @created_by)'
  );
  const poserConv = db.prepare(
    'INSERT OR REPLACE INTO conversations (id, agent_name, metadata, messages, created_date, updated_date, created_by) VALUES (@id, @agent_name, @metadata, @messages, @created_date, @updated_date, @created_by)'
  );
  const poserMeta = db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (@key, @value)');
  const tout = db.transaction(() => {
    for (const r of dump.records) poserRecord.run(r);
    for (const c of dump.conversations || []) poserConv.run(c);
    for (const m of dump.meta || []) poserMeta.run(m);
  });
  tout();
  const n = { records: dump.records.length, conversations: (dump.conversations || []).length, meta: (dump.meta || []).length };
  console.log(`[sauvegarde] restauré : ${n.records} enregistrements, ${n.conversations} conversations, ${n.meta} clés`);
  return n;
}
