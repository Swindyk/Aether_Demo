# 以太 AI 游戏伴侣

> 面向玩家的按需屏幕 Agent。按 `Alt+Q` 后，以太会捕获当前画面，结合会话上下文、玩家偏好、公开账号状态和游戏知识，给出简短、中文、可执行的下一步建议。

## 预览

| 首页 | AgentOps 后台 |
| --- | --- |
| ![首页](docs/assets/home.png) | ![后台](docs/assets/dashboard.png) |

## 项目定位

以太不是外挂、宏或自动化脚本。它只在用户主动触发时读取屏幕截图，并把识别结果压缩成玩家能直接执行的建议；不读取游戏进程内存，不抓包，不自动点击或操作游戏客户端。

适用场景：

- 探索、解谜、地图路线卡点。
- 队伍、装备、养成路线判断。
- 剧情人物、任务线索解释，默认防剧透。
- 游戏之外的桌面、网页或文档画面快速解读。

## 核心能力

- **按需截图解读**：`Alt+Q` 默认读取鼠标所在显示器；也可以在主界面手动选择显示器、窗口或内置演示画面。
- **低打扰短答案卡**：分析完成后弹出短答案卡，默认约 8 秒后自动收起，不抢焦点，不拦截游戏点击。
- **完整回答与追问**：`Alt+Shift+Q` 打开最近一次完整回答；首页和后台都支持基于同一会话继续追问。
- **多玩家偏好**：内置“随心玩家、进阶玩家、剧情玩家、新手玩家、收集玩家”等回答偏好，并按会话/账号维护 memory。
- **公开账号上下文**：玩家可主动连接原神或星铁公开 UID；以太会把公开角色状态作为配队、装备和养成判断的上下文。
- **本地优先知识链路**：内置知识包 + SQLite FTS + 别名/关键词规则 + 来源权重；本地信息不足时可选 Tavily 联网攻略兜底。
- **AgentOps 后台**：用于演示和排障，可查看会话、视觉观察、知识命中、Skill、Trace、错误和运行状态。

## 技术结构

```text
React / Vite 渲染层
  ├─ PlayerHome：玩家首页、场景卡、追问与账号入口
  ├─ AnswerCard：短答案卡
  └─ Dashboard：AgentOps 后台

Electron 主进程
  ├─ 全局快捷键、托盘、窗口管理
  ├─ desktopCapturer 截图与画面源选择
  ├─ .env / .env.local / 进程环境变量加载
  └─ IPC API

Agent Runtime
  ├─ 视觉/OCR 观察
  ├─ 会话 memory
  ├─ 知识检索与来源过滤
  ├─ 模型推理
  └─ trace、cache、conversation 持久化

模型网关
  └─ 默认连接本机 Sub2Api，也可换成任意 OpenAI-compatible endpoint
```

## 环境要求

- Node.js 22.x 或更新版本。当前实现使用 `node:sqlite`，建议与项目里的 `@types/node` 主版本保持一致。
- npm。
- Windows 桌面环境。当前打包脚本生成 Windows portable 版本；开发模式依赖 Electron，理论上可在其它桌面系统调试，但发布产物以 Windows 为准。
- Docker Desktop。仅当你用本机 Sub2Api 作为模型网关时需要。
- 一个可用的视觉模型服务。默认走本机 Sub2Api：`http://127.0.0.1:8080/v1`。
- Tavily API key 可选。未配置时只使用本地知识与模型能力。

## 快速启动

### 1. 克隆项目并安装依赖

```bash
git clone https://github.com/Swindyk/Aether_Demo.git
cd Aether_Demo
npm install
```

### 2. 启动模型网关

如果使用 Sub2Api，请先进入你本机的 Sub2Api 项目目录。不要把下面的 `<SUB2API_DIR>` 当成固定路径；它只是占位符。

```bash
cd <SUB2API_DIR>
docker compose up -d
docker compose ps
```

健康检查：

```powershell
Invoke-WebRequest http://127.0.0.1:8080/health -UseBasicParsing
```

macOS / Linux 或 Git Bash 可用：

```bash
curl http://127.0.0.1:8080/health
```

正常情况下应返回类似：

```json
{"status":"ok"}
```

如果修改过 Sub2Api 自己的 `.env`，在 Sub2Api 项目目录执行：

```bash
docker compose restart sub2api
```

### 3. 配置以太运行时

开发环境建议从示例文件复制一份本地配置：

```bash
cp .env.example .env.local
```

Windows PowerShell 可用：

```powershell
Copy-Item .env.example .env.local
```

在 `.env.local` 中填写你的模型服务配置：

```text
AETHER_LLM_BASE_URL=http://127.0.0.1:8080/v1
AETHER_LLM_WIRE=responses
AETHER_LLM_MODEL=gpt-5.5
AETHER_LLM_FAST_VISION_MODEL=gpt-5.5
AETHER_LLM_API_KEY=你的本地 Sub2Api API Key
# TAVILY_API_KEY=你的 Tavily API Key，可选
```

