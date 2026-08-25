import React, { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCurrentUser } from "@/components/hooks/useCurrentUser";
import ComposerChat from "@/components/mails/ComposerChat";
import { BoutonConnecterGmail, useConnexionGmail } from "@/components/mails/ConnexionGmail";
import {
  AlertTriangle,
  Check,
  Copy,
  Edit,
  Loader2,
  Mail,
  Plus,
  Send,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

const EMPTY_TEMPLATE = { titre: "", description: "", objet: "", contenu: "" };

// Mémorise l'expéditeur par navigateur : sur un serveur partagé, chacun retrouve
// sa propre adresse présélectionnée.
const LAST_SENDER_KEY = "klocka:dernier-expediteur";

export default function Mails() {
  const queryClient = useQueryClient();
  const { data: user } = useCurrentUser();

  // --- Composer ---
  const [from, setFrom] = useState("");
  const [draft, setDraft] = useState(null); // { to, cc, subject, body, template_id, template_titre }
  const [warnings, setWarnings] = useState([]);
  const [recipientLabel, setRecipientLabel] = useState("");

  // --- Templates ---
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_TEMPLATE);
  const [preview, setPreview] = useState(null);
  const [copiedField, setCopiedField] = useState(null);

  const { data: status } = useQuery({
    queryKey: ["mail-status"],
    queryFn: () => base44.functions.invoke("getMailStatus", {}),
  });

  const { data: templates = [], isLoading: templatesLoading } = useQuery({
    queryKey: ["mail-templates"],
    queryFn: () => base44.entities.MailTemplate.list("ordre"),
    initialData: [],
  });

  const { data: history = [] } = useQuery({
    queryKey: ["mail-history"],
    queryFn: () => base44.entities.EmailLog.list("-created_date"),
    initialData: [],
  });

  const accounts = useMemo(() => status?.accounts || [], [status]);
  // Connexion Gmail en fenêtre surgissante : le brouillon en cours reste à l'écran.
  const { connecter: connecterGmail } = useConnexionGmail();
  const selectedAccount = accounts.find((a) => a.id === from) || null;

  // Default to the account matching the logged-in user, else the first one.
  useEffect(() => {
    if (!accounts.length || from) return;
    // Sur une installation partagée, tout le monde est authentifié comme le même
    // admin : le choix mémorisé dans ce navigateur est le seul signal fiable
    // pour retomber sur SA propre adresse.
    const remembered = accounts.find((a) => a.id === localStorage.getItem(LAST_SENDER_KEY));
    const mine = accounts.find((a) => a.id === (user?.email || "").toLowerCase());
    setFrom((remembered || mine || accounts[0]).id);
  }, [accounts, from, user]);

  const selectSender = (id) => {
    setFrom(id);
    localStorage.setItem(LAST_SENDER_KEY, id);
  };

  // --- Mutations ---------------------------------------------------------

  const sendMutation = useMutation({
    mutationFn: (d) =>
      base44.functions.invoke("sendMail", {
        from,
        to: d.to,
        cc: d.cc,
        subject: d.subject,
        body: d.body,
        template_id: d.template_id,
        template_titre: d.template_titre,
      }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["mail-history"] });
      if (res?.success) {
        toast.success("Mail envoyé");
        setDraft(null);
        setWarnings([]);
      } else {
        toast.error(res?.error || "Envoi impossible");
      }
    },
    onError: (e) => toast.error(e?.message || "Erreur lors de l'envoi"),
  });

  const saveTemplate = useMutation({
    mutationFn: ({ id, data }) =>
      id ? base44.entities.MailTemplate.update(id, data) : base44.entities.MailTemplate.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mail-templates"] });
      setDialogOpen(false);
      setEditingId(null);
      setForm(EMPTY_TEMPLATE);
      toast.success("Template enregistré");
    },
    onError: (e) => toast.error(e?.message || "Enregistrement impossible"),
  });

  const disconnectMutation = useMutation({
    mutationFn: (email) => base44.functions.invoke("disconnectMailAccount", { email }),
    onSuccess: () => {
      setFrom("");
      queryClient.invalidateQueries({ queryKey: ["mail-status"] });
      toast.success("Compte déconnecté");
    },
  });

  const deleteTemplate = useMutation({
    mutationFn: (id) => base44.entities.MailTemplate.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mail-templates"] });
      setPreview(null);
      toast.success("Template supprimé");
    },
  });

  // --- Handlers ----------------------------------------------------------

  const handleUseTemplate = (t) => {
    setDraft({
      to: "",
      cc: "",
      subject: t.objet || "",
      body: t.contenu || "",
      template_id: t.id,
      template_titre: t.titre,
    });
    setWarnings(["Template inséré tel quel : complétez le destinataire et les variables."]);
    setRecipientLabel("");
    setPreview(null);
    document.getElementById("mail-composer")?.scrollIntoView({ behavior: "smooth" });
  };

  const handleCopy = async (text, field) => {
    await navigator.clipboard.writeText(text);
    setCopiedField(field);
    toast.success("Copié dans le presse-papier");
    setTimeout(() => setCopiedField(null), 2000);
  };

  const openEditor = (t) => {
    setEditingId(t?.id || null);
    setForm(
      t
        ? { titre: t.titre || "", description: t.description || "", objet: t.objet || "", contenu: t.contenu || "" }
        : EMPTY_TEMPLATE
    );
    setDialogOpen(true);
  };

  const smtpReady = status?.smtp && (!selectedAccount || selectedAccount.verified);

  return (
    <div className="min-h-screen bg-[#000000] p-6 md:p-10">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-[#edeae5] mb-1">Mails</h1>
          <p className="text-[#9aa19e] text-sm">
            Décrivez le mail à envoyer, relisez le brouillon, cliquez sur Envoyer.
          </p>
        </div>

        {/* Aucun compte connecté : on met la connexion Google en avant */}
        {status && accounts.length === 0 && (
          <div className="mb-6 rounded-md border border-[#282b2a] bg-[#0a0c0c] p-6 text-center">
            <div className="w-12 h-12 rounded-md bg-[#edeae5]/[0.05] flex items-center justify-center mx-auto mb-4">
              <Mail className="w-5 h-5 text-[#8b9391]" />
            </div>
            <h2 className="text-[#edeae5] font-medium mb-1.5">Connectez votre adresse pour envoyer</h2>
            <p className="text-[#9aa19e] text-sm mb-5 max-w-md mx-auto">
              {status.google?.gmail_read
                ? "Klocka enverra les mails depuis votre boîte Gmail et pourra relever votre boîte de réception pour préanalyser les fiches reçues."
                : "Klocka enverra les mails depuis votre boîte Gmail. L'autorisation demandée permet uniquement d'envoyer — vos mails reçus restent inaccessibles à l'application."}
            </p>
            {status.google?.enabled ? (
              <BoutonConnecterGmail libelle="Se connecter avec Google" />
            ) : (
              <div className="text-left max-w-md mx-auto rounded-md border border-[#e0c9a0]/25 bg-[#e0c9a0]/10 px-4 py-3 text-sm text-amber-200/90">
                <p className="font-medium mb-1">Connexion Google pas encore configurée</p>
                <p className="text-amber-200/70 text-xs leading-relaxed">
                  Ajoutez <code className="text-amber-100">GOOGLE_CLIENT_ID</code> et{" "}
                  <code className="text-amber-100">GOOGLE_CLIENT_SECRET</code> dans{" "}
                  <code className="text-amber-100">.env</code>, avec l'URI de redirection{" "}
                  <code className="text-amber-100 break-all">{status.google?.redirect_uri}</code>, puis redémarrez.
                  La marche à suivre est dans le README.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Compte sélectionné en erreur */}
        {status && accounts.length > 0 && !smtpReady && (
          <div className="mb-6 flex items-start gap-3 rounded-md border border-[#e0c9a0]/25 bg-[#e0c9a0]/10 px-4 py-3">
            <AlertTriangle className="w-4 h-4 text-[#e0c9a0] flex-shrink-0 mt-0.5" />
            <div className="text-sm text-amber-200/90">
              <span className="font-medium">{selectedAccount?.email} n'est pas utilisable :</span>{" "}
              {selectedAccount?.error}
            </div>
          </div>
        )}

        <Tabs defaultValue="composer" className="w-full">
          <TabsList className="bg-[#0a0c0c] border border-[#282b2a] mb-6">
            <TabsTrigger value="composer">Composer</TabsTrigger>
            <TabsTrigger value="templates">Templates ({templates.length})</TabsTrigger>
            <TabsTrigger value="historique">Historique</TabsTrigger>
          </TabsList>


          {/* ---------------------------------------------------------- */}
          {/* COMPOSER                                                    */}
          {/* ---------------------------------------------------------- */}
          <TabsContent value="composer" className="space-y-6" id="mail-composer">
            <div className="bg-[#0a0c0c] border border-[#282b2a] rounded-md p-5">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-[#edeae5] text-sm font-medium">Envoyer depuis</span>
                {status &&
                  (status.llm ? (
                    <Badge className="bg-[#35a79b]/15 text-[#7fd3c9] border-[#35a79b]/20 text-[10px]">
                      {status.ia?.label || "IA active"}
                    </Badge>
                  ) : (
                    <Badge className="bg-[#edeae5]/5 text-[#9aa19e] border-[#edeae5]/10 text-[10px]">IA non configurée</Badge>
                  ))}
              </div>
              {accounts.length > 0 ? (
                <Select value={from} onValueChange={selectSender}>
                  <SelectTrigger className="bg-[#171918] border-[#282b2a] text-[#edeae5]">
                    <SelectValue placeholder="Choisir une adresse" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0a0c0c] border-[#282b2a] text-[#edeae5]">
                    {accounts.map((a) => (
                      <SelectItem key={a.id} value={a.id} className="focus:bg-[#edeae5]/5 focus:text-[#edeae5]">
                        <span className="flex items-center gap-2">
                          {a.name} <span className="text-[#8b9391]">&lt;{a.email}&gt;</span>
                          {!a.verified && <span className="text-[#e0c9a0] text-[10px]">à reconnecter</span>}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-[#8b9391] text-sm bg-[#171918] border border-[#282b2a] rounded-md px-3 py-2">
                  Aucune adresse connectée
                </p>
              )}
              <div className="flex items-center gap-3 mt-1.5">
                <p className="text-[#6b7270] text-[11px]">
                  La signature du mail reprend le nom de l'adresse choisie.
                </p>
                {status?.google?.enabled && (
                  <button
                    type="button"
                    onClick={connecterGmail}
                    className="text-[11px] text-[#7fd3c9] hover:underline ml-auto flex-shrink-0"
                  >
                    + Connecter une autre adresse
                  </button>
                )}
                {selectedAccount?.provider === "google" && (
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm(`Déconnecter ${selectedAccount.email} de Klocka ?`))
                        disconnectMutation.mutate(selectedAccount.email);
                    }}
                    className="text-[11px] text-[#8b9391] hover:text-red-400 flex-shrink-0"
                  >
                    Déconnecter
                  </button>
                )}
              </div>
            </div>

            {/* Conversation avec l'assistant : chaque tour révise le brouillon. */}
            <ComposerChat
              onBrouillon={(b) => {
                setDraft({
                  to: b.to || "",
                  cc: b.cc || "",
                  subject: b.subject || "",
                  body: b.body || "",
                  template_id: b.template_id || null,
                  template_titre: templates.find((t) => t.id === b.template_id)?.titre || null,
                });
                setWarnings([]);
                setRecipientLabel("");
              }}
            />

            {/* Brouillon */}
            {draft && (
              <div className="bg-[#0a0c0c] border border-[#282b2a] rounded-md overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-[#242726]">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-[#edeae5]/[0.05] flex items-center justify-center flex-shrink-0">
                      <Mail className="w-4 h-4 text-[#8b9391]" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[#edeae5] text-sm font-medium truncate">
                        {draft.template_titre || "Brouillon"}
                      </p>
                      {recipientLabel && (
                        <p className="text-[#8b9391] text-xs truncate">Pour {recipientLabel}</p>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setDraft(null);
                      setWarnings([]);
                    }}
                    className="text-[#8b9391] hover:text-[#edeae5] transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {warnings.length > 0 && (
                  <div className="px-5 py-3 bg-[#e0c9a0]/[0.07] border-b border-[#e0c9a0]/20 space-y-1">
                    {warnings.map((w, i) => (
                      <p key={i} className="text-amber-200/80 text-xs flex items-start gap-2">
                        <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                        {w}
                      </p>
                    ))}
                  </div>
                )}

                <div className="p-5 space-y-4">
                  <div>
                    <Label className="text-[#9aa19e] text-xs mb-1.5 block">De</Label>
                    <div className="bg-[#171918]/60 border border-[#282b2a] rounded-md px-3 py-2 text-sm text-[#d3d8d6]">
                      {selectedAccount ? (
                        <>
                          {selectedAccount.name}{" "}
                          <span className="text-[#8b9391]">&lt;{selectedAccount.email}&gt;</span>
                        </>
                      ) : (
                        <span className="text-[#8b9391]">Aucun compte expéditeur configuré</span>
                      )}
                    </div>
                    {draft.from && from && draft.from !== from && (
                      <p className="text-[#e0c9a0]/80 text-[11px] mt-1.5 flex items-start gap-1.5">
                        <AlertTriangle className="w-3 h-3 flex-shrink-0 mt-0.5" />
                        Expéditeur changé après la rédaction : vérifiez la signature en bas du mail.
                      </p>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <Label className="text-[#9aa19e] text-xs mb-1.5 block">À</Label>
                      <Input
                        value={draft.to}
                        onChange={(e) => setDraft({ ...draft, to: e.target.value })}
                        placeholder="destinataire@exemple.fr"
                        className="bg-[#171918] border-[#282b2a] text-[#edeae5]"
                      />
                    </div>
                    <div>
                      <Label className="text-[#9aa19e] text-xs mb-1.5 block">Cc (optionnel)</Label>
                      <Input
                        value={draft.cc}
                        onChange={(e) => setDraft({ ...draft, cc: e.target.value })}
                        placeholder="copie@exemple.fr"
                        className="bg-[#171918] border-[#282b2a] text-[#edeae5]"
                      />
                    </div>
                  </div>

                  <div>
                    <Label className="text-[#9aa19e] text-xs mb-1.5 block">Objet</Label>
                    <Input
                      value={draft.subject}
                      onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
                      className="bg-[#171918] border-[#282b2a] text-[#edeae5]"
                    />
                  </div>

                  <div>
                    <Label className="text-[#9aa19e] text-xs mb-1.5 block">Corps</Label>
                    <Textarea
                      value={draft.body}
                      onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                      rows={16}
                      className="bg-[#171918] border-[#282b2a] text-[#edeae5] leading-relaxed font-sans"
                    />
                  </div>

                  <div className="flex items-center justify-between gap-3 pt-1">
                    <Button
                      variant="ghost"
                      onClick={() => handleCopy(draft.body, "draft")}
                      className="text-[#9aa19e] hover:text-[#edeae5] hover:bg-[#edeae5]/5"
                    >
                      {copiedField === "draft" ? (
                        <>
                          <Check className="w-4 h-4 mr-2 text-[#7fd3c9]" /> Copié
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4 mr-2" /> Copier
                        </>
                      )}
                    </Button>
                    <Button
                      onClick={() => sendMutation.mutate(draft)}
                      disabled={!draft.to.trim() || (accounts.length > 0 && !from) || sendMutation.isPending}
                      className="bg-[#edeae5] hover:bg-[#d8d5d0] text-[#0c0e0d]"
                    >
                      {sendMutation.isPending ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Envoi…
                        </>
                      ) : (
                        <>
                          <Send className="w-4 h-4 mr-2" /> Envoyer
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </TabsContent>

          {/* ---------------------------------------------------------- */}
          {/* TEMPLATES                                                   */}
          {/* ---------------------------------------------------------- */}
          <TabsContent value="templates">
            <div className="flex items-center justify-between mb-4">
              <p className="text-[#9aa19e] text-sm">
                Utilisez <code className="text-[#d3d8d6]">{"{{signature}}"}</code>,{" "}
                <code className="text-[#d3d8d6]">{"{{nom}}"}</code> ou{" "}
                <code className="text-[#d3d8d6]">{"{{adresse}}"}</code> comme variables.
              </p>
              <Button onClick={() => openEditor(null)} className="bg-[#edeae5] hover:bg-[#d8d5d0] text-[#0c0e0d]">
                <Plus className="w-4 h-4 mr-2" /> Nouveau
              </Button>
            </div>

            {templatesLoading ? (
              <p className="text-[#8b9391] text-sm">Chargement…</p>
            ) : templates.length === 0 ? (
              <p className="text-[#8b9391] text-sm">Aucun template. Créez-en un pour commencer.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {templates.map((t) => (
                  <div
                    key={t.id}
                    className="bg-[#171918] border border-[#edeae5]/[0.10] rounded-md p-5 hover:border-[#565b59] transition-all"
                  >
                    <div className="flex items-start gap-3 mb-3">
                      <div className="w-9 h-9 rounded-md bg-[#edeae5]/[0.05] flex items-center justify-center flex-shrink-0">
                        <Mail className="w-4 h-4 text-[#8b9391]" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="text-[#edeae5] font-medium text-sm truncate">{t.titre}</h3>
                        <p className="text-[#8b9391] text-xs truncate">{t.objet}</p>
                      </div>
                    </div>
                    <p className="text-[#6b7270] text-xs line-clamp-2 leading-relaxed mb-4">
                      {t.description || t.contenu?.slice(0, 100)}
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        onClick={() => handleUseTemplate(t)}
                        className="bg-[#edeae5]/[0.06] hover:bg-[#edeae5]/[0.1] text-[#d3d8d6] border-0 h-8"
                      >
                        <Send className="w-3.5 h-3.5 mr-1.5" /> Utiliser
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setPreview(t)}
                        className="text-[#9aa19e] hover:text-[#edeae5] hover:bg-[#edeae5]/5 h-8"
                      >
                        Aperçu
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => openEditor(t)}
                        className="text-[#9aa19e] hover:text-[#edeae5] hover:bg-[#edeae5]/5 h-8 ml-auto px-2"
                      >
                        <Edit className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          if (confirm(`Supprimer « ${t.titre} » ?`)) deleteTemplate.mutate(t.id);
                        }}
                        className="text-[#8b9391] hover:text-red-400 hover:bg-[#edeae5]/5 h-8 px-2"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ---------------------------------------------------------- */}
          {/* HISTORIQUE                                                  */}
          {/* ---------------------------------------------------------- */}
          <TabsContent value="historique">
            {history.length === 0 ? (
              <p className="text-[#8b9391] text-sm">Aucun mail envoyé pour le moment.</p>
            ) : (
              <div className="space-y-2">
                {history.map((h) => (
                  <div
                    key={h.id}
                    className="bg-[#0a0c0c] border border-[#282b2a] rounded-md px-4 py-3 flex items-start gap-3"
                  >
                    <StatusBadge statut={h.statut} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[#edeae5] text-sm truncate">{h.subject || h.sujet}</p>
                      <p className="text-[#8b9391] text-xs truncate">
                        {h.expediteur ? `${h.expediteur} → ` : ""}
                        {h.to || h.destinataire}
                        {h.template_titre ? ` · ${h.template_titre}` : ""}
                      </p>
                      {h.error && <p className="text-red-400/80 text-xs mt-1">{h.error}</p>}
                    </div>
                    <span className="text-[#6b7270] text-xs flex-shrink-0">
                      {h.sent_at ? new Date(h.sent_at).toLocaleString("fr-FR") : ""}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Éditeur de template */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-[#0a0c0c] border-[#282b2a] text-[#edeae5] max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Modifier le template" : "Nouveau template"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-[#9aa19e] text-xs mb-1.5 block">Titre</Label>
              <Input
                value={form.titre}
                onChange={(e) => setForm({ ...form, titre: e.target.value })}
                placeholder="Présentation Klocka"
                className="bg-[#171918] border-[#282b2a] text-[#edeae5]"
              />
            </div>
            <div>
              <Label className="text-[#9aa19e] text-xs mb-1.5 block">
                Quand l'utiliser <span className="text-[#6b7270]">(aide l'IA à choisir le bon template)</span>
              </Label>
              <Input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Présenter l'activité à un agent rencontré au téléphone"
                className="bg-[#171918] border-[#282b2a] text-[#edeae5]"
              />
            </div>
            <div>
              <Label className="text-[#9aa19e] text-xs mb-1.5 block">Objet</Label>
              <Input
                value={form.objet}
                onChange={(e) => setForm({ ...form, objet: e.target.value })}
                className="bg-[#171918] border-[#282b2a] text-[#edeae5]"
              />
            </div>
            <div>
              <Label className="text-[#9aa19e] text-xs mb-1.5 block">Corps</Label>
              <Textarea
                value={form.contenu}
                onChange={(e) => setForm({ ...form, contenu: e.target.value })}
                rows={14}
                className="bg-[#171918] border-[#282b2a] text-[#edeae5] leading-relaxed"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setDialogOpen(false)}
              className="text-[#9aa19e] hover:text-[#edeae5] hover:bg-[#edeae5]/5"
            >
              Annuler
            </Button>
            <Button
              onClick={() =>
                saveTemplate.mutate({
                  id: editingId,
                  data: { ...form, ordre: editingId ? undefined : templates.length, archived: false },
                })
              }
              disabled={!form.titre.trim() || !form.contenu.trim() || saveTemplate.isPending}
              className="bg-[#edeae5] hover:bg-[#d8d5d0] text-[#0c0e0d]"
            >
              {saveTemplate.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Aperçu */}
      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="bg-[#0a0c0c] border-[#282b2a] text-[#edeae5] max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{preview?.titre}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-[#d3d8d6] min-w-0 truncate">
                <span className="text-[#8b9391]">Objet : </span>
                {preview?.objet}
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleCopy(preview.contenu, "preview")}
                className="text-[#9aa19e] hover:text-[#edeae5] hover:bg-[#edeae5]/5 flex-shrink-0"
              >
                {copiedField === "preview" ? (
                  <Check className="w-3.5 h-3.5 text-[#7fd3c9]" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </Button>
            </div>
            <div className="bg-[#171918] rounded-md p-5 border border-[#232625]">
              <pre className="text-[#edeae5] text-sm leading-relaxed whitespace-pre-wrap font-sans">
                {preview?.contenu}
              </pre>
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => handleUseTemplate(preview)}
              className="bg-[#edeae5] hover:bg-[#d8d5d0] text-[#0c0e0d]"
            >
              <Send className="w-4 h-4 mr-2" /> Utiliser ce template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


function StatusBadge({ statut }) {
  const map = {
    envoye: { label: "Envoyé", className: "bg-[#35a79b]/15 text-[#7fd3c9] border-[#35a79b]/20" },
    simule: { label: "Simulé", className: "bg-[#e0c9a0]/15 text-[#e0c9a0] border-[#e0c9a0]/20" },
    erreur: { label: "Erreur", className: "bg-red-500/15 text-red-400 border-red-500/20" },
  };
  const s = map[statut] || { label: statut || "—", className: "bg-[#edeae5]/5 text-[#9aa19e] border-[#edeae5]/10" };
  return <Badge className={`${s.className} text-[10px] flex-shrink-0 mt-0.5`}>{s.label}</Badge>;
}
