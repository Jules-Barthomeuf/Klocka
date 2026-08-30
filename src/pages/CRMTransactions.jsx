import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, ArrowLeft, Edit, Trash2, TrendingUp } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GlowingEffect } from "@/components/ui/glowing-effect";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import MobileRecordCard from "@/components/crm/MobileRecordCard";

const statutColors = {
  compromis: "bg-orange-500 text-[#f2f3f5]",
  financement_obtenu: "bg-[#96c0b8] text-[#f2f3f5]",
  offre_acceptee: "bg-blue-500 text-[#f2f3f5]"
};

const statutLabels = {
  compromis: "Compromis",
  financement_obtenu: "Financement obtenu",
  offre_acceptee: "Offre acceptée"
};

export default function CRMTransactions() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [formData, setFormData] = useState({
    name: "",
    subitems: "",
    personne: "",
    client: "",
    entreprise: "",
    proprietes: "",
    prix_affiche: "",
    prix_negocie: "",
    agent_immobilier: "",
    statut: "offre_acceptee",
    honoraires: "",
    categorie: "en_cours"
  });

  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ['crm-transactions'],
    queryFn: () => base44.entities.Transaction.list("-created_date"),
    initialData: []
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Transaction.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm-transactions'] });
      setDialogOpen(false);
      resetForm();
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Transaction.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm-transactions'] });
      setDialogOpen(false);
      resetForm();
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Transaction.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm-transactions'] });
    }
  });

  const resetForm = () => {
    setEditingTransaction(null);
    setFormData({
      name: "",
      subitems: "",
      personne: "",
      client: "",
      entreprise: "",
      proprietes: "",
      prix_affiche: "",
      prix_negocie: "",
      agent_immobilier: "",
      statut: "offre_acceptee",
      honoraires: "",
      categorie: "en_cours"
    });
  };

  const handleEdit = (transaction) => {
    setEditingTransaction(transaction);
    setFormData({
      name: transaction.name || "",
      subitems: transaction.subitems || "",
      personne: transaction.personne || "",
      client: transaction.client || "",
      entreprise: transaction.entreprise || "",
      proprietes: transaction.proprietes || "",
      prix_affiche: transaction.prix_affiche?.toString() || "",
      prix_negocie: transaction.prix_negocie?.toString() || "",
      agent_immobilier: transaction.agent_immobilier || "",
      statut: transaction.statut || "offre_acceptee",
      honoraires: transaction.honoraires?.toString() || "",
      categorie: transaction.categorie || "en_cours"
    });
    setDialogOpen(true);
  };

  const handleCellEdit = (transactionId, field, value) => {
    const transaction = transactions.find(t => t.id === transactionId);
    if (!transaction) return;

    const updateData = { [field]: value };
    
    if (['prix_affiche', 'prix_negocie', 'honoraires'].includes(field)) {
      updateData[field] = value ? parseFloat(value) : null;
    }

    updateMutation.mutate({ id: transactionId, data: updateData });
  };

  const handleSubmit = () => {
    const data = { ...formData };
    if (data.prix_affiche) data.prix_affiche = parseFloat(data.prix_affiche);
    if (data.prix_negocie) data.prix_negocie = parseFloat(data.prix_negocie);
    if (data.honoraires) data.honoraires = parseFloat(data.honoraires);

    if (editingTransaction) {
      updateMutation.mutate({ id: editingTransaction.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const transactionsEnCours = transactions.filter(t => t.categorie === "en_cours");
  const transactionsFinalisees = transactions.filter(t => t.categorie === "finalisee");
  const transactionsAvortees = transactions.filter(t => t.categorie === "avortee");
  
  const totalHonoraires = transactions.reduce((sum, t) => sum + (t.honoraires || 0), 0);

  const formatCurrency = (value) => {
    if (!value) return "-";
    return new Intl.NumberFormat('fr-FR', { 
      style: 'currency', 
      currency: 'EUR',
      maximumFractionDigits: 0 
    }).format(value);
  };

  const EditableCell = ({ transaction, field, value, type = "text" }) => {
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
        handleCellEdit(transaction.id, field, tempValue);
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
        {type === "number" && value ? formatCurrency(value) : (value || "-")}
      </div>
    );
  };

  const EditableSelectCell = ({ transaction, field, value, options }) => {
    return (
      <div className="h-[32px] flex items-center">
        <Select
          value={value || ""}
          onValueChange={(newValue) => handleCellEdit(transaction.id, field, newValue)}
        >
          <SelectTrigger className="bg-transparent border-none text-[#f2f3f5] h-8 hover:bg-[#22262d]/50">
            <SelectValue>
              {value ? (
                <Badge className={`${statutColors[value]} text-xs`}>
                  {statutLabels[value]}
                </Badge>
              ) : "-"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="bg-[#000000] border-[#22262d]">
            {options.map(opt => (
              <SelectItem key={opt.value} value={opt.value} className="text-[#f2f3f5]">
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  };

  const renderTableau = (transactionsList, titre) => (
    <div className="relative rounded-[1.25rem] border-[0.75px] border-[#22262d] p-2">
      <GlowingEffect spread={40} glow={true} disabled={false} proximity={64} inactiveZone={0.01} borderWidth={3} />
      <Card className="relative bg-gradient-to-br from-[#0f1114]/80 to-[#22262d]/80 border-none">
        <CardContent className="p-6">
          {transactionsList.length === 0 ? (
            <div className="text-center py-12 text-[#9298a6]">
              <TrendingUp className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Aucune transaction dans cette catégorie</p>
            </div>
          ) : (
            <>
            {/* Mobile: cartes empilées */}
            <div className="md:hidden space-y-3">
              {transactionsList.map((transaction) => (
                <MobileRecordCard
                  key={transaction.id}
                  title={transaction.name}
                  onEdit={() => handleEdit(transaction)}
                  onDelete={() => deleteMutation.mutate(transaction.id)}
                  fields={[
                    { label: "Personne", value: transaction.personne },
                    { label: "Client", value: transaction.client },
                    { label: "Propriétés", value: transaction.proprietes },
                    { label: "Prix affiché", value: formatCurrency(transaction.prix_affiche) },
                    { label: "Prix négocié", value: formatCurrency(transaction.prix_negocie) },
                    { label: "Agent", value: transaction.agent_immobilier },
                    { label: "Statut", value: transaction.statut ? <Badge className={`${statutColors[transaction.statut]} text-xs`}>{statutLabels[transaction.statut]}</Badge> : "-" },
                    { label: "Honoraires", value: formatCurrency(transaction.honoraires) },
                  ]}
                />
              ))}
            </div>
            {/* Desktop: tableau */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#22262d]">
                    <th className="text-left py-3 px-3 text-[#c9cdd6] font-semibold whitespace-nowrap border-r border-[#22262d] min-w-[250px]">Name</th>
                    <th className="text-left py-3 px-3 text-[#c9cdd6] font-semibold whitespace-nowrap border-r border-[#22262d]">Subitems</th>
                    <th className="text-left py-3 px-3 text-[#c9cdd6] font-semibold whitespace-nowrap border-r border-[#22262d] min-w-[200px]">Personne</th>
                    <th className="text-left py-3 px-3 text-[#c9cdd6] font-semibold whitespace-nowrap border-r border-[#22262d] min-w-[200px]">Client</th>
                    <th className="text-left py-3 px-3 text-[#c9cdd6] font-semibold whitespace-nowrap border-r border-[#22262d]">Entreprise</th>
                    <th className="text-left py-3 px-3 text-[#c9cdd6] font-semibold whitespace-nowrap border-r border-[#22262d] min-w-[350px]">Propriétés</th>
                    <th className="text-left py-3 px-3 text-[#c9cdd6] font-semibold whitespace-nowrap border-r border-[#22262d]">Prix affiché</th>
                    <th className="text-left py-3 px-3 text-[#c9cdd6] font-semibold whitespace-nowrap border-r border-[#22262d]">Prix négocié</th>
                    <th className="text-left py-3 px-3 text-[#c9cdd6] font-semibold whitespace-nowrap border-r border-[#22262d]">Agent Immobilier</th>
                    <th className="text-left py-3 px-3 text-[#c9cdd6] font-semibold whitespace-nowrap border-r border-[#22262d]">Statut</th>
                    <th className="text-left py-3 px-3 text-[#c9cdd6] font-semibold whitespace-nowrap border-r border-[#22262d]">Honoraires</th>
                    <th className="text-left py-3 px-3 text-[#c9cdd6] font-semibold whitespace-nowrap">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {transactionsList.map((transaction) => (
                    <tr key={transaction.id} className="border-b border-[#22262d] hover:bg-[#22262d]/30 transition-colors">
                      <td className="py-3 px-3 border-r border-[#22262d] min-w-[250px]">
                        <EditableCell transaction={transaction} field="name" value={transaction.name} />
                      </td>
                      <td className="py-3 px-3 border-r border-[#22262d]">
                        <EditableCell transaction={transaction} field="subitems" value={transaction.subitems} />
                      </td>
                      <td className="py-3 px-3 border-r border-[#22262d] min-w-[200px]">
                        <EditableCell transaction={transaction} field="personne" value={transaction.personne} />
                      </td>
                      <td className="py-3 px-3 border-r border-[#22262d] min-w-[200px]">
                        <EditableCell transaction={transaction} field="client" value={transaction.client} />
                      </td>
                      <td className="py-3 px-3 border-r border-[#22262d]">
                        <EditableCell transaction={transaction} field="entreprise" value={transaction.entreprise} />
                      </td>
                      <td className="py-3 px-3 border-r border-[#22262d] min-w-[350px]">
                        <EditableCell transaction={transaction} field="proprietes" value={transaction.proprietes} />
                      </td>
                      <td className="py-3 px-3 border-r border-[#22262d]">
                        <EditableCell transaction={transaction} field="prix_affiche" value={transaction.prix_affiche} type="number" />
                      </td>
                      <td className="py-3 px-3 border-r border-[#22262d]">
                        <EditableCell transaction={transaction} field="prix_negocie" value={transaction.prix_negocie} type="number" />
                      </td>
                      <td className="py-3 px-3 border-r border-[#22262d]">
                        <EditableCell transaction={transaction} field="agent_immobilier" value={transaction.agent_immobilier} />
                      </td>
                      <td className="py-3 px-3 border-r border-[#22262d]">
                        <EditableSelectCell 
                          transaction={transaction} 
                          field="statut" 
                          value={transaction.statut}
                          options={[
                            { value: "compromis", label: "Compromis" },
                            { value: "financement_obtenu", label: "Financement obtenu" },
                            { value: "offre_acceptee", label: "Offre acceptée" }
                          ]}
                        />
                      </td>
                      <td className="py-3 px-3 border-r border-[#22262d]">
                        <EditableCell transaction={transaction} field="honoraires" value={transaction.honoraires} type="number" />
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEdit(transaction)}
                            className="h-7 w-7 text-blue-400 hover:text-blue-300"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteMutation.mutate(transaction.id)}
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
                Transactions CRM
              </h1>
              <div className="h-0.5 w-32 bg-[#96c0b8]"></div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Badge className="bg-[#96c0b8] text-[#f2f3f5] text-lg px-4 py-2">
              Total honoraires: {new Intl.NumberFormat('fr-FR', { 
                style: 'currency', 
                currency: 'EUR',
                maximumFractionDigits: 0 
              }).format(totalHonoraires)}
            </Badge>
            <Button
              onClick={() => {
                resetForm();
                setDialogOpen(true);
              }}
              className="bg-[#96c0b8] hover:bg-[#96c0b8]/90"
            >
              <Plus className="w-4 h-4 mr-2" />
              Nouvelle transaction
            </Button>
          </div>
        </div>

        <Tabs defaultValue="en_cours" className="w-full">
          <TabsList className="w-full flex justify-start gap-4 bg-transparent border-b border-[#0f1114] mb-8 rounded-none px-0 h-auto pb-0">
            <TabsTrigger 
              value="en_cours" 
              className="relative bg-transparent border-0 text-[#9298a6] hover:text-[#f2f3f5] data-[state=active]:bg-transparent data-[state=active]:text-[#f2f3f5] data-[state=active]:shadow-none transition-all duration-300 pb-3 after:content-[''] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-[#96c0b8] after:scale-x-0 data-[state=active]:after:scale-x-100 after:transition-transform after:duration-300 after:origin-center"
            >
              Transactions en cours ({transactionsEnCours.length})
            </TabsTrigger>
            <TabsTrigger 
              value="finalisee" 
              className="relative bg-transparent border-0 text-[#9298a6] hover:text-[#f2f3f5] data-[state=active]:bg-transparent data-[state=active]:text-[#f2f3f5] data-[state=active]:shadow-none transition-all duration-300 pb-3 after:content-[''] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-[#96c0b8] after:scale-x-0 data-[state=active]:after:scale-x-100 after:transition-transform after:duration-300 after:origin-center"
            >
              Transactions finalisées ({transactionsFinalisees.length})
            </TabsTrigger>
            <TabsTrigger 
              value="avortee" 
              className="relative bg-transparent border-0 text-[#9298a6] hover:text-[#f2f3f5] data-[state=active]:bg-transparent data-[state=active]:text-[#f2f3f5] data-[state=active]:shadow-none transition-all duration-300 pb-3 after:content-[''] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-[#96c0b8] after:scale-x-0 data-[state=active]:after:scale-x-100 after:transition-transform after:duration-300 after:origin-center"
            >
              Transactions avortées ({transactionsAvortees.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="en_cours">
            {renderTableau(transactionsEnCours, "Transactions en cours")}
          </TabsContent>

          <TabsContent value="finalisee">
            {renderTableau(transactionsFinalisees, "Transactions finalisées")}
          </TabsContent>

          <TabsContent value="avortee">
            {renderTableau(transactionsAvortees, "Transactions avortées")}
          </TabsContent>
        </Tabs>
      </div>

      {/* Dialog création/édition */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-[#000000] border-[#22262d] max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-[#f2f3f5]">
              {editingTransaction ? "Modifier la transaction" : "Nouvelle transaction"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label className="text-[#9298a6]">Name *</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
                className="bg-[#000000] border-[#22262d] text-[#f2f3f5]"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-[#9298a6]">Subitems</Label>
                <Input
                  value={formData.subitems}
                  onChange={(e) => setFormData({...formData, subitems: e.target.value})}
                  className="bg-[#000000] border-[#22262d] text-[#f2f3f5]"
                />
              </div>
              <div>
                <Label className="text-[#9298a6]">Personne</Label>
                <Input
                  value={formData.personne}
                  onChange={(e) => setFormData({...formData, personne: e.target.value})}
                  className="bg-[#000000] border-[#22262d] text-[#f2f3f5]"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-[#9298a6]">Client</Label>
                <Input
                  value={formData.client}
                  onChange={(e) => setFormData({...formData, client: e.target.value})}
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
              <Input
                value={formData.proprietes}
                onChange={(e) => setFormData({...formData, proprietes: e.target.value})}
                className="bg-[#000000] border-[#22262d] text-[#f2f3f5]"
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label className="text-[#9298a6]">Prix affiché (€)</Label>
                <Input
                  type="number"
                  value={formData.prix_affiche}
                  onChange={(e) => setFormData({...formData, prix_affiche: e.target.value})}
                  className="bg-[#000000] border-[#22262d] text-[#f2f3f5]"
                />
              </div>
              <div>
                <Label className="text-[#9298a6]">Prix négocié (€)</Label>
                <Input
                  type="number"
                  value={formData.prix_negocie}
                  onChange={(e) => setFormData({...formData, prix_negocie: e.target.value})}
                  className="bg-[#000000] border-[#22262d] text-[#f2f3f5]"
                />
              </div>
              <div>
                <Label className="text-[#9298a6]">Honoraires (€)</Label>
                <Input
                  type="number"
                  value={formData.honoraires}
                  onChange={(e) => setFormData({...formData, honoraires: e.target.value})}
                  className="bg-[#000000] border-[#22262d] text-[#f2f3f5]"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label className="text-[#9298a6]">Agent Immobilier</Label>
                <Input
                  value={formData.agent_immobilier}
                  onChange={(e) => setFormData({...formData, agent_immobilier: e.target.value})}
                  className="bg-[#000000] border-[#22262d] text-[#f2f3f5]"
                />
              </div>
              <div>
                <Label className="text-[#9298a6]">Statut</Label>
                <Select value={formData.statut} onValueChange={(val) => setFormData({...formData, statut: val})}>
                  <SelectTrigger className="bg-[#000000] border-[#22262d] text-[#f2f3f5]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#000000] border-[#22262d]">
                    {Object.entries(statutLabels).map(([key, label]) => (
                      <SelectItem key={key} value={key} className="text-[#f2f3f5]">{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[#9298a6]">Catégorie *</Label>
                <Select value={formData.categorie} onValueChange={(val) => setFormData({...formData, categorie: val})}>
                  <SelectTrigger className="bg-[#000000] border-[#22262d] text-[#f2f3f5]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#000000] border-[#22262d]">
                    <SelectItem value="en_cours" className="text-[#f2f3f5]">En cours</SelectItem>
                    <SelectItem value="finalisee" className="text-[#f2f3f5]">Finalisée</SelectItem>
                    <SelectItem value="avortee" className="text-[#f2f3f5]">Avortée</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="border-[#22262d]">
              Annuler
            </Button>
            <Button onClick={handleSubmit} className="bg-[#96c0b8] hover:bg-[#96c0b8]/90">
              {editingTransaction ? "Modifier" : "Créer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}