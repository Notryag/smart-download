# 智能下载调度器

## 项目简介

智能下载调度器是一个 Electron 桌面端下载工具。
第一阶段只解决一个问题：让用户能稳定地创建并运行 magnet 下载任务，并看到明确的状态、进度和失败原因。

它不是“破解速度限制”的工具，也不是“万能加速器”。
它的目标是把下载过程做得更透明、更可解释。

## 当前定位

### 第一阶段做什么
- Electron 桌面端
- magnet 任务创建
- 单一 BT 引擎接入
- 下载进度、速度、状态展示
- 基础错误提示
- 基础日志

### 第一阶段不做什么
- HTTP 下载
- 多引擎自动切换
- AI 诊断
- 复杂资源健康评分
- 完整 NAS / 云端能力

## 用户价值

- 普通用户能直接发起 magnet 下载
- 用户能看到任务为什么慢、为什么失败
- 系统状态不是黑盒
- 后续可以在现有主链路上逐步增加诊断和调度能力

## MVP 范围

### 核心流程
1. 用户粘贴 magnet 链接
2. 用户选择保存目录
3. 应用创建下载任务
4. BT 引擎开始获取元数据并下载
5. UI 实时显示状态、进度和速度
6. 如果失败，界面显示明确错误信息

### MVP 验收标准
- 用户可成功创建 magnet 下载任务
- 系统可显示下载状态、进度和速度
- 核心流程在常见 Windows 环境可运行
- 出现失败时，用户可看到明确错误原因

## 技术方案

### 技术栈
- Electron
- React
- TypeScript
- BT adapter
- SQLite（后续阶段）

### 架构分层
- `src/main`: Electron 主进程、窗口管理、IPC
- `src/renderer`: React UI
- `src/core`: 任务编排、状态流转
- `src/adapters`: 下载引擎适配
- `src/storage`: 配置和持久化
- `src/types`: 类型定义

### 统一任务模型

```ts
export type DownloadTaskType = 'magnet'
export type DownloadEngine = 'bt'
export type DownloadTaskStatus =
  | 'pending'
  | 'metadata'
  | 'downloading'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'canceled'

export interface DownloadTask {
  id: string
  name: string
  type: DownloadTaskType
  source: string
  engine: DownloadEngine
  status: DownloadTaskStatus
  savePath: string
  progress: number
  speedBytes: number
  downloadedBytes: number
  totalBytes?: number
  etaSeconds?: number
  errorMessage?: string
  createdAt: string
  updatedAt: string
}
```

### IPC 最小接口

```ts
createTask(input: {
  source: string
  savePath: string
  name?: string
}): Promise<{ taskId: string }>

listTasks(): Promise<DownloadTask[]>

pauseTask(taskId: string): Promise<void>

resumeTask(taskId: string): Promise<void>

deleteTask(taskId: string): Promise<void>
```

### 事件流
- `task_created`
- `task_updated`
- `task_completed`
- `task_failed`

## 页面范围

### 首页 / 任务列表页
- 新建任务按钮
- 任务列表
- 任务状态、进度、速度

### 新建任务弹窗
- magnet 输入框
- 保存目录选择
- 可选任务名

### 任务详情
- 基础信息
- 当前状态
- 基础错误信息

## 路线图

### Stage 1: Magnet MVP
- 初始化 Electron 项目
- 接入单一 BT 引擎
- 跑通创建任务到开始下载
- 完成状态同步和基础错误提示

### Stage 2: Stability
- SQLite 持久化
- 启动时恢复任务
- 基础网络检查
- 基础诊断摘要

### Stage 3: Extensions
- 诊断面板
- 资源健康评分
- HTTP adapter
- 更细的调度策略

## 风险与边界

### 技术风险
- BT 引擎集成复杂
- 状态同步容易乱
- Electron main / renderer 边界容易失控

### 产品边界
- 产品只提供中立下载能力
- 不内置侵权资源索引
- 不鼓励未授权内容传播
- 文案上避免“破解”“无限加速”等表述

## 当前仓库状态

当前仓库仍处于文档和规划阶段。
建议先落地以下顺序：

1. 初始化 Electron + React + TypeScript 项目
2. 定义任务模型和 IPC
3. 接入单一 BT adapter
4. 完成任务创建、状态同步和列表展示
