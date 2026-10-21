const fs = require('node:fs');
const path = require('node:path');
const { prompts, renderPrompt } = require('./load-data.cjs')();
const cases = require('../examples/cases.json');
let failed = false;
for (const example of cases) {
  const prompt = prompts.find((p) => p.id === example.templateId);
  if (!prompt) throw new Error('Unknown example template: ' + example.templateId);
  const output = renderPrompt(prompt, example.values, example.language) + '\n';
  const target = path.join(__dirname, '../examples/outputs', example.slug + '.txt');
  if (process.argv.includes('--check')) {
    if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== output) {
      console.error('Stale example output: ' + target);
      failed = true;
    }
  } else fs.writeFileSync(target, output);
}
if (failed) process.exitCode = 1;
else
  console.log(
    `${cases.length} reproducible example prompts ${process.argv.includes('--check') ? 'verified' : 'generated'}. No model outputs or calls.`
  );
