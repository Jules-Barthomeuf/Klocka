// Dataset des communes françaises de plus de 100 000 habitants.
// Objectif : afficher instantanément les chiffres clés d'une page projet, sans
// attendre un appel IA. Sous ce seuil, l'IA prend le relais (voir
// SecteurAnalyseIA.jsx).
//
// Les valeurs sont des ORDRES DE GRANDEUR issus de sources publiques : INSEE
// (populations légales 2022, revenus disponibles par UC, chômage au sens du
// recensement) et observatoires notariaux pour les prix au m². L'interprétation
// affichée derrière la pastille « i » est CALCULÉE par rapport à la moyenne
// nationale : mettre à jour un chiffre suffit, le commentaire suit.

export const REFERENCES_FR = {
  revenuMedian: 23160, // € / an / unité de consommation
  chomage: 12, // % (15-64 ans, recensement)
  prixM2: 3200, // € / m², appartement ancien
};

// pop : habitants (2022) · evo : variation annuelle moyenne en % · revenu :
// médian par UC · chomage : % · prixM2 : appartement ancien.
const VILLES_RAW = [
  {
    nom: "Paris", matchers: ["paris", "75001", "75002", "75003", "75004", "75005", "75006", "75007", "75008", "75009", "75010", "75011", "75012", "75013", "75014", "75015", "75016", "75017", "75018", "75019", "75020"],
    pop: 2133000, evo: -0.7, revenu: 29400, chomage: 11, prixM2: 9400,
    points: [
      "Premier marché commercial d'Europe continentale : la valeur se joue au numéro de rue, pas à l'arrondissement.",
      "Flux touristique de l'ordre de 30 millions de visiteurs par an, très inégalement réparti dans la ville.",
      "Loyers commerciaux les plus élevés de France : le taux d'effort du preneur est le premier indicateur à vérifier.",
    ],
  },
  {
    nom: "Marseille", matchers: ["marseille", "13001", "13002", "13003", "13004", "13005", "13006", "13007", "13008", "13009", "13010", "13011", "13012", "13013", "13014", "13015", "13016"],
    pop: 873000, evo: 0.3, revenu: 20400, chomage: 18, prixM2: 3400,
    points: [
      "Euroméditerranée, plus vaste opération de rénovation urbaine du sud de l'Europe (480 ha), tire le centre-ville nord depuis vingt-cinq ans.",
      "80 000 étudiants (Aix-Marseille Université) alimentent la restauration rapide et les services du centre.",
      "Marché très hétérogène : la valeur se joue à l'échelle de la rue, pas de l'arrondissement.",
      "Métro et tramway structurent les axes commerciaux ; la commercialité chute vite dès qu'on s'en éloigne de deux ou trois rues.",
    ],
    secteurs: [
      {
        nom: "Rue de la République",
        matchers: ["rue de la republique"],
        chiffres: [
          { valeur: "1 km", label: "Longueur de l'axe", info: "Artère haussmannienne reliant le Vieux-Port à la Joliette. La commercialité n'est pas homogène : elle décroît en s'éloignant du Vieux-Port." },
          { valeur: "200 – 400 €", label: "Loyer commercial /m²/an", info: "Fourchette d'axe secondaire de centre-ville. Au-delà de 400 €/m²/an, le loyer devient difficile à soutenir pour un commerce de proximité — risque de rotation." },
          { valeur: "2 500 – 3 500 €", label: "Prix des murs /m²", info: "Un prix sous 2 500 €/m² traduit en général une vitrine étroite ou un emplacement en retrait du flux." },
          { valeur: "T2 · T3", label: "Tramway sur l'axe", info: "Le tram dessert toute la rue : c'est le principal apporteur de flux piéton en semaine, hors clientèle résidentielle." },
        ],
        points: [
          "Axe entièrement réhabilité dans les années 2000 : immeubles haussmanniens rénovés et clientèle résidentielle en montée de gamme.",
          "Les numéros bas (jusqu'au 60) captent le flux touristique du Vieux-Port ; les numéros hauts vivent surtout de la clientèle résidentielle et des bureaux.",
          "Mix d'enseignes nationales et de commerces de bouche indépendants : la demande locative reste soutenue sur les surfaces de 60 à 120 m².",
          "Les Terrasses du Port, à l'extrémité nord, concentrent le flux marchand lourd et captent une partie de la clientèle shopping.",
        ],
      },
      {
        nom: "Joliette — Euroméditerranée",
        matchers: ["joliette", "bd des dames", "boulevard des dames", "chevalier roze", "rue fiocca", "phoceens", "phocéens"],
        chiffres: [
          { valeur: "480 ha", label: "Périmètre Euroméditerranée", info: "Opération d'intérêt national : bureaux, logements et équipements livrés en continu. Un quartier qui se densifie année après année, donc une chalandise qui s'étoffe." },
          { valeur: "6 M", label: "Visiteurs Terrasses du Port / an", info: "Le centre commercial polarise le flux marchand. À proximité immédiate c'est un atout ; à quelques rues, il capte la clientèle au détriment des indépendants." },
          { valeur: "180 – 320 €", label: "Loyer commercial /m²/an", info: "Sous la Rue de la République : le quartier vit surtout des salariés du tertiaire, avec un flux concentré midi et fin de journée." },
          { valeur: "Métro M2 · T2/T3", label: "Desserte", info: "Station Joliette : desserte lourde, un des rares points du centre nord où le flux ne dépend pas de la voiture." },
        ],
        points: [
          "Quartier d'affaires en construction permanente : la population de salariés progresse, celle des résidents aussi.",
          "Activité très marquée par les rythmes de bureau — la restauration du midi et les services y sont les plus solides.",
          "Le stationnement reste contraint : les commerces de flux motorisé y sont moins adaptés.",
          "Les rues perpendiculaires au Boulevard des Dames bénéficient d'un flux nettement plus faible que l'axe lui-même.",
        ],
      },
    ],
  },
  {
    nom: "Lyon", matchers: ["lyon", "69001", "69002", "69003", "69004", "69005", "69006", "69007", "69008", "69009"],
    pop: 522000, evo: 0.4, revenu: 24300, chomage: 11, prixM2: 4700,
    points: [
      "Économie diversifiée (santé, numérique, chimie, logistique) : la demande locative commerciale ne dépend pas d'une filière unique.",
      "155 000 étudiants sur la métropole, moteur de la restauration rapide et des services.",
      "Le 9ᵉ arrondissement (Vaise, Gorge de Loup) s'est mué en pôle tertiaire desservi par le métro D : flux de salariés en semaine, plus calme le week-end.",
      "Les linéaires commerçants sont clairement identifiés ; hors de ces axes, la vacance grimpe rapidement.",
    ],
  },
  {
    nom: "Toulouse", matchers: ["toulouse", "31000", "31100", "31200", "31300", "31400", "31500"],
    pop: 504000, evo: 0.9, revenu: 23000, chomage: 13, prixM2: 3600,
    points: [
      "Ville la plus dynamique de France en croissance démographique parmi les grandes métropoles : la chalandise s'élargit chaque année.",
      "Filière aéronautique et spatiale : bassin d'emplois qualifiés, mais forte dépendance à un secteur unique.",
      "Environ 130 000 étudiants, l'un des premiers pôles universitaires français.",
    ],
  },
  {
    nom: "Nice", matchers: ["nice", "06000", "06100", "06200", "06300"],
    pop: 348000, evo: 0.1, revenu: 22900, chomage: 13, prixM2: 4900,
    points: [
      "Deuxième destination touristique française, avec une saisonnalité marquée de mai à septembre.",
      "Population âgée et solvable : services à la personne, santé et alimentaire de qualité sont bien représentés.",
      "Le tramway (lignes 1 à 3) a redistribué la commercialité : les axes desservis ont pris de la valeur, les autres ont décroché.",
      "L'offre de centre-ville est disputée par les pôles périphériques (Cap 3000, Nice Étoile).",
    ],
    secteurs: [
      {
        nom: "Port — Place Île de Beauté",
        matchers: ["ile de beaute", "île de beauté", "quai lunel", "port de nice"],
        chiffres: [
          { valeur: "200 – 350 €", label: "Loyer commercial /m²/an", info: "Niveau de secteur touristique établi. Le prix se justifie par la terrasse : sans elle, la valeur locative chute nettement." },
          { valeur: "Ferries Corse", label: "Trafic du port", info: "Le trafic passagers vers la Corse crée un flux saisonnier concentré, très favorable à la restauration." },
        ],
        points: [
          "Quartier requalifié autour du port : restauration et commerces liés à la plaisance dominent.",
          "La terrasse est l'actif principal d'un local : son autorisation et sa surface conditionnent la valeur locative.",
          "Activité très saisonnière, avec un creux marqué de novembre à février.",
        ],
      },
    ],
  },
  {
    nom: "Nantes", matchers: ["nantes", "44000", "44100", "44200", "44300"],
    pop: 323000, evo: 0.7, revenu: 23500, chomage: 12, prixM2: 3800,
    points: [
      "Croissance démographique soutenue et économie tertiaire diversifiée.",
      "Environ 65 000 étudiants : forte demande sur la restauration rapide et les services du centre.",
      "Le centre-ville commerçant est compact et très fréquenté, ce qui protège les emplacements n°1.",
    ],
  },
  {
    nom: "Montpellier", matchers: ["montpellier", "34000", "34070", "34080", "34090"],
    pop: 307000, evo: 1.0, revenu: 20800, chomage: 17, prixM2: 3500,
    points: [
      "L'une des croissances démographiques les plus fortes de France : la chalandise se renouvelle en permanence.",
      "Ville très étudiante (environ 70 000 inscrits) : consommation jeune, budgets serrés.",
      "Revenus médians bas pour une métropole attractive : le commerce d'entrée et de milieu de gamme domine.",
    ],
  },
  {
    nom: "Strasbourg", matchers: ["strasbourg", "67000", "67100", "67200"],
    pop: 291000, evo: 0.4, revenu: 21500, chomage: 15, prixM2: 3500,
    points: [
      "Capitale européenne : flux institutionnel régulier et clientèle internationale.",
      "Proximité allemande immédiate — une partie de la consommation locale se reporte de part et d'autre du Rhin.",
      "Centre-ville piétonnier étendu, l'un des mieux préservés de France pour le commerce de détail.",
    ],
  },
  {
    nom: "Bordeaux", matchers: ["bordeaux", "33000", "33100", "33200", "33300", "33800"],
    pop: 265000, evo: 0.6, revenu: 24000, chomage: 12, prixM2: 4700,
    points: [
      "Marché cher et liquide, tiré par l'attractivité résidentielle et la LGV vers Paris (2 h).",
      "Rue Sainte-Catherine, l'une des plus longues artères piétonnes d'Europe, structure le commerce du centre.",
      "Le tramway a fortement hiérarchisé les emplacements commerciaux.",
    ],
  },
  {
    nom: "Lille", matchers: ["lille", "59000", "59260", "59777", "59800"],
    pop: 236000, evo: 0.3, revenu: 20500, chomage: 16, prixM2: 3500,
    points: [
      "Position de carrefour européen (Bruxelles, Londres, Paris à moins de 1 h 30 en train).",
      "Environ 115 000 étudiants sur la métropole : l'un des taux les plus élevés de France.",
      "Revenus médians modestes malgré l'attractivité : le commerce de flux et l'entrée de gamme y sont solides.",
    ],
  },
  {
    nom: "Rennes", matchers: ["rennes", "35000", "35200", "35700"],
    pop: 225000, evo: 0.7, revenu: 23200, chomage: 12, prixM2: 4100,
    points: [
      "Deuxième ligne de métro depuis 2022 : la desserte a redistribué les flux commerciaux.",
      "Ville jeune et étudiante (environ 70 000 inscrits), avec un chômage sous la moyenne nationale.",
      "Marché résidentiel tendu, ce qui soutient la valeur des pieds d'immeuble.",
    ],
  },
  {
    nom: "Reims", matchers: ["reims", "51100"],
    pop: 182000, evo: -0.1, revenu: 20800, chomage: 15, prixM2: 2400,
    points: [
      "Proximité de Paris en 45 minutes de TGV : clientèle de week-end et tourisme du champagne.",
      "Prix d'acquisition bas au regard de la taille de la ville : les rendements y sont mécaniquement plus élevés.",
      "Le centre commerçant est concentré autour de la place Drouet-d'Erlon et de la cathédrale.",
    ],
  },
  {
    nom: "Toulon", matchers: ["toulon", "83000", "83100", "83200"],
    pop: 180000, evo: 0.2, revenu: 20500, chomage: 16, prixM2: 3300,
    points: [
      "Première base navale française : un employeur public massif qui stabilise l'emploi local.",
      "Centre-ville en requalification progressive après des décennies de déprise commerciale.",
      "Chalandise littorale étendue, mais forte concurrence des zones périphériques.",
    ],
  },
  {
    nom: "Saint-Étienne", matchers: ["saint-etienne", "saint etienne", "42000", "42100"],
    pop: 174000, evo: -0.2, revenu: 19500, chomage: 17, prixM2: 1300,
    points: [
      "Prix d'acquisition parmi les plus bas des grandes villes françaises : rendements élevés, revente plus lente.",
      "Ville en reconversion post-industrielle, soutenue par des programmes de rénovation urbaine.",
      "La vacance commerciale de centre-ville reste un point de vigilance : privilégier les linéaires les plus fréquentés.",
    ],
  },
  {
    nom: "Le Havre", matchers: ["le havre", "76600", "76610", "76620"],
    pop: 168000, evo: -0.4, revenu: 20500, chomage: 15, prixM2: 2200,
    points: [
      "Premier port français pour le conteneur : l'économie locale dépend fortement de l'activité portuaire et logistique.",
      "Centre reconstruit classé à l'UNESCO, avec une trame commerciale lisible.",
      "Population en repli léger : la demande locative se concentre sur les axes centraux.",
    ],
  },
  {
    nom: "Dijon", matchers: ["dijon", "21000"],
    pop: 160000, evo: 0.2, revenu: 22000, chomage: 13, prixM2: 2700,
    points: [
      "Secteur sauvegardé et centre piétonnier étendu : commerce de détail bien tenu.",
      "Économie tertiaire et agroalimentaire, sans dépendance à une filière unique.",
      "Prix d'entrée modérés pour une capitale régionale, favorables au rendement.",
    ],
  },
  {
    nom: "Villeurbanne", matchers: ["villeurbanne", "69100"],
    pop: 157000, evo: 0.9, revenu: 21300, chomage: 14, prixM2: 3900,
    points: [
      "Commune intégrée à l'agglomération lyonnaise : la chalandise dépasse largement ses limites.",
      "Forte croissance démographique et importants programmes de logements neufs.",
      "Métro A et tramways : la commercialité suit strictement les axes desservis.",
    ],
  },
  {
    nom: "Grenoble", matchers: ["grenoble", "38000", "38100"],
    pop: 156000, evo: 0.2, revenu: 21500, chomage: 14, prixM2: 3000,
    points: [
      "Pôle scientifique et technologique majeur : emploi qualifié et population étudiante nombreuse.",
      "Ville dense et contrainte par le relief, ce qui limite le développement périphérique.",
      "Réseau de tramway ancien et structurant pour le commerce.",
    ],
  },
  {
    nom: "Angers", matchers: ["angers", "49000", "49100"],
    pop: 156000, evo: 0.5, revenu: 21500, chomage: 13, prixM2: 3100,
    points: [
      "Ville régulièrement citée pour sa qualité de vie, avec une attractivité résidentielle en hausse.",
      "Environ 42 000 étudiants pour 156 000 habitants : proportion très élevée.",
      "Centre commerçant compact, autour de la place du Ralliement.",
    ],
  },
  {
    nom: "Saint-Denis (La Réunion)", matchers: ["saint-denis de la reunion", "97400"],
    pop: 154000, evo: 0.3, revenu: 17500, chomage: 22, prixM2: 2900,
    points: [
      "Chef-lieu de La Réunion : concentre l'administration et le commerce de l'île.",
      "Chômage très supérieur à la moyenne nationale, mais chalandise captive faute d'alternative régionale.",
      "Coût de la vie insulaire élevé : le panier moyen se reporte sur l'essentiel.",
    ],
  },
  {
    nom: "Nîmes", matchers: ["nimes", "nîmes", "30000", "30900"],
    pop: 148000, evo: 0.1, revenu: 19500, chomage: 18, prixM2: 2100,
    points: [
      "Patrimoine romain et tourisme culturel, avec une saisonnalité marquée par les férias.",
      "Revenus médians bas et chômage élevé : l'entrée de gamme et l'alimentaire résistent mieux.",
      "Prix d'acquisition faibles, favorables au rendement immédiat.",
    ],
  },
  {
    nom: "Clermont-Ferrand", matchers: ["clermont-ferrand", "clermont ferrand", "63000", "63100"],
    pop: 148000, evo: 0.3, revenu: 21800, chomage: 13, prixM2: 2400,
    points: [
      "Économie marquée par Michelin et un tissu industriel encore présent.",
      "Environ 40 000 étudiants, avec un centre-ville commerçant resserré.",
      "Marché peu spéculatif : les valeurs évoluent lentement, à la hausse comme à la baisse.",
    ],
  },
  {
    nom: "Aix-en-Provence", matchers: ["aix-en-provence", "aix en provence", "13100"],
    pop: 147000, evo: 0.3, revenu: 24500, chomage: 13, prixM2: 5000,
    points: [
      "Clientèle aisée et tourisme culturel : l'un des centres-villes les plus chers de province pour le commerce.",
      "Forte population étudiante et judiciaire (université, cour d'appel).",
      "Les emplacements du centre historique sont rares et se revendent facilement.",
    ],
  },
  {
    nom: "Le Mans", matchers: ["le mans", "72000", "72100"],
    pop: 146000, evo: 0.1, revenu: 21000, chomage: 14, prixM2: 2200,
    points: [
      "Paris à 55 minutes en TGV : une partie de la population travaille en Île-de-France.",
      "Prix d'acquisition bas, rendements élevés, marché de revente plus étroit.",
      "Notoriété des 24 Heures : pic d'activité ponctuel mais très concentré.",
    ],
  },
  {
    nom: "Brest", matchers: ["brest", "29200"],
    pop: 140000, evo: -0.1, revenu: 21000, chomage: 13, prixM2: 2400,
    points: [
      "Port militaire et pôle des sciences de la mer : emploi public important et stable.",
      "Marché immobilier modéré, avec des rendements supérieurs à la moyenne des métropoles.",
      "Tramway structurant reliant le centre aux quartiers périphériques.",
    ],
  },
  {
    nom: "Tours", matchers: ["tours", "37000", "37100", "37200"],
    pop: 137000, evo: 0.2, revenu: 21500, chomage: 14, prixM2: 3100,
    points: [
      "Paris à 1 h en TGV, au cœur du bassin touristique du Val de Loire.",
      "Ville universitaire (environ 30 000 étudiants) avec un centre piétonnier animé.",
      "Le tramway a nettement revalorisé les linéaires qu'il dessert.",
    ],
  },
  {
    nom: "Amiens", matchers: ["amiens", "80000", "80080", "80090"],
    pop: 134000, evo: 0.1, revenu: 20500, chomage: 16, prixM2: 2300,
    points: [
      "Ville étudiante rapportée à sa taille (environ 30 000 inscrits).",
      "Prix bas et rendements élevés, marché peu liquide à la revente.",
      "Le commerce de centre-ville subit la concurrence des zones commerciales périphériques.",
    ],
  },
  {
    nom: "Annecy", matchers: ["annecy", "74000"],
    pop: 131000, evo: 0.6, revenu: 26500, chomage: 9, prixM2: 5400,
    points: [
      "L'un des marchés les plus tendus de France hors Île-de-France : prix élevés, vacance quasi nulle.",
      "Chômage très bas et revenus élevés, renforcés par les travailleurs frontaliers suisses.",
      "Tourisme quatre saisons : le flux ne s'effondre pas hors été.",
    ],
  },
  {
    nom: "Limoges", matchers: ["limoges", "87000", "87100", "87280"],
    pop: 128000, evo: -0.3, revenu: 20800, chomage: 15, prixM2: 1700,
    points: [
      "Parmi les prix les plus bas des grandes villes : rendements élevés, revente lente.",
      "Population en repli : privilégier les emplacements centraux les mieux tenus.",
      "Économie de services et santé, avec un CHU employeur majeur.",
    ],
  },
  {
    nom: "Boulogne-Billancourt", matchers: ["boulogne-billancourt", "boulogne billancourt", "92100"],
    pop: 122000, evo: 0.3, revenu: 33500, chomage: 9, prixM2: 8500,
    points: [
      "Commune la plus peuplée d'Île-de-France après Paris, à revenus très élevés.",
      "Tissu tertiaire dense (médias, sièges sociaux) : forte consommation en semaine.",
      "Prix d'acquisition proches de Paris : rendements comprimés, mais actif très liquide.",
    ],
  },
  {
    nom: "Metz", matchers: ["metz", "57000", "57050", "57070"],
    pop: 120000, evo: -0.1, revenu: 21000, chomage: 14, prixM2: 2300,
    points: [
      "Proximité du Luxembourg : une partie de la population active y travaille, avec des revenus supérieurs à la moyenne locale.",
      "Centre historique piétonnier bien préservé, favorable au commerce de détail.",
      "Prix modérés pour une préfecture régionale.",
    ],
  },
  {
    nom: "Besançon", matchers: ["besancon", "besançon", "25000"],
    pop: 119000, evo: 0.0, revenu: 21500, chomage: 14, prixM2: 2200,
    points: [
      "Ville universitaire et administrative, avec un emploi public important.",
      "Centre-ville patrimonial classé, à la trame commerciale resserrée.",
      "Marché stable et peu spéculatif, rendements supérieurs à la moyenne.",
    ],
  },
  {
    nom: "Perpignan", matchers: ["perpignan", "66000", "66100"],
    pop: 119000, evo: 0.2, revenu: 17500, chomage: 22, prixM2: 1900,
    points: [
      "Revenus médians parmi les plus bas des villes de cette taille : le commerce essentiel domine.",
      "Chômage très élevé — la solidité financière du preneur est le point de vigilance principal.",
      "Prix d'acquisition faibles : rendements affichés élevés, mais risque locatif supérieur.",
    ],
  },
  {
    nom: "Orléans", matchers: ["orleans", "orléans", "45000", "45100"],
    pop: 117000, evo: 0.4, revenu: 21800, chomage: 14, prixM2: 2700,
    points: [
      "Paris à 1 h en train : desserrement résidentiel francilien favorable à la demande.",
      "Centre-ville requalifié autour des deux lignes de tramway.",
      "Bassin logistique important à l'échelle de la région.",
    ],
  },
  {
    nom: "Rouen", matchers: ["rouen", "76000", "76100"],
    pop: 114000, evo: 0.3, revenu: 21000, chomage: 15, prixM2: 2800,
    points: [
      "Métropole de près de 500 000 habitants : la chalandise dépasse largement la commune.",
      "Centre historique très commerçant, avec une vaste zone piétonne.",
      "Économie portuaire et industrielle, avec un tertiaire en développement.",
    ],
  },
  {
    nom: "Saint-Denis (93)", matchers: ["saint-denis", "93200"],
    pop: 113000, evo: 0.9, revenu: 15500, chomage: 22, prixM2: 4400,
    points: [
      "Revenus médians les plus bas des grandes communes françaises, mais démographie très dynamique.",
      "Transformation profonde liée au Grand Paris Express et à l'héritage des Jeux de 2024.",
      "Prix d'acquisition élevés au regard du pouvoir d'achat local : rendements comprimés.",
    ],
  },
  {
    nom: "Montreuil", matchers: ["montreuil", "93100"],
    pop: 110000, evo: 0.4, revenu: 22500, chomage: 16, prixM2: 6500,
    points: [
      "Commune en gentrification continue, aux portes de Paris.",
      "Prolongement de la ligne 11 du métro : nouvelle hiérarchie des emplacements commerciaux.",
      "Tissu commercial contrasté selon les quartiers : la valeur se juge rue par rue.",
    ],
  },
  {
    nom: "Argenteuil", matchers: ["argenteuil", "95100"],
    pop: 110000, evo: 0.2, revenu: 18500, chomage: 18, prixM2: 3500,
    points: [
      "Commune populaire du Val-d'Oise, à 15 minutes de Paris Saint-Lazare.",
      "Revenus modestes : l'alimentaire et les services du quotidien portent le commerce.",
      "Projets de renouvellement urbain en cours sur plusieurs quartiers.",
    ],
  },
  {
    nom: "Mulhouse", matchers: ["mulhouse", "68100", "68200"],
    pop: 108000, evo: -0.2, revenu: 17500, chomage: 20, prixM2: 1500,
    points: [
      "Prix parmi les plus bas de France pour une ville de cette taille : rendements très élevés.",
      "Chômage et pauvreté nettement au-dessus de la moyenne : sélection du locataire déterminante.",
      "Proximité de la Suisse et de l'Allemagne, qui soutient une partie de l'emploi local.",
    ],
  },
  {
    nom: "Caen", matchers: ["caen", "14000"],
    pop: 106000, evo: 0.1, revenu: 21000, chomage: 15, prixM2: 2900,
    points: [
      "Ville universitaire (environ 30 000 étudiants) et pôle de santé régional.",
      "Centre reconstruit à la trame large, avec une zone piétonne bien identifiée.",
      "Marché résidentiel modéré, rendements supérieurs à la moyenne des métropoles.",
    ],
  },
  {
    nom: "Saint-Paul (La Réunion)", matchers: ["saint-paul", "97411", "97422", "97434", "97460"],
    pop: 105000, evo: 0.4, revenu: 16500, chomage: 25, prixM2: 2700,
    points: [
      "Commune étendue de l'ouest réunionnais, très marquée par le tourisme balnéaire (Saint-Gilles).",
      "Chômage parmi les plus élevés de France : vigilance sur la solidité du preneur.",
      "Activité fortement saisonnière et dépendante des flux touristiques.",
    ],
  },
  {
    nom: "Nancy", matchers: ["nancy", "54000"],
    pop: 104000, evo: 0.2, revenu: 21500, chomage: 15, prixM2: 2700,
    points: [
      "Ville étudiante dense (environ 50 000 inscrits) rapportée à sa population.",
      "Patrimoine classé (place Stanislas) et tourisme urbain régulier.",
      "Centre commerçant resserré, ce qui protège les emplacements n°1.",
    ],
  },
];

