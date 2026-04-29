const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");

function loadSource(context, relativePath) {
  const source = fs.readFileSync(path.join(root, relativePath), "utf8");
  vm.runInContext(source, context, { filename: relativePath });
}

function normalizeText(value) {
  return String(value == null ? "" : value).trim();
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase();
}

function toBoolean(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const text = normalizeText(value).toLowerCase();
  return text === "true" || text === "yes" || text === "1";
}

function clone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function expect(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function expectThrows(fn, expectedMessage) {
  try {
    fn();
  } catch (error) {
    const actual = String(error.message || error);
    if (actual === expectedMessage) {
      return;
    }
    throw new Error(`Expected "${expectedMessage}", got "${actual}"`);
  }
  throw new Error(`Expected "${expectedMessage}" to be thrown.`);
}

class MockRange {
  constructor(sheet, row, column, numRows, numCols) {
    this.sheet = sheet;
    this.row = row;
    this.column = column;
    this.numRows = numRows;
    this.numCols = numCols;
  }

  getValues() {
    const values = [];
    for (let rowOffset = 0; rowOffset < this.numRows; rowOffset += 1) {
      const row = [];
      for (let colOffset = 0; colOffset < this.numCols; colOffset += 1) {
        row.push(this.sheet.getCell(this.row + rowOffset, this.column + colOffset));
      }
      values.push(row);
    }
    return values;
  }

  setValues(values) {
    for (let rowOffset = 0; rowOffset < this.numRows; rowOffset += 1) {
      const rowValues = values[rowOffset] || [];
      for (let colOffset = 0; colOffset < this.numCols; colOffset += 1) {
        this.sheet.setCell(this.row + rowOffset, this.column + colOffset, rowValues[colOffset]);
      }
    }
    return this;
  }

  setNumberFormat(format) {
    this.sheet.formatCalls.push({
      row: this.row,
      column: this.column,
      numRows: this.numRows,
      numCols: this.numCols,
      format
    });
    return this;
  }
}

class MockSheet {
  constructor(name, maxRows = 40) {
    this.name = name;
    this.maxRows = maxRows;
    this.data = [];
    this.formatCalls = [];
    this.frozenRows = 0;
  }

  getCell(row, column) {
    return this.data[row - 1] && this.data[row - 1][column - 1] !== undefined
      ? this.data[row - 1][column - 1]
      : "";
  }

  setCell(row, column, value) {
    if (!this.data[row - 1]) {
      this.data[row - 1] = [];
    }
    this.data[row - 1][column - 1] = value;
    this.maxRows = Math.max(this.maxRows, row);
  }

  getLastRow() {
    for (let index = this.data.length - 1; index >= 0; index -= 1) {
      const row = this.data[index] || [];
      const hasValue = row.some((value) => value !== undefined && value !== null && String(value) !== "");
      if (hasValue) {
        return index + 1;
      }
    }
    return 0;
  }

  getLastColumn() {
    return this.data.reduce((max, row) => Math.max(max, row ? row.length : 0), 0);
  }

  getMaxRows() {
    return this.maxRows;
  }

  getRange(row, column, numRows, numCols) {
    return new MockRange(this, row, column, numRows, numCols);
  }

  appendRow(values) {
    this.getRange(this.getLastRow() + 1, 1, 1, values.length).setValues([values]);
    return this;
  }

  setFrozenRows(count) {
    this.frozenRows = count;
  }
}

class MockSpreadsheet {
  constructor(defaultMaxRows = 40) {
    this.defaultMaxRows = defaultMaxRows;
    this.sheets = {};
    this.inserted = [];
  }

  getSheetByName(name) {
    return this.sheets[name] || null;
  }

  insertSheet(name) {
    const sheet = new MockSheet(name, this.defaultMaxRows);
    this.sheets[name] = sheet;
    this.inserted.push(name);
    return sheet;
  }
}

function makeRuntime() {
  const properties = {};
  let idCounter = 1;
  const holder = {
    spreadsheet: new MockSpreadsheet()
  };
  const context = {
    console,
    Date,
    JSON,
    Math,
    Number,
    String,
    Boolean,
    Array,
    Object,
    RegExp,
    parseInt,
    parseFloat,
    isNaN
  };
  context.globalThis = context;
  context.self = context;
  context.window = context;
  context.__setSpreadsheet = function (spreadsheet) {
    holder.spreadsheet = spreadsheet;
  };
  context.__getSpreadsheet = function () {
    return holder.spreadsheet;
  };
  context.__newSpreadsheet = function (maxRows) {
    return new MockSpreadsheet(maxRows);
  };
  context.TrustOpsUtils = {
    clone,
    normalizeText,
    normalizeKey,
    joinList(value) {
      return Array.isArray(value) ? value.join(", ") : normalizeText(value);
    },
    parseDate(value) {
      if (value instanceof Date) return value;
      const text = normalizeText(value);
      return text ? new Date(`${text}T00:00:00.000Z`) : null;
    },
    parseDateTime(value) {
      if (value instanceof Date) return value;
      const text = normalizeText(value).replace(" ", "T");
      return text ? new Date(text.endsWith("Z") ? text : `${text}Z`) : null;
    },
    formatDate(value) {
      return value instanceof Date ? value.toISOString().slice(0, 10) : normalizeText(value);
    },
    formatDateTime(value) {
      return value instanceof Date ? value.toISOString().slice(0, 19).replace("T", " ") : normalizeText(value);
    },
    makeId(prefix) {
      const id = `${prefix}_${idCounter}`;
      idCounter += 1;
      return id;
    },
    toBoolean,
    requireValue(value, label) {
      if (!normalizeText(value)) {
        throw new Error(`${label} is required.`);
      }
      return value;
    }
  };
  context.PropertiesService = {
    getScriptProperties() {
      return {
        getProperty(name) {
          return properties[name] || "";
        },
        setProperty(name, value) {
          properties[name] = String(value);
        }
      };
    }
  };
  const lock = {
    waitLock() {},
    releaseLock() {}
  };
  context.LockService = {
    getDocumentLock() {
      return lock;
    },
    getScriptLock() {
      return lock;
    }
  };
  context.SpreadsheetApp = {
    openById() {
      return holder.spreadsheet;
    },
    getActiveSpreadsheet() {
      return holder.spreadsheet;
    }
  };
  context.Utilities = {};
  const vmContext = vm.createContext(context);
  loadSource(vmContext, "src/Config.js");
  loadSource(vmContext, "src/SheetService.js");
  return vmContext;
}

function testMissingSheetThrows() {
  const context = makeRuntime();
  const sheetName = context.TrustOpsConfig.SHEETS.USERS;
  expectThrows(
    () => context.TrustOpsSheetService.readTable(sheetName),
    "Missing required sheet: Users. Run setupTrustOps(spreadsheetId, ownerEmail) first."
  );
}

function testEnsureAllSheetsCreatesStructure() {
  const context = makeRuntime();
  context.TrustOpsSheetService.ensureAllSheets();
  const spreadsheet = context.__getSpreadsheet();
  Object.keys(context.TrustOpsConfig.TABLES).forEach((sheetName) => {
    expect(spreadsheet.getSheetByName(sheetName), `ensureAllSheets did not create ${sheetName}.`);
  });
}

function testAppendAndUpdateFormatOnlyTouchedRows() {
  const context = makeRuntime();
  context.TrustOpsSheetService.ensureAllSheets();
  const sheetName = context.TrustOpsConfig.SHEETS.TIME_ENTRIES;
  const sheet = context.__getSpreadsheet().getSheetByName(sheetName);
  sheet.formatCalls = [];
  const saved = context.TrustOpsSheetService.appendRecord(sheetName, {
    Date: "2026-04-28",
    "User ID": "usr_1",
    "Clock In At": "2026-04-28 08:00:00",
    "Clock Out At": "2026-04-28 09:15:00",
    "Created At": "2026-04-28 09:15:00",
    "Updated At": "2026-04-28 09:15:00"
  });
  expect(sheet.formatCalls.length > 0, "appendRecord did not apply any date/datetime formatting.");
  sheet.formatCalls.forEach((call) => {
    expect(call.row === 2, `appendRecord formatted row ${call.row} instead of row 2.`);
    expect(call.numRows === 1, `appendRecord formatted ${call.numRows} rows instead of 1.`);
  });

  sheet.formatCalls = [];
  context.TrustOpsSheetService.updateById(sheetName, saved["Time Entry ID"], {
    Date: "2026-04-29",
    "Updated At": "2026-04-29 10:00:00"
  });
  expect(sheet.formatCalls.length > 0, "updateById did not apply any date/datetime formatting.");
  sheet.formatCalls.forEach((call) => {
    expect(call.row === 2, `updateById formatted row ${call.row} instead of row 2.`);
    expect(call.numRows === 1, `updateById formatted ${call.numRows} rows instead of 1.`);
  });
}

function testEnsureHeadersFormatsOnlyNewColumnsWhenSchemaExpands() {
  const context = makeRuntime();
  const spreadsheet = context.__newSpreadsheet(35);
  const sheetName = context.TrustOpsConfig.SHEETS.TASKS;
  const sheet = spreadsheet.insertSheet(sheetName);
  sheet.getRange(1, 1, 1, 2).setValues([["Task ID", "Title"]]);
  sheet.formatCalls = [];
  context.__setSpreadsheet(spreadsheet);

  const headers = context.TrustOpsSheetService.getHeaders(sheetName);
  expect(
    headers.length === context.TrustOpsConfig.TABLES[sheetName].columns.length,
    "ensureHeaders did not restore the full task header set."
  );
  expect(
    sheet.formatCalls.some((call) => call.row === 1 && call.numRows === 35),
    "ensureHeaders should format the full new-column range when it appends missing columns."
  );
}

function main() {
  testMissingSheetThrows();
  testEnsureAllSheetsCreatesStructure();
  testAppendAndUpdateFormatOnlyTouchedRows();
  testEnsureHeadersFormatsOnlyNewColumnsWhenSchemaExpands();
  console.log("sheet service regression check passed");
}

main();
