# App languages

The student app can be used in English, Spanish (Español), Armenian (Հայերեն,
Eastern Armenian) and Russian (Русский). Students choose one in
**Settings → Language**. The choice is saved on the phone, not on the account,
so it also works before signing in. Until someone chooses, the app uses the
phone's own language if it is one of these four, otherwise English.

The staff website is English only for now.

## What is translated and what is not

Translated:

* every screen, button and message in the app;
* the Q&A questions and answers;
* turn-by-turn directions, the reasons a route is not available, and map
  search subtitles ("Building 1 · Floor 2");
* messages from the server shown to students ("That email or password is not
  right.", "You already have two open requests…").

Not translated, on purpose:

* **names**: room and place names (Library, Cafeteria, Quad, Career Center,
  Student Area, Lunch Shelter, Book Room…), Bell Space, Burbank High School,
  ASB, Global Unity and people's names. They match the map and the signs at
  school. A test (`apps/tests/i18n.test.cjs`) fails if a translation changes one;
* Updates posts and chat messages: they stay in the language they were written in;
* the hidden developer tools in Settings (live location, positioning readings,
  proposed routes) and the Supabase fallback's editor and sign-in.

## Files

| File | Holds |
| --- | --- |
| `apps/src/i18n/en.ts` | English source text: screen text (`ui`), sentences built by other code (`phrases`), and words placed in them (`words`) |
| `apps/src/i18n/es.ts`, `hy.ts`, `ru.ts` | The translations, with the same keys |
| `apps/src/i18n/core.ts` | The language list and the translator (no React) |
| `apps/src/i18n/index.tsx` | `LanguageProvider` and `useI18n()` for screens |
| `apps/src/content/qa.ts` | Q&A in English; translations are under `qa` in each language file, by entry id |

`phrases` are matched by their exact English wording. If you change a
sentence in the navigation code or a server message, change its key in
`en.ts` and every language file too, or that sentence falls back to English.
`npx tsc --noEmit` reports a missing key, and `npm test` reports a missing Q&A
entry, a changed `{placeholder}` or a directions sentence that no longer
matches.

## Review before release

The Spanish, Armenian and Russian text is a **draft**. Before Bell Space ships
to students, a native speaker at school (a teacher, staff member or trusted
student) should read each language file and correct it. Points to check:

* **Tone**: Spanish uses informal *tú*; Russian and Armenian use the polite
  plural (*вы*, *դուք*). Change this if the school prefers otherwise.
* **Short tab names**: the tab bar has about 75 px per tab. The Armenian
  Settings tab uses Ընտրանքներ (shorter than the screen title Կարգավորումներ),
  and phones shrink a label slightly if it is still too long.
* **Western Armenian**: many Burbank families speak Western Armenian. The
  draft is Eastern Armenian; ask the school which one students expect.
* **Q&A content that no longer matches Chat**: the English Q&A (and so every
  translation) still says students can stay anonymous to a guide (`qa.askText`,
  the `ask-anonymously` entry). Chat no longer has anonymity: guides and staff
  see the student's name. Fix the English wording first, then the translations.
