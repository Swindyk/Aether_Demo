# Aether Demo 项目启动与使用说明

本文档说明如何在本地启动并操作 Aether Demo 项目，包含环境准备、启动步骤、常见问题处理和演示操作指引。

## 1. 环境准备

1. 安装 Node.js
2. 建议使用 Node.js 18+ 或 20+ 版本
3. Windows 用户可直接使用 PowerShell

## 2. 获取项目与依赖安装

1. 打开终端，进入项目目录：
```bash
cd "\Aether_Demo"
```
2. 安装依赖：
```bash
npm install
```

## 3. 启动开发服务器

1. 启动项目：
```bash
npm run dev
```
2. 终端会输出本地访问地址，常见为：
`http://localhost:5173`
3. 打开浏览器访问该地址即可

## 4. 如果端口被占用或权限不足

出现类似 `listen EACCES: permission denied 0.0.0.0:3000` 时，按以下方法处理：

1. 直接指定端口启动（推荐）：
```bash
npm run dev -- --port 5173 --host 127.0.0.1
```
2. 或查找并结束占用 3000 的进程：
```powershell
netstat -aon | findstr :3000
taskkill /PID <PID> /F
```
3. 再次运行：
```bash
npm run dev
```

## 5. Demo 使用操作说明

### 5.1 进入首页
1. 打开项目后默认进入演示首页
2. 主页展示功能入口、模块介绍和真实画面示例

### 5.2 进入悬浮窗演示
1. 点击右上角 `进入悬浮窗演示`
2. 屏幕顶部会出现悬浮控件
3. 点击 `场景反馈` 按钮可切换 4 种场景
4. 点击 `视觉扫描` 会模拟一次识别并展示对应场景反馈卡
5. 点击 `账号仪表盘` 可进入账号数据展示界面

### 5.3 场景反馈说明
1. 装备界面：显示评分、词条高亮与保留建议
2. 配队界面：显示上下半场推荐、缺口提醒
3. 剧情界面：显示防剧透回顾与下一步提示
4. 探索界面：显示目标距离、路线与未完成目标

### 5.4 返回主页
1. 在仪表盘界面点击左上角返回按钮
2. 可继续查看场景反馈或返回浏览器刷新进入首页

## 6. 图片资源替换说明

演示背景图放在：
`public/demo/`

默认文件名如下：
1. `public/demo/genshin-weapon.png`
2. `public/demo/genshin-roster.png`
3. `public/demo/hsr-story.png`
4. `public/demo/hsr-explore.png`

替换时只需覆盖同名文件即可生效。

## 7. 构建生产包（可选）

1. 执行构建：
```bash
npm run build
```
2. 生成产物在 `dist/` 目录
