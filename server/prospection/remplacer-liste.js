// Remplacer la liste d'une ville par une autre (18 nov. 2026, Jules : « remplace la liste Grenoble par Grenoble 2 »).
//
// La nouvelle liste vient d'un fichier (les agences préparées sur le poste : collaborateurs, noms complets, numéros et
// photos des sites, chacune avec sa ligne Twenty) et prend le nom de la ville. Rien du travail fait n'est perdu :
//   - une agence déjà dans l'ancienne liste (même fiche Maps, même téléphone ou même nom) garde son ancienne fiche, donc
//     ses appels, son carnet, ses relances et sa ligne Twenty ; elle reçoit ce que la nouvelle sait de plus
//     (collaborateurs, numéros, photos) ; la ligne Twenty en double de la nouvelle part à la corbeille ;
//   - une ancienne agence déjà travaillée (appelée, au carnet, contact donné, attribuée) reste dans la ville ;
//   - les autres anciennes agences sortent : leur ligne Twenty part à la corbeille (récupérable) ;
//   - l'ancienne liste est archivée, jamais supprimée.

import { Records } from '../db.js';

const LISTE = 'ListeAgences';
const AGENCE = 'AgenceProspect';
const APPEL = 'AppelAgent';

const normTel = (t) => { const d = String(t || '').replace(/\D/g, '').replace(/^33/, '0'); return d.length >= 9 ? d.slice(-9) : null; };
const norm = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const vide = (v) => v == null || v === '' || (Array.isArray(v) && !v.length);

/** Pure : l'ancienne agence qui est la même que la nouvelle (fiche Maps, téléphone, puis nom), ou null. */
export function memeAgence(n, anciennes, cleNom) {
  const t = normTel(n.telephone);
  const k = cleNom(n.nom);
  return (n.place_id && anciennes.find((o) => o.place_id === n.place_id))
    || (t && anciennes.find((o) => normTel(o.telephone) === t))
    || (k && k.length > 2 && anciennes.find((o) => cleNom(o.nom) === k))
    || null;
}

/** Pure : une ancienne agence a-t-elle déjà été travaillée ? */
export function travaillee(a, appelsParAgence = new Set()) {
  return appelsParAgence.has(a.id) || !!a.carnet_id || !!a.prioritaire || (a.pour || []).length > 0 || !!a.au_carnet_le || !!a.reservee || !!a.passee || !!a.morte;
}

/** Pure : ce que l'ancienne fiche reçoit de la nouvelle (cases vides remplies, équipe, numéros et photos réunis). */
export function fusion(o, n) {
  const champs = {};
  for (const [k, v] of Object.entries(n)) {
    if (['id', 'liste_id', 'twenty_agence_id', 'agents', 'sources', 'noms_apollo', 'apollo_equipe', 'photos_equipe', 'cree_le', 'nom'].includes(k)) continue;
    if (vide(o[k]) && !vide(v)) champs[k] = v;
  }
  const agents = [...(o.agents || [])];
  for (const x of n.agents || []) if (x?.nom && !agents.some((y) => String(y.nom).toLowerCase() === String(x.nom).toLowerCase())) agents.push(x);
  champs.agents = agents;
  champs.sources = [...new Set([...(o.sources || []), ...(n.sources || [])])];
  champs.noms_apollo = [...new Set([...(o.noms_apollo || []), ...(n.noms_apollo || [])])];
  if (n.apollo_equipe?.gens?.length) champs.apollo_equipe = n.apollo_equipe;
  if (n.photos_equipe) champs.photos_equipe = { ...(o.photos_equipe || {}), ...n.photos_equipe, par_nom: { ...(o.photos_equipe?.par_nom || {}), ...(n.photos_equipe?.par_nom || {}) } };
  return champs;
}

/**
 * Remplace la liste `ville` par les agences de `donnees` ({ liste, agences }). `T` : l'accès à Twenty (null : rien n'y
 * est touché, pour un essai sur le poste). Rend le bilan.
 */
