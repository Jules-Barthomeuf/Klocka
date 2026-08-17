import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Plus, X, Upload, FileText, Loader2, ExternalLink } from "lucide-react";
import VerificationField from "./VerificationField";
import { FField, FInput, FTextarea } from "./FormField";

export default function ProjectFormLocataireTab({ formData, setFormData }) {
  const [uploadingBilan, setUploadingBilan] = useState(false);

  // Initialiser les champs prédéfinis si vide
  useEffect(() => {
    if (!formData.bail_admin_fields || formData.bail_admin_fields.length === 0) {
      const defaultFields = [
        { label: "Loyer actuel", value: "" },
        { label: "Dépôt de garantie", value: "" },
        { label: "Charges et taxes refacturées", value: "" },
        { label: "Mode d'indexation", value: "" },
        { label: "Echéance du bail", value: "" },
        { label: "Type de bail", value: "" }
      ];
      setFormData({...formData, bail_admin_fields: defaultFields});
    }
  }, []);

  const handleBilanUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadingBilan(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    const newBilan = {
      nom: file.name,
      url: file_url,
      annee: new Date().getFullYear().toString()
    };
    setFormData({
      ...formData,
      bilans_locataire: [...(formData.bilans_locataire || []), newBilan]
    });
    setUploadingBilan(false);
    e.target.value = '';
  };

  return (
    <div className="space-y-6 mt-6">
      <h3 className="text-lg mb-4 text-white">Locataire</h3>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <VerificationField fieldKey="nom_locataire" formData={formData} setFormData={setFormData}>
            <FField label="Locataire">
              <FInput value={formData.nom_locataire} onChange={(e) => setFormData({...formData, nom_locataire: e.target.value})} placeholder="Nom du locataire" />
            </FField>
          </VerificationField>

          <VerificationField fieldKey="activite_locataire" formData={formData} setFormData={setFormData}>
            <FField label="Activité du locataire">
              <FInput value={formData.activite_locataire} onChange={(e) => setFormData({...formData, activite_locataire: e.target.value})} placeholder="Activité" />
            </FField>
          </VerificationField>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <VerificationField fieldKey="locataire_depuis" formData={formData} setFormData={setFormData}>
            <FField label="Locataire en place depuis...">
              <FInput type="date" value={formData.locataire_depuis} onChange={(e) => setFormData({...formData, locataire_depuis: e.target.value})} className="[color-scheme:dark]" />
            </FField>
          </VerificationField>

          <VerificationField fieldKey="echeance_bail" formData={formData} setFormData={setFormData}>
            <FField label="Échéance du bail">
              <FInput type="date" value={formData.echeance_bail} onChange={(e) => setFormData({...formData, echeance_bail: e.target.value})} className="[color-scheme:dark]" />
            </FField>
          </VerificationField>
        </div>

        <VerificationField fieldKey="statut_bail" formData={formData} setFormData={setFormData}>
          <FField label="Statut du bail">
            <Select
              value={formData.statut_bail || "en_cours"}
              onValueChange={(value) => setFormData({...formData, statut_bail: value})}
            >
              <SelectTrigger className="bg-transparent border-none text-[#EAECEF] p-0 h-auto">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en_cours">En cours</SelectItem>
                <SelectItem value="tacite_prolongation">En cours de tacite prolongation</SelectItem>
                <SelectItem value="en_cours_renouvellement">En cours de renouvellement</SelectItem>
              </SelectContent>
            </Select>
          </FField>
        </VerificationField>

        <div className="p-4 bg-white/[0.02] rounded-lg space-y-4">
          <div className="flex items-center gap-3">
            <Switch
              checked={formData.vente_fonds_commerce || false}
              onCheckedChange={(checked) => setFormData({...formData, vente_fonds_commerce: checked})}
            />
            <Label className="text-white">Vente récente de fonds de commerce</Label>
          </div>
          {formData.vente_fonds_commerce && (
            <div className="grid grid-cols-2 gap-4">
              <FField label="Montant de la vente (€)">
                <FInput type="number" value={formData.montant_vente_fonds_commerce || ''} onChange={(e) => setFormData({...formData, montant_vente_fonds_commerce: parseFloat(e.target.value) || 0})} />
              </FField>
              <FField label="Date de la vente">
                <FInput type="date" value={formData.date_vente_fonds_commerce || ''} onChange={(e) => setFormData({...formData, date_vente_fonds_commerce: e.target.value})} className="[color-scheme:dark]" />
              </FField>
            </div>
          )}
        </div>

        <VerificationField fieldKey="analyse_bail" formData={formData} setFormData={setFormData}>
          <FField label="Analyse du bail">
            <FTextarea value={formData.analyse_bail} onChange={(e) => setFormData({...formData, analyse_bail: e.target.value})} rows={4} placeholder="Analyse détaillée..." />
          </FField>
        </VerificationField>

        {/* Section Résumé */}
        <div className="space-y-4 pt-4 border-t border-[#16201f]">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-white text-lg">Champs personnalisés du résumé</Label>
              <p className="text-[#93aca7] text-sm mt-1">
                Ces champs seront affichés dans l'onglet "Résumé" de l'analyse du bail pour le client.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setFormData({
                ...formData, 
                bail_admin_fields: [...(formData.bail_admin_fields || []), { label: "", value: "" }]
              })}
              className="border-[#16201f] text-white/30 hover:text-white hover:border-[#33d6c0]/30"
            >
              <Plus className="w-4 h-4 mr-1" />
              Ajouter un champ
            </Button>
          </div>
          {(formData.bail_admin_fields || []).map((field, idx) => (
            <div key={idx} className="p-4 bg-white/[0.02] rounded-lg space-y-3">
              <div className="flex items-center gap-3">
                <FField className="flex-1">
                  <FInput value={field.label} onChange={(e) => { const updated = [...(formData.bail_admin_fields || [])]; updated[idx].label = e.target.value; setFormData({...formData, bail_admin_fields: updated}); }} placeholder="Nom du champ (ex: Type de bail, Durée, Date de signature...)" />
                </FField>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setFormData({
                    ...formData,
                    bail_admin_fields: (formData.bail_admin_fields || []).filter((_, i) => i !== idx)
                  })}
                  className="text-red-500 hover:bg-red-500/10"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
              <FField>
                <FTextarea value={field.value} onChange={(e) => { const updated = [...(formData.bail_admin_fields || [])]; updated[idx].value = e.target.value; setFormData({...formData, bail_admin_fields: updated}); }} placeholder="Valeur du champ..." rows={2} />
              </FField>
            </div>
          ))}
          {(!formData.bail_admin_fields || formData.bail_admin_fields.length === 0) && (
            <p className="text-[#7f9995] text-sm text-center py-2">Aucun champ personnalisé. Cliquez sur le bouton ci-dessus pour en ajouter.</p>
          )}
        </div>

        {/* Liens réseaux sociaux / avis */}
        <div className="space-y-4 pt-4 border-t border-[#16201f]">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-white text-lg">Réseaux sociaux & Avis</Label>
              <p className="text-[#93aca7] text-sm mt-1">Ajoutez les liens vers les réseaux sociaux et pages d'avis du locataire</p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setFormData({
                ...formData,
                liens_locataire: [...(formData.liens_locataire || []), { type: "instagram", url: "", label: "" }]
              })}
              className="border-[#16201f] text-white/30 hover:text-white hover:border-[#33d6c0]/30"
            >
              <Plus className="w-4 h-4 mr-1" />
              Ajouter un lien
            </Button>
          </div>
          {(formData.liens_locataire || []).map((lien, idx) => (
            <div key={idx} className="p-4 bg-white/[0.02] rounded-lg space-y-3">
              <div className="flex items-center gap-3">
                <Select
                  value={lien.type || "instagram"}
                  onValueChange={(value) => {
                    const updated = [...(formData.liens_locataire || [])];
                    updated[idx].type = value;
                    setFormData({...formData, liens_locataire: updated});
                  }}
                >
                  <SelectTrigger className="bg-[#171A21] border border-[#1c2725] rounded-[14px] text-[#EAECEF] w-40 h-[52px] px-[18px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="instagram">Instagram</SelectItem>
                    <SelectItem value="facebook">Facebook</SelectItem>
                    <SelectItem value="google_avis">Avis Google</SelectItem>
                    <SelectItem value="tripadvisor">TripAdvisor</SelectItem>
                    <SelectItem value="site_web">Site web</SelectItem>
                    <SelectItem value="linkedin">LinkedIn</SelectItem>
                    <SelectItem value="autre">Autre</SelectItem>
                  </SelectContent>
                </Select>
                <FField className="flex-1">
                  <FInput value={lien.url || ""} onChange={(e) => { const updated = [...(formData.liens_locataire || [])]; updated[idx].url = e.target.value; setFormData({...formData, liens_locataire: updated}); }} placeholder="https://www.instagram.com/..." />
                </FField>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setFormData({
                    ...formData,
                    liens_locataire: (formData.liens_locataire || []).filter((_, i) => i !== idx)
                  })}
                  className="text-red-500 hover:bg-red-500/10 flex-shrink-0"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
              <FField>
                <FInput value={lien.label || ""} onChange={(e) => { const updated = [...(formData.liens_locataire || [])]; updated[idx].label = e.target.value; setFormData({...formData, liens_locataire: updated}); }} placeholder="Libellé personnalisé (optionnel)" />
              </FField>
            </div>
          ))}
          {(!formData.liens_locataire || formData.liens_locataire.length === 0) && (
            <p className="text-[#7f9995] text-sm text-center py-2">Aucun lien ajouté.</p>
          )}
        </div>

        {/* Bilans du locataire */}
        <div className="space-y-4 pt-4 border-t border-[#16201f]">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-white text-lg">Bilans du locataire</Label>
              <p className="text-[#93aca7] text-sm mt-1">Importez les bilans financiers de l'entreprise (PDF, images...)</p>
            </div>
            <label className="cursor-pointer">
              <input type="file" className="hidden" onChange={handleBilanUpload} accept=".pdf,.png,.jpg,.jpeg,.xlsx,.xls" />
              <Button type="button" variant="outline" size="sm" className="border-[#16201f] text-white/30 hover:text-white hover:border-[#33d6c0]/30" asChild disabled={uploadingBilan}>
                <span>
                  {uploadingBilan ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Upload className="w-4 h-4 mr-1" />}
                  Importer un bilan
                </span>
              </Button>
            </label>
          </div>
          {(formData.bilans_locataire || []).map((bilan, idx) => (
            <div key={idx} className="flex items-center gap-3 p-3 bg-white/[0.02] rounded-lg border border-[#16201f]">
              <FileText className="w-5 h-5 text-[#33d6c0] flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm truncate">{bilan.nom}</p>
              </div>
              <FField className="w-24 !py-2">
                <FInput value={bilan.annee || ""} onChange={(e) => { const updated = [...(formData.bilans_locataire || [])]; updated[idx].annee = e.target.value; setFormData({...formData, bilans_locataire: updated}); }} placeholder="Année" className="text-center" />
              </FField>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setFormData({
                  ...formData,
                  bilans_locataire: (formData.bilans_locataire || []).filter((_, i) => i !== idx)
                })}
                className="text-red-500 hover:bg-red-500/10 flex-shrink-0"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          ))}
          {(!formData.bilans_locataire || formData.bilans_locataire.length === 0) && (
            <p className="text-[#7f9995] text-sm text-center py-2">Aucun bilan importé.</p>
          )}
        </div>

        {/* Notes locataire */}
        <div className="space-y-4 pt-4 border-t border-[#16201f]">
          <div className="flex items-center justify-between">
            <Label className="text-white">Notes locataire</Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setFormData({
                ...formData, 
                notes_locataire: [...(formData.notes_locataire || []), { titre: "", contenu: "" }]
              })}
              className="border-[#16201f] text-white/30 hover:text-white hover:border-[#33d6c0]/30"
            >
              <Plus className="w-4 h-4 mr-1" />
              Ajouter une note
            </Button>
          </div>
          {(formData.notes_locataire || []).map((note, idx) => (
            <div key={idx} className="p-4 bg-white/[0.02] rounded-lg space-y-3">
              <div className="flex items-center gap-3">
                <FField className="flex-1">
                  <FInput value={note.titre} onChange={(e) => { const updated = [...formData.notes_locataire]; updated[idx].titre = e.target.value; setFormData({...formData, notes_locataire: updated}); }} placeholder="Titre de la note..." />
                </FField>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setFormData({
                    ...formData,
                    notes_locataire: formData.notes_locataire.filter((_, i) => i !== idx)
                  })}
                  className="text-red-500 hover:bg-red-500/10"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
              <FField>
                <FTextarea value={note.contenu} onChange={(e) => { const updated = [...formData.notes_locataire]; updated[idx].contenu = e.target.value; setFormData({...formData, notes_locataire: updated}); }} placeholder="Contenu de la note..." rows={3} />
              </FField>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}