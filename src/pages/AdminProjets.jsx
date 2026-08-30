import React, { useEffect, useState } from "react";
import { createPageUrl } from "@/utils";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Building2, Plus, Upload, X, CheckCircle2, Sparkles, Loader2, FileText, Brain, GripVertical, FolderSearch, Eye, Archive, Undo2 } from "lucide-react";
import { toast } from "sonner";
import AdminProjectCard from "../components/admin/AdminProjectCard";
import ClientsCorrespondants from "../components/admin/ClientsCorrespondants";
import { DialogueAssignerClient } from "../components/admin/AssignationProjets";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { motion, AnimatePresence } from "framer-motion";
import ProjectFormLocataireTab from "../components/admin/ProjectFormLocataireTab";
import ProjectFormInfoTab from "../components/admin/ProjectFormInfoTab";
import ProjectFormDocumentsTab from "../components/admin/ProjectFormDocumentsTab";
import ProjectFormDiagnosticsTab from "../components/admin/ProjectFormDiagnosticsTab";
import ProjectFormSimulateurTab from "../components/admin/ProjectFormSimulateurTab";
import ProjectFormImagesTab from "../components/admin/ProjectFormImagesTab";
import ProjectFormCoproTab from "../components/admin/ProjectFormCoproTab";
import ProjectFormSwotTab from "../components/admin/ProjectFormSwotTab";
import ProjectFormMarcheTab from "../components/admin/ProjectFormMarcheTab";
import ProjectSimulatorPreview from "../components/admin/ProjectSimulatorPreview";
import ProjectLivePreview from "../components/admin/ProjectLivePreview";
import BoutonMonday from "@/components/BoutonMonday";
import ProjetContent from "../components/projet/ProjetContent";

import ShadowEditorDialog from "../components/admin/ShadowEditorDialog";
import { FField, FInput, FTextarea } from "../components/admin/FormField";

