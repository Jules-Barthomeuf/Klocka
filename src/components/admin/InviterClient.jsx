import React, { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import { Check, Copy, Link2, Loader2, Send, UserPlus, X } from "lucide-react";

// Inviter un client : l'équipe crée le compte, la personne reçoit un lien et
// n'a qu'à choisir son mot de passe. Le lien s'envoie depuis une boîte
// connectée de l'admin ; sans boîte, il se copie et part par le canal qu'on
// veut — le résultat est le même.

const copier = async (texte) => {
  try {
    await navigator.clipboard.writeText(texte);
    toast.success("Lien copié");
  } catch {
    window.prompt("Copiez le lien :", texte);
  }
};

function inviter(body) {
  return base44.request("POST", "/api/admin/clients/inviter", { body });
}

/** Le formulaire, replié derrière un bouton dans l'en-tête de la page. */
/**
 * @param {{onCree?: (r: {user_id, email}) => void}} props - appelé dès que le
 *   compte existe : la page peut l'ouvrir pour poser projets et étape sans
 *   attendre que la personne se connecte.
 */
export default function InviterClient({ onCree } = {}) {
  const queryClient = useQueryClient();
  const [ouvert, setOuvert] = useState(false);
  const [nom, setNom] = useState("");
  const [email, setEmail] = useState("");
  const [resultat, setResultat] = useState(null);

  const mutation = useMutation({
    mutationFn: (envoyer) => inviter({ full_name: nom, email, envoyer }),
    onSuccess: (r) => {
      setResultat(r);
      queryClient.invalidateQueries({ queryKey: ["all-users"] });
      onCree?.(r);
      if (r.envoye) toast.success(`Invitation envoyée à ${r.email}`);
      else if (r.erreur_envoi) toast.error(r.erreur_envoi);
    },
    onError: (e) => toast.error(e?.message || "Invitation impossible"),
  });

  const fermer = () => {
    setOuvert(false);
    setResultat(null);
    setNom("");
    setEmail("");
  };

  if (!ouvert) {
    return (
      <button
        onClick={() => setOuvert(true)}
        className="inline-flex h-11 items-center gap-2 rounded-full bg-menthe px-5 text-[14px] text-sur-menthe transition-colors hover:bg-menthe-survol"
      >
        <UserPlus className="h-4 w-4" /> Inviter un client
      </button>
    );
  }

  return (
    <div className="w-full rounded-[16px] border border-trait bg-rail p-5">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <p className="m-0 text-[16px] text-encre">Inviter un client</p>
          <p className="m-0 mt-1 text-[12.5px] text-ardoise">
            Le compte est créé tout de suite. La personne ouvre le lien, choisit son mot de passe, entre.
          </p>
        </div>
        <button onClick={fermer} className="text-brume hover:text-encre">
          <X className="w-4 h-4" />
        </button>
      </div>

      {!resultat ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate(true);
          }}
          className="flex flex-wrap items-end gap-4"
        >
          <label className="flex-1 min-w-[180px]">
            <span className="mb-1.5 block text-[12.5px] text-ardoise">Nom</span>
            <input
              value={nom}
              onChange={(e) => setNom(e.target.value)}
              placeholder="Prénom Nom"
              className="h-11 w-full rounded-full border border-trait bg-surface px-4 text-[15px] text-encre outline-none placeholder:text-brume focus:border-bord-doux max-md:text-[16px]"
            />
          </label>
          <label className="flex-1 min-w-[220px]">
            <span className="mb-1.5 block text-[12.5px] text-ardoise">Adresse email</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="client@exemple.fr"
              className="h-11 w-full rounded-full border border-trait bg-surface px-4 text-[15px] text-encre outline-none placeholder:text-brume focus:border-bord-doux max-md:text-[16px]"
            />
          </label>
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={!email.trim() || mutation.isPending}
              className="inline-flex h-11 items-center gap-2 rounded-full bg-menthe px-5 text-[14px] text-sur-menthe hover:bg-menthe-survol disabled:opacity-40"
            >
              {mutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              Envoyer le lien
            </button>
            <button
              type="button"
              disabled={!email.trim() || mutation.isPending}
              onClick={() => mutation.mutate(false)}
              className="inline-flex h-11 items-center gap-2 rounded-full border border-trait px-5 text-[14px] text-craie hover:border-bord-vif hover:text-encre disabled:opacity-40" style={{ background: "transparent" }}
            >
              <Link2 className="w-3.5 h-3.5" /> Juste le lien
            </button>
          </div>
        </form>
      ) : (
        <div>
          <p className="m-0 text-[13.5px] text-encre">
            {resultat.envoye ? (
              <>
                <Check className="w-3.5 h-3.5 inline-block mr-1.5 text-menthe-clair align-[-2px]" />
                Invitation envoyée à <strong className="font-medium">{resultat.email}</strong>.
              </>
            ) : resultat.simule ? (
              <>Aucune boîte connectée à votre compte : envoyez le lien vous-même.</>
            ) : (
              <>Lien prêt pour <strong className="font-medium">{resultat.email}</strong>.</>
            )}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <code className="min-w-[260px] flex-1 break-all rounded-[12px] border border-trait bg-surface px-3 py-2 text-[12.5px] text-ardoise">
              {resultat.lien}
            </code>
            <button
              onClick={() => copier(resultat.lien)}
              className="inline-flex h-10 items-center gap-2 rounded-full border border-trait px-4 text-[14px] text-craie hover:border-bord-vif hover:text-encre" style={{ background: "transparent" }}
            >
              <Copy className="w-3.5 h-3.5" /> Copier
            </button>
          </div>
          <p className="m-0 mt-3 text-[11px] text-brume">Valable quatorze jours. Un nouveau lien remplace l'ancien.</p>
          <button onClick={fermer} className="mt-4 text-[12.5px] text-ardoise hover:text-encre">
            Inviter quelqu'un d'autre
          </button>
        </div>
      )}
    </div>
  );
}

/** Le bouton par utilisateur : regénère un lien pour un compte sans mot de passe. */
export function BoutonLienInvitation({ user }) {
  const mutation = useMutation({
    mutationFn: () => inviter({ email: user.email, reprise: true }),
    onSuccess: (r) => copier(r.lien),
    onError: (e) => toast.error(e?.message || "Lien impossible"),
  });
  if (user.mot_de_passe_defini_le) return null;
  return (
    <button
      onClick={() => mutation.mutate()}
      disabled={mutation.isPending}
      aria-label="Copier un lien d'invitation" title="Copier un lien d'invitation"
      className="inline-flex h-8 flex-shrink-0 items-center gap-1.5 rounded-full border border-trait px-3 text-[13px] text-craie transition-colors hover:border-bord-vif hover:text-encre disabled:opacity-40" style={{ background: "transparent" }}
    >
      {mutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Link2 className="w-3 h-3" />}
      Lien
    </button>
  );
}
