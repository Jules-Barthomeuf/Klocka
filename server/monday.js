// Passerelle vers Monday.
//
// Répartition des rôles, volontaire : Klocka est l'atelier d'analyse, Monday la
// mémoire commerciale. On ne duplique donc pas le pipeline — deux sources de
// vérité sur les mêmes dossiers divergeraient au premier oubli, et l'équipe
// finirait par ne croire ni l'une ni l'autre.
//
// Deux sens, chacun sur ce que l'autre sait le mieux :
//
//   Klocka → Monday : un bien pré-analysé puis écarté quitte l'atelier et entre
//     dans la mémoire, avec ses chiffres et le motif du refus.
//
//   Monday → Klocka : les investisseurs et les agents restent tenus dans Monday.
//     Klocka les lit. Seule exception, la prospection (server/prospection/) :
//     elle écrit dans « Prospection Agent Immo » les agents à appeler, leur
//     statut après un appel et leur prochaine relance, et fait passer dans
//     « Agent immobilier » celui qui nous envoie sa première fiche.
//
// L'API Monday est un unique point GraphQL. Une intégration absente n'est jamais
// bloquante : sans jeton, chaque fonction le dit et rend la main.

import * as Twenty from './crm/monday-sur-twenty.js';

// Le CRM de Klocka est Twenty depuis le 27 oct. 2026 : avec CRM=twenty, chaque verbe ci-dessous passe par
// server/crm/monday-sur-twenty.js (mêmes appels, mêmes ids de tableaux et de colonnes). L'annuaire des personnes
// reste lu dans Monday pendant la bascule. CRM=monday (par défaut) : rien ne change.
export const crmTwenty = () => String(process.env.CRM || '').trim().toLowerCase() === 'twenty';

// CRM=double (28 oct. 2026, Jules) : Monday reste le CRM de Klocka, exactement comme avant la bascule (lectures, ids,
// liens), et chaque écriture réussie dans Monday est recopiée dans Twenty, dans l'ordre, sans faire attendre ni
// échouer l'appelant (un échec de copie est journalisé « [crm] copie Twenty »). Une fiche née dans Twenty pendant la
// bascule (id Twenty gardé localement) retrouve sa jumelle Monday par le champ mondayId.
export const crmDouble = () => ['double', 'monday+twenty'].includes(String(process.env.CRM || '').trim().toLowerCase());

let copieForcee = false;
/** Pour les tests : la copie tourne aussi sous NODE_TEST_CONTEXT, sur l'API Twenty que les tests branchent. */
export function copieTwentyPourTests(oui = true) {
  if (process.env.NODE_TEST_CONTEXT) copieForcee = oui;
}
const copieActive = () => crmDouble() && (copieForcee || (!process.env.NODE_TEST_CONTEXT && Twenty.mondayConfigure()));
let fileCopie = Promise.resolve();
function copierDansTwenty(quoi, boardId, faire) {
  if (!copieActive()) return;
  if (boardId && !Twenty.tableauMigre(boardId)) return; // tableau non migré (ex. tableaux « plateforme »)
  fileCopie = fileCopie.then(faire).catch((e) => console.error(`[crm] copie Twenty (${quoi}) :`, e?.message || e));
}
/** Attendre les copies en cours (scripts, tests). */
export const copiesTwenty = () => fileCopie;
/** La même file, pour la synchronisation des deux CRM (server/crm/synchro.js) : tout s'applique dans l'ordre. */
export function enFileCrm(quoi, faire) {
  fileCopie = fileCopie.then(faire).catch((e) => console.error(`[crm] ${quoi} :`, e?.message || e));
  return fileCopie;
}
// Ce que Klocka vient d'écrire dans Monday (id d'élément → instant ; ids des commentaires) : le webhook Monday qui
// en revient attend la fin de la copie, et un commentaire déjà recopié n'est pas recopié deux fois.
export const ecrituresRecentes = new Map();
export const commentairesKlocka = new Set();
const noterEcriture = (id) => {
  if (!id) return;
  ecrituresRecentes.set(String(id), Date.now());
  if (ecrituresRecentes.size > 2000) ecrituresRecentes.delete(ecrituresRecentes.keys().next().value);
};

// Un id Twenty (fiche née pendant la bascule) devient l'id Monday de sa jumelle ; null : pas de jumelle Monday.
async function idPourMonday(itemId) {
  if (!crmDouble() || !Twenty.estIdTwenty(itemId)) return String(itemId);
  return Twenty.mondayIdDe(itemId);
}

const API = 'https://api.monday.com/v2';
const VERSION = process.env.MONDAY_API_VERSION || '2024-10';

