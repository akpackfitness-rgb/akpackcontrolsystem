// ============================================================
//  AK PACK FITNESS — Google Apps Script
//  Deploy this as a Web App to enable writing to Google Sheets
// ============================================================
//
//  HOW TO DEPLOY:
//  1. Open your Google Sheet
//  2. Extensions → Apps Script
//  3. Paste this entire code into the editor
//  4. Click "Deploy" → "New Deployment"
//  5. Type: Web App
//  6. Execute as: Me
//  7. Who has access: Anyone
//  8. Click Deploy → Copy the Web App URL
//  9. Paste that URL into the AK Pack Fitness setup screen
//
// ============================================================

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var sheetName = data.sheet;
    var row = data.row;

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(sheetName);

    if (!sheet) {
      return ContentService
        .createTextOutput(JSON.stringify({ success: false, error: "Sheet not found: " + sheetName }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    sheet.appendRow(row);

    return ContentService
      .createTextOutput(JSON.stringify({ success: true }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  return ContentService
    .createTextOutput(JSON.stringify({ status: "AK Pack Fitness API running" }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
//  OPTIONAL: Run this once to create the sheet structure
// ============================================================
function setupSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // Create Members sheet
  var membersSheet = ss.getSheetByName("Members");
  if (!membersSheet) {
    membersSheet = ss.insertSheet("Members");
  }
  membersSheet.getRange("A1:E1").setValues([["MemberID", "Name", "Phone", "StartDate", "ExpiryDate"]]);
  membersSheet.getRange("A1:E1").setFontWeight("bold").setBackground("#8B0000").setFontColor("#FFFFFF");
  membersSheet.setColumnWidth(1, 120);
  membersSheet.setColumnWidth(2, 200);
  membersSheet.setColumnWidth(3, 140);
  membersSheet.setColumnWidth(4, 130);
  membersSheet.setColumnWidth(5, 130);

  // Create Attendance sheet
  var attendanceSheet = ss.getSheetByName("Attendance");
  if (!attendanceSheet) {
    attendanceSheet = ss.insertSheet("Attendance");
  }
  attendanceSheet.getRange("A1:E1").setValues([["Date", "Time", "MemberID", "Name", "Status"]]);
  attendanceSheet.getRange("A1:E1").setFontWeight("bold").setBackground("#8B0000").setFontColor("#FFFFFF");
  attendanceSheet.setColumnWidth(1, 120);
  attendanceSheet.setColumnWidth(2, 100);
  attendanceSheet.setColumnWidth(3, 120);
  attendanceSheet.setColumnWidth(4, 200);
  attendanceSheet.setColumnWidth(5, 100);

  // Add sample member for testing
  var today = new Date();
  var expiry = new Date(today);
  expiry.setMonth(expiry.getMonth() + 1);

  membersSheet.appendRow([
    "AK-001",
    "SAMPLE MEMBER",
    "0712345678",
    Utilities.formatDate(today, Session.getScriptTimeZone(), "dd/MM/yyyy"),
    Utilities.formatDate(expiry, Session.getScriptTimeZone(), "dd/MM/yyyy")
  ]);

  SpreadsheetApp.getUi().alert("✅ Sheets created successfully! Sample member AK-001 added.");
}
