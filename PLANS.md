# PLANS.md

## 当前目标
做一个 Electron 桌面端 MVP，先支持 magnet 通过 qBittorrent 真实下载落盘跑通。

## 第一阶段范围
1. 初始化 Electron + React + TypeScript 项目
2. 定义 DownloadTask 和任务状态
3. 实现新建任务输入：magnet + 保存目录
4. 接入 qBittorrent WebUI 作为 BT 下载内核
5. 跑通 magnet -> qBittorrent -> 文件落盘
6. 显示下载进度与状态
7. 增加基础错误提示

## 当前优先级
先做：qBittorrent 接入 + 下载落盘 + 状态同步
再做：pause / resume / delete
后做：持久化、基础诊断、日志、aria2 接入

## 暂不做
- AI 诊断
- 复杂资源健康评分
- 多引擎自动切换

## 风险
- 外部下载器（qBittorrent / aria2）进程与认证配置复杂
- 本地未安装下载器时需要明确报错与引导
- Electron main / renderer 边界容易混乱
- 状态同步和任务生命周期容易出错
