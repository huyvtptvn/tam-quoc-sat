// Skin tướng: đọc thư mục hero-skin của QSanguosha, đổi id tướng/kỹ năng sang id trong game, chặn đường dẫn lạ.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadContent } from '../src/content/loader.js';
import { SkinStore } from '../src/server/skins.js';

let root: string;
let store: SkinStore;

before(async () => {
  await loadContent('content');
  root = mkdtempSync(join(tmpdir(), 'tqs-skin-'));
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
  const mk = (rel: string, data: Buffer | string = png) => {
    const f = join(root, rel);
    mkdirSync(join(f, '..'), { recursive: true });
    writeFileSync(f, data);
  };
  mk('caocao/1/full.png'); mk('caocao/1/jianxiong1.ogg', 'x'); mk('caocao/1/jianxiong2.ogg', 'x'); mk('caocao/1/death.ogg', 'x');
  mk('caocao/2/full.png'); mk('caocao/2/zh_CN.lua', 'sgs.LoadSkinTransltionTable {\n ["#caocao"] = "名将传",\n}');
  mk('caocao/2/foo.lnk', 'x');
  mk('pangtong/1/full.png'); mk('pangtong/1/lianhuan1.ogg', 'x');
  mk('khongco/1/full.png');
  store = new SkinStore(root, 'content/import/qsgs-viet.json');
});

test('Đọc skin: ảnh, tên skin từ zh_CN.lua, lồng tiếng theo id kỹ năng trong game, câu tử trận', () => {
  const idx = store.index();
  assert.equal(idx.caocao.length, 2);
  const [s1, s2] = idx.caocao;
  assert.equal(s1.image, '/skins/caocao/1/full.png');
  assert.equal(s1.death, '/skins/caocao/1/death.ogg');
  const voiceSkills = Object.keys(s1.voices);
  assert.equal(voiceSkills.length, 1, 'jianxiong được đổi sang id Gian Hùng trong game');
  assert.equal(s1.voices[voiceSkills[0]].length, 2);
  assert.equal(s2.name, '名将传');
  assert.equal(s1.name, 'Skin 1');
});

test('Id tướng QSGS khác id trong game được đổi theo qsgs-viet.json (pangtong -> pang_tong); thư mục lạ bị bỏ qua', () => {
  const idx = store.index();
  assert.ok(idx.pang_tong?.length, 'Bàng Thống');
  assert.ok(Object.keys(idx.pang_tong[0].voices).includes('lianhuan'));
  assert.equal(idx.khongco, undefined);
});

test('Chỉ phục vụ ảnh/âm thanh trong thư mục skin, chặn đường dẫn ra ngoài và file lạ', () => {
  assert.ok(store.resolve('caocao/1/full.png'));
  assert.equal(store.resolve('../package.json'), null);
  assert.equal(store.resolve('caocao/../../x.png'), null);
  assert.equal(store.resolve('caocao/2/zh_CN.lua'), null);
  assert.equal(store.resolve('caocao/2/foo.lnk'), null);
  assert.equal(store.resolve('caocao/9/full.png'), null);
});
