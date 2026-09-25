import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, RotateCcw, ThumbsDown, ThumbsUp } from "lucide-react";
import { toast } from "@/components/ui/avis";

// Le questionnaire de l'assistant, en propositions : AK montre une façon de
// faire, comme un message qu'il écrirait dans le chat, et on dit si on aime
// ou pas. Une carte à la fois ; chaque réponse s'enregistre tout de suite et
// devient une consigne qu'AK suit pour cette personne seule. Les propositions
// viennent du serveur (server/ak/questionnaire.js).

function Bulle({ texte }) {
  return (
    <div className="flex items-start gap-3">
      <span className="grid h-9 w-9 flex-none place-items-center rounded-full border border-menthe/40 text-[11px] font-semibold tracking-[.06em] text-menthe">AK</span>
      <div className="min-w-0 rounded-[18px] rounded-tl-[6px] border border-trait bg-fond px-4 py-3 text-[14.5px] leading-[1.6] text-encre">{texte}</div>
    </div>
  );
}

function Carte({ p, reponse, onRepondre, rang, total }) {
  return (
    <div className="animate-in fade-in slide-in-from-right-4 duration-300 ease-out rounded-[20px] border border-trait bg-surface p-6 md:p-7">
      <p className="m-0 text-[11px] font-medium uppercase tracking-[.16em] text-ardoise">{p.theme} · {rang} / {total}</p>
      <h2 className="m-0 mt-2 text-[20px] font-semibold text-encre">{p.titre}</h2>
      <p className="m-0 mt-1 text-[13px] text-brume">AK t'écrirait comme ça :</p>
      <div className="mt-5"><Bulle texte={p.exemple} /></div>
      <div className="mt-7 grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => onRepondre("non")}
          className={`inline-flex items-center justify-center gap-2 rounded-full border px-4 py-3 text-[14px] transition-all duration-200 ${reponse === "non" ? "border-alerte/70 bg-alerte/15 text-encre" : "border-bord-doux text-craie hover:border-alerte/50 hover:text-encre"}`}
        >
          <ThumbsDown className="h-4 w-4" /> J'aime pas
        </button>
        <button
          type="button"
          onClick={() => onRepondre("oui")}
          className={`inline-flex items-center justify-center gap-2 rounded-full border px-4 py-3 text-[14px] font-semibold transition-all duration-200 ${reponse === "oui" ? "border-menthe bg-menthe text-sur-menthe" : "border-menthe/50 text-encre hover:bg-menthe/15"}`}
        >
          <ThumbsUp className="h-4 w-4" /> J'aime
        </button>
      </div>
      <p className="m-0 mt-3 text-center text-[11.5px] text-brume">← j'aime pas · j'aime →</p>
    </div>
  );
}

