import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronDown, Mail, TriangleAlert } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { BoutonConnecterGmail } from "@/components/mails/ConnexionGmail";

// La boîte mail, en haut du plan de travail.
//
// Tant qu'aucune boîte n'est rattachée, rien ne part : l'envoi est simulé et le
// mail n'arrive jamais. Un bouton suffit donc, posé là où on commence sa
// journée. Une fois la boîte connectée, la bande le dit et ouvre l'historique
// de ce qui est parti de la plateforme — la seule façon de vérifier qu'un mail
// est bien sorti, avec son heure et son destinataire.

const quand = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const jours = Math.floor((Date.now() - d.getTime()) / 86400000);
  const heure = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  if (jours === 0) return `aujourd'hui à ${heure}`;
  if (jours === 1) return `hier à ${heure}`;
  return `${d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })} à ${heure}`;
};

const ETATS = {
  envoye: { mot: "envoyé", classe: "text-menthe-clair" },
  simule: { mot: "simulé", classe: "text-ambre" },
  erreur: { mot: "échec", classe: "text-red-400" },
};

function Historique() {
  const { data, isLoading } = useQuery({
    queryKey: ["mail-historique"],
    queryFn: () => base44.functions.invoke("getMailHistory", { limite: 50 }),
  });
  const envois = data?.envois || [];

  if (isLoading) return <p className="m-0 py-5 text-[12.5px] text-ardoise">Lecture du registre…</p>;
  if (!envois.length) {
    return <p className="m-0 py-5 text-[12.5px] text-ardoise">Aucun mail n&apos;est encore parti de la plateforme.</p>;
  }

  return (
    <ul className="m-0 list-none p-0">
      {envois.map((m) => {
        const etat = ETATS[m.statut] || ETATS.envoye;
        return (
          <li key={m.id} className="flex items-baseline gap-4 border-t border-trait py-3 first:border-t-0">
            <span className="w-[150px] flex-shrink-0 text-[12px] text-brume" style={{ fontVariantNumeric: "tabular-nums" }}>{quand(m.le)}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13.5px] text-encre">{m.sujet}</span>
              <span className="block truncate text-[12px] text-ardoise">
                à {m.a || "—"}
                {m.erreur ? ` · ${m.erreur}` : ""}
              </span>
            </span>
            <span className={`flex-shrink-0 text-[11.5px] ${etat.classe}`}>{etat.mot}</span>
          </li>
        );
      })}
    </ul>
  );
}

export default function BoiteMail() {
  const [ouvert, setOuvert] = useState(false);
  const { data: statut, isLoading } = useQuery({
    queryKey: ["mail-status"],
    queryFn: () => base44.functions.invoke("getMailStatus", {}),
  });

  if (isLoading) return null;

  const comptes = (statut?.accounts || []).filter((c) => c.peut_envoyer !== false);
  const aReconnecter = comptes.filter((c) => c.needs_reconnect || c.verified === false);
  const googleConfigure = statut?.google?.enabled !== false;

  // Aucune boîte : une bande sobre et un bouton. C'est le seul geste à faire.
  if (!comptes.length) {
    return (
      <div className="mb-6 flex flex-wrap items-center gap-4 rounded-[14px] border border-trait bg-surface px-5 py-4">
        <Mail className="h-4 w-4 flex-shrink-0 text-ardoise" />
        <p className="m-0 min-w-48 flex-1 text-[13px] leading-relaxed text-craie">
          Aucune boîte mail connectée.{" "}
          <span className="text-ardoise">
            {googleConfigure
              ? "Tant qu'elle ne l'est pas, les mails de la plateforme sont simulés et n'arrivent à personne."
              : "La connexion Google n'est pas configurée sur ce serveur : prévenez l'équipe technique."}
          </span>
        </p>
        {googleConfigure && <BoutonConnecterGmail libelle="Connecter ma boîte mail" />}
      </div>
    );
  }

  const adresses = comptes.map((c) => c.email).join(", ");

  return (
    <div className="mb-6 rounded-[14px] border border-trait bg-surface px-5 py-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {aReconnecter.length ? (
          <TriangleAlert className="h-4 w-4 flex-shrink-0 text-ambre" />
        ) : (
          <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-menthe/20">
            <Check className="h-3 w-3 text-menthe-clair" />
          </span>
        )}
        <p className="m-0 min-w-48 flex-1 text-[13px] text-craie">
          <span className="text-encre">{adresses}</span>{" "}
          {aReconnecter.length ? (
            <span className="text-ambre">demande une reconnexion : les envois échouent.</span>
          ) : (
            <span className="text-ardoise">est bien connectée. Les mails partent de cette adresse.</span>
          )}
        </p>
        <button
          type="button"
          onClick={() => setOuvert((v) => !v)}
          aria-expanded={ouvert}
          className="inline-flex items-center gap-1.5 rounded-full border border-trait px-3.5 py-1.5 text-[12.5px] text-craie transition-colors hover:border-bord-vif hover:text-encre"
        >
          {ouvert ? "Masquer l'historique" : "Voir l'historique"}
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${ouvert ? "rotate-180" : ""}`} />
        </button>
        {aReconnecter.length > 0 && <BoutonConnecterGmail libelle="Reconnecter" />}
      </div>

      {ouvert && (
        <div className="mt-4 border-t border-trait pt-2">
          <Historique />
        </div>
      )}
    </div>
  );
}
