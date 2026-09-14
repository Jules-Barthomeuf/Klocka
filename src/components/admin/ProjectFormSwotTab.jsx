import React from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2 } from "lucide-react";
import VerificationField from "./VerificationField";
import { Button } from "@/components/ui/button";

export default function ProjectFormSwotTab({ formData, setFormData }) {
  const swot = formData.swot_data || {};

  const update = (field, value) => {
    setFormData({ ...formData, swot_data: { ...swot, [field]: value } });
  };

  const liens = formData.swot_liens || [];
  const updateLiens = (newLiens) => {
    setFormData({ ...formData, swot_liens: newLiens });
  };

  return (
    <div className="mt-6 space-y-6">
      {/* Texte libre principal */}
      <div className="p-5 bg-surface border border-encre/[0.12] space-y-3">
        <Label className="text-encre text-lg">Analyse SWOT — Texte libre</Label>
        <p className="text-ardoise text-sm">
          Saisissez toutes les informations SWOT. Le système les classera automatiquement en Forces, Faiblesses, Opportunités et Menaces pour le client.
        </p>
        <VerificationField fieldKey="swot_texte_general" formData={formData} setFormData={setFormData}>
          <Textarea
            value={swot.texte_general || ""}
            onChange={(e) => update("texte_general", e.target.value)}
            rows={12}
            placeholder="Saisissez ici toute l'analyse SWOT..."
            className="bg-fond text-encre border-trait"
          />
        </VerificationField>
      </div>

      {/* Indicateurs structurés */}
      <div className="p-5 bg-surface border border-encre/[0.12] space-y-5">
        <Label className="text-encre text-lg">Indicateurs clés</Label>
        <p className="text-ardoise text-sm">Ces données seront affichées dans des cards visuelles dans chaque onglet SWOT côté client.</p>

        <div className="grid md:grid-cols-2 gap-4">
          {/* Politique */}
          <div className="space-y-3 p-4 bg-surface border border-encre/[0.12]">
            <p className="text-ardoise text-xs font-semibold uppercase tracking-wider">Politique & Gouvernance</p>
            <VerificationField fieldKey="swot_maire" formData={formData} setFormData={setFormData}>
              <div>
                <Label className="text-ardoise text-xs">Maire</Label>
                <Input value={swot.maire || ""} onChange={(e) => update("maire", e.target.value)} placeholder="Ex: Martine Aubry" className="bg-fond text-encre border-trait mt-1" />
              </div>
            </VerificationField>
            <VerificationField fieldKey="swot_parti_politique" formData={formData} setFormData={setFormData}>
              <div>
                <Label className="text-ardoise text-xs">Parti politique</Label>
                <Input value={swot.parti_politique || ""} onChange={(e) => update("parti_politique", e.target.value)} placeholder="Ex: PS" className="bg-fond text-encre border-trait mt-1" />
              </div>
            </VerificationField>
            <VerificationField fieldKey="swot_politiques_cles" formData={formData} setFormData={setFormData}>
              <div>
                <Label className="text-ardoise text-xs">Politiques clés</Label>
                <Textarea value={swot.politiques_cles || ""} onChange={(e) => update("politiques_cles", e.target.value)} rows={2} placeholder="Ex: Redynamisation centre-ville, ZFE..." className="bg-fond text-encre border-trait mt-1" />
              </div>
            </VerificationField>
          </div>

          {/* Projets & Aménagement */}
          <div className="space-y-3 p-4 bg-surface border border-encre/[0.12]">
            <p className="text-blue-400 text-xs font-semibold uppercase tracking-wider">Projets & Aménagement</p>
            <VerificationField fieldKey="swot_projets_ville" formData={formData} setFormData={setFormData}>
              <div>
                <Label className="text-ardoise text-xs">Projets de la ville</Label>
                <Textarea value={swot.projets_ville || ""} onChange={(e) => update("projets_ville", e.target.value)} rows={3} placeholder="Ex: Nouveau tramway, rénovation quartier gare..." className="bg-fond text-encre border-trait mt-1" />
              </div>
            </VerificationField>
            <VerificationField fieldKey="swot_programmes_nationaux" formData={formData} setFormData={setFormData}>
              <div>
                <Label className="text-ardoise text-xs">Programmes nationaux</Label>
                <Textarea value={swot.programmes_nationaux || ""} onChange={(e) => update("programmes_nationaux", e.target.value)} rows={2} placeholder="Ex: Action Cœur de Ville, Petites Villes de Demain..." className="bg-fond text-encre border-trait mt-1" />
              </div>
            </VerificationField>
          </div>

          {/* Démographie */}
          <div className="space-y-3 p-4 bg-surface border border-encre/[0.12]">
            <p className="text-orange-400 text-xs font-semibold uppercase tracking-wider">Démographie & Risques</p>
            <VerificationField fieldKey="swot_taux_pauvrete" formData={formData} setFormData={setFormData}>
              <div>
                <Label className="text-ardoise text-xs">Taux de pauvreté (%)</Label>
                <Input type="number" value={swot.taux_pauvrete ?? ""} onChange={(e) => update("taux_pauvrete", e.target.value ? parseFloat(e.target.value) : null)} placeholder="Ex: 18.5" className="bg-fond text-encre border-trait mt-1" />
              </div>
            </VerificationField>
            <VerificationField fieldKey="swot_taux_etudiants" formData={formData} setFormData={setFormData}>
              <div>
                <Label className="text-ardoise text-xs">Taux d'étudiants (%)</Label>
                <Input type="number" value={swot.taux_etudiants ?? ""} onChange={(e) => update("taux_etudiants", e.target.value ? parseFloat(e.target.value) : null)} placeholder="Ex: 12.3" className="bg-fond text-encre border-trait mt-1" />
              </div>
            </VerificationField>
            <VerificationField fieldKey="swot_risques_environnement" formData={formData} setFormData={setFormData}>
              <div>
                <Label className="text-ardoise text-xs">Risques environnementaux</Label>
                <Textarea value={swot.risques_environnement || ""} onChange={(e) => update("risques_environnement", e.target.value)} rows={2} placeholder="Ex: Zone inondable, pollution sols..." className="bg-fond text-encre border-trait mt-1" />
              </div>
            </VerificationField>
          </div>

          {/* Score global */}
          <div className="space-y-3 p-4 bg-surface border border-encre/[0.12]">
            <p className="text-menthe-clair text-xs font-semibold uppercase tracking-wider">Score global</p>
            <VerificationField fieldKey="swot_score_global" formData={formData} setFormData={setFormData}>
              <div>
                <Label className="text-ardoise text-xs">Score global (/100)</Label>
                <Input type="number" value={swot.score_global ?? ""} onChange={(e) => update("score_global", e.target.value ? parseFloat(e.target.value) : null)} placeholder="Ex: 72" className="bg-fond text-encre border-trait mt-1" />
              </div>
            </VerificationField>
          </div>
        </div>
      </div>

      {/* Liens sources */}
      <div className="p-5 bg-surface border border-encre/[0.12] space-y-3">
        <Label className="text-encre text-lg">Liens sources</Label>
        {liens.map((l, i) => (
          <div key={i} className="flex gap-2">
            <Input value={l.label || ""} onChange={(e) => { const n = [...liens]; n[i] = { ...n[i], label: e.target.value }; updateLiens(n); }} placeholder="Label" className="bg-fond text-encre border-trait w-1/3" />
            <Input value={l.url || ""} onChange={(e) => { const n = [...liens]; n[i] = { ...n[i], url: e.target.value }; updateLiens(n); }} placeholder="URL" className="bg-fond text-encre border-trait flex-1" />
            <Button variant="ghost" size="icon" onClick={() => updateLiens(liens.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-300"><Trash2 className="w-4 h-4" /></Button>
          </div>
        ))}
        <Button variant="outline" size="sm" onClick={() => updateLiens([...liens, { label: "", url: "" }])} className="border-trait text-encre/30 hover:text-encre">
          <Plus className="w-4 h-4 mr-1" /> Ajouter un lien
        </Button>
      </div>
    </div>
  );
}