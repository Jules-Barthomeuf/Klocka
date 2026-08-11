import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, ArrowLeft, Edit, Trash2, User } from "lucide-react";
import { GlowingEffect } from "@/components/ui/glowing-effect";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import MobileRecordCard from "@/components/crm/MobileRecordCard";

export default function CRMProspects() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProspect, setEditingProspect] = useState(null);
  const [formData, setFormData] = useState({
    nom: "",
    sous_elements: "",
    spoc: "",
    email: "",
    telephone: "",
    ville: "",
    proprietes: "",
    entreprise: "",
    remarques: ""
  });

  const { data: prospects = [], isLoading } = useQuery({
    queryKey: ['crm-prospects'],
    queryFn: () => base44.entities.Prospect.list("-created_date"),
    initialData: []
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Prospect.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm-prospects'] });
      setDialogOpen(false);
      resetForm();
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Prospect.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm-prospects'] });
      setDialogOpen(false);
      resetForm();
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Prospect.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm-prospects'] });
    }
  });

  const resetForm = () => {
    setEditingProspect(null);
    setFormData({
      nom: "",
      sous_elements: "",
      spoc: "",
      email: "",
      telephone: "",
      ville: "",
      proprietes: "",
      entreprise: "",
      remarques: ""
    });
  };

  const handleEdit = (prospect) => {
    setEditingProspect(prospect);
    setFormData({
      nom: prospect.nom || "",
      sous_elements: prospect.sous_elements || "",
      spoc: prospect.spoc || "",
      email: prospect.email || "",
      telephone: prospect.telephone || "",
      ville: prospect.ville || "",
      proprietes: prospect.proprietes || "",
      entreprise: prospect.entreprise || "",
      remarques: prospect.remarques || ""
    });
    setDialogOpen(true);
  };

  const handleCellEdit = (prospectId, field, value) => {
    updateMutation.mutate({ id: prospectId, data: { [field]: value } });
  };

  const handleSubmit = () => {
    if (editingProspect) {
      updateMutation.mutate({ id: editingProspect.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const EditableCell = ({ prospect, field, value, type = "text" }) => {
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
        handleCellEdit(prospect.id, field, tempValue);
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
          className="bg-gray-800 border-[#2A9D8F] text-white h-8 text-sm"
        />
      );
    }

    return (
      <div
        onClick={() => setIsEditing(true)}
        className="cursor-pointer hover:bg-gray-700/50 rounded px-2 py-1 h-[32px] flex items-center text-white"
      >
        {value || "-"}
      </div>
    );
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
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate(createPageUrl("CRM"))}
              className="text-gray-400 hover:text-white"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-4xl font-geist tracking-tighter text-white mb-2">
                Prospects CRM
              </h1>
              <div className="h-0.5 w-32 bg-[#2A9D8F]"></div>
            </div>
          </div>
          <Button
            onClick={() => {
              resetForm();
              setDialogOpen(true);
            }}
            className="bg-[#2A9D8F] hover:bg-[#2A9D8F]/90"
          >
            <Plus className="w-4 h-4 mr-2" />
            Nouveau prospect
          </Button>
        </div>

        <div className="relative rounded-[1.25rem] border-[0.75px] border-gray-600 p-2">
          <GlowingEffect spread={40} glow={true} disabled={false} proximity={64} inactiveZone={0.01} borderWidth={3} />
          <Card className="relative bg-gradient-to-br from-gray-800/80 to-gray-700/80 border-none">
            <CardContent className="p-6">
              {prospects.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <User className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>Aucun prospect</p>
                </div>
              ) : (
                <>
                {/* Mobile: cartes empilées */}
                <div className="md:hidden space-y-3">
                  {prospects.map((prospect) => (
                    <MobileRecordCard
                      key={prospect.id}
                      title={prospect.nom}
                      onEdit={() => handleEdit(prospect)}
                      onDelete={() => deleteMutation.mutate(prospect.id)}
                      fields={[
                        { label: "SPOC", value: prospect.spoc },
                        { label: "E-mail", value: prospect.email },
                        { label: "Téléphone", value: prospect.telephone },
                        { label: "Ville", value: prospect.ville },
                        { label: "Propriétés", value: prospect.proprietes },
                        { label: "Entreprise", value: prospect.entreprise },
                        { label: "Remarques", value: prospect.remarques },
                      ]}
                    />
                  ))}
                </div>
                {/* Desktop: tableau */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-600">
                        <th className="text-left py-3 px-3 text-gray-300 font-semibold whitespace-nowrap border-r border-gray-700 min-w-[200px]">Nom</th>
                        <th className="text-left py-3 px-3 text-gray-300 font-semibold whitespace-nowrap border-r border-gray-700">Sous-éléments</th>
                        <th className="text-left py-3 px-3 text-gray-300 font-semibold whitespace-nowrap border-r border-gray-700">SPOC</th>
                        <th className="text-left py-3 px-3 text-gray-300 font-semibold whitespace-nowrap border-r border-gray-700">E-mail</th>
                        <th className="text-left py-3 px-3 text-gray-300 font-semibold whitespace-nowrap border-r border-gray-700">Téléphone</th>
                        <th className="text-left py-3 px-3 text-gray-300 font-semibold whitespace-nowrap border-r border-gray-700">Ville</th>
                        <th className="text-left py-3 px-3 text-gray-300 font-semibold whitespace-nowrap border-r border-gray-700">Propriétés</th>
                        <th className="text-left py-3 px-3 text-gray-300 font-semibold whitespace-nowrap border-r border-gray-700">Entreprise</th>
                        <th className="text-left py-3 px-3 text-gray-300 font-semibold whitespace-nowrap border-r border-gray-700">Remarques</th>
                        <th className="text-left py-3 px-3 text-gray-300 font-semibold whitespace-nowrap">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {prospects.map((prospect) => (
                        <tr key={prospect.id} className="border-b border-gray-600 hover:bg-gray-700/30 transition-colors">
                          <td className="py-3 px-3 border-r border-gray-600 min-w-[200px]">
                            <EditableCell prospect={prospect} field="nom" value={prospect.nom} />
                          </td>
                          <td className="py-3 px-3 border-r border-gray-600">
                            <EditableCell prospect={prospect} field="sous_elements" value={prospect.sous_elements} />
                          </td>
                          <td className="py-3 px-3 border-r border-gray-600">
                            <EditableCell prospect={prospect} field="spoc" value={prospect.spoc} />
                          </td>
                          <td className="py-3 px-3 border-r border-gray-600">
                            <EditableCell prospect={prospect} field="email" value={prospect.email} type="email" />
                          </td>
                          <td className="py-3 px-3 border-r border-gray-600">
                            <EditableCell prospect={prospect} field="telephone" value={prospect.telephone} />
                          </td>
                          <td className="py-3 px-3 border-r border-gray-600">
                            <EditableCell prospect={prospect} field="ville" value={prospect.ville} />
                          </td>
                          <td className="py-3 px-3 border-r border-gray-600">
                            <EditableCell prospect={prospect} field="proprietes" value={prospect.proprietes} />
                          </td>
                          <td className="py-3 px-3 border-r border-gray-600">
                            <EditableCell prospect={prospect} field="entreprise" value={prospect.entreprise} />
                          </td>
                          <td className="py-3 px-3 border-r border-gray-600">
                            <EditableCell prospect={prospect} field="remarques" value={prospect.remarques} />
                          </td>
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleEdit(prospect)}
                                className="h-7 w-7 text-blue-400 hover:text-blue-300"
                              >
                                <Edit className="w-3.5 h-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => deleteMutation.mutate(prospect.id)}
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
                </>
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
              {editingProspect ? "Modifier le prospect" : "Nouveau prospect"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label className="text-gray-400">Nom *</Label>
              <Input
                value={formData.nom}
                onChange={(e) => setFormData({...formData, nom: e.target.value})}
                className="bg-gray-900 border-gray-700 text-white"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-gray-400">Sous-éléments</Label>
                <Input
                  value={formData.sous_elements}
                  onChange={(e) => setFormData({...formData, sous_elements: e.target.value})}
                  className="bg-gray-900 border-gray-700 text-white"
                />
              </div>
              <div>
                <Label className="text-gray-400">SPOC</Label>
                <Input
                  value={formData.spoc}
                  onChange={(e) => setFormData({...formData, spoc: e.target.value})}
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
                <Label className="text-gray-400">Ville</Label>
                <Input
                  value={formData.ville}
                  onChange={(e) => setFormData({...formData, ville: e.target.value})}
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

            <div>
              <Label className="text-gray-400">Propriétés</Label>
              <Textarea
                value={formData.proprietes}
                onChange={(e) => setFormData({...formData, proprietes: e.target.value})}
                className="bg-gray-900 border-gray-700 text-white"
                rows={2}
              />
            </div>

            <div>
              <Label className="text-gray-400">Remarques</Label>
              <Textarea
                value={formData.remarques}
                onChange={(e) => setFormData({...formData, remarques: e.target.value})}
                className="bg-gray-900 border-gray-700 text-white"
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="border-gray-700">
              Annuler
            </Button>
            <Button onClick={handleSubmit} className="bg-[#2A9D8F] hover:bg-[#2A9D8F]/90">
              {editingProspect ? "Modifier" : "Créer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}