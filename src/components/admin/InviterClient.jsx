import React, { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
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
        className="inline-flex items-center gap-2 px-4 py-2 text-[10px] tracking-[0.16em] uppercase border border-[#96c0b8]/50 text-[#96c0b8] hover:bg-[#96c0b8]/[0.08] transition-colors"
      >
        <UserPlus className="w-3.5 h-3.5" /> Inviter un client
      </button>
    );
  }

  return (
    <div className="w-full border border-[#96c0b8]/30 bg-[#96c0b8]/[0.03] p-5">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <p className="m-0 text-[10px] tracking-[.18em] uppercase text-[#96c0b8]">Inviter un client</p>
          <p className="m-0 mt-1 text-[12.5px] text-[#9298a6]">
            Le compte est créé tout de suite. La personne ouvre le lien, choisit son mot de passe, entre.
          </p>
        </div>
        <button onClick={fermer} className="text-[#6a7180] hover:text-[#f2f3f5]">
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
            <span className="block text-[10px] tracking-[.16em] uppercase text-[#9298a6] mb-1.5">Nom</span>
            <input
              value={nom}
              onChange={(e) => setNom(e.target.value)}
              placeholder="Prénom Nom"
              className="w-full bg-transparent border-0 border-b border-[#f2f3f5]/[0.18] focus:border-[#96c0b8] px-0 py-1.5 text-[15px] text-[#f2f3f5] outline-none placeholder:text-[#6a7180]"
            />
          </label>
          <label className="flex-1 min-w-[220px]">
            <span className="block text-[10px] tracking-[.16em] uppercase text-[#9298a6] mb-1.5">Adresse email</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="client@exemple.fr"
              className="w-full bg-transparent border-0 border-b border-[#f2f3f5]/[0.18] focus:border-[#96c0b8] px-0 py-1.5 text-[15px] text-[#f2f3f5] outline-none placeholder:text-[#6a7180]"
            />
          </label>
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={!email.trim() || mutation.isPending}
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#96c0b8] text-[#000000] text-[10px] tracking-[.16em] uppercase font-medium disabled:opacity-40"
            >
              {mutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              Envoyer le lien
            </button>
            <button
              type="button"
              disabled={!email.trim() || mutation.isPending}
              onClick={() => mutation.mutate(false)}
              className="inline-flex items-center gap-2 px-4 py-2 border border-[#2c3139] text-[#f2f3f5] text-[10px] tracking-[.16em] uppercase hover:bg-[#f2f3f5]/[0.06] disabled:opacity-40"
            >
              <Link2 className="w-3.5 h-3.5" /> Juste le lien
            </button>
          </div>
        </form>
      ) : (
        <div>
          <p className="m-0 text-[13.5px] text-[#f2f3f5]">
            {resultat.envoye ? (
              <>
                <Check className="w-3.5 h-3.5 inline-block mr-1.5 text-[#c3ddd6] align-[-2px]" />
                Invitation envoyée à <strong className="font-medium">{resultat.email}</strong>.
              </>
            ) : resultat.simule ? (
              <>Aucune boîte connectée à votre compte : envoyez le lien vous-même.</>
            ) : (
              <>Lien prêt pour <strong className="font-medium">{resultat.email}</strong>.</>
            )}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <code className="text-[12px] text-[#9298a6] break-all bg-[#000000] px-3 py-2 border border-[#15171b] flex-1 min-w-[260px]">
              {resultat.lien}
            </code>
            <button
              onClick={() => copier(resultat.lien)}
              className="inline-flex items-center gap-2 px-4 py-2 border border-[#2c3139] text-[#f2f3f5] text-[10px] tracking-[.16em] uppercase hover:bg-[#f2f3f5]/[0.06]"
            >
              <Copy className="w-3.5 h-3.5" /> Copier
            </button>
          </div>
          <p className="m-0 mt-3 text-[11.5px] text-[#6a7180]">Valable quatorze jours. Un nouveau lien remplace l'ancien.</p>
          <button onClick={fermer} className="mt-4 text-[12px] text-[#9298a6] hover:text-[#f2f3f5]">
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
      title="Copier un lien d'invitation"
      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] tracking-[0.16em] uppercase border border-[#2c3139] text-[#9298a6] hover:text-[#f2f3f5] hover:border-[#3a3f4a] transition-colors disabled:opacity-40 flex-shrink-0"
    >
      {mutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Link2 className="w-3 h-3" />}
      Lien
    </button>
  );
}
