/* MeritScholars CBT — UI shell + premium + AI + analytics + calculator */
(function () {
  "use strict";

  const CFG = window.EXCELLENCE_CONFIG || {};
  const FREE_MAX = 15;
  const PREMIUM_MAX = 50;
  const SEEN_KEY = "merit_seen_v5";
  const PREMIUM_KEY = "merit_premium_until";
  const AI_DAY_KEY = "merit_ai_day";
  const RESULTS_KEY = "merit_results_v5";
  const DEVICE_KEY = "merit_device_id";

  const $ = (id) => document.getElementById(id);
  const views = ["home", "practice", "subjects", "analytics", "tutor", "premium", "tools", "results"];

  let FULL_BANK = [];
  let FREE_POOL = [];
  let bySubject = {};
  let bankReady = false;
  let quiz = [];
  let answers = {};
  let cur = 0;
  let calcExpr = "0";

  function moneyNaira() {
    const kobo = CFG.PREMIUM_PRICE_KOBO || 200000;
    return "₦" + Math.round(kobo / 100).toLocaleString("en-NG");
  }

  function isPremium() {
    const until = parseInt(localStorage.getItem(PREMIUM_KEY) || "0", 10);
    return until > Date.now();
  }

  function premiumDaysLeft() {
    const until = parseInt(localStorage.getItem(PREMIUM_KEY) || "0", 10);
    if (until <= Date.now()) return 0;
    return Math.ceil((until - Date.now()) / 86400000);
  }

  function activatePremium(days) {
    const d = days || CFG.PREMIUM_DAYS || 90;
    const until = Date.now() + d * 86400000;
    localStorage.setItem(PREMIUM_KEY, String(until));
    refreshPlanUI();
  }

  function maxQuestions() {
    return isPremium() ? PREMIUM_MAX : FREE_MAX;
  }

  function activePool() {
    if (isPremium() && FULL_BANK.length) return FULL_BANK;
    if (FREE_POOL.length) return FREE_POOL;
    return FULL_BANK;
  }

  function deviceId() {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = "dev_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  }

  function qKey(q) {
    if (q.record_id) return String(q.record_id);
    return (q.subject || "") + "||" + String(q.question_text || "").replace(/\s+/g, " ").trim().toLowerCase();
  }

  function getSeen() {
    try {
      return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || "[]"));
    } catch {
      return new Set();
    }
  }

  function markSeen(items) {
    const s = getSeen();
    items.forEach((q) => s.add(qKey(q)));
    let arr = [...s];
    if (arr.length > 8000) arr = arr.slice(-6000);
    localStorage.setItem(SEEN_KEY, JSON.stringify(arr));
  }

  function shuffle(a) {
    const arr = a.slice();
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function fmt(n) {
    return Number(n).toLocaleString("en-NG");
  }

  function setStatus(text, ok) {
    const el = $("statusLine");
    if (!el) return;
    el.innerHTML = `<i style="${ok === false ? "background:#ef4444" : ""}"></i> ${text}`;
  }

  function showView(name) {
    views.forEach((k) => {
      const el = $(k + "View");
      if (el) el.classList.toggle("hidden", k !== name);
    });
    document.querySelectorAll(".nav").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.view === name);
    });
    $("sidebar")?.classList.remove("open");
    if (name === "analytics") renderAnalytics();
    if (name === "premium") refreshPlanUI();
    if (name === "tutor") refreshAiBadge();
  }

  function refreshPlanUI() {
    const prem = isPremium();
    if ($("sidePlan")) $("sidePlan").textContent = prem ? `Premium · ${premiumDaysLeft()}d left` : "Free plan";
    if ($("sideNoteText")) {
      $("sideNoteText").textContent = prem
        ? "Full unique bank · longer tests · higher AI limits."
        : "15 questions per test · Upgrade for full bank (90 days).";
    }
    if ($("planBadge")) {
      $("planBadge").textContent = prem ? `PREMIUM · max ${PREMIUM_MAX}` : `FREE · max ${FREE_MAX}`;
      $("planBadge").className = "badge" + (prem ? " ok" : "");
    }
    if ($("premiumStatusBadge")) {
      $("premiumStatusBadge").textContent = prem ? `ACTIVE · ${premiumDaysLeft()} days left` : "FREE";
      $("premiumStatusBadge").className = "badge" + (prem ? " ok" : " warn");
    }
    // limit options for free
    const lim = $("limit");
    if (lim) {
      [...lim.options].forEach((o) => {
        const n = parseInt(o.value, 10);
        o.disabled = !prem && n > FREE_MAX;
      });
      if (!prem && parseInt(lim.value, 10) > FREE_MAX) lim.value = String(FREE_MAX);
    }
  }

  function aiUsage() {
    const day = new Date().toISOString().slice(0, 10);
    let data = { day, count: 0 };
    try {
      data = JSON.parse(localStorage.getItem(AI_DAY_KEY) || "null") || data;
    } catch (_) {}
    if (data.day !== day) data = { day, count: 0 };
    return data;
  }

  function aiLimit() {
    return isPremium() ? CFG.AI_PREMIUM_DAILY_LIMIT || 40 : CFG.AI_FREE_DAILY_LIMIT || 3;
  }

  function refreshAiBadge() {
    const u = aiUsage();
    const lim = aiLimit();
    if ($("aiBadge")) $("aiBadge").textContent = `${Math.max(0, lim - u.count)} left today`;
  }

  function bumpAiUsage() {
    const u = aiUsage();
    u.count += 1;
    localStorage.setItem(AI_DAY_KEY, JSON.stringify(u));
    refreshAiBadge();
  }

  async function loadBank() {
    setStatus("Loading question bank…");
    FREE_POOL = Array.isArray(window.FREE_BANK) ? window.FREE_BANK.slice() : [];
    FULL_BANK = FREE_POOL.slice();

    try {
      const idxRes = await fetch("/bank/index.json?v=6", { cache: "no-store" });
      if (idxRes.ok) {
        const index = await idxRes.json();
        const paths = Object.values(index);
        const batches = await Promise.all(
          paths.map(async (path) => {
            const p = path.startsWith("/") ? path : "/" + path;
            const r = await fetch(p + "?v=6", { cache: "no-store" });
            if (!r.ok) return [];
            return r.json();
          })
        );
        const merged = [];
        const stems = new Set();
        batches.flat().forEach((q) => {
          if (!q || !q.question_text) return;
          const k = qKey(q);
          if (stems.has(k)) return;
          stems.add(k);
          merged.push(q);
        });
        if (merged.length) FULL_BANK = merged;
      }
    } catch (e) {
      console.warn(e);
    }

    bySubject = {};
    const source = isPremium() ? FULL_BANK : FREE_POOL.length ? FREE_POOL : FULL_BANK;
    // subject grid always shows full bank counts for transparency
    FULL_BANK.forEach((q) => {
      const s = q.subject || "GENERAL";
      if (!bySubject[s]) bySubject[s] = [];
      bySubject[s].push(q);
    });

    bankReady = true;
    const total = FULL_BANK.length;
    if ($("totalQuestions")) $("totalQuestions").textContent = fmt(total);
    if ($("heroCount")) $("heroCount").textContent = fmt(total) + "+";
    if ($("meterFill")) $("meterFill").style.width = Math.min(100, Math.round((total / 25000) * 100)) + "%";
    fillSubjectSelect();
    renderSubjectGrid();
    refreshPlanUI();
    setStatus(`Ready · ${fmt(total)} unique questions`, true);
  }

  function fillSubjectSelect() {
    const sel = $("subject");
    if (!sel) return;
    const subjects = Object.keys(bySubject).sort();
    sel.innerHTML = subjects.map((s) => `<option value="${s}">${s} (${fmt(bySubject[s].length)})</option>`).join("");
    if (subjects[0]) updateTopics(subjects[0]);
    sel.onchange = () => updateTopics(sel.value);
  }

  function updateTopics(subject) {
    const sel = $("topic");
    if (!sel) return;
    const pool = bySubject[subject] || [];
    const topics = [...new Set(pool.map((q) => q.topic).filter(Boolean))].sort();
    sel.innerHTML = `<option value="">All topics</option>` + topics.map((t) => `<option value="${t}">${t}</option>`).join("");
  }

  function renderSubjectGrid() {
    const grid = $("subjectGrid");
    if (!grid) return;
    grid.innerHTML = Object.keys(bySubject)
      .sort()
      .map((s) => {
        const n = bySubject[s].length;
        return `<button type="button" class="subject-card" data-subject="${s}">
          <span>SUBJECT</span><b>${s}</b><small>${fmt(n)} unique questions</small>
        </button>`;
      })
      .join("");
    grid.querySelectorAll(".subject-card").forEach((btn) => {
      btn.onclick = () => {
        showView("practice");
        if ($("subject")) $("subject").value = btn.dataset.subject;
        updateTopics(btn.dataset.subject);
      };
    });
  }

  function pickLocal(pool, limit) {
    const seen = getSeen();
    const uniq = [];
    const keys = new Set();
    for (const q of pool) {
      const k = qKey(q);
      if (!k || keys.has(k)) continue;
      keys.add(k);
      uniq.push(q);
    }
    let fresh = uniq.filter((q) => !seen.has(qKey(q)));
    if (fresh.length < limit) {
      const poolKeys = new Set(uniq.map(qKey));
      const kept = [...seen].filter((k) => !poolKeys.has(k));
      localStorage.setItem(SEEN_KEY, JSON.stringify(kept));
      fresh = uniq.slice();
    }
    const chosen = shuffle(fresh).slice(0, limit);
    markSeen(chosen);
    return chosen;
  }

  async function pickSmart(pool, limit, meta) {
    const base = String(CFG.BACKEND_URL || "").replace(/\/$/, "");
    if (base) {
      try {
        const res = await fetch(base + "/api/quiz", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            device_id: deviceId(),
            subject: meta.subject || null,
            exam_type: meta.exam || null,
            difficulty: meta.difficulty || null,
            limit,
            mark_seen: true,
            allow_recycle: true,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length) return data;
        }
      } catch (_) {}
    }
    return pickLocal(pool, limit);
  }

  async function buildTest() {
    if (!bankReady) await loadBank();
    refreshPlanUI();

    const exam = $("exam")?.value || "";
    const subject = $("subject")?.value || "";
    const topic = $("topic")?.value || "";
    const difficulty = $("difficulty")?.value || "";
    let limit = parseInt($("limit")?.value || "15", 10);
    const cap = maxQuestions();
    if (limit > cap) {
      if (!isPremium()) {
        alert(`Free plan allows max ${FREE_MAX} questions per test. Upgrade to Premium for longer tests.`);
        showView("premium");
        return;
      }
      limit = cap;
    }

    // Free users practice from free pool if available
    let pool = isPremium() ? bySubject[subject] || FULL_BANK : FREE_POOL.filter((q) => !subject || q.subject === subject);
    if (!pool.length) pool = bySubject[subject] || FULL_BANK;
    if (exam) pool = pool.filter((q) => String(q.exam_type || "").toUpperCase() === exam.toUpperCase());
    if (topic) pool = pool.filter((q) => q.topic === topic);
    if (difficulty) pool = pool.filter((q) => String(q.difficulty || "medium").toLowerCase() === difficulty);
    if (!pool.length) {
      alert("No questions match these filters.");
      return;
    }

    $("loader")?.classList.remove("hidden");
    $("questionArea")?.classList.add("hidden");
    $("builder")?.classList.add("hidden");

    quiz = await pickSmart(pool, Math.min(limit, pool.length), {
      subject,
      exam: exam || null,
      difficulty: difficulty || null,
    });
    answers = {};
    cur = 0;
    $("loader")?.classList.add("hidden");
    if (!quiz.length) {
      $("builder")?.classList.remove("hidden");
      alert("Could not load questions.");
      return;
    }
    $("questionArea")?.classList.remove("hidden");
    if ($("testTitle")) $("testTitle").innerHTML = `${subject || "Mixed"} <small id="testMeta"></small>`;
    if ($("testMeta")) $("testMeta").textContent = `${quiz.length} Q · ${exam || "Any"} · ${isPremium() ? "Premium" : "Free"}`;
    renderQuestion();
  }

  function renderQuestion() {
    const q = quiz[cur];
    if (!q) return;
    if ($("qExam")) $("qExam").textContent = q.exam_type || "CBT";
    if ($("qTopic")) $("qTopic").textContent = q.topic || q.subject || "General";
    if ($("qDiff")) $("qDiff").textContent = (q.difficulty || "medium").toUpperCase();
    if ($("qText")) $("qText").textContent = q.question_text || "";
    const opts = [
      ["A", q.option_a],
      ["B", q.option_b],
      ["C", q.option_c],
      ["D", q.option_d],
    ];
    const box = $("qOptions");
    if (box) {
      box.innerHTML = opts
        .map(([letter, text]) => {
          const sel = answers[cur] === letter ? " selected" : "";
          return `<button type="button" class="option${sel}" data-letter="${letter}"><strong>${letter}</strong><span>${text ?? ""}</span></button>`;
        })
        .join("");
      box.querySelectorAll(".option").forEach((btn) => {
        btn.onclick = () => {
          answers[cur] = btn.dataset.letter;
          renderQuestion();
        };
      });
    }
    if ($("progressLabel")) $("progressLabel").textContent = `${cur + 1} / ${quiz.length}`;
    if ($("progressBar")) $("progressBar").style.width = ((cur + 1) / quiz.length) * 100 + "%";
    if ($("prevBtn")) $("prevBtn").disabled = cur === 0;
    if ($("nextBtn")) $("nextBtn").textContent = cur >= quiz.length - 1 ? "Finish →" : "Next →";
    const grid = $("navGrid");
    if (grid) {
      grid.innerHTML = quiz
        .map((_, i) => {
          let cls = "";
          if (i === cur) cls += " current";
          if (answers[i]) cls += " answered";
          return `<button type="button" class="${cls.trim()}" data-i="${i}">${i + 1}</button>`;
        })
        .join("");
      grid.querySelectorAll("button").forEach((b) => {
        b.onclick = () => {
          cur = +b.dataset.i;
          renderQuestion();
        };
      });
    }
  }

  function submitTest() {
    if (!quiz.length) return;
    let score = 0;
    quiz.forEach((q, i) => {
      if (answers[i] && answers[i] === String(q.correct_option || "").toUpperCase()) score++;
    });
    const pct = Math.round((score / quiz.length) * 100);
    const subject = quiz[0]?.subject || "";
    try {
      const hist = JSON.parse(localStorage.getItem(RESULTS_KEY) || "[]");
      hist.unshift({ score, total: quiz.length, pct, at: Date.now(), subject });
      localStorage.setItem(RESULTS_KEY, JSON.stringify(hist.slice(0, 50)));
    } catch (_) {}

    const card = $("resultsCard");
    if (card) {
      card.innerHTML = `
        <div class="score-ring"><b>${pct}%</b><span>${score}/${quiz.length}</span></div>
        <div>
          <div class="mini-label">SESSION RESULT</div>
          <h2>${pct >= 70 ? "Strong performance" : pct >= 50 ? "Keep practising" : "Review & retry"}</h2>
          <p class="muted">You scored <b>${score}</b> out of <b>${quiz.length}</b> in ${subject || "practice"}.</p>
          <div class="tools-row">
            <button type="button" class="primary" id="againBtn">Practise again</button>
            <button type="button" class="secondary" id="toAnalytics">Analytics</button>
          </div>
        </div>`;
      $("againBtn")?.addEventListener("click", () => {
        $("builder")?.classList.remove("hidden");
        $("questionArea")?.classList.add("hidden");
        showView("practice");
      });
      $("toAnalytics")?.addEventListener("click", () => showView("analytics"));
    }

    const base = String(CFG.BACKEND_URL || "").replace(/\/$/, "");
    if (base) {
      fetch(base + "/api/attempts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          device_id: deviceId(),
          subject,
          score,
          total: quiz.length,
          question_ids: quiz.map((q) => q.id).filter(Boolean),
        }),
      }).catch(() => {});
    }
    showView("results");
  }

  function renderAnalytics() {
    let hist = [];
    try {
      hist = JSON.parse(localStorage.getItem(RESULTS_KEY) || "[]");
    } catch (_) {}
    if ($("aAttempts")) $("aAttempts").textContent = String(hist.length);
    if (hist.length) {
      const avg = Math.round(hist.reduce((s, h) => s + h.pct, 0) / hist.length);
      const best = Math.max(...hist.map((h) => h.pct));
      if ($("aAvg")) $("aAvg").textContent = avg + "%";
      if ($("aBest")) $("aBest").textContent = best + "%";
    } else {
      if ($("aAvg")) $("aAvg").textContent = "—";
      if ($("aBest")) $("aBest").textContent = "—";
    }
    const tb = $("analyticsTable")?.querySelector("tbody");
    if (tb) {
      if (!hist.length) {
        tb.innerHTML = `<tr><td colspan="4" class="muted-sm">No sessions yet.</td></tr>`;
      } else {
        tb.innerHTML = hist
          .slice(0, 20)
          .map((h) => {
            const when = new Date(h.at).toLocaleString();
            return `<tr><td>${when}</td><td>${h.subject || "—"}</td><td>${h.score}/${h.total}</td><td>${h.pct}%</td></tr>`;
          })
          .join("");
      }
    }
    // weak subjects: lowest average pct
    const by = {};
    hist.forEach((h) => {
      const s = h.subject || "General";
      if (!by[s]) by[s] = [];
      by[s].push(h.pct);
    });
    const weak = Object.entries(by)
      .map(([s, arr]) => ({ s, avg: arr.reduce((a, b) => a + b, 0) / arr.length, n: arr.length }))
      .filter((x) => x.n >= 1)
      .sort((a, b) => a.avg - b.avg)
      .slice(0, 5);
    if ($("weakList")) {
      $("weakList").innerHTML = weak.length
        ? `<ul class="list-check">` + weak.map((w) => `<li>${w.s} — avg ${Math.round(w.avg)}% (${w.n} tests)</li>`).join("") + `</ul>`
        : `Complete a few tests to see weak areas.`;
    }
  }

  // ----- AI (Gemini / OpenAI-compatible) -----
  async function callChatAPI(system, userContent) {
    const provider = (CFG.AI_PROVIDER || "gemini").toLowerCase();
    const key = CFG.AI_API_KEY || "";
    if (!key) throw new Error("Add AI_API_KEY in config.js (free Gemini key: https://aistudio.google.com/apikey)");
    const model = CFG.AI_MODEL || "gemini-2.0-flash";
    const maxTokens = CFG.AI_MAX_TOKENS || 2048;

    if (provider === "gemini") {
      const base = (CFG.AI_API_URL || "https://generativelanguage.googleapis.com/v1beta/models").replace(/\/$/, "");
      const url = `${base}/${model}:generateContent?key=${encodeURIComponent(key)}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: userContent }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: maxTokens },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data.error && data.error.message) || "Gemini error");
      const parts = (((data.candidates || [])[0] || {}).content || {}).parts || [];
      const text = parts.map((p) => p.text || "").join("").trim();
      if (!text) throw new Error("Empty AI response");
      return text;
    }

    const url = CFG.AI_API_URL || "https://openrouter.ai/api/v1/chat/completions";
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + key,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: userContent },
        ],
        temperature: 0.3,
        max_tokens: maxTokens,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((data.error && data.error.message) || "AI error");
    return (((data.choices || [])[0] || {}).message || {}).content || "";
  }

  const TUTOR_SYSTEM = `You are Merit AI, a concise WAEC WASSCE and JAMB UTME tutor for Nigerian secondary students.
Rules:
1. Keep every response under 150 words.
2. Structure exactly as:
**Core Concept**: One sentence.
**Step-by-Step Solution**: Numbered steps. Use $...$ for maths.
**Exam Tip**: One WAEC/JAMB trap or memory trick.
3. State ALL solutions for equations.`;

  async function sendTutor() {
    const input = $("tutorInput");
    const msg = (input?.value || "").trim();
    if (!msg) return;
    const u = aiUsage();
    const lim = aiLimit();
    if (u.count >= lim) {
      $("tutorStatus").textContent = isPremium()
        ? "Daily AI limit reached. Try again tomorrow."
        : "Free AI limit reached (3/day). Upgrade to Premium for 40/day.";
      if (!isPremium()) showView("premium");
      return;
    }
    $("tutorStatus").textContent = "Thinking…";
    $("tutorChat").textContent = ( $("tutorChat").textContent === "Ask a question to start…" ? "" : $("tutorChat").textContent + "\n\n") + "You: " + msg + "\n\nMerit AI: …";
    try {
      const reply = await callChatAPI(TUTOR_SYSTEM, msg);
      bumpAiUsage();
      $("tutorChat").textContent = $("tutorChat").textContent.replace("Merit AI: …", "Merit AI:\n" + reply);
      $("tutorStatus").textContent = "";
      if (input) input.value = "";
    } catch (e) {
      $("tutorStatus").textContent = "Error: " + e.message;
      $("tutorChat").textContent = $("tutorChat").textContent.replace("Merit AI: …", "Merit AI: (failed)");
    }
  }

  // ----- Paystack -----
  function loadPaystack(cb) {
    if (window.PaystackPop) return cb();
    const s = document.createElement("script");
    s.src = "https://js.paystack.co/v1/inline.js";
    s.onload = cb;
    s.onerror = () => {
      if ($("payMsg")) $("payMsg").textContent = "Could not load Paystack. Check your network.";
    };
    document.head.appendChild(s);
  }

  function startPay() {
    const key = CFG.PAYSTACK_PUBLIC_KEY || "";
    if (!key) {
      if ($("payMsg")) $("payMsg").textContent = "Paystack public key missing in config.js";
      return;
    }
    const email = ($("payEmail")?.value || "").trim();
    if (!email || !email.includes("@")) {
      if ($("payMsg")) $("payMsg").textContent = "Enter a valid email for your receipt.";
      return;
    }
    if ($("payMsg")) $("payMsg").textContent = "Opening Paystack…";
    loadPaystack(() => {
      const handler = PaystackPop.setup({
        key,
        email,
        amount: CFG.PREMIUM_PRICE_KOBO || 200000,
        currency: "NGN",
        ref: "MS_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8),
        metadata: { plan: CFG.PREMIUM_PLAN_NAME || "MeritScholars Premium 90 days" },
        callback: function (response) {
          activatePremium(CFG.PREMIUM_DAYS || 90);
          if ($("payMsg")) $("payMsg").textContent = "Payment successful. Premium activated for 90 days. Ref: " + response.reference;
          refreshPlanUI();
        },
        onClose: function () {
          if ($("payMsg")) $("payMsg").textContent = "Payment window closed.";
        },
      });
      handler.openIframe();
    });
  }

  // ----- Calculator -----
  function setCalc(v) {
    calcExpr = v;
    if ($("calcDisplay")) $("calcDisplay").value = v;
    if ($("calcDisplay2")) $("calcDisplay2").value = v;
  }

  function calcPress(key) {
    if (key === "C") return setCalc("0");
    if (key === "⌫") {
      const n = calcExpr.length <= 1 ? "0" : calcExpr.slice(0, -1);
      return setCalc(n);
    }
    if (key === "=") {
      try {
        const safe = calcExpr.replace(/×/g, "*").replace(/÷/g, "/").replace(/[^0-9+\-*/().%\s]/g, "");
        // eslint-disable-next-line no-new-func
        const val = Function(`"use strict"; return (${safe})`)();
        return setCalc(String(val));
      } catch {
        return setCalc("Error");
      }
    }
    if (calcExpr === "0" || calcExpr === "Error") setCalc(key);
    else setCalc(calcExpr + key);
  }

  function mountCalc(gridId) {
    const grid = $(gridId);
    if (!grid || grid.dataset.ready) return;
    const keys = ["7", "8", "9", "÷", "4", "5", "6", "×", "1", "2", "3", "-", "0", ".", "⌫", "+", "C", "(", ")", "="];
    grid.innerHTML = keys
      .map((k) => {
        let cls = "";
        if ("÷×-+".includes(k)) cls = "op";
        if (k === "=") cls = "eq";
        return `<button type="button" class="${cls}" data-k="${k}">${k}</button>`;
      })
      .join("");
    grid.querySelectorAll("button").forEach((b) => {
      b.onclick = () => calcPress(b.dataset.k);
    });
    grid.dataset.ready = "1";
  }


  const GENERATOR_SYSTEM = `You are an expert JAMB UTME and WAEC WASSCE question author for Nigerian secondary schools.
Output ONLY a valid JSON array of exactly 5 objects. No markdown fences, no commentary.
Each object must have:
exam_type, subject, topic, question_text, option_a, option_b, option_c, option_d, correct_option (A/B/C/D), explanation, difficulty.
Rules:
- Questions must be factually/mathematically correct.
- correct_option must match the truly right option.
- Use $...$ for maths/formulas.
- Align with official syllabus language.`;

  function parseGeneratedQuestions(text) {
    let t = String(text || "").trim();
    t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    const start = t.indexOf("[");
    const end = t.lastIndexOf("]");
    if (start >= 0 && end > start) t = t.slice(start, end + 1);
    const arr = JSON.parse(t);
    if (!Array.isArray(arr)) throw new Error("AI did not return a list");
    return arr.slice(0, 5).map((q, i) => ({
      exam_type: q.exam_type || "JAMB",
      subject: (q.subject || "").toUpperCase(),
      topic: q.topic || "",
      question_text: q.question_text || "",
      option_a: q.option_a || "",
      option_b: q.option_b || "",
      option_c: q.option_c || "",
      option_d: q.option_d || "",
      correct_option: String(q.correct_option || "A").toUpperCase().slice(0, 1),
      explanation: q.explanation || "",
      difficulty: q.difficulty || "medium",
      record_id: "AI-" + Date.now() + "-" + i,
    })).filter((q) => q.question_text);
  }

  let lastGenerated = [];

  async function generateFive() {
    const u = aiUsage();
    const lim = aiLimit();
    if (u.count >= lim) {
      if ($("genStatus")) $("genStatus").textContent = isPremium()
        ? "Daily AI limit reached."
        : "Free AI limit reached. Upgrade for more.";
      if (!isPremium()) showView("premium");
      return;
    }
    const exam = $("genExam")?.value || "JAMB";
    const subject = $("genSubject")?.value || "Mathematics";
    const topic = ($("genTopic")?.value || "").trim() || "Core syllabus";
    const diff = $("genDiff")?.value || "medium";
    if ($("genStatus")) $("genStatus").textContent = "Generating 5 questions…";
    if ($("genBtn")) $("genBtn").disabled = true;
    try {
      const prompt = `Generate exactly 5 ${diff} ${exam} practice questions on ${subject}, topic: ${topic}.
Return ONLY a JSON array of 5 objects with fields: exam_type, subject, topic, question_text, option_a, option_b, option_c, option_d, correct_option, explanation, difficulty.`;
      const reply = await callChatAPI(GENERATOR_SYSTEM, prompt);
      bumpAiUsage();
      lastGenerated = parseGeneratedQuestions(reply);
      if (!lastGenerated.length) throw new Error("No usable questions parsed");
      const box = $("genResults");
      if (box) {
        box.innerHTML = lastGenerated.map((q, i) => `
          <div class="panel" style="margin-bottom:10px;padding:14px">
            <div class="q-meta" style="margin-bottom:8px">
              <span>${q.exam_type}</span><span>${q.topic || subject}</span><span>${(q.difficulty||"").toUpperCase()}</span>
            </div>
            <div style="font-weight:650;margin-bottom:8px">${i + 1}. ${q.question_text}</div>
            <div class="muted-sm">A. ${q.option_a}<br>B. ${q.option_b}<br>C. ${q.option_c}<br>D. ${q.option_d}</div>
            <div class="muted-sm" style="margin-top:8px"><b>Answer:</b> ${q.correct_option} — ${q.explanation || ""}</div>
          </div>`).join("");
      }
      $("genResultsPanel")?.classList.remove("hidden");
      if ($("genStatus")) $("genStatus").textContent = "Generated " + lastGenerated.length + " questions.";
    } catch (e) {
      if ($("genStatus")) $("genStatus").textContent = "Error: " + e.message;
    } finally {
      if ($("genBtn")) $("genBtn").disabled = false;
    }
  }

  function practiceGenerated() {
    if (!lastGenerated.length) return;
    quiz = lastGenerated.slice();
    answers = {};
    cur = 0;
    $("builder")?.classList.add("hidden");
    $("questionArea")?.classList.remove("hidden");
    if ($("testTitle")) $("testTitle").innerHTML = `AI set <small id="testMeta"></small>`;
    if ($("testMeta")) $("testMeta").textContent = quiz.length + " AI-generated questions";
    showView("practice");
    renderQuestion();
  }

  function bind() {
    document.querySelectorAll(".nav").forEach((btn) => {
      btn.addEventListener("click", () => showView(btn.dataset.view));
    });
    $("menu")?.addEventListener("click", () => $("sidebar")?.classList.toggle("open"));
    $("startBtn")?.addEventListener("click", () => showView("practice"));
    $("goPremiumBtn")?.addEventListener("click", () => showView("premium"));
    $("homePayCta")?.addEventListener("click", () => showView("premium"));
    $("homePayLearn")?.addEventListener("click", () => showView("premium"));
    $("waBtnPremium")?.addEventListener("click", () => {
      const wa = (CFG.SUPPORT_WHATSAPP || "2349031512760").replace(/\D/g, "");
      window.open("https://wa.me/" + wa, "_blank");
    });
    document.querySelectorAll(".choice").forEach((btn) => {
      btn.addEventListener("click", () => {
        showView("practice");
        if ($("exam")) $("exam").value = btn.dataset.exam || "";
      });
    });
    document.querySelectorAll("[data-view-jump]").forEach((btn) => {
      btn.addEventListener("click", () => showView(btn.dataset.viewJump));
    });
    $("buildBtn")?.addEventListener("click", () => buildTest());
    $("prevBtn")?.addEventListener("click", () => {
      if (cur > 0) {
        cur--;
        renderQuestion();
      }
    });
    $("nextBtn")?.addEventListener("click", () => {
      if (cur < quiz.length - 1) {
        cur++;
        renderQuestion();
      } else submitTest();
    });
    $("submitBtn")?.addEventListener("click", submitTest);
    $("tutorSend")?.addEventListener("click", sendTutor);
    $("payBtn")?.addEventListener("click", startPay);
    $("calcFab")?.addEventListener("click", () => {
      mountCalc("calcGrid2");
      $("floatCalc")?.classList.toggle("open");
    });
    $("calcClose")?.addEventListener("click", () => $("floatCalc")?.classList.remove("open"));
    const wa = CFG.SUPPORT_WHATSAPP || "2349031512760";
    if ($("waLabel")) $("waLabel").textContent = "+" + wa.replace(/^\+/, "");
    $("waBtn")?.addEventListener("click", () => {
      window.open("https://wa.me/" + wa.replace(/\D/g, ""), "_blank");
    });
    if ($("supportMail")) {
      $("supportMail").href = "mailto:" + (CFG.SUPPORT_EMAIL || "lumeriqdesigns@gmail.com");
      $("supportMail").textContent = CFG.SUPPORT_EMAIL || "email";
    }
    mountCalc("calcGrid");
    mountCalc("calcGrid2");
  }

  bind();
  deviceId();
  refreshPlanUI();
  loadBank();
})();
