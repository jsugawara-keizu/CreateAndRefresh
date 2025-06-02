#!/usr/bin/env node

const fs = require('fs');
const { execSync } = require('child_process');
const jsforce = require('jsforce');
const path = require('path');

const args = process.argv.slice(2);
if (args.length < 1) {
  console.error('❌ プロジェクト名を指定してください。\n使い方: node create_refresh_project.js <projectName> [orgAlias] [env(prod|sandbox)] [commit]');
  process.exit(1);
}
const projectName = args[0];
const orgAlias = args[1] || 'myOrg';
const env = args[2] || 'prod';
const doCommit = args[3] === 'commit';

const loginUrl = env === 'sandbox' ? 'https://test.salesforce.com' : 'https://login.salesforce.com';
console.log(`🌐 接続先: ${loginUrl}`);

const projectDir = path.join(process.cwd(), projectName);
const manifestDir = path.join(projectDir, 'manifest');
const packageXmlPath = path.join(manifestDir, 'package.xml');
const mainDir = path.join(projectDir, 'force-app', 'main');

// retrieve_result.json はプロジェクトフォルダに保存
const tmpResultPath = path.join(projectDir, 'retrieve_result.json');

// 初期の除外対象（空）
const initialExcludeTypes = [];

(async () => {
  if (!fs.existsSync(path.join(projectDir, 'sfdx-project.json'))) {
    console.log(`✅ SFDXプロジェクト "${projectName}" を新規作成`);
    execSync(`sf project generate --name ${projectName}`, { stdio: 'inherit', maxBuffer: 10 * 1024 * 1024 });
  } else {
    console.log(`✅ 既存のプロジェクト "${projectName}" を使用`);
  }

  try {
    execSync(`sf org display --target-org ${orgAlias}`, { stdio: 'inherit', maxBuffer: 10 * 1024 * 1024 });
    console.log(`✅ Org alias "${orgAlias}" は既に認証済み`);
  } catch {
    console.log(`🔑 Org alias "${orgAlias}" の認証を開始...`);
    execSync(`sf org login web --alias ${orgAlias} --instance-url ${loginUrl}`, { stdio: 'inherit', maxBuffer: 10 * 1024 * 1024 });
  }

  let latestVersion;
  try {
    const output = execSync(`sf org display --target-org ${orgAlias} --json`, { maxBuffer: 10 * 1024 * 1024 });
    const result = JSON.parse(output.toString());

    const conn = new jsforce.Connection({
      instanceUrl: result.result.instanceUrl,
      accessToken: result.result.accessToken
    });

    const versions = await conn.request('/services/data');
    latestVersion = versions[versions.length - 1].version;

    console.log(`✅ 最新APIバージョンは ${latestVersion}`);
  } catch (err) {
    console.error('❌ 最新APIバージョンの取得に失敗しました:', err.message);
    process.exit(1);
  }

  console.log('📋 sfdx force:mdapi:describemetadata からメタデータ型一覧を取得中...');
  let metadataTypes = [];
  try {
    const typeListOutput = execSync(`sfdx force:mdapi:describemetadata --targetusername ${orgAlias} --apiversion ${latestVersion} --json`, { cwd: projectDir, maxBuffer: 10 * 1024 * 1024 });
    const typeListJson = JSON.parse(typeListOutput.toString());
    metadataTypes = typeListJson.result.metadataObjects.map(t => t.xmlName);
    console.log(`✅ ${metadataTypes.length} 件のメタデータ型を取得しました`);
  } catch (err) {
    console.error('❌ メタデータ型一覧の取得に失敗しました:', err.message);
    process.exit(1);
  }

  await runRetrieveWithRetries(metadataTypes, latestVersion, initialExcludeTypes, 50);
  runGitCommitIfNeeded();
})();

