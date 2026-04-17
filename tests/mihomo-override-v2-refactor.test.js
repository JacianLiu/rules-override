const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const sourceFile = path.join(root, 'mihomo-override-v2.js');
const refactorFile = path.join(root, 'mihomo-override-v2-refactor.js');

function loadMain(filePath, userAgent) {
  const code = fs.readFileSync(filePath, 'utf8');
  const context = {
    console: { log() {} },
    $options: { _req: { headers: { 'user-agent': userAgent } } },
  };
  vm.createContext(context);
  vm.runInContext(`${code}\nthis.__main = main;`, context, { filename: path.basename(filePath) });
  return context.__main;
}

function buildConfig() {
  return {
    proxies: [
      { name: 'US Seattle 01' },
      { name: 'US 落地 02' },
      { name: 'HK HKG 01' },
      { name: 'SG Singapore 01' },
      { name: 'JP Tokyo 01' },
      { name: 'Frontier US Residential' },
      { name: 'Random Node' },
    ],
  };
}

function run(filePath, userAgent) {
  const main = loadMain(filePath, userAgent);
  return main(structuredClone(buildConfig()));
}

function normalize(value) {
  return JSON.parse(JSON.stringify(value));
}

function groupByName(config, name) {
  return normalize(config["proxy-groups"]).find((group) => group.name === name);
}

test('refactor script adds expected icons to representative proxy groups', () => {
  const refactor = normalize(run(refactorFile, 'mihomo'));

  assert.equal(
    groupByName(refactor, '🚀 节点选择').icon,
    'https://testingcf.jsdelivr.net/gh/Vbaethon/HOMOMIX@main/Icon/Color/Auto_Link.png'
  );
  assert.equal(
    groupByName(refactor, '🇺🇸 美国').icon,
    'https://testingcf.jsdelivr.net/gh/Vbaethon/HOMOMIX@main/Icon/Color/USA.png'
  );
  assert.equal(
    groupByName(refactor, '🤖 AI 服务').icon,
    'https://testingcf.jsdelivr.net/gh/Vbaethon/HOMOMIX@main/Icon/Color/AI.png'
  );
  assert.equal(
    groupByName(refactor, '🛑 广告拦截').icon,
    'https://testingcf.jsdelivr.net/gh/Vbaethon/HOMOMIX@main/Icon/Color/Adblock.png'
  );
});

test('refactor script matches current output for mihomo user-agent', () => {
  const current = normalize(run(sourceFile, 'mihomo'));
  const refactor = normalize(run(refactorFile, 'mihomo'));
  assert.deepStrictEqual(refactor, current);
});

test('refactor script matches current output for stash user-agent', () => {
  const current = normalize(run(sourceFile, 'Stash/1.0'));
  const refactor = normalize(run(refactorFile, 'Stash/1.0'));
  assert.deepStrictEqual(refactor, current);
});
