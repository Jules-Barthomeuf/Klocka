import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { GlowingEffect } from "@/components/ui/glowing-effect";

export default function SectionCard({ icon, title, children }) {
  return (
    <div className="relative rounded-[1.25rem] border-[0.75px] border-gray-700 p-2 md:rounded-[1.5rem] md:p-3">
      <GlowingEffect spread={40} glow={true} disabled={false} proximity={64} inactiveZone={0.01} borderWidth={3} />
      <Card className="relative bg-[#050807] border-none hover:shadow-xl transition-all duration-300">
        <CardContent className="p-6 max-md:p-4">
          <h3 className="text-xl max-md:text-lg font-montserrat text-white mb-4 flex items-center gap-2">
            {icon}{title}
          </h3>
          {children}
        </CardContent>
      </Card>
    </div>
  );
}

export function KPI({ label, value, sub, color = "gray", inline }) {
  const colors = {
    teal: "from-[#33d6c0]/20 border-[#33d6c0]/50 text-[#33d6c0]",
    green: "from-[#33d6c0]/20 border-[#33d6c0]/30 text-[#5ee7d4]",
    red: "from-red-500/20 border-red-500/30 text-red-400",
    amber: "from-amber-500/20 border-amber-500/30 text-amber-400",
    blue: "from-blue-500/20 border-blue-500/30 text-blue-400",
    purple: "from-purple-500/20 border-purple-500/30 text-purple-400",
    gray: "from-gray-800/50 border-gray-700 text-white",
  };
  const c = colors[color] || colors.gray;
  const parts = c.split(" ");

  if (inline) {
    return (
      <div className={`inline-flex items-center gap-3 p-4 bg-gradient-to-br ${parts[0]} to-transparent rounded-md border ${parts[1]}`}>
        <p className="text-sm text-gray-400">{label}</p>
        <p className={`text-2xl font-semibold ${parts[2]}`}>{value}</p>
      </div>
    );
  }

  return (
    <div className={`p-4 bg-gradient-to-br ${parts[0]} to-transparent rounded-md border ${parts[1]}`}>
      <p className="text-sm text-gray-400 mb-1">{label}</p>
      <p className={`text-2xl font-semibold ${parts[2]}`}>{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
    </div>
  );
}

export function ProgressBar({ label, value, color = "#33d6c0", maxValue = 100 }) {
  return (
    <div>
      <div className="flex justify-between text-xs text-gray-400 mb-1">
        <span>{label}</span><span>{value}%</span>
      </div>
      <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(value, maxValue)}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}