import { apiOrigin } from "/guest-config.mjs";

const el = (id) => document.getElementById(id);
const propertyId = location.pathname.split("/")[2] || "";
const api = apiOrigin + "/api/ibe/" + encodeURIComponent(propertyId);
const searchForm = el("search-form");
const bookingForm = el("booking-form");
const checkIn = el("check-in");
const checkOut = el("check-out");
let pendingSearch;
let selectedStay;
let selectedOffer;
let requestKey;
let submitting = false;
let bookingsAllowed = true;
let mustSearchAgain = false;

function shiftDate(value, days) {
  const date = new Date(value + "T00:00:00Z");
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatDate(value) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(value));
}

function formatMoney(amount, currency) {
  return new Intl.NumberFormat("en", { style: "currency", currency, currencyDisplay: "code" }).format(amount);
}

function showText(node, text, error = false) {
  node.textContent = text;
  node.hidden = !text;
  node.classList.toggle("error", error);
}

async function request(endpoint, options) {
  const response = await fetch(api + endpoint, { ...options, credentials: "omit" });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) {
    const message = data?.message || "Online booking is temporarily unavailable. Please try again.";
    throw Object.assign(new Error(message), { status: response.status });
  }
  return data;
}

async function loadProperty() {
  try {
    const property = await request("");
    el("property-name").textContent = property.name || "Book a stay";
    document.title = property.name ? "Book a stay | " + property.name : "Book a stay";
    bookingsAllowed = property.capabilities?.bookings !== false;
    showText(el("property-location"), property.location);
    showText(el("child-policy"), property.childPolicy);
    showText(el("house-times"), [
      property.checkIn && "Check-in " + property.checkIn,
      property.checkOut && "Check-out " + property.checkOut
    ].filter(Boolean).join(" · "));
    if (property.logo?.startsWith("data:image/")) {
      el("property-logo").src = property.logo;
      el("property-logo").hidden = false;
    }
    if (property.banner?.startsWith("data:image/")) {
      const image = el("property-banner");
      const { x, y, scale } = property.bannerPosition;
      image.src = property.banner;
      image.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
      el("banner-frame").hidden = false;
    }
    if (/^#[a-f\d]{6}$/i.test(property.headerColour)) {
      document.documentElement.style.setProperty("--brand", property.headerColour);
    }
    el("child-field").hidden = !property.childFriendly;
    checkIn.value = checkIn.min = property.today;
    checkOut.value = checkOut.min = shiftDate(property.today, 1);
    checkIn.max = shiftDate(property.today, 364);
    checkOut.max = shiftDate(property.today, 365);
    el("page-status").hidden = true;
    if (property.capabilities?.availability === false) {
      showText(el("page-status"), "Online room searches are currently unavailable.", true);
    } else {
      el("booking-search").hidden = false;
    }
  } catch (error) {
    showText(el("page-status"), error.status ? error.message : "Could not load the booking page. Try refreshing.", true);
  }
}

function clearResults() {
  pendingSearch?.abort();
  el("results").hidden = true;
  el("booking-details").hidden = true;
  el("offers").replaceChildren();
  selectedOffer = undefined;
  selectedStay = undefined;
}

searchForm.addEventListener("input", (event) => {
  if (event.target === checkIn && checkIn.value) {
    checkOut.min = shiftDate(checkIn.value, 1);
    if (checkOut.value < checkOut.min) checkOut.value = checkOut.min;
  }
  clearResults();
});

searchForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearResults();
  const search = new AbortController();
  pendingSearch = search;
  const stay = Object.fromEntries(new FormData(searchForm));
  const searchStatus = el("search-status");
  el("results").hidden = false;
  showText(searchStatus, "Checking room availability…");
  try {
    const { offers } = await request("/availability?" + new URLSearchParams(stay), { signal: search.signal });
    if (search.signal.aborted) return;
    showText(searchStatus, offers.length
      ? `${offers.length} room type${offers.length === 1 ? "" : "s"} available`
      : "No rooms are available for those dates and guests. Try another date or guest count.");
    for (const offer of offers) renderOffer(stay, offer);
  } catch (error) {
    if (!search.signal.aborted) showText(searchStatus, error.status ? error.message : "Could not check availability. Try again.", true);
  }
});

function renderOffer(stay, offer) {
  const card = document.createElement("article");
  card.className = "offer";
  const description = document.createElement("div");
  const name = document.createElement("h3");
  name.textContent = offer.roomName;
  const rate = document.createElement("p");
  rate.textContent = `${formatMoney(offer.total, offer.currency)} total · ${offer.nights} night${offer.nights === 1 ? "" : "s"} · Room only`;
  const select = document.createElement("button");
  select.type = "button";
  select.className = "secondary";
  select.textContent = bookingsAllowed ? "Select room" : "Online booking disabled";
  select.disabled = !bookingsAllowed;
  select.setAttribute("aria-label", "Select " + offer.roomName);
  select.addEventListener("click", () => selectOffer(stay, offer));
  description.append(name, rate);
  card.append(description, select);
  el("offers").append(card);
}

function selectOffer(stay, offer) {
  if (submitting || !bookingsAllowed) return;
  selectedStay = stay;
  selectedOffer = offer;
  requestKey = crypto.randomUUID();
  mustSearchAgain = false;
  showText(el("stay-summary"),
    `${offer.roomName} · ${formatDate(stay.checkIn)} to ${formatDate(stay.checkOut)} · ${formatMoney(offer.total, offer.currency)}`);
  showText(el("booking-terms"), [
    offer.refundable === false ? "Non-refundable rate" : "",
    offer.cancellationPolicy,
    ...(offer.conditions || [])
  ].filter(Boolean).join("\n"));
  showText(el("booking-status"), "");
  bookingForm.querySelector("button").disabled = false;
  el("booking-details").hidden = false;
  el("booking-title").focus();
}

bookingForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!selectedOffer || submitting || mustSearchAgain) return;
  const guest = Object.fromEntries(new FormData(bookingForm));
  const button = bookingForm.querySelector("button");
  const searchControls = [...searchForm.elements];
  submitting = true;
  for (const control of searchControls) control.disabled = true;
  button.disabled = true;
  showText(el("booking-status"), "Confirming your booking…");
  try {
    const booking = await request("/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...selectedStay,
        roomTypeId: selectedOffer.roomTypeId,
        offerKey: selectedOffer.offerKey,
        requestKey,
        guest
      })
    });
    clearResults();
    bookingForm.reset();
    el("booking-search").hidden = true;
    el("confirmation-title").textContent = booking.status === "confirmed" ? "Booking confirmed" : "Booking " + booking.status.replaceAll("_", " ");
    el("confirmation-reference").textContent = booking.reference;
    el("confirmation-summary").textContent =
      `${booking.propertyName} · ${booking.roomName} · ${formatDate(booking.checkIn)} to ${formatDate(booking.checkOut)} · ${formatMoney(booking.total, booking.currency)}`;
    el("confirmation").hidden = false;
    el("confirmation-title").focus();
  } catch (error) {
    mustSearchAgain = [404, 409].includes(error.status);
    if (mustSearchAgain) el("offers").replaceChildren();
    showText(el("booking-status"), error.status ? error.message : "The booking result could not be confirmed. Try again here to check the same booking.", true);
  } finally {
    for (const control of searchControls) control.disabled = false;
    submitting = false;
    button.disabled = mustSearchAgain;
  }
});

el("search-again").addEventListener("click", () => {
  el("confirmation").hidden = true;
  el("booking-search").hidden = false;
  checkIn.focus();
});

void loadProperty();
