# 今天不加班

一款每天更新的复古像素潜行解谜网页游戏：拿到门禁卡，观察老板的当前/下一步视野，在临时会议开始前溜进电梯。

**在线试玩：** [https://shuaitang04-eng.github.io/no-overtime-game/](https://shuaitang04-eng.github.io/no-overtime-game/)

## 玩法

- 每天 00:00（北京时间）生成一张全员相同的 10×8 办公室地图。
- 使用方向键、WASD、空格，或触屏点按/方向键移动和等待。
- 先拿黄色门禁卡，再到紫色电梯；红色区域是老板当前视野，金色框是下一步位置与视野。
- 第一次被发现会回到工位、丢失门禁卡并增加怀疑；第二次被发现或 30 回合耗尽即失败。
- 每日有两个可预告事件：临时会议、停电或清洁车封路。
- 当天可以无限重试；浏览器本地记录最佳回合和连续通关天数。

## 本地开发

需要 Node.js 24（或兼容当前 Vite 的 Node.js LTS）和 npm。

```bash
npm install
npm run dev
```

常用命令：

```bash
npm run check       # TypeScript + Vitest
npm run test:e2e    # Playwright 桌面/手机浏览器测试
npm run build       # 生产构建到 dist/
npm run preview     # 本地预览生产构建
```

## 实现说明

- **技术：** TypeScript、HTML Canvas、Vite；无运行时框架、后端、账号或网络 API。
- **每日一致：** `Asia/Shanghai` 日期与规则版本经固定哈希和 PRNG 生成关卡；地图、门禁卡、巡逻及事件顺序均可复现。
- **可解验证：** 状态空间求解器会拒绝无解、无需门禁卡或过短的候选；测试批量覆盖完整闰年日期。
- **本地数据：** 教程、静音、每日最佳和连续天数保存在版本化 `localStorage` 中，损坏数据会安全回退。
- **像素与声音：** 16×16 逻辑像素的原创代码绘制素材，整数倍最近邻缩放；Web Audio 合成四类短音效，无外部素材许可证依赖。

## 发布

推送到 `main` 后，GitHub Actions 会依次运行类型检查、单元测试、桌面/手机浏览器测试和生产构建；全部通过后自动部署到 GitHub Pages。

## License

[MIT](LICENSE)
《今天不加班》每日像素潜行解谜网页游戏
