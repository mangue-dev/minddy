// Frise des captures — client.
//
// Deux vues : un tableau de bord chiffré, et le détail d'une capture avec le
// rideau de comparaison. L'état tient dans l'URL (#shot/variant) pour qu'un
// rechargement retombe au même endroit.

const main = document.getElementById("main");
const nav = document.getElementById("nav");
const navShot = document.getElementById("nav-shot");
const headEl = document.getElementById("head");

let data = null;
let current = { shot: null, variant: null, a: null, b: null, split: 50 };

// ---------------------------------------------------------------- utilitaires

const fmt = new Intl.NumberFormat("fr-FR");
const dateFmt = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

function ago(iso) {
  const days = Math.floor((Date.now() - new Date(iso)) / 86400000);
  if (days <= 0) return "aujourd'hui";
  if (days === 1) return "hier";
  if (days < 31) return `il y a ${days} j`;
  const months = Math.floor(days / 30.44);
  return `il y a ${months} mois`;
}

function kb(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1048576).toFixed(1)} Mo`;
  return `${Math.round(bytes / 1024)} Ko`;
}

function behindClass(n) {
  if (n < 40) return "behind-fresh";
  if (n < 150) return "behind-mid";
  return "behind-stale";
}

function el(html) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

function esc(s) {
  return String(s ?? "").replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
  );
}

// ---------------------------------------------------------------- chargement

async function load(refresh = false) {
  main.innerHTML = `<p class="loading">${
    refresh ? "Relecture du dépôt…" : "Lecture de l'historique git…"
  }</p>`;
  const res = await fetch(`/api/index${refresh ? "?refresh=1" : ""}`);
  data = await res.json();
  headEl.textContent = `HEAD ${data.head} · ${fmt.format(data.productCommits)} commits produit`;
  nav.hidden = false;
  route();
}

// ---------------------------------------------------------------- routage

function route() {
  const [name, variant] = decodeURIComponent(location.hash.replace(/^#/, "")).split("/");
  const found = data.shots.find((s) => s.name === name);
  if (found) {
    renderShot(found, variant);
  } else {
    renderDashboard();
  }
}

window.addEventListener("hashchange", route);

document.getElementById("refresh").addEventListener("click", () => load(true));

nav.addEventListener("click", (e) => {
  const tab = e.target.closest(".tab");
  if (!tab) return;
  if (tab.dataset.view === "dashboard") location.hash = "";
  else if (current.shot) location.hash = `#${current.shot}/${current.variant}`;
});

function setTab(view) {
  for (const t of nav.querySelectorAll(".tab")) {
    t.classList.toggle("is-on", t.dataset.view === view);
  }
}

// ---------------------------------------------------------------- tableau de bord

