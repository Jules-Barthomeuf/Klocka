import React, { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { Loader2, X } from "lucide-react";
import DocumentsDossier from "./DocumentsDossier";
import SimulateurAnalyse from "./SimulateurAnalyse";
import DonneesExtraites from "./DonneesExtraites";

// L'étape Analyse : un onglet Documents (la liste cochable) puis un onglet par
// document extrait, chacun présentant ses données extraites. Chaque ligne
// porte sa source — un clic ouvre le document à la bonne page.

// Les visionneuses PDF acceptent #page=N ; pour le reste on ouvre le fichier.
const lienSource = (url, page) => (!url ? null : page && /\.pdf($|\?)/i.test(url) ? `${url}#page=${page}` : url);


// Ce que le navigateur sait afficher dans un cadre : PDF, images, texte. Le
// reste (Word, tableurs) se télécharge — on propose alors le lien.
const lisibleEnCadre = (url, mime) => {
  const m = String(mime || "");
  if (m.includes("pdf") || m.startsWith("image/") || m.startsWith("text/")) return true;
  return /\.(pdf|png|jpe?g|gif|webp|txt|csv|md)($|\?)/i.test(String(url || ""));
};

function Visionneuse({ extraction, ligne, onFermer }) {
  const page = ligne?.page || null;
  const url = lienSource(extraction.document_url, page);
  const affichable = lisibleEnCadre(extraction.document_url, extraction.document_mime);

  return (
    <div className="bg-[#000000] border border-[#1f2228] rounded-md overflow-hidden flex flex-col h-[560px] lg:sticky lg:top-4">
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-[#22262d] flex-shrink-0">
        <div className="min-w-0 flex-1">
          <p className="m-0 text-[12.5px] text-[#f2f3f5] truncate">{extraction.document_nom}</p>
          <p className="m-0 text-[11px] text-[#6a7180] truncate">
            {ligne?.element}{page ? ` · page ${page}` : ""}
          </p>
        </div>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11.5px] text-[#c3ddd6] hover:text-[#f2f3f5] transition-colors flex-shrink-0"
        >
          Plein écran
        </a>
        <button onClick={onFermer} className="text-[#6a7180] hover:text-[#f2f3f5] transition-colors flex-shrink-0" title="Fermer">
          <X className="w-4 h-4" />
        </button>
      </div>

      {affichable ? (
        <iframe
          key={url}
          src={url}
          title={extraction.document_nom}
          className="flex-1 w-full bg-[#0c0d10] border-0"
        />
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6 text-center">
          <p className="m-0 text-[13px] text-[#9298a6]">
            Ce format ne s'affiche pas dans le navigateur.
          </p>
          <a href={url} target="_blank" rel="noopener noreferrer" className="text-[13px] text-[#c3ddd6] hover:text-[#f2f3f5] transition-colors">
            Ouvrir le document
          </a>
        </div>
      )}

      {ligne?.citation && (
        <div className="px-4 py-2.5 border-t border-[#22262d] flex-shrink-0">
          <p className="m-0 text-[11.5px] text-[#9298a6] italic leading-[1.5]">« {ligne.citation} »</p>
        </div>
      )}
    </div>
  );
}


function TableExtraction({ extraction, dealId, onSupprimer, onRefresh }) {
  const [recherche, setRecherche] = useState("");
  const [edition, setEdition] = useState(null); // { index, champ }
  // Ligne dont la source est ouverte dans la visionneuse, à droite.
  const [ligneOuverte, setLigneOuverte] = useState(null);

  // Une analyse ratée se relance sur le même document.
  const reessayer = useMutation({
    mutationFn: () => base44.request("POST", `/api/preanalyse/dossiers/${dealId}/espace/extraire`, { body: { documents: [extraction.document_id] } }),
    onSuccess: () => { toast.success("Analyse relancée"); onRefresh?.(); },
    onError: (e) => toast.error(e?.message || "Relance impossible"),
  });

  const majLigne = useMutation({
    mutationFn: ({ index, ...patch }) =>
      base44.request("POST", `/api/preanalyse/dossiers/${dealId}/espace/extractions/${extraction.id}/lignes/${index}`, { body: patch }),
    onSuccess: () => { setEdition(null); onRefresh?.(); },
    onError: (e) => toast.error(e?.message || "Modification impossible"),
  });

  const lignes = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    const toutes = (extraction.lignes || []).map((l, index) => ({ ...l, index }));
    if (!q) return toutes;
    return toutes.filter(
      (l) => l.element.toLowerCase().includes(q) || String(l.constat).toLowerCase().includes(q)
    );
  }, [extraction.lignes, recherche]);

  if (extraction.erreur) {
    return (
      <div className="border-t border-[#22262d] py-10 text-center">
        <p className="m-0 text-[13.5px] text-[#e8746a]">L'analyse a échoué : {extraction.erreur}</p>
        <p className="m-0 mt-2 text-[12.5px] text-[#6a7180]">
          Le plus souvent : quota du modèle atteint, ou document illisible (scan sans texte). Relancez — le document est relu tel quel.
        </p>
        <button
          onClick={() => reessayer.mutate()}
          disabled={reessayer.isPending}
          className="mt-5 inline-flex items-center gap-2 px-4 py-2 bg-[#f2f3f5] text-[#0b0c0e] text-[11px] tracking-[.14em] uppercase font-semibold rounded-[10px] hover:bg-[#ffffff] disabled:opacity-50"
        >
          {reessayer.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
          Relancer l'analyse
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div />
        <div className="flex items-center gap-2.5">
          <input
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Rechercher"
            className="bg-[#0c0d10] border border-[#1f2228] focus:border-[#96c0b8]/60 rounded-md px-3.5 py-1.5 text-[12.5px] text-[#f2f3f5] outline-none placeholder:text-[#5a615f] transition-colors w-[170px]"
          />
          <button onClick={() => onSupprimer?.(extraction.id)} className="text-[12.5px] text-[#6a7180] hover:text-red-400 transition-colors" title="Retirer cette extraction">
            Retirer
          </button>
        </div>
      </div>

      {extraction.synthese && (
        <p className="m-0 mb-4 text-[13.5px] leading-[1.7] text-[#c9cdd6] border-l-2 border-[#22262d] pl-4">{extraction.synthese}</p>
      )}

      <div className={ligneOuverte ? "grid lg:grid-cols-[minmax(0,1fr)_minmax(0,480px)] gap-5 items-start" : ""}>
      <div className="overflow-x-auto min-w-0">
        <table
          className={`w-full border-collapse ${ligneOuverte ? "min-w-[560px]" : "min-w-[860px]"}
            [&_th]:border-r [&_td]:border-r [&_th]:border-[#22262d] [&_td]:border-[#22262d]
            [&_th:last-child]:border-r-0 [&_td:last-child]:border-r-0
            [&_th]:pl-3 [&_td]:pl-3`}
        >
          <thead>
            <tr className="border-y border-[#2c3139]">
              {(ligneOuverte
                ? [["Élément", "w-[24%]"], ["Constat / valeur relevée", "w-[40%]"], ["Source", "w-[12%]"], ["Commentaire", "w-[24%]"]]
                : [["Élément", "w-[22%]"], ["Constat / valeur relevée", "w-[38%]"], ["Source", "w-[12%]"], ["Commentaire", "w-[28%]"]]
              ).map(([h, cls]) => (
                <th key={h} className={`py-2.5 text-[10.5px] tracking-[0.16em] uppercase text-[#f2f3f5] font-normal text-left ${cls}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lignes.map((l, i) => {
              const lien = lienSource(extraction.document_url, l.page);
              const ouverte = ligneOuverte?.index === l.index;
              const nouveauBloc = l.bloc && (i === 0 || lignes[i - 1].bloc !== l.bloc);
              const teinte = l.statut === "Point de vigilance" ? "#e8746a" : l.statut === "À vérifier" ? "#d9b46a" : l.statut === "Conforme" ? "#96c0b8" : "#3a3f4a";
              return (
                <React.Fragment key={l.index}>
                {nouveauBloc && (
                  <tr className="border-b border-[#22262d] bg-[#0f1114]">
                    <td colSpan={4} className="py-2 text-[10.5px] tracking-[.16em] uppercase text-[#c3ddd6]">{l.bloc}</td>
                  </tr>
                )}
                <tr
                  className={`border-b border-[#22262d] transition-colors align-top ${ouverte ? "bg-[#96c0b8]/[0.07]" : "hover:bg-[#f2f3f5]/[0.02]"}`}
                >
                  <td className="py-3 pr-4 text-[13px] text-[#f2f3f5]">
                    <span className="inline-block w-2 h-2 rounded-full mr-2 align-middle" style={{ background: teinte }} title={l.statut || "Non renseigné"} />
                    {l.element}
                  </td>

                  <td className="py-3 pr-4">
                    {edition?.index === l.index && edition.champ === "constat" ? (
                      <textarea
                        autoFocus
                        rows={2}
                        defaultValue={l.constat}
                        onBlur={(e) => majLigne.mutate({ index: l.index, constat: e.target.value })}
                        onKeyDown={(e) => { if (e.key === "Escape") setEdition(null); }}
                        className="w-full bg-[#0c0d10] border border-[#96c0b8] rounded px-2 py-1 text-[13px] text-[#f2f3f5] outline-none resize-y"
                      />
                    ) : (
                      <button
                        onClick={() => setEdition({ index: l.index, champ: "constat" })}
                        className="block w-full text-left text-[13.5px] text-[#f2f3f5] hover:text-[#c3ddd6] transition-colors"
                        title="Cliquer pour corriger"
                      >
                        {l.constat || <span className="text-[#3a3f4a]">—</span>}
                        {l.citation && (
                          <span className="block mt-1 text-[11.5px] text-[#5a615f] italic leading-[1.5]">« {l.citation} »</span>
                        )}
                      </button>
                    )}
                  </td>


                  <td className="py-3 pr-4 whitespace-nowrap">
                    {lien ? (
                      <button
                        onClick={() => setLigneOuverte(ligneOuverte?.index === l.index ? null : l)}
                        className={`text-[12.5px] transition-colors ${ouverte ? "text-[#f2f3f5] underline" : "text-[#c3ddd6] hover:text-[#f2f3f5]"}`}
                        title={l.citation || "Afficher le document ici"}
                      >
                        {l.page ? `page ${l.page}` : "voir"}
                      </button>
                    ) : (
                      <span className="text-[12.5px] text-[#3f4644]">—</span>
                    )}
                  </td>

                  <td className="py-3 pr-4">
                    {edition?.index === l.index && edition.champ === "commentaire" ? (
                      <textarea
                        autoFocus
                        rows={2}
                        defaultValue={l.commentaire}
                        onBlur={(e) => majLigne.mutate({ index: l.index, commentaire: e.target.value })}
                        onKeyDown={(e) => { if (e.key === "Escape") setEdition(null); }}
                        className="w-full bg-[#0c0d10] border border-[#96c0b8] rounded px-2 py-1 text-[13px] text-[#f2f3f5] outline-none resize-y"
                      />
                    ) : (
                      <button
                        onClick={() => setEdition({ index: l.index, champ: "commentaire" })}
                        className="block w-full text-left text-[12.5px] text-[#9298a6] hover:text-[#f2f3f5] transition-colors"
                        title="Cliquer pour commenter"
                      >
                        {l.commentaire || <span className="text-[#3f4644]">+ commenter</span>}
                      </button>
                    )}
                  </td>

                </tr>
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {ligneOuverte && (
        <Visionneuse extraction={extraction} ligne={ligneOuverte} onFermer={() => setLigneOuverte(null)} />
      )}
      </div>
    </div>
  );
}

// L'onglet d'une analyse porte la nature du document, pas son nom de fichier.
const LIBELLE_TYPE = {
  bail: "bail",
  pv_ag: "PV d'AG",
  rcp: "RCP",
  quittances: "quittances",
  diagnostics: "diagnostics",
};
export function nomOnglet(e) {
  if (e.titre) return e.titre;
  const nature = LIBELLE_TYPE[e.type] || (e.document_categorie || "").toLowerCase();
  return nature ? `Analyse ${nature}` : `Analyse — ${e.document_nom}`;
}

export default function AnalyseDocuments({ dossier, coches, onCocher, onRefresh, apercu = false, onglet: ongletDemande, onOnglet }) {
  const [ongletLocal, setOngletLocal] = useState("documents");
  // L'onglet peut être piloté depuis « Requêtes récentes » : le parent en tient
  // alors l'état, sinon on le garde ici.
  const onglet = ongletDemande ?? ongletLocal;
  const setOnglet = (v) => { setOngletLocal(v); onOnglet?.(v); };
  const extractions = dossier?.extractions || [];

  const [renommage, setRenommage] = useState(null);

  const renommer = useMutation({
    mutationFn: ({ id, titre }) =>
      base44.request("POST", `/api/preanalyse/dossiers/${dossier.deal_id}/espace/extractions/${id}/renommer`, { body: { titre } }),
    onSuccess: () => { setRenommage(null); onRefresh?.(); },
    onError: (e) => toast.error(e?.message || "Renommage impossible"),
  });

  const supprimer = useMutation({
    mutationFn: (id) => base44.request("DELETE", `/api/preanalyse/dossiers/${dossier.deal_id}/espace/extractions/${id}`),
    onSuccess: () => { setOnglet("documents"); onRefresh?.(); },
    onError: (e) => toast.error(e?.message || "Suppression impossible"),
  });

  const actif = extractions.find((e) => e.id === onglet) || null;

  return (
    <div>
      {/* Onglets : Documents, un par document extrait, puis le simulateur */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-[#22262d] mb-4">
          <button
            onClick={() => setOnglet("documents")}
            className={`text-[12.5px] pb-2 border-b-2 -mb-px transition-colors ${onglet === "documents" ? "border-[#96c0b8] text-[#f2f3f5]" : "border-transparent text-[#9298a6] hover:text-[#f2f3f5]"}`}
          >
            Documents
          </button>

          {/* Deuxième onglet : le simulateur, avant les analyses. */}
          <button
            onClick={() => setOnglet("simulateur")}
            className={`text-[12.5px] pb-2 border-b-2 -mb-px transition-colors ${onglet === "simulateur" ? "border-[#96c0b8] text-[#f2f3f5]" : "border-transparent text-[#9298a6] hover:text-[#f2f3f5]"}`}
          >
            Simulateur
          </button>

          {/* Dès qu'un document est extrait : ce qui ira dans la fiche projet. */}
          {extractions.length > 0 && (
            <button
              onClick={() => setOnglet("donnees")}
              title="Ce que l'extraction remplira dans le projet"
              className={`text-[12.5px] pb-2 border-b-2 -mb-px transition-colors ${onglet === "donnees" ? "border-[#96c0b8] text-[#f2f3f5]" : "border-transparent text-[#9298a6] hover:text-[#f2f3f5]"}`}
            >
              Données extraites
            </button>
          )}

          {extractions.map((e) =>
            renommage?.id === e.id ? (
              <input
                key={e.id}
                autoFocus
                defaultValue={renommage.titre}
                onBlur={(ev) => renommer.mutate({ id: e.id, titre: ev.target.value })}
                onKeyDown={(ev) => {
                  if (ev.key === "Enter") ev.currentTarget.blur();
                  if (ev.key === "Escape") setRenommage(null);
                }}
                className="mb-2 w-[180px] bg-[#0c0d10] border border-[#96c0b8] rounded px-2 py-0.5 text-[12.5px] text-[#f2f3f5] outline-none"
              />
            ) : (
              <button
                key={e.id}
                onClick={() => (onglet === e.id ? setRenommage({ id: e.id, titre: nomOnglet(e) }) : setOnglet(e.id))}
                onDoubleClick={() => setRenommage({ id: e.id, titre: nomOnglet(e) })}
                title={onglet === e.id ? "Cliquer pour renommer" : e.document_nom}
                className={`text-[12.5px] pb-2 border-b-2 -mb-px max-w-[220px] truncate transition-colors ${onglet === e.id ? "border-[#96c0b8] text-[#f2f3f5]" : "border-transparent text-[#9298a6] hover:text-[#f2f3f5]"}`}
              >
                {nomOnglet(e)}
                {e.erreur ? " ⚠" : ` · ${(e.lignes || []).filter((l) => l.constat).length}/${(e.lignes || []).length}`}
              </button>
            )
          )}

      </div>

      {onglet === "simulateur" ? (
        <SimulateurAnalyse dossier={dossier} />
      ) : onglet === "donnees" ? (
        <DonneesExtraites dossier={dossier} apercu={apercu} />
      ) : onglet === "documents" || !actif ? (
        <DocumentsDossier dossier={dossier} coches={coches} onCocher={onCocher} onRefresh={onRefresh} apercu={apercu} proposerDrive />
      ) : (
        <TableExtraction extraction={actif} dealId={dossier.deal_id} onSupprimer={(id) => supprimer.mutate(id)} onRefresh={onRefresh} />
      )}
    </div>
  );
}
