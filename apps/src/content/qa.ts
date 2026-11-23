// Q&A content (wording supplied by the project owner, 2026-10-26). To change
// it, edit QA_ENTRIES (and QA_CATEGORIES if sections change); the screen
// needs no other change.
//
// `confirm` marks a claim about school procedure that ASB or the school must
// confirm before Bell Space ships to students. It is never shown in the app;
// list them with `QA_ENTRIES.filter((e) => e.confirm)`. Do not add room
// numbers, office hours, event dates or ticket prices until they are verified.

export type QaCategory = 'getting-around' | 'classes' | 'new' | 'events' | 'chat';
export type QaLink = 'navigation' | 'chat' | 'updates';
export type QaEntry = {
  id: string;
  category: QaCategory;
  question: string;
  answer: string;
  /** Tab the answer points to, shown as a button. */
  link?: QaLink;
  /** What still needs confirmation from ASB or the school (internal note). */
  confirm?: string;
};

export const QA_CATEGORIES: { id: QaCategory; label: string }[] = [
  { id: 'getting-around', label: 'Getting around' },
  { id: 'classes', label: 'Classes and help' },
  { id: 'new', label: 'Language and being new' },
  { id: 'events', label: 'Clubs, games and events' },
  { id: 'chat', label: 'Chat, privacy and safety' },
];

export const QA_LINK_LABEL: Record<QaLink, string> = { navigation: 'Open Navigation', chat: 'Open Chat', updates: 'Open Updates' };

const entry = (id: string, category: QaCategory, question: string, answer: string, more: Partial<QaEntry> = {}): QaEntry =>
  ({ id, category, question, answer, ...more });

