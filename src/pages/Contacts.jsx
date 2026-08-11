import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Edit, Trash2, User } from "lucide-react";
import { GlowingEffect } from "@/components/ui/glowing-effect";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";

export default function Contacts() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingContact, setEditingContact] = useState(null);
  const [formData, setFormData] = useState({
    nom: "",
    sous_elements: "",
    personnes: "",
    entreprise: "",
    email: "",
    telephone: "",
    statut_client: "",
    mandat_signe: false,
    patrimoine: "",
    revenu: "",
    fond_propre: "",
    budget: "",
    localisation: "",
    formation_lcdi: "",
    source: "",
    remarque: "",
    proprietes: "",
    chiffres: "",
    information: "",
    fonction: ""
  });

  const { data: contacts = [], isLoading } = useQuery({
    queryKey: ['contacts'],
    queryFn: () => base44.entities.Contact.list("-created_date"),
    initialData: []
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Contact.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      setDialogOpen(false);
      resetForm();
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Contact.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      setDialogOpen(false);
      resetForm();
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Contact.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
    }
  });

  const resetForm = () => {
    setEditingContact(null);
    setFormData({
      nom: "",
      sous_elements: "",
      personnes: "",
      entreprise: "",
      email: "",
      telephone: "",
      statut_client: "",
      mandat_signe: false,
      patrimoine: "",
      revenu: "",
      fond_propre: "",
      budget: "",
      localisation: "",
      formation_lcdi: "",
      source: "",
      remarque: "",
      proprietes: "",
      chiffres: "",
      information: "",
      fonction: ""
    });
  };

  const handleEdit = (contact) => {
    setEditingContact(contact);
    setFormData({
      nom: contact.nom || "",
      sous_elements: contact.sous_elements || "",
      personnes: contact.personnes || "",
      entreprise: contact.entreprise || "",
      email: contact.email || "",
      telephone: contact.telephone || "",
      statut_client: contact.statut_client || "",
      mandat_signe: contact.mandat_signe || false,
      patrimoine: contact.patrimoine || "",
      revenu: contact.revenu?.toString() || "",
      fond_propre: contact.fond_propre?.toString() || "",
      budget: contact.budget?.toString() || "",
      localisation: contact.localisation || "",
      formation_lcdi: contact.formation_lcdi || "",
      source: contact.source || "",
      remarque: contact.remarque || "",
      proprietes: contact.proprietes || "",
      chiffres: contact.chiffres || "",
      information: contact.information || "",
      fonction: contact.fonction || ""
    });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    const data = { ...formData };
    if (data.revenu) data.revenu = parseFloat(data.revenu);
    if (data.fond_propre) data.fond_propre = parseFloat(data.fond_propre);
    if (data.budget) data.budget = parseFloat(data.budget);

    if (editingContact) {
      updateMutation.mutate({ id: editingContact.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const formatCurrency = (value) => {
    if (!value) return "-";
    return new Intl.NumberFormat('fr-FR', { 
      style: 'currency', 
      currency: 'EUR',
      maximumFractionDigits: 0 
    }).format(value);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#2A9D8F]"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white p-6">
      <div className="max-w-[1800px] mx-auto">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-geist tracking-tighter text-white mb-2">
              Contacts
            </h1>
            <div className="h-0.5 w-32 bg-[#2A9D8F]"></div>
          </div>
          <Button
            onClick={() => {
              resetForm();
              setDialogOpen(true);
            }}
            className="bg-[#2A9D8F] hover:bg-[#2A9D8F]/90"
          >
            <Plus className="w-4 h-4 mr-2" />
            Nouveau contact
          </Button>
        </div>

        <div className="relative rounded-[1.25rem] border-[0.75px] border-gray-700 p-2">
          <GlowingEffect spread={40} glow={true} disabled={false} proximity={64} inactiveZone={0.01} borderWidth={3} />
          <Card className="relative bg-gradient-to-br from-gray-900/95 to-gray-800/95 border-none">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <User className="w-5 h-5 text-[#2A9D8F]" />
                Liste des contacts
                <Badge className="ml-2 bg-[#2A9D8F]/20 text-[#2A9D8F]">
                  {contacts.length}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {contacts.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  Aucun contact pour le moment
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-600">
                        <th className="text-left py-3 px-3 text-gray-300 font-semibold whitespace-nowrap">Nom</th>
                        <th className="text-left py-3 px-3 text-gray-300 font-semibold whitespace-nowrap">Sous-éléments</th>
                        <th className="text-left py-3 px-3 text-gray-300 font-semibold whitespace-nowrap">Personnes</th>
                        <th className="text-left py-3 px-3 text-gray-300 font-semibold whitespace-nowrap">Entreprise</th>
                        <th className="text-left py-3 px-3 text-gray-300 font-semibold whitespace-nowrap">E-mail</th>
                        <th className="text-left py-3 px-3 text-gray-300 font-semibold whitespace-nowrap">Téléphone</th>
                        <th className="text-left py-3 px-3 text-gray-300 font-semibold whitespace-nowrap">Statut Client</th>
                        <th className="text-left py-3 px-3 text-gray-300 font-semibold whitespace-nowrap">Mandat Signé</th>
                        <th className="text-left py-3 px-3 text-gray-300 font-semibold whitespace-nowrap">Patrimoine</th>
                        <th className="text-left py-3 px-3 text-gray-300 font-semibold whitespace-nowrap">Revenu</th>
                        <th className="text-left py-3 px-3 text-gray-300 font-semibold whitespace-nowrap">Fond propre</th>
                        <th className="text-left py-3 px-3 text-gray-300 font-semibold whitespace-nowrap">Budget</th>
                        <th className="text-left py-3 px-3 text-gray-300 font-semibold whitespace-nowrap">Localisation</th>
                        <th className="text-left py-3 px-3 text-gray-300 font-semibold whitespace-nowrap">Formation LCDI</th>
                        <th className="text-left py-3 px-3 text-gray-300 font-semibold whitespace-nowrap">Source</th>
                        <th className="text-left py-3 px-3 text-gray-300 font-semibold whitespace-nowrap">Remarque</th>
                        <th className="text-left py-3 px-3 text-gray-300 font-semibold whitespace-nowrap">Propriétés</th>
                        <th className="text-left py-3 px-3 text-gray-300 font-semibold whitespace-nowrap">Chiffres</th>
                        <th className="text-left py-3 px-3 text-gray-300 font-semibold whitespace-nowrap">Information</th>
                        <th className="text-left py-3 px-3 text-gray-300 font-semibold whitespace-nowrap">Fonction</th>
                        <th className="text-left py-3 px-3 text-gray-300 font-semibold whitespace-nowrap">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {contacts.map((contact) => (
                        <tr key={contact.id} className="border-b-2 border-gray-700 hover:bg-gray-800/50 transition-colors">
                          <td className="py-3 px-3">
                            <span className="text-white font-medium">{contact.nom}</span>
                          </td>
                          <td className="py-3 px-3 text-gray-300">{contact.sous_elements || "-"}</td>
                          <td className="py-3 px-3 text-gray-300">{contact.personnes || "-"}</td>
                          <td className="py-3 px-3 text-gray-300">{contact.entreprise || "-"}</td>
                          <td className="py-3 px-3">
                            {contact.email ? (
                              <a href={`mailto:${contact.email}`} className="text-[#71CCBA] hover:underline">
                                {contact.email}
                              </a>
                            ) : "-"}
                          </td>
                          <td className="py-3 px-3 text-gray-300">{contact.telephone || "-"}</td>
                          <td className="py-3 px-3 text-gray-300">{contact.statut_client || "-"}</td>
                          <td className="py-3 px-3">
                            <Badge className={contact.mandat_signe ? "bg-green-500/20 text-green-400 border border-green-500/30" : "bg-gray-700 text-gray-400"}>
                              {contact.mandat_signe ? "Oui" : "Non"}
                            </Badge>
                          </td>
                          <td className="py-3 px-3 text-gray-300">{contact.patrimoine || "-"}</td>
                          <td className="py-3 px-3 text-gray-300">{formatCurrency(contact.revenu)}</td>
                          <td className="py-3 px-3 text-gray-300">{formatCurrency(contact.fond_propre)}</td>
                          <td className="py-3 px-3 text-gray-300">{formatCurrency(contact.budget)}</td>
                          <td className="py-3 px-3 text-gray-300 max-w-[150px] truncate" title={contact.localisation}>{contact.localisation || "-"}</td>
                          <td className="py-3 px-3 text-gray-300">{contact.formation_lcdi || "-"}</td>
                          <td className="py-3 px-3 text-gray-300">{contact.source || "-"}</td>
                          <td className="py-3 px-3 text-gray-300 max-w-[200px] truncate" title={contact.remarque}>{contact.remarque || "-"}</td>
                          <td className="py-3 px-3 text-gray-300">{contact.proprietes || "-"}</td>
                          <td className="py-3 px-3 text-gray-300">{contact.chiffres || "-"}</td>
                          <td className="py-3 px-3 text-gray-300">{contact.information || "-"}</td>
                          <td className="py-3 px-3 text-gray-300">{contact.fonction || "-"}</td>
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleEdit(contact)}
                                className="h-7 w-7 text-blue-400 hover:text-blue-300"
                              >
                                <Edit className="w-3.5 h-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => deleteMutation.mutate(contact.id)}
                                className="h-7 w-7 text-red-400 hover:text-red-300"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Dialog création/édition */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-black border-gray-700 max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white">
              {editingContact ? "Modifier le contact" : "Nouveau contact"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-gray-400">Nom *</Label>
                <Input
                  value={formData.nom}
                  onChange={(e) => setFormData({...formData, nom: e.target.value})}
                  className="bg-gray-900 border-gray-700 text-white"
                />
              </div>
              <div>
                <Label className="text-gray-400">Sous-éléments</Label>
                <Input
                  value={formData.sous_elements}
                  onChange={(e) => setFormData({...formData, sous_elements: e.target.value})}
                  className="bg-gray-900 border-gray-700 text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-gray-400">Personnes</Label>
                <Input
                  value={formData.personnes}
                  onChange={(e) => setFormData({...formData, personnes: e.target.value})}
                  className="bg-gray-900 border-gray-700 text-white"
                />
              </div>
              <div>
                <Label className="text-gray-400">Entreprise</Label>
                <Input
                  value={formData.entreprise}
                  onChange={(e) => setFormData({...formData, entreprise: e.target.value})}
                  className="bg-gray-900 border-gray-700 text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-gray-400">E-mail</Label>
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                  className="bg-gray-900 border-gray-700 text-white"
                />
              </div>
              <div>
                <Label className="text-gray-400">Téléphone</Label>
                <Input
                  value={formData.telephone}
                  onChange={(e) => setFormData({...formData, telephone: e.target.value})}
                  className="bg-gray-900 border-gray-700 text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-gray-400">Statut Client</Label>
                <Input
                  value={formData.statut_client}
                  onChange={(e) => setFormData({...formData, statut_client: e.target.value})}
                  className="bg-gray-900 border-gray-700 text-white"
                />
              </div>
              <div className="flex items-end pb-2">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={formData.mandat_signe}
                    onCheckedChange={(checked) => setFormData({...formData, mandat_signe: checked})}
                    className="data-[state=checked]:bg-[#2A9D8F]"
                  />
                  <Label className="text-gray-400">Mandat signé</Label>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-gray-400">Patrimoine</Label>
                <Input
                  value={formData.patrimoine}
                  onChange={(e) => setFormData({...formData, patrimoine: e.target.value})}
                  className="bg-gray-900 border-gray-700 text-white"
                />
              </div>
              <div>
                <Label className="text-gray-400">Fonction</Label>
                <Input
                  value={formData.fonction}
                  onChange={(e) => setFormData({...formData, fonction: e.target.value})}
                  className="bg-gray-900 border-gray-700 text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label className="text-gray-400">Revenu (€)</Label>
                <Input
                  type="number"
                  value={formData.revenu}
                  onChange={(e) => setFormData({...formData, revenu: e.target.value})}
                  className="bg-gray-900 border-gray-700 text-white"
                />
              </div>
              <div>
                <Label className="text-gray-400">Fond propre (€)</Label>
                <Input
                  type="number"
                  value={formData.fond_propre}
                  onChange={(e) => setFormData({...formData, fond_propre: e.target.value})}
                  className="bg-gray-900 border-gray-700 text-white"
                />
              </div>
              <div>
                <Label className="text-gray-400">Budget (€)</Label>
                <Input
                  type="number"
                  value={formData.budget}
                  onChange={(e) => setFormData({...formData, budget: e.target.value})}
                  className="bg-gray-900 border-gray-700 text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label className="text-gray-400">Localisation</Label>
                <Input
                  value={formData.localisation}
                  onChange={(e) => setFormData({...formData, localisation: e.target.value})}
                  className="bg-gray-900 border-gray-700 text-white"
                />
              </div>
              <div>
                <Label className="text-gray-400">Formation LCDI</Label>
                <Input
                  value={formData.formation_lcdi}
                  onChange={(e) => setFormData({...formData, formation_lcdi: e.target.value})}
                  className="bg-gray-900 border-gray-700 text-white"
                />
              </div>
              <div>
                <Label className="text-gray-400">Source</Label>
                <Input
                  value={formData.source}
                  onChange={(e) => setFormData({...formData, source: e.target.value})}
                  className="bg-gray-900 border-gray-700 text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label className="text-gray-400">Propriétés</Label>
                <Input
                  value={formData.proprietes}
                  onChange={(e) => setFormData({...formData, proprietes: e.target.value})}
                  className="bg-gray-900 border-gray-700 text-white"
                />
              </div>
              <div>
                <Label className="text-gray-400">Chiffres</Label>
                <Input
                  value={formData.chiffres}
                  onChange={(e) => setFormData({...formData, chiffres: e.target.value})}
                  className="bg-gray-900 border-gray-700 text-white"
                />
              </div>
              <div>
                <Label className="text-gray-400">Information</Label>
                <Input
                  value={formData.information}
                  onChange={(e) => setFormData({...formData, information: e.target.value})}
                  className="bg-gray-900 border-gray-700 text-white"
                />
              </div>
            </div>

            <div>
              <Label className="text-gray-400">Remarque</Label>
              <Textarea
                value={formData.remarque}
                onChange={(e) => setFormData({...formData, remarque: e.target.value})}
                className="bg-gray-900 border-gray-700 text-white"
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="border-gray-700">
              Annuler
            </Button>
            <Button onClick={handleSubmit} className="bg-[#2A9D8F] hover:bg-[#2A9D8F]/90">
              {editingContact ? "Modifier" : "Créer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}