import React, { useState } from "react";
import { ExternalLink } from "lucide-react";

const LINK_CONFIG = {
  instagram: {
    label: "Instagram",
    color: "from-pink-600 to-purple-600",
    borderColor: "border-pink-500/30 hover:border-pink-500/60",
    icon: (
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
      </svg>
    ),
  },
  facebook: {
    label: "Facebook",
    color: "from-blue-600 to-blue-700",
    borderColor: "border-blue-500/30 hover:border-blue-500/60",
    icon: (
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
      </svg>
    ),
  },
  google_avis: {
    label: "Avis Google",
    color: "from-[#33d6c0] to-[#2bb8a5]",
    borderColor: "border-[#33d6c0]/30 hover:border-[#33d6c0]/60",
    icon: (
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
        <path d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z"/>
      </svg>
    ),
  },
  tripadvisor: {
    label: "TripAdvisor",
    color: "from-[#5ee7d4] to-[#2bb8a5]",
    borderColor: "border-[#33d6c0]/30 hover:border-[#33d6c0]/60",
    icon: (
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
        <path d="M12.006 4.295c-2.67 0-5.338.784-7.645 2.353H0l1.963 2.135a5.997 5.997 0 004.04 10.43 5.976 5.976 0 004.075-1.6L12 19.705l1.922-2.09a5.976 5.976 0 004.075 1.6 5.997 5.997 0 004.04-10.43L24 6.648h-4.35a13.573 13.573 0 00-7.644-2.353zM6.003 17.214a3.997 3.997 0 110-7.994 3.997 3.997 0 010 7.994zm11.994 0a3.997 3.997 0 110-7.994 3.997 3.997 0 010 7.994zM6.003 11.22a2 2 0 100 4 2 2 0 000-4zm11.994 0a2 2 0 100 4 2 2 0 000-4z"/>
      </svg>
    ),
  },
  site_web: {
    label: "Site web",
    color: "from-gray-500 to-gray-600",
    borderColor: "border-gray-500/30 hover:border-gray-500/60",
    icon: <ExternalLink className="w-5 h-5" />,
  },
  linkedin: {
    label: "LinkedIn",
    color: "from-blue-500 to-blue-700",
    borderColor: "border-blue-400/30 hover:border-blue-400/60",
    icon: (
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
      </svg>
    ),
  },
  autre: {
    label: "Autre",
    color: "from-gray-500 to-gray-600",
    borderColor: "border-gray-500/30 hover:border-gray-500/60",
    icon: <ExternalLink className="w-5 h-5" />,
  },
};

function getInstagramUsername(url) {
  if (!url) return null;
  const match = url.match(/instagram\.com\/([^/?#]+)/);
  return match ? match[1] : null;
}

function InstagramPreview({ url }) {
  const username = getInstagramUsername(url);
  if (!username) return null;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="block rounded-md overflow-hidden border border-pink-500/30 hover:border-pink-500/60 transition-all duration-300 group"
    >
      <div className="bg-gradient-to-br from-purple-900/40 via-pink-900/40 to-orange-900/40 p-5">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-pink-500 via-red-500 to-yellow-500 flex items-center justify-center text-white font-bold text-xl shadow-lg">
            {username.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <p className="text-white font-semibold text-lg">@{username}</p>
              <svg viewBox="0 0 24 24" className="w-4 h-4 text-pink-400" fill="currentColor">
                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
              </svg>
            </div>
            <p className="text-gray-400 text-sm">Instagram</p>
          </div>
          <div className="px-4 py-1.5 bg-gradient-to-r from-pink-500 to-purple-600 rounded-lg text-white text-sm font-medium group-hover:from-pink-400 group-hover:to-purple-500 transition-all">
            Voir le profil
          </div>
        </div>
        <div className="grid grid-cols-3 gap-1.5 rounded-md overflow-hidden">
          {[1,2,3].map((i) => (
            <div key={i} className="aspect-square bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center">
              <svg viewBox="0 0 24 24" className="w-6 h-6 text-gray-700" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <path d="M21 15l-5-5L5 21" />
              </svg>
            </div>
          ))}
        </div>
      </div>
    </a>
  );
}

export default function LocataireLiensSociaux({ liens }) {
  if (!liens || liens.length === 0) return null;

  const instagramLink = liens.find(l => l.type === "instagram");
  const otherLinks = liens.filter(l => l.type !== "instagram");

  return (
    <div className="mt-6 max-md:mt-4 pt-6 max-md:pt-4 border-t border-gray-700">
      <h3 className="font-montserrat text-white mb-4 max-md:mb-2 max-md:text-lg">
        Présence en ligne
      </h3>

      {instagramLink && (
        <div className="mb-4">
          <InstagramPreview url={instagramLink.url} />
        </div>
      )}

      {otherLinks.length > 0 && (
        <div className="grid md:grid-cols-2 gap-3">
          {otherLinks.map((lien, idx) => {
            const config = LINK_CONFIG[lien.type] || LINK_CONFIG.autre;
            return (
              <a
                key={idx}
                href={lien.url}
                target="_blank"
                rel="noopener noreferrer"
                className={`flex items-center gap-4 p-4 bg-gray-800/50 rounded-md border ${config.borderColor} transition-all duration-300 group`}
              >
                <div className={`w-10 h-10 bg-gradient-to-br ${config.color} rounded-lg flex items-center justify-center text-white flex-shrink-0 shadow-lg`}>
                  {config.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium">{lien.label || config.label}</p>
                  <p className="text-gray-500 text-xs truncate">{lien.url}</p>
                </div>
                <ExternalLink className="w-4 h-4 text-gray-500 group-hover:text-white transition-colors flex-shrink-0" />
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}