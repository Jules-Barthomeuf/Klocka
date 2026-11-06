import { Linkedin } from "lucide-react";

export default function LinkedInBtn({ href, name }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`LinkedIn de ${name}`}
      className="mt-4 w-[38px] h-[38px] rounded-full border border-white/25 flex items-center justify-center text-white hover:bg-k-sage hover:border-k-sage hover:text-black"
      style={{ transition: "all 260ms var(--k-ease)" }}
    >
      <Linkedin style={{ width: 17, height: 17 }} />
    </a>
  );
}