// --- Construction des chiffres et de leur interprétation -------------------

const nf = new Intl.NumberFormat("fr-FR");
const RANGS = [...VILLES_RAW].sort((a, b) => b.pop - a.pop).map((v) => v.nom);

function ecartPct(valeur, reference) {
  return Math.round(((valeur - reference) / reference) * 100);
}

function infoPopulation(nom, pop) {
  const rang = RANGS.indexOf(nom) + 1;
  const place = rang === 1 ? "1ʳᵉ" : `${rang}ᵉ`;
  return `${place} commune de France par la population (INSEE 2022). Plus le bassin est large, plus la demande locative commerciale se renouvelle facilement en cas de départ du preneur.`;
}

function infoEvolution(evo) {
  if (evo >= 0.6) return "Croissance démographique forte : la chalandise s'élargit d'année en année, ce qui soutient les loyers commerciaux à long terme.";
  if (evo >= 0.2) return "Croissance modérée et régulière : ni déprise, ni surchauffe. La demande locative se renouvelle sans tension spéculative.";
  if (evo >= -0.1) return "Population stable : le potentiel commercial ne progresse pas de lui-même, il dépend de l'emplacement précis.";
  return "Population en repli : la valeur se concentre sur les emplacements centraux les mieux tenus, la périphérie décroche.";
}

