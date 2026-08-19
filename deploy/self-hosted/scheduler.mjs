const JOBS = [
  ["0 * * * *", "/api/cron/feedback-analysis"],
  ["*/2 * * * *", "/api/cron/agent-drain"],
  ["*/2 * * * *", "/api/cron/automations"],
  ["*/5 * * * *", "/api/cron/smart-assign"],
  ["*/5 * * * *", "/api/cron/routines"],
  ["15 * * * *", "/api/cron/billing-sync"],
  ["30 15 * * *", "/api/cron/fx-rate"],
  ["45 3 * * *", "/api/cron/data-retention"],
];

const secret = process.env.CRON_SECRET;
const baseUrl = process.env.MINDDY_SCHEDULER_URL ?? "http://minddy:3000";

if (!secret || secret.length < 32) {
  throw new Error("CRON_SECRET must contain at least 32 characters when scheduled jobs are enabled.");
}

function matchesField(expression, value) {
  if (expression === "*") return true;
  if (expression.startsWith("*/")) return value % Number(expression.slice(2)) === 0;
  return expression.split(",").some((part) => Number(part) === value);
}

function matchesSchedule(schedule, now) {
  const [minute, hour, dayOfMonth, month, dayOfWeek] = schedule.split(" ");
  return [
    matchesField(minute, now.getUTCMinutes()),
    matchesField(hour, now.getUTCHours()),
    matchesField(dayOfMonth, now.getUTCDate()),
    matchesField(month, now.getUTCMonth() + 1),
    matchesField(dayOfWeek, now.getUTCDay()),
  ].every(Boolean);
}

async function run(path) {
  const response = await fetch(new URL(path, baseUrl), {
    headers: { Authorization: `Bearer ${secret}` },
    signal: AbortSignal.timeout(30_000),
  });
  console.log(`${new Date().toISOString()} ${path} ${response.status}`);
}

async function tick() {
  const now = new Date();
  await Promise.allSettled(JOBS.filter(([schedule]) => matchesSchedule(schedule, now)).map(([, path]) => run(path)));
}

const initialDelay = 60_000 - (Date.now() % 60_000);
setTimeout(() => {
  void tick();
  setInterval(() => void tick(), 60_000);
}, initialDelay);
