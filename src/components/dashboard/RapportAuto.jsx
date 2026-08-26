import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { ChevronDown, Check, Bot } from "lucide-react";

// Ce que la plateforme a fait pendant votre absence.
//
// La veille travaille sans personne devant l'écran : elle relève les boîtes,
// rattache les réponses, verse les pièces jointes au dossier, les classe dans le
// Drive et rafraîchit Monday. Sans ce compte rendu, on découvre un document sans
// savoir d'où il vient.
//
// Ne s'affiche que s'il y a quelque chose à dire : un bandeau qui répète « rien
// à signaler » cesse d'être lu.

const quand = (iso) => {
  if (!iso || isNaN(new Date(iso))) return "";
  const d = new Date(iso);
  const min = Math.floor((Date.now() - d.getTime()) / 60000);
  if (min < 60) return `il y a ${Math.max(1, min)} min`;
  if (min < 1440) return `il y a ${Math.floor(min / 60)} h`;
  return d.toLocaleDateString("fr-FR");
};

export default function RapportAuto() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [deplie, setDeplie] = useState(true);

  const { data } = useQuery({
    queryKey: ["rapports-auto"],
    queryFn: () => base44.request("GET", "/api/assistant/rapports"),
    refetchInterval: 120000,
  });

  const marquerVus = useMutation({
    mutationFn: () => base44.request("POST", "/api/assistant/rapports/vus", { body: {} }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["rapports-auto"] }),
  });

  const nouveaux = data?.nouveaux || [];
  if (!nouveaux.length) return null;

  const lignes = nouveaux.flatMap((r) => r.lignes || []);
  const erreurs = nouveaux.flatMap((r) => r.erreurs || []);
  const total = nouveaux.reduce(
    (t, r) => ({
      mails: t.mails + (r.nouveaux || 0),
      rattaches: t.rattaches + (r.rattaches || 0),
      documents: t.documents + (r.documents || 0),
      classes: t.classes + (r.classes || 0),
      fiches: t.fiches + (r.fiches || 0),
    }),
    { mails: 0, rattaches: 0, documents: 0, classes: 0, fiches: 0 }
  );

  const resume = [
    total.mails ? `${total.mails} mail${total.mails > 1 ? "s" : ""} retenu${total.mails > 1 ? "s" : ""}` : null,
    total.rattaches ? `${total.rattaches} rattaché${total.rattaches > 1 ? "s" : ""} à un dossier` : null,
    total.documents ? `${total.documents} document${total.documents > 1 ? "s" : ""} versé${total.documents > 1 ? "s" : ""}` : null,
    total.classes ? `${total.classes} classé${total.classes > 1 ? "s" : ""} dans le Drive` : null,
    total.fiches ? `${total.fiches} fiche${total.fiches > 1 ? "s" : ""} Monday à jour` : null,
  ].filter(Boolean);

  return (
    <div className="mb-5 border border-[#e0c9a0]/35 rounded-md bg-[#e0c9a0]/[0.04] px-4 py-3.5">
      <div className="flex flex-wrap items-start gap-3">
        <span className="w-8 h-8 rounded-md bg-[#e0c9a0]/15 text-[#e0c9a0] flex items-center justify-center flex-shrink-0">
          <Bot className="w-4 h-4" />
        </span>

        <div className="min-w-0 flex-1">
          <button onClick={() => setDeplie((d) => !d)} className="w-full text-left">
            <div className="flex items-center gap-2">
              <p className="m-0 text-[14px] text-[#edeae5] font-medium">Fait pendant votre absence</p>
              <ChevronDown className={`w-3.5 h-3.5 text-[#6b7270] transition-transform ${deplie ? "" : "-rotate-90"}`} />
            </div>
            <p className="m-0 mt-1 text-[12.5px] text-[#9aa19e]">
              {resume.join(" · ")}
              {nouveaux[0]?.le ? ` · dernier passage ${quand(nouveaux[0].le)}` : ""}
            </p>
          </button>

          {deplie && lignes.length > 0 && (
            <div className="mt-3 space-y-2">
              {lignes.map((l, i) => (
                <div key={`${l.deal_id}-${i}`} className="border-t border-[#e0c9a0]/15 pt-2">
                  <button
                    onClick={() => navigate(`/Analyse?deal_id=${l.deal_id}`)}
                    className="text-[13px] text-[#edeae5] hover:text-[#e0c9a0] transition-colors text-left"
                  >
                    {l.dossier}
                  </button>
                  <p className="m-0 mt-0.5 text-[11.5px] text-[#8b9391] leading-[1.5]">
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

          {deplie && erreurs.length > 0 && (
            <div className="mt-3 border-t border-[#e2564d]/25 pt-2">
              <p className="m-0 mb-1 text-[10px] tracking-[.14em] uppercase text-[#e2564d]">Ce qui a échoué</p>
              {erreurs.slice(0, 4).map((e, i) => (
                <p key={i} className="m-0 text-[11.5px] text-[#9aa19e] leading-[1.5]">
                  {e}
                </p>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={() => marquerVus.mutate()}
          disabled={marquerVus.isPending}
          title="Marquer comme lu"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-[#e0c9a0]/30 text-[12px] text-[#e0c9a0] hover:bg-[#e0c9a0]/[0.1] disabled:opacity-50 transition-colors flex-shrink-0"
        >
          <Check className="w-3 h-3" /> Vu
        </button>
      </div>
    </div>
  );
}