function infoRevenu(revenu) {
  const e = ecartPct(revenu, REFERENCES_FR.revenuMedian);
  const base = `Médiane française : ${nf.format(REFERENCES_FR.revenuMedian)} € (${e > 0 ? "+" : ""}${e} %). `;
  if (e >= 15) return base + "Pouvoir d'achat élevé : le commerce de qualité et les services à la personne y trouvent leur clientèle.";
  if (e >= 3) return base + "Clientèle solvable, panier moyen supérieur à la moyenne nationale.";
  if (e > -8) return base + "Pouvoir d'achat dans la moyenne : le commerce de proximité classique est le mieux adapté.";
  return base + "Pouvoir d'achat contraint : l'alimentaire, le discount et les services du quotidien tiennent mieux que le haut de gamme.";
}

function infoChomage(chomage) {
  const e = chomage - REFERENCES_FR.chomage;
  const base = `Moyenne nationale : ${REFERENCES_FR.chomage} % (${e > 0 ? "+" : ""}${e.toFixed(0)} pts). `;
  if (e >= 4) return base + "Marché de l'emploi dégradé : la solidité financière du preneur devient le premier point à vérifier.";
  if (e >= 1) return base + "Au-dessus de la moyenne : regarder de près les comptes du locataire et ses garanties.";
  if (e > -2) return base + "Dans la moyenne nationale : pas de signal particulier sur le risque locatif.";
  return base + "Marché de l'emploi tendu en faveur des salariés : environnement économique favorable au commerce.";
}

