# refresh-project-cli

🇯🇵 Salesforceメタデータプロジェクトを作成・更新するCLIツール  
🇺🇸 CLI tool to create and refresh Salesforce metadata projects

---

## 📖 Overview / 概要

🇯🇵 このツールは以下を支援します：  
✅ Salesforce SFDXプロジェクトの生成（存在しない場合）  
✅ 指定Orgへの認証  
✅ 全メタデータタイプを含むpackage.xmlの生成  
✅ 標準オブジェクト、レポート、ダッシュボード、メールテンプレート、その他Lightningメタデータの取得対応  
✅ 最新メタデータのforce-app/mainへのダウンロード  
✅ オプションでGitへの自動コミット

🇺🇸 This tool helps you:  
✅ Generate a Salesforce SFDX project (if not present)  
✅ Authenticate to a target org  
✅ Generate a package.xml with all metadata types  
✅ Supports retrieving standard objects, reports, dashboards, email templates, and other Lightning metadata  
✅ Download latest metadata into force-app/main  
✅ Optionally auto-commit to Git

---

## 🛠 Installation / インストール

✅ 必要条件 / Requirements:  
- [Node.js](https://nodejs.org/) installed  
- [Salesforce CLI (sf)](https://developer.salesforce.com/tools/sfcli) installed and authenticated

🇯🇵 グローバルインストール（ローカルディレクトリから）：  
🇺🇸 To install globally from local directory:
```bash
npm install -g .
```

---

## 🚀 Usage / 使い方

```bash
refresh-project <projectName> <orgAlias> [env] [commit]
```

| Parameter          | 🇯🇵 説明                                              | 🇺🇸 Description                                                        |
|--------------------|-----------------------------------------------------|----------------------------------------------------------------------|
| `projectName`      | プロジェクト名またはパス                             | Project name or path                                                 |
| `orgAlias`         | 接続するSalesforce組織のエイリアス                   | Alias of the target Salesforce org                                   |
| `env` (optional)   | 'prod' または 'sandbox'（デフォルトは 'prod')        | 'prod' or 'sandbox' (default is 'prod')                             |
| `commit` (optional)| 指定するとGitに自動コミット                          | If specified, auto-commit changes to Git                             |

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
