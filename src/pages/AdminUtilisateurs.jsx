import React, { Suspense, lazy, useState } from "react";
import { toast } from "@/components/ui/avis";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Button } from "@/components/ui/button";
import InviterClient, { BoutonLienInvitation } from "@/components/admin/InviterClient";
import FamillesClients from "@/components/admin/FamillesClients";
// Les mandataires se gèrent ici aussi (24 oct. 2026, Jules) : la page Mandataires, chargée seulement à l'ouverture de l'onglet (cartes Google).
const AdminMandataires = lazy(() => import("@/pages/AdminMandataires"));
import CourbesClients from "@/components/admin/CourbesClients";
import CaseRole, { rolesDuCompte } from "@/components/admin/CaseRole";
import AccesAdmins from "@/components/compte/AccesAdmins";
import PagesCrm from "@/components/compte/PagesCrm";
import { useUser } from "@/components/providers/UserProvider";
import { DialogueAssignerProjets } from "@/components/admin/AssignationProjets";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { CLASSES_STATUT, couleurStatut } from "@/lib/couleur-statut";
import { Mail, Users, Search, Trash2, Crown, FileText, Plus, X, Upload, Download, Building2, Link, Unlink, GitCompare, User, TrendingUp, Target, Sparkles, Edit, Loader2, ChevronDown, Check } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle } from
"@/components/ui/dialog";

const profilColors = {
  equilibriste: "bg-blue-100 text-blue-800",
  risk_taker: "bg-red-100 text-red-800",
  collectionneur: "bg-purple-100 text-purple-800",
  visionnaire: "bg-encre/[0.07] text-ardoise"
};

const profilLabels = {
  equilibriste: "L'équilibriste",
  risk_taker: "Risk taker",
  collectionneur: "Le Collectionneur",
  visionnaire: "Le Visionnaire"
};

const etapeLabels = [
"Compte",
"Acculturation",
"Stratégie",
"Recherche",
"Financement",
"Signature"];


// Le tableau des utilisateurs reprend celui du CRM (6 nov. 2026, Jules : « copie le tableau du CRM ») : cases à traits
// pleins, en-têtes de 35 px, lignes de 36 px, texte en 14 px ; la dernière ligne et la dernière colonne sans filet.
const TABLEAU = "w-full border-collapse text-[14px] [&_tbody_tr:last-child_td]:border-b-0 [&_td:last-child]:border-r-0 [&_th:last-child]:border-r-0";
const TETE = "h-[35px] whitespace-nowrap border-b border-r border-trait px-2.5 align-middle font-normal text-encre";
const CELLULE = "h-[36px] border-b border-r border-trait align-middle";

/** La case de sélection d'une ligne, copiée du CRM : un carré bordé aux coins doux, centré dans sa colonne. */
function CaseLigne({ cochee, onChange, label }) {
  return (
    <button type="button" role="checkbox" aria-checked={cochee} aria-label={label} title={label} onClick={onChange}
      className={`mx-auto grid h-[17px] w-[17px] place-items-center rounded-[4px] border transition-colors ${cochee ? "border-menthe bg-menthe text-sur-menthe" : "border-bord-vif hover:border-craie"}`}
      style={cochee ? undefined : { background: "transparent" }}>
      {cochee && <Check className="h-3 w-3" strokeWidth={3} />}
    </button>
  );
}

/** L'initiale d'un compte, en tête de sa ligne (menthe pour un admin). */
function Initiale({ nom, admin = false }) {
  return (
    <span className={`grid h-6 w-6 flex-none place-items-center rounded-full text-[11px] font-semibold ${admin ? "bg-menthe/[0.16] text-menthe" : "bg-relief text-craie"}`}>
      {nom?.charAt(0)?.toUpperCase() || "?"}
    </span>
  );
}

// La recherche : sans accents, mots dans n'importe quel ordre, sur le nom,
// l'adresse mail et le téléphone. « helene dupont » trouve « Hélène Dupont »,
// « pierre antoine » trouve « pierreantoine.rouveroux@gmail.com ».
const sansAccents = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
function correspond(user, recherche) {
  const mots = sansAccents(recherche).split(/[\s,]+/).filter(Boolean);
  if (!mots.length) return true;
  const texte = sansAccents(`${user.full_name || ""} ${user.email || ""} ${user.telephone || ""} ${user.phone || ""}`);
  return mots.every((m) => texte.includes(m));
}

