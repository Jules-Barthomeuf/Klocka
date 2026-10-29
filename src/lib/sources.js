import { ArrowLeftRight, BarChart3, Megaphone, MapPinned, Tags, Briefcase, BookOpen, Box, Brain, Building2, CalendarDays, Database, Euro, FileText, FolderOpen, Globe, Home, Key, Landmark, LayoutTemplate, Mail, Map, MapPin, Phone, Presentation, Radar, ScanSearch, Search, Store, Tag, Users, Calculator } from "lucide-react";

// Le registre des sources (17 oct. 2026, Jules) : une clé, un nom, une icône,
// pour tout ce que Haka peut lire ou utiliser. Les cartes de compétences, la
// file À valider et les sources sous une réponse s'en servent ; une source
// n'est jamais dessinée ailleurs que par ce registre.

export const SOURCES = {
  documents: { nom: "Documents du dossier", icone: FileText },
  fiche: { nom: "Fiche commerciale", icone: FileText },
  preanalyse: { nom: "Pré-analyse", icone: ScanSearch },
  dossiers: { nom: "Dossiers", icone: FolderOpen },
  projet: { nom: "Projet", icone: Building2 },
  clients: { nom: "Clients", icone: Users },
  layer: { nom: "Intelligence", icone: Brain },
  gmail: { nom: "Gmail", icone: Mail },
  drive: { nom: "Google Drive", icone: FolderOpen },
  agenda: { nom: "Agenda", icone: CalendarDays },
  monday: { nom: "Sunday CRM", icone: LayoutTemplate },
  web: { nom: "Web", icone: Globe },
  dvf: { nom: "DVF", icone: Home },
  equimmox: { nom: "Equimmox", icone: BarChart3 },
  data_b: { nom: "Data-B", icone: Database },
  valeur_locative: { nom: "Valeur locative", icone: Tag },
  vacance: { nom: "Vacance", icone: Key },
  annuaire: { nom: "Annuaire des entreprises", icone: Landmark },
  figaro: { nom: "Figaro", icone: Home },
  bodacc: { nom: "BODACC", icone: BookOpen },
  kzoning: { nom: "K-Zoning", icone: Map },
  kexpertise: { nom: "K-Expertise", icone: Store },
  kestimation: { nom: "Estimation", icone: Euro },
  kprospective: { nom: "K-Prospective", icone: Search },
  kvacance: { nom: "K-Vacance", icone: Key },
  kfoncier: { nom: "K-Foncier", icone: Box },
  ktransactions: { nom: "K-Transactions", icone: ArrowLeftRight },
  simulateur: { nom: "Simulateur", icone: Calculator },
  modele_klocka: { nom: "Modèle Klocka", icone: LayoutTemplate },
  presentation: { nom: "Présentation", icone: Presentation },
  loi: { nom: "LOI", icone: FileText },
  emailing: { nom: "Emailing", icone: Mail },
  off_market: { nom: "Off-market", icone: Radar },
  prospection: { nom: "Prospection", icone: Phone },
  adresse: { nom: "Adresse", icone: MapPin },
  // Ajoutés avec la pré-analyse en compétence (17 oct. 2026) : le référentiel d'enseignes, les annonces, Maps, Pappers.
  enseignes: { nom: "Référentiel d'enseignes", icone: Tags },
  annonces: { nom: "Annonces", icone: Megaphone },
  google_maps: { nom: "Google Maps", icone: MapPinned },
  pappers: { nom: "Pappers", icone: Briefcase },
  // Les chiffres d'une commune pour le mandataire (26 oct. 2026) : population, revenus, chômage.
  insee: { nom: "INSEE", icone: BarChart3 },
};

/** La source d'une clé, avec un repli lisible pour une clé inconnue. */
export const sourceDe = (cle) => SOURCES[cle] || { nom: String(cle || "").replace(/_/g, " "), icone: Database };
