// =============================================================
// DHI MIND SPACE - BOOKING APPLICATION
// =============================================================

// -------------------------------------------------------------
// Warm & Comforting Quotes for Patients
// -------------------------------------------------------------

const COMFORT_QUOTES = [
  "“You don’t have to see the whole staircase, just take the first step.”",
  "“Your present circumstances don’t determine where you can go; they merely determine where you start.”",
  "“Be gentle with yourself. You’re doing the best you can.”",
  "“Healing is not linear, and every small effort counts.”",
  "“Taking time to care for your mind is a sign of strength.”",
  "“In the middle of difficulty lies opportunity.”",
  "“A quiet space to pause, reflect, and move forward.”"
];

let quoteInterval = null;

function getRandomQuote() {
  return COMFORT_QUOTES[
    Math.floor(Math.random() * COMFORT_QUOTES.length)
  ];
}

function startQuoteRotation(elementId) {
  const el = document.getElementById(elementId);

  if (!el) return;

  el.textContent = getRandomQuote();

  if (quoteInterval) {
    clearInterval(quoteInterval);
  }

  quoteInterval = setInterval(() => {
    el.style.opacity = "0";

    setTimeout(() => {
      el.textContent = getRandomQuote();
      el.style.opacity = "1";
    }, 300);
  }, 3500);
}

function stopQuoteRotation() {
  if (quoteInterval) {
    clearInterval(quoteInterval);
    quoteInterval = null;
  }
}


// -------------------------------------------------------------
// Core UI Elements
// -------------------------------------------------------------

const dateInput = document.getElementById("date");
const slotsEl = document.getElementById("slots");
const availabilityMessage = document.getElementById("availabilityMessage");
const selectedTime = document.getElementById("selectedTime");
const form = document.getElementById("bookingForm");
const formMessage = document.getElementById("formMessage");

const bookingOverlay = document.getElementById("bookingOverlay");
const confirmationBox = document.getElementById("confirmationBox");
const confirmationText = document.getElementById("confirmationText");

// Request tracker to prevent async race conditions when date changes rapidly
let currentAvailabilityRequest = 0;


// -------------------------------------------------------------
// Date Helpers
// -------------------------------------------------------------

function localDateISO(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");

  return `${y}-${m}-${d}`;
}


function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);

  return d;
}


// Get today's date at local midnight
function getTodayLocal() {
  const today = new Date();

  today.setHours(0, 0, 0, 0);

  return today;
}


// -------------------------------------------------------------
// Date Picker Configuration
// -------------------------------------------------------------

const today = getTodayLocal();

if (dateInput) {

  // Minimum selectable date = today
  dateInput.min = localDateISO(today);

  // Maximum selectable date
  dateInput.max = localDateISO(
    addDays(
      today,
      typeof MAX_BOOKING_DAYS_AHEAD !== "undefined"
        ? MAX_BOOKING_DAYS_AHEAD
        : 60
    )
  );

  // Default selected date = today
  dateInput.value = localDateISO(today);
}


// -------------------------------------------------------------
// Check Whether a Slot Is in the Past
// -------------------------------------------------------------

function isTimeInPast(date, time) {

  const now = new Date();

  // Only filter time slots when selected date is TODAY
  if (date !== localDateISO(now)) {
    return false;
  }


  let hours;
  let minutes;


  // -----------------------------------------------------------
  // Format: 09:30 / 14:30
  // -----------------------------------------------------------

  if (/^\d{1,2}:\d{2}$/.test(time)) {

    const parts = time.split(":");

    hours = Number(parts[0]);
    minutes = Number(parts[1]);

  }

  // -----------------------------------------------------------
  // Format: 9:30 AM / 2:30 PM
  // -----------------------------------------------------------

  else {

    const match = time.match(
      /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i
    );

    // Unknown format
    if (!match) {
      return false;
    }

    hours = Number(match[1]);
    minutes = Number(match[2]);

    const period = match[3].toUpperCase();


    if (period === "PM" && hours !== 12) {
      hours += 12;
    }

    if (period === "AM" && hours === 12) {
      hours = 0;
    }
  }


  // Create today's slot time
  const slotTime = new Date(now);

  slotTime.setHours(
    hours,
    minutes,
    0,
    0
  );


  // Slot is considered past if it is now or earlier
  return slotTime <= now;
}


