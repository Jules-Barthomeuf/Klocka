import React, { useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertTriangle, CheckCircle2, ExternalLink, FolderUp, Info, Loader2, OctagonAlert, Upload,
} from "lucide-react";
import { toast } from "sonner";
import { CarteDocument, Visionneuse } from "@/components/preanalyse/DepouillementDocuments";
import { documentsDemo } from "@/components/preanalyse/dossierDemo";

// Phase documentaire d'un deal : dépôt des documents reçus de l'agent,
// dépouillement (cases structurées + page source), classement dans le Drive
// et synthèse « points à regarder avant d'aller plus loin ».

const GRAVITES = {
  bloquant: { icone: OctagonAlert, classe: "text-red-300", bord: "border-red-500/25 bg-red-500/[0.06]" },
  attention: { icone: AlertTriangle, classe: "text-amber-300", bord: "border-amber-500/25 bg-amber-500/[0.06]" },
  info: { icone: Info, classe: "text-sky-300", bord: "border-sky-500/25 bg-sky-500/[0.06]" },
};

// Rendu de la synthèse « points à vérifier » — aussi utilisé seul par
// l'étape Synthèse du workflow.
export function SyntheseView({ synthese }) {
  if (!synthese) return null;
  return (
    <div className="space-y-3">
      <p className="text-gray-300 text-sm leading-relaxed">{synthese.resume}</p>
      {synthese.points_a_verifier?.length > 0 && (
        <div className="space-y-2">
          {synthese.points_a_verifier.map((p, i) => {
            const g = GRAVITES[p.gravite] || GRAVITES.attention;
            const Icone = g.icone;
            return (
              <div key={i} className={`rounded-xl border px-4 py-3 ${g.bord}`}>
                <p className={`text-xs font-medium flex items-center gap-2 ${g.classe}`}>
                  <Icone className="w-3.5 h-3.5 flex-shrink-0" />
                  {p.titre}
                </p>
                <p className="text-gray-400 text-xs mt-1 leading-relaxed">{p.detail}</p>
              </div>
            );
          })}
        </div>
      )}
      {!synthese.ia && (
        <p className="text-gray-600 text-[11px]">
          Synthèse générée sans IA (repli) : seuls les champs douteux de l'extraction sont listés.
        </p>
      )}
    </div>
  );
}

