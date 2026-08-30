import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { Check, Loader2 } from "lucide-react";

// Le registre des engagements : qui doit quoi, pour quand.
//
// Pas de formulaire ici — le registre s'écrit depuis nos demandes envoyées,
// depuis les promesses des agents dès que la lecture Gmail sera accordée, et
// depuis une phrase dite à l'assistant. La page sert à trois choses : voir ce
// qui est dû, cocher ce qui est tenu quand la clôture automatique ne peut pas
// le savoir, et repousser une échéance renégociée.

const jour = (iso) =>
  !iso || isNaN(new Date(iso))
    ? null
    : new Date(iso).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });

const retardJours = (iso) => Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);

// Même grammaire que le tableau de bord : l'urgence se lit au filet de gauche.
const TEINTE = (e) =>
  e.en_retard
    ? { filet: "border-[#e8746a]", etiquette: "text-[#e8746a]" }
    : e.echeance
      ? { filet: "border-[#96c0b8]", etiquette: "text-[#96c0b8]" }
      : { filet: "border-[#3a3f4a]", etiquette: "text-[#9298a6]" };

const SOURCES = {
  mail_sortant: "d'après notre demande",
  reprise: "repris de l'historique des envois",
  mail_recu: "promis par mail",
  assistant: "noté via l'assistant",
};

