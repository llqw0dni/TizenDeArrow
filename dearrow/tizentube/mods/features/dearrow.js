import sha256 from '../tiny-sha256.js';

// The API orders candidates (including moderator locks). Do not re-sort votes.
export function selectBranding(data) {
  const suitable = list => {
    const first = Array.isArray(list) ? list[0] : null;
    return first && (first.locked === true || (typeof first.votes === 'number' && first.votes >= 0))
      && first.original !== true ? first : null;
  };
  const title = suitable(data?.titles);
  const thumbnail = suitable(data?.thumbnails);
  return {
    title: typeof title?.title === 'string' && title.title.trim() ? title.title : null,
    timestamp: typeof thumbnail?.timestamp === 'number' && Number.isFinite(thumbnail.timestamp)
      && thumbnail.timestamp >= 0 ? thumbnail.timestamp : null
  };
}

const VIDEO_ID = /^[a-zA-Z0-9_-]{11}$/;
const EMPTY = Object.freeze({ title: null, timestamp: null });

// No invented bulk endpoint: hash-prefix responses group videos as in DeArrow.
// Cache and in-flight keys are prefixes, so collisions share a single request.
export function createBrandingClient({ fetch: fetcher, now = Date.now, timeout = 800,
  maxEntries = 128, concurrency = 4, log = () => {} }) {
  const cache = new Map();
  const inFlight = new Map();
  const queue = [];
  let active = 0;
  let blockedUntil = 0;
  function pump() {
    while (active < concurrency && queue.length) {
      const work = queue.shift();
      active++;
      work().then(() => { active--; pump(); }, () => { active--; pump(); });
    }
  }
  async function request(prefix) {
    let timer;
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    try {
      const response = await Promise.race([
        fetcher(`https://sponsor.ajay.app/api/branding/${prefix}?fetchAll=true`,
          controller ? { signal: controller.signal } : undefined),
        new Promise((_, reject) => { timer = setTimeout(() => {
          if (controller) controller.abort();
          reject(new Error('branding timeout'));
        }, timeout); })
      ]);
      if (response.status === 429) {
        const retry = Number(response.headers?.get('Retry-After'));
        blockedUntil = now() + Math.min(3600000, Math.max(30000, (retry || 60) * 1000));
        throw new Error('branding rate limited');
      }
      if (!response.ok && response.status !== 404) throw new Error(`branding HTTP ${response.status}`);
      // Include JSON decoding in the same timeout, not only response headers.
      const data = await Promise.race([
        response.status === 404 ? Promise.resolve({}) : response.json(),
        new Promise((_, reject) => { clearTimeout(timer); timer = setTimeout(() => {
          if (controller) controller.abort();
          reject(new Error('branding body timeout'));
        }, timeout); })
      ]);
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('invalid branding response');
      const result = { data, expires: now() + (Object.keys(data).length ? 600000 : 60000) };
      cache.set(prefix, result);
      while (cache.size > maxEntries) cache.delete(cache.keys().next().value);
      return data;
    } catch (error) {
      log('[DeArrow]', error.message);
      cache.set(prefix, { data: {}, expires: now() + 15000 });
      while (cache.size > maxEntries) cache.delete(cache.keys().next().value);
      return {};
    } finally {
      clearTimeout(timer);
    }
  }
  return {
    async get(videoID) {
      if (!VIDEO_ID.test(videoID)) return EMPTY;
      const prefix = sha256(videoID).slice(0, 4);
      let record = cache.get(prefix);
      if (record && record.expires > now()) {
        cache.delete(prefix); cache.set(prefix, record);
        return selectBranding(record.data[videoID]);
      }
      if (blockedUntil > now()) return EMPTY;
      if (!inFlight.has(prefix)) {
        // Bound outstanding work during rapid navigation. Excess items fail open.
        if (queue.length >= 128) return EMPTY;
        const promise = new Promise(resolve => {
          queue.push(async () => {
            if (blockedUntil > now()) { resolve({}); return; }
            resolve(await request(prefix));
          });
        });
        inFlight.set(prefix, promise);
        promise.then(() => inFlight.delete(prefix), () => inFlight.delete(prefix));
        pump();
      }
      const data = await inFlight.get(prefix);
      return selectBranding(data[videoID]);
    },
    clear() { cache.clear(); },
    stats() { return { cached: cache.size, inFlight: inFlight.size, queued: queue.length, active }; }
  };
}

export function thumbnailURL(videoID, timestamp) {
  return `https://dearrow-thumb.ajay.app/api/v1/getThumbnail?videoID=${encodeURIComponent(videoID)}&time=${timestamp}`;
}

