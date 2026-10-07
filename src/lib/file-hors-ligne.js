// Les envois du mode appel qui n'ont pas trouvé le réseau (spec du 7 oct.
// 2026) : l'issue et son enregistrement, ou une validation, gardés dans le
// téléphone (IndexedDB, qui sait garder un fichier audio) jusqu'à ce que le
// serveur confirme. Une validation porte son identifiant unique : la rejouer
// ne fait rien deux fois.

const BASE = "klocka-hors-ligne";
const MAGASIN = "envois";

function ouvrir() {
  return new Promise((ok, ko) => {
    if (typeof indexedDB === "undefined") { ko(new Error("Stockage indisponible")); return; }
    const r = indexedDB.open(BASE, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(MAGASIN, { keyPath: "id" });
    r.onsuccess = () => ok(r.result);
    r.onerror = () => ko(r.error);
  });
}

async function magasin(mode, faire) {
  const db = await ouvrir();
  return new Promise((ok, ko) => {
    const tx = db.transaction(MAGASIN, mode);
    const req = faire(tx.objectStore(MAGASIN));
    tx.oncomplete = () => { ok(req?.result); db.close(); };
    tx.onerror = () => { ko(tx.error); db.close(); };
  });
}

/** Garde un envoi : { id, genre: 'issue' | 'valider', url, champs, audio? }. */
export const garder = (envoi) => magasin("readwrite", (m) => m.put({ cree_le: new Date().toISOString(), ...envoi }));
export const enAttente = async () => { try { return (await magasin("readonly", (m) => m.getAll())) || []; } catch { return []; } };
export const retirer = (id) => magasin("readwrite", (m) => m.delete(id));

/** Pure : l'erreur vient-elle du réseau (et non d'un refus du serveur) ? */
export const erreurReseau = (e) => (typeof navigator !== "undefined" && navigator.onLine === false) || e instanceof TypeError || /failed to fetch|network|load failed/i.test(String(e?.message || ""));
