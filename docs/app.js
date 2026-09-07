/* JMC Practice - offline practice app for UKMT Junior Mathematical Challenge papers.
   Every set is timed at the paper's own pace, answers are collected without
   feedback, and the whole set is graded in one go. */
(function () {
  'use strict';

  var STORE = 'jmc.progress.v1';
  var BOARD_STORE = 'jmc.board.v1';
  var PAPER_MINUTES = 60;   // the real Junior Mathematical Challenge allowance
  var PAPER_MARKS = 135;    // 15 questions at 5 marks, 10 at 6
  var app = document.getElementById('app');
  var backBtn = document.getElementById('back');
  var titleEl = document.getElementById('title');
  var metaEl = document.getElementById('topmeta');

  // The two halves of a paper are practised, timed and tracked separately.
  var SEGMENTS = {
    first: { key: 'first', label: 'First 15', range: 'Q1–15', count: 15,
             has: function (n) { return n <= 15; } },
    last:  { key: 'last', label: 'Last 10', range: 'Q16–25', count: 10,
             has: function (n) { return n >= 16; } },
    all:   { key: 'all', label: 'Full paper', range: 'Q1–25', count: 25,
             has: function () { return true; } }
  };

  var data = null;      // { papers: { "2026": { year, questions: [...] } } }
  var progress = load();
  var boards = loadBoards();   // rough working, keyed like attempts
  var session = null;   // active run
  var timer = null;
  var boardWatch = null;

  /* ---------- storage ---------- */

  function load() {
    var p;
    try {
      p = JSON.parse(localStorage.getItem(STORE) || 'null');
    } catch (e) { /* private mode, or no storage */ }
    p = p || {};
    p.attempts = p.attempts || {};
    p.results = p.results || {};
    p.best = p.best || 0;
    p.streak = p.streak || 0;
    return p;
  }

  function save() {
    try { localStorage.setItem(STORE, JSON.stringify(progress)); } catch (e) { /* ignore */ }
  }

  function key(year, n) { return year + ':' + n; }
  function resultKey(year, seg) { return year + ':' + seg.key; }

  function record(year, n, picked, correct) {
    var k = key(year, n);
    var a = progress.attempts[k] || { seen: 0, right: 0, wrong: 0 };
    a.seen++;
    if (correct) { a.right++; } else { a.wrong++; }
    a.last = picked;
    a.ok = correct;
    progress.attempts[k] = a;
    progress.streak = correct ? progress.streak + 1 : 0;
    progress.best = Math.max(progress.best, progress.streak);
  }

  function forgetYear(year) {
    [progress.attempts, progress.results, boards].forEach(function (store) {
      Object.keys(store).forEach(function (k) {
        if (k.indexOf(year + ':') === 0) delete store[k];
      });
    });
    save();
    saveBoards();
  }

  /* ---------- whiteboard storage ----------
     Working is kept per question as normalised stroke paths rather than as an
     image, which is small enough to live in local storage and redraws cleanly
     at any width. */

  function loadBoards() {
    try { return JSON.parse(localStorage.getItem(BOARD_STORE) || '{}'); }
    catch (e) { return {}; }
  }

  function saveBoards() {
    for (var attempt = 0; attempt < 8; attempt++) {
      try {
        localStorage.setItem(BOARD_STORE, JSON.stringify(boards));
        return;
      } catch (e) {
        if (!dropOldestBoard()) return;   // out of room and nothing left to drop
      }
    }
  }

  function dropOldestBoard() {
    var oldest = null;
    Object.keys(boards).forEach(function (k) {
      if (!oldest || (boards[k].at || 0) < (boards[oldest].at || 0)) oldest = k;
    });
    if (!oldest) return false;
    delete boards[oldest];
    return true;
  }

  /* ---------- helpers ---------- */

  function marksFor(n) { return n <= 15 ? 5 : 6; }

  // Every set is timed at the paper's own pace: 60 minutes for 135 marks.
  function minutesFor(items) {
    var marks = items.reduce(function (t, i) { return t + marksFor(i.q.n); }, 0);
    return Math.max(1, Math.round(marks * PAPER_MINUTES / PAPER_MARKS));
  }

  function years() {
    return Object.keys(data.papers).sort(function (a, b) { return b - a; });
  }

  function questionsIn(year, seg) {
    return data.papers[year].questions
      .filter(function (q) { return seg.has(q.n); })
      .map(function (q) { return { year: +year, q: q }; });
  }

  function allQuestions() {
    var out = [];
    years().forEach(function (y) { out = out.concat(questionsIn(y, SEGMENTS.all)); });
    return out;
  }

  function answeredIn(year, seg) {
    return questionsIn(year, seg).filter(function (item) {
      return progress.attempts[key(year, item.q.n)];
    }).length;
  }

  function shuffle(list) {
    for (var i = list.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = list[i]; list[i] = list[j]; list[j] = t;
    }
    return list;
  }

  function fmtDuration(secs) {
    var m = Math.floor(secs / 60), s = Math.round(secs % 60);
    return m + 'm ' + (s < 10 ? '0' : '') + s + 's';
  }

  function fmtDate(ms) {
    var d = new Date(ms);
    var opts = { day: 'numeric', month: 'short' };
    if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
    return d.toLocaleDateString(undefined, opts);
  }

  function fmtResult(r) {
    return r.marks + '/' + r.possible + ' marks · ' + fmtDuration(r.secs) + ' · ' + fmtDate(r.at);
  }

  function toast(msg) {
    var el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(function () { el.remove(); }, 2600);
  }

  function view(id) {
    var node = document.getElementById(id).content.cloneNode(true);
    app.textContent = '';
    app.appendChild(node);
    window.scrollTo(0, 0);
  }

  function stopTimer() {
    if (timer) { clearInterval(timer); timer = null; }
  }

  /* ---------- home ---------- */

  function showHome() {
    stopTimer();
    session = null;
    backBtn.hidden = true;
    titleEl.textContent = 'JMC Practice';
    metaEl.textContent = '';
    view('tpl-home');

    var seen = 0, right = 0;
    Object.keys(progress.attempts).forEach(function (k) {
      var a = progress.attempts[k];
      seen += a.seen; right += a.right;
    });
    app.querySelector('[data-stat="answered"]').textContent = seen;
    app.querySelector('[data-stat="accuracy"]').textContent =
      seen ? Math.round(right / seen * 100) + '%' : '–';
    app.querySelector('[data-stat="streak"]').textContent = progress.best;

    var weak = wrongPool();
    var weakBtn = app.querySelector('[data-mode="weak"]');
    weakBtn.disabled = weak.length === 0;
    weakBtn.querySelector('span').textContent = weak.length
      ? weak.length + ' question' + (weak.length === 1 ? '' : 's') + ' to revisit'
      : 'Nothing to revisit yet';

    app.querySelectorAll('.mode').forEach(function (b) {
      b.addEventListener('click', function () { startMode(b.dataset.mode); });
    });

    var list = app.querySelector('#papers');
    years().forEach(function (y) { list.appendChild(paperRow(data.papers[y])); });

    app.querySelector('#precache').addEventListener('click', precacheAll);

    app.querySelector('#reset').addEventListener('click', function () {
      if (!confirm('Erase all recorded answers on this device?')) return;
      progress = { attempts: {}, results: {}, streak: 0, best: 0 };
      boards = {};
      save();
      saveBoards();
      showHome();
    });
  }

  function paperRow(paper) {
    var li = document.createElement('li');
    li.className = 'paper';
    var total = answeredIn(paper.year, SEGMENTS.all);

    var head = document.createElement('div');
    head.className = 'paper-head';
    head.innerHTML = '<b>' + paper.year + '</b><span class="done">' + total + '/25 answered</span>';
    li.appendChild(head);

    var mockResult = progress.results[resultKey(paper.year, SEGMENTS.all)];
    if (mockResult) {
      var m = document.createElement('p');
      m.className = 'whole-result';
      m.textContent = 'Full paper: ' + fmtResult(mockResult);
      li.appendChild(m);
    }

    ['first', 'last'].forEach(function (name) {
      li.appendChild(segmentBlock(paper.year, SEGMENTS[name]));
    });

    var acts = document.createElement('div');
    acts.className = 'paper-actions';

    var mock = document.createElement('button');
    mock.textContent = 'Timed mock';
    mock.addEventListener('click', function () {
      if (confirm('Sit the whole ' + paper.year + ' paper against a 60-minute clock?'))
        startPaper(paper.year, SEGMENTS.all, true);
    });
    acts.appendChild(mock);

    var pdf = document.createElement('a');
    pdf.textContent = 'PDF';
    pdf.href = 'papers/JMC-' + paper.year + '-paper.pdf';
    pdf.target = '_blank';
    pdf.rel = 'noopener';
    acts.appendChild(pdf);

    var reset = document.createElement('button');
    reset.className = 'danger';
    reset.textContent = 'Reset';
    reset.disabled = total === 0 && !mockResult;
    reset.addEventListener('click', function () {
      if (!confirm('Clear your answers and scores for the ' + paper.year + ' paper?')) return;
      forgetYear(paper.year);
      showHome();
    });
    acts.appendChild(reset);

    li.appendChild(acts);
    return li;
  }

  function segmentBlock(year, seg) {
    var done = answeredIn(year, seg);
    var mins = minutesFor(questionsIn(year, seg));
    var result = progress.results[resultKey(year, seg)];

    var box = document.createElement('div');
    box.className = 'seg';

    // The mark and the time it took sit in their own column, left of the set.
    var scoreCol = document.createElement('div');
    scoreCol.className = 'seg-score' + (result ? '' : ' none');
    scoreCol.innerHTML = result
      ? '<b>' + result.marks + '/' + result.possible + '</b>' +
        '<span>' + fmtDuration(result.secs) + '</span>' +
        '<span>' + fmtDate(result.at) + '</span>'
      : '<b>–</b><span>not marked</span>';
    box.appendChild(scoreCol);

    var main = document.createElement('div');
    main.className = 'seg-main';
    main.innerHTML =
      '<div class="seg-top">' +
        '<span class="seg-label">' + seg.label + '</span>' +
        '<span class="seg-sub">' + seg.range + ' · ' + mins + ' min</span>' +
        '<span class="seg-count">' + done + '/' + seg.count + '</span>' +
      '</div>' +
      '<div class="bar"><i style="width:' + (done / seg.count * 100) + '%"></i></div>';

    var foot = document.createElement('div');
    foot.className = 'seg-foot';

    var btns = document.createElement('span');
    btns.className = 'seg-btns';

    var go = document.createElement('button');
    go.className = 'go';
    go.textContent = done === 0 ? 'Start' : done < seg.count ? 'Continue' : 'Redo';
    go.addEventListener('click', function () { startPaper(year, seg, false); });
    btns.appendChild(go);

    var rev = document.createElement('button');
    rev.className = 'rev';
    rev.textContent = 'Review';
    rev.disabled = done === 0;
    rev.addEventListener('click', function () { startReview(year, seg); });
    btns.appendChild(rev);

    foot.appendChild(btns);
    main.appendChild(foot);
    box.appendChild(main);
    return box;
  }

  function precacheAll() {
    var btn = app.querySelector('#precache');
    if (!window.caches) { toast('This browser cannot store the app offline.'); return; }
    var urls = [];
    allQuestions().forEach(function (item) {
      urls.push(item.q.q);
      if (item.q.s) urls.push(item.q.s);
    });
    btn.disabled = true;
    var done = 0, failed = 0;
    caches.open('jmc-v1-media').then(function (cache) {
      var queue = urls.slice();
      function next() {
        var url = queue.pop();
        if (!url) return Promise.resolve();
        return cache.match(url)
          .then(function (hit) { return hit || fetch(url).then(function (r) {
            if (!r.ok) throw new Error('bad');
            return cache.put(url, r);
          }); })
          .catch(function () { failed++; })
          .then(function () {
            done++;
            btn.textContent = 'Saving… ' + Math.round(done / urls.length * 100) + '%';
            return next();
          });
      }
      // a few parallel workers keeps it quick without swamping the connection
      return Promise.all([next(), next(), next(), next()]);
    }).then(function () {
      btn.textContent = failed ? 'Saved, ' + failed + ' failed' : 'Saved for offline';
      if (!failed) toast('All papers are available offline.');
    });
  }

  function wrongPool() {
    return allQuestions().filter(function (item) {
      var a = progress.attempts[key(item.year, item.q.n)];
      return a && a.ok === false;
    });
  }

  /* ---------- sessions ---------- */

  function startMode(mode) {
    var pool;
    if (mode === 'hard') {
      pool = allQuestions().filter(function (i) { return i.q.n >= 16; });
    } else if (mode === 'weak') {
      pool = wrongPool();
    } else {
      pool = allQuestions();
    }
    if (!pool.length) { toast('No questions available for that mode.'); return; }
    begin({
      title: mode === 'hard' ? 'Hard mix' : mode === 'weak' ? 'Mistakes' : 'Quick mix',
      mode: mode,
      items: shuffle(pool.slice()).slice(0, 10)
    });
  }

  function startPaper(year, seg, mock) {
    var items = questionsIn(year, seg);
    var start = 0;
    if (!mock) {
      while (start < items.length && progress.attempts[key(year, items[start].q.n)]) start++;
      if (start >= items.length) start = 0;
    }
    begin({
      title: year + (mock ? ' mock' : ' · ' + seg.range),
      mode: mock ? 'mock' : 'paper',
      year: year,
      seg: seg,
      items: items,
      index: start
    });
  }

  function startReview(year, seg) {
    var items = questionsIn(year, seg).filter(function (item) {
      return progress.attempts[key(year, item.q.n)];
    });
    if (!items.length) { toast('Nothing answered in that half yet.'); return; }
    var answers = {};
    items.forEach(function (item, i) {
      answers[i] = progress.attempts[key(year, item.q.n)].last;
    });
    begin({
      title: year + ' · ' + seg.range + ' review',
      mode: 'review',
      year: year,
      seg: seg,
      items: items,
      answers: answers,
      marked: true
    });
  }

  function begin(cfg) {
    session = cfg;
    session.index = cfg.index || 0;
    session.answers = cfg.answers || {};
    session.marked = !!cfg.marked;
    session.startedAt = Date.now();
    session.deadline = session.marked
      ? null : session.startedAt + minutesFor(session.items) * 60000;
    backBtn.hidden = false;
    titleEl.textContent = cfg.title;
    if (session.deadline) tick();
    renderQuestion();
  }

  function tick() {
    stopTimer();
    timer = setInterval(function () {
      if (!session || !session.deadline || session.marked) { stopTimer(); return; }
      if (session.deadline - Date.now() <= 0) {
        stopTimer();
        toast('Time is up — marked as it stands.');
        mark();
        return;
      }
      updateMeta();
    }, 250);
  }

  function updateMeta() {
    var pos = (session.index + 1) + '/' + session.items.length;
    if (!session.deadline || session.marked) { metaEl.textContent = pos; return; }
    var left = Math.max(0, session.deadline - Date.now());
    var m = Math.floor(left / 60000), s = Math.floor(left % 60000 / 1000);
    metaEl.innerHTML = pos + '<span class="clock' + (left < 300000 ? ' warn' : '') + '">' +
      m + ':' + (s < 10 ? '0' : '') + s + '</span>';
  }

  function answeredCount() {
    return Object.keys(session.answers).length;
  }

  /* ---------- question screen ---------- */

  function renderQuestion() {
    var item = session.items[session.index];
    if (!item) { showHome(); return; }
    view('tpl-quiz');

    updateMeta();
    app.querySelector('.progressbar i').style.width =
      ((session.index + 1) / session.items.length * 100) + '%';

    var img = app.querySelector('.qimg');
    img.src = item.q.q;
    img.width = item.q.qw;
    img.height = item.q.qh;
    img.alt = 'JMC ' + item.year + ' question ' + item.q.n;

    var wrap = app.querySelector('.qwrap');
    wrap.addEventListener('click', function () {
      var on = wrap.classList.toggle('zoom');
      // The crops are rendered at 200 dpi; half size puts body text at a
      // comfortable reading size and leaves the card to scroll sideways.
      img.style.width = on ? Math.round(item.q.qw / 2) + 'px' : '';
      if (on) wrap.scrollLeft = 0;
    });

    var picked = session.answers[session.index];
    app.querySelectorAll('.choices button').forEach(function (b) {
      var letter = b.dataset.choice;
      if (session.marked) {
        b.disabled = true;
        if (letter === item.q.answer) b.classList.add('right');
        else if (letter === picked) b.classList.add('wrong');
      } else {
        if (letter === picked) b.classList.add('picked');
        b.addEventListener('click', function () { choose(letter); });
      }
    });

    var prev = app.querySelector('[data-act="prev"]');
    var next = app.querySelector('[data-act="next"]');
    prev.disabled = session.index === 0;
    next.disabled = session.index === session.items.length - 1;
    prev.addEventListener('click', function () { goTo(session.index - 1); });
    next.addEventListener('click', function () { goTo(session.index + 1); });

    var markBtn = app.querySelector('[data-act="mark"]');
    var solBtn = app.querySelector('[data-act="solution"]');
    if (session.marked) {
      markBtn.textContent = session.mode === 'review' ? 'Score summary' : 'Back to results';
      markBtn.addEventListener('click', showResults);
      solBtn.hidden = false;
      if (!item.q.s) solBtn.textContent = 'Open solutions PDF';
      solBtn.addEventListener('click', function () { revealSolution(item); });
      showVerdict(item, picked);
    } else {
      var n = answeredCount();
      markBtn.textContent = n ? 'Mark ' + n + ' answered' : 'Mark';
      markBtn.disabled = n === 0;
      markBtn.addEventListener('click', confirmMark);
      solBtn.hidden = true;
    }

    buildNav();
    setupBoard(item);
  }

  function showVerdict(item, picked) {
    var v = app.querySelector('.verdict');
    var ok = picked === item.q.answer;
    v.hidden = false;
    v.className = 'verdict ' + (picked ? (ok ? 'ok' : 'bad') : 'skip');
    v.innerHTML = (!picked ? 'Not answered — the answer is ' + item.q.answer
                  : ok ? 'Correct' : 'Not quite — the answer is ' + item.q.answer) +
      '<small>' + item.year + ' Q' + item.q.n + ' · ' + marksFor(item.q.n) + ' marks</small>';
  }

  function buildNav() {
    var nav = app.querySelector('.navstrip');
    session.items.forEach(function (item, i) {
      var li = document.createElement('li');
      var b = document.createElement('button');
      b.textContent = item.q.n;
      b.title = item.year + ' Q' + item.q.n;
      if (i === session.index) b.classList.add('current');
      if (session.marked) {
        var picked = session.answers[i];
        if (picked) b.classList.add(picked === item.q.answer ? 'right' : 'wrong');
      } else if (session.answers[i]) {
        b.classList.add('done');
      }
      b.addEventListener('click', function () { goTo(i); });
      li.appendChild(b);
      nav.appendChild(li);
    });
  }

  function goTo(i) {
    if (i < 0 || i >= session.items.length) return;
    session.index = i;
    renderQuestion();
  }

  function choose(letter) {
    if (session.marked) return;
    session.answers[session.index] = letter;
    // No verdict, and no jumping ahead - the reader moves on with Next.
    app.querySelectorAll('.choices button').forEach(function (b) {
      b.classList.toggle('picked', b.dataset.choice === letter);
    });
    var dot = app.querySelectorAll('.navstrip button')[session.index];
    if (dot) dot.classList.add('done');
    var markBtn = app.querySelector('[data-act="mark"]');
    var n = answeredCount();
    markBtn.textContent = 'Mark ' + n + ' answered';
    markBtn.disabled = false;
  }

  /* ---------- whiteboard ---------- */

  function setupBoard(item) {
    var wrap = app.querySelector('.board');
    var surface = wrap.querySelector('.board-surface');
    var canvas = wrap.querySelector('canvas');
    var ctx = canvas.getContext('2d');
    var k = key(item.year, item.q.n);
    var strokes = (boards[k] && boards[k].s) ? boards[k].s.slice() : [];
    var erasing = false;
    var live = null;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);

    function paint() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      strokes.forEach(function (st) { drawStroke(st); });
      if (live) drawStroke(live);
    }

    function drawStroke(st) {
      var w = canvas.width;
      ctx.globalCompositeOperation = st.e ? 'destination-out' : 'source-over';
      ctx.strokeStyle = '#191b20';
      ctx.lineWidth = Math.max(1, st.w * w);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      st.p.forEach(function (pt, i) {
        var x = pt[0] * w, y = pt[1] * w;
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      });
      if (st.p.length === 1) ctx.lineTo(st.p[0][0] * w + 0.1, st.p[0][1] * w);
      ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
    }

    function resize() {
      var r = surface.getBoundingClientRect();
      if (!r.width) return;
      canvas.width = Math.round(r.width * dpr);
      canvas.height = Math.round(r.height * dpr);
      paint();
    }

    function store() {
      if (strokes.length) boards[k] = { at: Date.now(), s: strokes };
      else delete boards[k];
      saveBoards();
    }

    function at(e) {
      var r = canvas.getBoundingClientRect();
      return [(e.clientX - r.left) * dpr / canvas.width,
              (e.clientY - r.top) * dpr / canvas.width];
    }

    canvas.addEventListener('pointerdown', function (e) {
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* no capture */ }
      live = { e: erasing ? 1 : 0, w: (erasing ? 16 : 2.4) * dpr / canvas.width, p: [at(e)] };
      paint();
    });

    canvas.addEventListener('pointermove', function (e) {
      if (!live) return;
      var pt = at(e), last = live.p[live.p.length - 1];
      var min = 1.5 * dpr / canvas.width;
      if (Math.abs(pt[0] - last[0]) < min && Math.abs(pt[1] - last[1]) < min) return;
      live.p.push([round(pt[0]), round(pt[1])]);
      paint();
    });

    function finish() {
      if (!live) return;
      strokes.push(live);
      live = null;
      paint();
      store();
    }
    canvas.addEventListener('pointerup', finish);
    canvas.addEventListener('pointercancel', finish);
    canvas.addEventListener('pointerleave', finish);

    wrap.querySelectorAll('.board-tools button').forEach(function (b) {
      b.addEventListener('click', function () {
        var tool = b.dataset.tool;
        if (tool === 'undo') {
          strokes.pop(); paint(); store(); return;
        }
        if (tool === 'clear') {
          if (strokes.length && !confirm('Wipe the working for this question?')) return;
          strokes = []; paint(); store(); return;
        }
        erasing = tool === 'eraser';
        wrap.querySelectorAll('[data-tool="pen"], [data-tool="eraser"]').forEach(function (t) {
          t.classList.toggle('on', t === b);
        });
      });
    });

    // Watch the box rather than the window, so a rotation, a resized pane or
    // an on-screen keyboard all keep the backing store in step.
    if (boardWatch) boardWatch.disconnect();
    if (window.ResizeObserver) {
      boardWatch = new ResizeObserver(resize);
      boardWatch.observe(surface);
    } else {
      window.addEventListener('resize', resize);
    }
    resize();
  }

  function round(v) { return Math.round(v * 10000) / 10000; }

  function revealSolution(item) {
    if (!item.q.s) {
      // 2016's solutions PDF cannot be cropped reliably, so open it whole.
      window.open('papers/JMC-' + item.year + '-solutions.pdf', '_blank', 'noopener');
      return;
    }
    var box = app.querySelector('.solution');
    var btn = app.querySelector('[data-act="solution"]');
    if (!box.hidden) { box.hidden = true; btn.textContent = 'Show solution'; return; }
    var img = box.querySelector('.simg');
    if (!img.src) {
      img.src = item.q.s;
      img.width = item.q.sw;
      img.height = item.q.sh;
      img.alt = 'Solution to ' + item.year + ' question ' + item.q.n;
    }
    box.hidden = false;
    btn.textContent = 'Hide solution';
    box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  /* ---------- marking ---------- */

  function confirmMark() {
    var left = session.items.length - answeredCount();
    if (left && !confirm(left + ' question' + (left === 1 ? ' is' : 's are') +
                         ' still unanswered. Mark now anyway?')) return;
    mark();
  }

  function mark() {
    stopTimer();
    session.marked = true;
    session.takenSecs = Math.round((Date.now() - session.startedAt) / 1000);
    session.items.forEach(function (item, i) {
      var picked = session.answers[i];
      if (picked) record(item.year, item.q.n, picked, picked === item.q.answer);
    });
    var tally = score();
    if (session.year && session.seg) {
      progress.results[resultKey(session.year, session.seg)] = {
        marks: tally.marks, possible: tally.possible, right: tally.right,
        count: session.items.length, secs: session.takenSecs, at: Date.now()
      };
    }
    save();
    showResults();
  }

  function score() {
    var marks = 0, possible = 0, right = 0, answered = 0;
    session.items.forEach(function (item, i) {
      var picked = session.answers[i];
      possible += marksFor(item.q.n);
      if (picked) answered++;
      if (picked === item.q.answer) { marks += marksFor(item.q.n); right++; }
    });
    return { marks: marks, possible: possible, right: right, answered: answered };
  }

  function showResults() {
    stopTimer();
    metaEl.textContent = '';
    titleEl.textContent = 'Results';

    var tally = score();
    var stored = session.year && session.seg
      ? progress.results[resultKey(session.year, session.seg)] : null;
    var secs = session.takenSecs != null ? session.takenSecs : (stored ? stored.secs : null);
    var when = session.takenSecs != null ? Date.now() : (stored ? stored.at : null);

    view('tpl-results');
    app.querySelector('[data-res="marks"]').textContent = tally.marks;
    app.querySelector('[data-res="outof"]').textContent = ' / ' + tally.possible + ' marks';
    app.querySelector('[data-res="line"]').textContent =
      tally.right + ' of ' + session.items.length + ' correct' +
      (tally.answered < session.items.length
        ? ' · ' + (session.items.length - tally.answered) + ' left blank' : '');
    app.querySelector('[data-res="when"]').textContent = secs == null ? ''
      : 'Took ' + fmtDuration(secs) + ' · ' + fmtDate(when);

    var grid = app.querySelector('[data-res="grid"]');
    session.items.forEach(function (item, i) {
      var li = document.createElement('li');
      var b = document.createElement('button');
      var picked = session.answers[i];
      b.textContent = item.q.n;
      b.title = item.year + ' Q' + item.q.n;
      if (picked) b.className = picked === item.q.answer ? 'right' : 'wrong';
      b.addEventListener('click', function () { goTo(i); });
      li.appendChild(b);
      grid.appendChild(li);
    });

    app.querySelector('[data-act="review"]').addEventListener('click', function () { goTo(0); });
    var again = app.querySelector('[data-act="again"]');
    var mix = session.mode === 'mix' || session.mode === 'hard' || session.mode === 'weak';
    again.textContent = mix ? 'Try another set' : 'Back to papers';
    again.addEventListener('click', function () {
      if (mix) startMode(session.mode); else showHome();
    });
    app.querySelector('[data-act="home"]').addEventListener('click', showHome);
  }

  /* ---------- boot ---------- */

  backBtn.addEventListener('click', function () {
    if (session && !session.marked && answeredCount() &&
        !confirm('Leave without marking? Your answers will be lost.')) return;
    showHome();
  });

  fetch('data/questions.json')
    .then(function (r) { return r.json(); })
    .then(function (json) {
      data = json;
      showHome();
    })
    .catch(function () {
      app.innerHTML = '<p class="empty">Could not load the question bank. ' +
        'If you are offline, open the app once with a connection first.</p>';
    });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () { /* ignore */ });
    });
  }
})();
