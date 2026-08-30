import React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, X } from "lucide-react";
import VerificationField from "./VerificationField";
import { FField, FInput, FTextarea } from "./FormField";

export default function ProjectFormCoproTab({ formData, setFormData }) {
  return (
    <div className="space-y-6 mt-6">
      <h3 className="text-lg mb-4 text-[#f2f3f5]">Copropriété</h3>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <VerificationField fieldKey="quote_part_lot" formData={formData} setFormData={setFormData}>
            <FField label="Quote-part du lot en %">
              <FInput type="number" step="0.01" value={formData.quote_part_lot} onChange={(e) => setFormData({...formData, quote_part_lot: e.target.value})} />
            </FField>
          </VerificationField>
          <VerificationField fieldKey="type_construction" formData={formData} setFormData={setFormData}>
            <FField label="Type de construction">
              <FInput value={formData.type_construction} onChange={(e) => setFormData({...formData, type_construction: e.target.value})} placeholder="ex: bâtiment ancien/neuf" />
            </FField>
          </VerificationField>
          <VerificationField fieldKey="provision_charges" formData={formData} setFormData={setFormData}>
            <FField label="Provision pour charges (€/an)">
              <FInput type="number" value={formData.provision_charges} onChange={(e) => setFormData({...formData, provision_charges: e.target.value})} />
            </FField>
          </VerificationField>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <VerificationField fieldKey="activites_autorisees" formData={formData} setFormData={setFormData}>
            <FField label="Activités autorisées" labelColor="#4ADE80">
              <FTextarea value={formData.activites_autorisees} onChange={(e) => setFormData({...formData, activites_autorisees: e.target.value})} placeholder="ex: Restauration, Commerce, Bureau..." rows={2} />
            </FField>
          </VerificationField>
          <VerificationField fieldKey="activites_interdites" formData={formData} setFormData={setFormData}>
            <FField label="Activités interdites" labelColor="#F87171">
              <FTextarea value={formData.activites_interdites || ""} onChange={(e) => setFormData({...formData, activites_interdites: e.target.value})} placeholder="ex: Nuisances sonores..." rows={2} />
            </FField>
          </VerificationField>
          <VerificationField fieldKey="resolutions_votees" formData={formData} setFormData={setFormData}>
            <FField label="Résolutions votées" labelColor="#4ADE80">
              <FTextarea value={formData.resolutions_votees || ""} onChange={(e) => setFormData({...formData, resolutions_votees: e.target.value})} placeholder="ex: Travaux de ravalement..." rows={3} />
            </FField>
          </VerificationField>
          <VerificationField fieldKey="resolutions_refusees" formData={formData} setFormData={setFormData}>
            <FField label="Résolutions non acceptées" labelColor="#F87171">
              <FTextarea value={formData.resolutions_refusees || ""} onChange={(e) => setFormData({...formData, resolutions_refusees: e.target.value})} placeholder="ex: Augmentation des charges..." rows={3} />
            </FField>
          </VerificationField>
        </div>

        {/* Assemblées Générales */}
        <div className="space-y-4 pt-4 border-t border-[#1f2228]">
          <div className="flex items-center justify-between">
            <Label className="text-[#f2f3f5]">Assemblées Générales</Label>
            <Button type="button" variant="outline" size="sm" onClick={() => setFormData({...formData, assemblees_generales: [...(formData.assemblees_generales || []), { annee: new Date().getFullYear(), synthese: "", resolutions_votees: "", resolutions_refusees: "" }]})} className="border-[#1f2228] text-[#f2f3f5]/30 hover:text-[#f2f3f5] hover:border-[#3a3f4a]">
              <Plus className="w-4 h-4 mr-1" /> Ajouter une AG
            </Button>
          </div>
          {(formData.assemblees_generales || []).map((ag, idx) => (
            <div key={idx} className="p-4 bg-[#f2f3f5]/[0.02] rounded-lg space-y-3 border border-[#1f2228]">
              <div className="flex items-center gap-3">
                <div className="space-y-1 w-32">
                  <Label className="text-[#9298a6] text-xs">Année</Label>
                  <Select value={String(ag.annee || new Date().getFullYear())} onValueChange={(value) => { const updated = [...formData.assemblees_generales]; updated[idx].annee = parseInt(value); setFormData({...formData, assemblees_generales: updated}); }}>
                    <SelectTrigger className="bg-[#0c0d10] text-[#f2f3f5] border-[#1f2228]"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-[#0c0d10] text-[#f2f3f5] border-[#1f2228] max-h-60">
                      {Array.from({ length: 20 }, (_, i) => new Date().getFullYear() - i).map((y) => (<SelectItem key={y} value={String(y)}>{y}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-1" />
                <Button variant="ghost" size="icon" onClick={() => setFormData({...formData, assemblees_generales: formData.assemblees_generales.filter((_, i) => i !== idx)})} className="text-red-500 hover:bg-red-500/10"><X className="w-4 h-4" /></Button>
              </div>
              <FField label="Synthèse">
                <FTextarea value={ag.synthese || ""} onChange={(e) => { const updated = [...formData.assemblees_generales]; updated[idx].synthese = e.target.value; setFormData({...formData, assemblees_generales: updated}); }} placeholder="Résumé des points abordés..." rows={3} />
              </FField>
              <FField label="Résolutions votées" labelColor="#4ADE80">
                <FTextarea value={ag.resolutions_votees || ""} onChange={(e) => { const updated = [...formData.assemblees_generales]; updated[idx].resolutions_votees = e.target.value; setFormData({...formData, assemblees_generales: updated}); }} placeholder="Résolutions acceptées..." rows={2} />
              </FField>
              <FField label="Résolutions non votées" labelColor="#F87171">
                <FTextarea value={ag.resolutions_refusees || ""} onChange={(e) => { const updated = [...formData.assemblees_generales]; updated[idx].resolutions_refusees = e.target.value; setFormData({...formData, assemblees_generales: updated}); }} placeholder="Résolutions refusées..." rows={2} />
              </FField>
            </div>
          ))}
          {(!formData.assemblees_generales || formData.assemblees_generales.length === 0) && <p className="text-[#9298a6] text-sm text-center py-2">Aucune AG.</p>}
        </div>

        {/* Notes libres */}
        <div className="space-y-4 pt-4 border-t border-[#1f2228]">
          <div className="flex items-center justify-between">
            <Label className="text-[#f2f3f5]">Notes libres</Label>
            <Button type="button" variant="outline" size="sm" onClick={() => setFormData({...formData, notes_libres: [...(formData.notes_libres || []), { titre: "", contenu: "" }]})} className="border-[#1f2228] text-[#f2f3f5]/30 hover:text-[#f2f3f5] hover:border-[#3a3f4a]">
              <Plus className="w-4 h-4 mr-1" /> Ajouter une note
            </Button>
          </div>
          {(formData.notes_libres || []).map((note, idx) => (
            <div key={idx} className="p-4 bg-[#f2f3f5]/[0.02] rounded-lg space-y-3">
              <div className="flex items-center gap-3">
                <FField className="flex-1"><FInput value={note.titre} onChange={(e) => { const updated = [...formData.notes_libres]; updated[idx].titre = e.target.value; setFormData({...formData, notes_libres: updated}); }} placeholder="Titre..." /></FField>
                <Button variant="ghost" size="icon" onClick={() => setFormData({...formData, notes_libres: formData.notes_libres.filter((_, i) => i !== idx)})} className="text-red-500 hover:bg-red-500/10"><X className="w-4 h-4" /></Button>
              </div>
              <FField><FTextarea value={note.contenu} onChange={(e) => { const updated = [...formData.notes_libres]; updated[idx].contenu = e.target.value; setFormData({...formData, notes_libres: updated}); }} placeholder="Contenu..." rows={3} /></FField>
            </div>
          ))}
          {(!formData.notes_libres || formData.notes_libres.length === 0) && <p className="text-[#9298a6] text-sm text-center py-2">Aucune note.</p>}
        </div>
      </div>
    </div>
  );
}