import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, MapPin, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";

// Mapping des types de commerce vers leurs images
const commerceImages = {
  "Boulangerie": "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68f0bd18555df3520e1740ca/80396f5a3_maisondupain-scaled.jpg",
  "Boulangerie artisanale": "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68f0bd18555df3520e1740ca/934095a7b_boulangeriemoderne.jpg",
  "Boulangerie moderne": "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68f0bd18555df3520e1740ca/934095a7b_boulangeriemoderne.jpg",
  "Prêt-à-porter": "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68f0bd18555df3520e1740ca/325de5555_2OGZ6TKWDZGFDPQSZ76IEIVXAY.jpg",
  "Coiffeur": "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68f0bd18555df3520e1740ca/d9ef3e40e_de-cote-exterieur-salon-rodolphe-nuit-lumiere-2.jpg",
  "Restaurant": "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68f0bd18555df3520e1740ca/81ffc2a5f_restaurant.jpg",
  "Restauration rapide": "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68f0bd18555df3520e1740ca/8ddeb11ce_terrasse.jpg",
  "Restaurant gastronomique": "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68f0bd18555df3520e1740ca/81ffc2a5f_restaurant.jpg",
  "Brasserie": "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68f0bd18555df3520e1740ca/8ddeb11ce_terrasse.jpg",
  "Brasserie moderne": "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68f0bd18555df3520e1740ca/8ddeb11ce_terrasse.jpg",
  "Café-restaurant": "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68f0bd18555df3520e1740ca/81ffc2a5f_restaurant.jpg",
  "Commerce alimentaire": "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68f0bd18555df3520e1740ca/934095a7b_boulangeriemoderne.jpg",
  "Commerce de détail": "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68f0bd18555df3520e1740ca/325de5555_2OGZ6TKWDZGFDPQSZ76IEIVXAY.jpg",
  "Commerce généraliste": "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68f0bd18555df3520e1740ca/325de5555_2OGZ6TKWDZGFDPQSZ76IEIVXAY.jpg",
  "Commerce de proximité": "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68f0bd18555df3520e1740ca/9942141e4_ce-jeudi-un-supermarche-e-leclerc-express-ouvre-ses-portes-au-12-rue-saint-dizier-a-nancy-avec-pres-de-6000-reference-sur-plus-de-300m-leclerc-investit-l-ancienne-papeterie-de-la-sorbonne-adresse-emblematique-du-centre-ville-nanceien-photo-cedric-jac.jpg",
  "Grande enseigne": "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68f0bd18555df3520e1740ca/325de5555_2OGZ6TKWDZGFDPQSZ76IEIVXAY.jpg",
  "Franchise nationale": "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68f0bd18555df3520e1740ca/325de5555_2OGZ6TKWDZGFDPQSZ76IEIVXAY.jpg",
  "Footlocker": "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68f0bd18555df3520e1740ca/325de5555_2OGZ6TKWDZGFDPQSZ76IEIVXAY.jpg",
  "Assurance": "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68f0bd18555df3520e1740ca/325de5555_2OGZ6TKWDZGFDPQSZ76IEIVXAY.jpg",
  "Salle de sport": "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68f0bd18555df3520e1740ca/325de5555_2OGZ6TKWDZGFDPQSZ76IEIVXAY.jpg",
  "Salle de sport premium": "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68f0bd18555df3520e1740ca/325de5555_2OGZ6TKWDZGFDPQSZ76IEIVXAY.jpg",
  "Carrefour City": "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68f0bd18555df3520e1740ca/325de5555_2OGZ6TKWDZGFDPQSZ76IEIVXAY.jpg",
  "Leclerc": "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68f0bd18555df3520e1740ca/9942141e4_ce-jeudi-un-supermarche-e-leclerc-express-ouvre-ses-portes-au-12-rue-saint-dizier-a-nancy-avec-pres-de-6000-reference-sur-plus-de-300m-leclerc-investit-l-ancienne-papeterie-de-la-sorbonne-adresse-emblematique-du-centre-ville-nanceien-photo-cedric-jac.jpg",
  "Lidl": "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68f0bd18555df3520e1740ca/3fac72780_lidl.jpg",
};

// Données des projets selon leur taille
const projectDataBySize = {
  "200": {
    cities: ["Toulouse", "Nantes", "Rennes", "Le Havre", "Reims"],
    types: ["Boulangerie", "Prêt-à-porter", "Restauration rapide", "Coiffeur", "Boulangerie artisanale"],
  },
  "300": {
    cities: ["Lyon", "Marseille", "Nice", "Strasbourg", "Montpellier"],
    types: ["Boulangerie", "Prêt-à-porter", "Restauration rapide", "Coiffeur", "Commerce alimentaire"],
  },
  "400": {
    cities: ["Bordeaux", "Lille", "Nantes", "Lyon", "Toulouse"],
    types: ["Restaurant", "Commerce alimentaire", "Brasserie", "Commerce de détail", "Café-restaurant"],
  },
  "500": {
    cities: ["Paris", "Lyon", "Marseille", "Toulouse", "Bordeaux"],
    types: ["Restaurant", "Commerce généraliste", "Brasserie moderne", "Commerce alimentaire", "Restaurant gastronomique"],
  },
  "700": {
    cities: ["Paris", "Lyon", "Marseille", "Bordeaux", "Nice"],
    types: ["Footlocker", "Assurance", "Grande enseigne", "Commerce de proximité", "Franchise nationale"],
  },
  "1000": {
    cities: ["Paris", "Lyon", "Marseille", "Bordeaux", "Lille"],
    types: ["Salle de sport", "Restaurant", "Carrefour City", "Leclerc", "Lidl"],
  },
  "1200": {
    cities: ["Paris", "Lyon", "Marseille", "Bordeaux", "Nice"],
    types: ["Salle de sport premium", "Restaurant gastronomique", "Carrefour City", "Leclerc", "Lidl"],
  },
};

