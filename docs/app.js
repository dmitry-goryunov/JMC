/* JMC Practice - offline practice app for UKMT Junior Mathematical Challenge papers. */
(function () {
  'use strict';

  var STORE = 'jmc.progress.v1';
  var MOCK_MINUTES = 60;
  var app = document.getElementById('app');
  var backBtn = document.getElementById('back');
  var titleEl = document.getElementById('title');
  var metaEl = document.getElementById('topmeta');

  var data = null;      // { papers: { "2026": { year, questions: [...] } } }
  var progress = load();
  var session = null;   // active run
  var timer = null;

  /* ---------- storage ---------- */

  function load() {
    try {
      var raw = localStorage.getItem(STORE);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* private mode, or no storage */ }
    return { attempts: {}, streak: 0, best: 0 };
  }

  function save() {
    try { localStorage.setItem(STORE, JSON.stringify(progress)); } catch (e) { /* ignore */ }
  }

  function key(year, n) { return year + ':' + n; }

  function record(year, n, picked, correct) {
    var k = key(year, n);
    var a = progress.attempts[k] || { seen: 0, right: 0, wrong: 0 };
    a.seen++;
    if (correct) { a.right++; } else { a.wrong++; }
    a.last = picked;
    a.ok = correct;
    progress.attempts[k] = a;
    progress.streak = correct ? (progress.streak || 0) + 1 : 0;
    progress.best = Math.max(progress.best || 0, progress.streak);
    save();
  }

  /* ---------- helpers ---------- */

  function marksFor(n) { return n <= 15 ? 5 : 6; }

  function years() {
    return Object.keys(data.papers).sort(function (a, b) { return b - a; });
  }

  function allQuestions() {
    var out = [];
    years().forEach(function (y) {
      data.papers[y].questions.forEach(function (q) {
        out.push({ year: +y, q: q });
      });
    });
    return out;
  }

  function shuffle(list) {
    for (var i = list.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = list[i]; list[i] = list[j]; list[j] = t;
    }
    return list;
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
    app.querySelector('[data-stat="streak"]').textContent = progress.best || 0;

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
    years().forEach(function (y) {
      list.appendChild(paperRow(data.papers[y]));
    });

    app.querySelector('#precache').addEventListener('click', precacheAll);

    app.querySelector('#reset').addEventListener('click', function () {
      if (!confirm('Erase all recorded answers on this device?')) return;
      progress = { attempts: {}, streak: 0, best: 0 };
      save();
      showHome();
    });
  }

  function paperRow(paper) {
    var li = document.createElement('li');
    li.className = 'paper';
    var done = paper.questions.filter(function (q) {
      return progress.attempts[key(paper.year, q.n)];
    }).length;

    var head = document.createElement('div');
    head.className = 'paper-head';
    head.innerHTML = '<b>' + paper.year + '</b>' +
      '<span class="muted small">25 questions</span>' +
      '<span class="done">' + done + '/25</span>';
    li.appendChild(head);

    var bar = document.createElement('div');
    bar.className = 'bar';
    bar.innerHTML = '<i style="width:' + (done / 25 * 100) + '%"></i>';
    li.appendChild(bar);

    var acts = document.createElement('div');
    acts.className = 'paper-actions';

    var go = document.createElement('button');
    go.className = 'go';
    go.textContent = done ? 'Continue' : 'Practise';
    go.addEventListener('click', function () { startPaper(paper.year, false); });
    acts.appendChild(go);

    var mock = document.createElement('button');
    mock.textContent = 'Timed mock';
    mock.addEventListener('click', function () {
      if (confirm('Start the ' + paper.year + ' paper as a timed 60-minute mock?\n\n' +
                  'Answers are marked at the end.')) startPaper(paper.year, true);
    });
    acts.appendChild(mock);

    var pdf = document.createElement('a');
    pdf.textContent = 'PDF';
    pdf.href = 'papers/JMC-' + paper.year + '-paper.pdf';
    pdf.target = '_blank';
    pdf.rel = 'noopener';
    acts.appendChild(pdf);

    li.appendChild(acts);
    return li;
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
      items: shuffle(pool.slice()).slice(0, 10),
      instant: true
    });
  }

  function startPaper(year, mock) {
    var items = data.papers[year].questions.map(function (q) {
      return { year: year, q: q };
    });
    var start = 0;
    if (!mock) {
      // resume at the first question not yet attempted
      while (start < items.length && progress.attempts[key(year, items[start].q.n)]) start++;
      if (start >= items.length) start = 0;
    }
    begin({
      title: year + (mock ? ' mock' : ' paper'),
      mode: mock ? 'mock' : 'paper',
      items: items,
      index: start,
      instant: !mock,
      deadline: mock ? Date.now() + MOCK_MINUTES * 60000 : null
    });
  }

  function begin(cfg) {
    session = cfg;
    session.index = cfg.index || 0;
    session.answers = {};
    backBtn.hidden = false;
    titleEl.textContent = cfg.title;
    if (session.deadline) tick();
    renderQuestion();
  }

  function tick() {
    stopTimer();
    timer = setInterval(function () {
      var left = session && session.deadline ? session.deadline - Date.now() : 0;
      if (!session || !session.deadline) { stopTimer(); return; }
      if (left <= 0) { stopTimer(); finish(); return; }
      var m = Math.floor(left / 60000), s = Math.floor(left % 60000 / 1000);
      metaEl.innerHTML = '<span class="' + (left < 300000 ? 'warn' : '') + '">' +
        m + ':' + (s < 10 ? '0' : '') + s + '</span>';
    }, 250);
  }

  /* ---------- question screen ---------- */

  function renderQuestion() {
    var item = session.items[session.index];
    if (!item) { finish(); return; }
    view('tpl-quiz');

    if (!session.deadline) {
      metaEl.textContent = (session.index + 1) + '/' + session.items.length;
    }
    app.querySelector('.progressbar i').style.width =
      (session.index / session.items.length * 100) + '%';

    var img = app.querySelector('.qimg');
    img.src = item.q.q;
    img.width = item.q.qw;
    img.height = item.q.qh;
    img.alt = 'JMC ' + item.year + ' question ' + item.q.n;
    var wrap = app.querySelector('.qwrap');
    wrap.addEventListener('click', function () {
      var on = wrap.classList.toggle('zoom');
      // The crops are rendered at 200 dpi; half size puts body text at a
      // comfortable reading size and leaves the page to scroll sideways.
      img.style.width = on ? Math.round(item.q.qw / 2) + 'px' : '';
      if (on) wrap.scrollLeft = 0;
    });

    var chosen = session.answers[session.index];
    var buttons = Array.prototype.slice.call(app.querySelectorAll('.choices button'));
    buttons.forEach(function (b) {
      b.addEventListener('click', function () { choose(b.dataset.choice); });
    });

    var solBtn = app.querySelector('[data-act="solution"]');
    var nextBtn = app.querySelector('[data-act="next"]');
    var skipBtn = app.querySelector('[data-act="skip"]');

    nextBtn.textContent = session.index === session.items.length - 1 ? 'Finish' : 'Next';
    nextBtn.addEventListener('click', advance);
    skipBtn.addEventListener('click', advance);
    solBtn.addEventListener('click', function () { revealSolution(item); });

    if (chosen) paint(item, chosen);
  }

  function choose(letter) {
    var item = session.items[session.index];
    if (session.answers[session.index]) return;
    session.answers[session.index] = letter;
    if (session.instant) {
      record(item.year, item.q.n, letter, letter === item.q.answer);
    }
    paint(item, letter);
  }

  function paint(item, letter) {
    var correct = item.q.answer;
    var buttons = app.querySelectorAll('.choices button');
    buttons.forEach(function (b) {
      b.disabled = true;
      if (!session.instant) {
        if (b.dataset.choice === letter) b.classList.add('picked');
        return;
      }
      if (b.dataset.choice === correct) b.classList.add('right');
      else if (b.dataset.choice === letter) b.classList.add('wrong');
    });

    app.querySelector('[data-act="next"]').hidden = false;
    app.querySelector('[data-act="skip"]').hidden = true;

    if (!session.instant) return;

    var v = app.querySelector('.verdict');
    var ok = letter === correct;
    v.hidden = false;
    v.className = 'verdict ' + (ok ? 'ok' : 'bad');
    v.innerHTML = (ok ? 'Correct' : 'Not quite — the answer is ' + correct) +
      '<small>' + item.year + ' Q' + item.q.n + ' · ' + marksFor(item.q.n) + ' marks</small>';
    var solBtn = app.querySelector('[data-act="solution"]');
    solBtn.hidden = false;
    if (!item.q.s) solBtn.textContent = 'Open solutions PDF';
  }

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

  function advance() {
    session.index++;
    if (session.index >= session.items.length) finish();
    else renderQuestion();
  }

  /* ---------- results ---------- */

  function finish() {
    stopTimer();
    metaEl.textContent = '';
    titleEl.textContent = 'Results';

    var marks = 0, possible = 0, right = 0;
    session.items.forEach(function (item, i) {
      var picked = session.answers[i];
      var ok = picked === item.q.answer;
      possible += marksFor(item.q.n);
      if (!session.instant && picked) record(item.year, item.q.n, picked, ok);
      if (ok) { marks += marksFor(item.q.n); right++; }
    });

    view('tpl-results');
    app.querySelector('[data-res="marks"]').textContent = marks;
    app.querySelector('[data-res="outof"]').textContent = ' / ' + possible + ' marks';
    app.querySelector('[data-res="line"]').textContent =
      right + ' of ' + session.items.length + ' correct';

    var grid = app.querySelector('[data-res="grid"]');
    session.items.forEach(function (item, i) {
      var li = document.createElement('li');
      var b = document.createElement('button');
      var picked = session.answers[i];
      b.textContent = item.q.n;
      b.title = item.year + ' Q' + item.q.n;
      if (picked) b.className = picked === item.q.answer ? 'right' : 'wrong';
      b.addEventListener('click', function () {
        session.index = i;
        session.instant = true;
        titleEl.textContent = session.title;
        renderQuestion();
      });
      li.appendChild(b);
      grid.appendChild(li);
    });

    var finished = session;
    app.querySelector('[data-act="review"]').addEventListener('click', function () {
      finished.index = 0;
      finished.instant = true;
      session = finished;
      titleEl.textContent = finished.title;
      renderQuestion();
    });
    app.querySelector('[data-act="again"]').addEventListener('click', function () {
      if (finished.mode === 'paper' || finished.mode === 'mock') showHome();
      else startMode(finished.mode);
    });
    app.querySelector('[data-act="home"]').addEventListener('click', showHome);
  }

  /* ---------- boot ---------- */

  backBtn.addEventListener('click', function () {
    if (session && session.deadline && Date.now() < session.deadline &&
        !confirm('Leave the mock? Your timer will be lost.')) return;
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
