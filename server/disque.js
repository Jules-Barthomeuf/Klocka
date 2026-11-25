// Ce qui remplit le disque (24 nov. 2026, Jules : « ça me met database or disk is full » ; « qu'est-ce qui remplit le
// disque ? ») : la place libre du disque des données et la taille de chaque dossier qu'il porte (la base, les pièces
// déposées et leurs sous-dossiers, les caches), du plus lourd au plus léger. Lu sans rien écrire : au démarrage puis
// toutes les six heures dans le journal (« [disque] … », lisible par l'API de Render), et pour l'équipe par
// /api/monitoring/disque.

import fs from 'fs';
import path from 'path';

const Mo = (o) => Math.round(o / 1048576);

/** La taille d'un fichier ou d'un dossier, en octets, et son nombre de fichiers ; un fichier illisible compte pour rien. */
async function taille(chemin) {
  let octets = 0; let fichiers = 0;
  const pile = [chemin];
  while (pile.length) {
    const c = pile.pop();
    let st;
    try { st = await fs.promises.lstat(c); } catch { continue; }
    if (st.isDirectory()) {
      let noms = [];
      try { noms = await fs.promises.readdir(c); } catch { continue; }
      for (const n of noms) pile.push(path.join(c, n));
    } else if (st.isFile()) { octets += st.size; fichiers += 1; }
  }
  return { octets, fichiers };
}

/**
 * Les dossiers de `racines` (chacun avec ses enfants directs), du plus lourd au plus léger, et la place du disque.
 * @returns {Promise<{ disque: { total_mo, libre_mo } | null, lignes: { chemin, mo, fichiers }[] }>}
 */
export async function mesurerDisque(racines = []) {
  const lignes = [];
  const vus = new Set();
  for (const r of racines.filter(Boolean)) {
    let noms = [];
    try { noms = await fs.promises.readdir(r); } catch { continue; }
    for (const n of noms) {
      const c = path.join(r, n);
      if (vus.has(c)) continue;
      vus.add(c);
      const t = await taille(c);
      lignes.push({ chemin: c, mo: Mo(t.octets), fichiers: t.fichiers });
    }
  }
  let disque = null;
  try {
    const s = fs.statfsSync(racines.find(Boolean));
    disque = { total_mo: Mo(s.blocks * s.bsize), libre_mo: Mo(s.bavail * s.bsize) };
  } catch { /* statfs absent */ }
  return { disque, lignes: lignes.sort((a, b) => b.mo - a.mo) };
}

/** Une ligne de journal : la place libre, puis les quinze plus gros dossiers. */
export function ligneDuDisque({ disque, lignes }) {
  const tete = disque ? `${disque.libre_mo} Mo libres sur ${disque.total_mo} Mo` : 'place inconnue';
  return `[disque] ${tete} · ${lignes.slice(0, 15).map((l) => `${l.chemin} ${l.mo} Mo (${l.fichiers})`).join(' · ')}`;
}
