import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const UPSTREAM_SOURCES = [
  {
    kind: "github-api",
    url: "https://api.github.com/repos/XIU2/UserScript/contents/GithubEnhanced-High-Speed-Download.user.js",
  },
  {
    kind: "raw",
    url: "https://raw.githubusercontent.com/XIU2/UserScript/main/GithubEnhanced-High-Speed-Download.user.js",
  },
  {
    kind: "raw",
    url: "https://update.greasyfork.org/scripts/412245/Github%20%E5%A2%9E%E5%BC%BA%20-%20%E9%AB%98%E9%80%9F%E4%B8%8B%E8%BD%BD.user.js",
  },
];
const UPSTREAM_PAGE = "https://github.com/XIU2/UserScript";

const INDEX_FILE = path.join(ROOT, "index.js");
const GENERATED_FILE = path.join(ROOT, "mirrors.generated.json");
const OVERRIDES_FILE = path.join(ROOT, "mirrors.overrides.json");

const START = "// MIRRORS:BEGIN";
const END = "// MIRRORS:END";

const fetchText = async (url) => {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(30000),
    headers: { "User-Agent": "EchoMusic-GithubAccelerator-Sync/1.0" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  return res.text();
};

const fetchUpstream = async () => {
  const errors = [];
  for (const { kind, url } of UPSTREAM_SOURCES) {
    try {
      let source;
      if (kind === "github-api") {
        const res = await fetch(url, {
          signal: AbortSignal.timeout(30000),
          headers: {
            Accept: "application/vnd.github.raw",
            "User-Agent": "EchoMusic-GithubAccelerator-Sync/1.0",
          },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
        source = await res.text();
      } else {
        source = await fetchText(url);
      }
      if (!source.includes("download_url_us")) {
        throw new Error("内容不含 download_url_us，可能不是目标脚本");
      }
      return { source, url };
    } catch (error) {
      errors.push(`${url}: ${error.message}`);
    }
  }
  throw new Error(`所有上游源均不可用\n  ${errors.join("\n  ")}`);
};

const parseVersion = (source) =>
  (source.match(/@version\s+([\S]+)/) || [])[1] || "unknown";

const extractArrays = (source) => {
  const arrays = {};
  const re = /const\s+(\w+)\s*=\s*\[([\s\S]*?)\n\s*\],/g;
  let match;
  while ((match = re.exec(source))) {
    const [, name, body] = match;
    const entries = [];
    // 上游用 // 注释掉已失效的加速源，必须逐行判定，避免同步时重新引入死链
    const entryRe = /\[\s*(['"])(https?:\/\/[^'"]+)\1\s*,\s*(['"])(.*?)\3\s*,\s*(['"])([\s\S]*?)\5\s*(?:,\s*(['"])([\s\S]*?)\7\s*)?\]/g;
    let item;
    while ((item = entryRe.exec(body))) {
      const lineStart = body.lastIndexOf("\n", item.index) + 1;
      const linePrefix = body.slice(lineStart, item.index);
      if (/^\s*\/\//.test(linePrefix)) continue;
      entries.push({
        url: item[2],
        region: item[4],
        note: item[6],
        rawOnly: Boolean(item[8] && item[8] !== ""),
      });
    }
    if (entries.length) arrays[name] = entries;
  }
  return arrays;
};

// EchoMusic 以 `${accelerator}/${原始URL}` 拼接。
// 上游条目是「已代理后的完整地址」，形如 https://gh-proxy.org/https://github.com，
// 取其 origin 作为加速源即可。
// 而 https://cors.isteed.cc/github.com 这类把 github.com 写进路径的镜像无法兼容（会被拼成
// https://cors.isteed.cc/https://github.com/...），必须排除。
const toBase = (url) => {
  try {
    const parsed = new URL(url.trim());
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return "";
  }
};

const isCompatible = (url) => {
  let parsed;
  try {
    parsed = new URL(url.trim());
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
  const path = parsed.pathname;
  const pathIsFullUrlPrefix = /^\/(https?:)?\/\//i.test(path);
  const pathIsEmpty = path === "" || path === "/";
  if (!pathIsEmpty && !pathIsFullUrlPrefix) return false;
  if (/github\.com|githubusercontent\.com|githubfast|gitclone/i.test(parsed.hostname))
    return false;
  return true;
};

const normalizeNote = (note) =>
  note
    .replace(/&#10;&#10;[\s\S]*$/, "")
    .replace(/\s+/g, " ")
    .trim();

const buildMirrors = (arrays, overrides) => {
  const collected = new Map();

  const add = (entry, origin) => {
    if (!isCompatible(entry.url)) return;
    const base = toBase(entry.url);
    if (!base) return;
    if (overrides.exclude?.includes(base)) return;
    const existing = collected.get(base);
    const note = normalizeNote(entry.note);
    if (existing) {
      existing.origin.push(origin);
      if (!existing.note && note) existing.note = note;
      return;
    }
    collected.set(base, {
      base,
      region: entry.region || "其他",
      note,
      provider: overrides.providers?.[base] || "",
      origins: [origin],
    });
  };

  for (const [name, entries] of Object.entries(arrays)) {
    for (const entry of entries) add(entry, name);
  }

  for (const base of overrides.extra || []) {
    if (overrides.exclude?.includes(base) || collected.has(base)) continue;
    collected.set(base, {
      base,
      region: overrides.regions?.[base] || "其他",
      note: overrides.notes?.[base] || "由本插件维护的额外加速源",
      provider: overrides.providers?.[base] || "",
      origins: ["extra"],
    });
  }

  const regionOrder = ["美国", "香港", "韩国", "日本", "法国", "国内", "其他"];
  return [...collected.values()]
    .map((item) => ({
      ...item,
      origins: item.origins.join(","),
      note: [item.note, item.provider].filter(Boolean).join(" "),
    }))
    .sort((a, b) => {
      const ra = regionOrder.indexOf(a.region);
      const rb = regionOrder.indexOf(b.region);
      if (ra !== rb) return (ra < 0 ? 99 : ra) - (rb < 0 ? 99 : rb);
      return a.base.localeCompare(b.base);
    });
};

const renderBlock = (mirrors, upstream) => {
  const rows = mirrors.map((m) => {
    const note = m.note.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    return `  { base: "${m.base}", region: "${m.region}", note: "${note}" },`;
  });
  return [
    START,
    `// 由 scripts/sync-mirrors.mjs 自动生成，请勿手动编辑。`,
    `// 数据来源：${UPSTREAM_PAGE}`,
    `// 上游脚本版本：${upstream.version}`,
    `// 上游数组：${upstream.arrays.join(", ")}`,
    `// 重新生成：npm run sync:mirrors`,
    "const MIRRORS = [",
    ...rows,
    "];",
    END,
  ].join("\n");
};

const main = async () => {
  const checkOnly = process.argv.includes("--check");
  const { source, url: upstreamUrl } = await fetchUpstream();
  const version = parseVersion(source);
  const arrays = extractArrays(source);
  const overrides = JSON.parse(await readFile(OVERRIDES_FILE, "utf8"));
  const mirrors = buildMirrors(arrays, overrides);

  if (!mirrors.length) throw new Error("未解析到任何兼容加速源");

  const indexSource = await readFile(INDEX_FILE, "utf8");
  const start = indexSource.indexOf(START);
  const end = indexSource.indexOf(END);
  if (start < 0 || end < 0) throw new Error("index.js 缺少 MIRRORS 标记");

  const block = renderBlock(mirrors, {
    version,
    arrays: Object.keys(arrays),
  });
  const nextSource =
    indexSource.slice(0, start) + block + indexSource.slice(end + END.length);
  const nextPayload = {
    upstream: {
      url: upstreamUrl,
      page: UPSTREAM_PAGE,
      version,
      arrays: Object.keys(arrays),
    },
    count: mirrors.length,
    mirrors,
  };
  const nextGenerated = `${JSON.stringify(
    { generatedAt: new Date().toISOString(), ...nextPayload },
    null,
    2,
  )}\n`;

  // 比较时忽略 generatedAt，否则每次运行都会判定为有变化
  const currentGenerated = await readFile(GENERATED_FILE, "utf8").catch(() => "");
  const stripTimestamp = (text) => {
    if (!text) return "";
    try {
      const { generatedAt, ...rest } = JSON.parse(text);
      return JSON.stringify(rest);
    } catch {
      return text;
    }
  };
  const changed = stripTimestamp(currentGenerated) !== JSON.stringify(nextPayload);
  if (checkOnly) {
    console.log(
      changed ? "CHANGED" : "UPSTREAM_UP_TO_DATE",
      `upstream=${version} mirrors=${mirrors.length}`,
    );
    process.exitCode = changed ? 1 : 0;
    return;
  }

  if (changed) {
    await writeFile(INDEX_FILE, nextSource, "utf8");
    await writeFile(GENERATED_FILE, nextGenerated, "utf8");
    console.log(`已更新 ${mirrors.length} 个加速源（上游版本 ${version}）`);
    for (const mirror of mirrors) {
      console.log(`  ${mirror.base} [${mirror.region}] <- ${mirror.origins}`);
    }
  } else {
    console.log(`无需更新，上游版本 ${version}，共 ${mirrors.length} 个加速源`);
  }
};

main().catch((error) => {
  console.error(`同步失败：${error.message}`);
  process.exitCode = 1;
});