export default function AdminUtilisateurs() {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  // Utilisateurs, ou Familles : plusieurs comptes sur un même dossier.
  const [onglet, setOnglet] = useState("utilisateurs");
  // La fiche du mandataire à montrer en ouvrant l'onglet Mandataires depuis sa ligne.
  const [focusMandataire, setFocusMandataire] = useState(null);
  const gererMandataire = (user) => { setFocusMandataire(String(user.email || "").toLowerCase()); setOnglet("mandataires"); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const [etapeFilter, setEtapeFilter] = useState("all");
  // Le rôle d'abord (3 nov. 2026, Jules : « plus simple avec clients, admin et mandataire ») : Tous, Clients, Admins,
  // Mandataires ; les étapes ne se choisissent que parmi les clients.
  const [roleFilter, setRoleFilter] = useState("tous");
  const moi = useUser();
  const [expandedUserId, setExpandedUserId] = useState(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState(null);
  const [strategyDialogOpen, setStrategyDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [strategyFields, setStrategyFields] = useState([]);
  const [newFieldLabel, setNewFieldLabel] = useState("");
  const [newFieldValue, setNewFieldValue] = useState("");
  const [newFieldIsNogo, setNewFieldIsNogo] = useState(false);
  const [strategyBudgetMax, setStrategyBudgetMax] = useState("");
  const [strategyApport, setStrategyApport] = useState("");
  const [uploadingDossier, setUploadingDossier] = useState(null);
  const [etapeDialogOpen, setEtapeDialogOpen] = useState(false);
  const [pendingEtapeChange, setPendingEtapeChange] = useState(null);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  // Le client depuis lequel on assigne : la ligne d'où l'on a cliqué.
  const [assignerPour, setAssignerPour] = useState(null);
  const [selectedUserForLink, setSelectedUserForLink] = useState(null);
  const [masterEmail, setMasterEmail] = useState("");
  const [selectedUsersForCompare, setSelectedUsersForCompare] = useState([]);
  const [editUserDialogOpen, setEditUserDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [editForm, setEditForm] = useState({
    revenus_annuels: "",
    epargne_annuelle: "",
    duree_emprunt: "20",
    apport_disponible: ""
  });
  const queryClient = useQueryClient();

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['all-users'],
    queryFn: () => base44.entities.User.list("-created_date"),
    initialData: []
  });

  const { data: strategies = [] } = useQuery({
    queryKey: ['strategies'],
    queryFn: () => base44.entities.Strategy.list(),
    initialData: []
  });

  const { data: allProjects = [] } = useQuery({
    queryKey: ['all-projects'],
    queryFn: () => base44.entities.Project.list(),
    initialData: []
  });

  // L'équipe : qui peut cocher (les super admins), les super admins, les secteurs des mandataires.
  const { data: equipe } = useQuery({ queryKey: ["equipe"], queryFn: () => base44.request("GET", "/api/admin/equipe") });
  const peutCocher = !!equipe?.peut_modifier;
  const parEmail = new Map((equipe?.membres || []).map((m) => [m.email, m]));
  const changerRoles = useMutation({
    mutationFn: ({ email, admin, mandataire }) => base44.request("POST", `/api/admin/equipe/${encodeURIComponent(email)}/roles`, { body: { admin, mandataire } }),
    onSuccess: (r) => {
      toast.success(`${r.user.email} : ${r.user.roles.join(" et ") || "client"}`);
      queryClient.invalidateQueries({ queryKey: ["all-users"] });
      queryClient.invalidateQueries({ queryKey: ["equipe"] });
      queryClient.invalidateQueries({ queryKey: ["admin-mandataires"] });
      queryClient.invalidateQueries({ queryKey: ["current-user"] });
    },
    onError: (e) => toast.error(e?.message || "Impossible"),
  });
  // Décocher les deux cases rend client : on le demande d'abord.
  const poserRoles = (user, admin, mandataire) => {
    if (!admin && !mandataire && !window.confirm(`${user.full_name || user.email} redevient client : il perd l'accès admin et mandataire. Ses fiches, biens et secteur restent enregistrés.`)) return;
    changerRoles.mutate({ email: String(user.email || "").toLowerCase(), admin, mandataire });
  };

  const updateUserMutation = useMutation({
    mutationFn: ({ userId, data }) => base44.entities.User.update(userId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-users'] });
    }
  });

  const deleteUserMutation = useMutation({
    mutationFn: (userId) => base44.entities.User.delete(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-users'] });
      setDeleteConfirmOpen(false);
      setUserToDelete(null);
    }
  });

  // Les comptes en attente (souvent importés) se cherchent aussi : la
  // recherche filtre les deux listes.
  const estEquipe = (u) => u.role === 'admin' || u.role === 'mandataire' || !!u.aussi_mandataire;
  const tousEnAttente = users.filter((u) => (u.etape_actuelle ?? 0) === 0 && !estEquipe(u));
  const pendingUsers = tousEnAttente.filter((u) => correspond(u, searchTerm));
  // Les comptes qui n'ont pas encore de mot de passe (importés, ou invités
  // sans avoir cliqué) : ils entrent par leur lien.
  const sansMotDePasse = users.filter((u) => u.role !== 'admin' && !u.mot_de_passe_defini).length;
  // Un compte à la fois : le lien part par mail si une boîte est rattachée,
  // sinon il se copie.
  const inviterUn = useMutation({
    mutationFn: (u) => base44.request("POST", "/api/admin/clients/inviter", { body: { email: u.email, full_name: u.full_name, envoyer: true } }),
    onSuccess: async (r) => {
      queryClient.invalidateQueries({ queryKey: ['all-users'] });
      if (r.envoye) toast.success(`Lien envoyé à ${r.email}`);
      else {
        try { await navigator.clipboard.writeText(r.lien); toast.success("Aucune boîte d'envoi : lien copié, à transmettre"); }
        catch { window.prompt("Copiez le lien :", r.lien); }
      }
    },
    onError: (e) => toast.error(e?.message || "Invitation impossible"),
  });
  const inviterTous = useMutation({
    mutationFn: () => base44.request("POST", "/api/admin/clients/inviter-tous", { body: { envoyer: true } }),
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ['all-users'] });
      if (r.envoyes > 0) toast.success(`${r.envoyes} lien${r.envoyes > 1 ? "s" : ""} envoyé${r.envoyes > 1 ? "s" : ""} sur ${r.total}`);
      else toast.error(`${r.total} lien${r.total > 1 ? "s" : ""} préparé${r.total > 1 ? "s" : ""}, mais aucune boîte d'envoi n'est rattachée : copiez-les un par un avec le bouton Lien.`);
    },
    onError: (e) => toast.error(e?.message || "Envoi impossible"),
  });

  const filteredUsers = users.filter((user) => {
    const r = rolesDuCompte(user);
    if (!((user.etape_actuelle ?? 0) > 0 || estEquipe(user))) return false;
    if (roleFilter === "clients" && (estEquipe(user) || (etapeFilter !== "all" && (user.etape_actuelle ?? 0) !== Number(etapeFilter)))) return false;
    if (roleFilter === "admins" && !r.admin) return false;
    if (roleFilter === "mandataires" && !r.mandataire) return false;
    return correspond(user, searchTerm);
  });

  // Compteurs du bandeau et des filtres (hors recherche, pour rester stables)
  const clientsActifs = users.filter((u) => !estEquipe(u) && (u.etape_actuelle ?? 0) > 0);
  const nbParEtape = (e) => clientsActifs.filter((u) => (u.etape_actuelle ?? 0) === e).length;
  const nbAdmins = users.filter((u) => u.role === 'admin').length;
  const nbMandataires = users.filter((u) => u.role === 'mandataire' || u.aussi_mandataire).length;

  const toggleUserSelection = (userId) => {
    setSelectedUsersForCompare((prev) =>
    prev.includes(userId) ?
    prev.filter((id) => id !== userId) :
    [...prev, userId]
    );
  };

  const createFamilleMutation = useMutation({
    mutationFn: (data) => base44.entities.Famille.create(data),
    onSuccess: (newFamille) => {
      queryClient.invalidateQueries({ queryKey: ['familles'] });
      navigate(`${createPageUrl("Famille")}?users=${selectedUsersForCompare.join(',')}&familleId=${newFamille.id}`);
    }
  });

  const [familleNameDialogOpen, setFamilleNameDialogOpen] = useState(false);
  const [newFamilleName, setNewFamilleName] = useState("");
  const [pendingCollapsed, setPendingCollapsed] = useState(true);

  const handleCompareUsers = () => {
    if (selectedUsersForCompare.length >= 2) {
      setFamilleNameDialogOpen(true);
    }
  };

  const handleCreateFamille = () => {
    if (newFamilleName.trim() && selectedUsersForCompare.length >= 2) {
      createFamilleMutation.mutate({
        nom: newFamilleName.trim(),
        user_ids: selectedUsersForCompare
      });
      setNewFamilleName("");
      setFamilleNameDialogOpen(false);
      setSelectedUsersForCompare([]);
    }
  };

  const handleChangeEtape = async (userId, newEtape) => {
    const etape = parseInt(newEtape);
    const user = users.find((u) => u.id === userId);

    // Si passage à étape 4 ou plus, demander de sélectionner un projet
    if (etape >= 4 && user) {
      const userProjects = allProjects.filter((p) =>
      p.client_email === user.email ||
      p.client_emails && p.client_emails.includes(user.email)
      );

      if (userProjects.length > 0) {
        setPendingEtapeChange({ userId, etape, userProjects });
        setSelectedProjectId(user.projet_selectionne_id || "");
        setEtapeDialogOpen(true);
        return;
      }
    }

    await updateUserMutation.mutateAsync({
      userId,
      data: { etape_actuelle: etape }
    });
  };

  const handleConfirmEtapeChange = async () => {
    if (!pendingEtapeChange) return;

    await updateUserMutation.mutateAsync({
      userId: pendingEtapeChange.userId,
      data: {
        etape_actuelle: pendingEtapeChange.etape,
        projet_selectionne_id: selectedProjectId || null
      }
    });

    setEtapeDialogOpen(false);
    setPendingEtapeChange(null);
    setSelectedProjectId("");
  };

  const handleDeleteClick = (user) => {
    setUserToDelete(user);
    setDeleteConfirmOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (userToDelete) {
      await deleteUserMutation.mutateAsync(userToDelete.id);
    }
  };





  const handleChangeProfil = async (userId, newProfil) => {
    await updateUserMutation.mutateAsync({
      userId,
      data: { profil_investisseur: newProfil }
    });
  };

  const handleOpenEditDialog = (user) => {
    setEditingUser(user);
    setEditForm({
      revenus_annuels: user.revenus_annuels?.toString() || "",
      epargne_annuelle: user.epargne_annuelle?.toString() || "",
      duree_emprunt: user.duree_emprunt?.toString() || "20",
      apport_disponible: user.apport_disponible?.toString() || ""
    });
    setEditUserDialogOpen(true);
  };

  const handleSaveEditUser = async () => {
    if (!editingUser) return;

    const updates = {};
    if (editForm.revenus_annuels && editForm.revenus_annuels.trim()) {
      updates.revenus_annuels = parseFloat(editForm.revenus_annuels);
    }
    if (editForm.epargne_annuelle && editForm.epargne_annuelle.trim()) {
      updates.epargne_annuelle = parseFloat(editForm.epargne_annuelle);
    }
    if (editForm.duree_emprunt && editForm.duree_emprunt.trim()) {
      updates.duree_emprunt = parseInt(editForm.duree_emprunt);
    }
    if (editForm.apport_disponible && editForm.apport_disponible.trim()) {
      updates.apport_disponible = parseFloat(editForm.apport_disponible);
    }

    try {
      await updateUserMutation.mutateAsync({
        userId: editingUser.id,
        data: updates
      });

      setEditUserDialogOpen(false);
      setEditingUser(null);
    } catch (error) {
      console.error("Erreur lors de la sauvegarde:", error);
      alert("Erreur lors de l'enregistrement. Veuillez réessayer.");
    }
  };

  const createStrategyMutation = useMutation({
    mutationFn: (data) => base44.entities.Strategy.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['strategies'] });
    }
  });

  const updateStrategyMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Strategy.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['strategies'] });
    }
  });

  const handleOpenStrategyDialog = (user) => {
    setSelectedUser(user);
    const existingStrategy = strategies.find((s) => s.client_email === user.email);
    setStrategyFields(existingStrategy?.fields || []);
    setStrategyBudgetMax(existingStrategy?.budget_max?.toString() || "");
    setStrategyApport(existingStrategy?.apport?.toString() || "");
    setStrategyDialogOpen(true);
  };

  const handleAddField = () => {
    if (newFieldLabel.trim() && newFieldValue.trim()) {
      setStrategyFields([...strategyFields, {
        label: newFieldLabel,
        value: newFieldValue,
        is_nogo: newFieldIsNogo
      }]);
      setNewFieldLabel("");
      setNewFieldValue("");
      setNewFieldIsNogo(false);
    }
  };

  const handleRemoveField = (index) => {
    setStrategyFields(strategyFields.filter((_, i) => i !== index));
  };

  const handleSaveStrategy = async () => {
    if (!selectedUser) return;

    const existingStrategy = strategies.find((s) => s.client_email === selectedUser.email);
    const strategyData = {
      fields: strategyFields,
      budget_max: strategyBudgetMax ? parseFloat(strategyBudgetMax) : null,
      apport: strategyApport ? parseFloat(strategyApport) : null
    };

    if (existingStrategy) {
      await updateStrategyMutation.mutateAsync({
        id: existingStrategy.id,
        data: strategyData
      });
    } else {
      await createStrategyMutation.mutateAsync({
        client_email: selectedUser.email,
        ...strategyData
      });
    }

    // Mettre le client en étape 2 automatiquement
    if ((strategyFields.length > 0 || strategyBudgetMax || strategyApport) && (selectedUser.etape_actuelle ?? 0) < 2) {
      await updateUserMutation.mutateAsync({
        userId: selectedUser.id,
        data: { etape_actuelle: 2 }
      });
    }

    setStrategyDialogOpen(false);
    setSelectedUser(null);
    setStrategyFields([]);
    setStrategyBudgetMax("");
    setStrategyApport("");
  };

  const handleUploadDossierBancaire = async (userId, file) => {
    try {
      setUploadingDossier(userId);
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      await updateUserMutation.mutateAsync({
        userId,
        data: { dossier_bancaire_url: file_url }
      });
    } catch (error) {
      console.error("Erreur upload:", error?.message || error);
    } finally {
      setUploadingDossier(null);
    }
  };

  const handleOpenLinkDialog = (user) => {
    setSelectedUserForLink(user);
    setMasterEmail(user.compte_maitre_email || "");
    setLinkDialogOpen(true);
  };

  // Le rattachement passe par le serveur : ces champs ne s'écrivent plus par
  // le CRUD (un client pourrait s'y rattacher au dossier de n'importe qui).
  const handleLinkAccounts = async () => {
    if (!selectedUserForLink || !masterEmail) return;
    const titulaire = users.find((u) => u.email === masterEmail);
    if (!titulaire) return;
    try {
      await base44.request("POST", "/api/admin/familles/lier", { body: { titulaire_id: titulaire.id, membre_ids: [selectedUserForLink.id] } });
      queryClient.invalidateQueries({ queryKey: ['all-users'] });
      toast.success(`${selectedUserForLink.full_name || selectedUserForLink.email} voit le dossier de ${titulaire.full_name || titulaire.email}`);
    } catch (e) {
      toast.error(e?.message || "Rattachement impossible");
      return;
    }
    setLinkDialogOpen(false);
    setSelectedUserForLink(null);
    setMasterEmail("");
  };

  const handleUnlinkAccount = async (user) => {
    if (!user.compte_maitre_email) return;
    try {
      await base44.request("POST", "/api/admin/familles/delier", { body: { user_id: user.id } });
      queryClient.invalidateQueries({ queryKey: ['all-users'] });
    } catch (e) {
      toast.error(e?.message || "Action impossible");
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-fond flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-menthe animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen text-encre">
      {/* L'en-tête des pages Relations (18 oct. 2026, Jules : harmoniser) : titre et compte sur une ligne, une phrase, les actions en pilules. */}
      <div className="mx-auto flex max-w-[1360px] flex-col gap-6 px-5 pb-16 pt-9 md:px-11 max-md:pt-6">
      <header className="flex flex-wrap items-center justify-between gap-4 md:pr-14">
        <div className="flex flex-wrap items-baseline gap-3.5">
          <h1 className="m-0 text-[34px] font-medium leading-[1.05] tracking-[-0.01em] text-encre max-md:text-[26px]">Utilisateurs</h1>
          <span className="text-[15px] text-ardoise">{clientsActifs.length} client{clientsActifs.length > 1 ? "s" : ""} actif{clientsActifs.length > 1 ? "s" : ""} · {tousEnAttente.length} en attente d'activation · {nbAdmins} admin{nbAdmins > 1 ? "s" : ""} · {nbMandataires} mandataire{nbMandataires > 1 ? "s" : ""}</span>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2.5">
          <div className="flex gap-0.5 rounded-full bg-rail-actif p-1" role="tablist" aria-label="Partie">
            {[["utilisateurs", "Utilisateurs"], ["familles", "Familles"]].map(([k, mot]) => (
              <button key={k} type="button" role="tab" aria-selected={onglet === k} onClick={() => { setOnglet(k); if (k !== "mandataires") setFocusMandataire(null); }}
                className={`rounded-full px-4 py-[9px] text-[14px] ${onglet === k ? "bg-relief text-encre" : "text-ardoise hover:text-craie"}`}
                style={onglet === k ? undefined : { background: "transparent" }}>{mot}</button>
            ))}
          </div>
          <InviterClient
            onCree={(r) => {
              // Le compte existe : on l'ouvre tout de suite, filtres levés,
              // pour poser l'étape et lier des projets sans le chercher.
              setEtapeFilter("all");
              setSearchTerm("");
              setPendingCollapsed(true);
              setExpandedUserId(r.user_id);
              setTimeout(() => {
                document.getElementById(`utilisateur-${r.user_id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
              }, 250);
            }}
          />
        </div>
      </header>

      {onglet === "mandataires" ? (
        <>
        {/* Le réglage d'un mandataire (secteur, fiche, analyste) s'ouvre depuis sa ligne (3 nov. 2026) : plus d'onglet à lui. */}
        <button type="button" onClick={() => { setOnglet("utilisateurs"); setFocusMandataire(null); }} className="inline-flex items-center gap-1.5 self-start text-[14px] text-ardoise hover:text-encre" style={{ background: "transparent" }}><ChevronDown className="h-4 w-4 rotate-90" />Tous les utilisateurs</button>
        <Suspense fallback={<div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-menthe" /></div>}>
          <AdminMandataires integre focus={focusMandataire} />
        </Suspense>
        </>
      ) : onglet === "familles" ? <FamillesClients users={users} /> : <>
      {/* Les courbes des clients (18 oct. 2026, Jules) : le nombre de clients, et leur temps de connexion. */}
      <CourbesClients />
      <div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex h-12 min-w-[240px] flex-1 items-center gap-3 rounded-full border border-trait bg-surface px-5 focus-within:border-bord-doux max-md:basis-full">
                <Search className="h-4 w-4 flex-none text-ardoise" />
                <input
                  placeholder="Nom, adresse mail, téléphone…"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full border-none bg-transparent text-[15px] text-encre outline-none placeholder:text-brume max-md:text-[16px]" />
              </div>
              {sansMotDePasse > 0 && (
                <Button
                  onClick={() => {
                    if (!window.confirm(`Envoyer un lien d'accès aux ${sansMotDePasse} comptes sans mot de passe ? Chacun cliquera, choisira son mot de passe, et retrouvera son espace.`)) return;
                    inviterTous.mutate();
                  }}
                  disabled={inviterTous.isPending}
                  className="h-12 rounded-full border-0 bg-encre px-5 text-[15px] font-normal text-fond hover:bg-encre/90 max-md:h-10"
                >
                  {inviterTous.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Mail className="w-4 h-4 mr-2" />}
                  Envoyer les liens ({sansMotDePasse})
                </Button>
              )}
              {selectedUsersForCompare.length >= 2 &&
              <Button
                onClick={handleCompareUsers}
                className="h-12 rounded-full border border-trait bg-surface px-5 text-[15px] font-normal text-craie hover:border-bord-doux hover:bg-surface max-md:h-10">
                  <GitCompare className="w-4 h-4 mr-2" />
                  Comparer ({selectedUsersForCompare.length})
                </Button>
              }
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {[
                { v: "tous", l: "Tous", n: clientsActifs.length + users.filter(estEquipe).length },
                { v: "clients", l: "Clients", n: clientsActifs.length },
                { v: "admins", l: "Admins", n: nbAdmins },
                { v: "mandataires", l: "Mandataires", n: nbMandataires },
              ].map(({ v, l, n }) => (
                <button key={v} onClick={() => { setRoleFilter(v); setEtapeFilter("all"); }}
                  className={`inline-flex h-10 items-center gap-2 rounded-full border px-4 text-[14px] transition-colors ${roleFilter === v ? "border-encre bg-encre text-fond" : "border-trait bg-surface text-craie hover:border-bord-doux"}`}>
                  {l} <span className="text-[12.5px] tabular-nums opacity-60">{n}</span>
                </button>
              ))}
            </div>
            {/* Les étapes, seulement parmi les clients. */}
            {roleFilter === "clients" && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {[{ v: "all", l: "Toutes les étapes" }, ...[1, 2, 3, 4, 5].map((e) => ({ v: String(e), l: etapeLabels[e], n: nbParEtape(e) }))].map(({ v, l, n }) => (
                  <button key={v} onClick={() => setEtapeFilter(v)}
                    className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] transition-colors ${etapeFilter === v ? "bg-relief text-encre" : "text-ardoise hover:text-craie"}`}
                    style={etapeFilter === v ? undefined : { background: "transparent" }}>
                    {l}{n != null && <span className="text-[12px] tabular-nums opacity-60">{n}</span>}
                  </button>
                ))}
              </div>
            )}
            {selectedUsersForCompare.length > 0 &&
            <div className="mt-3 flex items-center gap-2 flex-wrap">
                <span className="text-encre/30 text-xs">Sélectionnés :</span>
                {selectedUsersForCompare.map((userId) => {
                const u = users.find((user) => user.id === userId);
                return u ?
                <Badge
                  key={userId}
                  className="bg-menthe/10 text-menthe border border-menthe/20 cursor-pointer hover:bg-menthe/20 text-xs"
                  onClick={() => toggleUserSelection(userId)}>
                      {u.full_name || u.email.split('@')[0]} ✕
                    </Badge> :
                null;
              })}
                <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedUsersForCompare([])}
                className="text-encre/30 hover:text-encre text-xs">

                  Tout effacer
                </Button>
              </div>
            }
      </div>

      {/* Section En attente d'activation : le même tableau que les utilisateurs (6 nov. 2026, Jules). */}
      {pendingUsers.length > 0 && (
        <div className="overflow-hidden rounded-[12px] border border-trait border-l-[3px] border-l-menthe bg-rail">
          <button
            onClick={() => setPendingCollapsed(prev => !prev)}
            className="group flex w-full items-center gap-2.5 px-4 py-3 text-left"
            style={{ background: "transparent" }}
          >
            <span className="flex-1 text-[15px] text-encre">En attente d'activation <span className="text-[13.5px] tabular-nums text-ardoise">{pendingUsers.length}</span></span>
            <ChevronDown className={`w-3.5 h-3.5 text-menthe/60 group-hover:text-menthe transition-transform ${pendingCollapsed && !searchTerm.trim() ? "-rotate-90" : ""}`} />
          </button>
          {(!pendingCollapsed || searchTerm.trim()) && (
            <div className="overflow-x-auto border-t border-trait">
              <table className={`${TABLEAU} min-w-[640px]`}>
                <thead>
                  <tr className="text-encre">
                    <th className={`${TETE} text-left`}>Nom</th>
                    <th className={`${TETE} text-left`}>Adresse mail</th>
                    <th className={TETE}>Invitation</th>
                    <th className={`${TETE} w-[44px]`}><span className="sr-only">Supprimer</span></th>
                  </tr>
                </thead>
                <tbody>
                  {pendingUsers.map((user) => (
                    <tr key={user.id} className="hover:bg-relief/60">
                      <td className={`${CELLULE} max-w-[260px] px-3 text-encre`}>
                        <span className="flex items-center gap-2.5">
                          <Initiale nom={user.full_name} />
                          <span className="truncate">{user.full_name || "Sans nom"}</span>
                        </span>
                      </td>
                      <td className={`${CELLULE} max-w-[280px] truncate px-2.5 text-craie`}>{user.email}</td>
                      <td className={`${CELLULE} px-2.5`}>
                        <span className="flex items-center justify-center gap-1.5 whitespace-nowrap py-1">
                          <button
                            onClick={() => inviterUn.mutate(user)}
                            disabled={inviterUn.isPending}
                            aria-label="Envoyer le lien d'accès (ou le copier, sans boîte d'envoi) : la personne choisit son mot de passe et entre à l'étape 1" title="Envoyer le lien d'accès (ou le copier, sans boîte d'envoi) : la personne choisit son mot de passe et entre à l'étape 1"
                            className="h-7 rounded-full bg-menthe px-3.5 text-[13px] text-sur-menthe transition-colors hover:bg-menthe-survol disabled:opacity-50"
                          >
                            {inviterUn.isPending && inviterUn.variables?.id === user.id ? "Envoi…" : "Inviter"}
                          </button>
                          <button
                            onClick={() => updateUserMutation.mutate({ userId: user.id, data: { etape_actuelle: 1 } })}
                            disabled={updateUserMutation.isPending}
                            aria-label="Passer client tout de suite (étape 1), sans envoyer de lien maintenant" title="Passer client tout de suite (étape 1), sans envoyer de lien maintenant"
                            className="h-7 rounded-full border border-trait px-3.5 text-[13px] text-craie transition-colors hover:border-bord-vif hover:text-encre disabled:opacity-40"
                            style={{ background: "transparent" }}
                          >
                            Client direct
                          </button>
                        </span>
                      </td>
                      <td className={`${CELLULE} text-center`}>
                        <Button variant="ghost" size="icon" onClick={() => handleDeleteClick(user)}
                          className="h-8 w-8 text-brume hover:text-red-400 hover:bg-transparent" aria-label="Supprimer" title="Supprimer">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Les utilisateurs en tableau, sur le modèle du CRM (6 nov. 2026, Jules : « un tableau avec des colonnes et des
          cases cochées ou pas ») : cases à traits pleins, une colonne par rôle ; le nom ouvre le détail, en dessous. Au
          téléphone, le tableau défile dans son cadre. */}
      <div className="max-w-full overflow-x-auto rounded-[12px] border border-trait border-l-[3px] border-l-menthe bg-rail">
        <table className={`${TABLEAU} min-w-[1120px]`}>
          <thead>
            <tr className="text-encre">
              <th className={`${TETE} w-[37px] min-w-[37px] p-0`}>
                <CaseLigne cochee={filteredUsers.length > 0 && filteredUsers.every((u) => selectedUsersForCompare.includes(u.id))} label="Tout sélectionner pour comparer"
                  onChange={() => { const tous = filteredUsers.every((u) => selectedUsersForCompare.includes(u.id)); setSelectedUsersForCompare((t) => (tous ? t.filter((x) => !filteredUsers.some((u) => u.id === x)) : [...new Set([...t, ...filteredUsers.map((u) => u.id)])])); }} />
              </th>
              <th className={`${TETE} text-left`}>Nom</th>
              <th className={`${TETE} text-left`}>Adresse mail</th>
              <th className={`${TETE} w-[96px]`}>Admin</th>
              <th className={`${TETE} w-[110px]`}>Mandataire</th>
              <th className={TETE}>Villes</th>
              <th className={`${TETE} w-[170px]`}>Étape</th>
              <th className={`${TETE} w-[120px]`}>Progression</th>
              <th className={TETE}>Profil</th>
              <th className={`${TETE} w-[190px]`}><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
        {filteredUsers.map((user) => {
          const isAdmin = user.role === "admin";
          const roles = rolesDuCompte(user);
          const membre = parEmail.get(String(user.email || "").toLowerCase());
          const intouchable = !!membre?.super_admin || String(user.email || "").toLowerCase() === String(moi?.email || "").toLowerCase();
          const isExpanded = expandedUserId === user.id;
          const isSelected = selectedUsersForCompare.includes(user.id);
          const etape = user.etape_actuelle ?? 0;
          const client = !roles.admin && !roles.mandataire;

          return (
            <React.Fragment key={user.id}>
            <tr id={`utilisateur-${user.id}`} className={isSelected || isExpanded ? "bg-relief" : "hover:bg-relief/60"}>
              <td className={`${CELLULE} w-[37px] min-w-[37px] p-0`}>
                <CaseLigne cochee={isSelected} onChange={() => toggleUserSelection(user.id)} label="Sélectionner pour comparer" />
              </td>
              {/* Le nom ouvre le détail de la ligne. */}
              <td className={`${CELLULE} max-w-[300px] p-0 text-encre`}>
                <button onClick={() => setExpandedUserId(isExpanded ? null : user.id)}
                  className="flex w-full min-w-0 items-center gap-2.5 px-3 py-1.5 text-left text-encre hover:text-menthe" style={{ background: "transparent" }}>
                  <Initiale nom={user.full_name} admin={isAdmin} />
                  <span className="truncate">{user.full_name || "Sans nom"}</span>
                  {membre?.super_admin && <span className="flex-none rounded-full bg-rail-actif px-2 py-0.5 text-[12px] text-menthe">Super admin</span>}
                  {user.est_compte_shadow && user.compte_maitre_email && <span className="flex-none rounded-full bg-rail-actif px-2 py-0.5 text-[12px] text-craie" title={`Voit le dossier de ${user.compte_maitre_email}`}>Famille</span>}
                  {user.comptes_lies && user.comptes_lies.length > 0 && <span className="flex-none rounded-full bg-rail-actif px-2 py-0.5 text-[12px] text-craie">Famille · {user.comptes_lies.length + 1}</span>}
                </button>
              </td>
              <td className={`${CELLULE} max-w-[260px] truncate px-2.5 text-craie`}>{user.email}</td>
              {/* Les deux cases (3 nov. 2026) : sans case cochée, c'est un client. */}
              <td className={`${CELLULE} text-center`}>
                <CaseRole petite coche={roles.admin} libelle={`Admin : ${user.full_name || user.email}`} desactive={!peutCocher || changerRoles.isPending || (roles.admin && intouchable)} onChange={(v) => poserRoles(user, v, roles.mandataire)} />
              </td>
              <td className={`${CELLULE} text-center`}>
                <CaseRole petite coche={roles.mandataire} libelle={`Mandataire : ${user.full_name || user.email}`} desactive={!peutCocher || changerRoles.isPending} onChange={(v) => poserRoles(user, roles.admin, v)} />
              </td>
              {/* Les villes d'un mandataire : elles ouvrent son réglage (villes, fiche). */}
              <td className={`${CELLULE} max-w-[220px] p-0 text-center`}>
                {roles.mandataire && (
                  <button type="button" onClick={() => gererMandataire(user)} className="block w-full truncate px-2.5 py-1.5 text-[13.5px] text-craie hover:text-menthe" style={{ background: "transparent" }}>
                    {/* Ses villes (6 nov. 2026) ; un ancien secteur tracé, son nom. */}
                    {membre?.secteur?.villes?.length ? `${membre.secteur.villes.join(", ")} ›` : membre?.secteur && !membre.secteur.villes ? `${membre.secteur.nom} ›` : <span className="text-ardoise">Sans ville ›</span>}
                  </button>
                )}
              </td>
              {/* Étape + progression : les clients seulement. La case prend la couleur de l'étape, comme un statut du CRM. */}
              <td className={`${CELLULE} p-0 ${client ? `text-center ${CLASSES_STATUT[couleurStatut(etapeLabels[etape])]}` : ""}`}>
                {client && (
                  <Select value={etape.toString()} onValueChange={(v) => handleChangeEtape(user.id, v)}>
                    <SelectTrigger aria-label={`Étape de ${user.full_name || user.email}`} className="h-[36px] justify-center gap-1.5 rounded-none border-0 bg-transparent px-2.5 text-[14px] text-current shadow-none focus:ring-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-fond border-bord">
                      {[0, 1, 2, 3, 4, 5].map((e) => <SelectItem key={e} value={e.toString()} className="text-encre">{`${e}. ${etapeLabels[e]}`}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
              </td>
              <td className={`${CELLULE} px-2.5`}>
                {client && (
                  <div className="flex items-center gap-2.5">
                    <div className="flex-1 h-px bg-encre/[0.14] relative">
                      <div className="absolute inset-y-0 left-0 bg-menthe transition-all duration-500 rounded-full" style={{ width: `${etape / 5 * 100}%`, height: "2px", top: "-0.5px" }} />
                    </div>
                    <span className="text-[11px] text-menthe-clair" style={{ fontVariantNumeric: "tabular-nums" }}>{Math.round(etape / 5 * 100)}%</span>
                  </div>
                )}
              </td>
              <td className={`${CELLULE} whitespace-nowrap px-2.5 text-center text-[13px] text-ardoise`}>{user.profil_investisseur ? profilLabels[user.profil_investisseur] : ""}</td>
              {/* Actions rapides */}
              <td className={`${CELLULE} px-1.5`}>
                <div className="flex items-center justify-end gap-0.5">
                  {!isAdmin && !user.mot_de_passe_defini && <BoutonLienInvitation user={user} />}
                  <Button variant="ghost" size="icon" onClick={() => handleOpenEditDialog(user)}
                    className="h-8 w-8 text-brume hover:text-encre hover:bg-transparent" title="Modifier la fiche client">
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => handleOpenStrategyDialog(user)}
                    className="h-8 w-8 text-brume hover:text-encre hover:bg-transparent" title="Définir la stratégie">
                    <FileText className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => handleDeleteClick(user)}
                    className="h-8 w-8 text-brume hover:text-red-400 hover:bg-transparent" title="Supprimer l'utilisateur">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                  <button onClick={() => setExpandedUserId(isExpanded ? null : user.id)}
                    className="w-8 h-8 flex items-center justify-center text-brume hover:text-encre transition-colors" aria-label="Détails" title="Détails">
                    <ChevronDown className={`w-4 h-4 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                  </button>
                </div>
              </td>
            </tr>

              {/* Panneau de détail : une ligne pleine largeur sous la ligne, collé à gauche quand le tableau défile. */}
              {isExpanded && (
                <tr className="bg-relief/40">
                <td colSpan={10} className={`${CELLULE} p-0`}>
                <div className="sticky left-0 max-w-[calc(100vw-2.5rem)] space-y-6 px-5 pb-6 pt-5 md:pl-12">
                  {/* Les pages du CRM qu'il voit (11 nov. 2026, Jules) : l'équipe et les mandataires, réglé par Jules seul. */}
                  {!client && moi?.gere_les_acces && <PagesCrm email={user.email} />}
                  {/* Profil investisseur */}
                  <div>
                    <div className="mb-3 text-[11px] uppercase tracking-[.16em] text-brume">Profil investisseur</div>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { value: "equilibriste", label: "L'équilibriste" },
                        { value: "risk_taker", label: "Risk taker" },
                        { value: "collectionneur", label: "Le Collectionneur" },
                        { value: "visionnaire", label: "Le Visionnaire" },
                      ].map((profil) => {
                        const isSel = user.profil_investisseur === profil.value;
                        return (
                          <button key={profil.value} onClick={() => handleChangeProfil(user.id, profil.value)}
                            className={`text-[12.5px] px-3.5 py-1 rounded-full border transition-colors ${isSel ? "bg-menthe/[0.16] border-menthe text-menthe-clair" : "border-encre/[0.18] text-ardoise hover:text-encre"}`}>
                            {profil.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Finances */}
                  {(user.revenus_annuels || user.epargne_annuelle || user.apport_disponible || user.duree_emprunt) && (
                    <div>
                      <div className="mb-3 text-[11px] uppercase tracking-[.16em] text-brume">Situation financière</div>
                      <div className="flex flex-wrap gap-x-10 gap-y-3" style={{ fontVariantNumeric: "tabular-nums" }}>
                        {user.revenus_annuels && <div><div className="text-[18px] font-light text-encre">{(user.revenus_annuels / 1000).toFixed(0)} K€</div><div className="text-[11px] text-ardoise mt-0.5">Revenus / an</div></div>}
                        {user.epargne_annuelle && <div><div className="text-[18px] font-light text-encre">{(user.epargne_annuelle / 1000).toFixed(0)} K€</div><div className="text-[11px] text-ardoise mt-0.5">Épargne / an</div></div>}
                        {user.apport_disponible && <div><div className="text-[18px] font-light text-menthe-clair">{(user.apport_disponible / 1000).toFixed(0)} K€</div><div className="text-[11px] text-ardoise mt-0.5">Apport disponible</div></div>}
                        {user.duree_emprunt && <div><div className="text-[18px] font-light text-encre">{user.duree_emprunt} ans</div><div className="text-[11px] text-ardoise mt-0.5">Durée d'emprunt</div></div>}
                      </div>
                    </div>
                  )}

                  {/* Gestion du compte */}
                  <div>
                    <div className="mb-3 text-[11px] uppercase tracking-[.16em] text-brume">Gestion du compte</div>
                    <div className="flex flex-wrap items-center gap-x-6 gap-y-2.5">
                      {etape >= 4 && (
                        <>
                          <label className="cursor-pointer inline-flex items-center gap-2 text-[13.5px] text-ardoise hover:text-encre transition-colors">
                            <input type="file" className="hidden"
                              onChange={(e) => { if (e.target.files[0]) handleUploadDossierBancaire(user.id, e.target.files[0]); }} />
                            {uploadingDossier === user.id
                              ? <Loader2 className="w-3.5 h-3.5 animate-spin text-menthe" />
                              : <Upload className={`w-3.5 h-3.5 ${user.dossier_bancaire_url ? "text-menthe-clair" : ""}`} />}
                            {user.dossier_bancaire_url ? "Remplacer le dossier bancaire" : "Dossier bancaire"}
                          </label>
                          {user.dossier_bancaire_url && (
                            <a href={user.dossier_bancaire_url} target="_blank" rel="noopener noreferrer"
                              className="inline-flex items-center gap-2 text-[13.5px] text-menthe-clair hover:text-encre transition-colors">
                              <Download className="w-3.5 h-3.5" /> Télécharger le dossier
                            </a>
                          )}
                        </>
                      )}
                      <button onClick={() => setAssignerPour(user)}
                        className="inline-flex items-center gap-2 text-[13.5px] text-menthe hover:text-encre transition-colors">
                        <Building2 className="w-3.5 h-3.5" /> Assigner un projet
                      </button>
                      {user.est_compte_shadow ? (
                        <button onClick={() => handleUnlinkAccount(user)}
                          className="inline-flex items-center gap-2 text-[13.5px] text-ardoise hover:text-encre transition-colors">
                          <Unlink className="w-3.5 h-3.5" /> Retirer de la famille
                        </button>
                      ) : (
                        <button onClick={() => handleOpenLinkDialog(user)}
                          className="inline-flex items-center gap-2 text-[13.5px] text-ardoise hover:text-encre transition-colors">
                          <Link className="w-3.5 h-3.5" /> Rattacher à une famille
                        </button>
                      )}
                    </div>
                  </div>
                </div>
                </td>
                </tr>
              )}
            </React.Fragment>
          );
        })}

        {filteredUsers.length === 0 && (
          <tr>
          <td colSpan={10} className="px-5 pb-16 pt-10 text-center">
            <Users className="w-8 h-8 text-encre/15 mx-auto mb-5" />
            <p className="text-ardoise text-sm mb-0">
              {searchTerm.trim() && pendingUsers.length
                ? `Aucun client actif ne correspond : ${pendingUsers.length === 1 ? "le compte trouvé est" : `les ${pendingUsers.length} comptes trouvés sont`} en attente d'activation, plus haut.`
                : searchTerm || etapeFilter !== "all" ? "Aucun utilisateur ne correspond" : "Aucun utilisateur"}
            </p>
          </td>
          </tr>
        )}
          </tbody>
        </table>
      </div>
      {/* Les pages de chaque administrateur (ex-page Équipe), sous le filtre Admins. */}
      {roleFilter === "admins" && moi?.gere_les_acces && (
        <section>
          <h2 className="m-0 mb-3 text-[11px] font-normal uppercase tracking-[.16em] text-menthe">Les pages de chaque administrateur</h2>
          <AccesAdmins />
        </section>
      )}

      </>}
      </div>

      {/* Dialog de confirmation de suppression */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="bg-fond border-trait">
          <DialogHeader>
            <DialogTitle className="text-encre">Confirmer la suppression</DialogTitle>
            <DialogDescription className="text-ardoise">
              Êtes-vous sûr de vouloir supprimer le compte de{" "}
              <strong className="text-encre">{userToDelete?.full_name || userToDelete?.email}</strong> ?
              {userToDelete?.role === "admin" &&
              <span className="block mt-2 text-amber-600 font-semibold">
                  Attention : cet utilisateur est administrateur
                </span>
              }
            </DialogDescription>
          </DialogHeader>
          <div className="bg-menthe/5 border border-menthe/20 rounded-md p-4 my-4">
            <p className="text-sm text-menthe/80">
              Cette action est irréversible. L'utilisateur devra recréer un compte pour accéder à l'application.
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteConfirmOpen(false)}>

              Annuler
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteConfirm}
              disabled={deleteUserMutation.isPending}>

              {deleteUserMutation.isPending ? "Suppression..." : "Supprimer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de stratégie */}
      <Dialog open={strategyDialogOpen} onOpenChange={setStrategyDialogOpen}>
        <DialogContent className="bg-fond border-trait max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-encre">
              Stratégie de {selectedUser?.full_name || selectedUser?.email}
            </DialogTitle>
            <DialogDescription className="text-ardoise">
              Définissez les critères de stratégie d'investissement pour ce client.
            </DialogDescription>
          </DialogHeader>

          {/* Champs obligatoires Budget et Apport */}
          <div className="grid grid-cols-2 gap-4 my-4 p-4 bg-encre/[0.05] border border-bord rounded-lg max-md:grid-cols-1">
            <div>
              <Label className="text-ardoise text-sm font-medium">Budget max (€)</Label>
              <Input
                type="number"
                placeholder="Ex: 500000"
                value={strategyBudgetMax}
                onChange={(e) => setStrategyBudgetMax(e.target.value)}
                className="bg-fond border-bord text-encre mt-1" />

            </div>
            <div>
              <Label className="text-ardoise text-sm font-medium">Apport (€)</Label>
              <Input
                type="number"
                placeholder="Ex: 100000"
                value={strategyApport}
                onChange={(e) => setStrategyApport(e.target.value)}
                className="bg-fond border-bord text-encre mt-1" />

            </div>
          </div>

          {/* Champs supplémentaires */}
          <div className="space-y-3 my-4">
            {strategyFields.map((field, index) =>
            <div
              key={index}
              className={`flex items-start gap-3 p-3 rounded-lg ${
              field.is_nogo ?
              'bg-red-500/10 border border-red-500/30' :
              'bg-encre/[0.05] border border-bord'}`
              }>

                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`font-medium text-sm ${field.is_nogo ? 'text-red-400' : 'text-encre'}`}>
                      {field.label}
                    </span>
                    {field.is_nogo &&
                  <Badge className="bg-red-500/20 text-red-400 text-xs">No-go</Badge>
                  }
                  </div>
                  <p className="text-ardoise text-sm">{field.value}</p>
                </div>
                <Button
                variant="ghost"
                size="icon"
                onClick={() => handleRemoveField(index)}
                className="text-ardoise hover:text-red-400">

                  <X className="w-4 h-4" />
                </Button>
              </div>
            )}
          </div>

          {/* Ajouter un nouveau champ */}
          <div className="border border-bord rounded-lg p-4 space-y-4">
            <h4 className="text-encre font-medium text-sm">Ajouter un critère</h4>
            <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
              <div>
                <Label className="text-ardoise text-xs">Intitulé</Label>
                <Input
                  placeholder="Ex: Budget max"
                  value={newFieldLabel}
                  onChange={(e) => setNewFieldLabel(e.target.value)}
                  className="bg-fond border-bord text-encre mt-1" />

              </div>
              <div className="flex items-end gap-4">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={newFieldIsNogo}
                    onCheckedChange={setNewFieldIsNogo}
                    className="data-[state=checked]:bg-red-500" />

                  <Label className="text-ardoise text-xs">No-go</Label>
                </div>
              </div>
            </div>
            <div>
              <Label className="text-ardoise text-xs">Valeur / Description</Label>
              <Textarea
                placeholder="Ex: 500 000€"
                value={newFieldValue}
                onChange={(e) => setNewFieldValue(e.target.value)}
                className="bg-fond border-bord text-encre mt-1"
                rows={2} />

            </div>
            <Button
              onClick={handleAddField}
              disabled={!newFieldLabel.trim() || !newFieldValue.trim()}
              className="w-full bg-menthe text-sur-menthe hover:bg-menthe-survol border-0 rounded-full">

              <Plus className="w-4 h-4 mr-2" />
              Ajouter ce critère
            </Button>
          </div>

          <DialogFooter className="mt-4">
            <Button
              variant="outline"
              onClick={() => setStrategyDialogOpen(false)}
              className="border-bord text-ardoise">

              Annuler
            </Button>
            <Button
              onClick={handleSaveStrategy}
              className="bg-menthe text-sur-menthe hover:bg-menthe-survol border-0 rounded-full"
              disabled={createStrategyMutation.isPending || updateStrategyMutation.isPending}>

              {createStrategyMutation.isPending || updateStrategyMutation.isPending ? "Enregistrement..." : "Enregistrer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog liaison de comptes */}
      <DialogueAssignerProjets
        user={assignerPour}
        projects={allProjects}
        ouvert={!!assignerPour}
        onClose={() => setAssignerPour(null)}
      />

      <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
        <DialogContent className="bg-fond border-trait">
          <DialogHeader>
            <DialogTitle className="text-encre flex items-center gap-2">
              <Link className="w-5 h-5 text-menthe" />
              Rattacher à une famille
            </DialogTitle>
            <DialogDescription className="text-ardoise">
              {selectedUserForLink?.full_name || selectedUserForLink?.email} garde son adresse et son mot de passe, et voit le dossier du titulaire choisi.
            </DialogDescription>
          </DialogHeader>

          <div className="my-4 space-y-4">
            <div>
              <Label className="text-ardoise text-sm mb-2 block">Compte rattaché</Label>
              <div className="p-3 bg-surface rounded-lg border border-bord">
                <p className="text-encre">{selectedUserForLink?.full_name || "Sans nom"}</p>
                <p className="text-ardoise text-sm">{selectedUserForLink?.email}</p>
              </div>
            </div>

            <div>
              <Label className="text-ardoise text-sm mb-2 block">Titulaire (son dossier est celui que tous voient)</Label>
              <Select value={masterEmail} onValueChange={setMasterEmail}>
                <SelectTrigger className="bg-fond border-bord text-encre">
                  <SelectValue placeholder="Choisir le titulaire" />
                </SelectTrigger>
                <SelectContent>
                  {users.
                  filter((u) => u.email !== selectedUserForLink?.email && !u.est_compte_shadow && u.role !== 'admin' && u.role !== 'mandataire').
                  map((u) =>
                  <SelectItem key={u.id} value={u.email}>
                        {u.full_name || "Sans nom"} ({u.email})
                      </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setLinkDialogOpen(false);
                setSelectedUserForLink(null);
                setMasterEmail("");
              }}
              className="border-bord text-ardoise">

              Annuler
            </Button>
            <Button
              onClick={handleLinkAccounts}
              className="bg-menthe text-sur-menthe hover:bg-menthe-survol border-0 rounded-full"
              disabled={!masterEmail}>

              Rattacher
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog nom de la famille */}
      <Dialog open={familleNameDialogOpen} onOpenChange={setFamilleNameDialogOpen}>
        <DialogContent className="bg-fond border-trait">
          <DialogHeader>
            <DialogTitle className="text-encre">Comparer ces profils</DialogTitle>
            <DialogDescription className="text-ardoise">
              Donnez un nom à ce groupe de {selectedUsersForCompare.length} investisseurs.
            </DialogDescription>
          </DialogHeader>
          <div className="my-4">
            <Input
              placeholder="Ex: Famille Dupont-Martin"
              value={newFamilleName}
              onChange={(e) => setNewFamilleName(e.target.value)}
              className="bg-fond border-bord text-encre"
              onKeyPress={(e) => e.key === 'Enter' && handleCreateFamille()} />

          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setFamilleNameDialogOpen(false)}
              className="border-bord text-ardoise">

              Annuler
            </Button>
            <Button
              onClick={handleCreateFamille}
              className="bg-menthe text-sur-menthe hover:bg-menthe-survol border-0 rounded-full"
              disabled={!newFamilleName.trim()}>

              Créer et comparer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog édition fiche client */}
      <Dialog open={editUserDialogOpen} onOpenChange={setEditUserDialogOpen}>
        <DialogContent className="bg-fond border-trait max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-encre flex items-center gap-2">
              <Edit className="w-5 h-5 text-blue-500" />
              Fiche client : {editingUser?.full_name || editingUser?.email}
            </DialogTitle>
            <DialogDescription className="text-ardoise">
              Complétez les informations financières et les préférences du client
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 my-4">
            {/* Profil investisseur - en lecture seule mais visible */}
            {editingUser?.profil_investisseur &&
            <div className="p-3 bg-encre/[0.05] border border-bord rounded-lg">
                <Label className="text-ardoise text-sm font-medium">Profil investisseur</Label>
                <p className="text-encre mt-1">{profilLabels[editingUser.profil_investisseur] || editingUser.profil_investisseur}</p>
                <p className="text-xs text-ardoise mt-1">Ce champ se remplit automatiquement lors du changement de profil</p>
              </div>
            }

            <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
              <div>
                <Label className="text-ardoise text-sm">Revenus annuels (€)</Label>
                <Input
                  type="number"
                  placeholder="Ex: 60000"
                  value={editForm.revenus_annuels}
                  onChange={(e) => setEditForm({ ...editForm, revenus_annuels: e.target.value })}
                  className="bg-fond border-bord text-encre mt-1" />

              </div>

              <div>
                <Label className="text-ardoise text-sm">Épargne annuelle (€)</Label>
                <Input
                  type="number"
                  placeholder="Ex: 15000"
                  value={editForm.epargne_annuelle}
                  onChange={(e) => setEditForm({ ...editForm, epargne_annuelle: e.target.value })}
                  className="bg-fond border-bord text-encre mt-1" />

              </div>

              <div>
                <Label className="text-ardoise text-sm">Durée d'emprunt (années)</Label>
                <Select
                  value={editForm.duree_emprunt}
                  onValueChange={(val) => setEditForm({ ...editForm, duree_emprunt: val })}>

                  <SelectTrigger className="bg-fond border-bord text-encre mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-fond border-bord">
                    {[15, 20, 25, 30].map((years) =>
                    <SelectItem key={years} value={String(years)} className="text-encre">
                        {years} ans
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-ardoise text-sm">Apport disponible (€)</Label>
                <Input
                  type="number"
                  placeholder="Ex: 100000"
                  value={editForm.apport_disponible}
                  onChange={(e) => setEditForm({ ...editForm, apport_disponible: e.target.value })}
                  className="bg-fond border-bord text-encre mt-1" />

              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setEditUserDialogOpen(false);
                setEditingUser(null);
              }}
              className="border-bord text-ardoise">

              Annuler
            </Button>
            <Button
              onClick={handleSaveEditUser}
              className="bg-menthe text-sur-menthe hover:bg-menthe-survol border-0 rounded-full"
              disabled={updateUserMutation.isPending}>

              {updateUserMutation.isPending ? "Enregistrement..." : "Enregistrer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog sélection projet pour étape 4 */}
      <Dialog open={etapeDialogOpen} onOpenChange={setEtapeDialogOpen}>
        <DialogContent className="bg-fond border-trait">
          <DialogHeader>
            <DialogTitle className="text-encre flex items-center gap-2">
              <Building2 className="w-5 h-5 text-ardoise" />
              Sélectionner le projet à poursuivre
            </DialogTitle>
            <DialogDescription className="text-ardoise">
              Le client passera en étape {pendingEtapeChange?.etape}. À partir de l'étape 4, choisissez le projet qu'il va poursuivre (il ne verra que ce projet).
            </DialogDescription>
          </DialogHeader>

          <div className="my-4">
            <Label className="text-ardoise text-sm mb-2 block">Projet sélectionné</Label>
            <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
              <SelectTrigger className="bg-fond border-bord text-encre">
                <SelectValue placeholder="Sélectionner un projet" />
              </SelectTrigger>
              <SelectContent>
                {pendingEtapeChange?.userProjects?.map((project) =>
                <SelectItem key={project.id} value={project.id}>
                    {project.titre}
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setEtapeDialogOpen(false);
                setPendingEtapeChange(null);
              }}
              className="border-bord text-ardoise">

              Annuler
            </Button>
            <Button
              onClick={handleConfirmEtapeChange}
              className="bg-menthe text-sur-menthe hover:bg-menthe-survol border-0 rounded-full"
              disabled={!selectedProjectId}>

              Confirmer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>);

}