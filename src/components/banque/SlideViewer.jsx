import React, { useState, useRef, useCallback } from "react";
import { ChevronLeft, ChevronRight, Download, Maximize2, Minimize2, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import SlideRenderer from "./SlideRenderer";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import exportPptx from "./exportPptx";

export default function SlideViewer({ slides, title }) {
  const [current, setCurrent] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isExportingPptx, setIsExportingPptx] = useState(false);
  const savedSlideRef = useRef(0);
  const slideRef = useRef(null);
  const containerRef = useRef(null);

  const prev = () => setCurrent(c => Math.max(0, c - 1));
  const next = () => setCurrent(c => Math.min(slides.length - 1, c + 1));

  const toggleFullscreen = useCallback(() => {
    if (!isFullscreen) {
      containerRef.current?.requestFullscreen?.();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.();
      setIsFullscreen(false);
    }
  }, [isFullscreen]);

  // Keyboard navigation
  React.useEffect(() => {
    const handler = (e) => {
      if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); next(); }
      if (e.key === "ArrowLeft") { e.preventDefault(); prev(); }
      if (e.key === "Escape" && isFullscreen) { setIsFullscreen(false); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isFullscreen, slides.length]);

  React.useEffect(() => {
    const handler = () => { if (!document.fullscreenElement) setIsFullscreen(false); };
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  const exportPDF = async () => {
    setIsExporting(true);
    savedSlideRef.current = current;
    const pdf = new jsPDF({ orientation: "landscape", unit: "px", format: [960, 540] });

    for (let i = 0; i < slides.length; i++) {
      setCurrent(i);
      await new Promise(r => setTimeout(r, 300));
      if (slideRef.current) {
        const canvas = await html2canvas(slideRef.current, {
          scale: 2,
          backgroundColor: "#000",
          useCORS: true,
          allowTaint: true,
        });
        const imgData = canvas.toDataURL("image/png");
        if (i > 0) pdf.addPage([960, 540], "landscape");
        pdf.addImage(imgData, "PNG", 0, 0, 960, 540);
      }
    }

    pdf.save(`${title || "presentation"}_bancaire.pdf`);
    setCurrent(savedSlideRef.current);
    setIsExporting(false);
  };

  const exportPPTX = async () => {
    setIsExportingPptx(true);
    savedSlideRef.current = current;
    await exportPptx(slides, title, slideRef, setCurrent);
    setCurrent(savedSlideRef.current);
    setIsExportingPptx(false);
  };

  if (!slides || slides.length === 0) return null;

  return (
    <div ref={containerRef} className={`flex flex-col ${isFullscreen ? 'fixed inset-0 z-[9999] bg-[#000000]' : ''}`}>
      {/* Slide area */}
      <div className={`relative ${isFullscreen ? 'flex-1' : ''}`}>
        <div
          ref={slideRef}
          className="bg-[#000000] overflow-hidden"
          style={{ aspectRatio: "16/9", width: "100%" }}
        >
          <SlideRenderer slide={slides[current]} />
        </div>

        {/* Navigation arrows */}
        {current > 0 && (
          <button onClick={prev} className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 bg-[#000000]/60 hover:bg-[#000000]/80 rounded-full flex items-center justify-center text-[#f2f3f5] transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </button>
        )}
        {current < slides.length - 1 && (
          <button onClick={next} className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 bg-[#000000]/60 hover:bg-[#000000]/80 rounded-full flex items-center justify-center text-[#f2f3f5] transition-colors">
            <ChevronRight className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between px-4 py-3 bg-[#000000] border-t border-[#1f2228]">
        <div className="flex items-center gap-2">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrent(i)}
              className={`w-2 h-2 rounded-full transition-all ${i === current ? 'bg-[#96c0b8] w-6' : 'bg-[#22262d] hover:bg-[#9298a6]'}`}
            />
          ))}
        </div>
        <span className="text-[#9298a6] text-xs">{current + 1} / {slides.length}</span>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={toggleFullscreen} className="text-[#9298a6] hover:text-[#f2f3f5] h-8 w-8">
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </Button>
          <Button
            size="sm"
            onClick={exportPDF}
            disabled={isExporting}
            className="bg-[#96c0b8]/15 border border-[#96c0b8]/30 hover:bg-[#96c0b8]/25 text-[#f2f3f5] text-xs h-8"
          >
            <Download className="w-3.5 h-3.5 mr-1.5" />
            {isExporting ? "Export..." : "PDF"}
          </Button>
          <Button
            size="sm"
            onClick={exportPPTX}
            disabled={isExportingPptx || isExporting}
            className="bg-[#96c0b8]/15 border border-[#96c0b8]/30 hover:bg-[#96c0b8]/25 text-[#f2f3f5] text-xs h-8"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 mr-1.5" />
            {isExportingPptx ? "Export..." : "PowerPoint"}
          </Button>
        </div>
      </div>
    </div>
  );
}