import Link from "next/link";

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.minddy.app";

export const metadata = { title: "Pricing" };

export default function PricingPage() {
  return (
    <main className="page">
      <nav className="nav"><Link className="brand" href="/">minddy</Link><a className="button button-small" href={appUrl}>Open app</a></nav>
      <section className="copy">
        <p className="eyebrow">Pricing</p>
        <h1>Use the product on your own terms.</h1>
        <p>Minddy is open source and can be self-hosted. Managed plans and their current terms are presented here independently of the application deployment.</p>
        <a className="button" href={appUrl}>Open Minddy</a>
      </section>
    </main>
  );
}
