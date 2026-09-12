# 同步器

此儲存庫提供 GitHub Pages 同步器網頁及擴充更新包，保留下注明細、總帳與自訂計算，不提供比價下單。

## 檔案分工

- `index.html`：網頁入口、下注明細與總帳畫面。
- `ledger-calculator.js`：依盤口分開的自訂總和及中獎除法。
- `remote-diagnostics.js`：裝置與同步狀態顯示。
- `tests/`：功能回歸檢查，不是額外功能，也不需逐檔帶到公司。
- `tools/`：擴充程式生成工具。
- `version.json`、`extension-version.json`、`synchronizer-extension.zip`：正式更新入口，維持根目錄以相容公司更新器。

## 開發檢查

在此儲存庫執行 `node --test`，會自動發現 `tests/` 全部測試。
在完整同步器專案內執行 `node tools/build-extension.mjs`，由相鄰 RuntimeData 的維護來源生成擴充入口與程式檔案清單。
僅下載此網頁儲存庫並不包含全部擴充維護來源；擴充測試需要完整專案。

本機測試網址及公司安裝說明請見完整專案根目錄 README.md。
私人同步權杖、網站密碼及 Chrome 設定不得加入此公開儲存庫。


共用維護紀錄保存在完整專案根目錄唯一的 AGENTS.md；詳細差異由 Git 歷史保存。
