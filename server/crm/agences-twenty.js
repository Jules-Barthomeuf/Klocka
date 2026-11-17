// Le tableau « Agences » de Twenty CRM (16 nov. 2026, Jules : « je veux que ce tableau soit sur Twenty, dans un autre
// tableau que tu vas nommer Agences »). Les agences et mandataires des listes de la Prospection, une ligne chacun, une
// vue par ville. Klocka écrit, Twenty montre : c'est là que Jules trie les agences une par une.
//
// Sens unique, Klocka vers Twenty. Une ligne déjà posée garde son id Twenty sur l'agence (`twenty_agence_id`) : rejouer
// met à jour ce que Klocka sait (statut, appels, relance, interlocuteurs) et ne recrée jamais une ligne que l'équipe a
// mise à la corbeille dans Twenty. Ce que Jules change dans Twenty (statut, suppression) ne revient pas encore à Klocka.
//
//   node --env-file=.env scripts/crm/agences-twenty.mjs        (montre ce qui serait fait)
//   node --env-file=.env scripts/crm/agences-twenty.mjs --go   (le fait)

import { Records } from '../db.js';
import { valeurOption, telephone } from './correspondance.js';

export const SINGULIER = 'agence';
export const PLURIEL = 'agences';
const AGENCE = 'AgenceProspect';

/** Les champs de l'objet, dans l'ordre des colonnes. */
export const CHAMPS = [
  { name: 'ville', label: 'Ville', type: 'SELECT', icon: 'IconMapPin' },
  { name: 'genre', label: 'Type', type: 'SELECT', icon: 'IconTag', options: [{ value: 'AGENCE', label: 'Agence', color: 'blue', position: 0 }, { value: 'MANDATAIRE', label: 'Mandataire', color: 'purple', position: 1 }] },
  { name: 'telephone', label: 'Téléphone', type: 'PHONES', icon: 'IconPhone' },
  { name: 'interlocuteurs', label: 'Interlocuteurs', type: 'TEXT', icon: 'IconUsers', description: 'Les personnes de l’agence : nom, fonction, téléphone (pages équipe, appels)' },
  { name: 'statut', label: 'Statut', type: 'TEXT', icon: 'IconProgress', description: 'Où en est l’équipe avec l’agence (Prospection de Klocka)' },
  { name: 'dernierAppel', label: 'Dernier appel', type: 'DATE_TIME', icon: 'IconPhoneCall' },
  { name: 'appelePar', label: 'Appelé par', type: 'TEXT', icon: 'IconUser' },
  { name: 'issue', label: 'Issue', type: 'TEXT', icon: 'IconFlag' },
  { name: 'relance', label: 'Relance', type: 'DATE', icon: 'IconCalendar' },
  { name: 'email', label: 'E-mail', type: 'EMAILS', icon: 'IconMail' },
  { name: 'siteWeb', label: 'Site', type: 'LINKS', icon: 'IconWorld' },
  { name: 'adresse', label: 'Adresse', type: 'TEXT', icon: 'IconMap' },
  { name: 'reseau', label: 'Réseau', type: 'TEXT', icon: 'IconNetwork' },
  { name: 'annonces', label: 'Annonces', type: 'NUMBER', icon: 'IconList' },
  { name: 'annoncesCommerce', label: 'Annonces commerce', type: 'NUMBER', icon: 'IconBuildingStore' },
  { name: 'sources', label: 'Sources', type: 'TEXT', icon: 'IconDatabase' },
  { name: 'klockaId', label: 'Id Klocka', type: 'TEXT', icon: 'IconKey', description: 'L’agence dans Klocka (AgenceProspect), posé par la synchronisation', cache: true },
];

/** Pure : l'option d'une ville. */
export const optionVille = (ville, position = 0) => ({ value: valeurOption(ville), label: ville, color: 'gray', position });

