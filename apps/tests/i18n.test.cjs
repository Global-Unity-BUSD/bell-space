// App languages (src/i18n/): every language is complete, keeps names in
// English, and translates the sentences other code builds in English.
const assert = require('node:assert/strict');
const { test } = require('node:test');

const { LANGS, translator } = require('../src/i18n/core.ts');
const { en } = require('../src/i18n/en.ts');
const { es } = require('../src/i18n/es.ts');
const { hy } = require('../src/i18n/hy.ts');
const { ru } = require('../src/i18n/ru.ts');
const { QA_CATEGORIES, QA_ENTRIES } = require('../src/content/qa.ts');
const { areaSteps } = require('../src/navigation/areaRouting.ts');
const { routeSteps } = require('../src/navigation/routing.ts');
const { B1_AREA_DESTINATIONS, B1_ENTRANCES } = require('../src/navigation/data/building1Walkable.ts');

const OTHERS = { es, hy, ru };
// Names are never translated: if the English has one, the translation keeps it as is.
const NAMES = ['Bell Space', 'Burbank High School', 'Global Unity', 'ASB', 'Library', 'Cafeteria', 'Career Center',
  'Quad', 'Student Area', 'Lunch Shelter', 'Book Room', '1155'];
const params = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

test('every language has every screen text, phrase and word, with the same {placeholders}', () => {
  assert.deepEqual(LANGS.map((l) => l.id), ['en', 'es', 'hy', 'ru']);
  for (const [lang, d] of Object.entries(OTHERS)) {
    for (const part of ['ui', 'phrases', 'words']) {
      assert.deepEqual(Object.keys(d[part]).sort(), Object.keys(en[part]).sort(), `${lang}.${part}: keys differ from English`);
      for (const [key, english] of Object.entries(en[part])) {
        const text = d[part][key];
        assert.ok(text && text.trim(), `${lang}.${part}["${key}"] is empty`);
        assert.deepEqual(params(text), params(english), `${lang}.${part}["${key}"]: placeholders differ`);
      }
    }
  }
});

test('every Q&A entry and section is translated in every language', () => {
  const ids = QA_ENTRIES.map((e) => e.id).sort();
  for (const [lang, d] of Object.entries(OTHERS)) {
    assert.deepEqual(Object.keys(d.qa).sort(), ids, `${lang}: Q&A entries differ from src/content/qa.ts`);
    for (const id of ids) assert.ok(d.qa[id].q.trim() && d.qa[id].a.trim(), `${lang}: Q&A "${id}" is empty`);
    assert.deepEqual(Object.keys(d.qaCategories).sort(), QA_CATEGORIES.map((c) => c.id).sort(), `${lang}: Q&A sections`);
  }
});

test('names stay in English in every translation', () => {
  const pairs = [];
  for (const [lang, d] of Object.entries(OTHERS)) {
    for (const [key, english] of Object.entries(en.ui)) pairs.push([`${lang} ${key}`, english, d.ui[key]]);
    for (const e of QA_ENTRIES) {
      pairs.push([`${lang} qa ${e.id} question`, e.question, d.qa[e.id].q]);
      pairs.push([`${lang} qa ${e.id} answer`, e.answer, d.qa[e.id].a]);
    }
  }
  for (const [where, english, translated] of pairs) {
    for (const name of NAMES) {
      if (english.includes(name)) assert.ok(translated.includes(name), `${where}: "${name}" must stay in English`);
    }
  }
});

test('directions built by the navigation code are translated, with names kept', () => {
  const path = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 160, y: 160 }, { x: 260, y: 160 }];
  const steps = [
    ...areaSteps(path, 'Quad').map((s) => s.text),
    'Start at your location and head north',
    ...B1_ENTRANCES.flatMap((e) => [`Leave ${e.name} by its entrance facing ${e.facing}`,
      `Arrive at the ${e.name} entrance, facing ${e.facing}`]),
  ];
  const node = (id, level, x, y, placeId) => ({ id, level, x, y, kind: 'door', status: 'checked', placeId });
  const edge = (id, kind, name) => ({ id, from: '', to: '', kind, name, accessible: kind !== 'stairs', status: 'checked' });
  steps.push(...routeSteps({
    nodes: [node('a', 1, 0, 0, 'Library'), node('b', 1, 100, 0), node('c', 1, 100, 100), node('d', 2, 100, 100), node('e', 2, 0, 100, 'Room 2201')],
    edges: [edge('1', 'walk', 'Quad walkway'), edge('2', 'walk', 'Student Area walkway'), edge('3', 'stairs'), edge('4', 'walk', 'Upper hall')],
    length: 0,
  }).map((s) => s.text));
  for (const lang of Object.keys(OTHERS)) {
    const tr = translator(lang);
    for (const text of steps) {
      const out = tr.phrase(text);
      assert.notEqual(out, text, `${lang}: no translation for "${text}"`);
      for (const name of NAMES) if (text.includes(name)) assert.ok(out.includes(name), `${lang}: "${name}" lost in "${out}"`);
    }
  }
});

test('reasons, map subtitles and server messages are translated; unknown text stays English', () => {
  const es = translator('es');
  assert.equal(es.phrase('Turn left'), 'Gira a la izquierda');
  assert.equal(es.phrase('Building 1 · Floor 2'), 'Edificio 1 · Piso 2');
  assert.equal(es.phrase('Arrive at the door of Library'), 'Llegas a la puerta de Library');
  assert.equal(es.phrase(`${B1_AREA_DESTINATIONS[0].name} is not confirmed yet.`), `${B1_AREA_DESTINATIONS[0].name} aún no está confirmado.`);
  assert.equal(es.phrase('That email or password is not right.'), 'El correo o la contraseña no son correctos.');
  assert.equal(es.phrase('Something nobody listed'), 'Something nobody listed');
  assert.equal(es.word('Your location'), 'Tu ubicación');
  assert.equal(es.t('nav.stepCount', { n: 2, total: 5, floor: 1 }), 'Paso 2 de 5 · Piso 1');
  // English is unchanged.
  const english = translator('en');
  assert.equal(english.phrase('Turn left onto the Quad walkway'), 'Turn left onto the Quad walkway');
  assert.equal(english.t('chat.theyAsked', { name: 'Sam' }), 'Sam asked');
});

test('Updates: the version staff wrote in the student’s language, each blank part in English', () => {
  const { cleanTranslations, updateIn } = require('../../shared/api.ts');
  const u = { title: 'Club fair', location: 'Quad', body: 'Meet every club at lunch.',
    translations: cleanTranslations({ es: { title: ' Feria de clubes ', location: '', body: '' }, ru: { title: '' } }) };
  assert.deepEqual(u.translations, { es: { title: 'Feria de clubes' } });
  assert.deepEqual(updateIn(u, 'es'), { title: 'Feria de clubes', location: 'Quad', body: 'Meet every club at lunch.', translated: true });
  assert.deepEqual(updateIn(u, 'ru'), { title: 'Club fair', location: 'Quad', body: 'Meet every club at lunch.', translated: false });
  assert.equal(updateIn(u, 'en').title, 'Club fair');
  assert.equal(updateIn({ ...u, translations: undefined }, 'es').title, 'Club fair');
});