`.env` 和 `.env.local` 已被 `.gitignore` 忽略，不要提交真实 key。项目仍兼容旧变量名 `AETHER_MODEL_*` 和 `OPENAI_*`，但新配置建议统一使用 `AETHER_LLM_*`。

如果不使用 Sub2Api，可以直接接入其它 OpenAI-compatible 服务：

```text
AETHER_LLM_PROVIDER=你的服务名
AETHER_LLM_BASE_URL=https://你的模型服务/v1
AETHER_LLM_WIRE=responses
AETHER_LLM_MODEL=固定模型名
AETHER_LLM_API_KEY=你的服务 API Key
```

如果服务只兼容 Chat Completions，把 `AETHER_LLM_WIRE` 改成 `chat`；以太会调用 `/v1/chat/completions`。

### 4. 启动开发版

```bash
npm run dev
```

这个命令会同时启动 Vite 前端和 Electron 桌面应用。应用启动后，可以点击首页“让我看看”，或在任意画面按 `Alt+Q`。

## 便携版构建与运行

常用构建命令：

```bash
npm run build
npm run pack
npm run pack:portfolio
```

- `npm run pack`：生成本机可运行便携版到 `release/`。如果仓库根目录存在 `.env`，会复制到 `release/`，便于本机演示。
- `npm run pack:portfolio`：生成脱敏作品集版本到 `release-portfolio/`，不会复制 `.env` 或 `.env.local`。

运行作品集便携版时，先确保模型网关已启动，再运行生成出的 exe。例如：

```powershell
.\release-portfolio\<generated-exe-name>.exe
```

便携版运行时也会尝试读取 exe 同目录、项目目录、当前工作目录、用户数据目录等位置的 `.env` / `.env.local`。给他人演示时，推荐把真实 key 放在 exe 同目录的本地 `.env.local`，不要打包进公开仓库。

## 常用脚本

```bash
npm test
npm run eval:rag
npm run build
npm run pack
npm run pack:portfolio
```

脚本说明：

- `npm test`：运行 Electron 侧单元测试。
- `npm run eval:rag`：运行知识检索评测。
- `npm run build`：构建 Vite 渲染层并清理渲染产物。
- `npm run pack`：构建 Windows portable 本机演示包。
- `npm run pack:portfolio`：构建不含本机密钥的作品集演示包。

## 运行链路

```text
Alt+Q
→ 隐藏以太窗口并捕获当前画面
→ 视觉/OCR 观察与场景判断
→ 读取会话 memory 与公开 UID 上下文
→ 本地知识检索；必要时使用 Tavily 联网兜底
→ 模型推理并生成玩家短答案
→ 短答案卡展示
→ 保存 conversation、run、trace、cache 与 memory
```

## 数据与边界

- memory、cache、run、conversation、知识状态和 SQLite 数据保存在 Electron 用户数据目录。
- 云端模型服务只接收本轮问题、必要上下文和用户主动触发的截图。
- Tavily 只在配置 key 且知识链路需要联网兜底时使用。
- 不读取游戏进程内存，不抓包，不绕过游戏客户端限制，不执行自动化游戏操作。
- 独占全屏或受保护画面可能被系统截成黑屏；录制和演示时建议使用无边框窗口模式。

## 常见问题

### `docker` 命令找不到

先打开 Docker Desktop，等待状态变成 Running。仍然不行时，重新打开终端，并检查 Docker 是否安装、是否加入 PATH。

### Sub2Api 健康检查正常，但以太无法推理

优先检查三项：

1. `.env.local`、`.env` 或当前进程环境变量里是否有可用的 `AETHER_LLM_API_KEY`。
2. `AETHER_LLM_BASE_URL` 是否为 `http://127.0.0.1:8080/v1`。
3. `AETHER_LLM_WIRE` 是否与模型服务兼容；Responses API 用 `responses`，Chat Completions 用 `chat`。

不要把模型地址写成 `http://127.0.0.1:8080/openai/v1`。该地址通常对应网关前端或反代路径，不一定是以太实际调用的模型接口。

### 请求模型名和界面显示模型名不一致

以太发送请求时使用 `AETHER_LLM_MODEL`，但 AgentOps 会展示模型服务响应里的实际 `model` 字段。如果网关把 `gpt-5.5` 映射到其它模型，界面会显示映射后的实际模型名。要固定显示结果，需要在模型网关侧调整模型映射，或改用不会改写模型名的 endpoint。

### 需要启动 Codex 吗

不需要。Codex 是开发工具，以太是 Electron 应用。运行以太只读取项目本地 `.env` / `.env.local` 和当前进程环境变量，不读取 Codex 的 `config.toml` 或 `auth.json`，也不要把 Sub2Api key 写入 Codex 配置。

### 截图是黑屏或识别不到游戏

优先把游戏切换为无边框窗口模式，再在首页手动选择“整个屏幕”或目标窗口。部分独占全屏、受保护画面或系统权限不足场景无法稳定被 Electron 截取。

## 文档

- [首页操作手册](docs/operation-home.md)
- [AgentOps 后台操作手册](docs/operation-dashboard.md)
- [产品方案 PDF](./“以太”AI游戏伴侣产品方案.pdf)
