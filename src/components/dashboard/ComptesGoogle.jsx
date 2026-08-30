import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { BoutonConnecterGmail } from "@/components/mails/ConnexionGmail";

// Les comptes Google connectés, en pied de tableau de bord.
//
// Ils vivaient sur la page Mails, supprimée depuis. Or tout en dépend : la
// relève des boîtes, le classement Drive, l'agenda d'équipe et l'envoi des
// mails. Un compte se connecte et se retire donc ici, à côté du travail qu'il
// rend possible.
//
// Une portée refusée s'affiche en clair, en or : c'est la première chose à
// regarder quand la veille ne rapporte rien.

const PORTEES = [
  ["peut_lire", "Relève des mails"],
  ["peut_envoyer", "Envoi"],
  ["peut_drive", "Drive — dossiers clients"],
  ["peut_agenda", "Agenda"],
];

const connexion = (iso) => {
  if (!iso || isNaN(new Date(iso))) return null;
  return `connecté le ${new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}`;
};

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
    // Le serveur relève la boîte dès le consentement : le rapport bouge aussi.
    queryClient.invalidateQueries({ queryKey: ["rapports-auto"] });
  };

  const deconnecter = useMutation({
    mutationFn: (email) => base44.functions.invoke("disconnectMailAccount", { email }),
    onSuccess: () => {
      rafraichir();
      toast.success("Compte délié");
    },
    onError: (e) => toast.error(e?.message || "Déconnexion impossible"),
  });

  if (isLoading) return null;

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-3 mb-8">
        <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
          <p className="m-0 text-[11px] tracking-[.18em] uppercase text-[#9298a6]">Comptes Google connectés</p>
          <p className="m-0 text-[13.5px] text-[#6a7180]">la relève, le Drive et l'agenda en dépendent</p>
        </div>
        <BoutonConnecterGmail
          onConnecte={rafraichir}
          libelle={comptes.length ? "Connecter un autre compte" : "Connecter un compte"}
        />
      </div>

      {!google.enabled && (
        <p className="m-0 text-[13.5px] text-[#a9c5b9] leading-[1.6]">
          La connexion Google n'est pas configurée côté serveur (GOOGLE_CLIENT_ID et GOOGLE_CLIENT_SECRET).
        </p>
      )}

      {comptes.length === 0
        ? google.enabled && (
            <p className="m-0 text-[15px] text-[#6a7180]">
              Aucun compte connecté : l'assistant ne voit passer aucun mail.
            </p>
          )
        : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-x-14 gap-y-10">
            {comptes.map((c) => (
              <div key={c.id}>
                <p className="m-0 text-[16px] text-[#f2f3f5] leading-snug break-all">{c.email}</p>
                <p className="m-0 mt-1 text-[13px] text-[#6a7180]">
                  {[c.name, connexion(c.connected_at)].filter(Boolean).join(" · ") || "compte Google"}
                </p>

                <dl className="m-0 mt-5">
                  {PORTEES.map(([cle, libelle]) => (
                    <div
                      key={cle}
                      className="flex items-baseline justify-between gap-4 border-t border-[#1f2228] py-2.5"
                    >
                      <dt className="text-[14px] text-[#c9cdd6]">{libelle}</dt>
                      <dd
                        className={`m-0 text-[13px] ${c[cle] ? "text-[#9298a6]" : "text-[#a9c5b9]"}`}
                        title={c[cle] ? undefined : "Reconnectez le compte pour l'accorder"}
                      >
                        {c[cle] ? "accordé" : "non accordé"}
                      </dd>
                    </div>
                  ))}
                  {c.needs_reconnect && (
                    <div className="flex items-baseline justify-between gap-4 border-t border-[#1f2228] py-2.5">
                      <dt className="text-[14px] text-[#c9cdd6]">Session Google</dt>
                      <dd className="m-0 text-[13px] text-[#e8746a]">à reconnecter</dd>
                    </div>
                  )}
                </dl>

                <button
                  onClick={() => {
                    if (window.confirm(`Délier ${c.email} ?`)) deconnecter.mutate(c.email);
                  }}
                  disabled={deconnecter.isPending}
                  className="mt-3 inline-flex items-center gap-1.5 text-[12.5px] text-[#6a7180] hover:text-[#e8746a] transition-colors disabled:opacity-50"
                >
                  {deconnecter.isPending && <Loader2 className="w-3 h-3 animate-spin" />}
                  Délier
                </button>
              </div>
            ))}
          </div>
        )}

      {/* Une portée manquante ne se rattrape qu'en reconnectant : un jeton déjà
          émis ne l'acquiert jamais rétroactivement. */}
      {comptes.some((c) => !c.peut_lire) && google.gmail_read && (
        <p className="m-0 mt-7 text-[13px] text-[#a9c5b9] leading-[1.6]">
          Un compte n'autorise pas la relève alors que le serveur la demande : reconnectez-le pour que l'assistant
          puisse lire sa boîte.
        </p>
      )}
    </div>
  );
}
