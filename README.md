# GitHub 加速源（EchoMusic 插件）

为 EchoMusic 的**应用更新**与**插件源/插件包下载**提供 GitHub 公益加速源的选择、测速与一键应用。

本插件是 [X.I.U《Github Enhancement - High Speed Download》](https://greasyfork.org/zh-CN/scripts/412245)（GitHub: [XIU2/UserScript](https://github.com/XIU2/UserScript)）的 EchoMusic 移植版，仅保留与 EchoMusic 内置 GitHub 加速机制兼容的加速源列表与交互思路；原脚本中针对 github.com 页面的 DOM 注入功能未移植。

## 功能

- **加速源列表**：内置多个公益加速源（美国优先），点击即可应用
- **一键测速**：并发测量各加速源延迟，可「应用最快」
- **自定义加速源**：手动输入任意兼容地址
- **启动自动应用**：记住上次选择，启动时同步到宿主设置
- **检查更新**：通过当前加速源触发 EchoMusic 检查更新
- **命令**：`apply-selected`、`speed-test`、`check-updates`

应用后写入宿主「设置 → 网络 → GitHub 加速地址」（`githubProxyUrl`），同时作用于：

1. 应用更新（electron-updater 走 `${加速源}/${原始URL}`）
2. 插件源索引 / manifest / 图标（raw.githubusercontent.com）
3. 插件仓库 zip 下载（github.com archive）

加速失败时主程序会自动回退官方 GitHub 源。

## 安装

1. 将本目录（或仓库中的 `github-accelerator/`）复制到 EchoMusic 插件目录  
   （插件管理 → 打开目录）
2. 在「插件管理」中启用 **GitHub 加速源**
3. 打开插件设置，选择或测速后应用加速源

### 本地插件目录示例

```text
Windows: %APPDATA%\echo-music\plugins\github-accelerator\
```

## 使用说明

| 操作 | 说明 |
| --- | --- |
| 点击列表条目 | 立即写入宿主 GitHub 加速地址 |
| 一键测速 | 以 EchoMusic 仓库 `package.json` 为小文件测延迟 |
| 应用最快 | 选中测速结果中延迟最低的可用源 |
| 清空加速源 | 移除加速，恢复直连官方 GitHub |
| 应用自定义 | 使用下方输入的地址（格式：`https://example.com`，可含路径前缀） |

**建议优先使用美国节点**，避免流量集中到亚洲公益节点，有利于公益加速源长期维持。

## 能力声明

`manifest.json` 中声明：

- `capabilities.unrestrictedNetwork: true` — 用于 `ctx.net.request` 加速源测速
- `requires.echoMusicVersion: ">=2.2.6"`

## 目录结构

```text
github-accelerator/
  manifest.json
  index.js
  icon.png
  README.md
  LICENSE
  NOTICE
```

## 致谢

- 原脚本：[X.I.U / XIU2](https://github.com/XIU2) — [Github Enhancement - High Speed Download](https://github.com/XIU2/UserScript)
- 各公益加速源提供者（见插件内列表标注）
- [EchoMusic](https://github.com/hoowhoami/EchoMusic) 插件系统

## 许可证

本插件为原脚本的衍生作品，按 **GNU General Public License v3.0（GPL-3.0）** 分发，详见 [LICENSE](LICENSE)。

> **注意**：EchoMusic 官方插件仓库根目录默认为 MIT，但本插件目录**不适用** MIT，以本目录 `LICENSE`（GPL-3.0）为准。

```text
This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.
```