function renderDashboard() {
  setTab("dashboard");
  navShot.hidden = true;
  current.shot = null;

  const shots = [...data.shots];
  const versions = shots.reduce((n, s) => n + s.versionCount, 0);
  const runs = shots.reduce((n, s) => n + s.runCount, 0);

  const verdicts = { ok: 0, "à corriger": 0, échec: 0, autre: 0 };
  for (const s of shots) {
    for (const k of Object.keys(verdicts)) verdicts[k] += s.verdicts[k];
  }
  const totalVerdicts = Object.values(verdicts).reduce((a, b) => a + b, 0) || 1;
  const pct = (n) => (n / totalVerdicts) * 100;

  // Un run sur deux tentatives, c'est le coût réel d'une capture réussie.
  const attemptsPerOk = verdicts.ok ? runs / verdicts.ok : 0;

  const dated = shots.filter((s) => s.latest);
  const stalest = [...dated].sort((a, b) => b.latest.behind - a.latest.behind)[0];
  const busiest = [...shots].sort((a, b) => b.runCount - a.runCount)[0];
  const pendingCount = shots.filter((s) => s.pending).length;
  const totalBytes = shots.reduce((n, s) => n + s.totalBytes, 0);

  // Tous les viewports traversés, toutes captures confondues.
  const viewports = new Set();
  for (const s of shots) for (const v of s.viewports) viewports.add(v);

  main.innerHTML = "";

  main.append(
    el(`
    <section>
      <div class="tiles">
        <div class="tile">
          <div class="tile-value">${fmt.format(versions)}</div>
          <div class="tile-label">versions d'image en git</div>
          <div class="tile-note">${shots.length} captures · ${fmt.format(
            shots.reduce((n, s) => n + Object.keys(s.variants).length, 0),
          )} fichiers suivis</div>
        </div>
        <div class="tile">
          <div class="tile-value">${fmt.format(runs)}</div>
          <div class="tile-label">runs au journal</div>
          <div class="tile-note">${
            attemptsPerOk
              ? `${attemptsPerOk.toFixed(1)} tentative${attemptsPerOk >= 2 ? "s" : ""} par capture validée`
              : "aucun verdict ok"
          }</div>
        </div>
        <div class="tile">
          <div class="tile-value ${behindClass(stalest?.latest.behind ?? 0)}">${
            stalest ? fmt.format(stalest.latest.behind) : "—"
          }</div>
          <div class="tile-label">commits de retard, au pire</div>
          <div class="tile-note">${stalest ? esc(stalest.name) : "—"} · ${
            stalest ? ago(stalest.latest.date) : ""
          }</div>
        </div>
        <div class="tile">
          <div class="tile-value">${kb(totalBytes)}</div>
          <div class="tile-label">poids des captures actuelles</div>
          <div class="tile-note">${viewports.size} viewport${
            viewports.size > 1 ? "s" : ""
          } traversé${viewports.size > 1 ? "s" : ""} : ${[...viewports].join(", ") || "—"}</div>
        </div>
        ${
          pendingCount
            ? `<div class="tile">
                 <div class="tile-value" style="color:var(--pending)">${pendingCount}</div>
                 <div class="tile-label">captures en cours</div>
                 <div class="tile-note">modifiées, pas encore commitées</div>
               </div>`
            : ""
        }
      </div>
    </section>
  `),
  );

  main.append(
    el(`
    <section>
      <h2>Verdicts, tous runs confondus</h2>
      <div class="verdict-bar">
        <span class="v-ok" style="width:${pct(verdicts.ok)}%"></span>
        <span class="v-warn" style="width:${pct(verdicts["à corriger"])}%"></span>
        <span class="v-bad" style="width:${pct(verdicts.échec)}%"></span>
        <span class="v-other" style="width:${pct(verdicts.autre)}%"></span>
      </div>
      <div class="legend">
        <span><i class="v-ok"></i>ok — ${verdicts.ok} (${Math.round(pct(verdicts.ok))} %)</span>
        <span><i class="v-warn"></i>à corriger — ${verdicts["à corriger"]}</span>
        <span><i class="v-bad"></i>échec — ${verdicts.échec}</span>
        ${verdicts.autre ? `<span><i class="v-other"></i>autre — ${verdicts.autre}</span>` : ""}
        <span class="dim">${busiest ? `la plus retravaillée : ${esc(busiest.name)} (${busiest.runCount} runs)` : ""}</span>
      </div>
    </section>
  `),
  );

  // Le tableau, trié du plus périmé au plus frais : c'est l'ordre qui informe.
  const rows = [...shots].sort(
    (a, b) => (b.latest?.behind ?? 0) - (a.latest?.behind ?? 0),
  );

  const table = el(`
    <section>
      <h2>Captures</h2>
      <table class="table">
        <thead>
          <tr>
            <th></th>
            <th>Capture</th>
            <th class="num">Versions</th>
            <th class="num">Runs</th>
            <th>Dernière</th>
            <th class="num">Retard</th>
            <th class="num">Dernier écart</th>
            <th class="num">Format</th>
          </tr>
        </thead>
        <tbody></tbody>
      </table>
    </section>
  `);

  const tbody = table.querySelector("tbody");
  for (const s of rows) {
    const l = s.latest;
    const bars = (s.variants[s.referenceVariant]?.versions ?? [])
      .slice()
      .reverse()
      .map((v) => {
        const h = v.diff ? Math.min(22, 3 + v.diff.pct * 1.6) : 22;
        return `<i style="height:${h}px${v.pending ? ";background:var(--pending)" : ""}" title="${esc(
          dateFmt.format(new Date(v.date)),
        )}${v.diff ? ` — ${v.diff.pct} % de pixels changés` : " — version d'origine"}"></i>`;
      })
      .join("");

    const tr = el(`
      <tr data-shot="${esc(s.name)}">
        <td><img class="thumb" loading="lazy" src="${l ? `/blob/${l.blob}.png` : ""}" alt=""></td>
        <td>
          <div class="shot-name">${esc(s.name)} ${
            s.pending ? '<span class="badge badge-pending">en cours</span>' : ""
          }</div>
          <div class="spark">${bars}</div>
        </td>
        <td class="num">${s.versionCount}</td>
        <td class="num">${s.runCount}${
          s.verdicts.échec
            ? ` <span class="badge badge-bad">${s.verdicts.échec}</span>`
            : ""
        }</td>
        <td>${l ? esc(dateFmt.format(new Date(l.date))) : "—"}<br><span class="dim">${
          l ? ago(l.date) : ""
        }</span></td>
        <td class="num behind ${behindClass(l?.behind ?? 0)}">${
          l ? fmt.format(l.behind) : "—"
        }</td>
        <td class="num">${
          l?.diff ? `${l.diff.pct} %` : '<span class="dim">—</span>'
        }</td>
        <td class="num dim mono">${l ? `${l.width}×${l.height}` : "—"}<br>${
          l ? kb(l.bytes) : ""
        }</td>
      </tr>
    `);
    tr.addEventListener("click", () => {
      location.hash = `#${s.name}/${s.referenceVariant}`;
    });
    tbody.append(tr);
  }
  main.append(table);
}

