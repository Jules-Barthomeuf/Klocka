import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Inbox, Loader2, Microscope, Paperclip, RefreshCw } from "lucide-react";
import { toast } from "sonner";

// Boîte de réception : relève Gmail (portée lecture) déclenchée à l'ouverture
// et via le bouton Actualiser — jamais de polling. Un clic sur « Préanalyser »
// télécharge le mail complet (pièces jointes incluses) et le passe au pipeline
// de préanalyse, puis redirige vers le dossier créé.

export default function BoiteReception({ comptes = [], gmailReadActif }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const lisibles = comptes.filter((c) => c.peut_lire);
  const [compte, setCompte] = useState(null);
  const compteActif = compte || lisibles[0]?.id || null;

  const { data: mails = [], isLoading } = useQuery({
    queryKey: ["inbox", compteActif],
    queryFn: () => base44.request("GET", `/api/mails/inbox?compte=${encodeURIComponent(compteActif)}`),
    enabled: !!compteActif,
    initialData: [],
  });

  const relever = useMutation({
    mutationFn: () =>
      base44.request("POST", "/api/mails/inbox/relever", { body: { compte: compteActif } }),
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ["inbox", compteActif] });
      toast.success(r.nouveaux ? `${r.nouveaux} nouveau(x) mail(s)` : "Boîte à jour");
    },
    onError: (e) => toast.error(e?.message || "Relève impossible"),
  });

  // Relève automatique à l'ouverture de l'onglet (une fois par compte).
  useEffect(() => {
    if (compteActif) relever.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compteActif]);

  const preanalyser = useMutation({
    mutationFn: (mailId) => base44.request("POST", `/api/mails/inbox/${mailId}/preanalyser`),
    onSuccess: (dossier) => {
      toast.success("Mail préanalysé");
      navigate(`/Analyse?deal_id=${dossier.deal_id}`);
    },
    onError: (e) => toast.error(e?.message || "Préanalyse impossible"),
  });

  if (!lisibles.length) {
    return (
      <div className="text-center py-16 max-w-lg mx-auto">
        <Inbox className="w-10 h-10 text-[#35a79b]/30 mx-auto mb-4" />
        {!gmailReadActif ? (
          <p className="text-[#8b9391] text-sm leading-relaxed">
            La lecture de la boîte n'est pas activée. Ajoutez{" "}
            <code className="text-[#d3d8d6]">GOOGLE_GMAIL_READ=true</code> dans{" "}
            <code className="text-[#d3d8d6]">.env</code>, redémarrez, puis reconnectez votre compte
            Google : l'écran de consentement demandera l'accès en lecture.
          </p>
        ) : (
          <p className="text-[#8b9391] text-sm leading-relaxed">
            Aucun compte n'a autorisé la lecture de sa boîte.{" "}
            {comptes.length > 0
              ? "Reconnectez votre compte Google : le nouveau consentement inclura la lecture."
              : "Connectez votre compte Google depuis le bouton en haut de page."}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        {lisibles.length > 1 && (
          <Select value={compteActif} onValueChange={setCompte}>
            <SelectTrigger className="bg-[#171918] border-[#282b2a] text-[#edeae5] w-72">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#0a0c0c] border-[#282b2a] text-[#edeae5]">
              {lisibles.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {lisibles.length === 1 && (
          <span className="text-[#9aa19e] text-sm">{lisibles[0].label}</span>
        )}
        <Button
          size="sm"
          onClick={() => relever.mutate()}
          disabled={relever.isPending}
          className="bg-[#edeae5]/5 hover:bg-[#edeae5]/10 text-[#d3d8d6] border-0 ml-auto"
        >
          {relever.isPending ? (
            <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
          ) : (
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
          )}
          Actualiser
        </Button>
      </div>

      {isLoading || (relever.isPending && !mails.length) ? (
        <p className="text-[#8b9391] text-sm py-8 text-center">Relève de la boîte…</p>
      ) : mails.length === 0 ? (
        <div className="text-center py-16">
          <Inbox className="w-10 h-10 text-[#35a79b]/30 mx-auto mb-4" />
          <p className="text-[#8b9391] text-sm">Aucun mail relevé pour l'instant.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {mails.map((m) => (
            <div
              key={m.id}
              className="bg-[#0a0c0c] border border-[#282b2a] rounded-md px-4 py-3 flex items-center gap-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 min-w-0">
                  <p className="text-[#edeae5] text-sm font-medium truncate">{m.objet}</p>
                  {m.pieces_jointes?.length > 0 && (
                    <span className="text-[#8b9391] text-xs flex items-center gap-1 flex-shrink-0">
                      <Paperclip className="w-3 h-3" />
                      {m.pieces_jointes.length}
                    </span>
                  )}
                </div>
                <p className="text-[#8b9391] text-xs truncate">
                  {m.de} · {m.date ? new Date(m.date).toLocaleString("fr-FR") : ""}
                </p>
                {m.extrait && <p className="text-[#6b7270] text-xs truncate mt-0.5">{m.extrait}</p>}
              </div>
              <div className="flex-shrink-0">
                {m.deal_id ? (
                  <Button
                    size="sm"
                    onClick={() => navigate(`/Analyse?deal_id=${m.deal_id}`)}
                    className="bg-[#35a79b]/15 hover:bg-[#35a79b]/25 text-[#7fd3c9] border-0"
                  >
                    Voir le deal
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => preanalyser.mutate(m.id)}
                    disabled={preanalyser.isPending}
                    className="bg-[#35a79b] hover:bg-[#2f8d84] text-[#edeae5]"
                  >
                    {preanalyser.isPending && preanalyser.variables === m.id ? (
                      <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <Microscope className="w-3.5 h-3.5 mr-1.5" />
                    )}
                    Préanalyser
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-[#6b7270] text-[11px]">
        La préanalyse lit le mail et ses pièces jointes (PDF, images) puis crée un deal dans la page
        Analyse. Comptez 30 à 60 secondes.
      </p>
    </div>
  );
}
