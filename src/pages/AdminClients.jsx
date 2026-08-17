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
import { Users, Search, Trash2, Crown, FileText, Plus, X, Upload, Download, Building2, Link, Unlink, GitCompare, User, TrendingUp, Target, Sparkles, Edit, Loader2 } from "lucide-react";

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
        className="h-10 text-sm border-[#24312f] bg-transparent text-[#93aca7] hover:border-[#33d6c0] hover:text-white"
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
  visionnaire: "bg-green-100 text-green-800"
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
  (user.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
  user.email?.toLowerCase().includes(searchTerm.toLowerCase()))
  );

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
      <div className="min-h-screen bg-[#050807] flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-[#33d6c0] animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050807] text-white">
      <div className="max-w-4xl mx-auto px-4 md:px-8 py-8 md:py-12">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[#33d6c0] uppercase tracking-[0.3em] text-[10px] font-medium mb-3">Administration</p>
          <h1 className="text-3xl md:text-4xl font-light text-white tracking-tight">Utilisateurs</h1>
          <div className="h-px w-16 bg-[#33d6c0] mt-3" />
          <p className="text-white/30 text-sm mt-3">Gérez tous les utilisateurs de la plateforme</p>
        </div>
        <BoutonImportUtilisateurs />
      </div>

      <div className="bg-[#0a0f0e] border border-[#16201f] rounded-md p-4 md:p-5 mb-6">
            <div className="flex flex-col md:flex-row gap-3 md:gap-4 items-stretch md:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/30 w-4 h-4" />
                <Input
                  placeholder="Rechercher..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 h-10 text-sm bg-[#050807] border-[#1c2725] text-white placeholder:text-white/20" />

              </div>
              {selectedUsersForCompare.length >= 2 &&
              <Button
                onClick={handleCompareUsers}
                className="h-10 text-sm bg-[#33d6c0]/15 border border-[#33d6c0]/30 hover:bg-[#33d6c0]/25 text-white">
                  <GitCompare className="w-4 h-4 mr-2" />
                  Comparer ({selectedUsersForCompare.length})
                </Button>
              }
            </div>
            {selectedUsersForCompare.length > 0 &&
            <div className="mt-3 flex items-center gap-2 flex-wrap">
                <span className="text-white/30 text-xs">Sélectionnés :</span>
                {selectedUsersForCompare.map((userId) => {
                const u = users.find((user) => user.id === userId);
                return u ?
                <Badge
                  key={userId}
                  className="bg-[#33d6c0]/10 text-[#33d6c0] border border-[#33d6c0]/20 cursor-pointer hover:bg-[#33d6c0]/20 text-xs"
                  onClick={() => toggleUserSelection(userId)}>
                      {u.full_name || u.email.split('@')[0]} ✕
                    </Badge> :
                null;
              })}
                <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedUsersForCompare([])}
                className="text-white/30 hover:text-white text-xs">

                  Tout effacer
                </Button>
              </div>
            }
      </div>

      {/* Section En attente d'activation */}
      {pendingUsers.length > 0 && (
        <div className="mb-8">
          <button
            onClick={() => setPendingCollapsed(prev => !prev)}
            className="flex items-center gap-3 mb-4 w-full text-left group"
          >
            <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            <h2 className="text-sm font-medium text-amber-400 uppercase tracking-wider flex-1">En attente d'activation ({pendingUsers.length})</h2>
            <span className="text-amber-400/50 text-xs group-hover:text-amber-400 transition-colors">{pendingCollapsed ? '▶' : '▼'}</span>
          </button>
          {!pendingCollapsed && <div className="space-y-2">
            {pendingUsers.map((user) => (
              <div key={user.id} className="bg-amber-500/5 border border-amber-500/20 rounded-md p-4 flex items-center gap-4">
                <div className="w-9 h-9 rounded-full bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                  <span className="text-xs font-medium text-amber-400">
                    {user.full_name?.charAt(0)?.toUpperCase() || "?"}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-light truncate">{user.full_name || "Sans nom"}</p>
                  <p className="text-white/30 text-xs truncate">{user.email}</p>
                </div>
                <Button
                  size="sm"
                  onClick={() => updateUserMutation.mutate({ userId: user.id, data: { etape_actuelle: 1 } })}
                  disabled={updateUserMutation.isPending}
                  className="bg-[#33d6c0] hover:bg-[#33d6c0]/90 text-white text-xs px-4 flex-shrink-0"
                >
                  Activer
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleDeleteClick(user)}
                  className="h-8 w-8 text-white/20 hover:text-red-400 hover:bg-white/[0.04] flex-shrink-0"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>}
          <div className="w-full h-px bg-white/[0.06] mt-6" />
        </div>
      )}

      <div className="space-y-3">
        {filteredUsers.map((user) => {
            const isAdmin = user.role === "admin";

            return (
              <div key={user.id} className={`bg-[#0a0f0e] border rounded-md p-4 md:p-5 transition-all hover:border-[#24312f] ${
              isAdmin ? 'border-l-2 border-l-amber-500/60 border-t-white/[0.06] border-r-white/[0.06] border-b-white/[0.06]' : 'border-[#16201f]'} ${
              selectedUsersForCompare.includes(user.id) ? 'ring-1 ring-[#33d6c0]/50' : ''}`}>
                  {/* Ligne principale - mobile: colonne, desktop: ligne */}
                  <div className="flex flex-col md:flex-row items-start md:items-center gap-3">
                    {/* Ligne 1: Checkbox, Avatar, Nom/Email */}
                    <div className="flex items-center gap-3 w-full">
                      {/* Checkbox */}
                      <Checkbox
                        checked={selectedUsersForCompare.includes(user.id)}
                        onCheckedChange={() => toggleUserSelection(user.id)}
                        className="border-gray-600 data-[state=checked]:bg-purple-600 data-[state=checked]:border-purple-600 flex-shrink-0" />

                      
                      {/* Avatar */}
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
                      isAdmin ? 'bg-amber-500/20' : 'bg-[#33d6c0]/20'}`}>
                        <span className={`text-xs font-medium ${isAdmin ? 'text-amber-400' : 'text-[#33d6c0]'}`}>
                          {user.full_name?.charAt(0)?.toUpperCase() || "U"}
                        </span>
                      </div>

                      {/* Nom et Email */}
                      <div className="flex-1 min-w-0 md:w-48 md:flex-shrink-0">
                        <h3 className="text-white text-sm font-light truncate">
                          {user.full_name || "Sans nom"}
                        </h3>
                        <p className="text-white/20 text-xs truncate">{user.email}</p>
                      </div>

                      {/* Actions mobile */}
                      <div className="flex md:hidden items-center gap-1 flex-shrink-0">
                        <Button variant="ghost" size="icon" onClick={() => handleOpenStrategyDialog(user)} className="h-8 w-8 text-white/40 hover:text-[#33d6c0] hover:bg-white/[0.04]">
                          <FileText className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDeleteClick(user)} className="h-8 w-8 text-white/40 hover:text-red-400 hover:bg-white/[0.04]">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>

                    {/* Ligne 2: Badges */}
                    <div className="w-full md:w-56 md:flex-shrink-0 flex flex-wrap gap-1">
                      {isAdmin &&
                      <Badge className="bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[10px]">
                          <Crown className="w-2.5 h-2.5 mr-1" />
                          Admin
                        </Badge>
                      }
                      {user.profil_investisseur &&
                      <Badge className="bg-white/[0.04] text-white/60 border border-[#1c2725] text-[10px]">
                          {profilLabels[user.profil_investisseur]}
                        </Badge>
                      }
                      {user.est_compte_shadow && user.compte_maitre_email &&
                      <Badge className="bg-purple-500/10 text-purple-400 border border-purple-500/20 text-[10px]">
                          <Link className="w-2.5 h-2.5 mr-1" />
                          Lié
                        </Badge>
                      }
                      {user.comptes_lies && user.comptes_lies.length > 0 &&
                      <Badge className="bg-blue-500/10 text-blue-400 border border-blue-500/20 text-[10px]">
                          <Users className="w-2.5 h-2.5 mr-1" />
                          {user.comptes_lies.length}
                        </Badge>
                      }
                    </div>

                    {/* Ligne 3: Profil et Étape */}
                    <div className="w-full flex flex-col gap-3">
                      <div className="w-full">
                        <div className="text-[10px] text-white/20 uppercase tracking-wider mb-2">Profil investisseur</div>
                        <div className="flex flex-wrap gap-2">
                          {[
                          { value: "equilibriste", label: "L'équilibriste", icon: Target, color: "bg-blue-500" },
                          { value: "risk_taker", label: "Risk taker", icon: TrendingUp, color: "bg-red-500" },
                          { value: "collectionneur", label: "Le Collectionneur", icon: Sparkles, color: "bg-purple-500" },
                          { value: "visionnaire", label: "Le Visionnaire", icon: User, color: "bg-green-500" }].
                          map((profil) => {
                            const Icon = profil.icon;
                            const isSelected = user.profil_investisseur === profil.value;
                            return (
                              <button
                                key={profil.value}
                                onClick={() => handleChangeProfil(user.id, profil.value)}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                                isSelected ?
                                'bg-[#33d6c0]/15 text-[#33d6c0] border border-[#33d6c0]/30' :
                                'bg-white/[0.03] text-white/30 border border-[#16201f] hover:text-white/60 hover:border-[#24312f]'}`
                                }>

                                <Icon className="w-3 h-3" />
                                <span>{profil.label}</span>
                              </button>);

                          })}
                        </div>
                      </div>

                      {/* Étape Select */}
                      <div className="w-full md:w-48">
                        <AnimatedDropdown
                          value={user.etape_actuelle?.toString() ?? "0"}
                          onChange={(v) => handleChangeEtape(user.id, v)}
                          options={[0, 1, 2, 3, 4, 5].map((etape) => ({
                            value: etape.toString(),
                            label: `${etape}. ${etapeLabels[etape]}`,
                          }))}
                        />
                      </div>
                    </div>

                    {/* Ligne 4: Progression */}
                    <div className="w-full md:w-24 md:flex-shrink-0">
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-[#33d6c0] text-[10px] font-medium">
                          {Math.round((user.etape_actuelle ?? 0) / 5 * 100)}%
                        </span>
                      </div>
                      <div className="w-full bg-white/[0.06] rounded-full h-1">
                        <div
                          className="bg-[#33d6c0] h-1 rounded-full transition-all duration-500"
                          style={{ width: `${(user.etape_actuelle ?? 0) / 5 * 100}%` }} />

                      </div>
                    </div>

                    {/* Informations financières */}
                    {(user.revenus_annuels || user.epargne_annuelle || user.apport_disponible) &&
                    <div className="w-full md:w-auto flex-shrink-0 flex flex-wrap gap-3 text-xs text-white/40 bg-white/[0.02] border border-[#131c1b] p-2.5 rounded-md">
                       {user.revenus_annuels &&
                      <div className="flex items-center gap-1">
                           <span className="text-[#33d6c0]">Revenus:</span>
                           <span>{(user.revenus_annuels / 1000).toFixed(0)}K€/an</span>
                         </div>
                      }
                       {user.epargne_annuelle &&
                      <div className="flex items-center gap-1">
                           <span className="text-[#33d6c0]/70">Épargne:</span>
                           <span>{(user.epargne_annuelle / 1000).toFixed(0)}K€/an</span>
                         </div>
                      }
                       {user.apport_disponible &&
                      <div className="flex items-center gap-1">
                           <span className="text-[#33d6c0]">Apport:</span>
                           <span>{(user.apport_disponible / 1000).toFixed(0)}K€</span>
                         </div>
                      }
                       {user.duree_emprunt &&
                      <div className="flex items-center gap-1">
                           <span className="text-white/20">Durée:</span>
                           <span>{user.duree_emprunt} ans</span>
                         </div>
                      }
                     </div>
                    }

                    {/* Actions Desktop */}
                    <div className="hidden md:flex items-center gap-1 flex-shrink-0 ml-auto">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleOpenEditDialog(user)}
                        className="h-8 w-8 text-white/20 hover:text-white/60 hover:bg-white/[0.04]"
                        title="Modifier la fiche client">

                      <Edit className="w-4 h-4" />
                    </Button>

                    {/* Upload dossier bancaire */}
                      {(user.etape_actuelle ?? 0) >= 4 &&
                      <>
                          <label className="cursor-pointer">
                            <input
                            type="file"
                            className="hidden"
                            onChange={(e) => {
                              if (e.target.files[0]) {
                                handleUploadDossierBancaire(user.id, e.target.files[0]);
                              }
                            }} />
                            <Button
                            variant="ghost"
                            size="icon"
                            className={`h-8 w-8 ${user.dossier_bancaire_url ? 'text-green-400' : 'text-white/20'} hover:text-[#33d6c0] hover:bg-white/[0.04]`}
                            title={user.dossier_bancaire_url ? "Dossier bancaire uploadé" : "Uploader dossier bancaire"}
                            disabled={uploadingDossier === user.id}
                            asChild>

                              <span>
                                {uploadingDossier === user.id ?
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-[#33d6c0]" /> :

                              <Upload className="w-4 h-4" />
                              }
                              </span>
                            </Button>
                          </label>
                          {user.dossier_bancaire_url &&
                        <a href={user.dossier_bancaire_url} target="_blank" rel="noopener noreferrer">
                              <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-[#33d6c0] hover:bg-white/[0.04]"
                            title="Télécharger dossier">

                                <Download className="w-4 h-4" />
                              </Button>
                            </a>
                        }
                        </>
                      }

                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleOpenStrategyDialog(user)}
                        className="h-8 w-8 text-white/20 hover:text-[#33d6c0] hover:bg-white/[0.04]"
                        title="Définir la stratégie">

                        <FileText className="w-4 h-4" />
                      </Button>

                      {user.est_compte_shadow ?
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleUnlinkAccount(user)}
                        className="h-8 w-8 text-purple-400 hover:text-purple-300 hover:bg-white/[0.04]"
                        title="Délier ce compte">
                          <Unlink className="w-4 h-4" />
                        </Button> :
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleOpenLinkDialog(user)}
                        className="h-8 w-8 text-white/20 hover:text-white/60 hover:bg-white/[0.04]"
                        title="Lier à un compte maître">

                          <Link className="w-4 h-4" />
                        </Button>
                      }

                      {user.role === 'mandataire' ?
                      <Badge className="bg-blue-500/10 text-blue-400 border border-blue-500/20 text-xs px-2 py-1">
                          Mandataire
                        </Badge> :
                      !isAdmin ?
                      <>
                          <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handlePromoteToAdmin(user)}
                          className="h-8 w-8 text-white/20 hover:text-amber-400 hover:bg-white/[0.04]"
                          title="Promouvoir en admin">
                            <Crown className="w-4 h-4" />
                          </Button>
                          <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handlePromoteToMandataire(user)}
                          className="h-8 w-8 text-white/20 hover:text-blue-400 hover:bg-white/[0.04]"
                          title="Promouvoir en mandataire">

                            <Users className="w-4 h-4" />
                          </Button>
                        </> :

                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDemoteFromAdmin(user)}
                        className="h-8 w-8 text-amber-400 hover:text-white/60 hover:bg-white/[0.04]"
                        title="Rétrograder en utilisateur">

                          <Crown className="w-4 h-4 fill-current" />
                        </Button>
                      }

                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteClick(user)}
                        className="h-8 w-8 text-white/20 hover:text-red-400 hover:bg-white/[0.04]"
                        title="Supprimer l'utilisateur">

                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
              </div>);

          })}

        {filteredUsers.length === 0 &&
          <div className="text-center py-20">
            <div className="w-16 h-16 bg-white/[0.03] rounded-md flex items-center justify-center mx-auto mb-4">
              <Users className="w-8 h-8 text-white/10" />
            </div>
            <p className="text-white/20 text-sm">
              {searchTerm ? "Aucun résultat" : "Aucun utilisateur"}
            </p>
          </div>
          }
      </div>
      </div>

      {/* Dialog de confirmation de suppression */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="bg-[#050505] border-[#1c2725]">
          <DialogHeader>
            <DialogTitle className="text-white">Confirmer la suppression</DialogTitle>
            <DialogDescription className="text-gray-400">
              Êtes-vous sûr de vouloir supprimer le compte de{" "}
              <strong className="text-white">{userToDelete?.full_name || userToDelete?.email}</strong> ?
              {userToDelete?.role === "admin" &&
              <span className="block mt-2 text-amber-600 font-semibold">
                  ⚠️ Attention : Cet utilisateur est administrateur
                </span>
              }
            </DialogDescription>
          </DialogHeader>
          <div className="bg-amber-500/5 border border-amber-500/20 rounded-md p-4 my-4">
            <p className="text-sm text-amber-400/80">
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
        <DialogContent className="bg-[#050505] border-[#1c2725] max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white">
              Stratégie de {selectedUser?.full_name || selectedUser?.email}
            </DialogTitle>
            <DialogDescription className="text-gray-400">
              Définissez les critères de stratégie d'investissement pour ce client.
            </DialogDescription>
          </DialogHeader>

          {/* Champs obligatoires Budget et Apport */}
          <div className="grid grid-cols-2 gap-4 my-4 p-4 bg-[#33d6c0]/10 border border-[#33d6c0]/30 rounded-lg">
            <div>
              <Label className="text-[#33d6c0] text-sm font-medium">Budget max (€)</Label>
              <Input
                type="number"
                placeholder="Ex: 500000"
                value={strategyBudgetMax}
                onChange={(e) => setStrategyBudgetMax(e.target.value)}
                className="bg-gray-900 border-gray-700 text-white mt-1" />

            </div>
            <div>
              <Label className="text-[#33d6c0] text-sm font-medium">Apport (€)</Label>
              <Input
                type="number"
                placeholder="Ex: 100000"
                value={strategyApport}
                onChange={(e) => setStrategyApport(e.target.value)}
                className="bg-gray-900 border-gray-700 text-white mt-1" />

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
              'bg-[#33d6c0]/10 border border-[#33d6c0]/30'}`
              }>

                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`font-medium text-sm ${field.is_nogo ? 'text-red-400' : 'text-white'}`}>
                      {field.label}
                    </span>
                    {field.is_nogo &&
                  <Badge className="bg-red-500/20 text-red-400 text-xs">No-go</Badge>
                  }
                  </div>
                  <p className="text-gray-400 text-sm">{field.value}</p>
                </div>
                <Button
                variant="ghost"
                size="icon"
                onClick={() => handleRemoveField(index)}
                className="text-gray-400 hover:text-red-400">

                  <X className="w-4 h-4" />
                </Button>
              </div>
            )}
          </div>

          {/* Ajouter un nouveau champ */}
          <div className="border border-gray-700 rounded-lg p-4 space-y-4">
            <h4 className="text-white font-medium text-sm">Ajouter un critère</h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-gray-400 text-xs">Intitulé</Label>
                <Input
                  placeholder="Ex: Budget max"
                  value={newFieldLabel}
                  onChange={(e) => setNewFieldLabel(e.target.value)}
                  className="bg-gray-900 border-gray-700 text-white mt-1" />

              </div>
              <div className="flex items-end gap-4">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={newFieldIsNogo}
                    onCheckedChange={setNewFieldIsNogo}
                    className="data-[state=checked]:bg-red-500" />

                  <Label className="text-gray-400 text-xs">No-go</Label>
                </div>
              </div>
            </div>
            <div>
              <Label className="text-gray-400 text-xs">Valeur / Description</Label>
              <Textarea
                placeholder="Ex: 500 000€"
                value={newFieldValue}
                onChange={(e) => setNewFieldValue(e.target.value)}
                className="bg-gray-900 border-gray-700 text-white mt-1"
                rows={2} />

            </div>
            <Button
              onClick={handleAddField}
              disabled={!newFieldLabel.trim() || !newFieldValue.trim()}
              className="w-full bg-gradient-to-r from-[#33d6c0] to-[#f4be7e] hover:from-[#238276] hover:to-[#e5a968] text-white border-0">

              <Plus className="w-4 h-4 mr-2" />
              Ajouter ce critère
            </Button>
          </div>

          <DialogFooter className="mt-4">
            <Button
              variant="outline"
              onClick={() => setStrategyDialogOpen(false)}
              className="border-gray-700 text-gray-400">

              Annuler
            </Button>
            <Button
              onClick={handleSaveStrategy}
              className="bg-gradient-to-r from-[#33d6c0] to-[#f4be7e] hover:from-[#238276] hover:to-[#e5a968] text-white border-0"
              disabled={createStrategyMutation.isPending || updateStrategyMutation.isPending}>

              {createStrategyMutation.isPending || updateStrategyMutation.isPending ? "Enregistrement..." : "Enregistrer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog liaison de comptes */}
      <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
        <DialogContent className="bg-[#050505] border-[#1c2725]">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Link className="w-5 h-5 text-blue-500" />
              Lier les comptes
            </DialogTitle>
            <DialogDescription className="text-gray-400">
              Définissez {selectedUserForLink?.full_name || selectedUserForLink?.email} comme compte esclave d'un compte maître.
              Le compte esclave verra tous les projets et données du compte maître.
            </DialogDescription>
          </DialogHeader>

          <div className="my-4 space-y-4">
            <div>
              <Label className="text-gray-400 text-sm mb-2 block">Compte esclave</Label>
              <div className="p-3 bg-gray-800 rounded-lg border border-gray-700">
                <p className="text-white">{selectedUserForLink?.full_name || "Sans nom"}</p>
                <p className="text-gray-400 text-sm">{selectedUserForLink?.email}</p>
              </div>
            </div>

            <div>
              <Label className="text-gray-400 text-sm mb-2 block">Compte maître (principal)</Label>
              <Select value={masterEmail} onValueChange={setMasterEmail}>
                <SelectTrigger className="bg-gray-900 border-gray-700 text-white">
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
              className="border-gray-700 text-gray-400">

              Annuler
            </Button>
            <Button
              onClick={handleLinkAccounts}
              className="bg-gradient-to-r from-[#33d6c0] to-[#f4be7e] hover:from-[#238276] hover:to-[#e5a968] text-white border-0"
              disabled={!masterEmail}>

              Lier les comptes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog nom de la famille */}
      <Dialog open={familleNameDialogOpen} onOpenChange={setFamilleNameDialogOpen}>
        <DialogContent className="bg-[#050505] border-[#1c2725]">
          <DialogHeader>
            <DialogTitle className="text-white">Créer une famille</DialogTitle>
            <DialogDescription className="text-gray-400">
              Donnez un nom à ce groupe de {selectedUsersForCompare.length} investisseurs.
            </DialogDescription>
          </DialogHeader>
          <div className="my-4">
            <Input
              placeholder="Ex: Famille Dupont-Martin"
              value={newFamilleName}
              onChange={(e) => setNewFamilleName(e.target.value)}
              className="bg-gray-900 border-gray-700 text-white"
              onKeyPress={(e) => e.key === 'Enter' && handleCreateFamille()} />

          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setFamilleNameDialogOpen(false)}
              className="border-gray-700 text-gray-400">

              Annuler
            </Button>
            <Button
              onClick={handleCreateFamille}
              className="bg-gradient-to-r from-[#33d6c0] to-[#f4be7e] hover:from-[#238276] hover:to-[#e5a968] text-white border-0"
              disabled={!newFamilleName.trim()}>

              Créer et comparer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog édition fiche client */}
      <Dialog open={editUserDialogOpen} onOpenChange={setEditUserDialogOpen}>
        <DialogContent className="bg-[#050505] border-[#1c2725] max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Edit className="w-5 h-5 text-blue-500" />
              Fiche client : {editingUser?.full_name || editingUser?.email}
            </DialogTitle>
            <DialogDescription className="text-gray-400">
              Complétez les informations financières et les préférences du client
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 my-4">
            {/* Profil investisseur - en lecture seule mais visible */}
            {editingUser?.profil_investisseur &&
            <div className="p-3 bg-[#33d6c0]/10 border border-[#33d6c0]/30 rounded-lg">
                <Label className="text-[#33d6c0] text-sm font-medium">Profil investisseur</Label>
                <p className="text-white mt-1">{profilLabels[editingUser.profil_investisseur] || editingUser.profil_investisseur}</p>
                <p className="text-xs text-gray-400 mt-1">Ce champ se remplit automatiquement lors du changement de profil</p>
              </div>
            }

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-gray-400 text-sm">Revenus annuels (€)</Label>
                <Input
                  type="number"
                  placeholder="Ex: 60000"
                  value={editForm.revenus_annuels}
                  onChange={(e) => setEditForm({ ...editForm, revenus_annuels: e.target.value })}
                  className="bg-gray-900 border-gray-700 text-white mt-1" />

              </div>

              <div>
                <Label className="text-gray-400 text-sm">Épargne annuelle (€)</Label>
                <Input
                  type="number"
                  placeholder="Ex: 15000"
                  value={editForm.epargne_annuelle}
                  onChange={(e) => setEditForm({ ...editForm, epargne_annuelle: e.target.value })}
                  className="bg-gray-900 border-gray-700 text-white mt-1" />

              </div>

              <div>
                <Label className="text-gray-400 text-sm">Durée d'emprunt (années)</Label>
                <Select
                  value={editForm.duree_emprunt}
                  onValueChange={(val) => setEditForm({ ...editForm, duree_emprunt: val })}>

                  <SelectTrigger className="bg-gray-900 border-gray-700 text-white mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-900 border-gray-700">
                    {[15, 20, 25, 30].map((years) =>
                    <SelectItem key={years} value={String(years)} className="text-white">
                        {years} ans
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-gray-400 text-sm">Apport disponible (€)</Label>
                <Input
                  type="number"
                  placeholder="Ex: 100000"
                  value={editForm.apport_disponible}
                  onChange={(e) => setEditForm({ ...editForm, apport_disponible: e.target.value })}
                  className="bg-gray-900 border-gray-700 text-white mt-1" />

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
              className="border-gray-700 text-gray-400">

              Annuler
            </Button>
            <Button
              onClick={handleSaveEditUser}
              className="bg-gradient-to-r from-[#33d6c0] to-[#f4be7e] hover:from-[#238276] hover:to-[#e5a968] text-white border-0"
              disabled={updateUserMutation.isPending}>

              {updateUserMutation.isPending ? "Enregistrement..." : "Enregistrer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog sélection projet pour étape 4 */}
      <Dialog open={etapeDialogOpen} onOpenChange={setEtapeDialogOpen}>
        <DialogContent className="bg-[#050505] border-[#1c2725]">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Building2 className="w-5 h-5 text-[#33d6c0]" />
              Sélectionner le projet à poursuivre
            </DialogTitle>
            <DialogDescription className="text-gray-400">
              Le client passera en étape {pendingEtapeChange?.etape}. À partir de l'étape 4, choisissez le projet qu'il va poursuivre (il ne verra que ce projet).
            </DialogDescription>
          </DialogHeader>

          <div className="my-4">
            <Label className="text-gray-400 text-sm mb-2 block">Projet sélectionné</Label>
            <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
              <SelectTrigger className="bg-gray-900 border-gray-700 text-white">
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
              className="border-gray-700 text-gray-400">

              Annuler
            </Button>
            <Button
              onClick={handleConfirmEtapeChange}
              className="bg-gradient-to-r from-[#33d6c0] to-[#f4be7e] hover:from-[#238276] hover:to-[#e5a968] text-white border-0"
              disabled={!selectedProjectId}>

              Confirmer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>);

}