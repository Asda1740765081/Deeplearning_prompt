const $ = (s) => document.querySelector(s);
const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
function read(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return value === null ? fallback : value;
  } catch {
    return fallback;
  }
}
let storageWarned = false;
function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    if (!storageWarned) {
      toast('浏览器存储不可用，请导出备份以保存内容');
      storageWarned = true;
    }
    return false;
  }
}
function uid() {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
}
const sceneCats = categories.filter((c) => !['all', 'favorite', 'recent', 'custom'].includes(c.id));
const builtInIds = new Set(prompts.map((p) => p.id));
function inferFields(template) {
  return [...new Set([...template.matchAll(/\{\{([^{}\n]+)\}\}/g)].map((m) => m[1]))].map((k) => [
    k,
    k,
    `请填写${k}`,
    'textarea'
  ]);
}
function normalize(p) {
  if (
    !p ||
    typeof p.title !== 'string' ||
    !p.title.trim() ||
    typeof p.template !== 'string' ||
    !p.template.trim()
  )
    return null;
  return {
    id: typeof p.id === 'string' && /^custom-[\w-]+$/.test(p.id) ? p.id : 'custom-' + uid(),
    title: p.title.slice(0, 100),
    desc: typeof p.desc === 'string' ? p.desc.slice(0, 500) : '个人研究提示词',
    cat: sceneCats.some((c) => c.id === p.cat) ? p.cat : 'reading',
    icon: '＋',
    tags: Array.isArray(p.tags) ? p.tags.filter((t) => typeof t === 'string').slice(0, 5) : [],
    difficulty: ['入门', '进阶', '专家'].includes(p.difficulty) ? p.difficulty : '自定义',
    template: p.template,
    fields: inferFields(p.template),
    custom: true
  };
}
const stored = read('dp-custom', []);
if (Array.isArray(stored))
  stored.forEach((p) => {
    const n = normalize(p);
    if (n && !prompts.some((x) => x.id === n.id)) prompts.push(n);
  });
prompts.forEach((p) => (p.difficulty = p.difficulty || '进阶'));
const ids = () => new Set(prompts.map((p) => p.id));
const savedFavs = read('dp-favs', []),
  savedRecent = read('dp-recent', []);
const favs = new Set(Array.isArray(savedFavs) ? savedFavs.filter((id) => ids().has(id)) : []);
let recent = Array.isArray(savedRecent)
  ? [...new Set(savedRecent.filter((id) => ids().has(id)))].slice(0, 12)
  : [];
const object = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
let ratings = object(read('dp-ratings', {})),
  drafts = object(read('dp-drafts', {}));
let scope = 'all',
  scene = 'all',
  active = null,
  editing = null,
  toastTimer;
