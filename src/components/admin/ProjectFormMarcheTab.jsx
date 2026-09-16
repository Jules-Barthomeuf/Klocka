/* eslint-disable no-restricted-syntax -- palette de données.
   Les couleurs de ce fichier ne sont pas des choix de design : ce sont des
   échelles qui portent un sens (classes DPE, séries d'un graphique, teintes
   d'une carte). Elles ne suivent pas la marque et ne doivent pas la suivre. */
import React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Plus, X, MapPin, EyeOff } from "lucide-react";
import VerificationField from "./VerificationField";
import { FField, FInput, FTextarea } from "./FormField";
import MarcheCases from "./MarcheCases";

function SecteurCard({ secteur, index, onChange, onRemove }) {
  return (
    <div className="p-4 bg-fond rounded-md border border-trait space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MapPin className="w-4 h-4 text-ardoise" />
          <span className="text-encre text-sm font-medium">Secteur {index + 1}</span>
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
      <MarcheCases formData={formData} setFormData={setFormData} />


      {/* ── Visibilité des sections ── */}
      <div className="p-4 bg-menthe/5 rounded-md border border-menthe/20">
        <div className="flex items-center gap-2 mb-3">
          <EyeOff className="w-4 h-4 text-menthe" />
          <h3 className="text-sm text-menthe font-medium">Masquer des sections côté client</h3>
        </div>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-encre/60 text-sm">Secteurs & Localisation</Label>
            <Switch
              checked={formData.marche_masquer_secteurs || false}
              onCheckedChange={(v) => setFormData({ ...formData, marche_masquer_secteurs: v })}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-encre/60 text-sm">Marché immobilier résidentiel</Label>
            <Switch
              checked={formData.marche_masquer_residentiel || false}
              onCheckedChange={(v) => setFormData({ ...formData, marche_masquer_residentiel: v })}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-encre/60 text-sm">Marché immobilier commercial</Label>
            <Switch
              checked={formData.marche_masquer_commercial || false}
              onCheckedChange={(v) => setFormData({ ...formData, marche_masquer_commercial: v })}
            />
          </div>
        </div>
      </div>

      {/* ── Secteurs avec estimations ── */}
      <div className="p-6 bg-encre/[0.03] rounded-md border border-bord">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg text-encre font-medium flex items-center gap-2">
            <MapPin className="w-5 h-5 text-ardoise" />
            Secteurs & Estimations
          </h3>
          <Button
            type="button" variant="outline" size="sm"
            onClick={addSecteur}
            className="border-bord-doux text-encre hover:bg-encre/[0.06] hover:border-bord-vif"
          >
            <Plus className="w-4 h-4 mr-1" /> Ajouter un secteur
          </Button>
        </div>
        {secteurs.length === 0 ? (
          <div className="text-center py-8">
            <MapPin className="w-8 h-8 text-brume mx-auto mb-2" />
            <p className="text-ardoise text-sm">Aucun secteur ajouté</p>
            <p className="text-brume text-xs mt-1">Ajoutez des secteurs pour comparer les estimations basse et haute</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {secteurs.map((s, i) => (
              <SecteurCard key={i} secteur={s} index={i} onChange={(u) => updateSecteur(i, u)} onRemove={() => removeSecteur(i)} />
            ))}
          </div>
        )}
      </div>

      {/* ── Notes marché ── */}
      <div className="space-y-4 pt-6 border-t border-trait">
        <div className="flex items-center justify-between">
          <Label className="text-encre">Notes marché</Label>
          <Button
            type="button" variant="outline" size="sm"
            onClick={() => setFormData({
              ...formData, 
              notes_marche: [...(formData.notes_marche || []), { titre: "", contenu: "" }]
            })}
            className="border-trait text-encre/30 hover:text-encre hover:border-bord-vif"
          >
            <Plus className="w-4 h-4 mr-1" /> Ajouter une note
          </Button>
        </div>
        {(formData.notes_marche || []).map((note, idx) => (
          <div key={idx} className="p-4 bg-encre/[0.02] rounded-lg space-y-3">
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