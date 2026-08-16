import React, { useEffect, useState } from "react";
import { createPageUrl } from "@/utils";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Building2, Plus, Upload, X, CheckCircle2, Sparkles, Loader2, FileText, Brain, GripVertical, FolderSearch, Eye, Archive } from "lucide-react";
import { toast } from "sonner";
import AdminProjectCard from "../components/admin/AdminProjectCard";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { motion, AnimatePresence } from "framer-motion";
import { BeamsBackground } from "@/components/ui/beams-background";
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
    statut: "prospect",
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

  const { data: projects = [] } = useQuery({
    queryKey: ['all-projects'],
    queryFn: () => base44.entities.Project.list("-created_date"),
    initialData: []
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
  }, [projects, users]); // eslint-disable-line react-hooks/exhaustive-deps

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
      adresse_complete: "", statut: "prospect", suivi_message_envoye: false, suivi_retour_client: null,
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

  const handleSubmit = async (overrides = {}) => {
    const currentFormData = { ...formData, ...overrides };
    if (!currentFormData.titre) {
      toast.error("Veuillez remplir au minimum le titre du projet");
      return;
    }
    if (!currentFormData.admin_principal && !editingProject) {
      setShowAdminPicker(true);
      return;
    }

    try {
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
        await updateProjectMutation.mutateAsync({ id: editingProject.id, data });
        toast.success("Projet enregistré !", { description: "Les modifications ont été enregistrées avec succès", duration: 3000 });
      } else {
        const newProject = await createProjectMutation.mutateAsync(data);
        toast.success("Projet créé !", { description: "Le nouveau projet a été enregistré avec succès", duration: 3000 });
        setEditingProject(newProject);
      }


    } catch (error) {
      toast.error("Erreur lors de l'enregistrement", { description: error.message || "Une erreur est survenue" });
    }
  };

  const editorTabs = [
    { value: "ai-extract", label: "IA", accent: "teal" },
    { value: "images", label: "Images" },
    { value: "informations", label: "Infos" },
    { value: "secteur", label: "Secteur" },
    { value: "locataire", label: "Locataire" },
    { value: "copropriete", label: "Copro" },
    { value: "marche", label: "Marché" },
    { value: "diagnostique", label: "Diagnostique" },
    { value: "docs_projet", label: "Documents" },
    { value: "preview", label: "Preview", accent: "amber" },
    { value: "simulateur", label: "Simulateur" },
  ];

  if (isDialogOpen) {
    const closeEditor = () => { setIsDialogOpen(false); resetForm(); const url = new URL(window.location); url.searchParams.delete('action'); window.history.replaceState({}, '', url); };
    const goToProjectsList = () => { setIsDialogOpen(false); resetForm(); navigate(createPageUrl("AdminProjets")); };
    const isSaving = createProjectMutation.isPending || updateProjectMutation.isPending;
    const statutLabels = { prospect: "Prospect", analyse: "Analyse", negociation: "Négociation", financement: "Financement", signe: "Signé" };
    return (
      <div className="h-screen flex flex-col md:flex-row bg-[#0B0D0F] text-[#EAECEF] overflow-hidden">
        {/* LEFT — visual panel with live preview (fixe, ne scrolle pas) */}
        <motion.div initial={{ opacity: 0, x: -24 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }} className="hidden md:flex flex-col gap-6 w-[42%] lg:w-[46%] px-11 py-10 h-screen overflow-hidden" style={{ background: "linear-gradient(160deg,#0A0B0F 0%,#000000 70%)" }}>
          <div className="flex items-center gap-3">
            <div className="w-[11px] h-[11px] rounded-[3px] bg-[#2A9D8F]" />
            <span className="font-medium tracking-[2px] text-[13px]">KLOCKA&nbsp;OS</span>
          </div>

          <div className="flex flex-col py-6">
            <h1 className="text-[26px] font-light leading-[1.08] m-0 mb-2 -tracking-[0.02em]">
              {editingProject ? <>Modifions votre projet.</> : <>Créons votre prochain projet.</>}
            </h1>
            <p className="text-[#8D93A0] text-[14px] leading-[1.5] m-0 mb-4 max-w-[340px]">Renseignez les informations clés, l'aperçu se met à jour en temps réel.</p>

            {/* card d'aperçu à gauche + onglets verticaux à droite */}
            <div className="flex gap-6 items-start">
              {/* live preview card — contextual to active tab */}
              <div className="flex-1 min-w-0">
                <ProjectLivePreview activeTab={activeTab} formData={formData} />
              </div>

              {/* Navigation onglets — liste verticale à droite de la card */}
              <nav className="flex flex-col gap-1 flex-shrink-0 w-[130px]">
                {editorTabs.map((t) => {
                  const active = activeTab === t.value;
                  return (
                    <button
                      key={t.value}
                      onClick={() => setActiveTab(t.value)}
                      className={`flex items-center gap-2.5 py-2 text-[14px] font-semibold text-left transition-colors ${active ? "text-[#2A9D8F]" : "text-[#565C6A] hover:text-[#C3C7CE]"}`}
                    >
                      <span className={`w-[6px] h-[6px] rounded-full flex-shrink-0 transition-all ${active ? "bg-[#2A9D8F]" : "bg-[#2E3340]"}`} />
                      {t.label}
                    </button>
                  );
                })}
              </nav>
            </div>
          </div>
        </motion.div>

        {/* RIGHT — form area (seule zone qui scrolle) */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.35, ease: "easeOut", delay: 0.05 }} className="flex-1 bg-[#0F1116] h-screen overflow-y-auto">
          {/* Mobile top bar */}
          <div className="md:hidden flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
            <span className="font-light text-[18px]">{editingProject ? "Modifier" : "Nouveau projet"}</span>
            <div className="flex gap-2">
              <button onClick={closeEditor} className="border border-white/[0.14] text-[#C3C7CE] rounded-xl px-3.5 py-2 text-[13px] font-semibold">Annuler</button>
              {editingProject && (
                <button onClick={goToProjectsList} className="border border-white/[0.14] text-[#C3C7CE] rounded-xl px-3.5 py-2 text-[13px] font-semibold">Projets</button>
              )}
              <button onClick={() => handleSubmit()} disabled={!formData.titre || isSaving} className="text-white rounded-xl px-3.5 py-2 text-[13px] font-bold disabled:opacity-50" style={{ background: "linear-gradient(120deg,#2A9D8F,#238B7E)" }}>{isSaving ? "..." : "Enregistrer"}</button>
            </div>
          </div>

          {/* Mobile tab selector */}
          <div className="md:hidden border-b border-white/[0.06] overflow-x-auto flex gap-2 px-4 py-3">
            {editorTabs.map((t) => {
              const active = activeTab === t.value;
              return (
                <button key={t.value} onClick={() => setActiveTab(t.value)} className={`flex-shrink-0 px-3.5 py-2 rounded-full text-[13px] whitespace-nowrap transition-colors ${active ? "text-white font-semibold" : "bg-white/[0.05] text-[#8D93A0]"}`} style={active ? { background: "linear-gradient(120deg,#2A9D8F,#238B7E)" } : undefined}>
                  {t.label}
                </button>
              );
            })}
          </div>

          {/* Content */}
          <div className="px-5 md:px-13 lg:px-16 py-8 md:py-12 max-w-[860px] mx-auto">
            {/* Desktop header actions */}
            <div className="hidden md:flex justify-between items-center mb-9">
              <div className="flex items-center gap-2">
                <h2 className="text-[22px] font-light m-0">{editorTabs.find(t => t.value === activeTab)?.label || "Informations"}</h2>
                {editingProject && (
                  <button onClick={() => window.open(`${createPageUrl("ProjetDetail")}?id=${editingProject.id}`, '_blank')} className="text-[#565C6A] hover:text-[#2A9D8F] transition-colors ml-1" title="Voir la page client">
                    <Eye className="w-5 h-5" />
                  </button>
                )}
              </div>
              <div className="flex gap-2.5 items-center">
                <button onClick={closeEditor} className="bg-transparent border border-white/[0.14] text-[#C3C7CE] rounded-xl px-[18px] py-2.5 text-[14px] font-semibold hover:bg-white/[0.06] transition-colors">Annuler</button>
                {editingProject && (
                  <button onClick={goToProjectsList} className="bg-transparent border border-white/[0.14] text-[#C3C7CE] rounded-xl px-[18px] py-2.5 text-[14px] font-semibold hover:bg-white/[0.06] transition-colors">Retour aux projets</button>
                )}
                <button onClick={() => handleSubmit()} disabled={!formData.titre || isSaving}
                  className="inline-flex items-center gap-2 text-white rounded-xl px-5 py-2.5 text-[14px] font-bold hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed" style={{ background: "linear-gradient(120deg,#2A9D8F,#238B7E)" }}>
                  {isSaving ? <><Loader2 className="w-4 h-4 animate-spin" />Enregistrement...</> : "Enregistrer"}
                </button>
              </div>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsContent value="preview">
                <ProjectSimulatorPreview formData={formData} travauxList={travauxList} />
              </TabsContent>

              <TabsContent value="ai-extract" className="space-y-6 mt-0">
                <div className="p-6 bg-[#171A21] rounded-[14px] border border-white/[0.08]">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-12 h-12 bg-[#2A9D8F]/10 rounded-xl flex items-center justify-center">
                      <Brain className="w-6 h-6 text-[#2A9D8F]" />
                    </div>
                    <div>
                      <h3 className="text-xl text-white font-light">Création assistée par IA</h3>
                      <p className="text-white/30 text-sm">Collez du texte ou importez des documents pour remplir automatiquement</p>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <FField label="Importer depuis Google Drive">
                      <div className="flex gap-2">
                        <FInput value={driveSearchAddress} onChange={(e) => setDriveSearchAddress(e.target.value)} placeholder="Ex: 123 rue de la Paix, Paris" className="flex-1" />
                        <Button onClick={handleSearchGoogleDrive} disabled={isSearchingDrive || !driveSearchAddress.trim()} className="bg-[#2A9D8F]/15 border border-[#2A9D8F]/30 hover:bg-[#2A9D8F]/25 text-white flex-shrink-0">
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
                        <Button onClick={() => { if (newAiDocUrl.trim()) { setAiDocuments([...aiDocuments, convertGoogleDriveUrl(newAiDocUrl.trim())]); setNewAiDocUrl(""); } }} className="bg-[#2A9D8F]/15 border border-[#2A9D8F]/30 hover:bg-[#2A9D8F]/25 h-[52px] flex-shrink-0"><Plus className="w-4 h-4" /></Button>
                      </div>
                      {aiDocuments.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {aiDocuments.map((url, idx) => (
                            <div key={idx} className="flex items-center gap-2 bg-white/[0.03] text-white/60 px-3 py-1.5 rounded-lg text-sm border border-white/[0.06]">
                              <FileText className="w-4 h-4" /><span>Document {idx + 1}</span>
                              <button onClick={() => setAiDocuments(aiDocuments.filter((_, i) => i !== idx))} className="text-red-400 hover:text-red-300"><X className="w-3 h-3" /></button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <button onClick={handleFullAIGeneration} disabled={isGeneratingAI || (!aiFullText && aiDocuments.length === 0)} className="w-full h-12 bg-[#2A9D8F]/15 border border-[#2A9D8F]/30 hover:bg-[#2A9D8F]/25 text-white rounded-xl transition-all text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                      {isGeneratingAI ? <><Loader2 className="w-4 h-4 animate-spin" />Analyse en cours...</> : <><Sparkles className="w-4 h-4 text-[#2A9D8F]" />Extraire les informations avec l'IA</>}
                    </button>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="informations"><motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}><ProjectFormInfoTab formData={formData} setFormData={setFormData} users={users} /></motion.div></TabsContent>

              <TabsContent value="secteur" className="space-y-6 mt-0">
                {/* Génération IA Secteur */}
                <div className="p-5 bg-[#2A9D8F]/5 rounded-xl border border-[#2A9D8F]/20">
                  <div className="flex items-center gap-3 mb-3">
                    <Sparkles className="w-5 h-5 text-[#2A9D8F]" />
                    <h4 className="text-white text-sm font-medium">Générer les infos secteur avec l'IA</h4>
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
                      className="bg-[#2A9D8F]/15 border border-[#2A9D8F]/30 hover:bg-[#2A9D8F]/25 text-white flex-shrink-0 h-[52px]"
                    >
                      {isGeneratingAI ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Sparkles className="w-4 h-4 mr-2 text-[#2A9D8F]" />Générer</>}
                    </Button>
                  </div>
                </div>

                {/* Ville & Secteur */}
                <div className="space-y-4">
                  <h3 className="text-lg text-white">Ville & Secteur</h3>
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

                <div className="space-y-4 pt-4 border-t border-white/[0.06]">
                  <div className="flex items-center justify-between">
                    <Label className="text-white">Notes secteur</Label>
                    <Button type="button" variant="outline" size="sm" onClick={() => setFormData({...formData, notes_secteur: [...(formData.notes_secteur || []), { titre: "", contenu: "" }]})} className="border-white/[0.06] text-white/30 hover:text-white hover:border-[#2A9D8F]/30"><Plus className="w-4 h-4 mr-1" />Ajouter une note</Button>
                  </div>
                  {(formData.notes_secteur || []).map((note, idx) => (
                    <div key={idx} className="p-4 bg-white/[0.02] rounded-lg space-y-3">
                      <div className="flex items-center gap-3">
                        <FField className="flex-1"><FInput value={note.titre} onChange={(e) => { const u = [...formData.notes_secteur]; u[idx].titre = e.target.value; setFormData({...formData, notes_secteur: u}); }} placeholder="Titre..." /></FField>
                        <Button variant="ghost" size="icon" onClick={() => setFormData({...formData, notes_secteur: formData.notes_secteur.filter((_, i) => i !== idx)})} className="text-red-500 hover:bg-red-500/10"><X className="w-4 h-4" /></Button>
                      </div>
                      <FField><FTextarea value={note.contenu} onChange={(e) => { const u = [...formData.notes_secteur]; u[idx].contenu = e.target.value; setFormData({...formData, notes_secteur: u}); }} placeholder="Contenu..." rows={3} /></FField>
                    </div>
                  ))}
                </div>
                <div>
                  <h3 className="text-lg mb-4 text-white">Bien</h3>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <FField><FInput value={formData.bien_champ1} onChange={(e) => setFormData({...formData, bien_champ1: e.target.value})} placeholder="Champ 1 (Bien)" /></FField>
                      <FField><FInput value={formData.bien_champ2} onChange={(e) => setFormData({...formData, bien_champ2: e.target.value})} placeholder="Champ 2 (Bien)" /></FField>
                      <FField><FInput value={formData.bien_champ3} onChange={(e) => setFormData({...formData, bien_champ3: e.target.value})} placeholder="Champ 3 (Bien)" /></FField>
                    </div>
                    <FField label="Description bien"><FTextarea value={formData.description_bien} onChange={(e) => setFormData({...formData, description_bien: e.target.value})} rows={4} placeholder="Description du bien..." /></FField>
                  </div>
                </div>
                <div className="space-y-4 pt-4 border-t border-white/[0.06]">
                  <div className="flex items-center justify-between">
                    <Label className="text-white">Notes bien</Label>
                    <Button type="button" variant="outline" size="sm" onClick={() => setFormData({...formData, notes_bien: [...(formData.notes_bien || []), { titre: "", contenu: "" }]})} className="border-white/[0.06] text-white/30 hover:text-white hover:border-[#2A9D8F]/30"><Plus className="w-4 h-4 mr-1" />Ajouter une note</Button>
                  </div>
                  {(formData.notes_bien || []).map((note, idx) => (
                    <div key={idx} className="p-4 bg-white/[0.02] rounded-lg space-y-3">
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
              <TabsContent value="copropriete"><motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}><ProjectFormCoproTab formData={formData} setFormData={setFormData} /></motion.div></TabsContent>
              <TabsContent value="marche"><motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}><ProjectFormMarcheTab formData={formData} setFormData={setFormData} /></motion.div></TabsContent>
              <TabsContent value="diagnostique"><motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}><ProjectFormDiagnosticsTab formData={formData} setFormData={setFormData} /></motion.div></TabsContent>
              <TabsContent value="docs_projet"><motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}><ProjectFormDocumentsTab formData={formData} setFormData={setFormData} /></motion.div></TabsContent>
              <TabsContent value="images"><motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}><ProjectFormImagesTab formData={formData} setFormData={setFormData} /></motion.div></TabsContent>
              <TabsContent value="simulateur"><motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}><ProjectFormSimulateurTab formData={formData} setFormData={setFormData} travauxList={travauxList} setTravauxList={setTravauxList} /></motion.div></TabsContent>
            </Tabs>
          </div>
        </motion.div>

        {/* Admin Picker Dialog */}
        <Dialog open={showAdminPicker} onOpenChange={setShowAdminPicker}>
          <DialogContent className="max-w-md bg-[#050505] border-[#2A9D8F]/40 shadow-[0_0_40px_rgba(42,157,143,0.15)]">
            <DialogHeader>
              <DialogTitle className="text-white font-light text-xl">Choisissez l'admin principal</DialogTitle>
              <p className="text-gray-500 text-sm mt-1">Cliquez sur la photo de l'admin en charge de ce projet</p>
            </DialogHeader>
            <div className="flex justify-center gap-8 py-6">
              {users.filter(u => u.role === "admin" && ["jules.b@klocka.immo", "alexis.p@klocka.immo", "maxime.p@klocka.immo", "paul.b@klocka.immo"].includes(u.email)).map(u => {
                const avatarMap = {
                  "jules.b@klocka.immo": "https://media.base44.com/images/public/68f0bd18555df3520e1740ca/03bb5f5c4_Capturedecran2026-06-24a120022.png",
                  "alexis.p@klocka.immo": "https://media.base44.com/images/public/68f0bd18555df3520e1740ca/e5f3e9394_Capturedecran2026-02-18a163239.png",
                  "maxime.p@klocka.immo": "https://media.base44.com/images/public/68f0bd18555df3520e1740ca/e92131b8c_Capturedecran2026-02-18a164304.png",
                  "paul.b@klocka.immo": "https://media.base44.com/images/public/68f0bd18555df3520e1740ca/db402bc1f_Capturedecran2026-06-24a122246.png",
                };
                const avatar = avatarMap[u.email];
                if (!avatar) return null;
                return (
                  <button
                    key={u.id}
                    onClick={() => {
                      setShowAdminPicker(false);
                      setFormData(prev => ({ ...prev, admin_principal: u.email }));
                      handleSubmit({ admin_principal: u.email });
                    }}
                    className="flex flex-col items-center gap-3 group"
                  >
                    <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-white/10 group-hover:border-[#2A9D8F] transition-all duration-200 group-hover:scale-105">
                      <img src={avatar} alt={u.full_name} className="w-full h-full object-cover" />
                    </div>
                    <span className="text-gray-400 text-sm group-hover:text-white transition-colors">{u.full_name || u.email.split('@')[0]}</span>
                  </button>
                );
              })}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="min-h-screen text-[#EAECEF] p-4 md:p-10" style={{ background: "linear-gradient(160deg,#0B0D0F 0%,#000000 90%)" }}>
      <div className="max-w-7xl mx-auto">
        <div className="mb-9 flex flex-col items-center text-center gap-5">
          <div>
            <h1 className="text-[28px] md:text-[32px] font-light leading-[1.08] -tracking-[0.02em] m-0">Gestion des projets</h1>
            <p className="text-[#8D93A0] text-[14px] leading-[1.5] mt-2 max-w-[420px] mx-auto">Retrouvez, filtrez et modifiez tous vos projets immobiliers.</p>
          </div>
          <button onClick={() => { resetForm(); setIsDialogOpen(true); }}
            className="inline-flex items-center gap-2 text-white rounded-xl px-5 py-3 text-[14px] font-bold hover:brightness-110 transition-all flex-shrink-0"
            style={{ background: "linear-gradient(120deg,#2A9D8F,#238B7E)" }}>
            <Plus className="w-[18px] h-[18px]" strokeWidth={2.4} />
            Nouveau projet
          </button>
        </div>

        {/* Filtres — champs #171A21 focus teal */}
        <div className="flex flex-col md:flex-row gap-3 mb-8">
          <div className="flex-1 bg-[#171A21] border border-white/[0.08] rounded-[14px] px-[18px] flex items-center transition-all focus-within:border-[#2A9D8F] focus-within:shadow-[0_0_0_3px_rgba(42,157,143,0.14)]">
            <FolderSearch className="w-4 h-4 text-[#5B616C] flex-shrink-0" />
            <input placeholder="Rechercher un projet..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-transparent border-none text-[#EAECEF] outline-none placeholder:text-[#5B616C] py-3.5 px-3 text-[15px]" />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="bg-[#171A21] text-[#EAECEF] border-white/[0.08] rounded-[14px] w-full md:w-52 h-auto py-3.5 px-[18px] focus:border-[#2A9D8F] focus:ring-0">
              <SelectValue placeholder="Tous les statuts" />
            </SelectTrigger>
            <SelectContent className="bg-[#171A21] border-white/[0.1] text-[#EAECEF]">
              <SelectItem value="all">Tous les statuts</SelectItem>
              <SelectItem value="prospect">Prospect</SelectItem>
              <SelectItem value="analyse">Analyse</SelectItem>
              <SelectItem value="negociation">Négociation</SelectItem>
              <SelectItem value="financement">Financement</SelectItem>
              <SelectItem value="signe">Signé</SelectItem>
            </SelectContent>
          </Select>
          <button
            onClick={() => setShowArchived(!showArchived)}
            className={`flex items-center gap-2 px-5 py-3.5 rounded-[14px] border text-[14px] font-semibold transition-all ${showArchived ? 'bg-amber-500/15 border-amber-500/40 text-amber-300' : 'bg-[#171A21] border-white/[0.08] text-[#8D93A0] hover:text-[#EAECEF] hover:border-white/20'}`}
          >
            <Archive className="w-4 h-4" />
            {showArchived ? "Masquer archivés" : "Voir archivés"}
          </button>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {projects.filter(project => {
            const matchSearch = !searchTerm || project.titre?.toLowerCase().includes(searchTerm.toLowerCase()) || project.adresse_complete?.toLowerCase().includes(searchTerm.toLowerCase()) || project.client_email?.toLowerCase().includes(searchTerm.toLowerCase());
            const matchStatus = statusFilter === "all" || project.statut === statusFilter;
            const matchArchived = showArchived ? project.archived : !project.archived;
            return matchSearch && matchStatus && matchArchived;
          }).map((project, idx) => (
            <motion.div
              key={project.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: "easeOut", delay: Math.min(idx * 0.04, 0.4) }}
            >
              <AdminProjectCard project={project} onEdit={handleEdit} onDuplicate={handleDuplicate} onDelete={handleDelete} onArchive={handleArchive} onShadow={handleShadow} onShadowWithNav={handleShadowWithNav} shadowRecord={getShadowForProject(project.id)} />
            </motion.div>
          ))}
          {projects.length === 0 && (
            <div className="col-span-full text-center py-20">
              <div className="w-20 h-20 bg-[#171A21] border border-white/[0.08] rounded-[14px] flex items-center justify-center mx-auto mb-6">
                <Building2 className="w-10 h-10 text-[#2E3340]" />
              </div>
              <h2 className="text-xl font-light text-[#EAECEF] mb-2">Aucun projet</h2>
              <p className="text-[#565C6A] mb-6 text-sm">Créez votre premier projet pour commencer</p>
              <button onClick={() => { resetForm(); setIsDialogOpen(true); }}
                className="inline-flex items-center gap-2 text-white px-5 py-2.5 rounded-xl transition-all text-sm font-bold hover:brightness-110"
                style={{ background: "linear-gradient(120deg,#2A9D8F,#238B7E)" }}>
                <Plus className="w-4 h-4" /> Créer un projet
              </button>
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