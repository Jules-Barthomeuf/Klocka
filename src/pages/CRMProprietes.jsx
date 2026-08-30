import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Building2, Plus, ArrowLeft, Search, MapPin, User, DollarSign } from "lucide-react";
import { GlowingEffect } from "@/components/ui/glowing-effect";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

const typeLabels = {
  commerce: "Commerce",
  bureau: "Bureau",
  entrepot: "Entrepôt",
  mixte: "Mixte",
  autre: "Autre"
};

const statutConfig = {
  disponible: { label: "Disponible", color: "bg-[#8fa0f2]/15 text-[#7c8ee8]" },
  sous_offre: { label: "Sous offre", color: "bg-blue-100 text-blue-800" },
  vendu: { label: "Vendu", color: "bg-[#f2f3f5]/10 text-[#0f1114]" },
  loue: { label: "Loué", color: "bg-purple-100 text-purple-800" }
};

export default function CRMProprietes() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    nom: "",
    type: "commerce",
    adresse: "",
    ville: "",
    surface: "",
    prix_acquisition: "",
    valeur_actuelle: "",
    statut: "disponible",
    loyer_mensuel: ""
  });

  const { data: proprietes = [], isLoading } = useQuery({
    queryKey: ['crm-proprietes'],
    queryFn: () => base44.entities.Propriete.list("-created_date"),
    initialData: []
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Propriete.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm-proprietes'] });
      setDialogOpen(false);
      resetForm();
    }
  });

  const resetForm = () => {
    setFormData({
      nom: "",
      type: "commerce",
      adresse: "",
      ville: "",
      surface: "",
      prix_acquisition: "",
      valeur_actuelle: "",
      statut: "disponible",
      loyer_mensuel: ""
    });
  };

  const handleSubmit = () => {
    const data = { ...formData };
    if (data.surface) data.surface = parseFloat(data.surface);
    if (data.prix_acquisition) data.prix_acquisition = parseFloat(data.prix_acquisition);
    if (data.valeur_actuelle) data.valeur_actuelle = parseFloat(data.valeur_actuelle);
    if (data.loyer_mensuel) data.loyer_mensuel = parseFloat(data.loyer_mensuel);
    createMutation.mutate(data);
  };

  const filteredProprietes = proprietes.filter(p => {
    const searchLower = searchQuery.toLowerCase();
    return (
      p.nom?.toLowerCase().includes(searchLower) ||
      p.ville?.toLowerCase().includes(searchLower) ||
      p.adresse?.toLowerCase().includes(searchLower)
    );
  });

  const valeurTotale = filteredProprietes.reduce((sum, p) => sum + (p.valeur_actuelle || p.prix_acquisition || 0), 0);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#000000] text-[#f2f3f5] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#8fa0f2]"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#000000] text-[#f2f3f5] p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8 flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(createPageUrl("CRM"))}
            className="text-[#9298a6] hover:text-[#f2f3f5]"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-4xl font-geist tracking-tighter text-[#f2f3f5] mb-2">
              Propriétés CRM
            </h1>
            <div className="h-0.5 w-32 bg-[#8fa0f2]"></div>
          </div>
          <Badge className="bg-[#8fa0f2] text-[#f2f3f5] text-lg px-4 py-2">
            {new Intl.NumberFormat('fr-FR', { 
              style: 'currency', 
              currency: 'EUR',
              maximumFractionDigits: 0 
            }).format(valeurTotale)}
          </Badge>
        </div>

        {/* Actions */}
        <div className="mb-6 flex gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#9298a6]" />
            <Input
              placeholder="Rechercher une propriété..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-12 bg-[#000000] border-[#22262d] text-[#f2f3f5]"
            />
          </div>
          <Button
            onClick={() => setDialogOpen(true)}
            className="bg-[#8fa0f2] hover:bg-[#8fa0f2]/90"
          >
            <Plus className="w-4 h-4 mr-2" />
            Nouvelle propriété
          </Button>
        </div>

        {/* Grille des propriétés */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredProprietes.map((propriete) => (
            <div key={propriete.id} className="relative rounded-[1.25rem] border-[0.75px] border-[#22262d] p-2">
              <GlowingEffect spread={40} glow={true} disabled={false} proximity={64} inactiveZone={0.01} borderWidth={3} />
              <Card className="relative bg-gradient-to-br from-[#000000]/95 via-[#8fa0f2]/5 to-[#000000]/95 border-none">
                <CardContent className="p-6">
                  <div className="mb-4">
                    <div className="flex items-start justify-between mb-3">
                      <h3 className="text-[#f2f3f5] font-semibold text-lg">{propriete.nom}</h3>
                      <Badge className={statutConfig[propriete.statut]?.color || "bg-[#f2f3f5]/10 text-[#0f1114]"}>
                        {statutConfig[propriete.statut]?.label}
                      </Badge>
                    </div>
                    <Badge variant="outline" className="text-[#9298a6] border-[#22262d] mb-3">
                      {typeLabels[propriete.type]}
                    </Badge>
                  </div>

                  <div className="space-y-2 text-sm mb-4">
                    {propriete.ville && (
                      <div className="flex items-center gap-2 text-[#9298a6]">
                        <MapPin className="w-4 h-4" />
                        <span>{propriete.ville}</span>
                      </div>
                    )}
                    {propriete.surface && (
                      <div className="text-[#9298a6]">
                        Surface: {propriete.surface} m²
                      </div>
                    )}
                  </div>

                  <div className="pt-4 border-t border-[#22262d] space-y-2">
                    {propriete.valeur_actuelle && (
                      <div className="flex items-center justify-between">
                        <span className="text-[#9298a6] text-xs">Valeur actuelle</span>
                        <span className="text-[#8fa0f2] font-semibold">
                          {new Intl.NumberFormat('fr-FR', { 
                            style: 'currency', 
                            currency: 'EUR',
                            maximumFractionDigits: 0 
                          }).format(propriete.valeur_actuelle)}
                        </span>
                      </div>
                    )}
                    {propriete.loyer_mensuel && (
                      <div className="flex items-center justify-between">
                        <span className="text-[#9298a6] text-xs">Loyer mensuel</span>
                        <span className="text-[#aab6f5] font-semibold">
                          {new Intl.NumberFormat('fr-FR', { 
                            style: 'currency', 
                            currency: 'EUR',
                            maximumFractionDigits: 0 
                          }).format(propriete.loyer_mensuel)}
                        </span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          ))}
        </div>

        {filteredProprietes.length === 0 && (
          <div className="text-center py-16">
            <Building2 className="w-16 h-16 mx-auto text-[#6a7180] mb-4" />
            <p className="text-[#9298a6] text-lg">Aucune propriété trouvée</p>
          </div>
        )}
      </div>

      {/* Dialog création */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-[#000000] border-[#22262d] max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-[#f2f3f5]">Nouvelle propriété</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label className="text-[#9298a6]">Nom</Label>
              <Input
                value={formData.nom}
                onChange={(e) => setFormData({...formData, nom: e.target.value})}
                className="bg-[#000000] border-[#22262d] text-[#f2f3f5]"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-[#9298a6]">Type</Label>
                <Select value={formData.type} onValueChange={(val) => setFormData({...formData, type: val})}>
                  <SelectTrigger className="bg-[#000000] border-[#22262d] text-[#f2f3f5]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#000000] border-[#22262d]">
                    {Object.entries(typeLabels).map(([key, label]) => (
                      <SelectItem key={key} value={key} className="text-[#f2f3f5]">{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-[#9298a6]">Statut</Label>
                <Select value={formData.statut} onValueChange={(val) => setFormData({...formData, statut: val})}>
                  <SelectTrigger className="bg-[#000000] border-[#22262d] text-[#f2f3f5]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#000000] border-[#22262d]">
                    {Object.entries(statutConfig).map(([key, { label }]) => (
                      <SelectItem key={key} value={key} className="text-[#f2f3f5]">{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label className="text-[#9298a6]">Adresse</Label>
              <Input
                value={formData.adresse}
                onChange={(e) => setFormData({...formData, adresse: e.target.value})}
                className="bg-[#000000] border-[#22262d] text-[#f2f3f5]"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-[#9298a6]">Ville</Label>
                <Input
                  value={formData.ville}
                  onChange={(e) => setFormData({...formData, ville: e.target.value})}
                  className="bg-[#000000] border-[#22262d] text-[#f2f3f5]"
                />
              </div>

              <div>
                <Label className="text-[#9298a6]">Surface (m²)</Label>
                <Input
                  type="number"
                  value={formData.surface}
                  onChange={(e) => setFormData({...formData, surface: e.target.value})}
                  className="bg-[#000000] border-[#22262d] text-[#f2f3f5]"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-[#9298a6]">Prix acquisition (€)</Label>
                <Input
                  type="number"
                  value={formData.prix_acquisition}
                  onChange={(e) => setFormData({...formData, prix_acquisition: e.target.value})}
                  className="bg-[#000000] border-[#22262d] text-[#f2f3f5]"
                />
              </div>

              <div>
                <Label className="text-[#9298a6]">Valeur actuelle (€)</Label>
                <Input
                  type="number"
                  value={formData.valeur_actuelle}
                  onChange={(e) => setFormData({...formData, valeur_actuelle: e.target.value})}
                  className="bg-[#000000] border-[#22262d] text-[#f2f3f5]"
                />
              </div>
            </div>

            <div>
              <Label className="text-[#9298a6]">Loyer mensuel (€)</Label>
              <Input
                type="number"
                value={formData.loyer_mensuel}
                onChange={(e) => setFormData({...formData, loyer_mensuel: e.target.value})}
                className="bg-[#000000] border-[#22262d] text-[#f2f3f5]"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="border-[#22262d]">
              Annuler
            </Button>
            <Button onClick={handleSubmit} className="bg-[#8fa0f2] hover:bg-[#8fa0f2]/90">
              Créer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}