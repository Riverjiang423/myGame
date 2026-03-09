# 上线验收报告模板

## 1. 基本信息
- 项目：`mygame`
- 验收日期：`YYYY-MM-DD`
- 验收人：`<name>`
- 代码版本：`<git commit / tag>`
- 目标发布包：`dist/mygame-win64`
- 目标平台：`Windows x64`

## 2. 构建与分发信息
- 构建命令：`npm run dist:prepare`
- 分发入口：`dist/mygame-win64/launch-product.bat`
- 运行时：`dist/mygame-win64/runtime/node.exe`
- 关键资源状态：
  - [ ] `app/public/index.html`
  - [ ] `app/public/client.js`
  - [ ] `app/build/Release/libztaddon.node`
  - [ ] `app/third_party/libzt/winx64/libzt.dll`

## 3. 自动化测试结果摘要
- 执行命令：
  - `npm test`
  - `npm run release:check`
- 结果：
  - 总用例：`<n>`
  - 通过：`<n>`
  - 失败：`<n>`
  - 跳过：`<n>`
- 失败项（如有）：
  - `<test name / script check>`

## 4. 覆盖范围（自动化）
- 启动链路 smoke：`是/否`
- HTTP API（ping/network-info）：`是/否`
- 默认房间与分享信息：`是/否`
- Socket 联机主路径：`是/否`
- 房间生命周期（leave/owner transfer/cleanup）：`是/否`
- 断线重连（grace 内/外）：`是/否`
- 启动模式分支（local/preferred/required）：`是/否`
- 产品化行为（auto-open/logger mode）：`是/否`

## 5. 未覆盖风险
- `<风险1>`
- `<风险2>`
- `<风险3>`

## 6. 手工回归结果
- 使用清单：`docs/manual-regression-checklist.md`
- 执行范围：
  - [ ] Windows 启动体验
  - [ ] 首次启动体验
  - [ ] 默认房间显示与复制
  - [ ] 双端加入
  - [ ] 断线重连
  - [ ] 房主退出
  - [ ] libzt 回退表现
  - [ ] 自动打开浏览器
  - [ ] 产品/开发日志差异
- 手工缺陷记录：
  - `<issue id / summary>`

## 7. 分发资源检查结果
- 命令：`npm run release:check`
- 结果：`通过 / 失败`
- 缺失项：`<file list>`

## 8. 已知缺陷
- 严重：`<items>`
- 中等：`<items>`
- 轻微：`<items>`

## 9. 发布建议
- 结论：`可发 / 有条件可发 / 不建议发`
- 依据：
  1. `<依据1>`
  2. `<依据2>`
  3. `<依据3>`
- 发布前阻断项（必须完成）：
  - `<blocker 1>`
  - `<blocker 2>`
