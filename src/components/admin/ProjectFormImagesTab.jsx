import React, { useState, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { X, GripVertical, Loader2 } from "lucide-react";

export default function ProjectFormImagesTab({ formData, setFormData }) {
  const [dragOverIdx, setDragOverIdx] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [urlText, setUrlText] = useState("");
  const dragIdx = useRef(null);

  const handleFilesUpload = async (fileList) => {
    const files = Array.from(fileList);
    if (files.length === 0) return;
    setUploading(true);
    const results = await Promise.all(
      files.map((file) => base44.integrations.Core.UploadFile({ file }))
    );
    const urls = results.map((r) => r.file_url);
    setFormData((prev) => ({ ...prev, photos: [...prev.photos, ...urls] }));
    setUploading(false);
  };

  const handleAddUrls = () => {
    const urls = urlText
      .split(/[\n,;\s]+/)
      .map((u) => u.trim())
      .filter((u) => u.startsWith("http"));
    if (urls.length === 0) return;
    setFormData((prev) => ({ ...prev, photos: [...prev.photos, ...urls] }));
    setUrlText("");
  };

  const handleDragStart = (idx) => {
    dragIdx.current = idx;
  };

  const handleDragOver = (e, idx) => {
    e.preventDefault();
    setDragOverIdx(idx);
  };

  const handleDrop = (idx) => {
    if (dragIdx.current === null || dragIdx.current === idx) {
      setDragOverIdx(null);
      return;
    }
    const items = Array.from(formData.photos);
    const [moved] = items.splice(dragIdx.current, 1);
    items.splice(idx, 0, moved);
    setFormData({ ...formData, photos: items });
    dragIdx.current = null;
    setDragOverIdx(null);
  };

  const handleDragEnd = () => {
    dragIdx.current = null;
    setDragOverIdx(null);
  };

  return (
    <div className="space-y-6 mt-6">
      <div className="space-y-4">
        <div className="p-6 bg-[#0f1114] rounded-none border border-[#1f2228]">
          <div className="text-[#f2f3f5] text-lg mb-4">Upload direct</div>
          <p className="text-xs text-[#9298a6] mb-4">Sélectionnez une ou plusieurs images depuis votre ordinateur</p>
          <label className="cursor-pointer">
            <input type="file" accept="image/*" multiple className="hidden" disabled={uploading} onChange={(e) => {
              handleFilesUpload(e.target.files);
              e.target.value = "";
            }} />
            <Button type="button" disabled={uploading} className="w-full bg-[#f2f3f5]/[0.06] border border-[#2c3139] hover:bg-[#f2f3f5]/[0.1] text-[#f2f3f5]" asChild>
              <span>{uploading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin inline" /> Import en cours…</> : "Choisir des images"}</span>
            </Button>
          </label>
        </div>

        <div className="p-6 bg-[#0f1114] rounded-none border border-[#1f2228]">
          <div className="text-[#f2f3f5] text-lg mb-4">Ajout par URL</div>
          <p className="text-xs text-[#9298a6] mb-4">Collez une ou plusieurs URL d'images (une par ligne, ou séparées par une virgule)</p>
          <textarea
            value={urlText}
            onChange={(e) => setUrlText(e.target.value)}
            rows={3}
            placeholder="https://exemple.com/photo1.jpg&#10;https://exemple.com/photo2.jpg"
            className="w-full resize-y bg-[#0f1114] border border-[#f2f3f5]/[0.10] rounded-lg px-3 py-2 text-[#f2f3f5] text-sm placeholder:text-[#6a7180] focus:outline-none focus:border-[#3a3f4a] mb-3"
          />
          <Button type="button" onClick={handleAddUrls} disabled={!urlText.trim()} className="w-full bg-[#f2f3f5]/[0.06] border border-[#2c3139] hover:bg-[#f2f3f5]/[0.1] text-[#f2f3f5] disabled:opacity-30">
            Ajouter les URL
          </Button>
        </div>

        {formData.photos.length > 0 && (
          <div className="mt-4">
            <p className="text-[#9298a6] text-sm mb-3">
              Glissez-déposez les images pour réorganiser ({formData.photos.length} photo{formData.photos.length > 1 ? 's' : ''})
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {formData.photos.map((url, idx) => (
                <div
                  key={idx}
                  draggable
                  onDragStart={() => handleDragStart(idx)}
                  onDragOver={(e) => handleDragOver(e, idx)}
                  onDrop={() => handleDrop(idx)}
                  onDragEnd={handleDragEnd}
                  className={`relative group transition-all duration-150 ${
                    dragOverIdx === idx && dragIdx.current !== idx
                      ? 'scale-105 ring-2 ring-[#96c0b8]'
                      : ''
                  }`}
                  style={{ cursor: 'grab' }}
                >
                  <div className="relative rounded-lg border border-[#1f2228] overflow-hidden bg-[#f2f3f5]/[0.02] h-36">
                    <img
                      src={url}
                      alt={`Photo ${idx + 1}`}
                      className="w-full h-full object-cover pointer-events-none"
                      onError={(e) => { e.target.style.display = 'none'; }}
                    />
                    <div className="absolute top-2 left-2 bg-[#000000]/60 text-[#f2f3f5] p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                      <GripVertical className="w-3.5 h-3.5" />
                    </div>
                    <button
                      onClick={() => setFormData({ ...formData, photos: formData.photos.filter((_, i) => i !== idx) })}
                      className="absolute top-2 right-2 bg-red-500 text-[#f2f3f5] p-0.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                    <div className="absolute bottom-2 left-2 bg-[#000000]/60 text-[#f2f3f5] px-1.5 py-0.5 rounded text-[10px]">#{idx + 1}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}