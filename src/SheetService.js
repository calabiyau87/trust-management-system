var TrustOpsSheetService = (function () {
  var requestCache = {};

  function resetRequestCache() {
    requestCache = {};
  }

  function logTiming(label, startMs) {
    var elapsed = Date.now() - startMs;
    if (elapsed >= 750) {
      console.log("TrustOps slow operation: " + label + " took " + elapsed + "ms");
    }
  }

  function getSpreadsheet() {
    var spreadsheetId = TrustOpsConfig.getSpreadsheetId();
    if (spreadsheetId) {
      return SpreadsheetApp.openById(spreadsheetId);
    }
    var active = SpreadsheetApp.getActiveSpreadsheet();
    if (active) return active;
    throw new Error("No spreadsheet is configured. Run setupTrustOps(spreadsheetId, ownerEmail) first.");
  }

  function setSpreadsheetId(spreadsheetId) {
    TrustOpsUtils.requireValue(spreadsheetId, "Spreadsheet ID");
    PropertiesService.getScriptProperties().setProperty("SPREADSHEET_ID", String(spreadsheetId).trim());
  }

  function getTableConfig(sheetName) {
    var config = TrustOpsConfig.TABLES[sheetName];
    if (!config) {
      throw new Error("Unknown table: " + sheetName);
    }
    return config;
  }

  function getSheet(sheetName, options) {
    var settings = options || {};
    var ss = getSpreadsheet();
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet && settings.createIfMissing) {
      sheet = ss.insertSheet(sheetName);
    }
    if (!sheet) {
      throw new Error("Missing required sheet: " + sheetName + ". Run setupTrustOps(spreadsheetId, ownerEmail) first.");
    }
    ensureHeaders(sheetName, sheet);
    return sheet;
  }

  function ensureHeaders(sheetName, sheet) {
    var config = TrustOpsConfig.TABLES[sheetName];
    if (!config) return;
    var existingHeaders = [];
    if (sheet.getLastColumn() > 0) {
      existingHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
    }
    if (!existingHeaders.length || !existingHeaders[0]) {
      sheet.getRange(1, 1, 1, config.columns.length).setValues([config.columns]);
      sheet.setFrozenRows(1);
      applyColumnFormats(sheet, config.columns, {
        rowStart: 1,
        rowCount: Math.max(sheet.getMaxRows(), 1)
      });
      return;
    }
    var missingColumns = config.columns.filter(function (column) {
      return existingHeaders.indexOf(column) === -1;
    });
    if (missingColumns.length) {
      sheet.getRange(1, existingHeaders.length + 1, 1, missingColumns.length).setValues([missingColumns]);
      applyColumnFormats(sheet, missingColumns, {
        columnOffset: existingHeaders.length,
        rowStart: 1,
        rowCount: Math.max(sheet.getMaxRows(), 1)
      });
    }
    sheet.setFrozenRows(1);
  }

  function ensureAllSheets() {
    Object.keys(TrustOpsConfig.TABLES).forEach(function (sheetName) {
      getSheet(sheetName, { createIfMissing: true });
    });
  }

  function getHeaders(sheetName) {
    var sheet = getSheet(sheetName);
    if (sheet.getLastColumn() === 0) return [];
    return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(function (header) {
      return String(header || "").trim();
    });
  }

  function cellForRecord(value) {
    if (value === undefined || value === null) return "";
    if (Array.isArray(value)) return TrustOpsUtils.joinList(value);
    if (typeof value === "object" && !(value instanceof Date)) return JSON.stringify(value);
    return value;
  }

  function cellForClient(value) {
    if (value instanceof Date) return TrustOpsUtils.formatDate(value);
    return value;
  }

  function isDateHeader(header) {
    return [
      "Date",
      "Start Date",
      "End Date",
      "Due Date"
    ].indexOf(String(header || "")) !== -1;
  }

  function isDateTimeHeader(header) {
    return [
      "Timestamp",
      "Created At",
      "Updated At",
      "Locked At",
      "Approved At",
      "Decided At",
      "Clock In At",
      "Clock Out At"
    ].indexOf(String(header || "")) !== -1;
  }

  function cellForClientByHeader(header, value) {
    if (!(value instanceof Date)) return value;
    return isDateTimeHeader(header) ? TrustOpsUtils.formatDateTime(value) : TrustOpsUtils.formatDate(value);
  }

  function cellForRecordByHeader(header, value) {
    if (value === undefined || value === null) return "";
    if (Array.isArray(value)) return TrustOpsUtils.joinList(value);
    if (isDateTimeHeader(header)) {
      return TrustOpsUtils.parseDateTime(value) || value;
    }
    if (isDateHeader(header)) {
      return TrustOpsUtils.parseDate(value) || value;
    }
    if (typeof value === "object" && !(value instanceof Date)) return JSON.stringify(value);
    return value;
  }

  function applyColumnFormats(sheet, headers, options) {
    var settings = options || {};
    var columnOffset = Number(settings.columnOffset || 0);
    var rowStart = Math.max(1, Number(settings.rowStart || 1));
    var rowCount = Math.max(1, Number(settings.rowCount || Math.max(sheet.getMaxRows() - rowStart + 1, 1)));
    headers.forEach(function (header, index) {
      var column = columnOffset + index + 1;
      if (isDateTimeHeader(header)) {
        sheet.getRange(rowStart, column, rowCount, 1).setNumberFormat("yyyy-mm-dd hh:mm:ss");
      } else if (isDateHeader(header)) {
        sheet.getRange(rowStart, column, rowCount, 1).setNumberFormat("yyyy-mm-dd");
      }
    });
  }

  function rowToRecord(headers, row, rowNumber) {
    var record = {};
    headers.forEach(function (header, index) {
      if (!header) return;
      record[header] = cellForClientByHeader(header, row[index]);
    });
    record._rowNumber = rowNumber;
    return record;
  }

  function readTable(sheetName) {
    if (requestCache[sheetName]) {
      return TrustOpsUtils.clone(requestCache[sheetName]);
    }
    var startMs = Date.now();
    var sheet = getSheet(sheetName);
    var headers = getHeaders(sheetName);
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return [];
    var values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
    var records = values
      .map(function (row, index) {
        return rowToRecord(headers, row, index + 2);
      })
      .filter(function (record) {
        return Object.keys(record).some(function (key) {
          return key.charAt(0) !== "_" && TrustOpsUtils.normalizeText(record[key]);
        });
      });
    requestCache[sheetName] = TrustOpsUtils.clone(records);
    logTiming("readTable(" + sheetName + ")", startMs);
    return records;
  }

  function idPrefixForSheet(sheetName) {
    var map = {};
    map[TrustOpsConfig.SHEETS.USERS] = "usr";
    map[TrustOpsConfig.SHEETS.PROJECTS] = "prj";
    map[TrustOpsConfig.SHEETS.TASKS] = "tsk";
    map[TrustOpsConfig.SHEETS.TIME_ENTRIES] = "tim";
    map[TrustOpsConfig.SHEETS.TIME_PUNCHES] = "pun";
    map[TrustOpsConfig.SHEETS.TIME_CATEGORIES] = "cat";
    map[TrustOpsConfig.SHEETS.TAGS] = "tag";
    map[TrustOpsConfig.SHEETS.PAY_PERIODS] = "pay";
    map[TrustOpsConfig.SHEETS.PAY_SUMMARIES] = "sum";
    map[TrustOpsConfig.SHEETS.AUDIT_LOG] = "aud";
    map[TrustOpsConfig.SHEETS.BOARD_VIEWS] = "view";
    map[TrustOpsConfig.SHEETS.MANAGER_PERMISSIONS] = "mgrperm";
    map[TrustOpsConfig.SHEETS.TIME_EDIT_REQUESTS] = "ter";
    return map[sheetName] || "id";
  }

  function withLock(callback) {
    var lock = LockService.getDocumentLock() || LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      return callback();
    } finally {
      lock.releaseLock();
    }
  }

  function appendRecord(sheetName, record) {
    return withLock(function () {
      var config = getTableConfig(sheetName);
      var sheet = getSheet(sheetName);
      var headers = getHeaders(sheetName);
      var normalizedRecord = {};
      Object.keys(record || {}).forEach(function (key) {
        normalizedRecord[key] = record[key];
      });
      if (config.idColumn && !TrustOpsUtils.normalizeText(normalizedRecord[config.idColumn])) {
        normalizedRecord[config.idColumn] = TrustOpsUtils.makeId(idPrefixForSheet(sheetName));
      }
      var row = headers.map(function (header) {
        return cellForRecordByHeader(header, normalizedRecord[header]);
      });
      sheet.appendRow(row);
      applyColumnFormats(sheet, headers, {
        rowStart: sheet.getLastRow(),
        rowCount: 1
      });
      delete requestCache[sheetName];
      return findById(sheetName, normalizedRecord[config.idColumn]);
    });
  }

  function findById(sheetName, id) {
    if (!TrustOpsUtils.normalizeText(id)) return null;
    var config = getTableConfig(sheetName);
    return readTable(sheetName).filter(function (record) {
      return String(record[config.idColumn]) === String(id);
    })[0] || null;
  }

  function findByColumn(sheetName, columnName, value) {
    var normalizedValue = TrustOpsUtils.normalizeKey(value);
    return readTable(sheetName).filter(function (record) {
      return TrustOpsUtils.normalizeKey(record[columnName]) === normalizedValue;
    });
  }

  function updateById(sheetName, id, patch) {
    return withLock(function () {
      var config = getTableConfig(sheetName);
      var sheet = getSheet(sheetName);
      var headers = getHeaders(sheetName);
      var record = findById(sheetName, id);
      if (!record) {
        throw new Error("Unable to find " + sheetName + " record: " + id);
      }
      var updated = {};
      headers.forEach(function (header) {
        updated[header] = record[header];
      });
      Object.keys(patch || {}).forEach(function (key) {
        if (headers.indexOf(key) !== -1 && key !== config.idColumn) {
          updated[key] = patch[key];
        }
      });
      var row = headers.map(function (header) {
        return cellForRecordByHeader(header, updated[header]);
      });
      sheet.getRange(record._rowNumber, 1, 1, headers.length).setValues([row]);
      applyColumnFormats(sheet, headers, {
        rowStart: record._rowNumber,
        rowCount: 1
      });
      delete requestCache[sheetName];
      return findById(sheetName, id);
    });
  }

  function upsertById(sheetName, id, record) {
    var existing = findById(sheetName, id);
    if (existing) {
      return updateById(sheetName, id, record);
    }
    var config = getTableConfig(sheetName);
    var createRecord = {};
    Object.keys(record || {}).forEach(function (key) {
      createRecord[key] = record[key];
    });
    createRecord[config.idColumn] = id;
    return appendRecord(sheetName, createRecord);
  }

  function activeRecords(sheetName, archivedColumn) {
    var archiveColumnName = archivedColumn || "Archived";
    return readTable(sheetName).filter(function (record) {
      return !TrustOpsUtils.toBoolean(record[archiveColumnName]);
    });
  }

  return {
    getSpreadsheet: getSpreadsheet,
    resetRequestCache: resetRequestCache,
    logTiming: logTiming,
    setSpreadsheetId: setSpreadsheetId,
    getSheet: getSheet,
    ensureAllSheets: ensureAllSheets,
    getHeaders: getHeaders,
    readTable: readTable,
    appendRecord: appendRecord,
    updateById: updateById,
    upsertById: upsertById,
    findById: findById,
    findByColumn: findByColumn,
    activeRecords: activeRecords,
    withLock: withLock
  };
})();
