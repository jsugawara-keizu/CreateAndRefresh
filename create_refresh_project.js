#!/usr/bin/env node

// 🇯🇵 必要なモジュールを読み込み / 🇺🇸 Load required modules
const fs = require('fs');
const { execSync } = require('child_process');
const jsforce = require('jsforce');
const path = require('path');

// 🇯🇵 コマンドライン引数の取得 / 🇺🇸 Get command-line arguments
const args = process.argv.slice(2);
if (args.length < 1) {
  console.error('❌ 🇯🇵 プロジェクト名を指定してください / 🇺🇸 Please specify the project name.\nUsage: node create_refresh_project.js <projectName> [orgAlias] [env(prod|sandbox)] [commit]');
  process.exit(1);
}

// 🇯🇵 コマンドライン引数の設定 / 🇺🇸 Set variables from arguments
const projectName = args[0];
const orgAlias = args[1] || 'myOrg';
const env = args[2] || 'prod';
const doCommit = args[3] === 'commit';

// 🇯🇵 接続URLを設定（本番 or Sandbox） / 🇺🇸 Set login URL (prod or sandbox)
const loginUrl = env === 'sandbox' ? 'https://test.salesforce.com' : 'https://login.salesforce.com';
console.log(`🌐 接続先 / Target: ${loginUrl}`);

// 🇯🇵 各種パス設定 / 🇺🇸 Define important paths
const projectDir = path.resolve(projectName);
const manifestDir = path.join(projectDir, 'manifest');
const packageXmlPath = path.join(manifestDir, 'package.xml');
const mainDir = path.join(projectDir, 'force-app', 'main');
const tmpResultPath = path.join(projectDir, 'retrieve_result.json');
const initialExcludeTypes = [];

// 🇯🇵 Lightning系補完タイプ / 🇺🇸 Lightning-related metadata types to supplement
const lightningTypes = [
  'LightningComponentBundle',
  'LightningPage',
  'LightningExperienceTheme',
  'LightningEmailTemplate',
  'ContentAsset'
];

// 🇯🇵 特殊・最新メタデータタイプ補完 / 🇺🇸 Special and latest metadata types to supplement
const specialTypes = [
  'MktDataSources',
  'ExtDataTranObjectTemplates',
  'DataStreamTemplates',
  'DataSrcDataModelFieldMaps',
  'DataSourceBundleDefinitions',
  'EinsteinDiscoveryTemplate',
  'WaveTemplateBundle',
  'WaveApplication',
  'ExternalCredential',
  'NamedCredential',
  'ExternalServiceRegistration',
  'B2BCatalog',
  'B2CExperienceProfile'
];

// 🇯🇵 フォルダ型アイテムの個別取得関数 / 🇺🇸 Helper function to fetch folder-based items
async function fetchFolderItems(conn, folderType, itemType, apiVersion) {
  let results = [];
  try {
    const folders = await conn.metadata.list({ type: folderType }, apiVersion);
    const folderList = Array.isArray(folders) ? folders : folders ? [folders] : [];
    console.log(`✅ ${folderType} 取得数 / Retrieved folders: ${folderList.length}`);

    for (const folder of folderList) {
      const items = await conn.metadata.list({ type: itemType, folder: folder.fullName }, apiVersion);
      if (items) {
        const itemList = Array.isArray(items) ? items : [items];
        results.push(...itemList.map(i => i.fullName));
      }
    }
  } catch (err) {
    console.warn(`⚠️ ${itemType} の取得失敗（スキップ） / Failed to fetch ${itemType} (skipping): ${err.message}`);
  }
  return results;
}

