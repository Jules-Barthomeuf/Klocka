import React, { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Pencil, Trash2, Check, X, Share2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import moment from "moment";

export default function NoteCard({ note, isOwner, admins = [], onUpdate, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [titre, setTitre] = useState(note.titre);
  const [contenu, setContenu] = useState(note.contenu || "");
  const [showShare, setShowShare] = useState(false);
  const sharedEmails = note.shared_with_emails || [];

  const handleSave = () => {
    onUpdate(note.id, { titre, contenu });
    setEditing(false);
  };

  const toggleShare = (email) => {
    const next = sharedEmails.includes(email)
      ? sharedEmails.filter(e => e !== email)
      : [...sharedEmails, email];
    onUpdate(note.id, { shared_with_emails: next });
  };

  const handleCancel = () => {
    setTitre(note.titre);
    setContenu(note.contenu || "");
    setEditing(false);
  };

  const sharedNames = sharedEmails
    .map(email => admins.find(a => a.email === email)?.full_name || email)
    .join(", ");

  return (
    <Card className="bg-neutral-800 border-white/[0.1] p-4 space-y-3">
      {editing ? (
        <>
          <Input
            value={titre}
            onChange={(e) => setTitre(e.target.value)}
            className="bg-white/[0.03] text-white border-white/[0.06]"
            placeholder="Titre"
          />
          <Textarea
            value={contenu}
            onChange={(e) => setContenu(e.target.value)}
            className="bg-white/[0.03] text-white border-white/[0.06] min-h-[120px]"
            placeholder="Contenu de la note..."
          />
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" size="sm" onClick={handleCancel} className="text-gray-400 hover:text-white">
              <X className="w-4 h-4 mr-1" /> Annuler
            </Button>
            <Button size="sm" onClick={handleSave} className="bg-[#2A9D8F] hover:bg-[#2A9D8F]/80 text-white">
              <Check className="w-4 h-4 mr-1" /> Sauvegarder
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-white font-medium text-sm">{note.titre}</h3>
            <div className="flex gap-1 flex-shrink-0">
              <Button variant="ghost" size="icon" onClick={() => setEditing(true)} className="h-7 w-7 text-gray-500 hover:text-white">
                <Pencil className="w-3.5 h-3.5" />
              </Button>
              {isOwner && (
                <Button variant="ghost" size="icon" onClick={() => setShowShare(s => !s)} className={`h-7 w-7 ${showShare || sharedEmails.length > 0 ? "text-[#2A9D8F]" : "text-gray-500"} hover:text-[#2A9D8F]`}>
                  <Share2 className="w-3.5 h-3.5" />
                </Button>
              )}
              <Button variant="ghost" size="icon" onClick={() => onDelete(note.id)} className="h-7 w-7 text-gray-500 hover:text-red-400">
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
          {note.contenu && (
            <p className="text-gray-400 text-sm whitespace-pre-wrap leading-relaxed">{note.contenu}</p>
          )}
          <p className="text-gray-600 text-[10px]">{moment(note.created_date).format("DD/MM/YYYY HH:mm")}</p>

          {isOwner && showShare && (
            <div className="pt-3 border-t border-white/[0.06] space-y-2">
              <p className="text-[10px] uppercase tracking-wider text-gray-500">Partager avec un admin</p>
              {admins.length === 0 ? (
                <p className="text-xs text-gray-500">Aucun autre admin disponible</p>
              ) : (
                <div className="space-y-1">
                  {admins.map(admin => (
                    <label key={admin.id} className="flex items-center gap-2 cursor-pointer text-sm text-gray-300 hover:text-white py-1">
                      <input
                        type="checkbox"
                        checked={sharedEmails.includes(admin.email)}
                        onChange={() => toggleShare(admin.email)}
                        className="accent-[#2A9D8F] w-4 h-4"
                      />
                      <span>{admin.full_name || admin.email}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {isOwner && sharedEmails.length > 0 && (
            <p className="text-[11px] text-[#2A9D8F]">Cette note sera partagée à {sharedNames}</p>
          )}
        </>
      )}
    </Card>
  );
}