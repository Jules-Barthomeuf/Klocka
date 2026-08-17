import React, { useState, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  FileText, Upload, Trash2, Brain, CheckCircle2,
  XCircle, Clock, AlertTriangle, Loader2, Download, Image, Plus, Search } from
"lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const categorieLabels = {
  secteur: "Secteur",
  locataire: "Locataire",
  copropriete: "Copropriété",
  marche: "Marché",
  diagnostique: "Diagnostique",
  images: "Images",
  autre: "Autre"
};

const categorieIcons = {
  secteur: FileText,
  locataire: FileText,
  copropriete: FileText,
  marche: FileText,
  diagnostique: FileText,
  images: Image,
  autre: FileText
};

const statutConfig = {
  en_attente: { label: "En attente", color: "bg-white/10 text-[#c4d5d1]", icon: Clock },
  en_cours: { label: "En cours", color: "bg-blue-500/20 text-blue-400", icon: Loader2 },
  verifie: { label: "Vérifié", color: "bg-[#33d6c0]/20 text-[#5ee7d4]", icon: CheckCircle2 },
  non_verifie: { label: "Non vérifié", color: "bg-red-500/20 text-red-400", icon: XCircle }
};

function DocumentCard({ doc, analyzing, onAnalyze, onDelete, onSelect }) {
  const statut = statutConfig[doc.statut] || statutConfig.en_attente;
  const StatusIcon = statut.icon;
  const isAnalyzing = analyzing === doc.id;

  return (
    <div
      className="bg-[#0a0f0e] rounded-md border border-[#16201f] p-4 hover:border-[#33d6c0]/30 transition-all cursor-pointer group"
      onClick={() => onSelect(doc)}>
      
      {doc.categorie === "images" && doc.url_fichier ?
      <div className="mb-3 h-32 rounded-md overflow-hidden border border-[#16201f]">
          <img src={doc.url_fichier} alt={doc.nom_fichier} className="w-full h-full object-cover" />
        </div> :

      <div className="w-10 h-10 bg-white/[0.04] border border-[#16201f] rounded-md flex items-center justify-center mb-3">
          <FileText className="w-5 h-5 text-[#33d6c0]" />
        </div>
      }

      <h3 className="text-white font-montserrat text-sm mb-2 truncate">{doc.nom_fichier}</h3>

      <div className="flex items-center gap-2 flex-wrap mb-3">
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${statut.color}`}>
          <StatusIcon className={`w-3 h-3 ${isAnalyzing ? 'animate-spin' : ''}`} />
          {statut.label}
        </span>
        {doc.points_attention?.length > 0 &&
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/15 text-amber-400">
            <AlertTriangle className="w-3 h-3" />
            {doc.points_attention.length}
          </span>
        }
      </div>

      <div className="flex items-center gap-2 pt-2 border-t border-[#16201f]">
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {e.stopPropagation();if (doc.categorie !== "images") onAnalyze(doc);}}
          disabled={isAnalyzing || doc.categorie === "images"}
          className="flex-1 text-[#33d6c0] hover:bg-[#33d6c0]/10 h-8 text-xs">
          
          <Brain className="w-3.5 h-3.5 mr-1" />
          {isAnalyzing ? "Analyse..." : "Analyser"}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={(e) => {e.stopPropagation();onDelete(doc.id);}}
          className="text-white/30 hover:text-red-400 hover:bg-red-500/10 h-8 w-8">
          
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>);

}

export default function AdminAnalyse() {
  const queryClient = useQueryClient();
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [activeTab, setActiveTab] = useState("secteur");
  const [showTextDialog, setShowTextDialog] = useState(false);
  const [newTextDoc, setNewTextDoc] = useState({ nom: "", contenu: "", categorie: "autre" });
  const [searchQuery, setSearchQuery] = useState("");
  const [clientSearch, setClientSearch] = useState("");

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => base44.entities.Project.list("-created_date"),
    initialData: []
  });

  const { data: documents = [] } = useQuery({
    queryKey: ['documents-analyse', selectedProjectId],
    queryFn: () => selectedProjectId ?
    base44.entities.DocumentAnalyse.filter({ projet_id: selectedProjectId }, "-created_date") :
    Promise.resolve([]),
    enabled: !!selectedProjectId,
    initialData: []
  });

  const createDocMutation = useMutation({
    mutationFn: (data) => base44.entities.DocumentAnalyse.create(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['documents-analyse'] })
  });

  const updateDocMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.DocumentAnalyse.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['documents-analyse'] })
  });

  const deleteDocMutation = useMutation({
    mutationFn: (docId) => base44.entities.DocumentAnalyse.delete(docId),
    onSuccess: (_, docId) => {
      queryClient.invalidateQueries({ queryKey: ['documents-analyse'] });
      if (selectedDoc?.id === docId) setSelectedDoc(null);
    }
  });

  const handleFileUpload = async (files) => {
    if (!selectedProjectId) {alert("Veuillez sélectionner un projet d'abord");return;}
    setUploading(true);
    try {
      for (const file of files) {
        const isImage = file.type.startsWith('image/');
        const { file_url } = await base44.integrations.Core.UploadFile({ file });
        let texteExtrait = "";
        if (!isImage) {
          try {
            const extractionResult = await base44.integrations.Core.InvokeLLM({
              prompt: "Extrais tout le texte de ce document. Retourne uniquement le texte brut, sans ajout de commentaires ou de formatage. Si c'est un document structuré (tableau, formulaire), préserve la structure autant que possible.",
              file_urls: [file_url]
            });
            texteExtrait = typeof extractionResult === 'string' ? extractionResult : extractionResult?.texte || "";
          } catch (error) {
            console.error("Erreur lors de l'extraction du texte:", error?.message || error);
          }
        }
        await createDocMutation.mutateAsync({
          nom_fichier: file.name,
          url_fichier: file_url,
          projet_id: selectedProjectId,
          categorie: isImage ? "images" : "autre",
          type_document: "autre",
          statut: "en_attente",
          notes_ia: texteExtrait ? `## Texte extrait\n\n${texteExtrait}` : undefined
        });
      }
    } catch (error) {
      console.error("Erreur lors de l'upload:", error?.message || error);
      alert("Une erreur est survenue lors de l'upload des fichiers");
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) handleFileUpload(files);
  }, [selectedProjectId]);

  const analyzeDocument = async (doc) => {
    setAnalyzing(doc.id);
    try {
      await updateDocMutation.mutateAsync({ id: doc.id, data: { statut: "en_cours" } });
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `Analyse ce document immobilier et catégorise-le précisément.\n\nNom du fichier: ${doc.nom_fichier}\n\nInstructions:\n1. Détermine la catégorie principale du document parmi: secteur, locataire, copropriete, marche, diagnostique, autre\n2. Extrais TOUTES les informations pertinentes du document\n3. Identifie les points d'attention (risques, clauses importantes, dates clés)\n4. Fournis un résumé détaillé et structuré\n\nPour chaque catégorie, extrais les données suivantes:\n- secteur: informations sur la ville, le quartier, l'emplacement, accessibilité\n- locataire: nom, activité, dates de bail, loyers, analyse du bail\n- copropriete: charges, quote-part, règlement, résolutions, assemblées générales\n- marche: prix au m², évolutions, offres actuelles, baux existants\n- diagnostique: DPE, GES, amiante, plomb, termites, accessibilité\n\nRetourne une analyse complète et professionnelle.`,
        file_urls: [doc.url_fichier],
        response_json_schema: {
          type: "object",
          properties: {
            categorie: { type: "string", enum: ["secteur", "locataire", "copropriete", "marche", "diagnostique", "autre"] },
            resume: { type: "string" },
            informations_cles: { type: "array", items: { type: "string" } },
            points_attention: { type: "array", items: { type: "object", properties: { titre: { type: "string" }, description: { type: "string" }, niveau: { type: "string", enum: ["info", "warning", "critical"] } } } }
          }
        }
      });
      const notesIA = `## Résumé\n${result?.resume || ''}\n\n## Informations clés\n${(result?.informations_cles || []).map((i) => `• ${i}`).join('\n') || 'Aucune'}`;
      await updateDocMutation.mutateAsync({
        id: doc.id,
        data: { statut: "verifie", notes_ia: notesIA, points_attention: result?.points_attention || [], categorie: result?.categorie || "autre" }
      });
    } catch (error) {
      console.error("Erreur lors de l'analyse:", error?.message || error);
      await updateDocMutation.mutateAsync({ id: doc.id, data: { statut: "non_verifie" } });
    } finally {
      setAnalyzing(null);
    }
  };

  const handleDragOver = useCallback((e) => {e.preventDefault();setDragOver(true);}, []);
  const handleDragLeave = useCallback((e) => {e.preventDefault();setDragOver(false);}, []);

  const createTextDocument = async () => {
    if (!selectedProjectId || !newTextDoc.nom || !newTextDoc.contenu) {alert("Veuillez remplir tous les champs");return;}
    await createDocMutation.mutateAsync({
      nom_fichier: newTextDoc.nom,
      projet_id: selectedProjectId,
      categorie: newTextDoc.categorie,
      type_document: "autre",
      statut: "verifie",
      notes_ia: `## Texte\n\n${newTextDoc.contenu}`
    });
    setShowTextDialog(false);
    setNewTextDoc({ nom: "", contenu: "", categorie: "autre" });
  };

  const documentsByCategory = {
    secteur: documents.filter((d) => d.categorie === "secteur"),
    locataire: documents.filter((d) => d.categorie === "locataire"),
    copropriete: documents.filter((d) => d.categorie === "copropriete"),
    marche: documents.filter((d) => d.categorie === "marche"),
    diagnostique: documents.filter((d) => d.categorie === "diagnostique"),
    images: documents.filter((d) => d.categorie === "images"),
    autre: documents.filter((d) => !d.categorie || d.categorie === "autre")
  };

  const searchResults = documents.filter((d) => {
    const query = searchQuery.toLowerCase();
    return (
      d.nom_fichier?.toLowerCase().includes(query) ||
      d.notes_ia?.toLowerCase().includes(query) ||
      d.notes_manuelles?.toLowerCase().includes(query));

  });

  const filteredProjects = projects.filter((p) => {
    const query = clientSearch.toLowerCase();
    const clientEmail = p.client_email?.toLowerCase() || "";
    const clientEmails = p.client_emails?.map((e) => e.toLowerCase()) || [];
    return (
      clientEmail.includes(query) ||
      clientEmails.some((e) => e.includes(query)) ||
      p.titre?.toLowerCase().includes(query));

  });

  return (
    <div className="bg-[#000000] text-white p-3 min-h-screen md:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6 md:mb-8">
          <h1 className="text-2xl md:text-4xl font-geist tracking-tighter text-white mb-2">Analyse de Documents</h1>
          <div className="h-0.5 w-24 md:w-32 bg-[#33d6c0] mb-2"></div>
          <p className="text-white/40 text-sm">Chargez et analysez les documents de vos projets avec l'IA</p>
        </div>

        {/* Sélection du projet */}
        <Card className="bg-[#0a0f0e] rounded-md border border-[#16201f] overflow-hidden mb-6">
          <CardContent className="p-4 md:p-5">
            <label className="text-white/50 text-xs uppercase tracking-widest block mb-3">Projet</label>
            <div className="space-y-2">
              <Input
                placeholder="Rechercher par email ou nom du projet..."
                value={clientSearch}
                onChange={(e) => setClientSearch(e.target.value)}
                className="bg-white/[0.04] border-[#16201f] text-white placeholder:text-white/20 h-9 text-sm focus:border-[#33d6c0]/50 focus:ring-0" />
              
              <Select value={selectedProjectId || ""} onValueChange={setSelectedProjectId}>
                <SelectTrigger className="bg-white/[0.04] text-white border-[#16201f] h-9 text-sm">
                  <SelectValue placeholder="Sélectionnez un projet..." />
                </SelectTrigger>
                <SelectContent className="bg-[#111] border-[#16201f]">
                  {filteredProjects.length === 0 ?
                  <div className="p-2 text-white/30 text-sm">Aucun projet trouvé</div> :

                  filteredProjects.map((project) =>
                  <SelectItem key={project.id} value={project.id}>
                        {project.titre} - {project.client_email?.split('@')[0]}
                      </SelectItem>
                  )
                  }
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {!selectedProjectId ?
        <div className="text-center py-20">
            <div className="w-16 h-16 bg-white/[0.04] border border-[#16201f] rounded-md flex items-center justify-center mx-auto mb-4">
              <FileText className="w-8 h-8 text-white/20" />
            </div>
            <h2 className="text-lg text-white/60 mb-1 font-montserrat">Sélectionnez un projet</h2>
            <p className="text-white/30 text-sm">Choisissez un projet pour commencer à analyser ses documents</p>
          </div> :

        <>
            {/* Dropzone */}
            <div
            className={`rounded-md border-2 border-dashed p-8 text-center mb-6 transition-all duration-300 ${
            dragOver ? 'border-[#33d6c0] bg-[#33d6c0]/5' : 'border-[#1c2725] hover:border-white/[0.15]'}`
            }
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}>
            
              {uploading ?
            <div className="flex flex-col items-center gap-3">
                  <Loader2 className="w-10 h-10 text-[#33d6c0] animate-spin" />
                  <p className="text-white/60 text-sm">Upload et extraction en cours...</p>
                </div> :

            <>
                  <div className="w-12 h-12 bg-white/[0.04] border border-[#16201f] rounded-md flex items-center justify-center mx-auto mb-3">
                    <Upload className="w-6 h-6 text-white/30" />
                  </div>
                  <p className="text-white/60 text-sm mb-1">Glissez-déposez vos documents ici</p>
                  <p className="text-white/20 text-xs mb-4">L'IA analysera et catégorisera automatiquement</p>
                  <div className="flex gap-2 justify-center">
                    <div className="relative inline-block">
                      <input
                    type="file"
                    multiple
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                    onChange={(e) => {
                      if (e.target.files && e.target.files.length > 0) handleFileUpload(Array.from(e.target.files));
                    }}
                    accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" />
                  
                      <Button className="bg-[#33d6c0] hover:bg-[#33d6c0]/80 text-white pointer-events-none h-8 text-xs px-4">
                        <Upload className="w-3.5 h-3.5 mr-1.5" />
                        Sélectionner des fichiers
                      </Button>
                    </div>
                    <Button
                  onClick={() => setShowTextDialog(true)}
                  className="bg-white/[0.06] hover:bg-white/[0.1] text-white border border-[#16201f] h-8 text-xs px-4">
                  
                      <Plus className="w-3.5 h-3.5 mr-1.5" />
                      Ajouter du texte
                    </Button>
                  </div>
                </>
            }
            </div>

            {/* Stats bar */}
            <div className="grid grid-cols-4 md:grid-cols-8 gap-2 mb-6">
              {Object.entries(categorieLabels).map(([key, label]) => {
              const count = documentsByCategory[key]?.length || 0;
              return (
                <button
                  key={key}
                  onClick={() => setActiveTab(key)}
                  className={`rounded-md p-2 text-center transition-all border ${
                  activeTab === key ?
                  'bg-[#33d6c0]/10 border-[#33d6c0]/30 text-[#33d6c0]' :
                  'bg-white/[0.02] border-[#16201f] text-white/40 hover:text-white/60 hover:bg-white/[0.04]'}`
                  }>
                  
                    <p className="text-lg font-montserrat font-semibold">{count}</p>
                    <p className="text-[9px] uppercase tracking-wider">{label}</p>
                  </button>);

            })}
              <button
              onClick={() => setActiveTab("recherche")}
              className={`rounded-md p-2 text-center transition-all border ${
              activeTab === "recherche" ?
              'bg-[#33d6c0]/10 border-[#33d6c0]/30 text-[#33d6c0]' :
              'bg-white/[0.02] border-[#16201f] text-white/40 hover:text-white/60 hover:bg-white/[0.04]'}`
              }>
              
                <Search className="w-4 h-4 mx-auto mb-0.5" />
                <p className="text-[9px] uppercase tracking-wider">Recherche</p>
              </button>
            </div>

            {/* Content */}
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsContent value="recherche" className="mt-0 space-y-4">
                <div className="mb-4">
                  <Input
                  placeholder="Rechercher dans les documents..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-white/[0.04] border-[#16201f] text-white placeholder:text-white/20 h-9 text-sm focus:border-[#33d6c0]/50 focus:ring-0" />
                
                </div>
                {searchResults.length === 0 ?
              <div className="text-center py-16">
                    <Search className="w-10 h-10 text-white/10 mx-auto mb-3" />
                    <p className="text-white/40 text-sm">{searchQuery ? "Aucun résultat" : "Commencez à taper pour rechercher"}</p>
                  </div> :

              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {searchResults.map((doc) =>
                <DocumentCard
                  key={doc.id}
                  doc={doc}
                  analyzing={analyzing}
                  onAnalyze={analyzeDocument}
                  onDelete={(id) => deleteDocMutation.mutate(id)}
                  onSelect={setSelectedDoc} />

                )}
                  </div>
              }
              </TabsContent>

              {Object.entries(categorieLabels).map(([categorie, label]) => {
              const docs = documentsByCategory[categorie] || [];
              const CategoryIcon = categorieIcons[categorie];

              return (
                <TabsContent key={categorie} value={categorie} className="mt-0 space-y-4">
                    {docs.length === 0 ?
                  <div className="text-center py-16">
                        <div className="w-12 h-12 bg-white/[0.04] border border-[#16201f] rounded-md flex items-center justify-center mx-auto mb-3">
                          <CategoryIcon className="w-6 h-6 text-white/15" />
                        </div>
                        <p className="text-white/40 text-sm">Aucun document dans cette catégorie</p>
                        <p className="text-white/20 text-xs mt-1">Importez des documents ci-dessus</p>
                      </div> :

                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {docs.map((doc) =>
                    <DocumentCard
                      key={doc.id}
                      doc={doc}
                      analyzing={analyzing}
                      onAnalyze={analyzeDocument}
                      onDelete={(id) => deleteDocMutation.mutate(id)}
                      onSelect={setSelectedDoc} />

                    )}
                      </div>
                  }
                  </TabsContent>);

            })}
            </Tabs>
          </>
        }
      </div>

      {/* Text Document Dialog */}
      <Dialog open={showTextDialog} onOpenChange={setShowTextDialog}>
        <DialogContent className="bg-[#0a0f0e] border-[#16201f] max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-white font-montserrat">Ajouter du texte</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-white/50 text-xs uppercase tracking-widest mb-2 block">Nom du document</label>
              <Input
                placeholder="Ex: Notes de visite, Informations locataire..."
                value={newTextDoc.nom}
                onChange={(e) => setNewTextDoc({ ...newTextDoc, nom: e.target.value })}
                className="bg-white/[0.04] border-[#16201f] text-white placeholder:text-white/20 h-9 text-sm" />
              
            </div>
            <div>
              <label className="text-white/50 text-xs uppercase tracking-widest mb-2 block">Catégorie</label>
              <Select value={newTextDoc.categorie} onValueChange={(value) => setNewTextDoc({ ...newTextDoc, categorie: value })}>
                <SelectTrigger className="bg-white/[0.04] border-[#16201f] text-white h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#111] border-[#16201f]">
                  {Object.entries(categorieLabels).map(([key, label]) =>
                  <SelectItem key={key} value={key}>{label}</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-white/50 text-xs uppercase tracking-widest mb-2 block">Contenu</label>
              <Textarea
                placeholder="Saisissez votre texte ici..."
                value={newTextDoc.contenu}
                onChange={(e) => setNewTextDoc({ ...newTextDoc, contenu: e.target.value })}
                className="bg-white/[0.04] border-[#16201f] text-white placeholder:text-white/20 min-h-48 text-sm" />
              
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="ghost" onClick={() => setShowTextDialog(false)} className="text-white/40 hover:text-white hover:bg-white/[0.06] h-8 text-xs">
                Annuler
              </Button>
              <Button onClick={createTextDocument} className="bg-[#33d6c0] hover:bg-[#33d6c0]/80 h-8 text-xs px-4">
                Créer
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Document Detail Dialog */}
      <Dialog open={!!selectedDoc} onOpenChange={() => setSelectedDoc(null)}>
        <DialogContent className="bg-[#0a0f0e] border-[#16201f] max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white font-montserrat flex items-center justify-between">
              <span className="truncate mr-4">{selectedDoc?.nom_fichier}</span>
              {selectedDoc?.url_fichier &&
              <a href={selectedDoc.url_fichier} target="_blank" rel="noopener noreferrer">
                  <Button variant="ghost" size="icon" className="text-[#33d6c0] hover:bg-[#33d6c0]/10 h-8 w-8">
                    <Download className="w-4 h-4" />
                  </Button>
                </a>
              }
            </DialogTitle>
          </DialogHeader>
          
          {selectedDoc &&
          <div className="space-y-5">
              {/* Catégorie et statut */}
              <div className="flex gap-2 items-center flex-wrap">
                <Select
                value={selectedDoc.categorie || "autre"}
                onValueChange={(value) => updateDocMutation.mutate({ id: selectedDoc.id, data: { categorie: value } })}>
                
                  <SelectTrigger className="w-44 bg-white/[0.04] border-[#16201f] text-white h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#111] border-[#16201f]">
                    {Object.entries(categorieLabels).map(([key, label]) =>
                  <SelectItem key={key} value={key}>{label}</SelectItem>
                  )}
                  </SelectContent>
                </Select>

                <Select
                value={selectedDoc.statut || "en_attente"}
                onValueChange={(value) => updateDocMutation.mutate({ id: selectedDoc.id, data: { statut: value } })}>
                
                  <SelectTrigger className="w-36 bg-white/[0.04] border-[#16201f] text-white h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#111] border-[#16201f]">
                    {Object.entries(statutConfig).map(([key, config]) =>
                  <SelectItem key={key} value={key}>{config.label}</SelectItem>
                  )}
                  </SelectContent>
                </Select>

                {selectedDoc.categorie !== "images" &&
              <Button
                onClick={() => analyzeDocument(selectedDoc)}
                disabled={analyzing === selectedDoc.id}
                className="bg-[#33d6c0] hover:bg-[#33d6c0]/80 h-8 text-xs px-3">
                
                    <Brain className="w-3.5 h-3.5 mr-1.5" />
                    {analyzing === selectedDoc.id ? "Analyse..." : "Analyser"}
                  </Button>
              }
              </div>

              {/* Aperçu image */}
              {selectedDoc.categorie === "images" &&
            <div className="rounded-md overflow-hidden border border-[#16201f]">
                  <img src={selectedDoc.url_fichier} alt={selectedDoc.nom_fichier} className="w-full h-auto" />
                </div>
            }

              {/* Points d'attention */}
              {selectedDoc.points_attention?.length > 0 &&
            <div>
                  <h4 className="text-white/50 text-xs uppercase tracking-widest mb-3 flex items-center gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                    Points d'attention
                  </h4>
                  <div className="space-y-2">
                    {selectedDoc.points_attention.map((point, idx) => {
                  const niveauStyles = {
                    info: "bg-blue-500/10 border-blue-500/20 text-blue-300",
                    warning: "bg-amber-500/10 border-amber-500/20 text-amber-300",
                    critical: "bg-red-500/10 border-red-500/20 text-red-300"
                  }[point.niveau] || "bg-white/[0.04] border-[#16201f] text-white/60";

                  return (
                    <div key={idx} className={`p-3 rounded-md border ${niveauStyles}`}>
                          <p className="font-medium text-xs mb-0.5">{point.titre}</p>
                          <p className="text-xs opacity-80">{point.description}</p>
                        </div>);

                })}
                  </div>
                </div>
            }

              {/* Analyse IA */}
              {selectedDoc.notes_ia &&
            <div>
                  <h4 className="text-white/50 text-xs uppercase tracking-widest mb-3 flex items-center gap-2">
                    <Brain className="w-3.5 h-3.5 text-[#33d6c0]" />
                    Analyse IA
                  </h4>
                  <div className="p-4 bg-white/[0.02] rounded-md text-white/70 text-sm whitespace-pre-wrap border border-[#16201f] font-montserrat leading-relaxed">
                    {selectedDoc.notes_ia}
                  </div>
                </div>
            }

              {/* Notes manuelles */}
              <div>
                <h4 className="text-white/50 text-xs uppercase tracking-widest mb-3">Notes manuelles</h4>
                <Textarea
                placeholder="Ajoutez vos notes personnelles..."
                value={selectedDoc.notes_manuelles || ""}
                onChange={(e) => updateDocMutation.mutate({ id: selectedDoc.id, data: { notes_manuelles: e.target.value } })}
                className="bg-white/[0.04] border-[#16201f] text-white placeholder:text-white/20 min-h-28 text-sm" />
              
              </div>
            </div>
          }
        </DialogContent>
      </Dialog>
    </div>);

}