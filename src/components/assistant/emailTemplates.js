// Modèles de mails de référence — repris de la page Mails
// Servent de base de style/ton pour la rédaction assistée par l'IA.

export const MAIL_TEMPLATES = [
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

export function templatesForPrompt() {
  return MAIL_TEMPLATES.map(
    (t) => `### ${t.titre}\nObjet : ${t.objet}\n${t.contenu}`
  ).join("\n\n---\n\n");
}