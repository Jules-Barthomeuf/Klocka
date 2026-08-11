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
  disponible: { label: "Disponible", color: "bg-green-100 text-green-800" },
  sous_offre: { label: "Sous offre", color: "bg-blue-100 text-blue-800" },
  vendu: { label: "Vendu", color: "bg-gray-100 text-gray-800" },
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
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#2A9D8F]"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8 flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(createPageUrl("CRM"))}
            className="text-gray-400 hover:text-white"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-4xl font-geist tracking-tighter text-white mb-2">
              Propriétés CRM
            </h1>
            <div className="h-0.5 w-32 bg-[#2A9D8F]"></div>
          </div>
          <Badge className="bg-[#2A9D8F] text-white text-lg px-4 py-2">
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
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <Input
              placeholder="Rechercher une propriété..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-12 bg-gray-900 border-gray-700 text-white"
            />
          </div>
          <Button
            onClick={() => setDialogOpen(true)}
            className="bg-[#2A9D8F] hover:bg-[#2A9D8F]/90"
          >
            <Plus className="w-4 h-4 mr-2" />
            Nouvelle propriété
          </Button>
        </div>

        {/* Grille des propriétés */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredProprietes.map((propriete) => (
            <div key={propriete.id} className="relative rounded-[1.25rem] border-[0.75px] border-gray-700 p-2">
              <GlowingEffect spread={40} glow={true} disabled={false} proximity={64} inactiveZone={0.01} borderWidth={3} />
              <Card className="relative bg-gradient-to-br from-gray-900/95 via-[#2A9D8F]/5 to-gray-900/95 border-none">
                <CardContent className="p-6">
                  <div className="mb-4">
                    <div className="flex items-start justify-between mb-3">
                      <h3 className="text-white font-semibold text-lg">{propriete.nom}</h3>
                      <Badge className={statutConfig[propriete.statut]?.color || "bg-gray-100 text-gray-800"}>
                        {statutConfig[propriete.statut]?.label}
                      </Badge>
                    </div>
                    <Badge variant="outline" className="text-gray-400 border-gray-600 mb-3">
                      {typeLabels[propriete.type]}
                    </Badge>
                  </div>

                  <div className="space-y-2 text-sm mb-4">
                    {propriete.ville && (
                      <div className="flex items-center gap-2 text-gray-400">
                        <MapPin className="w-4 h-4" />
                        <span>{propriete.ville}</span>
                      </div>
                    )}
                    {propriete.surface && (
                      <div className="text-gray-400">
                        Surface: {propriete.surface} m²
                      </div>
                    )}
                  </div>

                  <div className="pt-4 border-t border-gray-700 space-y-2">
                    {propriete.valeur_actuelle && (
                      <div className="flex items-center justify-between">
                        <span className="text-gray-400 text-xs">Valeur actuelle</span>
                        <span className="text-[#2A9D8F] font-semibold">
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
                        <span className="text-gray-400 text-xs">Loyer mensuel</span>
                        <span className="text-[#71CCBA] font-semibold">
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
            <Building2 className="w-16 h-16 mx-auto text-gray-600 mb-4" />
            <p className="text-gray-400 text-lg">Aucune propriété trouvée</p>
          </div>
        )}
      </div>

      {/* Dialog création */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-black border-gray-700 max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white">Nouvelle propriété</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label className="text-gray-400">Nom</Label>
              <Input
                value={formData.nom}
                onChange={(e) => setFormData({...formData, nom: e.target.value})}
                className="bg-gray-900 border-gray-700 text-white"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-gray-400">Type</Label>
                <Select value={formData.type} onValueChange={(val) => setFormData({...formData, type: val})}>
                  <SelectTrigger className="bg-gray-900 border-gray-700 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-900 border-gray-700">
                    {Object.entries(typeLabels).map(([key, label]) => (
                      <SelectItem key={key} value={key} className="text-white">{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-gray-400">Statut</Label>
                <Select value={formData.statut} onValueChange={(val) => setFormData({...formData, statut: val})}>
                  <SelectTrigger className="bg-gray-900 border-gray-700 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-900 border-gray-700">
                    {Object.entries(statutConfig).map(([key, { label }]) => (
                      <SelectItem key={key} value={key} className="text-white">{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label className="text-gray-400">Adresse</Label>
              <Input
                value={formData.adresse}
                onChange={(e) => setFormData({...formData, adresse: e.target.value})}
                className="bg-gray-900 border-gray-700 text-white"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-gray-400">Ville</Label>
                <Input
                  value={formData.ville}
                  onChange={(e) => setFormData({...formData, ville: e.target.value})}
                  className="bg-gray-900 border-gray-700 text-white"
                />
              </div>

              <div>
                <Label className="text-gray-400">Surface (m²)</Label>
                <Input
                  type="number"
                  value={formData.surface}
                  onChange={(e) => setFormData({...formData, surface: e.target.value})}
                  className="bg-gray-900 border-gray-700 text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-gray-400">Prix acquisition (€)</Label>
                <Input
                  type="number"
                  value={formData.prix_acquisition}
                  onChange={(e) => setFormData({...formData, prix_acquisition: e.target.value})}
                  className="bg-gray-900 border-gray-700 text-white"
                />
              </div>

              <div>
                <Label className="text-gray-400">Valeur actuelle (€)</Label>
                <Input
                  type="number"
                  value={formData.valeur_actuelle}
                  onChange={(e) => setFormData({...formData, valeur_actuelle: e.target.value})}
                  className="bg-gray-900 border-gray-700 text-white"
                />
              </div>
            </div>

            <div>
              <Label className="text-gray-400">Loyer mensuel (€)</Label>
              <Input
                type="number"
                value={formData.loyer_mensuel}
                onChange={(e) => setFormData({...formData, loyer_mensuel: e.target.value})}
                className="bg-gray-900 border-gray-700 text-white"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="border-gray-700">
              Annuler
            </Button>
            <Button onClick={handleSubmit} className="bg-[#2A9D8F] hover:bg-[#2A9D8F]/90">
              Créer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}