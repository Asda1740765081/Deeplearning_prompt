const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const lib = require('../scripts/load-data.cjs')();

test('writing roadmap has unique stages and every recommended template exists', () => {
  assert.equal(new Set(lib.writingWorkflow.map((s) => s.id)).size, lib.writingWorkflow.length);
  assert(lib.writingWorkflow.length >= 8);
  for (const stage of lib.writingWorkflow) {
    assert(stage.input && stage.output && stage.when && stage.primary.length);
    for (const id of [...stage.primary, ...stage.optional])
      assert(
        lib.prompts.some((p) => p.id === id),
        id
      );
  }
});

test('all 46 templates have unique IDs, valid scenes, and complete field definitions', () => {
  assert.equal(lib.prompts.length, 46);
  assert.equal(new Set(lib.prompts.map((p) => p.id)).size, 46);
  for (const p of lib.prompts) {
    assert(
      lib.categories.some((c) => c.id === p.cat),
      p.id
    );
    const declared = p.fields.map((f) => f[0]);
    const referenced = [...p.template.matchAll(/\{\{([^{}\n]+)\}\}/g)].map((m) => m[1]);
    assert.deepEqual([...new Set(declared)].sort(), [...new Set(referenced)].sort(), p.id);
  }
  assert.equal(lib.researchAgents.length, 7);
  assert(lib.researchAgents.every((a) => lib.prompts.some((p) => p.id === a.prompt)));
});
test('field substitution is simultaneous, including Chinese names and literal replacement characters', () => {
  const p = {
    template: '{{研究问题}} / {{data}} / {{研究问题}}',
    fields: [
      ['研究问题', '研究问题'],
      ['data', '材料']
    ]
  };
  assert.equal(
    lib.renderPrompt(p, { 研究问题: '{{data}} $&', data: '原文' }),
    '{{data}} $& / 原文 / {{data}} $&'
  );
  assert.equal(lib.renderPrompt(p, {}), '[请填写：研究问题] / [请填写：材料] / [请填写：研究问题]');
});
test('English mode adds an output instruction without altering equations or code', () => {
  const p = { template: '{{x}}', fields: [['x', 'x']] };
  const text = lib.renderPrompt(p, { x: '$L=\\sum_i x_i$\nprint("你好")' }, 'English');
  assert(text.startsWith('Please respond in professional academic English.'));
  assert(text.endsWith('$L=\\sum_i x_i$\nprint("你好")'));
});
test('share codec round-trips Unicode and rejects invalid payloads', () => {
  const payload = {
    id: 'custom-demo',
    prompt: { title: '中文 🧪', template: '分析 {{研究问题}}' }
  };
  assert.deepEqual(JSON.parse(JSON.stringify(lib.decodeShare(lib.encodeShare(payload)))), payload);
  assert.throws(() => lib.decodeShare('not base64'));
  assert.throws(() => lib.decodeShare(lib.encodeShare(null)));
  assert.throws(() => lib.decodeShare(lib.encodeShare({ id: 42 })));
  assert.throws(() => lib.decodeShare('a'.repeat(1500001)));
});
const normalize = (p) =>
  p && typeof p.title === 'string' && typeof p.template === 'string'
    ? { ...p, custom: true }
    : null;
test('import deduplicates content and remaps colliding IDs without mutating the input state', () => {
  const current = [{ id: 'custom-one', title: '旧模板', template: '旧正文', custom: true }];
  const result = lib.prepareImport(
    { version: 3, customPrompts: [{ id: 'custom-one', title: '新模板', template: '新正文' }] },
    current,
    normalize,
    () => 'new-id'
  );
  assert.equal(current.length, 1);
  assert.equal(result.added, 1);
  assert.equal(result.mapping.get('custom-one'), 'custom-new-id');
  const repeat = lib.prepareImport(
    [{ id: 'custom-other', title: '新模板', template: '新正文' }],
    result.prompts,
    normalize,
    () => 'unused'
  );
  assert.equal(repeat.added, 0);
  assert.equal(repeat.mapping.get('custom-other'), 'custom-new-id');
});
test('invalid imports leave the original collection unchanged', () => {
  const current = [];
  for (const data of [
    null,
    {},
    { version: 99, customPrompts: [] },
    [
      { id: 'x', title: 'ok', template: 'ok' },
      { id: 'x', title: 'dup', template: 'dup' }
    ],
    [{ title: 'ok', template: 'ok' }, { title: 42 }],
    Array(2001).fill({})
  ]) {
    assert.throws(() => lib.prepareImport(data, current, normalize, () => 'new-id'));
    assert.equal(current.length, 0);
  }
});
test('three documented examples generate the committed output exactly with no unresolved fields', () => {
  for (const example of require('../examples/cases.json')) {
    const p = lib.prompts.find((p) => p.id === example.templateId);
    const output = lib.renderPrompt(p, example.values, example.language) + '\n';
    assert(!output.includes('[请填写：'));
    assert.equal(
      output,
      fs.readFileSync(path.join(__dirname, '../examples/outputs', example.slug + '.txt'), 'utf8')
    );
  }
});
