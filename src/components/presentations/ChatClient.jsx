import React, { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUp, Star } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import AvatarAK from "@/components/AvatarAK";
import Chargement from "@/components/ui/Chargement";

// Le chat du client, à gauche de sa présentation (16 oct. 2026, Jules : « le
// client voit exactement ce qu'on voit : l'éditeur à gauche, le design à
// droite »). AK n'y touche qu'à cette présentation : il change ce qu'on lui
// demande, et le dit. L'échange reste dans le navigateur, le temps de la visite.

const IDEES = ["Raccourcissez le texte de la couverture", "Mettez le titre plus simplement", "Que montre la diapositive du marché ?"];

export default function ChatClient({ id }) {
  const queryClient = useQueryClient();
  const [messages, setMessages] = useState([]);
  const [texte, setTexte] = useState("");
  const fin = useRef(null);
  useEffect(() => { fin.current?.scrollIntoView({ block: "nearest" }); }, [messages.length]);
  const envoyer = useMutation({
    mutationFn: (t) => base44.request("POST", `/api/client/presentations/${id}/chat`, { body: { texte: t, historique: messages } }),
    onSuccess: (r) => {
      setMessages((m) => [...m, { role: "assistant", texte: r.reponse }]);
      if (r.changes) queryClient.invalidateQueries({ queryKey: ["presentation-bancaire", id, "client"] });
    },
    onError: (e) => { setMessages((m) => [...m, { role: "assistant", texte: e?.message || "Je n'ai pas pu répondre, réessayez dans un instant." }]); },
  });
  const partir = (t) => {
    const x = String(t || "").trim();
    if (!x || envoyer.isPending) return;
    setMessages((m) => [...m, { role: "client", texte: x }]);
    setTexte("");
    envoyer.mutate(x);
  };
  return (
    <div className="flex h-full min-h-0 flex-col bg-fond">
      <div className="flex flex-none items-center gap-3 border-b border-trait px-5 py-4">
        <AvatarAK className="h-9 w-9" />
        <div className="flex min-w-0 flex-col">
          <span className="text-[15px] text-encre">AK</span>
          <span className="text-[12.5px] text-ardoise">Il retouche votre présentation à votre demande</span>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
        {!messages.length && (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            <p className="m-0 text-[20px] font-normal tracking-[-0.01em] text-encre">Que voulez-vous changer ?</p>
            <p className="m-0 max-w-[300px] text-[13.5px] leading-[1.5] text-ardoise">Dites-le simplement : AK modifie la présentation à droite et vous dit ce qu'il a fait.</p>
            <div className="mt-1 flex flex-col gap-2">
              {IDEES.map((x) => (
                <button key={x} type="button" onClick={() => partir(x)} className="rounded-full border border-trait px-4 py-2 text-[13.5px] text-craie hover:border-bord-vif hover:text-encre" style={{ background: "transparent" }}>{x}</button>
              ))}
            </div>
          </div>
        )}
        <div className="flex flex-col gap-4">
          {messages.map((m, i) => (
            m.role === "client"
              ? <p key={i} className="m-0 max-w-[85%] self-end rounded-[16px] bg-relief px-4 py-2.5 text-[15px] leading-[1.5] text-encre">{m.texte}</p>
              : <div key={i} className="flex max-w-[92%] gap-2.5"><AvatarAK className="mt-0.5 h-7 w-7" /><p className="m-0 text-[15px] leading-[1.55] text-encre">{m.texte}</p></div>
          ))}
          {envoyer.isPending && <Chargement taille="petit" titre="AK" etats={["Je lis votre présentation", "Je fais la retouche", "Je vérifie"]} />}
          <span ref={fin} />
        </div>
      </div>
      <form onSubmit={(e) => { e.preventDefault(); partir(texte); }} className="flex-none border-t border-trait p-4">
        <div className="flex items-end gap-2 rounded-[18px] border border-trait bg-surface px-4 py-3 focus-within:border-bord-vif">
          <textarea value={texte} onChange={(e) => setTexte(e.target.value)} rows={2} placeholder="Demandez une retouche…"
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); partir(texte); } }}
            className="max-h-[140px] min-h-[44px] flex-1 resize-none bg-transparent text-[15px] leading-[1.45] text-encre outline-none placeholder:text-brume max-md:text-[16px]" />
          <button type="submit" disabled={!texte.trim() || envoyer.isPending} aria-label="Envoyer" className="grid h-9 w-9 flex-none place-items-center rounded-full bg-menthe text-sur-menthe hover:bg-menthe-survol disabled:opacity-40"><ArrowUp className="h-4 w-4" /></button>
        </div>
      </form>
    </div>
  );
}

/** En bas à droite : « Comment aimez-vous le design de la présentation ? », cinq étoiles, dans le Feedback de l'équipe. */
export function NoteDesign({ id }) {
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ["note-design", id], queryFn: () => base44.request("GET", `/api/client/presentations/${id}/note`) });
  const [survol, setSurvol] = useState(0);
  const note = data?.note || 0;
  const noter = useMutation({
    mutationFn: (n) => base44.request("POST", `/api/client/presentations/${id}/note`, { body: { note: n } }),
    onSuccess: (r) => { queryClient.setQueryData(["note-design", id], { note: r.note }); toast("Merci pour votre avis"); },
    onError: (e) => toast.error(e?.message || "Impossible"),
  });
  const montree = survol || note;
  return (
    <div className="fixed bottom-5 right-5 z-[75] flex flex-col items-end gap-1.5 rounded-[16px] border border-trait bg-fond/80 px-4 py-3 shadow-[0_18px_40px_rgb(0_0_0/0.18)] backdrop-blur-xl max-md:bottom-20 max-md:right-3">
      <span className="text-[12.5px] text-craie">{note ? "Merci ! Votre note du design" : "Comment aimez-vous le design de la présentation ?"}</span>
      <div className="flex gap-1" onMouseLeave={() => setSurvol(0)} role="radiogroup" aria-label="Note du design, de 1 à 5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={note === n} aria-label={`${n} étoile${n > 1 ? "s" : ""}`} disabled={noter.isPending}
            onMouseEnter={() => setSurvol(n)} onClick={() => noter.mutate(n)} className="grid h-8 w-8 place-items-center rounded-full p-0 transition-transform hover:scale-110" style={{ background: "transparent" }}>
            <Star className={`h-[22px] w-[22px] ${n <= montree ? "fill-ambre text-ambre" : "text-brume"}`} strokeWidth={1.6} />
          </button>
        ))}
      </div>
    </div>
  );
}
