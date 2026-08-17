import React, { useState } from "react";
import { Copy, Check, ExternalLink, Link2 } from "lucide-react";
import { motion } from "framer-motion";

export default function PortailLinkCard({ title, subtitle, url, delay = 0 }) {
  const [copied, setCopied] = useState(false);

  const copyLink = () => {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }}
      className="bg-[#0a0f0e] border border-[#1c2725] rounded-md p-6 md:p-8">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 rounded-md bg-[#33d6c0]/10 flex items-center justify-center">
          <Link2 className="w-5 h-5 text-[#33d6c0]" />
        </div>
        <div>
          <p className="text-white font-medium">{title}</p>
          <p className="text-white/30 text-xs">{subtitle}</p>
        </div>
      </div>

      <div className="bg-white/[0.02] border border-[#16201f] rounded-md px-4 py-3 flex items-center gap-3 mb-5">
        <p className="text-white/50 text-sm flex-1 truncate font-mono">{url}</p>
      </div>

      <div className="flex items-center gap-3">
        <button onClick={copyLink}
          className="flex items-center gap-2 bg-[#33d6c0] hover:bg-[#33d6c0]/90 text-white text-sm font-medium px-5 py-2.5 rounded-md transition-all">
          {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          {copied ? "Copié !" : "Copier le lien"}
        </button>
        <a href={url} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-2 text-white/40 hover:text-white text-sm px-4 py-2.5 rounded-md border border-[#16201f] hover:border-[#24312f] transition-all">
          <ExternalLink className="w-4 h-4" />
          Ouvrir
        </a>
      </div>
    </motion.div>
  );
}