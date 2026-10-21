// 版本号真源是 manifest.json —— EchoMusic 的插件市场正是从这里读取版本号，
// 并与用户已安装的版本做 semver 比较来决定是否提示「可更新」。
// package.json 的 version 由本脚本镜像同步，两者必须始终一致。
//
// 用法：node scripts/bump-version.mjs [patch|minor|major]
//
// 幂等：以「git 里已提交的版本」为基准 +1，而不是以工作区文件为基准。
// 因此推送失败后重跑（工作区里已经是升过的版本）仍得到同一个版本号，
// 不会连跳成 1.1.3。非 git 环境（或读不到提交）时退回以工作区文件为基准。
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";

const execFileAsync = promisify(execFile);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST_FILE = path.join(ROOT, "manifest.json");
const PACKAGE_FILE = path.join(ROOT, "package.json");
const KINDS = ["patch", "minor", "major"];

const parseVersion = (value) => {
  const matched = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(value ?? "").trim());
  if (!matched) return null;
  return matched.slice(1, 4).map(Number);
};

const nextVersion = (version, kind) => {
  const parsed = parseVersion(version);
  if (!parsed) {
    throw new Error(`版本号不是 x.y.z 形式，无法自动递增：${version}`);
  }
  const [major, minor, patch] = parsed;
  if (kind === "major") return `${major + 1}.0.0`;
  if (kind === "minor") return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
};

const readJson = async (file) => JSON.parse(await readFile(file, "utf8"));

// 读取 HEAD 上已提交的 manifest.json，读不到就返回 null
const readCommittedVersion = async () => {
  try {
    const { stdout } = await execFileAsync("git", ["show", "HEAD:manifest.json"], {
      cwd: ROOT,
    });
    const committed = JSON.parse(stdout);
    return String(committed.version ?? "").trim();
  } catch {
    return "";
  }
};

const main = async () => {
  const kind = process.argv[2] ?? "patch";
  if (!KINDS.includes(kind)) {
    throw new Error(`未知的版本类型：${kind}（可选 ${KINDS.join(" | ")}）`);
  }

  const manifest = await readJson(MANIFEST_FILE);
  const pkg = await readJson(PACKAGE_FILE);
  const current = String(manifest.version ?? "").trim();
  const packageVersion = String(pkg.version ?? "").trim();

  if (packageVersion !== current) {
    throw new Error(
      `manifest.json(${current}) 与 package.json(${packageVersion}) 的版本号不一致，请先人工修正`,
    );
  }

  const committed = await readCommittedVersion();
  const base = committed || current;
  const next = nextVersion(base, kind);

  if (next !== current) {
    manifest.version = next;
    pkg.version = next;
    await writeFile(MANIFEST_FILE, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    await writeFile(PACKAGE_FILE, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");
  }

  console.log(`版本 ${current} → ${next}${committed ? `（基准：已提交版本 ${committed}）` : ""}`);

  if (process.env.GITHUB_OUTPUT) {
    await writeFile(
      process.env.GITHUB_OUTPUT,
      `version=${next}\noldVersion=${current}\n`,
      { flag: "a" },
    );
  }
};

main().catch((error) => {
  console.error(`升版本失败：${error.message}`);
  process.exitCode = 1;
});
