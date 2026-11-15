// Self hosted fonts (latin only). Canvas can only draw a face once it has loaded, so
// fontsReady() asks for every face the templates use and waits.
import '@fontsource/bricolage-grotesque/latin-400.css';
import '@fontsource/bricolage-grotesque/latin-600.css';
import '@fontsource/atkinson-hyperlegible/latin-400.css';
import '@fontsource/atkinson-hyperlegible/latin-700.css';
import '@fontsource/jetbrains-mono/latin-400.css';
import '@fontsource/jetbrains-mono/latin-700.css';
import '@fontsource/ibm-plex-sans-condensed/latin-400.css';
import '@fontsource/ibm-plex-sans-condensed/latin-600.css';
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/ibm-plex-mono/latin-500.css';
import '@fontsource/caveat/latin-600.css';
import '@fontsource/caveat/latin-700.css';
import '@fontsource/literata/latin-400.css';
import '@fontsource/literata/latin-600.css';
import { FONT_FACES } from './themes.js';

let ready;
export function fontsReady() {
  ready ||= Promise.all(FONT_FACES.map((f) => document.fonts.load(f).catch(() => null))).then(() => document.fonts.ready);
  return ready;
}
