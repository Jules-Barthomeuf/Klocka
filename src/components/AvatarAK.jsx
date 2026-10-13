import React from "react";

// Le portrait d'AK, le même dans tous les chats : public/avatars/ak.png.
export default function AvatarAK({ className = "h-9 w-9" }) {
  return <img src="/avatars/ak.png" alt="AK" draggable={false} className={`${className} flex-none select-none rounded-full object-cover`} />;
}
