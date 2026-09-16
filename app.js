const dateInput = document.getElementById("date");
const slotsEl = document.getElementById("slots");
const availabilityMessage = document.getElementById("availabilityMessage");
const selectedTime = document.getElementById("selectedTime");
const form = document.getElementById("bookingForm");
const formMessage = document.getElementById("formMessage");

function localDateISO(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,"0");
  const day = String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
}
function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate()+days);
  return d;
}
const today = new Date();
dateInput.min = localDateISO(today);
dateInput.max = localDateISO(addDays(today, MAX_BOOKING_DAYS_AHEAD));
dateInput.value = localDateISO(today);

// Updated JSONP function to fetch availability without trigger CORS errors
function getBookedSlots(date) {
  return new Promise((resolve, reject) => {
    if (!APPS_SCRIPT_URL) return resolve([]);

    const callbackName = "availabilityCallback_" + Date.now();
    const script = document.createElement("script");

    window[callbackName] = function (data) {
      delete window[callbackName];
      script.remove();

      if (data && data.success) {
        resolve(data.bookedSlots || []);
      } else {
        reject(new Error((data && data.message) || "Could not load availability."));
      }
    };

    script.src = `${APPS_SCRIPT_URL}?action=availability&date=${encodeURIComponent(date)}&callback=${callbackName}`;

    script.onerror = function () {
      delete window[callbackName];
      script.remove();
      reject(new Error("Could not load availability due to network error."));
    };

    document.body.appendChild(script);
  });
}

async function renderSlots() {
  const date = dateInput.value;
  slotsEl.innerHTML = "";
  selectedTime.value = "";
  if (!date) return;

  const weekday = new Date(`${date}T12:00:00`).getDay();
  if (!ALLOWED_WEEKDAYS.includes(weekday)) {
    availabilityMessage.textContent = "Appointments are not available on this day.";
    return;
  }

  availabilityMessage.textContent = "Loading available slots…";
  try {
    const booked = await getBookedSlots(date);
    
    TIME_SLOTS.forEach(time => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "slot";
      btn.textContent = time;

      // Normalize string checks
      const isBooked = booked.some(b => b.trim().toLowerCase() === time.trim().toLowerCase());

      if (isBooked) {
        btn.classList.add("booked");
        btn.disabled = true; // Makes button unclickable
        btn.title = "This time slot is already booked";
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

    const available = TIME_SLOTS.filter(x => !booked.some(b => b.trim().toLowerCase() === x.trim().toLowerCase())).length;
    availabilityMessage.textContent = available ? `${available} time slot(s) available.` : "No slots available for this date.";
  } catch (e) {
    availabilityMessage.textContent = "Unable to load availability. Please try again.";
    console.error(e);
  }
}

dateInput.addEventListener("change", renderSlots);

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  formMessage.className = "form-message";
  if (!selectedTime.value) {
    formMessage.textContent = "Please select a time slot first.";
    formMessage.classList.add("error");
    return;
  }
  if (!APPS_SCRIPT_URL) {
    formMessage.textContent = "Booking backend is not configured yet. Add the Apps Script URL in config.js.";
    formMessage.classList.add("error");
    return;
  }

  const payload = {
    action: "book",
    date: dateInput.value,
    time: selectedTime.value,
    name: document.getElementById("name").value.trim(),
    email: document.getElementById("email").value.trim(),
    phone: document.getElementById("phone").value.trim(),
    message: document.getElementById("message").value.trim()
  };

  const submit = form.querySelector("button[type=submit]");
  submit.disabled = true;
  submit.textContent = "Booking…";

  try {
    const response = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      headers: {"Content-Type":"text/plain;charset=utf-8"},
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
    submit.disabled = false;
    submit.textContent = "Confirm appointment";
  }
});

renderSlots();
