#!/usr/bin/env node

/**
 * create_refresh_project.js
 * 
 * 🇯🇵 Salesforceメタデータプロジェクトを作成・更新するCLIツール。
 * 🇺🇸 CLI tool to create and refresh a Salesforce metadata project.
 *
 * ✅ 主な機能 / Main Features:
 * - Salesforce SFDXプロジェクトが存在しない場合は新規作成
 *   (Generate a new Salesforce SFDX project if not already present)
 * - 指定のOrgに認証・接続
 *   (Authenticate and connect to the specified Salesforce org)
 * - package.xmlを全メタデータタイプで生成
 *   (Generate a package.xml with all available metadata types)
 * - 最新のメタデータをforce-app/mainにダウンロード
 *   (Retrieve the latest metadata into force-app/main)
 * - オプションでGitに自動コミット
 *   (Optionally auto-commit the changes to Git)
 */

const fs = require('fs');
const { execSync } = require('child_process');
const jsforce = require('jsforce');
const path = require('path');

const args = process.argv.slice(2);
if (args.length < 1) {
  console.error('❌ 🇯🇵 プロジェクト名を指定してください。 / 🇺🇸 Please specify the project name.\n使い方 / Usage: node create_refresh_project.js <projectName> [orgAlias] [env(prod|sandbox)] [commit]');
  process.exit(1);
}

const projectName = args[0];
const orgAlias = args[1] || 'myOrg';
const env = args[2] || 'prod';
const doCommit = args[3] === 'commit';

const loginUrl = env === 'sandbox' ? 'https://test.salesforce.com' : 'https://login.salesforce.com';
console.log(`🌐 🇯🇵 接続先 / 🇺🇸 Target: ${loginUrl}`);

const projectDir = path.resolve(projectName);
const manifestDir = path.join(projectDir, 'manifest');
const packageXmlPath = path.join(manifestDir, 'package.xml');
const mainDir = path.join(projectDir, 'force-app', 'main');
const tmpResultPath = path.join(projectDir, 'retrieve_result.json');

const initialExcludeTypes = [];

(async () => {
  // 🇯🇵 プロジェクト存在確認 / 🇺🇸 Check if SFDX project exists
  if (!fs.existsSync(path.join(projectDir, 'sfdx-project.json'))) {
    console.log(`✅ 🇯🇵 SFDXプロジェクト "${projectName}" を新規作成 / 🇺🇸 Generating new SFDX project "${projectName}"`);
    execSync(`sf project generate --name ${projectName}`, { stdio: 'inherit', maxBuffer: 10 * 1024 * 1024 });
  } else {
    console.log(`✅ 🇯🇵 既存のプロジェクト "${projectName}" を使用 / 🇺🇸 Using existing project "${projectName}"`);
  }

  // 🇯🇵 認証確認 / 🇺🇸 Check authentication
  try {
    execSync(`sf org display --target-org ${orgAlias}`, { stdio: 'inherit', maxBuffer: 10 * 1024 * 1024 });
    console.log(`✅ 🇯🇵 Orgエイリアス "${orgAlias}" は認証済み / 🇺🇸 Org alias "${orgAlias}" is already authenticated`);
  } catch {
    console.log(`🔑 🇯🇵 Orgエイリアス "${orgAlias}" の認証を開始 / 🇺🇸 Starting authentication for org alias "${orgAlias}"`);
    execSync(`sf org login web --alias ${orgAlias} --instance-url ${loginUrl}`, { stdio: 'inherit', maxBuffer: 10 * 1024 * 1024 });
  }

  // 🇯🇵 最新APIバージョン取得 / 🇺🇸 Fetch latest API version
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
    console.log(`✅ 🇯🇵 最新APIバージョン: ${latestVersion} / 🇺🇸 Latest API version: ${latestVersion}`);
  } catch (err) {
    console.error('❌ 🇯🇵 最新APIバージョンの取得に失敗 / 🇺🇸 Failed to fetch latest API version:', err.message);
    process.exit(1);
  }

  // 🇯🇵 メタデータ型一覧取得 / 🇺🇸 Fetch metadata types
  let metadataTypes = [];
  try {
    const typeListOutput = execSync(`sfdx force:mdapi:describemetadata --targetusername ${orgAlias} --apiversion ${latestVersion} --json`, { cwd: projectDir, maxBuffer: 10 * 1024 * 1024 });
    const typeListJson = JSON.parse(typeListOutput.toString());
    metadataTypes = typeListJson.result.metadataObjects.map(t => t.xmlName);
    console.log(`✅ 🇯🇵 メタデータ型取得: ${metadataTypes.length}件 / 🇺🇸 Retrieved metadata types: ${metadataTypes.length}`);
  } catch (err) {
    console.error('❌ 🇯🇵 メタデータ型一覧の取得に失敗 / 🇺🇸 Failed to fetch metadata types:', err.message);
    process.exit(1);
  }

  await runRetrieveWithRetries(metadataTypes, latestVersion, initialExcludeTypes, 50);
  runGitCommitIfNeeded();
})();

