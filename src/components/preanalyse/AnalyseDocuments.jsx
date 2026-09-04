import React, { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { ChevronDown, Loader2, X } from "lucide-react";
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
  // Le relevé est là dès l'ouverture — c'est lui qu'on vient lire ; la revue
  // des points à regarder le précède, elle ne le remplace pas.
  const [tableOuverte, setTableOuverte] = useState(true);

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

  const vigilances = (extraction.lignes || []).map((l, index) => ({ ...l, index })).filter((l) => l.statut === "Point de vigilance");
  const aVerifier = (extraction.lignes || []).map((l, index) => ({ ...l, index })).filter((l) => l.statut === "À vérifier");
  const renseignees = (extraction.lignes || []).filter((l) => l.constat).length;

  return (
    <div>
      {/* --- L'analyse en tête : ce qu'elle est, ce qu'elle a trouvé --------- */}
      <div className="flex flex-wrap items-baseline justify-between gap-4 pb-5 border-b border-[#1e1e22]">
        <div className="min-w-0">
          <h3 className="m-0 text-[26px] max-md:text-[21px] font-bold tracking-[-.015em] text-[#f2f3f5]">{nomOnglet(extraction)}</h3>
          <p className="m-0 mt-1 text-[13px] text-[#77777e]">
            {[
              `${renseignees}/${(extraction.lignes || []).length} points relevés`,
              extraction.extrait_par,
              extraction.extrait_le ? ilYA(extraction.extrait_le) : null,
            ].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div className="flex items-center gap-5 text-[13px] flex-shrink-0">
          {vigilances.length > 0 && <span className="font-semibold text-[#e8927c]">{vigilances.length} vigilance{vigilances.length > 1 ? "s" : ""}</span>}
          {aVerifier.length > 0 && <span className="font-semibold text-[#8fb6e8]">{aVerifier.length} à vérifier</span>}
          {!vigilances.length && !aVerifier.length && <span className="text-[#7fd1a8] font-semibold">Rien à signaler</span>}
        </div>
      </div>

      {/* --- Ce qui décide, en deux colonnes -------------------------------- */}
      {(vigilances.length > 0 || aVerifier.length > 0) && (
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_1px_minmax(0,1fr)] gap-x-8 gap-y-8 py-7">
          <Colonne titre="Points de vigilance" teinte="#e8927c" lignes={vigilances} onOuvrir={setLigneOuverte} />
          <div className="hidden xl:block w-px h-full bg-[#1e1e22]" />
          <Colonne titre="À vérifier" teinte="#8fb6e8" lignes={aVerifier} onOuvrir={setLigneOuverte} />
        </div>
      )}

      {extraction.synthese && !(vigilances.length + aVerifier.length) && (
        <p className="m-0 mb-5 text-[13.5px] leading-[1.7] text-[#b5b5bd] border-l-2 border-[#1e1e22] pl-4">{extraction.synthese}</p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 mb-3 pt-1">
        <button
          onClick={() => setTableOuverte((v) => !v)}
          className="inline-flex items-center gap-2 text-[13px] text-[#8f959e] hover:text-[#f2f3f5] transition-colors"
        >
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${tableOuverte ? "" : "-rotate-90"}`} />
          Données extraites ({(extraction.lignes || []).length})
        </button>
        <div className={`flex items-center gap-2.5 ${tableOuverte ? "" : "hidden"}`}>
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

      <div className={`${tableOuverte || ligneOuverte ? "" : "hidden"} ${ligneOuverte ? "grid lg:grid-cols-[minmax(0,1fr)_minmax(0,480px)] gap-5 items-start" : ""}`}>
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

// Le modèle redit parfois le constat dans le commentaire : on ne l'écrit
// qu'une fois. Comparaison à la ponctuation et aux accents près.
const aplati = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const memeTexte = (a, b) => {
  const x = aplati(a);
  const y = aplati(b);
  if (!x || !y) return false;
  return x === y || (x.length > 24 && (y.includes(x) || x.includes(y)));
};

// Une colonne de la revue : le point, ce que dit le document, ce qu'on en
// pense. Au-delà de deux points, le reste se déplie.
function Colonne({ titre, teinte, lignes, onOuvrir }) {
  const [tout, setTout] = useState(false);
  if (!lignes.length) return <div />;
  const montres = tout ? lignes : lignes.slice(0, 2);
  const reste = lignes.length - montres.length;
  return (
    <section className="min-w-0 flex flex-col gap-6">
      <p className="m-0 text-[12px] tracking-[.16em] uppercase font-semibold" style={{ color: teinte }}>{titre}</p>
      {montres.map((l) => (
        <button
          key={l.index}
          onClick={() => onOuvrir?.(l)}
          title={l.page ? `Ouvrir le document page ${l.page}` : undefined}
          className="text-left flex flex-col gap-2 group"
        >
          <span className="text-[16px] font-semibold text-[#f2f3f5] group-hover:text-[#ffffff] transition-colors">{l.element}</span>
          {l.constat && <span className="text-[14px] leading-[1.65] text-[#b5b5bd]">{l.constat}</span>}
          {l.commentaire && !memeTexte(l.commentaire, l.constat) && (
            <span className="text-[13.5px] leading-[1.6]" style={{ color: teinte === "#e8927c" ? "#e8b04c" : teinte }}>→ {l.commentaire}</span>
          )}
        </button>
      ))}
      {reste > 0 && (
        <button onClick={() => setTout(true)} className="text-left text-[13px] text-[#6c6c74] hover:text-[#b5b5bd] transition-colors">
          + {reste} autre{reste > 1 ? "s" : ""} point{reste > 1 ? "s" : ""}
        </button>
      )}
    </section>
  );
}

// Depuis quand : « il y a 18 h », « il y a 3 j ».
function ilYA(iso) {
  const ms = Date.now() - new Date(iso).getTime();
  if (!isFinite(ms) || ms < 0) return "";
  const h = Math.round(ms / 3600000);
  if (h < 1) return "à l'instant";
  if (h < 48) return `il y a ${h} h`;
  return `il y a ${Math.round(h / 24)} j`;
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
      {/* --- À gauche les analyses, à droite celle qu'on lit ------------- */}
      <div className="flex max-lg:flex-col gap-0 border border-[#1e1e22] rounded-[18px] overflow-hidden bg-[#0f0f11]">
        <nav className="w-[264px] max-lg:w-full flex-none border-r max-lg:border-r-0 max-lg:border-b border-[#1e1e22] py-5 flex flex-col">
          {extractions.length > 0 && (
            <>
              <p className="m-0 px-6 pb-3 text-[11px] tracking-[.16em] uppercase text-[#5f5f66]">Analyses</p>
              {extractions.map((e) => {
                const choisi = onglet === e.id;
                const total = (e.lignes || []).length;
                const faites = (e.lignes || []).filter((l) => l.constat).length;
                const complet = total > 0 && faites === total;
                return renommage?.id === e.id ? (
                  <input
                    key={e.id}
                    autoFocus
                    defaultValue={renommage.titre}
                    onBlur={(ev) => renommer.mutate({ id: e.id, titre: ev.target.value })}
                    onKeyDown={(ev) => { if (ev.key === "Enter") ev.currentTarget.blur(); if (ev.key === "Escape") setRenommage(null); }}
                    className="mx-6 my-1 bg-[#0c0d10] border border-[#96c0b8] rounded px-2 py-1 text-[14px] text-[#f2f3f5] outline-none"
                  />
                ) : (
                  <button
                    key={e.id}
                    onClick={() => (choisi ? setRenommage({ id: e.id, titre: nomOnglet(e) }) : setOnglet(e.id))}
                    onDoubleClick={() => setRenommage({ id: e.id, titre: nomOnglet(e) })}
                    title={choisi ? "Cliquer pour renommer" : e.document_nom}
                    className={`w-full text-left px-6 py-2.5 border-l-2 flex items-baseline justify-between gap-3 transition-colors ${
                      choisi ? "border-[#e8927c] bg-[#e8927c]/[0.05] text-[#f2f3f5]" : "border-transparent text-[#97979f] hover:text-[#f2f3f5]"
                    }`}
                  >
                    <span className={`text-[14px] truncate ${choisi ? "font-semibold" : ""}`}>{nomOnglet(e)}</span>
                    <span
                      className="text-[11px] flex-none tabular-nums"
                      style={{ color: e.erreur ? "#e8746a" : complet ? "#7fd1a8" : "#e8b04c" }}
                    >
                      {e.erreur ? "⚠" : `${faites}/${total}`}
                    </span>
                  </button>
                );
              })}
              <div className="h-px bg-[#1e1e22] mx-6 my-3.5" />
            </>
          )}
          {[
            ["documents", "Documents"],
            ...(extractions.length ? [["donnees", "Données extraites"]] : []),
            ["simulateur", "Simulateur"],
          ].map(([id, libelle]) => (
            <button
              key={id}
              onClick={() => setOnglet(id)}
              className={`w-full text-left px-6 py-2.5 border-l-2 text-[14px] transition-colors ${
                onglet === id ? "border-[#e8927c] bg-[#e8927c]/[0.05] text-[#f2f3f5] font-semibold" : "border-transparent text-[#97979f] hover:text-[#f2f3f5]"
              }`}
            >
              {libelle}
            </button>
          ))}
        </nav>

        <div className="flex-1 min-w-0 px-9 max-md:px-5 py-7">
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
      </div>
    </div>
  );
}
