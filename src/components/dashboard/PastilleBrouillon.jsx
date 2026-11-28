import React, { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy } from "lucide-react";
import { CadreEpingle } from "@/components/dashboard/CadreEpingle";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";

// Le Brouillon (27 nov. 2026, Jules, après l'analyse des notes de Maxime : « je pense qu'il faut qu'on rajoute un truc
// comme ça ; test ») : une page de texte libre, privée, qui se garde, à côté de « Fiches » et « À faire ». On y écrit
// ses messages petit à petit et ses notes en vrac, comme dans l'onglet de notes du téléphone. Deux gestes :
// - « Copier » : le passage sélectionné (sinon tout) va dans le presse-papiers ; « Envoyé » le range comme un message
//   déjà parti, qui entre dans l'historique de la fiche à l'accord ;
// - (« Ranger » et « Remettre » retirés le 28 nov. 2026.)
// Renommé « Note » à l'écran le 28 nov. 2026 (Jules). Depuis le 28 nov. 2026 (Jules : « Brouillon, Fiches et À faire marchent pareil ») : un panneau épinglé à droite du
// chat (voir CadreEpingle.jsx). Le soir même (Jules : « ranger et privé, ça sert à rien ; remettre ce qui a été rangé,
// ça sert à rien ») : plus que Copier, puis Envoyé.

const RANGER = "klocka:ranger-brouillon";

export default function ListeBrouillon() {
  const champ = useRef(null);
  const qc = useQueryClient();
  const { data, isFetched } = useQuery({ queryKey: ["brouillon"], queryFn: () => base44.request("GET", "/api/fiche-dossier/brouillon"), staleTime: 30_000, retry: false });
  const [texte, setTexte] = useState("");
  const [charge, setCharge] = useState(false);
  // Après « Copier » : le passage copié, en attente de « Envoyé » ou « Pas encore ».
  const [copie, setCopie] = useState(null);
  const garde = useRef("");
  useEffect(() => {
    if (!isFetched || charge) return;
    setTexte(data?.texte || "");
    garde.current = data?.texte || "";
    setCharge(true);
  }, [isFetched]);

  const enregistrer = async (corps) => {
    try {
      const r = await base44.request("PUT", "/api/fiche-dossier/brouillon", { body: corps });
      garde.current = r.texte;
      qc.setQueryData(["brouillon"], r);
    } catch (e) {
      toast.error(e?.message || "Le brouillon n'a pas été enregistré.");
    }
  };
  // Une seconde après la dernière frappe.
  useEffect(() => {
    if (!charge || texte === garde.current) return undefined;
    const t = setTimeout(() => enregistrer({ texte }), 1000);
    return () => clearTimeout(t);
  }, [texte, charge]);

  useEffect(() => { const t = setTimeout(() => champ.current?.focus(), 50); return () => clearTimeout(t); }, []);

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
  // « Envoyé » : le passage part au chat, rangé comme un message déjà parti, et quitte la page.
  const ranger = (p, envoye = false) => {
    if (!p?.texte) return;
    window.dispatchEvent(new CustomEvent(RANGER, { detail: { texte: p.texte, envoye } }));
    const reste = `${texte.slice(0, p.debut)}${texte.slice(p.fin)}`.replace(/\n{3,}/g, "\n\n").trim();
    setTexte(reste);
    garde.current = reste;
    enregistrer({ texte: reste, dernier_range: { texte: p.texte, envoye } });
    setCopie(null);
  };

  const plein = texte.trim().length > 0;
  return (
    <CadreEpingle titre="Note"
      pied={(
        <>
          {copie && (
            <div className="border-t border-trait px-6 py-3">
              <p className="m-0 text-[13px] leading-[1.45] text-craie">Copié. Une fois envoyé, il va dans l'historique de sa fiche.</p>
              <div className="mt-2 flex justify-end gap-2">
                <button type="button" onClick={() => setCopie(null)} className="h-8 rounded-full px-3 text-[13px] text-ardoise hover:text-encre" style={{ background: "transparent" }}>Pas encore</button>
                <button type="button" onClick={() => ranger(copie, true)} className="h-8 rounded-full bg-menthe px-3.5 text-[13px] text-sur-menthe hover:bg-menthe-survol">Envoyé</button>
              </div>
            </div>
          )}
          <div className="flex items-center justify-end gap-2 border-t border-trait px-6 py-3">
            <button type="button" onClick={copier} disabled={!plein}
              className="inline-flex h-8 items-center gap-1.5 rounded-full border border-bord-doux px-3.5 text-[13px] text-encre hover:border-bord-vif disabled:opacity-40" style={{ background: "transparent" }}>
              <Copy className="h-3.5 w-3.5 text-ardoise" />Copier
            </button>
          </div>
        </>
      )}>
      <textarea ref={champ} value={texte} onChange={(e) => setTexte(e.target.value)} disabled={!charge}
        placeholder={"Un message qu'on écrit petit à petit, des notes en vrac après un appel…\n\nCopier un message, puis « Envoyé » : il entre dans l'historique de sa fiche."}
        aria-label="La note"
        className="block min-h-0 w-full flex-1 resize-none border-0 bg-transparent px-6 py-4 text-[14.5px] leading-[1.6] text-encre outline-none placeholder:text-brume disabled:opacity-50 max-md:text-[16px]" style={{ background: "transparent" }} />
    </CadreEpingle>
  );
}
