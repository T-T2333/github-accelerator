# GitHub 加速源（EchoMusic 插件）

为 EchoMusic 的**应用更新**与**插件源/插件包下载**提供 GitHub 公益加速源的选择、测速与一键应用。

本插件是 [X.I.U《Github Enhancement - High Speed Download》](https://github.com/XIU2/UserScript)（GPL-3.0）的 EchoMusic 移植版，仅保留与 EchoMusic 内置 GitHub 加速机制兼容的加速源列表；原脚本中针对 github.com 页面的 DOM 注入功能未移植。

## 功能

| 功能 | 说明 |
| --- | --- |
| 加速源列表 | 内置 21 个经实测可用的公益源，美国节点优先，点击即应用 |
| 一键测速 | 以 EchoMusic 仓库 `package.json` 为小文件测量响应延迟，「应用最快」按延迟从低到高排序 |
| 结果缓存 | 测速结果缓存 30 分钟，避免重复打扰公益站 |
| 自定义加速源 | 手动输入任意兼容地址 |
| 启动自动应用 | 记住上次选择，启动时同步到宿主设置 |
| 检查更新 | 通过当前加速源触发 EchoMusic 检查更新 |
| 上游同步 | GitHub Actions 每周自动同步上游镜像列表并直接提交 |
| 仓库保活 | 独立工作流每月提交一次，防止 GitHub 停用定时任务 |
| 命令 | `apply-selected`、`speed-test`、`check-updates` |

应用后写入宿主「设置 → 网络 → GitHub 加速地址」（`githubProxyUrl`），同时作用于：

1. 应用更新（electron-updater 走 `${加速源}/${原始URL}`）
2. 插件源索引 / manifest / 图标（`raw.githubusercontent.com`）
3. 插件仓库 zip 下载（`github.com/archive`）

加速失败时主程序会自动回退官方 GitHub 源。

## 安装

将本目录复制到 EchoMusic 插件目录（插件管理 → 打开目录），然后在「插件管理」中启用。

```text
Windows: %APPDATA%\echo-music\plugins\github-accelerator\
```

## 已知限制

- **`api.github.com` 不走加速**：宿主的 `isGithubHostedUrl` 白名单不含该域名，因此**预发布版本**的版本号查询仍为直连。这是宿主行为，插件无法改变。
- **加速源为第三方公益服务**，可用性与速度不由本项目保证。失效源会被上游注释或由本仓库的 `mirrors.overrides.json` 下线。
- **写入宿主设置使用非公开接口**：`ctx.settings.githubProxyUrl` 是共享 Pinia store，宿主未提供正式的插件设置写入 API。插件在写入后会回读校验，若宿主重构导致失效会给出错误提示。

## 镜像维护

镜像列表不手工维护，由 GitHub Actions 自动同步：

| 工作流 | 频率 | 作用 |
| --- | --- | --- |
| `sync-mirrors` | 每周一 | 拉取上游脚本，生成镜像列表并提交 |
| `keepalive` | 每月 | 提交 `.github/KEEPALIVE.md`，避免 GitHub 停用定时任务 |
| `ci` | 每次 push | 校验 manifest、语法、集成测试、镜像是否为最新 |

同步会自动跳过上游注释掉的失效源、过滤与宿主拼接格式不兼容的镜像，并应用 `mirrors.overrides.json`。

官方插件源通过 `echo-plugins.json` 的 `repo` 字段直接拉取本仓库，因此**无需向官方仓库提交 PR**；镜像更新在 `main` 生效后，用户刷新插件列表即可获取新版。

### 常用命令

```bash
npm run sync:mirrors     # 手动同步镜像
npm run probe:mirrors    # 实测各镜像可用性
npm test                 # 集成测试
```

### 下线失效源

编辑 `mirrors.overrides.json` 的 `exclude`（下线）或 `extra`（补充）。

## 能力声明

- 不申请 `unrestrictedNetwork`：测速使用 `ctx.net.fetch`（实测各公益源均返回 `Access-Control-Allow-Origin: *`）
- `requires.echoMusicVersion: ">=2.2.6"`

## 目录结构

```text
github-accelerator/
  manifest.json
  index.js                  # 插件入口（含自动生成的 MIRRORS 段）
  mirrors.generated.json    # 同步产物：结构化镜像数据
  mirrors.overrides.json    # 人工覆盖：exclude / extra / regions / notes
  icon.svg
  scripts/
    sync-mirrors.mjs        # 上游同步
    probe-mirrors.mjs       # 可用性实测
    test-plugin.mjs         # 集成测试
  .github/
    KEEPALIVE.md              # 保活记录（自动更新）
    workflows/
      sync-mirrors.yml        # 每周同步上游镜像
      keepalive.yml           # 每月仓库保活
      ci.yml                  # 测试与校验
  README.md
  LICENSE
  NOTICE
```

## 致谢

- 原脚本：[X.I.U / XIU2](https://github.com/XIU2/UserScript) — [Github Enhancement - High Speed Download](https://github.com/XIU2/UserScript)
- 各公益加速源提供者（见插件内列表标注）
- [EchoMusic](https://github.com/hoowhoami/EchoMusic) 插件系统

## 许可证

本插件为原脚本的衍生作品，按 **GNU General Public License v3.0（GPL-3.0）** 分发，详见 [LICENSE](LICENSE) 与 [NOTICE](NOTICE)。

> **注意**：EchoMusic 官方插件仓库根目录默认为 MIT，但本插件目录**不适用** MIT，以本目录 `LICENSE`（GPL-3.0）为准。

```text
This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.
```