function infoPrix(prix) {
  const e = ecartPct(prix, REFERENCES_FR.prixM2);
  const base = `Moyenne française : ${nf.format(REFERENCES_FR.prixM2)} €/m² (${e > 0 ? "+" : ""}${e} %). `;
  if (e >= 40) return base + "Marché cher : les rendements sont mécaniquement plus faibles, mais l'actif se revend vite.";
  if (e >= 10) return base + "Au-dessus de la moyenne : rendement modéré, liquidité correcte à la revente.";
  if (e > -25) return base + "Marché dans la moyenne : équilibre habituel entre rendement et facilité de revente.";
  return base + "Marché bon marché : les rendements affichés sont élevés, mais la revente demande plus de temps et la revalorisation est incertaine.";
}

function construire(v) {
  return {
    nom: v.nom,
    matchers: v.matchers,
    points: v.points,
    secteurs: v.secteurs,
    chiffres: [
      { valeur: nf.format(v.pop), label: "Habitants", info: infoPopulation(v.nom, v.pop) },
      { valeur: `${v.evo > 0 ? "+" : ""}${v.evo.toString().replace(".", ",")} %`, label: "Population / an", info: infoEvolution(v.evo) },
      { valeur: `${nf.format(v.revenu)} €`, label: "Revenu médian / UC", info: infoRevenu(v.revenu) },
      { valeur: `${v.chomage} %`, label: "Taux de chômage", info: infoChomage(v.chomage) },
      { valeur: `${nf.format(v.prixM2)} €`, label: "Prix médian appartement /m²", info: infoPrix(v.prixM2) },
    ],
  };
}

