// ============================================
// AK PACK FITNESS — Google Apps Script
// ============================================
// Attendance columns:
//   A: Date
//   B: Membership ID
//   C: Client name
//   D: Check In Time
//   E: Check Out Time
//   F: Status
//
// Members columns:
//   A: Client name
//   B: Contact no
//   C: Package Details
//   D: Package Validity
//   E: Status
//   F: Created On
//   G: Membership ID
// ============================================

var SHEET_ID = '1Vo8k_hEm6OrJt-Bqf1T8vxcMH4_U9DoXkxsJPt9lKsw';

function doGet(e) {
  try {
    var callback = e.parameter.callback || 'callback';
    var action   = e.parameter.action   || 'write';

    // READ action — return sheet data
    if (action === 'read') {
      var sheet  = e.parameter.sheet || 'Attendance';
      var result = readSheet(sheet);
      return ContentService
        .createTextOutput(callback + '(' + JSON.stringify(result) + ')')
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }

    // WRITE action — append or update row
    var data = JSON.parse(decodeURIComponent(e.parameter.data));
    var result = writeAttendance(data);

    return ContentService
      .createTextOutput(callback + '(' + JSON.stringify(result) + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);

  } catch(err) {
    var cb = e.parameter.callback || 'callback';
    return ContentService
      .createTextOutput(cb + '({"status":"error","message":"' + err.message + '"})')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
}

// ============================================
// WRITE ATTENDANCE
// Entry → append new row
// Exit  → find today's entry row → update Check Out Time + Status
// ============================================
function writeAttendance(data) {
  var ss     = SpreadsheetApp.openById(SHEET_ID);
  var sheet  = ss.getSheetByName(data.sheet);

  if (!sheet) {
    return { status: 'error', message: 'Sheet not found: ' + data.sheet };
  }

  // If it's an EXIT — find the row and update it
  if (data.action === 'Exit') {
    var rows    = sheet.getDataRange().getValues();
    var today   = data.date;
    var memId   = String(data.membershipId);
    var updated = false;

    for (var i = rows.length - 1; i >= 1; i--) {
      var rowDate = String(rows[i][0]);
      var rowId   = String(rows[i][1]);
      var rowCOut = String(rows[i][4]);

      // Find today's entry for this member with no checkout yet
      if (rowDate === today && rowId === memId && rowCOut === '') {
        sheet.getRange(i + 1, 5).setValue(data.checkOutTime); // Col E: Check Out Time
        sheet.getRange(i + 1, 6).setValue('Completed');       // Col F: Status
        updated = true;
        break;
      }
    }

    if (!updated) {
      // No entry found — append exit row anyway
      sheet.appendRow([
        data.date,
        data.membershipId,
        data.clientName,
        '',
        data.checkOutTime,
        'Exit Only'
      ]);
    }

    return { status: 'ok', action: 'exit', updated: updated };
  }

  // ENTRY — append new row
  sheet.appendRow([
    data.date,          // A: Date
    data.membershipId,  // B: Membership ID
    data.clientName,    // C: Client name
    data.checkInTime,   // D: Check In Time
    '',                 // E: Check Out Time (blank on entry)
    'Active'            // F: Status
  ]);

  return { status: 'ok', action: 'entry' };
}

// ============================================
// READ SHEET (for future use)
// ============================================
function readSheet(sheetName) {
  var ss    = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return { status: 'error', message: 'Sheet not found' };
  var data  = sheet.getDataRange().getValues();
  return { status: 'ok', data: data };
}
