var TrustOpsCalendarService = (function () {
  function suggestTimeEntries() {
    return { skipped: true, reason: "Calendar suggestions are deferred until after the core MVP." };
  }

  return {
    suggestTimeEntries: suggestTimeEntries
  };
})();