// Only explicit video renderers carry replacements; arbitrary title/contentId
// properties elsewhere in the response must never be treated as videos.
export function collectVideoSlots(root) {
  const slots = [];
  const stack = [root];
  const seen = new WeakSet();
  while (stack.length) {
    const node = stack.pop();
    if (!node || typeof node !== 'object' || seen.has(node)) continue;
    seen.add(node);
    let id, title, titleKey, image, imageKey;
    if (node.tileRenderer) {
      const r = node.tileRenderer;
      const endpointID = r.onSelectCommand?.watchEndpoint?.videoId;
      id = endpointID || r.contentId;
      if (endpointID && r.contentId && endpointID !== r.contentId) id = null;
      title = r.metadata?.tileMetadataRenderer?.title; titleKey = 'simpleText';
      image = r.header?.tileHeaderRenderer?.thumbnail; imageKey = 'thumbnails';
    } else if (node.lockupViewModel?.contentType === 'LOCKUP_CONTENT_TYPE_VIDEO') {
      const r = node.lockupViewModel;
      const endpointID = r.rendererContext?.commandContext?.onTap?.innertubeCommand?.watchEndpoint?.videoId;
      id = r.contentId;
      if (endpointID && id !== endpointID) id = null;
      title = r.metadata?.lockupMetadataViewModel?.title; titleKey = 'content';
      image = r.contentImage?.thumbnailViewModel?.image; imageKey = 'sources';
    } else {
      const r = node.videoRenderer || node.compactVideoRenderer || node.playlistVideoRenderer;
      if (r) {
        id = r.videoId; title = r.title; titleKey = 'simpleText';
        image = r.thumbnail; imageKey = 'thumbnails';
      } else if (node.videoDetails) {
        id = node.videoDetails.videoId; title = node.videoDetails; titleKey = 'title';
      }
    }
    if (VIDEO_ID.test(id || '')) slots.push({ id, title, titleKey, image, imageKey });
    for (const key of Object.keys(node)) {
      // Queue menu copies are commands, not live video cards.
      if (key !== 'customAction' && key !== 'trackingParams' && typeof node[key] === 'object') stack.push(node[key]);
    }
  }
  return slots;
}

export function createResponseProcessor({ client, readSettings, loadImage, budget = 1200, log = () => {} }) {
  const images = new Map();
  function imageReady(url) {
    const cached = images.get(url);
    if (cached && cached.expires > Date.now()) return cached.promise;
    const promise = Promise.resolve().then(() => loadImage(url)).then(Boolean, () => false);
    const record = { promise, expires: Date.now() + 60000 };
    images.set(url, record);
    promise.then(ok => { record.expires = Date.now() + (ok ? 600000 : 30000); });
    while (images.size > 128) images.delete(images.keys().next().value);
    return promise;
  }
  return async function process(root) {
    const settings = readSettings();
    if (!settings.enabled || (!settings.titles && !settings.thumbnails)) return root;
    const slots = collectVideoSlots(root);
    if (!slots.length) return root;
    let timer;
    let expired = false;
    const completed = [];
    const jobs = slots.map(async slot => {
      const branding = await client.get(slot.id);
      let url = null;
      if (settings.thumbnails && branding.timestamp !== null && slot.image) {
        const candidate = thumbnailURL(slot.id, branding.timestamp);
        if (!expired && await imageReady(candidate)) url = candidate;
      }
      if (!expired) completed.push({ slot, branding, url });
    });
    const results = await Promise.race([
      Promise.all(jobs),
      new Promise(resolve => { timer = setTimeout(() => { expired = true; resolve(null); }, budget); })
    ]);
    clearTimeout(timer);
    if (!results) log('[DeArrow] Response budget exceeded; unfinished items retained');
    const current = readSettings();
    if (!current.enabled) return root;
    // No UI object escapes until all asynchronous work is done. Late requests
    // only populate caches, never mutate models already consumed by YouTube.
    for (const { slot, branding, url } of completed) {
      if (current.titles && branding.title && slot.title) {
        if (slot.titleKey === 'simpleText' && Array.isArray(slot.title.runs)) {
          slot.title.runs = [{ text: branding.title }];
        } else slot.title[slot.titleKey] = branding.title;
      }
      if (current.thumbnails && url && slot.image) {
        slot.image[slot.imageKey] = [{ url, width: 1280, height: 720 }];
      }
    }
    return root;
  };
}

