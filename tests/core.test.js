import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DEFAULT_RULES, cleanRules, ruleForFile, validateFolder } from '../src/core/rules.js';
import { scanFiles } from '../src/core/scanner.js';
import { createPreview, runPreview, undoRun } from '../src/core/organizer.js';
import { findDuplicates, checkTrashSelection } from '../src/core/duplicates.js';
import { Storage } from '../src/core/storage.js';

async function fixture(callback) {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(),'foldria-test-'));
  try { await callback(tmp); } finally { await fs.rm(tmp,{recursive:true,force:true}); }
}
const options = root => ({source:root,destination:root,recursive:false,rules:DEFAULT_RULES});

test('rules detect types (case insensitive) and reject traversal',()=>{
  const rules=cleanRules(DEFAULT_RULES);
  assert.equal(ruleForFile('PIC.PNG',rules).folder,'Fotos');
  assert.equal(ruleForFile('report.pdf',rules).folder,'Dokumente');
  assert.equal(ruleForFile('unknown.qqq',rules),undefined);
  for (const malicious of ['../foo','C:\\Users\\Public','Foo/../Bar','\\\\server\\share','CON','Folder/PRN.txt','Folder/foo?']) {
    assert.throws(()=>validateFolder(malicious));
  }
});

test('duplicate active extensions are refused',()=>{
  assert.throws(()=>cleanRules([{name:'A',folder:'A',extensions:['png'],enabled:true},{name:'B',folder:'B',extensions:['.PNG'],enabled:true}]));
  assert.doesNotThrow(()=>cleanRules([{name:'A',folder:'A',extensions:['png'],enabled:false},{name:'B',folder:'B',extensions:['png'],enabled:true}]));
});

test('scan preserves files and skips symlinks and nested when disabled',async()=>fixture(async tmp=>{
  await fs.writeFile(path.join(tmp,'a.pdf'),'abc');
  await fs.mkdir(path.join(tmp,'sub'));
  await fs.writeFile(path.join(tmp,'sub','b.png'),'abc');
  assert.equal((await scanFiles(tmp)).length,1);
  assert.equal((await scanFiles(tmp,{recursive:true})).length,2);
}));

test('preview handles collisions without overwriting; run and undo correctly',async()=>fixture(async tmp=>{
  const original=path.join(tmp,'my.png');
  await fs.writeFile(original,'original');
  await fs.mkdir(path.join(tmp,'Fotos'));
  const existing=path.join(tmp,'Fotos','my.png');
  await fs.writeFile(existing,'existing');
  const preview=await createPreview(options(tmp));
  assert.equal(preview.operations.length,1);
  assert.equal(preview.operations[0].renamed,true);
  assert.match(preview.operations[0].to,/my \(2\)\.png$/);
  assert.equal((await fs.readFile(original,'utf8')),'original'); // dry run
  const result=await runPreview(preview);
  assert.equal(result.moved.length,1);
  assert.equal((await fs.readFile(existing,'utf8')),'existing');
  assert.equal((await fs.readFile(result.moved[0].to,'utf8')),'original');
  await assert.rejects(fs.access(original));
  const undone=await undoRun(result);
  assert.equal(undone.restored,1);
  assert.equal((await fs.readFile(original,'utf8')),'original');
  assert.equal((await fs.readFile(existing,'utf8')),'existing');
}));

test('preview safely excludes target tree when it is nested in source',async()=>fixture(async tmp=>{
  const target=path.join(tmp,'Sorted');
  await fs.mkdir(path.join(target,'Fotos'),{recursive:true});
  await fs.writeFile(path.join(target,'Fotos','old.png'),'already sorted');
  await fs.writeFile(path.join(tmp,'fresh.png'),'fresh');
  const preview=await createPreview({...options(tmp),destination:target,recursive:true});
  assert.equal(preview.found,1);
  assert.equal(preview.operations.length,1);
}));

test('sort refuses to replace file changed after preview',async()=>fixture(async tmp=>{
  const original=path.join(tmp,'test.pdf');
  await fs.writeFile(original,'one');
  const preview=await createPreview(options(tmp));
  await fs.writeFile(original,'totally changed content');
  const result=await runPreview(preview);
  assert.equal(result.moved.length,0);
  assert.equal(result.errors.length,1);
  assert.equal((await fs.readFile(original,'utf8')),'totally changed content');
}));

test('duplicate detection uses file content and suggests only extra copies',async()=>fixture(async tmp=>{
  await fs.writeFile(path.join(tmp,'a.png'),'same-content');
  await fs.writeFile(path.join(tmp,'b.jpg'),'same-content');
  await fs.writeFile(path.join(tmp,'c.png'),'other-change'); // identical size, different hash
  const results=await findDuplicates(tmp);
  assert.equal(results.scanned,3);
  assert.equal(results.groups.length,1);
  assert.equal(results.duplicates,1);
  assert.equal(results.saveable,12);
  assert.equal(results.groups[0].files.filter(x=>x.recommended).length,1);
  const fileIds=results.groups[0].files.map(x=>x.id);
  assert.throws(()=>checkTrashSelection(results,fileIds),/mindestens eine/);
  assert.equal(checkTrashSelection(results,[fileIds[0]]).length,1);
  assert.throws(()=>checkTrashSelection(results,['random-id']),/Ungültige/);
}));

test('settings persist without losing custom rules',async()=>fixture(async tmp=>{
  const db=new Storage(tmp);
  const first=await db.getSettings();
  first.source=tmp;
  first.rules.push({id:'my-rules',name:'Photoshop',folder:'Design/PSD',extensions:['psd'],enabled:true,color:'#aaccff',icon:'image'});
  await db.setSettings(first);
  const restored=await db.getSettings();
  assert.equal(restored.source,tmp);
  assert.equal(ruleForFile('final.psd',restored.rules).folder,path.join('Design','PSD'));
  const history={id:'x',moved:[],errors:[],timestamp:new Date().toISOString()};
  await db.addHistory(history);
  assert.equal((await db.history()).length,1);
}));
