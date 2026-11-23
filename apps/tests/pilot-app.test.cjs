// App-side rules for the Chat/Updates pilot (the database rules are in pilot-rules.test.mjs).
const assert = require('node:assert/strict');
const { test } = require('node:test');
const chat = require('../src/backend/chatLogic.ts');
const updates = require('../src/backend/updatesLogic.ts');
const qa = require('../src/content/qa.ts');

const convo = (over) => ({
  id: 'c1', topic: 'navigation', language: null, anonymous: true, student_name: null, question: 'Where is 1155?',
  status: 'pending', guide_id: null, guide_name: null, created_at: '2026-10-25T10:00:00Z', accepted_at: null,
  closed_at: null, closed_by: null, ...over,
});

test('chat lists: own questions, guided chats, the guide queue and reported chats', () => {
  const list = [
    convo({ id: 'mine', created_at: '2026-10-25T10:05:00Z' }),
    convo({ id: 'q1', created_at: '2026-10-25T10:01:00Z' }),
    convo({ id: 'q2', created_at: '2026-10-25T10:00:00Z' }),
    convo({ id: 'g1', status: 'active', guide_id: 'me', guide_name: 'Gina' }),
    convo({ id: 'rep', status: 'active', guide_id: 'other' }),
  ];
  const owned = new Set(['mine']);
  const asGuide = chat.classify(list, owned, 'me', 'guide', new Set());
  assert.deepEqual(asGuide.queue.map((c) => c.id), ['q2', 'q1'], 'oldest waiting question first; never your own');
  assert.deepEqual(asGuide.guiding.map((c) => c.id), ['g1']);
  assert.deepEqual(asGuide.asked.map((c) => c.id), ['mine']);
  assert.deepEqual(chat.classify(list, owned, 'me', 'student', new Set()).queue, [], 'students have no queue');
  assert.deepEqual(chat.classify(list, owned, 'me', 'admin', new Set(['rep'])).reviewing.map((c) => c.id), ['rep']);
  assert.deepEqual(chat.classify(list, owned, 'me', 'student', new Set(['rep'])).reviewing, []);
});

test('a reviewer who can read a reported chat\'s owner is not treated as its asker', () => {
  const owners = [{ conversation_id: 'mine', student_id: 'me' }, { conversation_id: 'reported', student_id: 'sam' }];
  assert.deepEqual([...chat.ownedBy(owners, 'me')], ['mine']);
  assert.deepEqual([...chat.ownedBy(owners, 'ed')], []);
});

test('anonymous questions never show a name; named ones show a first name', () => {
  assert.equal(chat.partyNames(convo({ anonymous: true, student_name: 'Sam' }), 'guide').student, 'Anonymous student');
  assert.equal(chat.partyNames(convo({ anonymous: false, student_name: 'Sam' }), 'guide').student, 'Sam');
  assert.equal(chat.partyNames(convo({ anonymous: false, student_name: 'Sam' }), 'student').student, 'You');
  assert.equal(chat.partyNames(convo({ guide_name: 'Gina' }), 'student').guide, 'Gina (guide)');
  assert.equal(chat.partyNames(convo({ anonymous: true }), 'reviewer').student, 'Anonymous student');
});

test('the student is told clearly when no guide is available', () => {
  assert.match(chat.availabilityText(0, 'clubs', 'es').text, /^No guide is available for Clubs in Spanish right now/);
  assert.equal(chat.availabilityText(0, 'clubs', null).none, true);
  assert.equal(chat.availabilityText(1, 'navigation', null).text, '1 guide is available for Navigation.');
  assert.equal(chat.availabilityText(3, 'other', null).text, '3 guides are available for Other.');
  assert.equal(chat.availabilityText(null, 'other', null).none, false);
  assert.deepEqual(chat.TOPICS.map((t) => t.label), ['Navigation', 'New student help', 'Clubs', 'Other']);
});

test('messages: validated, merged once and kept in order', () => {
  assert.equal(chat.validateText('   '), 'Write a message first.');
  assert.match(chat.validateText('x'.repeat(1001)), /under 1000/);
  assert.equal(chat.validateText('ok'), null);
  const m = (id) => ({ id, conversation_id: 'c', from_student: true, body: String(id), created_at: '' });
  assert.deepEqual(chat.mergeMessages([m(1), m(3)], [m(2), m(3)]).map((x) => x.id), [1, 2, 3],
    'a realtime copy of a message just sent is not shown twice');
});

