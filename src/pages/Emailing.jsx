import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { req, boutonContour, boutonPrincipal } from "@/components/emailing/commun";
import Newsletters from "@/components/emailing/Newsletters";
import Assets from "@/components/emailing/Assets";
import Contacts from "@/components/emailing/Contacts";
import Statistiques from "@/components/emailing/Statistiques";

// La page Emailing, dessinée sur la maquette de Jules (6 oct. 2026), réduite
// à trois onglets le 9 oct. 2026 (le plan des newsletters) : Newsletters (une
// cohorte, des mails datés au rythme choisi), Contacts (listes, imports,
// fiches), Statistiques (l'entonnoir jusqu'au call). Les templates se
// choisissent en créant un mail ; les campagnes ponctuelles et les séquences
// sortent de la V1, leurs données restent. Tout envoi passe par Resend, sous
// le garde-fou : hors Render, rien ne part chez un vrai contact. Un mail
// ouvert prend toute la page.

const ONGLETS = [["newsletters", "Newsletters"], ["assets", "Assets"], ["contacts", "Contacts"], ["statistiques", "Statistiques"]];
// L'action de l'en-tête, par onglet : [libellé, demande] ; Contacts en a deux.
const ACTIONS = {
  newsletters: [["Nouvelle newsletter", "nouvelle", true]],
  assets: [["Nouvel asset", "nouveau", true]],
  contacts: [["Importer", "importer", false], ["Ajouter un contact", "ajouter", true]],
};

export default function Emailing() {
  const [onglet, setOnglet] = useState(() => {
    // Un onglet retenu d'avant (campagnes, séquences, templates) ouvre les newsletters.
    try { const v = localStorage.getItem("k-emailing-onglet"); return ONGLETS.some(([k]) => k === v) ? v : "newsletters"; } catch { return "newsletters"; }
  });
  // Le bouton de l'en-tête parle à l'onglet ouvert : une demande numérotée.
  const [demande, setDemande] = useState(null);
  const [detail, setDetail] = useState(false);
  const { data: etat } = useQuery({ queryKey: ["emailing-etat"], queryFn: () => req("GET", "/etat") });
  const choisir = (v) => {
    setOnglet(v);
    setDemande(null);
    setDetail(false);
    try { localStorage.setItem("k-emailing-onglet", v); } catch { /* l'onglet ne sera pas gardé */ }
  };
  const demander = (quoi) => setDemande({ quoi, n: Date.now() });
  const commun = { demande, onDetail: setDetail };
  return (
    <div className="min-h-screen text-encre">
      {!detail && (
        <div className="border-b border-trait px-10 pt-9 max-md:px-4 max-md:pt-6">
          <div className="flex flex-wrap items-end justify-between gap-6 max-md:gap-4">
            <div className="min-w-0">
              <h1 className="m-0 text-[28px] font-medium tracking-[-0.01em] max-md:text-[24px]">Emailing</h1>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[13px] text-ardoise">
                {etat && !etat.resend ? <span className="text-alerte">Resend n'est pas configuré sur ce serveur</span> : (
                  <>
                    <span>Envoyé par</span><span className="text-craie">L'équipe Klocka</span><span className="break-all">equipe@notifications-klocka.com</span>
                    <span className="rounded-full border border-bord-doux px-2 py-px text-[11.5px]">via Resend</span>
                    {etat && !etat.reel && <span className="text-ambre">local : les envois vont à {etat.test_to || "l'admin qui agit"}</span>}
                  </>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              {(ACTIONS[onglet] || []).map(([mot, quoi, principal]) => (
                <button key={quoi} type="button" onClick={() => demander(quoi)} className={principal ? boutonPrincipal : boutonContour}>
                  {principal && <Plus className="h-3.5 w-3.5" />}{mot}
                </button>
              ))}
            </div>
          </div>
          {/* Les onglets en pilule, comme ceux de la page projet. */}
          <nav className="mt-[22px] mb-[22px] inline-flex max-w-full gap-1 overflow-x-auto rounded-full border border-trait bg-surface-pleine/60 p-[5px] backdrop-blur-xl [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {ONGLETS.map(([v, mot]) => (
              <button key={v} type="button" onClick={() => choisir(v)} aria-current={onglet === v ? "page" : undefined}
                className={`h-9 flex-none rounded-full border-0 px-4 text-[14px] transition-colors ${onglet === v ? "bg-encre text-fond" : "text-craie hover:text-encre"}`}
                style={onglet === v ? undefined : { background: "transparent" }}>{mot}</button>
            ))}
          </nav>
        </div>
      )}
      {onglet === "newsletters" && <Newsletters {...commun} />}
      {onglet === "assets" && <Assets {...commun} />}
      {onglet === "contacts" && <Contacts {...commun} />}
      {onglet === "statistiques" && <Statistiques />}
    </div>
  );
}
