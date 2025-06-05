# refresh-project-cli

🇯🇵 Salesforceメタデータプロジェクトを作成・更新するCLIツール  
🇺🇸 CLI tool to create and refresh Salesforce metadata projects

---

## 📖 Overview / 概要

🇯🇵 このツールは以下を支援します：
✅ Salesforce SFDXプロジェクトの生成（存在しない場合）  
✅ 指定Orgへの認証  
✅ 全メタデータタイプを含むpackage.xmlの生成  
✅ 最新メタデータのforce-app/mainへのダウンロード  
✅ オプションでGitへの自動コミット

🇺🇸 This tool helps you:
✅ Generate a Salesforce SFDX project (if not present)  
✅ Authenticate to a target org  
✅ Generate a package.xml with all metadata types  
✅ Download latest metadata into force-app/main  
✅ Optionally auto-commit to Git

---

## 🛠 Installation / インストール

✅ 必要条件 / Requirements:
- [Node.js](https://nodejs.org/) installed
- [Salesforce CLI (sf)](https://developer.salesforce.com/tools/sfcli) installed and authenticated
- `git` コマンドが使用可能 / Git command must be available

🇯🇵 グローバルインストール（ローカルディレクトリから）：  
🇺🇸 To install globally from local directory:

```bash
# 🇯🇵 新規インストールがうまくいかない場合は、まず npm update を実行してください  
# 🇺🇸 If global install fails, try running npm update first
npm update

# 🇯🇵 グローバルインストール / 🇺🇸 Global install
npm install -g .
```

⚠️ 🇯🇵 Windows環境で `sfdx` コマンドがうまく動作しない場合の対処方法：  
⚠️ 🇺🇸 If `sfdx` command does not work correctly on Windows:

```bash
sfdx plugins:uninstall salesforcedx
npm uninstall -g sfdx-cli
npm install -g sfdx-cli
```

---

## 🚀 Usage / 使い方

```bash
refresh-project <projectName> <orgAlias> [env] [commit]
```

| Parameter       | 🇯🇵 説明                                      | 🇺🇸 Description                                                 |
|-----------------|---------------------------------------------|---------------------------------------------------------------|
| `projectName`   | プロジェクト名またはパス                     | Project name or path                                          |
| `orgAlias`      | 接続するSalesforce組織のエイリアス           | Alias of the target Salesforce org                            |
| `env` (optional)| 'prod' または 'sandbox'（デフォルトは 'prod')| 'prod' or 'sandbox' (default is 'prod')                      |
| `commit` (optional)| 指定するとGitに自動コミット                 | If specified, auto-commit changes to Git                      |

---

### 🧩 Example / 実行例

🇯🇵 Production Orgから取得し自動コミット：  
🇺🇸 Retrieve from production org and auto-commit:
```bash
refresh-project myProject myOrgAlias prod commit
```

🇯🇵 Sandboxから取得（コミットなし）：  
🇺🇸 Retrieve from sandbox org without commit:
```bash
refresh-project myProject mySandboxAlias sandbox
```

---

## 🔧 Development / 開発

🇯🇵 開発中は以下を使うと便利です：  
🇺🇸 During development, you can link locally:
```bash
npm link
```

修正後は：
```bash
refresh-project <args>
```

解除するには：
```bash
npm unlink -g
```

---

## 📄 License / ライセンス

MIT License

© 2025 Your Name
