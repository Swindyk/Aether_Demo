const DEFAULT_REPLY =
  '当前为演示模式。给出基础建议：先手挂水/挂火触发反应，再上增益，最后主C爆发。需要我细化到技能顺序吗？';

const RULES: Array<{ pattern: RegExp; reply: string }> = [
  {
    pattern: /配队|阵容|上半|下半|队伍/,
    reply: '推荐上半偏破盾/群攻，下半偏单体爆发与续航；先手辅助套盾/减抗后再进爆发轴。',
  },
  {
    pattern: /装备|圣遗物|词条|武器|套装/,
    reply: '优先主词条匹配核心属性，副词条拉双爆或关键充能；不达标的先留作过渡。',
  },
  {
    pattern: /剧情|剧透|回顾/,
    reply: '可提供不含剧透的要点回顾与下一步提示，需要的话告诉我你停在第几章。',
  },
  {
    pattern: /探索|路线|目标|地图/,
    reply: '建议先清主线方向的高价值目标，再沿最近路线回收遗漏点位。',
  },
];

export const generateGameAdvice = async (query: string, _context: string): Promise<string> => {
  const normalized = query.trim();
  if (!normalized) return DEFAULT_REPLY;

  const matched = RULES.find(rule => rule.pattern.test(normalized));
  return matched?.reply ?? DEFAULT_REPLY;
};

export const analyzeScreenContext = async (): Promise<string> => {
  try {
    await new Promise(resolve => setTimeout(resolve, 1500));
    return '视觉扫描完成：识别队伍与敌人信息，建议先手触发增益后再进入爆发循环。';
  } catch {
    return '视觉传感器离线。';
  }
};
