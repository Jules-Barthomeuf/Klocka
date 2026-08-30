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
import { CarteDocument, Visionneuse } from "@/components/preanalyse/ExtractionDocuments";
import { documentsDemo } from "@/components/preanalyse/dossierDemo";

// Phase documentaire d'un deal : dépôt des documents reçus de l'agent,
// extraction (cases structurées + page source), classement dans le Drive
// et synthèse « points à regarder avant d'aller plus loin ».

const GRAVITES = {
  bloquant: { icone: OctagonAlert, classe: "text-red-300", bord: "border-red-500/25 bg-red-500/[0.06]" },
  attention: { icone: AlertTriangle, classe: "text-[#a9c5b9]", bord: "border-[#a9c5b9]/25 bg-[#a9c5b9]/[0.06]" },
  info: { icone: Info, classe: "text-sky-300", bord: "border-sky-500/25 bg-sky-500/[0.06]" },
};

// Rendu de la synthèse « points à vérifier » — aussi utilisé seul par
// l'étape Synthèse du workflow.
export function SyntheseView({ synthese }) {
  if (!synthese) return null;
  return (
    <div className="space-y-3">
      <p className="text-[#c9cdd6] text-sm leading-relaxed">{synthese.resume}</p>
      {synthese.points_a_verifier?.length > 0 && (
        <div className="space-y-2">
          {synthese.points_a_verifier.map((p, i) => {
            const g = GRAVITES[p.gravite] || GRAVITES.attention;
            const Icone = g.icone;
            return (
              <div
                key={i}
                className={`rounded-md border px-4 py-3 animate-in fade-in slide-in-from-bottom-2 duration-500 ease-out fill-mode-both ${g.bord}`}
                style={{ animationDelay: `${i * 90}ms` }}
              >
                <p className={`text-xs font-medium flex items-center gap-2 ${g.classe}`}>
                  <Icone className="w-3.5 h-3.5 flex-shrink-0" />
                  {p.titre}
                </p>
                <p className="text-[#9298a6] text-xs mt-1 leading-relaxed">{p.detail}</p>
              </div>
            );
          })}
        </div>
      )}
      {!synthese.ia && (
        <p className="text-[#6a7180] text-[11px]">
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
  // Deal de test : le dépôt réel est remplacé par une simulation serveur, les
  // documents affichés sont la fixture de démonstration.
  const test = !!dossier.test;

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

  // File de dépôt animée : chaque fichier passe par en_attente → analyse →
  // fait/erreur, visible pendant tout le traitement (l'extraction d'un PDF
  // peut prendre du temps, surtout quand le quota IA impose des pauses).
  const [file, setFile] = useState([]);

  const deposer = useMutation({
    mutationFn: async (fichier) => {
      const form = new FormData();
      form.append("fichier", fichier);
      return base44.request("POST", `/api/preanalyse/dossiers/${dossier.deal_id}/documents`, {
        body: form,
        isForm: true,
      });
    },
  });

  const majFile = (nom, patch) =>
    setFile((prev) => prev.map((f) => (f.nom === nom ? { ...f, ...patch } : f)));

  const onFichiers = (e) => {
    const fichiers = Array.from(e.target.files || []);
    if (!fichiers.length) return;
    setFile(fichiers.map((f) => ({ nom: f.name, etat: "en_attente" })));
    fichiers
      .reduce(
        (chaine, f) =>
          chaine.then(async () => {
            majFile(f.name, { etat: "analyse" });
            try {
              const r = await deposer.mutateAsync(f);
              majFile(f.name, { etat: "fait", libelle: r.document?.classement?.libelle });
              rafraichir();
            } catch (err) {
              majFile(f.name, { etat: "erreur", detail: err?.message || "Extraction impossible" });
            }
          }),
        Promise.resolve()
      )
      .then(() => {
        // La file reste affichée quelques secondes pour lire le bilan.
        setTimeout(() => setFile((prev) => (prev.some((f) => f.etat === "erreur") ? prev : [])), 4000);
      });
    e.target.value = "";
  };
  const depotEnCours = file.some((f) => f.etat === "analyse" || f.etat === "en_attente");

  const reclasser = useMutation({
    mutationFn: ({ docId, type }) =>
      base44.request("POST", `/api/alexis/dossiers/${dossier.dossier_doc_id}/documents/${docId}/type`, {
        body: { type },
      }),
    onSuccess: () => {
      rafraichir();
      toast.success("Document reextrait");
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
      if (r.simulated) toast.info("Classement Drive simulé (mode test) — aucun appel Google");
      else if (r.erreurs?.length) toast.warning(`Classé avec ${r.erreurs.length} erreur(s)`);
      else toast.success(`${r.envoyes.length} fichier(s) classé(s) dans le Drive`);
    },
    onError: (e) => toast.error(e?.message || "Classement Drive impossible"),
  });

  const simuler = useMutation({
    mutationFn: () =>
      base44.request("POST", `/api/preanalyse/dossiers/${dossier.deal_id}/documents/simuler`),
    onSuccess: () => {
      rafraichir();
      toast.success("Documents simulés : extraction et synthèse posés");
    },
    onError: (e) => toast.error(e?.message || "Simulation impossible"),
  });

  const documents = apercu
    ? documentsDemo
    : test
      ? dossier.documents_simules
        ? documentsDemo
        : []
      : dossierDoc?.documents || [];
  const synthese = dossier.synthese_documents;

  return (
    <div className="bg-[#000000] border border-[#1f2228] rounded-md overflow-hidden">
      <div className="px-5 py-4 border-b border-[#1f2228] flex flex-wrap items-center gap-3">
        <p className="text-[#f2f3f5] text-sm font-medium">Documents du deal</p>
        {documents.length > 0 && (
          <Badge className="bg-[#f2f3f5]/5 text-[#9298a6] border-[#f2f3f5]/10 text-[10px]">
            {documents.length} document{documents.length > 1 ? "s" : ""}
          </Badge>
        )}
        <div className="flex-1" />
        {dossier.drive_folder_url ? (
          <a
            href={dossier.drive_folder_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#aab6f5] hover:text-[#f2f3f5] text-xs flex items-center gap-1.5 transition-colors animate-in zoom-in-95 fade-in duration-500"
          >
            <CheckCircle2 className="w-3.5 h-3.5" /> Dossier Drive <ExternalLink className="w-3 h-3" />
          </a>
        ) : (
          // Option, jamais bloquante : le dossier Drive peut être créé avant
          // même le premier document — tout s'y classera ensuite.
          <Button
            size="sm"
            onClick={() => classerDrive.mutate()}
            disabled={apercu || (!test && !compteDrive) || classerDrive.isPending}
            title={
              !test && !compteDrive
                ? "Aucun compte Google avec l'accès Drive — activez GOOGLE_DRIVE côté serveur puis reconnectez votre compte"
                : `Crée « ${statutMail?.google?.drive_destination || "Klocka Projets"} / <deal> » et y classe les documents`
            }
            className="bg-[#f2f3f5]/5 hover:bg-[#f2f3f5]/10 text-[#c9cdd6] border-0"
          >
            {classerDrive.isPending ? (
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            ) : (
              <FolderUp className="w-3.5 h-3.5 mr-1.5" />
            )}
            {documents.length > 0 ? "Classer dans le Drive" : "Créer le dossier Drive (option)"}
          </Button>
        )}
      </div>

      <div className="p-5">
        <Tabs defaultValue={documents.length ? "extraction" : "depot"}>
          <TabsList className="bg-[#000000] border border-[#1f2228] mb-4">
            <TabsTrigger value="depot">Dépôt</TabsTrigger>
            <TabsTrigger value="extraction" disabled={!documents.length}>
              Extraction
            </TabsTrigger>
            {!masquerSynthese && (
              <TabsTrigger value="synthese" disabled={!synthese}>
                Synthèse
                {synthese?.points_a_verifier?.length ? ` (${synthese.points_a_verifier.length})` : ""}
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="depot">
            {test ? (
              <>
                <p className="text-[#9298a6] text-xs mb-2">
                  Deal de test : pas de vrai dépôt. La simulation pose trois documents fictifs
                  (bail, PV d'AG, diagnostics), la synthèse des points à vérifier, et avance le
                  statut jusqu'à « Extrait » — sans appel API.
                </p>
                <Button
                  onClick={() => simuler.mutate()}
                  disabled={simuler.isPending || dossier.documents_simules}
                  className="bg-transparent border border-[#2c3139] text-[#f2f3f5] hover:bg-[#f2f3f5]/[0.06]"
                >
                  {simuler.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Upload className="w-4 h-4 mr-2" />
                  )}
                  {dossier.documents_simules ? "Documents déjà simulés" : "Simuler la réception des documents"}
                </Button>
              </>
            ) : (
              <>
            <p className="text-[#9298a6] text-xs mb-2">
              Déposez le bail, les PV d'AG, le règlement de copropriété, les quittances, les diagnostics…
              Chaque dépôt met à jour la synthèse.
            </p>
            <button
              onClick={() => inputFichier.current?.click()}
              disabled={apercu || depotEnCours}
              className="w-full h-20 border border-dashed border-[#f2f3f5]/15 rounded-md flex items-center justify-center gap-3 hover:border-[#3a3f4a] hover:bg-[#f2f3f5]/[0.02] transition-all disabled:opacity-50"
            >
              <Upload className={`w-5 h-5 text-[#9298a6] ${depotEnCours ? "animate-pulse" : ""}`} />
              <span className="text-[#9298a6] text-sm">
                {depotEnCours ? "Extraction en cours…" : "PDF, image ou .eml — plusieurs à la fois"}
              </span>
            </button>

            {/* File de traitement : un rang par fichier, états animés. */}
            {file.length > 0 && (
              <div className="mt-3 space-y-1.5">
                {file.map((f, i) => (
                  <div
                    key={f.nom}
                    className="flex items-center gap-3 px-3.5 py-2.5 bg-[#0f1114] border border-[#1f2228] rounded animate-in fade-in slide-in-from-bottom-1 duration-300 ease-out fill-mode-both"
                    style={{ animationDelay: `${i * 60}ms` }}
                  >
                    {f.etat === "analyse" ? (
                      <Loader2 className="w-3.5 h-3.5 text-[#9298a6] animate-spin flex-none" />
                    ) : f.etat === "fait" ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#aab6f5] flex-none animate-in zoom-in duration-300" />
                    ) : f.etat === "erreur" ? (
                      <OctagonAlert className="w-3.5 h-3.5 text-red-300 flex-none" />
                    ) : (
                      <span className="w-3.5 h-3.5 flex-none flex items-center justify-center">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#3a3f4a]" />
                      </span>
                    )}
                    <span className="text-[12.5px] text-[#c9cdd6] truncate flex-1">{f.nom}</span>
                    <span
                      className={`text-[11px] flex-none ${
                        f.etat === "erreur" ? "text-red-300" : f.etat === "fait" ? "text-[#aab6f5]" : "text-[#6a7180]"
                      }`}
                    >
                      {f.etat === "en_attente"
                        ? "en attente"
                        : f.etat === "analyse"
                          ? "lecture et extraction…"
                          : f.etat === "fait"
                            ? f.libelle || "extrait"
                            : f.detail}
                    </span>
                    {f.etat === "erreur" && (
                      <button
                        onClick={() => setFile((prev) => prev.filter((x) => x.nom !== f.nom))}
                        className="text-[#6a7180] hover:text-[#f2f3f5] flex-none"
                        title="Masquer"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
            <input
              ref={inputFichier}
              type="file"
              multiple
              accept=".pdf,.jpg,.jpeg,.png,.webp,.eml,.txt"
              onChange={onFichiers}
              className="hidden"
            />
              </>
            )}
          </TabsContent>

          <TabsContent value="extraction" className="animate-in fade-in slide-in-from-bottom-2 duration-500 ease-out">
            {documents.length > 0 && (
              <div className="grid lg:grid-cols-[1fr_1fr] gap-5 items-start">
                <div className="space-y-4">
                  {documents.map((doc, i) => (
                    <div
                      key={doc.doc_id}
                      className="animate-in fade-in slide-in-from-bottom-3 duration-500 ease-out fill-mode-both"
                      style={{ animationDelay: `${i * 90}ms` }}
                    >
                      <CarteDocument
                        doc={doc}
                        types={types}
                        sourceActive={source}
                        onVoirSource={setSource}
                        onReclasser={(type) => reclasser.mutate({ docId: doc.doc_id, type })}
                        onSupprimer={() => {
                          if (confirm(`Retirer « ${doc.nom_fichier} » du dossier ?`)) supprimer.mutate(doc.doc_id);
                        }}
                        enCours={apercu || test || reclasser.isPending}
                      />
                    </div>
                  ))}
                </div>
                <div className="lg:sticky lg:top-16">
                  <Visionneuse source={source} onFermer={() => setSource(null)} />
                </div>
              </div>
            )}
          </TabsContent>

          {!masquerSynthese && (
            <TabsContent value="synthese" className="animate-in fade-in slide-in-from-bottom-2 duration-500 ease-out">
              <SyntheseView synthese={synthese} />
            </TabsContent>
          )}
        </Tabs>
      </div>
    </div>
  );
}
