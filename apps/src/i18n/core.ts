// App languages: the student chooses one in Settings (saved on the phone).
// No React here, so app logic and the Node tests can use it too.
//
// Three kinds of text are translated:
//   ui       screen text, by key: t('chat.title')
//   phrases  sentences other code builds in English (directions, map subtitles,
//            server messages), matched by their English wording: phrase(text)
//   words    single words or names placed inside those sentences ("north", "the stairs")
// Anything not listed stays in English. Room names, Updates posts and chat
// messages are never translated: they stay as written.
import { en, type Strings } from './en.ts';
import { es } from './es.ts';
import { hy } from './hy.ts';
import { ru } from './ru.ts';

export type Lang = 'en' | 'es' | 'hy' | 'ru';
export type Key = keyof Strings['ui'];
export type Params = Record<string, string | number>;

export const LANGS: { id: Lang; name: string; english: string; locale: string }[] = [
  { id: 'en', name: 'English', english: 'English', locale: 'en-US' },
  { id: 'es', name: 'Español', english: 'Spanish', locale: 'es-US' },
  { id: 'hy', name: 'Հայերեն', english: 'Armenian', locale: 'hy-AM' },
  { id: 'ru', name: 'Русский', english: 'Russian', locale: 'ru-RU' },
];

const DICTIONARIES: Record<Lang, Strings> = { en, es, hy, ru };

export const isLang = (x: unknown): x is Lang => typeof x === 'string' && x in DICTIONARIES;

/** The phone's own language when it is one of ours, otherwise English. */
export function deviceLang(): Lang {
  try {
    const code = Intl.DateTimeFormat().resolvedOptions().locale.slice(0, 2).toLowerCase();
    return isLang(code) ? code : 'en';
  } catch {
    return 'en';
  }
}

const fill = (text: string, params?: Params) =>
  params ? text.replace(/\{(\w+)\}/g, (all, name: string) => (name in params ? String(params[name]) : all)) : text;

// English phrase templates as patterns, most specific (longest fixed text) first,
// so "Arrive at the door of {name}" wins over "Arrive at {name}".
const PATTERNS = Object.keys(en.phrases)
  .map((template) => {
    const names: string[] = [];
    const source = template.split(/(\{\w+\})/).map((part) => {
      const m = /^\{(\w+)\}$/.exec(part);
      if (!m) return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      names.push(m[1]);
      return '(.+?)';
    }).join('');
    return { template: template as keyof Strings['phrases'], names, re: new RegExp(`^${source}$`),
      fixed: template.replace(/\{\w+\}/g, '').length };
  })
  .sort((a, b) => b.fixed - a.fixed);

export type Translator = {
  lang: Lang;
  locale: string;
  /** Screen text by key, with {params} filled in. */
  t: (key: Key, params?: Params) => string;
  /** A sentence built in English elsewhere, translated when its wording is known. */
  phrase: (text: string) => string;
  /** A single word or name, translated when known. */
  word: (text: string) => string;
  /** Q&A question and answer by entry id, or undefined to keep the English. */
  qa: (id: string) => { q: string; a: string } | undefined;
  qaCategory: (id: string) => string | undefined;
};

export function translator(lang: Lang): Translator {
  const d = DICTIONARIES[lang];
  const word = (text: string) => (d.words as Record<string, string>)[text] ?? text;
  return {
    lang,
    locale: LANGS.find((l) => l.id === lang)!.locale,
    t: (key, params) => fill(d.ui[key] ?? en.ui[key], params),
    phrase: (text) => {
      if (lang === 'en') return text;
      const direct = (d.words as Record<string, string>)[text];
      if (direct) return direct;
      for (const p of PATTERNS) {
        const m = p.re.exec(text);
        if (!m) continue;
        const params: Params = {};
        p.names.forEach((name, i) => { params[name] = word(m[i + 1]); });
        return fill(d.phrases[p.template], params);
      }
      return text;
    },
    word,
    qa: (id) => d.qa[id],
    qaCategory: (id) => (d.qaCategories as Record<string, string>)[id],
  };
}

/** English, for code that runs before a language is chosen (and for tests). */
export const EN = translator('en');
