import { Persona, PersonaProfile, SceneMeta } from './types';

export const INITIAL_CHAT_MESSAGE = '我在。你可以直接问当前画面，也可以让我看看现在该做什么。';

export const PERSONA_PROFILES: PersonaProfile[] = [
  {
    id: Persona.BALANCED,
    name: '随心玩家',
    tagline: '先看懂当下，再给刚刚好的建议',
    focus: ['画面解读', '下一步建议', '低打扰提醒'],
  },
  {
    id: Persona.POWER,
    name: '进阶玩家',
    tagline: '更在意效率、搭配与战斗表现',
    focus: ['搭配判断', '队伍循环', '资源收益'],
  },
  {
    id: Persona.STORY,
    name: '剧情玩家',
    tagline: '梳理人物与线索，默认严格防剧透',
    focus: ['剧情回顾', '角色关系', '名词解读'],
  },
  {
    id: Persona.NEWBIE,
    name: '新手玩家',
    tagline: '少讲术语，一次只解决一件事',
    focus: ['下一步指引', '机制解释', '成长路线'],
  },
  {
    id: Persona.COLLECTOR,
    name: '收集玩家',
    tagline: '关注图鉴、进度与容易错过的内容',
    focus: ['收集进度', '账号资产', '遗漏提醒'],
  },
];

export const SCENE_LIST: SceneMeta[] = [
  { id: 'gear', name: '装备搭配', hint: '看词条、适配与提升空间' },
  { id: 'roster', name: '队伍配置', hint: '看阵容、循环与风险' },
  { id: 'story', name: '剧情回顾', hint: '梳理线索并避免剧透' },
  { id: 'explore', name: '探索指引', hint: '识别目标与路线信息' },
];
