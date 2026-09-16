import JSZip from 'jszip';
import * as pdfjsLib from 'pdfjs-dist/build/pdf.mjs';
import './styles.css';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.mjs', import.meta.url).toString();

const app = document.querySelector('#app');
const state = { files: [], report: '', busy: false };

app.innerHTML = `
  <main class="shell">
    <header class="topbar">
      <div class="brand"><span class="brand-mark">PR</span><div><strong>Packet Review</strong><small>규정 기반 제출서류 검토</small></div></div>
      <span class="privacy-pill">● 브라우저 직접 호출</span>
    </header>
    <section class="hero">
      <div class="eyebrow">DOCUMENT INTELLIGENCE / 01</div>
      <h1>서류 더미를<br><em>실무 보고서</em>로.</h1>
      <p>규정과 제출서류를 한 번에 올리면, 필요한 자료·가점·누락·판정을 근거와 함께 정리합니다.</p>
    </section>
    <section class="workspace">
      <aside class="control-panel">
        <div class="section-label">01 / API 연결</div>
        <label class="field-label" for="api-key">OpenAI API 키</label>
        <input id="api-key" type="password" autocomplete="off" placeholder="sk-…" />
        <p class="hint">키는 저장하지 않으며 브라우저에서 OpenAI API로 직접 전송됩니다. 서버에는 키가 없습니다.</p>
        <label class="field-label" for="model">모델</label>
        <input id="model" value="gpt-4.1-mini" />
        <div class="section-label files-label">02 / 서류 업로드</div>
        <label class="dropzone" id="dropzone" for="file-input">
          <input id="file-input" type="file" multiple accept=".pdf,.hwp,.hwpx,.hml,.xlsx,.xls,.docx,.txt,.md,.csv" />
          <span class="upload-icon">↑</span><strong>파일을 끌어놓거나 선택</strong><small>PDF · HWP · HWPX · XLSX · DOCX · TXT</small>
        </label>
        <div id="file-list" class="file-list"><div class="empty-files">아직 올린 서류가 없습니다.</div></div>
        <button id="review-btn" class="primary-btn" disabled>검토 시작 <span>→</span></button>
        <button id="clear-btn" class="text-btn" type="button">전체 지우기</button>
      </aside>
      <section class="result-panel">
        <div class="result-head"><div><div class="section-label">03 / REVIEW OUTPUT</div><h2>검토 보고서</h2></div><button id="download-btn" class="download-btn" disabled>MD 다운로드</button></div>
        <div id="status" class="status idle"><span class="status-dot"></span><span>규정과 서류를 올리면 검토를 시작할 수 있습니다.</span></div>
        <pre id="report" class="report"><span class="placeholder-title">검토 결과가 여기에 표시됩니다.</span>\n\nAI가 규정 우선순위를 지키고, 판단이 어려운 항목은 보류 사유와 함께 남깁니다.</pre>
      </section>
    </section>
    <footer><span>Packet Review</span><span>Client-side only · No server-side key storage</span></footer>
  </main>`;

const $ = (sel) => document.querySelector(sel);
const fileInput = $('#file-input');
const dropzone = $('#dropzone');
const fileList = $('#file-list');
const reviewBtn = $('#review-btn');
const clearBtn = $('#clear-btn');
const downloadBtn = $('#download-btn');
const statusEl = $('#status');
const reportEl = $('#report');

