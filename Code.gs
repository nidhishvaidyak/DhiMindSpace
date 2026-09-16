const ADMIN_EMAIL = "nidhishvaidyak@gmail.com";
const SHEET_NAME = "Bookings";
const CALENDAR_LOCK_TIMEOUT_MS = 30000;
const TIME_ZONE = "Asia/Kolkata";

// Helper function to get or create the Bookings sheet
function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(["Timestamp","Booking ID","Date","Time","Name","Email","Phone","Message","Status","Calendar Event ID"]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function doGet(e) {
  try {
    const action = e.parameter ? e.parameter.action : null;
    
    if (action === "availability") {
      const date = e.parameter.date;
      const callback = e.parameter.callback;
      const cache = CacheService.getScriptCache();
      
      let bookedSlots;
      const cached = cache.get("slots_" + date);
      
      if (cached) {
        bookedSlots = JSON.parse(cached);
      } else {
        bookedSlots = getBookedSlots_(date);
        cache.put("slots_" + date, JSON.stringify(bookedSlots), 300); // Cache for 5 minutes
      }

      const data = { success: true, bookedSlots: bookedSlots };

      if (callback) {
        return ContentService
          .createTextOutput(`${callback}(${JSON.stringify(data)})`)
          .setMimeType(ContentService.MimeType.JAVASCRIPT);
      }

      return json_(data);
    }

    return json_({ success: true, message: "Dhi Mind Space booking service is running." });
  } catch (err) {
    const callback = e && e.parameter ? e.parameter.callback : null;
    const errData = { success: false, message: err.message };

    if (callback) {
      return ContentService
        .createTextOutput(`${callback}(${JSON.stringify(errData)})`)
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }

    return json_(errData);
  }
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents || "{}");
    if (data.action !== "book") throw new Error("Invalid booking request.");
    validate_(data);

    const lock = LockService.getScriptLock();
    lock.waitLock(CALENDAR_LOCK_TIMEOUT_MS);
    
    let id;
    try {
      const booked = getBookedSlots_(data.date);
      if (booked.indexOf(data.time) !== -1) {
        return json_({ success: false, message: "Sorry, that time slot has just been booked. Please choose another slot." });
      }

      id = Utilities.getUuid();
      const sheet = getSheet_();
      
      // Append row with status PENDING_CALENDAR
      sheet.appendRow([
        new Date(), id, data.date, data.time, data.name,
        data.email, data.phone, data.message || "", "BOOKED", "PENDING"
      ]);

      // Force spreadsheet write immediately
      SpreadsheetApp.flush();

      // Invalidate availability cache
      CacheService.getScriptCache().remove("slots_" + data.date);

    } finally {
      lock.releaseLock();
    }

    // Send emails fast
    sendEmails_(data, id);

    // Trigger calendar creation right before returning (or defer to trigger)
    createCalendarEventAsync_(data, id);

    // Return instant success response to the frontend
    return json_({ success: true, bookingId: id });

  } catch (err) {
    return json_({ success: false, message: err.message });
  }
}

function getBookedSlots_(date) {
  if (!date) return [];
  const sheet = getSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];

  const range = sheet.getRange(2, 3, lastRow - 1, 7);
  const values = range.getDisplayValues();
  const result = [];

  for (let i = 0; i < values.length; i++) {
    const rowDate = String(values[i][0] || "").trim(); 
    const rowTime = String(values[i][1] || "").trim(); 
    const status  = String(values[i][6] || "").trim(); 

    if (rowDate === date && status === "BOOKED") {
      result.push(rowTime);
    }
  }
  return result;
}

function validate_(d) {
  if (!d.date || !d.time || !d.name || !d.email || !d.phone) {
    throw new Error("Please complete all required fields.");
  }
  if (String(d.name).length > 100 || String(d.email).length > 160 ||
      String(d.phone).length > 30 || String(d.message || "").length > 500) {
    throw new Error("One or more fields are too long.");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) {
    throw new Error("Please enter a valid email address.");
  }
}

// Optimized Calendar Creation Function
function createCalendarEventAsync_(d, id) {
  try {
    const cal = CalendarApp.getDefaultCalendar();
    
    // Convert d.date to string safely regardless of input type
    let dateStr = "";
    if (d.date instanceof Date) {
      dateStr = Utilities.formatDate(d.date, TIME_ZONE || "Asia/Kolkata", "yyyy-MM-dd");
    } else {
      dateStr = String(d.date || "").trim();
    }

    if (!dateStr) throw new Error("Invalid or missing date.");

    // Parse YYYY-MM-DD
    const dateParts = dateStr.split("-");
    const year = parseInt(dateParts[0], 10);
    const month = parseInt(dateParts[1], 10) - 1;
    const day = parseInt(dateParts[2], 10);

    // Parse Time string (e.g., "2:00 PM" or "10:00 AM")
    const timeString = String(d.time || "").trim();
    const timeMatches = timeString.match(/^(\d+):(\d+)\s*(AM|PM)?$/i);
    
    if (!timeMatches) throw new Error("Invalid time format: " + timeString);

    let hours = parseInt(timeMatches[1], 10);
    const minutes = parseInt(timeMatches[2], 10);
    const period = timeMatches[3] ? timeMatches[3].toUpperCase() : null;

    if (period === "PM" && hours < 12) hours += 12;
    if (period === "AM" && hours === 12) hours = 0;

    const startTime = new Date(year, month, day, hours, minutes);
    const endTime = new Date(startTime.getTime() + 50 * 60 * 1000); // 50-minute session

    const title = `Dhi Session — ${d.name}`;
    const description = 
      `Dhi Mind Space Appointment\n\n` +
      `Client Name: ${d.name}\n` +
      `Email: ${d.email}\n` +
      `Phone: ${d.phone}\n` +
      `Notes: ${d.message || "None"}\n\n` +
      `Booking ID: ${id}`;

    const event = cal.createEvent(title, startTime, endTime, {
      description: description,
      guests: d.email,
      sendInvites: true
    });

    // Write Event ID to Column J on success
    updateCalendarStatus_(id, event.getId());
  } catch (err) {
    Logger.log("Calendar Error: " + err.message);
    updateCalendarStatus_(id, "FAILED: " + err.message);
  }
}

function updateCalendarStatus_(bookingId, eventId) {
  try {
    const sheet = getSheet_();
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return;

    const data = sheet.getRange(2, 2, lastRow - 1, 9).getValues(); // Cols B to J
    for (let i = 0; i < data.length; i++) {
      if (data[i][0] === bookingId) { // Column B (Booking ID)
        sheet.getRange(i + 2, 10).setValue(eventId); // Column J (Calendar Event ID)
        break;
      }
    }
  } catch (err) {
    console.error("Status Update Error: " + err.message);
  }
}

function sendEmails_(d, id) {
  const adminSubject = "New Appointment — Dhi Mind Space";
  const adminBody =
    "New appointment received.\n\n" +
    "Dhi Mind Space\nLahari Vaidya — Consultant Psychologist\n\n" +
    "Client: " + d.name + "\n" +
    "Date: " + d.date + "\n" +
    "Time: " + d.time + "\n" +
    "Email: " + d.email + "\n" +
    "Phone: " + d.phone + "\n" +
    "Details / Message: " + (d.message || "—") + "\n\n" +
    "Booking ID: " + id;

  if (ADMIN_EMAIL) {
    MailApp.sendEmail({
      to: ADMIN_EMAIL,
      cc: d.email,
      subject: adminSubject,
      body: adminBody
    });
  }
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}


