# 项目：新熊记（家庭菜谱 / 备菜 / 菜单 App）

**先读 `PRD.md`** —— 它是本项目的需求/设计/口径的单一事实来源（定位、3 大场景、数据模型、备料聚合口径、三视图、架构、部署、变更记录）。

## 给未来的你（重要规则）
1. **任何功能 / 数据结构 / 部署方式 / UI 视觉的改动，都要同步更新 `PRD.md`**，并在「变更记录」追加一条 `vX.Y（日期）说明`。不需用户提醒。
2. 本项目是熊熊币大作战（`E:\CC_Workspace\Finance Dashboard\`）的姊妹项目，**沿用同一套框架理念**：纯前端 PWA、本地优先、无后端、iOS 原生骨架、蜂蜜琥珀主题。
3. 与熊熊币最大的不同：**菜谱有图片 → 图片存 IndexedDB（不是 localStorage）**；结构化文本/数据可继续走 localStorage 或一并进 IndexedDB。
4. 词/菜库更新：目前**由助手从用户备忘录提炼**成 `data/recipes.json` + `data/ingredients.json`（备料库）。用户网页端自助编辑是 Phase 2。
5. 环境：Windows，本机有 `perl` + `openssl`，**没有** node/python/pandoc（同熊熊币）。
6. 部署：计划 GitHub 私有仓库 → Cloudflare Pages 自动部署。菜谱**不敏感**，无需加密词库。

## 月度体检（用户说"体检"时做什么）
用 `tools/sync_token.local.txt` 里的口令（没有就向用户要一次）调 `https://xiongchef.pages.dev/api/data`（GET 拉 / PUT 写，头 `x-sync-token`），审 `userRecipes`：分类、材料/形态、步骤结构、措辞；缺词补 `data/ingredients.json` 并 push 发版；修正后 PUT 回云端并把 `updatedAt` 设为当前时间戳（用户端自动拉取）。图片在用户本机审不了；体检时段提醒用户勿同时编辑。详见 PRD 第 7 节。

## 使用者 / 场景（一句话）
一个人用（太太可能也装一个），一台手机。三件并重的事：**① 有仪式感地定菜单 ② 自动聚合备料/买菜清单 ③ 做菜时随时轻便查这一餐的菜谱**。规模十几~二三十道菜。
