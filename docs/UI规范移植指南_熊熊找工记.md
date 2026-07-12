# 熊熊找工记 · UI 改造指南（对齐「新熊记」Cozy Clean Cookbook 规范）

> 给另一台设备上的 Claude：这是一份**自包含**的改造说明，不需要其他上下文。
> 目标：把本项目（熊熊找工记，纯前端 PWA）的视觉改成与姊妹项目「新熊记」一致的
> **Cozy Clean Cookbook** 风格，并**重点修复底部 Tab 条**（当前问题：全宽扁条、图标偏小、
> Tab 条正下方有一截白色区域）。
> 改完请在真机 iPhone PWA 上验证，并把本次改动记录进项目自己的 PRD/文档。

---

## 0. 当前 Tab 条的三个病因（先诊断后动手）

看截图，旧 Tab 条的问题及原因：

1. **正下方一截白色区域** —— 没有处理 iPhone 的底部安全区（Home 指示条）。
   典型错误：`position:fixed; bottom:0` 的白底条自身没有 `padding-bottom: env(safe-area-inset-bottom)`，
   或页面 `<meta name="viewport">` 缺 `viewport-fit=cover`，导致系统自动垫出一块白。
2. **条特别宽** —— 全宽贴边的"平板条"设计。新规范用**浮起的圆角胶囊容器**（居中、
   左右留边、限制最大宽度），下方露出页面奶油底色，白块问题随之消失。
3. **图标偏小** —— 图标显示尺寸没定标准。规范为 **28–34px**（推荐 30px），
   active 态图标底下加**蛋黄色胶囊**。

> ⚠️ 修复第 1 点的前提：页面背景不能是纯白。整页底色要换成规范的奶油色（见下），
> 浮起 Tab 条下方露出的就是奶油底，视觉自然。

---

## 1. 设计 DNA（一句话）

奶油底、卡片白、**巧克力细描边**、番茄红主按钮、蛋黄黄强调、圆胖 pill、
少量装饰、像"温暖小厨房/生活模拟游戏"的亲切感。避免：纯白大底、强阴影、
玻璃拟物、高饱和大色块、复刻任何现有 IP。

## 2. 色板（直接整块粘贴到 CSS）

```css
:root {
  --cream: #FFF7EA;      /* 页面底 */
  --warm-blob: #FFF1D9;  /* 柔和色块 / 占位底 */
  --card: #FFFCF4;       /* 卡片 */
  --butter: #FFD76A;     /* 蛋黄黄：active 胶囊 / 强调标签 */
  --butter-soft: #FFECBE;
  --tomato: #FF806B;     /* 主 CTA */
  --tomato-ink: #E0563F; /* 番茄系文字强调 */
  --blush: #FFB9B0;
  --mint: #BEEFD8;
  --sky: #B7EEF0;
  --leaf: #8EC66A;
  --ink: #4C2A22;        /* 巧克力：主文字 */
  --ink-soft: #8A7A70;   /* 暖灰：次级文字 */
  --outline: #6B4A38;    /* 巧克力细描边：按钮/胶囊/输入框（这套规范的灵魂） */
  --press: rgba(76, 42, 34, .28); /* 按钮底部“贴纸”硬阴影 */
  --line: #E9C9A6;       /* 浅米棕描边：大卡片 */
  --line-soft: #F0DFC4;
  --shadow: 0 6px 20px rgba(76, 42, 34, .10);
  --shadow-sm: 0 2px 8px rgba(76, 42, 34, .06);
  --on-butter: #4C2A22;  /* 蛋黄底上的文字永远巧克力色（深色模式也不变） */
  --safe-top: env(safe-area-inset-top, 0px);
  --safe-bot: env(safe-area-inset-bottom, 0px);
  --tabbar-h: 66px;
  --r-card: 24px;
  --r-lg: 28px;
}
/* 深色模式（可选做；做的话两个选择器都要，支持手动切换+跟随系统） */
:root[data-theme="dark"] {
  --cream:#241a13; --warm-blob:#2e2318; --card:#2b2018;
  --butter:#ffcf5c; --butter-soft:#4a3a1c;
  --tomato:#ff8b76; --tomato-ink:#ffb0a0;
  --blush:#6b4038; --mint:#2f4a3d; --sky:#2c4548; --leaf:#6ea34e;
  --ink:#f6ecdd; --ink-soft:#b8a892;
  --outline:#8a6b52; --press:rgba(0,0,0,.45);
  --line:#4a3a28; --line-soft:#3a2e20;
  --shadow:0 6px 20px rgba(0,0,0,.35); --shadow-sm:0 2px 8px rgba(0,0,0,.25);
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) { /* 同上面 dark 整块复制一份 */ }
}
```

