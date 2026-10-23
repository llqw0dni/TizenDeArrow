import test from 'node:test';
import assert from 'node:assert/strict';
import { createBrandingClient, createResponseProcessor, collectVideoSlots, selectBranding,
  thumbnailURL, isYouTubeResponse } from '../tizentube/mods/features/dearrow.js';
import sha256 from '../tizentube/mods/tiny-sha256.js';
const A = 'dQw4w9WgXcQ', B = 'aqz-KE-bpKQ';
const branding = (title = 'Community title', timestamp = 0) => ({
  titles: [{ title, votes: 1, original: false }],
  thumbnails: [{ timestamp, votes: 1, original: false }]
});
function tile(id = A) { return { tileRenderer: { contentId: id, onSelectCommand: { watchEndpoint: { videoId: id } },
  metadata: { tileMetadataRenderer: { title: { simpleText: 'Original' } } },
  header: { tileHeaderRenderer: { thumbnail: { thumbnails: [{ url: 'original.jpg' }] } } } } }; }
function lockup(id = A) { return { lockupViewModel: { contentId: id, contentType: 'LOCKUP_CONTENT_TYPE_VIDEO',
  metadata: { lockupMetadataViewModel: { title: { content: 'Original' } } },
  contentImage: { thumbnailViewModel: { image: { sources: [{ url: 'original.jpg' }] } } } } }; }
const settings = { enabled: true, titles: true, thumbnails: true };
function processor(opts = {}) {
  return createResponseProcessor({ client: { get: async () => selectBranding(branding()) },
    readSettings: () => settings, loadImage: async () => true, ...opts });
}
const ok = data => ({ ok: true, status: 200, json: async () => data });
const sleep = ms => new Promise(r => setTimeout(r, ms));