// ======== Retrieve実行関数（完全改修＋maxBuffer＋保存場所修正） ========
async function runRetrieveWithRetries(metadataTypes, latestVersion, excludeTypes, maxRetries = 50) {
  let attempt = 0;
  const dynamicExcludeTypes = [...excludeTypes];

  while (attempt < maxRetries) {
    attempt++;
    console.log(`⚙️ Retrieve試行 ${attempt}回目（除外: ${dynamicExcludeTypes.join(', ') || 'なし'}）`);

    if (!fs.existsSync(manifestDir)) fs.mkdirSync(manifestDir, { recursive: true });

    let packageXml =
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<Package xmlns="http://soap.sforce.com/2006/04/metadata">\n';

    metadataTypes
      .filter(type => !dynamicExcludeTypes.includes(type))
      .forEach((type) => {
        packageXml += `  <types>\n`;
        packageXml += `    <members>*</members>\n`;
        packageXml += `    <name>${type}</name>\n`;
        packageXml += `  </types>\n`;
      });

    packageXml += `  <version>${latestVersion}</version>\n`;
    packageXml += '</Package>\n';

    fs.writeFileSync(packageXmlPath, packageXml, 'utf8');
    console.log(`✅ package.xml（APIバージョン ${latestVersion}）を作成しました`);

    if (fs.existsSync(mainDir)) {
      console.log('🧹 既存 force-app/main ディレクトリを削除します');
      fs.rmSync(mainDir, { recursive: true, force: true });
    }

    try {
      const retrieveOutput = execSync(
        `sf project retrieve start --manifest manifest/package.xml --target-org ${orgAlias} --json`,
        { cwd: projectDir, maxBuffer: 10 * 1024 * 1024 }
      );

      fs.writeFileSync(tmpResultPath, retrieveOutput);
      const retrieveJson = JSON.parse(fs.readFileSync(tmpResultPath, 'utf8'));
      fs.unlinkSync(tmpResultPath);

      if (retrieveJson.status === 0) {
        console.log('✅ メタデータのダウンロード＆force-app/main への直接展開完了');
        return;
      } else {
        handleRetrieveErrors(retrieveJson, dynamicExcludeTypes);
      }
    } catch (err) {
      console.warn('⚠️ コマンド実行例外をキャッチしました');

      let rawOutput = '';
      if (err.stdout) {
        rawOutput = err.stdout.toString();
      } else if (err.stderr) {
        rawOutput = err.stderr.toString();
      } else {
        rawOutput = err.message;
      }

      fs.writeFileSync(tmpResultPath, rawOutput);
      console.warn(`⚠️ エラー確認用に ${tmpResultPath} を保存しました`);

      try {
        const retrieveJson = JSON.parse(rawOutput);
        handleRetrieveErrors(retrieveJson, dynamicExcludeTypes);
      } catch (jsonErr) {
        console.error('❌ 保存内容はJSONとして解析できませんでした。内容を確認してください。');
        process.exit(1);
      }
    }
  }

  console.error('❌ 最大リトライ回数を超えました（50回）。処理を中止します。');
  process.exit(1);
}

// ======== エラーハンドリング関数 ========
function handleRetrieveErrors(retrieveJson, dynamicExcludeTypes) {
  const jsonString = JSON.stringify(retrieveJson);
  const matches = [...jsonString.matchAll(/Missing metadata type definition in registry for id '([^']+)'/g)];

  if (matches.length > 0) {
    matches.forEach(match => {
      const missingType = match[1];
      if (!dynamicExcludeTypes.includes(missingType)) {
        console.warn(`⚠️ Missing type '${missingType}' 検出、除外リストに追加して再試行します`);
        dynamicExcludeTypes.push(missingType);
      }
    });
  } else {
    console.error('❌ 取得失敗（詳細不明）:', retrieveJson);
    process.exit(1);
  }
}

// ======== Git Commit 実行関数 ========
function runGitCommitIfNeeded() {
  if (doCommit) {
    console.log('🔧 Git Commitを実行中...');
    try {
      const gitDir = path.join(projectDir, '.git');
      if (!fs.existsSync(gitDir)) {
        console.log('🛠 Gitリポジトリが存在しないため git init を実行します');
        execSync(`git init`, { stdio: 'inherit', cwd: projectDir, maxBuffer: 10 * 1024 * 1024 });
      }

      execSync(`git add .`, { stdio: 'inherit', cwd: projectDir, maxBuffer: 10 * 1024 * 1024 });
      const commitMessage = `Update metadata from ${orgAlias} (${env}) on ${new Date().toISOString()}`;
      execSync(`git commit -m "${commitMessage}"`, { stdio: 'inherit', cwd: projectDir, maxBuffer: 10 * 1024 * 1024 });
      console.log('✅ Git Commit 完了！');
    } catch (err) {
      console.error('❌ Git Commit エラー:', err.message);
    }
  } else {
    console.log('⚠️ Git Commitはスキップされました（commit オプションが指定されていません）');
  }
}