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
      className="bg-[#0a0c0c] border border-[#282b2a] rounded-md p-6 md:p-8">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 rounded-md bg-[#edeae5]/[0.05] flex items-center justify-center">
          <Link2 className="w-5 h-5 text-[#8b9391]" />
        </div>
        <div>
          <p className="text-[#edeae5] font-medium">{title}</p>
          <p className="text-[#edeae5]/30 text-xs">{subtitle}</p>
        </div>
      </div>

      <div className="bg-[#edeae5]/[0.02] border border-[#242726] rounded-md px-4 py-3 flex items-center gap-3 mb-5">
        <p className="text-[#edeae5]/50 text-sm flex-1 truncate font-mono">{url}</p>
      </div>

      <div className="flex items-center gap-3">
        <button onClick={copyLink}
          className="flex items-center gap-2 bg-[#edeae5] hover:bg-[#d8d5d0] text-[#0c0e0d] text-sm font-medium px-5 py-2.5 rounded-md transition-all">
          {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          {copied ? "Copié !" : "Copier le lien"}
        </button>
        <a href={url} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-2 text-[#edeae5]/40 hover:text-[#edeae5] text-sm px-4 py-2.5 rounded-md border border-[#242726] hover:border-[#303332] transition-all">
          <ExternalLink className="w-4 h-4" />
          Ouvrir
        </a>
      </div>
    </motion.div>
  );
}