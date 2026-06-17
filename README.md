# 以太 AI 游戏伴侣

## 首页

![首页](docs/assets/home.png)

## 后台

![后台](docs/assets/dashboard.png)

以太是一款面向玩家的按需屏幕 Agent。玩家按 `Alt+Q` 后，以太会捕获当前画面、理解游戏或桌面内容，并给出简短、可执行的中文建议。

## 玩家体验

- 启动后打开正常主界面，同时驻留系统托盘；关闭主界面后应用继续在托盘运行。
- `Alt+Q`：解读当前画面，默认读取鼠标所在屏幕。
- `Alt+Shift+Q`：打开最近一次完整回答。
- 分析完成后显示短答案卡，默认约 8 秒后自动收起，不抢焦点、不拦截游戏点击。
- 主界面可以手动选择显示器、窗口或内置演示画面。
- 不再承诺长期悬浮覆盖独占全屏游戏；录制和实际使用建议采用无边框窗口模式。
- 多种游玩偏好使用独立 memory；默认采用不偏科的“随心玩家”。

## 完整启动流程

以太运行时只依赖两件事：

1. `Sub2Api` 本地模型网关。
2. `以太 AI 游戏伴侣` Electron 应用。

不需要单独启动本地 Codex。Codex 自己继续使用官方登录；以太项目运行时只读取项目目录的 `.env.local` / `.env` 或当前进程环境变量，不读取 Codex 的 `config.toml` 或 `auth.json`。

### 第 1 步：启动 Sub2Api

先确认 Docker Desktop 已经启动，然后打开 PowerShell：

```powershell
cd D:\Sub2Api
docker compose up -d
```

检查服务状态：

```powershell
cd D:\Sub2Api
docker compose ps
```

检查健康状态：

```powershell
Invoke-WebRequest http://127.0.0.1:8080/health -UseBasicParsing
```

正常返回：

```json
{"status":"ok"}
```

如果改过 `D:\Sub2Api\.env`，需要重启 Sub2Api：

```powershell
cd D:\Sub2Api
docker compose restart sub2api
```

### 第 2 步：确认模型 key

开发环境下，推荐把以太专用配置放在项目根目录 `.env.local`：

```text
AETHER_LLM_BASE_URL=http://127.0.0.1:8080/v1
AETHER_LLM_MODEL=gpt-5.5
AETHER_LLM_API_KEY=你的本地 Sub2API API Key
```

`.env.local` 已被 `.gitignore` 忽略，不要提交真实 key。项目也兼容旧变量名 `AETHER_MODEL_*`，但新配置建议统一使用 `AETHER_LLM_*`。

如果不想写文件，可以在当前 PowerShell 会话里临时注入：

```powershell
$env:AETHER_LLM_BASE_URL="http://127.0.0.1:8080/v1"
$env:AETHER_LLM_MODEL="gpt-5.5"
$env:AETHER_LLM_API_KEY="你的本地 Sub2API API Key"
npm run dev
```

当前项目默认使用：

```text
AETHER_LLM_BASE_URL=http://127.0.0.1:8080/v1
AETHER_LLM_WIRE=responses
AETHER_LLM_MODEL=gpt-5.5
```

界面展示的是服务端实际返回的模型名，不是配置文件里的请求模型名。如果 Sub2Api 把 `gpt-5.5` 这个别名路由到 `Qwen/Qwen3.5-397B-A17B`，AgentOps 会显示 Qwen，这是网关的实际调用结果。

如果不想经过 Sub2Api，可以直接接任意 OpenAI-compatible 服务：

```text
AETHER_LLM_BASE_URL=https://你的模型服务/v1
AETHER_LLM_WIRE=responses
AETHER_LLM_MODEL=固定模型名
AETHER_LLM_API_KEY=你的服务 API Key
```

如果服务只兼容 Chat Completions，把 `AETHER_LLM_WIRE` 改成 `chat`；以太会调用 `/v1/chat/completions`。

### 第 3A 步：开发模式启动以太

首次运行先安装依赖：

```bash
npm install
```

之后启动开发版：

```bash
npm run dev
```

这个命令会同时启动 Vite 前端和 Electron 桌面应用。启动后在主界面点击“解读当前画面”，或在任意画面按 `Alt+Q`。

### 第 3B 步：便携版启动以太

如果只是录屏或展示作品，先启动 `Sub2Api`，然后直接运行：

```text
release-portfolio\以太AI游戏伴侣 1.0.0.exe
```

作品集便携版不会携带 `.env` 或 `.env.local`。如果要让便携版在本机直接可运行，请把同名配置文件放到 exe 同目录，或在启动前设置当前进程环境变量。

### Codex 要不要启动

不需要。Codex 是开发工具，以太是被开发的 Electron 应用。不要为了运行以太去修改 `C:\Users\yzw\.codex\config.toml`，也不要把 Sub2API key 写入 Codex 配置。

