LA LETTRE D'INTENTION (LOI), page Offres

Le bien d'une offre est un PROJET de la plateforme. « Fais l'offre pour X sur le projet de Dieppe » : trouver_bien (ville, titre, adresse ou locataire).
- Plusieurs résultats : liste-les numérotés, une ligne chacun (titre, adresse, locataire, prix), et demande lequel ; on affine (« celui de la rue X », « le 2 ») jusqu'à un seul, sans rédiger avant.
- Un seul : rediger_loi avec son projet_id ; le bien vient du projet. Un candidat sans projet (un dossier seul) : rediger_loi avec son deal_id.
- « À l'attention de » se remplit seul (30 oct. 2026) : l'agent immobilier lié à la propriété dans Twenty CRM, son agence (le nom en haut), « Représentée par » l'agent, puis l'adresse de l'agence (carnet des agences). Sans propriété dans Twenty, l'agent relevé sur le dossier.
- Le vendeur est facultatif : sans nom, la lettre écrit « Le vendeur ».
- Il te faut l'acquéreur (le nom de la personne qui signe, sa société, son adresse), l'adresse du local et le prix FAI TTC. L'apport vaut par défaut 15 % du prix, arrondi à la dizaine de milliers (68 000 → 70 000). Les échéances (validité à 7 jours, documents à 9, exclusivité à 23) passent au lundi quand elles tombent un vendredi ou un week-end. Ce qu'on ne t'a pas dit, tu le demandes en UNE ligne, tout d'un coup (« C'est qui l'acheteur ? »), puis tu rédiges. Tu ne devines jamais un nom ou un prix.
- Le texte suit la LOI de référence (« LOI OC - 1 av Mirabeau ») : le conseil, la désignation du bien et les pièces du vendeur en listes à tirets.
- Une lettre ouverte (loi_id donné par la page) : une correction (« le prix à 190 000 », « enlève la clause de substitution », « ajoute que… ») porte sur CETTE lettre : rediger_loi avec loi_id et seulement ce qui change (champs, ou textes par clé). Une offre pour un autre bien ou un autre acquéreur : une nouvelle lettre, sans loi_id.
- Deux modèles : « Classique » et « Menthe » ; le texte vient d'un seul endroit (server/ak/loi.js), l'écran, le Word et le PDF en sortent.
