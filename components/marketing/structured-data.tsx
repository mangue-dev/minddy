import { getTranslations } from "next-intl/server";
import { BILLING_PLANS } from "@/lib/billing-plans";
import { CONTACT_EMAIL, SITE_URL } from "@/lib/site";

/**
 * Données structurées de la landing (schema.org, JSON-LD).
 *
 * Le `<title>` et le wordmark de la nav suffisent à un humain pour savoir sur
 * quel produit il est tombé ; un analyseur, lui, doit le deviner. Ce graphe
 * donne le nom de l'app et son objet sous forme non ambiguë — c'est exactement
 * ce que vérifie Google au moment de valider le branding de l'écran de
 * consentement OAuth (« le nom d'application configuré ne correspond pas à
 * celui de votre page d'accueil », « votre page d'accueil n'explique pas
 * l'objectif de votre application »).
 *
 * Trois nœuds reliés par `@id` plutôt que trois blocs indépendants : Google
 * comprend alors qu'il s'agit d'une seule entité vue sous trois angles —
 * l'éditeur, le site, le logiciel.
 *
 * La description suit la langue servie : le graphe décrit la page telle qu'elle
 * est rendue, pas une version canonique qui n'existe nulle part.
 *
 * Les prix sont DÉRIVÉS de `BILLING_PLANS`, jamais recopiés : `offers` est le
 * seul champ que Google exploite pour un rich result prix sur une
 * `SoftwareApplication`, et le seul moyen de signaler qu'un palier gratuit
 * existe. Une copie en dur se serait désynchronisée au premier changement de
 * tarif — l'erreur exacte que la landing vient de corriger ailleurs.
 */
export async function StructuredData() {
  const [t, tb] = await Promise.all([
    getTranslations("Landing"),
    getTranslations("Billing"),
  ]);

  const prices = BILLING_PLANS.map((plan) => plan.priceEurMonthly);
  const planNameKey = { free: "planFree", go: "planGo", pro: "planPro" } as const;

  const graph = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${SITE_URL}/#organization`,
        name: "minddy",
        url: SITE_URL,
        logo: `${SITE_URL}/logo.svg`,
        email: CONTACT_EMAIL,
      },
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        name: "minddy",
        url: SITE_URL,
        publisher: { "@id": `${SITE_URL}/#organization` },
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${SITE_URL}/#software`,
        name: "minddy",
        url: SITE_URL,
        description: t("metaDescription"),
        applicationCategory: "DeveloperApplication",
        operatingSystem: "Web",
        publisher: { "@id": `${SITE_URL}/#organization` },
        offers: {
          "@type": "AggregateOffer",
          priceCurrency: "EUR",
          lowPrice: Math.min(...prices),
          highPrice: Math.max(...prices),
          offerCount: BILLING_PLANS.length,
          offers: BILLING_PLANS.map((plan) => ({
            "@type": "Offer",
            name: tb(planNameKey[plan.id]),
            price: plan.priceEurMonthly,
            priceCurrency: "EUR",
            url: `${SITE_URL}/pricing`,
            // Sans `billingDuration`, un prix mensuel se lit comme un prix
            // unique : P1M dit que les 8 € sont récurrents.
            priceSpecification: {
              "@type": "UnitPriceSpecification",
              price: plan.priceEurMonthly,
              priceCurrency: "EUR",
              billingDuration: 1,
              billingIncrement: 1,
              unitCode: "MON",
            },
          })),
        },
      },
    ],
  };

  return (
    <script
      type="application/ld+json"
      // Les chaînes viennent des fichiers de traduction, mais un `<` suivi de
      // `/script>` refermerait la balise : on remplace donc tout `<` par son
      // échappement Unicode, que JSON.parse relit comme le caractère d'origine.
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(graph).replaceAll("<", "\\u003c"),
      }}
    />
  );
}
