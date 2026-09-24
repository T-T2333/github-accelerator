// 本地集成测试：用最小 ctx 模拟宿主，验证 activate / 应用 / 回读校验 / 命令 / 卸载全流程
// 仅通过插件公开入口（activate、deactivate、ctx.commands 注册的处理器）驱动，不依赖内部实现
import { readFileSync } from "node:fs";

const loadPlugin = async () => {
  const source = readFileSync(new URL("../index.js", import.meta.url), "utf8");
  return import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
};

const createCtx = (initialStore = {}) => {
  const calls = { toasts: [], commands: new Map(), settings: [], css: [] };
  const store = { githubProxyUrl: "", ...initialStore };
  const storage = new Map();
  const h = () => () => null;

  const ctx = {
    manifest: { name: "GitHub 加速源" },
    vue: {
      defineComponent: (opts) => opts,
      defineAsyncComponent: () => h(),
      reactive: (obj) => obj,
      h,
      watch: () => () => {},
    },
    ui: {
      components: new Proxy({}, { get: () => h() }),
      settings: { define: (o) => (calls.settings.push(o), () => {}) },
    },
    settings: store,
    storage: {
      get: async (k) => storage.get(k) ?? null,
      set: async (k, v) => storage.set(k, v),
      delete: async (k) => storage.delete(k),
    },
    css: { inject: (css, o) => (calls.css.push(o), () => {}) },
    commands: {
      register: (id, fn, o) => (calls.commands.set(id, { fn, o }), () => {}),
    },
    toast: {
      info: (t) => calls.toasts.push(["info", t]),
      success: (t) => calls.toasts.push(["success", t]),
      warning: (t) => calls.toasts.push(["warning", t]),
      danger: (t) => calls.toasts.push(["danger", t]),
    },
    net: { fetch: (...args) => fetch(...args) },
  };
  return { ctx, calls, store, storage };
};

let failed = 0;
const check = (name, cond, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? ` -> ${extra}` : ""}`);
  if (!cond) failed++;
};

const runCommand = async (calls, id) => {
  const entry = calls.commands.get(id);
  if (!entry) throw new Error(`命令未注册: ${id}`);
  await entry.fn();
};

// --- 场景 1：正常启用 ---
{
  const mod = await loadPlugin();
  const { ctx, calls } = createCtx();
  await mod.activate(ctx);

  check("注册设置面板", calls.settings.length === 1, calls.settings[0]?.title);
  check("注入面板样式", calls.css.length === 1, calls.css[0]?.id);
  check(
    "注册 3 个命令",
    ["apply-selected", "speed-test", "check-updates"].every((id) =>
      calls.commands.has(id),
    ),
    [...calls.commands.keys()].join(", "),
  );
  check(
    "启用提示",
    calls.toasts.some(([lvl, t]) => lvl === "success" && t.includes("已启用")),
  );
  check("设置面板可渲染", typeof calls.settings[0]?.component?.setup === "function");

  await mod.deactivate(ctx);
  check("deactivate 不抛错", true);
}

// --- 场景 2：应用合法加速源（含尾斜杠归一化） ---
{
  const mod = await loadPlugin();
  const { ctx, calls, store } = createCtx();
  await ctx.storage.set("settings", {
    autoApply: false,
    selectedBase: "https://gh-proxy.org/",
    customBase: "",
  });
  await mod.activate(ctx);
  await runCommand(calls, "apply-selected");
  check(
    "应用加速源并去除尾斜杠",
    store.githubProxyUrl === "https://gh-proxy.org",
    store.githubProxyUrl,
  );
  check("应用成功提示", calls.toasts.some(([lvl]) => lvl === "success"));
  await mod.deactivate(ctx);
}

// --- 场景 3：非法地址应被拒绝且不写入宿主 ---
{
  const mod = await loadPlugin();
  const { ctx, calls, store } = createCtx();
  await ctx.storage.set("settings", {
    autoApply: false,
    selectedBase: "not-a-url",
    customBase: "",
  });
  await mod.activate(ctx);
  await runCommand(calls, "apply-selected");
  check("非法地址不写入宿主", store.githubProxyUrl === "", store.githubProxyUrl);
  check("非法地址给出警告", calls.toasts.some(([lvl]) => lvl === "warning"));
  await mod.deactivate(ctx);
}

// --- 场景 4：回读校验——宿主拒写时应报错 ---
{
  const mod = await loadPlugin();
  const { ctx, calls } = createCtx();
  await ctx.storage.set("settings", {
    autoApply: false,
    selectedBase: "https://gh-proxy.org",
    customBase: "",
  });
  Object.defineProperty(ctx.settings, "githubProxyUrl", {
    get: () => "",
    set: () => {},
    configurable: true,
  });
  await mod.activate(ctx);
  await runCommand(calls, "apply-selected");
  check(
    "宿主拒写时提示错误",
    calls.toasts.some(([lvl, t]) => lvl === "danger" && t.includes("宿主未接受")),
  );
  await mod.deactivate(ctx);
}

// --- 场景 5：autoApply 启动时自动应用 ---
{
  const mod = await loadPlugin();
  const { ctx, store } = createCtx();
  await ctx.storage.set("settings", {
    autoApply: true,
    selectedBase: "https://wget.la",
    customBase: "",
  });
  await mod.activate(ctx);
  check("启动时自动应用", store.githubProxyUrl === "https://wget.la", store.githubProxyUrl);
  await mod.deactivate(ctx);
}

console.log(failed ? `\n${failed} 项失败` : "\n全部通过");
process.exitCode = failed ? 1 : 0;