test('regression: old guard always skips tile and lockup', () => {
  for (const item of [tile(), lockup()]) assert.equal(!item?.lockupViewModel?.contentType !== 'LOCKUP_CONTENT_TYPE_VIDEO', true);
});
test('server order wins over highest vote', () => {
  assert.equal(selectBranding({ titles: [{ title: 'Locked', votes: 0, locked: true }, { title: 'Other', votes: 99 }] }).title, 'Locked');
});
test('original winner is respected; do not choose second entry', () => {
  assert.equal(selectBranding({ titles: [{ title: 'Original', votes: 3, original: true }, { title: 'Other', votes: 2 }] }).title, null);
});
test('negative votes rejected unless locked', () => {
  assert.equal(selectBranding({ titles: [{ title: 'Bad', votes: -1 }] }).title, null);
  assert.equal(selectBranding({ titles: [{ title: 'Locked', votes: -1, locked: true }] }).title, 'Locked');
});
test('zero timestamp accepted', () => assert.equal(selectBranding(branding()).timestamp, 0));
test('invalid timestamps rejected', () => {
  for (const timestamp of [undefined, null, -1, NaN, Infinity, '2']) {
    const data = branding(); data.thumbnails[0].timestamp = timestamp;
    assert.equal(selectBranding(data).timestamp, null);
  }
});
test('empty response and malformed lists are safe', () => {
  for (const data of [null, {}, { titles: {}, thumbnails: [] }]) assert.deepEqual(selectBranding(data), { title: null, timestamp: null });
});
for (const [name, create] of [['tile', tile], ['lockup', lockup]]) {
  test(`${name}: title and verified image applied`, async () => {
    const root = create(); await processor()(root); const slot = collectVideoSlots(root)[0];
    assert.equal(slot.title[slot.titleKey], 'Community title');
    assert.equal(slot.image[slot.imageKey][0].url, thumbnailURL(A, 0));
    assert.equal(slot.image[slot.imageKey][0].height, 720);
  });
  test(`${name}: missing submissions retain original`, async () => {
    const root = create(), original = structuredClone(root);
    await processor({ client: { get: async () => selectBranding({}) } })(root); assert.deepEqual(root, original);
  });
}
test('image failures retain original while title is replaced', async () => {
  const root = tile(); await processor({ loadImage: async () => false })(root);
  const slot = collectVideoSlots(root)[0]; assert.equal(slot.title.simpleText, 'Community title'); assert.equal(slot.image.thumbnails[0].url, 'original.jpg');
});
test('master off makes no requests', async () => {
  const root = tile(); await processor({ readSettings: () => ({...settings, enabled: false}), client: { get() { throw Error('must not call'); } } })(root);
  assert.equal(collectVideoSlots(root)[0].title.simpleText, 'Original');
});
test('titles and thumbnails independently controlled', async () => {
  for (const titles of [false, true]) for (const thumbnails of [false, true]) {
    const root = tile(); await processor({ readSettings: () => ({ enabled: true, titles, thumbnails }) })(root);
    const slot = collectVideoSlots(root)[0]; assert.equal(slot.title.simpleText, titles ? 'Community title' : 'Original');
    assert.equal(slot.image.thumbnails[0].url, thumbnails ? thumbnailURL(A, 0) : 'original.jpg');
  }
});
test('settings disabled during response stop application', async () => {
  let enabled = true; const root = tile();
  const process = processor({ readSettings: () => ({ ...settings, enabled }), client: { get: async () => { enabled = false; return selectBranding(branding()); } } });
  await process(root); assert.equal(collectVideoSlots(root)[0].title.simpleText, 'Original');
});
test('late results never mutate delivered models', async () => {
  let release; const root = tile(), original = structuredClone(root);
  await processor({ budget: 5, client: { get: () => new Promise(r => { release = r; }) } })(root);
  release(selectBranding(branding())); await sleep(10); assert.deepEqual(root, original);
});
test('partial deadline retains completed replacements', async () => {
  const root = [tile(A), tile(B)];
  await processor({ budget: 10, client: { get: id => id === A ? Promise.resolve(selectBranding(branding())) : new Promise(() => {}) } })(root);
  const slots = collectVideoSlots(root); assert.equal(slots.find(s => s.id === A).title.simpleText, 'Community title');
  assert.equal(slots.find(s => s.id === B).title.simpleText, 'Original');
});
test('video endpoint and content ID disagreement rejected', () => {
  const root = tile(); root.tileRenderer.onSelectCommand.watchEndpoint.videoId = B;
  assert.equal(collectVideoSlots(root).length, 0);
});
test('non-video lockups and arbitrary metadata ignored', () => {
  const root = lockup(); root.lockupViewModel.contentType = 'LOCKUP_CONTENT_TYPE_PLAYLIST';
  assert.equal(collectVideoSlots([root, { contentId: A, title: 'Channel' }]).length, 0);
});
test('recursive home/search/subscriptions/related/continuation traversal', async () => {
  for (const key of ['contents', 'gridRenderer', 'continuationContents', 'singleColumnWatchNextResults', 'searchResults']) {
    const root = { [key]: { items: [tile(), lockup(B)] } }; await processor()(root);
    for (const slot of collectVideoSlots(root)) assert.equal(slot.title[slot.titleKey], 'Community title');
  }
});
test('runs titles and playback videoDetails supported', async () => {
  const root = [{ videoRenderer: { videoId: A, title: { runs: [{ text: 'Old', bold: true }] } } }, { videoDetails: { videoId: B, title: 'Old' } }];
  await processor()(root); assert.deepEqual(root[0].videoRenderer.title.runs, [{ text: 'Community title' }]); assert.equal(root[1].videoDetails.title, 'Community title');
});
test('cache, concurrent deduplication and prefix batching', async () => {
  let calls = 0;
  const client = createBrandingClient({ fetch: async url => { calls++; assert.ok(url.includes(sha256(A).slice(0,4))); await sleep(5); return ok({ [A]: branding() }); } });
  const result = await Promise.all(Array.from({ length: 20 }, () => client.get(A)));
  await client.get(A); assert.equal(calls, 1); assert.equal(result[0].title, 'Community title');
});
test('negative cache and expiry', async () => {
  let clock = 0, calls = 0;
  const client = createBrandingClient({ now: () => clock, fetch: async () => { calls++; return ok({}); } });
  await client.get(A); await client.get(A); assert.equal(calls,1); clock = 60001; await client.get(A); assert.equal(calls,2);
});
test('successful cache expiry and clear', async () => {
  let clock=0,calls=0; const client = createBrandingClient({ now: () => clock, fetch: async () => { calls++; return ok({ [A]: branding() }); } });
  await client.get(A); clock=600001; await client.get(A); client.clear(); await client.get(A); assert.equal(calls,3);
});
test('HTTP error and malformed JSON preserve originals', async () => {
  for (const response of [{ status:503, ok:false }, { status:200, ok:true, json:async () => { throw Error('bad JSON'); } }]) {
    const client=createBrandingClient({ fetch:async () => response }); assert.deepEqual(await client.get(A), {title:null,timestamp:null});
  }
});
test('request timeout releases concurrency slot', async () => {
  const client=createBrandingClient({ timeout:5, fetch: () => new Promise(() => {}) });
  assert.deepEqual(await client.get(A), {title:null,timestamp:null}); await sleep(1); assert.equal(client.stats().active,0);
});
test('body timeout is bounded', async () => {
  const client=createBrandingClient({ timeout:5, fetch: async () => ({ ok:true,status:200,json:()=>new Promise(()=>{}) }) });
  assert.equal((await client.get(A)).title,null);
});
test('rate limit backs off other IDs', async () => {
  let calls=0; const client=createBrandingClient({ fetch:async () => { calls++;return {status:429,ok:false,headers:{get:()=> '120'}}; } });
  await client.get(A); await client.get(B); assert.equal(calls,1);
});
test('concurrency and cache size bounded', async () => {
  let active=0,peak=0;
  const client=createBrandingClient({ maxEntries:2,concurrency:2,fetch:async () => { active++;peak=Math.max(peak,active); await sleep(3); active--;return ok({}); } });
  await Promise.all([A,B,'jNQXAC9IVRw','M7lc1UVf-VE'].map(id=>client.get(id)));
  assert.ok(peak<=2); assert.equal(client.stats().cached,2);
});
test('images deduplicated for repeated video cards', async () => {
  let calls=0; const process=processor({ loadImage:async ()=> {calls++;return true;} }); await process([tile(),lockup()]); assert.equal(calls,1);
});
test('YouTube endpoint allowlist excludes media, login and third parties', () => {
  for (const url of ['https://www.youtube.com/youtubei/v1/browse','/youtubei/v1/search?key=x']) assert.equal(isYouTubeResponse(url),true);
  for (const url of ['https://evil.com/youtubei/v1/browse','https://youtube.com.evil.com/youtubei/v1/player','https://sponsor.ajay.app/api/branding','https://accounts.google.com/login','https://www.youtube.com/videoplayback']) assert.equal(isYouTubeResponse(url),false);
});
