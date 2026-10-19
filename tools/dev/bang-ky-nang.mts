// Sinh content/import/KY-NANG-TUONG-MOI.md từ nội dung đã nạp.
import { readFileSync, writeFileSync } from 'node:fs';
import { loadContent } from '../../src/content/loader.ts';
import { SKILLS } from '../../src/hegemony/skills.ts';

const root = new URL('../../', import.meta.url).pathname;
await loadContent(root + 'content');
const list = JSON.parse(readFileSync(root + 'content/generals/goi-tuong-moi.json', 'utf8')).filter((g: any) => g.id);
const KL: Record<string, string> = { wei: 'Ngụy', shu: 'Thục', wu: 'Ngô', qun: 'Quần' };
const out = ['# Kỹ năng các tướng mới (gói tham khảo)', '',
  'Sinh tự động từ `content/generals/goi-tuong-moi.json` và `content/scripts/goi-*.mjs`. Ghi chú trong mô tả:',
  '- **(Phỏng theo bản Quốc Chiến)**: không có văn bản gốc trong nguồn mở, cài theo trí nhớ — nên đối chiếu lại.',
  '- **(Bỏ phần ...)** / **đơn giản hóa**: phần luật engine chưa hỗ trợ được lược bỏ.', ''];
for (const k of ['wei', 'shu', 'wu', 'qun']) {
  out.push(`## ${KL[k]}`, '');
  for (const g of list.filter((x: any) => x.kingdom === k)) {
    out.push(`### ${g.name} — ${g.disabled ? 'đang tắt' : 'đã bật'} (${g.halfHp} âm dương ngư)`);
    if (g.disabled) out.push('', `> ${g._lyDo ?? 'Chưa cài kỹ năng.'}`);
    out.push('');
    for (const s of g.skills) out.push(`- **${SKILLS[s]?.name ?? s}** (\`${s}\`): ${SKILLS[s]?.desc ?? '(thiếu)'}`);
    if (!g.skills.length) out.push(`- Kỹ năng gốc: ${g._kyNangGoc}`);
    out.push('');
  }
}
writeFileSync(root + 'content/import/KY-NANG-TUONG-MOI.md', out.join('\n'));
console.log('ok', list.length);
