import React, { useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import { Download, Upload } from "lucide-react";

/**
 * Emporter la base, et la ramener.
 *
 * Chez un hébergeur sans disque persistant, chaque déploiement efface tout.
 * Ce bloc est la seule protection en attendant le disque. Il était sur le
 * tableau de bord, c'est-à-dire sur l'écran d'accueil de toute l'équipe :
 * c'est de la maintenance, sa place est ici, avec l'état du service.
 *
 * Il ne fonctionnait d'ailleurs pas : la route serveur n'avait jamais été
 * montée, « Télécharger » renvoyait la page d'accueil.
 */
export default function SauvegardeBase() {
  const fichier = useRef(null);
  const [enCours, setEnCours] = useState(false);

  const restaurer = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setEnCours(true);
    try {
      const form = new FormData();
      form.append("fichier", f);
      const r = await base44.request("POST", "/api/admin/sauvegarde", { body: form, isForm: true });
      toast.success("Sauvegarde restaurée", {
        description: `${r.records} enregistrement(s) ramené(s)`,
      });
      setTimeout(() => window.location.reload(), 1200);
    } catch (err) {
      toast.error(err?.message || "Restauration impossible");
    } finally {
      setEnCours(false);
    }
  };

  return (
    <section className="mt-10 border-t border-trait pt-7">
      <input ref={fichier} type="file" accept=".json" className="hidden" onChange={restaurer} />
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div>
          <div className="text-[11px] tracking-[.16em] uppercase text-ardoise mb-2">Maintenance</div>
          <h2 className="m-0 text-[18px] font-normal text-encre">Sauvegarde de la base</h2>
          <p className="mt-2 mb-0 max-w-[62ch] text-[12.5px] leading-[1.65] text-ardoise">
            Emportez-la avant de déployer, ramenez-la après. La restauration fusionne par
            identifiant : elle n’efface rien. Les fichiers déposés (documents, photos) ne
            voyagent pas ici, seul un disque persistant les garde.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href="/api/admin/sauvegarde"
            className="inline-flex items-center gap-2 px-3.5 py-2 border border-bord text-[11px] tracking-[.16em] uppercase text-craie hover:border-bord-vif transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Télécharger
          </a>
          <button
            onClick={() => fichier.current?.click()}
            disabled={enCours}
            className="inline-flex items-center gap-2 px-3.5 py-2 border border-bord text-[11px] tracking-[.16em] uppercase text-craie hover:border-bord-vif transition-colors disabled:opacity-50"
          >
            <Upload className="w-3.5 h-3.5" />
            {enCours ? "Restauration…" : "Restaurer"}
          </button>
        </div>
      </div>
    </section>
  );
}
