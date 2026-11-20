// @ts-check
// Chessdown in five languages. Imported first by main.js: the language is set, and the
// page's HTML translated (data-i18n), before any other module writes a text.
// Texts: assets/js/strings/<lang>.js (shared) and games/chessdown/strings/<lang>.js.
import { useLanguages } from '../../../assets/js/i18n.js';
import sharedFr from '../../../assets/js/strings/fr.js';
import sharedEs from '../../../assets/js/strings/es.js';
import sharedIt from '../../../assets/js/strings/it.js';
import sharedDe from '../../../assets/js/strings/de.js';
import en from '../strings/en.js';
import fr from '../strings/fr.js';
import es from '../strings/es.js';
import it from '../strings/it.js';
import de from '../strings/de.js';

useLanguages({
    en,
    fr: { ...sharedFr, ...fr },
    es: { ...sharedEs, ...es },
    it: { ...sharedIt, ...it },
    de: { ...sharedDe, ...de },
});
