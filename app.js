// Warm & Comforting Quotes for Patients
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
  return COMFORT_QUOTES[Math.floor(Math.random() * COMFORT_QUOTES.length)];
}

function startQuoteRotation(elementId) {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.textContent = getRandomQuote();
  
  if (quoteInterval) clearInterval(quoteInterval);
  quoteInterval = setInterval(() => {
    el.style.opacity = '0';
    setTimeout(() => {
      el.textContent = getRandomQuote();
      el.style.opacity = '1';
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

function localDateISO(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

const today = new Date();
if (dateInput) {
  dateInput.min = localDateISO(today);
  dateInput.max = localDateISO(addDays(today, typeof MAX_BOOKING_DAYS_AHEAD !== 'undefined' ? MAX_BOOKING_DAYS_AHEAD : 60));
  dateInput.value = localDateISO(today);
}

// Fetch availability via JSONP for high performance
function getBookedSlots(date) {
  return new Promise((resolve, reject) => {
    if (typeof APPS_SCRIPT_URL === 'undefined' || !APPS_SCRIPT_URL) return resolve([]);
    
    const callbackName = 'jsonp_cb_' + Math.round(100000 * Math.random());
    const script = document.createElement('script');
    
    window[callbackName] = function(data) {
      delete window[callbackName];
      if (script.parentNode) script.parentNode.removeChild(script);
      if (data && data.success) {
        resolve(data.bookedSlots || []);
      } else {
        reject(new Error("Could not load availability."));
      }
    };

    script.src = `${APPS_SCRIPT_URL}?action=availability&date=${encodeURIComponent(date)}&callback=${callbackName}`;
    script.onerror = () => {
      delete window[callbackName];
      if (script.parentNode) script.parentNode.removeChild(script);
      reject(new Error("Network error loading availability."));
    };
    
    document.body.appendChild(script);
  });
}

// -------------------------------------------------------------
// Render Slots with Inline Loading Indicator & Quotes
// -------------------------------------------------------------
async function renderSlots() {
  const date = dateInput.value;
  slotsEl.innerHTML = "";
  selectedTime.value = "";
  if (!date) return;

  const weekday = new Date(`${date}T12:00:00`).getDay();
  if (typeof ALLOWED_WEEKDAYS !== 'undefined' && !ALLOWED_WEEKDAYS.includes(weekday)) {
    availabilityMessage.textContent = "Appointments are not available on this day.";
    return;
  }

  // Inline Loading Component for Slots
  slotsEl.innerHTML = `
    <div class="inline-loader">
      <div class="pulse-ring"></div>
      <p class="loader-status">Checking available time slots...</p>
      <p id="slotQuote" class="quote-text-inline">${getRandomQuote()}</p>
    </div>
  `;
  availabilityMessage.textContent = "";
  startQuoteRotation("slotQuote");

  try {
    const booked = await getBookedSlots(date);
    stopQuoteRotation();
    slotsEl.innerHTML = "";

    const slots = typeof TIME_SLOTS !== 'undefined' ? TIME_SLOTS : [];
    slots.forEach(time => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "slot";
      btn.textContent = time;
      if (booked.includes(time)) {
        btn.classList.add("booked");
        btn.disabled = true;
        btn.title = "Already booked";
      } else {
        btn.addEventListener("click", () => {
          document.querySelectorAll(".slot.selected").forEach(x => x.classList.remove("selected"));
          btn.classList.add("selected");
          selectedTime.value = time;
          formMessage.textContent = "";
        });
      }
      slotsEl.appendChild(btn);
    });

    const available = slots.filter(x => !booked.includes(x)).length;
    availabilityMessage.textContent = available ? `${available} time slot(s) available.` : "No slots available for this date.";
  } catch (e) {
    stopQuoteRotation();
    slotsEl.innerHTML = "";
    availabilityMessage.textContent = "Unable to load availability. Please try again.";
    console.error(e);
  }
}

if (dateInput) {
  dateInput.addEventListener("change", renderSlots);
}

// -------------------------------------------------------------
// Form Handling with Fullscreen Overlay Loading
// -------------------------------------------------------------
if (form) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    formMessage.className = "form-message";
    
    if (!selectedTime.value) {
      formMessage.textContent = "Please select a time slot first.";
      formMessage.classList.add("error");
      return;
    }
    
    if (typeof APPS_SCRIPT_URL === 'undefined' || !APPS_SCRIPT_URL) {
      formMessage.textContent = "Booking backend is not configured yet. Add APPS_SCRIPT_URL in config.js.";
      formMessage.classList.add("error");
      return;
    }

    const sessionTypeVal = document.getElementById("sessionType").value;
    const rawMessage = document.getElementById("message").value.trim();
    const modeLabel = sessionTypeVal === 'online' ? '[Mode: Online Session]' : '[Mode: In-person Session]';
    const finalMessage = rawMessage ? `${modeLabel} ${rawMessage}` : modeLabel;

    const payload = {
      action: "book",
      date: dateInput.value,
      time: selectedTime.value,
      name: document.getElementById("name").value.trim(),
      email: document.getElementById("email").value.trim(),
      phone: document.getElementById("phone").value.trim(),
      message: finalMessage
    };

    const submit = form.querySelector("button[type=submit]");
    submit.disabled = true;

    // Show Fullscreen Overlay
    bookingOverlay.classList.add("active");
    bookingOverlay.setAttribute("aria-hidden", "false");
    startQuoteRotation("bookingQuote");

    try {
      const response = await fetch(APPS_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (!data.success) throw new Error(data.message || "Booking failed.");

      formMessage.textContent = `Your appointment is confirmed for ${payload.date} at ${payload.time}. A confirmation email has been sent.`;
      formMessage.classList.add("success");
      form.reset();
      dateInput.value = payload.date;
      await renderSlots();
    } catch (err) {
      formMessage.textContent = err.message || "Unable to complete booking.";
      formMessage.classList.add("error");
      await renderSlots();
    } finally {
      stopQuoteRotation();
      bookingOverlay.classList.remove("active");
      bookingOverlay.setAttribute("aria-hidden", "true");
      submit.disabled = false;
    }
  });
}

// Initial Slot Render
renderSlots();
