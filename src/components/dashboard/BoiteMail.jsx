import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown, TriangleAlert } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { BoutonConnecterGmail } from "@/components/mails/ConnexionGmail";
import { toast } from "@/components/ui/avis";

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

/** Une boîte rattachée : son adresse, et les gestes qu'elle permet. */
function Boite({ c, seule, onDefaut, onRetirer, occupe }) {
  const enPanne = c.needs_reconnect || c.verified === false;
  return (
    <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12.5px] ${c.par_defaut ? "border-menthe/50 bg-menthe/[0.08]" : "border-trait"}`}>
      {enPanne
        ? <TriangleAlert className="h-3.5 w-3.5 text-ambre" />
        : <Check className={`h-3.5 w-3.5 ${c.par_defaut ? "text-menthe-clair" : "text-ardoise"}`} />}
      <span className="text-encre">{c.email}</span>
      {c.par_defaut && !seule && <span className="text-[11px] text-menthe-clair">par défaut</span>}
      {!c.par_defaut && (
        <button type="button" disabled={occupe} onClick={() => onDefaut(c.email)}
          className="text-[11px] text-ardoise underline-offset-2 hover:text-encre hover:underline disabled:opacity-50" style={{ background: "transparent" }}>
          envoyer depuis celle-ci
        </button>
      )}
      <button type="button" disabled={occupe} onClick={() => onRetirer(c.email)} aria-label={`Déconnecter ${c.email}`} title="Déconnecter cette boîte"
        className="text-[14px] leading-none text-brume hover:text-alerte disabled:opacity-50" style={{ background: "transparent" }}>
        ×
      </button>
    </span>
  );
}

export default function BoiteMail() {
  const [ouvert, setOuvert] = useState(false);
  const [historique, setHistorique] = useState(false);
  const queryClient = useQueryClient();
  const { data: statut, isLoading } = useQuery({
    queryKey: ["mail-status"],
    queryFn: () => base44.functions.invoke("getMailStatus", {}),
  });
  const rafraichir = () => {
    queryClient.invalidateQueries({ queryKey: ["mail-status"] });
    queryClient.invalidateQueries({ queryKey: ["mail-historique"] });
  };
  const defaut = useMutation({
    mutationFn: (email) => base44.functions.invoke("setDefaultMailAccount", { email }),
    onSuccess: (r) => (r?.success ? rafraichir() : toast.error(r?.error || "Impossible de changer de boîte")),
  });
  const retirer = useMutation({
    mutationFn: (email) => base44.functions.invoke("disconnectMailAccount", { email }),
    onSuccess: (r) => (r?.success ? rafraichir() : toast.error(r?.error || "Impossible de déconnecter la boîte")),
  });

  if (isLoading) return null;

  const comptes = (statut?.accounts || []).filter((c) => c.peut_envoyer !== false);
  const aReconnecter = comptes.filter((c) => c.needs_reconnect || c.verified === false);
  const googleConfigure = statut?.google?.enabled !== false;
  const occupe = defaut.isPending || retirer.isPending;
  const confirmerRetrait = (email) => {
    if (window.confirm(`Déconnecter ${email} ? Les mails ne partiront plus de cette adresse.`)) retirer.mutate(email);
  };
  const n = comptes.length;
  // Le point de la pilule : vert quand tout envoie, ambre s'il faut reconnecter, rouge sans boîte.
  const teinte = !n ? "bg-alerte" : aReconnecter.length ? "bg-ambre" : "bg-vert";
  const mot = !n ? "Aucune boîte connectée" : `${n} boîte${n > 1 ? "s" : ""} connectée${n > 1 ? "s" : ""}`;

  // Une pilule en haut à droite (maquette) : le panneau des boîtes et
  // l'historique des envois s'ouvrent dessous. Sans boîte, rien ne part :
  // le panneau le dit, et propose de la connecter.
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOuvert((v) => !v)}
        aria-expanded={ouvert}
        className="inline-flex items-center gap-2.5 rounded-full border border-trait bg-surface-pleine px-4 py-2.5 text-[15px] text-encre transition-colors hover:border-bord-doux"
      >
        <span className={`h-2 w-2 rounded-full ${teinte}`} />
        {mot}
        <ChevronDown className={`h-3.5 w-3.5 text-ardoise transition-transform ${ouvert ? "rotate-180" : ""}`} />
      </button>

      {ouvert && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOuvert(false)} />
          <div className="absolute right-0 top-[calc(100%+8px)] z-40 w-[min(560px,calc(100vw-40px))] rounded-[20px] border border-trait bg-surface-pleine p-5 shadow-[0_24px_60px_rgb(0_0_0/0.14)]">
            {!n ? (
              <p className="m-0 text-[14px] leading-relaxed text-craie">
                <span className="text-ardoise">
                  {googleConfigure
                    ? "Tant qu'aucune boîte n'est connectée, les mails de la plateforme sont simulés et n'arrivent à personne."
                    : "La connexion Google n'est pas configurée sur ce serveur : prévenez l'équipe technique."}
                </span>
              </p>
            ) : aReconnecter.length ? (
              <p className="m-0 flex items-start gap-2 text-[14px] text-ambre"><TriangleAlert className="mt-0.5 h-4 w-4 flex-shrink-0" />{aReconnecter.map((c) => c.email).join(", ")} demande une reconnexion : les envois échouent.</p>
            ) : (
              <p className="m-0 text-[14px] text-ardoise">Vos mails partent de la boîte par défaut. Choisissez-en une autre d'un clic.</p>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {comptes.map((c) => (
                <Boite key={c.email} c={c} seule={comptes.length === 1} occupe={occupe} onDefaut={(e) => defaut.mutate(e)} onRetirer={confirmerRetrait} />
              ))}
              {googleConfigure && (
                <BoutonConnecterGmail
                  libelle={!n ? "Connecter ma boîte mail" : aReconnecter.length ? "Reconnecter" : "Ajouter une boîte"}
                  onConnecte={rafraichir}
                  className="!py-1.5 !text-[12.5px]"
                />
              )}
            </div>
            {n > 0 && (
              <div className="mt-4 border-t border-trait pt-3">
                <button type="button" onClick={() => setHistorique((v) => !v)} aria-expanded={historique} className="inline-flex items-center gap-1.5 text-[13.5px] text-craie hover:text-encre" style={{ background: "transparent" }}>
                  {historique ? "Masquer l'historique des envois" : "Voir l'historique des envois"}
                  <ChevronDown className={`h-3.5 w-3.5 transition-transform ${historique ? "rotate-180" : ""}`} />
                </button>
                {historique && <div className="mt-2 max-h-[40vh] overflow-y-auto"><Historique /></div>}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
