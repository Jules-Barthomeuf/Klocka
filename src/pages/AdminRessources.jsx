import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { BookOpen, Plus, Trash2, Video, FileText, File, Upload, X, ExternalLink, Link2, Loader2, FolderOpen, Pencil, ImagePlus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

const typeIcons = {
  video: Video,
  pdf: FileText,
  article: FileText,
  guide: BookOpen,
  webinar: Video
};

const typeLabels = {
  video: "Vidéo",
  pdf: "PDF",
  article: "Article",
  guide: "Guide",
  webinar: "Webinar"
};

const categorieLabels = {
  acculturation: "Acculturation",
  strategie: "Stratégie",
  analyse: "Analyse",
  financement: "Financement",
  juridique: "Juridique",
  fiscalite: "Fiscalité"
};

export default function AdminRessources() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingResource, setEditingResource] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [driveLink, setDriveLink] = useState("");
  const [driveName, setDriveeName] = useState("");
  const [driveType, setDriveType] = useState("video");
  const [driveCategorie, setDriveCategorie] = useState("acculturation");
  const [addingDrive, setAddingDrive] = useState(false);
  const [uploadingThumbnailId, setUploadingThumbnailId] = useState(null);
  const [formData, setFormData] = useState({
    titre: "",
    description: "",
    type: "video",
    categorie: "acculturation",
    url_fichier: "",
    duree_minutes: "",
    image_miniature: "",
    ordre: 0,
    visible: true
  });
  const queryClient = useQueryClient();

  const { data: resources = [], isLoading } = useQuery({
    queryKey: ['admin-resources'],
    queryFn: () => base44.entities.Resource.list("ordre"),
    initialData: []
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Resource.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-resources'] });
      handleCloseDialog();
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Resource.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-resources'] });
      handleCloseDialog();
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Resource.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-resources'] });
    }
  });

  const handleOpenDialog = (resource = null) => {
    if (resource) {
      setEditingResource(resource);
      setFormData({
        titre: resource.titre || "",
        description: resource.description || "",
        type: resource.type || "video",
        categorie: resource.categorie || "acculturation",
        url_fichier: resource.url_fichier || "",
        duree_minutes: resource.duree_minutes || "",
        image_miniature: resource.image_miniature || "",
        ordre: resource.ordre || 0,
        visible: resource.visible !== false
      });
    } else {
      setEditingResource(null);
      setFormData({
        titre: "",
        description: "",
        type: "video",
        categorie: "acculturation",
        url_fichier: "",
        duree_minutes: "",
        image_miniature: "",
        ordre: resources.length,
        visible: true
      });
    }
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingResource(null);
  };

  const handleFileUpload = async (e, field) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    setFormData({ ...formData, [field]: file_url });
    setUploading(false);
  };

  const handleSubmit = async () => {
    const dataToSave = {
      ...formData,
      duree_minutes: formData.duree_minutes ? parseInt(formData.duree_minutes) : null,
      ordre: parseInt(formData.ordre) || 0
    };

    if (editingResource) {
      await updateMutation.mutateAsync({ id: editingResource.id, data: dataToSave });
    } else {
      await createMutation.mutateAsync(dataToSave);
    }
  };

  const handleQuickThumbnailUpload = async (e, resourceId) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadingThumbnailId(resourceId);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    await base44.entities.Resource.update(resourceId, { image_miniature: file_url });
    queryClient.invalidateQueries({ queryKey: ['admin-resources'] });
    setUploadingThumbnailId(null);
    toast.success("Image miniature mise à jour !");
  };

  const handleAddDriveLink = async () => {
    if (!driveLink.trim() || !driveName.trim()) {
      toast.error("Remplissez le nom et le lien Google Drive");
      return;
    }
    setAddingDrive(true);
    await createMutation.mutateAsync({
      titre: driveName.trim(),
      type: driveType,
      categorie: driveCategorie,
      url_fichier: driveLink.trim(),
      ordre: resources.length,
      visible: true,
    });
    setDriveLink("");
    setDriveeName("");
    setDriveType("video");
    setDriveCategorie("acculturation");
    setAddingDrive(false);
    toast.success("Ressource Google Drive ajoutée !");
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#0a0c0c]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#35a79b]"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0c0c] p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8 flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <p className="text-[10px] tracking-[0.2em] uppercase text-[#7fd3c9] mb-2">
              Administration
            </p>
            <h1 className="text-[34px] max-md:text-[26px] font-light tracking-[-0.02em] leading-[1.05] text-[#edeae5]">Ressources</h1>
          </div>
          <Button
            onClick={() => handleOpenDialog()}
            className="bg-[#35a79b]/10 border border-[#35a79b]/30 hover:bg-[#35a79b]/20 text-[#edeae5] h-9 px-4 text-sm"
          >
            <Plus className="w-4 h-4 mr-2" />
            Ajouter
          </Button>
        </div>

        {/* Import Google Drive */}
        <div className="bg-[#0e100f] border border-[#edeae5]/[0.12] mb-6 p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-md bg-[#e0c9a0]/[0.07] flex items-center justify-center">
                <FolderOpen className="w-[18px] h-[18px] text-[#e0c9a0]" />
              </div>
              <div>
                <h2 className="text-[#edeae5] text-sm font-medium">Import rapide via Google Drive</h2>
                <p className="text-[#edeae5]/20 text-xs">Collez un lien Google Drive pour créer une ressource.</p>
              </div>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Input
                  value={driveName}
                  onChange={(e) => setDriveeName(e.target.value)}
                  className="bg-[#edeae5]/[0.03] border-[#242726] text-[#edeae5] h-9 text-sm"
                  placeholder="Nom de la ressource"
                />
                <Input
                  value={driveLink}
                  onChange={(e) => setDriveLink(e.target.value)}
                  className="bg-[#edeae5]/[0.03] border-[#242726] text-[#edeae5] h-9 text-sm"
                  placeholder="https://drive.google.com/..."
                />
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <Select value={driveType} onValueChange={setDriveType}>
                  <SelectTrigger className="bg-[#edeae5]/[0.03] border-[#242726] text-[#edeae5] h-9 w-[140px] text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="video">Vidéo</SelectItem>
                    <SelectItem value="pdf">PDF / Dossier</SelectItem>
                    <SelectItem value="guide">Guide</SelectItem>
                    <SelectItem value="webinar">Webinar</SelectItem>
                    <SelectItem value="article">Article</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={driveCategorie} onValueChange={setDriveCategorie}>
                  <SelectTrigger className="bg-[#edeae5]/[0.03] border-[#242726] text-[#edeae5] h-9 w-[160px] text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="acculturation">Acculturation</SelectItem>
                    <SelectItem value="strategie">Stratégie</SelectItem>
                    <SelectItem value="analyse">Analyse</SelectItem>
                    <SelectItem value="financement">Financement</SelectItem>
                    <SelectItem value="juridique">Juridique</SelectItem>
                    <SelectItem value="fiscalite">Fiscalité</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  onClick={handleAddDriveLink}
                  disabled={!driveLink.trim() || !driveName.trim() || addingDrive}
                  className="bg-[#e0c9a0]/[0.07] border border-[#e0c9a0]/20 hover:bg-[#e0c9a0]/15 text-[#edeae5] h-9 px-4 text-sm disabled:opacity-40"
                >
                  {addingDrive ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Link2 className="w-4 h-4 mr-2" />}
                  Ajouter
                </Button>
              </div>
            </div>
        </div>

        {resources.length === 0 ? (
          <div className="bg-[#0e100f] border border-[#edeae5]/[0.12] p-12 text-center">
              <div className="w-14 h-14 bg-[#35a79b]/[0.07] rounded-md flex items-center justify-center mx-auto mb-5">
                <BookOpen className="w-6 h-6 text-[#35a79b]" />
              </div>
              <h3 className="text-lg font-light text-[#edeae5] mb-2">Aucune ressource</h3>
              <p className="text-[#edeae5]/20 text-sm mb-6">Commencez par ajouter votre première ressource.</p>
              <Button
                onClick={() => handleOpenDialog()}
                className="bg-[#35a79b]/10 border border-[#35a79b]/30 hover:bg-[#35a79b]/20 text-[#edeae5] text-sm h-9 px-4"
              >
                <Plus className="w-4 h-4 mr-2" />
                Ajouter une ressource
              </Button>
          </div>
        ) : (
          <div className="grid gap-4">
            {resources.map((resource) => {
              const Icon = typeIcons[resource.type] || File;
              return (
                <div 
                  key={resource.id} 
                  className="bg-[#0e100f] border border-[#edeae5]/[0.12] hover:border-[#35a79b]/20 transition-all duration-300 cursor-pointer p-4"
                  onClick={() => handleOpenDialog(resource)}
                >
                    <div className="flex items-center gap-4">
                      {/* Thumbnail with upload overlay */}
                      <label
                        className="relative w-20 h-14 rounded-lg overflow-hidden flex-shrink-0 cursor-pointer group/thumb"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => handleQuickThumbnailUpload(e, resource.id)}
                        />
                        {resource.image_miniature ? (
                          <img
                            src={resource.image_miniature}
                            alt={resource.titre}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full bg-[#35a79b]/[0.07] flex items-center justify-center">
                            <Icon className="w-5 h-5 text-[#35a79b]" />
                          </div>
                        )}
                        {uploadingThumbnailId === resource.id ? (
                          <div className="absolute inset-0 bg-[#0a0c0c]/70 flex items-center justify-center">
                            <Loader2 className="w-5 h-5 text-[#edeae5] animate-spin" />
                          </div>
                        ) : (
                          <div className="absolute inset-0 bg-[#0a0c0c]/60 opacity-0 group-hover/thumb:opacity-100 transition-opacity flex items-center justify-center">
                            <ImagePlus className="w-5 h-5 text-[#edeae5]" />
                          </div>
                        )}
                      </label>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="text-[#edeae5] font-medium">{resource.titre}</h3>
                          <span className="text-[10px] text-[#edeae5]/30 bg-[#edeae5]/[0.04] px-2 py-0.5 rounded-full">
                            {typeLabels[resource.type]}
                          </span>
                          {resource.categorie && (
                            <span className="text-[10px] text-[#35a79b] bg-[#35a79b]/[0.07] px-2 py-0.5 rounded-full">
                              {categorieLabels[resource.categorie]}
                            </span>
                          )}
                          {!resource.visible && (
                            <span className="text-[10px] text-[#e0c9a0] bg-[#e0c9a0]/[0.07] px-2 py-0.5 rounded-full">
                              Masqué
                            </span>
                          )}
                        </div>
                        <p className="text-[#edeae5]/20 text-sm line-clamp-1">{resource.description}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {resource.url_fichier && (
                          <a 
                            href={resource.url_fichier} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="p-2 text-[#edeae5]/20 hover:text-[#edeae5] transition-colors"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenDialog(resource);
                          }}
                          className="text-[#edeae5]/20 hover:text-[#35a79b] hover:bg-[#edeae5]/[0.03] h-8 w-8"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm("Supprimer cette ressource ?")) deleteMutation.mutate(resource.id);
                          }}
                          className="text-[#edeae5]/20 hover:text-red-400 hover:bg-[#edeae5]/[0.03] h-8 w-8"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Dialog d'édition */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="bg-[#0a0a0a] border-[#242726] max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-[#edeae5] font-light text-lg">
                {editingResource ? "Modifier la ressource" : "Nouvelle ressource"}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 my-4">
              <div>
                <Label className="text-[#edeae5]/30 text-xs">Titre *</Label>
                <Input
                  value={formData.titre}
                  onChange={(e) => setFormData({ ...formData, titre: e.target.value })}
                  className="bg-[#edeae5]/[0.03] border-[#242726] text-[#edeae5] mt-1 h-9 text-sm"
                  placeholder="Titre de la ressource"
                />
              </div>

              <div>
                <Label className="text-[#edeae5]/30 text-xs">Description</Label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="bg-[#edeae5]/[0.03] border-[#242726] text-[#edeae5] mt-1 text-sm"
                  placeholder="Description de la ressource"
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-[#edeae5]/30 text-xs">Type *</Label>
                  <Select
                    value={formData.type}
                    onValueChange={(value) => setFormData({ ...formData, type: value })}
                  >
                    <SelectTrigger className="bg-[#edeae5]/[0.03] border-[#242726] text-[#edeae5] mt-1 h-9 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="video">Vidéo</SelectItem>
                      <SelectItem value="pdf">PDF</SelectItem>
                      <SelectItem value="article">Article</SelectItem>
                      <SelectItem value="guide">Guide</SelectItem>
                      <SelectItem value="webinar">Webinar</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-[#edeae5]/30 text-xs">Catégorie</Label>
                  <Select
                    value={formData.categorie}
                    onValueChange={(value) => setFormData({ ...formData, categorie: value })}
                  >
                    <SelectTrigger className="bg-[#edeae5]/[0.03] border-[#242726] text-[#edeae5] mt-1 h-9 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="acculturation">Acculturation</SelectItem>
                      <SelectItem value="strategie">Stratégie</SelectItem>
                      <SelectItem value="analyse">Analyse</SelectItem>
                      <SelectItem value="financement">Financement</SelectItem>
                      <SelectItem value="juridique">Juridique</SelectItem>
                      <SelectItem value="fiscalite">Fiscalité</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label className="text-[#edeae5]/30 text-xs">Fichier / Vidéo *</Label>
                <div className="flex gap-2 mt-1">
                  <Input
                    value={formData.url_fichier}
                    onChange={(e) => setFormData({ ...formData, url_fichier: e.target.value })}
                    className="bg-[#edeae5]/[0.03] border-[#242726] text-[#edeae5] flex-1 h-9 text-sm"
                    placeholder="URL ou importer un fichier"
                  />
                  <label className="cursor-pointer">
                    <input
                      type="file"
                      className="hidden"
                      onChange={(e) => handleFileUpload(e, 'url_fichier')}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      className="border-[#242726] text-[#edeae5]/30 hover:text-[#edeae5] hover:bg-[#edeae5]/[0.03] h-9"
                      disabled={uploading}
                    >
                      <Upload className="w-4 h-4" />
                    </Button>
                  </label>
                </div>
              </div>

              <div>
                <Label className="text-[#edeae5]/30 text-xs">Image miniature</Label>
                {formData.image_miniature ? (
                  <div className="mt-2 relative inline-block">
                    <img 
                      src={formData.image_miniature} 
                      alt="Aperçu" 
                      className="w-40 h-28 object-cover rounded-lg border border-[#242726]"
                    />
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, image_miniature: "" })}
                      className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center hover:bg-red-400 transition-colors"
                    >
                      <X className="w-3 h-3 text-[#edeae5]" />
                    </button>
                  </div>
                ) : (
                  <label className="mt-2 flex items-center justify-center w-40 h-28 rounded-lg border-2 border-dashed border-[#edeae5]/[0.1] hover:border-[#35a79b]/50 bg-[#edeae5]/[0.02] hover:bg-[#35a79b]/5 cursor-pointer transition-all">
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => handleFileUpload(e, 'image_miniature')}
                    />
                    {uploading ? (
                      <Loader2 className="w-6 h-6 text-[#35a79b] animate-spin" />
                    ) : (
                      <div className="flex flex-col items-center gap-1">
                        <ImagePlus className="w-6 h-6 text-[#8b9391]" />
                        <span className="text-[#8b9391] text-[10px]">Importer</span>
                      </div>
                    )}
                  </label>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-[#edeae5]/30 text-xs">Durée (minutes)</Label>
                  <Input
                    type="number"
                    value={formData.duree_minutes}
                    onChange={(e) => setFormData({ ...formData, duree_minutes: e.target.value })}
                    className="bg-[#edeae5]/[0.03] border-[#242726] text-[#edeae5] mt-1 h-9 text-sm"
                    placeholder="Ex: 15"
                  />
                </div>
                <div>
                  <Label className="text-[#edeae5]/30 text-xs">Ordre d'affichage</Label>
                  <Input
                    type="number"
                    value={formData.ordre}
                    onChange={(e) => setFormData({ ...formData, ordre: e.target.value })}
                    className="bg-[#edeae5]/[0.03] border-[#242726] text-[#edeae5] mt-1 h-9 text-sm"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between py-2 px-1">
                <Label className="text-[#edeae5]/30 text-xs">Visible par les clients</Label>
                <Switch
                  checked={formData.visible}
                  onCheckedChange={(checked) => setFormData({ ...formData, visible: checked })}
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={handleCloseDialog}
                className="border-[#242726] text-[#edeae5]/30 hover:text-[#edeae5] hover:bg-[#edeae5]/[0.03] h-9 text-sm"
              >
                Annuler
              </Button>
              <Button
                onClick={handleSubmit}
                className="bg-[#35a79b]/10 border border-[#35a79b]/30 hover:bg-[#35a79b]/20 text-[#edeae5] h-9 text-sm"
                disabled={!formData.titre || !formData.url_fichier || createMutation.isPending || updateMutation.isPending}
              >
                {(createMutation.isPending || updateMutation.isPending) ? "Enregistrement..." : "Enregistrer"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}