async function runRetrieveWithRetries(metadataTypes, latestVersion, excludeTypes, maxRetries = 50) {
  let attempt = 0;
  const dynamicExcludeTypes = [...excludeTypes];

  while (attempt < maxRetries) {
    attempt++;
    console.log(`⚙️ 🇯🇵 Retrieve試行 ${attempt}回目 / 🇺🇸 Retrieve attempt ${attempt}`);

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
    console.log(`✅ 🇯🇵 package.xml 作成 / 🇺🇸 package.xml created (API version ${latestVersion})`);

    if (fs.existsSync(mainDir)) {
      console.log('🧹 🇯🇵 既存のforce-app/mainを削除 / 🇺🇸 Removing existing force-app/main');
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
        console.log('✅ 🇯🇵 メタデータのダウンロード完了 / 🇺🇸 Metadata download complete');
        return;
      } else {
        handleRetrieveErrors(retrieveJson, dynamicExcludeTypes);
      }
    } catch (err) {
      console.warn('⚠️ 🇯🇵 コマンド実行例外キャッチ / 🇺🇸 Caught command execution exception');

      let rawOutput = '';
      if (err.stdout) {
        rawOutput = err.stdout.toString();
      } else if (err.stderr) {
        rawOutput = err.stderr.toString();
      } else {
        rawOutput = err.message;
      }

      fs.writeFileSync(tmpResultPath, rawOutput);
      console.warn(`⚠️ 🇯🇵 エラー内容を ${tmpResultPath} に保存 / 🇺🇸 Saved error output to ${tmpResultPath}`);

      try {
        const retrieveJson = JSON.parse(rawOutput);
        handleRetrieveErrors(retrieveJson, dynamicExcludeTypes);
      } catch (jsonErr) {
        console.error('❌ 🇯🇵 保存内容をJSON解析できません / 🇺🇸 Cannot parse saved content as JSON.');
        process.exit(1);
      }
    }
  }

  console.error('❌ 🇯🇵 最大リトライ回数超過 / 🇺🇸 Exceeded maximum retry attempts (50)');
  process.exit(1);
}

function handleRetrieveErrors(retrieveJson, dynamicExcludeTypes) {
  const jsonString = JSON.stringify(retrieveJson);
  const matches = [...jsonString.matchAll(/Missing metadata type definition in registry for id '([^']+)'/g)];

  if (matches.length > 0) {
    matches.forEach(match => {
      const missingType = match[1];
      if (!dynamicExcludeTypes.includes(missingType)) {
        console.warn(`⚠️ 🇯🇵 '${missingType}' を除外対象に追加 / 🇺🇸 Adding '${missingType}' to exclude list`);
        dynamicExcludeTypes.push(missingType);
      }
    });
  } else {
    console.error('❌ 🇯🇵 詳細不明の取得失敗 / 🇺🇸 Unknown retrieval failure:', retrieveJson);
    process.exit(1);
  }
}

function runGitCommitIfNeeded() {
  if (doCommit) {
    console.log('🔧 🇯🇵 Git Commit を実行中 / 🇺🇸 Running Git commit...');
    try {
      const gitDir = path.join(projectDir, '.git');
      if (!fs.existsSync(gitDir)) {
        console.log('🛠 🇯🇵 Gitリポジトリ初期化 / 🇺🇸 Initializing Git repository');
        execSync(`git init`, { stdio: 'inherit', cwd: projectDir, maxBuffer: 10 * 1024 * 1024 });
      }

      execSync(`git add .`, { stdio: 'inherit', cwd: projectDir, maxBuffer: 10 * 1024 * 1024 });
      const commitMessage = `Update metadata from ${orgAlias} (${env}) on ${new Date().toISOString()}`;
      execSync(`git commit -m "${commitMessage}"`, { stdio: 'inherit', cwd: projectDir, maxBuffer: 10 * 1024 * 1024 });
      console.log('✅ 🇯🇵 Git Commit 完了 / 🇺🇸 Git commit complete');
    } catch (err) {
      console.error('❌ 🇯🇵 Git Commit エラー / 🇺🇸 Git commit error:', err.message);
    }
  } else {
    console.log('⚠️ 🇯🇵 Git Commitはスキップされました / 🇺🇸 Git commit was skipped (no commit option specified)');
  }
}