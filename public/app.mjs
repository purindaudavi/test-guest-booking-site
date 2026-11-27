import { apiOrigin, propertyId } from "/guest-config.mjs";

const api = apiOrigin + "/api/ibe/" + encodeURIComponent(propertyId);
const search = document.querySelector("#availability-form");
const arrival = search.elements.arrival;
const departure = search.elements.departure;
const roomList = document.querySelector("#room-list");
const roomTemplate = document.querySelector("#room-template");
const summary = document.querySelector("#room-summary");
const searchError = document.querySelector("#search-error");
const bookingDialog = document.querySelector("#booking-dialog");
const guestPanel = document.querySelector("#guest-panel");
const guestForm = document.querySelector("#guest-form");
const guestError = document.querySelector("#booking-error");
const confirmation = document.querySelector("#confirmation");
const dateLabel = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" });
let selectedOffer;
let selectedStay;
let requestKey;
let roomButton;
let searchController;
let bookingsAllowed = true;
let submitting = false;
let mustSearchAgain = false;

function addDays(value, days) {
  const date = new Date(value + "T00:00:00Z");
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
function money(amount, currency) {
  return new Intl.NumberFormat("en", { style: "currency", currency, currencyDisplay: "code" }).format(amount);
}
function showMessage(element, text) {
  element.textContent = text || "";
  element.hidden = !text;
}
async function request(path, options) {
  const response = await fetch(api + path, { ...options, credentials: "omit" });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) throw Object.assign(new Error(data?.message || "Booking service unavailable. Please try again."), { status: response.status });
  return data;
}
function searchFields() {
  return { checkIn: arrival.value, checkOut: departure.value, adults: search.elements.guests.value, children: "0" };
}

async function loadHotel() {
  search.querySelector("button").disabled = true;
  try {
    const hotel = await request("");
    const name = hotel.name || "Book your stay";
    document.querySelector("#hotel-name").textContent = name;
    document.querySelector("#footer-hotel-name").textContent = name;
    document.querySelector(".wordmark").setAttribute("aria-label", name + " home");
    document.title = name + " | Direct booking";
    if (/^#[a-f\d]{6}$/i.test(hotel.headerColour)) {
      document.documentElement.style.setProperty("--accent", hotel.headerColour);
    }
    if (hotel.logo?.startsWith("data:image/")) {
      const logo = document.createElement("img");
      logo.src = hotel.logo;
      logo.alt = "";
      logo.width = 48;
      logo.height = 48;
      logo.style.objectFit = "contain";
      document.querySelector(".mark").replaceWith(logo);
    }
    if (hotel.banner?.startsWith("data:image/")) {
      document.querySelector(".hero").style.backgroundImage = 'linear-gradient(90deg, rgba(10, 31, 24, .65), rgba(10, 31, 24, .15)), url("' + hotel.banner + '")';
    }
    showMessage(document.querySelector("#hotel-location"), hotel.location);
    showMessage(document.querySelector("#footer-location"), hotel.location);
    const rules = document.querySelector("#house-rules");
    for (const [label, value] of [["Check-in", hotel.checkIn], ["Check-out", hotel.checkOut]]) {
      if (!value) continue;
      const row = document.createElement("div");
      const term = document.createElement("dt");
      const description = document.createElement("dd");
      term.textContent = label;
      description.textContent = value;
      row.append(term, description);
      rules.append(row);
    }
    rules.hidden = !rules.children.length;
    bookingsAllowed = hotel.capabilities?.bookings !== false;
    if (hotel.capabilities?.availability === false) {
      showMessage(searchError, "Online room searches are currently unavailable. Please contact the hotel.");
      showMessage(document.querySelector("#availability-note"), "");
      return;
    }
    arrival.min = hotel.today;
    arrival.max = addDays(hotel.today, 364);
    arrival.value = addDays(hotel.today, 1);
    departure.min = addDays(arrival.value, 1);
    departure.max = addDays(hotel.today, 365);
    departure.value = departure.min;
    showMessage(document.querySelector("#availability-note"), "Pay at the property");
    search.querySelector("button").disabled = false;
    await showAvailability();
  } catch (error) {
    showMessage(searchError, error.message);
    showMessage(document.querySelector("#availability-note"), "");
  }
}

async function showAvailability() {
  searchController?.abort();
  const controller = new AbortController();
  searchController = controller;
  const stay = searchFields();
  roomList.replaceChildren();
  summary.textContent = "Checking available rooms…";
  showMessage(searchError, "");
  try {
    const { offers } = await request("/availability?" + new URLSearchParams(stay), { signal: controller.signal });
    if (controller.signal.aborted) return;
    renderRooms(stay, offers);
    summary.textContent = offers.length
      ? offers.length + (offers.length === 1 ? " room type available" : " room types available")
      : "No rooms available for those dates and guests.";
  } catch (error) {
    if (controller.signal.aborted) return;
    summary.textContent = "Try another search.";
    showMessage(searchError, error.message);
  }
}

