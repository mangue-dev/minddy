import Link from "next/link";

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.minddy.app";

export const metadata = { title: "MCP server" };

export default function McpPage() {
  return (
    <main className="page">
      <nav className="nav"><Link className="brand" href="/">minddy</Link><a className="button button-small" href={appUrl}>Open app</a></nav>
      <section className="copy">
        <p className="eyebrow">MCP server</p>
        <h1>Give your coding agent useful product context.</h1>
        <p>The application exposes its MCP endpoint as part of an instance. This marketing site documents the capability but does not proxy credentials, sessions or API requests.</p>
        <a className="button" href={appUrl}>Configure in Minddy</a>
      </section>
    </main>
  );
}
