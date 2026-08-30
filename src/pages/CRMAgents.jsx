import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, ArrowLeft, Edit, Trash2, Briefcase } from "lucide-react";
import { GlowingEffect } from "@/components/ui/glowing-effect";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

export default function CRMAgents() {
  const navigate = useNavigate();
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
    queryKey: ['crm-agents'],
    queryFn: () => base44.entities.Contact.list("-created_date"),
    initialData: []
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Contact.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm-agents'] });
      setDialogOpen(false);
      resetForm();
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Contact.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm-agents'] });
      setDialogOpen(false);
      resetForm();
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Contact.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm-agents'] });
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

  const handleCellEdit = (contactId, field, value) => {
    updateMutation.mutate({ id: contactId, data: { [field]: value } });
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

  const EditableCell = ({ contact, field, value, type = "text" }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [tempValue, setTempValue] = useState(value || "");
    const inputRef = React.useRef(null);

    React.useEffect(() => {
      if (isEditing && inputRef.current) {
        inputRef.current.focus();
      }
    }, [isEditing]);

    const handleSave = () => {
      if (tempValue !== value) {
        handleCellEdit(contact.id, field, tempValue);
      }
      setIsEditing(false);
    };

    if (isEditing) {
      return (
        <Input
          ref={inputRef}
          type={type}
          value={tempValue}
          onChange={(e) => setTempValue(e.target.value)}
          onBlur={handleSave}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSave();
            if (e.key === 'Escape') {
              setTempValue(value || "");
              setIsEditing(false);
            }
          }}
          className="bg-[#0f1114] border-[#96c0b8] text-[#f2f3f5] h-8 text-sm"
        />
      );
    }

    return (
      <div
        onClick={() => setIsEditing(true)}
        className="cursor-pointer hover:bg-[#22262d]/50 rounded px-2 py-1 h-[32px] flex items-center text-[#f2f3f5]"
      >
        {value || "-"}
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#000000] text-[#f2f3f5] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#96c0b8]"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#000000] text-[#f2f3f5] p-6">
      <div className="max-w-[1800px] mx-auto">
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate(createPageUrl("CRM"))}
              className="text-[#9298a6] hover:text-[#f2f3f5]"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-4xl font-geist tracking-tighter text-[#f2f3f5] mb-2">
                Agents Immobiliers CRM
              </h1>
              <div className="h-0.5 w-32 bg-[#96c0b8]"></div>
            </div>
          </div>
          <Button
            onClick={() => {
              resetForm();
              setDialogOpen(true);
            }}
            className="bg-[#96c0b8] hover:bg-[#96c0b8]/90"
          >
            <Plus className="w-4 h-4 mr-2" />
            Nouveau contact
          </Button>
        </div>

        <div className="relative rounded-[1.25rem] border-[0.75px] border-[#22262d] p-2">
          <GlowingEffect spread={40} glow={true} disabled={false} proximity={64} inactiveZone={0.01} borderWidth={3} />
          <Card className="relative bg-gradient-to-br from-[#0f1114]/80 to-[#22262d]/80 border-none">
            <CardContent className="p-6">
              {contacts.length === 0 ? (
                <div className="text-center py-12 text-[#9298a6]">
                  <Briefcase className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>Aucun agent immobilier</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[#22262d]">
                        <th className="text-left py-3 px-3 text-[#c9cdd6] font-semibold whitespace-nowrap border-r border-[#22262d] min-w-[200px]">Nom</th>
                        <th className="text-left py-3 px-3 text-[#c9cdd6] font-semibold whitespace-nowrap border-r border-[#22262d]">Sous-éléments</th>
                        <th className="text-left py-3 px-3 text-[#c9cdd6] font-semibold whitespace-nowrap border-r border-[#22262d] min-w-[200px]">Personnes</th>
                        <th className="text-left py-3 px-3 text-[#c9cdd6] font-semibold whitespace-nowrap border-r border-[#22262d]">E-mail</th>
                        <th className="text-left py-3 px-3 text-[#c9cdd6] font-semibold whitespace-nowrap border-r border-[#22262d]">Téléphone</th>
                        <th className="text-left py-3 px-3 text-[#c9cdd6] font-semibold whitespace-nowrap border-r border-[#22262d]">Ville</th>
                        <th className="text-left py-3 px-3 text-[#c9cdd6] font-semibold whitespace-nowrap border-r border-[#22262d] min-w-[400px]">Propriétés</th>
                        <th className="text-left py-3 px-3 text-[#c9cdd6] font-semibold whitespace-nowrap border-r border-[#22262d]">Entreprise</th>
                        <th className="text-left py-3 px-3 text-[#c9cdd6] font-semibold whitespace-nowrap border-r border-[#22262d]">Remarques</th>
                        <th className="text-left py-3 px-3 text-[#c9cdd6] font-semibold whitespace-nowrap">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {contacts.map((contact) => (
                        <tr key={contact.id} className="border-b border-[#22262d] hover:bg-[#22262d]/30 transition-colors">
                          <td className="py-3 px-3 border-r border-[#22262d] min-w-[200px]">
                            <EditableCell contact={contact} field="nom" value={contact.nom} />
                          </td>
                          <td className="py-3 px-3 border-r border-[#22262d]">
                            <EditableCell contact={contact} field="sous_elements" value={contact.sous_elements} />
                          </td>
                          <td className="py-3 px-3 border-r border-[#22262d] min-w-[200px]">
                            <EditableCell contact={contact} field="personnes" value={contact.personnes} />
                          </td>
                          <td className="py-3 px-3 border-r border-[#22262d]">
                            <EditableCell contact={contact} field="email" value={contact.email} type="email" />
                          </td>
                          <td className="py-3 px-3 border-r border-[#22262d]">
                            <EditableCell contact={contact} field="telephone" value={contact.telephone} />
                          </td>
                          <td className="py-3 px-3 border-r border-[#22262d]">
                            <EditableCell contact={contact} field="localisation" value={contact.localisation} />
                          </td>
                          <td className="py-3 px-3 border-r border-[#22262d] min-w-[400px]">
                            <EditableCell contact={contact} field="proprietes" value={contact.proprietes} />
                          </td>
                          <td className="py-3 px-3 border-r border-[#22262d]">
                            <EditableCell contact={contact} field="entreprise" value={contact.entreprise} />
                          </td>
                          <td className="py-3 px-3 border-r border-[#22262d]">
                            <EditableCell contact={contact} field="remarque" value={contact.remarque} />
                          </td>
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
        <DialogContent className="bg-[#000000] border-[#22262d] max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-[#f2f3f5]">
              {editingContact ? "Modifier le contact" : "Nouveau contact"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label className="text-[#9298a6]">Nom *</Label>
              <Input
                value={formData.nom}
                onChange={(e) => setFormData({...formData, nom: e.target.value})}
                className="bg-[#000000] border-[#22262d] text-[#f2f3f5]"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-[#9298a6]">Sous-éléments</Label>
                <Input
                  value={formData.sous_elements}
                  onChange={(e) => setFormData({...formData, sous_elements: e.target.value})}
                  className="bg-[#000000] border-[#22262d] text-[#f2f3f5]"
                />
              </div>
              <div>
                <Label className="text-[#9298a6]">Personnes</Label>
                <Input
                  value={formData.personnes}
                  onChange={(e) => setFormData({...formData, personnes: e.target.value})}
                  className="bg-[#000000] border-[#22262d] text-[#f2f3f5]"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-[#9298a6]">E-mail</Label>
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                  className="bg-[#000000] border-[#22262d] text-[#f2f3f5]"
                />
              </div>
              <div>
                <Label className="text-[#9298a6]">Téléphone</Label>
                <Input
                  value={formData.telephone}
                  onChange={(e) => setFormData({...formData, telephone: e.target.value})}
                  className="bg-[#000000] border-[#22262d] text-[#f2f3f5]"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-[#9298a6]">Ville</Label>
                <Input
                  value={formData.localisation}
                  onChange={(e) => setFormData({...formData, localisation: e.target.value})}
                  className="bg-[#000000] border-[#22262d] text-[#f2f3f5]"
                />
              </div>
              <div>
                <Label className="text-[#9298a6]">Entreprise</Label>
                <Input
                  value={formData.entreprise}
                  onChange={(e) => setFormData({...formData, entreprise: e.target.value})}
                  className="bg-[#000000] border-[#22262d] text-[#f2f3f5]"
                />
              </div>
            </div>

            <div>
              <Label className="text-[#9298a6]">Propriétés</Label>
              <Textarea
                value={formData.proprietes}
                onChange={(e) => setFormData({...formData, proprietes: e.target.value})}
                className="bg-[#000000] border-[#22262d] text-[#f2f3f5]"
                rows={2}
              />
            </div>

            <div>
              <Label className="text-[#9298a6]">Remarques</Label>
              <Textarea
                value={formData.remarque}
                onChange={(e) => setFormData({...formData, remarque: e.target.value})}
                className="bg-[#000000] border-[#22262d] text-[#f2f3f5]"
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="border-[#22262d]">
              Annuler
            </Button>
            <Button onClick={handleSubmit} className="bg-[#96c0b8] hover:bg-[#96c0b8]/90">
              {editingContact ? "Modifier" : "Créer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}