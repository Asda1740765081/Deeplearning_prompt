// Shared by the standalone app and deterministic tests. No network or model calls.
function renderPrompt(prompt, values = {}, language = '中文') {
  const labels = new Map(prompt.fields.map(([key, label]) => [key, label]));
  const text = prompt.template.replace(/\{\{([^{}\n]+)\}\}/g, (match, key) => {
    if (!labels.has(key)) return match;
    return typeof values[key] === 'string' && values[key].trim()
      ? values[key].trim()
      : `[请填写：${labels.get(key)}]`;
  });
  return language === 'English'
    ? 'Please respond in professional academic English. Preserve formulas, citations, code, and technical terms.\n\n' +
        text
    : text;
}

function encodeShare(payload) {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  return btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(''));
}

function decodeShare(encoded) {
  if (encoded.length > 1500000) throw new Error('Share is too large');
  const payload = JSON.parse(
    new TextDecoder('utf-8', { fatal: true }).decode(
      Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0))
    )
  );
  if (!payload || typeof payload !== 'object' || typeof payload.id !== 'string') {
    throw new Error('Invalid share payload');
  }
  return payload;
}

function prepareImport(data, currentPrompts, normalizePrompt, makeId) {
  const incoming = Array.isArray(data) ? data : data?.customPrompts;
  if (!Array.isArray(incoming) || incoming.length > 2000)
    throw new Error('Invalid template collection');
  if (!Array.isArray(data) && data.version !== undefined && ![1, 2, 3].includes(data.version)) {
    throw new Error('Unsupported backup version');
  }
  const inputIds = incoming.map((p) => p?.id).filter((id) => typeof id === 'string');
  if (new Set(inputIds).size !== inputIds.length) throw new Error('Duplicate template IDs');
  const normalized = incoming.map(normalizePrompt);
  if (normalized.some((p) => !p)) throw new Error('Invalid template');
  // Build a complete candidate state before the caller mutates the live collection.
  const next = [...currentPrompts],
    mapping = new Map();
  let added = 0;
  normalized.forEach((prompt, index) => {
    const same = next.find(
      (p) => p.custom && p.title === prompt.title && p.template === prompt.template
    );
    if (same) {
      if (typeof incoming[index].id === 'string') mapping.set(incoming[index].id, same.id);
      return;
    }
    if (next.some((p) => p.id === prompt.id)) prompt.id = 'custom-' + makeId();
    if (typeof incoming[index].id === 'string') mapping.set(incoming[index].id, prompt.id);
    next.push(prompt);
    added++;
  });
  return { prompts: next, mapping, added };
}