const TOKEN = (process.env.MONDAY_TOKEN || '').trim();
export const mondayConfigure = () => (crmTwenty() ? Twenty.mondayConfigure() : !!TOKEN);

// Tableaux visés, par identifiant (lus dans l'URL d'un tableau Monday).
export const TABLEAUX = {
  // « Propriétés » : c'est là que vivent les biens reçus, du premier examen à
  // l'archivage. MONDAY_BOARD_ECARTES est l'ancien nom, encore accepté.
  proprietes: (process.env.MONDAY_BOARD_PROPRIETES || process.env.MONDAY_BOARD_ECARTES || '').trim(),
  investisseurs: (process.env.MONDAY_BOARD_INVESTISSEURS || '').trim(),
  // « Prospects » : ceux qu'on n'a pas encore signés. Un client n'y naît pas,
  // il en sort — le mandat signé fait passer la fiche de l'un à l'autre.
  prospects: (process.env.MONDAY_BOARD_PROSPECTS || '').trim(),
  agents: (process.env.MONDAY_BOARD_AGENTS || '').trim(),
};

async function graphql(query, variables = {}) {
  if (!TOKEN) throw new Error('Monday non configuré : renseignez MONDAY_TOKEN.');
  const resp = await fetch(API, {
    method: 'POST',
    headers: {
      Authorization: TOKEN,
      'Content-Type': 'application/json',
      'API-Version': VERSION,
    },
    body: JSON.stringify({ query, variables }),
    // Sans plafond, une réponse qui ne vient jamais tient la requête ouverte.
    signal: AbortSignal.timeout(60_000),
  });
  const data = await resp.json().catch(() => ({}));
  // Monday répond 200 avec un tableau d'erreurs : le statut ne suffit pas.
  if (!resp.ok || data.errors?.length) {
    const message = data.errors?.[0]?.message || data.error_message || `Monday a répondu ${resp.status}`;
    throw new Error(message);
  }
  return data.data;
}

/** Une requête GraphQL brute (les webhooks du Layer, server/layer-sources.js). */
export const requeteMonday = (query, variables = {}) => {
  if (crmTwenty()) return Promise.reject(new Error('Monday est figé (CRM=twenty) : requête brute refusée'));
  return graphql(query, variables);
};

// Les utilisateurs du compte Monday, pour retrouver qui a fait l'action. Lus
// une fois, gardés dix minutes : une équipe ne change pas entre deux poses.
let utilisateursCache = { le: 0, liste: [] };
export const utilisateursMondayDirect = () => utilisateursMonday();
export async function utilisateursMonday() {
  if (Date.now() - utilisateursCache.le < 10 * 60 * 1000 && utilisateursCache.liste.length) return utilisateursCache.liste;
  const data = await graphql(`query { users (limit: 200) { id name email enabled } }`);
  utilisateursCache = { le: Date.now(), liste: (data.users || []).filter((u) => u.enabled !== false) };
  return utilisateursCache.liste;
}

const sansAccents = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

/**
 * La personne Monday qui correspond à un utilisateur Klocka : par adresse
 * d'abord, par nom complet à défaut. Null si personne ne correspond — on ne
 * devine pas un collègue.
 */
export async function personneMonday({ email, nom } = {}) {
  const liste = await utilisateursMonday();
  const e = sansAccents(email);
  const n = sansAccents(nom);
  const parEmail = e && liste.find((u) => sansAccents(u.email) === e);
  if (parEmail) return parEmail;
  const parNom = n && liste.find((u) => sansAccents(u.name) === n);
  return parNom || null;
}

/** Les identifiants des personnes déjà posées sur un élément. */
export async function personnesDe(itemId, colonne) {
  if (crmTwenty()) return [];
  if (!itemId) return [];
  const data = await graphql(
    `query ($ids: [ID!], $cols: [String!]) { items (ids: $ids) { column_values (ids: $cols) { value } } }`,
    { ids: [String(itemId)], cols: [colonne] }
  );
  const brut = data.items?.[0]?.column_values?.[0]?.value;
  if (!brut) return [];
  try {
    return (JSON.parse(brut).personsAndTeams || []).filter((p) => p.kind === 'person').map((p) => Number(p.id));
  } catch {
    return [];
  }
}

/**
 * Les tableaux accessibles et leurs colonnes.
 * Sert à repérer les identifiants à mettre dans .env : sans eux, impossible
 * d'écrire une valeur, chaque colonne étant adressée par son id.
 */
