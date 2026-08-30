import React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, X } from "lucide-react";
import VerificationField from "./VerificationField";
import { FField, FInput, FTextarea, fieldWrap, fieldInput, fieldLabel } from "./FormField";

export default function ProjectFormDiagnosticsTab({ formData, setFormData }) {
  return (
    <div className="space-y-6 mt-6">
      <h3 className="text-xl text-[#f2f3f5] mb-6">Diagnostiques énergétiques</h3>
      
      {/* DPE */}
      <div className="p-6 bg-[#0f1114] border border-[#f2f3f5]/[0.12]">
        <h4 className="text-lg text-[#f2f3f5] mb-4">DPE - Diagnostic de Performance Énergétique</h4>
        <div className="grid grid-cols-2 gap-6">
          <VerificationField fieldKey="dpe_note" formData={formData} setFormData={setFormData}>
            <FField label="Note DPE">
              <Select value={formData.dpe_note || ""} onValueChange={(value) => setFormData({...formData, dpe_note: value})}>
                <SelectTrigger className="bg-transparent border-none text-[#f2f3f5] p-0 h-auto"><SelectValue placeholder="Sélectionner une note" /></SelectTrigger>
                <SelectContent>
                  {["A","B","C","D","E","F","G"].map(n => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                </SelectContent>
              </Select>
            </FField>
          </VerificationField>
          <VerificationField fieldKey="dpe_consommation" formData={formData} setFormData={setFormData}>
            <FField label="Consommation (kWh/m²/an)">
              <FInput type="number" value={formData.dpe_consommation || ''} onChange={(e) => setFormData({...formData, dpe_consommation: parseFloat(e.target.value) || 0})} placeholder="ex: 180" />
            </FField>
          </VerificationField>
        </div>
        {formData.dpe_note && (
          <div className="mt-6 space-y-1">
            {["A","B","C","D","E","F","G"].map((note, idx) => {
              const colors = ["#319834","#34CC0C","#C3D301","#FDEE03","#FDB814","#EF8023","#E5001E"];
              const widths = ["60%","70%","80%","90%","100%","90%","80%"];
              const isActive = formData.dpe_note === note;
              return (
                <div key={note} className={`flex items-center gap-2 transition-all ${isActive ? 'scale-105' : 'opacity-60'}`} style={{ width: widths[idx] }}>
                  <div className="flex-1 h-8 flex items-center justify-between px-3 rounded-r-lg text-[#f2f3f5] text-sm" style={{ backgroundColor: colors[idx] }}>
                    <span>{note}</span>
                    {isActive && formData.dpe_consommation > 0 && <span className="text-xs">{formData.dpe_consommation} kWh/m²/an</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* GES */}
      <div className="p-6 bg-[#0f1114] border border-[#f2f3f5]/[0.12]">
        <h4 className="text-lg text-[#f2f3f5] mb-4">GES - Émissions de gaz à effet de serre</h4>
        <div className="grid grid-cols-2 gap-6">
          <VerificationField fieldKey="ges_note" formData={formData} setFormData={setFormData}>
            <FField label="Note GES">
              <Select value={formData.ges_note || ""} onValueChange={(value) => setFormData({...formData, ges_note: value})}>
                <SelectTrigger className="bg-transparent border-none text-[#f2f3f5] p-0 h-auto"><SelectValue placeholder="Sélectionner une note" /></SelectTrigger>
                <SelectContent>
                  {["A","B","C","D","E","F","G"].map(n => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                </SelectContent>
              </Select>
            </FField>
          </VerificationField>
          <VerificationField fieldKey="ges_emission" formData={formData} setFormData={setFormData}>
            <FField label="Émissions (kg CO₂/m²/an)">
              <FInput type="number" value={formData.ges_emission || ''} onChange={(e) => setFormData({...formData, ges_emission: parseFloat(e.target.value) || 0})} placeholder="ex: 35" />
            </FField>
          </VerificationField>
        </div>
        {formData.ges_note && (
          <div className="mt-6 space-y-1">
            {["A","B","C","D","E","F","G"].map((note, idx) => {
              const colors = ["#F1EEF6","#E3D5EC","#C7AED7","#A777BE","#8B50A2","#6A3285","#4E1F67"];
              const widths = ["60%","70%","80%","90%","100%","90%","80%"];
              const isActive = formData.ges_note === note;
              return (
                <div key={note} className={`flex items-center gap-2 transition-all ${isActive ? 'scale-105' : 'opacity-60'}`} style={{ width: widths[idx] }}>
                  <div className="flex-1 h-8 flex items-center justify-between px-3 rounded-r-lg text-[#f2f3f5] text-sm" style={{ backgroundColor: colors[idx] }}>
                    <span>{note}</span>
                    {isActive && formData.ges_emission > 0 && <span className="text-xs">{formData.ges_emission} kg CO₂/m²/an</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Notes diagnostique */}
      <div className="space-y-4 pt-6 border-t border-[#1f2228]">
        <div className="flex items-center justify-between">
          <Label className="text-[#f2f3f5]">Notes diagnostique (autres informations)</Label>
          <Button type="button" variant="outline" size="sm" onClick={() => setFormData({...formData, notes_diagnostique: [...(formData.notes_diagnostique || []), { titre: "", contenu: "" }]})} className="border-[#1f2228] text-[#f2f3f5]/30 hover:text-[#f2f3f5] hover:border-[#3a3f4a]">
            <Plus className="w-4 h-4 mr-1" /> Ajouter une note
          </Button>
        </div>
        {(formData.notes_diagnostique || []).map((note, idx) => (
          <div key={idx} className="p-4 bg-[#f2f3f5]/[0.02] rounded-lg space-y-3">
            <div className="flex items-center gap-3">
              <FField className="flex-1"><FInput value={note.titre} onChange={(e) => { const updated = [...formData.notes_diagnostique]; updated[idx].titre = e.target.value; setFormData({...formData, notes_diagnostique: updated}); }} placeholder="Titre de la note..." /></FField>
              <Button variant="ghost" size="icon" onClick={() => setFormData({...formData, notes_diagnostique: formData.notes_diagnostique.filter((_, i) => i !== idx)})} className="text-red-500 hover:bg-red-500/10"><X className="w-4 h-4" /></Button>
            </div>
            <FField><FTextarea value={note.contenu} onChange={(e) => { const updated = [...formData.notes_diagnostique]; updated[idx].contenu = e.target.value; setFormData({...formData, notes_diagnostique: updated}); }} placeholder="Contenu de la note..." rows={3} /></FField>
          </div>
        ))}
        {(!formData.notes_diagnostique || formData.notes_diagnostique.length === 0) && (
          <p className="text-[#9298a6] text-sm text-center py-2">Aucune note. Cliquez sur le bouton ci-dessus pour en ajouter.</p>
        )}
      </div>
    </div>
  );
}