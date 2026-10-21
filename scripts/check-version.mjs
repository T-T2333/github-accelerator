// 校验版本号的一致性与合法性：
//   1. manifest.json 的 version 存在且是合法的 x.y.z
//   2. package.json 的 version 与之完全相同
//
// 供 CI 使用，防止人工只改了其中一个文件，导致 EchoMusic 读到的版本
// 与仓库里的实际状态对不上。
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SEMVER = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/;

const readJson = async (file) =>
  JSON.parse(await readFile(path.join(ROOT, file), "utf8"));

const main = async () => {
  const manifest = await readJson("manifest.json");
  const pkg = await readJson("package.json");
  const manifestVersion = String(manifest.version ?? "").trim();
  const packageVersion = String(pkg.version ?? "").trim();

  const problems = [];
  if (!manifestVersion) {
    problems.push("manifest.json 缺少 version");
  } else if (!SEMVER.test(manifestVersion)) {
    problems.push(`manifest.json 的 version 不是合法版本号：${manifestVersion}`);
  }
  if (!packageVersion) {
    problems.push("package.json 缺少 version");
  } else if (packageVersion !== manifestVersion) {
    problems.push(
      `版本号不一致：manifest.json=${manifestVersion} / package.json=${packageVersion}`,
    );
  }

  if (problems.length) {
    for (const problem of problems) console.error(`✗ ${problem}`);
    process.exitCode = 1;
    return;
  }

  console.log(`版本一致：${manifestVersion}`);
};

main().catch((error) => {
  console.error(`版本校验失败：${error.message}`);
  process.exitCode = 1;
});
