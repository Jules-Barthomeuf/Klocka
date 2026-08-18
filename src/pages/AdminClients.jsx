import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { AnimatedDropdown } from "@/components/ui/animated-dropdown";
import { Users, Search, Trash2, Crown, FileText, Plus, X, Upload, Download, Building2, Link, Unlink, GitCompare, User, TrendingUp, Target, Sparkles, Edit, Loader2, ChevronDown } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle } from
"@/components/ui/dialog";

// Import d'un export Base44 (tableau JSON d'utilisateurs). Idempotent côté
// serveur : les adresses déjà en base ne sont jamais écrasées.
function BoutonImportUtilisateurs() {
  const queryClient = useQueryClient();
  const inputRef = React.useRef(null);

  const importer = useMutation({
    mutationFn: async (fichier) => {
      const texte = await fichier.text();
      let utilisateurs;
      try {
        utilisateurs = JSON.parse(texte);
      } catch {
        throw new Error("Ce fichier n'est pas un JSON valide.");
      }
      return base44.request("POST", "/api/admin/import-utilisateurs", { body: { utilisateurs } });
    },
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ["all-users"] });
      const parts = [`${r.crees.length} compte(s) créé(s)`];
      if (r.existants.length) parts.push(`${r.existants.length} déjà présent(s)`);
      if (r.invalides.length) parts.push(`${r.invalides.length} invalide(s)`);
      window.alert(`Import terminé : ${parts.join(", ")}.\n\nLes nouveaux comptes n'ont pas de mot de passe : chacun le définit à sa première connexion.`);
    },
    onError: (e) => window.alert(e?.message || "Import impossible"),
  });

  return (
    <>
      <Button
        onClick={() => inputRef.current?.click()}
        disabled={importer.isPending}
        variant="outline"
        className="h-10 text-sm border-[#303332] bg-transparent text-[#9aa19e] hover:border-[#565b59] hover:text-[#edeae5]"
      >
        {importer.isPending ? (
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
        ) : (
          <Upload className="w-4 h-4 mr-2" />
        )}
        Importer (JSON)
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) importer.mutate(f);
          e.target.value = "";
        }}
      />
    </>
  );
}