export default function Engagements() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [occupe, setOccupe] = useState(null);
  const [reportEn, setReportEn] = useState(null); // id dont on édite l'échéance
  const [nouvelleDate, setNouvelleDate] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["engagements"],
    queryFn: () => base44.request("GET", "/api/assistant/engagements"),
    refetchInterval: 120000,
  });

  const rafraichir = () => {
    queryClient.invalidateQueries({ queryKey: ["engagements"] });
    queryClient.invalidateQueries({ queryKey: ["assistant-propositions"] });
  };

  const tenir = useMutation({
    mutationFn: (id) => base44.request("POST", `/api/assistant/engagements/${id}/tenu`, { body: {} }),
    onSuccess: () => { rafraichir(); toast.success("Engagement tenu"); },
    onError: (e) => toast.error(e?.message || "Action impossible"),
    onSettled: () => setOccupe(null),
  });

  const repousser = useMutation({
    mutationFn: ({ id, date }) =>
      base44.request("POST", `/api/assistant/engagements/${id}/echeance`, { body: { date } }),
    onSuccess: () => { rafraichir(); setReportEn(null); toast.success("Échéance repoussée"); },
    onError: (e) => toast.error(e?.message || "Action impossible"),
    onSettled: () => setOccupe(null),
  });

  const tout = data?.engagements || [];
  const ouverts = tout.filter((e) => e.statut === "ouvert");
  const enRetard = ouverts.filter((e) => e.en_retard);
  const tenus = tout.filter((e) => e.statut !== "ouvert").slice(0, 20);

  return (
    <div className="min-h-screen bg-[#000000]">
      <div className="max-w-[1100px] mx-auto px-5 md:px-12 py-10 md:py-16">
        {/* --- En-tête --------------------------------------------------- */}
        <header className="flex flex-wrap items-start justify-between gap-x-10 gap-y-6">
          <h1 className="m-0 text-[46px] max-lg:text-[36px] max-md:text-[28px] font-semibold tracking-[-.025em] leading-[1.05] text-[#ffffff]">
            Engagements
          </h1>
          <div className="flex items-start gap-10 max-md:gap-7">
            <div className="text-right">
              <p className="m-0 text-[38px] max-md:text-[30px] font-light leading-none text-[#96c0b8]">{ouverts.length}</p>
              <p className="m-0 mt-2.5 text-[10.5px] tracking-[.16em] uppercase text-[#9298a6]">
                En cours
              </p>
            </div>
            <div className="text-right">
              <p className={`m-0 text-[38px] max-md:text-[30px] font-light leading-none ${enRetard.length ? "text-[#e8746a]" : "text-[#3a3f4a]"}`}>
                {enRetard.length}
              </p>
              <p className="m-0 mt-2.5 text-[10.5px] tracking-[.16em] uppercase text-[#9298a6]">
                En retard
              </p>
            </div>
          </div>
        </header>

        <div className="h-px bg-[#1f2228] my-12 max-md:my-9" />

        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 text-[#9298a6] animate-spin" />
          </div>
        ) : ouverts.length === 0 ? (
          <p className="m-0 py-6 text-[19px] font-light leading-[1.55] text-[#6a7180]">
            Rien n'est dû. Une demande de documents envoyée, une promesse reçue par mail, ou une
            phrase dite à l'assistant — « Marc envoie le PV jeudi » — inscrira sa ligne ici.
          </p>
        ) : (
          <div className="space-y-9">
            {ouverts.map((e) => {
              const t = TEINTE(e);
              return (
                <div key={e.id} className={`border-l-2 ${t.filet} pl-6`}>
                  <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                    {e.deal_id ? (
                      <button
                        onClick={() => navigate(`/Analyse?deal_id=${e.deal_id}`)}
                        className="text-[11px] tracking-[.16em] uppercase text-[#9298a6] hover:text-[#96c0b8] transition-colors"
                      >
                        {e.dossier}
                      </button>
                    ) : (
                      <span className="text-[11px] tracking-[.16em] uppercase text-[#6a7180]">sans dossier</span>
                    )}
                    <span className={`text-[11px] tracking-[.16em] uppercase ${t.etiquette}`}>
                      {e.en_retard
                        ? `en retard de ${retardJours(e.echeance)} j`
                        : e.echeance
                          ? `pour ${jour(e.echeance)}`
                          : "sans échéance"}
                    </span>
                  </div>

                  <p className="m-0 mt-2 text-[19px] max-md:text-[17px] font-light leading-[1.45] text-[#f2f3f5]">
                    {e.quoi}
                  </p>
                  <p className="m-0 mt-1.5 text-[13px] text-[#9298a6]">
                    {[e.de, SOURCES[e.source?.type], e.source?.objet ? `« ${e.source.objet} »` : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>

                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <button
                      onClick={() => { setOccupe(e.id); tenir.mutate(e.id); }}
                      disabled={!!occupe}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 border border-[#22262d] text-[10.5px] tracking-[.16em] uppercase text-[#c9cdd6] hover:border-[#3a3f4a] disabled:opacity-40 transition-colors"
                    >
                      {occupe === e.id && tenir.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                      Tenu
                    </button>

                    {reportEn === e.id ? (
                      <span className="inline-flex items-center gap-2">
                        <input
                          type="date"
                          value={nouvelleDate}
                          onChange={(ev) => setNouvelleDate(ev.target.value)}
                          className="bg-transparent border border-[#22262d] px-2.5 py-1.5 text-[12.5px] text-[#f2f3f5] outline-none [color-scheme:dark]"
                        />
                        <button
                          onClick={() => { if (nouvelleDate) { setOccupe(e.id); repousser.mutate({ id: e.id, date: nouvelleDate }); } }}
                          disabled={!nouvelleDate || !!occupe}
                          className="px-3 py-2 bg-[#96c0b8] text-[#000000] text-[10.5px] tracking-[.16em] uppercase disabled:opacity-40"
                        >
                          Valider
                        </button>
                        <button onClick={() => setReportEn(null)} className="text-[12px] text-[#6a7180] hover:text-[#c9cdd6]">
                          annuler
                        </button>
                      </span>
                    ) : (
                      <button
                        onClick={() => { setReportEn(e.id); setNouvelleDate(""); }}
                        className="px-3.5 py-2 border border-[#22262d] text-[10.5px] tracking-[.16em] uppercase text-[#c9cdd6] hover:border-[#3a3f4a] transition-colors"
                      >
                        Repousser
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* --- Tenu récemment -------------------------------------------- */}
        {tenus.length > 0 && (
          <>
            <div className="h-px bg-[#1f2228] my-12 max-md:my-9" />
            <p className="m-0 mb-7 text-[11px] tracking-[.18em] uppercase text-[#9298a6]">Tenus récemment</p>
            <div className="space-y-4">
              {tenus.map((e) => (
                <div key={e.id} className="flex flex-wrap items-baseline gap-x-4 gap-y-0.5">
                  <span className="text-[14px] text-[#6a7180] line-through decoration-[#2c3139]">{e.quoi}</span>
                  <span className="text-[12px] text-[#6a7180]">
                    {[e.dossier, e.tenu_comment, jour(e.tenu_le)].filter(Boolean).join(" · ")}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
