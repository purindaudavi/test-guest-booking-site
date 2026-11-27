const DAY = 24 * 60 * 60 * 1000;

export const hotelDate = (instant = new Date()) => new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Colombo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
}).format(instant);

export const rooms = [
  {
    id: "garden-king",
    name: "Garden King",
    description: "A king bed, a shaded terrace, and a quiet view into the tropical garden.",
    maxGuests: 2,
    weekdayRate: 24000,
    weekendRate: 27000,
    photo: "/images/garden.webp",
    alt: "A king room with teak furniture overlooking a tropical garden"
  },
  {
    id: "ocean-suite",
    name: "Ocean Suite",
    description: "An airy suite with space to unwind and wide windows facing the Indian Ocean.",
    maxGuests: 4,
    weekdayRate: 38500,
    weekendRate: 42500,
    photo: "/images/ocean.webp",
    alt: "An ocean-facing suite with palms visible through the windows"
  }
];

export function addDays(date, days) {
  return new Date(parseDate(date) + days * DAY).toISOString().slice(0, 10);
}

export function checkSampleAvailability({ arrival, departure, guests }, bookings, today = hotelDate()) {
  const checkIn = parseDate(arrival);
  const checkOut = parseDate(departure);
  const nights = (checkOut - checkIn) / DAY;
  if (!Number.isFinite(nights) || nights < 1) throw new Error("Choose a check-out date after check-in.");
  if (arrival < today) throw new Error("Choose a check-in date today or later.");
  if (nights > 30) throw new Error("Choose a stay of up to 30 nights for the preview.");
  if (!Number.isInteger(guests) || guests < 1 || guests > 4) throw new Error("Choose between 1 and 4 guests.");

  return rooms
    .filter((room) => room.maxGuests >= guests && !bookings.some((booking) =>
      room.id === booking.roomId && booking.arrival < departure && booking.departure > arrival
    ))
    .map((room) => ({
      room,
      arrival,
      departure,
      guests,
      nights,
      total: sumNightlyRates(room, checkIn, nights)
    }));
}

function sumNightlyRates(room, checkIn, nights) {
  let total = 0;
  for (let offset = 0; offset < nights; offset += 1) {
    const weekday = new Date(checkIn + offset * DAY).getUTCDay();
    total += weekday === 5 || weekday === 6 ? room.weekendRate : room.weekdayRate;
  }
  return total;
}

function parseDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return NaN;
  const parsed = Date.parse(value + "T00:00:00Z");
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value ? parsed : NaN;
}

