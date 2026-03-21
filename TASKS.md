# TASKS.md

## Stage 1: Magnet MVP

### 基础
- [x] 初始化 Electron + React + TypeScript 项目
- [x] 定义 DownloadTask 类型和任务状态
- [x] 设计 main <-> renderer 的 IPC 接口

### 核心链路
- [x] 新建任务弹窗：输入 magnet 和保存目录
- [x] 接入单一 BT adapter
- [x] 创建并启动 magnet 下载任务
- [x] 同步任务状态、进度、速度

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
- [x] 基础网络检查
- [x] 基础诊断摘要

## Backlog
- [ ] 诊断面板
- [ ] 资源健康评分
- [ ] HTTP adapter
- [ ] AI 诊断助手
- [ ] README 补充运行说明
