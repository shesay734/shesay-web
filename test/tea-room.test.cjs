const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Execute the real inline script with a minimal DOM and an offline RPC fixture.
const html = fs.readFileSync(path.join(__dirname, '../tea-room.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
async function load(search, response, ok = true) {
  const elements = new Map();
  for (const [, id] of html.matchAll(/id="([^"]+)"/g)) {
    const classes = new Set(['card', 'avatar'].includes(id) ? ['hidden'] : []);
    elements.set(id, {textContent: '', href: '#', style: {}, classList: {
      add: c => classes.add(c), remove: c => classes.delete(c),
      contains: c => classes.has(c),
    }});
  }
  const requests = [];
  vm.runInNewContext(script, {
    location: {search}, URL, URLSearchParams,
    document: {getElementById: id => elements.get(id)},
    fetch: async (url, options) => {
      requests.push({url, options});
      return {ok, json: async () => response};
    },
  });
  await new Promise(resolve => setImmediate(resolve));
  return {elements, requests};
}

test('share card exposes an encoded shesay tea-room link and RPC data', async () => {
  const {elements: e, requests} = await load('?id=room%26one', {
    name: '测试茶室', announcement: '<script>not markup</script>',
    background_image_url: 'https://example.test/bg.png',
    avatar_url: 'https://example.test/avatar.png',
  });
  assert.equal(e.get('openApp').href, 'shesay://tea-room?id=room%26one');
  assert.equal(e.get('card').classList.contains('hidden'), false);
  assert.equal(e.get('name').textContent, '测试茶室');
  assert.equal(e.get('announcement').textContent, '<script>not markup</script>');
  assert.equal(e.get('hero').style.backgroundImage, 'url("https://example.test/bg.png")');
  assert.equal(e.get('avatar').classList.contains('hidden'), false);
  assert.deepEqual(JSON.parse(requests[0].options.body), {target_room_id: 'room&one'});
});

test('missing id does not fetch or expose an inert join button', async () => {
  const {elements: e, requests} = await load('?id=');
  assert.equal(requests.length, 0);
  assert.equal(e.get('card').classList.contains('hidden'), true);
  assert.equal(e.get('status').textContent, '茶室链接无效');
});

test('missing room and failed RPC keep the card hidden with an error', async () => {
  for (const [data, ok] of [[null, true], [{}, false]]) {
    const {elements: e} = await load('?id=room', data, ok);
    assert.equal(e.get('card').classList.contains('hidden'), true);
    assert.equal(e.get('status').textContent, '茶室不存在或暂时无法加载');
  }
});

test('array RPC shape works and unsafe image URLs are not rendered', async () => {
  const {elements: e} = await load('?id=room', [{
    name: '茶室', background_image_url: 'javascript:alert(1)', avatar_url: 'data:image/png;base64,x',
  }]);
  assert.equal(e.get('openApp').href, 'shesay://tea-room?id=room');
  assert.equal(e.get('hero').style.backgroundImage, undefined);
  assert.equal(e.get('avatar').classList.contains('hidden'), true);
  assert.equal(e.get('card').classList.contains('hidden'), false);
});
