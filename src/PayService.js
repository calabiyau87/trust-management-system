var TrustOpsPayService = (function () {
  function listPayPeriods() {
    ensurePayPeriodsAround(new Date(), 1, 1);
    var periods = TrustOpsSheetService.readTable(TrustOpsConfig.SHEETS.PAY_PERIODS);
    periods.sort(function (a, b) {
      return String(a["Start Date"]).localeCompare(String(b["Start Date"]));
    });
    return TrustOpsUtils.recordsForClient(periods);
  }

  function periodLabel(startDate, endDate) {
    return TrustOpsUtils.formatDateLabel(startDate) + " - " + TrustOpsUtils.formatDateLabel(endDate);
  }

  function generatedPeriodId(startDate) {
    return "pay_" + TrustOpsUtils.formatDate(startDate).replace(/-/g, "");
  }

  function findPayPeriodForDate(dateValue) {
    var date = TrustOpsUtils.parseDate(dateValue);
    if (!date) throw new Error("A valid date is required.");
    var periods = TrustOpsSheetService.readTable(TrustOpsConfig.SHEETS.PAY_PERIODS);
    var matching = periods.filter(function (period) {
      return TrustOpsUtils.isBetweenInclusive(date, period["Start Date"], period["End Date"]);
    })[0];
    if (matching) return matching;
    return createGeneratedPayPeriod(date);
  }

  function createGeneratedPayPeriod(dateValue) {
    var date = TrustOpsUtils.parseDate(dateValue);
    var anchor = TrustOpsUtils.parseDate(
      TrustOpsSettingsService.getSetting("PAY_PERIOD_ANCHOR_DATE", TrustOpsConfig.PAY_PERIOD_ANCHOR_DATE)
    );
    var periodDays = TrustOpsUtils.toNumber(
      TrustOpsSettingsService.getSetting("DEFAULT_PAY_PERIOD_DAYS", TrustOpsConfig.PAY_PERIOD_DAYS)
    ) || TrustOpsConfig.PAY_PERIOD_DAYS;
    var offset = Math.floor(TrustOpsUtils.daysBetween(anchor, date) / periodDays);
    var start = TrustOpsUtils.addDays(anchor, offset * periodDays);
    var end = TrustOpsUtils.addDays(start, periodDays - 1);
    var id = generatedPeriodId(start);
    var existing = TrustOpsSheetService.findById(TrustOpsConfig.SHEETS.PAY_PERIODS, id);
    if (existing) return existing;
    return TrustOpsSheetService.appendRecord(TrustOpsConfig.SHEETS.PAY_PERIODS, {
      "Pay Period ID": id,
      "Start Date": TrustOpsUtils.formatDate(start),
      "End Date": TrustOpsUtils.formatDate(end),
      "Pay Period Label": periodLabel(start, end),
      "Status": TrustOpsConfig.PAY_PERIOD_STATUS.OPEN,
      "Locked": false,
      "Locked By User ID": "",
      "Locked At": "",
      "Created At": TrustOpsUtils.nowIso(),
      "Updated At": TrustOpsUtils.nowIso()
    });
  }

  function ensurePayPeriodsAround(dateValue, previousCount, nextCount) {
    var date = TrustOpsUtils.parseDate(dateValue || new Date());
    var current = createGeneratedPayPeriod(date);
    var periodDays = TrustOpsUtils.toNumber(
      TrustOpsSettingsService.getSetting("DEFAULT_PAY_PERIOD_DAYS", TrustOpsConfig.PAY_PERIOD_DAYS)
    ) || TrustOpsConfig.PAY_PERIOD_DAYS;
    var start = TrustOpsUtils.parseDate(current["Start Date"]);
    for (var previous = 1; previous <= (previousCount || 0); previous += 1) {
      createGeneratedPayPeriod(TrustOpsUtils.addDays(start, previous * -periodDays));
    }
    for (var next = 1; next <= (nextCount || 0); next += 1) {
      createGeneratedPayPeriod(TrustOpsUtils.addDays(start, next * periodDays));
    }
    return current;
  }

  function isLocked(period) {
    return period && (TrustOpsUtils.toBoolean(period.Locked) || period.Status === TrustOpsConfig.PAY_PERIOD_STATUS.LOCKED);
  }

  function getCurrentPayPeriod() {
    return findPayPeriodForDate(new Date());
  }

  function calculateUserSummary(user, payPeriod) {
    var entries = TrustOpsSheetService.readTable(TrustOpsConfig.SHEETS.TIME_ENTRIES).filter(function (entry) {
      return (
        String(entry["User ID"]) === String(user["User ID"]) &&
        String(entry["Pay Period ID"]) === String(payPeriod["Pay Period ID"]) &&
        !TrustOpsUtils.toBoolean(entry.Deleted)
      );
    });
    var totalHours = entries.reduce(function (sum, entry) {
      return sum + TrustOpsUtils.toNumber(entry.Hours);
    }, 0);
    var payType = user["Pay Type"] || "None";
    var hourlyRate = TrustOpsUtils.toNumber(user["Hourly Rate"]);
    var salaryAmount = TrustOpsUtils.toNumber(user["Salary Amount"]);
    var grossPay = 0;
    if (payType === "Hourly") {
      grossPay = totalHours * hourlyRate;
    } else if (payType === "Salary") {
      if (user["Salary Frequency"] === "Per Pay Period") {
        grossPay = salaryAmount;
      } else if (user["Salary Frequency"] === "Monthly") {
        grossPay = salaryAmount / 2;
      } else if (user["Salary Frequency"] === "Annual") {
        grossPay = salaryAmount / 26;
      } else {
        grossPay = salaryAmount;
      }
    }
    return {
      "Pay Period ID": payPeriod["Pay Period ID"],
      "Pay Period Label": payPeriod["Pay Period Label"],
      "User ID": user["User ID"],
      "User Name": user["Full Name"],
      "Total Hours": Math.round(totalHours * 100) / 100,
      "Pay Type": payType,
      "Hourly Rate": hourlyRate,
      "Salary Amount": salaryAmount,
      "Effective Hourly Rate": totalHours ? Math.round((grossPay / totalHours) * 100) / 100 : "",
      "Gross Pay": Math.round(grossPay * 100) / 100,
      "Entries": TrustOpsUtils.recordsForClient(entries)
    };
  }

  function getPaySummary(context, filters) {
    var payload = filters || {};
    var period = payload.payPeriodId
      ? TrustOpsSheetService.findById(TrustOpsConfig.SHEETS.PAY_PERIODS, payload.payPeriodId)
      : getCurrentPayPeriod();
    if (!period) throw new Error("Pay period not found.");
    var users = TrustOpsSheetService.readTable(TrustOpsConfig.SHEETS.USERS).filter(function (user) {
      return TrustOpsUtils.toBoolean(user.Active) && !TrustOpsUtils.toBoolean(user.Archived) && TrustOpsUtils.toBoolean(user["Track Pay"]);
    });
    if (payload.userId) {
      TrustOpsPermissionService.requireAllowed(
        TrustOpsPermissionService.canViewPaySummary(context, payload.userId),
        "You do not have permission to view this pay summary."
      );
      users = users.filter(function (user) {
        return String(user["User ID"]) === String(payload.userId);
      });
    } else if (!TrustOpsPermissionService.canViewPaySummary(context, "__all__")) {
      users = users.filter(function (user) {
        return String(user["User ID"]) === String(context.userId);
      });
    }
    var summaries = users.map(function (user) {
      return calculateUserSummary(user, period);
    });
    return {
      payPeriod: TrustOpsUtils.sanitizeForClient(period),
      locked: isLocked(period),
      summaries: summaries
    };
  }

  function snapshotPaySummary(context, payPeriod) {
    var users = TrustOpsSheetService.readTable(TrustOpsConfig.SHEETS.USERS).filter(function (user) {
      return TrustOpsUtils.toBoolean(user.Active) && TrustOpsUtils.toBoolean(user["Track Pay"]);
    });
    users.forEach(function (user) {
      var summary = calculateUserSummary(user, payPeriod);
      var summaryId = "sum_" + payPeriod["Pay Period ID"] + "_" + user["User ID"];
      TrustOpsSheetService.upsertById(TrustOpsConfig.SHEETS.PAY_SUMMARIES, summaryId, {
        "Pay Period ID": payPeriod["Pay Period ID"],
        "User ID": user["User ID"],
        "User Name": user["Full Name"],
        "Total Hours": summary["Total Hours"],
        "Pay Type": summary["Pay Type"],
        "Hourly Rate": summary["Hourly Rate"],
        "Salary Amount": summary["Salary Amount"],
        "Effective Hourly Rate": summary["Effective Hourly Rate"],
        "Gross Pay": summary["Gross Pay"],
        "Adjustments": 0,
        "Notes": "",
        "Approved": false,
        "Approved By": "",
        "Approved At": "",
        "Snapshot": true,
        "Created At": TrustOpsUtils.nowIso(),
        "Updated At": TrustOpsUtils.nowIso()
      });
    });
  }

  function lockPayPeriod(context, payPeriodId) {
    TrustOpsPermissionService.requireAllowed(
      TrustOpsPermissionService.canLockPayPeriod(context),
      "You do not have permission to lock pay periods."
    );
    var existing = TrustOpsSheetService.findById(TrustOpsConfig.SHEETS.PAY_PERIODS, payPeriodId);
    if (!existing) throw new Error("Pay period not found.");
    snapshotPaySummary(context, existing);
    var saved = TrustOpsSheetService.updateById(TrustOpsConfig.SHEETS.PAY_PERIODS, payPeriodId, {
      "Status": TrustOpsConfig.PAY_PERIOD_STATUS.LOCKED,
      "Locked": true,
      "Locked By User ID": context.userId,
      "Locked At": TrustOpsUtils.nowIso(),
      "Updated At": TrustOpsUtils.nowIso()
    });
    TrustOpsAuditService.log(context, "PAY_PERIOD_LOCKED", "Pay Period", payPeriodId, existing, saved, "");
    return TrustOpsUtils.sanitizeForClient(saved);
  }

  function unlockPayPeriod(context, payPeriodId) {
    TrustOpsPermissionService.requireAllowed(
      TrustOpsPermissionService.canUnlockPayPeriod(context),
      "You do not have permission to unlock pay periods."
    );
    var existing = TrustOpsSheetService.findById(TrustOpsConfig.SHEETS.PAY_PERIODS, payPeriodId);
    if (!existing) throw new Error("Pay period not found.");
    var saved = TrustOpsSheetService.updateById(TrustOpsConfig.SHEETS.PAY_PERIODS, payPeriodId, {
      "Status": TrustOpsConfig.PAY_PERIOD_STATUS.OPEN,
      "Locked": false,
      "Updated At": TrustOpsUtils.nowIso()
    });
    TrustOpsAuditService.log(context, "PAY_PERIOD_UNLOCKED", "Pay Period", payPeriodId, existing, saved, "");
    return TrustOpsUtils.sanitizeForClient(saved);
  }

  return {
    listPayPeriods: listPayPeriods,
    findPayPeriodForDate: findPayPeriodForDate,
    ensurePayPeriodsAround: ensurePayPeriodsAround,
    getCurrentPayPeriod: getCurrentPayPeriod,
    isLocked: isLocked,
    getPaySummary: getPaySummary,
    lockPayPeriod: lockPayPeriod,
    unlockPayPeriod: unlockPayPeriod
  };
})();