function toast(msg) {
  $('#toast').textContent = msg;
  $('#toast').classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('#toast').classList.remove('show'), 2400);
}
function persist() {
  const results = [
    write(
      'dp-custom',
      prompts.filter((p) => p.custom)
    ),
    write('dp-favs', [...favs]),
    write('dp-recent', recent),
    write('dp-ratings', ratings),
    write('dp-drafts', drafts)
  ];
  return results.every(Boolean);
}
function count(id) {
  if (id === 'all') return prompts.length;
  if (id === 'favorite') return favs.size;
  if (id === 'recent') return recent.length;
  if (id === 'custom') return prompts.filter((p) => p.custom).length;
  return prompts.filter((p) => p.cat === id).length;
}
function navButton(id, name, icon) {
  return `<button class="nav-btn ${scope === id ? 'active' : ''}" data-nav="${id}" ${scope === id ? 'aria-current="page"' : ''}><span class="nav-icon" aria-hidden="true">${icon}</span>${name}<span class="count">${id === 'team' ? '07' : count(id)}</span></button>`;
}
function renderNav() {
  $('#workspaceNav').innerHTML =
    navButton('all', '提示词广场', '▧') + navButton('team', '研究 Agent 团队', '⌘');
  $('#researchNav').innerHTML = sceneCats.map((c) => navButton(c.id, c.name, c.icon)).join('');
  $('#personalNav').innerHTML = categories
    .filter((c) => ['favorite', 'recent', 'custom'].includes(c.id))
    .map((c) => navButton(c.id, c.name, c.icon))
    .join('');
  document
    .querySelectorAll('[data-nav]')
    .forEach((b) => (b.onclick = () => navigate(b.dataset.nav)));
  $('#totalStat').textContent = prompts.length;
  $('#favStat').textContent = favs.size;
  $('#recentStat').textContent = recent.length;
}
function navigate(id) {
  if (id === 'writing') writingMode = 'flow';
  scope = id;
  scene = 'all';
  $('#search').value = '';
  $('#difficulty').value = 'all';
  $('#sort').value = 'default';
  $('#sidebar').classList.remove('open');
  $('#mobileShade').classList.remove('open');
  render();
}
function filtered() {
  const words = $('#search').value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  let list = prompts.filter(
    (p) =>
      (scope === 'all' ||
        p.cat === scope ||
        (scope === 'favorite' && favs.has(p.id)) ||
        (scope === 'recent' && recent.includes(p.id)) ||
        (scope === 'custom' && p.custom)) &&
      (scene === 'all' || p.cat === scene) &&
      ($('#difficulty').value === 'all' || p.difficulty === $('#difficulty').value) &&
      words.every((w) =>
        [p.title, p.desc, ...p.tags, p.template].join(' ').toLowerCase().includes(w)
      )
  );
  if (scope === 'recent') list.sort((a, b) => recent.indexOf(a.id) - recent.indexOf(b.id));
  const sort = $('#sort').value;
  if (sort === 'name') list.sort((a, b) => a.title.localeCompare(b.title, 'zh'));
  if (sort === 'rating')
    list.sort((a, b) => (Number(ratings[b.id]) || 0) - (Number(ratings[a.id]) || 0));
  if (sort === 'fav') list.sort((a, b) => Number(favs.has(b.id)) - Number(favs.has(a.id)));
  return list;
}

const savedFlow = object(read('dp-writing-flow', {}));
let flowStage = writingWorkflow.some((s) => s.id === savedFlow.stage)
  ? savedFlow.stage
  : writingWorkflow[0].id;