// ---------------------------------------------------------------- détail

function renderShot(shot, variant) {
  setTab("shot");
  navShot.hidden = false;
  navShot.textContent = shot.name;

  const variants = Object.keys(shot.variants).sort();
  const active = variants.includes(variant) ? variant : variants[0];
  const versions = shot.variants[active].versions;

  const changed = current.shot !== shot.name || current.variant !== active;
  current.shot = shot.name;
  current.variant = active;

  // Par défaut on oppose les deux bouts de l'histoire : l'origine et l'état
  // du jour. C'est la comparaison qu'on veut voir en arrivant.
  if (changed || !versions.some((v) => v.blob === current.a)) {
    current.a = versions[versions.length - 1]?.blob ?? null;
    current.b = versions[0]?.blob ?? null;
    current.split = 50;
  }

  main.innerHTML = "";

  const head = el(`
    <div class="detail-head">
      <div class="detail-title">
        <h2>${esc(shot.name)}</h2>
        <span class="dim">${versions.length} version${versions.length > 1 ? "s" : ""} · ${
          shot.runCount
        } runs</span>
      </div>
      <div class="variant-tabs">
        ${variants
          .map(
            (v) =>
              `<button class="tab ${v === active ? "is-on" : ""}" data-variant="${v}">${v}</button>`,
          )
          .join("")}
      </div>
    </div>
  `);
  head.addEventListener("click", (e) => {
    const b = e.target.closest("[data-variant]");
    if (b) location.hash = `#${shot.name}/${b.dataset.variant}`;
  });
  main.append(head);

  const layout = el(`<div class="layout"></div>`);
  const rail = el(`
    <div class="rail">
      <div class="rail-head">Versions — cliquer pour placer A, maj+clic pour B</div>
    </div>
  `);

  for (const v of versions) {
    const row = el(`
      <div class="version" data-blob="${v.blob}">
        <div class="pick">
          <span class="pick-a ${v.blob === current.a ? "on-a" : ""}">A</span>
          <span class="pick-b ${v.blob === current.b ? "on-b" : ""}">B</span>
        </div>
        <div>
          <div class="version-date">${esc(dateFmt.format(new Date(v.date)))} ${
            v.pending ? '<span class="badge badge-pending">en cours</span>' : ""
          }</div>
          <div class="version-sub" title="${esc(v.subject)}">${esc(v.subject)}</div>
          <div class="version-meta">
            ${
              v.diff
                ? `<span title="pixels changés depuis la version précédente">Δ ${v.diff.pct} %${
                    v.diff.aspectChanged ? " ⚠︎" : ""
                  }</span>`
                : '<span class="dim">origine</span>'
            }
            <span class="mono dim">${v.width}×${v.height}</span>
            <span class="dim">${kb(v.bytes)}</span>
            ${v.sha ? `<span class="mono dim">${v.sha.slice(0, 7)}</span>` : ""}
            ${v.sha ? `<span class="${behindClass(v.behind)}">${fmt.format(v.behind)} c.</span>` : ""}
          </div>
        </div>
      </div>
    `);
    row.addEventListener("click", (e) => {
      if (e.shiftKey) current.b = v.blob;
      else current.a = v.blob;
      renderShot(shot, active);
    });
    rail.append(row);
  }

  layout.append(rail);
  layout.append(buildCurtain(versions));
  main.append(layout);

  if (shot.runs.length) main.append(buildRunLog(shot));
}

// ---------------------------------------------------------------- rideau