function renderRooms(stay, offers) {
  roomList.replaceChildren();
  for (const offer of offers) {
    const card = roomTemplate.content.cloneNode(true);
    card.querySelector("img").hidden = true;
    card.querySelector("h3").textContent = offer.roomName;
    showMessage(card.querySelector(".room-description"), offer.description);
    showMessage(card.querySelector(".room-capacity"), offer.maximumAdults ? "Up to " + offer.maximumAdults + " adults" : "");
    card.querySelector(".price-caption").textContent = "Total for " + offer.nights + (offer.nights === 1 ? " night" : " nights");
    card.querySelector(".room-price").textContent = money(offer.total, offer.currency);
    const action = card.querySelector(".room-action");
    action.textContent = bookingsAllowed ? "Select room" : "Online booking disabled";
    action.disabled = !bookingsAllowed;
    action.setAttribute("aria-label", "Select " + offer.roomName);
    action.addEventListener("click", () => {
      roomButton = action;
      openBooking(stay, offer);
    });
    roomList.append(card);
  }
}

function summaryRow(label, value) {
  const row = document.createElement("div");
  const term = document.createElement("dt");
  const description = document.createElement("dd");
  term.textContent = label;
  description.textContent = value;
  row.append(term, description);
  return row;
}
function displayStay(element, stay, offer, reference) {
  element.replaceChildren();
  const name = document.createElement("strong");
  name.textContent = offer.roomName;
  const dates = document.createElement("p");
  dates.textContent = dateLabel.format(new Date(stay.checkIn)) + " – " + dateLabel.format(new Date(stay.checkOut));
  const details = document.createElement("dl");
  if (reference) details.append(summaryRow("Reference", reference));
  details.append(summaryRow("Stay total", money(offer.total, offer.currency)));
  element.append(name, dates, details);
}
function openBooking(stay, offer) {
  if (submitting || !bookingsAllowed) return;
  selectedStay = stay;
  selectedOffer = offer;
  requestKey = crypto.randomUUID();
  mustSearchAgain = false;
  guestForm.reset();
  guestForm.querySelector("button").disabled = false;
  guestPanel.hidden = false;
  confirmation.hidden = true;
  showMessage(guestError, "");
  showMessage(document.querySelector("#booking-terms"), [
    offer.refundable === false ? "Non-refundable rate" : "",
    offer.cancellationPolicy, ...(offer.conditions || [])
  ].filter(Boolean).join(" "));
  displayStay(document.querySelector("#booking-summary"), stay, offer);
  bookingDialog.setAttribute("aria-labelledby", "dialog-title");
  bookingDialog.showModal();
  guestForm.elements.guestName.focus();
}

search.addEventListener("input", () => {
  if (arrival.value) {
    departure.min = addDays(arrival.value, 1);
    if (departure.value < departure.min) departure.value = departure.min;
  }
  searchController?.abort();
  roomList.replaceChildren();
  summary.textContent = "Search again to see rooms for these dates.";
});
search.addEventListener("submit", (event) => {
  event.preventDefault();
  void showAvailability();
});
guestForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!selectedOffer || submitting || mustSearchAgain) return;
  submitting = true;
  const button = guestForm.querySelector("button");
  button.disabled = true;
  showMessage(guestError, "");
  for (const control of search.elements) control.disabled = true;
  try {
    const result = await request("/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...selectedStay, roomTypeId: selectedOffer.roomTypeId, offerKey: selectedOffer.offerKey, requestKey,
        guest: {
          name: guestForm.elements.guestName.value, email: guestForm.elements.email.value,
          phone: guestForm.elements.phone.value, country: guestForm.elements.country.value
        }
      })
    });
    displayStay(document.querySelector("#receipt"), result, { ...selectedOffer, total: result.total, currency: result.currency }, result.reference);
    document.querySelector("#confirmation-title").textContent = result.status === "confirmed" ? "Booking confirmed" : "Booking " + result.status.replaceAll("_", " ");
    guestPanel.hidden = true;
    confirmation.hidden = false;
    guestForm.reset();
    bookingDialog.setAttribute("aria-labelledby", "confirmation-title");
    document.querySelector("#confirmation-title").focus();
    selectedOffer = null;
    void showAvailability();
  } catch (error) {
    mustSearchAgain = [403, 404, 409].includes(error.status);
    showMessage(guestError, error.status ? error.message : "The booking result could not be confirmed. Retry here using the same guest details.");
  } finally {
    submitting = false;
    button.disabled = mustSearchAgain;
    for (const control of search.elements) control.disabled = false;
  }
});

document.querySelector("#close-booking").addEventListener("click", () => { if (!submitting) bookingDialog.close(); });
document.querySelector("#done-booking").addEventListener("click", () => bookingDialog.close());
bookingDialog.addEventListener("cancel", (event) => { if (submitting) event.preventDefault(); });
bookingDialog.addEventListener("close", () => {
  guestForm.reset();
  selectedOffer = null;
  if (roomButton?.isConnected) roomButton.focus();
  else arrival.focus();
  roomButton = null;
});
void loadHotel();
