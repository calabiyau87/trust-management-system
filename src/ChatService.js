var TrustOpsChatService = (function () {
  function notifyTaskCreated() {
    return { skipped: true, reason: "Google Chat notifications are deferred until after the core MVP." };
  }

  function notifyTaskCompleted() {
    return { skipped: true, reason: "Google Chat notifications are deferred until after the core MVP." };
  }

  return {
    notifyTaskCreated: notifyTaskCreated,
    notifyTaskCompleted: notifyTaskCompleted
  };
})();
