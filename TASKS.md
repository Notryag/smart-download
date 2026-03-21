# TASKS.md

## Stage 1: Aria2 MVP

### 基础
- [x] 初始化 Electron + React + TypeScript 项目
- [x] 定义 DownloadTask 类型和任务状态
- [x] 设计 main <-> renderer 的 IPC 接口
- [x] 设计 aria2 RPC 配置读取

### 核心链路
- [x] 新建任务弹窗：输入下载地址和保存目录
- [x] 接入 aria2 RPC adapter
- [ ] 创建并启动真实 aria2 下载任务
- [ ] 下载文件落盘到 savePath
- [ ] 同步真实任务状态、进度、速度

### 交互
- [x] 任务列表页
- [x] 任务详情基础信息
- [x] 基础错误提示

### 补全
- [x] pause / resume / delete
- [x] 基础日志

## Stage 2: Stability
- [x] SQLite 持久化
- [x] 启动时恢复任务状态
- [x] 基础引擎检查
- [x] 基础诊断摘要

## Backlog
- [ ] 诊断面板
- [ ] 资源健康评分
- [ ] qBittorrent BT adapter
- [ ] AI 诊断助手
- [x] README 补充运行说明