export default function MonAssistant() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["ak-questionnaire"],
    queryFn: () => base44.request("GET", "/api/ak/questionnaire"),
  });
  const propositions = useMemo(() => data?.questions || [], [data?.questions]);
  const [reponses, setReponses] = useState({});
  const [i, setI] = useState(0);
  const [pret, setPret] = useState(false);

  // À l'arrivée : les réponses déjà données, et la première carte sans réponse.
  useEffect(() => {
    if (!data || pret) return;
    const r = data.reponses || {};
    dernieres.current = r;
    setReponses(r);
    const premiere = (data.questions || []).findIndex((p) => !r[p.id]);
    setI(premiere < 0 ? (data.questions || []).length : premiere);
    setPret(true);
  }, [data, pret]);

  const enregistrer = useMutation({
    mutationFn: (suite) => base44.request("POST", "/api/ak/questionnaire", { body: { reponses: suite } }),
    onSuccess: (r) => queryClient.setQueryData(["ak-questionnaire"], (d) => ({ ...d, reponses: r.reponses, maj_le: r.maj_le, consignes: r.consignes })),
    onError: (e) => toast.error(e?.message || "Réponse non enregistrée"),
  });

  // Les réponses les plus fraîches vivent dans une référence, et
  // l'enregistrement part après une courte pause avec la dernière version :
  // répondre vite ne fait plus arriver une liste en retard après une à jour.
  const dernieres = useRef({});
  const minuteur = useRef(null);
  const { mutate: sauver } = enregistrer;
  const repondre = useCallback((id, v, avancer = true) => {
    dernieres.current = { ...dernieres.current, [id]: v };
    setReponses(dernieres.current);
    clearTimeout(minuteur.current);
    minuteur.current = setTimeout(() => sauver(dernieres.current), 400);
    if (avancer) setI((x) => x + 1);
  }, [sauver]);
  useEffect(() => () => { if (minuteur.current) { clearTimeout(minuteur.current); sauver(dernieres.current); } }, [sauver]);

  const courante = propositions[i] || null;
  useEffect(() => {
    if (!courante) return undefined;
    const clavier = (e) => {
      if (e.target?.tagName === "INPUT" || e.target?.tagName === "TEXTAREA") return;
      if (e.key === "ArrowRight") repondre(courante.id, "oui");
      if (e.key === "ArrowLeft") repondre(courante.id, "non");
    };
    window.addEventListener("keydown", clavier);
    return () => window.removeEventListener("keydown", clavier);
  }, [courante, repondre]);

  if (isLoading || !pret) return <div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-ardoise" /></div>;
  if (isError) return <p className="p-8 text-[14px] text-ardoise">Ce questionnaire est réservé à l'équipe.</p>;

  const faites = propositions.filter((p) => reponses[p.id]).length;
  const consignes = data?.consignes || [];

  return (
    <div className="mx-auto w-full max-w-[720px] px-4 py-8 md:px-6">
      <header className="mb-7">
        <h1 className="m-0 text-[34px] font-normal leading-[1.05] tracking-[-0.02em] text-encre max-md:text-[26px]">Ton assistant</h1>
        <p className="m-0 mt-3 max-w-[60ch] text-[14.5px] leading-[1.6] text-craie">
          AK te montre des façons de faire. Dis-lui ce que tu aimes et ce que tu n'aimes pas : il travaillera comme ça avec toi, et avec toi seul.
        </p>
        <div className="mt-5 h-1 overflow-hidden rounded-full bg-encre/[0.08]" aria-hidden>
          <div className="h-full rounded-full bg-menthe transition-[width] duration-500 ease-out" style={{ width: `${propositions.length ? (faites / propositions.length) * 100 : 0}%` }} />
        </div>
        <p className="m-0 mt-2 text-[12px] text-brume">{faites} sur {propositions.length}</p>
      </header>

      {courante ? (
        <>
          <Carte key={courante.id} p={courante} reponse={reponses[courante.id]} onRepondre={(v) => repondre(courante.id, v)} rang={i + 1} total={propositions.length} />
          <div className="mt-4 flex items-center justify-between text-[12.5px]">
            <button type="button" onClick={() => setI((x) => Math.max(0, x - 1))} disabled={i === 0} className="text-ardoise hover:text-encre disabled:opacity-30" style={{ background: "transparent" }}>← précédente</button>
            <button type="button" onClick={() => setI((x) => x + 1)} className="text-ardoise hover:text-encre" style={{ background: "transparent" }}>passer →</button>
          </div>
        </>
      ) : (
        <section className="animate-in fade-in duration-300">
          <div className="rounded-[20px] border border-trait bg-surface p-6">
            <h2 className="m-0 text-[18px] font-semibold text-encre">C'est noté.</h2>
            <p className="m-0 mt-1 text-[13px] text-craie">AK s'en sert dès ton prochain message. Un clic sur un choix pour le changer.</p>
            <ul className="m-0 mt-5 flex list-none flex-col divide-y divide-trait p-0">
              {propositions.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-4 py-2.5">
                  <span className="text-[13.5px] text-encre">{p.titre}</span>
                  <span className="flex flex-none gap-1.5">
                    {[["non", "J'aime pas", ThumbsDown], ["oui", "J'aime", ThumbsUp]].map(([v, mot, Icone]) => (
                      <button key={v} type="button" onClick={() => repondre(p.id, v, false)} aria-label={`${p.titre} : ${mot}`} title={mot}
                        className={`grid h-8 w-8 place-items-center rounded-full border transition-all duration-200 ${reponses[p.id] === v ? (v === "oui" ? "border-menthe bg-menthe text-sur-menthe" : "border-alerte/70 bg-alerte/15 text-encre") : "border-bord-doux text-brume hover:text-encre"}`}>
                        <Icone className="h-3.5 w-3.5" />
                      </button>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
            <button type="button" onClick={() => setI(0)} className="mt-4 inline-flex items-center gap-1.5 text-[12.5px] text-ardoise hover:text-encre" style={{ background: "transparent" }}>
              <RotateCcw className="h-3.5 w-3.5" /> Revoir les propositions une par une
            </button>
          </div>
          {consignes.length > 0 && (
            <div className="mt-5 rounded-[20px] border border-trait p-6">
              <h3 className="m-0 mb-3 text-[15px] font-semibold text-encre">Ce qu'AK retient</h3>
              <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                {consignes.map((c) => <li key={c} className="flex gap-2 text-[13px] leading-[1.55] text-craie"><Check className="mt-[3px] h-3.5 w-3.5 flex-none text-menthe" />{c}</li>)}
              </ul>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
