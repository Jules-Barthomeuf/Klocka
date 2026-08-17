import React, { useMemo, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertTriangle, FileText, FolderOpen, Loader2, Plus, Quote, Trash2, Upload, X,
} from "lucide-react";
import { toast } from "sonner";

// Dépouillement documentaire (onglet « Documents » de la Préanalyse).
// Le principe : à gauche les données relevées, à droite le document ouvert à la
// page exacte d'où vient la donnée sélectionnée.

export default function DepouillementDocuments() {
  const queryClient = useQueryClient();
  const inputFichier = useRef(null);

  const [dossierId, setDossierId] = useState(null);
  const [source, setSource] = useState(null); // { url, page, citation, libelle }

  const { data: grille } = useQuery({
    queryKey: ["alexis-grille"],
    queryFn: () => base44.request("GET", "/api/alexis/grille"),
  });

  const { data: dossiers = [] } = useQuery({
    queryKey: ["alexis-dossiers"],
    queryFn: () => base44.request("GET", "/api/alexis/dossiers"),
    initialData: [],
  });

  const { data: dossier } = useQuery({
    queryKey: ["alexis-dossier", dossierId],
    queryFn: () => base44.request("GET", `/api/alexis/dossiers/${dossierId}`),
    enabled: !!dossierId,
  });

  const rafraichir = () => {
    queryClient.invalidateQueries({ queryKey: ["alexis-dossiers"] });
    queryClient.invalidateQueries({ queryKey: ["alexis-dossier"] });
  };

  const deposer = useMutation({
    mutationFn: async (fichier) => {
      const form = new FormData();
      form.append("fichier", fichier);
      if (dossierId) form.append("dossier_id", dossierId);
      // Le type est toujours détecté automatiquement ; il reste corrigeable
      // ensuite sur chaque carte de document.
      return base44.request("POST", "/api/alexis/documents", { body: form, isForm: true });
    },
    onSuccess: (r) => {
      setDossierId(r.dossier_id);
      rafraichir();
      const c = r.document?.classement;
      toast.success(c?.libelle ? `${r.document.nom_fichier} — ${c.libelle}` : "Document analysé");
    },
    onError: (e) => toast.error(e?.message || "Analyse impossible"),
  });

  const reclasser = useMutation({
    mutationFn: ({ docId, type }) =>
      base44.request("POST", `/api/alexis/dossiers/${dossierId}/documents/${docId}/type`, { body: { type } }),
    onSuccess: () => {
      rafraichir();
      toast.success("Document redépouillé");
    },
    onError: (e) => toast.error(e?.message || "Reclassement impossible"),
  });

  const supprimer = useMutation({
    mutationFn: (docId) => base44.request("DELETE", `/api/alexis/dossiers/${dossierId}/documents/${docId}`),
    onSuccess: () => {
      setSource(null);
      rafraichir();
    },
  });

  const onFichiers = (e) => {
    const fichiers = Array.from(e.target.files || []);
    // Séquentiel : le premier dépôt crée le dossier auquel les suivants s'ajoutent.
    fichiers.reduce(
      (chaine, f) => chaine.then(() => deposer.mutateAsync(f).catch(() => {})),
      Promise.resolve()
    );
    e.target.value = "";
  };

  const types = grille?.types || [];

  return (
    <div className="max-w-[1600px] mx-auto">
      {/* Barre dossier : sélection + nouveau, dans l'esprit des pilules du simulateur */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
        <p className="text-[#7f9995] text-xs flex-1">
          {dossier
            ? dossier.titre
            : "Déposez les documents d'un deal : ils sont classés, dépouillés, et chaque donnée renvoie à sa page source."}
        </p>
        <div className="flex items-center gap-2 flex-shrink-0">
          {dossiers.length > 0 && (
            <Select
              value={dossier?.dossier_id || ""}
              onValueChange={(id) => {
                setDossierId(id);
                setSource(null);
              }}
            >
              <SelectTrigger className="bg-transparent border-[#24312f] text-[#c4d5d1] hover:text-white hover:border-white/[0.25] rounded-full h-8 w-56 text-xs">
                <SelectValue placeholder="Ouvrir un dossier" />
              </SelectTrigger>
              <SelectContent className="bg-[#0a0f0e] border-[#1c2725] text-white">
                {dossiers.map((d) => (
                  <SelectItem key={d.dossier_id} value={d.dossier_id}>
                    <span className="flex items-center gap-2">
                      <FolderOpen className="w-3.5 h-3.5" />
                      {d.titre} <span className="text-[#7f9995]">({d.nb_documents})</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {dossier && (
            <button
              onClick={() => {
                setDossierId(null);
                setSource(null);
              }}
              className="flex items-center gap-1.5 px-3 h-8 rounded-full border border-[#24312f] text-[#c4d5d1] hover:text-white hover:border-white/[0.25] text-xs transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Nouveau dossier
            </button>
          )}
        </div>
      </div>

      {/* Dépôt */}
      <div className="bg-[#0a0f0e] border border-[#16201f] rounded-md p-5 mb-6">
        <p className="text-[#93aca7] text-xs mb-2">
          Déposez le bail, les PV d'AG, le règlement de copropriété, les quittances, les diagnostics…
        </p>
        <button
          onClick={() => inputFichier.current?.click()}
          disabled={deposer.isPending}
          className="w-full h-20 border border-dashed border-white/15 rounded-md flex items-center justify-center gap-3 hover:border-[#33d6c0]/50 hover:bg-white/[0.02] transition-all disabled:opacity-50"
        >
          {deposer.isPending ? (
            <>
              <Loader2 className="w-5 h-5 text-[#33d6c0] animate-spin" />
              <span className="text-[#93aca7] text-sm">Lecture et dépouillement…</span>
            </>
          ) : (
            <>
              <Upload className="w-5 h-5 text-[#33d6c0]" />
              <span className="text-[#93aca7] text-sm">PDF, image ou .eml — plusieurs à la fois</span>
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
      </div>

      {/* Données à gauche, document à droite */}
      {dossier?.documents?.length > 0 ? (
        <div className="grid lg:grid-cols-[1fr_1fr] gap-6 items-start">
          <div className="space-y-5">
            {dossier.documents.map((doc, i) => (
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
                  enCours={reclasser.isPending}
                />
              </div>
            ))}
          </div>

          <div className="lg:sticky lg:top-16">
            <Visionneuse source={source} onFermer={() => setSource(null)} />
          </div>
        </div>
      ) : (
        !deposer.isPending && (
          <div className="text-center py-16">
            <FolderOpen className="w-10 h-10 text-[#33d6c0]/30 mx-auto mb-4" />
            <p className="text-[#7f9995] text-sm">
              Déposez les documents d'un deal : ils sont classés, leurs données extraites, et chaque
              information indique d'où elle vient.
            </p>
          </div>
        )
      )}
    </div>
  );
}

export function CarteDocument({ doc, types, sourceActive, onVoirSource, onReclasser, onSupprimer, enCours }) {
  const type = types.find((t) => t.code === doc.classement?.code);
  const champs = type?.champs || [];

  // Un champ marqué « masquer_si_absent » (le pas de porte) ne crée pas de ligne
  // vide : conformément à la grille, on ne montre l'onglet que s'il existe.
  const lignes = useMemo(
    () =>
      champs.filter((c) => {
        const v = doc.champs?.[c.id];
        return !(c.masquer_si_absent && (!v || v.absent));
      }),
    [champs, doc.champs]
  );

  const renseignes = lignes.filter((c) => doc.champs?.[c.id] && !doc.champs[c.id].absent).length;

  return (
    <div className="bg-[#0a0f0e] border border-[#16201f] rounded-md overflow-hidden">
      <div className="px-5 py-4 border-b border-[#16201f] flex items-start gap-3">
        <FileText className="w-4 h-4 text-[#33d6c0] flex-shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <p className="text-white text-sm font-medium truncate">{doc.nom_fichier}</p>
          <p className="text-[#7f9995] text-xs">
            {doc.nb_pages} page{doc.nb_pages > 1 ? "s" : ""} · {renseignes}/{lignes.length} champs renseignés
            {doc.transcrit ? " · transcrit" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Select value={doc.classement?.code || ""} onValueChange={onReclasser} disabled={enCours}>
            <SelectTrigger className="bg-[#101715] border-[#1c2725] text-white h-8 w-44 text-xs">
              <SelectValue placeholder="Type inconnu" />
            </SelectTrigger>
            <SelectContent className="bg-[#0a0f0e] border-[#1c2725] text-white">
              {types.map((t) => (
                <SelectItem key={t.code} value={t.code}>
                  {t.libelle}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <button onClick={onSupprimer} className="text-[#5e7672] hover:text-red-400 p-1.5" title="Retirer">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {doc.classement?.confiance === "basse" && (
        <p className="px-5 py-2 text-amber-300/80 text-xs bg-amber-500/[0.07] border-b border-amber-500/20 flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          Type détecté avec une confiance faible — vérifiez et corrigez au besoin.
        </p>
      )}

      {/* IA saturée au moment du dépôt : le document et ses pages sont
          conservés, un clic relance l'extraction sans re-téléverser. */}
      {doc.incidents?.some((i) => i.motif === "ia_indisponible") && (
        <div className="px-5 py-2.5 bg-amber-500/[0.07] border-b border-amber-500/20 flex flex-wrap items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-300 flex-shrink-0" />
          <p className="text-amber-200/90 text-xs flex-1 min-w-48">
            L'IA était saturée pendant le dépôt : les champs n'ont pas été extraits. Le document est
            conservé — relancez l'extraction quand vous voulez.
          </p>
          <button
            onClick={() => doc.classement?.code && onReclasser(doc.classement.code)}
            disabled={enCours || !doc.classement?.code}
            className="px-3 py-1.5 text-xs rounded border border-amber-500/40 text-amber-200 hover:bg-amber-500/10 transition-colors disabled:opacity-50 flex-shrink-0"
          >
            {enCours ? "Extraction…" : "Redépouiller"}
          </button>
        </div>
      )}

      {doc.incidents?.filter((i) => i.motif !== "ia_indisponible").length > 0 && (
        <div className="px-5 py-2 bg-red-500/[0.07] border-b border-red-500/20">
          {doc.incidents
            .filter((i) => i.motif !== "ia_indisponible")
            .map((i, k) => (
            <p key={k} className="text-red-300/80 text-[11px]">
              {i.libelle || i.champ} :{" "}
              {i.motif === "citation_introuvable"
                ? "valeur écartée, citation introuvable dans le document"
                : i.motif === "citation_absente"
                  ? "valeur écartée, aucune citation fournie"
                  : i.motif === "page_corrigee"
                    ? `page corrigée (${i.page_annoncee} → ${i.page_reelle})`
                    : i.motif}
            </p>
          ))}
        </div>
      )}

      {!type ? (
        <p className="px-5 py-6 text-[#7f9995] text-sm">
          Type non reconnu. Choisissez-le ci-dessus pour lancer le dépouillement.
        </p>
      ) : (
        <div className="divide-y divide-[#131c1b]">
          {lignes.map((c) => {
            const v = doc.champs?.[c.id];
            const absent = !v || v.absent;
            const actif =
              sourceActive?.url === doc.url && !absent && sourceActive?.page === v.page && sourceActive?.champ === c.id;
            return (
              <div key={c.id} className={`px-5 py-3 ${actif ? "bg-[#33d6c0]/[0.07]" : ""}`}>
                <div className="flex items-start gap-3">
                  <span className="text-[#7f9995] text-xs w-44 flex-shrink-0 pt-0.5">{c.libelle}</span>
                  <div className="min-w-0 flex-1">
                    {absent ? (
                      <span className="text-[#5e7672] text-xs italic">non trouvé dans ce document</span>
                    ) : (
                      <>
                        <p className="text-white text-sm whitespace-pre-wrap leading-relaxed">{v.valeur}</p>
                        {c.remarque && <p className="text-amber-300/60 text-[11px] mt-1">{c.remarque}</p>}
                      </>
                    )}
                  </div>
                  {!absent && (
                    <button
                      onClick={() =>
                        onVoirSource({
                          url: doc.url,
                          page: v.page,
                          citation: v.citation,
                          libelle: c.libelle,
                          fichier: doc.nom_fichier,
                          champ: c.id,
                        })
                      }
                      className={`flex-shrink-0 text-[11px] px-2 py-1 rounded-lg border transition-colors ${
                        actif
                          ? "border-[#33d6c0]/40 bg-[#33d6c0]/20 text-[#5ee7d4]"
                          : "border-white/10 text-[#7f9995] hover:text-white hover:border-white/25"
                      }`}
                      title={v.citation}
                    >
                      <Quote className="w-3 h-3 inline mr-1" />
                      p.{v.page}
                    </button>
                  )}
                  {!absent && v.confiance === "basse" && (
                    <Badge className="bg-amber-500/15 text-amber-300 border-amber-500/25 text-[10px] flex-shrink-0">
                      à vérifier
                    </Badge>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function Visionneuse({ source, onFermer }) {
  if (!source) {
    return (
      <div className="bg-[#0a0f0e] border border-[#16201f] rounded-md h-[70vh] flex flex-col items-center justify-center text-center px-8">
        <Quote className="w-8 h-8 text-[#33d6c0]/30 mb-3" />
        <p className="text-[#7f9995] text-sm">
          Cliquez sur le repère de page à côté d'une donnée : le document s'ouvrira ici, à la bonne page.
        </p>
      </div>
    );
  }

  const estPdf = /\.pdf($|\?)/i.test(source.url || "");

  return (
    <div className="bg-[#0a0f0e] border border-[#33d6c0]/25 rounded-md overflow-hidden">
      <div className="px-4 py-3 border-b border-[#16201f] flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-white text-sm font-medium truncate">
            {source.libelle} <span className="text-[#7f9995]">— page {source.page}</span>
          </p>
          <p className="text-[#5e7672] text-xs truncate">{source.fichier}</p>
        </div>
        <a
          href={`${source.url}#page=${source.page}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#7f9995] hover:text-white text-[11px] flex-shrink-0"
        >
          Ouvrir
        </a>
        <button onClick={onFermer} className="text-[#7f9995] hover:text-white flex-shrink-0">
          <X className="w-4 h-4" />
        </button>
      </div>

      {source.citation && (
        <div className="px-4 py-3 bg-[#33d6c0]/[0.07] border-b border-[#33d6c0]/20">
          <p className="text-[#5ee7d4] text-xs leading-relaxed">
            <Quote className="w-3 h-3 inline mr-1.5" />
            {source.citation}
          </p>
        </div>
      )}

      {estPdf ? (
        // #page=N est interprété nativement par la visionneuse PDF du navigateur.
        <iframe
          key={`${source.url}#${source.page}`}
          src={`${source.url}#page=${source.page}&view=FitH`}
          title={`${source.fichier} page ${source.page}`}
          className="w-full h-[70vh] bg-[#0a0f0e]"
        />
      ) : (
        <img src={source.url} alt={source.fichier} className="w-full max-h-[70vh] object-contain bg-[#0a0f0e]" />
      )}
    </div>
  );
}
