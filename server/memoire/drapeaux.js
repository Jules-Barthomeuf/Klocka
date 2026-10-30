// La Mémoire Klocka (30 oct. 2026, Jules) : les fiches de biens qu'on supprimait, gardées comme donnée de marché,
// et un lecteur des boîtes mail qui en tire chaque fiche jamais reçue. Le lecteur n'a pas de drapeau : il lit une
// boîte dès que Jules l'autorise sur la page Mémoire, sans plage horaire ni plafond de dépense (Jules, même jour).
//
//   MEMOIRE=1                 un dossier supprimé ou abandonné laisse sa fiche en Mémoire ; chaque dossier créé y a sa ligne
//   MEMOIRE_TWENTY=1          les biens de la Mémoire et les chiffres des agents partent dans Twenty
//                             (après scripts/crm/memoire-twenty.mjs)
//   MEMOIRE_PAGE=25           messages Gmail lus par page
//   MEMOIRE_PAUSE_MS=400      le souffle entre deux messages
//   MEMOIRE_GMAIL_Q           le filtre Gmail de la liste (par défaut : les mails avec un PDF ou un Word en pièce jointe)

const oui = (v) => /^(1|true|oui|yes)$/i.test(String(v || ''));

export const MEMOIRE = oui(process.env.MEMOIRE);
export const TWENTY = oui(process.env.MEMOIRE_TWENTY);
export const PAGE = Math.min(100, Math.max(1, Number(process.env.MEMOIRE_PAGE) || 25));
export const PAUSE_MS = Math.max(0, Number(process.env.MEMOIRE_PAUSE_MS ?? 400) || 0);
export const GMAIL_Q = String(process.env.MEMOIRE_GMAIL_Q || 'has:attachment (filename:pdf OR filename:doc OR filename:docx)').trim();

/** Ce que l'écran montre des réglages, sans rien de secret. */
export const drapeaux = () => ({ memoire: MEMOIRE, twenty: TWENTY, page: PAGE });