export async function remplacerListe({ ville, donnees, T = null, journal = console.log } = {}) {
  const { cleAgence } = await import('./agent-ia.js');
  const le = new Date().toISOString();
  // Toutes les listes de la ville (Nice, « Nice · Apollo », « Nice · toutes les agences ») : un agent déjà appelé dans
  // l'une d'elles passe dans la nouvelle, sans doublon ; toutes sont archivées.
  const { communeDeListe } = await import('./liste-par-personnes.js');
  const memeVille = (l) => !l.archivee && !l.essai && l.id !== donnees.liste.id && (l.ville === ville || norm(communeDeListe(l)) === norm(ville));
  const vieilles = Records.list(LISTE).filter(memeVille);
  const ancienne = vieilles.find((l) => l.ville === ville) || vieilles[0] || null;
  const idsVieilles = new Set(vieilles.map((l) => l.id));
  // Celles de la liste au nom de la ville d'abord : entre deux jumelles, c'est elle qu'on garde.
  const anciennes = Records.list(AGENCE, { sort: 'created_date' }).filter((a) => idsVieilles.has(a.liste_id) && !a.hors_cible)
    .sort((a, b) => Number(b.liste_id === ancienne?.id) - Number(a.liste_id === ancienne?.id));
  const appelees = new Set(Records.list(APPEL).filter((x) => x.agence_id && !x.essai_archive).map((x) => x.agence_id));
  for (const l of vieilles) Records.update(LISTE, l.id, { archivee: true, archivee_le: le, ville: `${l.ville} (ancienne, remplacée le ${le.slice(0, 10)})` });
  const nouvelle = Records.create(LISTE, {
    ...(Records.get(LISTE, donnees.liste.id) ? {} : { id: donnees.liste.id }),
    ville, commune: ville, type: 'agences', source: 'personnes', etat: 'fini', lancee_par: 'jules.b@klocka.immo', lancee_le: le, fini_le: le,
    remplace: ancienne?.id || null, journal: donnees.liste.journal || [],
  });
  const bilan = { ville, nouvelles: 0, fondues: 0, gardees_travaillees: 0, sorties: 0, corbeille: 0, erreurs: 0 };
  const jeter = async (id) => { if (!T || !id) return; try { await T.supprimer('agences', id); bilan.corbeille += 1; } catch { bilan.erreurs += 1; } };
  const reprises = new Set();
  for (const n of donnees.agences) {
    const o = memeAgence(n, anciennes.filter((x) => !reprises.has(x.id)), cleAgence);
    if (o) {
      // La ligne Twenty qui reste : celle de l'ancienne si elle a été travaillée (son historique), sinon celle de la
      // nouvelle (18 nov. 2026 : Grenoble remplacé dans Twenty avant le déploiement, les anciennes jamais travaillées
      // y sont déjà à la corbeille).
      const garderVieille = travaillee(o, appelees) || !n.twenty_agence_id;
      Records.update(AGENCE, o.id, { ...fusion(o, n), liste_id: nouvelle.id, ...(garderVieille ? {} : { twenty_agence_id: n.twenty_agence_id }) });
      reprises.add(o.id);
      if (garderVieille && n.twenty_agence_id && n.twenty_agence_id !== o.twenty_agence_id) await jeter(n.twenty_agence_id);
      if (!garderVieille && o.twenty_agence_id && o.twenty_agence_id !== n.twenty_agence_id) await jeter(o.twenty_agence_id);
      bilan.fondues += 1;
      continue;
    }
    if (Records.get(AGENCE, n.id)) { Records.update(AGENCE, n.id, { ...n, liste_id: nouvelle.id }); } else Records.create(AGENCE, { ...n, liste_id: nouvelle.id });
    bilan.nouvelles += 1;
  }
  for (const o of anciennes.filter((x) => !reprises.has(x.id))) {
    if (travaillee(o, appelees)) {
      // La même agence dans deux anciennes listes : une seule ligne ; le carnet et le contact donné passent sur elle.
      const dedans = Records.list(AGENCE).filter((a) => a.liste_id === nouvelle.id);
      const jumelle = memeAgence(o, dedans, cleAgence);
      if (jumelle) {
        const champs = {};
        for (const k of ['carnet_id', 'prioritaire', 'pour', 'au_carnet_le', 'au_carnet_par']) if (vide(jumelle[k]) && !vide(o[k])) champs[k] = o[k];
        Records.update(AGENCE, jumelle.id, champs);
        Records.update(AGENCE, o.id, { hors_cible: true, fusionnee_dans: jumelle.id });
        if (o.twenty_agence_id && o.twenty_agence_id !== jumelle.twenty_agence_id) await jeter(o.twenty_agence_id);
        bilan.doublons = (bilan.doublons || 0) + 1;
        continue;
      }
      Records.update(AGENCE, o.id, { liste_id: nouvelle.id });
      bilan.gardees_travaillees += 1;
      continue;
    }
    await jeter(o.twenty_agence_id);
    bilan.sorties += 1;
  }
  const texte = `Liste remplacée par ${donnees.liste.ville} : ${bilan.nouvelles} agences nouvelles, ${bilan.fondues} déjà connues (fiche, appels et relances gardés, collaborateurs ajoutés), ${bilan.gardees_travaillees} anciennes déjà travaillées gardées, ${bilan.sorties} anciennes sorties (ancienne liste archivée).`;
  Records.update(LISTE, nouvelle.id, { journal: [...(Records.get(LISTE, nouvelle.id).journal || []), { le, texte, ton: 'succes' }] });
  journal(`[liste] ${ville} : ${texte}${T ? ` Twenty : ${bilan.corbeille} ligne(s) à la corbeille, ${bilan.erreurs} refusée(s).` : ''}`);
  return { ...bilan, liste: nouvelle.id, ancienne: ancienne?.id || null, anciennes_listes: vieilles.map((l) => l.ville) };
}

