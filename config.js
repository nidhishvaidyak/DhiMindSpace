// Paste the deployed Google Apps Script Web App URL here.
// Example: https://script.google.com/macros/s/XXXXXXXX/exec
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbz_fx4DSla4ruGxUFaUSY1s_fcQCrIo9Qf2BiUJFssB0Ng0_SDjV9vW4Lf2QHsWXrhe-Q/exec";
const BUSINESS_TIMEZONE = "Asia/Kolkata";

// Edit these slots to match Lahari's actual availability.
const TIME_SLOTS = [
  "10:00 AM","11:00 AM",
  "12:00 PM","2:00 PM",
  "3:00 PM","4:00 PM",
  "5:00 PM","6:00 PM"
];

// 0 = Sunday, 1 = Monday ... 6 = Saturday.
// Example below allows Monday-Saturday.
const ALLOWED_WEEKDAYS = [0,1,2,3,4,5,6];

// Number of days ahead a client can book.
const MAX_BOOKING_DAYS_AHEAD = 60;
