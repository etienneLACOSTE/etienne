// @ts-check
// Chessdown in five languages. Imported first by main.js: the language is set, and the
// page's HTML translated (data-i18n), before any other module writes a text.
// Texts: assets/js/strings/<lang>.js (shared), games/chessdown/strings/<lang>.js and the
// career's games/chessdown/strings/career/<lang>.js.
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
import careerEn from '../strings/career/en.js';
import careerFr from '../strings/career/fr.js';
import careerEs from '../strings/career/es.js';
import careerIt from '../strings/career/it.js';
import careerDe from '../strings/career/de.js';

useLanguages({
    en: { ...en, ...careerEn },
    fr: { ...sharedFr, ...fr, ...careerFr },
    es: { ...sharedEs, ...es, ...careerEs },
    it: { ...sharedIt, ...it, ...careerIt },
    de: { ...sharedDe, ...de, ...careerDe },
});
