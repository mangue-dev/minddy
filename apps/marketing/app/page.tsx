import Link from "next/link";

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.minddy.app";

const features = [
  ["One shared source of truth", "Projects, issues, objectives and decisions stay close to the work."],
  ["Agents that understand the backlog", "Give coding agents focused context through the built-in MCP server."],
  ["Open source and self-hostable", "Run Minddy on infrastructure you control, with no marketing-service credentials."],
] as const;

export default function HomePage() {
  return (
    <main>
      <nav className="nav" aria-label="Primary navigation">
        <Link className="brand" href="/">minddy</Link>
        <div className="nav-links">
          <Link href="/pricing">Pricing</Link>
          <Link href="/mcp">MCP</Link>
          <a className="button button-small" href={appUrl}>Open app</a>
        </div>
      </nav>
      <section className="hero">
        <p className="eyebrow">Open-source product operations</p>
        <h1>Keep the work, the decisions and the agent in the same loop.</h1>
        <p className="lede">Minddy is an issue tracker for small product teams. Plan the work, document why it matters, then let an agent help ship it.</p>
        <div className="actions">
          <a className="button" href={appUrl}>Open Minddy</a>
          <Link className="text-link" href="/mcp">Explore the MCP server →</Link>
        </div>
      </section>
      <section className="grid" aria-label="Product capabilities">
        {features.map(([title, body]) => (
          <article key={title} className="card">
            <h2>{title}</h2>
            <p>{body}</p>
          </article>
        ))}
      </section>
      <section className="closing">
        <p className="eyebrow">Built to be operated independently</p>
        <h2>The marketing site has its own build and release cycle.</h2>
        <p>It only links to the application through public URLs. Deploy or self-host the product without this site.</p>
      </section>
      <footer>minddy · <Link href="/pricing">Pricing</Link> · <Link href="/mcp">MCP</Link></footer>
    </main>
  );
}