// -------------------------------------------------------------
// Fetch Booked Slots Using JSONP
// -------------------------------------------------------------

function getBookedSlots(date) {

  return new Promise((resolve, reject) => {

    if (
      typeof APPS_SCRIPT_URL === "undefined" ||
      !APPS_SCRIPT_URL
    ) {
      resolve([]);
      return;
    }


    const callbackName =
      "jsonp_cb_" +
      Math.round(1000000 * Math.random());


    const script = document.createElement("script");


    window[callbackName] = function (data) {

      delete window[callbackName];

      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }


      if (data && data.success) {

        resolve(data.bookedSlots || []);

      } else {

        reject(
          new Error("Could not load availability.")
        );

      }
    };


    script.src =
      `${APPS_SCRIPT_URL}?action=availability` +
      `&date=${encodeURIComponent(date)}` +
      `&callback=${callbackName}`;


    script.onerror = () => {

      delete window[callbackName];

      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }


      reject(
        new Error(
          "Network error loading availability."
        )
      );
    };


    document.body.appendChild(script);
  });
}


// -------------------------------------------------------------
// Render Available Slots
// -------------------------------------------------------------

async function renderSlots() {

  if (!dateInput || !slotsEl || !availabilityMessage || !selectedTime) return;

  const date = dateInput.value;
  const requestId = ++currentAvailabilityRequest;


  // Clear previous slots
  slotsEl.innerHTML = "";

  // Clear selected time
  selectedTime.value = "";


  if (!date) {
    return;
  }


  // -----------------------------------------------------------
  // Safety check: prevent past dates
  // -----------------------------------------------------------

  const todayISO = localDateISO(new Date());

  if (date < todayISO) {

    availabilityMessage.textContent =
      "Appointments cannot be booked for a past date.";

    return;
  }


  // -----------------------------------------------------------
  // Check allowed weekdays (Explicit parsing to avoid UTC shift)
  // -----------------------------------------------------------

  const [y, m, d] = date.split("-").map(Number);
  const weekday = new Date(y, m - 1, d).getDay();


  if (
    typeof ALLOWED_WEEKDAYS !== "undefined" &&
    !ALLOWED_WEEKDAYS.includes(weekday)
  ) {

    availabilityMessage.textContent =
      "Appointments are not available on this day.";

    return;
  }


  // -----------------------------------------------------------
  // Inline Loading Component
  // -----------------------------------------------------------

  slotsEl.innerHTML = `
    <div class="slot-loader-card">

      <div class="loader-header">

        <div class="pulse-ring"></div>

        <span class="loader-status">
          Finding available slots…
        </span>

      </div>

      <div class="quote-wrapper">

        <span class="quote-mark">“</span>

        <p id="slotQuote" class="quote-text-inline">
          ${getRandomQuote()}
        </p>

      </div>

    </div>
  `;


  availabilityMessage.textContent = "";

  startQuoteRotation("slotQuote");


  // -----------------------------------------------------------
  // Fetch Availability
  // -----------------------------------------------------------

  try {

    const booked = await getBookedSlots(date);

    // Cancel processing if user changed dates while fetch was pending
    if (requestId !== currentAvailabilityRequest) {
      return;
    }


    stopQuoteRotation();


    slotsEl.innerHTML = "";


    // ---------------------------------------------------------
    // Get configured slots
    // ---------------------------------------------------------

    const slots =
      typeof TIME_SLOTS !== "undefined"
        ? TIME_SLOTS
        : [];


    // ---------------------------------------------------------
    // Remove past slots for TODAY
    // ---------------------------------------------------------

    const validSlots = slots.filter(
      time => !isTimeInPast(date, time)
    );


    // ---------------------------------------------------------
    // No slots remaining
    // ---------------------------------------------------------

    if (validSlots.length === 0) {

      availabilityMessage.textContent =
        date === todayISO
          ? "No remaining time slots are available for today."
          : "No time slots are configured for this date.";

      return;
    }


    // ---------------------------------------------------------
    // Render Slots
    // ---------------------------------------------------------

    validSlots.forEach(time => {

      const btn =
        document.createElement("button");


      btn.type = "button";

      btn.className = "slot";

      btn.textContent = time;


      // -------------------------------------------------------
      // Already booked
      // -------------------------------------------------------

      if (booked.includes(time)) {

        btn.classList.add("booked");

        btn.disabled = true;

        btn.title = "Already booked";

      }


      // -------------------------------------------------------
      // Available
      // -------------------------------------------------------

      else {

        btn.addEventListener("click", () => {

          document
            .querySelectorAll(".slot.selected")
            .forEach(x =>
              x.classList.remove("selected")
            );


          btn.classList.add("selected");

          selectedTime.value = time;

          if (formMessage) {
            formMessage.textContent = "";

            formMessage.className =
              "form-message";
          }
        });
      }


      slotsEl.appendChild(btn);

    });


    // ---------------------------------------------------------
    // Count available slots
    // ---------------------------------------------------------

    const available =
      validSlots.filter(
        time => !booked.includes(time)
      ).length;


    if (available > 0) {

      availabilityMessage.textContent =
        `${available} time slot(s) available.`;

    } else {

      availabilityMessage.textContent =
        "No slots available for this date.";
    }


  } catch (error) {

    if (requestId !== currentAvailabilityRequest) {
      return;
    }

    stopQuoteRotation();

    slotsEl.innerHTML = "";

    availabilityMessage.textContent =
      "Unable to load availability. Please try again.";

    console.error(
      "Availability error:",
      error
    );
  }
}


