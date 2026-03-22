# TASKS.md

## Stage 1: Aria2 MVP

### 基础

- [x] 初始化 Electron + React + TypeScript 项目
- [x] 定义 DownloadTask 类型和任务状态
- [x] 设计 main <-> renderer 的 IPC 接口
- [x] 设计 aria2 RPC 配置读取
- [x] 内置 aria2c 子进程托管与 RPC 控制

### 核心链路

- [x] 新建任务弹窗：输入下载地址和保存目录
- [x] 接入 aria2 RPC adapter
- [x] 创建并启动真实 aria2 下载任务
- [x] 下载文件落盘到 savePath
- [x] 同步真实任务状态、进度、速度

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

## Current priority: Stage 1 收口与分层

- [x] 拆分 renderer 仪表盘组件与格式化工具
- [x] 拆分 qBittorrent adapter 的类型、客户端与实现文件
- [x] 增加 ESLint 体量限制与 antfu 基础规则
- [x] 创建任务失败时补偿清理远端 aria2 任务
- [x] 收口新建任务输入范围，仅保留 magnet 主链路
- [x] 补充 task-manager 核心单元测试
- [x] 将任务状态同步从 renderer 轮询演进到 main 主动推送
- [x] 补充架构、决策和 AI 接手文档
- [x] 增强日志与诊断上下文，方便排查任务卡住问题
- [x] 拆分 aria2 adapter 的运行时 session 管理
- [x] 移除 Prettier，统一改为 ESLint（含 antfu）收口代码风格
- [x] 拆分 aria2 adapter 的状态等待逻辑
- [x] 补充 aria2 工具层状态映射与错误文案单元测试
- [x] 补充 aria2 adapter 运行时行为单元测试
- [x] 补充 main IPC 仪表盘推送行为单元测试
- [x] 输出桌面下载工具化 UI 改造文档
- [x] 修复 aria2 magnet 元数据任务切换真实下载 GID 后的大小同步错误
- [x] 处理 magnet 下载目标文件重名冲突，避免 aria2 因已存在文件直接失败
- [x] 启动前清理 aria2 session.txt 中重复 magnet 条目，避免重复注册旧任务
- [x] 修复 aria2 列表缺少 infoHash 时重复 magnet 残留任务无法自动清理的问题
- [x] 为 aria2 重复 magnet 清理补充多轮重试，覆盖残留异步释放场景
- [x] 修复 aria2 start 首拍失败时未触发创建补偿回滚，导致本地任务与远端 orphan 任务脱钩
- [x] 为 magnet 长时间停留在 metadata 且无 peer 的场景补充用户可读提示
- [x] 更新 AI 接手文档，明确核心链路优先按 TDD 执行
- [x] 配置提交前自动执行 verify（lint + typecheck + test）

## Current priority: UI 工具化改造

- [x] 收口首页结构，改成工具化 Header 并移除网站化 Hero / StatusStrip
- [x] 重排首屏层级，任务区前置，诊断和日志下沉到辅助区
- [x] 清理诊断面板中的项目介绍信息，只保留运行摘要
- [x] 收敛整体视觉样式，继续弱化展示页气质
- [x] 提升任务列表和详情区的信息密度
- [x] 优化新建任务弹窗输入体验
- [x] 将保存目录输入改成系统目录选择器，避免手填路径
- [x] 将 UI 设计文档收口到成熟下载器布局方向（参考迅雷类产品）

## Current priority: 下载器式工作区继续收口

- [x] 为任务工作区增加分类筛选位，并按下载器优先级重排任务
- [x] 将任务列表继续收口成可扫读的任务表视图
- [ ] 将任务详情区改造成 inspector，并前置失败原因和操作
- [ ] 将 Header 继续收口为命令栏，进一步弱化说明文案
- [ ] 将运行摘要进一步并入右侧详情区和底部辅助区
- [ ] 继续优化新建任务弹窗的“粘贴即创建”体验

## Backlog

- [ ] 诊断面板
- [ ] 资源健康评分
- [ ] qBittorrent BT adapter
- [ ] AI 诊断助手
- [x] README 补充运行说明
