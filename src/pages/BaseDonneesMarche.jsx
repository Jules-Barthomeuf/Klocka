import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Database, Plus, Pencil, Trash2, Search, TrendingUp, MapPin } from "lucide-react";
import { GlowingEffect } from "@/components/ui/glowing-effect";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

export default function BaseDonneesMarche() {
  const [searchTerm, setSearchTerm] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [formData, setFormData] = useState({
    ville: "",
    secteur: "",
    code_postal: "",
    prix_m2_median: "",
    prix_m2_bas: "",
    prix_m2_haut: "",
    evolution_1an: "",
    evolution_5ans: "",
    offre_bas: "",
    offre_moyenne: "",
    offre_haut: "",
    baux_bas: "",
    baux_moyenne: "",
    baux_haut: "",
    description_marche: "",
    notes: "",
    source: "",
    date_maj: new Date().toISOString().split('T')[0]
  });

  const queryClient = useQueryClient();

  const { data: donneesMarche = [], isLoading } = useQuery({
    queryKey: ['donnees-marche'],
    queryFn: () => base44.entities.DonneeMarche.list('-updated_date'),
    initialData: []
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.DonneeMarche.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['donnees-marche'] });
      setDialogOpen(false);
      resetForm();
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.DonneeMarche.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['donnees-marche'] });
      setDialogOpen(false);
      resetForm();
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.DonneeMarche.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['donnees-marche'] });
    }
  });

  const resetForm = () => {
    setFormData({
      ville: "",
      secteur: "",
      code_postal: "",
      prix_m2_median: "",
      prix_m2_bas: "",
      prix_m2_haut: "",
      evolution_1an: "",
      evolution_5ans: "",
      offre_bas: "",
      offre_moyenne: "",
      offre_haut: "",
      baux_bas: "",
      baux_moyenne: "",
      baux_haut: "",
      description_marche: "",
      notes: "",
      source: "",
      date_maj: new Date().toISOString().split('T')[0]
    });
    setEditingItem(null);
  };

  const handleOpenDialog = (item = null) => {
    if (item) {
      setEditingItem(item);
      setFormData({
        ville: item.ville || "",
        secteur: item.secteur || "",
        code_postal: item.code_postal || "",
        prix_m2_median: item.prix_m2_median || "",
        prix_m2_bas: item.prix_m2_bas || "",
        prix_m2_haut: item.prix_m2_haut || "",
        evolution_1an: item.evolution_1an || "",
        evolution_5ans: item.evolution_5ans || "",
        offre_bas: item.offre_bas || "",
        offre_moyenne: item.offre_moyenne || "",
        offre_haut: item.offre_haut || "",
        baux_bas: item.baux_bas || "",
        baux_moyenne: item.baux_moyenne || "",
        baux_haut: item.baux_haut || "",
        description_marche: item.description_marche || "",
        notes: item.notes || "",
        source: item.source || "",
        date_maj: item.date_maj || new Date().toISOString().split('T')[0]
      });
    } else {
      resetForm();
    }
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    const dataToSubmit = {
      ...formData,
      prix_m2_median: formData.prix_m2_median ? Number(formData.prix_m2_median) : null,
      prix_m2_bas: formData.prix_m2_bas ? Number(formData.prix_m2_bas) : null,
      prix_m2_haut: formData.prix_m2_haut ? Number(formData.prix_m2_haut) : null,
      evolution_1an: formData.evolution_1an ? Number(formData.evolution_1an) : null,
      evolution_5ans: formData.evolution_5ans ? Number(formData.evolution_5ans) : null,
      offre_bas: formData.offre_bas ? Number(formData.offre_bas) : null,
      offre_moyenne: formData.offre_moyenne ? Number(formData.offre_moyenne) : null,
      offre_haut: formData.offre_haut ? Number(formData.offre_haut) : null,
      baux_bas: formData.baux_bas ? Number(formData.baux_bas) : null,
      baux_moyenne: formData.baux_moyenne ? Number(formData.baux_moyenne) : null,
      baux_haut: formData.baux_haut ? Number(formData.baux_haut) : null,
    };

    if (editingItem) {
      updateMutation.mutate({ id: editingItem.id, data: dataToSubmit });
    } else {
      createMutation.mutate(dataToSubmit);
    }
  };

  const filteredData = donneesMarche.filter(item =>
    item.ville?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.secteur?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.code_postal?.includes(searchTerm)
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#000000]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#96c0b8]"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#000000] p-3 md:p-10">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6 md:mb-8">
          <h1 className="text-2xl md:text-4xl font-montserrat text-[#f2f3f5] mb-2">
            Base de Données Marché
          </h1>
          <div className="h-0.5 w-24 md:w-32 bg-[#96c0b8] mb-2"></div>
          <p className="text-[#9298a6] text-sm md:text-lg">
            Gérez les données de marché pour l'auto-complétion des projets
          </p>
        </div>

        {/* Barre de recherche et bouton ajouter */}
        <div className="relative rounded-[1.25rem] border-[0.75px] border-[#22262d] p-2 md:rounded-[1.5rem] md:p-3 mb-4 md:mb-6">
          <GlowingEffect spread={40} glow={true} disabled={false} proximity={64} inactiveZone={0.01} borderWidth={3} />
          <Card className="relative bg-gradient-to-br from-[#22262d]/80 to-[#0f1114] border-none">
            <CardContent className="p-4 md:p-6">
              <div className="flex flex-col md:flex-row gap-3 md:gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-[#9298a6] w-4 h-4 md:w-5 md:h-5" />
                  <Input
                    placeholder="Rechercher par ville, secteur ou code postal..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 h-10 md:h-12 text-sm md:text-base bg-[#000000] text-[#f2f3f5] border-[#22262d]"
                  />
                </div>
                <Button
                  onClick={() => handleOpenDialog()}
                  className="bg-[#96c0b8] hover:bg-[#96c0b8]/90 text-[#f2f3f5] h-10 md:h-12"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Ajouter une donnée
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Liste des données */}
        <div className="grid gap-3 md:gap-4">
          {filteredData.map((item) => (
            <div key={item.id} className="relative rounded-[1.25rem] border-[0.75px] border-[#22262d] p-2 md:rounded-[1.5rem] md:p-3">
              <GlowingEffect spread={40} glow={true} disabled={false} proximity={64} inactiveZone={0.01} borderWidth={3} />
              <Card className="relative bg-gradient-to-br from-[#22262d]/80 to-[#0f1114] border-none">
                <CardContent className="p-4 md:p-6">
                  <div className="flex flex-col md:flex-row justify-between gap-4">
                    <div className="flex-1">
                      {/* En-tête */}
                      <div className="flex items-start gap-3 mb-4">
                        <div className="w-10 h-10 bg-[#96c0b8]/20 rounded-lg flex items-center justify-center flex-shrink-0">
                          <MapPin className="w-5 h-5 text-[#96c0b8]" />
                        </div>
                        <div>
                          <h3 className="text-[#f2f3f5] text-lg font-semibold">{item.ville}</h3>
                          {item.secteur && <p className="text-[#9298a6] text-sm">{item.secteur}</p>}
                          {item.code_postal && (
                            <Badge className="mt-1 bg-[#22262d] text-[#c9cdd6] text-xs">
                              {item.code_postal}
                            </Badge>
                          )}
                        </div>
                      </div>

                      {/* Données de marché */}
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
                        {item.prix_m2_median && (
                          <div className="bg-[#000000]/50 rounded-lg p-3">
                            <p className="text-[#9298a6] text-xs mb-1">Prix médian</p>
                            <p className="text-[#f2f3f5] font-semibold">{item.prix_m2_median} €/m²</p>
                          </div>
                        )}
                        {item.prix_m2_bas && (
                          <div className="bg-[#000000]/50 rounded-lg p-3">
                            <p className="text-[#9298a6] text-xs mb-1">Prix bas</p>
                            <p className="text-[#f2f3f5] font-semibold">{item.prix_m2_bas} €/m²</p>
                          </div>
                        )}
                        {item.prix_m2_haut && (
                          <div className="bg-[#000000]/50 rounded-lg p-3">
                            <p className="text-[#9298a6] text-xs mb-1">Prix haut</p>
                            <p className="text-[#f2f3f5] font-semibold">{item.prix_m2_haut} €/m²</p>
                          </div>
                        )}
                        {item.evolution_1an !== null && item.evolution_1an !== undefined && (
                          <div className="bg-[#000000]/50 rounded-lg p-3">
                            <p className="text-[#9298a6] text-xs mb-1">Évolution 1 an</p>
                            <p className={`font-semibold ${item.evolution_1an >= 0 ? 'text-[#96c0b8]' : 'text-red-500'}`}>
                              {item.evolution_1an > 0 ? '+' : ''}{item.evolution_1an}%
                            </p>
                          </div>
                        )}
                        {item.offre_moyenne && (
                          <div className="bg-[#000000]/50 rounded-lg p-3">
                            <p className="text-[#9298a6] text-xs mb-1">Loyer offre moy.</p>
                            <p className="text-[#f2f3f5] font-semibold">{item.offre_moyenne} €/m²/an</p>
                          </div>
                        )}
                        {item.baux_moyenne && (
                          <div className="bg-[#000000]/50 rounded-lg p-3">
                            <p className="text-[#9298a6] text-xs mb-1">Baux constatés moy.</p>
                            <p className="text-[#f2f3f5] font-semibold">{item.baux_moyenne} €/m²/an</p>
                          </div>
                        )}
                      </div>

                      {/* Description */}
                      {item.description_marche && (
                        <p className="text-[#c9cdd6] text-sm mb-2">{item.description_marche}</p>
                      )}

                      {/* Meta */}
                      <div className="flex flex-wrap gap-2 text-xs text-[#9298a6]">
                        {item.source && <span>Source: {item.source}</span>}
                        {item.date_maj && <span>• MAJ: {new Date(item.date_maj).toLocaleDateString('fr-FR')}</span>}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex md:flex-col gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleOpenDialog(item)}
                        className="text-[#96c0b8] hover:bg-[#96c0b8]/10 h-9 w-9"
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteMutation.mutate(item.id)}
                        className="text-red-500 hover:bg-red-500/10 h-9 w-9"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          ))}

          {filteredData.length === 0 && (
            <div className="text-center py-12 md:py-20">
              <Database className="w-16 h-16 md:w-20 md:h-20 text-[#6a7180] mx-auto mb-4 md:mb-6" />
              <h2 className="text-xl md:text-2xl text-[#f2f3f5] mb-2 md:mb-3">
                Aucune donnée de marché
              </h2>
              <p className="text-[#9298a6] max-w-md mx-auto text-sm md:text-base px-4 mb-6">
                {searchTerm ? "Aucun résultat pour cette recherche" : "Commencez par ajouter des données de marché"}
              </p>
              {!searchTerm && (
                <Button
                  onClick={() => handleOpenDialog()}
                  className="bg-[#96c0b8] hover:bg-[#96c0b8]/90 text-[#f2f3f5]"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Ajouter ma première donnée
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Dialog d'ajout/édition */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-[#000000] border-[#22262d] max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-[#f2f3f5] flex items-center gap-2">
              <Database className="w-5 h-5 text-[#96c0b8]" />
              {editingItem ? "Modifier la donnée de marché" : "Ajouter une donnée de marché"}
            </DialogTitle>
            <DialogDescription className="text-[#9298a6]">
              Ces données seront utilisées par l'IA pour remplir automatiquement les champs marché des projets.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* Localisation */}
            <div className="p-4 bg-[#96c0b8]/10 border border-[#96c0b8]/30 rounded-lg space-y-4">
              <h4 className="text-[#96c0b8] font-medium">Localisation</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label className="text-[#9298a6] text-sm">Ville *</Label>
                  <Input
                    value={formData.ville}
                    onChange={(e) => setFormData({...formData, ville: e.target.value})}
                    className="bg-[#000000] border-[#22262d] text-[#f2f3f5] mt-1"
                    placeholder="Ex: Paris"
                  />
                </div>
                <div>
                  <Label className="text-[#9298a6] text-sm">Secteur/Quartier</Label>
                  <Input
                    value={formData.secteur}
                    onChange={(e) => setFormData({...formData, secteur: e.target.value})}
                    className="bg-[#000000] border-[#22262d] text-[#f2f3f5] mt-1"
                    placeholder="Ex: Marais"
                  />
                </div>
                <div>
                  <Label className="text-[#9298a6] text-sm">Code postal</Label>
                  <Input
                    value={formData.code_postal}
                    onChange={(e) => setFormData({...formData, code_postal: e.target.value})}
                    className="bg-[#000000] border-[#22262d] text-[#f2f3f5] mt-1"
                    placeholder="Ex: 75004"
                  />
                </div>
              </div>
            </div>

            {/* Prix au m² */}
            <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg space-y-4">
              <h4 className="text-blue-400 font-medium">Prix de vente au m²</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label className="text-[#9298a6] text-sm">Prix médian (€/m²)</Label>
                  <Input
                    type="number"
                    value={formData.prix_m2_median}
                    onChange={(e) => setFormData({...formData, prix_m2_median: e.target.value})}
                    className="bg-[#000000] border-[#22262d] text-[#f2f3f5] mt-1"
                  />
                </div>
                <div>
                  <Label className="text-[#9298a6] text-sm">Prix bas (€/m²)</Label>
                  <Input
                    type="number"
                    value={formData.prix_m2_bas}
                    onChange={(e) => setFormData({...formData, prix_m2_bas: e.target.value})}
                    className="bg-[#000000] border-[#22262d] text-[#f2f3f5] mt-1"
                  />
                </div>
                <div>
                  <Label className="text-[#9298a6] text-sm">Prix haut (€/m²)</Label>
                  <Input
                    type="number"
                    value={formData.prix_m2_haut}
                    onChange={(e) => setFormData({...formData, prix_m2_haut: e.target.value})}
                    className="bg-[#000000] border-[#22262d] text-[#f2f3f5] mt-1"
                  />
                </div>
              </div>
            </div>

            {/* Évolution */}
            <div className="p-4 bg-[#96c0b8]/10 border border-[#96c0b8]/30 rounded-lg space-y-4">
              <h4 className="text-[#c3ddd6] font-medium">Évolution du marché</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label className="text-[#9298a6] text-sm">Évolution 1 an (%)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={formData.evolution_1an}
                    onChange={(e) => setFormData({...formData, evolution_1an: e.target.value})}
                    className="bg-[#000000] border-[#22262d] text-[#f2f3f5] mt-1"
                  />
                </div>
                <div>
                  <Label className="text-[#9298a6] text-sm">Évolution 5 ans (%)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={formData.evolution_5ans}
                    onChange={(e) => setFormData({...formData, evolution_5ans: e.target.value})}
                    className="bg-[#000000] border-[#22262d] text-[#f2f3f5] mt-1"
                  />
                </div>
              </div>
            </div>

            {/* Loyers à l'offre */}
            <div className="p-4 bg-purple-500/10 border border-purple-500/30 rounded-lg space-y-4">
              <h4 className="text-purple-400 font-medium">Loyers à l'offre (€/m²/an)</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label className="text-[#9298a6] text-sm">Bas</Label>
                  <Input
                    type="number"
                    value={formData.offre_bas}
                    onChange={(e) => setFormData({...formData, offre_bas: e.target.value})}
                    className="bg-[#000000] border-[#22262d] text-[#f2f3f5] mt-1"
                  />
                </div>
                <div>
                  <Label className="text-[#9298a6] text-sm">Moyen</Label>
                  <Input
                    type="number"
                    value={formData.offre_moyenne}
                    onChange={(e) => setFormData({...formData, offre_moyenne: e.target.value})}
                    className="bg-[#000000] border-[#22262d] text-[#f2f3f5] mt-1"
                  />
                </div>
                <div>
                  <Label className="text-[#9298a6] text-sm">Haut</Label>
                  <Input
                    type="number"
                    value={formData.offre_haut}
                    onChange={(e) => setFormData({...formData, offre_haut: e.target.value})}
                    className="bg-[#000000] border-[#22262d] text-[#f2f3f5] mt-1"
                  />
                </div>
              </div>
            </div>

            {/* Baux constatés */}
            <div className="p-4 bg-orange-500/10 border border-orange-500/30 rounded-lg space-y-4">
              <h4 className="text-orange-400 font-medium">Baux constatés (€/m²/an)</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label className="text-[#9298a6] text-sm">Bas</Label>
                  <Input
                    type="number"
                    value={formData.baux_bas}
                    onChange={(e) => setFormData({...formData, baux_bas: e.target.value})}
                    className="bg-[#000000] border-[#22262d] text-[#f2f3f5] mt-1"
                  />
                </div>
                <div>
                  <Label className="text-[#9298a6] text-sm">Moyen</Label>
                  <Input
                    type="number"
                    value={formData.baux_moyenne}
                    onChange={(e) => setFormData({...formData, baux_moyenne: e.target.value})}
                    className="bg-[#000000] border-[#22262d] text-[#f2f3f5] mt-1"
                  />
                </div>
                <div>
                  <Label className="text-[#9298a6] text-sm">Haut</Label>
                  <Input
                    type="number"
                    value={formData.baux_haut}
                    onChange={(e) => setFormData({...formData, baux_haut: e.target.value})}
                    className="bg-[#000000] border-[#22262d] text-[#f2f3f5] mt-1"
                  />
                </div>
              </div>
            </div>

            {/* Informations supplémentaires */}
            <div className="space-y-4">
              <div>
                <Label className="text-[#9298a6] text-sm">Description du marché</Label>
                <Textarea
                  value={formData.description_marche}
                  onChange={(e) => setFormData({...formData, description_marche: e.target.value})}
                  className="bg-[#000000] border-[#22262d] text-[#f2f3f5] mt-1"
                  rows={3}
                  placeholder="Décrivez les caractéristiques du marché local..."
                />
              </div>
              <div>
                <Label className="text-[#9298a6] text-sm">Notes complémentaires</Label>
                <Textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({...formData, notes: e.target.value})}
                  className="bg-[#000000] border-[#22262d] text-[#f2f3f5] mt-1"
                  rows={2}
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label className="text-[#9298a6] text-sm">Source des données</Label>
                  <Input
                    value={formData.source}
                    onChange={(e) => setFormData({...formData, source: e.target.value})}
                    className="bg-[#000000] border-[#22262d] text-[#f2f3f5] mt-1"
                    placeholder="Ex: DVF, SeLoger, etc."
                  />
                </div>
                <div>
                  <Label className="text-[#9298a6] text-sm">Date de mise à jour</Label>
                  <Input
                    type="date"
                    value={formData.date_maj}
                    onChange={(e) => setFormData({...formData, date_maj: e.target.value})}
                    className="bg-[#000000] border-[#22262d] text-[#f2f3f5] mt-1"
                  />
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="mt-6">
            <Button
              variant="outline"
              onClick={() => {
                setDialogOpen(false);
                resetForm();
              }}
              className="border-[#22262d] text-[#9298a6]"
            >
              Annuler
            </Button>
            <Button
              onClick={handleSubmit}
              className="bg-[#96c0b8] hover:bg-[#96c0b8]/90 text-[#f2f3f5]"
              disabled={!formData.ville || createMutation.isPending || updateMutation.isPending}
            >
              {createMutation.isPending || updateMutation.isPending ? "Enregistrement..." : editingItem ? "Mettre à jour" : "Ajouter"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}