function escapeHtml(s) { return s.replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c])); }
function setStatus(message, kind = 'idle') { statusEl.className = `status ${kind}`; statusEl.innerHTML = `<span class="status-dot"></span><span>${escapeHtml(message)}</span>`; }
function fmtBytes(n) { return n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`; }
function renderFiles() {
  reviewBtn.disabled = state.files.length === 0 || state.busy || !$('#api-key').value.trim();
  if (!state.files.length) { fileList.innerHTML = '<div class="empty-files">아직 올린 서류가 없습니다.</div>'; return; }
  fileList.innerHTML = state.files.map((f, i) => `<div class="file-row"><span class="file-ext">${escapeHtml(f.name.split('.').pop().toUpperCase())}</span><span class="file-name">${escapeHtml(f.name)}</span><small>${fmtBytes(f.size)}</small><button data-remove="${i}" aria-label="삭제">×</button></div>`).join('');
}
function addFiles(files) {
  const existing = new Set(state.files.map((f) => `${f.name}:${f.size}:${f.lastModified}`));
  for (const f of files) if (!existing.has(`${f.name}:${f.size}:${f.lastModified}`)) state.files.push(f);
  renderFiles();
}
fileInput.addEventListener('change', (e) => addFiles([...e.target.files]));
$('#api-key').addEventListener('input', renderFiles);
fileList.addEventListener('click', (e) => { const i = e.target.dataset.remove; if (i !== undefined) { state.files.splice(Number(i), 1); renderFiles(); } });
['dragenter', 'dragover'].forEach((ev) => dropzone.addEventListener(ev, (e) => { e.preventDefault(); dropzone.classList.add('dragging'); }));
['dragleave', 'drop'].forEach((ev) => dropzone.addEventListener(ev, (e) => { e.preventDefault(); dropzone.classList.remove('dragging'); }));
dropzone.addEventListener('drop', (e) => addFiles([...e.dataTransfer.files]));
clearBtn.addEventListener('click', () => { state.files = []; state.report = ''; fileInput.value = ''; reportEl.innerHTML = '<span class="placeholder-title">검토 결과가 여기에 표시됩니다.</span>\n\nAI가 규정 우선순위를 지키고, 판단이 어려운 항목은 보류 사유와 함께 남깁니다.'; downloadBtn.disabled = true; setStatus('규정과 서류를 올리면 검토를 시작할 수 있습니다.'); renderFiles(); });
downloadBtn.addEventListener('click', () => { const blob = new Blob([state.report], { type: 'text/markdown;charset=utf-8' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = '서류검토보고서.md'; a.click(); URL.revokeObjectURL(a.href); });

async function extractPdf(file) {
  const data = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) { const page = await pdf.getPage(i); const content = await page.getTextContent(); pages.push(`## 페이지 ${i}\n${content.items.map((x) => x.str).join(' ')}`); }
  return { text: pages.join('\n\n'), note: `PDF ${pdf.numPages}페이지 텍스트 추출` };
}
async function extractXlsx(file) {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const xml = async (name) => {
    const entry = zip.file(name);
    return entry ? new DOMParser().parseFromString(await entry.async('string'), 'application/xml') : null;
  };
  const sharedDoc = await xml('xl/sharedStrings.xml');
  const shared = sharedDoc ? [...sharedDoc.querySelectorAll('si')].map((si) => [...si.querySelectorAll('t')].map((t) => t.textContent).join('')) : [];
  const relDoc = await xml('xl/_rels/workbook.xml.rels');
  const rels = {};
  relDoc?.querySelectorAll('Relationship').forEach((r) => { rels[r.getAttribute('Id')] = r.getAttribute('Target'); });
  const workbook = await xml('xl/workbook.xml');
  const sheets = [];
  workbook?.querySelectorAll('sheet').forEach((s) => sheets.push({ name: s.getAttribute('name'), target: rels[s.getAttribute('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id')] || rels[s.getAttribute('r:id')] }));
  const chunks = [];
  for (const sheet of sheets) {
    const path = `xl/${(sheet.target || '').replace(/^\//, '')}`;
    const doc = await xml(path);
    const rows = [];
    doc?.querySelectorAll('row').forEach((row) => {
      const cells = [];
      row.querySelectorAll(':scope > c').forEach((cell) => {
        const addr = cell.getAttribute('r') || '';
        const formula = cell.querySelector(':scope > f')?.textContent;
        const valueNode = cell.querySelector(':scope > v');
        const type = cell.getAttribute('t');
        let value = valueNode?.textContent ?? '';
        if (type === 's') value = shared[Number(value)] ?? value;
        else if (type === 'inlineStr') value = cell.querySelector('is t')?.textContent ?? '';
        cells.push(`${addr}=${formula ? `FORMULA:${formula}` : JSON.stringify(value)}`);
      });
      if (cells.length) rows.push(cells.join(' | '));
    });
    chunks.push(`## 시트: ${sheet.name}\n${rows.join('\\n')}`);
  }
  return { text: chunks.join('\\n\\n'), note: `XLSX ${sheets.length}개 시트·수식 포함` };
}
async function extractHwpx(file) {
  const zip = await JSZip.loadAsync(await file.arrayBuffer()); const parts = []; for (const [name, entry] of Object.entries(zip.files)) if (!entry.dir && /\.xml$/i.test(name) && (name.includes('section') || name.includes('header') || name.includes('footer') || name.includes('content'))) { const xml = await entry.async('string'); const doc = new DOMParser().parseFromString(xml, 'application/xml'); parts.push(doc.documentElement?.textContent || xml.replace(/<[^>]+>/g, ' ')); } return { text: parts.join('\n'), note: 'HWPX XML 텍스트 추출' };
}
async function extractText(file) { const ext = file.name.toLowerCase().split('.').pop(); if (ext === 'pdf') return extractPdf(file); if (['xlsx','xls'].includes(ext)) return extractXlsx(file); if (ext === 'hwpx' || ext === 'hml') return extractHwpx(file); if (['txt','md','csv'].includes(ext)) return { text: await file.text(), note: '텍스트 직접 추출' }; return { text: '', note: '브라우저 직접 추출 불가 — OpenAI 파일 분석 시도' }; }
async function uploadForModel(file, apiKey) { const form = new FormData(); form.append('purpose', 'user_data'); form.append('file', file); const r = await fetch('https://api.openai.com/v1/files', { method: 'POST', headers: { Authorization: `Bearer ${apiKey}` }, body: form }); if (!r.ok) throw new Error(`파일 업로드 ${r.status}`); return (await r.json()).id; }

