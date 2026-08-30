import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

// Ce que la plateforme a fait pendant votre absence, raconté.
//
// La veille relève les boîtes, rattache les réponses, verse les pièces jointes
// au dossier, les classe dans le Drive et rafraîchit Monday — sans personne
// devant l'écran. Sans ce compte rendu, on découvre un document sans savoir
// d'où il vient.
//
// Un paragraphe plutôt qu'un tableau de compteurs : on lit une phrase, on ne
// déchiffre pas cinq nombres. Et ce qui a échoué se tient à côté, nommé, avec
// de quoi le rattraper — un échec qu'on ne peut que relire ne sert à rien.

const FENETRE_H = 24;

const heure = (iso) =>
  new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

const NOMBRES = ["zéro", "une", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf"];
const enLettres = (n) => (n < NOMBRES.length ? NOMBRES[n] : String(n));

// « La nuit » n'est vrai que si la veille a effectivement tourné pendant qu'on
// dormait. Le reste du temps, on nomme la fenêtre pour ce qu'elle est.
function intitule(passes) {
  const heures = passes.map((p) => new Date(p.le).getHours());
  const nocturne = heures.every((h) => h >= 20 || h <= 8);
  return nocturne ? "La nuit" : "Les dernières 24 heures";
}

const Fort = ({ children }) => <strong className="font-medium text-[#ffffff]">{children}</strong>;

export default function RapportAuto({ onCompte }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [registre, setRegistre] = useState(false);
  const [relance, setRelance] = useState(null);

  const { data } = useQuery({
    queryKey: ["rapports-auto"],
    queryFn: () => base44.request("GET", "/api/assistant/rapports"),
    refetchInterval: 120000,
  });

  const relancer = useMutation({
    mutationFn: ({ rapport_id, index }) =>
      base44.request("POST", `/api/assistant/rapports/${rapport_id}/relancer`, { body: { index } }),
    onSuccess: (r) => {
      toast.success("Rattrapé", { description: r.detail || undefined });
      queryClient.invalidateQueries({ queryKey: ["rapports-auto"] });
      queryClient.invalidateQueries({ queryKey: ["assistant-propositions"] });
    },
    onError: (e) => toast.error(e?.message || "Relance impossible"),
    onSettled: () => setRelance(null),
  });

  const limite = Date.now() - FENETRE_H * 3600000;
  const passes = (data?.tous || [])
    .filter((r) => r.le && new Date(r.le).getTime() >= limite)
    .sort((a, b) => String(a.le).localeCompare(String(b.le)));

  // Les échecs anciens n'ont que du texte : on les montre sans bouton plutôt
  // que de promettre une relance qu'on ne saurait pas rejouer.
  const echecs = passes.flatMap((r) =>
    (r.echecs || []).map((e, i) => ({ ...e, rapport_id: r.id, index: i })).filter((e) => !e.regle)
  );
  const anciens = passes.some((r) => !r.echecs) ? passes.flatMap((r) => (r.echecs ? [] : r.erreurs || [])) : [];

  React.useEffect(() => {
    onCompte?.(echecs.length + anciens.length);
  }, [echecs.length, anciens.length, onCompte]);

  if (!passes.length) return null;

  const total = passes.reduce(
    (t, r) => ({
      mails: t.mails + (r.nouveaux || 0),
      rattaches: t.rattaches + (r.rattaches || 0),
      documents: t.documents + (r.documents || 0),
      classes: t.classes + (r.classes || 0),
      fiches: t.fiches + (r.fiches || 0),
      engagements: t.engagements + (r.engagements || 0),
    }),
    { mails: 0, rattaches: 0, documents: 0, classes: 0, fiches: 0, engagements: 0 }
  );

  const lignes = passes.flatMap((r) => r.lignes || []);
  const nEchecs = echecs.length + anciens.length;

  // La phrase se construit morceau par morceau : ce qui vaut zéro ne se dit pas.
  const faits = [
    total.mails ? (
      <>
        <Fort>
          {total.mails} mail{total.mails > 1 ? "s" : ""} relevé{total.mails > 1 ? "s" : ""}
        </Fort>
        {total.rattaches ? (
          <>
            , dont{" "}
            <Fort>
              {total.rattaches} rattaché{total.rattaches > 1 ? "s" : ""} à un dossier
            </Fort>
          </>
        ) : null}
      </>
    ) : null,
    total.documents ? (
      <Fort>
        {total.documents} pièce{total.documents > 1 ? "s" : ""} jointe{total.documents > 1 ? "s" : ""} versée
        {total.documents > 1 ? "s" : ""}
      </Fort>
    ) : null,
    total.classes ? (
      <Fort>
        {total.classes} classée{total.classes > 1 ? "s" : ""} dans le Drive
      </Fort>
    ) : null,
    total.fiches ? (
      <Fort>
        {total.fiches} fiche{total.fiches > 1 ? "s" : ""} Monday rafraîchie{total.fiches > 1 ? "s" : ""}
      </Fort>
    ) : null,
    total.engagements ? (
      <Fort>
        {total.engagements} promesse{total.engagements > 1 ? "s" : ""} inscrite{total.engagements > 1 ? "s" : ""} au
        registre
      </Fort>
    ) : null,
  ].filter(Boolean);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1.35fr_1fr] gap-x-14 gap-y-10">
      {/* --- Le récit ------------------------------------------------------ */}
      <div>
        <p className="m-0 mb-6 text-[11px] tracking-[.18em] uppercase text-[#9298a6]">{intitule(passes)}</p>

        <p className="m-0 text-[21px] max-md:text-[18px] leading-[1.55] text-[#c9cdd6] font-light">
          Entre {heure(passes[0].le)} et {heure(passes[passes.length - 1].le)}, en {enLettres(passes.length)} passe
          {passes.length > 1 ? "s" : ""}
          {faits.length ? " : " : ", rien n'est passé."}
          {faits.map((f, i) => (
            <React.Fragment key={i}>
              {i > 0 && (i === faits.length - 1 ? " et " : ", ")}
              {f}
            </React.Fragment>
          ))}
          {faits.length ? ". " : " "}
          {nEchecs > 0 && (
            <>
              {enLettres(nEchecs).replace(/^une$/, "Une")}
              {nEchecs === 1 ? " opération a échoué." : ` opérations ont échoué.`}
            </>
          )}
        </p>

        {lignes.length > 0 && (
          <>
            <button
              onClick={() => setRegistre((v) => !v)}
              className="mt-6 text-[13.5px] text-[#a9c5b9] border-b border-[#a9c5b9]/50 pb-[2px] hover:border-[#a9c5b9] transition-colors"
            >
              {registre ? "Masquer le registre" : "Voir le registre par dossier"}
            </button>

            {registre && (
              <div className="mt-5 space-y-3.5">
                {lignes.map((l, i) => (
                  <div key={`${l.deal_id}-${i}`} className="border-t border-[#1f2228] pt-3">
                    <button
                      onClick={() => navigate(`/Analyse?deal_id=${l.deal_id}`)}
                      className="text-[14px] text-[#f2f3f5] hover:text-[#a9c5b9] transition-colors text-left"
                    >
                      {l.dossier}
                    </button>
                    <p className="m-0 mt-1 text-[12.5px] text-[#9298a6] leading-[1.55]">
                      {[
                        `${l.documents.length} document(s) de ${l.de} : ${l.documents.join(", ")}`,
                        l.drive ? `classés dans ${l.drive}` : null,
                        l.monday,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* --- Ce qui a manqué ------------------------------------------------ */}
      {nEchecs > 0 && (
        <div>
          <p className="m-0 mb-6 text-[11px] tracking-[.18em] uppercase text-[#e8746a]">Ce qui a échoué</p>

          <div className="space-y-7">
            {echecs.map((e) => {
              const cle = `${e.rapport_id}:${e.index}`;
              const occupe = relance === cle;
              return (
                <div key={cle} className="border-l-2 border-[#e8746a]/70 pl-5">
                  <p className="m-0 text-[16.5px] text-[#f2f3f5] leading-snug">{e.quoi}</p>
                  <p className="m-0 mt-1.5 text-[13px] text-[#9298a6] leading-[1.5]">
                    {heure(e.le)} · {e.operation === "monday" ? "Monday" : e.operation === "drive" ? "Drive" : "Relève"}
                    {" — "}
                    {e.cause}
                  </p>
                  <button
                    onClick={() => {
                      setRelance(cle);
                      relancer.mutate({ rapport_id: e.rapport_id, index: e.index });
                    }}
                    disabled={!!relance}
                    className="mt-3.5 inline-flex items-center gap-1.5 px-3.5 py-2 border border-[#e8746a]/60 text-[10.5px] tracking-[.16em] uppercase text-[#e8746a] hover:bg-[#e8746a]/10 disabled:opacity-50 transition-colors"
                  >
                    {occupe && <Loader2 className="w-3 h-3 animate-spin" />}
                    Relancer
                  </button>
                </div>
              );
            })}

            {/* Les passages d'avant, sans opération nommée : rien à rejouer. */}
            {anciens.map((texte, i) => (
              <div key={`ancien-${i}`} className="border-l-2 border-[#e8746a]/40 pl-5">
                <p className="m-0 text-[14px] text-[#c9cdd6] leading-[1.55]">{texte}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
