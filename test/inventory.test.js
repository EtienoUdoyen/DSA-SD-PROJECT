import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  createStore,
  createEvent,
  addTier,
  publishEvent,
  unpublishEvent,
  listEventSummaries,
  bookTickets,
  cancelBooking,
  joinWaitlist,
  offerNextOnWaitlist,
  findBookingByReference,
  seatsLeft,
} from '../src/domain/inventory.js';
import { DomainError } from '../src/domain/errors.js';

const throwsCode = (fn, code) =>
  assert.throws(fn, (error) => error instanceof DomainError && error.code === code);

describe('inventory', () => {
  let store;
  let event;
  let tier;

  beforeEach(() => {
    store = createStore();
    event = createEvent(store, {
      title: 'Test Event',
      city: 'Lagos',
      startsAt: '2026-12-05T17:00:00Z',
      organizerId: 'org-1',
    });
    tier = addTier(store, event.id, { name: 'General', priceCents: 2500, capacity: 3 });
    publishEvent(store, event.id);
  });

  describe('creating events and tiers', () => {
    it('creates events with a new id as drafts and hides them from the public list', () => {
      const draft = createEvent(store, {
        title: 'Draft',
        city: 'Abuja',
        startsAt: '2026-12-06',
        organizerId: 'org-1',
      });
      assert.ok(draft.id);
      assert.notEqual(draft.id, event.id);
      assert.equal(draft.status, 'draft');
      assert.equal(store.events.get(draft.id), draft);
      assert.deepEqual(listEventSummaries(store).map(({ id }) => id), [event.id]);
      assert.equal(listEventSummaries(store, { publishedOnly: false }).length, 2);
    });

    it('rejects missing title or city and invalid dates without saving an event', () => {
      const count = store.events.size;
      throwsCode(() => createEvent(store, { title: ' ', city: 'x', startsAt: '2026-12-05' }), 'VALIDATION');
      throwsCode(() => createEvent(store, { title: 'x', city: ' ', startsAt: '2026-12-05' }), 'VALIDATION');
      throwsCode(() => createEvent(store, { title: 'x', city: 'x', startsAt: 'nope' }), 'VALIDATION');
      throwsCode(() => createEvent(store, { title: 'x', city: 'x', startsAt: '2026-02-30' }), 'VALIDATION');
      assert.equal(store.events.size, count);
    });

    it('rejects invalid tier price and capacity and unknown event ids', () => {
      throwsCode(() => addTier(store, event.id, { name: 'x', priceCents: 19.99, capacity: 5 }), 'VALIDATION');
      throwsCode(() => addTier(store, event.id, { name: 'x', priceCents: 100, capacity: 0 }), 'VALIDATION');
      throwsCode(() => addTier(store, 'missing', { name: 'x', priceCents: 100, capacity: 5 }), 'NOT_FOUND');
    });

    it('publishes tiered events and lists only published events by default', () => {
      const draft = createEvent(store, { title: 'Ready', city: 'Lagos', startsAt: '2026-12-06' });
      addTier(store, draft.id, { name: 'General', priceCents: 500, capacity: 2 });
      assert.equal(publishEvent(store, draft.id).status, 'published');
      assert.deepEqual(listEventSummaries(store).map(({ id }) => id), [event.id, draft.id]);
      assert.equal(listEventSummaries(store, { publishedOnly: false }).length, 2);
    });

    it('cannot publish an event with no tiers and leaves it a draft', () => {
      const empty = createEvent(store, { title: 'Empty', city: 'Abuja', startsAt: '2026-12-06' });
      throwsCode(() => publishEvent(store, empty.id), 'INVALID_STATE');
      assert.equal(empty.status, 'draft');
      assert.deepEqual(listEventSummaries(store).map(({ id }) => id), [event.id]);
    });

    it('unpublishes events and hides them from the public list', () => {
      assert.equal(unpublishEvent(store, event.id).status, 'draft');
      assert.deepEqual(listEventSummaries(store), []);
      assert.equal(listEventSummaries(store, { publishedOnly: false }).length, 1);
    });
  });

  describe('booking', () => {
    it('saves a tier with zero sold and its full capacity available', () => {
      const draft = createEvent(store, { title: 'Tiered Draft', city: 'Lagos', startsAt: '2026-12-06' });
      const newTier = addTier(store, draft.id, { name: 'General', priceCents: 500000, capacity: 100 });
      assert.equal(store.tiers.get(newTier.id), newTier);
      assert.equal(newTier.priceCents, 500000);
      assert.equal(newTier.sold, 0);
      assert.equal(newTier.capacity, 100);
      assert.equal(seatsLeft(newTier), 100);
    });

    it('reduces the seats left and prices in whole cents', () => {
      const booking = bookTickets(store, tier.id, 'ada', 2);
      assert.equal(booking.amountCents, 5000);
      assert.equal(booking.status, 'pending');
      assert.equal(seatsLeft(tier), 1);
    });

    it('rejects a booking bigger than the seats left, and changes nothing', () => {
      bookTickets(store, tier.id, 'ada', 2);
      const bookingCount = store.bookings.size;
      throwsCode(() => bookTickets(store, tier.id, 'bayo', 2), 'SOLD_OUT');
      assert.equal(seatsLeft(tier), 1);
      assert.equal(store.bookings.size, bookingCount);
    });

    it('lets the last ticket be booked, then reports sold out', () => {
      bookTickets(store, tier.id, 'ada', 3);
      assert.equal(seatsLeft(tier), 0);
      throwsCode(() => bookTickets(store, tier.id, 'bayo', 1), 'SOLD_OUT');
    });

    it('validates the quantity', () => {
      for (const bad of [0, -1, 1.5, 11, '2', undefined]) {
        throwsCode(() => bookTickets(store, tier.id, 'ada', bad), 'VALIDATION');
      }
    });

    it('finds a booking by its reference code', () => {
      const booking = bookTickets(store, tier.id, 'ada', 1);
      assert.match(booking.reference, /^[A-Z2-9]{8}$/);
      assert.equal(findBookingByReference(store, booking.reference), booking);
      assert.equal(findBookingByReference(store, 'NOPE0000'), undefined);
    });
  });

  describe('cancelling', () => {
    it('gives the seats back', () => {
      const booking = bookTickets(store, tier.id, 'ada', 2);
      cancelBooking(store, booking.reference);
      assert.equal(seatsLeft(tier), 3);
      assert.equal(booking.status, 'cancelled');
    });

    it('cannot be done twice (seats are released once)', () => {
      const booking = bookTickets(store, tier.id, 'ada', 2);
      cancelBooking(store, booking.reference);
      throwsCode(() => cancelBooking(store, booking.reference), 'INVALID_STATE');
      assert.equal(seatsLeft(tier), 3);
    });
  });

  describe('waitlist', () => {
    it('only opens when the tier cannot satisfy the request', () => {
      throwsCode(() => joinWaitlist(store, tier.id, 'ada', 1), 'NOT_SOLD_OUT');
      bookTickets(store, tier.id, 'bayo', 3);
      assert.deepEqual(joinWaitlist(store, tier.id, 'ada', 1), { position: 1 });
      assert.deepEqual(joinWaitlist(store, tier.id, 'chidi', 1), { position: 2 });
    });

    it('offers seats first come, first served', () => {
      const booking = bookTickets(store, tier.id, 'bayo', 3);
      joinWaitlist(store, tier.id, 'ada', 1);
      joinWaitlist(store, tier.id, 'chidi', 1);
      assert.equal(offerNextOnWaitlist(store, tier.id), undefined, 'no seats yet');
      cancelBooking(store, booking.reference);
      assert.equal(offerNextOnWaitlist(store, tier.id).userId, 'ada');
      assert.equal(offerNextOnWaitlist(store, tier.id).userId, 'chidi');
    });
  });
});