export async function listerTableaux() {
  if (crmTwenty()) return Twenty.listerTableaux();
  const d = await graphql(`
    query {
      boards(limit: 50, state: active) {
        id
        name
        columns { id title type }
        groups { id title }
      }
    }
  `);
  return d?.boards || [];
}

/** Les colonnes d'un tableau, avec leurs réglages (libellés des listes fermées). */
export async function colonnesDuTableau(boardId) {
  if (crmTwenty()) return Twenty.colonnesDuTableau(boardId);
  const d = await graphql(
    `query ($board: ID!) { boards(ids: [$board]) { columns { id title type settings_str } } }`,
    { board: String(boardId) }
  );
  return d?.boards?.[0]?.columns || [];
}

/** Recherche un élément par le contenu d'une colonne. */
async function chercherElement(boardId, colonne, valeur) {
  const d = await graphql(
    `query ($board: ID!, $col: String!, $val: String!) {
      items_page_by_column_values(
        board_id: $board, limit: 1,
        columns: [{ column_id: $col, column_values: [$val] }]
      ) { items { id name } }
    }`,
    { board: String(boardId), col: colonne, val: String(valeur) }
  );
  return d?.items_page_by_column_values?.items?.[0] || null;
}

/**
 * Crée un élément avec ses valeurs de colonnes. `labels` : un statut ou une
 * liste déroulante dont le libellé n'existe pas encore le crée (Monday demande
 * alors le droit de modifier la structure du tableau).
 */
export async function creerElement(boardId, nom, colonnes = {}, { labels = false, twentyId = null, sansCopie = false } = {}) {
  if (crmTwenty()) return Twenty.creerElement(boardId, nom, colonnes);
  const d = await graphql(
    `mutation ($board: ID!, $nom: String!, $valeurs: JSON, $labels: Boolean) {
      create_item(board_id: $board, item_name: $nom, column_values: $valeurs, create_labels_if_missing: $labels) { id name }
    }`,
    { board: String(boardId), nom, valeurs: JSON.stringify(colonnes), labels: !!labels }
  );
  const cree = d?.create_item || null;
  noterEcriture(cree?.id);
  if (cree?.id && !sansCopie) copierDansTwenty('création', boardId, () => Twenty.copierCreation(boardId, cree.id, nom, colonnes, { twentyId }));
  return cree;
}

/** Met à jour les colonnes d'un élément existant. `labels` : comme creerElement. */
export async function majElement(boardId, itemId, colonnes = {}, { labels = false, sansCopie = false } = {}) {
  if (crmTwenty()) return Twenty.majElement(boardId, itemId, colonnes);
  const idMonday = await idPourMonday(itemId);
  if (!idMonday) throw new Error(`Élément ${itemId} absent de Monday (not found) : né dans Twenty pendant la bascule`);
  const d = await graphql(
    `mutation ($board: ID!, $item: ID!, $valeurs: JSON!, $labels: Boolean) {
      change_multiple_column_values(board_id: $board, item_id: $item, column_values: $valeurs, create_labels_if_missing: $labels) { id }
    }`,
    { board: String(boardId), item: idMonday, valeurs: JSON.stringify(colonnes), labels: !!labels }
  );
  noterEcriture(idMonday);
  if (!sansCopie) copierDansTwenty('mise à jour', boardId, () => Twenty.copierMaj(boardId, itemId, colonnes, async () => (await lireElement(idMonday))?.nom ?? null));
  return d?.change_multiple_column_values || null;
}

/** Ajoute un commentaire sur un élément — le journal, pas les colonnes. */
export async function commenter(itemId, texte, { sansCopie = false } = {}) {
  if (crmTwenty()) return Twenty.commenter(itemId, texte);
  const idMonday = await idPourMonday(itemId);
  const d = idMonday
    ? await graphql(`mutation ($item: ID!, $texte: String!) { create_update(item_id: $item, body: $texte) { id } }`, { item: idMonday, texte })
    : null;
  noterEcriture(idMonday);
  if (d?.create_update?.id) commentairesKlocka.add(String(d.create_update.id));
  if (!sansCopie) copierDansTwenty('commentaire', null, () => Twenty.commenter(itemId, texte));
  return d || (crmDouble() ? { create_update: null } : d);
}

/**
 * Les éléments d'un tableau, avec leurs valeurs lisibles.
 *
 * Paginé : Monday rend 500 éléments au maximum par appel et livre un curseur
 * pour la suite. Sans cette boucle, un tableau de plus de 300 lignes cachait ses
 * entrées les plus récentes — une fiche créée à l'instant restait introuvable.
 */