function buildCurtain(versions) {
  const a = versions.find((v) => v.blob === current.a);
  const b = versions.find((v) => v.blob === current.b);

  if (!a || !b) {
    return el(`<div class="stage"><p class="empty">Choisir deux versions à comparer.</p></div>`);
  }

  const pair = versions.indexOf(a) > versions.indexOf(b) ? [a, b] : [b, a];
  const older = pair[0];
  const newer = pair[1];
  const sameBlob = a.blob === b.blob;

  // Le pourcentage cumulé entre A et B, quand elles ne se touchent pas.
  const from = Math.min(versions.indexOf(a), versions.indexOf(b));
  const to = Math.max(versions.indexOf(a), versions.indexOf(b));
  const steps = versions.slice(from, to).filter((v) => v.diff);

  const stage = el(`
    <div class="stage">
      <div class="stage-bar">
        <span class="stage-side side-a"><i></i>A — ${esc(dateFmt.format(new Date(a.date)))}${
          a.pending ? " (en cours)" : ""
        }</span>
        <span class="dim">${
          sameBlob
            ? "même image des deux côtés"
            : `${esc(dateFmt.format(new Date(older.date)))} → ${esc(
                dateFmt.format(new Date(newer.date)),
              )}`
        }</span>
        <span class="stage-side side-b"><i></i>B — ${esc(dateFmt.format(new Date(b.date)))}${
          b.pending ? " (en cours)" : ""
        }</span>
      </div>
      <div class="curtain">
        <img class="base" src="/blob/${b.blob}.png" alt="version B">
        <div class="over"><img src="/blob/${a.blob}.png" alt="version A"></div>
        <div class="handle"></div>
      </div>
      <div class="stage-foot">
        ${
          sameBlob
            ? "Sélectionner une autre version pour comparer."
            : steps.length
              ? `${steps.length} pas d'écart · ${steps
                  .map((s) => `${s.diff.pct} %`)
                  .join(" + ")}${
                  a.width !== b.width || a.height !== b.height
                    ? ` · <strong>le cadrage a changé</strong> (${a.width}×${a.height} → ${b.width}×${b.height}) — le rideau étire l'image, l'écart en pixels n'est pas comparable`
                    : ""
                }`
              : "Versions adjacentes."
        }
        <span class="dim"> · glisser, ou ← → au clavier</span>
      </div>
    </div>
  `);

  const curtain = stage.querySelector(".curtain");
  const over = stage.querySelector(".over");
  const handle = stage.querySelector(".handle");

  const apply = (x) => {
    current.split = Math.max(0, Math.min(100, x));
    over.style.clipPath = `inset(0 ${100 - current.split}% 0 0)`;
    handle.style.left = `${current.split}%`;
  };
  apply(current.split);

  const fromEvent = (e) => {
    const r = curtain.getBoundingClientRect();
    apply(((e.clientX - r.left) / r.width) * 100);
  };

  // Le suivi vit sur window, pas sur le rideau : une capture de pointeur
  // lâche dès que le curseur sort de l'image, et le glissement s'arrête net.
  const onMove = (e) => {
    e.preventDefault();
    fromEvent(e);
  };
  const onUp = () => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
  };
  curtain.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    fromEvent(e);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  });

  // Survol simple : on suit le curseur sans avoir à maintenir le bouton.
  curtain.addEventListener("mousemove", (e) => {
    if (e.buttons === 0 && e.shiftKey) fromEvent(e);
  });

  window.addEventListener("keydown", (e) => {
    if (!document.body.contains(curtain)) return;
    if (e.key === "ArrowLeft") apply(current.split - (e.shiftKey ? 10 : 2));
    else if (e.key === "ArrowRight") apply(current.split + (e.shiftKey ? 10 : 2));
    else return;
    e.preventDefault();
  });

  return stage;
}

// ---------------------------------------------------------------- journal

function buildRunLog(shot) {
  const badge = (verdict) => {
    const v = (verdict ?? "").toLowerCase();
    if (v === "ok") return `<span class="badge badge-ok">ok</span>`;
    if (v.startsWith("échec") || v.startsWith("echec"))
      return `<span class="badge badge-bad">échec</span>`;
    if (v.startsWith("à corriger") || v.startsWith("a corriger"))
      return `<span class="badge badge-warn">à corriger</span>`;
    return `<span class="badge">${esc(verdict ?? "—")}</span>`;
  };

  const box = el(`
    <div class="runs">
      <div class="rail-head">Journal des runs — history.jsonl (${shot.runs.length})</div>
    </div>
  `);

  for (const run of [...shot.runs].reverse()) {
    box.append(
      el(`
      <div class="run">
        <div>${esc(run.date ?? "—")}</div>
        <div>${badge(run.verdict)}</div>
        <div>
          <div class="run-note">${esc(run.note ?? "")}</div>
          <span class="run-target">${esc(run.target ?? "")}${
            run.viewport ? ` · ${esc(run.viewport)}` : ""
          }${run.commit ? ` · ${esc(run.commit)}` : ""}</span>
        </div>
      </div>
    `),
    );
  }
  return box;
}

load();