export default function AdminProjets() {
  const navigate = useNavigate();
  const [isDialogOpen, setIsDialogOpen] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('action') === 'create';
  });
  const [editingProject, setEditingProject] = useState(null);
  const [activeTab, setActiveTab] = useState("informations");
  // Aperçu « page projet » — rafraîchi sur Entrée, Enregistrer ou fermeture du panneau.
  const [apercuProjet, setApercuProjet] = useState(null);
  // Panneau latéral des champs (caché par défaut) et onglet courant de la page.
  const [panneauOuvert, setPanneauOuvert] = useState(false);
  // Assigner un client sans ouvrir le panneau : le bouton vit dans la barre.
  const [assignerOuvert, setAssignerOuvert] = useState(false);
  const [ongletPage, setOngletPage] = useState("secteur");
  // Historique des modifications faites sur la page, pour le retour en arrière.
  const [historique, setHistorique] = useState([]);
  // Assistant de création de champs personnalisés (prompt libre), en panneau droit.
  const [assistantOuvert, setAssistantOuvert] = useState(false);
  const [assistantPrompt, setAssistantPrompt] = useState("");
  const [assistantEnCours, setAssistantEnCours] = useState(false);
  // Suivi de l'enregistrement, affiché dans la barre d'actions.
  const [enregistreLe, setEnregistreLe] = useState(null);
  const [modifieDepuis, setModifieDepuis] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showArchived, setShowArchived] = useState(false);
  const [csvData, setCsvData] = useState("");
  const [showCsvImport, setShowCsvImport] = useState(false);
  const [shadowDialogOpen, setShadowDialogOpen] = useState(false);
  const [shadowProject, setShadowProject] = useState(null);
  const [showAdminPicker, setShowAdminPicker] = useState(false);

  const [travauxList, setTravauxList] = useState([{ annee: 10, montant: 10000 }, { annee: 20, montant: 10000 }]);
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [aiPromptData, setAiPromptData] = useState({ ville: "", adresse: "", commerce: "" });
  const [aiFullText, setAiFullText] = useState("");
  const [aiDocuments, setAiDocuments] = useState([]);
  const [isUploadingAiDocs, setIsUploadingAiDocs] = useState(false);
  const [isSearchingDrive, setIsSearchingDrive] = useState(false);
  const [driveSearchAddress, setDriveSearchAddress] = useState("");
  const [clientSearchInDialog, setClientSearchInDialog] = useState("");

  const [formData, setFormData] = useState({
    titre: "",
    client_email: "",
    client_emails: [],
    prix_acquisition: 0,
    rendement_locatif: 0,
    adresse_complete: "",
    statut: "prospect", vitrine: false,
    suivi_message_envoye: false,
    suivi_retour_client: null,
    latitude: null,
    longitude: null,
    documents: [],
    ville_secteur_champ1: "",
    ville_secteur_champ2: "",
    ville_secteur_champ3: "",
    description_ville: "",
    description_secteur: "",
    bien_champ1: "",
    bien_champ2: "",
    bien_champ3: "",
    description_bien: "",
    nom_locataire: "",
    activite_locataire: "",
    locataire_depuis: "",
    loyer_annuel_ht: 0,
    echeance_bail: "",
    statut_bail: "en_cours",
    vente_fonds_commerce: false,
    montant_vente_fonds_commerce: 0,
    date_vente_fonds_commerce: "",
    loyer_m2_an: 0,
    analyse_bail: "",
    quote_part_lot: 0,
    charges_copropriete: 0,
    activites_autorisees: "",
    activites_interdites: "",
    type_construction: "",
    taxe_fonciere_an: 0,
    photos: [],
    surface_m2: 0,
    synthese_assemblee_generale: "",
    resolutions_votees: "",
    resolutions_refusees: "",
    assemblees_generales: [],
    notes_libres: [],
    notes_secteur: [],
    notes_bien: [],
    notes_locataire: [],
    notes_marche: [],
    notes_diagnostique: [],
    bail_admin_fields: [],
    swot_liens: [],
    swot_data: null,
    
    dpe_note: "",
    dpe_consommation: 0,
    ges_note: "",
    ges_emission: 0,
    
    marche_quartier_nom: "",
    marche_prix_m2_median: 0,
    marche_prix_m2_bas: 0,
    marche_prix_m2_haut: 0,
    marche_evolution_1an: 0,
    marche_evolution_5ans: 0,
    marche_offre_bas: 0,
    marche_offre_moyenne: 0,
    marche_offre_haut: 0,
    marche_baux_bas: 0,
    marche_baux_moyenne: 0,
    marche_baux_haut: 0,
    marche_secteurs: [],

    sim_commission_agent_inclus_fai: true,
    sim_surface: 0,
    sim_loyer_initial_ht: 0,
    sim_loyer_soumis_tva: false,
    sim_charges_copropriete: 0,
    sim_charges_refacturable: true,
    sim_taxe_fonciere: 0,
    sim_taxe_refacturable: true,
    sim_taux_tva: 20,
    sim_etage: 0,
    sim_type_detention: "",

    sim_prix_bien_fai: 0,
    sim_prix_bien_negocie: 0,
    sim_prix_hors_droits: 0,
    sim_commission_agent_active: false,
    sim_commission_agent: 5,
    sim_commission_agent_type: "pourcentage",
    sim_droits_enregistrement: 8,
    sim_fees_klocka: 8,
    sim_fees_klocka_type: "pourcentage",
    sim_incentive_klocka: 20,
    sim_total_frais_klocka: 0,
    sim_frais_dossier_bancaire: 1000,
    sim_cout_creation_societe: 1000,
    sim_frais_courtage: 0,
    sim_frais_divers_acquisition: 2000,
    sim_prix_revient: 0,

    sim_montant_credit: 0,
    sim_duree_credit: 20,
    sim_taux_interet: 3.7,
    sim_taux_assurance: 0.25,
    sim_apport: 0,
    sim_total_financement: 0,

    sim_type_revente: "",
    sim_surface_revente: 0,
    sim_annee_revente: 20,
    sim_loyer_ht_revente: 0,
    sim_valeur_net_comptable: 0,
    sim_prix_vente_fai: 0,
    sim_commission_agent_revente: 0,
    sim_prix_vente_net: 0,

    sim_rendement_locatif_global_net: 0,
    sim_rendement_capital: 0,
    sim_rendement_global: 0,
    sim_cashflow_cumule: 0,
    sim_marge_brute_revente: 0,
    sim_creation_richesse_brute: 0,
    sim_creation_richesse_nette: 0,
    sim_multiple_fonds_propres: 0,
    sim_rendement_brut_fonds_propres: 0,
    sim_rendement_net_fonds_propres: 0,

    sim_indexation_loyers: 2,
    sim_fichier_excel: "",
    sim_lien_google_sheets: "",
    sim_fichier_pdf: "",
    presentation_google_slides: "",
    
    sim_annee_revalorisation: null,
    sim_loyer_revalorise: 0,
    sim_loyer_revalorise_tva: false,
    sim_vacance_locative: 0,
    sim_annee_renegociation: null,
    sim_taux_renegocie: 0,
    sim_ira_mois: 0,
    sim_comptabilite: 600,
    sim_assurance_pne: 400,
    sim_gestion_locative: 0,
    sim_charges_diverses: 0,
    sim_travaux_annee1: null,
    sim_travaux_montant1: 0,
    sim_travaux_annee2: null,
    sim_travaux_montant2: 0,
    sim_travaux_annee3: null,
    sim_travaux_montant3: 0,
    sim_travaux_annee4: null,
    sim_travaux_montant4: 0,
    sim_travaux_annee5: null,
    sim_travaux_montant5: 0,
  });

  const queryClient = useQueryClient();

  // Pas d'initialData : un tableau vide ferait passer le chargement (et toute
  // erreur réseau) pour « aucun projet », sans indice ni recours.
  const { data: projects = [], isLoading: chargementProjets, isError: erreurProjets, refetch: rechargerProjets } = useQuery({
    queryKey: ['all-projects'],
    queryFn: () => base44.entities.Project.list("-created_date"),
  });

  // À qui chaque projet pourrait correspondre, d'après les investisseurs tenus
  // dans Monday. Un seul appel pour toute la page.
  const {
    data: correspondances,
    isLoading: chargementCorrespondances,
    isError: erreurCorrespondances,
  } = useQuery({
    queryKey: ["projets-clients"],
    queryFn: () => base44.request("GET", "/api/monday/projets/clients"),
    staleTime: 5 * 60 * 1000,
  });

  const { data: users = [] } = useQuery({
    queryKey: ['all-users'],
    queryFn: () => base44.entities.User.list(),
    initialData: []
  });

  const { data: shadowProjects = [] } = useQuery({
    queryKey: ['shadow-projects'],
    queryFn: () => base44.entities.ShadowProject.list(),
    initialData: []
  });

  // ?id=<projectId> ouvre directement l'éditeur sur ce projet (utilisé par le
  // bouton « Créer le projet » de la préanalyse). Attend que la liste et les
  // utilisateurs soient chargés pour que handleEdit remplisse tout.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const idDemande = params.get('id');
    if (!idDemande || editingProject || !projects.length || !users.length) return;
    const projet = projects.find((p) => p.id === idDemande);
    if (projet) handleEdit(projet);
  }, [projects, users]);  

  const getShadowForProject = (projectId) => shadowProjects.find(s => s.project_id === projectId);

  const [shadowInitialTab, setShadowInitialTab] = useState(null);
  const [shadowInitialViewMode, setShadowInitialViewMode] = useState(null);

  const handleShadow = (project) => {
    setShadowInitialTab(null);
    setShadowInitialViewMode(null);
    setShadowProject(project);
    setShadowDialogOpen(true);
  };

  const handleShadowWithNav = (project, tab, viewMode) => {
    setShadowInitialTab(tab);
    setShadowInitialViewMode(viewMode);
    setShadowProject(project);
    setShadowDialogOpen(true);
  };

  const createProjectMutation = useMutation({
    mutationFn: (data) => base44.entities.Project.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['all-projects'] }); },
    onError: (error) => { console.error("Erreur création projet:", error); }
  });

  const updateProjectMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Project.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['all-projects'] }); },
    onError: (error) => { console.error("Erreur mise à jour projet:", error); }
  });

  const deleteProjectMutation = useMutation({
    mutationFn: (id) => base44.entities.Project.delete(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['all-projects'] }); }
  });

  const resetForm = () => {
    setTravauxList([]);
    setAiPromptData({ ville: "", adresse: "", commerce: "" });
    setAiFullText("");
    setAiDocuments([]);
    
    const adminEmails = users.filter(u => u.role === "admin").map(u => u.email);
    
    setFormData({
      titre: "", admin_principal: "", client_email: "", client_emails: adminEmails, prix_acquisition: 0, rendement_locatif: 0,
      adresse_complete: "", statut: "prospect", vitrine: false, suivi_message_envoye: false, suivi_retour_client: null,
      latitude: null, longitude: null, documents: [],
      ville_secteur_champ1: "", ville_secteur_champ2: "", ville_secteur_champ3: "",
      description_ville: "", description_secteur: "",
      env_data: {},
      bien_champ1: "", bien_champ2: "", bien_champ3: "", description_bien: "",
      nom_locataire: "", activite_locataire: "", locataire_depuis: "",
      loyer_annuel_ht: 0, echeance_bail: "", loyer_m2_an: 0, analyse_bail: "",
      quote_part_lot: 0, charges_copropriete: 0, activites_autorisees: "", activites_interdites: "",
      type_construction: "", taxe_fonciere_an: 0, photos: [], surface_m2: 0,
      synthese_assemblee_generale: "", provision_charges: 0,
      sim_surface: 0, sim_loyer_initial_ht: 0, sim_loyer_soumis_tva: false,
      sim_charges_copropriete: 0, sim_charges_refacturable: true,
      sim_taxe_fonciere: 0, sim_taxe_refacturable: true, sim_taux_tva: 20,
      sim_etage: 0, sim_type_detention: "",
      sim_prix_bien_fai: 0, sim_prix_bien_negocie: 0, sim_prix_hors_droits: 0,
      sim_commission_agent: 5, sim_commission_agent_type: "pourcentage",
      sim_droits_enregistrement: 8, sim_fees_klocka: 8, sim_incentive_klocka: 20,
      sim_total_frais_klocka: 0, sim_frais_dossier_bancaire: 1000,
      sim_cout_creation_societe: 1000, sim_frais_courtage: 0, sim_frais_divers_acquisition: 2000,
      sim_prix_revient: 0, sim_montant_credit: 0, sim_duree_credit: 20,
      sim_taux_interet: 3.7, sim_taux_assurance: 0.25, sim_apport: 0, sim_total_financement: 0,
      sim_type_revente: "", sim_surface_revente: 0, sim_annee_revente: 20,
      sim_loyer_ht_revente: 0, sim_valeur_net_comptable: 0, sim_prix_vente_fai: 0,
      sim_commission_agent_revente: 0, sim_prix_vente_net: 0,
      sim_rendement_locatif_global_net: 0, sim_rendement_capital: 0,
      sim_rendement_global: 0, sim_cashflow_cumule: 0, sim_marge_brute_revente: 0,
      sim_creation_richesse_brute: 0, sim_creation_richesse_nette: 0,
      sim_multiple_fonds_propres: 0, sim_rendement_brut_fonds_propres: 0,
      sim_rendement_net_fonds_propres: 0, sim_indexation_loyers: 2,
      sim_fichier_excel: "", sim_lien_google_sheets: "", sim_fichier_pdf: "",
      presentation_google_slides: "",
    });
    setActiveTab("informations");
    setEditingProject(null);
    setCsvData("");
    setShowCsvImport(false);
  };

  const handleDuplicate = (project) => {
    setEditingProject(null);
    const travaux = [];
    for (let i = 1; i <= 20; i++) {
      if (project[`sim_travaux_montant${i}`]) {
        travaux.push({ annee: i, montant: project[`sim_travaux_montant${i}`] });
      }
    }
    setTravauxList(travaux);
    const { id, created_date, updated_date, created_by, ...projectData } = project;
    
    const adminEmails = users.filter(u => u.role === "admin").map(u => u.email);
    const updatedClientEmails = Array.from(new Set([...(projectData.client_emails || []), ...adminEmails]));
    
    setFormData({ ...projectData, client_emails: updatedClientEmails, titre: `${projectData.titre} (Copie)` });
    setIsDialogOpen(true);
  };

  const handleEdit = (project) => {
    setEditingProject(project);
    setApercuProjet(null);
    const travaux = [];
    for (let i = 1; i <= 20; i++) {
      if (project[`sim_travaux_montant${i}`]) {
        travaux.push({ annee: i, montant: project[`sim_travaux_montant${i}`] });
      }
    }
    setTravauxList(travaux);
    
    const adminEmails = users.filter(u => u.role === "admin").map(u => u.email);
    const updatedClientEmails = Array.from(new Set([...(project.client_emails || []), ...adminEmails]));
    
    setFormData({
      titre: project.titre || "", admin_principal: project.admin_principal || "", client_email: project.client_email || "",
      client_emails: updatedClientEmails, prix_acquisition: project.prix_acquisition || 0,
      rendement_locatif: project.rendement_locatif || 0, adresse_complete: project.adresse_complete || "",
      statut: project.statut || "prospect",
      vitrine: !!project.vitrine,
      suivi_message_envoye: !!project.suivi_message_envoye,
      suivi_retour_client: project.suivi_retour_client || null,
      latitude: project.latitude || null,
      longitude: project.longitude || null, documents: project.documents || [],
      ville_secteur_champ1: project.ville_secteur_champ1 || "", ville_secteur_champ2: project.ville_secteur_champ2 || "",
      ville_secteur_champ3: project.ville_secteur_champ3 || "", description_ville: project.description_ville || "",
      description_secteur: project.description_secteur || "", bien_champ1: project.bien_champ1 || "",
      bien_champ2: project.bien_champ2 || "", bien_champ3: project.bien_champ3 || "",
      description_bien: project.description_bien || "", nom_locataire: project.nom_locataire || "",
      activite_locataire: project.activite_locataire || "", locataire_depuis: project.locataire_depuis || "",
      loyer_annuel_ht: project.loyer_annuel_ht || 0, echeance_bail: project.echeance_bail || "",
      statut_bail: project.statut_bail || "en_cours", vente_fonds_commerce: project.vente_fonds_commerce || false,
      montant_vente_fonds_commerce: project.montant_vente_fonds_commerce || 0,
      date_vente_fonds_commerce: project.date_vente_fonds_commerce || "",
      loyer_m2_an: project.loyer_m2_an || 0, analyse_bail: project.analyse_bail || "",
      quote_part_lot: project.quote_part_lot || 0, charges_copropriete: project.charges_copropriete || 0,
      activites_autorisees: project.activites_autorisees || "", activites_interdites: project.activites_interdites || "",
      type_construction: project.type_construction || "", taxe_fonciere_an: project.taxe_fonciere_an || 0,
      photos: project.photos || [], surface_m2: project.surface_m2 || 0,
      synthese_assemblee_generale: project.synthese_assemblee_generale || "",
      provision_charges: project.provision_charges || 0,
      resolutions_votees: project.resolutions_votees || "", resolutions_refusees: project.resolutions_refusees || "",
      assemblees_generales: project.assemblees_generales || [], notes_libres: project.notes_libres || [],
      notes_secteur: project.notes_secteur || [], notes_bien: project.notes_bien || [],
      notes_locataire: project.notes_locataire || [], notes_marche: project.notes_marche || [],
      notes_diagnostique: project.notes_diagnostique || [], bail_admin_fields: project.bail_admin_fields || [],
      fichiers_projet: project.fichiers_projet || [],
      docs_checklist: project.docs_checklist || {},

      swot_liens: project.swot_liens || [], swot_data: project.swot_data || null,
      env_data: project.env_data || {},
      dpe_note: project.dpe_note || "", dpe_consommation: project.dpe_consommation || 0,
      ges_note: project.ges_note || "", ges_emission: project.ges_emission || 0,
      marche_quartier_nom: project.marche_quartier_nom || "",
      marche_prix_m2_median: project.marche_prix_m2_median || 0,
      marche_prix_m2_bas: project.marche_prix_m2_bas || 0, marche_prix_m2_haut: project.marche_prix_m2_haut || 0,
      marche_evolution_1an: project.marche_evolution_1an || 0, marche_evolution_5ans: project.marche_evolution_5ans || 0,
      marche_offre_bas: project.marche_offre_bas || 0, marche_offre_moyenne: project.marche_offre_moyenne || 0,
      marche_offre_haut: project.marche_offre_haut || 0, marche_baux_bas: project.marche_baux_bas || 0,
      marche_baux_moyenne: project.marche_baux_moyenne || 0, marche_baux_haut: project.marche_baux_haut || 0,
      marche_secteurs: project.marche_secteurs || [],
      sim_mode_prix_net_vendeur: project.sim_mode_prix_net_vendeur ?? false,
      sim_prix_net_vendeur: project.sim_prix_net_vendeur || 0,
      sim_honoraires_agent_mode: project.sim_honoraires_agent_mode || "pct_ttc",
      sim_honoraires_agent_montant: project.sim_honoraires_agent_montant || 0,
      sim_commission_agent_inclus_fai: project.sim_commission_agent_inclus_fai ?? true,
      sim_surface: project.sim_surface || 0, sim_loyer_initial_ht: project.sim_loyer_initial_ht || 0,
      sim_loyer_soumis_tva: project.sim_loyer_soumis_tva ?? false,
      sim_charges_copropriete: project.sim_charges_copropriete || 0,
      sim_charges_refacturable: project.sim_charges_refacturable ?? true,
      sim_taxe_fonciere: project.sim_taxe_fonciere || 0,
      sim_taxe_refacturable: project.sim_taxe_refacturable ?? true,
      sim_taux_tva: project.sim_taux_tva ?? 20, sim_etage: project.sim_etage || 0,
      sim_type_detention: project.sim_type_detention || "",
      sim_prix_bien_fai: project.sim_prix_bien_fai || 0, sim_prix_bien_negocie: project.sim_prix_bien_negocie || 0,
      sim_prix_hors_droits: project.sim_prix_hors_droits || 0,
      sim_no_fees_klocka: project.sim_no_fees_klocka ?? false,
      sim_commission_agent_active: project.sim_commission_agent_active ?? false,
      sim_commission_agent: project.sim_commission_agent ?? 5,
      sim_commission_agent_type: project.sim_commission_agent_type || "pourcentage",
      sim_droits_enregistrement: project.sim_droits_enregistrement ?? 8,
      sim_fees_klocka: project.sim_fees_klocka ?? 8,
      sim_fees_klocka_type: project.sim_fees_klocka_type || "pourcentage",
      sim_incentive_klocka: project.sim_incentive_klocka ?? 20,
      sim_total_frais_klocka: project.sim_total_frais_klocka || 0,
      sim_frais_dossier_bancaire: project.sim_frais_dossier_bancaire || 0,
      sim_cout_creation_societe: project.sim_cout_creation_societe || 0,
      sim_frais_courtage: project.sim_frais_courtage || 0,
      sim_frais_divers_acquisition: project.sim_frais_divers_acquisition ?? 2000,
      sim_prix_revient: project.sim_prix_revient || 0,
      sim_montant_credit: project.sim_montant_credit || 0, sim_duree_credit: project.sim_duree_credit ?? 20,
      sim_taux_interet: project.sim_taux_interet ?? 3.7, sim_taux_assurance: project.sim_taux_assurance ?? 0.25,
      sim_pret_in_fine: project.sim_pret_in_fine ?? false,
      sim_apport: project.sim_apport || 0, sim_total_financement: project.sim_total_financement || 0,
      sim_type_revente: project.sim_type_revente || "", sim_surface_revente: project.sim_surface_revente || 0,
      sim_annee_revente: project.sim_annee_revente ?? 20, sim_loyer_ht_revente: project.sim_loyer_ht_revente || 0,
      sim_valeur_net_comptable: project.sim_valeur_net_comptable || 0,
      sim_prix_vente_fai: project.sim_prix_vente_fai || 0,
      sim_commission_agent_revente: project.sim_commission_agent_revente || 0,
      sim_prix_vente_net: project.sim_prix_vente_net || 0,
      sim_rendement_locatif_global_net: project.sim_rendement_locatif_global_net || 0,
      sim_rendement_capital: project.sim_rendement_capital || 0,
      sim_rendement_global: project.sim_rendement_global || 0,
      sim_cashflow_cumule: project.sim_cashflow_cumule || 0,
      sim_marge_brute_revente: project.sim_marge_brute_revente || 0,
      sim_creation_richesse_brute: project.sim_creation_richesse_brute || 0,
      sim_creation_richesse_nette: project.sim_creation_richesse_nette || 0,
      sim_multiple_fonds_propres: project.sim_multiple_fonds_propres || 0,
      sim_rendement_brut_fonds_propres: project.sim_rendement_brut_fonds_propres || 0,
      sim_rendement_net_fonds_propres: project.sim_rendement_net_fonds_propres || 0,
      sim_indexation_loyers: project.sim_indexation_loyers ?? 2,
      sim_fichier_excel: project.sim_fichier_excel || "", sim_lien_google_sheets: project.sim_lien_google_sheets || "",
      sim_fichier_pdf: project.sim_fichier_pdf || "", presentation_google_slides: project.presentation_google_slides || "",
      sim_annee_revalorisation: project.sim_annee_revalorisation || null,
      sim_loyer_revalorise: project.sim_loyer_revalorise || 0,
      sim_loyer_revalorise_tva: project.sim_loyer_revalorise_tva || false,
      sim_vacance_locative: project.sim_vacance_locative || 0,
      sim_annee_renegociation: project.sim_annee_renegociation || null,
      sim_taux_renegocie: project.sim_taux_renegocie || 0, sim_ira_mois: project.sim_ira_mois || 0,
      sim_comptabilite: project.sim_comptabilite || 600, sim_assurance_pne: project.sim_assurance_pne || 400,
      sim_gestion_locative: project.sim_gestion_locative || 0, sim_charges_diverses: project.sim_charges_diverses || 0,
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async (projectId) => {
    if (window.confirm("Êtes-vous sûr de vouloir supprimer ce projet ? Cette action est irréversible.")) {
      await deleteProjectMutation.mutateAsync(projectId);
    }
  };

  const handleArchive = async (project) => {
    await updateProjectMutation.mutateAsync({ id: project.id, data: { archived: !project.archived } });
    toast.success(project.archived ? "Projet désarchivé" : "Projet archivé");
  };

  const [newPhotoUrl, setNewPhotoUrl] = useState("");
  const [newDocUrl, setNewDocUrl] = useState("");

  const convertGoogleDriveUrl = (url) => {
    const driveMatch = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (driveMatch) return `https://drive.google.com/thumbnail?id=${driveMatch[1]}&sz=w2000`;
    return url;
  };

  const handlePhotoDragEnd = (result) => {
    if (!result.destination) return;
    const items = Array.from(formData.photos);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);
    setFormData({ ...formData, photos: items });
  };

  const handleCsvImport = () => {
    try {
      const lines = csvData.trim().split('\n');
      if (lines.length < 2) throw new Error("CSV data must contain at least a header and one row of values.");
      const headers = lines[0].split(',').map(h => h.trim());
      const values = lines[1].split(',').map(v => v.trim());
      const mapping = {
        'surface': 'sim_surface', 'loyer_initial_ht': 'sim_loyer_initial_ht',
        'loyer_soumis_tva': 'sim_loyer_soumis_tva', 'charges_copropriete': 'sim_charges_copropriete',
        'charges_refacturable': 'sim_charges_refacturable', 'taxe_fonciere': 'sim_taxe_fonciere',
        'taxe_refacturable': 'sim_taxe_refacturable', 'taux_tva': 'sim_taux_tva', 'etage': 'sim_etage',
        'type_detention': 'sim_type_detention', 'prix_bien_fai': 'sim_prix_bien_fai',
        'prix_bien_negocie': 'sim_prix_bien_negocie', 'prix_hors_droits': 'sim_prix_hors_droits',
        'commission_agent': 'sim_commission_agent', 'droits_enregistrement': 'sim_droits_enregistrement',
        'fees_klocka': 'sim_fees_klocka', 'incentive_klocka': 'sim_incentive_klocka',
        'total_frais_klocka': 'sim_total_frais_klocka', 'frais_dossier_bancaire': 'sim_frais_dossier_bancaire',
        'cout_creation_societe': 'sim_cout_creation_societe', 'frais_courtage': 'sim_frais_courtage',
        'frais_divers_acquisition': 'sim_frais_divers_acquisition', 'prix_revient': 'sim_prix_revient',
        'montant_credit': 'sim_montant_credit', 'duree_credit': 'sim_duree_credit',
        'taux_interet': 'sim_taux_interet', 'taux_assurance': 'sim_taux_assurance',
        'apport': 'sim_apport', 'total_financement': 'sim_total_financement',
        'type_revente': 'sim_type_revente', 'surface_revente': 'sim_surface_revente',
        'annee_revente': 'sim_annee_revente', 'loyer_ht_revente': 'sim_loyer_ht_revente',
        'valeur_net_comptable': 'sim_valeur_net_comptable', 'prix_vente_fai': 'sim_prix_vente_fai',
        'commission_agent_revente': 'sim_commission_agent_revente', 'prix_vente_net': 'sim_prix_vente_net',
        'rendement_locatif_global_net': 'sim_rendement_locatif_global_net', 'rendement_capital': 'sim_rendement_capital',
        'rendement_global': 'sim_rendement_global', 'cashflow_cumule': 'sim_cashflow_cumule',
        'marge_brute_revente': 'sim_marge_brute_revente', 'creation_richesse_brute': 'sim_creation_richesse_brute',
        'creation_richesse_nette': 'sim_creation_richesse_nette', 'multiple_fonds_propres': 'sim_multiple_fonds_propres',
        'rendement_brut_fonds_propres': 'sim_rendement_brut_fonds_propres',
        'rendement_net_fonds_propres': 'sim_rendement_net_fonds_propres',
        'indexation_loyers': 'sim_indexation_loyers', 'fichier_excel': 'sim_fichier_excel',
        'lien_google_sheets': 'sim_lien_google_sheets', 'fichier_pdf': 'sim_fichier_pdf',
      };
      const newData = { ...formData };
      headers.forEach((header, index) => {
        const fieldName = mapping[header.toLowerCase()];
        if (fieldName && values[index] !== undefined && values[index] !== '') {
          const value = values[index];
          if (['sim_loyer_soumis_tva', 'sim_charges_refacturable', 'sim_taxe_refacturable'].includes(fieldName)) {
            newData[fieldName] = value.toLowerCase() === 'oui' || value.toLowerCase() === 'true' || value === '1';
          } else if (!isNaN(parseFloat(value)) && typeof formData[fieldName] === 'number') {
            newData[fieldName] = parseFloat(value);
          } else {
            newData[fieldName] = value;
          }
        }
      });
      setFormData(newData);
      setCsvData("");
      setShowCsvImport(false);
      alert("Données CSV importées avec succès !");
    } catch (error) {
      alert("Erreur lors de l'import CSV. Vérifiez le format: " + error.message);
    }
  };

  const [newAiDocUrl, setNewAiDocUrl] = useState("");

  const handleSearchGoogleDrive = async () => {
    if (!driveSearchAddress.trim()) { alert("Veuillez entrer une adresse"); return; }
    setIsSearchingDrive(true);
    try {
      const searchUrl = `https://drive.google.com/drive/search?q=${encodeURIComponent(driveSearchAddress)}`;
      window.open(searchUrl, '_blank');
      alert("Google Drive s'est ouvert. Copiez l'ID du dossier et collez-le ci-dessous.");
      const folderId = prompt("Collez l'ID du dossier Google Drive ici :");
      if (folderId) {
        const { importFromGoogleDrive } = await import("@/functions/importFromGoogleDrive");
        const response = await importFromGoogleDrive({ folderId });
        if (response.data.files && response.data.files.length > 0) {
          const fileUrls = response.data.files.map(f => f.url);
          setAiDocuments([...aiDocuments, ...fileUrls]);
          setFormData({ ...formData, adresse_complete: driveSearchAddress, documents: [...formData.documents, ...fileUrls] });
          alert(`${response.data.count} fichier(s) importé(s) !`);
        } else { alert("Aucun fichier trouvé."); }
      }
    } catch (error) {
      alert("Erreur import Google Drive: " + error.message);
    } finally { setIsSearchingDrive(false); }
  };

  const handleFullAIGeneration = async () => {
    if (!aiFullText && aiDocuments.length === 0) { alert("Veuillez coller du texte ou importer des documents"); return; }
    setIsGeneratingAI(true);
    try {
      const prompt = `Tu es un expert en immobilier commercial. Analyse les informations et extrait les données pour remplir un projet immobilier.\n\nINFORMATIONS:\n${aiFullText}\n\nExtrait les informations disponibles et retourne un JSON (mets null si non disponible):\n\nINFORMATIONS GÉNÉRALES:\n- titre, adresse_complete\n\nSECTEUR ET BIEN:\n- ville_secteur_champ1/2/3, description_ville (5-6 lignes), description_secteur (5-6 lignes)\n- bien_champ1/2/3, description_bien (5-6 lignes)\n\nLOCATAIRE:\n- nom_locataire, activite_locataire, locataire_depuis (YYYY-MM-DD), echeance_bail (YYYY-MM-DD)\n- analyse_bail (structurée avec sections numérotées)\n\nCOPROPRIÉTÉ:\n- quote_part_lot, activites_autorisees, activites_interdites, type_construction, synthese_assemblee_generale\n\nDONNÉES FINANCIÈRES:\n- sim_surface, sim_prix_bien_fai, sim_prix_bien_negocie, sim_loyer_initial_ht\n- sim_charges_copropriete, sim_taxe_fonciere, sim_loyer_soumis_tva, sim_charges_refacturable, sim_taxe_refacturable\n\nMARCHÉ IMMOBILIER:\n- marche_quartier_nom, marche_prix_m2_median/bas/haut, marche_evolution_1an/5ans\n- marche_offre_bas/moyenne/haut, marche_baux_bas/moyenne/haut\n\nDIAGNOSTIQUES:\n- dpe_note (A-G), dpe_consommation, ges_note (A-G), ges_emission\n\nRéponds UNIQUEMENT avec le JSON.`;
      const llmParams = {
        prompt,
        response_json_schema: {
          type: "object",
          properties: {
            titre: { type: "string" }, adresse_complete: { type: "string" },
            ville_secteur_champ1: { type: "string" }, ville_secteur_champ2: { type: "string" }, ville_secteur_champ3: { type: "string" },
            description_ville: { type: "string" }, description_secteur: { type: "string" },
            bien_champ1: { type: "string" }, bien_champ2: { type: "string" }, bien_champ3: { type: "string" },
            description_bien: { type: "string" }, nom_locataire: { type: "string" }, activite_locataire: { type: "string" },
            locataire_depuis: { type: "string" }, echeance_bail: { type: "string" }, analyse_bail: { type: "string" },
            quote_part_lot: { type: "number" }, activites_autorisees: { type: "string" }, activites_interdites: { type: "string" },
            type_construction: { type: "string" }, synthese_assemblee_generale: { type: "string" },
            sim_surface: { type: "number" }, sim_prix_bien_fai: { type: "number" }, sim_prix_bien_negocie: { type: "number" },
            sim_loyer_initial_ht: { type: "number" }, sim_charges_copropriete: { type: "number" }, sim_taxe_fonciere: { type: "number" },
            sim_loyer_soumis_tva: { type: "boolean" }, sim_charges_refacturable: { type: "boolean" }, sim_taxe_refacturable: { type: "boolean" },
            marche_quartier_nom: { type: "string" }, marche_prix_m2_median: { type: "number" },
            marche_prix_m2_bas: { type: "number" }, marche_prix_m2_haut: { type: "number" },
            marche_evolution_1an: { type: "number" }, marche_evolution_5ans: { type: "number" },
            marche_offre_bas: { type: "number" }, marche_offre_moyenne: { type: "number" }, marche_offre_haut: { type: "number" },
            marche_baux_bas: { type: "number" }, marche_baux_moyenne: { type: "number" }, marche_baux_haut: { type: "number" },
            dpe_note: { type: "string" }, dpe_consommation: { type: "number" }, ges_note: { type: "string" }, ges_emission: { type: "number" }
          }
        }
      };
      if (aiDocuments.length > 0) llmParams.file_urls = aiDocuments;
      const result = await base44.integrations.Core.InvokeLLM(llmParams);
      const updated = { ...formData };
      Object.keys(result).forEach(key => {
        if (result[key] !== null && result[key] !== undefined) {
          if (typeof result[key] === 'boolean') updated[key] = result[key];
          else if (result[key]) updated[key] = result[key];
        }
      });
      setFormData(updated);
      setActiveTab("informations");
      alert("Données extraites avec succès !");
    } catch (error) {
      alert(`Erreur lors de l'extraction : ${error.message || error}`);
    } finally { setIsGeneratingAI(false); }
  };

  // Transforme le formulaire en enregistrement Projet — partagé entre
  // l'enregistrement et l'aperçu « page projet » du volet gauche.
  const construireDonnees = (currentFormData) => {
      // Construire travauxData : tableau indexé par année (1..20)
      const travauxByAnnee = {};
      travauxList.forEach(t => {
        const a = parseInt(t.annee);
        if (a >= 1 && a <= 20 && t.montant) travauxByAnnee[a] = parseFloat(t.montant);
      });
      const travauxData = {};
      for (let i = 1; i <= 20; i++) {
        travauxData[`sim_travaux_annee${i}`] = travauxByAnnee[i] ? i : null;
        travauxData[`sim_travaux_montant${i}`] = travauxByAnnee[i] || 0;
      }

      const adminEmails = users.filter(u => u.role === "admin").map(u => u.email);
      const updatedClientEmails = Array.from(new Set([...(currentFormData.client_emails || []), ...adminEmails]));

      // Nettoyer les champs qui peuvent contenir des références circulaires
      const cleanFormData = {
        ...currentFormData,
        swot_data: currentFormData.swot_data ? JSON.parse(JSON.stringify(currentFormData.swot_data)) : null,
        env_data: currentFormData.env_data ? JSON.parse(JSON.stringify(currentFormData.env_data)) : {},
        docs_checklist: currentFormData.docs_checklist ? JSON.parse(JSON.stringify(currentFormData.docs_checklist)) : {},
        bilans_locataire: (currentFormData.bilans_locataire || []).map(b => ({ nom: b.nom, url: b.url, annee: b.annee })),
        liens_locataire: (currentFormData.liens_locataire || []).map(l => ({ type: l.type, url: l.url, label: l.label })),
        swot_liens: (currentFormData.swot_liens || []).map(s => ({ url: s.url, label: s.label })),
        secteur_transports: (currentFormData.secteur_transports || []).map(t => ({ ligne: t.ligne, type: t.type, distance_metres: t.distance_metres, temps_marche_min: t.temps_marche_min })),
        champs_personnalises: (currentFormData.champs_personnalises || []).map(c => ({ id: c.id, label: c.label, valeur: c.valeur, zone: c.zone, style: c.style || 'ligne' })),
        champs_masques: [...(currentFormData.champs_masques || [])],
      };
      const data = {
        ...cleanFormData, ...travauxData,
        client_emails: updatedClientEmails,
        prix_acquisition: parseFloat(currentFormData.prix_acquisition) || 0,
        rendement_locatif: parseFloat(currentFormData.rendement_locatif) || 0,
        surface_m2: parseFloat(currentFormData.surface_m2) || 0,
        loyer_annuel_ht: parseFloat(currentFormData.loyer_annuel_ht) || 0,
        loyer_m2_an: parseFloat(currentFormData.loyer_m2_an) || 0,
        quote_part_lot: parseFloat(currentFormData.quote_part_lot) || 0,
        charges_copropriete: parseFloat(currentFormData.charges_copropriete) || 0,
        taxe_fonciere_an: parseFloat(currentFormData.taxe_fonciere_an) || 0,
        provision_charges: parseFloat(currentFormData.provision_charges) || 0,
        latitude: parseFloat(currentFormData.latitude) || null,
        longitude: parseFloat(currentFormData.longitude) || null,
        sim_surface: parseFloat(currentFormData.sim_surface) || 0,
        sim_loyer_initial_ht: parseFloat(currentFormData.sim_loyer_initial_ht) || 0,
        sim_charges_copropriete: parseFloat(currentFormData.sim_charges_copropriete) || 0,
        sim_taxe_fonciere: parseFloat(currentFormData.sim_taxe_fonciere) || 0,
        sim_taux_tva: parseFloat(currentFormData.sim_taux_tva) || 20,
        sim_etage: parseInt(currentFormData.sim_etage) || 0,
        sim_prix_bien_fai: parseFloat(currentFormData.sim_prix_bien_fai) || 0,
        sim_prix_bien_negocie: parseFloat(currentFormData.sim_prix_bien_negocie) || 0,
        sim_prix_hors_droits: parseFloat(currentFormData.sim_prix_hors_droits) || 0,
        sim_commission_agent: parseFloat(currentFormData.sim_commission_agent) || 5,
        sim_droits_enregistrement: parseFloat(currentFormData.sim_droits_enregistrement) || 8,
        sim_no_fees_klocka: currentFormData.sim_no_fees_klocka ?? false,
        sim_fees_klocka: currentFormData.sim_no_fees_klocka ? 0 : (parseFloat(currentFormData.sim_fees_klocka) ?? 8),
        sim_incentive_klocka: currentFormData.sim_no_fees_klocka ? 0 : (parseFloat(currentFormData.sim_incentive_klocka) || 0),
        sim_total_frais_klocka: parseFloat(currentFormData.sim_total_frais_klocka) || 0,
        sim_frais_dossier_bancaire: parseFloat(currentFormData.sim_frais_dossier_bancaire) || 0,
        sim_cout_creation_societe: parseFloat(currentFormData.sim_cout_creation_societe) || 0,
        sim_frais_courtage: parseFloat(currentFormData.sim_frais_courtage) || 0,
        sim_frais_divers_acquisition: parseFloat(currentFormData.sim_frais_divers_acquisition) || 2000,
        sim_prix_revient: parseFloat(currentFormData.sim_prix_revient) || 0,
        sim_montant_credit: parseFloat(currentFormData.sim_montant_credit) || 0,
        sim_duree_credit: parseInt(currentFormData.sim_duree_credit) || 20,
        sim_taux_interet: parseFloat(currentFormData.sim_taux_interet) || 3.7,
        sim_taux_assurance: parseFloat(currentFormData.sim_taux_assurance) || 0.25,
        sim_apport: parseFloat(currentFormData.sim_apport) || 0,
        sim_total_financement: parseFloat(currentFormData.sim_total_financement) || 0,
        sim_type_revente: currentFormData.sim_type_revente,
        sim_surface_revente: parseFloat(currentFormData.sim_surface_revente) || 0,
        sim_annee_revente: parseInt(currentFormData.sim_annee_revente) || 20,
        sim_loyer_ht_revente: parseFloat(currentFormData.sim_loyer_ht_revente) || 0,
        sim_valeur_net_comptable: parseFloat(currentFormData.sim_valeur_net_comptable) || 0,
        sim_prix_vente_fai: parseFloat(currentFormData.sim_prix_vente_fai) || 0,
        sim_commission_agent_revente: parseFloat(currentFormData.sim_commission_agent_revente) || 5,
        sim_prix_vente_net: parseFloat(currentFormData.sim_prix_vente_net) || 0,
        sim_rendement_locatif_global_net: parseFloat(currentFormData.sim_rendement_locatif_global_net) || 0,
        sim_rendement_capital: parseFloat(currentFormData.sim_rendement_capital) || 6.5,
        sim_rendement_global: parseFloat(currentFormData.sim_rendement_global) || 0,
        sim_cashflow_cumule: parseFloat(currentFormData.sim_cashflow_cumule) || 0,
        sim_marge_brute_revente: parseFloat(currentFormData.sim_marge_brute_revente) || 0,
        sim_creation_richesse_brute: parseFloat(currentFormData.sim_creation_richesse_brute) || 0,
        sim_creation_richesse_nette: parseFloat(currentFormData.sim_creation_richesse_nette) || 0,
        sim_multiple_fonds_propres: parseFloat(currentFormData.sim_multiple_fonds_propres) || 0,
        sim_rendement_brut_fonds_propres: parseFloat(currentFormData.sim_rendement_brut_fonds_propres) || 0,
        sim_rendement_net_fonds_propres: parseFloat(currentFormData.sim_rendement_net_fonds_propres) || 0,
        sim_indexation_loyers: parseFloat(currentFormData.sim_indexation_loyers) || 2,
        sim_annee_revalorisation: currentFormData.sim_annee_revalorisation ? parseInt(currentFormData.sim_annee_revalorisation) : null,
        sim_loyer_revalorise: parseFloat(currentFormData.sim_loyer_revalorise) || 0,
        sim_loyer_revalorise_tva: currentFormData.sim_loyer_revalorise_tva || false,
        sim_vacance_locative: parseFloat(currentFormData.sim_vacance_locative) || 0,
        sim_annee_renegociation: currentFormData.sim_annee_renegociation ? parseInt(currentFormData.sim_annee_renegociation) : null,
        sim_taux_renegocie: parseFloat(currentFormData.sim_taux_renegocie) || 0,
        sim_ira_mois: parseInt(currentFormData.sim_ira_mois) || 0,
        sim_comptabilite: parseFloat(currentFormData.sim_comptabilite) || 600,
        sim_assurance_pne: parseFloat(currentFormData.sim_assurance_pne) || 400,
        sim_gestion_locative: parseFloat(currentFormData.sim_gestion_locative) || 0,
        sim_charges_diverses: parseFloat(currentFormData.sim_charges_diverses) || 0,
        statut_bail: currentFormData.statut_bail || "en_cours",
        vente_fonds_commerce: currentFormData.vente_fonds_commerce || false,
        montant_vente_fonds_commerce: parseFloat(currentFormData.montant_vente_fonds_commerce) || 0,
        date_vente_fonds_commerce: currentFormData.date_vente_fonds_commerce || "",
        marche_quartier_nom: currentFormData.marche_quartier_nom || "",
        marche_prix_m2_median: parseFloat(currentFormData.marche_prix_m2_median) || 0,
        marche_prix_m2_bas: parseFloat(currentFormData.marche_prix_m2_bas) || 0,
        marche_prix_m2_haut: parseFloat(currentFormData.marche_prix_m2_haut) || 0,
        marche_evolution_1an: parseFloat(currentFormData.marche_evolution_1an) || 0,
        marche_evolution_5ans: parseFloat(currentFormData.marche_evolution_5ans) || 0,
        marche_offre_bas: parseFloat(currentFormData.marche_offre_bas) || 0,
        marche_offre_moyenne: parseFloat(currentFormData.marche_offre_moyenne) || 0,
        marche_offre_haut: parseFloat(currentFormData.marche_offre_haut) || 0,
        marche_baux_bas: parseFloat(currentFormData.marche_baux_bas) || 0,
        marche_baux_moyenne: parseFloat(currentFormData.marche_baux_moyenne) || 0,
        marche_baux_haut: parseFloat(currentFormData.marche_baux_haut) || 0,
      };
      return data;
  };

  // À l'ouverture de l'éditeur : panneau ouvert d'emblée pour un nouveau
  // projet (rien à montrer sur la page), fermé sinon ; aperçu remis à zéro.
  useEffect(() => {
    if (isDialogOpen) setPanneauOuvert(!editingProject);
  }, [isDialogOpen]);

  // L'onglet Simulateur de la page va de pair avec ses champs : les chiffres à
  // gauche, le panneau de saisie à droite, ouvert d'office.
  useEffect(() => {
    if (!isDialogOpen) return;
    if (ongletPage === "simulateur") {
      setActiveTab("simulateur");
      setAssistantOuvert(false);
      setPanneauOuvert(true);
    } else if (activeTab === "simulateur") {
      setPanneauOuvert(false);
    }
  }, [ongletPage, isDialogOpen]);

  // Pendant l'édition, la bulle « Un problème ? » est masquée (voir index.css).
  useEffect(() => {
    if (isDialogOpen) document.body.dataset.editeurProjet = "1";
    else delete document.body.dataset.editeurProjet;
    return () => { delete document.body.dataset.editeurProjet; };
  }, [isDialogOpen]);

  // Un chiffre modifié directement sur la page : on met à jour le formulaire
  // et on rafraîchit la page dans la foulée, sans passer par le panneau.
  // Écrit une valeur par chemin pointé (« bail_admin_fields.2.value »), en
  // recopiant chaque niveau traversé pour ne jamais muter l'état en place.
  const ecrireChemin = (racine, chemin, valeur) => {
    const cles = String(chemin).split(".");
    const copie = Array.isArray(racine) ? [...racine] : { ...racine };
    let courant = copie;
    for (let i = 0; i < cles.length - 1; i++) {
      const suivant = courant[cles[i]];
      courant[cles[i]] = Array.isArray(suivant) ? [...suivant] : { ...(suivant || {}) };
      courant = courant[cles[i]];
    }
    courant[cles[cles.length - 1]] = valeur;
    return copie;
  };

  const modifierChamp = (champ, valeur, enregistrer = false) => {
    setHistorique((h) => [...h.slice(-29), formData]); // 30 pas conservés
    setModifieDepuis(true);
    let suivant = ecrireChemin(formData, champ, valeur);
    // Le loyer au m² est un ratio : le saisir revient à fixer le loyer annuel.
    if (champ === "loyer_m2_an") {
      const surface = parseFloat(suivant.sim_surface) || parseFloat(suivant.surface_m2) || 0;
      const parM2 = parseFloat(valeur) || 0;
      if (surface > 0 && parM2 > 0) suivant = { ...suivant, sim_loyer_initial_ht: Math.round(parM2 * surface) };
    }
    setFormData(suivant);
    try {
      setApercuProjet({ ...(editingProject || {}), ...construireDonnees(suivant), id: editingProject?.id || "apercu" });
    } catch { /* valeur incomplète : la page garde son état précédent */ }
    // Entrée vaut validation : on enregistre avec la valeur explicite, sans
    // attendre que l'état du formulaire soit propagé.
    if (enregistrer) handleSubmit({}, { source: suivant, discret: true });
  };

  // `source` explicite : après un enregistrement, `formData` de la fermeture est
  // encore l'ancien état — s'y fier ferait réapparaître la valeur précédente.
  // Retour en arrière : on restaure l'état précédent et on l'enregistre, pour
  // que la page et la base disent la même chose.
  const annulerDerniereModification = () => {
    if (!historique.length) return;
    const precedent = historique[historique.length - 1];
    setHistorique((h) => h.slice(0, -1));
    setFormData(precedent);
    rafraichirApercu(precedent);
    if (editingProject) handleSubmit({}, { source: precedent, discret: true });
  };

  // L'assistant traduit une demande en langage naturel (« ajoute Hauteur sous
  // plafond dans l'onglet Bien, comme les chiffres du haut ») en champs
  // personnalisés, placés dans l'onglet demandé et dans le style demandé.
  const ZONES_ASSISTANT = "secteur, marche, bien, locataire, bail, copropriete, diagnostique, documents_projet";
  const lancerAssistant = async () => {
    if (!assistantPrompt.trim()) return;
    setAssistantEnCours(true);
    try {
      const reponse = await base44.integrations.Core.InvokeLLM({
        prompt: `Tu ajoutes des champs personnalisés à une fiche de projet immobilier commercial.\n\n` +
          `Demande : « ${assistantPrompt.trim()} »\n\n` +
          `Projet : ${formData.titre || "sans titre"}${formData.adresse_complete ? ` — ${formData.adresse_complete}` : ""}.\n\n` +
          `Renvoie la liste des champs à créer. « zone » est l'onglet de destination parmi : ${ZONES_ASSISTANT}. ` +
          `« label » est le libellé affiché, « valeur » la valeur si la demande en précise une (sinon chaîne vide). ` +
          `« style » vaut "chiffre" quand la demande évoque une présentation en grands chiffres ` +
          `(« comme les chiffres du haut », « en indicateurs », « en KPI »), sinon "ligne". ` +
          `N'invente aucune donnée chiffrée sur le bien : laisse « valeur » vide si elle n'est pas dans la demande.`,
        response_json_schema: {
          type: "object",
          properties: {
            champs: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  label: { type: "string" },
                  valeur: { type: "string" },
                  zone: { type: "string" },
                  style: { type: "string" },
                },
                required: ["label", "zone"],
              },
            },
          },
          required: ["champs"],
        },
      });
      const nouveaux = (reponse?.champs || [])
        .filter((c) => c?.label)
        .map((c, i) => ({
          id: `cp_${Date.now()}_${i}`,
          label: String(c.label),
          valeur: String(c.valeur || ""),
          zone: ZONES_ASSISTANT.includes(c.zone) ? c.zone : ongletPage,
          style: c.style === "chiffre" ? "chiffre" : "ligne",
        }));
      if (!nouveaux.length) {
        toast.error("Aucun champ n'a pu être créé à partir de cette demande.");
        return;
      }
      setHistorique((h) => [...h.slice(-29), formData]);
      const liste = [...(formData.champs_personnalises || []), ...nouveaux];
      const suivant = { ...formData, champs_personnalises: liste };
      setFormData(suivant);
      rafraichirApercu(suivant);
      if (editingProject) handleSubmit({}, { source: suivant, discret: true });
      toast.success(`${nouveaux.length} champ${nouveaux.length > 1 ? "s" : ""} ajouté${nouveaux.length > 1 ? "s" : ""}`);
      setAssistantPrompt("");
    } catch (e) {
      toast.error(e?.message || "L'assistant n'a pas pu répondre");
    } finally {
      setAssistantEnCours(false);
    }
  };

  const rafraichirApercu = (source) => {
    const donnees = source || formData;
    try {
      setApercuProjet({ ...(editingProject || {}), ...construireDonnees(donnees), id: editingProject?.id || "apercu" });
    } catch { /* formulaire incomplet : on garde l'aperçu précédent */ }
  };

  // `source` : instantané complet du formulaire. Les modifications faites sur la
  // page passent le leur, sinon on fusionnerait sur un état déjà périmé et
  // l'enregistrement repartirait avec l'ancienne valeur.
  // `discret` : pas de notification (édition sur place, assistant, annulation).
  const handleSubmit = async (overrides = {}, { source = null, discret = false } = {}) => {
    const currentFormData = source || { ...formData, ...overrides };
    if (!currentFormData.titre) {
      toast.error("Veuillez remplir au minimum le titre du projet");
      return;
    }
    if (!currentFormData.admin_principal && !editingProject) {
      setShowAdminPicker(true);
      return;
    }

    try {
      const data = construireDonnees(currentFormData);


      const isNewAssignment = !editingProject || editingProject.client_email !== currentFormData.client_email;
      const previousClientEmails = editingProject?.client_emails || [];
      const newClientEmails = currentFormData.client_emails.filter(email => !previousClientEmails.includes(email));

      if (isNewAssignment && currentFormData.client_email) {
        try {
          await base44.functions.invoke('sendProjectAssignmentEmail', {
            clientEmail: currentFormData.client_email, projectTitle: currentFormData.titre, projectId: editingProject?.id
          });
        } catch (error) { console.error("Erreur envoi email:", error); }
      }
      for (const email of newClientEmails) {
        try {
          await base44.functions.invoke('sendProjectAssignmentEmail', {
            clientEmail: email, projectTitle: currentFormData.titre, projectId: editingProject?.id
          });
        } catch (error) { console.error("Erreur envoi email:", error); }
      }

      if (editingProject) {
        const maj = await updateProjectMutation.mutateAsync({ id: editingProject.id, data });
        setEditingProject({ ...editingProject, ...data, ...(maj || {}) });
        if (!discret) toast.success("Projet enregistré", { duration: 1800 });
      } else {
        const newProject = await createProjectMutation.mutateAsync(data);
        if (!discret) toast.success("Projet créé", { duration: 1800 });
        setEditingProject(newProject);
      }
      setFormData(currentFormData);
      rafraichirApercu(currentFormData);
      setEnregistreLe(new Date());
      setModifieDepuis(false);


    } catch (error) {
      toast.error("Erreur lors de l'enregistrement", { description: error.message || "Une erreur est survenue" });
    }
  };

  const editorTabs = [
    { value: "ai-extract", label: "IA", accent: "teal" },
    { value: "images", label: "Images" },
    { value: "informations", label: "Bien" },
    { value: "secteur", label: "Secteur" },
    { value: "marche", label: "Marché" },
    { value: "locataire", label: "Locataire" },
    { value: "bail", label: "Analyse du bail" },
    { value: "copropriete", label: "Copropriété" },
    { value: "diagnostique", label: "Diagnostique" },
    { value: "docs_projet", label: "Documents" },
    { value: "simulateur", label: "Simulateur" },
  ];
  // Onglets de la page projet, dans l'ordre de la barre.
  const ONGLETS_PAGE = [
    { value: "secteur", label: "Secteur" }, { value: "marche", label: "Marché" },
    { value: "bien", label: "Bien" }, { value: "locataire", label: "Locataire" },
    { value: "bail", label: "Analyse du bail" }, { value: "copropriete", label: "Copropriété" },
    { value: "diagnostique", label: "Diagnostique" }, { value: "documents_projet", label: "Documents" },
  ];
  // Onglet de la page projet -> onglet du panneau de champs correspondant.
  const FORM_PAR_ONGLET = {
    bien: "informations", secteur: "secteur", marche: "marche", locataire: "locataire",
    bail: "bail", copropriete: "copropriete", diagnostique: "diagnostique", documents_projet: "docs_projet",
    simulateur: "simulateur",
  };
  const projetAffiche = apercuProjet || editingProject || null;

  if (isDialogOpen) {
    const closeEditor = () => { setIsDialogOpen(false); resetForm(); setPanneauOuvert(false); const url = new URL(window.location); url.searchParams.delete('action'); window.history.replaceState({}, '', url); };
    const goToProjectsList = () => { setIsDialogOpen(false); resetForm(); setPanneauOuvert(false); navigate(createPageUrl("AdminProjets")); };
    const isSaving = createProjectMutation.isPending || updateProjectMutation.isPending;
    const ouvrirPanneau = (ongletFormulaire) => { if (ongletFormulaire) setActiveTab(ongletFormulaire); setAssistantOuvert(false); setPanneauOuvert(true); };
    const fermerPanneau = () => { setPanneauOuvert(false); rafraichirApercu(formData); };
    return (
      <div className="h-screen flex flex-col bg-[#000000] text-[#f2f3f5] overflow-hidden">
        {/* Barre d'actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 md:px-7 py-3 border-b border-[#1f2228] flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <img src="/logo-klocka.svg" alt="" className="w-[18px] h-[18px] rounded-[4px]" draggable={false} />
            <div className="min-w-0">
              <p className="m-0 text-[15px] font-medium truncate">{formData.titre || (editingProject ? "Projet" : "Nouveau projet")}</p>
              <p className="m-0 text-[11px] text-[#6a7180] max-md:hidden">Cliquez une valeur pour la modifier sur place — Entrée valide, Enregistrer sauvegarde.</p>
            </div>
          </div>
          <div className="flex gap-2 items-center flex-shrink-0">
            <span className="text-[11.5px] mr-1 hidden lg:block" title="État de l'enregistrement">
              {modifieDepuis
                ? <span className="text-[#96c0b8]">Modifications non enregistrées</span>
                : enregistreLe
                  ? <span className="text-[#c3ddd6]">Enregistré à {enregistreLe.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</span>
                  : null}
            </span>
            <button
              onClick={annulerDerniereModification}
              disabled={!historique.length}
              title={historique.length ? "Annuler la dernière modification" : "Aucune modification à annuler"}
              className="inline-flex items-center gap-2 bg-transparent border border-[#f2f3f5]/[0.14] text-[#c9cdd6] rounded-md px-4 py-2.5 text-[13.5px] font-semibold hover:bg-[#f2f3f5]/[0.06] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Undo2 className="w-4 h-4" />
              Retour en arrière
            </button>
            <button
              onClick={() => { setAssistantOuvert(true); setPanneauOuvert(false); }}
              title="Créer des champs personnalisés en langage naturel"
              className="inline-flex items-center gap-2 bg-transparent border border-[#96c0b8]/50 text-[#c3ddd6] rounded-md px-4 py-2.5 text-[13.5px] font-semibold hover:bg-[#96c0b8]/[0.12] transition-colors"
            >
              <Sparkles className="w-4 h-4" />
              Assistant
            </button>
            <button onClick={() => ouvrirPanneau(FORM_PAR_ONGLET[ongletPage] || "informations")} className="bg-transparent border border-[#f2f3f5]/[0.14] text-[#c9cdd6] rounded-md px-4 py-2.5 text-[13.5px] font-semibold hover:bg-[#f2f3f5]/[0.06] transition-colors">Modifier les informations</button>
            <button onClick={closeEditor} className="bg-transparent border border-[#f2f3f5]/[0.14] text-[#c9cdd6] rounded-md px-4 py-2.5 text-[13.5px] font-semibold hover:bg-[#f2f3f5]/[0.06] transition-colors">Annuler</button>
            {editingProject && (
              <button onClick={goToProjectsList} className="bg-transparent border border-[#f2f3f5]/[0.14] text-[#c9cdd6] rounded-md px-4 py-2.5 text-[13.5px] font-semibold hover:bg-[#f2f3f5]/[0.06] transition-colors">Retour aux projets</button>
            )}
            <button
              onClick={() => setAssignerOuvert(true)}
              className="bg-transparent border border-[#96c0b8]/50 text-[#96c0b8] rounded-md px-4 py-2.5 text-[13.5px] font-semibold hover:bg-[#96c0b8]/[0.08] transition-colors"
            >
              Assigner un client
            </button>
            {editingProject?.id && (
              <BoutonMonday
                projetId={editingProject.id}
                dejaPose={!!editingProject.monday_item_id}
                className="h-auto py-2.5 px-4 text-[13.5px] font-semibold"
              />
            )}
            <button onClick={() => handleSubmit()} disabled={!formData.titre || isSaving}
              className="inline-flex items-center gap-2 text-[#0f1114] rounded-md px-5 py-2.5 text-[13.5px] font-bold hover:brightness-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed" style={{ background: "#f2f3f5" }}>
              {isSaving ? <><Loader2 className="w-4 h-4 animate-spin" />Enregistrement...</> : "Enregistrer"}
            </button>
          </div>
        </div>

        <DialogueAssignerClient
          ouvert={assignerOuvert}
          onClose={() => setAssignerOuvert(false)}
          users={users}
          formData={formData}
          onValider={(champs) => {
            // Enregistré tout de suite : c'est handleSubmit qui prévient les
            // nouveaux assignés, comme depuis le panneau.
            setFormData((f) => ({ ...f, ...champs }));
            handleSubmit(champs);
          }}
        />

        {/* La page projet, pleine largeur — les valeurs s'éditent sur place ;
            le panneau ne s'ouvre que par le bouton « Modifier les informations ». */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {ongletPage === "simulateur" ? (
            <div className="max-w-[1100px] mx-auto px-4 md:px-6 pb-8">
              {/* La barre d'onglets de la page reste accessible au-dessus des chiffres. */}
              <div className="flex flex-wrap gap-x-7 gap-y-2 pt-6 pb-6 overflow-x-auto">
                {[...ONGLETS_PAGE, { value: "simulateur", label: "Simulateur" }].map((o) => (
                  <button key={o.value} onClick={() => setOngletPage(o.value)}
                    className={`text-[11px] tracking-[0.16em] uppercase py-1 border-b whitespace-nowrap transition-colors
                      ${ongletPage === o.value ? "border-[#96c0b8] text-[#f2f3f5]" : "border-transparent text-[#9298a6] hover:text-[#f2f3f5]"}`}>
                    {o.label}
                  </button>
                ))}
              </div>
              <ProjectSimulatorPreview formData={formData} travauxList={travauxList} />
            </div>
          ) : projetAffiche ? (
            <ProjetContent
              project={projetAffiche}
              isAdmin={false}
              showAsClient
              onOngletChange={setOngletPage}
              modeEdition
              onChamp={modifierChamp}
              ongletsSupplementaires={[{ value: "simulateur", label: "Simulateur" }]}
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <p className="text-[#6a7180] text-sm max-w-sm text-center px-6">
                Renseignez le projet dans le panneau, puis appuyez sur Entrée ou Enregistrer : la page projet apparaîtra ici.
              </p>
            </div>
          )}
        </div>

        {/* Assistant — panneau latéral droit */}
        <div className={`fixed inset-y-0 right-0 z-[55] w-full md:w-[420px] bg-[#0f1114] border-l border-[#1f2228] flex flex-col transform transition-transform duration-300 ${assistantOuvert ? "translate-x-0 shadow-2xl" : "translate-x-full"}`}>
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#1f2228] flex-shrink-0">
            <span className="flex items-center gap-2 text-[15px] font-medium">
              <Sparkles className="w-4 h-4 text-[#c3ddd6]" />
              Assistant
            </span>
            <button onClick={() => setAssistantOuvert(false)} className="text-[#9298a6] hover:text-[#f2f3f5] transition-colors" title="Fermer">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto px-5 py-5 space-y-4">
            <p className="text-[#9298a6] text-[13px] leading-[1.65] m-0">
              Décrivez les champs à créer, l'onglet où les placer et leur présentation —
              en lignes ou en grands chiffres comme la bande du haut. Ils sont ensuite
              modifiables au clic, déplaçables au glisser-déposer et supprimables.
            </p>
            <textarea
              rows={5}
              value={assistantPrompt}
              onChange={(e) => setAssistantPrompt(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) lancerAssistant(); }}
              placeholder="Ex. : ajoute « Hauteur sous plafond » et « Vitrine (ml) » dans l'onglet Bien, présentés comme les chiffres du haut."
              className="w-full bg-[#000000] border border-[#1f2228] focus:border-[#96c0b8] rounded-md px-3.5 py-3 text-[14px] text-[#f2f3f5] outline-none placeholder:text-[#3a3f4a] transition-colors"
            />
            <div className="border-t border-[#1f2228] pt-4">
              <p className="text-[10px] tracking-[0.18em] uppercase text-[#6a7180] mb-2">Exemples</p>
              <div className="space-y-1.5">
                {[
                  "Ajoute « Hauteur sous plafond » dans l'onglet Bien.",
                  "Dans Marché, ajoute « Flux piéton » et « Vacance commerciale » comme les chiffres du haut.",
                  "Ajoute « Bailleur » et « Syndic » dans l'onglet Copropriété.",
                ].map((ex) => (
                  <button key={ex} onClick={() => setAssistantPrompt(ex)}
                    className="block w-full text-left text-[12.5px] leading-[1.5] text-[#9298a6] hover:text-[#f2f3f5] bg-[#000000] border border-[#1f2228] hover:border-[#96c0b8]/50 rounded px-3 py-2 transition-colors">
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-t border-[#1f2228] flex-shrink-0">
            <span className="text-[11px] text-[#6a7180]">⌘/Ctrl + Entrée</span>
            <button onClick={lancerAssistant} disabled={assistantEnCours || !assistantPrompt.trim()}
              className="inline-flex items-center gap-2 text-[#0f1114] rounded-md px-5 py-2.5 text-[13.5px] font-bold disabled:opacity-50 hover:brightness-95 transition-all" style={{ background: "#f2f3f5" }}>
              {assistantEnCours ? <><Loader2 className="w-4 h-4 animate-spin" />Création…</> : "Créer les champs"}
            </button>
          </div>
        </div>

        {/* Panneau latéral des champs */}
        <div
          className={`fixed inset-y-0 right-0 z-50 w-full md:w-[600px] bg-[#0f1114] border-l border-[#1f2228] flex flex-col transform transition-transform duration-300 ${panneauOuvert ? "translate-x-0 shadow-2xl" : "translate-x-full"}`}
          onInput={() => setModifieDepuis(true)}
          onKeyDown={(e) => { if (e.key === "Enter" && e.target?.tagName !== "TEXTAREA" && e.target?.tagName !== "BUTTON") rafraichirApercu(formData); }}
        >
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#1f2228] flex-shrink-0">
            <span className="text-[15px] font-medium">{editorTabs.find(t => t.value === activeTab)?.label || "Modifier"}</span>
            <button onClick={fermerPanneau} className="text-[#9298a6] hover:text-[#f2f3f5] transition-colors" title="Fermer — met la page à jour">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex gap-1.5 px-4 py-2.5 border-b border-[#1f2228] overflow-x-auto flex-shrink-0">
            {editorTabs.map((t) => (
              <button key={t.value} onClick={() => setActiveTab(t.value)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-[12.5px] whitespace-nowrap transition-colors ${activeTab === t.value ? "text-[#0f1114] font-semibold bg-[#f2f3f5]" : "bg-[#f2f3f5]/[0.05] text-[#9298a6] hover:text-[#f2f3f5]"}`}>
                {t.label}
              </button>
            ))}
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto px-5 py-5">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsContent value="ai-extract" className="space-y-6 mt-0">
                <div className="p-6 bg-[#0f1114] rounded-none border border-[#1f2228]">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-12 h-12 bg-[#f2f3f5]/[0.05] rounded-md flex items-center justify-center">
                      <Brain className="w-6 h-6 text-[#9298a6]" />
                    </div>
                    <div>
                      <h3 className="text-xl text-[#f2f3f5] font-light">Création assistée par IA</h3>
                      <p className="text-[#f2f3f5]/30 text-sm">Collez du texte ou importez des documents pour remplir automatiquement</p>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <FField label="Importer depuis Google Drive">
                      <div className="flex gap-2">
                        <FInput value={driveSearchAddress} onChange={(e) => setDriveSearchAddress(e.target.value)} placeholder="Ex: 123 rue de la Paix, Paris" className="flex-1" />
                        <Button onClick={handleSearchGoogleDrive} disabled={isSearchingDrive || !driveSearchAddress.trim()} className="bg-[#f2f3f5]/[0.06] border border-[#2c3139] hover:bg-[#f2f3f5]/[0.1] text-[#f2f3f5] flex-shrink-0">
                          {isSearchingDrive ? <Loader2 className="w-4 h-4 animate-spin" /> : <><FolderSearch className="w-4 h-4 mr-2" />Chercher</>}
                        </Button>
                      </div>
                    </FField>
                    <FField label="Collez ici les informations du projet">
                      <FTextarea value={aiFullText} onChange={(e) => setAiFullText(e.target.value)} rows={10} placeholder="Collez ici le texte du bail, les informations de l'annonce, etc." className="min-h-[200px]" />
                    </FField>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <FField className="flex-1">
                          <FInput value={newAiDocUrl} onChange={(e) => setNewAiDocUrl(e.target.value)} placeholder="Ou ajoutez une URL de document : https://exemple.com/document.pdf" />
                        </FField>
                        <Button onClick={() => { if (newAiDocUrl.trim()) { setAiDocuments([...aiDocuments, convertGoogleDriveUrl(newAiDocUrl.trim())]); setNewAiDocUrl(""); } }} className="bg-[#f2f3f5]/[0.06] border border-[#2c3139] hover:bg-[#f2f3f5]/[0.1] h-[52px] flex-shrink-0"><Plus className="w-4 h-4" /></Button>
                      </div>
                      {aiDocuments.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {aiDocuments.map((url, idx) => (
                            <div key={idx} className="flex items-center gap-2 bg-[#f2f3f5]/[0.03] text-[#f2f3f5]/60 px-3 py-1.5 rounded-lg text-sm border border-[#1f2228]">
                              <FileText className="w-4 h-4" /><span>Document {idx + 1}</span>
                              <button onClick={() => setAiDocuments(aiDocuments.filter((_, i) => i !== idx))} className="text-red-400 hover:text-red-300"><X className="w-3 h-3" /></button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <button onClick={handleFullAIGeneration} disabled={isGeneratingAI || (!aiFullText && aiDocuments.length === 0)} className="w-full h-12 bg-[#f2f3f5]/[0.06] border border-[#2c3139] hover:bg-[#f2f3f5]/[0.1] text-[#f2f3f5] rounded-md transition-all text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                      {isGeneratingAI ? <><Loader2 className="w-4 h-4 animate-spin" />Analyse en cours...</> : <><Sparkles className="w-4 h-4 text-[#9298a6]" />Extraire les informations avec l'IA</>}
                    </button>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="informations"><motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}><ProjectFormInfoTab formData={formData} setFormData={setFormData} users={users} /></motion.div></TabsContent>

              <TabsContent value="secteur" className="space-y-6 mt-0">
                {/* Génération IA Secteur */}
                <div className="p-5 bg-[#f2f3f5]/[0.03] rounded-md border border-[#22262d]">
                  <div className="flex items-center gap-3 mb-3">
                    <Sparkles className="w-5 h-5 text-[#9298a6]" />
                    <h4 className="text-[#f2f3f5] text-sm font-medium">Générer les infos secteur avec l'IA</h4>
                  </div>
                  <div className="flex gap-2">
                    <FField className="flex-1">
                      <FInput
                        value={formData.adresse_complete}
                        onChange={(e) => setFormData({...formData, adresse_complete: e.target.value})}
                        placeholder="Adresse complète du projet (ex: 12 rue de la Paix, Paris)"
                      />
                    </FField>
                    <Button
                      disabled={isGeneratingAI || !formData.adresse_complete?.trim()}
                      onClick={async () => {
                        setIsGeneratingAI(true);
                        try {
                          const result = await base44.integrations.Core.InvokeLLM({
                            prompt: `Tu es un expert en immobilier commercial en France. À partir de l'adresse suivante, génère des informations détaillées sur la VILLE et le SECTEUR uniquement.\n\nAdresse: ${formData.adresse_complete}\n\nGénère:\n- ville_secteur_champ1: nom de la ville\n- ville_secteur_champ2: département ou arrondissement\n- ville_secteur_champ3: région ou zone géographique\n- description_ville: description détaillée de la ville (5-6 lignes, démographie, économie, attractivité)\n- description_secteur: description détaillée du secteur/quartier (5-6 lignes, commerces, transports, dynamisme)\n\nRéponds UNIQUEMENT avec le JSON.`,
                            add_context_from_internet: true,
                            response_json_schema: {
                              type: "object",
                              properties: {
                                ville_secteur_champ1: { type: "string" },
                                ville_secteur_champ2: { type: "string" },
                                ville_secteur_champ3: { type: "string" },
                                description_ville: { type: "string" },
                                description_secteur: { type: "string" }
                              }
                            }
                          });
                          const updated = { ...formData };
                          if (result.ville_secteur_champ1) updated.ville_secteur_champ1 = result.ville_secteur_champ1;
                          if (result.ville_secteur_champ2) updated.ville_secteur_champ2 = result.ville_secteur_champ2;
                          if (result.ville_secteur_champ3) updated.ville_secteur_champ3 = result.ville_secteur_champ3;
                          if (result.description_ville) updated.description_ville = result.description_ville;
                          if (result.description_secteur) updated.description_secteur = result.description_secteur;
                          setFormData(updated);
                          toast.success("Informations secteur générées !");
                        } catch (error) {
                          toast.error("Erreur lors de la génération : " + (error.message || error));
                        } finally {
                          setIsGeneratingAI(false);
                        }
                      }}
                      className="bg-[#f2f3f5]/[0.06] border border-[#2c3139] hover:bg-[#f2f3f5]/[0.1] text-[#f2f3f5] flex-shrink-0 h-[52px]"
                    >
                      {isGeneratingAI ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Sparkles className="w-4 h-4 mr-2 text-[#9298a6]" />Générer</>}
                    </Button>
                  </div>
                </div>

                {/* Ville & Secteur */}
                <div className="space-y-4">
                  <h3 className="text-lg text-[#f2f3f5]">Ville & Secteur</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <FField><FInput value={formData.ville_secteur_champ1} onChange={(e) => setFormData({...formData, ville_secteur_champ1: e.target.value})} placeholder="Champ 1 (ex: Ville)" /></FField>
                    <FField><FInput value={formData.ville_secteur_champ2} onChange={(e) => setFormData({...formData, ville_secteur_champ2: e.target.value})} placeholder="Champ 2 (ex: Département)" /></FField>
                    <FField><FInput value={formData.ville_secteur_champ3} onChange={(e) => setFormData({...formData, ville_secteur_champ3: e.target.value})} placeholder="Champ 3 (ex: Région)" /></FField>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <FField label="Description de la ville"><FTextarea value={formData.description_ville} onChange={(e) => setFormData({...formData, description_ville: e.target.value})} rows={4} placeholder="Description de la ville..." /></FField>
                    <FField label="Description du secteur"><FTextarea value={formData.description_secteur} onChange={(e) => setFormData({...formData, description_secteur: e.target.value})} rows={4} placeholder="Description du secteur..." /></FField>
                  </div>
                </div>

                <div className="space-y-4 pt-4 border-t border-[#1f2228]">
                  <div className="flex items-center justify-between">
                    <Label className="text-[#f2f3f5]">Notes secteur</Label>
                    <Button type="button" variant="outline" size="sm" onClick={() => setFormData({...formData, notes_secteur: [...(formData.notes_secteur || []), { titre: "", contenu: "" }]})} className="border-[#1f2228] text-[#f2f3f5]/30 hover:text-[#f2f3f5] hover:border-[#3a3f4a]"><Plus className="w-4 h-4 mr-1" />Ajouter une note</Button>
                  </div>
                  {(formData.notes_secteur || []).map((note, idx) => (
                    <div key={idx} className="p-4 bg-[#f2f3f5]/[0.02] rounded-lg space-y-3">
                      <div className="flex items-center gap-3">
                        <FField className="flex-1"><FInput value={note.titre} onChange={(e) => { const u = [...formData.notes_secteur]; u[idx].titre = e.target.value; setFormData({...formData, notes_secteur: u}); }} placeholder="Titre..." /></FField>
                        <Button variant="ghost" size="icon" onClick={() => setFormData({...formData, notes_secteur: formData.notes_secteur.filter((_, i) => i !== idx)})} className="text-red-500 hover:bg-red-500/10"><X className="w-4 h-4" /></Button>
                      </div>
                      <FField><FTextarea value={note.contenu} onChange={(e) => { const u = [...formData.notes_secteur]; u[idx].contenu = e.target.value; setFormData({...formData, notes_secteur: u}); }} placeholder="Contenu..." rows={3} /></FField>
                    </div>
                  ))}
                </div>
                <div>
                  <h3 className="text-lg mb-4 text-[#f2f3f5]">Bien</h3>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <FField><FInput value={formData.bien_champ1} onChange={(e) => setFormData({...formData, bien_champ1: e.target.value})} placeholder="Champ 1 (Bien)" /></FField>
                      <FField><FInput value={formData.bien_champ2} onChange={(e) => setFormData({...formData, bien_champ2: e.target.value})} placeholder="Champ 2 (Bien)" /></FField>
                      <FField><FInput value={formData.bien_champ3} onChange={(e) => setFormData({...formData, bien_champ3: e.target.value})} placeholder="Champ 3 (Bien)" /></FField>
                    </div>
                    <FField label="Description bien"><FTextarea value={formData.description_bien} onChange={(e) => setFormData({...formData, description_bien: e.target.value})} rows={4} placeholder="Description du bien..." /></FField>
                  </div>
                </div>
                <div className="space-y-4 pt-4 border-t border-[#1f2228]">
                  <div className="flex items-center justify-between">
                    <Label className="text-[#f2f3f5]">Notes bien</Label>
                    <Button type="button" variant="outline" size="sm" onClick={() => setFormData({...formData, notes_bien: [...(formData.notes_bien || []), { titre: "", contenu: "" }]})} className="border-[#1f2228] text-[#f2f3f5]/30 hover:text-[#f2f3f5] hover:border-[#3a3f4a]"><Plus className="w-4 h-4 mr-1" />Ajouter une note</Button>
                  </div>
                  {(formData.notes_bien || []).map((note, idx) => (
                    <div key={idx} className="p-4 bg-[#f2f3f5]/[0.02] rounded-lg space-y-3">
                      <div className="flex items-center gap-3">
                        <FField className="flex-1"><FInput value={note.titre} onChange={(e) => { const u = [...formData.notes_bien]; u[idx].titre = e.target.value; setFormData({...formData, notes_bien: u}); }} placeholder="Titre..." /></FField>
                        <Button variant="ghost" size="icon" onClick={() => setFormData({...formData, notes_bien: formData.notes_bien.filter((_, i) => i !== idx)})} className="text-red-500 hover:bg-red-500/10"><X className="w-4 h-4" /></Button>
                      </div>
                      <FField><FTextarea value={note.contenu} onChange={(e) => { const u = [...formData.notes_bien]; u[idx].contenu = e.target.value; setFormData({...formData, notes_bien: u}); }} placeholder="Contenu..." rows={3} /></FField>
                    </div>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="locataire"><motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}><ProjectFormLocataireTab formData={formData} setFormData={setFormData} /></motion.div></TabsContent>
              <TabsContent value="bail"><motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}><ProjectFormLocataireTab formData={formData} setFormData={setFormData} /></motion.div></TabsContent>
              <TabsContent value="copropriete"><motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}><ProjectFormCoproTab formData={formData} setFormData={setFormData} /></motion.div></TabsContent>
              <TabsContent value="marche"><motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}><ProjectFormMarcheTab formData={formData} setFormData={setFormData} /></motion.div></TabsContent>
              <TabsContent value="diagnostique"><motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}><ProjectFormDiagnosticsTab formData={formData} setFormData={setFormData} /></motion.div></TabsContent>
              <TabsContent value="docs_projet"><motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}><ProjectFormDocumentsTab formData={formData} setFormData={setFormData} /></motion.div></TabsContent>
              <TabsContent value="images"><motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}><ProjectFormImagesTab formData={formData} setFormData={setFormData} /></motion.div></TabsContent>
              <TabsContent value="simulateur"><motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}><ProjectFormSimulateurTab formData={formData} setFormData={setFormData} travauxList={travauxList} setTravauxList={setTravauxList} /></motion.div></TabsContent>
            </Tabs>
          </div>
          <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-t border-[#1f2228] flex-shrink-0">
            <span className="text-[11px] text-[#6a7180]">Entrée met la page à jour sans enregistrer.</span>
            <button onClick={() => handleSubmit()} disabled={!formData.titre || isSaving}
              className="inline-flex items-center gap-2 text-[#0f1114] rounded-md px-5 py-2.5 text-[14px] font-bold disabled:opacity-50 hover:brightness-95 transition-all" style={{ background: "#f2f3f5" }}>
              {isSaving ? <><Loader2 className="w-4 h-4 animate-spin" />Enregistrement...</> : "Enregistrer"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- Rendu de la liste : filtres appliqués une seule fois, réutilisés par le
  // bandeau de chiffres et par la grille.
  const projetsVisibles = projects.filter((project) => {
    const q = searchTerm.toLowerCase();
    const matchSearch = !searchTerm
      || project.titre?.toLowerCase().includes(q)
      || project.adresse_complete?.toLowerCase().includes(q)
      || project.client_email?.toLowerCase().includes(q);
    const matchStatus = statusFilter === "all" || project.statut === statusFilter;
    const matchArchived = showArchived ? project.archived : !project.archived;
    return matchSearch && matchStatus && matchArchived;
  });

  const actifs = projects.filter((p) => !p.archived);
  const compteur = (statut) => actifs.filter((p) => p.statut === statut).length;
  const nbArchives = projects.filter((p) => p.archived).length;

  const FILTRES = [
    { v: "all", l: "Tous", n: actifs.length },
    { v: "prospect", l: "Prospect", n: compteur("prospect") },
    { v: "analyse", l: "Analyse", n: compteur("analyse") },
    { v: "negociation", l: "Négociation", n: compteur("negociation") },
    { v: "financement", l: "Financement", n: compteur("financement") },
    { v: "signe", l: "Signé", n: compteur("signe") },
  ];

  const CHIFFRES = [
    { valeur: actifs.length, label: "Projets actifs" },
    { valeur: compteur("analyse") + compteur("negociation"), label: "En analyse ou négociation", accent: "text-[#c3ddd6]" },
    { valeur: compteur("financement"), label: "En financement" },
    { valeur: compteur("signe"), label: "Signés", accent: "text-[#96c0b8]" },
    { valeur: nbArchives, label: "Archivés", accent: "text-[#9298a6]" },
  ];

  return (
    <div className="projet-editorial min-h-screen bg-[#000000] text-[#f2f3f5] px-5 md:px-10 py-8 md:py-12">
      <div className="max-w-[1400px] mx-auto">
        {/* En-tête */}
        <div className="flex items-end justify-between gap-6 flex-wrap mb-8 max-md:mb-6">
          <div>
            <h1 className="text-[34px] max-md:text-[26px] font-light tracking-[-0.02em] leading-[1.05] text-[#f2f3f5] m-0">Gestion des projets</h1>
            <p className="text-[13.5px] leading-[1.7] text-[#9298a6] mt-2 mb-0 max-w-[520px]">Rechercher, filtrer et modifier les dossiers. Le survol d'une carte donne accès au simulateur, à l'aperçu client et au lien public.</p>
          </div>
          <button onClick={() => { resetForm(); setIsDialogOpen(true); }}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-[11px] tracking-[0.16em] uppercase bg-transparent border border-[#2c3139] text-[#f2f3f5] hover:bg-[#f2f3f5]/[0.08] transition-colors">
            <Plus className="w-4 h-4" strokeWidth={1.8} />
            Nouveau projet
          </button>
        </div>

        {/* Bandeau de chiffres */}
        <div className="flex flex-wrap border-t border-[#f2f3f5]/[0.35] mb-8 max-md:mb-6">
          {CHIFFRES.map((c, i) => (
            <div key={i} className={`flex-1 min-w-[130px] max-md:min-w-[46%] py-5 max-md:py-3.5 pr-5 ${i > 0 ? "md:border-l md:border-[#f2f3f5]/[0.12] md:pl-6" : ""}`}>
              <div className={`text-[26px] max-md:text-[20px] font-light ${c.accent || "text-[#f2f3f5]"}`} style={{ fontVariantNumeric: "tabular-nums" }}>{c.valeur}</div>
              <div className="text-[12px] text-[#9298a6] mt-1">{c.label}</div>
            </div>
          ))}
        </div>

        {/* Recherche + filtres */}
        <div className="mb-8 max-md:mb-6">
          <div className="flex items-center gap-3 border-b border-[#f2f3f5]/[0.18] focus-within:border-[#3a3f4a] transition-colors pb-2 mb-5">
            <FolderSearch className="w-4 h-4 text-[#6a7180] flex-shrink-0" />
            <input
              placeholder="Rechercher un projet, une adresse, un client…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-transparent border-none text-[#f2f3f5] outline-none placeholder:text-[#6a7180] text-[15px] py-1"
            />
            {searchTerm && (
              <button onClick={() => setSearchTerm("")} className="text-[#6a7180] hover:text-[#f2f3f5] transition-colors" title="Effacer">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-x-7 gap-y-2 flex-wrap">
            {FILTRES.map(({ v, l, n }) => (
              <button key={v} onClick={() => setStatusFilter(v)}
                className={`text-[11px] tracking-[0.16em] uppercase pb-1 border-b transition-colors ${statusFilter === v ? "text-[#f2f3f5] border-[#96c0b8]" : "text-[#9298a6] border-transparent hover:text-[#f2f3f5]"}`}>
                {l} <span className="text-[#6a7180]">{n}</span>
              </button>
            ))}
            <button onClick={() => setShowArchived(!showArchived)}
              className={`ml-auto inline-flex items-center gap-2 text-[11px] tracking-[0.16em] uppercase pb-1 border-b transition-colors ${showArchived ? "text-[#96c0b8] border-[#96c0b8]" : "text-[#9298a6] border-transparent hover:text-[#f2f3f5]"}`}>
              <Archive className="w-3.5 h-3.5" />
              {showArchived ? "Masquer les archivés" : `Archivés ${nbArchives}`}
            </button>
          </div>
        </div>

        {/* Grille */}
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-6 max-md:gap-4">
          {projetsVisibles.map((project, idx) => (
            <motion.div
              key={project.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: "easeOut", delay: Math.min(idx * 0.035, 0.35) }}
            >
              <AdminProjectCard project={project} onEdit={handleEdit} onDuplicate={handleDuplicate} onDelete={handleDelete} onArchive={handleArchive} onShadow={handleShadow} onShadowWithNav={handleShadowWithNav} shadowRecord={getShadowForProject(project.id)} />
              <ClientsCorrespondants
                clients={correspondances?.par_projet?.[project.id]}
                chargement={chargementCorrespondances}
                configure={correspondances?.configure}
                erreur={erreurCorrespondances}
              />
            </motion.div>
          ))}

          {erreurProjets && (
            <div className="col-span-full border-t border-[#f2f3f5]/[0.35] pt-10 pb-16 text-center">
              <Building2 className="w-8 h-8 text-[#f2f3f5]/15 mx-auto mb-5" />
              <h2 className="text-[22px] font-light text-[#f2f3f5] mb-2">Chargement impossible</h2>
              <p className="text-[#9298a6] text-sm mb-6">
                Les projets n'ont pas pu être récupérés. Vérifiez votre connexion, puis réessayez.
              </p>
              <button onClick={() => rechargerProjets()}
                className="text-[11px] tracking-[0.16em] uppercase text-[#c3ddd6] hover:text-[#f2f3f5] transition-colors">
                Réessayer
              </button>
            </div>
          )}

          {chargementProjets && !erreurProjets && (
            <div className="col-span-full pt-16 pb-16 flex justify-center">
              <div className="w-6 h-6 border-2 border-[#96c0b8]/30 border-t-[#96c0b8] rounded-full animate-spin" />
            </div>
          )}

          {!chargementProjets && !erreurProjets && projetsVisibles.length === 0 && (
            <div className="col-span-full border-t border-[#f2f3f5]/[0.35] pt-10 pb-16 text-center">
              <Building2 className="w-8 h-8 text-[#f2f3f5]/15 mx-auto mb-5" />
              <h2 className="text-[22px] font-light text-[#f2f3f5] mb-2">
                {projects.length === 0 ? "Aucun projet" : "Aucun projet ne correspond"}
              </h2>
              <p className="text-[#9298a6] text-sm mb-6">
                {projects.length === 0
                  ? "Créez le premier dossier pour commencer."
                  : "Élargissez la recherche ou changez de filtre."}
              </p>
              {projects.length === 0 ? (
                <button onClick={() => { resetForm(); setIsDialogOpen(true); }}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-[11px] tracking-[0.16em] uppercase border border-[#2c3139] text-[#f2f3f5] hover:bg-[#f2f3f5]/[0.08] transition-colors">
                  <Plus className="w-4 h-4" /> Créer un projet
                </button>
              ) : (
                <button onClick={() => { setSearchTerm(""); setStatusFilter("all"); setShowArchived(false); }}
                  className="text-[11px] tracking-[0.16em] uppercase text-[#c3ddd6] hover:text-[#f2f3f5] transition-colors">
                  Réinitialiser les filtres
                </button>
              )}
            </div>
          )}
        </div>

        {/* Shadow Editor Dialog */}
        <ShadowEditorDialog
          open={shadowDialogOpen}
          onOpenChange={setShadowDialogOpen}
          project={shadowProject}
          shadowRecord={shadowProject ? getShadowForProject(shadowProject.id) : null}
          users={users}
          initialTab={shadowInitialTab}
          initialViewMode={shadowInitialViewMode}
        />
      </div>
    </div>
  );
}