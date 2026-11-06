import Btn from "./Btn";

export default function CtaBlock({ children }) {
  return <div className="py-10 text-center"><Btn>{children}</Btn></div>;
}
