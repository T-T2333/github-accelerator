// GitHub 加速源 - EchoMusic 插件
// Copyright (C) 2026 T-T2333
//
// 基于 X.I.U (XIU2) 的 Github Enhancement - High Speed Download 移植
// 原脚本: https://github.com/XIU2/UserScript (GPL-3.0)
// 本文件为衍生作品，按 GPL-3.0 授权，详见 LICENSE / NOTICE。
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

const STORAGE_KEY = "settings";
const RESULT_KEY = "speed-test";
const RESULT_TTL_MS = 30 * 60 * 1000;
const TEST_CONCURRENCY = 4;
const TEST_TIMEOUT_MS = 12000;

const TEST_PATH =
  "https://raw.githubusercontent.com/hoowhoami/EchoMusic/main/package.json";

const DEFAULT_SETTINGS = {
  autoApply: false,
  selectedBase: "",
  customBase: "",
};

// 仅收录与 EchoMusic「${加速源}/${原始URL}」拼接格式兼容的公益加速源
// 原始列表来自 XIU2 Github Enhancement 脚本（https://github.com/XIU2/UserScript）
// MIRRORS:BEGIN
// 由 scripts/sync-mirrors.mjs 自动生成，请勿手动编辑。
// 数据来源：https://github.com/XIU2/UserScript
// 上游脚本版本：2.6.41
// 上游数组：download_url_us
// 重新生成：npm run sync:mirrors
const MIRRORS = [
  { base: "https://cdn.crashmc.com", region: "美国", note: "[美国 Cloudflare CDN] - 该公益加速源由 [cdn.crashmc.com] 提供" },
  { base: "https://gh-proxy.org", region: "美国", note: "[美国 Cloudflare CDN] - 该公益加速源由 [gh-proxy.com] 提供" },
  { base: "https://gh.chjina.com", region: "美国", note: "[美国 Cloudflare CDN] - 该公益加速源由 [gh.chjina.com] 提供" },
  { base: "https://gh.ddlc.top", region: "美国", note: "[美国 Cloudflare CDN] - 该公益加速源由 [@mtr-static-official] 提供" },
  { base: "https://gh.idayer.com", region: "美国", note: "[美国 Cloudflare CDN] - 该公益加速源由 [gh.idayer.com] 提供" },
  { base: "https://gh.monlor.com", region: "美国", note: "[美国 Cloudflare CDN] - 该公益加速源由 [gh.monlor.com] 提供" },
  { base: "https://gh.xxooo.cf", region: "美国", note: "[美国 Cloudflare CDN] - 该公益加速源由 [gh.xxooo.cf] 提供" },
  { base: "https://gh.zwy.one", region: "美国", note: "[美国 洛杉矶] - 该公益加速源由 [gh.zwy.one] 提供" },
  { base: "https://ghfile.geekertao.top", region: "美国", note: "[美国 Cloudflare CDN] - 该公益加速源由 [ghfile.geekertao.top] 提供" },
  { base: "https://ghproxy.cxkpro.top", region: "美国", note: "[美国 Cloudflare CDN] - 该公益加速源由 [ghproxy.cxkpro.top] 提供" },
  { base: "https://ghpxy.hwinzniej.top", region: "美国", note: "[美国 Cloudflare CDN] - 该公益加速源由 [ghpxy.hwinzniej.top] 提供" },
  { base: "https://git.yylx.win", region: "美国", note: "[美国 Cloudflare CDN] - 该公益加速源由 [git.yylx.win] 提供" },
  { base: "https://github.boki.moe", region: "美国", note: "[美国 Cloudflare CDN] - 该公益加速源由 [blog.boki.moe] 提供" },
  { base: "https://github.ednovas.xyz", region: "美国", note: "[美国 Cloudflare CDN] - 该公益加速源由 [github.ednovas.xyz] 提供" },
  { base: "https://github.geekery.cn", region: "美国", note: "[美国 Cloudflare CDN] - 该公益加速源由 [github.geekery.cn] 提供" },
  { base: "https://gitproxy.mrhjx.cn", region: "美国", note: "[美国 Cloudflare CDN] - 该公益加速源由 [gitproxy.mrhjx.cn] 提供" },
  { base: "https://hk.gh-proxy.org", region: "香港", note: "[中国香港] - 该公益加速源由 [gh-proxy.com] 提供" },
  { base: "https://cdn.gh-proxy.org", region: "其他", note: "[Fastly CDN] - 该公益加速源由 [gh-proxy.com] 提供" },
  { base: "https://edgeone.gh-proxy.org", region: "其他", note: "[edgeone] - 该公益加速源由 [gh-proxy.com] 提供" },
  { base: "https://ghproxy.net", region: "其他", note: "[法国] - 该公益加速源由 [ghproxy.net] 提供" },
  { base: "https://wget.la", region: "其他", note: "[中国香港、中国台湾、日本、美国等]（CDN 不固定） - 该公益加速源由 [ucdn.me] 提供" },
];
// MIRRORS:END