const flowCompleted = new Set(
  Array.isArray(savedFlow.completed)
    ? savedFlow.completed.filter((id) => writingWorkflow.some((s) => s.id === id))
    : []
);
let writingMode = 'flow';
function saveWritingFlow() {
  write('dp-writing-flow', { stage: flowStage, completed: [...flowCompleted] });
}
function selectWritingStage(id) {
  if (!writingWorkflow.some((s) => s.id === id)) return;
  flowStage = id;
  saveWritingFlow();
  renderWritingFlow();
}
function openWritingTemplate(id) {
  openPrompt(id);
  const stage = writingWorkflow.find((s) => s.id === flowStage);
  const i = writingWorkflow.indexOf(stage),
    next = writingWorkflow[i + 1];
  $('#writingHandoff').hidden = false;
  $('#writingHandoff').innerHTML =
    '<strong>用完这个模板后</strong><p>' +
    esc(stage.output) +
    '</p><p>' +
    esc(
      next
        ? '本阶段核验完成后，进入「' + next.title + '」。'
        : '修回完成后，按需要返回全文核验；流程可以反复迭代。'
    ) +
    '</p><button class="btn" id="returnWritingStage">返回流程，核验本阶段 →</button>';
  $('#returnWritingStage').onclick = () => {
    $('#editor').close();
    $('#flowDetail').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };
}
function renderWritingFlow() {
  const stage = writingWorkflow.find((s) => s.id === flowStage),
    index = writingWorkflow.indexOf(stage);
  $('#flowProgress').textContent =
    '已核验 ' + flowCompleted.size + ' / ' + writingWorkflow.length + ' 阶段';
  $('#flowStages').innerHTML = writingWorkflow
    .map(
      (s, i) =>
        '<button class="flow-stage ' +
        (s.id === flowStage ? 'selected' : '') +
        '" data-flow-stage="' +
        s.id +
        '" ' +
        (s.id === flowStage ? 'aria-current="step"' : '') +
        '><span class="stage-number">' +
        (flowCompleted.has(s.id) ? '✓' : String(i + 1).padStart(2, '0')) +
        '</span><span>' +
        esc(s.title) +
        '<small>' +
        (flowCompleted.has(s.id)
          ? '已手动核验'
          : i === 0
            ? '建议从这里开始'
            : i === 8
              ? '收到审稿意见后使用'
              : '可按准备程度跳转') +
        '</small></span></button>'
    )
    .join('');
  $('#flowStages')
    .querySelectorAll('button')
    .forEach((b) => (b.onclick = () => selectWritingStage(b.dataset.flowStage)));
  if (window.matchMedia('(max-width: 760px)').matches) {
    const stages = $('#flowStages'), selected = stages.querySelector('[aria-current="step"]');
    stages.scrollLeft += selected.getBoundingClientRect().left - stages.getBoundingClientRect().left - (stages.clientWidth - selected.clientWidth) / 2;
  }
  const templateButton = (id, i, optional) => {
    const p = prompts.find((p) => p.id === id);
    return (
      '<button class="flow-template ' +
      (optional ? 'optional' : '') +
      '" data-flow-open="' +
      id +
      '"><span>' +
      (optional
        ? '按需使用'
        : String(i + 1).padStart(2, '0') + ' · ' + (i === 0 ? '先用这个' : '接着使用')) +
      '</span><strong>' +
      esc(p.title) +
      ' ↗</strong><small>' +
      esc(p.desc) +
      '</small></button>'
    );
  };
  $('#flowDetail').innerHTML =
    '<div class="eyebrow">STEP ' +
    String(index + 1).padStart(2, '0') +
    ' / ' +
    writingWorkflow.length +
    '</div><h3>' +
    esc(stage.title) +
    '</h3><p class="flow-when">' +
    esc(stage.when) +
    '</p><div class="flow-materials"><div><strong>准备什么</strong><p>' +
    esc(stage.input) +
    '</p></div><div><strong>做到什么再往下走</strong><p>' +
    esc(stage.output) +
    '</p></div></div><h4>推荐顺序</h4><div class="flow-templates">' +
    stage.primary.map((id, i) => templateButton(id, i, false)).join('') +
    '</div><details class="flow-options"><summary>本阶段可选工具 · ' +
    stage.optional.length +
    ' 个</summary><div class="flow-templates">' +
    stage.optional.map((id, i) => templateButton(id, i, true)).join('') +
    '</div></details><p class="flow-note">' +
    esc(stage.note) +
    '</p><div class="flow-controls"><button class="btn" id="flowPrevious" ' +
    (index === 0 ? 'disabled' : '') +
    '>← 上一阶段</button><button class="btn" id="flowComplete" aria-pressed="' +
    flowCompleted.has(stage.id) +
    '">' +
    (flowCompleted.has(stage.id) ? '✓ 已核验完成 · 点击撤销' : '标记本阶段已核验') +
    '</button><button class="btn primary" id="flowNext" ' +
    (index === writingWorkflow.length - 1 ? 'disabled' : '') +
    '>下一阶段 →</button></div>';
  $('#flowDetail')
    .querySelectorAll('[data-flow-open]')
    .forEach((b) => (b.onclick = () => openWritingTemplate(b.dataset.flowOpen)));
  $('#flowPrevious').onclick = () => selectWritingStage(writingWorkflow[index - 1].id);
  $('#flowNext').onclick = () => selectWritingStage(writingWorkflow[index + 1].id);
  $('#flowComplete').onclick = () => {
    flowCompleted.has(stage.id) ? flowCompleted.delete(stage.id) : flowCompleted.add(stage.id);
    saveWritingFlow();
    renderWritingFlow();
  };
}

