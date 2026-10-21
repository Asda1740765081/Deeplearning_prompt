const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
module.exports = function loadData() {
  const sandbox = vm.createContext({ TextEncoder, TextDecoder, btoa, atob });
  const root = path.join(__dirname, '..');
  vm.runInContext(
    fs.readFileSync(path.join(root, 'src/data.js'), 'utf8') +
      '\n' +
      fs.readFileSync(path.join(root, 'src/core.js'), 'utf8') +
      '\nglobalThis.library = { prompts, categories, researchAgents, renderPrompt, encodeShare, decodeShare, prepareImport };',
    sandbox
  );
  return sandbox.library;
};
