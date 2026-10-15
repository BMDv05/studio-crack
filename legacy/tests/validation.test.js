'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { validateBooking } = require('../src/validate');

const OPTS = { services: ['Brand Identity & Logo', 'Web & Digital Presence'], timeZone: 'UTC', minFillSeconds: 2 };

function base(over = {}) {
  return {
    full_name: 'Sara Haddad',
    email: 'sara@example.com',
    phone: '+962 7 9000 0000',
    company: 'Acme',
    service: 'Brand Identity & Logo',
    description: 'A full brand + landing page project for launch in December.',
    preferred_date: '2099-01-15',
    preferred_time: '10:30',
    meeting_type: 'online',
    consent: true,
    loadedAt: Date.now() - 5000,
    ...over,
  };
}

describe('validateBooking', () => {
  it('accepts a valid payload', () => {
    const { errors, cleaned } = validateBooking(base(), OPTS);
    assert.deepEqual(errors, {});
    assert.equal(cleaned.meeting_type, 'online');
  });
  it('normalizes in-person variant', () => {
    const { errors, cleaned } = validateBooking(base({ meeting_type: 'in-person' }), OPTS);
    assert.deepEqual(errors, {});
    assert.equal(cleaned.meeting_type, 'in_person');
  });
  it('rejects bad email, unknown service, past date, missing consent', () => {
    const { errors } = validateBooking(
      base({ email: 'not-an-email', service: 'Nope', preferred_date: '2000-01-01', consent: false }),
      OPTS
    );
    assert.ok(errors.email);
    assert.ok(errors.service);
    assert.ok(errors.preferred_date);
    assert.ok(errors.consent);
  });
  it('rejects instant bot fills', () => {
    const { errors } = validateBooking(base({ loadedAt: Date.now() }), OPTS);
    assert.ok(errors._spam);
  });
});