function render() {
  $('.hero').hidden = scope === 'writing';
  $('.stats').hidden = scope === 'writing';
  $('#writingStarter').hidden = scope !== 'all';
  const flowVisible = scope === 'writing' && writingMode === 'flow';
  $('#writingFlow').hidden = !flowVisible;
  $('#backToFlow').hidden = !(scope === 'writing' && writingMode === 'library');
  if (flowVisible) renderWritingFlow();
  renderNav();
  $('#library').hidden = scope === 'team' || flowVisible;
  $('#teamView').hidden = scope !== 'team';
  const cat = categories.find((c) => c.id === scope);
  $('#breadcrumb').textContent =
    scope === 'team' ? '研究 Agent 团队' : scope === 'all' ? '提示词广场' : cat.name;
  if (scope === 'team') return;
  $('#sectionTitle').textContent = scope === 'all' ? '提示词广场' : cat.name;
  $('#sectionDesc').textContent = scope === 'all' ? '每一个研究环节，都有一个好的开始。' : cat.desc;
  $('#chips').hidden = sceneCats.some((c) => c.id === scope);
  $('#chips').innerHTML = [{ id: 'all', name: '全部' }, ...sceneCats]
    .map(
      (c) =>
        `<button class="chip ${scene === c.id ? 'active' : ''}" data-scene="${c.id}" aria-pressed="${scene === c.id}">${c.name}</button>`
    )
    .join('');
  $('#chips')
    .querySelectorAll('button')
    .forEach(
      (b) =>
        (b.onclick = () => {
          if (b.dataset.scene === 'writing') {
            navigate('writing');
            return;
          }
          scene = b.dataset.scene;
          render();
        })
    );
  let list = filtered();
  $('#resultCount').textContent = `${list.length} 个模板`;
  $('#grid').innerHTML = list.length
    ? list
        .map(
          (p) =>
            `<article class="card" data-cat="${esc(p.cat)}"><div class="card-top"><span class="badge">${esc(sceneCats.find((c) => c.id === p.cat)?.name || '个人模板')}</span><button class="fav ${favs.has(p.id) ? 'on' : ''}" data-fav="${esc(p.id)}" aria-label="${favs.has(p.id) ? '取消收藏' : '收藏'}：${esc(p.title)}" aria-pressed="${favs.has(p.id)}">${favs.has(p.id) ? '★' : '☆'}</button></div><h3>${esc(p.title)}</h3><p>${esc(p.desc)}</p><div class="tags">${p.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div><div class="card-bottom"><span>${esc(p.difficulty)} · ${p.custom ? '个人模板' : p.fields.length + ' 个填写项'}${ratings[p.id] ? ' · ★ ' + esc(ratings[p.id]) : ''}</span><button class="open" data-open="${esc(p.id)}">使用模板 ↗</button><button class="quick-copy" data-copy="${esc(p.id)}" aria-label="复制原始模板：${esc(p.title)}" title="复制原始模板">复制</button></div></article>`
        )
        .join('')
    : `<div class="empty"><strong>${scope === 'favorite' ? '还没有收藏的模板' : scope === 'custom' ? '建立你的个人模板库' : '没有找到匹配的模板'}</strong><p>${scope === 'favorite' ? '点击模板右上角的星标，保存常用提示词。' : scope === 'custom' ? '将反复使用的研究指令保存下来，下次直接填写。' : '试试其他关键词，或清除筛选条件。'}</p><button class="btn" id="emptyAction">${scope === 'custom' ? '新建模板' : '浏览全部模板'}</button></div>`;
  $('#grid')
    .querySelectorAll('[data-open]')
    .forEach((b) => (b.onclick = () => openPrompt(b.dataset.open)));
  $('#grid')
    .querySelectorAll('[data-copy]')
    .forEach(
      (b) => (b.onclick = () => copy(prompts.find((p) => p.id === b.dataset.copy).template))
    );
  $('#grid')
    .querySelectorAll('[data-fav]')
    .forEach(
      (b) =>
        (b.onclick = () => {
          const id = b.dataset.fav;
          favs.has(id) ? favs.delete(id) : favs.add(id);
          write('dp-favs', [...favs]);
          render();
        })
    );
  if ($('#emptyAction'))
    $('#emptyAction').onclick = () => (scope === 'custom' ? openManager() : navigate('all'));
}
function currentValues() {
  return Object.fromEntries(
    [...$('#fields').querySelectorAll('[data-field]')].map((el) => [
      active.fields[Number(el.dataset.field)][0],
      el.value
    ])
  );
}
function preview(save = true) {
  if (!active) return;
  const values = currentValues();
  const text = renderPrompt(active, values, $('#language').value);
  $('#preview').textContent = text;
  $('#wordCount').textContent = text.length + ' 字符';
  if (save) {
    drafts[active.id] = { values, lang: $('#language').value };
    $('#draftStatus').textContent = write('dp-drafts', drafts)
      ? '草稿已自动保存'
      : '草稿未能保存，请下载文本';
  }
}
function renderRating() {
  $('#rating').innerHTML =
    '<span class="hint">我的使用评分 </span>' +
    [1, 2, 3, 4, 5]
      .map(
        (n) =>
          `<button class="${n <= Number(ratings[active.id]) ? 'on' : ''}" data-rate="${n}" aria-label="评分 ${n} 星" aria-pressed="${n === Number(ratings[active.id])}">★</button>`
      )
      .join('');
  $('#rating')
    .querySelectorAll('button')
    .forEach(
      (b) =>
        (b.onclick = () => {
          ratings[active.id] = Number(b.dataset.rate);
          write('dp-ratings', ratings);
          renderRating();
          render();
        })
    );
}
function openPrompt(id) {
  $('#writingHandoff').hidden = true;
  active = prompts.find((p) => p.id === id);
  if (!active) return;
  recent = [id, ...recent.filter((x) => x !== id)].slice(0, 12);
  write('dp-recent', recent);
  const draft = object(drafts[id]);
  $('#editorBadge').textContent = sceneCats.find((c) => c.id === active.cat)?.name || '个人模板';
  $('#editorTitle').textContent = active.title;
  $('#editorDesc').textContent = active.desc;
  const guide = $('#researchGuide');
  guide.hidden = !active.inspiration;
  guide.innerHTML = active.inspiration
    ? '<strong>预期交付</strong><p>' +
      esc(active.deliverable) +
      '</p><strong>使用后核验</strong><ul>' +
      active.checks.map((c) => '<li>' + esc(c) + '</li>').join('') +
      '</ul><div class="source-links">结构参考：' +
      active.inspiration
        .map((id) => {
          const s = researchSources.find((x) => x.id === id);
          return s
            ? '<a href="' +
                esc(s.url) +
                '" target="_blank" rel="noopener noreferrer">' +
                esc(s.name) +
                ' ↗</a>'
            : '';
        })
        .join(' · ') +
      '<small>本地重新编写，不代表上游认可或效果验证。</small></div>'
    : '';
  $('#language').value = draft.lang === 'English' ? 'English' : '中文';
  $('#draftStatus').textContent = draft.values ? '已恢复上次填写的草稿' : '填写研究信息';
  $('#fields').innerHTML = active.fields
    .map(
      ([key, label, ph, type], i) =>
        `<div class="field"><label for="field-${i}">${esc(label)}</label>${type === 'textarea' ? `<textarea id="field-${i}" data-field="${i}" placeholder="${esc(ph)}"></textarea>` : `<input id="field-${i}" data-field="${i}" placeholder="${esc(ph)}">`}</div>`
    )
    .join('');
  $('#fields')
    .querySelectorAll('[data-field]')
    .forEach((el) => {
      el.value = object(draft.values)[active.fields[Number(el.dataset.field)][0]] || '';
      el.oninput = () => preview();
    });
  $('#customTools').hidden = !active.custom;
  preview(false);
  renderRating();
  render();
  $('#editor').showModal();
  $('#editor .dialog-body').scrollTop = 0;
}
async function copy(text) {
  let ok = false;
  try {
    await navigator.clipboard.writeText(text);
    ok = true;
  } catch {
    const el = document.createElement('textarea');
    el.value = text;
    el.style.cssText = 'position:fixed;opacity:0';
    (document.querySelector('dialog[open]') || document.body).appendChild(el);
    el.select();
    try {
      ok = document.execCommand('copy');
    } catch {}
    el.remove();
  }
  toast(ok ? '提示词已复制，粘贴到你使用的 AI 工具即可' : '复制失败，请选择预览文本手动复制');
}
function download(text, name, type) {
  const url = URL.createObjectURL(new Blob([text], { type })),
    a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function openManager(mode = 'create', p = null) {
  editing = p?.id || null;
  $('#managerTitle').textContent =
    mode === 'backup' ? '备份与导入' : p ? '编辑研究模板' : '新建研究模板';
  $('#customForm').hidden = mode === 'backup';
  $('#backupPanel').hidden = mode !== 'backup';
  $('#customForm').reset();
  if (p) {
    $('#customTitle').value = p.title;
    $('#customDesc').value = p.desc;
    $('#customCat').value = p.cat;
    $('#customTemplate').value = p.template;
    $('#customTags').value = p.tags.join(', ');
  }
  $('#manager').showModal();
}
$('#customCat').innerHTML = sceneCats
  .map((c) => `<option value="${c.id}">${c.name}</option>`)
  .join('');
$('#customForm').onsubmit = (e) => {
  e.preventDefault();
  const p = normalize({
    id: editing || undefined,
    title: $('#customTitle').value.trim(),
    desc: $('#customDesc').value.trim(),
    cat: $('#customCat').value,
    template: $('#customTemplate').value.trim(),
    tags: $('#customTags')
      .value.split(/[,，]/)
      .map((s) => s.trim())
      .filter(Boolean)
  });
  if (!p) {
    toast('请填写模板名称和正文');
    return;
  }
  const i = prompts.findIndex((x) => x.id === editing);
  if (i >= 0) prompts[i] = p;
  else prompts.push(p);
  const saved = persist();
  $('#manager').close();
  navigate('custom');
  toast(saved ? '模板已保存' : '模板仅保留在当前页面，存储失败，请导出备份');
};
$('#importInput').onchange = async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) {
    toast('请选择小于 10 MB 的备份文件');
    return;
  }
  try {
    const data = JSON.parse(await file.text());
    const candidate = prepareImport(data, prompts, normalize, uid);
    const remap = (id) => candidate.mapping.get(id) || id;
    prompts.splice(0, prompts.length, ...candidate.prompts);
    const valid = ids();
    if (Array.isArray(data.favorites))
      data.favorites
        .map(remap)
        .filter((id) => valid.has(id))
        .forEach((id) => favs.add(id));
    if (Array.isArray(data.recent))
      recent = [
        ...new Set([...recent, ...data.recent.map(remap).filter((id) => valid.has(id))])
      ].slice(0, 12);
    Object.entries(object(data.ratings)).forEach(([id, n]) => {
      id = remap(id);
      if (valid.has(id) && Number.isInteger(n) && n >= 1 && n <= 5 && !ratings[id]) ratings[id] = n;
    });
    Object.entries(object(data.drafts)).forEach(([id, d]) => {
      id = remap(id);
      if (valid.has(id) && !drafts[id] && d && typeof d === 'object') {
        const vals = Object.fromEntries(
          Object.entries(object(d.values)).filter(([k, v]) => typeof v === 'string')
        );
        drafts[id] = { values: vals, lang: d.lang === 'English' ? 'English' : '中文' };
      }
    });
    const saved = persist();
    render();
    toast(
      saved
        ? `导入完成：新增 ${candidate.added} 个模板，已合并个人数据`
        : '导入内容仅在当前页面，存储失败，请导出备份'
    );
  } catch {
    toast('导入失败：请使用有效的模板或备份 JSON 文件');
  }
};
$('#exportBtn').onclick = () =>
  download(
    JSON.stringify(
      {
        version: 3,
        exportedAt: new Date().toISOString(),
        customPrompts: prompts.filter((p) => p.custom),
        favorites: [...favs],
        recent,
        ratings,
        drafts
      },
      null,
      2
    ),
    'deepprompt-backup-' + new Date().toISOString().slice(0, 10) + '.json',
    'application/json'
  );
