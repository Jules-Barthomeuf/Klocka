import { IMG as M } from "@/lib/format";

export const IMAGES = [
  M + "9cdfed317_pexels-theo-decker-5955108.jpg",
  M + "e41c96ff3_pexels-neslihan-97164342-34438573.jpg",
  M + "1768afd8d_pexels-emanuel-h-2160343099-38628624.jpg",
  M + "ee92cd98a_pexels-vardarious-17584060.jpg",
  M + "6d83b8ddb_pexels-muhammed-zeya-170428250-17324533.jpg",
  M + "459e9df9d_pexels-nathanjhilton-30691575.jpg",
];

export const CITY_IMAGES = [
  M + "4fc79a481_pexels-joseph-kettaneh-3470839-19573002.jpg",
  M + "94ea2bb01_pexels-celine-3776818-13866439.jpg",
  M + "6df523eb6_pexels-alexander-jasper-191862035-11403259.jpg",
  M + "72cca925e_pexels-delot-33520932.jpg",
  M + "a101354f7_pexels-newman-photographs-234743505-30404360.jpg",
  M + "686562b4c_pexels-pierre-blache-651604-3109420.jpg",
  M + "69594ce6b_pexels-talenareese-10681992.jpg",
  M + "12c80c9e4_pexels-guihankenne-2792025.jpg",
  M + "f5dfaa847_pexels-taylor-thompson-865581658-32568261.jpg",
  M + "08aef9f9c_pexels-bastien-neves-2459695-4082495.jpg",
  M + "14180d63a_pexels-imagevain-13398532.jpg",
  M + "a4f426f42_pexels-matteo-angeloni-106557007-18596288.jpg",
  M + "41e9ee450_pexels-castorlystock-4112944.jpg",
];

export const CAROUSEL_IMAGES = CITY_IMAGES;

export const INITIAL = [
  { title: "Restaurant – Bordeaux", price: 408, yld: 8.4, surface: 60, img: CITY_IMAGES[0] },
  { title: "Assurance – Nantes", price: 246, yld: 9.89, surface: 112, img: CITY_IMAGES[1] },
  { title: "Salle de sport – Nice", price: 864, yld: 5.86, surface: 423, img: CITY_IMAGES[2] },
  { title: "Supérette – Menton", price: 697, yld: 7.46, surface: 180, img: CITY_IMAGES[8] },
  { title: "Opticien – Cannes", price: 335, yld: 8.56, surface: 69, img: CITY_IMAGES[5] },
  { title: "Pharmacie – Lyon", price: 617, yld: 8.27, surface: 100, img: CITY_IMAGES[7] },
];

export const TITLES = [
  "Restaurant – Bordeaux", "Assurance – Nantes", "Salle de sport – Nice", "Supérette – Menton",
  "Opticien – Cannes", "Pharmacie – Lyon", "Agence immobilière – Rennes", "Courtier – Paris",
  "Banque – Versailles", "Magasin de vêtements – Lille", "Restaurant – Angers", "Pharmacie – Annecy",
  "Opticien – Metz", "Salle de sport – Biarritz", "Supérette – Bayonne",
];

export function randomMetrics() {
  return {
    price: Math.round(110 + Math.random() * 780),
    yld: Math.round((5 + Math.random() * 5) * 100) / 100,
    surface: Math.round(17 + Math.random() * 430),
  };
}
