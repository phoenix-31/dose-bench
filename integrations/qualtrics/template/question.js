/* Qualtrics question JavaScript. Requires the header script (window.DOSE).
 * Create embedded data fields dose_trace, dose_rho, dose_lambda, dose_mu in the Survey Flow
 * *before* this block, so Qualtrics saves them. */
Qualtrics.SurveyEngine.addOnReady(function () {
  var q = this;
  var box = q.getQuestionContainer();
  var LENGTH = 10;
  var session = new DOSE.DoseSession(DOSE.createEngine(DOSE.riskLossModel()), { length: LENGTH });
  var a = box.querySelector(".dose-a");
  var b = box.querySelector(".dose-b");
  var count = box.querySelector(".dose-count");

  function finish() {
    var trace = session.trace();
    Qualtrics.SurveyEngine.setEmbeddedData("dose_trace", JSON.stringify(trace));
    Qualtrics.SurveyEngine.setEmbeddedData("dose_rho", trace.estimate.rho.mean);
    Qualtrics.SurveyEngine.setEmbeddedData("dose_lambda", trace.estimate.lambda.mean);
    Qualtrics.SurveyEngine.setEmbeddedData("dose_mu", trace.estimate.mu.mean);
    q.showNextButton();
    q.clickNextButton();
  }
  function show() {
    var item = session.next();
    if (!item) return finish();
    a.textContent = item.text.a;
    b.textContent = item.text.b;
    count.textContent = "Question " + (session.history.length + 1) + " of " + LENGTH;
  }
  a.onclick = function () { session.answer(true); show(); };
  b.onclick = function () { session.answer(false); show(); };

  q.hideNextButton();
  show();
});