$('#importBtn').onclick = () => $('#importInput').click();
$('#createBtn').onclick = () => openManager();
$('#backupBtn').onclick = () => openManager('backup');
$('#closeManager').onclick = () => $('#manager').close();
$('#closeEditor').onclick = () => $('#editor').close();
$('#copyBtn').onclick = () => copy($('#preview').textContent);
$('#downloadBtn').onclick = () =>
  download(
    $('#preview').textContent,
    active.title.replace(/[<>:"/\\|?*]/g, '_') + '.txt',
    'text/plain;charset=utf-8'
  );
$('#language').onchange = () => preview();
$('#resetBtn').onclick = () => {
  if (!confirm('清空当前模板的填写内容？')) return;
  $('#fields')
    .querySelectorAll('[data-field]')
    .forEach((el) => (el.value = ''));
  $('#language').value = '中文';
  delete drafts[active.id];
  write('dp-drafts', drafts);
  preview(false);
  $('#draftStatus').textContent = '草稿已清空';
};
$('#editCustom').onclick = () => {
  const p = active;
  $('#editor').close();
  openManager('create', p);
};
$('#deleteCustom').onclick = () => {
  if (!active?.custom || !confirm('删除此个人模板及其草稿？')) return;
  const id = active.id;
  prompts.splice(
    prompts.findIndex((p) => p.id === id),
    1
  );
  favs.delete(id);
  recent = recent.filter((x) => x !== id);
  delete ratings[id];
  delete drafts[id];
  persist();
  $('#editor').close();
  render();
  toast('模板已删除');
};
$('#search').oninput = render;
$('#difficulty').onchange = render;
$('#sort').onchange = render;
$('#exploreBtn').onclick = () => {
  navigate('all');
  $('#library').scrollIntoView({ behavior: 'smooth' });
  $('#search').focus({ preventScroll: true });
};
$('#teamStart').onclick = () => openPrompt('research-team');
$('#agents').innerHTML = researchAgents
  .map(
    (a) =>
      `<button class="agent-card" data-agent="${a.prompt}"><small>AGENT ${a.no} / ${a.step}</small><h3>${a.name}</h3><p>${a.duty}</p><span>${a.artifact} ↗</span></button>`
  )
  .join('');
$('#agents')
  .querySelectorAll('button')
  .forEach((b) => (b.onclick = () => openPrompt(b.dataset.agent)));
try {
  document.documentElement.dataset.theme =
    localStorage.getItem('dp-theme') === 'dark' ? 'dark' : 'light';
} catch {}
$('#themeBtn').onclick = () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try {
    localStorage.setItem('dp-theme', next);
  } catch {}
};
$('#menuBtn').onclick = () => {
  $('#sidebar').classList.toggle('open');
  $('#mobileShade').classList.toggle('open');
};
$('#mobileShade').onclick = () => {
  $('#sidebar').classList.remove('open');
  $('#mobileShade').classList.remove('open');
};
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    if (!document.querySelector('dialog[open]')) {
      if (scope === 'team') navigate('all');
      $('#search').focus();
    }
  }
  if (e.key === 'Escape') {
    $('#sidebar').classList.remove('open');
    $('#mobileShade').classList.remove('open');
  }
});
$('#randomBtn').onclick = () => {
  const list = filtered();
  if (list.length) openPrompt(list[Math.floor(Math.random() * list.length)].id);
  else toast('当前筛选没有可用模板');
};
$('#shareBtn').onclick = () => {
  const payload = { id: active.id, prompt: active.custom ? active : undefined };
  const encoded = encodeShare(payload);
  copy(location.href.split('#')[0] + '#share=' + encoded);
};
render();
// New shares omit filled research material; legacy value-bearing links still work.
if (location.hash.startsWith('#share=')) {
  try {
    const d = decodeShare(location.hash.slice(7));
    let id = d.id;
    if (d.prompt) {
      const p = normalize(d.prompt);
      if (!p) throw Error('Invalid shared template');
      const same = prompts.find(
        (x) => x.custom && x.title === p.title && x.template === p.template
      );
      if (same) id = same.id;
      else {
        if (prompts.some((x) => x.id === p.id)) p.id = 'custom-' + uid();
        id = p.id;
        prompts.push(p);
        write(
          'dp-custom',
          prompts.filter((x) => x.custom)
        );
      }
    }
    if (!prompts.some((p) => p.id === id)) throw Error('Unknown template');
    // A template-only share must never replace an existing research draft.
    if (d.values && typeof d.values === 'object' && !Array.isArray(d.values) && !drafts[id]) {
      drafts[id] = {
        values: Object.fromEntries(
          Object.entries(d.values).filter(([k, v]) => typeof v === 'string')
        ),
        lang: d.lang
      };
      write('dp-drafts', drafts);
    }
    openPrompt(id);
  } catch {
    toast('分享链接无法读取');
  }
}