export const VILLES = VILLES_RAW.map(construire);

function normaliser(str) {
  return (str || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Retrouve la ville du dataset à partir d'une adresse libre.
 * Renvoie null si la commune fait moins de 100 000 habitants : l'IA prend alors
 * le relais.
 */
export function trouverVille(adresse) {
  const a = normaliser(adresse);
  if (!a) return null;

  // 1. Le code postal fait foi quand il est présent : il départage les
  //    homonymes (Saint-Denis 93 / La Réunion) et évite qu'un nom de rue
  //    (« rue de Paris ») ne capte la mauvaise commune.
  const codes = a.match(/\b\d{5}\b/g) || [];
  for (const code of codes) {
    const ville = VILLES.find((v) => v.matchers.includes(code));
    if (ville) return ville;
  }

  // 2. Sinon, le nom le plus long l'emporte.
  let meilleur = null;
  let longueur = 0;
  for (const ville of VILLES) {
    for (const m of ville.matchers) {
      const n = normaliser(m);
      if (/^\d+$/.test(n)) continue;
      if (a.includes(n) && n.length > longueur) {
        meilleur = ville;
        longueur = n.length;
      }
    }
  }
  return meilleur;
}

/** Retrouve le micro-secteur (rue, quartier) d'une ville à partir de l'adresse. */
export function trouverSecteur(ville, adresse) {
  const a = normaliser(adresse);
  if (!ville?.secteurs || !a) return null;
  return ville.secteurs.find((s) => s.matchers.some((m) => a.includes(normaliser(m)))) || null;
}