const url = (s) => {
  const t = String(s || '').trim();
  if (!t) return null;
  // Twenty retire la barre finale : on l'écrit comme il la garde, sinon chaque rejeu croit le lien changé.
  return (/^https?:\/\//i.test(t) ? t : `https://${t}`).replace(/\/+$/, '');
};

/** Pure : les interlocuteurs d'une agence en une ligne par personne. */
export function interlocuteurs(a) {
  const vus = new Set();
  const out = [];
  for (const p of [...(a.gerants || []), ...(a.agents || [])]) {
    const nom = String(p?.nom || '').trim();
    if (!nom || vus.has(nom.toLowerCase())) continue;
    vus.add(nom.toLowerCase());
    out.push([nom, p.fonction, p.telephone].filter(Boolean).join(' · '));
  }
  return out.join('\n');
}

/** Pure : la ligne Twenty d'une agence (`l` : sa ligne du tableau Prospection, server/crm/prospection.js). */
export function versTwenty(a, l) {
  const tel = telephone(a.telephone || (a.agents || []).find((x) => x.telephone)?.telephone || '');
  const site = url(a.site);
  return {
    name: l.name || a.nom || 'Sans nom',
    ville: l.ville ? valeurOption(l.ville) : null,
    genre: a.genre === 'mandataire' ? 'MANDATAIRE' : 'AGENCE',
    telephone: tel || { primaryPhoneNumber: '', primaryPhoneCountryCode: '', primaryPhoneCallingCode: '' },
    interlocuteurs: interlocuteurs(a),
    statut: l.statut || '',
    dernierAppel: l.dernierAppel ? new Date(l.dernierAppel).toISOString() : null,
    appelePar: l.appelePar || '',
    issue: l.issue || '',
    relance: l.relance ? String(l.relance).slice(0, 10) : null,
    email: { primaryEmail: String(a.email || '').trim().toLowerCase(), additionalEmails: [] },
    siteWeb: { primaryLinkUrl: site || '', primaryLinkLabel: '', secondaryLinks: [] },
    adresse: [a.adresse, a.code_postal].filter(Boolean).join(' ').trim(),
    reseau: a.reseau_nom || '',
    annonces: Number(a.annonces) || null,
    annoncesCommerce: Number(a.annonces_commerce) || null,
    sources: (a.sources || []).join(', '),
    klockaId: a.id,
  };
}

/** Pure : ce qui change d'une ligne posée (les champs que Klocka tient à jour, l'id et le nom exceptés). */
export function difference(avant, apres) {
  const vide = (x) => x == null || x === '' || (Array.isArray(x) && !x.length);
  const pareil = (x, y) => (vide(x) && vide(y)) || JSON.stringify(x) === JSON.stringify(y);
  const out = {};
  for (const [k, v] of Object.entries(apres)) {
    if (k === 'klockaId' || k === 'name') continue;
    const a = avant?.[k];
    // Un champ composé (téléphone, e-mail, lien) : seules les clés que Klocka écrit comptent.
    const change = v && typeof v === 'object' && !Array.isArray(v)
      ? Object.entries(v).some(([sk, sv]) => !pareil(a?.[sk], sv))
      : !pareil(a, v);
    if (change) out[k] = v;
  }
  return out;
}

/** Les agences de toutes les listes, avec leur ligne du tableau Prospection (statut compris). */
export async function agencesDesListes() {
  const IA = await import('../prospection/agent-ia.js');
  const P = await import('./prospection.js');
  const vues = new Set();
  const out = [];
  for (const liste of IA.listes()) {
    for (const a of IA.liste(liste.id)?.lignes || []) {
      if (a.fermee || vues.has(a.id)) continue;
      vues.add(a.id);
      out.push({ a, l: P.ligne(a, liste.ville), ville: liste.ville });
    }
  }
  return out;
}

/** Pure : la clé d'une agence quand son id Twenty n'est pas connu ici (ville, nom, téléphone). */
export function cleAgence(x) {
  const net = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const tel = String(x?.telephone?.primaryPhoneNumber || '').replace(/\D/g, '').slice(-9);
  return `${net(x?.ville)}|${net(x?.name)}|${tel}`;
}

/**
 * Pose les agences dans Twenty. `go` faux : compte seulement. Rend { nouvelles, majs, inchangees, corbeille, retrouvees }.
 * `T` : les verbes de server/twenty.js (remplacés dans les tests).
 *
 * Une agence sans id Twenty ici retrouve d'abord sa ligne (16 nov. 2026) : par l'id Klocka posé dans Twenty, sinon par
 * sa ville, son nom et son téléphone. La base en ligne et une copie locale écrivent dans le même Twenty sans connaître
 * les ids de l'autre : sans cela, chacune recréerait les lignes de l'autre. Une ligne retrouvée dans la corbeille de
 * Twenty n'est pas recréée.
 */
export async function synchroniser({ go = false, T = null, journal = () => {} } = {}) {
  T = T || (await import('../twenty.js'));
  const toutes = await agencesDesListes();
  const vivantes = await T.lister(PLURIEL);
  const posees = new Map(vivantes.map((x) => [x.id, x]));
  // La corbeille : seules les lignes vraiment jetées (deletedAt posé), au cas où Twenty ignorerait le filtre.
  const jetees = (await T.lister(PLURIEL, { filtre: 'deletedAt[is]:NOT_NULL' }).catch(() => [])).filter((x) => x.deletedAt);
  const jeteesIds = new Set(jetees.map((x) => x.id));
  const parKlockaId = new Map();
  const parCle = new Map();
  for (const x of [...jetees, ...vivantes]) {
    if (x.klockaId) parKlockaId.set(x.klockaId, x);
    parCle.set(cleAgence(x), x);
  }
  const res = { nouvelles: 0, majs: 0, inchangees: 0, corbeille: 0, retrouvees: 0 };
  const nouvelles = [];
  for (const x of toutes) {
    let id = x.a.twenty_agence_id;
    if (!id) {
      const trouvee = parKlockaId.get(x.a.id) || parCle.get(cleAgence(versTwenty(x.a, x.l)));
      if (!trouvee) { nouvelles.push(x); continue; }
      id = trouvee.id;
      res.retrouvees++;
      if (go) Records.update(AGENCE, x.a.id, { twenty_agence_id: id });
    }
    const avant = posees.get(id);
    if (!avant || jeteesIds.has(id)) { res.corbeille++; continue; }
    const diff = difference(avant, versTwenty(x.a, x.l));
    if (!Object.keys(diff).length) { res.inchangees++; continue; }
    res.majs++;
    if (go) await T.modifier(PLURIEL, avant.id, diff);
  }
  res.nouvelles = nouvelles.length;
  if (go && nouvelles.length) {
    for (let i = 0; i < nouvelles.length; i += T.LOT_MAX) {
      const lot = nouvelles.slice(i, i + T.LOT_MAX);
      const crees = await T.creerEnLot(PLURIEL, lot.map((x) => versTwenty(x.a, x.l)));
      const parKlocka = new Map(crees.map((c) => [c.klockaId, c.id]));
      for (const x of lot) {
        const id = parKlocka.get(x.a.id);
        if (id) Records.update(AGENCE, x.a.id, { twenty_agence_id: id });
      }
      journal(`  ${Math.min(i + T.LOT_MAX, nouvelles.length)} / ${nouvelles.length} posées`);
    }
  }
  return res;
}

/** Les villes des listes de la Prospection (les listes d'essai exceptées). */
export async function villesDesListes() {
  const IA = await import('../prospection/agent-ia.js');
  return [...new Set(IA.listes().map((l) => l.ville).filter((v) => v && v !== 'Essai'))];
}

/**
 * La structure du tableau dans Twenty : l'objet et ses champs (une option de Ville par ville des listes), fermé au rôle
 * Mandataire K Partners, rangé dans le dossier Klocka, les colonnes de la vue principale et une vue par ville.
 * Rejouable : seul ce qui manque est fait. `go` faux : dit seulement ce qui serait fait.
 */
export async function preparer({ go = false, dire = () => {}, creerObjetSiAbsent = true } = {}) {
  const { objetsTwenty, creerObjet, creerChamp, modifierChamp, requeteTwenty } = await import('../twenty.js');
  const { lireRoles, lireMenu, rangerAussiDans, gql } = await import('./acces.js');
  const villes = await villesDesListes();

  // 1. L'objet et ses champs.
  let objet = (await objetsTwenty()).find((o) => o.nameSingular === SINGULIER);
  if (!objet) {
    if (!creerObjetSiAbsent) return { objet: false, villes };
    dire('+ objet Agences');
    if (!go) return { objet: false, villes };
    await creerObjet({ nameSingular: SINGULIER, namePlural: PLURIEL, labelSingular: 'Agence', labelPlural: 'Agences', icon: 'IconBuildingStore', description: 'Les agences et mandataires des listes de la Prospection Klocka, une vue par ville (server/crm/agences-twenty.js)' });
    objet = (await objetsTwenty()).find((o) => o.nameSingular === SINGULIER);
  }
  for (const c of CHAMPS) {
    const deja = (objet.fields || []).find((f) => f.name === c.name);
    const options = c.name === 'ville' ? villes.map((v, i) => optionVille(v, i)) : c.options;
    if (deja) {
      const manquantes = (options || []).filter((o) => !(deja.options || []).some((x) => x.value === o.value));
      if (manquantes.length) {
        dire(`+ ${c.label} : ${manquantes.map((o) => o.label).join(', ')}`);
        if (go) await modifierChamp(deja.id, { options: [...deja.options, ...manquantes.map((o, i) => ({ ...o, position: deja.options.length + i }))] });
      }
      continue;
    }
    dire(`+ champ ${c.label} (${c.type})`);
    if (go) await creerChamp({ objectMetadataId: objet.id, name: c.name, label: c.label, type: c.type, icon: c.icon, description: c.description, ...(options ? { options } : {}) });
  }
  objet = (await objetsTwenty()).find((o) => o.nameSingular === SINGULIER);
  const champ = (nom) => (objet.fields || []).find((f) => f.name === nom);

  // 2. Fermé aux mandataires (la liste complète du rôle est renvoyée, la ligne d'Agences comprise).
  const mandataire = (await lireRoles()).find((r) => r.label === 'Mandataire K Partners');
  const ferme = { canReadObjectRecords: false, canUpdateObjectRecords: false, canSoftDeleteObjectRecords: false, canDestroyObjectRecords: false };
  if (mandataire && (mandataire.objectPermissions || []).find((p) => p.objectMetadataId === objet.id)?.canReadObjectRecords !== false) {
    dire('Agences fermé au rôle Mandataire K Partners');
    if (go) {
      const liste = (mandataire.objectPermissions || []).filter((p) => p.objectMetadataId !== objet.id)
        .map(({ objectMetadataId, canReadObjectRecords, canUpdateObjectRecords, canSoftDeleteObjectRecords, canDestroyObjectRecords }) => ({ objectMetadataId, canReadObjectRecords, canUpdateObjectRecords, canSoftDeleteObjectRecords, canDestroyObjectRecords }));
      await gql('mutation($i: UpsertObjectPermissionsInput!) { upsertObjectPermissions(upsertObjectPermissionsInput: $i) { objectMetadataId } }', { i: { roleId: mandataire.id, objectPermissions: [...liste, { objectMetadataId: objet.id, ...ferme }] } });
    }
  }

  // 3. Dans le dossier Klocka de la barre de gauche.
  const menu = await lireMenu();
  const dossier = menu.filter((x) => x.type === 'FOLDER' && !x.userWorkspaceId).find((d) => /klocka/i.test(d.name || '') && !/partners/i.test(d.name || ''));
  // Twenty pose un objet neuf hors dossier, en bas de la barre : on l'y range plutôt que d'en ajouter une seconde entrée.
  const entree = menu.find((x) => x.type === 'OBJECT' && !x.userWorkspaceId && x.targetObjectMetadataId === objet.id);
  if (!dossier) dire('! dossier Klocka introuvable dans la barre de Twenty');
  else if (!entree) {
    dire(`Agences rangé dans le dossier « ${dossier.name} »`);
    if (go) await rangerAussiDans(objet.id, dossier.id);
  } else if (entree.folderId !== dossier.id) {
    dire(`Agences déplacé dans le dossier « ${dossier.name} »`);
    const position = Math.max(-1, ...menu.filter((x) => x.folderId === dossier.id).map((x) => x.position)) + 1;
    if (go) await gql('mutation($i: UpdateOneNavigationMenuItemInput!) { updateNavigationMenuItem(input: $i) { id } }', { i: { id: entree.id, update: { folderId: dossier.id, position } } });
  }

  // 4. Les vues : les colonnes de la principale, puis une vue par ville (filtre Ville, tri par nom).
  const lignesDe = (r, cle) => (Array.isArray(r?.data) ? r.data : r?.data?.[cle] || []);
  async function tout(chemin, cle) {
    const out = [];
    let apres = null;
    for (let i = 0; i < 200; i++) {
      const r = await requeteTwenty('GET', `${chemin}?limit=200${apres ? `&starting_after=${apres}` : ''}`);
      out.push(...lignesDe(r, cle));
      if (!r?.pageInfo?.hasNextPage) break;
      apres = r.pageInfo.endCursor;
    }
    return out;
  }
  const meta = (m, c, corps) => requeteTwenty(m, `/metadata/${c}`, corps);
  const idCree = (r) => r?.id || r?.data?.id || Object.values(r?.data || {})[0]?.id;
  const COLONNES = ['name', ...CHAMPS.filter((c) => !c.cache).map((c) => c.name)];
  const CACHES = new Set(['klockaId', 'createdAt', 'updatedAt', 'createdBy', 'updatedBy']);
  async function colonnes(vueId, existants) {
    for (const f of objet.fields || []) {
      if (f.isSystem && f.name !== 'name' && !CACHES.has(f.name)) continue;
      const pos = COLONNES.indexOf(f.name);
      const vf = existants.find((x) => x.fieldMetadataId === f.id);
      const isVisible = pos >= 0;
      if (vf) {
        if (vf.isVisible !== isVisible || (isVisible && vf.position !== pos)) await meta('PATCH', `viewFields/${vf.id}`, { isVisible, position: isVisible ? pos : vf.position });
      } else if (isVisible) await meta('POST', 'viewFields', { viewId: vueId, fieldMetadataId: f.id, isVisible: true, position: pos, size: f.name === 'interlocuteurs' ? 280 : 180 });
    }
  }
  const vues = (await tout('/metadata/views', 'views')).filter((v) => v.objectMetadataId === objet.id);
  const principale = vues.find((v) => v.key === 'INDEX');
  if (principale && go) await colonnes(principale.id, (await tout('/metadata/viewFields', 'viewFields')).filter((x) => x.viewId === principale.id));
  const nouvellesVues = [];
  for (const [i, ville] of villes.entries()) {
    if (vues.some((v) => v.name === ville)) continue;
    dire(`+ vue ${ville}`);
    nouvellesVues.push(ville);
    if (!go) continue;
    const vueId = idCree(await meta('POST', 'views', { name: ville, objectMetadataId: objet.id, type: 'TABLE', icon: 'IconMapPin', visibility: 'WORKSPACE', position: i + 1 }));
    await colonnes(vueId, []);
    await meta('POST', 'viewFilters', { viewId: vueId, fieldMetadataId: champ('ville').id, operand: 'IS', value: JSON.stringify([valeurOption(ville)]) });
    await meta('POST', 'viewSorts', { viewId: vueId, fieldMetadataId: champ('name').id, direction: 'ASC' });
  }
  return { objet: true, villes, nouvellesVues };
}

/**
 * L'entretien du tableau par le serveur (16 nov. 2026, Jules : « il n'y a que Nice et Rennes alors qu'on en a fait
 * beaucoup plus ») : les listes vivent dans la base de chaque serveur ; seul le serveur en ligne les connaît toutes.
 * Il pose les villes nouvelles et leurs agences. L'objet n'est jamais créé ici (le script s'en charge).
 */
let entretienEnCours = false;
export async function entretenir() {
  if (entretienEnCours) return null;
  entretienEnCours = true;
  try {
    const p = await preparer({ go: true, creerObjetSiAbsent: false });
    if (!p.objet) return null;
    const r = await synchroniser({ go: true });
    if (p.nouvellesVues.length || r.nouvelles || r.majs || r.retrouvees) console.log(`[agences] Twenty : ${p.nouvellesVues.length} vue(s) de ville, ${r.nouvelles} nouvelle(s), ${r.retrouvees} retrouvée(s), ${r.majs} mise(s) à jour`);
    return r;
  } finally {
    entretienEnCours = false;
  }
}
