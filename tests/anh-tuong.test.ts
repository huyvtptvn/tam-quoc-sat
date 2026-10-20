// Ảnh tướng: cho phép chia thư mục con theo phe (generals/nguy/caoang.png), chặn đường dẫn lạ.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ImageStore } from '../src/server/images.js';

const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');

test('ảnh tướng trong thư mục con theo phe được nhận; ảnh ở thư mục gốc được ưu tiên', () => {
  const root = mkdtempSync(join(tmpdir(), 'tqs-img-'));
  mkdirSync(join(root, 'generals', 'nguy'), { recursive: true });
  mkdirSync(join(root, 'generals', 'thuc'), { recursive: true });
  writeFileSync(join(root, 'generals', 'nguy', 'caoang.png'), png);
  writeFileSync(join(root, 'generals', 'thuc', 'liaohua.png'), png);
  writeFileSync(join(root, 'generals', 'liaohua.png'), png);
  writeFileSync(join(root, 'generals', 'nguy', 'README.txt'), 'x');
  const store = new ImageStore(root);
  const idx = store.index().generals;
  assert.match(idx.caoang, /^\/images\/generals\/nguy\/caoang\.png\?v=/);
  assert.match(idx.liaohua, /^\/images\/generals\/liaohua\.png\?v=/);
  assert.equal(Object.keys(idx).length, 2);
  assert.ok(store.resolve('generals', 'caoang.png', 'nguy'));
  assert.equal(store.resolve('generals', 'caoang.png', '..'), null);
  assert.equal(store.resolve('generals', 'caoang.png', 'Nguy/../x'), null);
  assert.equal(store.resolve('generals', 'README.txt', 'nguy'), null);
});
