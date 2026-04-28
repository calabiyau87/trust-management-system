var TrustOpsPayService = (function () {
  function listPayPeriods() {
    ensurePayPeriodsAround(new Date(), 2, 2);
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

  function getLastPayPeriod() {
    var current = getCurrentPayPeriod();
    var periodDays = TrustOpsUtils.toNumber(
      TrustOpsSettingsService.getSetting("DEFAULT_PAY_PERIOD_DAYS", TrustOpsConfig.PAY_PERIOD_DAYS)
    ) || TrustOpsConfig.PAY_PERIOD_DAYS;
    return findPayPeriodForDate(TrustOpsUtils.addDays(current["Start Date"], -periodDays));
  }

  function rangeForNamedMode(mode) {
    var now = new Date();
    var year = now.getFullYear();
    var month = now.getMonth();
    if (mode === "last-week") {
      return {
        startDate: TrustOpsUtils.formatDate(TrustOpsUtils.addDays(now, -7)),
        endDate: TrustOpsUtils.formatDate(now),
        label: "Last Week"
      };
    }
    if (mode === "last-month") {
      var lastMonthStart = new Date(year, month - 1, 1);
      var lastMonthEnd = new Date(year, month, 0);
      return {
        startDate: TrustOpsUtils.formatDate(lastMonthStart),
        endDate: TrustOpsUtils.formatDate(lastMonthEnd),
        label: "Last Month"
      };
    }
    if (mode === "last-year") {
      return {
        startDate: TrustOpsUtils.formatDate(new Date(year - 1, 0, 1)),
        endDate: TrustOpsUtils.formatDate(new Date(year - 1, 11, 31)),
        label: "Last Year"
      };
    }
    if (mode === "this-year" || mode === "ytd") {
      return {
        startDate: TrustOpsUtils.formatDate(new Date(year, 0, 1)),
        endDate: TrustOpsUtils.formatDate(mode === "ytd" ? now : new Date(year, 11, 31)),
        label: mode === "ytd" ? "Year to Date" : "This Year"
      };
    }
    if (mode === "all-time") {
      return {
        startDate: TrustOpsUtils.formatDate(new Date(1900, 0, 1)),
        endDate: TrustOpsUtils.formatDate(now),
        label: "All Time"
      };
    }
    return null;
  }

  function resolveSummaryRange(payload) {
    var mode = payload.rangeMode || payload.range || "";
    var period = null;
    if (!mode && payload.payPeriodId) mode = "period:" + payload.payPeriodId;
    if (!mode) mode = "current";
    if (mode === "current") {
      period = getCurrentPayPeriod();
    } else if (mode === "last") {
      period = getLastPayPeriod();
    } else if (String(mode).indexOf("period:") === 0) {
      period = TrustOpsSheetService.findById(TrustOpsConfig.SHEETS.PAY_PERIODS, String(mode).slice(7));
      if (!period) throw new Error("Pay period not found.");
    }
    if (period) {
      return {
        mode: mode,
        label: period["Pay Period Label"],
        startDate: period["Start Date"],
        endDate: period["End Date"],
        payPeriod: period,
        locked: isLocked(period)
      };
    }
    if (mode === "custom") {
      var startDate = TrustOpsUtils.formatDate(payload.startDate || payload["Start Date"]);
      var endDate = TrustOpsUtils.formatDate(payload.endDate || payload["End Date"]);
      TrustOpsUtils.requireValue(startDate, "Start date");
      TrustOpsUtils.requireValue(endDate, "End date");
      return {
        mode: mode,
        label: TrustOpsUtils.formatDateLabel(startDate) + " - " + TrustOpsUtils.formatDateLabel(endDate),
        startDate: startDate,
        endDate: endDate,
        payPeriod: null,
        locked: false
      };
    }
    var named = rangeForNamedMode(mode);
    if (!named) throw new Error("Unsupported pay summary range.");
    named.mode = mode;
    named.payPeriod = null;
    named.locked = false;
    return named;
  }

  function activePayUsers() {
    return TrustOpsSheetService.readTable(TrustOpsConfig.SHEETS.USERS).filter(function (user) {
      return TrustOpsUtils.toBoolean(user.Active) && !TrustOpsUtils.toBoolean(user.Archived) && TrustOpsUtils.toBoolean(user["Track Pay"]);
    });
  }

  function listActivePayUsers() {
    var users = TrustOpsUtils.recordsForClient(activePayUsers());
    users.sort(function (a, b) {
      return String(a["Full Name"] || "").localeCompare(String(b["Full Name"] || ""));
    });
    return users;
  }

  function timeEntriesForRange(entries, range) {
    return (entries || []).filter(function (entry) {
      if (TrustOpsUtils.toBoolean(entry.Deleted)) return false;
      if (range.payPeriod) {
        return String(entry["Pay Period ID"]) === String(range.payPeriod["Pay Period ID"]);
      }
      return TrustOpsUtils.isBetweenInclusive(entry.Date, range.startDate, range.endDate);
    });
  }

  function payPeriodLengthDays() {
    return TrustOpsUtils.toNumber(
      TrustOpsSettingsService.getSetting("DEFAULT_PAY_PERIOD_DAYS", TrustOpsConfig.PAY_PERIOD_DAYS)
    ) || TrustOpsConfig.PAY_PERIOD_DAYS;
  }

  function daysInMonth(dateValue) {
    var date = TrustOpsUtils.parseDate(dateValue);
    if (!date) return 0;
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  }

  function daysInYear(dateValue) {
    var date = TrustOpsUtils.parseDate(dateValue);
    if (!date) return 365;
    var year = date.getFullYear();
    return ((year % 4 === 0 && year % 100 !== 0) || year % 400 === 0) ? 366 : 365;
  }

  function prorateSalaryForDateRange(salaryAmount, salaryFrequency, range) {
    var start = TrustOpsUtils.parseDate(range.startDate);
    var end = TrustOpsUtils.parseDate(range.endDate);
    if (!start || !end) return 0;
    var current = new Date(start.getTime());
    var total = 0;
    if (salaryFrequency === "Per Pay Period") {
      return salaryAmount * ((TrustOpsUtils.daysBetween(start, end) + 1) / payPeriodLengthDays());
    }
    if (salaryFrequency === "Monthly") {
      while (current.getTime() <= end.getTime()) {
        var monthBoundary = new Date(current.getFullYear(), current.getMonth() + 1, 0);
        var segmentEnd = monthBoundary.getTime() < end.getTime() ? monthBoundary : end;
        var segmentDays = TrustOpsUtils.daysBetween(current, segmentEnd) + 1;
        total += salaryAmount * (segmentDays / daysInMonth(current));
        current = TrustOpsUtils.addDays(segmentEnd, 1);
      }
      return total;
    }
    if (salaryFrequency === "Annual") {
      while (current.getTime() <= end.getTime()) {
        var yearBoundary = new Date(current.getFullYear(), 11, 31);
        var yearSegmentEnd = yearBoundary.getTime() < end.getTime() ? yearBoundary : end;
        var yearSegmentDays = TrustOpsUtils.daysBetween(current, yearSegmentEnd) + 1;
        total += salaryAmount * (yearSegmentDays / daysInYear(current));
        current = TrustOpsUtils.addDays(yearSegmentEnd, 1);
      }
      return total;
    }
    return salaryAmount;
  }

  function calculateUserSummaryFromEntries(user, range, entries) {
    var totalHours = (entries || []).reduce(function (sum, entry) {
      return sum + TrustOpsUtils.toNumber(entry.Hours);
    }, 0);
    var payType = user["Pay Type"] || "None";
    var hourlyRate = TrustOpsUtils.toNumber(user["Hourly Rate"]);
    var salaryAmount = TrustOpsUtils.toNumber(user["Salary Amount"]);
    var grossPay = 0;
    if (payType === "Hourly") {
      grossPay = totalHours * hourlyRate;
    } else if (payType === "Salary") {
      if (range.payPeriod) {
        if (user["Salary Frequency"] === "Per Pay Period") {
          grossPay = salaryAmount;
        } else if (user["Salary Frequency"] === "Monthly") {
          grossPay = salaryAmount / 2;
        } else if (user["Salary Frequency"] === "Annual") {
          grossPay = salaryAmount / 26;
        } else {
          grossPay = salaryAmount;
        }
      } else {
        grossPay = prorateSalaryForDateRange(salaryAmount, user["Salary Frequency"], range);
      }
    }
    return {
      "Pay Period ID": range.payPeriod ? range.payPeriod["Pay Period ID"] : "",
      "Pay Period Label": range.label,
      "Range Start Date": range.startDate,
      "Range End Date": range.endDate,
      "User ID": user["User ID"],
      "User Name": user["Full Name"],
      "Total Hours": Math.round(totalHours * 100) / 100,
      "Pay Type": payType,
      "Hourly Rate": hourlyRate,
      "Salary Amount": salaryAmount,
      "Effective Hourly Rate": totalHours ? Math.round((grossPay / totalHours) * 100) / 100 : "",
      "Gross Pay": Math.round(grossPay * 100) / 100
    };
  }

  function summariesForUsers(users, range, entries) {
    var entriesByUser = {};
    timeEntriesForRange(entries, range).forEach(function (entry) {
      var key = String(entry["User ID"]);
      entriesByUser[key] = entriesByUser[key] || [];
      entriesByUser[key].push(entry);
    });
    return users.map(function (user) {
      return calculateUserSummaryFromEntries(user, range, entriesByUser[String(user["User ID"])] || []);
    });
  }

  function snapshotRowsForPeriod(period) {
    var rows = TrustOpsSheetService.readTable(TrustOpsConfig.SHEETS.PAY_SUMMARIES).filter(function (row) {
      return String(row["Pay Period ID"]) === String(period["Pay Period ID"]);
    });
    var byUser = {};
    rows.forEach(function (row) {
      byUser[String(row["User ID"])] = row;
    });
    return byUser;
  }

  function summaryFromSnapshot(row, user, range) {
    return {
      "Pay Summary ID": row["Pay Summary ID"],
      "Pay Period ID": row["Pay Period ID"],
      "Pay Period Label": range.label,
      "Range Start Date": range.startDate,
      "Range End Date": range.endDate,
      "User ID": row["User ID"],
      "User Name": row["User Name"] || user["Full Name"],
      "Total Hours": TrustOpsUtils.toNumber(row["Total Hours"]),
      "Pay Type": row["Pay Type"] || user["Pay Type"] || "None",
      "Hourly Rate": TrustOpsUtils.toNumber(row["Hourly Rate"]),
      "Salary Amount": TrustOpsUtils.toNumber(row["Salary Amount"]),
      "Effective Hourly Rate": TrustOpsUtils.toNumber(row["Effective Hourly Rate"]) || "",
      "Gross Pay": TrustOpsUtils.toNumber(row["Gross Pay"]),
      "Snapshot": true
    };
  }

  function getPaySummary(context, filters) {
    var payload = filters || {};
    var range = resolveSummaryRange(payload);
    var users = activePayUsers();
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
    var entries = TrustOpsSheetService.readTable(TrustOpsConfig.SHEETS.TIME_ENTRIES);
    var liveSummaries = summariesForUsers(users, range, entries);
    var snapshots = range.payPeriod && range.locked ? snapshotRowsForPeriod(range.payPeriod) : {};
    var summaries = liveSummaries.map(function (summary, index) {
      var user = users[index];
      var snapshot = snapshots[String(user["User ID"])];
      return snapshot ? summaryFromSnapshot(snapshot, user, range) : summary;
    });
    return {
      payPeriod: range.payPeriod ? TrustOpsUtils.sanitizeForClient(range.payPeriod) : null,
      range: range,
      locked: Boolean(range.locked),
      summaries: summaries
    };
  }

  function snapshotPaySummary(context, payPeriod) {
    var range = {
      mode: "period:" + payPeriod["Pay Period ID"],
      label: payPeriod["Pay Period Label"],
      startDate: payPeriod["Start Date"],
      endDate: payPeriod["End Date"],
      payPeriod: payPeriod,
      locked: true
    };
    var users = activePayUsers();
    var entries = TrustOpsSheetService.readTable(TrustOpsConfig.SHEETS.TIME_ENTRIES);
    summariesForUsers(users, range, entries).forEach(function (summary) {
      var summaryId = "sum_" + payPeriod["Pay Period ID"] + "_" + summary["User ID"];
      TrustOpsSheetService.upsertById(TrustOpsConfig.SHEETS.PAY_SUMMARIES, summaryId, {
        "Pay Period ID": payPeriod["Pay Period ID"],
        "User ID": summary["User ID"],
        "User Name": summary["User Name"],
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

  function groupHours(entries, keyFn, labelFn) {
    var grouped = {};
    (entries || []).forEach(function (entry) {
      var key = keyFn(entry) || "Unassigned";
      grouped[key] = grouped[key] || { label: labelFn(entry) || key, hours: 0 };
      grouped[key].hours += TrustOpsUtils.toNumber(entry.Hours);
    });
    return Object.keys(grouped).sort().map(function (key) {
      return {
        key: key,
        label: grouped[key].label,
        hours: Math.round(grouped[key].hours * 100) / 100
      };
    });
  }

  function getPaySummaryDetail(context, filters) {
    var payload = filters || {};
    var userId = TrustOpsUtils.requireValue(payload.userId || context.userId, "User");
    TrustOpsPermissionService.requireAllowed(
      TrustOpsPermissionService.canViewPaySummary(context, userId),
      "You do not have permission to view this pay summary."
    );
    var user = TrustOpsAuthService.getUserById(userId);
    if (!user) throw new Error("User not found.");
    var range = resolveSummaryRange(payload);
    var entries = TrustOpsTimeService.normalizeTimeEntryRecords(
      timeEntriesForRange(TrustOpsSheetService.readTable(TrustOpsConfig.SHEETS.TIME_ENTRIES), range)
    ).filter(function (entry) {
      return String(entry["User ID"]) === String(userId);
    });
    entries.sort(function (a, b) {
      var aSort = a["Clock Out At"] || a["Clock In At"] || a.Date || "";
      var bSort = b["Clock Out At"] || b["Clock In At"] || b.Date || "";
      if (aSort === bSort) return String(a["Task / Category"]).localeCompare(String(b["Task / Category"]));
      return String(aSort).localeCompare(String(bSort));
    });
    var summary = calculateUserSummaryFromEntries(user, range, entries);
    var dayCount = Math.max(1, TrustOpsUtils.daysBetween(range.startDate, range.endDate) + 1);
    var weekCount = Math.max(1, dayCount / 7);
    return {
      user: TrustOpsUtils.sanitizeForClient(user),
      range: range,
      summary: summary,
      entries: TrustOpsUtils.recordsForClient(entries),
      taskTotals: groupHours(
        entries.filter(function (entry) {
          return entry["Entry Type"] === TrustOpsConfig.ENTRY_TYPES.TASK;
        }),
        function (entry) {
          return entry["Task ID"] || entry["Task / Category"];
        },
        function (entry) {
          return entry["Task / Category"];
        }
      ),
      projectTotals: groupHours(
        entries,
        function (entry) {
          return entry["Project ID"] || entry["Project Name"];
        },
        function (entry) {
          return entry["Project Name"] || "No project";
        }
      ),
      metrics: {
        totalHours: summary["Total Hours"],
        averageHoursPerWeek: Math.round((summary["Total Hours"] / weekCount) * 100) / 100,
        entryCount: entries.length,
        projectCount: groupHours(entries, function (entry) { return entry["Project ID"] || entry["Project Name"]; }, function (entry) { return entry["Project Name"]; }).length,
        taskCount: groupHours(entries.filter(function (entry) { return entry["Entry Type"] === TrustOpsConfig.ENTRY_TYPES.TASK; }), function (entry) { return entry["Task ID"] || entry["Task / Category"]; }, function (entry) { return entry["Task / Category"]; }).length
      }
    };
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
    getLastPayPeriod: getLastPayPeriod,
    isLocked: isLocked,
    getPaySummary: getPaySummary,
    getPaySummaryDetail: getPaySummaryDetail,
    lockPayPeriod: lockPayPeriod,
    unlockPayPeriod: unlockPayPeriod,
    listActivePayUsers: listActivePayUsers
  };
})();
