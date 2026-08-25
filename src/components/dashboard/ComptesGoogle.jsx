import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { Check, Loader2, X } from "lucide-react";
import { BoutonConnecterGmail } from "@/components/mails/ConnexionGmail";

// Les comptes Google connectés, sur le dashboard.
//
// Ils vivaient sur la page Mails, supprimée depuis. Or tout en dépend : la
// relève des boîtes, le classement Drive, l'agenda d'équipe et l'envoi des
// mails. Un compte se connecte et se retire donc ici, à côté du travail qu'il
// rend possible.

// Ce qu'une portée autorise, dit en clair.
const PORTEES = [
  ["peut_lire", "Lecture des mails"],
  ["peut_envoyer", "Envoi"],
  ["peut_drive", "Drive"],
  ["peut_agenda", "Agenda"],
];

export default function ComptesGoogle() {
  const queryClient = useQueryClient();

  const { data: statut, isLoading } = useQuery({
    queryKey: ["mail-status"],
    queryFn: () => base44.functions.invoke("getMailStatus", {}),
  });

  const comptes = statut?.accounts || [];
  const google = statut?.google || {};

  const rafraichir = () => {
    queryClient.invalidateQueries({ queryKey: ["mail-status"] });
    queryClient.invalidateQueries({ queryKey: ["assistant-propositions"] });
  };

  const deconnecter = useMutation({
    mutationFn: (email) => base44.functions.invoke("disconnectMailAccount", { email }),
    onSuccess: () => { rafraichir(); toast.success("Compte délié"); },
    onError: (e) => toast.error(e?.message || "Déconnexion impossible"),
  });

  if (isLoading) return null;

  return (
    <div className="border border-[#242726] rounded-md px-4 py-3.5 mb-4">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <p className="m-0 text-[12.5px] text-[#9aa19e]">
          Comptes Google — ils alimentent la relève, le Drive et l'agenda.
        </p>
        <BoutonConnecterGmail
          onConnecte={rafraichir}
          libelle={comptes.length ? "Connecter un autre compte" : "Connecter un compte"}
        />
      </div>

      {!google.enabled && (
        <p className="m-0 text-[12px] text-[#e0c9a0] leading-[1.6]">
          La connexion Google n'est pas configurée côté serveur (GOOGLE_CLIENT_ID et
          GOOGLE_CLIENT_SECRET).
        </p>
      )}

      {comptes.length === 0 ? (
        google.enabled && (
          <p className="m-0 text-[12px] text-[#6b7270]">
            Aucun compte connecté : l'assistant ne voit passer aucun mail.
          </p>
        )
      ) : (
        <ul className="m-0 p-0 list-none space-y-2">
          {comptes.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <span className="text-[13px] text-[#edeae5]">{c.email}</span>

              {PORTEES.map(([cle, libelle]) => (
                <span
                  key={cle}
                  className={`text-[11px] inline-flex items-center gap-1 ${c[cle] ? "text-[#7fd3c9]" : "text-[#4f5654]"}`}
                  title={c[cle] ? `${libelle} autorisée` : `${libelle} non autorisée — reconnectez le compte`}
                >
                  {c[cle] ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                  {libelle}
                </span>
              ))}

              {c.needs_reconnect && (
                <span className="text-[11px] text-[#e0c9a0]">à reconnecter</span>
              )}

              <button
                onClick={() => {
                  if (window.confirm(`Délier ${c.email} ?`)) deconnecter.mutate(c.email);
                }}
                disabled={deconnecter.isPending}
                className="ml-auto text-[11.5px] text-[#6b7270] hover:text-red-400 transition-colors disabled:opacity-50"
              >
                {deconnecter.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Délier"}
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Une portée manquante ne se rattrape qu'en reconnectant : un jeton déjà
          émis ne l'acquiert jamais rétroactivement. */}
      {comptes.some((c) => !c.peut_lire) && google.gmail_read && (
        <p className="m-0 mt-2.5 text-[11.5px] text-[#e0c9a0] leading-[1.55]">
          Un compte n'autorise pas la lecture des mails alors que le serveur la demande :
          reconnectez-le pour que l'assistant puisse relever sa boîte.
        </p>
      )}
    </div>
  );
}
