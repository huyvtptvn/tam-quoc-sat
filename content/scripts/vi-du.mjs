// ============================================================
// VÍ DỤ kỹ năng viết bằng JavaScript (nâng cao).
// Dùng khi ngôn ngữ JSON không đủ. File phải `export default { skills: [...] }`.
// Mỗi kỹ năng theo giao diện Skill trong src/hegemony/skills.ts.
//
// Kỹ năng dưới đây CHƯA gắn cho tướng nào. Muốn dùng, thêm "js_tham_muu"
// vào mảng "skills" của một tướng trong content/generals/*.json.
//
// ⚠ Script chạy với toàn quyền trên server. Chỉ quản trị viên máy chủ được thêm.
// ============================================================

export default {
  skills: [
    {
      id: 'js_tham_muu',
      name: 'Thâm Mưu',
      desc: 'Sau khi bạn chịu sát thương từ một lá bài, bạn có thể nhận lá đó; '
        + 'nếu lá đó màu đỏ, bạn bốc thêm 1 lá.',
      triggers: [
        {
          event: 'damaged',
          // ctx: { source, target, amount, nature, card }
          can: (g, ctx, owner) => ctx.target === owner && ctx.card !== null
            && g.state.processing.includes(ctx.card.id),
          run: async (g, ctx, owner) => {
            const card = ctx.card;
            await g.moveCards([card.id], { kind: 'processing' }, { kind: 'hand', seat: owner }, 'js_tham_muu');
            if (card.suit === 'heart' || card.suit === 'diamond') {
              g.say(`${g.player(owner).name} được bốc thêm 1 lá nhờ Thâm Mưu`);
              await g.draw(owner, 1, 'js_tham_muu');
            }
          },
        },
      ],
    },
  ],
};
