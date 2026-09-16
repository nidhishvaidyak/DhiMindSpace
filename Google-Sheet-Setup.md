# Google Sheets + Apps Script setup

## 1. Create the booking sheet
Create a Google Sheet, e.g. `Dhi Mind Space - Appointments`.

## 2. Add Apps Script
Open **Extensions → Apps Script**.

Replace the default code with `Code.gs`.

Change:
`const ADMIN_EMAIL = "REPLACE_WITH_LAHARI_EMAIL";`

to Lahari's appointment notification email.

## 3. Deploy
In Apps Script:
- Deploy → New deployment
- Type: Web app
- Execute as: Me
- Who has access: Anyone
- Deploy
- Authorize requested permissions
- Copy the Web app URL ending in `/exec`

## 4. Connect website
Open `config.js` and set:

`const APPS_SCRIPT_URL = "PASTE_WEB_APP_EXEC_URL_HERE";`

## 5. Configure availability
In `config.js`:
- `TIME_SLOTS` controls the time slots.
- `ALLOWED_WEEKDAYS` controls days.
- `MAX_BOOKING_DAYS_AHEAD` controls how far ahead clients can book.

## 6. Host frontend
Upload:
- index.html
- styles.css
- config.js
- app.js

to any HTTPS static host.

## Important
The Google Sheet is the booking source of truth. Apps Script uses a lock around the booking operation, so simultaneous requests for the same slot are checked serially.

For a production mental-health service, add a privacy notice, terms/cancellation policy, secure hosting, appropriate data retention/access controls, and any professional/regulatory requirements applicable to the service and jurisdiction.