const profilColors = {
  equilibriste: "bg-blue-100 text-blue-800",
  risk_taker: "bg-red-100 text-red-800",
  collectionneur: "bg-purple-100 text-purple-800",
  visionnaire: "bg-[#edeae5]/[0.07] text-[#9aa19e]"
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


export default function AdminClients() {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const [etapeFilter, setEtapeFilter] = useState("all");
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

  const pendingUsers = users.filter((u) => (u.etape_actuelle ?? 0) === 0 && u.role !== 'admin');

  const filteredUsers = users.filter((user) =>
  ((user.etape_actuelle ?? 0) > 0 || user.role === 'admin') &&
  (etapeFilter === "all"
    || (etapeFilter === "admin" && user.role === "admin")
    || (user.role !== "admin" && (user.etape_actuelle ?? 0) === Number(etapeFilter))) &&
  (user.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
  user.email?.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  // Compteurs du bandeau et des filtres (hors recherche, pour rester stables)
  const clientsActifs = users.filter((u) => u.role !== 'admin' && (u.etape_actuelle ?? 0) > 0);
  const nbParEtape = (e) => clientsActifs.filter((u) => (u.etape_actuelle ?? 0) === e).length;
  const nbAdmins = users.filter((u) => u.role === 'admin').length;

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

  const handlePromoteToAdmin = async (user) => {
    await updateUserMutation.mutateAsync({
      userId: user.id,
      data: { role: "admin" }
    });
  };

  const handleDemoteFromAdmin = async (user) => {
    await updateUserMutation.mutateAsync({
      userId: user.id,
      data: { role: "user" }
    });
  };

  const handlePromoteToMandataire = async (user) => {
    await updateUserMutation.mutateAsync({
      userId: user.id,
      data: { role: "mandataire" }
    });
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

  const handleLinkAccounts = async () => {
    if (!selectedUserForLink || !masterEmail) return;

    // Trouver le compte maître
    const masterUser = users.find((u) => u.email === masterEmail);
    if (!masterUser) {
      alert("Compte maître non trouvé");
      return;
    }

    // Mettre à jour le compte esclave
    await updateUserMutation.mutateAsync({
      userId: selectedUserForLink.id,
      data: {
        compte_maitre_email: masterEmail,
        est_compte_shadow: true
      }
    });

    // Mettre à jour le compte maître avec la liste des comptes liés
    const currentLinked = masterUser.comptes_lies || [];
    if (!currentLinked.includes(selectedUserForLink.email)) {
      await updateUserMutation.mutateAsync({
        userId: masterUser.id,
        data: {
          comptes_lies: [...currentLinked, selectedUserForLink.email]
        }
      });
    }

    setLinkDialogOpen(false);
    setSelectedUserForLink(null);
    setMasterEmail("");
  };

  const handleUnlinkAccount = async (user) => {
    if (!user.compte_maitre_email) return;

    const masterUser = users.find((u) => u.email === user.compte_maitre_email);

    // Retirer du compte maître
    if (masterUser) {
      const currentLinked = masterUser.comptes_lies || [];
      await updateUserMutation.mutateAsync({
        userId: masterUser.id,
        data: {
          comptes_lies: currentLinked.filter((e) => e !== user.email)
        }
      });
    }

    // Mettre à jour le compte esclave
    await updateUserMutation.mutateAsync({
      userId: user.id,
      data: {
        compte_maitre_email: null,
        est_compte_shadow: false
      }
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0a0c0c] flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-[#35a79b] animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0c0c] text-[#edeae5]">
      <div className="max-w-6xl mx-auto px-4 md:px-8 py-8 md:py-12">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[34px] max-md:text-[26px] font-light tracking-[-0.02em] leading-[1.05] text-[#edeae5] m-0">Utilisateurs</h1>
          <p className="text-[13.5px] leading-[1.7] text-[#8b9391] mt-2 mb-0">Gérez tous les utilisateurs de la plateforme.</p>
        </div>
        <BoutonImportUtilisateurs />
      </div>

      {/* Bandeau de chiffres */}
      <div className="flex flex-wrap border-t border-[#edeae5]/[0.35] mb-8 max-md:mb-6">
        {[
          { valeur: clientsActifs.length, label: "Clients actifs" },
          { valeur: pendingUsers.length, label: "En attente d'activation", accent: "text-[#e0c9a0]" },
          { valeur: nbParEtape(3), label: "En recherche", accent: "text-[#7fd3c9]" },
          { valeur: nbParEtape(4), label: "En financement" },
          { valeur: nbParEtape(5), label: "Signés", accent: "text-[#7fd3c9]" },
        ].map((c, i) => (
          <div key={i} className={`flex-1 min-w-[130px] max-md:min-w-[46%] py-5 max-md:py-3.5 pr-5 ${i > 0 ? "md:border-l md:border-[#edeae5]/[0.12] md:pl-6" : ""}`}>
            <div className={`text-[26px] max-md:text-[20px] font-light ${c.accent || "text-[#edeae5]"}`} style={{ fontVariantNumeric: "tabular-nums" }}>{c.valeur}</div>
            <div className="text-[12px] text-[#8b9391] mt-1">{c.label}</div>
          </div>
        ))}
      </div>

      <div className="mb-6">
            <div className="flex flex-col md:flex-row gap-3 md:gap-4 items-stretch md:items-center">
              <div className="flex-1 flex items-center gap-3 border-b border-[#edeae5]/[0.18] focus-within:border-[#565b59] transition-colors pb-2">
                <Search className="w-4 h-4 text-[#6b7270] flex-shrink-0" />
                <input
                  placeholder="Rechercher un utilisateur…"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-transparent border-none text-[15px] text-[#edeae5] placeholder:text-[#6b7270] outline-none py-1" />
              </div>
              {selectedUsersForCompare.length >= 2 &&
              <Button
                onClick={handleCompareUsers}
                className="h-10 text-sm bg-[#edeae5]/[0.06] border border-[#3a3e3c] hover:bg-[#edeae5]/[0.1] text-[#edeae5]">
                  <GitCompare className="w-4 h-4 mr-2" />
                  Comparer ({selectedUsersForCompare.length})
                </Button>
              }
            </div>
            <div className="mt-5 flex items-center gap-x-6 gap-y-2 flex-wrap">
              {[
                { v: "all", l: "Tous", n: clientsActifs.length + nbAdmins },
                ...[1, 2, 3, 4, 5].map((e) => ({ v: String(e), l: etapeLabels[e], n: nbParEtape(e) })),
                { v: "admin", l: "Admins", n: nbAdmins },
              ].map(({ v, l, n }) => (
                <button key={v} onClick={() => setEtapeFilter(v)}
                  className={`text-[11px] tracking-[0.16em] uppercase pb-1 border-b transition-colors ${etapeFilter === v ? "text-[#edeae5] border-[#35a79b]" : "text-[#8b9391] border-transparent hover:text-[#edeae5]"}`}>
                  {l} <span className="text-[#6b7270]">{n}</span>
                </button>
              ))}
            </div>
            {selectedUsersForCompare.length > 0 &&
            <div className="mt-3 flex items-center gap-2 flex-wrap">
                <span className="text-[#edeae5]/30 text-xs">Sélectionnés :</span>
                {selectedUsersForCompare.map((userId) => {
                const u = users.find((user) => user.id === userId);
                return u ?
                <Badge
                  key={userId}
                  className="bg-[#35a79b]/10 text-[#35a79b] border border-[#35a79b]/20 cursor-pointer hover:bg-[#35a79b]/20 text-xs"
                  onClick={() => toggleUserSelection(userId)}>
                      {u.full_name || u.email.split('@')[0]} ✕
                    </Badge> :
                null;
              })}
                <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedUsersForCompare([])}
                className="text-[#edeae5]/30 hover:text-[#edeae5] text-xs">

                  Tout effacer
                </Button>
              </div>
            }
      </div>

      {/* Section En attente d'activation */}
      {pendingUsers.length > 0 && (
        <div className="mb-10 max-md:mb-8">
          <button
            onClick={() => setPendingCollapsed(prev => !prev)}
            className="flex items-center gap-2.5 w-full text-left group"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[#e0c9a0] animate-pulse" />
            <span className="text-[10px] tracking-[0.2em] uppercase text-[#e0c9a0] flex-1">En attente d'activation · {pendingUsers.length}</span>
            <ChevronDown className={`w-3.5 h-3.5 text-[#e0c9a0]/60 group-hover:text-[#e0c9a0] transition-transform ${pendingCollapsed ? "-rotate-90" : ""}`} />
          </button>
          {!pendingCollapsed && (
            <div className="mt-4">
              {pendingUsers.map((user) => (
                <div key={user.id} className="flex items-center gap-4 py-3.5 border-t border-[#edeae5]/[0.12]">
                  <div className="w-9 h-9 rounded-full border border-[#e0c9a0]/40 flex items-center justify-center flex-shrink-0">
                    <span className="text-[11px] text-[#e0c9a0]">{user.full_name?.charAt(0)?.toUpperCase() || "?"}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[#edeae5] text-[15px] truncate m-0">{user.full_name || "Sans nom"}</p>
                    <p className="text-[#8b9391] text-xs truncate m-0">{user.email}</p>
                  </div>
                  <button
                    onClick={() => updateUserMutation.mutate({ userId: user.id, data: { etape_actuelle: 1 } })}
                    disabled={updateUserMutation.isPending}
                    className="px-4 py-1.5 text-[10px] tracking-[0.16em] uppercase border border-[#3a3e3c] text-[#edeae5] hover:bg-[#edeae5]/[0.06] transition-colors disabled:opacity-40 flex-shrink-0"
                  >
                    Activer
                  </button>
                  <Button variant="ghost" size="icon" onClick={() => handleDeleteClick(user)}
                    className="h-8 w-8 text-[#6b7270] hover:text-red-400 hover:bg-transparent flex-shrink-0">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Liste des utilisateurs — rangées filetées, détail repliable */}
      <div className="border-b border-[#edeae5]/[0.12]">
        {filteredUsers.map((user) => {
          const isAdmin = user.role === "admin";
          const isExpanded = expandedUserId === user.id;
          const isSelected = selectedUsersForCompare.includes(user.id);
          const etape = user.etape_actuelle ?? 0;

          return (
            <div key={user.id} className={`border-t border-[#edeae5]/[0.12] transition-colors ${isSelected ? "bg-[#35a79b]/[0.05]" : isExpanded ? "bg-[#edeae5]/[0.015]" : ""}`}>
              {/* Rangée principale */}
              <div className="flex items-center gap-4 max-md:gap-3 py-4 max-md:flex-wrap">
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={() => toggleUserSelection(user.id)}
                  className="border-[#565b59] rounded-none data-[state=checked]:bg-[#35a79b] data-[state=checked]:border-[#35a79b] flex-shrink-0"
                  title="Sélectionner pour comparer" />

                <button
                  onClick={() => setExpandedUserId(isExpanded ? null : user.id)}
                  className="flex items-center gap-3 flex-1 min-w-0 text-left"
                >
                  <div className={`w-9 h-9 rounded-full border flex items-center justify-center flex-shrink-0 ${isAdmin ? "border-[#e0c9a0]/50" : "border-[#565b59]"}`}>
                    <span className={`text-[11px] ${isAdmin ? "text-[#e0c9a0]" : "text-[#9aa19e]"}`}>
                      {user.full_name?.charAt(0)?.toUpperCase() || "U"}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className="text-[#edeae5] text-[15px] truncate">{user.full_name || "Sans nom"}</span>
                      {isAdmin && <span className="text-[9px] tracking-[0.16em] uppercase text-[#e0c9a0] border border-[#e0c9a0]/40 rounded-full px-2 py-px">Admin</span>}
                      {user.role === 'mandataire' && <span className="text-[9px] tracking-[0.16em] uppercase text-[#9aa19e] border border-[#9aa19e]/40 rounded-full px-2 py-px">Mandataire</span>}
                      {user.est_compte_shadow && user.compte_maitre_email && <span className="text-[9px] tracking-[0.16em] uppercase text-[#8b9391] border border-[#edeae5]/[0.18] rounded-full px-2 py-px">Lié</span>}
                      {user.comptes_lies && user.comptes_lies.length > 0 && <span className="text-[9px] tracking-[0.16em] uppercase text-[#8b9391] border border-[#edeae5]/[0.18] rounded-full px-2 py-px">{user.comptes_lies.length} lié{user.comptes_lies.length > 1 ? "s" : ""}</span>}
                      {user.profil_investisseur && <span className="text-[9px] tracking-[0.16em] uppercase text-[#8b9391] max-md:hidden">{profilLabels[user.profil_investisseur]}</span>}
                    </div>
                    <p className="text-[#8b9391] text-xs truncate m-0 mt-0.5">{user.email}</p>
                  </div>
                </button>

                {/* Étape + progression */}
                {!isAdmin && (
                  <div className="flex items-center gap-4 max-md:w-full max-md:order-last max-md:pl-9">
                    <div className="w-44 max-md:flex-1">
                      <AnimatedDropdown
                        value={etape.toString()}
                        onChange={(v) => handleChangeEtape(user.id, v)}
                        options={[0, 1, 2, 3, 4, 5].map((e) => ({ value: e.toString(), label: `${e}. ${etapeLabels[e]}` }))}
                      />
                    </div>
                    <div className="w-24 max-md:w-20 flex items-center gap-2.5">
                      <div className="flex-1 h-px bg-[#edeae5]/[0.14] relative">
                        <div className="absolute inset-y-0 left-0 bg-[#35a79b] transition-all duration-500" style={{ width: `${etape / 5 * 100}%`, height: "2px", top: "-0.5px" }} />
                      </div>
                      <span className="text-[11px] text-[#7fd3c9]" style={{ fontVariantNumeric: "tabular-nums" }}>{Math.round(etape / 5 * 100)}%</span>
                    </div>
                  </div>
                )}

                {/* Actions rapides */}
                <div className="flex items-center gap-0.5 flex-shrink-0">
                  <Button variant="ghost" size="icon" onClick={() => handleOpenEditDialog(user)}
                    className="h-8 w-8 text-[#6b7270] hover:text-[#edeae5] hover:bg-transparent" title="Modifier la fiche client">
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => handleOpenStrategyDialog(user)}
                    className="h-8 w-8 text-[#6b7270] hover:text-[#edeae5] hover:bg-transparent" title="Définir la stratégie">
                    <FileText className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => handleDeleteClick(user)}
                    className="h-8 w-8 text-[#6b7270] hover:text-red-400 hover:bg-transparent" title="Supprimer l'utilisateur">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                  <button onClick={() => setExpandedUserId(isExpanded ? null : user.id)}
                    className="w-8 h-8 flex items-center justify-center text-[#6b7270] hover:text-[#edeae5] transition-colors" title="Détails">
                    <ChevronDown className={`w-4 h-4 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                  </button>
                </div>
              </div>

              {/* Panneau de détail */}
              {isExpanded && (
                <div className="pb-6 pl-[52px] max-md:pl-0 pr-2 space-y-6">
                  {/* Profil investisseur */}
                  <div>
                    <div className="text-[10px] tracking-[0.2em] uppercase text-[#8b9391] mb-3">Profil investisseur</div>
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
                            className={`text-[12px] px-3.5 py-1 rounded-full border transition-colors ${isSel ? "bg-[#35a79b]/[0.16] border-[#35a79b] text-[#7fd3c9]" : "border-[#edeae5]/[0.18] text-[#8b9391] hover:text-[#edeae5]"}`}>
                            {profil.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Finances */}
                  {(user.revenus_annuels || user.epargne_annuelle || user.apport_disponible || user.duree_emprunt) && (
                    <div>
                      <div className="text-[10px] tracking-[0.2em] uppercase text-[#8b9391] mb-3">Situation financière</div>
                      <div className="flex flex-wrap gap-x-10 gap-y-3" style={{ fontVariantNumeric: "tabular-nums" }}>
                        {user.revenus_annuels && <div><div className="text-[18px] font-light text-[#edeae5]">{(user.revenus_annuels / 1000).toFixed(0)} K€</div><div className="text-[11px] text-[#8b9391] mt-0.5">Revenus / an</div></div>}
                        {user.epargne_annuelle && <div><div className="text-[18px] font-light text-[#edeae5]">{(user.epargne_annuelle / 1000).toFixed(0)} K€</div><div className="text-[11px] text-[#8b9391] mt-0.5">Épargne / an</div></div>}
                        {user.apport_disponible && <div><div className="text-[18px] font-light text-[#7fd3c9]">{(user.apport_disponible / 1000).toFixed(0)} K€</div><div className="text-[11px] text-[#8b9391] mt-0.5">Apport disponible</div></div>}
                        {user.duree_emprunt && <div><div className="text-[18px] font-light text-[#edeae5]">{user.duree_emprunt} ans</div><div className="text-[11px] text-[#8b9391] mt-0.5">Durée d'emprunt</div></div>}
                      </div>
                    </div>
                  )}

                  {/* Gestion du compte */}
                  <div>
                    <div className="text-[10px] tracking-[0.2em] uppercase text-[#8b9391] mb-3">Gestion du compte</div>
                    <div className="flex flex-wrap items-center gap-x-6 gap-y-2.5">
                      {etape >= 4 && (
                        <>
                          <label className="cursor-pointer inline-flex items-center gap-2 text-[11px] tracking-[0.14em] uppercase text-[#8b9391] hover:text-[#edeae5] transition-colors">
                            <input type="file" className="hidden"
                              onChange={(e) => { if (e.target.files[0]) handleUploadDossierBancaire(user.id, e.target.files[0]); }} />
                            {uploadingDossier === user.id
                              ? <Loader2 className="w-3.5 h-3.5 animate-spin text-[#35a79b]" />
                              : <Upload className={`w-3.5 h-3.5 ${user.dossier_bancaire_url ? "text-[#7fd3c9]" : ""}`} />}
                            {user.dossier_bancaire_url ? "Remplacer le dossier bancaire" : "Dossier bancaire"}
                          </label>
                          {user.dossier_bancaire_url && (
                            <a href={user.dossier_bancaire_url} target="_blank" rel="noopener noreferrer"
                              className="inline-flex items-center gap-2 text-[11px] tracking-[0.14em] uppercase text-[#7fd3c9] hover:text-[#edeae5] transition-colors">
                              <Download className="w-3.5 h-3.5" /> Télécharger le dossier
                            </a>
                          )}
                        </>
                      )}
                      {user.est_compte_shadow ? (
                        <button onClick={() => handleUnlinkAccount(user)}
                          className="inline-flex items-center gap-2 text-[11px] tracking-[0.14em] uppercase text-[#8b9391] hover:text-[#edeae5] transition-colors">
                          <Unlink className="w-3.5 h-3.5" /> Délier du compte maître
                        </button>
                      ) : (
                        <button onClick={() => handleOpenLinkDialog(user)}
                          className="inline-flex items-center gap-2 text-[11px] tracking-[0.14em] uppercase text-[#8b9391] hover:text-[#edeae5] transition-colors">
                          <Link className="w-3.5 h-3.5" /> Lier à un compte maître
                        </button>
                      )}
                      {!isAdmin && user.role !== 'mandataire' && (
                        <>
                          <button onClick={() => handlePromoteToAdmin(user)}
                            className="inline-flex items-center gap-2 text-[11px] tracking-[0.14em] uppercase text-[#8b9391] hover:text-[#e0c9a0] transition-colors">
                            <Crown className="w-3.5 h-3.5" /> Promouvoir admin
                          </button>
                          <button onClick={() => handlePromoteToMandataire(user)}
                            className="inline-flex items-center gap-2 text-[11px] tracking-[0.14em] uppercase text-[#8b9391] hover:text-[#edeae5] transition-colors">
                            <Users className="w-3.5 h-3.5" /> Promouvoir mandataire
                          </button>
                        </>
                      )}
                      {isAdmin && (
                        <button onClick={() => handleDemoteFromAdmin(user)}
                          className="inline-flex items-center gap-2 text-[11px] tracking-[0.14em] uppercase text-[#e0c9a0] hover:text-[#edeae5] transition-colors">
                          <Crown className="w-3.5 h-3.5 fill-current" /> Rétrograder en utilisateur
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {filteredUsers.length === 0 && (
          <div className="border-t border-[#edeae5]/[0.35] pt-10 pb-16 text-center">
            <Users className="w-8 h-8 text-[#edeae5]/15 mx-auto mb-5" />
            <p className="text-[#8b9391] text-sm mb-0">
              {searchTerm || etapeFilter !== "all" ? "Aucun utilisateur ne correspond" : "Aucun utilisateur"}
            </p>
          </div>
        )}
      </div>
      </div>

      {/* Dialog de confirmation de suppression */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="bg-[#0a0c0c] border-[#282b2a]">
          <DialogHeader>
            <DialogTitle className="text-[#edeae5]">Confirmer la suppression</DialogTitle>
            <DialogDescription className="text-[#9aa19e]">
              Êtes-vous sûr de vouloir supprimer le compte de{" "}
              <strong className="text-[#edeae5]">{userToDelete?.full_name || userToDelete?.email}</strong> ?
              {userToDelete?.role === "admin" &&
              <span className="block mt-2 text-amber-600 font-semibold">
                  ⚠️ Attention : Cet utilisateur est administrateur
                </span>
              }
            </DialogDescription>
          </DialogHeader>
          <div className="bg-[#e0c9a0]/5 border border-[#e0c9a0]/20 rounded-md p-4 my-4">
            <p className="text-sm text-[#e0c9a0]/80">
              ⚠️ Cette action est irréversible. L'utilisateur devra recréer un compte pour accéder à l'application.
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
        <DialogContent className="bg-[#0a0c0c] border-[#282b2a] max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-[#edeae5]">
              Stratégie de {selectedUser?.full_name || selectedUser?.email}
            </DialogTitle>
            <DialogDescription className="text-[#9aa19e]">
              Définissez les critères de stratégie d'investissement pour ce client.
            </DialogDescription>
          </DialogHeader>

          {/* Champs obligatoires Budget et Apport */}
          <div className="grid grid-cols-2 gap-4 my-4 p-4 bg-[#edeae5]/[0.05] border border-[#2e3130] rounded-lg">
            <div>
              <Label className="text-[#8b9391] text-sm font-medium">Budget max (€)</Label>
              <Input
                type="number"
                placeholder="Ex: 500000"
                value={strategyBudgetMax}
                onChange={(e) => setStrategyBudgetMax(e.target.value)}
                className="bg-[#0a0c0c] border-[#303332] text-[#edeae5] mt-1" />

            </div>
            <div>
              <Label className="text-[#8b9391] text-sm font-medium">Apport (€)</Label>
              <Input
                type="number"
                placeholder="Ex: 100000"
                value={strategyApport}
                onChange={(e) => setStrategyApport(e.target.value)}
                className="bg-[#0a0c0c] border-[#303332] text-[#edeae5] mt-1" />

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
              'bg-[#edeae5]/[0.05] border border-[#2e3130]'}`
              }>

                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`font-medium text-sm ${field.is_nogo ? 'text-red-400' : 'text-[#edeae5]'}`}>
                      {field.label}
                    </span>
                    {field.is_nogo &&
                  <Badge className="bg-red-500/20 text-red-400 text-xs">No-go</Badge>
                  }
                  </div>
                  <p className="text-[#9aa19e] text-sm">{field.value}</p>
                </div>
                <Button
                variant="ghost"
                size="icon"
                onClick={() => handleRemoveField(index)}
                className="text-[#9aa19e] hover:text-red-400">

                  <X className="w-4 h-4" />
                </Button>
              </div>
            )}
          </div>

          {/* Ajouter un nouveau champ */}
          <div className="border border-[#303332] rounded-lg p-4 space-y-4">
            <h4 className="text-[#edeae5] font-medium text-sm">Ajouter un critère</h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-[#9aa19e] text-xs">Intitulé</Label>
                <Input
                  placeholder="Ex: Budget max"
                  value={newFieldLabel}
                  onChange={(e) => setNewFieldLabel(e.target.value)}
                  className="bg-[#0a0c0c] border-[#303332] text-[#edeae5] mt-1" />

              </div>
              <div className="flex items-end gap-4">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={newFieldIsNogo}
                    onCheckedChange={setNewFieldIsNogo}
                    className="data-[state=checked]:bg-red-500" />

                  <Label className="text-[#9aa19e] text-xs">No-go</Label>
                </div>
              </div>
            </div>
            <div>
              <Label className="text-[#9aa19e] text-xs">Valeur / Description</Label>
              <Textarea
                placeholder="Ex: 500 000€"
                value={newFieldValue}
                onChange={(e) => setNewFieldValue(e.target.value)}
                className="bg-[#0a0c0c] border-[#303332] text-[#edeae5] mt-1"
                rows={2} />

            </div>
            <Button
              onClick={handleAddField}
              disabled={!newFieldLabel.trim() || !newFieldValue.trim()}
              className="w-full bg-[#edeae5] text-[#0c0e0d] hover:bg-[#d8d5d0] border-0">

              <Plus className="w-4 h-4 mr-2" />
              Ajouter ce critère
            </Button>
          </div>

          <DialogFooter className="mt-4">
            <Button
              variant="outline"
              onClick={() => setStrategyDialogOpen(false)}
              className="border-[#303332] text-[#9aa19e]">

              Annuler
            </Button>
            <Button
              onClick={handleSaveStrategy}
              className="bg-[#edeae5] text-[#0c0e0d] hover:bg-[#d8d5d0] border-0"
              disabled={createStrategyMutation.isPending || updateStrategyMutation.isPending}>

              {createStrategyMutation.isPending || updateStrategyMutation.isPending ? "Enregistrement..." : "Enregistrer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog liaison de comptes */}
      <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
        <DialogContent className="bg-[#0a0c0c] border-[#282b2a]">
          <DialogHeader>
            <DialogTitle className="text-[#edeae5] flex items-center gap-2">
              <Link className="w-5 h-5 text-blue-500" />
              Lier les comptes
            </DialogTitle>
            <DialogDescription className="text-[#9aa19e]">
              Définissez {selectedUserForLink?.full_name || selectedUserForLink?.email} comme compte esclave d'un compte maître.
              Le compte esclave verra tous les projets et données du compte maître.
            </DialogDescription>
          </DialogHeader>

          <div className="my-4 space-y-4">
            <div>
              <Label className="text-[#9aa19e] text-sm mb-2 block">Compte esclave</Label>
              <div className="p-3 bg-[#171918] rounded-lg border border-[#303332]">
                <p className="text-[#edeae5]">{selectedUserForLink?.full_name || "Sans nom"}</p>
                <p className="text-[#9aa19e] text-sm">{selectedUserForLink?.email}</p>
              </div>
            </div>

            <div>
              <Label className="text-[#9aa19e] text-sm mb-2 block">Compte maître (principal)</Label>
              <Select value={masterEmail} onValueChange={setMasterEmail}>
                <SelectTrigger className="bg-[#0a0c0c] border-[#303332] text-[#edeae5]">
                  <SelectValue placeholder="Sélectionner le compte maître" />
                </SelectTrigger>
                <SelectContent>
                  {users.
                  filter((u) => u.email !== selectedUserForLink?.email && !u.est_compte_shadow).
                  map((u) =>
                  <SelectItem key={u.id} value={u.email}>
                        {u.full_name || "Sans nom"} ({u.email}) {u.role === 'admin' ? '(Admin)' : ''}
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
              className="border-[#303332] text-[#9aa19e]">

              Annuler
            </Button>
            <Button
              onClick={handleLinkAccounts}
              className="bg-[#edeae5] text-[#0c0e0d] hover:bg-[#d8d5d0] border-0"
              disabled={!masterEmail}>

              Lier les comptes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog nom de la famille */}
      <Dialog open={familleNameDialogOpen} onOpenChange={setFamilleNameDialogOpen}>
        <DialogContent className="bg-[#0a0c0c] border-[#282b2a]">
          <DialogHeader>
            <DialogTitle className="text-[#edeae5]">Créer une famille</DialogTitle>
            <DialogDescription className="text-[#9aa19e]">
              Donnez un nom à ce groupe de {selectedUsersForCompare.length} investisseurs.
            </DialogDescription>
          </DialogHeader>
          <div className="my-4">
            <Input
              placeholder="Ex: Famille Dupont-Martin"
              value={newFamilleName}
              onChange={(e) => setNewFamilleName(e.target.value)}
              className="bg-[#0a0c0c] border-[#303332] text-[#edeae5]"
              onKeyPress={(e) => e.key === 'Enter' && handleCreateFamille()} />

          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setFamilleNameDialogOpen(false)}
              className="border-[#303332] text-[#9aa19e]">

              Annuler
            </Button>
            <Button
              onClick={handleCreateFamille}
              className="bg-[#edeae5] text-[#0c0e0d] hover:bg-[#d8d5d0] border-0"
              disabled={!newFamilleName.trim()}>

              Créer et comparer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog édition fiche client */}
      <Dialog open={editUserDialogOpen} onOpenChange={setEditUserDialogOpen}>
        <DialogContent className="bg-[#0a0c0c] border-[#282b2a] max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-[#edeae5] flex items-center gap-2">
              <Edit className="w-5 h-5 text-blue-500" />
              Fiche client : {editingUser?.full_name || editingUser?.email}
            </DialogTitle>
            <DialogDescription className="text-[#9aa19e]">
              Complétez les informations financières et les préférences du client
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 my-4">
            {/* Profil investisseur - en lecture seule mais visible */}
            {editingUser?.profil_investisseur &&
            <div className="p-3 bg-[#edeae5]/[0.05] border border-[#2e3130] rounded-lg">
                <Label className="text-[#8b9391] text-sm font-medium">Profil investisseur</Label>
                <p className="text-[#edeae5] mt-1">{profilLabels[editingUser.profil_investisseur] || editingUser.profil_investisseur}</p>
                <p className="text-xs text-[#9aa19e] mt-1">Ce champ se remplit automatiquement lors du changement de profil</p>
              </div>
            }

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-[#9aa19e] text-sm">Revenus annuels (€)</Label>
                <Input
                  type="number"
                  placeholder="Ex: 60000"
                  value={editForm.revenus_annuels}
                  onChange={(e) => setEditForm({ ...editForm, revenus_annuels: e.target.value })}
                  className="bg-[#0a0c0c] border-[#303332] text-[#edeae5] mt-1" />

              </div>

              <div>
                <Label className="text-[#9aa19e] text-sm">Épargne annuelle (€)</Label>
                <Input
                  type="number"
                  placeholder="Ex: 15000"
                  value={editForm.epargne_annuelle}
                  onChange={(e) => setEditForm({ ...editForm, epargne_annuelle: e.target.value })}
                  className="bg-[#0a0c0c] border-[#303332] text-[#edeae5] mt-1" />

              </div>

              <div>
                <Label className="text-[#9aa19e] text-sm">Durée d'emprunt (années)</Label>
                <Select
                  value={editForm.duree_emprunt}
                  onValueChange={(val) => setEditForm({ ...editForm, duree_emprunt: val })}>

                  <SelectTrigger className="bg-[#0a0c0c] border-[#303332] text-[#edeae5] mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0a0c0c] border-[#303332]">
                    {[15, 20, 25, 30].map((years) =>
                    <SelectItem key={years} value={String(years)} className="text-[#edeae5]">
                        {years} ans
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-[#9aa19e] text-sm">Apport disponible (€)</Label>
                <Input
                  type="number"
                  placeholder="Ex: 100000"
                  value={editForm.apport_disponible}
                  onChange={(e) => setEditForm({ ...editForm, apport_disponible: e.target.value })}
                  className="bg-[#0a0c0c] border-[#303332] text-[#edeae5] mt-1" />

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
              className="border-[#303332] text-[#9aa19e]">

              Annuler
            </Button>
            <Button
              onClick={handleSaveEditUser}
              className="bg-[#edeae5] text-[#0c0e0d] hover:bg-[#d8d5d0] border-0"
              disabled={updateUserMutation.isPending}>

              {updateUserMutation.isPending ? "Enregistrement..." : "Enregistrer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog sélection projet pour étape 4 */}
      <Dialog open={etapeDialogOpen} onOpenChange={setEtapeDialogOpen}>
        <DialogContent className="bg-[#0a0c0c] border-[#282b2a]">
          <DialogHeader>
            <DialogTitle className="text-[#edeae5] flex items-center gap-2">
              <Building2 className="w-5 h-5 text-[#8b9391]" />
              Sélectionner le projet à poursuivre
            </DialogTitle>
            <DialogDescription className="text-[#9aa19e]">
              Le client passera en étape {pendingEtapeChange?.etape}. À partir de l'étape 4, choisissez le projet qu'il va poursuivre (il ne verra que ce projet).
            </DialogDescription>
          </DialogHeader>

          <div className="my-4">
            <Label className="text-[#9aa19e] text-sm mb-2 block">Projet sélectionné</Label>
            <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
              <SelectTrigger className="bg-[#0a0c0c] border-[#303332] text-[#edeae5]">
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
              className="border-[#303332] text-[#9aa19e]">

              Annuler
            </Button>
            <Button
              onClick={handleConfirmEtapeChange}
              className="bg-[#edeae5] text-[#0c0e0d] hover:bg-[#d8d5d0] border-0"
              disabled={!selectedProjectId}>

              Confirmer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>);

}