test('update form: optional date/time, limits, and feed order', () => {
  assert.deepEqual(updates.parseWhen('', ''), { iso: null });
  assert.match(updates.parseWhen('2026-13-01', '').error, /does not exist/);
  assert.match(updates.parseWhen('11/06/2026', '').error, /2026-11-06/);
  assert.match(updates.parseWhen('2026-11-06', '7pm').error, /24-hour/);
  const { iso } = updates.parseWhen('2026-11-06', '19:30');
  assert.deepEqual(updates.splitWhen(iso), { date: '2026-11-06', time: '19:30' }, 'round-trips in local time');
  assert.equal(updates.splitWhen(updates.parseWhen('2026-11-06', '').iso).time, '00:00');
  const draft = { title: 'Club fair', date: '', time: '', location: '', body: '' };
  assert.deepEqual(updates.validateUpdate(draft), { starts_at: null });
  assert.deepEqual(updates.validateUpdate({ ...draft, title: ' ' }), { error: 'Add a title.' });
  assert.match(updates.validateUpdate({ ...draft, body: 'x'.repeat(601) }).error, /under 600/);
  const u = (id, status, published_at, updated_at = '2026-10-01') => ({ id, status, published_at, updated_at });
  assert.deepEqual(updates.feedOrder([u('a', 'published', '2026-10-02'), u('d', 'draft', null), u('b', 'published', '2026-10-05')])
    .map((x) => x.id), ['d', 'b', 'a']);
});

test('conversation state cards say what is happening for each side', () => {
  const pending = convo({ topic: 'clubs', language: 'es' });
  assert.equal(chat.threadState(pending, 'student', 2).title, 'Waiting for a guide');
  assert.match(chat.threadState(pending, 'student', 2).text, /Clubs in Spanish/);
  const none = chat.threadState(pending, 'student', 0);
  assert.equal(none.title, 'No guide is available right now');
  assert.equal(none.tone, 'warn');
  const active = convo({ status: 'active', guide_id: 'g', guide_name: 'Gina', anonymous: true });
  assert.equal(chat.threadState(active, 'student', null).title, 'Connected with Gina');
  assert.match(chat.threadState(active, 'student', null).text, /name is hidden/);
  assert.match(chat.threadState({ ...active, anonymous: false }, 'student', null).text, /see your first name/);
  assert.equal(chat.threadState(active, 'guide', null).title, 'Connected with an anonymous student');
  assert.equal(chat.threadState({ ...active, anonymous: false, student_name: 'Sam' }, 'guide', null).title, 'Connected with Sam');
  const closed = chat.threadState(convo({ status: 'closed', closed_by: 'guide' }), 'student', null);
  assert.equal(closed.title, 'Conversation ended');
  assert.match(closed.text, /^Ended by the guide\. No more messages/);
});

test('Q&A: 32 questions in 5 sections, searchable in questions and answers', () => {
  const { QA_ENTRIES: all, QA_CATEGORIES: cats } = qa;
  assert.equal(all.length, 32);
  assert.deepEqual(cats.map((c) => c.label),
    ['Getting around', 'Classes and help', 'Language and being new', 'Clubs, games and events', 'Chat, privacy and safety']);
  assert.deepEqual(cats.map((c) => all.filter((e) => e.category === c.id).length), [8, 6, 6, 7, 5]);
  assert.equal(new Set(all.map((e) => e.id)).size, all.length, 'ids are unique');
  assert.ok(all.every((e) => !('sample' in e)), 'not labelled as sample content');
  assert.ok(all.every((e) => !e.link || e.link in qa.QA_LINK_LABEL));
  // Nothing unverified: no room numbers, times or prices in answers.
  for (const e of all) {
    assert.doesNotMatch(e.answer, /\$\s?\d|\b\d{1,2}(:\d{2})?\s?(am|pm)\b|\broom\s+\d/i, `${e.id} has an unverified detail`);
  }
  const flagged = all.filter((e) => e.confirm).map((e) => e.id);
  for (const id of ['join-club', 'football-game', 'football-tickets', 'restrooms']) assert.ok(flagged.includes(id), `${id} is flagged`);
  const q = (text, cat = null) => qa.searchQa(all, text, cat).map((e) => e.id);
  assert.deepEqual(q('tickets'), ['football-game', 'football-tickets'], 'finds words in answers too');
  assert.deepEqual(q('LIBRARY'), ['library']);
  assert.deepEqual(q('dont understand assignment'), ['assignment-unclear'], 'apostrophes are ignored');
  assert.deepEqual(q('anonymous'), ['ask-anonymously']);
  assert.deepEqual(q('', 'chat'), ['who-answers', 'who-reads', 'uncomfortable', 'sensitive-info', 'emergencies']);
  assert.deepEqual(q('tickets', 'chat'), []);
  assert.ok(q('privacy').length >= 5, 'section names are searchable');
});

test('updates: offline sample has no invented date, and date badges read clearly', () => {
  const s = updates.SAMPLE_UPDATE;
  assert.equal(s.sample, true);
  assert.equal(s.starts_at, null);
  assert.equal(s.location, null);
  assert.match(s.title, /^Sample event/);
  assert.equal(updates.dateBadge(null), null);
  assert.deepEqual(updates.dateBadge(updates.parseWhen('2026-11-06', '19:00').iso), { month: 'NOV', day: '6' });
});
