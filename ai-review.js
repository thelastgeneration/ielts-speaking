(() => {
  const DEFAULT_API = 'https://ielts-speaking-api.vercel.app/api/ielts-review';
  const API = window.IELTS_REVIEW_API || DEFAULT_API;

  window.checkUpdate = async function () {
    const before = document.getElementById('answer').value.trim();
    if (!before) { toast('请先作答'); return; }
    const r = DATA[activeTopic];
    const question = r.questions[qIndex];
    const part = r.part;
    const status = document.getElementById('speechStatus');
    status.textContent = 'AI 正在按雅思标准检查…';

    try {
      const resp = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, part, answer: before })
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || 'AI 检查失败');

      const revised = (data.revised_answer || before).trim();
      const points = Array.isArray(data.diagnosis) ? data.diagnosis : [];
      const band = data.band_range ? `参考水平：${data.band_range}` : '';
      const rows = [band, ...points].filter(Boolean);
      document.getElementById('issues').innerHTML = rows.length
        ? rows.map(x => '<li>' + esc(x) + '</li>').join('')
        : '<li>未发现需要明显整改的问题。</li>';

      document.getElementById('answer').value = revised;
      answerInput();
      persist();
      document.getElementById('diffText').innerHTML = diffHtml(before, revised);
      document.getElementById('diffBox').classList.add('show');
      renderPracticeKeepDiff();
      status.textContent = 'AI 雅思检查完成';
      toast('已按 IELTS 题目整改并高亮变化');
    } catch (e) {
      status.textContent = 'AI 检查未完成';
      document.getElementById('issues').innerHTML = '<li>' + esc(e.message || 'AI 检查失败') + '</li>';
      toast('AI 接口暂未接通');
    }
  };

  document.addEventListener('DOMContentLoaded', () => {
    const btn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('检查并更新'));
    if (btn) btn.textContent = '✦ AI 检查并更新';
  });
})();
