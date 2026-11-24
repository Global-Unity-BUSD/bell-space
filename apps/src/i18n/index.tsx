import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { deviceLang, isLang, translator, type Lang, type Translator } from './core.ts';

export { LANGS, type Key, type Lang, type Translator } from './core.ts';

// The chosen language is saved on this phone only (not on the account), so it
// also applies before signing in. Until one is chosen, the phone's language is
// used when it is one of ours.
const LANG_KEY = 'bellspace.language';

type I18n = Translator & { setLang: (lang: Lang) => void };

const Context = createContext<I18n>({ ...translator('en'), setLang: () => {} });

/** The current language's translator, plus setLang for the Settings picker. */
export const useI18n = () => useContext(Context);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(deviceLang);
  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(LANG_KEY).then((saved) => { if (!cancelled && isLang(saved)) setLangState(saved); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);
  const value = useMemo<I18n>(() => ({
    ...translator(lang),
    setLang: (next) => {
      setLangState(next);
      AsyncStorage.setItem(LANG_KEY, next).catch(() => {});
    },
  }), [lang]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
