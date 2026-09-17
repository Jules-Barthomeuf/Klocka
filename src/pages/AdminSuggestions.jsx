/* eslint-disable no-restricted-syntax -- palette de données.
   Les couleurs de ce fichier ne sont pas des choix de design : ce sont des
   échelles qui portent un sens (classes DPE, séries d'un graphique, teintes
   d'une carte). Elles ne suivent pas la marque et ne doivent pas la suivre. */
import React, { useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useUser } from "@/components/providers/UserProvider";
import { Check, ChevronDown, Copy, Image as ImageIcon, Loader2, Mic, Pencil, Square, Trash2, X } from "lucide-react";
import { useDictee } from "@/lib/dictee";
import { toast } from "@/components/ui/avis";
import BoiteSaisie, { BoutonBarre } from "@/components/BoiteSaisie";
import { J } from "@/design/jetons";

// Le feedback : un chat, une capture d'écran si on veut, rien d'autre. Chaque
// remarque a un état qu'on change d'un clic : à faire, en cours, fait, refusé.

// L'urgence, de 1 à 5 : on la règle au curseur en écrivant, on la lit d'un
// coup d'œil ensuite. Cinq crans, du gris au corail.
const URGENCES = [
  { n: 1, mot: "Quand vous pouvez", teinte: J["brume"] },
  { n: 2, mot: "Peu pressé", teinte: J["brume"] },
  { n: 3, mot: "Normal", teinte: J["menthe"] },
  { n: 4, mot: "Pressé", teinte: J["ambre"] },
  { n: 5, mot: "Urgent", teinte: J["alerte"] },
];
const urgenceDe = (n) => URGENCES[Math.min(5, Math.max(1, Number(n) || 3)) - 1];

const STATUTS = [
  { id: "nouveau", label: "À faire", fond: J["bord-doux"] },
  { id: "en_cours", label: "En cours", fond: "#a8752a" },
  { id: "termine", label: "Fait", fond: "#2f7a5a" },
  { id: "refuse", label: "Refusé", fond: "#9b3b32" },
];
// Les anciens états « accepté » se lisent comme « en cours ».
const normaliser = (s) => (STATUTS.some((x) => x.id === s) ? s : s === "accepte" ? "en_cours" : "nouveau");

const quand = (iso) => {
  if (!iso || isNaN(new Date(iso))) return "";
  const d = new Date(iso);
  return `${d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })} · ${d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`;
};

