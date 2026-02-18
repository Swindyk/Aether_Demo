import { GameContext, Persona, PersonaProfile, FeatureItem, DemoStep, DemoSample, SceneMeta, SceneId } from './types';

export const SCENE_IMAGE: Record<SceneId, string> = {
  gear: '/demo/genshin-weapon.png',
  roster: '/demo/genshin-roster.png',
  story: '/demo/hsr-story.png',
  explore: '/demo/hsr-explore.png',
};

export const MOCK_GAME_CONTEXT: GameContext = {
  name: '原神',
  character: '基尼奇',
  party: ['基尼奇', '芙宁娜', '希诺宁', '枫原万叶'],
  level: 90,
  currentActivity: '深境螺旋：第12层-路径分岔',
};

export const INITIAL_CHAT_MESSAGE = `以太系统已上线。检测到游戏：${MOCK_GAME_CONTEXT.name}。识别队伍：${MOCK_GAME_CONTEXT.party.join(' / ')}。需要我先给你一套深渊配队建议吗？`;

export const PERSONA_PROFILES: PersonaProfile[] = [
  {
    id: Persona.POWER,
    name: '强度党',
    tagline: '追求效率与数值最优解',
    focus: ['装备评分', '体力收益', '队伍排轴'],
  },
  {
    id: Persona.STORY,
    name: '剧情党',
    tagline: '沉浸体验，防剧透',
    focus: ['剧情唤醒', '机制简析', '角色关系'],
  },
  {
    id: Persona.NEWBIE,
    name: '萌新',
    tagline: '降低门槛，清晰指引',
    focus: ['每日清单', '名词解读', '成长路线'],
  },
  {
    id: Persona.COLLECTOR,
    name: '氪金大佬',
    tagline: '资产可视化与展示',
    focus: ['账号资产', '抽卡报告', '收藏进度'],
  },
];

export const P0_FEATURES: FeatureItem[] = [
  {
    title: '装备评分与保留建议',
    description: '悬停识别词条，告诉你是保留、锁定还是替换。',
    tag: '立即可用',
  },
  {
    title: '配队与阵容提醒',
    description: '识别角色界面，给出上下半场推荐与补位建议。',
    tag: '立即可用',
  },
  {
    title: '剧情唤醒（防剧透）',
    description: '只提示已发生剧情，避免被动剧透。',
    tag: '立即可用',
  },
  {
    title: '探索目标提示',
    description: '同步未完成目标，给出下一步路线。',
    tag: '立即可用',
  },
  {
    title: '每日行动清单',
    description: '按画像生成今日优先事项。',
    tag: '基础功能',
  },
  {
    title: '账号资产仪表盘',
    description: '资源概览、抽卡趋势与进度一屏查看。',
    tag: '基础功能',
  },
  {
    title: '文字识别导入',
    description: '不抓包，安全导入角色与装备数据。',
    tag: '基础功能',
  },
];

export const DEMO_STEPS: DemoStep[] = [
  {
    title: '选择场景',
    description: '切换装备、配队、剧情、探索四种场景。',
  },
  {
    title: '查看反馈',
    description: '每个场景都有不同的反馈样式与建议。',
  },
  {
    title: '打开仪表盘',
    description: '查看账号资产与抽卡趋势。',
  },
];

export const DEMO_SAMPLES: DemoSample[] = [
  {
    title: '装备界面反馈',
    description: '评分、关键词条、保留建议一目了然。',
    image: '/demo/genshin-weapon.png',
    tag: '原神',
  },
  {
    title: '配队界面反馈',
    description: '阵容推荐与补位建议同步给出。',
    image: '/demo/genshin-roster.png',
    tag: '原神',
  },
  {
    title: '剧情界面反馈',
    description: '仅回顾已发生内容，保证不剧透。',
    image: '/demo/hsr-story.png',
    tag: '星铁',
  },
  {
    title: '探索界面反馈',
    description: '目标距离、路径建议与任务清单。',
    image: '/demo/hsr-explore.png',
    tag: '星铁',
  },
];

export const SCENE_LIST: SceneMeta[] = [
  { id: 'gear', name: '装备界面', hint: '评分与保留建议' },
  { id: 'roster', name: '配队界面', hint: '上下半场推荐' },
  { id: 'story', name: '剧情界面', hint: '防剧透回顾' },
  { id: 'explore', name: '探索界面', hint: '目标与路线' },
];

export const GEAR_FEEDBACK = {
  title: '识别到武器界面',
  score: 92,
  grade: 'A+',
  mainStat: '攻击力%',
  mainValue: '46.6%',
  highlight: ['暴击伤害 +18.7%', '暴击率 +7.4%', '元素充能效率 +6.5%'],
  fit: '推荐角色：基尼奇 / 芙宁娜',
  actions: ['建议保留并锁定', '可尝试精炼与强化'],
};

export const ROSTER_FEEDBACK = {
  title: '识别到深境配队界面',
  score: 88,
  topTeam: ['基尼奇', '芙宁娜', '希诺宁', '枫原万叶'],
  bottomTeam: ['那维莱特', '夜兰', '莱依拉', '香菱'],
  buffs: ['上半：重击伤害提升', '下半：月曜反应提升'],
  gaps: ['下半缺少治疗位', '上半缺聚怪手段'],
  actions: ['考虑替换一名副C为治疗/护盾', '保持水草联动循环'],
};

export const STORY_FEEDBACK = {
  title: '识别到剧情界面',
  safe: '防剧透模式已开启',
  recap: '你已完成“战意机制”引导，本阶段需要累积战意值进入爆发态。',
  keywords: ['战意值', '战意澎湃', '虚构叙事·其四'],
  next: '下一步：与指挥官对话确认阵容。',
};

export const EXPLORE_FEEDBACK = {
  title: '识别到探索界面',
  target: '下一目标 34 米',
  route: ['向北偏东前进', '绕开高能区', '接近任务标记'],
  markers: ['未完成宝箱 x2', '未解谜点 x1', '已完成观测点 x3'],
  actions: ['优先完成未解谜点', '完成后回收宝箱'],
};

export const MOCK_DAILY_TASKS: Record<Persona, string[]> = {
  [Persona.POWER]: ['体力优先：周本素材', '刷新圣遗物本 3 次', '深境螺旋上半阵容微调'],
  [Persona.STORY]: ['完成当前主线剧情', '补看角色小传', '完成场景探索任务'],
  [Persona.NEWBIE]: ['升级主力角色到 70 级', '强化关键武器', '完成委托与周本'],
  [Persona.COLLECTOR]: ['补齐角色图鉴缺失项', '整理抽卡记录', '导出账号资产报告'],
};

export const MOCK_ACCOUNT = {
  uid: '800123456',
  level: 60,
  characters: 52,
  weapons: 210,
  artifacts: 1420,
  primogems: 14200,
  pity: 63,
};

export const MOCK_GACHA_TREND = [
  { name: '10抽', value: 1 },
  { name: '20抽', value: 0 },
  { name: '30抽', value: 1 },
  { name: '40抽', value: 0 },
  { name: '50抽', value: 1 },
  { name: '60抽', value: 0 },
  { name: '70抽', value: 1 },
];

export const MOCK_ASSET_GROWTH = [
  { name: '周一', value: 120 },
  { name: '周二', value: 138 },
  { name: '周三', value: 150 },
  { name: '周四', value: 141 },
  { name: '周五', value: 165 },
  { name: '周六', value: 172 },
  { name: '周日', value: 190 },
];