export async function lireTableau(boardId, limite = 2000) {
  if (crmTwenty()) return Twenty.lireTableau(boardId, limite);
  const lignes = [];
  let curseur = null;

  while (lignes.length < limite) {
    const parPage = Math.min(500, limite - lignes.length);
    const d = curseur
      ? await graphql(
          `query ($curseur: String!, $limite: Int!) {
            next_items_page(cursor: $curseur, limit: $limite) {
              cursor
              items { id name created_at column_values { id text type } }
            }
          }`,
          { curseur, limite: parPage }
        )
      : await graphql(
          `query ($board: ID!, $limite: Int!) {
            boards(ids: [$board]) {
              items_page(limit: $limite) {
                cursor
                items { id name created_at column_values { id text type } }
              }
            }
          }`,
          { board: String(boardId), limite: parPage }
        );

    const page = curseur ? d?.next_items_page : d?.boards?.[0]?.items_page;
    const items = page?.items || [];
    // Une ligne plate, plus simple à exploiter côté appelant.
    for (const it of items) {
      lignes.push({
        id: it.id,
        nom: it.name,
        cree_le: it.created_at || null,
        colonnes: Object.fromEntries((it.column_values || []).map((c) => [c.id, c.text])),
      });
    }
    curseur = page?.cursor || null;
    if (!curseur || !items.length) break;
  }

  return lignes;
}

/**
 * Un élément relu tel que Monday le garde, avec ses valeurs lisibles : ce qui
 * permet de confirmer ce qui a réellement été écrit, pas ce qui a été demandé.
 * Null s'il n'existe pas (ou plus).
 */
export async function lireElement(itemId) {
  if (crmTwenty()) return Twenty.lireElement(itemId);
  if (crmDouble() && Twenty.estIdTwenty(itemId)) {
    const m = await idPourMonday(itemId);
    if (!m) return Twenty.lireElement(itemId);
    itemId = m;
  }
  const d = await graphql(
    `query ($ids: [ID!]) { items(ids: $ids) { id name state board { id } column_values { id text } } }`,
    { ids: [String(itemId)] }
  );
  const it = d?.items?.[0];
  if (!it || it.state === 'deleted') return null;
  return { id: String(it.id), nom: it.name, tableau: it.board?.id ? String(it.board.id) : null, colonnes: Object.fromEntries((it.column_values || []).map((c) => [c.id, c.text])) };
}

/**
 * Une fiche lue pour être racontée : chaque colonne sous son titre (les vides
 * écartées) et les dernières notes du fil, plus récentes d'abord. Null si
 * l'élément n'existe pas (ou plus).
 */
export async function lireFiche(itemId, { notes = 5 } = {}) {
  if (crmTwenty()) return Twenty.lireFiche(itemId, { notes });
  if (crmDouble() && Twenty.estIdTwenty(itemId)) {
    const m = await idPourMonday(itemId);
    if (!m) return Twenty.lireFiche(itemId, { notes });
    itemId = m;
  }
  const d = await graphql(
    `query ($ids: [ID!], $notes: Int!) { items(ids: $ids) { id name state created_at board { id name } group { title }
      column_values { text column { title } }
      updates(limit: $notes) { text_body created_at creator { name } } } }`,
    { ids: [String(itemId)], notes }
  );
  const it = d?.items?.[0];
  if (!it || it.state === 'deleted') return null;
  return {
    id: String(it.id), nom: it.name, cree_le: it.created_at || null,
    tableau: it.board?.name || null, groupe: it.group?.title || null,
    colonnes: Object.fromEntries((it.column_values || []).filter((c) => String(c.text || '').trim()).map((c) => [c.column?.title || '?', c.text])),
    notes: (it.updates || []).map((u) => ({ le: u.created_at, par: u.creator?.name || null, texte: String(u.text_body || '').slice(0, 2000) })),
    lien: it.board?.id ? lienMonday(it.board.id, it.id) : null,
  };
}

/** Supprime un élément. Réservé au nettoyage de ce qu'on a soi-même créé. */
export async function supprimerElement(itemId) {
  if (crmTwenty()) return Twenty.supprimerElement(itemId);
  const idMonday = await idPourMonday(itemId);
  const d = idMonday ? await graphql(`mutation ($item: ID!) { delete_item(item_id: $item) { id } }`, { item: idMonday }) : null;
  copierDansTwenty('suppression', null, () => Twenty.supprimerElement(itemId));
  return d;
}

/**
 * Écrit ou met à jour un élément. Idempotent : rejouer la synchronisation ne
 * crée pas de doublon.
 *
 * Trois façons de retrouver l'existant, dans l'ordre : l'identifiant déjà connu
 * (le plus sûr), puis une colonne clé, puis rien — on crée.
 *
 * @param {string} boardId
 * @param {{ nom, colonnes, itemId?: string, cle?: {colonne, valeur} }} element
 */
