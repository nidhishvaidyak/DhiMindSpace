// =============================================================
// DHI MIND SPACE - BOOKING APPLICATION
// =============================================================

// Warm & Comforting Quotes
const COMFORT_QUOTES = [
  "“You don’t have to see the whole staircase, just take the first step.”",
  "“Your present circumstances don’t determine where you can go; they merely determine where you start.”",
  "“Be gentle with yourself. You’re doing the best you can.”",
  "“Healing is not linear, and every small effort counts.”",
  "“Taking time to care for your mind is a sign of strength.”",
  "“In the middle of difficulty lies opportunity.”",
  "“A quiet space to pause, reflect, and move forward.”",
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
// Calendar & WhatsApp URL Helpers
// -------------------------------------------------------------


function createWhatsAppMessageLink(adminPhone, date, time, name) {
  const cleanPhone = adminPhone.replace(/[^0-9]/g, "");
  const text = encodeURIComponent(
    `Hello Lahari, I have booked an appointment at Dhi Mind Space for ${date} at ${time}. (Name: ${name})`
  );
  return `https://wa.me/${cleanPhone}?text=${text}`;
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

function getTodayLocal() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

const today = getTodayLocal();
const DAYS_AHEAD = typeof MAX_BOOKING_DAYS_AHEAD !== "undefined" ? MAX_BOOKING_DAYS_AHEAD : 60;

if (dateInput) {
  dateInput.min = localDateISO(today);
  dateInput.max = localDateISO(addDays(today, DAYS_AHEAD));
  dateInput.value = localDateISO(today);
}

function isTimeInPast(date, time) {
  const now = new Date();
  if (date !== localDateISO(now)) return false;

  let hours, minutes;
  if (/^\d{1,2}:\d{2}$/.test(time)) {
    const parts = time.split(":");
    hours = Number(parts[0]);
    minutes = Number(parts[1]);
  } else {
    const match = time.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (!match) return false;
    hours = Number(match[1]);
    minutes = Number(match[2]);
    const period = match[3].toUpperCase();
    if (period === "PM" && hours !== 12) hours += 12;
    if (period === "AM" && hours === 12) hours = 0;
  }

  const slotTime = new Date(now);
  slotTime.setHours(hours, minutes, 0, 0);
  return slotTime <= now;
}

// -------------------------------------------------------------
// JSONP Helper
// -------------------------------------------------------------

function jsonp(params, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    if (typeof APPS_SCRIPT_URL === "undefined" || !APPS_SCRIPT_URL) {
      resolve(null);
      return;
    }

    const callbackName = "jsonp_cb_" + Date.now() + "_" + Math.round(100000 * Math.random());
    const script = document.createElement("script");
    let timer = null;

    function cleanup() {
      clearTimeout(timer);
      delete window[callbackName];
      if (script.parentNode) script.parentNode.removeChild(script);
    }

    window[callbackName] = function (data) {
      cleanup();
      resolve(data);
    };

    script.onerror = () => {
      cleanup();
      reject(new Error("Network error loading availability."));
    };

    timer = setTimeout(() => {
      cleanup();
      reject(new Error("Availability request timed out."));
    }, timeoutMs);

    const query = Object.keys(params)
      .map((k) => `${k}=${encodeURIComponent(params[k])}`)
      .join("&");

    script.src = `${APPS_SCRIPT_URL}?${query}&callback=${callbackName}`;
    document.body.appendChild(script);
  });
}

// -------------------------------------------------------------
// Cache & Slots Handling
// -------------------------------------------------------------

const CACHE_TTL_MS = 2 * 60 * 1000;
const bookedCache = {};
let rangeLoadedAt = 0;
let rangePromise = null;

function isRangeFresh() {
  return rangeLoadedAt && Date.now() - rangeLoadedAt < CACHE_TTL_MS;
}

function loadRange(force = false) {
  if (!force && isRangeFresh()) return Promise.resolve();
  if (rangePromise) return rangePromise;

  const start = localDateISO(today);
  const end = localDateISO(addDays(today, DAYS_AHEAD));

  rangePromise = jsonp({ action: "range", start, end })
    .then((data) => {
      if (data === null) {
        rangeLoadedAt = Date.now();
        return;
      }
      if (!data.success) throw new Error("Could not load availability.");

      for (let i = 0; i <= DAYS_AHEAD; i++) {
        bookedCache[localDateISO(addDays(today, i))] = [];
      }
      Object.keys(data.booked || {}).forEach((d) => {
        bookedCache[d] = data.booked[d];
      });
      rangeLoadedAt = Date.now();
    })
    .finally(() => {
      rangePromise = null;
    });

  return rangePromise;
}

async function refreshDate(date) {
  const data = await jsonp({ action: "availability", date });
  if (data && data.success) {
    bookedCache[date] = data.bookedSlots || [];
  }
}

async function getBookedSlotsCached(date) {
  if (!isRangeFresh() || !(date in bookedCache)) {
    await loadRange();
  }
  if (!(date in bookedCache)) {
    await refreshDate(date);
  }
  return bookedCache[date] || [];
}

loadRange().catch(() => {});

let renderToken = 0;