(async () => {
  // 🇯🇵 SFDXプロジェクトがない場合、新規作成 / 🇺🇸 Generate SFDX project if it does not exist
  if (!fs.existsSync(path.join(projectDir, 'sfdx-project.json'))) {
    console.log(`✅ プロジェクト "${projectName}" を新規作成 / Generating new project "${projectName}"`);
    execSync(`sf project generate --name ${projectName}`, { stdio: 'inherit', maxBuffer: 100 * 1024 * 1024 });
  } else {
    console.log(`✅ 既存プロジェクトを使用 / Using existing project`);
  }

  // 🇯🇵 Org認証確認 / 🇺🇸 Check org authentication
  try {
    execSync(`sf org display --target-org ${orgAlias}`, { stdio: 'inherit', maxBuffer: 100 * 1024 * 1024 });
    console.log(`✅ Org "${orgAlias}" は認証済み / Org "${orgAlias}" is authenticated`);
  } catch {
    console.log(`🔑 Org "${orgAlias}" の認証を開始 / Starting authentication`);
    execSync(`sf org login web --alias ${orgAlias} --instance-url ${loginUrl}`, { stdio: 'inherit', maxBuffer: 100 * 1024 * 1024 });
  }

  let latestVersion, conn, standardObjects, reports, dashboards, documents, emails, notifications;
  try {
    // 🇯🇵 最新APIバージョンを取得 / 🇺🇸 Get latest API version
    const output = execSync(`sf org display --target-org ${orgAlias} --json`, { maxBuffer: 100 * 1024 * 1024 });
    const result = JSON.parse(output.toString());
    conn = new jsforce.Connection({
      instanceUrl: result.result.instanceUrl,
      accessToken: result.result.accessToken
    });
    const versions = await conn.request('/services/data');
    latestVersion = versions[versions.length - 1].version;
    console.log(`✅ 最新APIバージョン: ${latestVersion}`);
  } catch (err) {
    console.error('❌ APIバージョン取得失敗 / Failed to fetch API version:', err.message);
    process.exit(1);
  }

  let metadataTypes = [];
  try {
    // 🇯🇵 メタデータ型一覧取得 / 🇺🇸 Fetch metadata type list
    const typeListOutput = execSync(`sfdx force:mdapi:describemetadata --targetusername ${orgAlias} --apiversion ${latestVersion} --json`, { cwd: projectDir, maxBuffer: 100 * 1024 * 1024 });
    const typeListJson = JSON.parse(typeListOutput.toString());
    metadataTypes = typeListJson.result.metadataObjects.map(t => t.xmlName);
    console.log(`✅ メタデータ型取得数: ${metadataTypes.length}`);
  } catch (err) {
    console.error('❌ メタデータ型一覧取得失敗 / Failed to fetch metadata types:', err.message);
    process.exit(1);
  }

  // 🇯🇵 Lightning系・特殊系タイプを補完追加 / 🇺🇸 Add Lightning & special metadata types
  [...lightningTypes, ...specialTypes].forEach(type => {
    if (!metadataTypes.includes(type)) {
      metadataTypes.push(type);
      console.log(`🔧 タイプ '${type}' を補完追加 / Added '${type}'`);
    }
  });

  // 🇯🇵 標準オブジェクトの一覧取得 / 🇺🇸 Fetch standard objects
  try {
    const globalDescribe = await conn.describeGlobal();
    standardObjects = globalDescribe.sobjects.filter(s => !s.custom).map(s => s.name);
    console.log(`✅ 標準オブジェクト取得数: ${standardObjects.length}`);
  } catch (err) {
    console.error('❌ 標準オブジェクト取得失敗 / Failed to fetch standard objects:', err.message);
    process.exit(1);
  }

  // 🇯🇵 各種フォルダ型アイテムを取得 / 🇺🇸 Fetch folder-based items
  reports = await fetchFolderItems(conn, 'ReportFolder', 'Report', latestVersion);
  dashboards = await fetchFolderItems(conn, 'DashboardFolder', 'Dashboard', latestVersion);
  documents = await fetchFolderItems(conn, 'DocumentFolder', 'Document', latestVersion);
  emails = await fetchFolderItems(conn, 'EmailFolder', 'EmailTemplate', latestVersion);

  // 🇯🇵 通知タイプの取得 / 🇺🇸 Fetch notification types
  try {
    const notifList = await conn.metadata.list({ type: 'NotificationTypeConfig' }, latestVersion);
    notifications = (Array.isArray(notifList) ? notifList : notifList ? [notifList] : []).map(n => `${n.fullName}`);
    console.log(`✅ 通知タイプ取得数: ${notifications.length}`);
  } catch (err) {
    console.warn(`⚠️ 通知タイプ取得失敗（スキップ） / Failed to fetch notification types (skipping): ${err.message}`);
    notifications = [];
  }

  // 🇯🇵 メイン処理呼び出し / 🇺🇸 Run main retrieve logic
  await runRetrieveWithRetries(metadataTypes, standardObjects, reports, dashboards, documents, emails, notifications, latestVersion, initialExcludeTypes, 50);
  runGitCommitIfNeeded();
})();

