// The API seam. Pages call only these functions and never call fetch.
// For now they read from mockData.js and return the same shapes as the real API
// (docs/api-examples.md). In Build 7 this ONE file switches to fetch('/api/...').

import { mockEvents } from './mockData.js';

const DELAY_MS = 300;          // pretend network time, so pages need a loading state
const HOLD_SECONDS = 10 * 60;  // how long a pending booking holds its seats (mock only)
const SUCCESS_TOKEN = 'tok_success';
const REFERENCE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

// A working copy, so bookings change what the pages see.
const events = structuredClone(mockEvents);
const bookings = new Map();
let bookingCounter = 0;

function wait() {
  return new Promise((resolve) => setTimeout(resolve, DELAY_MS));
}

// Same shape as the real error body: { code, message }, plus the HTTP status.
function apiError(status, code, message) {
  return Object.assign(new Error(message), { status, code });
}

function copy(value) {
  return structuredClone(value);
}

function lowestPrice(event) {
  return event.tiers.length ? Math.min(...event.tiers.map((tier) => tier.priceCents)) : null;
}

function seatsLeft(event) {
  return event.tiers.reduce((sum, t) => sum + t.seatsLeft, 0);
}

function summarize(event) {
  return {
    id: event.id,
    title: event.title,
    city: event.city,
    venue: event.venue,
    startsAt: event.startsAt,
    status: event.status,
    tierCount: event.tiers.length,
    minPriceCents: lowestPrice(event),
    seatsLeft: seatsLeft(event),
  };
}

const compareText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const byTitleThenId = (a, b) =>
  compareText(a.title.toLowerCase(), b.title.toLowerCase()) || compareText(a.id, b.id);

function nextReference() {
  let value = ++bookingCounter;
  let reference = '';
  for (let index = 0; index < 8; index += 1) {
    reference = REFERENCE_ALPHABET[value % REFERENCE_ALPHABET.length] + reference;
    value = Math.floor(value / REFERENCE_ALPHABET.length);
  }
  return reference;
}

// GET /api/events -> { events: [...] }
export async function listEvents({ q = '', city = '', maxPriceCents, onlyAvailable = false, sort = 'date' } = {}) {
  await wait();
  if (maxPriceCents !== undefined && (!Number.isInteger(maxPriceCents) || maxPriceCents < 0)) {
    throw apiError(400, 'VALIDATION', 'maxPriceCents must be a whole number of cents');
  }
  const sorters = {
    date: (a, b) => new Date(a.startsAt) - new Date(b.startsAt) || byTitleThenId(a, b),
    price: (a, b) => {
      const priceA = lowestPrice(a) ?? Infinity;
      const priceB = lowestPrice(b) ?? Infinity;
      return (priceA === priceB ? 0 : priceA < priceB ? -1 : 1) || byTitleThenId(a, b);
    },
    availability: (a, b) => seatsLeft(b) - seatsLeft(a) || byTitleThenId(a, b),
  };
  if (!Object.hasOwn(sorters, sort)) throw apiError(400, 'VALIDATION', 'sort must be date, price or availability');

  const needle = q.trim().toLowerCase();
  let result = events.filter((e) => e.status === 'published');
  if (needle) result = result.filter((e) => `${e.title} ${e.venue}`.toLowerCase().includes(needle));
  if (city) result = result.filter((e) => e.city.toLowerCase() === city.toLowerCase());
  if (Number.isFinite(maxPriceCents)) {
    result = result.filter((e) => lowestPrice(e) !== null && lowestPrice(e) <= maxPriceCents);
  }
  if (onlyAvailable) result = result.filter((e) => seatsLeft(e) > 0);

  result = [...result].sort(sorters[sort]);
  return { events: copy(result.map(summarize)) };
}

// GET /api/events/:id -> the event with its tiers
export async function getEvent(id) {
  await wait();
  const event = events.find((e) => e.id === id && e.status === 'published');
  if (!event) throw apiError(404, 'NOT_FOUND', 'No such event');
  return copy({ ...summarize(event), organizerId: event.organizerId, tiers: event.tiers });
}

// POST /api/bookings -> a pending booking
export async function createBooking({ tierId, quantity }) {
  await wait();
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) {
    throw apiError(400, 'VALIDATION', 'Quantity must be a whole number from 1 to 10');
  }
  const event = events.find((e) => e.tiers.some((t) => t.id === tierId));
  const tier = event?.tiers.find((t) => t.id === tierId);
  if (!tier) throw apiError(404, 'NOT_FOUND', 'No such ticket tier');
  if (quantity > tier.seatsLeft) {
    throw apiError(409, 'SOLD_OUT', `Only ${tier.seatsLeft} ticket(s) left in ${tier.name}`);
  }
  tier.sold += quantity;
  tier.seatsLeft -= quantity;

  const booking = {
    reference: nextReference(),
    eventId: event.id,
    tierId,
    quantity,
    amountCents: tier.priceCents * quantity,
    status: 'pending',
    createdAt: new Date().toISOString(),
    holdUntil: new Date(Date.now() + HOLD_SECONDS * 1000).toISOString(), // the real API gets this in Build 8
  };
  bookings.set(booking.reference, booking);
  return copy(booking);
}

// POST /api/bookings/:reference/pay. tok_success pays, anything else is declined.
export async function pay(reference, paymentToken) {
  await wait();
  if (typeof paymentToken !== 'string' || paymentToken.trim() === '') {
    throw apiError(400, 'VALIDATION', 'paymentToken is required');
  }
  const booking = bookings.get(reference);
  if (!booking) throw apiError(404, 'NOT_FOUND', 'No such booking');
  if (booking.status !== 'pending') throw apiError(409, 'INVALID_TRANSITION', `Cannot pay a ${booking.status} booking`);
  if (paymentToken !== SUCCESS_TOKEN) {
    // The booking stays pending, so the user can try again.
    throw apiError(402, 'PAYMENT_DECLINED', 'Card declined');
  }
  booking.status = 'paid';
  booking.paidAt = new Date().toISOString();
  return copy(booking);
}