function buildSlotButtons(validSlots, booked, checking) {
  slotsEl.innerHTML = "";

  validSlots.forEach((time) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "slot";
    btn.textContent = time;

    if (checking) {
      btn.classList.add("checking");
      btn.disabled = true;
      btn.style.opacity = "0.5";
    } else if (booked.includes(time)) {
      btn.classList.add("booked");
      btn.disabled = true;
      btn.title = "Already booked";
    } else {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".slot.selected").forEach((x) => x.classList.remove("selected"));
        btn.classList.add("selected");
        selectedTime.value = time;
        formMessage.textContent = "";
        formMessage.className = "form-message";
      });
    }
    slotsEl.appendChild(btn);
  });
}

async function renderSlots() {
  const token = ++renderToken;
  const date = dateInput.value;

  slotsEl.innerHTML = "";
  selectedTime.value = "";
  if (!date) return;

  const todayISO = localDateISO(new Date());
  if (date < todayISO) {
    availabilityMessage.textContent = "Appointments cannot be booked for a past date.";
    return;
  }

  const weekday = new Date(`${date}T12:00:00`).getDay();
  if (typeof ALLOWED_WEEKDAYS !== "undefined" && !ALLOWED_WEEKDAYS.includes(weekday)) {
    availabilityMessage.textContent = "Appointments are not available on this day.";
    return;
  }

  const slots = typeof TIME_SLOTS !== "undefined" ? TIME_SLOTS : [];
  const validSlots = slots.filter((time) => !isTimeInPast(date, time));

  if (validSlots.length === 0) {
    availabilityMessage.textContent = date === todayISO
      ? "No remaining time slots are available for today."
      : "No time slots are configured for this date.";
    return;
  }

  const isCached = isRangeFresh() && date in bookedCache;
  if (!isCached) {
    buildSlotButtons(validSlots, [], true);
    availabilityMessage.textContent = "Checking availability…";
  }

  try {
    const booked = await getBookedSlotsCached(date);
    if (token !== renderToken) return;

    buildSlotButtons(validSlots, booked, false);
    const available = validSlots.filter((t) => !booked.includes(t)).length;
    availabilityMessage.textContent = available > 0
      ? `${available} time slot(s) available.`
      : "No slots available for this date.";
  } catch (error) {
    if (token !== renderToken) return;
    slotsEl.innerHTML = "";
    availabilityMessage.textContent = "Unable to load availability. Please try again.";
  }
}

if (dateInput) {
  dateInput.addEventListener("change", renderSlots);
}

// -------------------------------------------------------------
// Form Submission
// -------------------------------------------------------------

if (form) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    formMessage.className = "form-message";

    const selectedDate = dateInput.value;
    const todayISO = localDateISO(new Date());

    if (!selectedDate || selectedDate < todayISO) {
      formMessage.textContent = "Please select today or a future date.";
      formMessage.classList.add("error");
      return;
    }

    if (!selectedTime.value || isTimeInPast(selectedDate, selectedTime.value)) {
      formMessage.textContent = "Please select a valid time slot.";
      formMessage.classList.add("error");
      return;
    }

    if (typeof APPS_SCRIPT_URL === "undefined" || !APPS_SCRIPT_URL) {
      formMessage.textContent = "Booking backend is not configured yet.";
      formMessage.classList.add("error");
      return;
    }

    const sessionTypeVal = document.getElementById("sessionType").value;
    const rawMessage = document.getElementById("message").value.trim();
    const modeLabel = sessionTypeVal === "online" ? "[Mode: Online Session]" : "[Mode: In-person Session]";
    const finalMessage = rawMessage ? `${modeLabel} ${rawMessage}` : modeLabel;

    const payload = {
      action: "book",
      date: selectedDate,
      time: selectedTime.value,
      name: document.getElementById("name").value.trim(),
      email: document.getElementById("email").value.trim(),
      phone: document.getElementById("phone").value.trim(),
      message: finalMessage,
    };

    const submit = form.querySelector("button[type=submit]");
    submit.disabled = true;

    bookingOverlay.classList.add("active");
    bookingOverlay.setAttribute("aria-hidden", "false");
    startQuoteRotation("bookingQuote");

    try {
      const response = await fetch(APPS_SCRIPT_URL, {
        method: "POST",
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (!data.success) throw new Error(data.message || "Booking failed.");

      formMessage.textContent = "";
      
      const waUrl = createWhatsAppMessageLink("+919845607565", payload.date, payload.time, payload.name);

      confirmationText.innerHTML = `
        Your appointment is confirmed for <strong>${payload.date}</strong> at <strong>${payload.time}</strong>.<br>
        A confirmation email has been sent.
        
        <div class="action-buttons-group">
          <a href="${waUrl}" target="_blank" class="button whatsapp-btn">
             💬 Confirm via WhatsApp
          </a>
        </div>
      `;

      confirmationBox.classList.remove("hidden");

      if (!bookedCache[payload.date]) bookedCache[payload.date] = [];
      if (!bookedCache[payload.date].includes(payload.time)) {
        bookedCache[payload.date].push(payload.time);
      }

      form.reset();
      dateInput.value = payload.date;
      await renderSlots();
      refreshDate(payload.date).then(renderSlots).catch(() => {});
    } catch (err) {
      if (confirmationBox) confirmationBox.classList.add("hidden");
      formMessage.textContent = err.message || "Unable to complete booking.";
      formMessage.classList.add("error");
      try { await refreshDate(payload.date); } catch (_) {}
      await renderSlots();
    } finally {
      stopQuoteRotation();
      bookingOverlay.classList.remove("active");
      bookingOverlay.setAttribute("aria-hidden", "true");
      submit.disabled = false;
    }
  });
}

renderSlots();