// 🇯🇵 メタデータ取得をリトライしながら実行する関数 / 🇺🇸 Function to run metadata retrieve with retries
async function runRetrieveWithRetries(metadataTypes, standardObjects, reports, dashboards, documents, emails, notifications, latestVersion, excludeTypes, maxRetries = 50) {
  let attempt = 0;
  const dynamicExcludeTypes = [...excludeTypes]; // 🇯🇵 動的除外リスト / 🇺🇸 Dynamic exclude list

  while (attempt < maxRetries) {
    attempt++;
    console.log(`⚙️ Retrieve試行 ${attempt}回目 / Retrieve attempt ${attempt}`);

    // 🇯🇵 manifestフォルダがなければ作成 / 🇺🇸 Create manifest directory if missing
    if (!fs.existsSync(manifestDir)) fs.mkdirSync(manifestDir, { recursive: true });

    // 🇯🇵 package.xmlの組み立て開始 / 🇺🇸 Start building package.xml
    let packageXml =
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<Package xmlns="http://soap.sforce.com/2006/04/metadata">\n';

    // 🇯🇵 各メタデータタイプをループ / 🇺🇸 Loop through metadata types
    metadataTypes
      .filter(type => !dynamicExcludeTypes.includes(type))
      .forEach((type) => {
        if (type === 'CustomObject') {
          // 🇯🇵 標準オブジェクトを個別指定 / 🇺🇸 List standard objects individually
          standardObjects.forEach(obj => {
            packageXml += `  <types>\n    <members>${obj}</members>\n    <name>CustomObject</name>\n  </types>\n`;
          });
          packageXml += `  <types>\n    <members>*</members>\n    <name>CustomObject</name>\n  </types>\n`;
        } else if (type === 'Report' && reports.length > 0) {
          // 🇯🇵 レポート個別指定 / 🇺🇸 List reports individually
          packageXml += `  <types>\n`;
          reports.forEach(r => {
            packageXml += `    <members>${r}</members>\n`;
          });
          packageXml += `    <name>Report</name>\n  </types>\n`;
        } else if (type === 'Dashboard' && dashboards.length > 0) {
          // 🇯🇵 ダッシュボード個別指定 / 🇺🇸 List dashboards individually
          packageXml += `  <types>\n`;
          dashboards.forEach(d => {
            packageXml += `    <members>${d}</members>\n`;
          });
          packageXml += `    <name>Dashboard</name>\n  </types>\n`;
        } else if (type === 'Document' && documents.length > 0) {
          // 🇯🇵 ドキュメント個別指定 / 🇺🇸 List documents individually
          packageXml += `  <types>\n`;
          documents.forEach(doc => {
            packageXml += `    <members>${doc}</members>\n`;
          });
          packageXml += `    <name>Document</name>\n  </types>\n`;
        } else if (type === 'EmailTemplate' && emails.length > 0) {
          // 🇯🇵 メールテンプレート個別指定 / 🇺🇸 List email templates individually
          packageXml += `  <types>\n`;
          emails.forEach(e => {
            packageXml += `    <members>${e}</members>\n`;
          });
          packageXml += `    <name>EmailTemplate</name>\n  </types>\n`;
        } else if (type === 'NotificationTypeConfig' && notifications.length > 0) {
          // 🇯🇵 通知タイプ個別指定 / 🇺🇸 List notification types individually
          packageXml += `  <types>\n`;
          notifications.forEach(n => {
            packageXml += `    <members>${n}</members>\n`;
          });
          packageXml += `    <name>NotificationTypeConfig</name>\n  </types>\n`;
        } else {
          // 🇯🇵 その他はワイルドカード指定 / 🇺🇸 Use wildcard for other types
          packageXml += `  <types>\n    <members>*</members>\n    <name>${type}</name>\n  </types>\n`;
        }
      });

    packageXml += `  <version>${latestVersion}</version>\n`;
    packageXml += '</Package>\n';

    fs.writeFileSync(packageXmlPath, packageXml, 'utf8');
    console.log(`✅ package.xml 作成完了 (API version ${latestVersion})`);

    // 🇯🇵 既存のforce-app/mainを削除 / 🇺🇸 Remove existing force-app/main folder
    if (fs.existsSync(mainDir)) {
      console.log('🧹 既存force-app/mainを削除 / Removing existing force-app/main');
      fs.rmSync(mainDir, { recursive: true, force: true });
    }

    try {
      // 🇯🇵 メタデータの取得実行 / 🇺🇸 Execute metadata retrieve command
      const retrieveOutput = execSync(
        `sf project retrieve start --manifest manifest/package.xml --target-org ${orgAlias} --json`,
        { cwd: projectDir, maxBuffer: 100 * 1024 * 1024 }
      );

      fs.writeFileSync(tmpResultPath, retrieveOutput);
      const retrieveJson = JSON.parse(fs.readFileSync(tmpResultPath, 'utf8'));
      fs.unlinkSync(tmpResultPath);

      if (retrieveJson.status === 0) {
        console.log('✅ メタデータダウンロード完了 / Metadata download complete');
        return;
      } else {
        handleRetrieveErrors(retrieveJson, dynamicExcludeTypes);
      }
    } catch (err) {
      console.warn('⚠️ コマンド実行例外 / Command execution exception');
      const rawOutput = err.stdout ? err.stdout.toString() : err.message;
      fs.writeFileSync(tmpResultPath, rawOutput);
      console.warn(`⚠️ エラー内容を保存: ${tmpResultPath}`);
      try {
        const retrieveJson = JSON.parse(rawOutput);
        handleRetrieveErrors(retrieveJson, dynamicExcludeTypes);
      } catch {
        console.error('❌ 保存内容をJSON解析できません / Cannot parse saved content as JSON.');
        process.exit(1);
      }
    }
  }

  console.error('❌ 最大リトライ回数超過 / Exceeded maximum retry attempts');
  process.exit(1);
}

