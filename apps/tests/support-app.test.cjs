// App-side rules for Chat on the Bell Space server (CLEAR 2.0 flow). The
// access rules themselves are tested in server/tests/rules.test.ts.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const s = require('../src/backend/supportLogic.ts');

const req = (over) => ({
  id: 'r1', student_id: 'sam', student_name: 'Sam', topic: 'navigation', language: null, question: 'Where is 1155?',
  status: 'submitted', guide_id: null, guide_name: null, assigned_at: null, staff_id: null, staff_name: null,
  sensitive: false, resolution_note: null, created_at: '2026-11-22T10:00:00Z', updated_at: '2026-11-22T10:00:00Z',
  resolved_at: null, ...over,
});

test('lists: my questions and requests assigned to me; open first, newest activity first', () => {
  const list = [
    req({ id: 'old', updated_at: '2026-11-22T09:00:00Z' }),
    req({ id: 'done', status: 'resolved', updated_at: '2026-11-22T12:00:00Z' }),
    req({ id: 'new', updated_at: '2026-11-22T11:00:00Z' }),
    req({ id: 'mine-to-help', student_id: 'riley', guide_id: 'sam', status: 'with_guide' }),
  ];
  const { asked, assigned } = s.splitLists(list, 'sam');
  assert.deepEqual(asked.map((r) => r.id), ['new', 'old', 'done']);
  assert.deepEqual(assigned.map((r) => r.id), ['mine-to-help']);
  assert.equal(s.viewerOf(list[3], 'sam'), 'guide');
});

test('who can write: nobody before assignment or after resolution; guides not with staff-only requests', () => {
  for (const status of ['submitted', 'resolved']) {
    assert.equal(s.canSend(req({ status }), 'student'), false);
    assert.equal(s.canSend(req({ status }), 'guide'), false);
  }
  for (const status of ['with_guide', 'follow_up', 'with_staff']) assert.equal(s.canSend(req({ status }), 'student'), true);
  assert.equal(s.canSend(req({ status: 'with_guide' }), 'guide'), true);
  assert.equal(s.canSend(req({ status: 'with_staff' }), 'guide'), false);
});

test('names and state cards follow the flow', () => {
  assert.equal(s.otherParty(req(), 'student'), 'Waiting for staff review');
  assert.equal(s.otherParty(req({ status: 'with_guide', guide_name: 'Gina' }), 'student'), 'Gina (student guide)');
  assert.equal(s.otherParty(req({ status: 'with_staff', staff_name: 'Sofia' }), 'student'), 'Sofia');
  assert.equal(s.otherParty(req({ status: 'with_guide', guide_id: 'gina' }), 'guide'), 'Sam');
  assert.match(s.stateCard(req(), 'student', true).title, /staff review/);
  assert.match(s.stateCard(req({ status: 'with_guide', guide_name: 'Gina' }), 'student', true).text, /can read this conversation/);
  assert.match(s.stateCard(req({ status: 'with_guide', guide_name: 'Gina' }), 'student', false).text, /if it is reported/);
  assert.match(s.stateCard(req({ status: 'with_guide' }), 'guide', true).text, /decline/);
  assert.match(s.stateCard(req({ status: 'with_staff' }), 'student', true).text, /No student guide sees it/);
});

test('messages merge once each, in order', () => {
  const m = (id) => ({ id, request_id: 'r1', sender_id: 'x', sender_role: 'guide', sender_name: 'Gina', body: String(id), created_at: '' });
  assert.deepEqual(s.mergeMessages([m(1), m(3)], [m(2), m(3)]).map((x) => x.id), [1, 2, 3]);
  assert.equal(s.senderLabel(m(1)), 'Gina · Student guide');
});
