import React, { useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { Loader2, MoreHorizontal, Check } from "lucide-react";

// Les documents du dossier, en tableau : case à cocher pour les soumettre au
// chat, nom modifiable, catégorie, type, date et taille, et un menu ⋯ par ligne.

// Les cinq premières correspondent à la grille de lecture : classer un
// document lui donne les éléments à relever lors du dépouillement.
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

export default function DocumentsDossier({ dossier, coches = [], onCocher, onRefresh, apercu = false }) {
  const inputRef = useRef(null);
  const [menu, setMenu] = useState(null);
  const [renommage, setRenommage] = useState(null);
  const [recherche, setRecherche] = useState("");

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
    onSuccess: (_, fichiers) => { toast.success(`${fichiers.length} document${fichiers.length > 1 ? "s" : ""} importé${fichiers.length > 1 ? "s" : ""}`); onRefresh?.(); },
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
        <h3 className="m-0 text-[16px] font-medium text-[#edeae5]">Documents du dossier</h3>
        <div className="flex items-center gap-2.5">
          <input
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Rechercher"
            className="bg-[#101413] border border-[#242726] focus:border-[#35a79b]/60 rounded-md px-3.5 py-2 text-[13px] text-[#edeae5] outline-none placeholder:text-[#5a615f] transition-colors w-[190px]"
          />
          <button
            onClick={() => inputRef.current?.click()}
            disabled={apercu || importer.isPending || !dossier}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-[13px] border border-[#2e3230] text-[#edeae5] hover:border-[#565b59] hover:bg-[#edeae5]/[0.04] disabled:opacity-50 transition-colors"
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
        <p className="border-t border-[#1c1f1e] py-10 text-center text-[13px] text-[#6b7270] m-0">
          Aucun document — bail, PV d'assemblée, diagnostics, comptes du locataire : importez ce que vous avez.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse min-w-[720px]">
            <thead>
              <tr className="border-y border-[#1c1f1e]">
                <th className="w-9 py-2.5">
                  <button
                    onClick={() => onCocher?.(tousCoches ? [] : documents.map((d) => d.id))}
                    title={tousCoches ? "Tout décocher" : "Tout cocher"}
                    className={`w-[17px] h-[17px] rounded-[4px] border flex items-center justify-center transition-colors
                      ${tousCoches ? "bg-[#35a79b] border-[#35a79b] text-[#0a0c0c]" : "border-[#3a3e3c] hover:border-[#7fd3c9]"}`}
                  >
                    {tousCoches && <Check className="w-3 h-3" />}
                  </button>
                </th>
                {["Nom", "Catégorie", "Type", "Importé le", "Taille"].map((h, i) => (
                  <th key={h} className={`py-2.5 text-[10.5px] tracking-[0.16em] uppercase text-[#6b7270] font-normal ${i >= 2 ? "text-right" : "text-left"}`}>
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
                  <tr key={d.id} className="border-b border-[#1c1f1e] hover:bg-[#edeae5]/[0.02] transition-colors">
                    <td className="py-3">
                      <button
                        onClick={() => basculer(d.id)}
                        title={coche ? "Retirer des sources" : "Interroger ce document"}
                        className={`w-[17px] h-[17px] rounded-[4px] border flex items-center justify-center transition-colors
                          ${coche ? "bg-[#35a79b] border-[#35a79b] text-[#0a0c0c]" : "border-[#3a3e3c] hover:border-[#7fd3c9]"}`}
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
                          className="w-full bg-[#101413] border border-[#35a79b] rounded px-2 py-1 text-[13.5px] text-[#edeae5] outline-none"
                        />
                      ) : (
                        <button onClick={() => !apercu && setRenommage({ id: d.id, nom: d.nom })} className="block w-full text-left text-[13.5px] text-[#edeae5] truncate hover:text-[#7fd3c9] transition-colors" title="Cliquer pour renommer">
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
                        className="w-[200px] bg-[#101413] border border-[#2e3230] rounded-full px-3 py-1 text-[12px] text-[#9aa19e] outline-none focus:border-[#35a79b]/60 focus:text-[#edeae5] transition-colors"
                      />
                    </td>
                    <td className="py-3 text-right text-[13px] text-[#9aa19e]">{typeLisible(d.mime)}</td>
                    <td className="py-3 text-right text-[13px] text-[#9aa19e]">{isNaN(new Date(d.ajoute_le)) ? "—" : new Date(d.ajoute_le).toLocaleDateString("fr-FR")}</td>
                    <td className="py-3 text-right text-[13px] text-[#edeae5]">{tailleLisible(d.taille)}</td>
                    <td className="py-3 text-right relative">
                      <button onClick={() => setMenu(menu === d.id ? null : d.id)} className="text-[#5a615f] hover:text-[#edeae5] transition-colors" title="Actions">
                        <MoreHorizontal className="w-4 h-4" />
                      </button>
                      {menu === d.id && (
                        <div className="absolute right-0 top-9 z-20 bg-[#121413] border border-[#303332] rounded-md py-1 min-w-[160px] shadow-xl text-left">
                          <button onClick={() => { setMenu(null); setRenommage({ id: d.id, nom: d.nom }); }} className="block w-full px-3.5 py-2 text-[13px] text-[#d3d8d6] hover:bg-[#edeae5]/[0.06]">
                            Renommer
                          </button>
                          {d.url && (
                            <a href={d.url} target="_blank" rel="noopener noreferrer" onClick={() => setMenu(null)} className="block w-full px-3.5 py-2 text-[13px] text-[#d3d8d6] hover:bg-[#edeae5]/[0.06]">
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
    </div>
  );
}