// 🇯🇵 取得エラーを解析し、問題のあるタイプを除外リストに追加 / 🇺🇸 Analyze retrieve errors and update exclusion list
function handleRetrieveErrors(retrieveJson, dynamicExcludeTypes) {
  const jsonString = JSON.stringify(retrieveJson);
  const matches = [...jsonString.matchAll(/Missing metadata type definition in registry for id '([^']+)'/g)];

  if (matches.length > 0) {
    matches.forEach(match => {
      const missingType = match[1];
      if (!dynamicExcludeTypes.includes(missingType)) {
        console.warn(`⚠️ '${missingType}' を除外対象に追加 / Adding '${missingType}' to exclude list`);
        dynamicExcludeTypes.push(missingType);
      }
    });
  } else {
    console.error('❌ 詳細不明の取得失敗 / Unknown retrieval failure:', retrieveJson);
    process.exit(1);
  }
}

// 🇯🇵 Gitコミットを実行する（オプション） / 🇺🇸 Run Git commit if needed (optional)
function runGitCommitIfNeeded() {
  if (doCommit) {
    console.log('🔧 Git Commit 実行中 / Running Git commit...');
    try {
      const gitDir = path.join(projectDir, '.git');
      if (!fs.existsSync(gitDir)) {
        console.log('🛠 Gitリポジトリ初期化 / Initializing Git repository');
        execSync(`git init`, { stdio: 'inherit', cwd: projectDir, maxBuffer: 100 * 1024 * 1024 });
      }
      execSync(`git add .`, { stdio: 'inherit', cwd: projectDir, maxBuffer: 100 * 1024 * 1024 });
      const commitMessage = `Update metadata from ${orgAlias} (${env}) on ${new Date().toISOString()}`;
      execSync(`git commit -m "${commitMessage}"`, { stdio: 'inherit', cwd: projectDir, maxBuffer: 100 * 1024 * 1024 });
      console.log('✅ Git Commit 完了 / Git commit complete');
    } catch (err) {
      console.error('❌ Git Commit エラー / Git commit error:', err.message);
    }
  } else {
    console.log('⚠️ Git Commitはスキップされました / Git commit was skipped');
  }
}