var TrustOpsGoogleTasksService = (function () {
  function mirrorTask() {
    return { skipped: true, reason: "Google Tasks mirroring is deferred until after the core MVP." };
  }

  return {
    mirrorTask: mirrorTask
  };
})();