用色比例：奶油底 70% / 卡片白 20% / 番茄·蛋黄·薄荷等点缀 10%。
本项目原有的公司色条（红/蓝/紫区分公司）**可以保留**当作卡片左侧色条，属于"点缀 10%"。

## 3. 页面底色 & 字体（iOS 重绘坑，务必照做）

```css
html { background: var(--cream); }
/* 主题背景画在 body 上（iOS 切主题时 html 根背景不重绘会露旧色块；body 正常）。
   两枚奶油圆斑并进 body 背景层做点缀。 */
body {
  margin: 0;
  min-height: 100vh;
  min-height: 100dvh;
  background-color: var(--cream);
  background-image:
    radial-gradient(closest-side, var(--warm-blob) 99%, transparent 100%),
    radial-gradient(closest-side, var(--warm-blob) 99%, transparent 100%);
  background-size: 440px 440px, 380px 380px;
  background-position: calc(100% + 150px) -170px, -160px calc(100% + 150px);
  background-repeat: no-repeat;
  color: var(--ink);
  font-family: ui-rounded, "SF Pro Rounded", -apple-system, BlinkMacSystemFont,
    "PingFang SC", "MiSans", "Noto Sans SC", "Microsoft YaHei", system-ui, sans-serif;
  font-size: 16px; line-height: 1.5; -webkit-font-smoothing: antialiased;
}
```

HTML head 必须有（安全区生效的前提）：

```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1">
<meta name="theme-color" content="#FFF7EA">
```

排版：页面大标题 28px/800/字距 1px；卡片标题 15–17px/600–700；正文 15–16px；
标签 11–13px/600。次级文字用 `--ink-soft`。

## 4. ⭐ 底部 Tab 条（本次重点，整块替换）

**浮起圆角胶囊容器**：居中、限宽、圆角 28、米棕描边、柔和阴影；
active 图标底加**蛋黄胶囊**。下方自然露出奶油底 —— 白块问题不复存在。

HTML 结构（图标必须包一层 `span.tab-ic-wrap`，iOS 上直接给 `<img>` 设背景色不可靠）：

```html
<nav class="tabbar" id="tabbar">
  <button class="tab on" data-tab="home">
    <span class="tab-ic-wrap"><img class="tab-ic" src="assets/icons/tab_home.png" alt=""></span>
    <span class="tab-label">首页</span>
  </button>
  <button class="tab" data-tab="settings">
    <span class="tab-ic-wrap"><img class="tab-ic" src="assets/icons/tab_settings.png" alt=""></span>
    <span class="tab-label">设置</span>
  </button>
</nav>
```

CSS（可原样粘贴）：

```css
.tabbar {
  position: fixed; left: 50%; transform: translateX(-50%);
  bottom: calc(var(--safe-bot) + 10px);          /* 浮起：底部留出安全区 + 10px */
  width: calc(100% - 24px); max-width: 460px;    /* 两个 tab 也用同宽度，居中即可 */
  height: var(--tabbar-h);
  background: var(--card); border: 1.5px solid var(--line); border-radius: var(--r-lg);
  display: flex; z-index: 50; box-shadow: var(--shadow); overflow: hidden;
}
.tab { flex: 1; border: none; background: none; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 3px; color: var(--ink-soft); cursor: pointer; }
.tab-ic-wrap { display: inline-flex; align-items: center; justify-content: center;
  padding: 4px 16px; border-radius: 16px; transition: background-color .15s; }
.tab-ic { width: 30px; height: 30px; object-fit: contain; opacity: .82; display: block; }
.tab.on { color: var(--ink); }
.tab.on .tab-ic-wrap { background-color: var(--butter); }
.tab.on .tab-ic { opacity: 1; }
.tab-label { font-size: 11px; font-weight: 600; }
```

**内容区**必须给 Tab 条让位（否则最后一屏内容被盖住）：

