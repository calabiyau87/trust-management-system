var TrustOpsGmailService = (function () {
  function sendSummary() {
    return { skipped: true, reason: "Gmail summaries are deferred until after the core MVP." };
  }

  return {
    sendSummary: sendSummary
  };
})();