export default function ProjectDetailsCarousel({ projets, typeStrategie }) {
  const [currentIndex, setCurrentIndex] = useState(0);

  if (!projets || projets.length === 0) {
    return null;
  }

  // Rendement selon la stratégie
  const baseYield = typeStrategie === "patrimoniale" ? 6 : typeStrategie === "agressive" ? 8 : 7;

  const projectsWithDetails = projets.map((projet, idx) => {
    const data = projectDataBySize[projet.taille];
    const projectIndex = idx % (data.cities.length);
    const typeCommerce = data.types[projectIndex];
    
    const formatPrice = (taille) => {
      const value = parseInt(taille);
      if (value >= 1000) {
        return value === 1000 ? "1M€" : `${(value / 1000).toFixed(1)}M€`;
      }
      return `${taille}K€`;
    };
    
    return {
      id: idx,
      title: `${typeCommerce} - ${data.cities[projectIndex]}`,
      subtitle: typeCommerce,
      city: data.cities[projectIndex],
      price: formatPrice(projet.taille),
      yield: `${baseYield}%`,
      image: commerceImages[typeCommerce] || commerceImages["Commerce généraliste"],
    };
  });

  const next = () => {
    setCurrentIndex((prev) => (prev + 1) % projectsWithDetails.length);
  };

  const prev = () => {
    setCurrentIndex((prev) => 
      prev === 0 ? projectsWithDetails.length - 1 : prev - 1
    );
  };

  const currentProject = projectsWithDetails[currentIndex];

  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3, duration: 0.6 }}
      className="mb-12"
    >
      <h3 className="text-2xl text-white font-geist font-semibold mb-8">Vos projets d'investissement</h3>
      
      <div className="relative rounded-2xl overflow-hidden bg-black/40 border border-neutral-800 p-8">
        <div className="grid lg:grid-cols-2 gap-8 items-center">
          {/* Image */}
          <AnimatePresence mode="wait">
            <motion.div
              key={currentIndex}
              initial={{ opacity: 0, x: -100 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 100 }}
              transition={{ duration: 0.5, ease: "easeInOut" }}
              className="rounded-xl overflow-hidden h-80 bg-gradient-to-br from-[#2A9D8F]/20 to-neutral-900"
            >
              <img
                src={currentProject.image}
                alt={currentProject.title}
                className="w-full h-full object-cover"
              />
            </motion.div>
          </AnimatePresence>

          {/* Details */}
          <AnimatePresence mode="wait">
            <motion.div
              key={currentIndex}
              initial={{ opacity: 0, x: -100 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 100 }}
              transition={{ duration: 0.5, ease: "easeInOut", delay: 0.1 }}
              className="space-y-6"
            >
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <MapPin className="w-4 h-4 text-[#2A9D8F]" />
                  <span className="text-sm text-[#2A9D8F] font-medium uppercase tracking-wide">
                    {currentProject.city}
                  </span>
                </div>
                <h4 className="text-3xl font-jakarta font-bold text-white mb-2">
                  {currentProject.title}
                </h4>
                <p className="text-neutral-400 text-base">
                  {currentProject.subtitle}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-neutral-700">
                <div className="rounded-lg bg-black/50 border border-neutral-800 p-4">
                  <p className="text-xs text-neutral-500 uppercase tracking-wider mb-1 font-geist">Prix d'acquisition</p>
                  <p className="text-2xl font-bold text-white">{currentProject.price}</p>
                </div>
                <div className="rounded-lg bg-black/50 border border-neutral-800 p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <TrendingUp className="w-3 h-3 text-[#2A9D8F]" />
                    <p className="text-xs text-neutral-500 uppercase tracking-wider font-geist">Rendement annuel</p>
                  </div>
                  <p className="text-2xl font-bold text-[#2A9D8F]">{currentProject.yield}</p>
                </div>
              </div>

              {/* Navigation */}
              <div className="flex items-center justify-between pt-6">
                <Button
                  onClick={prev}
                  variant="outline"
                  size="icon"
                  className="h-10 w-10 rounded-full border-neutral-700 bg-black/50 hover:bg-black/70 text-white"
                >
                  <ChevronLeft className="w-5 h-5" />
                </Button>

                <div className="flex items-center gap-2">
                  {projectsWithDetails.map((_, idx) => (
                    <motion.div
                      key={idx}
                      onClick={() => setCurrentIndex(idx)}
                      className={`h-2 rounded-full cursor-pointer transition-all ${
                        idx === currentIndex
                          ? "bg-[#2A9D8F] w-8"
                          : "bg-neutral-700 w-2"
                      }`}
                      whileHover={{ scale: 1.2 }}
                    />
                  ))}
                </div>

                <Button
                  onClick={next}
                  variant="outline"
                  size="icon"
                  className="h-10 w-10 rounded-full border-neutral-700 bg-black/50 hover:bg-black/70 text-white"
                >
                  <ChevronRight className="w-5 h-5" />
                </Button>
              </div>

              <p className="text-xs text-neutral-500 text-center">
                Projet {currentIndex + 1} sur {projectsWithDetails.length}
              </p>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}