```css
#app /* 或你的内容容器 */ {
  padding: calc(var(--safe-top) + 10px) 20px calc(var(--tabbar-h) + var(--safe-bot) + 30px);
  max-width: 640px; margin: 0 auto;
}
```

同时**删掉旧的全宽白底 Tab 条样式**（包括任何 `bottom:0` 白色 fixed 条、
以及为它预留的白色 padding/占位元素）——白块就是它们留下的。

图标资产：透明底 PNG、源图 ≥160px、显示 30px；active 只靠蛋黄胶囊区分，
不要额外加阴影。本项目已有的熊熊图标可直接用。

## 5. 按钮 / 卡片 / 胶囊（组件语言）

**贴纸感按钮**（描边 + 底部硬阴影 + 按下下沉）：

```css
.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  border: 1.5px solid var(--outline); border-radius: 999px;
  font-size: 16px; font-weight: 700; padding: 11px 20px;
  cursor: pointer; background: var(--card); color: var(--ink);
  box-shadow: 0 2.5px 0 var(--press); transition: transform .06s, box-shadow .06s;
}
.btn:active { transform: translateY(2px); box-shadow: 0 .5px 0 var(--press); }
.btn.primary { background: var(--tomato); color: #fff; text-shadow: 0 1px 0 rgba(76,42,34,.22); }
.btn.secondary { background: var(--butter); color: var(--on-butter); }
```

浮动的 “＋” 新建按钮（原紫色圆钮）改为：番茄红底白 “＋”、
`border:1.5px solid var(--outline)`、`box-shadow: 0 3px 0 var(--press)`，
位置 `bottom: calc(var(--tabbar-h) + var(--safe-bot) + 24px)`。

**卡片**（职位卡）：

```css
.card {
  background: var(--card); border: 1.5px solid var(--line); border-radius: var(--r-card);
  box-shadow: var(--shadow-sm); padding: 14px 16px;
}
```

公司色条保留：卡片内左侧 4px 圆角色条（现状即可，属于点缀色）。
进度条：底槽 `--line-soft`、进度色可沿用公司色或用 `--leaf`，高度 6–8px、圆头。
"进行中 · 1/7" 这类状态字用 `--ink-soft` 13px。

**小胶囊 chips**（筛选、状态标签）：

```css
.chip { display: inline-flex; align-items: center; gap: 4px; padding: 5px 12px;
  background: var(--card); border: 1.2px solid var(--outline); border-radius: 999px;
  font-size: 13px; font-weight: 600; color: var(--ink); }
.chip.on { background: var(--butter); color: var(--on-butter); }
```

**输入框**：`border:1.5px solid var(--outline); border-radius:999px;（多行 16px）
background: var(--card);`

## 6. 已踩过的坑（照抄可避免返工）

1. **蛋黄底永远配巧克力字**（`--on-butter`）：深色模式下若用浅色字会看不清。
2. **iOS 给 `<img>` 元素本身设背景色不可靠** → active 胶囊放在外层 `span.tab-ic-wrap` 上。
3. **主题背景画 body 不画 html**（iOS 切主题 html 不重绘，露旧色块）。
4. **带 CSS transition 的元素**，切换后立刻 `getComputedStyle` 读背景可能误报 transparent，
   验证样式时先临时关 transition 再读。
5. 触达目标 ≥44pt；`maximum-scale=1` 防 iOS 输入框聚焦自动放大。
6. 如果是 PWA + Service Worker：发版记得升缓存版本号，否则真机看不到新样式。

## 7. 验收清单（真机 iPhone PWA 逐项过）

- [ ] Tab 条浮起、圆角、居中限宽；**下方无白块**，露出的是奶油底
- [ ] Home 指示条区域不遮 Tab 条（安全区生效）
- [ ] active tab 图标底下有蛋黄胶囊、文字巧克力色；inactive 暖灰
- [ ] 图标显示 30px 左右、清晰不糊
- [ ] 页面底色奶油 #FFF7EA、卡片米白带 1.5px 米棕描边、圆角 24
- [ ] 按钮是 pill、有巧克力描边和按下下沉手感；主按钮番茄红白字
- [ ] 最底部内容不被 Tab 条遮挡（内容区 padding-bottom 已让位）
- [ ] （若做了深色模式）明亮/夜晚/跟随系统三态都正常、蛋黄底文字始终可读
