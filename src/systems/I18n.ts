/**
 * I18n: minimal localization system.
 *
 * - Two languages: Russian (default) and English.
 * - Selected language is persisted in localStorage.
 * - Translations are flat key→string maps; nested keys use dots.
 *   e.g. t('menu.play')
 * - Supports a single {placeholder} substitution per string.
 *   e.g. t('milestone.reached', { value: 128 })
 *        → "Новый рекорд: 128!" / "New record: 128!"
 */

import { STORAGE_KEYS, DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES } from '../config';

export type Language = 'ru' | 'en';

type Vars = Record<string, string | number> | undefined;

const translations: Record<Language, Record<string, string>> = {
  ru: {
    'menu.title': 'BOX 2048',
    'menu.subtitle': 'бросай · объединяй · выживай',
    'menu.best': 'Рекорд: {score}',
    'menu.play': 'ИГРАТЬ',
    'menu.hint': 'тапни по полю, чтобы бросить кубик',
    'menu.language': 'Язык:',
    'menu.language.ru': 'RU',
    'menu.language.en': 'EN',

    'game.score': 'ОЧКИ',
    'game.best': 'РЕКОРД',
    'game.next': 'СЛЕД.',

    'gameover.title': 'ИГРА ОКОНЧЕНА',
    'gameover.score': 'Счёт',
    'gameover.best': 'Рекорд: {score}',
    'gameover.newRecord': 'НОВЫЙ РЕКОРД!',
    'gameover.revive': 'ВОЗРОДИТЬСЯ (рекл.)',
    'gameover.playAgain': 'ИГРАТЬ СНОВА',
    'gameover.menu': '← В меню',

    'milestone.title': 'НОВЫЙ РЕКОРД!',
    'milestone.reached': 'Ты собрал кубик {value}!',
    'milestone.continue': 'ПРОДОЛЖИТЬ',
    'milestone.tapToContinue': 'тапни, чтобы продолжить'
  },
  en: {
    'menu.title': 'BOX 2048',
    'menu.subtitle': 'drop · merge · survive',
    'menu.best': 'Best: {score}',
    'menu.play': 'PLAY',
    'menu.hint': 'tap anywhere to throw the cube',
    'menu.language': 'Language:',
    'menu.language.ru': 'RU',
    'menu.language.en': 'EN',

    'game.score': 'SCORE',
    'game.best': 'BEST',
    'game.next': 'NEXT',

    'gameover.title': 'GAME OVER',
    'gameover.score': 'Score',
    'gameover.best': 'Best: {score}',
    'gameover.newRecord': 'NEW RECORD!',
    'gameover.revive': 'REVIVE (ad)',
    'gameover.playAgain': 'PLAY AGAIN',
    'gameover.menu': '← Main menu',

    'milestone.title': 'NEW MILESTONE!',
    'milestone.reached': 'You reached cube {value}!',
    'milestone.continue': 'CONTINUE',
    'milestone.tapToContinue': 'tap to continue'
  }
};

class I18n {
  private language: Language = DEFAULT_LANGUAGE;

  constructor() {
    const stored = localStorage.getItem(STORAGE_KEYS.language) as Language | null;
    if (stored && SUPPORTED_LANGUAGES.includes(stored)) {
      this.language = stored;
    } else {
      // Try to detect from browser.
      const nav = (navigator.language || 'ru').toLowerCase();
      this.language = nav.startsWith('ru') ? 'ru' : 'en';
    }
  }

  getLanguage(): Language {
    return this.language;
  }

  setLanguage(lang: Language): void {
    if (!SUPPORTED_LANGUAGES.includes(lang)) return;
    this.language = lang;
    localStorage.setItem(STORAGE_KEYS.language, lang);
  }

  t(key: string, vars?: Vars): string {
    const dict = translations[this.language] ?? translations[DEFAULT_LANGUAGE];
    let str = dict[key];
    if (str === undefined) {
      // Fall back to default language.
      str = translations[DEFAULT_LANGUAGE][key];
    }
    if (str === undefined) {
      // Last resort: return the key itself so missing translations are visible.
      return key;
    }
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
      }
    }
    return str;
  }
}

// Singleton — there is no reason to have more than one i18n instance.
export const i18n = new I18n();
