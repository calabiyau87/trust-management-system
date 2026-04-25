var TrustOpsUtils = (function () {
  function nowIso() {
    return new Date().toISOString();
  }

  function normalizeEmail(email) {
    return String(email || "").trim().toLowerCase();
  }

  function normalizeText(value) {
    return String(value || "").trim();
  }

  function normalizeKey(value) {
    return normalizeText(value).toLowerCase();
  }

  function toBoolean(value) {
    if (value === true) return true;
    if (value === false) return false;
    var text = normalizeKey(value);
    return text === "true" || text === "yes" || text === "y" || text === "1";
  }

  function toNumber(value) {
    var numberValue = Number(value);
    return isNaN(numberValue) ? 0 : numberValue;
  }

  function splitList(value) {
    if (Array.isArray(value)) {
      return value.map(normalizeText).filter(Boolean);
    }
    return String(value || "")
      .split(",")
      .map(normalizeText)
      .filter(Boolean);
  }

  function joinList(values) {
    return splitList(values).join(", ");
  }

  function makeId(prefix) {
    var randomPart = Utilities.getUuid().replace(/-/g, "").slice(0, 12);
    return String(prefix || "id").toLowerCase() + "_" + randomPart;
  }

  function stringify(value) {
    if (value === undefined) return "";
    if (value === null) return "";
    if (value instanceof Date) return formatDate(value);
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  }

  function safeJson(value) {
    try {
      return JSON.stringify(value || {});
    } catch (error) {
      return JSON.stringify({ error: "Unable to serialize value" });
    }
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value || null));
  }

  function parseDate(value) {
    if (value instanceof Date) {
      return new Date(value.getFullYear(), value.getMonth(), value.getDate());
    }
    var text = normalizeText(value);
    if (!text) return null;
    var parts = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (parts) {
      return new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]));
    }
    var parsed = new Date(text);
    if (isNaN(parsed.getTime())) return null;
    return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
  }

  function formatDate(value) {
    var date = parseDate(value);
    if (!date) return "";
    return Utilities.formatDate(date, Session.getScriptTimeZone(), "yyyy-MM-dd");
  }

  function formatDateLabel(value) {
    var date = parseDate(value);
    if (!date) return "";
    return Utilities.formatDate(date, Session.getScriptTimeZone(), "MM-dd-yyyy");
  }

  function addDays(value, days) {
    var date = parseDate(value);
    if (!date) return null;
    var copy = new Date(date.getTime());
    copy.setDate(copy.getDate() + Number(days || 0));
    return copy;
  }

  function daysBetween(startDate, endDate) {
    var start = parseDate(startDate);
    var end = parseDate(endDate);
    if (!start || !end) return 0;
    return Math.floor((end.getTime() - start.getTime()) / 86400000);
  }

  function isBetweenInclusive(value, startDate, endDate) {
    var date = parseDate(value);
    var start = parseDate(startDate);
    var end = parseDate(endDate);
    if (!date || !start || !end) return false;
    return date.getTime() >= start.getTime() && date.getTime() <= end.getTime();
  }

  function requireValue(value, label) {
    if (!normalizeText(value)) {
      throw new Error(label + " is required.");
    }
    return value;
  }

  function sanitizeForClient(record) {
    var output = {};
    Object.keys(record || {}).forEach(function (key) {
      if (key.charAt(0) === "_") return;
      var value = record[key];
      if (value instanceof Date) {
        output[key] = formatDate(value);
      } else {
        output[key] = value;
      }
    });
    return output;
  }

  function recordsForClient(records) {
    return (records || []).map(sanitizeForClient);
  }

  return {
    nowIso: nowIso,
    normalizeEmail: normalizeEmail,
    normalizeText: normalizeText,
    normalizeKey: normalizeKey,
    toBoolean: toBoolean,
    toNumber: toNumber,
    splitList: splitList,
    joinList: joinList,
    makeId: makeId,
    stringify: stringify,
    safeJson: safeJson,
    clone: clone,
    parseDate: parseDate,
    formatDate: formatDate,
    formatDateLabel: formatDateLabel,
    addDays: addDays,
    daysBetween: daysBetween,
    isBetweenInclusive: isBetweenInclusive,
    requireValue: requireValue,
    sanitizeForClient: sanitizeForClient,
    recordsForClient: recordsForClient
  };
})();
