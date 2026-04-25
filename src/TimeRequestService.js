var TrustOpsTimeRequestService = (function () {
  function listRequests(context, filters) {
    var payload = filters || {};
    var requests = TrustOpsSheetService.readTable(TrustOpsConfig.SHEETS.TIME_EDIT_REQUESTS).filter(function (request) {
      if (payload.status && request.Status !== payload.status) return false;
      if (payload.payPeriodId && request["Pay Period ID"] !== payload.payPeriodId) return false;
      if (TrustOpsPermissionService.canApproveTimeRequests(context)) return true;
      return String(request["Requested By User ID"]) === String(context.userId) || String(request["Target User ID"]) === String(context.userId);
    });
    requests.sort(function (a, b) {
      return String(b["Created At"]).localeCompare(String(a["Created At"]));
    });
    return TrustOpsUtils.recordsForClient(requests);
  }

  function createRequest(context, payload) {
    var requestType = payload.requestType || payload["Request Type"] || TrustOpsConfig.REQUEST_TYPES.EDIT;
    var targetUserId = payload.targetUserId || payload["Target User ID"] || context.userId;
    var period = payload.payPeriodId
      ? TrustOpsSheetService.findById(TrustOpsConfig.SHEETS.PAY_PERIODS, payload.payPeriodId)
      : TrustOpsPayService.findPayPeriodForDate(payload.date || payload.Date || new Date());
    var record = {
      "Request Type": requestType,
      "Status": TrustOpsConfig.REQUEST_STATUS.PENDING,
      "Requested By User ID": context.userId,
      "Requested By Name": context.fullName,
      "Target User ID": targetUserId,
      "Time Entry ID": payload.timeEntryId || payload["Time Entry ID"] || "",
      "Pay Period ID": period ? period["Pay Period ID"] : "",
      "Pay Period Label": period ? period["Pay Period Label"] : "",
      "Before JSON": TrustOpsUtils.safeJson(payload.before || {}),
      "After JSON": TrustOpsUtils.safeJson(payload.after || payload.entry || {}),
      "Reason": TrustOpsUtils.requireValue(payload.reason || payload.Reason, "Request reason"),
      "Decision Notes": "",
      "Decided By User ID": "",
      "Decided At": "",
      "Created At": TrustOpsUtils.nowIso(),
      "Updated At": TrustOpsUtils.nowIso()
    };
    var saved = TrustOpsSheetService.appendRecord(TrustOpsConfig.SHEETS.TIME_EDIT_REQUESTS, record);
    TrustOpsAuditService.log(context, "TIME_EDIT_REQUEST_CREATED", "Time Edit Request", saved["Time Edit Request ID"], null, saved, record.Reason);
    return TrustOpsUtils.sanitizeForClient(saved);
  }

  function parseJsonField(value) {
    try {
      return JSON.parse(value || "{}");
    } catch (error) {
      return {};
    }
  }

  function approveRequest(context, requestId, decisionNotes) {
    TrustOpsPermissionService.requireAllowed(
      TrustOpsPermissionService.canApproveTimeRequests(context),
      "You do not have permission to approve time edit requests."
    );
    var existing = TrustOpsSheetService.findById(TrustOpsConfig.SHEETS.TIME_EDIT_REQUESTS, requestId);
    if (!existing) throw new Error("Time edit request not found.");
    if (existing.Status !== TrustOpsConfig.REQUEST_STATUS.PENDING) {
      throw new Error("This request has already been decided.");
    }
    var payload = parseJsonField(existing["After JSON"]);
    var result = TrustOpsTimeService.applyApprovedRequest(context, existing["Request Type"], existing["Time Entry ID"], payload, existing.Reason);
    var saved = TrustOpsSheetService.updateById(TrustOpsConfig.SHEETS.TIME_EDIT_REQUESTS, requestId, {
      "Status": TrustOpsConfig.REQUEST_STATUS.APPROVED,
      "Decision Notes": decisionNotes || "",
      "Decided By User ID": context.userId,
      "Decided At": TrustOpsUtils.nowIso(),
      "Updated At": TrustOpsUtils.nowIso()
    });
    TrustOpsAuditService.log(context, "TIME_EDIT_REQUEST_APPROVED", "Time Edit Request", requestId, existing, saved, decisionNotes || "");
    return {
      request: TrustOpsUtils.sanitizeForClient(saved),
      result: result
    };
  }

  function rejectRequest(context, requestId, decisionNotes) {
    TrustOpsPermissionService.requireAllowed(
      TrustOpsPermissionService.canApproveTimeRequests(context),
      "You do not have permission to reject time edit requests."
    );
    var existing = TrustOpsSheetService.findById(TrustOpsConfig.SHEETS.TIME_EDIT_REQUESTS, requestId);
    if (!existing) throw new Error("Time edit request not found.");
    if (existing.Status !== TrustOpsConfig.REQUEST_STATUS.PENDING) {
      throw new Error("This request has already been decided.");
    }
    var saved = TrustOpsSheetService.updateById(TrustOpsConfig.SHEETS.TIME_EDIT_REQUESTS, requestId, {
      "Status": TrustOpsConfig.REQUEST_STATUS.REJECTED,
      "Decision Notes": decisionNotes || "",
      "Decided By User ID": context.userId,
      "Decided At": TrustOpsUtils.nowIso(),
      "Updated At": TrustOpsUtils.nowIso()
    });
    TrustOpsAuditService.log(context, "TIME_EDIT_REQUEST_REJECTED", "Time Edit Request", requestId, existing, saved, decisionNotes || "");
    return TrustOpsUtils.sanitizeForClient(saved);
  }

  return {
    listRequests: listRequests,
    createRequest: createRequest,
    approveRequest: approveRequest,
    rejectRequest: rejectRequest
  };
})();
