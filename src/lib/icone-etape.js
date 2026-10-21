import { BarChart3, FileText, FolderOpen, LayoutGrid, Mail, Pencil, ScanSearch, Search } from "lucide-react";

// L'icône de ce que Haka est en train de faire, d'après le libellé de l'étape (repli : le tableau). Partagée par le
// chat (frise de raisonnement, 18 oct. 2026) et la lecture d'un appel (21 oct. 2026, Jules : « la même animation »).
const ICONES_ETAPES = [
  [/mail|courrier|envoi/i, Mail], [/fiche|document|pi[eè]ce|bail|lis|lecture|extrai/i, FileText], [/march|dvf|equimmox|loyer|prix|vacance/i, BarChart3],
  [/dossier|cr[ée]/i, FolderOpen], [/analys|v[ée]rifi|crit[eè]re/i, ScanSearch], [/cherch|recherch|trouv/i, Search], [/rédig|redig|écri|prépar|prepar/i, Pencil],
];

export const iconeEtape = (libelle) => ICONES_ETAPES.find(([re]) => re.test(libelle))?.[1] || LayoutGrid;