let state = null;
let settingsDispose = null;
let cssDispose = null;
let hostProxyUnwatch = null;

const normalizeBase = (value) =>
  String(value ?? "")
    .trim()
    .replace(/\/+$/, "");

const isValidBase = (value) => {
  const base = normalizeBase(value);
  if (!base) return false;
  try {
    const url = new URL(base);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};

const normalizeSettings = (value) => {
  const source = value && typeof value === "object" ? value : {};
  return {
    autoApply: Boolean(source.autoApply ?? DEFAULT_SETTINGS.autoApply),
    selectedBase: normalizeBase(source.selectedBase ?? DEFAULT_SETTINGS.selectedBase),
    customBase: normalizeBase(source.customBase ?? DEFAULT_SETTINGS.customBase),
  };
};

const getHostProxy = (ctx) => normalizeBase(ctx.settings?.githubProxyUrl ?? "");

const saveSettings = async (ctx, values) => {
  const next = normalizeSettings({ ...state.settings, ...values });
  state.settings = next;
  await ctx.storage.set(STORAGE_KEY, next);
  return next;
};

// 宿主设置 store 并非公开的插件写入接口，写入后必须回读校验，否则宿主重构时会静默失效
const applyAccelerator = async (ctx, base) => {
  const normalized = normalizeBase(base);
  if (normalized && !isValidBase(normalized)) {
    ctx.toast.warning("加速源地址无效，需为 http(s) URL");
    return false;
  }
  try {
    ctx.settings.githubProxyUrl = normalized;
  } catch (error) {
    ctx.toast.danger(`无法写入宿主设置：${error.message}`);
    return false;
  }
  const actual = getHostProxy(ctx);
  if (actual !== normalized) {
    ctx.toast.danger("宿主未接受该加速源设置，请检查 EchoMusic 版本是否兼容");
    return false;
  }
  state.hostProxy = normalized;
  await saveSettings(ctx, { selectedBase: normalized });
  ctx.toast.success(
    normalized ? `已应用加速源：${normalized}` : "已清空 GitHub 加速源",
  );
  return true;
};

const fetchWithTimeout = (url, timeoutMs) =>
  fetch(url, { signal: AbortSignal.timeout(timeoutMs), redirect: "follow" });

const testMirror = async (ctx, base) => {
  const normalized = normalizeBase(base);
  const result = { ok: false, latency: null, error: "" };
  try {
    const start = performance.now();
    const response = await fetchWithTimeout(
      `${normalized}/${TEST_PATH}`,
      TEST_TIMEOUT_MS,
    );
    result.latency = Math.round(performance.now() - start);
    if (!response.ok) {
      result.error = `HTTP ${response.status}`;
      return result;
    }
    await response.arrayBuffer();
    result.ok = true;
  } catch (error) {
    result.error = error.name === "TimeoutError" ? "超时" : error.message;
  }
  return result;
};

const runPool = async (items, limit, worker) => {
  const results = [];
  let cursor = 0;
  const runners = Array.from(
    { length: Math.max(1, Math.min(limit, items.length)) },
    async () => {
      while (cursor < items.length) {
        const index = cursor++;
        results[index] = await worker(items[index]);
      }
    },
  );
  await Promise.all(runners);
  return results;
};

const collectTestTargets = () =>
  [...MIRRORS.map((m) => m.base), state.settings.customBase]
    .map(normalizeBase)
    .filter((base, index, arr) => base && arr.indexOf(base) === index);

const loadCachedResults = async (ctx) => {
  const cached = await ctx.storage.get(RESULT_KEY);
  if (!cached || typeof cached !== "object") return null;
  if (!cached.timestamp || Date.now() - cached.timestamp > RESULT_TTL_MS) return null;
  return cached;
};

const runSpeedTest = async (ctx, options = {}) => {
  if (state.testing) return;
  if (options.useCache !== false) {
    const cached = await loadCachedResults(ctx);
    if (cached) {
      state.results = cached.results;
      state.resultsTimestamp = cached.timestamp;
      ctx.toast.info("已载入缓存的测速结果（30 分钟内有效）");
      return;
    }
  }
  const targets = collectTestTargets();
  state.testing = true;
  state.testProgress = { done: 0, total: targets.length };
  state.results = {};
  ctx.toast.info(`开始测速 ${targets.length} 个加速源…`);

  try {
    const results = await runPool(targets, TEST_CONCURRENCY, async (base) => {
      const result = await testMirror(ctx, base);
      state.results[base] = result;
      state.testProgress.done += 1;
      return result;
    });
    state.resultsTimestamp = Date.now();
    await ctx.storage.set(RESULT_KEY, {
      timestamp: state.resultsTimestamp,
      results,
    });
    const okCount = results.filter((r) => r.ok).length;
    ctx.toast.success(`测速完成：${okCount}/${targets.length} 个可用`);
  } catch (error) {
    ctx.toast.danger(`测速失败：${error.message}`);
  } finally {
    state.testing = false;
    state.testProgress = null;
  }
};

const applyFastest = async (ctx) => {
  const candidates = Object.entries(state.results).filter(
    ([, result]) => result.ok && typeof result.latency === "number",
  );
  if (!candidates.length) {
    ctx.toast.warning("暂无可用的测速结果，请先测速");
    return;
  }
  candidates.sort((a, b) => a[1].latency - b[1].latency);
  const [fastest, meta] = candidates[0];
  await applyAccelerator(ctx, fastest);
  ctx.toast.info(`最快加速源延迟 ${meta.latency}ms`);
};

const checkUpdates = async (ctx) => {
  try {
    if (typeof ctx.settings.checkForUpdates === "function") {
      await ctx.settings.checkForUpdates(false);
      ctx.toast.info(
        getHostProxy(ctx)
          ? "已通过当前加速源检查更新"
          : "已检查更新（当前未设置加速源）",
      );
    } else {
      ctx.toast.warning("当前版本不支持从插件触发检查更新");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    ctx.toast.danger(`检查更新失败：${message}`);
  }
};

const PANEL_CSS = `
.echo-github-accelerator {
  display: grid;
  gap: 14px;
  color: var(--color-text-main, #f8fafc);
}

.echo-github-accelerator-panel {
  display: grid;
  gap: 12px;
  border: 1px solid color-mix(in srgb, var(--color-text-main, #f8fafc) 12%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--surface-elevated-base, #111827) 72%, transparent);
  padding: 14px;
}

.echo-github-accelerator-panel h3 {
  margin: 0;
  font-size: 13px;
  font-weight: 760;
}

.echo-github-accelerator-hint {
  color: var(--color-text-secondary, rgba(148, 163, 184, 0.9));
  font-size: 12px;
  line-height: 1.5;
}

.echo-github-accelerator-status {
  display: grid;
  gap: 6px;
  font-size: 13px;
}

.echo-github-accelerator-status code {
  display: block;
  padding: 8px 10px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--surface-elevated-base, #0b1220) 90%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-text-main, #f8fafc) 10%, transparent);
  color: var(--color-text-main, #e2e8f0);
  font-size: 12px;
  word-break: break-all;
  white-space: normal;
}

.echo-github-accelerator-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.echo-github-accelerator-field {
  display: grid;
  gap: 8px;
}

.echo-github-accelerator-field > span {
  font-size: 13px;
  font-weight: 650;
}

.echo-github-accelerator-list {
  display: grid;
  gap: 6px;
  max-height: 420px;
  overflow: auto;
  padding-right: 4px;
}

.echo-github-accelerator-item {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 9px 10px;
  border-radius: 8px;
  border: 1px solid color-mix(in srgb, var(--color-text-main, #f8fafc) 12%, transparent);
  background: color-mix(in srgb, var(--surface-elevated-base, #0f172a) 65%, transparent);
  color: inherit;
  cursor: pointer;
  text-align: left;
  font: inherit;
  transition: border-color 0.15s ease, background 0.15s ease;
}

.echo-github-accelerator-item:hover {
  border-color: color-mix(in srgb, var(--color-primary, #31cfa1) 55%, transparent);
}

.echo-github-accelerator-item.is-active {
  border-color: var(--color-primary, #31cfa1);
  background: color-mix(in srgb, var(--color-primary, #31cfa1) 14%, transparent);
}

.echo-github-accelerator-item.is-testing {
  opacity: 0.7;
}

.echo-github-accelerator-region {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 42px;
  padding: 2px 7px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  background: color-mix(in srgb, var(--color-primary, #31cfa1) 18%, transparent);
  color: var(--color-primary, #31cfa1);
}

.echo-github-accelerator-item-copy {
  min-width: 0;
  display: grid;
  gap: 2px;
}

.echo-github-accelerator-item-copy strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12.5px;
  font-weight: 650;
}

.echo-github-accelerator-item-copy small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--color-text-secondary, rgba(148, 163, 184, 0.85));
  font-size: 11px;
}

.echo-github-accelerator-latency {
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  color: var(--color-text-secondary, rgba(148, 163, 184, 0.9));
  white-space: nowrap;
}

.echo-github-accelerator-latency.is-ok {
  color: var(--color-primary, #31cfa1);
}

.echo-github-accelerator-latency.is-fail {
  color: #f87171;
}

.echo-github-accelerator-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
`;

const createSettingsComponent = (ctx) =>
  ctx.vue.defineComponent({
    name: "GithubAcceleratorSettings",
    setup() {
      const { computed, defineAsyncComponent, h, ref } = ctx.vue;
      const Button = defineAsyncComponent(ctx.ui.components.Button);
      const Input = defineAsyncComponent(ctx.ui.components.Input);
      const Switch = defineAsyncComponent(ctx.ui.components.Switch);

      const customDraft = ref(state.settings.customBase || "");
      const hostProxy = computed(() => state.hostProxy || "（未设置）");
      const selectedBase = computed(() => state.settings.selectedBase || "");
      const testing = computed(() => Boolean(state.testing));
      const testProgress = computed(() => state.testProgress);

      const onApplyCustom = async () => {
        const value = normalizeBase(customDraft.value);
        if (!value) {
          ctx.toast.warning("请输入加速源地址，或点击「清空」移除当前加速源");
          return;
        }
        if (!isValidBase(value)) {
          ctx.toast.warning("加速源地址无效，需为 http(s) URL");
          return;
        }
        await saveSettings(ctx, { customBase: value });
        await applyAccelerator(ctx, value);
      };

      const onClear = async () => {
        customDraft.value = "";
        await saveSettings(ctx, { customBase: "" });
        await applyAccelerator(ctx, "");
      };

      const onToggleAutoApply = async (value) => {
        await saveSettings(ctx, { autoApply: Boolean(value) });
        if (value && state.settings.selectedBase) {
          await applyAccelerator(ctx, state.settings.selectedBase);
        }
      };

      const latencyMeta = (base) => {
        const result = state.results?.[base];
        if (!result) return { text: "未测速", className: "", title: "" };
        if (result.ok) {
          return {
            text: `${result.latency}ms`,
            className: "is-ok",
            title: `响应延迟 ${result.latency} ms`,
          };
        }
        return {
          text: result.error || "失败",
          className: "is-fail",
          title: result.error || "",
        };
      };

      const mirrorItem = (mirror) => {
        const base = normalizeBase(mirror.base);
        const active = selectedBase.value === base;
        const meta = latencyMeta(base);
        const isTesting = testing.value && !state.results?.[base];
        return h(
          "button",
          {
            type: "button",
            class: [
              "echo-github-accelerator-item",
              active ? "is-active" : "",
              isTesting ? "is-testing" : "",
            ],
            title: [mirror.note, meta.title, "点击应用该加速源"]
              .filter(Boolean)
              .join("\n"),
            onClick: () => void applyAccelerator(ctx, base),
          },
          [
            h("span", { class: "echo-github-accelerator-region" }, mirror.region),
            h("span", { class: "echo-github-accelerator-item-copy" }, [
              h("strong", base),
              h("small", mirror.note),
            ]),
            h(
              "span",
              { class: `echo-github-accelerator-latency ${meta.className}` },
              meta.text,
            ),
          ],
        );
      };

      const customItem = () => {
        const base = normalizeBase(state.settings.customBase);
        if (!base) return null;
        const active = selectedBase.value === base;
        const meta = latencyMeta(base);
        return h(
          "button",
          {
            type: "button",
            class: [
              "echo-github-accelerator-item",
              active ? "is-active" : "",
            ],
            title: "自定义加速源\n点击应用",
            onClick: () => void applyAccelerator(ctx, base),
          },
          [
            h("span", { class: "echo-github-accelerator-region" }, "自定义"),
            h("span", { class: "echo-github-accelerator-item-copy" }, [
              h("strong", base),
              h("small", "由你在下方输入并保存的加速源"),
            ]),
            h(
              "span",
              { class: `echo-github-accelerator-latency ${meta.className}` },
              meta.text,
            ),
          ],
        );
      };

      return () =>
        h("div", { class: "echo-github-accelerator" }, [
          h("section", { class: "echo-github-accelerator-panel" }, [
            h("h3", "当前状态"),
            h("div", { class: "echo-github-accelerator-status" }, [
              h("span", "宿主「设置 → 网络 → GitHub 加速地址」："),
              h("code", hostProxy.value),
            ]),
            h(
              "div",
              {
                style:
                  "display:flex;justify-content:space-between;gap:12px;align-items:center;",
              },
              [
                h("span", { style: "font-size:13px;font-weight:650;" }, "启动时自动应用"),
                h(Switch, {
                  modelValue: state.settings.autoApply,
                  "onUpdate:modelValue": (value) => void onToggleAutoApply(value),
                }),
              ],
            ),
            h(
              "p",
              { class: "echo-github-accelerator-hint" },
              "该设置同时作用于应用更新下载与插件源/插件包下载；加速失败时主程序会自动回退官方 GitHub 源。",
            ),
          ]),

          h("section", { class: "echo-github-accelerator-panel" }, [
            h("h3", "公益加速源"),
            h("div", { class: "echo-github-accelerator-row" }, [
              h(
                Button,
                {
                  variant: "primary",
                  size: "xs",
                  disabled: testing.value,
                  onClick: () =>
                    void runSpeedTest(ctx, { useCache: !state.resultsTimestamp }),
                },
                {
                  default: () =>
                    testing.value && testProgress.value
                      ? `测速中 ${testProgress.value.done}/${testProgress.value.total}…`
                      : state.resultsTimestamp
                        ? "重新测速"
                        : "一键测速",
                },
              ),
              h(
                Button,
                {
                  variant: "outline",
                  size: "xs",
                  disabled: testing.value,
                  onClick: () => void applyFastest(ctx),
                },
                { default: () => "应用最快" },
              ),
              h(
                Button,
                {
                  variant: "ghost",
                  size: "xs",
                  onClick: () => void onClear(),
                },
                { default: () => "清空加速源" },
              ),
            ]),
            h(
              "div",
              { class: "echo-github-accelerator-list" },
              [
                customItem(),
                ...MIRRORS.map(mirrorItem),
              ].filter(Boolean),
            ),
            h(
              "p",
              { class: "echo-github-accelerator-hint" },
              "点击条目即可应用；测速使用 EchoMusic 仓库 package.json 小文件测量响应延迟，「应用最快」按延迟从低到高排序。结果缓存 30 分钟。优先选择美国节点，避免流量集中到亚洲公益节点。",
            ),
          ]),

          h("section", { class: "echo-github-accelerator-panel" }, [
            h("h3", "自定义加速源"),
            h("label", { class: "echo-github-accelerator-field" }, [
              h("span", "加速源地址"),
              h(Input, {
                modelValue: customDraft.value,
                placeholder: "https://example.com",
                "onUpdate:modelValue": (value) => {
                  customDraft.value = String(value ?? "");
                },
              }),
            ]),
            h("div", { class: "echo-github-accelerator-actions" }, [
              h(
                Button,
                {
                  variant: "primary",
                  size: "xs",
                  onClick: () => void onApplyCustom(),
                },
                { default: () => "应用自定义" },
              ),
            ]),
            h(
              "p",
              { class: "echo-github-accelerator-hint" },
              "格式：加速源域名（可含路径前缀），主程序会拼接为 加速源/https://github.com/… ，留空条目点「清空加速源」即可。",
            ),
          ]),

          h("section", { class: "echo-github-accelerator-panel" }, [
            h("h3", "更新"),
            h("div", { class: "echo-github-accelerator-actions" }, [
              h(
                Button,
                {
                  variant: "outline",
                  size: "xs",
                  onClick: () => void checkUpdates(ctx),
                },
                { default: () => "通过当前加速源检查更新" },
              ),
            ]),
          ]),
        ]);
    },
  });

const registerSettings = (ctx) => {
  settingsDispose?.();
  settingsDispose = ctx.ui.settings.define({
    title: "GitHub 加速源",
    description: "选择、测速并应用 GitHub 公益加速源，加速 EchoMusic 更新与插件下载。",
    component: createSettingsComponent(ctx),
  });
};

export async function activate(ctx) {
  const savedResults = await loadCachedResults(ctx);
  state = ctx.vue.reactive({
    settings: normalizeSettings(await ctx.storage.get(STORAGE_KEY)),
    hostProxy: getHostProxy(ctx),
    results: savedResults?.results ?? {},
    resultsTimestamp: savedResults?.timestamp ?? null,
    testing: false,
    testProgress: null,
  });

  cssDispose?.();
  cssDispose = ctx.css.inject(PANEL_CSS, { id: "github-accelerator-settings" });
  registerSettings(ctx);

  hostProxyUnwatch?.();
  hostProxyUnwatch = ctx.vue.watch(
    () => ctx.settings?.githubProxyUrl,
    (value) => {
      const next = normalizeBase(value);
      state.hostProxy = next;
      // 用户可能在宿主「设置 → 网络」直接改值，此时同步插件记录，避免下次自动应用覆盖用户选择
      if (next !== state.settings.selectedBase) {
        void saveSettings(ctx, { selectedBase: next });
      }
    },
  );

  ctx.commands.register(
    "apply-selected",
    async () => {
      if (!state.settings.selectedBase) {
        ctx.toast.warning("尚未选择加速源，请到插件设置中选择");
        return;
      }
      await applyAccelerator(ctx, state.settings.selectedBase);
    },
    { title: "应用已选 GitHub 加速源" },
  );

  ctx.commands.register(
    "speed-test",
    () => runSpeedTest(ctx, { useCache: false }),
    { title: "测速 GitHub 加速源" },
  );

  ctx.commands.register("check-updates", () => checkUpdates(ctx), {
    title: "通过加速源检查更新",
  });

  if (state.settings.autoApply && state.settings.selectedBase) {
    await applyAccelerator(ctx, state.settings.selectedBase);
  }

  ctx.toast.success(`${ctx.manifest.name} 已启用`);
}

export async function deactivate() {
  hostProxyUnwatch?.();
  hostProxyUnwatch = null;
  settingsDispose?.();
  settingsDispose = null;
  cssDispose?.();
  cssDispose = null;
  state = null;
}
