import React, { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2 } from "lucide-react";
import { toast } from "@/components/ui/avis";

// Le questionnaire de l'assistant. Chaque admin y dit comment AK doit
// travailler avec lui ; les réponses deviennent des consignes qu'AK suit
// pour lui seul, dès son prochain message. Les questions viennent du
// serveur (server/ak/questionnaire.js) : la page ne les tient pas en dur.

const egal = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

function Pastille({ actif, onClick, children, rang = null }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={actif}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[13px] transition-all duration-200 ${actif ? "border-menthe bg-menthe text-sur-menthe font-semibold" : "border-bord-doux text-craie hover:border-bord-vif hover:text-encre"}`}
    >
      {rang != null && <span className="tabular-nums text-[11px] opacity-70">{rang}</span>}
      {children}
    </button>
  );
}

function Champ({ q, valeur, onChange }) {
  if (q.type === "choix") {
    return (
      <div className="flex flex-wrap gap-2">
        {q.options.map((o) => (
          <Pastille key={o.valeur} actif={valeur === o.valeur} onClick={() => onChange(valeur === o.valeur ? null : o.valeur)}>{o.libelle}</Pastille>
        ))}
      </div>
    );
  }
  if (q.type === "multi") {
    const liste = Array.isArray(valeur) ? valeur : [];
    // L'ordre des clics compte : c'est l'ordre dans lequel AK parlera.
    const basculer = (v) => onChange(liste.includes(v) ? liste.filter((x) => x !== v) : [...liste, v]);
    return (
      <div className="flex flex-wrap gap-2">
        {q.options.map((o) => {
          const i = liste.indexOf(o.valeur);
          return <Pastille key={o.valeur} actif={i >= 0} rang={q.id === "avis" && i >= 0 ? i + 1 : null} onClick={() => basculer(o.valeur)}>{o.libelle}</Pastille>;
        })}
      </div>
    );
  }
  const commun = "w-full rounded-lg border border-trait bg-fond px-3.5 py-2.5 text-[14px] text-encre outline-none transition-colors placeholder:text-bord-vif focus:border-menthe/60";
  if (q.type === "texte_long") {
    return <textarea rows={3} value={valeur ?? ""} onChange={(e) => onChange(e.target.value)} placeholder={q.exemple || ""} className={`${commun} resize-y leading-[1.5]`} />;
  }
  return (
    <span className="flex items-center gap-2">
      <input
        value={valeur ?? ""}
        onChange={(e) => onChange(e.target.value)}
        inputMode={q.type === "nombre" ? "decimal" : undefined}
        placeholder={q.exemple || ""}
        className={`${commun} ${q.type === "nombre" ? "max-w-[140px] tabular-nums" : ""}`}
      />
      {q.unite && <span className="text-[13px] text-ardoise">{q.unite}</span>}
    </span>
  );
}

export default function MonAssistant() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["ak-questionnaire"],
    queryFn: () => base44.request("GET", "/api/ak/questionnaire"),
  });
  const [reponses, setReponses] = useState({});
  useEffect(() => { if (data?.reponses) setReponses(data.reponses); }, [data?.reponses]);

  const themes = useMemo(() => {
    const parTheme = [];
    for (const q of data?.questions || []) {
      const t = parTheme.find((x) => x.theme === q.theme);
      if (t) t.questions.push(q); else parTheme.push({ theme: q.theme, questions: [q] });
    }
    return parTheme;
  }, [data?.questions]);

  const modifie = !egal(reponses, data?.reponses || {});
  const repondues = (data?.questions || []).filter((q) => {
    const v = reponses[q.id];
    return v != null && v !== "" && !(Array.isArray(v) && !v.length);
  }).length;

  const enregistrer = useMutation({
    mutationFn: () => base44.request("POST", "/api/ak/questionnaire", { body: { reponses } }),
    onSuccess: (r) => {
      queryClient.setQueryData(["ak-questionnaire"], (d) => ({ ...d, reponses: r.reponses, maj_le: r.maj_le, consignes: r.consignes }));
      setReponses(r.reponses);
      toast.success("Enregistré", { description: "AK s'en sert dès ton prochain message, pour toi seul." });
    },
    onError: (e) => toast.error(e?.message || "Réponses non enregistrées"),
  });

  if (isLoading) return <div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-ardoise" /></div>;
  if (isError) return <p className="p-8 text-[14px] text-ardoise">Ce questionnaire est réservé à l'équipe.</p>;

  return (
    <div className="mx-auto w-full max-w-[860px] px-4 py-8 md:px-6">
      <header className="mb-8">
        <h1 className="m-0 text-[34px] font-normal leading-[1.05] tracking-[-0.02em] text-encre max-md:text-[26px]">Ton assistant</h1>
        <p className="m-0 mt-3 max-w-[62ch] text-[14.5px] leading-[1.6] text-craie">
          Quelques questions pour qu'AK travaille avec toi comme tu travailles. Tes réponses ne valent que pour toi : ce que tu choisis ne change rien pour le reste de l'équipe. Tu peux revenir les changer quand tu veux.
        </p>
        <p className="m-0 mt-2 text-[12.5px] text-brume">
          {repondues} question{repondues > 1 ? "s" : ""} sur {(data?.questions || []).length}
          {data?.maj_le ? ` · enregistré le ${new Date(data.maj_le).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}` : ""}
        </p>
      </header>

      <div className="flex flex-col gap-10">
        {themes.map(({ theme, questions }) => (
          <section key={theme}>
            <h2 className="m-0 mb-4 text-[11px] font-medium uppercase tracking-[.16em] text-ardoise">{theme}</h2>
            <div className="flex flex-col gap-6">
              {questions.map((q) => (
                <div key={q.id} className="flex flex-col gap-2.5">
                  <label className="text-[15px] text-encre">{q.question}</label>
                  {q.aide && <p className="m-0 -mt-1 text-[12.5px] leading-[1.5] text-brume">{q.aide}</p>}
                  <Champ q={q} valeur={reponses[q.id]} onChange={(v) => setReponses((r) => ({ ...r, [q.id]: v }))} />
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      {data?.consignes?.length > 0 && (
        <section className="mt-12 rounded-[16px] border border-trait bg-surface p-5">
          <h2 className="m-0 mb-3 text-[15px] font-semibold text-encre">Ce qu'AK retient de tes réponses</h2>
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
            {data.consignes.map((c) => (
              <li key={c} className="flex gap-2 text-[13px] leading-[1.55] text-craie"><Check className="mt-[3px] h-3.5 w-3.5 flex-none text-menthe" />{c}</li>
            ))}
          </ul>
        </section>
      )}

      <div className="sticky bottom-4 mt-10 flex justify-end">
        <button
          type="button"
          onClick={() => enregistrer.mutate()}
          disabled={!modifie || enregistrer.isPending}
          className="inline-flex items-center gap-2 rounded-full bg-menthe px-5 py-2.5 text-[13px] font-semibold text-sur-menthe shadow-[0_12px_30px_rgba(0,0,0,.45)] transition-opacity hover:bg-menthe-survol disabled:opacity-40"
        >
          {enregistrer.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          {modifie ? "Enregistrer mes réponses" : "Enregistré"}
        </button>
      </div>
    </div>
  );
}