修改 `C:\Users\yzw\.codex\config.toml` 后，已经打开的 Codex 会话不一定立即生效，通常需要新开 Codex 会话。但这不影响以太助手启动。

## 构建与测试

常用命令：

```bash
npm test
npm run eval:rag
npm run build
npm run pack
npm run pack:portfolio
```

本地可运行便携版生成在 `release/`，会复制本机 `.env` 方便演示。作品集脱敏便携版生成在 `release-portfolio/`，不会复制 `.env` 或 `.env.local`。

## 本地 Sub2Api 配置

项目默认连接本机 Sub2Api，本轮已禁用旧云端模型配置路径。推荐先启动 `D:\Sub2Api`，确认健康检查通过：

```powershell
Invoke-WebRequest http://127.0.0.1:8080/health -UseBasicParsing
```

以太根目录 `.env.local` / `.env` 只由 Electron 主进程读取，不会暴露给渲染页面。推荐配置：

```text
AETHER_LLM_BASE_URL=http://127.0.0.1:8080/v1
AETHER_LLM_WIRE=responses
AETHER_LLM_MODEL=gpt-5.5
AETHER_LLM_FAST_VISION_MODEL=gpt-5.5
AETHER_LLM_API_KEY=你的本地 Sub2API API Key
TAVILY_API_KEY=你的Tavily API Key
```

兼容变量 `AETHER_MODEL_*` 和 `OPENAI_*` 仍可读取，但不推荐。以太不会读取 Codex 的 `auth.json`。

## 常见启动问题

### `docker` 命令找不到

先打开 Docker Desktop，等待状态变成 Running，再重新打开一个新的 PowerShell。仍然不行时，检查 Docker Desktop 是否安装并加入了系统 PATH。

### Sub2Api 健康检查正常，但以太无法推理

先确认 `.env.local`、`.env` 或当前 PowerShell 会话里有可用的 API key。然后确认以太的模型地址是：

```text
http://127.0.0.1:8080/v1
```

不要写成 `http://127.0.0.1:8080/openai/v1`。这个地址会返回 Sub2Api 前端 HTML 页面，不是模型接口。

### 请求 `gpt-5.5`，界面却显示 Qwen

以太发送请求时使用 `AETHER_LLM_MODEL`，但运行记录会保存服务端响应里的 `model` 字段。出现 `Qwen/Qwen3.5-397B-A17B` 说明 Sub2Api 或上游模型网关把请求模型映射到了 Qwen。要固定实际模型，需要在网关里调整模型映射，或绕过 Sub2Api 直接配置一个不会改写模型名的 OpenAI-compatible endpoint。

### 返回 `only allows Codex official clients`

这是 Sub2Api 对当前 key 的客户端限制。以太 runtime 已经带上 Codex 风格 `User-Agent`，正常不需要额外处理。如果你用别的脚本手动请求，需要加类似：

```text
User-Agent: codex-cli/0.0.0
```

### 改了 Codex 配置但没生效

以太不再读取 Codex 配置。Codex 的 `config.toml` 只影响 Codex 自己；运行以太请检查项目自己的 `.env.local` / `.env` 或当前进程环境变量。

## Agent 链路

```text
Alt+Q → 画面捕获 → 即时画面分类 → 通用视觉/OCR
→ 游戏场景按需进入 Enka、SQLite 与 Tavily 知识链路
→ 深度推理 → 短答案卡 → memory、缓存与 trace 持久化
```

AgentOps 用于作品演示和问题诊断，展示真实请求编号、耗时、知识命中、skill、rules、memory 与 trace。玩家主界面不展示模型参数和内部技术术语。

知识来源按“公开账号与结构化状态 → 本地知识卡 → 社区攻略 → 全网搜索”排序。联网内容只保存短知识卡和来源链接；搜索结果页、正文不足页面与低质量视频页会被过滤。Tavily 搜索缓存 24 小时。

## 数据与边界

- memory、缓存、知识库与 trace 保存在 Electron 用户数据目录。
- SQLite 保存原神与星铁独立账号、公开角色状态、练度历史、知识卡、来源、搜索缓存与同步记录。
- 云端仅接收本轮问题与用户主动触发的截图。
- 不读取游戏进程内存，不抓包，不执行自动游戏操作。
- 独占全屏或受保护画面可能无法稳定截图，录制时建议使用无边框窗口模式。

产品形态调研见 [docs/产品形态调研.md](docs/产品形态调研.md)，录制脚本和待补素材见 [docs/录屏与素材清单.md](docs/录屏与素材清单.md)，已打包素材出处见 [docs/素材许可与来源.md](docs/素材许可与来源.md)。
作品集包装口径见 [docs/作品集包装.md](docs/作品集包装.md)。
