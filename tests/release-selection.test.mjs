import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const helperPath=decodeURIComponent(new URL('../../發布工具/Release-Selection.ps1',import.meta.url).pathname).replace(/^\/(?:[A-Za-z]:)/,value=>value.slice(1));
const publisher=await readFile(new URL('../../發布工具/Publish-Synchronizer.ps1',import.meta.url),'utf8');

test('release verifier accepts only the exact files selected for the artifact',()=>{
  if(process.platform!=='win32')return;
  const script=`. '${helperPath.replaceAll("'","''")}'\n`+
    `$s=[pscustomobject]@{web=@('index.html');backend=@('app/api/x.ts')}\n`+
    `$ok=Assert-ReleaseChangeSet $s @('index.html') @('app/api/x.ts') $false\n`+
    `if(($ok.web -join ',') -ne 'index.html'){exit 2}\n`+
    `try{Assert-ReleaseChangeSet $s @('index.html','extra.js') @('app/api/x.ts') $false|Out-Null;exit 3}catch{}\n`+
    `$x=[pscustomobject]@{web=@('extension-version.json');backend=@()}\n`+
    `$e=Assert-ReleaseChangeSet $x @('extension-version.json','synchronizer-extension.zip') @() $true\n`+
    `if(-not ($e.web -contains 'synchronizer-extension.zip')){exit 4}`;
  const result=spawnSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-Command',script],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr||result.stdout);
});

test('check and publish both enforce the shared exact release change set',()=>{
  assert.ok((publisher.match(/Assert-ReleaseChangeSet/g)||[]).length>=2);
  assert.match(publisher,/verifiedArtifacts/);
});

test('M11 Check 固定 HEAD/tree、selection 與發布工具，Publish 比對並確認 staged bytes',()=>{
  assert.match(publisher,/Get-ReleaseContractFingerprint/);
  assert.match(publisher,/contractFingerprint/);
  assert.match(publisher,/\$state\.contractFingerprint/);
  assert.match(publisher,/\[string\]::Join\("`n", \$items\.ToArray\(\)\)/);
  assert.match(publisher,/git' \(@\('diff', '--quiet', '--'\)/);
  assert.match(publisher,/Get-ChangeFingerprint \$webChanges \$backendChanges[\s\S]*Read-Host/);
});
