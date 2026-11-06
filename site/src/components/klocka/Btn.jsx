import { Link } from "react-router-dom";
import { INVEST_URL } from "@/lib/format";

export default function Btn({ to, href, variant = "primary", className = "", children }) {
  const cls = `${variant === "primary" ? "k-btn-primary" : "k-btn-secondary"} ${className}`;
  if (to) return <Link to={to} className={cls}>{children}</Link>;
  return (
    <a href={href || INVEST_URL} target="_blank" rel="noopener noreferrer" className={cls}>
      {children}
    </a>
  );
}
