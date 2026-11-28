import React, { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Copy, Loader2, Undo2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";

// Le Brouillon (27 nov. 2026, Jules, après l'analyse des notes de Maxime : « je pense qu'il faut qu'on rajoute un truc
// comme ça ; test ») : une page de texte libre, privée, qui se garde, à côté de « Fiches » et « À faire ». On y écrit
// ses messages petit à petit et ses notes en vrac, comme dans l'onglet de notes du téléphone. Deux gestes :
// - « Copier » : le passage sélectionné (sinon tout) va dans le presse-papiers ; « Envoyé » le range comme un message
//   déjà parti, qui entre dans l'historique de la fiche à l'accord ;
// - « Ranger » à la place d'effacer : le passage part au chat, rangé comme une note libre (fiches devinées, OK).
// Ce qui est rangé quitte la page ; « Remettre » le rend tant qu'on n'a rien rangé d'autre. Rien n'est rangé sans OK.

const RANGER = "klocka:ranger-brouillon";

export default function PastilleBrouillon() {
  const [ouvert, setOuvert] = useState(false);
  const boite = useRef(null);
  const champ = useRef(null);
  const qc = useQueryClient();
  const { data, isFetched } = useQuery({ queryKey: ["brouillon"], queryFn: () => base44.request("GET", "/api/fiche-dossier/brouillon"), staleTime: 30_000, retry: false });
  const [texte, setTexte] = useState("");
  const [charge, setCharge] = useState(false);
  const [etat, setEtat] = useState("");
  // Après « Copier » : le passage copié, en attente de « Envoyé » ou « Pas encore ».
  const [copie, setCopie] = useState(null);
  const garde = useRef("");
  useEffect(() => {
    if (!isFetched || charge) return;
    setTexte(data?.texte || "");
    garde.current = data?.texte || "";
    setCharge(true);
  }, [isFetched]);
  const dernier = data?.dernier_range || null;

  const enregistrer = async (corps) => {
    setEtat("Enregistrement…");
    try {
      const r = await base44.request("PUT", "/api/fiche-dossier/brouillon", { body: corps });
      garde.current = r.texte;
      qc.setQueryData(["brouillon"], r);
      setEtat("Enregistré");
    } catch (e) {
      setEtat("");
      toast.error(e?.message || "Le brouillon n'a pas été enregistré.");
    }
  };
  // Une seconde après la dernière frappe.
  useEffect(() => {
    if (!charge || texte === garde.current) return undefined;
    setEtat("");
    const t = setTimeout(() => enregistrer({ texte }), 1000);
    return () => clearTimeout(t);
  }, [texte, charge]);

  // Un clic ailleurs ou Échap le ferment ; le texte reste.
  useEffect(() => {
    if (!ouvert) return undefined;
    const dehors = (e) => { if (!boite.current?.contains(e.target)) setOuvert(false); };
    const echap = (e) => { if (e.key === "Escape") setOuvert(false); };
    document.addEventListener("pointerdown", dehors);
    document.addEventListener("keydown", echap);
    return () => { document.removeEventListener("pointerdown", dehors); document.removeEventListener("keydown", echap); };
  }, [ouvert]);
  useEffect(() => { if (ouvert) setTimeout(() => champ.current?.focus(), 50); else setCopie(null); }, [ouvert]);

  // Le passage visé : la sélection, sinon tout le texte.
  const passage = () => {
    const el = champ.current;
    const debut = el?.selectionStart ?? 0;
    const fin = el?.selectionEnd ?? 0;
    if (el && fin > debut && texte.slice(debut, fin).trim()) return { debut, fin, texte: texte.slice(debut, fin).trim() };
    return { debut: 0, fin: texte.length, texte: texte.trim() };
  };
  const copier = async () => {
    const p = passage();
    if (!p.texte) return;
    try { await navigator.clipboard.writeText(p.texte); } catch {
      // Sans accès au presse-papiers : le passage sélectionné dans la page, copié à l'ancienne.
      const el = champ.current;
      let ok = false;
      try { if (el) { el.focus(); el.setSelectionRange(p.debut, p.fin); ok = document.execCommand("copy"); } } catch { ok = false; }
      if (!ok) { toast.error("Le presse-papiers a refusé la copie."); return; }
    }
    setCopie(p);
  };
  // Ranger : le passage part au chat, quitte la page et se garde pour « Remettre ».
  const ranger = (p, envoye = false) => {
    if (!p?.texte) return;
    window.dispatchEvent(new CustomEvent(RANGER, { detail: { texte: p.texte, envoye } }));
    const reste = `${texte.slice(0, p.debut)}${texte.slice(p.fin)}`.replace(/\n{3,}/g, "\n\n").trim();
    setTexte(reste);
    garde.current = reste;
    enregistrer({ texte: reste, dernier_range: { texte: p.texte, envoye } });
    setCopie(null);
    setOuvert(false);
  };
  const remettre = () => {
    if (!dernier?.texte) return;
    const t = [texte.trim(), dernier.texte].filter(Boolean).join("\n\n");
    setTexte(t);
    garde.current = t;
    enregistrer({ texte: t, dernier_range: null });
  };

  const plein = texte.trim().length > 0;
  return (
    <div ref={boite} className="relative">
      <button type="button" onClick={() => setOuvert((x) => !x)} aria-expanded={ouvert}
        className="inline-flex items-center gap-2 rounded-full border border-trait bg-surface-pleine px-3.5 py-2 text-[13.5px] text-encre transition-colors hover:border-bord-doux">
        Brouillon{plein ? <span className="h-1.5 w-1.5 rounded-full bg-menthe" aria-label="pas vide" /> : null}
        <ChevronDown className={`h-3.5 w-3.5 text-ardoise transition-transform duration-200 ${ouvert ? "rotate-180" : ""}`} />
      </button>
      {ouvert && (
        <div role="dialog" aria-label="Brouillon"
          className="k-verre-plein animate-in fade-in slide-in-from-top-1 absolute right-0 top-[calc(100%+8px)] z-40 flex w-[600px] max-w-[calc(100vw-32px)] flex-col rounded-[16px] shadow-[0_18px_48px_rgb(0_0_0/0.14)] duration-150 max-md:fixed max-md:inset-x-3 max-md:bottom-3 max-md:top-16 max-md:w-auto">
          <div className="flex h-10 items-center justify-between gap-3 border-b border-trait px-4">
            <p className="m-0 text-[13.5px] text-encre">Brouillon</p>
            <p className="m-0 text-[12.5px] text-brume">{etat || "Privé, gardé tant qu'on ne range pas"}</p>
          </div>
          <textarea ref={champ} value={texte} onChange={(e) => setTexte(e.target.value)} disabled={!charge}
            placeholder={"Un message qu'on écrit petit à petit, des notes en vrac après un appel…\nCopier un message, puis « Envoyé » : il entre dans l'historique de sa fiche.\nRanger à la place d'effacer : l'assistant met chaque chose sur sa fiche, avec ton accord."}
            aria-label="Le brouillon"
            className="block h-[min(52vh,460px)] w-full resize-none border-0 bg-transparent px-4 py-3 text-[14.5px] leading-[1.6] text-encre outline-none placeholder:text-brume disabled:opacity-50 max-md:h-auto max-md:flex-1 max-md:text-[16px]" style={{ background: "transparent" }} />
          {copie && (
            <div className="flex flex-wrap items-center gap-2 border-t border-trait px-4 py-2.5">
              <p className="m-0 mr-auto text-[13px] text-craie">Copié. Une fois envoyé, il va dans l'historique de sa fiche.</p>
              <button type="button" onClick={() => setCopie(null)} className="h-8 rounded-full px-3 text-[13px] text-ardoise hover:text-encre" style={{ background: "transparent" }}>Pas encore</button>
              <button type="button" onClick={() => ranger(copie, true)} className="h-8 rounded-full bg-menthe px-3.5 text-[13px] text-sur-menthe hover:bg-menthe-survol">Envoyé</button>
            </div>
          )}
          <div className="flex items-center gap-2 border-t border-trait px-4 py-2.5">
            {dernier?.texte ? (
              <button type="button" onClick={remettre} title={dernier.texte.slice(0, 200)}
                className="mr-auto inline-flex min-w-0 items-center gap-1.5 text-[12.5px] text-ardoise hover:text-encre" style={{ background: "transparent" }}>
                <Undo2 className="h-3.5 w-3.5 flex-none" /><span className="truncate">Remettre ce qui a été rangé</span>
              </button>
            ) : <span className="mr-auto text-[12.5px] text-brume">{plein ? "Sélectionne un passage, ou tout part" : ""}</span>}
            <button type="button" onClick={copier} disabled={!plein}
              className="inline-flex h-8 items-center gap-1.5 rounded-full border border-bord-doux px-3.5 text-[13px] text-encre hover:border-bord-vif disabled:opacity-40" style={{ background: "transparent" }}>
              <Copy className="h-3.5 w-3.5 text-ardoise" />Copier
            </button>
            <button type="button" onClick={() => ranger(passage())} disabled={!plein}
              className="inline-flex h-8 items-center gap-1.5 rounded-full bg-encre px-3.5 text-[13px] text-fond hover:opacity-90 disabled:opacity-40">
              {etat === "Enregistrement…" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}Ranger
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
