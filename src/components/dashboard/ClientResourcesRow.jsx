import React from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { BookOpen, ArrowUpRight } from "lucide-react";
import { motion } from "framer-motion";

export default function ClientResourcesRow({ resources }) {
  const navigate = useNavigate();

  if (!resources || resources.length === 0) return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <p className="text-white/25 uppercase tracking-[0.25em] text-[10px] font-medium">
          Ressources récentes
        </p>
        <button
          onClick={() => navigate(createPageUrl("Ressources"))}
          className="text-[#2A9D8F] text-xs uppercase tracking-[0.2em] hover:text-[#2A9D8F]/70 transition-colors flex items-center gap-1.5"
        >
          Voir tout
          <ArrowUpRight className="w-3 h-3" />
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {resources.slice(0, 3).map((resource, i) => (
          <motion.div
            key={resource.id}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: i * 0.08 }}
            className="group cursor-pointer"
            onClick={() => resource.url_fichier && window.open(resource.url_fichier, '_blank')}
          >
            <div className="bg-[#0A0A0A] rounded-xl border border-white/[0.06] p-4 hover:border-[#2A9D8F]/15 transition-all duration-300">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-[#2A9D8F]/[0.06] rounded-lg flex items-center justify-center flex-shrink-0">
                  <BookOpen className="w-4 h-4 text-[#2A9D8F]/50" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white/60 text-sm truncate">{resource.titre}</p>
                  <p className="text-white/20 text-xs truncate">{resource.description}</p>
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}