import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, ArrowLeft, Phone, Mail, Building2, User, DollarSign, Edit, Trash2, MapPin, Briefcase } from "lucide-react";
import { GlowingEffect } from "@/components/ui/glowing-effect";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import MobileRecordCard from "@/components/crm/MobileRecordCard";

const statutColors = {
  negociation: "bg-blue-500 text-white",
  recherche: "bg-cyan-500 text-white",
  compromis: "bg-orange-500 text-white",
  def_strategie: "bg-teal-500 text-white"
};

const statutLabels = {
  negociation: "Négociation",
  recherche: "Recherche",
  compromis: "Compromis",
  def_strategie: "Def Stratégie"
};

export default function CRMClients() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState(null);
  const [editingCell, setEditingCell] = useState(null);
  const [formData, setFormData] = useState({
    nom: "",
    sous_elements: "",
    personnes: "",
    entreprise: "",
    email: "",
    telephone: "",
    statut_client: "recherche",
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
    fonction: "",
    categorie: "en_cours",
    notes: ""
  });

  const { data: clients = [], isLoading } = useQuery({
    queryKey: ['crm-clients'],
    queryFn: () => base44.entities.ClientCRM.list("-created_date"),
    initialData: []
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.ClientCRM.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm-clients'] });
      setDialogOpen(false);
      resetForm();
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.ClientCRM.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm-clients'] });
      setDialogOpen(false);
      setEditingCell(null);
      resetForm();
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.ClientCRM.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm-clients'] });
    }
  });

  const resetForm = () => {
    setEditingClient(null);
    setFormData({
      nom: "",
      sous_elements: "",
      personnes: "",
      entreprise: "",
      email: "",
      telephone: "",
      statut_client: "recherche",
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
      fonction: "",
      categorie: "en_cours",
      notes: ""
    });
  };

  const handleEdit = (client) => {
    setEditingClient(client);
    setFormData({
      nom: client.nom || "",
      sous_elements: client.sous_elements || "",
      personnes: client.personnes || "",
      entreprise: client.entreprise || "",
      email: client.email || "",
      telephone: client.telephone || "",
      statut_client: client.statut_client || "recherche",
      mandat_signe: client.mandat_signe || false,
      patrimoine: client.patrimoine || "",
      revenu: client.revenu?.toString() || "",
      fond_propre: client.fond_propre?.toString() || "",
      budget: client.budget?.toString() || "",
      localisation: client.localisation || "",
      formation_lcdi: client.formation_lcdi || "",
      source: client.source || "",
      remarque: client.remarque || "",
      proprietes: client.proprietes || "",
      chiffres: client.chiffres || "",
      information: client.information || "",
      fonction: client.fonction || "",
      categorie: client.categorie || "en_cours",
      notes: client.notes || ""
    });
    setDialogOpen(true);
  };

  const handleCellEdit = (clientId, field, value) => {
    const client = clients.find(c => c.id === clientId);
    if (!client) return;

    const updateData = { [field]: value };
    
    // Convert numeric fields
    if (['revenu', 'fond_propre', 'budget'].includes(field)) {
      updateData[field] = value ? parseFloat(value) : null;
    }

    updateMutation.mutate({ id: clientId, data: updateData });
  };

  const handleSubmit = () => {
    const data = { ...formData };
    if (data.revenu) data.revenu = parseFloat(data.revenu);
    if (data.fond_propre) data.fond_propre = parseFloat(data.fond_propre);
    if (data.budget) data.budget = parseFloat(data.budget);

    if (editingClient) {
      updateMutation.mutate({ id: editingClient.id, data });
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

  const clientsEnCours = clients.filter(c => c.categorie === "en_cours");
  const clientsSignes = clients.filter(c => c.categorie === "signe");
  const clientsStandBy = clients.filter(c => c.categorie === "stand_by");

  const EditableCell = ({ client, field, value, type = "text" }) => {
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
        handleCellEdit(client.id, field, tempValue);
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

  const EditableSelectCell = ({ client, field, value, options }) => {
    return (
      <div className="h-[32px] flex items-center">
        <Select
          value={value || ""}
          onValueChange={(newValue) => handleCellEdit(client.id, field, newValue)}
        >
          <SelectTrigger className="bg-transparent border-none text-white h-8 hover:bg-gray-700/50">
            <SelectValue>
              {value ? (
                field === "statut_client" ? (
                  <Badge className={`${statutColors[value]} text-xs`}>
                    {statutLabels[value]}
                  </Badge>
                ) : (
                  value
                )
              ) : "-"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="bg-gray-900 border-gray-700">
            {options.map(opt => (
              <SelectItem key={opt.value} value={opt.value} className="text-white">
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  };

  const EditableSwitchCell = ({ client, field, value }) => {
    return (
      <div className="h-[32px] flex items-center justify-center">
        <Switch
          checked={value || false}
          onCheckedChange={(checked) => handleCellEdit(client.id, field, checked)}
          className="data-[state=checked]:bg-[#2A9D8F]"
        />
      </div>
    );
  };

  const renderTableau = (clientsList, titre) => (
    <div className="relative rounded-[1.25rem] border-[0.75px] border-gray-600 p-2">
      <GlowingEffect spread={40} glow={true} disabled={false} proximity={64} inactiveZone={0.01} borderWidth={3} />
      <Card className="relative bg-gradient-to-br from-gray-800/80 to-gray-700/80 border-none">
        <CardContent className="p-6">
          {clientsList.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <User className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Aucun client dans cette catégorie</p>
            </div>
          ) : (
            <>
            {/* Mobile: cartes empilées */}
            <div className="md:hidden space-y-3">
              {clientsList.map((client) => (
                <MobileRecordCard
                  key={client.id}
                  title={client.nom}
                  onEdit={() => handleEdit(client)}
                  onDelete={() => deleteMutation.mutate(client.id)}
                  fields={[
                    { label: "Entreprise", value: client.entreprise },
                    { label: "E-mail", value: client.email },
                    { label: "Téléphone", value: client.telephone },
                    { label: "Statut", value: client.statut_client ? <Badge className={`${statutColors[client.statut_client]} text-xs`}>{statutLabels[client.statut_client]}</Badge> : "-" },
                    { label: "Mandat signé", value: client.mandat_signe ? "Oui" : "Non" },
                    { label: "Budget", value: formatCurrency(client.budget) },
                    { label: "Localisation", value: client.localisation },
                    { label: "Fonction", value: client.fonction },
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
                    <th className="text-left py-3 px-3 text-gray-300 font-semibold whitespace-nowrap border-r border-gray-700">Personnes</th>
                    <th className="text-left py-3 px-3 text-gray-300 font-semibold whitespace-nowrap border-r border-gray-700">Entreprise</th>
                    <th className="text-left py-3 px-3 text-gray-300 font-semibold whitespace-nowrap border-r border-gray-700">E-mail</th>
                    <th className="text-left py-3 px-3 text-gray-300 font-semibold whitespace-nowrap border-r border-gray-700">Téléphone</th>
                    <th className="text-left py-3 px-3 text-gray-300 font-semibold whitespace-nowrap border-r border-gray-700">Statut Client</th>
                    <th className="text-left py-3 px-3 text-gray-300 font-semibold whitespace-nowrap border-r border-gray-700">Mandat Signé</th>
                    <th className="text-left py-3 px-3 text-gray-300 font-semibold whitespace-nowrap border-r border-gray-700">Patrimoine</th>
                    <th className="text-left py-3 px-3 text-gray-300 font-semibold whitespace-nowrap border-r border-gray-700">Revenu</th>
                    <th className="text-left py-3 px-3 text-gray-300 font-semibold whitespace-nowrap border-r border-gray-700">Fond propre</th>
                    <th className="text-left py-3 px-3 text-gray-300 font-semibold whitespace-nowrap border-r border-gray-700">Budget</th>
                    <th className="text-left py-3 px-3 text-gray-300 font-semibold whitespace-nowrap border-r border-gray-700">Localisation</th>
                    <th className="text-left py-3 px-3 text-gray-300 font-semibold whitespace-nowrap border-r border-gray-700">Formation LCDI</th>
                    <th className="text-left py-3 px-3 text-gray-300 font-semibold whitespace-nowrap border-r border-gray-700">Source</th>
                    <th className="text-left py-3 px-3 text-gray-300 font-semibold whitespace-nowrap border-r border-gray-700">Remarque</th>
                    <th className="text-left py-3 px-3 text-gray-300 font-semibold whitespace-nowrap border-r border-gray-700">Propriétés</th>
                    <th className="text-left py-3 px-3 text-gray-300 font-semibold whitespace-nowrap border-r border-gray-700">Chiffres</th>
                    <th className="text-left py-3 px-3 text-gray-300 font-semibold whitespace-nowrap border-r border-gray-700">Information</th>
                    <th className="text-left py-3 px-3 text-gray-300 font-semibold whitespace-nowrap border-r border-gray-700">Fonction</th>
                    <th className="text-left py-3 px-3 text-gray-300 font-semibold whitespace-nowrap">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {clientsList.map((client) => (
                    <tr key={client.id} className="border-b border-gray-600 hover:bg-gray-700/30 transition-colors">
                      <td className="py-3 px-3 border-r border-gray-600 min-w-[200px]">
                        <EditableCell client={client} field="nom" value={client.nom} />
                      </td>
                      <td className="py-3 px-3 border-r border-gray-600">
                        <EditableCell client={client} field="sous_elements" value={client.sous_elements} />
                      </td>
                      <td className="py-3 px-3 border-r border-gray-600">
                        <EditableCell client={client} field="personnes" value={client.personnes} />
                      </td>
                      <td className="py-3 px-3 border-r border-gray-600">
                        <EditableCell client={client} field="entreprise" value={client.entreprise} />
                      </td>
                      <td className="py-3 px-3 border-r border-gray-600">
                        <EditableCell client={client} field="email" value={client.email} type="email" />
                      </td>
                      <td className="py-3 px-3 border-r border-gray-600">
                        <EditableCell client={client} field="telephone" value={client.telephone} />
                      </td>
                      <td className="py-3 px-3 border-r border-gray-600">
                        <EditableSelectCell 
                          client={client} 
                          field="statut_client" 
                          value={client.statut_client}
                          options={[
                            { value: "negociation", label: "Négociation" },
                            { value: "recherche", label: "Recherche" },
                            { value: "compromis", label: "Compromis" },
                            { value: "def_strategie", label: "Def Stratégie" }
                          ]}
                        />
                      </td>
                      <td className="py-3 px-3 border-r border-gray-600">
                        <EditableSwitchCell client={client} field="mandat_signe" value={client.mandat_signe} />
                      </td>
                      <td className="py-3 px-3 border-r border-gray-600">
                        <EditableCell client={client} field="patrimoine" value={client.patrimoine} />
                      </td>
                      <td className="py-3 px-3 border-r border-gray-600">
                        <EditableCell client={client} field="revenu" value={client.revenu?.toString()} type="number" />
                      </td>
                      <td className="py-3 px-3 border-r border-gray-600">
                        <EditableCell client={client} field="fond_propre" value={client.fond_propre?.toString()} type="number" />
                      </td>
                      <td className="py-3 px-3 border-r border-gray-600">
                        <EditableCell client={client} field="budget" value={client.budget?.toString()} type="number" />
                      </td>
                      <td className="py-3 px-3 border-r border-gray-600">
                        <EditableCell client={client} field="localisation" value={client.localisation} />
                      </td>
                      <td className="py-3 px-3 border-r border-gray-600">
                        <EditableCell client={client} field="formation_lcdi" value={client.formation_lcdi} />
                      </td>
                      <td className="py-3 px-3 border-r border-gray-600">
                        <EditableCell client={client} field="source" value={client.source} />
                      </td>
                      <td className="py-3 px-3 border-r border-gray-600">
                        <EditableCell client={client} field="remarque" value={client.remarque} />
                      </td>
                      <td className="py-3 px-3 border-r border-gray-600">
                        <EditableCell client={client} field="proprietes" value={client.proprietes} />
                      </td>
                      <td className="py-3 px-3 border-r border-gray-600">
                        <EditableCell client={client} field="chiffres" value={client.chiffres} />
                      </td>
                      <td className="py-3 px-3 border-r border-gray-600">
                        <EditableCell client={client} field="information" value={client.information} />
                      </td>
                      <td className="py-3 px-3 border-r border-gray-600">
                        <EditableCell client={client} field="fonction" value={client.fonction} />
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEdit(client)}
                            className="h-7 w-7 text-blue-400 hover:text-blue-300"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteMutation.mutate(client.id)}
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
  );

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
                Clients CRM
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
            Nouveau client
          </Button>
        </div>

        <Tabs defaultValue="en_cours" className="w-full">
          <TabsList className="w-full flex justify-start gap-4 bg-transparent border-b border-gray-800 mb-8 rounded-none px-0 h-auto pb-0">
            <TabsTrigger 
              value="en_cours" 
              className="relative bg-transparent border-0 text-gray-400 hover:text-white data-[state=active]:bg-transparent data-[state=active]:text-white data-[state=active]:shadow-none transition-all duration-300 pb-3 after:content-[''] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-[#2A9D8F] after:scale-x-0 data-[state=active]:after:scale-x-100 after:transition-transform after:duration-300 after:origin-center"
            >
              Clients en cours ({clientsEnCours.length})
            </TabsTrigger>
            <TabsTrigger 
              value="signe" 
              className="relative bg-transparent border-0 text-gray-400 hover:text-white data-[state=active]:bg-transparent data-[state=active]:text-white data-[state=active]:shadow-none transition-all duration-300 pb-3 after:content-[''] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-[#2A9D8F] after:scale-x-0 data-[state=active]:after:scale-x-100 after:transition-transform after:duration-300 after:origin-center"
            >
              Clients signés ({clientsSignes.length})
            </TabsTrigger>
            <TabsTrigger 
              value="stand_by" 
              className="relative bg-transparent border-0 text-gray-400 hover:text-white data-[state=active]:bg-transparent data-[state=active]:text-white data-[state=active]:shadow-none transition-all duration-300 pb-3 after:content-[''] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-[#2A9D8F] after:scale-x-0 data-[state=active]:after:scale-x-100 after:transition-transform after:duration-300 after:origin-center"
            >
              Clients en stand-by ({clientsStandBy.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="en_cours">
            {renderTableau(clientsEnCours, "Clients en cours")}
          </TabsContent>

          <TabsContent value="signe">
            {renderTableau(clientsSignes, "Clients signés")}
          </TabsContent>

          <TabsContent value="stand_by">
            {renderTableau(clientsStandBy, "Clients en stand-by")}
          </TabsContent>
        </Tabs>
      </div>

      {/* Dialog création/édition */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-black border-gray-700 max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white">
              {editingClient ? "Modifier le client" : "Nouveau client"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Infos de base */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-gray-400">Nom complet *</Label>
                <Input
                  value={formData.nom}
                  onChange={(e) => setFormData({...formData, nom: e.target.value})}
                  className="bg-gray-900 border-gray-700 text-white"
                />
              </div>
              <div>
                <Label className="text-gray-400">Personnes</Label>
                <Input
                  value={formData.personnes}
                  onChange={(e) => setFormData({...formData, personnes: e.target.value})}
                  className="bg-gray-900 border-gray-700 text-white"
                  placeholder="Ex: Paul De Zulueta"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-gray-400">Entreprise</Label>
                <Input
                  value={formData.entreprise}
                  onChange={(e) => setFormData({...formData, entreprise: e.target.value})}
                  className="bg-gray-900 border-gray-700 text-white"
                />
              </div>
              <div>
                <Label className="text-gray-400">Fonction</Label>
                <Input
                  value={formData.fonction}
                  onChange={(e) => setFormData({...formData, fonction: e.target.value})}
                  className="bg-gray-900 border-gray-700 text-white"
                  placeholder="Ex: Pilote de ligne"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-gray-400">Email</Label>
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

            {/* Statuts */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label className="text-gray-400">Catégorie *</Label>
                <Select value={formData.categorie} onValueChange={(val) => setFormData({...formData, categorie: val})}>
                  <SelectTrigger className="bg-gray-900 border-gray-700 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-900 border-gray-700">
                    <SelectItem value="en_cours" className="text-white">En cours</SelectItem>
                    <SelectItem value="signe" className="text-white">Signé</SelectItem>
                    <SelectItem value="stand_by" className="text-white">Stand-by</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-gray-400">Statut client</Label>
                <Select value={formData.statut_client} onValueChange={(val) => setFormData({...formData, statut_client: val})}>
                  <SelectTrigger className="bg-gray-900 border-gray-700 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-900 border-gray-700">
                    {Object.entries(statutLabels).map(([key, label]) => (
                      <SelectItem key={key} value={key} className="text-white">{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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

            {/* Patrimoine et finances */}
            <div className="grid grid-cols-4 gap-4">
              <div>
                <Label className="text-gray-400">Patrimoine</Label>
                <Input
                  value={formData.patrimoine}
                  onChange={(e) => setFormData({...formData, patrimoine: e.target.value})}
                  className="bg-gray-900 border-gray-700 text-white"
                  placeholder="Ex: RAS, 1 RP + 2 LMNP..."
                />
              </div>
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

            {/* Localisation et source */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label className="text-gray-400">Localisation</Label>
                <Input
                  value={formData.localisation}
                  onChange={(e) => setFormData({...formData, localisation: e.target.value})}
                  className="bg-gray-900 border-gray-700 text-white"
                  placeholder="Ex: Paris, France"
                />
              </div>
              <div>
                <Label className="text-gray-400">Formation LCDI</Label>
                <Input
                  value={formData.formation_lcdi}
                  onChange={(e) => setFormData({...formData, formation_lcdi: e.target.value})}
                  className="bg-gray-900 border-gray-700 text-white"
                  placeholder="Non, Oui..."
                />
              </div>
              <div>
                <Label className="text-gray-400">Source</Label>
                <Input
                  value={formData.source}
                  onChange={(e) => setFormData({...formData, source: e.target.value})}
                  className="bg-gray-900 border-gray-700 text-white"
                  placeholder="MAIL, LINKEDIN, MDI..."
                />
              </div>
            </div>

            {/* Remarque */}
            <div>
              <Label className="text-gray-400">Remarque</Label>
              <Textarea
                value={formData.remarque}
                onChange={(e) => setFormData({...formData, remarque: e.target.value})}
                className="bg-gray-900 border-gray-700 text-white"
                rows={2}
                placeholder="Informations importantes sur le client..."
              />
            </div>

            {/* Notes internes */}
            <div>
              <Label className="text-gray-400">Notes internes</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData({...formData, notes: e.target.value})}
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
              {editingClient ? "Modifier" : "Créer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}