/*
DHI MIND SPACE — Google Apps Script backend
1. Create a Google Sheet.
2. Extensions → Apps Script.
3. Paste this file into Code.gs.
4. Set ADMIN_EMAIL below.
5. Deploy → New deployment → Web app.
6. Execute as: Me
7. Who has access: Anyone
8. Copy the Web App URL into config.js.

Sheet created automatically:
Bookings
Timestamp | Booking ID | Date | Time | Name | Email | Phone | Message | Status
*/

const ADMIN_EMAIL = "nidhishvaidyak@gmail.com";
const SHEET_NAME = "Bookings";
const CALENDAR_LOCK_TIMEOUT_MS = 30000;

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(["Timestamp","Booking ID","Date","Time","Name","Email","Phone","Message","Status"]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function doGet(e) {
  try {
    const action = e.parameter.action;
    if (action === "availability") {
      const date = e.parameter.date;
      return json_({success:true, bookedSlots:getBookedSlots_(date)});
    }
    return json_({success:true, message:"Dhi Mind Space booking service is running."});
  } catch (err) {
    return json_({success:false, message:err.message});
  }
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents || "{}");
    if (data.action !== "book") throw new Error("Invalid booking request.");
    validate_(data);

    // Lock prevents two users from booking the same slot at the same time.
    const lock = LockService.getScriptLock();
    lock.waitLock(CALENDAR_LOCK_TIMEOUT_MS);
    try {
      const booked = getBookedSlots_(data.date);
      if (booked.indexOf(data.time) !== -1) {
        return json_({success:false, message:"Sorry, that time slot has just been booked. Please choose another slot."});
      }

      const id = Utilities.getUuid();
      const sheet = getSheet_();
      sheet.appendRow([
        new Date(), id, data.date, data.time, data.name,
        data.email, data.phone, data.message || "", "BOOKED"
      ]);

      sendEmails_(data, id);
      return json_({success:true, bookingId:id});
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return json_({success:false, message:err.message});
  }
}

function getBookedSlots_(date) {
  if (!date) return [];
  const sheet = getSheet_();
  const values = sheet.getDataRange().getValues();
  const result = [];
  for (let i=1; i<values.length; i++) {
    const rowDate = String(values[i][2] || "");
    const rowTime = String(values[i][3] || "");
    const status = String(values[i][8] || "");
    if (rowDate === date && status === "BOOKED") result.push(rowTime);
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
    "Message: " + (d.message || "—") + "\n\n" +
    "Booking ID: " + id;

  if (ADMIN_EMAIL && ADMIN_EMAIL.indexOf("REPLACE_") !== 0) {
    MailApp.sendEmail(ADMIN_EMAIL, adminSubject, adminBody);
  }

  const clientSubject = "Appointment Confirmation — Dhi Mind Space";
  const clientBody =
    "Hello " + d.name + ",\n\n" +
    "Your appointment with Dhi Mind Space is confirmed.\n\n" +
    "Date: " + d.date + "\n" +
    "Time: " + d.time + "\n\n" +
    "Lahari Vaidya\nConsultant Psychologist\nDhi Mind Space\n\n" +
    "Booking ID: " + id + "\n\n" +
    "If you need to make a change, please contact Dhi Mind Space directly.";

  MailApp.sendEmail(d.email, clientSubject, clientBody);
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
