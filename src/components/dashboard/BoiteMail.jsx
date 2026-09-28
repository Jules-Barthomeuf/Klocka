import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown, Loader2, Plus, TriangleAlert, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useConnexionGmail } from "@/components/mails/ConnexionGmail";
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

  const { connecter, enCours: enConnexion } = useConnexionGmail(rafraichir);

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
        className="inline-flex items-center gap-2 rounded-full border border-trait bg-surface-pleine px-3.5 py-2 text-[13.5px] text-encre transition-colors hover:border-bord-doux"
      >
        <span className={`h-[7px] w-[7px] rounded-full ${teinte}`} />
        {mot}
        <ChevronDown className={`h-3.5 w-3.5 text-ardoise transition-transform ${ouvert ? "rotate-180" : ""}`} />
      </button>

      {ouvert && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOuvert(false)} />
          {/* Le panneau (maquette) : les boîtes, la coche sur celle qui envoie,
              un clic sur une autre en fait la boîte par défaut ; puis ajouter
              une boîte Google et l'historique des envois. */}
          <div className="absolute right-0 top-[calc(100%+8px)] z-40 w-[340px] max-w-[calc(100vw-32px)] rounded-[16px] border border-trait bg-surface-pleine py-2 shadow-[0_18px_48px_rgb(0_0_0/0.14)]">
            <p className="m-0 px-4 pb-1.5 pt-2 text-[13px] text-craie">Boîtes mail connectées</p>
            {aReconnecter.length > 0 && (
              <p className="m-0 flex items-start gap-2 px-4 pb-1.5 text-[12px] leading-[1.45] text-ambre"><TriangleAlert className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />{aReconnecter.map((c) => c.email).join(", ")} demande une reconnexion.</p>
            )}
            {!n && (
              <p className="m-0 px-4 py-1.5 text-[12.5px] leading-[1.5] text-ardoise">
                {googleConfigure ? "Aucune boîte : les mails de la plateforme sont simulés et n'arrivent à personne." : "La connexion Google n'est pas configurée sur ce serveur."}
              </p>
            )}
            <ul className="m-0 list-none p-0">
              {comptes.map((c) => {
                const enPanne = c.needs_reconnect || c.verified === false;
                return (
                  <li key={c.email} className="group flex items-center">
                    <button
                      type="button"
                      disabled={occupe || c.par_defaut}
                      onClick={() => defaut.mutate(c.email)}
                      title={c.par_defaut ? "Les mails partent de cette boîte" : "Envoyer depuis cette boîte"}
                      className="flex min-w-0 flex-1 items-center gap-3 px-4 py-2 text-left transition-colors hover:bg-relief disabled:cursor-default disabled:hover:bg-transparent"
                      style={{ background: "transparent" }}
                    >
                      <span className="flex w-4 flex-none justify-center">
                        {enPanne ? <TriangleAlert className="h-3.5 w-3.5 text-ambre" /> : c.par_defaut ? <Check className="h-4 w-4 text-menthe" strokeWidth={2} /> : null}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[14px] text-encre">{c.email}</span>
                      {c.par_defaut && <span className="flex-none text-[12.5px] text-craie">par défaut</span>}
                    </button>
                    <button type="button" disabled={occupe} onClick={() => confirmerRetrait(c.email)} aria-label={`Déconnecter ${c.email}`} title="Déconnecter cette boîte"
                      className="mr-2 grid h-7 w-7 flex-none place-items-center rounded-full text-brume opacity-0 transition-opacity hover:text-alerte group-hover:opacity-100 focus-visible:opacity-100 disabled:opacity-40" style={{ background: "transparent" }}>
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="my-1.5 border-t border-trait" />
            {googleConfigure && (
              <button type="button" onClick={connecter} disabled={enConnexion} className="flex w-full items-center gap-3 px-4 py-2 text-left text-[14px] text-menthe transition-colors hover:bg-relief disabled:opacity-60" style={{ background: "transparent" }}>
                <span className="flex w-4 flex-none justify-center">{enConnexion ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" strokeWidth={1.8} />}</span>
                {enConnexion ? "Connexion en cours…" : aReconnecter.length ? "Reconnecter une boîte Google" : "Ajouter une boîte Google"}
              </button>
            )}
            {n > 0 && (
              <button type="button" onClick={() => setHistorique((v) => !v)} aria-expanded={historique} className="flex w-full items-center gap-3 px-4 py-2 text-left text-[14px] text-encre transition-colors hover:bg-relief" style={{ background: "transparent" }}>
                <span className="w-4 flex-none" />
                {historique ? "Masquer l'historique des envois" : "Voir l'historique des envois"}
              </button>
            )}
            {historique && <div className="mx-4 mt-1 max-h-[40vh] overflow-y-auto border-t border-trait pt-1"><Historique /></div>}
          </div>
        </>
      )}
    </div>
  );
}