export const QA_ENTRIES: QaEntry[] = [
  // Getting around school
  entry('where-classroom', 'getting-around', 'Where is my classroom?',
    'Search your room number in Navigation to see it on the map. If a route is available, choose a starting point to see directions.',
    { link: 'navigation' }),
  entry('which-floor', 'getting-around', 'Which floor is my class on?',
    'Search the room number in Navigation and check the floor shown in the result.', { link: 'navigation' }),
  entry('room-not-found', 'getting-around', 'What if I can’t find my room on the map?',
    'Check the number on your schedule and ask a staff member for help. Some rooms aren’t mapped yet.'),
  entry('library', 'getting-around', 'Where is the library?', 'Search “Library” in Navigation.', { link: 'navigation' }),
  entry('restrooms', 'getting-around', 'Where are the restrooms?',
    'Restrooms aren’t marked in Bell Space yet. Ask a staff member or a student guide where the nearest one is.',
    { link: 'chat', confirm: 'Restrooms are unlabelled ("T") on the source map; add them to the map once confirmed, then change this answer to "Search “restroom” in Navigation."' }),
  entry('cafeteria', 'getting-around', 'How do I get to the cafeteria?',
    'Search “Cafeteria” in Navigation. If directions aren’t available yet, the map still shows you where it is.', { link: 'navigation' }),
  entry('indoor-location', 'getting-around', 'Can Bell Space find my location indoors?',
    'Not yet. Indoor location is still being tested. Choose your starting point on the map instead.'),
  entry('route-wrong', 'getting-around', 'What if a route looks wrong?',
    'Follow school signs or ask staff instead. Please tell a staff member or a student guide so the map can be checked.',
    { link: 'chat', confirm: 'Bell Space has no map-error report button yet; this answer points to staff or Chat until one exists.' }),

  // Classes and school help
  entry('get-schedule', 'classes', 'Where do I get my class schedule?',
    'Ask the school office or your counselor how to get your current schedule.', { confirm: 'How students access schedules.' }),
  entry('explain-schedule', 'classes', 'Who can explain my schedule?',
    'A counselor or the school office can confirm your classes and room assignments.'),
  entry('late-lost', 'classes', 'What if I’m late because I got lost?',
    'Go to class and tell your teacher what happened. Ask staff about the school’s tardy procedure.',
    { confirm: 'Tardy procedure for students who get lost.' }),
  entry('room-changed', 'classes', 'What if my classroom changes?',
    'Follow the latest information from your teacher or the school. If Bell Space shows an outdated room, tell a staff member so it can be fixed.',
    { confirm: 'Bell Space has no in-app report for outdated rooms yet; this answer points to staff.' }),
  entry('homework-help', 'classes', 'Where can I get help with homework?',
    'Ask your teacher or counselor about tutoring and other support.', { confirm: 'Tutoring options available to students.' }),
  entry('assignment-unclear', 'classes', 'What if I don’t understand an assignment?',
    'Ask your teacher to explain the instructions and what support is available.'),

  // Language and being new
  entry('other-language', 'new', 'Can I ask a question in another language?',
    'Yes. Write your Chat question in the language you’re most comfortable with. A guide can reply if someone who speaks it is available.',
    { link: 'chat' }),
  entry('student-guide', 'new', 'What is a student guide?',
    'An approved student who can answer everyday questions about school life. For official decisions about classes or records, contact staff.'),
  entry('ask-anonymously', 'new', 'Can I ask without showing my name to a guide?',
    'Yes. Choose “Anonymous to guide” when you ask in Chat, and the guide won’t see your name. The conversation is still linked to your account, so authorized school staff can review it if it is reported.',
    { link: 'chat' }),
  entry('no-guide', 'new', 'What if no guide is available?',
    'Search Q&A for a quick answer, or ask school staff. Your Chat question waits until a guide is free.'),
  entry('new-how-school-works', 'new', 'Who can explain how school works if I’m new?',
    'A counselor can explain schedules and school services. A student guide can help with everyday questions.', { link: 'chat' }),
  entry('family-message', 'new', 'Can my family get help understanding a school message?',
    'Ask the school office about translation or interpretation support. Don’t share private family documents in student Chat.',
    { confirm: 'Translation and interpretation support for families.' }),

  // Clubs, games and events
  entry('join-club', 'events', 'How do I join a club?', 'Visit the ASB room and ask about clubs and how to join.',
    { confirm: 'ASB room location (no room number is shown until it is verified) and how club sign-up works.' }),
  entry('find-events', 'events', 'Where can I find out about school events?',
    'Check the Updates tab in Bell Space. You can also ask in the ASB room about other events.', { link: 'updates' }),
  entry('football-game', 'events', 'How do I go to a football game?',
    'Check Updates for the game’s time and location. Students can go to the game and buy a ticket there. If ticket arrangements change for a game, its announcement will say so.',
    { link: 'updates', confirm: 'Ticket sales at the venue, and whether any games use other arrangements.' }),
  entry('football-tickets', 'events', 'Where do I buy football game tickets?',
    'Tickets are sold at the game venue. Check that game’s announcement in Updates for any changes.',
    { link: 'updates', confirm: 'Ticket sales at the venue.' }),
  entry('event-alone', 'events', 'I don’t know anyone at a school event. Can I still go?',
    'Yes. You can ask ASB or a student guide what to expect before you go.', { link: 'chat' }),
  entry('suggest-event', 'events', 'How do I suggest an event for Bell Space Updates?',
    'Ask ASB how to send in the event details. An approved editor checks them before they’re published.',
    { confirm: 'How ASB collects event details for Updates.' }),
  entry('event-missing', 'events', 'What if an event isn’t listed in Bell Space?',
    'Ask ASB. Updates may not have every school event yet.', { link: 'updates' }),

  // Chat, privacy and safety
  entry('who-answers', 'chat', 'Who answers Chat questions?',
    'Approved student guides reply when they’re available. Q&A has prepared answers you can read any time.', { link: 'chat' }),
  entry('who-reads', 'chat', 'Can other students read my Chat conversation?',
    'No. There is no public list of conversations. Only you and the student guide who accepted your question can read it. Authorized school staff can read a conversation only if it is reported.'),
  entry('uncomfortable', 'chat', 'What should I do if a reply makes me uncomfortable?',
    'Stop the conversation, tap Report, and tell a trusted staff member if you need help.', { link: 'chat' }),
  entry('sensitive-info', 'chat', 'Should I share my password, address or student ID in Chat?',
    'No. Don’t send private information to a student guide.'),
  entry('emergencies', 'chat', 'Is Chat for emergencies?',
    'No. For immediate help at school, go to a nearby staff member or the school office.'),
];

const fold = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, '')
  .replace(/[“”"]/g, '');

/** Entries matching every word of the query (question, answer or section), in a section or all. */
export function searchQa(entries: QaEntry[], query: string, category: QaCategory | null) {
  // A trailing "s" is dropped so "tickets" also finds "ticket".
  const words = fold(query).split(/\s+/).filter(Boolean).map((w) => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w));
  const label = (c: QaCategory) => QA_CATEGORIES.find((x) => x.id === c)?.label ?? '';
  return entries.filter((e) => (!category || e.category === category)
    && words.every((w) => fold(`${e.question} ${e.answer} ${label(e.category)}`).includes(w)));
}
