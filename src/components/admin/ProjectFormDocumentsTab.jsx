import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, X, Upload, FileText } from "lucide-react";

const DOC_CHECKLIST = [
  { key: "bail", label: "Bail" },
  { key: "pv_ag", label: "PV d'AG" },
  { key: "diagnostics", label: "Diagnostics" },
  { key: "quittances", label: "Quittances" },
  { key: "rcp", label: "RCP" },
];

export default function ProjectFormDocumentsTab({ formData, setFormData }) {
  const [newFileName, setNewFileName] = useState("");
  const [newFileUrl, setNewFileUrl] = useState("");

  const fichiers = formData.fichiers_projet || [];

  const addFileByUrl = () => {
    if (!newFileUrl.trim()) return;
    const nom = newFileName.trim() || `Fichier ${fichiers.length + 1}`;
    setFormData({
      ...formData,
      fichiers_projet: [...fichiers, { nom, url: newFileUrl.trim() }]
    });
    setNewFileName("");
    setNewFileUrl("");
  };

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    setFormData({
      ...formData,
      fichiers_projet: [...fichiers, { nom: file.name, url: file_url }]
    });
  };

  const removeFile = (idx) => {
    setFormData({
      ...formData,
      fichiers_projet: fichiers.filter((_, i) => i !== idx)
    });
  };

  return (
    <div className="space-y-6 mt-0">
      <h3 className="text-lg text-encre">Documents du projet</h3>
      <p className="text-sm text-ardoise">Ces fichiers seront téléchargeables par le client dans l'onglet "Documents" du projet.</p>

      {/* Checklist documents importés */}
      <div className="p-4 bg-surface border border-encre/[0.12]">
        <Label className="text-encre mb-3 block text-xs uppercase tracking-wider">Documents importés</Label>
        <div className="flex flex-wrap gap-4">
          {DOC_CHECKLIST.map(({ key, label }) => {
            const checklist = formData.docs_checklist || {};
            return (
              <label key={key} className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={!!checklist[key]}
                  onCheckedChange={(checked) => {
                    setFormData({
                      ...formData,
                      docs_checklist: { ...checklist, [key]: !!checked }
                    });
                  }}
                  className="border-encre/20 data-[state=checked]:bg-menthe data-[state=checked]:border-menthe rounded-full"
                />
                <span className="text-encre text-sm">{label}</span>
              </label>
            );
          })}
        </div>
      </div>

      {/* Upload direct */}
      <div className="p-4 bg-surface border border-encre/[0.12]">
        <Label className="text-encre mb-3 block">Upload depuis votre ordinateur</Label>
        <label className="cursor-pointer">
          <input type="file" className="hidden" onChange={handleUpload} />
          <Button type="button" className="w-full bg-encre/[0.06] border border-bord-doux hover:bg-encre/[0.1] text-encre" asChild>
            <span><Upload className="w-4 h-4 mr-2" />Choisir un fichier</span>
          </Button>
        </label>
      </div>

      {/* URL manuelle */}
      <div className="p-4 bg-surface border border-encre/[0.12]">
        <Label className="text-encre mb-3 block">Ajouter via URL</Label>
        <div className="space-y-2">
          <Input
            value={newFileName}
            onChange={(e) => setNewFileName(e.target.value)}
            placeholder="Nom du fichier (ex: Bail commercial)"
            className="bg-fond text-encre border-trait"
          />
          <div className="flex gap-2">
            <Input
              value={newFileUrl}
              onChange={(e) => setNewFileUrl(e.target.value)}
              placeholder="https://..."
              className="flex-1 bg-fond text-encre border-trait"
            />
            <Button onClick={addFileByUrl} className="bg-encre/[0.06] border border-bord-doux hover:bg-encre/[0.1]">
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Liste des fichiers */}
      {fichiers.length > 0 && (
        <div className="space-y-2">
          <Label className="text-encre">Fichiers ajoutés ({fichiers.length})</Label>
          {fichiers.map((f, idx) => (
            <div key={idx} className="flex items-center gap-3 p-3 bg-encre/[0.02] rounded-lg border border-trait">
              <FileText className="w-5 h-5 text-ardoise flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-encre text-sm truncate">{f.nom}</p>
                <p className="text-ardoise text-xs truncate">{f.url}</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => removeFile(idx)}
                className="text-red-500 hover:bg-red-500/10 flex-shrink-0"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {fichiers.length === 0 && (
        <p className="text-ardoise text-sm text-center py-4">Aucun document ajouté. Uploadez un fichier ou ajoutez une URL ci-dessus.</p>
      )}
    </div>
  );
}