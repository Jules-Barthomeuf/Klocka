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
//     Klocka les lit, ne les écrit pas.
//
// L'API Monday est un unique point GraphQL. Une intégration absente n'est jamais
// bloquante : sans jeton, chaque fonction le dit et rend la main.

const API = 'https://api.monday.com/v2';
const VERSION = process.env.MONDAY_API_VERSION || '2024-10';

const TOKEN = (process.env.MONDAY_TOKEN || '').trim();
export const mondayConfigure = () => !!TOKEN;

// Tableaux visés, par identifiant (lus dans l'URL d'un tableau Monday).
export const TABLEAUX = {
  // « Propriétés » : c'est là que vivent les biens reçus, du premier examen à
  // l'archivage. MONDAY_BOARD_ECARTES est l'ancien nom, encore accepté.
  proprietes: (process.env.MONDAY_BOARD_PROPRIETES || process.env.MONDAY_BOARD_ECARTES || '').trim(),
  investisseurs: (process.env.MONDAY_BOARD_INVESTISSEURS || '').trim(),
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
  });
  const data = await resp.json().catch(() => ({}));
  // Monday répond 200 avec un tableau d'erreurs : le statut ne suffit pas.
  if (!resp.ok || data.errors?.length) {
    const message = data.errors?.[0]?.message || data.error_message || `Monday a répondu ${resp.status}`;
    throw new Error(message);
  }
  return data.data;
}

/**
 * Les tableaux accessibles et leurs colonnes.
 * Sert à repérer les identifiants à mettre dans .env : sans eux, impossible
 * d'écrire une valeur, chaque colonne étant adressée par son id.
 */
export async function listerTableaux() {
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

/** Crée un élément avec ses valeurs de colonnes. */
async function creerElement(boardId, nom, colonnes = {}) {
  const d = await graphql(
    `mutation ($board: ID!, $nom: String!, $valeurs: JSON) {
      create_item(board_id: $board, item_name: $nom, column_values: $valeurs) { id name }
    }`,
    { board: String(boardId), nom, valeurs: JSON.stringify(colonnes) }
  );
  return d?.create_item || null;
}

/** Met à jour les colonnes d'un élément existant. */
async function majElement(boardId, itemId, colonnes = {}) {
  const d = await graphql(
    `mutation ($board: ID!, $item: ID!, $valeurs: JSON!) {
      change_multiple_column_values(board_id: $board, item_id: $item, column_values: $valeurs) { id }
    }`,
    { board: String(boardId), item: String(itemId), valeurs: JSON.stringify(colonnes) }
  );
  return d?.change_multiple_column_values || null;
}

/** Ajoute un commentaire sur un élément — le journal, pas les colonnes. */
export async function commenter(itemId, texte) {
  return graphql(
    `mutation ($item: ID!, $texte: String!) { create_update(item_id: $item, body: $texte) { id } }`,
    { item: String(itemId), texte }
  );
}

/**
 * Les éléments d'un tableau, avec leurs valeurs lisibles.
 *
 * Paginé : Monday rend 500 éléments au maximum par appel et livre un curseur
 * pour la suite. Sans cette boucle, un tableau de plus de 300 lignes cachait ses
 * entrées les plus récentes — une fiche créée à l'instant restait introuvable.
 */
export async function lireTableau(boardId, limite = 2000) {
  const lignes = [];
  let curseur = null;

  while (lignes.length < limite) {
    const parPage = Math.min(500, limite - lignes.length);
    const d = curseur
      ? await graphql(
          `query ($curseur: String!, $limite: Int!) {
            next_items_page(cursor: $curseur, limit: $limite) {
              cursor
              items { id name column_values { id text type } }
            }
          }`,
          { curseur, limite: parPage }
        )
      : await graphql(
          `query ($board: ID!, $limite: Int!) {
            boards(ids: [$board]) {
              items_page(limit: $limite) {
                cursor
                items { id name column_values { id text type } }
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
        colonnes: Object.fromEntries((it.column_values || []).map((c) => [c.id, c.text])),
      });
    }
    curseur = page?.cursor || null;
    if (!curseur || !items.length) break;
  }

  return lignes;
}

/** Supprime un élément. Réservé au nettoyage de ce qu'on a soi-même créé. */
export async function supprimerElement(itemId) {
  return graphql(`mutation ($item: ID!) { delete_item(item_id: $item) { id } }`, { item: String(itemId) });
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
export async function poserElement(boardId, { nom, colonnes = {}, itemId = null, cle = null }) {
  if (!boardId) throw new Error('Tableau Monday non configuré');

  if (itemId) {
    try {
      await majElement(boardId, itemId, colonnes);
      return { id: String(itemId), cree: false };
    } catch (e) {
      // Élément supprimé côté Monday : on en recrée un plutôt que d'échouer.
      if (!/not found|does not exist|invalid/i.test(e?.message || '')) throw e;
    }
  }

  const existant = cle?.colonne && cle?.valeur ? await chercherElement(boardId, cle.colonne, cle.valeur) : null;
  if (existant) {
    await majElement(boardId, existant.id, colonnes);
    return { id: existant.id, cree: false };
  }
  const cree = await creerElement(boardId, nom, colonnes);
  return { id: cree?.id, cree: true };
}
