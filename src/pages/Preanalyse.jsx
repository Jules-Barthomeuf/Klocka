import React from "react";
import { ExternalLink, Microscope } from "lucide-react";

export default function Preanalyse() {
  return (
    <div className="min-h-screen bg-black text-white p-4 md:p-8">
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-[#2A9D8F]/20 rounded-xl flex items-center justify-center">
              <Microscope className="w-5 h-5 text-[#2A9D8F]" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-light text-white tracking-tight">Préanalyse</h1>
              <p className="text-gray-500 text-sm">Outil d'analyse préliminaire de bail</p>
            </div>
          </div>
          <div className="h-px w-16 bg-[#2A9D8F] mt-3" />
        </div>

        <div className="bg-[#0A0A0A] border border-white/[0.06] rounded-2xl p-8 flex flex-col items-center text-center gap-6">
          <Microscope className="w-16 h-16 text-[#2A9D8F]/40" />
          <div>
            <h2 className="text-white text-lg font-light mb-2">Analyser un bail</h2>
            <p className="text-gray-500 text-sm max-w-sm">Accédez à l'outil de préanalyse pour analyser rapidement un bail commercial.</p>
          </div>
          <a
            href="https://ai-cre.onrender.com/bail-bye.html"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-6 py-3 bg-[#2A9D8F]/15 border border-[#2A9D8F]/30 hover:bg-[#2A9D8F]/25 text-white rounded-xl transition-all font-medium"
          >
            <ExternalLink className="w-4 h-4" />
            Accéder à l'outil
          </a>
        </div>
      </div>
    </div>
  );
}