const SYSTEM_PROMPT = `당신은 공공 연구개발사업 제출서류를 검토하는 실무 심사관이다. 업로드된 규정 파일을 최우선 근거로 삼고, 보조 매핑자료·폴더명·기존 체크값은 규정과 구분한다. 모든 제출파일을 파일 형식에 맞게 검토하고 다음을 포함한 한국어 Markdown 보고서를 작성하라: (1) 폴더/자료 성격, (2) 규정상 제출서류와 실제 파일 대조, (3) 각 서류가 증명하는 내용과 누락, (4) 가점별 개별 배점·상한, (5) O/X/보류 판정과 보류 사유. O/X/보류는 사용자 정의가 있으면 그대로 따른다. 별도 정의가 없으면 O=요건 충족 또는 조건에 해당하지 않음, X=요건 불충족 또는 조건에 해당함, 보류=자료 부족·계산 불가·적용 여부 불명확이다. 폴더 이름의 _O는 판정 근거가 아니다. 점수는 확정값과 추정값을 분리하고, 사용자가 업무부하 감소를 위해 요청한 경우 확인 subtotal·불확실 항목 추정치·범위·상한 적용 추정치를 계산하되 총점 확정처럼 쓰지 마라. 규정에 없는 배점은 보조자료 값이라고 표시하라. 보류 항목도 가능한 상한/하한 추정과 근거를 기록하라. 계산이 필요한 경우 원자료 값과 산식을 함께 보여라. 문서가 가상·교육용·요약본이면 그 한계를 명시하라. 마지막에 보완 요청 목록과 실무 결론을 제시하라.`;

async function review() {
  const apiKey = $('#api-key').value.trim(); if (!apiKey) return setStatus('OpenAI API 키를 입력하세요.', 'error');
  state.busy = true; renderFiles(); setStatus('파일을 읽고 있습니다…', 'working'); reviewBtn.textContent = '분석 중…';
  try {
    const extracted = []; const fileRefs = []; let total = 0;
    for (const file of state.files) { const result = await extractText(file); const text = result.text.slice(0, 30000); total += text.length; extracted.push(`\n===== FILE: ${file.name} =====\n[${result.note}]\n${text || '(브라우저 추출 텍스트 없음)'}`); if (!text && file.name.toLowerCase().endsWith('.hwp')) { try { const id = await uploadForModel(file, apiKey); fileRefs.push({ type: 'input_file', file_id: id }); } catch (e) { extracted.push(`[HWP 파일 업로드 실패: ${e.message}. 이 파일은 보류 사유로 기록하라.]`); } } }
    setStatus(`텍스트 ${total.toLocaleString()}자를 정리했습니다. AI가 규정과 증빙을 대조 중입니다…`, 'working');
    const content = [{ type: 'input_text', text: `${SYSTEM_PROMPT}\n\n다음은 업로드된 파일의 추출 내용이다. 파일별로 빠짐없이 검토하라.\n${extracted.join('\n')}` }, ...fileRefs];
    const response = await fetch('https://api.openai.com/v1/responses', { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: $('#model').value.trim() || 'gpt-4.1-mini', input: [{ role: 'user', content }], max_output_tokens: 12000 }) });
    const data = await response.json(); if (!response.ok) throw new Error(data.error?.message || `API 오류 ${response.status}`);
    state.report = data.output_text || data.output?.flatMap((x) => x.content || []).map((x) => x.text || '').join('\n') || '응답 본문을 찾지 못했습니다.'; reportEl.textContent = state.report; downloadBtn.disabled = false; setStatus('검토가 완료되었습니다.', 'success');
  } catch (e) { setStatus(`오류: ${e.message}`, 'error'); reportEl.textContent = '검토 중 오류가 발생했습니다. API 키, 파일 형식, 네트워크 상태를 확인하세요.\n\n' + e.stack; }
  finally { state.busy = false; reviewBtn.textContent = '검토 시작 '; reviewBtn.innerHTML = '검토 시작 <span>→</span>'; renderFiles(); }
}
reviewBtn.addEventListener('click', review);
