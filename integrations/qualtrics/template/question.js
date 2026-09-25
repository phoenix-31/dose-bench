/* Qualtrics question JavaScript for one DOSE module. Requires the header script (window.DOSE).
 * In the Survey Flow, create embedded data fields dose_trace plus one per parameter (dose_rho,
 * dose_lambda, dose_mu for risk-loss; dose_delta, dose_beta, dose_mu for time) *before* this block,
 * so Qualtrics saves them. For a second module in the same survey, change PREFIX. */
Qualtrics.SurveyEngine.addOnReady(function () {
  // ---- Settings -------------------------------------------------------------------------------
  var MODULE = "risk-loss"; // "risk-loss", "time" or "time-joint"
  var LENGTH = 10;
  var SIDES = MODULE === "risk-loss" ? "fixed" : "random"; // "random" puts option A on the right about half the time
  var MIN_RT_MS = 250; // ignore clicks sooner than this after a question appears (double clicks)
  var PREFIX = "dose_"; // embedded data field prefix
  // ---------------------------------------------------------------------------------------------

  var q = this;
  var box = q.getQuestionContainer();
  var left = box.querySelector(".dose-a");
  var right = box.querySelector(".dose-b");
  var count = box.querySelector(".dose-count");
  var prompt = box.querySelector(".dose-prompt");
  var engine = DOSE.createEngine(DOSE.presetById(MODULE));

  // Survive a page reload: the trace so far is kept in this browser, keyed by response and module.
  var KEY = "dose:" + "${e://Field/ResponseID}" + ":" + PREFIX + MODULE;
  function load() {
    try {
      var raw = window.localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }
  function store(trace) {
    try {
      if (trace) window.localStorage.setItem(KEY, JSON.stringify(trace));
      else window.localStorage.removeItem(KEY);
    } catch (e) {}
  }

  var session = null;
  var saved = load();
  if (saved) {
    try {
      session = DOSE.DoseSession.resume(engine, saved);
    } catch (e) {
      session = null; // different module settings or script version: start again
    }
  }
  if (!session) session = new DOSE.DoseSession(engine, { length: LENGTH, sides: SIDES });

  if (prompt && MODULE !== "risk-loss") prompt.textContent = "Which payment would you rather receive?";

  function save(trace) {
    Qualtrics.SurveyEngine.setEmbeddedData(PREFIX + "trace", JSON.stringify(trace));
    for (var k in trace.estimate) Qualtrics.SurveyEngine.setEmbeddedData(PREFIX + k, trace.estimate[k].mean);
  }

  function finish() {
    save(session.trace());
    store(null);
    q.showNextButton();
    q.clickNextButton();
  }

  var shownAt = 0;
  var locked = true;
  function show() {
    var item = session.next();
    if (!item) return finish();
    left.textContent = item.swapped ? item.text.b : item.text.a;
    right.textContent = item.swapped ? item.text.a : item.text.b;
    count.textContent = "Question " + item.n + " of " + session.length;
    shownAt = Date.now();
    locked = false;
  }
  function choose(position) {
    if (locked || Date.now() - shownAt < MIN_RT_MS) return;
    locked = true;
    session.choose(position);
    var trace = session.trace();
    store(trace);
    save(trace);
    show();
  }
  left.onclick = function () {
    choose("left");
  };
  right.onclick = function () {
    choose("right");
  };

  q.hideNextButton();
  show();
});
