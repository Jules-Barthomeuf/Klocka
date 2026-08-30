import React, { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useDictee } from "@/lib/dictee";
import { Mic, Square, RotateCcw, Loader2, ArrowUp } from "lucide-react";

// La note en raccrochant. Un micro, une phrase, et l'assistant fait le reste :
// le dossier, l'agent au CRM, le bien dans Monday, la promesse de documents
// au registre. Pensée pour le téléphone — un seul geste, gros boutons — mais
// elle vaut aussi au bureau.
//
// La conversation continue : si l'assistant réclame l'adresse mail de
// l'agent, on la dicte à la suite.

const EXEMPLES = [
  "J'ai eu Marc Dupont de chez Orpi, marc@orpi.fr, il a un local à Lyon 3e à 400 000 €, loué à une boulangerie, il m'envoie les documents d'ici jeudi.",
  "Note que le syndic nous doit le règlement de copropriété de Mitry-Mory avant fin de mois.",
];

export default function Note() {
  const [messages, setMessages] = useState([]);
  const [texte, setTexte] = useState("");
  const finRef = useRef(null);

  const envoyer = useMutation({
    mutationFn: (suite) => base44.request("POST", "/api/assistant/commande", { body: { messages: suite } }),
    onSuccess: (r, suite) => {
      setMessages([...suite, { role: "assistant", contenu: r.texte || "(sans réponse)" }]);
    },
    onError: (e, suite) => {
      setMessages([...suite, { role: "assistant", contenu: `Impossible : ${e?.message || "erreur"}` }]);
    },
  });

  const lancer = (contenu) => {
    const demande = (contenu ?? texte).trim();
    if (!demande || envoyer.isPending) return;
    const suite = [...messages, { role: "user", contenu: demande }];
    setMessages(suite);
    setTexte("");
    envoyer.mutate(suite);
  };

  const { supporte, ecoute, demarrer, arreter, erreur } = useDictee({
    onTexte: (t) => setTexte(t),
    // Fin de parole : la phrase part telle quelle. Pour la relire d'abord, on
    // arrête le micro à la main et on corrige dans le champ.
    onFin: (t) => lancer(t),
  });

  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, envoyer.isPending]);

  const recommencer = () => {
    arreter();
    setMessages([]);
    setTexte("");
  };

  return (
    <div className="min-h-screen bg-[#000000] text-[#f2f3f5]">
      <div className="max-w-[640px] mx-auto px-5 md:px-8 py-8 md:py-14 flex flex-col min-h-screen">
        <header className="flex items-end justify-between gap-4">
          <div>
            <p className="m-0 text-[11px] tracking-[.18em] uppercase text-[#9298a6]">En raccrochant</p>
            <h1 className="m-0 mt-2 text-[34px] max-md:text-[28px] font-semibold tracking-[-.025em] leading-[1.05] text-[#ffffff]">
              Note
            </h1>
          </div>
          {messages.length > 0 && (
            <button
              onClick={recommencer}
              className="inline-flex items-center gap-2 px-3.5 py-2 border border-[#2c3139] text-[10.5px] tracking-[.16em] uppercase text-[#c9cdd6] hover:border-[#3a3f4a]"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Nouvelle note
            </button>
          )}
        </header>

        {/* --- Le fil ------------------------------------------------------ */}
        <div className="flex-1 mt-8 space-y-5">
          {messages.length === 0 && !ecoute && (
            <div>
              <p className="m-0 text-[17px] font-light leading-[1.6] text-[#9298a6]">
                Dites ce que vous venez d'entendre. L'assistant ouvre le dossier, inscrit l'agent, pose le bien
                dans Monday et note ce qui a été promis.
              </p>
              <div className="mt-6 space-y-2">
                {EXEMPLES.map((ex) => (
                  <button
                    key={ex}
                    onClick={() => setTexte(ex)}
                    className="block w-full text-left text-[13px] leading-[1.55] text-[#6a7180] hover:text-[#c9cdd6] border-l-2 border-[#22262d] pl-3 transition-colors"
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) =>
            m.role === "user" ? (
              <div key={i} className="flex justify-end">
                <p className="m-0 max-w-[88%] bg-[#ffffff] text-[#000000] text-[15px] leading-[1.5] px-4 py-2.5 rounded-[14px_14px_4px_14px]">
                  {m.contenu}
                </p>
              </div>
            ) : (
              <div key={i} className="flex gap-3">
                <div className="w-[2px] flex-none bg-[#96c0b8]/60" />
                <p className="m-0 text-[15px] leading-[1.6] text-[#f2f3f5] whitespace-pre-wrap">{m.contenu}</p>
              </div>
            )
          )}

          {envoyer.isPending && (
            <div className="flex items-center gap-2 text-[13px] text-[#9298a6]">
              <Loader2 className="w-4 h-4 animate-spin" /> L'assistant s'en occupe…
            </div>
          )}
          <div ref={finRef} />
        </div>

        {/* --- La prise de parole ------------------------------------------- */}
        <div className="sticky bottom-0 pt-6 pb-4 bg-gradient-to-t from-[#000000] via-[#000000] to-transparent">
          {erreur && <p className="m-0 mb-3 text-[12.5px] text-[#e8746a]">{erreur}</p>}

          <div className="border border-[#96c0b8] rounded-[22px] bg-[#0f1114] px-4 py-3">
            <textarea
              value={texte}
              onChange={(e) => setTexte(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  lancer();
                }
              }}
              rows={ecoute ? 3 : 2}
              placeholder={ecoute ? "Je vous écoute…" : "Dictez ou tapez — « J'ai eu Marc, il a un local à… »"}
              className="w-full bg-transparent border-0 outline-none resize-none text-[16px] leading-[1.5] text-[#f2f3f5] placeholder:text-[#6a7180]"
            />
            <div className="mt-2 flex items-center justify-between gap-3">
              <span className="text-[11px] text-[#6a7180]">
                {ecoute
                  ? "La note part quand vous vous taisez. Arrêtez pour relire."
                  : supporte
                    ? "Le micro écoute en français."
                    : "Ce navigateur n'a pas la reconnaissance vocale — Chrome, Edge ou Safari l'ont, pas Firefox ni l'aperçu intégré de VS Code. La dictée du clavier marche dans le champ."}
              </span>
              <div className="flex items-center gap-2">
                {supporte && (
                  <button
                    onClick={ecoute ? arreter : demarrer}
                    disabled={envoyer.isPending}
                    aria-label={ecoute ? "Arrêter" : "Dicter"}
                    className={`w-14 h-14 rounded-full flex items-center justify-center transition-all disabled:opacity-40 ${
                      ecoute
                        ? "bg-[#e8746a] text-[#000000] shadow-[0_0_0_10px_rgba(232,116,106,.18)] animate-pulse"
                        : "bg-[#96c0b8] text-[#000000] hover:bg-[#abd0c8]"
                    }`}
                  >
                    {ecoute ? <Square className="w-5 h-5" /> : <Mic className="w-6 h-6" />}
                  </button>
                )}
                <button
                  onClick={() => lancer()}
                  disabled={!texte.trim() || envoyer.isPending}
                  aria-label="Envoyer"
                  className="w-11 h-11 rounded-full flex items-center justify-center border border-[#2c3139] text-[#c9cdd6] hover:border-[#96c0b8] hover:text-[#96c0b8] disabled:opacity-30 transition-colors"
                >
                  <ArrowUp className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
