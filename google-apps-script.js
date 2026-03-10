// ============================================
// AK PACK FITNESS — Google Apps Script
// Paste this into script.google.com
// Deploy as Web App:
//   Execute as: Me
//   Who has access: Anyone
// ============================================

function doGet(e) {
  return handleRequest(e);
}

function doPost(e) {
  return handleRequest(e);
}

function handleRequest(e) {
  try {
    var spreadsheetId = '1Vo8k_hEm6OrJt-Bqf1T8vxcMH4_U9DoXkxsJPt9lKsw';
    var ss = SpreadsheetApp.openById(spreadsheetId);
    var data;

    // Try GET param first (main method from website)
    if (e.parameter && e.parameter.data) {
      data = JSON.parse(decodeURIComponent(e.parameter.data));
    }
    // Try POST body
    else if (e.postData && e.postData.contents) {
      data = JSON.parse(e.postData.contents);
    }
    else {
      return ContentService
        .createTextOutput(JSON.stringify({ status: 'error', message: 'No data received' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    var tab = ss.getSheetByName(data.sheet);
    if (!tab) {
      return ContentService
        .createTextOutput(JSON.stringify({ status: 'error', message: 'Sheet not found: ' + data.sheet }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    tab.appendRow(data.row);

    return ContentService
      .createTextOutput(JSON.stringify({ status: 'ok' }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch(err) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'error', message: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
