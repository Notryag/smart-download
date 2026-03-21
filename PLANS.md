# PLANS.md

## 当前目标
做一个 Electron 桌面端 MVP，先支持 magnet 下载跑通。

## 第一阶段范围
1. 初始化 Electron + React + TypeScript 项目
2. 定义 DownloadTask 和任务状态
3. 实现新建任务输入：magnet + 保存目录
4. 接入单一 BT 引擎
5. 显示下载进度与状态
6. 增加基础错误提示

## 当前优先级
先做：任务创建 + 下载成功 + 状态同步
再做：pause / resume / delete
后做：持久化、基础诊断、日志

## 暂不做
- HTTP adapter
- AI 诊断
- 复杂资源健康评分
- 多引擎自动切换

## 风险
- BT 接入复杂
- Electron main / renderer 边界容易混乱
- 状态同步和任务生命周期容易出错
