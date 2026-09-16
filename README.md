# Dhi Mind Space — Booking Website v1

## Files
- `index.html` — website
- `styles.css` — styling
- `config.js` — business settings / Apps Script URL
- `app.js` — booking UI
- `Code.gs` — Google Apps Script backend
- `Google-Sheet-Setup.md` — deployment instructions

## Before going live
1. Replace `ADMIN_EMAIL` in `Code.gs` with Lahari's business email.
2. Set actual available days and time slots in `config.js`.
3. Deploy the Apps Script as a Web App.
4. Put its `/exec` URL into `APPS_SCRIPT_URL`.
5. Test with a private/incognito browser.
6. Verify that the same slot cannot be booked twice.
7. Use HTTPS hosting for the frontend.

This v1 deliberately asks clients for only basic contact information. Avoid collecting detailed mental-health/medical information through the booking form.