/** Une fois au démarrage du serveur en ligne : la liste préparée sur le poste remplace celle de la ville. */
export async function remplacerUneFois({ ville, fichier, cle, journal = console.log }) {
  const { Meta } = await import('../db.js');
  if (Meta.get(cle)) return { deja: true };
  const fs = await import('node:fs');
  const donnees = JSON.parse(fs.readFileSync(new URL(fichier, import.meta.url), 'utf8'));
  const T = await import('../twenty.js');
  const r = await remplacerListe({ ville, donnees, T, journal });
  // La vue Twenty de la liste préparée n'a plus de lignes : elle s'efface (les lignes, elles, passent dans la ville).
  try {
    // Toutes les pages de vues (18 nov. 2026 : la première page seule avait laissé « Grenoble 2 » en place).
    const vues = [];
    let apres = null;
    for (let i = 0; i < 20; i += 1) {
      const r = await T.requeteTwenty('GET', `/metadata/views?limit=200${apres ? `&starting_after=${apres}` : ''}`);
      vues.push(...(Array.isArray(r?.data) ? r.data : r?.data?.views || []));
      if (!r?.pageInfo?.hasNextPage) break;
      apres = r.pageInfo.endCursor;
    }
    for (const v of vues.filter((x) => x.name === donnees.liste.ville)) await T.requeteTwenty('DELETE', `/metadata/views/${v.id}`);
  } catch (e) { journal(`[liste] vue ${donnees.liste.ville} : ${e?.message || e}`); }
  Meta.set(cle, new Date().toISOString());
  return r;
}

/**
 * Tous les fichiers de server/prospection/donnees (« grenoble-2.json », « nice-2.json »…), l'un après l'autre : chacun
 * remplace la liste de sa ville, une fois (la clé porte la ville). La ville : le champ `ville` du fichier, sinon le nom
 * de la liste préparée sans son « 2 ».
 */
/**
 * Les listes « Ville 2 » restées vivantes à côté de la liste de leur ville (18 nov. 2026 : une « Grenoble 2 » créée en
 * ligne à 12 h 07 par un ancien lancement, encore visible après le remplacement) : archivées, leurs agences avec. Dit au
 * journal ce qu'il a archivé, ou qu'il n'y avait rien.
 */
export function archiverListesEnDouble({ journal = console.log } = {}) {
  const vivantes = Records.list(LISTE).filter((l) => !l.archivee && !l.essai);
  const le = new Date().toISOString();
  const archivees = [];
  for (const l of vivantes) {
    const m = String(l.ville || '').match(/^(.+?)\s+2$/);
    if (!m) continue;
    if (!vivantes.some((x) => x.id !== l.id && norm(x.ville) === norm(m[1]))) continue;
    Records.update(LISTE, l.id, { archivee: true, archivee_le: le, ville: `${l.ville} (en double, archivée le ${le.slice(0, 10)})` });
    archivees.push(l.ville);
  }
  journal(`[liste] listes en double : ${archivees.length ? `archivées ${archivees.join(', ')}` : 'aucune'} ; listes vivantes : ${Records.list(LISTE).filter((l) => !l.archivee && !l.essai).map((l) => l.ville).join(', ')}`);
  return archivees;
}

export async function remplacerToutes({ journal = console.log } = {}) {
  const fs = await import('node:fs');
  const dossier = new URL('./donnees/', import.meta.url);
  const fichiers = fs.existsSync(dossier) ? fs.readdirSync(dossier).filter((f) => f.endsWith('-2.json')).sort((a, b) => Number(b.startsWith('grenoble')) - Number(a.startsWith('grenoble'))) : [];
  try { archiverListesEnDouble({ journal }); } catch (e) { journal(`[liste] listes en double : ${e?.message || e}`); }
  for (const f of fichiers) {
    try {
      const entete = JSON.parse(fs.readFileSync(new URL(f, dossier), 'utf8'));
      const ville = entete.ville || String(entete.liste?.ville || '').replace(/\s+2$/, '').trim();
      if (!ville) continue;
      const cle = `prospection.${norm(ville).replace(/[^a-z0-9]+/g, '-')}.remplacee.2026-11-18`;
      await remplacerUneFois({ ville, fichier: `./donnees/${f}`, cle, journal });
    } catch (e) { journal(`[liste] ${f} : ${e?.message || e}`); }
  }
  try { archiverListesEnDouble({ journal }); } catch (e) { journal(`[liste] listes en double : ${e?.message || e}`); }
}
