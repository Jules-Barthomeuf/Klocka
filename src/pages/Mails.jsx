import React, { useState } from "react";
import { Copy, Check, Mail, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const MAIL_TEMPLATES = [
  {
    id: "presentation",
    titre: "Présentation Klocka",
    objet: "Présentation de notre activité – Klocka",
    contenu: `Bonjour,

Comme convenu, je vous prie de trouver ci-dessous une brève présentation de notre activité.

Je suis Alexis Petit, analyste en immobilier commercial chez Klocka. Notre société, fondée en décembre 2024, est spécialisée dans l'investissement clé en main pour une clientèle de cadres supérieurs répartis dans toute la France. Nous sommes rémunérés directement par nos clients, ce qui garantit que vos honoraires ne seront pas impactés.

Concernant notre méthodologie, nous analysons principalement des murs commerciaux occupés. Nous sélectionnons et présentons un maximum de trois projets à nos clients lors de points en visioconférence afin d'assurer un taux de transformation optimal. Les documents relatifs aux dossiers restent confidentiels dans notre base de données et ne sont transmis que lorsque le client souhaite approfondir une opportunité précise.

Dans un premier temps, je vous invite à me transmettre une fiche commerciale. Je la présenterai à mes clients et, si un intérêt se manifeste, nous pourrons approfondir les échanges comme vous l'avez suggéré.

Je vous souhaite une excellente journée.

Bien cordialement`,
  },
  {
    id: "demande-documents",
    titre: "Suite d'appel – Demande de documents",
    objet: "Murs commerciaux - Klocka",
    contenu: `Bonjour,

Pour faire suite à notre échange téléphonique de ce jour, afin d'approfondir notre analyse nous avons besoin des éléments suivants :
- Bail
- RCP
- PV d'AG
- Quittances
- Diagnostiques (si déjà faits)

Pour rappel nous travaillons avec des mandats de recherche vos honoraires resteront inchangés.
De plus je vous transmets le cahier des charges de nos clients :
- Type de bien : Murs commerciaux occupés
- Rendement : 5-7% AEM
- Budget : 100K-3M
- Emplacement : N°1 ou n°1 bis 

Bien à vous,`,
  },
  {
    id: "presentation-cahier",
    titre: "Présentation + Cahier des charges",
    objet: "Présentation de notre activité et cahier des charges – Klocka",
    contenu: `Bonjour,

Suite à notre échange, je me permets de vous adresser une brève présentation de notre activité ainsi que le cahier des charges de nos clients.

Je suis Maxime Pama, analyste en immobilier commercial chez Klocka. Notre société, fondée en décembre 2024, est spécialisée dans l'investissement clé en main pour une clientèle de cadres supérieurs répartis sur l'ensemble du territoire français. Nous sommes rémunérés directement par nos clients, ce qui garantit que vos honoraires ne sont pas impactés.

Dans le cadre de notre méthodologie, nous analysons principalement des murs commerciaux occupés. Nous sélectionnons et présentons un maximum de trois opportunités à nos clients lors de points en visioconférence, afin d'assurer un taux de transformation optimal. L'ensemble des documents relatifs aux dossiers reste confidentiel au sein de notre base de données et n'est transmis qu'en cas d'intérêt confirmé pour une opportunité spécifique.

À ce titre, voici le cahier des charges correspondant à la majorité de notre clientèle :
- Type de bien : murs commerciaux occupés
- Rendement : 5 % à 7 % AEM
- Budget : 100 K€ à 3 M€
- Emplacement : n°1 ou n°1 bis

Nous accompagnons également certains clients sur des opérations spécifiques avec des budgets supérieurs à 10 M€, incluant d'autres typologies d'actifs (immeubles, entrepôts, murs vacants, hôtels, etc.).

Dans un premier temps, je vous invite à me transmettre une fiche commerciale. Je pourrai ainsi la présenter à mes clients et, en cas d'intérêt, nous pourrons approfondir nos échanges comme évoqué.

Je reste bien entendu à votre disposition pour toute opportunité correspondant à ces critères.

Je vous souhaite une excellente journée.

Bien cordialement,`,
  },
  {
    id: "loi",
    titre: "Lettre d'intention (LOI)",
    objet: "Lettre d'intention d'achat – [Adresse du bien]",
    contenu: `Bonjour Monsieur,

Suite à nos échanges, nos clients souhaitent se positionner sur le local au [adresse]. Ainsi, veuillez trouver ci-joint la lettre d'intention d'achat de nos clients concernant ce local.

Je vous laisse en prendre connaissance et reste à votre disposition pour tout complément d'information ou point à éclaircir.

Cordialement,`,
  },
  {
    id: "cahier-des-charges",
    titre: "Cahier des charges",
    objet: "Cahier des charges – Klocka",
    contenu: `Bonjour,

Suite à notre échange je me permets donc de vous communiquer le cahier des charges de nos clients :
- Type de bien : Murs commerciaux occupés
- Rendement : 5-7% AEM
- Budget : 100K-3M
- Emplacement : N°1 ou n°1 bis
Ce cahier des charges est le gros de notre clientèle cependant nous avons également des cas particuliers avec des budgets de plus de 10M et des recherches axées sur d'autres types d'actifs (immeubles, entrepôts, murs vides, hôtels…).

N'hésitez pas à me contacter si vous avez des biens correspondant à nos critères.

Bien cordialement,`,
  },
];

export default function Mails() {
  const [selected, setSelected] = useState(null);
  const [copiedField, setCopiedField] = useState(null);

  const handleCopy = async (text, field) => {
    await navigator.clipboard.writeText(text);
    setCopiedField(field);
    toast.success("Copié dans le presse-papier");
    setTimeout(() => setCopiedField(null), 2000);
  };

  return (
    <div className="min-h-screen bg-[#000000] p-6 md:p-10">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-white mb-1">Templates Mails</h1>
          <p className="text-gray-400 text-sm">Cliquez sur un template pour afficher le mail complet</p>
        </div>

        {/* Grille */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {MAIL_TEMPLATES.map((t) => (
            <button
              key={t.id}
              onClick={() => setSelected(t)}
              className="text-left bg-neutral-800 border border-white/[0.10] rounded-2xl p-5 hover:border-[#2A9D8F]/40 hover:bg-neutral-700 transition-all group"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-xl bg-[#2A9D8F]/15 flex items-center justify-center flex-shrink-0">
                  <Mail className="w-4 h-4 text-[#2A9D8F]" />
                </div>
                <h3 className="text-white font-medium text-sm">{t.titre}</h3>
              </div>
              <p className="text-gray-500 text-xs truncate">{t.objet}</p>
              <p className="text-gray-600 text-xs mt-2 line-clamp-2 leading-relaxed">{t.contenu.slice(0, 100)}…</p>
            </button>
          ))}
        </div>
      </div>

      {/* Modal */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={() => setSelected(null)}>
          <div className="bg-neutral-900 border border-white/[0.08] rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-[#2A9D8F]/15 flex items-center justify-center">
                  <Mail className="w-4 h-4 text-[#2A9D8F]" />
                </div>
                <h3 className="text-white font-medium">{selected.titre}</h3>
              </div>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Objet */}
            <div className="flex items-center justify-between px-6 py-3 border-b border-white/[0.06]">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-gray-400 text-sm flex-shrink-0">Objet :</span>
                <span className="text-white text-sm truncate">{selected.objet}</span>
              </div>
              <Button variant="ghost" size="sm" onClick={() => handleCopy(selected.objet, "objet")} className="text-white hover:text-white hover:bg-white/5 flex-shrink-0 h-8 px-2">
                {copiedField === "objet" ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
              </Button>
            </div>

            {/* Corps */}
            <div className="px-6 py-4 flex-1 overflow-y-auto">
              <div className="flex items-center justify-between mb-3">
                <span className="text-gray-400 text-sm">Corps :</span>
                <Button variant="ghost" size="sm" onClick={() => handleCopy(selected.contenu, "contenu")} className="text-white hover:text-white hover:bg-white/5 h-8 px-3">
                  {copiedField === "contenu" ? (
                    <span className="flex items-center gap-1.5 text-green-400 text-xs"><Check className="w-3.5 h-3.5" /> Copié</span>
                  ) : (
                    <span className="flex items-center gap-1.5 text-xs"><Copy className="w-3.5 h-3.5" /> Copier</span>
                  )}
                </Button>
              </div>
              <div className="bg-neutral-800 rounded-xl p-5 border border-white/[0.04]">
                <pre className="text-white text-sm leading-relaxed whitespace-pre-wrap font-sans">{selected.contenu}</pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}