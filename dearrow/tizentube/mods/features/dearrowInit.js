import { configRead } from '../config.js';
import { createBrandingClient, createResponseProcessor, installTransport, preloadImage } from './dearrow.js';

const log = (...args) => console.warn(...args);
const client = createBrandingClient({ fetch: window.fetch.bind(window), log });
const process = createResponseProcessor({
  client,
  readSettings: () => ({ enabled: configRead('enableDeArrow'),
    titles: configRead('enableDeArrowTitles'), thumbnails: configRead('enableDeArrowThumbnails') }),
  loadImage: url => preloadImage(window, url), log
});
installTransport(window, process, log);
console.info('[DeArrow] TizenDeArrow response pipeline installed');