export async function poserElement(boardId, { nom, colonnes = {}, itemId = null, cle = null, recreerSiInactif = false }) {
  if (crmTwenty()) return Twenty.poserElement(boardId, { nom, colonnes, itemId, cle });
  if (!boardId) throw new Error('Tableau Monday non configuré');

  if (itemId) {
    try {
      await majElement(boardId, itemId, colonnes);
      return { id: String(itemId), cree: false };
    } catch (e) {
      const message = e?.message || '';
      // Élément supprimé côté Monday : on en recrée un plutôt que d'échouer.
      if (/not found|does not exist|invalid/i.test(message)) {
        /* on retombe sur la création, plus bas */
      } else if (/inactive/i.test(message)) {
        // Archivé chez Monday. Un humain qui pousse veut une fiche vivante :
        // on en recrée une. La veille, elle, ne ressuscite rien toute seule.
        if (!recreerSiInactif) {
          throw new Error(
            'La fiche Monday de ce bien est archivée. Désarchivez-la dans Monday, ou poussez-la à la main pour en créer une nouvelle.'
          );
        }
      } else {
        throw e;
      }
    }
  }

  const existant = cle?.colonne && cle?.valeur ? await chercherElement(boardId, cle.colonne, cle.valeur) : null;
  if (existant) {
    await majElement(boardId, existant.id, colonnes);
    return { id: existant.id, cree: false };
  }
  const twentyId = crmDouble() && Twenty.estIdTwenty(itemId) ? String(itemId) : null;
  const cree = await creerElement(boardId, nom, colonnes, { twentyId });
  return { id: cree?.id, cree: true };
}

/**
 * L'adresse d'un élément dans le CRM : la fiche Twenty pour un id Twenty, sinon la ligne Monday. Le seul endroit où
 * se fabrique ce lien (il était recopié dans une dizaine de fichiers).
 */
export function lienMonday(boardId, itemId) {
  if (!itemId) return null;
  if (crmTwenty() || Twenty.estIdTwenty(itemId)) {
    const l = Twenty.lienElement(boardId, itemId);
    if (l) return l;
  }
  return `https://klocka-company.monday.com/boards/${boardId}/pulses/${itemId}`;
}

// --- Pour la synchronisation des deux CRM (CRM=double, server/crm/synchro.js) ---

/** Un élément tel que Monday le garde : valeurs brutes et lisibles, groupe, état. Null s'il n'existe plus. */
export async function elementBrut(itemId) {
  const d = await graphql(
    `query ($ids: [ID!]) { items(ids: $ids) { id name state created_at board { id } group { id title } column_values { id text value type } } }`,
    { ids: [String(itemId)] }
  );
  return d?.items?.[0] || null;
}

/** Les groupes d'un tableau (id, titre). */
export async function groupesDuTableau(boardId) {
  const d = await graphql(`query ($b: [ID!]) { boards(ids: $b) { groups { id title } } }`, { b: [String(boardId)] });
  return d?.boards?.[0]?.groups || [];
}

export async function deplacerDansGroupe(itemId, groupId) {
  noterEcriture(itemId);
  return graphql(`mutation ($i: ID!, $g: String!) { move_item_to_group(item_id: $i, group_id: $g) { id } }`, { i: String(itemId), g: String(groupId) });
}

/** Archive un élément (récupérable dans Monday), sans le supprimer. */
export async function archiverElement(itemId) {
  noterEcriture(itemId);
  return graphql(`mutation ($i: ID!) { archive_item(item_id: $i) { id } }`, { i: String(itemId) });
}

/** Le commentaire d'un élément (corps texte), pour le recopier. */
export async function commentaire(updateId) {
  const d = await graphql(`query ($ids: [ID!]) { updates(ids: $ids) { id text_body item_id creator { name } } }`, { ids: [String(updateId)] });
  return d?.updates?.[0] || null;
}

/** Crée un webhook Monday sur un tableau. */
export async function creerWebhook(boardId, url, evenement) {
  const d = await graphql(`mutation ($b: ID!, $u: String!, $e: WebhookEventType!) { create_webhook(board_id: $b, url: $u, event: $e) { id } }`, { b: String(boardId), u: url, e: evenement });
  return d?.create_webhook || null;
}

/** Les webhooks d'un tableau. */
export async function webhooksDuTableau(boardId) {
  const d = await graphql(`query ($b: ID!) { webhooks(board_id: $b) { id event config } }`, { b: String(boardId) });
  return d?.webhooks || [];
}
