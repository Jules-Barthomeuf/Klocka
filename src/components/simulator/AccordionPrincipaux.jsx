import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Calculator } from "lucide-react";
import CalculatorInput from "./CalculatorInput";
import TooltipInfo from "./TooltipInfo";

export default function AccordionPrincipaux({ 
  user, selectedProjectId, surface, setSurface, loyerInitialHTHC, setLoyerInitialHTHC, 
  prixBienFAI, setPrixBienFAI, prixBienNegocie, setPrixBienNegocie, dureeCredit, setDureeCredit,
  apport, setApport, calculs, formatCurrency, textClass, mutedClass 
}) {
  return (
    <div className="mb-4">
      <Card className="bg-[#101715] border border-white/[0.1] rounded-md overflow-hidden">
        <CardHeader className="p-5 pb-3">
          <CardTitle className="font-light text-white text-lg md:text-xl tracking-tight">Paramètres principaux</CardTitle>
        </CardHeader>
        <CardContent className="p-5 pt-0 space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-white text-sm flex items-center">Surface <TooltipInfo field="surface" /></Label>
              <div className="flex items-center gap-1">
                {user?.role === "admin" && !selectedProjectId ? (
                  <CalculatorInput
                    value={surface}
                    onChange={(val) => setSurface(val)}
                    className="bg-transparent border-none text-right text-white font-medium w-20 p-0 h-auto focus-visible:ring-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                ) : (
                  <Input
                    type="number"
                    value={surface}
                    onChange={(e) => setSurface(Number(e.target.value))}
                    disabled={selectedProjectId && selectedProjectId !== "default"}
                    className="bg-transparent border-none text-right text-white font-medium w-20 p-0 h-auto focus-visible:ring-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                )}
                <span className="text-[#93aca7] text-sm">m²</span>
              </div>
            </div>
            <input
              type="range"
              min="10"
              max="500"
              step="1"
              value={surface}
              onChange={(e) => setSurface(Number(e.target.value))}
              disabled={selectedProjectId && selectedProjectId !== "default"}
              className="w-full h-1 bg-[#24312f] rounded-full appearance-none cursor-pointer accent-[#33d6c0] disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-white text-sm flex items-center">Loyer initial HC HT <TooltipInfo field="loyerInitialHTHC" /></Label>
              <div className="flex items-center gap-1">
                {user?.role === "admin" && !selectedProjectId ? (
                  <CalculatorInput
                    value={loyerInitialHTHC}
                    onChange={(val) => setLoyerInitialHTHC(val)}
                    className="bg-transparent border-none text-right text-white font-medium w-24 p-0 h-auto focus-visible:ring-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                ) : (
                  <Input
                    type="number"
                    value={loyerInitialHTHC}
                    onChange={(e) => setLoyerInitialHTHC(Number(e.target.value))}
                    disabled={selectedProjectId && selectedProjectId !== "default"}
                    className="bg-transparent border-none text-right text-white font-medium w-24 p-0 h-auto focus-visible:ring-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                )}
                <span className="text-[#93aca7] text-sm">€</span>
              </div>
            </div>
            <input
              type="range"
              min="0"
              max="100000"
              step="1000"
              value={loyerInitialHTHC}
              onChange={(e) => setLoyerInitialHTHC(Number(e.target.value))}
              disabled={selectedProjectId && selectedProjectId !== "default"}
              className="w-full h-1 bg-[#24312f] rounded-full appearance-none cursor-pointer accent-[#33d6c0] disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-white text-sm flex items-center">Prix du bien FAI <TooltipInfo field="prixBienFAI" /></Label>
              <div className="flex items-center gap-1">
                {user?.role === "admin" && !selectedProjectId ? (
                  <CalculatorInput
                    value={prixBienFAI}
                    onChange={(val) => setPrixBienFAI(val)}
                    className="bg-transparent border-none text-right text-white font-medium w-28 p-0 h-auto focus-visible:ring-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                ) : (
                  <Input
                    type="number"
                    value={prixBienFAI}
                    onChange={(e) => setPrixBienFAI(Number(e.target.value))}
                    disabled={selectedProjectId && selectedProjectId !== "default"}
                    className="bg-transparent border-none text-right text-white font-medium w-28 p-0 h-auto focus-visible:ring-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                )}
                <span className="text-[#93aca7] text-sm">€</span>
              </div>
            </div>
            <input
              type="range"
              min="50000"
              max="2000000"
              step="10000"
              value={prixBienFAI}
              onChange={(e) => setPrixBienFAI(Number(e.target.value))}
              disabled={selectedProjectId && selectedProjectId !== "default"}
              className="w-full h-1 bg-[#24312f] rounded-full appearance-none cursor-pointer accent-[#33d6c0] disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-white text-sm flex items-center">Prix négocié FAI <TooltipInfo field="prixBienNegocie" /></Label>
              <div className="flex items-center gap-1">
                {user?.role === "admin" ? (
                  <CalculatorInput
                    value={prixBienNegocie}
                    onChange={(val) => setPrixBienNegocie(val)}
                    className="bg-transparent border-none text-right text-white font-medium w-28 p-0 h-auto focus-visible:ring-0"
                  />
                ) : (
                  <Input type="number" value={prixBienNegocie} onChange={(e) => setPrixBienNegocie(Number(e.target.value))} className="bg-transparent border-none text-right text-white font-medium w-28 p-0 h-auto focus-visible:ring-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                )}
                <span className="text-[#93aca7] text-sm">€</span>
              </div>
            </div>
            <input type="range" min="50000" max="2000000" step="10000" value={prixBienNegocie} onChange={(e) => setPrixBienNegocie(Number(e.target.value))} className="w-full h-1 bg-[#24312f] rounded-full appearance-none cursor-pointer accent-[#33d6c0]" />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-white text-sm flex items-center">Durée crédit <TooltipInfo field="dureeCredit" /></Label>
              <div className="flex items-center gap-1">
                {user?.role === "admin" ? (
                  <CalculatorInput
                    value={dureeCredit}
                    onChange={(val) => setDureeCredit(val)}
                    className="bg-transparent border-none text-right text-white font-medium w-12 p-0 h-auto focus-visible:ring-0"
                  />
                ) : (
                  <Input type="number" value={dureeCredit} onChange={(e) => setDureeCredit(Number(e.target.value))} className="bg-transparent border-none text-right text-white font-medium w-12 p-0 h-auto focus-visible:ring-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                )}
                <span className="text-[#93aca7] text-sm">ans</span>
              </div>
            </div>
            <input type="range" min="5" max="30" step="1" value={dureeCredit} onChange={(e) => setDureeCredit(Number(e.target.value))} className="w-full h-1 bg-[#24312f] rounded-full appearance-none cursor-pointer accent-[#33d6c0]" />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-white text-sm flex items-center">Apport <TooltipInfo field="apport" /></Label>
              <div className="flex items-center gap-1">
                {user?.role === "admin" ? (
                  <CalculatorInput
                    value={apport}
                    onChange={(val) => setApport(val)}
                    className="bg-transparent border-none text-right text-white font-medium w-28 p-0 h-auto focus-visible:ring-0"
                  />
                ) : (
                  <Input type="number" value={apport} onChange={(e) => setApport(Number(e.target.value))} className="bg-transparent border-none text-right text-white font-medium w-28 p-0 h-auto focus-visible:ring-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                )}
                <span className="text-[#93aca7] text-sm">€</span>
              </div>
            </div>
            <input type="range" min="0" max="500000" step="5000" value={apport} onChange={(e) => setApport(Number(e.target.value))} className="w-full h-1 bg-[#24312f] rounded-full appearance-none cursor-pointer accent-[#33d6c0]" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}