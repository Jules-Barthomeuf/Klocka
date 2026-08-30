import React, { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { Loader2, MoreHorizontal, Check, ExternalLink, FolderPlus } from "lucide-react";

// Les documents du dossier, en tableau : case à cocher pour les soumettre au
// chat, nom modifiable, catégorie, type, date et taille, et un menu ⋯ par ligne.

// Les cinq premières correspondent à la grille de lecture : classer un
// document lui donne les éléments à relever lors de l'extraction.
const CATEGORIES = [
  "Bail commercial",
  "Assemblée générale",
  "Règlement de copropriété",
  "Quittances",
  "Diagnostics",
  "Dossier de commercialisation",
  "Comptes du locataire",
  "Titre de propriété",
  "Autre",
];

// L'extraction tourne en tâche de fond : chaque pièce porte son état.
const ETATS = {
  en_attente: { libelle: "En file", classe: "text-[#9298a6]" },
  en_cours: { libelle: "Analyse…", classe: "text-[#c3ddd6]" },
  fait: { libelle: "Analysé", classe: "text-[#c3ddd6]" },
  erreur: { libelle: "Échec", classe: "text-red-400" },
};

const tailleLisible = (o) => (!o ? "—" : o < 1024 * 1024 ? `${Math.round(o / 1024)} Ko` : `${(o / 1024 / 1024).toFixed(1)} Mo`);
const typeLisible = (mime) => {
  if (!mime) return "Fichier";
  if (mime.includes("pdf")) return "PDF";
  if (mime.startsWith("image/")) return "Image";
  if (mime.includes("sheet") || mime.includes("excel") || mime.includes("csv")) return "Tableur";
  if (mime.includes("word") || mime.includes("document")) return "Document";
  if (mime.startsWith("text/")) return "Texte";
  return "Fichier";
};

// proposerDrive : à l'étape Analyse, l'arrivée de documents propose de créer le
// dossier Google Drive du projet (Drive partagé › Projets › <projet>) et d'y classer tout
// ce qui est déjà là. Jamais bloquant : on peut refuser et le proposer plus tard.
export default function DocumentsDossier({ dossier, coches = [], onCocher, onRefresh, apercu = false, proposerDrive = false }) {
  const inputRef = useRef(null);
  const [menu, setMenu] = useState(null);
  const [renommage, setRenommage] = useState(null);
  const [recherche, setRecherche] = useState("");
  // Demande de création du dossier Drive, ouverte après un import.
  const [driveDemande, setDriveDemande] = useState(false);

  const { data: statutMail } = useQuery({
    queryKey: ["mail-status"],
    queryFn: () => base44.functions.invoke("getMailStatus", {}),
    enabled: !apercu && proposerDrive,
  });
  const compteDrive = (statutMail?.accounts || []).find((c) => c.peut_drive)?.id || null;
  const destinationDrive = statutMail?.google?.drive_destination || "Klocka Projets";
  const titreProjet = dossier?.lots?.[0]?.synthese?.titre || dossier?.titre || dossier?.deal_id || "Projet";

  const creerDrive = useMutation({
    mutationFn: () =>
      base44.request("POST", `/api/preanalyse/dossiers/${dossier.deal_id}/drive`, {
        body: { compte: compteDrive },
      }),
    onSuccess: (r) => {
      setDriveDemande(false);
      onRefresh?.();
      if (r.simulated) toast.info("Dossier Drive simulé (mode test) — aucun appel Google");
      else if (r.erreurs?.length) toast.warning(`Dossier créé, ${r.erreurs.length} fichier(s) en erreur`);
      else toast.success(`Dossier Drive créé — ${r.envoyes.length} fichier(s) classé(s)`);
    },
    onError: (e) => { setDriveDemande(false); toast.error(e?.message || "Création du dossier Drive impossible"); },
  });

  const documents = dossier?.documents_espace || [];
  const visibles = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return q ? documents.filter((d) => (d.nom || "").toLowerCase().includes(q) || (d.categorie || "").toLowerCase().includes(q)) : documents;
  }, [documents, recherche]);

  const importer = useMutation({
    mutationFn: async (fichiers) => {
      for (const f of fichiers) {
        const form = new FormData();
        form.append("fichier", f);
        await base44.request("POST", `/api/preanalyse/dossiers/${dossier.deal_id}/espace/documents`, { body: form, isForm: true });
      }
    },
    onSuccess: (_, fichiers) => {
      toast.success(
        `${fichiers.length} document${fichiers.length > 1 ? "s" : ""} importé${fichiers.length > 1 ? "s" : ""}`,
        { description: "L'extraction se lance toute seule — les tables arrivent au fil de l'eau." }
      );
      onRefresh?.();
      // Le dossier Drive n'existe pas encore : c'est le moment de le proposer.
      if (proposerDrive && !apercu && !dossier?.drive_folder_url) setDriveDemande(true);
    },
    onError: (e) => toast.error(e?.message || "Import impossible"),
  });

  const majDocument = useMutation({
    mutationFn: ({ id, ...corps }) => base44.request("POST", `/api/preanalyse/dossiers/${dossier.deal_id}/espace/documents/${id}/renommer`, { body: corps }),
    onSuccess: () => { setRenommage(null); onRefresh?.(); },
    onError: (e) => toast.error(e?.message || "Modification impossible"),
  });

  const supprimer = useMutation({
    mutationFn: (id) => base44.request("DELETE", `/api/preanalyse/dossiers/${dossier.deal_id}/espace/documents/${id}`),
    onSuccess: (_, id) => { onCocher?.(coches.filter((c) => c !== id)); onRefresh?.(); },
    onError: (e) => toast.error(e?.message || "Suppression impossible"),
  });

  // Tant qu'une pièce est en file ou en cours, on redemande le dossier : les
  // tables apparaissent au fil de l'eau, sans que personne ne recharge la page.
  const enTraitement = documents.some((d) => ["en_attente", "en_cours"].includes(d.extraction?.statut));
  const refRefresh = useRef(onRefresh);
  refRefresh.current = onRefresh;
  useEffect(() => {
    if (!enTraitement || apercu) return undefined;
    const t = setInterval(() => refRefresh.current?.(), 4000);
    return () => clearInterval(t);
  }, [enTraitement, apercu]);

  const basculer = (id) => onCocher?.(coches.includes(id) ? coches.filter((c) => c !== id) : [...coches, id]);
  const tousCoches = documents.length > 0 && coches.length === documents.length;

  const datalist = (
    <datalist id="categories-dossier">
      {CATEGORIES.map((c) => <option key={c} value={c} />)}
    </datalist>
  );

  return (
    <div className="pt-2">
      {datalist}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h3 className="m-0 text-[16px] font-medium text-[#f2f3f5]">Documents du dossier</h3>
        <div className="flex items-center gap-2.5">
          <input
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Rechercher"
            className="bg-[#0c0d10] border border-[#1f2228] focus:border-[#96c0b8]/60 rounded-md px-3.5 py-2 text-[13px] text-[#f2f3f5] outline-none placeholder:text-[#5a615f] transition-colors w-[190px]"
          />
          {proposerDrive && dossier?.drive_folder_url && (
            <a
              href={dossier.drive_folder_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-[12.5px] text-[#c3ddd6] hover:text-[#f2f3f5] transition-colors"
            >
              Dossier Drive <ExternalLink className="w-3 h-3" />
            </a>
          )}
          <button
            onClick={() => inputRef.current?.click()}
            disabled={apercu || importer.isPending || !dossier}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-[13px] border border-[#22262d] text-[#f2f3f5] hover:border-[#3a3f4a] hover:bg-[#f2f3f5]/[0.04] disabled:opacity-50 transition-colors"
          >
            {importer.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Ajouter des fichiers
          </button>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.png,.jpg,.jpeg,.eml"
            className="hidden"
            onChange={(e) => { const fs = Array.from(e.target.files || []); e.target.value = ""; if (fs.length) importer.mutate(fs); }}
          />
        </div>
      </div>

      {documents.length === 0 ? (
        <p className="border-t border-[#15171b] py-10 text-center text-[13px] text-[#6a7180] m-0">
          Aucun document — bail, PV d'assemblée, diagnostics, comptes du locataire : importez ce que vous avez.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse min-w-[720px]">
            <thead>
              <tr className="border-y border-[#15171b]">
                <th className="w-9 py-2.5">
                  <button
                    onClick={() => onCocher?.(tousCoches ? [] : documents.map((d) => d.id))}
                    title={tousCoches ? "Tout décocher" : "Tout cocher"}
                    className={`w-[17px] h-[17px] rounded-[4px] border flex items-center justify-center transition-colors
                      ${tousCoches ? "bg-[#96c0b8] border-[#96c0b8] text-[#000000]" : "border-[#2c3139] hover:border-[#c3ddd6]"}`}
                  >
                    {tousCoches && <Check className="w-3 h-3" />}
                  </button>
                </th>
                {["Nom", "Catégorie", "Analyse", "Type", "Importé le", "Taille"].map((h, i) => (
                  <th key={h} className={`py-2.5 text-[10.5px] tracking-[0.16em] uppercase text-[#6a7180] font-normal ${i >= 2 ? "text-right" : "text-left"}`}>
                    {h}
                  </th>
                ))}
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {visibles.map((d) => {
                const coche = coches.includes(d.id);
                return (
                  <tr key={d.id} className="border-b border-[#15171b] hover:bg-[#f2f3f5]/[0.02] transition-colors">
                    <td className="py-3">
                      <button
                        onClick={() => basculer(d.id)}
                        title={coche ? "Retirer des sources" : "Interroger ce document"}
                        className={`w-[17px] h-[17px] rounded-[4px] border flex items-center justify-center transition-colors
                          ${coche ? "bg-[#96c0b8] border-[#96c0b8] text-[#000000]" : "border-[#2c3139] hover:border-[#c3ddd6]"}`}
                      >
                        {coche && <Check className="w-3 h-3" />}
                      </button>
                    </td>
                    <td className="py-3 pr-4 max-w-[280px]">
                      {renommage?.id === d.id ? (
                        <input
                          autoFocus
                          value={renommage.nom}
                          onChange={(e) => setRenommage({ id: d.id, nom: e.target.value })}
                          onBlur={() => (renommage.nom.trim() && renommage.nom !== d.nom ? majDocument.mutate({ id: d.id, nom: renommage.nom.trim() }) : setRenommage(null))}
                          onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") setRenommage(null); }}
                          className="w-full bg-[#0c0d10] border border-[#96c0b8] rounded px-2 py-1 text-[13.5px] text-[#f2f3f5] outline-none"
                        />
                      ) : (
                        <button onClick={() => !apercu && setRenommage({ id: d.id, nom: d.nom })} className="block w-full text-left text-[13.5px] text-[#f2f3f5] truncate hover:text-[#c3ddd6] transition-colors" title="Cliquer pour renommer">
                          {d.nom}
                        </button>
                      )}
                    </td>
                    <td className="py-3 pr-4">
                      {/* Le menu propose la grille, la saisie reste libre. */}
                      <input
                        list="categories-dossier"
                        defaultValue={d.categorie || ""}
                        key={d.categorie || ""}
                        placeholder="À classer"
                        onBlur={(e) => e.target.value !== (d.categorie || "") && majDocument.mutate({ id: d.id, nom: d.nom, categorie: e.target.value })}
                        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                        disabled={apercu}
                        title={d.categorie_auto ? "Classée automatiquement — corrigez si besoin" : undefined}
                        className={`w-[200px] bg-[#0c0d10] rounded-full px-3 py-1 text-[12px] outline-none focus:border-[#96c0b8]/60 focus:text-[#f2f3f5] transition-colors border
                          ${d.categorie_auto ? "border-[#96c0b8]/40 text-[#96c0b8]" : "border-[#22262d] text-[#9298a6]"}`}
                      />
                    </td>
                    <td className="py-3 pr-4 text-right whitespace-nowrap">
                      {d.extraction?.statut ? (
                        <span
                          className={`text-[12px] ${ETATS[d.extraction.statut]?.classe || "text-[#9298a6]"}`}
                          title={d.extraction.erreur || (d.extraction.statut === "fait" ? `${d.extraction.lignes ?? 0} donnée(s) relevée(s)` : undefined)}
                        >
                          {d.extraction.statut === "en_cours" && <Loader2 className="w-3 h-3 inline mr-1 animate-spin" />}
                          {ETATS[d.extraction.statut]?.libelle || d.extraction.statut}
                          {d.extraction.statut === "fait" && d.extraction.lignes != null ? ` · ${d.extraction.lignes}` : ""}
                        </span>
                      ) : (
                        <span className="text-[12px] text-[#3f4644]">—</span>
                      )}
                    </td>
                    <td className="py-3 text-right text-[13px] text-[#9298a6]">{typeLisible(d.mime)}</td>
                    <td className="py-3 text-right text-[13px] text-[#9298a6]">{isNaN(new Date(d.ajoute_le)) ? "—" : new Date(d.ajoute_le).toLocaleDateString("fr-FR")}</td>
                    <td className="py-3 text-right text-[13px] text-[#f2f3f5]">{tailleLisible(d.taille)}</td>
                    <td className="py-3 text-right relative">
                      <button onClick={() => setMenu(menu === d.id ? null : d.id)} className="text-[#5a615f] hover:text-[#f2f3f5] transition-colors" title="Actions">
                        <MoreHorizontal className="w-4 h-4" />
                      </button>
                      {menu === d.id && (
                        <div className="absolute right-0 top-9 z-20 bg-[#0f1114] border border-[#22262d] rounded-md py-1 min-w-[160px] shadow-xl text-left">
                          <button onClick={() => { setMenu(null); setRenommage({ id: d.id, nom: d.nom }); }} className="block w-full px-3.5 py-2 text-[13px] text-[#c9cdd6] hover:bg-[#f2f3f5]/[0.06]">
                            Renommer
                          </button>
                          {d.url && (
                            <a href={d.url} target="_blank" rel="noopener noreferrer" onClick={() => setMenu(null)} className="block w-full px-3.5 py-2 text-[13px] text-[#c9cdd6] hover:bg-[#f2f3f5]/[0.06]">
                              Ouvrir
                            </a>
                          )}
                          <button onClick={() => { setMenu(null); if (window.confirm(`Supprimer « ${d.nom} » ?`)) supprimer.mutate(d.id); }} className="block w-full px-3.5 py-2 text-[13px] text-red-300 hover:bg-red-500/[0.08]">
                            Supprimer
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Import terminé : on propose le dossier Drive du projet. */}
      {driveDemande && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 px-4" onClick={() => setDriveDemande(false)}>
          <div className="w-full max-w-md bg-[#0f1114] border border-[#1f2228] rounded-lg p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3 mb-3">
              <FolderPlus className="w-5 h-5 text-[#c3ddd6] flex-shrink-0 mt-0.5" />
              <h3 className="m-0 text-[17px] font-medium text-[#f2f3f5]">Créer un dossier Google Drive ?</h3>
            </div>
            <p className="m-0 mb-1.5 text-[13.5px] text-[#9298a6] leading-[1.6]">
              Les documents du dossier seront classés dans votre Drive, sous :
            </p>
            <p className="m-0 mb-5 text-[13.5px] text-[#f2f3f5]">
              {destinationDrive} <span className="text-[#6a7180]">›</span> {titreProjet}
            </p>

            {!compteDrive && (
              <p className="m-0 mb-4 text-[12.5px] text-[#96c0b8] leading-[1.55]">
                Aucun compte Google avec l'accès Drive : connectez-en un depuis le dashboard
                (GOOGLE_DRIVE doit être actif côté serveur).
              </p>
            )}

            <div className="flex justify-end gap-2.5">
              <button
                onClick={() => setDriveDemande(false)}
                className="bg-transparent border border-[#f2f3f5]/[0.14] text-[#c9cdd6] rounded-md px-4 py-2.5 text-[13.5px] font-semibold hover:bg-[#f2f3f5]/[0.06] transition-colors"
              >
                Non, plus tard
              </button>
              <button
                onClick={() => creerDrive.mutate()}
                disabled={!compteDrive || creerDrive.isPending}
                className="inline-flex items-center gap-2 text-[#0f1114] bg-[#f2f3f5] rounded-md px-5 py-2.5 text-[13.5px] font-bold disabled:opacity-50 hover:brightness-95 transition-all"
              >
                {creerDrive.isPending ? <><Loader2 className="w-4 h-4 animate-spin" />Création…</> : "Oui, créer le dossier"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
