import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const root=new URL('../../',import.meta.url);
test('native loader embeds exact reviewed bundle and scopes injection',()=>{
  const script=readFileSync(new URL('dearrow/tizentube/dist/userScript.js',root),'utf8');
  const header=readFileSync(new URL('dearrow/generated/userscript.h',root),'utf8');
  assert.ok(header.includes(createHash('sha256').update(script).digest('hex')));
  assert.ok(header.includes('R"TIZEN_DEARROW('+script+')TIZEN_DEARROW"'));
  const source=readFileSync(new URL('third_party/blink/renderer/core/dom/document.cc',root),'utf8');
  const injection=source.slice(source.indexOf('// Run the reviewed bundle'),source.indexOf('// We have to clear the parser'));
  assert.ok(injection.includes('ClassicScript::CreateUnspecifiedScript'));
  assert.ok(injection.includes('GetFrame()->IsMainFrame()'));
  assert.ok(injection.includes('Url().Host() == "www.youtube.com"'));
  assert.ok(!source.includes('https://cdn.jsdelivr.net/npm/@foxreis/tizentube/dist/userScript.js'));
});
test('package identity is separate and settings key remains compatible',()=>{
  const gn=readFileSync(new URL('cobalt/android/BUILD.gn',root),'utf8');
  assert.ok(gn.includes('manifest_package=io.github.llqw0dni.tizendearrow'));
  const config=readFileSync(new URL('dearrow/tizentube/mods/config.js',root),'utf8');
  assert.ok(config.includes("const CONFIG_KEY = 'ytaf-configuration'"));
  assert.ok(config.includes('enableDeArrowTitles: true'));
});
