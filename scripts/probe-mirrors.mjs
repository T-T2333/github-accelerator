const MIRRORS = process.argv[2]
  ? [process.argv[2]]
  : (await import("../mirrors.generated.json", { with: { type: "json" } })).default.mirrors.map(
      (m) => m.base,
    );

const LATENCY_TARGET =
  "https://raw.githubusercontent.com/hoowhoami/EchoMusic/main/package.json";
const THROUGHPUT_TARGET =
  "https://github.com/XIU2/UserScript/archive/refs/heads/master.zip";

const probe = async (base) => {
  const out = {
    base,
    alive: false,
    latencyMs: null,
    throughputMbps: null,
    cors: null,
    error: "",
  };
  try {
    const t0 = performance.now();
    const res = await fetch(`${base}/${LATENCY_TARGET}`, {
      signal: AbortSignal.timeout(12000),
      redirect: "follow",
    });
    out.latencyMs = Math.round(performance.now() - t0);
    out.cors = res.headers.get("access-control-allow-origin");
    out.status = res.status;
    out.alive = res.ok;
    if (!res.ok) {
      out.error = `HTTP ${res.status}`;
      return out;
    }
    await res.arrayBuffer();
  } catch (error) {
    out.error = error.name === "TimeoutError" ? "timeout" : error.message;
    return out;
  }

  try {
    const t0 = performance.now();
    const res = await fetch(`${base}/${THROUGHPUT_TARGET}`, {
      signal: AbortSignal.timeout(20000),
      redirect: "follow",
    });
    if (!res.ok) {
      out.error = `throughput HTTP ${res.status}`;
      return out;
    }
    const bytes = (await res.arrayBuffer()).byteLength;
    const seconds = (performance.now() - t0) / 1000;
    out.throughputMbps = +((bytes * 8) / seconds / 1e6).toFixed(2);
  } catch {
    out.throughputMbps = null;
  }
  return out;
};

const runPool = async (items, limit, worker) => {
  const results = [];
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index]);
    }
  });
  await Promise.all(runners);
  return results;
};

const results = await runPool(MIRRORS, 4, probe);
const alive = results.filter((r) => r.alive);
const failed = results.filter((r) => !r.alive);

for (const r of alive.sort((a, b) => b.throughputMbps - a.throughputMbps)) {
  console.log(
    `OK   ${String(r.latencyMs).padStart(5)}ms  ${String(r.throughputMbps ?? "-").padStart(6)} Mbps  ${r.cors === "*" ? "cors*" : "cors-"}  ${r.base}`,
  );
}
for (const r of failed) {
  console.log(`DEAD ${String(r.latencyMs ?? "-").padStart(5)}ms  ${"-".padStart(9)}      ${"-".padStart(5)}  ${r.base}  ${r.error}`);
}

console.log(`\nalive ${alive.length}/${results.length}`);
if (failed.length) {
  console.log("\n如需下线失效源，请将其 origin 加入 mirrors.overrides.json 的 exclude 数组。");
}