export default function SectionDocumentsDeal({ dossier, onRefresh, masquerSynthese = false, apercu = false }) {
  const queryClient = useQueryClient();
  const inputFichier = useRef(null);
  const [source, setSource] = useState(null);

  // La grille est chargée même en aperçu : lecture seule, et c'est elle qui
  // donne les libellés des champs des documents de démonstration.
  const { data: grille } = useQuery({
    queryKey: ["alexis-grille"],
    queryFn: () => base44.request("GET", "/api/alexis/grille"),
  });
  const types = grille?.types || [];

  // En aperçu, les documents viennent de la fixture : aucun appel API.
  const { data: dossierDoc } = useQuery({
    queryKey: ["deal-docs", dossier.dossier_doc_id],
    queryFn: () => base44.request("GET", `/api/alexis/dossiers/${dossier.dossier_doc_id}`),
    enabled: !apercu && !!dossier.dossier_doc_id,
  });

  const { data: statutMail } = useQuery({
    queryKey: ["mail-status"],
    queryFn: () => base44.functions.invoke("getMailStatus", {}),
    enabled: !apercu,
  });
  const compteDrive = (statutMail?.accounts || []).find((c) => c.peut_drive)?.id || null;

  const rafraichir = () => {
    queryClient.invalidateQueries({ queryKey: ["deal-docs"] });
    onRefresh?.();
  };

  const deposer = useMutation({
    mutationFn: async (fichier) => {
      const form = new FormData();
      form.append("fichier", fichier);
      return base44.request("POST", `/api/preanalyse/dossiers/${dossier.deal_id}/documents`, {
        body: form,
        isForm: true,
      });
    },
    onSuccess: (r) => {
      rafraichir();
      const c = r.document?.classement;
      toast.success(c?.libelle ? `${r.document.nom_fichier} — ${c.libelle}` : "Document dépouillé");
    },
    onError: (e) => toast.error(e?.message || "Dépouillement impossible"),
  });

  const onFichiers = (e) => {
    const fichiers = Array.from(e.target.files || []);
    fichiers.reduce(
      (chaine, f) => chaine.then(() => deposer.mutateAsync(f).catch(() => {})),
      Promise.resolve()
    );
    e.target.value = "";
  };

  const reclasser = useMutation({
    mutationFn: ({ docId, type }) =>
      base44.request("POST", `/api/alexis/dossiers/${dossier.dossier_doc_id}/documents/${docId}/type`, {
        body: { type },
      }),
    onSuccess: () => {
      rafraichir();
      toast.success("Document redépouillé");
    },
    onError: (e) => toast.error(e?.message || "Reclassement impossible"),
  });

  const supprimer = useMutation({
    mutationFn: (docId) =>
      base44.request("DELETE", `/api/alexis/dossiers/${dossier.dossier_doc_id}/documents/${docId}`),
    onSuccess: () => {
      setSource(null);
      rafraichir();
    },
  });

  const classerDrive = useMutation({
    mutationFn: () =>
      base44.request("POST", `/api/preanalyse/dossiers/${dossier.deal_id}/drive`, {
        body: { compte: compteDrive },
      }),
    onSuccess: (r) => {
      rafraichir();
      if (r.erreurs?.length) toast.warning(`Classé avec ${r.erreurs.length} erreur(s)`);
      else toast.success(`${r.envoyes.length} fichier(s) classé(s) dans le Drive`);
    },
    onError: (e) => toast.error(e?.message || "Classement Drive impossible"),
  });

  const documents = apercu ? documentsDemo : dossierDoc?.documents || [];
  const synthese = dossier.synthese_documents;

  return (
    <div className="bg-[#0A0A0A] border border-white/[0.06] rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-white/[0.06] flex flex-wrap items-center gap-3">
        <p className="text-white text-sm font-medium">Documents du deal</p>
        {documents.length > 0 && (
          <Badge className="bg-white/5 text-gray-400 border-white/10 text-[10px]">
            {documents.length} document{documents.length > 1 ? "s" : ""}
          </Badge>
        )}
        <div className="flex-1" />
        {dossier.drive_folder_url ? (
          <a
            href={dossier.drive_folder_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#71CCBA] hover:text-white text-xs flex items-center gap-1.5 transition-colors"
          >
            <CheckCircle2 className="w-3.5 h-3.5" /> Dossier Drive <ExternalLink className="w-3 h-3" />
          </a>
        ) : (
          documents.length > 0 && (
            <Button
              size="sm"
              onClick={() => classerDrive.mutate()}
              disabled={apercu || !compteDrive || classerDrive.isPending}
              title={!compteDrive ? "Aucun compte Google avec l'accès Drive (GOOGLE_DRIVE + reconnexion)" : undefined}
              className="bg-white/5 hover:bg-white/10 text-gray-300 border-0"
            >
              {classerDrive.isPending ? (
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              ) : (
                <FolderUp className="w-3.5 h-3.5 mr-1.5" />
              )}
              Classer dans le Drive
            </Button>
          )
        )}
      </div>

      <div className="p-5">
        <Tabs defaultValue={documents.length ? "depouillement" : "depot"}>
          <TabsList className="bg-neutral-900 border border-white/[0.08] mb-4">
            <TabsTrigger value="depot">Dépôt</TabsTrigger>
            <TabsTrigger value="depouillement" disabled={!documents.length}>
              Dépouillement
            </TabsTrigger>
            {!masquerSynthese && (
              <TabsTrigger value="synthese" disabled={!synthese}>
                Synthèse
                {synthese?.points_a_verifier?.length ? ` (${synthese.points_a_verifier.length})` : ""}
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="depot">
            <p className="text-gray-400 text-xs mb-2">
              Déposez le bail, les PV d'AG, le règlement de copropriété, les quittances, les diagnostics…
              Chaque dépôt met à jour la synthèse.
            </p>
            <button
              onClick={() => inputFichier.current?.click()}
              disabled={apercu || deposer.isPending}
              className="w-full h-20 border border-dashed border-white/15 rounded-xl flex items-center justify-center gap-3 hover:border-[#2A9D8F]/50 hover:bg-white/[0.02] transition-all disabled:opacity-50"
            >
              {deposer.isPending ? (
                <>
                  <Loader2 className="w-5 h-5 text-[#2A9D8F] animate-spin" />
                  <span className="text-gray-400 text-sm">Lecture et dépouillement…</span>
                </>
              ) : (
                <>
                  <Upload className="w-5 h-5 text-[#2A9D8F]" />
                  <span className="text-gray-400 text-sm">PDF, image ou .eml — plusieurs à la fois</span>
                </>
              )}
            </button>
            <input
              ref={inputFichier}
              type="file"
              multiple
              accept=".pdf,.jpg,.jpeg,.png,.webp,.eml,.txt"
              onChange={onFichiers}
              className="hidden"
            />
          </TabsContent>

          <TabsContent value="depouillement">
            {documents.length > 0 && (
              <div className="grid lg:grid-cols-[1fr_1fr] gap-5 items-start">
                <div className="space-y-4">
                  {documents.map((doc) => (
                    <CarteDocument
                      key={doc.doc_id}
                      doc={doc}
                      types={types}
                      sourceActive={source}
                      onVoirSource={setSource}
                      onReclasser={(type) => reclasser.mutate({ docId: doc.doc_id, type })}
                      onSupprimer={() => {
                        if (confirm(`Retirer « ${doc.nom_fichier} » du dossier ?`)) supprimer.mutate(doc.doc_id);
                      }}
                      enCours={apercu || reclasser.isPending}
                    />
                  ))}
                </div>
                <div className="lg:sticky lg:top-16">
                  <Visionneuse source={source} onFermer={() => setSource(null)} />
                </div>
              </div>
            )}
          </TabsContent>

          {!masquerSynthese && (
            <TabsContent value="synthese">
              <SyntheseView synthese={synthese} />
            </TabsContent>
          )}
        </Tabs>
      </div>
    </div>
  );
}
