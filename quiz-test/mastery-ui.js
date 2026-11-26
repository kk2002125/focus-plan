(function () {
  "use strict";
  const M = window.QuizMastery;
  let listDialog = null;
  let filter = "weak";
  let chapter = "";
  let visibleCount = 40;

  function info(q) {
    return M.describe(state.memory?.[q.id], state.history, q.id);
  }
  function badge(q) {
    const item = info(q);
    return '<span class="mastery-badge ' + item.key + '">' + item.label + "</span>";
  }
  function overview() {
    const forecast = M.forecast(questions, state.memory);
    const summary = M.summarize(questions, state.memory, state.history);
    const breakdown = {
      weak: {memory: 0, understand: 0},
      hazy: {memory: 0, understand: 0},
      familiar: {memory: 0, understand: 0}
    };
    for (const q of questions) {
      const counts = breakdown[info(q).key];
      if (counts) counts[studyKind(q)]++;
    }
    return `<section class="card mastery-overview" aria-label="记忆掌握情况">
      <div class="ai-heading"><h2>记忆掌握情况</h2><button class="ai-small" onclick="QuizMasteryUI.explain()">分类说明</button></div>
      <p class="ai-caption">已进入记忆系统 ${summary.entered} / ${summary.total} 题（含学习中）</p>
      <div class="review-forecast">
        <button class="ai-small" onclick="QuizMasteryUI.openList('tomorrow')">明日预估复习：<b data-tomorrow-count>${forecast.tomorrowCount}</b> 题 ›</button>
        <button class="ai-small" onclick="QuizMasteryUI.openList('due')">当前到期未完成：<b data-due-count>${forecast.dueCount}</b> 题 ›</button>
        <details class="forecast-help"><summary>预估说明</summary><p>按北京时间统计已安排在明天到期的题目，每题只计一次。今天继续新学或复习后，预估数量可能变化。</p></details>
      </div>
      <div class="mastery-grid">${["weak", "hazy", "familiar"].map(key => `<button class="mastery-tile ${key}" onclick="QuizMasteryUI.openList('${key}')"><span>${M.LABELS[key]}</span><b>${summary.counts[key]}</b><small>${summary.percentages[key]}% · 已学习题目</small><span class="mastery-methods"><span>直接记忆 ${breakdown[key].memory} 题</span><span>原理与计算 ${breakdown[key].understand} 题</span></span></button>`).join("")}</div>
      <div class="mastery-secondary"><button class="ai-small" onclick="QuizMasteryUI.openList('unlearned')">未学习 ${summary.counts.unlearned} 题 ›</button></div>
    </section>`;
  }
  function modal(title, html) {
    const dialog = document.createElement("dialog");
    dialog.className = "review-dialog";
    dialog.innerHTML = `<header class="review-header"><h2>${esc(title)}</h2><button class="ghost" data-close>关闭 ×</button></header><div class="review-scroll">${html}</div>`;
    function close() {
      dialog.close();
      dialog.remove();
      if (listDialog === dialog) listDialog = null;
    }
    dialog.querySelector("[data-close]").onclick = close;
    dialog.addEventListener("cancel", event => { event.preventDefault(); close(); });
    document.body.append(dialog);
    dialog.showModal();
    return dialog;
  }
  function explain() {
    modal("掌握程度怎么判断？", `<div class="classification-help">
      <p><b>不熟</b>　学习中，或尚未核实通过第 3 天及更后复习节点。</p>
      <p><b>模糊</b>　已核实通过第 3 / 7 天节点，尚未通过第 14 天及更后节点。</p>
      <p><b>熟悉</b>　已核实通过第 14 / 30 / 60 天节点。</p>
      <p><b>未学习</b>　没有记忆曲线记录，单独统计。</p>
      <p>分类依据实际答对的正式复习节点。额外练习不会提前升级，答错重学后归为不熟。到期题会同时标记待复习。</p>
      <p>旧记录依据可核实的本轮历史分类，缺少凭据的节点不计入已通过。百分比按已进入记忆系统的题目计算。</p>
    </div>`);
  }
  function rows() {
    const forecast = ["tomorrow","due"].includes(filter) ? M.forecast(questions, state.memory) : null;
    const ids = forecast && new Set(filter === "tomorrow" ? forecast.tomorrowIds : forecast.dueIds);
    return questions.filter(q => (!chapter || q.chapter === chapter) && (ids ? ids.has(q.id) : info(q).key === filter));
  }
  function renderRows() {
    if (!listDialog) return;
    const list = rows();
    listDialog.querySelector("[data-rows]").innerHTML = `<p class="ai-caption">符合筛选 ${list.length} 题</p>
      <button class="primary" onclick="QuizMasteryUI.practiceFiltered()" ${list.length ? "" : "disabled"}>练习当前筛选 ${list.length} 题</button>
      <div class="mastery-question-list">${list.slice(0, visibleCount).map(q => `<article class="wrong-card"><div class="ai-meta">${esc(q.chapter)} · 第 ${q.id} 题 ${badge(q)}</div><h4>${q.sourceBank ? q.q : esc(q.q)}</h4><button class="ai-small" onclick="QuizMasteryUI.practiceOne(${q.id})">练习本题</button></article>`).join("")}</div>
      ${list.length > visibleCount ? '<button class="ghost" onclick="QuizMasteryUI.showMore()">继续显示</button>' : ""}
      ${list.length ? "" : '<p class="empty">当前筛选下暂无题目。</p>'}`;
  }
  function openList(key) {
    if (!["weak", "hazy", "familiar", "unlearned", "due", "tomorrow"].includes(key)) return;
    filter = key;
    chapter = "";
    visibleCount = 40;
    listDialog = modal(key === "tomorrow" ? "明日预估复习" : key === "due" ? "当前到期未完成" : M.LABELS[key] + "题目",
      `<label class="chapter-filter">按章节筛选<select><option value="">全部章节</option>${chapterList().map(name => `<option value="${esc(name)}">${esc(name)}</option>`).join("")}</select></label><div data-rows></div>`);
    listDialog.querySelector("select").onchange = event => { chapter = event.target.value; visibleCount = 40; renderRows(); };
    renderRows();
  }
  function launch(ids) {
    if (!ids.length) return;
    listDialog?.close();
    listDialog?.remove();
    listDialog = null;
    startPractice("selection", ids);
  }
  function practiceFiltered() { launch(rows().map(q => q.id)); }
  function practiceOne(id) { if (questions.some(q => q.id === id)) launch([id]); }
  function showMore() { visibleCount += 40; renderRows(); }

  function chapterGrid() {
    if (!practice) return "";
    const current = getQ();
    const title=practice.mode==="chapter"?"本章选题":["review","filteredReview"].includes(practice.mode)?"复习选题":"本轮选题";
    const ids=[...new Set(practice.queue)];
    return `<section class="card chapter-picker" aria-label="${title}"><h2>${title}</h2><div class="chapter-question-grid">${ids.map((id,index)=>{
      const q=questions.find(q=>q.id===id),item=info(q);
      const positions=practice.queue.flatMap((value,i)=>value===id?[i]:[]);
      const done=positions.every(i=>i===practice.pos?practice.done:practice.attempts[i]?.done);
      return `<button class="chapter-question ${item.key} ${id===current.id?"current":""}" ${id===current.id?'aria-current="true"':""} onclick="QuizMasteryUI.jumpChapter(${id})"><b>${index+1}</b><small>${done?"已作答":item.label}</small></button>`;
    }).join("")}</div></section>`;
  }
  function jumpChapter(id) {
    if(!practice)return;
    const positions=practice.queue.flatMap((value,i)=>value===id?[i]:[]);
    const position=positions.find(i=>i===practice.pos?!practice.done:!practice.attempts[i]?.done)??positions[0];
    if(position===undefined)return;
    jumpPractice(position);
    document.querySelector(".chapter-question.current")?.scrollIntoView({block:"nearest"});
  }
  window.QuizMasteryUI = {info, badge, overview, explain, openList, practiceFiltered, practiceOne, showMore, chapterGrid, jumpChapter};
  function refreshForecast() {
    const widget = document.querySelector(".review-forecast");
    if (!widget) return;
    const forecast = M.forecast(questions, state.memory);
    widget.querySelector("[data-tomorrow-count]").textContent = forecast.tomorrowCount;
    widget.querySelector("[data-due-count]").textContent = forecast.dueCount;
    if (listDialog && ["tomorrow", "due"].includes(filter)) renderRows();
  }
  function scheduleRollover() {
    const midnight = M.forecast([], {}).tomorrowStart;
    setTimeout(() => { refreshForecast(); scheduleRollover(); }, Math.max(1, midnight - Date.now()));
  }
  window.addEventListener("electronics-quiz-state-saved", refreshForecast);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) refreshForecast(); });
  scheduleRollover();
  if (view === "home") home();
})();
