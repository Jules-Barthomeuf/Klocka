import React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Plus, X, MapPin, EyeOff } from "lucide-react";
import VerificationField from "./VerificationField";
import { FField, FInput, FTextarea } from "./FormField";

function SecteurCard({ secteur, index, onChange, onRemove }) {
  return (
    <div className="p-4 bg-[#0A0A0A] rounded-xl border border-white/[0.06] space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MapPin className="w-4 h-4 text-[#2A9D8F]" />
          <span className="text-white text-sm font-medium">Secteur {index + 1}</span>
        </div>
        <Button variant="ghost" size="icon" onClick={onRemove} className="text-red-500 hover:bg-red-500/10 h-7 w-7">
          <X className="w-3.5 h-3.5" />
        </Button>
      </div>
      <FField>
        <FInput value={secteur.nom || ''} onChange={(e) => onChange({ ...secteur, nom: e.target.value })} placeholder="Nom du secteur (ex: Centre-ville Massy)" />
      </FField>
      <div className="grid grid-cols-2 gap-3">
        <FField label="Estimation basse (€/m²)" labelColor="#4ADE80">
          <FInput type="number" value={secteur.estimation_basse || ''} onChange={(e) => onChange({ ...secteur, estimation_basse: parseFloat(e.target.value) || 0 })} placeholder="3500" className="text-center" />
        </FField>
        <FField label="Estimation haute (€/m²)" labelColor="#F87171">
          <FInput type="number" value={secteur.estimation_haute || ''} onChange={(e) => onChange({ ...secteur, estimation_haute: parseFloat(e.target.value) || 0 })} placeholder="5500" className="text-center" />
        </FField>
      </div>
    </div>
  );
}

function hasAnyValue(...values) {
  return values.some(v => v && v !== 0);
}

export default function ProjectFormMarcheTab({ formData, setFormData }) {
  const secteurs = formData.marche_secteurs || [];

  const addSecteur = () => {
    setFormData({
      ...formData,
      marche_secteurs: [...secteurs, { nom: "", estimation_basse: 0, estimation_haute: 0 }]
    });
  };

  const updateSecteur = (index, updated) => {
    const copy = [...secteurs];
    copy[index] = updated;
    setFormData({ ...formData, marche_secteurs: copy });
  };

  const removeSecteur = (index) => {
    setFormData({ ...formData, marche_secteurs: secteurs.filter((_, i) => i !== index) });
  };

  const hasPrixM2 = hasAnyValue(formData.marche_prix_m2_bas, formData.marche_prix_m2_median, formData.marche_prix_m2_haut);
  const hasEvolution = hasAnyValue(formData.marche_evolution_1an, formData.marche_evolution_5ans);
  const hasOffre = hasAnyValue(formData.marche_offre_bas, formData.marche_offre_moyenne, formData.marche_offre_haut);
  const hasBaux = hasAnyValue(formData.marche_baux_bas, formData.marche_baux_moyenne, formData.marche_baux_haut);
  const hasLoyerM2 = hasAnyValue(formData.loyer_m2_an);

  return (
    <div className="space-y-6 mt-6">

      {/* ── Visibilité des sections ── */}
      <div className="p-4 bg-yellow-500/5 rounded-xl border border-yellow-500/20">
        <div className="flex items-center gap-2 mb-3">
          <EyeOff className="w-4 h-4 text-yellow-500" />
          <h3 className="text-sm text-yellow-400 font-medium">Masquer des sections côté client</h3>
        </div>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-white/60 text-sm">Secteurs & Localisation</Label>
            <Switch
              checked={formData.marche_masquer_secteurs || false}
              onCheckedChange={(v) => setFormData({ ...formData, marche_masquer_secteurs: v })}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-white/60 text-sm">Marché immobilier résidentiel</Label>
            <Switch
              checked={formData.marche_masquer_residentiel || false}
              onCheckedChange={(v) => setFormData({ ...formData, marche_masquer_residentiel: v })}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-white/60 text-sm">Marché immobilier commercial</Label>
            <Switch
              checked={formData.marche_masquer_commercial || false}
              onCheckedChange={(v) => setFormData({ ...formData, marche_masquer_commercial: v })}
            />
          </div>
        </div>
      </div>

      {/* ── Secteurs avec estimations ── */}
      <div className="p-6 bg-[#2A9D8F]/5 rounded-xl border border-[#2A9D8F]/20">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg text-white font-medium flex items-center gap-2">
            <MapPin className="w-5 h-5 text-[#2A9D8F]" />
            Secteurs & Estimations
          </h3>
          <Button
            type="button" variant="outline" size="sm"
            onClick={addSecteur}
            className="border-[#2A9D8F]/30 text-[#2A9D8F] hover:bg-[#2A9D8F]/10 hover:border-[#2A9D8F]/50"
          >
            <Plus className="w-4 h-4 mr-1" /> Ajouter un secteur
          </Button>
        </div>
        {secteurs.length === 0 ? (
          <div className="text-center py-8">
            <MapPin className="w-8 h-8 text-gray-600 mx-auto mb-2" />
            <p className="text-gray-500 text-sm">Aucun secteur ajouté</p>
            <p className="text-gray-600 text-xs mt-1">Ajoutez des secteurs pour comparer les estimations basse et haute</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {secteurs.map((s, i) => (
              <SecteurCard key={i} secteur={s} index={i} onChange={(u) => updateSecteur(i, u)} onRemove={() => removeSecteur(i)} />
            ))}
          </div>
        )}
      </div>

      {/* ── Marché Immobilier (quartier + prix m2) ── */}
      <div className="p-6 bg-white/[0.015] rounded-xl border border-white/[0.05]">
        <h3 className="text-xl text-white mb-6">Marché Immobilier</h3>
        <div className="space-y-6">
          <VerificationField fieldKey="marche_quartier_nom" formData={formData} setFormData={setFormData}>
            <FField label="Nom du quartier / secteur">
              <FInput value={formData.marche_quartier_nom || ''} onChange={(e) => setFormData({...formData, marche_quartier_nom: e.target.value})} placeholder="ex: Centre Ville (Massy)" />
            </FField>
          </VerificationField>

          {/* Prix m2 — toujours visible pour pouvoir les remplir */}
          <div className="grid grid-cols-3 gap-4">
            {[
              { key: "marche_prix_m2_bas", label: "Prix bas", color: "green", placeholder: "3778" },
              { key: "marche_prix_m2_median", label: "Prix médian", color: "amber", placeholder: "4949" },
              { key: "marche_prix_m2_haut", label: "Prix haut", color: "red", placeholder: "5645" },
            ].map(({ key, label, color, placeholder }) => (
              <div key={key} className="p-4 bg-white/[0.02] rounded-xl border border-white/[0.06] text-center">
                <Label className="text-gray-400 text-sm">{label}</Label>
                <div className="mt-2">
                  <FField className="!py-2">
                    <FInput type="number" value={formData[key] || ''} onChange={(e) => setFormData({...formData, [key]: parseFloat(e.target.value) || 0})} placeholder={placeholder} className="text-center text-lg font-bold" />
                  </FField>
                  <p className="text-gray-500 text-xs mt-1">€/m²</p>
                </div>
              </div>
            ))}
          </div>

          {/* Evolution — toujours visible */}
          <div className="grid grid-cols-2 gap-4">
            <VerificationField fieldKey="marche_evolution_1an" formData={formData} setFormData={setFormData}>
              <FField label="Évolution sur 1 an (%)">
                <FInput type="number" step="0.1" value={formData.marche_evolution_1an || ''} onChange={(e) => setFormData({...formData, marche_evolution_1an: parseFloat(e.target.value) || 0})} placeholder="ex: 9" />
              </FField>
            </VerificationField>
            <VerificationField fieldKey="marche_evolution_5ans" formData={formData} setFormData={setFormData}>
              <FField label="Évolution sur 5 ans (%)">
                <FInput type="number" step="0.1" value={formData.marche_evolution_5ans || ''} onChange={(e) => setFormData({...formData, marche_evolution_5ans: parseFloat(e.target.value) || 0})} placeholder="ex: 16" />
              </FField>
            </VerificationField>
          </div>
        </div>
      </div>

      {/* ── Offre actuelle ── */}
      <div className="p-6 bg-white/[0.015] rounded-xl border border-white/[0.05]">
        <h3 className="text-xl text-white mb-6">Offre actuelle</h3>
        <div className="grid grid-cols-3 gap-4">
          {[
            { key: "marche_offre_bas", label: "Bas", placeholder: "150" },
            { key: "marche_offre_moyenne", label: "Moyenne", placeholder: "200" },
            { key: "marche_offre_haut", label: "Haut", placeholder: "280" },
          ].map(({ key, label, placeholder }) => (
            <div key={key} className="p-4 bg-white/[0.02] rounded-xl border border-white/[0.06] text-center">
              <Label className="text-gray-400 text-sm">{label}</Label>
              <div className="mt-2">
                <FField className="!py-2">
                  <FInput type="number" value={formData[key] || ''} onChange={(e) => setFormData({...formData, [key]: parseFloat(e.target.value) || 0})} placeholder={placeholder} className="text-center text-lg font-bold" />
                </FField>
                <p className="text-gray-500 text-xs mt-1">€/m²/an</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Baux existants ── */}
      <div className="p-6 bg-white/[0.015] rounded-xl border border-white/[0.05]">
        <h3 className="text-xl text-white mb-6">Baux existants</h3>
        <div className="grid grid-cols-3 gap-4">
          {[
            { key: "marche_baux_bas", label: "Bas", placeholder: "120" },
            { key: "marche_baux_moyenne", label: "Moyenne", placeholder: "180" },
            { key: "marche_baux_haut", label: "Haut", placeholder: "250" },
          ].map(({ key, label, placeholder }) => (
            <div key={key} className="p-4 bg-white/[0.02] rounded-xl border border-white/[0.06] text-center">
              <Label className="text-gray-400 text-sm">{label}</Label>
              <div className="mt-2">
                <FField className="!py-2">
                  <FInput type="number" value={formData[key] || ''} onChange={(e) => setFormData({...formData, [key]: parseFloat(e.target.value) || 0})} placeholder={placeholder} className="text-center text-lg font-bold" />
                </FField>
                <p className="text-gray-500 text-xs mt-1">€/m²/an</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Loyer par m² ── */}
      <VerificationField fieldKey="loyer_m2_an" formData={formData} setFormData={setFormData}>
        <FField label="Loyer par m²/an">
          <FInput type="number" value={formData.loyer_m2_an || ''} onChange={(e) => setFormData({...formData, loyer_m2_an: parseFloat(e.target.value) || 0})} placeholder="ex: 180" />
        </FField>
      </VerificationField>

      {/* ── Notes marché ── */}
      <div className="space-y-4 pt-6 border-t border-white/[0.06]">
        <div className="flex items-center justify-between">
          <Label className="text-white">Notes marché</Label>
          <Button
            type="button" variant="outline" size="sm"
            onClick={() => setFormData({
              ...formData, 
              notes_marche: [...(formData.notes_marche || []), { titre: "", contenu: "" }]
            })}
            className="border-white/[0.06] text-white/30 hover:text-white hover:border-[#2A9D8F]/30"
          >
            <Plus className="w-4 h-4 mr-1" /> Ajouter une note
          </Button>
        </div>
        {(formData.notes_marche || []).map((note, idx) => (
          <div key={idx} className="p-4 bg-white/[0.02] rounded-lg space-y-3">
            <div className="flex items-center gap-3">
              <FField className="flex-1">
                <FInput value={note.titre} onChange={(e) => { const updated = [...formData.notes_marche]; updated[idx].titre = e.target.value; setFormData({...formData, notes_marche: updated}); }} placeholder="Titre de la note..." />
              </FField>
              <Button variant="ghost" size="icon" onClick={() => setFormData({ ...formData, notes_marche: formData.notes_marche.filter((_, i) => i !== idx) })} className="text-red-500 hover:bg-red-500/10">
                <X className="w-4 h-4" />
              </Button>
            </div>
            <FField>
              <FTextarea value={note.contenu} onChange={(e) => { const updated = [...formData.notes_marche]; updated[idx].contenu = e.target.value; setFormData({...formData, notes_marche: updated}); }} placeholder="Contenu de la note..." rows={3} />
            </FField>
          </div>
        ))}
      </div>
    </div>
  );
}