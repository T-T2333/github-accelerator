// 版本号真源是 manifest.json —— EchoMusic 的插件市场正是从这里读取版本号，
// 并与用户已安装的版本做 semver 比较来决定是否提示「可更新」。
// package.json 的 version 由本脚本镜像同步，两者必须始终一致。
//
// 用法：node scripts/bump-version.mjs [patch|minor|major] [--from-worktree]
//
// 基准版本的选择规则（避免脚本覆盖人工改动）：
//   1. 工作区版本 == 已提交版本（干净工作区，CI 的常态）→ 以已提交版本为基准递增
//   2. 工作区版本 == 已提交版本 + patch → 说明是上一次脚本自己升出来、还没提交的，
//      保持同一版本不变（重跑幂等，不会连跳成 1.1.3）
//   3. 其他不一致（人工改成了 2.0.0、1.2.0-beta.1 等）→ 直接报错中止，
//      绝不覆盖人工改动；确需在当前版本上递增时显式加 --from-worktree
//   4. 非 git 环境（读不到已提交版本）→ 以工作区版本为基准
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

// 读取 HEAD 上已提交的 manifest.json，读不到就返回空串
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
  const args = process.argv.slice(2);
  const fromWorktree = args.includes("--from-worktree");
  const kindArg = args.find((arg) => KINDS.includes(arg));
  const unknown = args.filter((arg) => !KINDS.includes(arg) && arg !== "--from-worktree");
  if (unknown.length) {
    throw new Error(
      `未知参数：${unknown.join(" ")}（版本类型可选 ${KINDS.join(" | ")}，另有 --from-worktree）`,
    );
  }
  const kind = kindArg ?? "patch";

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
  let next;
  let basis;

  if (fromWorktree || !committed) {
    next = nextVersion(current, kind);
    basis = fromWorktree ? "工作区版本" : "工作区版本（非 git 环境）";
  } else if (current === committed) {
    next = nextVersion(committed, kind);
    basis = `已提交版本 ${committed}`;
  } else if (kind === "patch" && current === nextVersion(committed, "patch")) {
    // 上一次脚本自己升出来的 patch、还没提交：保持同一版本
    next = current;
    basis = `已提交版本 ${committed}（工作区已是 ${current}，判定为脚本上次自动递增，保持不变）`;
  } else {
    throw new Error(
      `工作区版本 ${current} 与已提交版本 ${committed} 不一致，且不是脚本自动递增出来的 patch 版本。\n` +
        `为避免覆盖你的改动，本次不做任何修改。\n` +
        `  · 想保留 ${current}：直接提交 manifest.json 与 package.json 即可\n` +
        `  · 想在 ${current} 上继续递增：加 --from-worktree 参数`,
    );
  }

  if (next !== current) {
    manifest.version = next;
    pkg.version = next;
    await writeFile(MANIFEST_FILE, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    await writeFile(PACKAGE_FILE, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");
  }

  console.log(
    `版本 ${current} → ${next}（基准：${basis}）`,
  );

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