// Le prompt rédigé pour Claude, sous une remarque née d'un pouce : on le copie,
// on le colle, il corrige la cause. L'échange se déplie en dessous.
function PromptCorrection({ r }) {
  const [copie, setCopie] = useState(false);
  const [echange, setEchange] = useState(false);
  const copier = async () => {
    try { await navigator.clipboard.writeText(r.prompt_correction); setCopie(true); setTimeout(() => setCopie(false), 1800); }
    catch { window.prompt("Copiez le prompt :", r.prompt_correction); }
  };
  const bas = r.pouce === "bas";
  return (
    <div className="mt-3 rounded-xl border border-bord bg-surface px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <p className="m-0 text-[11px] tracking-[.18em] uppercase" style={{ color: bas ? J["alerte"] : J["menthe"] }}>
          {bas ? "À corriger" : "À préserver"} — prompt pour Claude
        </p>
        <button onClick={copier} className="inline-flex items-center gap-1.5 text-[12.5px] px-3 py-1 rounded-full border border-bord-doux text-craie hover:text-encre hover:border-bord-vif">
          {copie ? <Check className="w-3 h-3 text-menthe" /> : <Copy className="w-3 h-3" />}{copie ? "Copié" : "Copier"}
        </button>
      </div>
      <p className="m-0 mt-2 text-[12.5px] leading-[1.6] text-craie whitespace-pre-wrap max-h-[240px] overflow-y-auto">{r.prompt_correction}</p>
      {r.echange?.reponse && (
        <>
          <button onClick={() => setEchange((o) => !o)} className="mt-2 inline-flex items-center gap-1.5 text-[12.5px] text-brume hover:text-craie">
            <ChevronDown className={`w-3 h-3 transition-transform ${echange ? "rotate-180" : ""}`} /> {echange ? "Replier l'échange" : "Voir l'échange"}
          </button>
          {echange && (
            <div className="mt-2 space-y-2 border-t border-trait pt-2">
              {r.echange.question && <p className="m-0 text-[12.5px] leading-[1.6] text-ardoise whitespace-pre-wrap"><span className="text-brume">Question — </span>{r.echange.question}</p>}
              <p className="m-0 text-[12.5px] leading-[1.6] text-craie whitespace-pre-wrap"><span className="text-brume">Réponse — </span>{r.echange.reponse}</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function AdminSuggestions() {
  const user = useUser();
  const queryClient = useQueryClient();
  const [texte, setTexte] = useState("");
  const [capture, setCapture] = useState(null); // File
  const [apercu, setApercu] = useState(null); // URL locale
  const [filtre, setFiltre] = useState("tous");
  const [zoom, setZoom] = useState(null);
  const [urgence, setUrgence] = useState(3);
  const [tri, setTri] = useState("date"); // date | urgence
  const [edition, setEdition] = useState(null); // { id, texte }
  const fichierRef = useRef(null);
  // Le micro : la dictée remplit le champ, on relit, on envoie.
  const { supporte: dicteeOk, ecoute, demarrer, arreter } = useDictee({ onTexte: (t) => setTexte(t) });

  const { data: remarques = [], isLoading } = useQuery({
    queryKey: ["all-suggestions"],
    queryFn: () => base44.entities.Suggestion.list("-created_date"),
    initialData: [],
  });
  const rafraichir = () => queryClient.invalidateQueries({ queryKey: ["all-suggestions"] });

  const choisirCapture = (f) => {
    if (!f || !f.type.startsWith("image/")) return;
    setCapture(f);
    setApercu(URL.createObjectURL(f));
  };
  const retirerCapture = () => { setCapture(null); if (apercu) URL.revokeObjectURL(apercu); setApercu(null); };

  const envoyer = useMutation({
    mutationFn: async () => {
      let capture_url = null;
      if (capture) {
        const r = await base44.integrations.Core.UploadFile({ file: capture });
        capture_url = r?.file_url || null;
      }
      return base44.entities.Suggestion.create({
        contenu: texte.trim(),
        capture_url,
        urgence,
        statut: "nouveau",
        client_email: user?.email || "admin@klocka.fr",
        client_name: user?.full_name || user?.email || "Admin Klocka",
      });
    },
    onSuccess: () => { setTexte(""); retirerCapture(); setUrgence(3); rafraichir(); },
    onError: (e) => toast.error(e?.message || "Envoi impossible"),
  });

  const changerStatut = useMutation({
    mutationFn: ({ id, statut }) => base44.entities.Suggestion.update(id, { statut }),
    onSuccess: rafraichir,
    onError: (e) => toast.error(e?.message || "Changement impossible"),
  });

  // L'urgence se corrige d'un clic sur une barre, sans rouvrir la remarque.
  const noter = useMutation({
    mutationFn: ({ id, urgence: n }) => base44.entities.Suggestion.update(id, { urgence: n }),
    onSuccess: rafraichir,
    onError: (e) => toast.error(e?.message || "Impossible"),
  });

  // Une remarque se corrige après coup, sans la refaire.
  const modifier = useMutation({
    mutationFn: ({ id, contenu }) => base44.entities.Suggestion.update(id, { contenu }),
    onSuccess: () => { setEdition(null); rafraichir(); },
    onError: (e) => toast.error(e?.message || "Modification impossible"),
  });

  const supprimer = useMutation({
    mutationFn: (id) => base44.entities.Suggestion.delete(id),
    onSuccess: rafraichir,
    onError: (e) => toast.error(e?.message || "Suppression impossible"),
  });

  const compte = (id) => remarques.filter((r) => normaliser(r.statut) === id).length;
  // Tri au choix : les plus récentes, ou les plus urgentes (puis les plus récentes).
  const parDate = (a, b) => String(b.created_date || "").localeCompare(String(a.created_date || ""));
  const visibles = remarques
    .filter((r) => filtre === "tous" || normaliser(r.statut) === filtre)
    .sort((a, b) => (tri === "urgence" ? ((Number(b.urgence) || 3) - (Number(a.urgence) || 3)) || parDate(a, b) : parDate(a, b)));

  return (
    <div className="min-h-screen bg-fond text-encre px-5 md:px-10 py-8 md:py-12">
      <div className="max-w-[1100px] mx-auto">
        <h1 className="m-0 mb-8 text-[34px] max-md:text-[24px] font-light tracking-[-0.02em] leading-[1.05]">Feedback</h1>

        <BoiteSaisie
          conteneur={{
            onPaste: (e) => { const f = [...(e.clipboardData?.files || [])].find((x) => x.type.startsWith("image/")); if (f) { e.preventDefault(); choisirCapture(f); } },
            onDragOver: (e) => e.preventDefault(),
            onDrop: (e) => { e.preventDefault(); choisirCapture(e.dataTransfer?.files?.[0]); },
          }}
          valeur={texte}
          onChange={setTexte}
          rows={2}
          maxLignes={5}
          placeholder="Une remarque, un bug, une idée… Collez une capture d'écran directement ici."
          onEnvoyer={() => envoyer.mutate()}
          peutEnvoyer={!!texte.trim() || !!capture}
          enCours={envoyer.isPending}
          libelle="Envoyer"
          sous={
            <>
              {apercu && (
                <div className="relative inline-block mb-3">
                  <img src={apercu} alt="Capture" className="max-h-[160px] rounded-lg border border-bord" />
                  <button onClick={retirerCapture} className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-surface border border-bord-doux text-ardoise hover:text-encre flex items-center justify-center" aria-label="Retirer la capture"><X className="w-3.5 h-3.5" /></button>
                </div>
              )}
              {/* L'urgence : cinq barres, on clique celle qu'on veut. La boîte
                  de saisie n'a pas de marge sous son contenu : c'est cette
                  ligne qui écarte l'urgence du filet de la barre du bas. */}
              <div className="flex flex-wrap items-center gap-3 mb-5">
                <span className="text-[11px] tracking-[.14em] uppercase text-brume">Urgence</span>
                <span className="inline-flex items-end gap-1" role="group" aria-label="Urgence">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setUrgence(n)}
                      aria-pressed={urgence === n}
                      aria-label={URGENCES[n - 1].mot} title={URGENCES[n - 1].mot}
                      className="w-3.5 rounded-[2px] transition-all hover:opacity-100"
                      style={{ height: 8 + n * 3, background: n <= urgence ? urgenceDe(urgence).teinte : J["bord"], opacity: n <= urgence ? 1 : .85 }}
                    />
                  ))}
                </span>
                <span className="text-[12.5px] font-medium" style={{ color: urgenceDe(urgence).teinte }}>{urgenceDe(urgence).mot}</span>
              </div>
            </>
          }
          gauche={
            <>
              <input ref={fichierRef} type="file" accept="image/*" className="hidden" onChange={(e) => { choisirCapture(e.target.files?.[0]); e.target.value = ""; }} />
              <BoutonBarre onClick={() => fichierRef.current?.click()} actif={!!capture} title="Joindre une capture d'écran"><ImageIcon className="w-4 h-4" /></BoutonBarre>
              <BoutonBarre onClick={() => (dicteeOk ? (ecoute ? arreter() : demarrer()) : toast.error("La dictée n'est pas prise en charge par ce navigateur", { description: "Chrome ou Edge la proposent." }))} alerte={ecoute} title={ecoute ? "Arrêter la dictée" : "Dicter votre remarque"}>{ecoute ? <Square className="w-4 h-4" /> : <Mic className="w-4 h-4" />}</BoutonBarre>
              <span className="text-[11px] text-brume ml-1 max-md:hidden">{ecoute ? "Je vous écoute…" : "Ctrl+V colle une capture"}</span>
            </>
          }
        />

        {/* Filtres par état, et le tri à droite */}
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 mt-10 mb-4 border-b border-trait">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            {[{ id: "tous", label: "Tout" }, ...STATUTS].map((s) => (
              <button key={s.id} onClick={() => setFiltre(s.id)} className={`relative pb-3 text-[13.5px] transition-colors after:absolute after:left-0 after:right-0 after:-bottom-px after:h-[2px] after:bg-menthe rounded-full after:origin-left after:scale-x-0 after:transition-transform after:duration-300 ${filtre === s.id ? "text-encre font-semibold after:scale-x-100" : "text-brume hover:text-craie"}`}>
                {s.label}<span className="ml-1.5 text-brume font-normal tabular-nums">{s.id === "tous" ? remarques.length : compte(s.id)}</span>
              </button>
            ))}
          </div>
          <div className="inline-flex items-center rounded-full border border-bord-doux p-0.5 mb-2">
            {[["date", "Plus récentes"], ["urgence", "Plus urgentes"]].map(([id, mot]) => (
              <button key={id} onClick={() => setTri(id)} className={`px-3 py-1 rounded-full text-[12.5px] transition-colors ${tri === id ? "bg-menthe rounded-full text-sur-menthe font-semibold" : "text-ardoise hover:text-encre"}`}>{mot}</button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <p className="m-0 py-8 text-[12.5px] text-ardoise inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Chargement…</p>
        ) : visibles.length === 0 ? (
          <p className="m-0 py-8 text-[13.5px] text-brume">Rien ici pour l'instant.</p>
        ) : (
          <div>
            {visibles.map((r) => {
              const statut = normaliser(r.statut);
              return (
                <div key={r.id} className="flex gap-5 py-5 border-b border-relief group">
                  {r.capture_url && (
                    <button onClick={() => setZoom(r.capture_url)} className="flex-none w-[120px] h-[80px] rounded-lg border border-bord overflow-hidden bg-fond" aria-label="Agrandir" title="Agrandir">
                      <img src={r.capture_url} alt="" className="w-full h-full object-cover" />
                    </button>
                  )}
                  <div className="min-w-0 flex-1">
                    {edition?.id === r.id ? (
                      <div>
                        <textarea autoFocus value={edition.texte} onChange={(e) => setEdition({ id: r.id, texte: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); modifier.mutate({ id: r.id, contenu: edition.texte.trim() }); } if (e.key === "Escape") setEdition(null); }} rows={Math.min(8, Math.max(2, edition.texte.split("\n").length))} className="w-full bg-transparent border border-bord-vif focus:border-encre rounded-md px-3 py-2 outline-none text-[15px] leading-[1.6] text-encre resize-y" />
                        <div className="mt-1.5 flex items-center gap-2">
                          <button onClick={() => modifier.mutate({ id: r.id, contenu: edition.texte.trim() })} disabled={modifier.isPending || !edition.texte.trim()} className="inline-flex items-center gap-1 text-[12.5px] px-2.5 py-1 bg-menthe rounded-full text-sur-menthe font-semibold rounded-md disabled:opacity-40"><Check className="w-3 h-3" /> Enregistrer</button>
                          <button onClick={() => setEdition(null)} className="text-[12.5px] text-ardoise hover:text-encre">Annuler</button>
                        </div>
                      </div>
                    ) : (
                      <p className="m-0 text-[15px] leading-[1.65] text-encre whitespace-pre-wrap">{r.contenu}</p>
                    )}
                    {r.prompt_correction && <PromptCorrection r={r} />}
                    <p className="m-0 mt-1.5 text-[12.5px] text-brume flex flex-wrap items-center gap-x-2">
                      <span className="inline-flex items-center gap-1.5" title={`Urgence ${urgenceDe(r.urgence).n} sur 5 — cliquez une barre pour la changer`}>
                        <span className="inline-flex items-end gap-px">
                          {[1, 2, 3, 4, 5].map((n) => (
                            <button key={n} type="button" onClick={() => noter.mutate({ id: r.id, urgence: n })} aria-label={URGENCES[n - 1].mot} title={URGENCES[n - 1].mot} className="w-1.5 rounded-[2px] transition-colors" style={{ height: 5 + n * 1.6, background: n <= urgenceDe(r.urgence).n ? urgenceDe(r.urgence).teinte : J["bord"] }} />
                          ))}
                        </span>
                        <span style={{ color: urgenceDe(r.urgence).teinte }}>{urgenceDe(r.urgence).mot}</span>
                      </span>
                      <span className="text-bord-vif">·</span>
                      <span>{r.client_name || r.client_email}{r.created_date ? ` · ${quand(r.created_date)}` : ""}</span>
                      {/* D'où part la remarque : « ça ne marche pas » ne dit
                          pas où, l'adresse de la page le dit. */}
                      {r.page && (
                        <>
                          <span className="text-bord-vif">·</span>
                          <a href={r.page} className="text-brume hover:text-menthe underline decoration-bord underline-offset-2" aria-label="Ouvrir la page d'où vient la remarque" title="Ouvrir la page d'où vient la remarque">{r.page}</a>
                        </>
                      )}
                    </p>
                  </div>
                  <div className="flex-none flex items-start gap-1.5">
                    {STATUTS.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => statut !== s.id && changerStatut.mutate({ id: r.id, statut: s.id })}
                        className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${statut === s.id ? "text-white" : "text-brume hover:text-craie border border-bord"}`}
                        style={statut === s.id ? { background: s.fond } : undefined}
                      >
                        {s.label}
                      </button>
                    ))}
                    <button onClick={() => setEdition({ id: r.id, texte: r.contenu || "" })} className="ml-2 text-brume hover:text-encre opacity-0 group-hover:opacity-100 transition-opacity" aria-label="Modifier" title="Modifier"><Pencil className="w-4 h-4" /></button>
                    <button onClick={() => window.confirm("Supprimer cette remarque ?") && supprimer.mutate(r.id)} className="text-brume hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity" aria-label="Supprimer" title="Supprimer"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {zoom && (
          <div onClick={() => setZoom(null)} className="fixed inset-0 z-[80] bg-black/85 flex items-center justify-center p-8 cursor-zoom-out">
            <img src={zoom} alt="Capture" className="max-w-full max-h-full rounded-lg border border-bord" />
          </div>
        )}
      </div>
    </div>
  );
}