// Optional local Web Audio feedback. Never plays on page load.
let soundOn = read('dp-sound', false) === true,
  soundContext;
function soundState() {
  const b = $('#soundBtn');
  b.setAttribute('aria-pressed', String(soundOn));
  b.setAttribute('aria-label', '点击音效：' + (soundOn ? '开启' : '关闭'));
  b.title = soundOn ? '关闭点击音效' : '开启点击音效';
  b.classList.toggle('sound-on', soundOn);
}
function playClick() {
  if (!soundOn) return;
  try {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return;
    soundContext = soundContext || new C();
    if (soundContext.state === 'suspended') soundContext.resume().catch(() => {});
    const t = soundContext.currentTime,
      o = soundContext.createOscillator(),
      g = soundContext.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(720, t);
    o.frequency.exponentialRampToValueAtTime(420, t + 0.045);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.025, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.055);
    o.connect(g);
    g.connect(soundContext.destination);
    o.start(t);
    o.stop(t + 0.06);
  } catch {}
}
$('#soundBtn').onclick = () => {
  soundOn = !soundOn;
  write('dp-sound', soundOn);
  soundState();
  if (soundOn) playClick();
  toast(soundOn ? '点击音效已开启' : '点击音效已关闭');
};
soundState();
document.addEventListener(
  'click',
  (e) => {
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    if (b.id !== 'soundBtn') playClick();
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      b.classList.remove('tap-feedback');
      void b.offsetWidth;
      b.classList.add('tap-feedback');
      setTimeout(() => b.classList.remove('tap-feedback'), 180);
    }
  },
  true
);

document
  .querySelectorAll('[data-writing-start]')
  .forEach((b) => (b.onclick = () => openPrompt(b.dataset.writingStart)));

$('#enterWritingFlow').onclick = () => {
  navigate('writing');
  $('#writingFlow').scrollIntoView({ behavior: 'smooth' });
};
$('#flowBrowse').onclick = () => {
  writingMode = 'library';
  render();
};
$('#backToFlow').onclick = () => {
  writingMode = 'flow';
  render();
};
document
  .querySelectorAll('[data-flow-start]')
  .forEach((b) => (b.onclick = () => selectWritingStage(b.dataset.flowStart)));
