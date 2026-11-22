import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createBooking, getEvent, listEvents, pay } from '../public/js/api.js';

describe('mock frontend API', () => {
  it('uses the real event summary and detail shapes, and allows a declined payment retry', async () => {
    const listing = await listEvents({
      q: 'jazz',
      city: 'abuja',
      maxPriceCents: 800000,
      sort: 'price',
    });
    assert.equal(listing.events.length, 1);
    assert.deepEqual(Object.keys(listing.events[0]), [
      'id',
      'title',
      'city',
      'venue',
      'startsAt',
      'status',
      'tierCount',
      'minPriceCents',
      'seatsLeft',
    ]);
    assert.equal(listing.events[0].title, 'Abuja Jazz Night');

    const soldOutEvent = await getEvent('evt-pharcyde-sold-out');
    assert.equal(soldOutEvent.organizerId, 'org-1');
    assert.equal(soldOutEvent.tiers[0].seatsLeft, 0);
    assert.equal(soldOutEvent.seatsLeft, 0);

    const booking = await createBooking({ tierId: 'tier-comedy-regular', quantity: 1 });
    assert.equal(booking.status, 'pending');
    assert.equal(booking.amountCents, 1000000);
    assert.match(booking.reference, /^[A-Z2-9]{8}$/);
    assert.ok(Date.parse(booking.createdAt));
    assert.ok(Date.parse(booking.holdUntil) > Date.now());
    await assert.rejects(() => pay(booking.reference, 'tok_declined'), { code: 'PAYMENT_DECLINED' });
    const paid = await pay(booking.reference, 'tok_success');
    assert.equal(paid.status, 'paid');
    assert.ok(Date.parse(paid.paidAt));
    await assert.rejects(() => pay(booking.reference, 'tok_success'), { code: 'INVALID_TRANSITION', status: 409 });

    const comedy = (await listEvents({ city: 'Lagos' })).events.find((event) => event.id === 'evt-lagos-comedy');
    assert.equal(comedy.seatsLeft, 3);
  });

  it('rejects unavailable events and quantities outside the booking limit', async () => {
    await assert.rejects(() => getEvent('missing-event'), { code: 'NOT_FOUND', status: 404 });
    await assert.rejects(() => listEvents({ maxPriceCents: 12.5 }), { code: 'VALIDATION', status: 400 });
    await assert.rejects(() => listEvents({ sort: 'random' }), { code: 'VALIDATION', status: 400 });
    await assert.rejects(
      () => createBooking({ tierId: 'tier-comedy-regular', quantity: 11 }),
      { code: 'VALIDATION', status: 400 },
    );
    await assert.rejects(
      () => createBooking({ tierId: 'tier-concert-ga', quantity: 1 }),
      { code: 'SOLD_OUT', status: 409 },
    );
    await assert.rejects(() => pay('MISSING1', ''), { code: 'VALIDATION', status: 400 });
  });
});
