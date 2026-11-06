import PageShell from "@/components/klocka/PageShell";

const SECTIONS = [
  ["mentions", "Mentions légales", "Le site klocka.immo est édité par Klocka. Contact : contact@klocka.immo. Le site est hébergé par Render. Les informations complètes (forme sociale, capital, siège, RCS, directeur de publication) sont disponibles sur simple demande."],
  ["confidentialite", "Politique de confidentialité", "Klocka collecte uniquement les données nécessaires au traitement de vos demandes (nom, e-mail, informations de projet). Elles ne sont jamais revendues. Conformément au RGPD, vous disposez d’un droit d’accès, de rectification et de suppression en écrivant à contact@klocka.immo."],
  ["cgu", "Conditions générales d’utilisation", "L’utilisation du site implique l’acceptation des présentes conditions. Les contenus sont fournis à titre informatif et ne constituent pas un conseil en investissement. Les performances passées ne préjugent pas des performances futures."],
  ["cookies", "Cookies", "Le site utilise des cookies strictement nécessaires à son fonctionnement ainsi que des cookies de mesure d’audience anonymisés. Vous pouvez les désactiver à tout moment depuis les paramètres de votre navigateur."],
];

export default function Legal() {
  return (
    <PageShell title="Informations" highlight="légales">
      <section className="k-wrap flex flex-col gap-16" style={{ paddingBottom: 160 }}>
        {SECTIONS.map(([id, title, text]) => (
          <div key={id} id={id} className="max-w-[760px] border-t border-white/[0.08] pt-10">
            <h2 className="text-[28px] md:text-[36px] font-light">{title}</h2>
            <p className="k-body mt-5 text-k-t2">{text}</p>
          </div>
        ))}
      </section>
    </PageShell>
  );
}