// -------------------------------------------------------------
// Date Change
// -------------------------------------------------------------

if (dateInput) {

  dateInput.addEventListener(
    "change",
    renderSlots
  );
}


// -------------------------------------------------------------
// Form Submission
// -------------------------------------------------------------

if (form) {

  form.addEventListener(
    "submit",
    async (e) => {

      e.preventDefault();

      if (formMessage) {
        formMessage.className =
          "form-message";
      }


      // -------------------------------------------------------
      // Validate Date
      // -------------------------------------------------------

      const selectedDate =
        dateInput ? dateInput.value : "";


      const todayISO =
        localDateISO(new Date());


      if (!selectedDate) {

        if (formMessage) {
          formMessage.textContent =
            "Please select a date.";

          formMessage.classList.add("error");
        }

        return;
      }


      if (selectedDate < todayISO) {

        if (formMessage) {
          formMessage.textContent =
            "Please select today or a future date.";

          formMessage.classList.add("error");
        }

        await renderSlots();

        return;
      }


      // -------------------------------------------------------
      // Validate Time
      // -------------------------------------------------------

      if (!selectedTime || !selectedTime.value) {

        if (formMessage) {
          formMessage.textContent =
            "Please select a time slot first.";

          formMessage.classList.add("error");
        }

        return;
      }


      // -------------------------------------------------------
      // IMPORTANT:
      // Check again whether today's selected time
      // has already passed.
      // -------------------------------------------------------

      if (
        isTimeInPast(
          selectedDate,
          selectedTime.value
        )
      ) {

        if (formMessage) {
          formMessage.textContent =
            "That time slot has already passed. Please select another slot.";

          formMessage.classList.add("error");
        }

        await renderSlots();

        return;
      }


      // -------------------------------------------------------
      // Backend Configuration
      // -------------------------------------------------------

      if (
        typeof APPS_SCRIPT_URL === "undefined" ||
        !APPS_SCRIPT_URL
      ) {

        if (formMessage) {
          formMessage.textContent =
            "Booking backend is not configured yet. Add APPS_SCRIPT_URL in config.js.";

          formMessage.classList.add("error");
        }

        return;
      }


      // -------------------------------------------------------
      // Session Type & Form Input Element Safeties
      // -------------------------------------------------------

      const sessionTypeEl = document.getElementById("sessionType");
      const messageEl = document.getElementById("message");
      const nameEl = document.getElementById("name");
      const emailEl = document.getElementById("email");
      const phoneEl = document.getElementById("phone");

      const sessionTypeVal = sessionTypeEl ? sessionTypeEl.value : "online";
      const rawMessage = messageEl ? messageEl.value.trim() : "";


      const modeLabel =
        sessionTypeVal === "online"
          ? "[Mode: Online Session]"
          : "[Mode: In-person Session]";


      const finalMessage =
        rawMessage
          ? `${modeLabel} ${rawMessage}`
          : modeLabel;


      // -------------------------------------------------------
      // Booking Payload
      // -------------------------------------------------------

      const payload = {

        action: "book",

        date: selectedDate,

        time: selectedTime.value,

        name: nameEl ? nameEl.value.trim() : "",

        email: emailEl ? emailEl.value.trim() : "",

        phone: phoneEl ? phoneEl.value.trim() : "",

        message: finalMessage
      };


      // -------------------------------------------------------
      // Submit Button
      // -------------------------------------------------------

      const submit =
        form.querySelector(
          "button[type=submit]"
        );


      if (submit) {
        submit.disabled = true;
      }


      // -------------------------------------------------------
      // Show Fullscreen Overlay
      // -------------------------------------------------------

      if (bookingOverlay) {
        bookingOverlay.classList.add(
          "active"
        );

        bookingOverlay.setAttribute(
          "aria-hidden",
          "false"
        );
      }


      startQuoteRotation(
        "bookingQuote"
      );


      // -------------------------------------------------------
      // Send Booking
      // -------------------------------------------------------

      try {

        const response =
          await fetch(
            APPS_SCRIPT_URL,
            {
              method: "POST",

              headers: {
                "Content-Type":
                  "text/plain;charset=utf-8"
              },

              body:
                JSON.stringify(payload)
            }
          );


        const responseText = await response.text();
        let data;

        try {
          data = JSON.parse(responseText);
        } catch (jsonErr) {
          throw new Error("Invalid response received from server.");
        }


        if (!data.success) {

          throw new Error(
            data.message ||
            "Booking failed."
          );
        }


        // -----------------------------------------------------
        // Successful Booking
        // -----------------------------------------------------

        if (formMessage) {
          formMessage.textContent = "";

          formMessage.className =
            "form-message";
        }


        if (confirmationText) {
          confirmationText.innerHTML =
            `Your appointment is confirmed for ` +
            `<strong>${payload.date}</strong> ` +
            `at <strong>${payload.time}</strong>.<br>` +
            `A confirmation email has been sent.`;
        }


        if (confirmationBox) {
          confirmationBox.classList.remove(
            "hidden"
          );
        }


        // Reset form
        form.reset();


        // Keep selected date
        if (dateInput) {
          dateInput.value =
            payload.date;
        }


        // Refresh availability
        await renderSlots();


      } catch (err) {

        if (confirmationBox) {

          confirmationBox.classList.add(
            "hidden"
          );
        }


        if (formMessage) {
          formMessage.textContent =
            err.message ||
            "Unable to complete booking.";


          formMessage.classList.add(
            "error"
          );
        }


        await renderSlots();

        console.error(
          "Booking error:",
          err
        );


      } finally {

        stopQuoteRotation();


        if (bookingOverlay) {
          bookingOverlay.classList.remove(
            "active"
          );

          bookingOverlay.setAttribute(
            "aria-hidden",
            "true"
          );
        }


        if (submit) {
          submit.disabled = false;
        }
      }
    }
  );
}


// -------------------------------------------------------------
// Initial Slot Render
// -------------------------------------------------------------

renderSlots();
