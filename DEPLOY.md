# 新熊记 · 部署 & 云同步配置

架构：**Cloudflare Pages**（托管静态站）+ **Pages Function `/api/data`**（代理，藏 jsonbin key）+ **jsonbin**（存菜单 JSON）。
客户端只调自己的 `/api/data`，带一个你自定义的「同步口令」。**jsonbin 的 key 永远只在 Cloudflare 环境变量里，绝不进前端/仓库。**

---

## 一、jsonbin 建一个 bin

1. 登录 https://jsonbin.io → **API Keys** 复制 **X-MASTER-KEY**。
2. **Create Bin**，初始内容填：
   ```json
   { "menus": [], "updatedAt": 0 }
   ```
   保存后从 URL 或详情里拿到 **BIN ID**（形如 `66xxxxxxxxxxxxxxxx`）。

## 二、代码推到 GitHub（私有）

```bash
cd "E:\CC_Workspace\新熊记"
git init && git add . && git commit -m "新熊记 v0.4"
# 到 GitHub 新建私有仓库后：
git remote add origin https://github.com/<你>/xiongji.git
git branch -M main && git push -u origin main
```
> `.gitignore` 已排除 `.dev.vars` 等密钥文件。菜谱/菜图不敏感，随仓库走没问题。

## 三、Cloudflare Pages

1. Cloudflare 面板 → **Workers & Pages → Create → Pages → Connect to Git** → 选这个仓库。
2. 构建设置：**Framework preset = None**，**Build command 留空**，**Build output directory = `/`**（本项目就是纯静态根目录，`functions/` 会被自动识别为 Functions）。
3. **Settings → Environment variables**（Production 和 Preview 都加）：
   | 变量 | 值 |
   |---|---|
   | `JSONBIN_KEY` | 第一步的 X-Master-Key |
   | `JSONBIN_BIN` | 第一步的 Bin ID |
   | `SYNC_TOKEN`  | 自己编一串够长的口令（如 `xiong-2026-家宴-8f3k...`） |
4. **Deploy**，拿到 `https://xxx.pages.dev`。

## 四、开启同步

手机/电脑打开站点 → **更多 → 云同步** → 把 `SYNC_TOKEN` 粘进输入框 → **连接**。
之后：**改动自动上传**、**打开自动按时间戳拉取**（云端更新才覆盖本地）。也可用「立即上传/拉取」手动触发。

- 换手机 / 清了缓存：装上 PWA、进「更多」粘同一口令 → 自动把云端菜单拉回来。
- 口令存在本机 localStorage、不写进代码；`/api/data` 校验它，错了就拒绝。

## 五、（可选）本地连 Function 调试

本地那个 `server.pl` 只是静态预览，跑不了 Function。要本地测同步：
```bash
npx wrangler pages dev . --compatibility-date=2024-01-01
```
并在根目录建 `.dev.vars`（已 gitignore）：
```
JSONBIN_KEY=...
JSONBIN_BIN=...
SYNC_TOKEN=...
```

---

## 注意 / 边界
- **只同步「菜单」文本**（选了哪些菜、勾选、命名）。成品图与合照是二进制、存本机 IndexedDB，**不上云**——换设备后菜图靠仓库内置的 `assets/dishes/`（有）、合照则需重新传。
- 单人云备份：**按 `updatedAt` 时间戳，后写覆盖**，不做多端合并。
- 想换成 Cloudflare KV/R2 当后端（连图片一起同步）以后可再升级，接口 `/api/data` 不变。