export function isYouTubeResponse(url) {
  try {
    const parsed = new URL(url, 'https://www.youtube.com');
    return /(^|\.)youtube\.com$/.test(parsed.hostname)
      && /^\/youtubei\/v1\/(browse|search|next|player|get_watch|reel\/reel_watch_sequence)$/.test(parsed.pathname);
  } catch (_) { return false; }
}

// Deliver transformed JSON before the existing synchronous JSON.parse hooks.
// Restrict all interception to known YouTube data routes; video/media, login,
// DIAL and SponsorBlock requests retain their original behavior.
export function installTransport(window, process, log = () => {}) {
  if (window.__tizenDeArrowTransportInstalled) return;
  window.__tizenDeArrowTransportInstalled = true;
  const rawParse = JSON.parse;
  const rawStringify = JSON.stringify;
  async function transform(text) {
    try { return rawStringify(await process(rawParse(text))); }
    catch (error) { log('[DeArrow] Response retained:', error.message); return text; }
  }
  const originalFetch = window.fetch;
  function wrapResponse(response, url) {
    if (!isYouTubeResponse(response.url || url) || !response.ok) return response;
    const originalText = response.text.bind(response);
    const originalClone = response.clone.bind(response);
    let body;
    const read = () => body || (body = originalText().then(transform));
    response.text = read;
    response.json = () => read().then(text => JSON.parse(text));
    response.clone = () => wrapResponse(originalClone(), url);
    return response;
  }
  if (originalFetch) window.fetch = function(input, init) {
    const url = typeof input === 'string' ? input : input?.url || String(input);
    return originalFetch.call(this, input, init).then(response => wrapResponse(response, url));
  };
  const NativeXHR = window.XMLHttpRequest;
  if (NativeXHR) {
    function PatchedXHR() {
      const xhr = new NativeXHR();
      const open = xhr.open;
      const abort = xhr.abort;
      let url, asynchronous = true, generation = 0, pending = false, released = false;
      let events = [];
      xhr.open = function(method, target, async = true, ...rest) {
        generation++; url = String(target); asynchronous = async !== false;
        pending = false; released = false; events = [];
        for (const key of ['responseText', 'response']) {
          if (Object.prototype.hasOwnProperty.call(xhr, key)) delete xhr[key];
        }
        return open.call(xhr, method, target, async, ...rest);
      };
      xhr.abort = function() { generation++; events = []; pending = false; released = true; return abort.call(xhr); };
      function gate(event) {
        if (released || !asynchronous || !isYouTubeResponse(url) || xhr.readyState !== 4
          || xhr.status < 200 || xhr.status >= 300 || !['', 'text', 'json'].includes(xhr.responseType)) return;
        event.stopImmediatePropagation();
        events.push({ type: event.type, lengthComputable: event.lengthComputable,
          loaded: event.loaded, total: event.total });
        if (pending) return;
        pending = true;
        const token = generation;
        const json = xhr.responseType === 'json';
        const text = json ? rawStringify(xhr.response) : xhr.responseText;
        transform(text).then(result => {
          if (token !== generation) return;
          try {
            if (json) Object.defineProperty(xhr, 'response', { configurable: true, value: rawParse(result) });
            else {
              Object.defineProperty(xhr, 'responseText', { configurable: true, value: result });
              Object.defineProperty(xhr, 'response', { configurable: true, value: result });
            }
          } catch (error) { log('[DeArrow] XHR retained:', error.message); }
          released = true;
          const replay = events; events = [];
          for (const item of replay) {
            if (token !== generation) break;
            xhr.dispatchEvent(new window.ProgressEvent(item.type, item));
          }
        });
      }
      for (const type of ['readystatechange', 'load', 'loadend']) xhr.addEventListener(type, gate, true);
      return xhr;
    }
    PatchedXHR.prototype = NativeXHR.prototype;
    for (const key of ['UNSENT', 'OPENED', 'HEADERS_RECEIVED', 'LOADING', 'DONE']) {
      PatchedXHR[key] = NativeXHR[key];
    }
    window.XMLHttpRequest = PatchedXHR;
  }
}

export function preloadImage(window, url, timeout = 400) {
  return new Promise(resolve => {
    const image = new window.Image();
    let timer;
    const finish = ok => {
      clearTimeout(timer); image.onload = null; image.onerror = null;
      if (!ok) image.src = '';
      resolve(ok);
    };
    image.onload = () => finish(image.naturalWidth > 0);
    image.onerror = () => finish(false);
    timer = setTimeout(() => finish(false), timeout);
    image.src = url;
  });
}
