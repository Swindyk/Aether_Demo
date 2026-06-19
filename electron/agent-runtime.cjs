const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { loadKnowledgeFile, classifyWebNeed } = require('./knowledge-service.cjs');

const PERSONA_NAMES = {
  BALANCED: '随心玩家',
  POWER: '进阶玩家',
  STORY: '剧情玩家',
  NEWBIE: '新手玩家',
  COLLECTOR: '收集玩家',
};

const PERSONA_GUIDANCE = {
  BALANCED: '先判断玩家当下最需要什么，只给一条核心结论和最多两条行动，不偏向强度、剧情或收集。',
  POWER: '优先判断搭配效率、数值收益、队伍循环与风险。给出结论和取舍，不要堆砌基础科普。',
  STORY: '优先梳理当前画面中的人物、线索和已知关系。严格防剧透，不主动提及当前画面之后的内容。',
  NEWBIE: '使用日常中文解释术语，一次只推进一件事。先告诉玩家现在做什么，再解释为什么。',
  COLLECTOR: '优先关注图鉴、收集进度、容易错过的内容和账号资产。除非用户主动询问，不要把战斗强度作为中心。',
};

const SKILL_DEFINITIONS = [
  { id: 'observe.capture_source', phase: 'observe', displayName: '画面来源', intent: '确认本轮输入来自截图、复用观察或纯文本追问' },
  { id: 'observe.visual_context', phase: 'observe', displayName: '视觉提取特征', intent: '提取画面场景、可见事实和可读文字' },
  { id: 'context.conversation_memory', phase: 'context', displayName: '会话上下文', intent: '读取当前会话消息、上一轮观察和历史知识命中' },
  { id: 'context.profile_memory', phase: 'context', displayName: '玩家画像', intent: '读取并更新当前 UID 与回答偏好的 memory' },
  { id: 'context.public_account', phase: 'context', displayName: '公开账号', intent: '读取玩家主动连接的公开 UID 与角色状态' },
  { id: 'knowledge.hybrid_rag', phase: 'knowledge', displayName: '混合知识检索', intent: '检索本地 SQLite、别名规则和精选攻略知识卡' },
  { id: 'knowledge.web_guides', phase: 'knowledge', displayName: '联网攻略兜底', intent: '本地知识不足时检索精选源和开放 web 攻略' },
  { id: 'knowledge.source_filter', phase: 'knowledge', displayName: '来源过滤', intent: '过滤 prompt、广告、搜索页和低正文量污染来源' },
  { id: 'reason.model_call', phase: 'reason', displayName: '模型推理', intent: '调用实际模型融合视觉、账号、知识和会话上下文' },
  { id: 'answer.player_brief', phase: 'answer', displayName: '玩家短答案', intent: '压缩为玩家可直接执行的低打扰回答' },
  { id: 'guard.safety_rules', phase: 'guard', displayName: '边界规则', intent: '执行防剧透、自动化边界、中文输出和本地优先规则' },
];

const ensureDir = directory => fs.mkdirSync(directory, { recursive: true });
const readJson = (file, fallback) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
};
const writeJson = (file, value) => {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
};
const nowId = prefix => `${prefix}-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
const hashValue = value => crypto.createHash('sha256').update(value || '').digest('hex');
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const compact = (value, limit = 120) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit);
const DEFAULT_ACCOUNT_KEY = 'local:default';
const normalizeAccountKey = value => compact(value || DEFAULT_ACCOUNT_KEY, 80).replace(/[^\w:.-]+/g, '_') || DEFAULT_ACCOUNT_KEY;
const accountKeyFileStem = value => normalizeAccountKey(value).replace(/[:]+/g, '_');
const POLLUTED_RUNTIME_PATTERN = /基尼奇|撼地者|Kinich|Earthshaker/i;
const isPollutedRuntimeValue = value => POLLUTED_RUNTIME_PATTERN.test(JSON.stringify(value || ''));
const normalizeTraditionalText = value => String(value || '')
  .replace(/崩壞/g, '崩坏')
  .replace(/鐵/g, '铁')
  .replace(/鐡/g, '铁')
  .replace(/藥/g, '药')
  .replace(/戰/g, '战')
  .replace(/鬥/g, '斗')
  .replace(/等級/g, '等级')
  .replace(/寶箱/g, '宝箱')
  .replace(/星鐵/g, '星铁')
  .replace(/開拓/g, '开拓')
  .replace(/遺器/g, '遗器')
  .replace(/劇情/g, '剧情')
  .replace(/任務/g, '任务')
  .replace(/戰利品/g, '战利品');
const gameKeyFromText = value => {
  const text = normalizeTraditionalText(value);
  if (/原神|genshin/i.test(text)) return 'genshin';
  if (/崩坏|星穹铁道|星铁|star\s*rail|hsr|honkai|第三次元|混沌药箱|幻造生物/i.test(text)) return 'starrail';
  if (/圣遗物|双爆|夜魂|纳塔|元素反应|原石|螺旋|深渊/i.test(text)) return 'genshin';
  if (/遗器|光锥|开拓|混沌回忆|忘却之庭|虚构叙事|末日幻影|模拟宇宙/i.test(text)) return 'starrail';
  return '';
};
const gameLabelFromKey = key => key === 'genshin' ? '原神' : key === 'starrail' ? '崩坏：星穹铁道' : '';
const observationText = (input = {}, observation = {}) => normalizeTraditionalText([
  input.query,
  input.sourceName,
  observation.game,
  observation.app,
  observation.scene,
  observation.summary,
  ...(Array.isArray(observation.facts) ? observation.facts : []),
  ...(Array.isArray(observation.ocrText) ? observation.ocrText : []),
].filter(Boolean).join(' '));
const inferGameKeyFromObservation = (input = {}, observation = {}) => (
  gameKeyFromText(observationText(input, observation))
);
const inferSceneFromText = value => {
  const text = normalizeTraditionalText(value);
  if (/探索|地图|路线|宝箱|混沌药箱|战利品|第三次元|幻造生物|目标进度|0\/\d|解谜|收集/i.test(text)) return 'explore';
  if (/圣遗物|武器|遗器|光锥|词条|装备|面板|build/i.test(text)) return 'gear';
  if (/配队|阵容|队伍|忘却之庭|混沌回忆|虚构叙事|末日幻影|模拟宇宙/i.test(text)) return 'roster';
  if (/剧情|任务|对话|开拓任务|同行任务|NPC|防剧透/i.test(text)) return 'story';
  return 'unknown';
};
const skipSkillReason = (skillId, context = {}) => {
  if (skillId === 'observe.visual_context') return '本轮没有新截图，也没有复用上一轮观察';
  if (skillId === 'context.conversation_memory') return '本轮不是历史会话追问';
  if (skillId === 'context.public_account') return context.gameContext ? '当前问题不需要公开账号状态' : '当前不是游戏场景';
  if (skillId === 'knowledge.hybrid_rag') return context.gameContext ? '当前问题不需要游戏知识检索' : '当前不是游戏场景';
  if (skillId === 'knowledge.web_guides') return context.webSearchRequired
    ? '用户当前意图为联网检索/最新机制'
    : (context.gameContext ? '即时/后台模式不触发联网攻略' : '当前不是游戏场景');
  if (skillId === 'knowledge.source_filter') return context.gameContext ? '本轮没有联网或缓存来源需要过滤' : '当前不是游戏场景';
  return '本轮无需触发';
};
const stringifyApiPayload = value => JSON.stringify(value).replace(/[\u007f-\uffff]/g, character => (
  `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`
));

const DEFAULT_LOCAL_BASE_URL = 'https://api-inference.modelscope.cn/v1';
const normalizeVisionPipeline = value => {
  const v = String(value || '').trim().toLowerCase();
  if (v === 'single' || v === 'unified') return 'unified';
  if (v === 'legacy' || v === 'twopass') return 'legacy';
  return 'auto';
};
const normalizeApiWire = value => /responses?/i.test(String(value || '')) ? 'responses' : 'chat';
const resolveApiEndpoint = (baseUrl, apiWire) => {
  const wire = normalizeApiWire(apiWire);
  const raw = String(baseUrl || DEFAULT_LOCAL_BASE_URL).trim().replace(/\/+$/, '');
  if (/\/chat\/completions$/i.test(raw) || /\/responses$/i.test(raw)) return raw;
  if (/\/(?:openai\/)?v1$/i.test(raw)) {
    return `${raw}/${wire === 'responses' ? 'responses' : 'chat/completions'}`;
  }
  return `${raw}/v1/${wire === 'responses' ? 'responses' : 'chat/completions'}`;
};

const contentToText = content => {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map(part => {
      if (!part || typeof part !== 'object') return '';
      return part.text || part.output_text || '';
    }).filter(Boolean).join('\n');
  }
  return String(content || '');
};

const contentToResponsesInput = content => {
  if (typeof content === 'string') return [{ type: 'input_text', text: content }];
  if (!Array.isArray(content)) return [{ type: 'input_text', text: String(content || '') }];
  return content.map(part => {
    if (!part || typeof part !== 'object') return undefined;
    if (part.type === 'image_url') {
      const imageUrl = part.image_url?.url || part.url || '';
      return imageUrl ? { type: 'input_image', image_url: imageUrl } : undefined;
    }
    return { type: 'input_text', text: String(part.text || part.output_text || '') };
  }).filter(item => item && (item.text || item.image_url));
};

const buildResponsesPayload = (model, messages, maxTokens) => {
  const instructions = messages
    .filter(message => message.role === 'system')
    .map(message => contentToText(message.content))
    .filter(Boolean)
    .join('\n\n');
  const input = messages
    .filter(message => message.role !== 'system')
    .map(message => ({
      role: message.role === 'assistant' ? 'assistant' : 'user',
      content: contentToResponsesInput(message.content),
    }))
    .filter(message => message.content.length);
  return {
    model,
    ...(instructions ? { instructions } : {}),
    input: input.length ? input : [{ role: 'user', content: [{ type: 'input_text', text: '' }] }],
    max_output_tokens: maxTokens,
  };
};

const extractApiText = payload => {
  const chatContent = payload?.choices?.[0]?.message?.content;
  const chatText = contentToText(chatContent);
  if (chatText) return stripModelReasoning(chatText);
  if (typeof payload?.output_text === 'string' && payload.output_text.trim()) return stripModelReasoning(payload.output_text);
  if (Array.isArray(payload?.output)) {
    const text = payload.output.flatMap(item => Array.isArray(item.content) ? item.content : [])
      .map(part => part.text || part.output_text || part.content || '')
      .filter(Boolean)
      .join('\n');
    if (text.trim()) return stripModelReasoning(text);
  }
  const messageText = contentToText(payload?.message?.content);
  return stripModelReasoning(messageText || '');
};

const stripModelReasoning = text => String(text || '')
  .replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, '')
  .replace(/<thinking\b[^>]*>[\s\S]*?<\/thinking>/gi, '')
  .trim();

const stripCodeFence = text => String(text || '').replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

const extractBalancedJson = text => {
  const start = text.indexOf('{');
  if (start < 0) return '';
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const character = text[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }
    if (character === '"') {
      inString = true;
    } else if (character === '{') {
      depth += 1;
    } else if (character === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }
  const end = text.lastIndexOf('}');
  return end > start ? text.slice(start, end + 1) : text.slice(start);
};

const repairJsonText = text => text
  .replace(/,\s*([}\]])/g, '$1')
  .replace(/([\]"'}0-9]|true|false|null)\s+("[-\w\u3400-\u9fff]+"\s*:)/g, '$1,$2')
  .replace(/}\s*{/g, '},{');

const tryParseJson = text => {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};

const classifyHttpError = (status, raw = '') => {
  const detail = compact(raw, 220);
  if (status === 401 || status === 403) return `模型服务鉴权失败，请检查本地 API key。${detail}`;
  if (status === 429) return `模型服务当前限流，请稍后再试。${detail}`;
  if (status >= 500) return `模型服务暂时不可用 ${status}，本轮会尝试重试或回放缓存。${detail}`;
  return `模型服务请求失败 ${status}：${detail}`;
};

const validateModelShape = value => {
  if (!value || typeof value !== 'object') throw new Error('模型结果不是对象');
  if (!value.answer || typeof value.answer !== 'string') throw new Error('模型结果缺少 answer');
  if (value.observation && typeof value.observation !== 'object') throw new Error('模型 observation 字段格式异常');
  if (value.actions && !Array.isArray(value.actions)) throw new Error('模型 actions 字段必须是数组');
  return value;
};

const parseStructuredPlayerText = text => {
  const cleaned = String(text || '').replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  if (!cleaned || INTERNAL_OUTPUT_PATTERN.test(cleaned)) return undefined;
  const labels = ['结论', '当前队伍', '更优选择', '养成建议', '依据'];
  const hitCount = labels.reduce((sum, label) => sum + (new RegExp(`${label}\\s*[：:]`).test(cleaned) ? 1 : 0), 0);
  if (hitCount < 2) return undefined;
  const pick = label => {
    const match = cleaned.match(new RegExp(`${label}\\s*[：:]\\s*([^\\n]+)`));
    return match ? match[1].trim() : '';
  };
  const buildAdvice = cleaned
    .split(/\r?\n/)
    .map(line => line.replace(/^[-*\d.\s]+/, '').trim())
    .filter(line => line && !labels.some(label => line.startsWith(`${label}：`) || line.startsWith(`${label}:`)))
    .slice(0, 3);
  return {
    answer: cleaned,
    conclusion: pick('结论') || cleaned.split(/\r?\n/)[0],
    currentTeam: pick('当前队伍'),
    betterTeams: pick('更优选择') ? [{ title: '推荐调整', members: [], reason: pick('更优选择') }] : [],
    buildAdvice,
    basis: pick('依据'),
    sourcesUsed: [],
  };
};

const extractStringField = (text, field) => {
  const pattern = new RegExp(`"${field}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)`, 's');
  const match = text.match(pattern);
  if (!match) return '';
  try {
    return JSON.parse(`"${match[1].replace(/\r?\n/g, '\\n')}"`);
  } catch {
    return match[1].replace(/\\"/g, '"').replace(/\\n/g, '\n').trim();
  }
};

const parseModelJson = text => {
  if (!text || typeof text !== 'string') throw new Error('模型没有返回文本内容');
  const cleaned = stripModelReasoning(stripCodeFence(text));
  const jsonText = extractBalancedJson(cleaned);
  if (!jsonText) {
    const structured = parseStructuredPlayerText(cleaned);
    if (structured) return structured;
    throw new Error('模型没有返回可解析的 JSON');
  }
  const value = tryParseJson(jsonText) || tryParseJson(repairJsonText(jsonText));
  if (!value) {
    const structured = parseStructuredPlayerText(cleaned);
    if (structured) return structured;
    throw new Error('模型返回 JSON 格式异常，且未找到可用 answer 字段');
  }
  return validateModelShape(value);
};

const containsEnoughChinese = text => {
  const chinese = (text.match(/[\u3400-\u9fff]/g) || []).length;
  const letters = (text.match(/[A-Za-z]/g) || []).length;
  return chinese >= 8 && chinese >= letters * 0.45;
};

const CONTEXT_KINDS = new Set(['game', 'web', 'document', 'chat', 'system', 'desktop', 'other']);
const normalizeContextKind = value => CONTEXT_KINDS.has(value) ? value : 'other';
const inferContextKind = (input = {}, observation = {}) => {
  const text = observationText(input, observation);
  if (/原神|genshin|星穹铁道|星铁|star\s*rail|绝区零|zenless|崩坏|honkai|游戏|配队|阵容|角色练度|圣遗物|遗器|混沌药箱|第三次元|幻造生物/i.test(text)) return 'game';
  if (CONTEXT_KINDS.has(observation.contextKind)) return observation.contextKind;
  if (/浏览器|网页|网站|chrome|edge|firefox|http|www\./i.test(text)) return 'web';
  if (/文档|表格|幻灯片|pdf|word|excel|powerpoint/i.test(text)) return 'document';
  if (/聊天|消息|微信|qq|discord|slack|飞书/i.test(text)) return 'chat';
  if (/设置|任务管理器|资源管理器|控制面板|系统/i.test(text)) return 'system';
  if (/桌面|desktop/i.test(text)) return 'desktop';
  return 'other';
};

const normalizeObservation = (observation = {}, input = {}) => {
  const facts = Array.isArray(observation.facts) ? observation.facts.map(item => normalizeTraditionalText(item)) : [];
  const ocrText = Array.isArray(observation.ocrText) ? observation.ocrText.map(item => normalizeTraditionalText(item)) : [];
  const summary = normalizeTraditionalText(observation.summary || '已读取当前画面');
  const rawGame = normalizeTraditionalText(observation.game || observation.app || '');
  const gameKey = gameKeyFromText(`${rawGame} ${summary} ${facts.join(' ')} ${ocrText.join(' ')} ${input.sourceName || ''}`);
  const rawScene = observation.scene || input.scene || 'unknown';
  const inferredScene = inferSceneFromText(`${summary} ${facts.join(' ')} ${ocrText.join(' ')} ${input.query || ''}`);
  return {
    contextKind: inferContextKind(input, { ...observation, summary, facts, ocrText }),
    app: String(gameLabelFromKey(gameKey) || observation.app || observation.game || '未知应用'),
    game: gameLabelFromKey(gameKey) || (observation.game ? String(observation.game) : undefined),
    scene: rawScene && rawScene !== 'unknown' ? rawScene : inferredScene,
    summary,
    facts,
    ocrText,
    confidence: clamp(Number(observation.confidence) || 0.62, 0, 1),
    selectedCharacter: observation.selectedCharacter ? String(observation.selectedCharacter) : undefined,
    visibleRoster: Array.isArray(observation.visibleRoster) ? observation.visibleRoster.map(item => String(item)).filter(Boolean).slice(0, 24) : [],
    activeTeamCandidates: Array.isArray(observation.activeTeamCandidates) ? observation.activeTeamCandidates.map(item => String(item)).filter(Boolean).slice(0, 4) : [],
    stats: observation.stats && typeof observation.stats === 'object' ? observation.stats : {},
  };
};

const INTERNAL_OUTPUT_PATTERN = /ModelScope|choices|request|runtime|trace|JSON|Schema|自动重试|重试|格式修复|空 choices|候选答案|内部/i;
const splitUsefulLines = value => String(value || '')
  .split(/\r?\n+/)
  .map(line => line.replace(/^[-*\d.\s]+/, '').trim())
  .filter(line => line && !INTERNAL_OUTPUT_PATTERN.test(line));

const firstUsefulText = (...values) => {
  for (const value of values) {
    const line = splitUsefulLines(value)[0];
    if (line) return line.slice(0, 120);
  }
  return '';
};

const normalizeStringArray = value => {
  if (Array.isArray(value)) return value.map(item => String(item || '').trim()).filter(Boolean);
  if (typeof value === 'string') return splitUsefulLines(value);
  return [];
};

const normalizeTeamSuggestions = value => {
  if (!Array.isArray(value)) return [];
  return value.map((item, index) => {
    if (typeof item === 'string') {
      return { title: `方案 ${index + 1}`, members: [], reason: item.trim() };
    }
    if (!item || typeof item !== 'object') return undefined;
    return {
      title: String(item.title || item.name || `方案 ${index + 1}`).trim(),
      members: normalizeStringArray(item.members).slice(0, 4),
      reason: String(item.reason || item.summary || '').trim(),
    };
  }).filter(item => item && (item.reason || item.members.length)).slice(0, 2);
};

const formatPlayerAnswer = playerAnswer => [
  `结论：${playerAnswer.conclusion}`,
  `当前队伍：${playerAnswer.currentTeam}`,
  playerAnswer.betterTeams.length
    ? `更优选择：${playerAnswer.betterTeams.map(team => `${team.title}${team.members.length ? `（${team.members.join('、')}）` : ''}：${team.reason}`).join('；')}`
    : '',
  playerAnswer.buildAdvice.length ? `养成建议：${playerAnswer.buildAdvice.join('；')}` : '',
  `依据：${playerAnswer.basis}`,
].filter(Boolean).join('\n');

const normalizePlayerAnswer = (parsed, observation, citations = [], accountContext = {}) => {
  const sourceNames = citations.map(item => item.author || item.title).filter(Boolean).slice(0, 3);
  const raw = parsed.playerAnswer && typeof parsed.playerAnswer === 'object' ? parsed.playerAnswer : parsed;
  const betterTeams = normalizeTeamSuggestions(raw.betterTeams);
  const buildAdvice = normalizeStringArray(raw.buildAdvice || raw.actions || parsed.actions).slice(0, 3);
  const selected = observation.selectedCharacter || observation.summary || '当前角色';
  const teamNames = observation.activeTeamCandidates?.length
    ? observation.activeTeamCandidates.join('、')
    : observation.visibleRoster?.slice(0, 4).join('、');
  const conclusion = firstUsefulText(raw.conclusion, parsed.conclusion, parsed.answer, observation.summary)
    || `${selected}可以继续养成，但需要结合队伍判断。`;
  const currentTeam = firstUsefulText(raw.currentTeam, parsed.currentTeam)
    || (teamNames
      ? `从当前排序看，${teamNames}像是你正在看的队伍候选；是否真实上阵还需要以队伍界面为准。`
      : '当前截图没有稳定识别到完整队伍，只能先按角色池给建议。');
  const basis = firstUsefulText(raw.basis, raw.sourcesUsed, sourceNames.join('、'))
    || (sourceNames.length ? `参考 ${sourceNames.join('、')}` : accountContext.account ? '基于截图和公开账号角色判断' : '基于截图和本地知识判断');
  const playerAnswer = {
    conclusion,
    currentTeam,
    betterTeams,
    buildAdvice,
    basis,
    sourcesUsed: normalizeStringArray(raw.sourcesUsed).concat(sourceNames).filter((item, index, all) => item && all.indexOf(item) === index).slice(0, 3),
    text: '',
  };
  playerAnswer.text = formatPlayerAnswer(playerAnswer);
  return playerAnswer;
};

const parseFastObservation = (content, input = {}) => {
  const cleaned = String(content || '').replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start >= 0 && end > start) {
    const parsed = JSON.parse(cleaned.slice(start, end + 1));
    return normalizeObservation(parsed.observation || parsed, input);
  }
  if (!cleaned) throw new Error('快速视觉模型返回空结果');
  const facts = cleaned
    .split(/[\n。；]+/)
    .map(item => item.replace(/^[-*\d.\s]+/, '').trim())
    .filter(item => item.length >= 4)
    .slice(0, 4);
  const normalized = normalizeTraditionalText(cleaned);
  const game = /原神|Genshin/i.test(normalized)
    ? '原神'
    : /崩坏|星穹铁道|星铁|Star Rail|HSR|Honkai/i.test(normalized)
      ? '崩坏：星穹铁道'
      : /绝区零|Zenless|ZZZ/i.test(normalized)
        ? '绝区零'
        : '未知';
  return normalizeObservation({
    game,
    scene: input.scene && input.scene !== 'unknown' ? input.scene : inferSceneFromText(normalized),
    summary: facts[0] || cleaned.slice(0, 160),
    facts,
    ocrText: [],
    confidence: 0.62,
  }, input);
};

class AetherAgentRuntime {
  constructor(options) {
    this.dataDir = options.dataDir;
    this.knowledgeFile = options.knowledgeFile;
    this.token = options.token || '';
    this.providerName = options.providerName || 'Sub2Api';
    this.model = options.model || 'gpt-5.5';
    this.visionPipeline = normalizeVisionPipeline(options.visionPipeline || 'auto');
    this.fastVisionModel = options.fastVisionModel || '';
    this.knowledgeService = options.knowledgeService;
    this.knowledgeSync = options.knowledgeSync || {};
    this.knowledgeBundledVersion = options.knowledgeBundledVersion || this.knowledgeSync.bundledVersion || '';
    this.knowledgeBundledPath = options.knowledgeBundledPath || this.knowledgeSync.bundledPath || '';
    this.knowledgeCorpusDir = options.knowledgeCorpusDir || this.knowledgeSync.corpusDir || '';
    this.apiWire = normalizeApiWire(options.apiWire || 'responses');
    this.apiBaseUrl = options.apiBaseUrl || DEFAULT_LOCAL_BASE_URL;
    this.apiUrl = options.apiUrl || resolveApiEndpoint(this.apiBaseUrl, this.apiWire);
    this.requiresAuth = options.requiresAuth !== false;
    this.userAgent = options.userAgent || 'codex-cli/0.0.0';
    this.fetchImpl = options.fetchImpl || fetch;
    this.timeoutMs = options.timeoutMs || 180000;
    this.memoryFile = path.join(this.dataDir, 'memory.json');
    this.cacheFile = path.join(this.dataDir, 'cache.json');
    this.runsFile = path.join(this.dataDir, 'runs.json');
    this.conversationsDir = path.join(this.dataDir, 'conversations');
    this.knowledgeStateFile = path.join(this.dataDir, 'knowledge-state.json');
    ensureDir(this.dataDir);
    ensureDir(this.conversationsDir);
    this.cleanPollutedRuntimeState();
    this.reloadKnowledge({ replace: Boolean(options.resetKnowledge) });
  }

  shouldUseSinglePassVision(input = {}) {
    if (!input.imageDataUrl) return false;
    if (this.visionPipeline === 'legacy') return false;
    const provider = String(this.providerName || '').toLowerCase();
    const model = String(this.model || '').toLowerCase();
    const unifiedByModel = model.includes('minimax/minimax-m3') || /minimax/i.test(model);
    const unifiedProvider = provider === 'mota' || provider.includes('modelscope');
    if (this.visionPipeline === 'unified') return unifiedByModel || unifiedProvider;
    if (!unifiedByModel && !unifiedProvider) return false;
    return this.visionPipeline === 'auto';
  }

  status() {
    const runs = this.getRuns();
    const knowledgeStatus = this.knowledgeService?.status() || {};
    return {
      providerName: this.providerName,
      model: this.model,
      fastVisionModel: this.fastVisionModel || this.model,
      tokenConfigured: Boolean(this.token),
      apiBaseUrl: this.apiUrl,
      apiWire: this.apiWire,
      tavilyConfigured: Boolean(knowledgeStatus.tavilyConfigured),
      knowledgeVersion: this.knowledge.version || '未知',
      knowledgeBuiltInVersion: this.knowledgeBundledVersion || this.knowledge.version || '未知',
      knowledgeUpdatedAt: this.knowledge.updatedAt,
      knowledgeEntries: knowledgeStatus.knowledgeEntries ?? this.knowledge.entries.length,
      knowledgeRuntimePath: this.knowledgeFile,
      knowledgeBundledPath: this.knowledgeBundledPath,
      knowledgeCorpusDir: this.knowledgeCorpusDir,
      knowledgePartitions: knowledgeStatus.partitions || [],
      knowledgeSourceTiers: knowledgeStatus.sourceTiers || [],
      knowledgeSync: this.knowledgeSync,
      ragStrategy: 'SQLite FTS5 BM25 + 关键词/别名规则 + 来源可信度/版本权重 + 精选源优先 web 兜底',
      embeddingEnabled: false,
      accountCount: knowledgeStatus.accountCount || 0,
      latestRunAt: runs[0]?.createdAt,
      dataDir: this.dataDir,
    };
  }

  reloadKnowledge(options = {}) {
    let raw;
    try {
      raw = loadKnowledgeFile(this.knowledgeFile);
    } catch {
      raw = readJson(this.knowledgeFile, { version: '空知识库', entries: [] });
    }
    this.knowledge = {
      version: raw.version || '未知',
      updatedAt: raw.updatedAt || new Date().toISOString(),
      entries: Array.isArray(raw.entries) ? raw.entries : [],
    };
    if (options.replace) {
      this.knowledgeService?.replaceKnowledgeEntries(this.knowledge.entries, this.knowledge.version);
    } else {
      this.knowledgeService?.importEntries(this.knowledge.entries, this.knowledge.version);
      this.knowledgeService?.purgePollutedKnowledge?.();
    }
    writeJson(this.knowledgeStateFile, {
      version: this.knowledge.version,
      updatedAt: this.knowledge.updatedAt,
      entries: this.knowledge.entries.length,
      builtInVersion: this.knowledgeBundledVersion || this.knowledge.version,
      runtimePath: this.knowledgeFile,
      bundledPath: this.knowledgeBundledPath,
      corpusDir: this.knowledgeCorpusDir,
      sync: this.knowledgeSync,
      reloadedAt: new Date().toISOString(),
    });
    return this.status();
  }

  importKnowledge(file) {
    const incoming = loadKnowledgeFile(file);
    if (!incoming || !Array.isArray(incoming.entries)) throw new Error('知识包格式无效，必须包含 entries 数组');
    writeJson(this.knowledgeFile, incoming);
    this.knowledgeSync = {
      state: 'manual-import',
      reason: 'manual-import',
      runtimeVersion: incoming.version,
      runtimePath: this.knowledgeFile,
      importedFrom: file,
      syncedAt: new Date().toISOString(),
    };
    return this.reloadKnowledge({ replace: true });
  }

  memoryStore() {
    const store = readJson(this.memoryFile, {});
    const legacyPersonas = Object.keys(PERSONA_NAMES).filter(key => Array.isArray(store[key]));
    if (!legacyPersonas.length) return store;
    const migrated = { [DEFAULT_ACCOUNT_KEY]: {} };
    for (const persona of legacyPersonas) migrated[DEFAULT_ACCOUNT_KEY][persona] = store[persona];
    for (const [key, value] of Object.entries(store)) {
      if (!legacyPersonas.includes(key)) migrated[key] = value;
    }
    writeJson(this.memoryFile, migrated);
    return migrated;
  }

  getMemory(persona, accountKey = DEFAULT_ACCOUNT_KEY) {
    const scoped = this.memoryStore();
    const key = normalizeAccountKey(accountKey);
    return Array.isArray(scoped[key]?.[persona]) ? scoped[key][persona] : [];
  }

  writeMemory(persona, facts, accountKey = DEFAULT_ACCOUNT_KEY) {
    const key = normalizeAccountKey(accountKey);
    const store = this.memoryStore();
    if (!store[key]) store[key] = {};
    const current = Array.isArray(store[key][persona]) ? store[key][persona] : [];
    const map = new Map();
    [...current, ...facts].forEach(fact => {
      if (!fact) return;
      const key = `${fact.scope || 'session'}|${fact.label || ''}|${fact.value || ''}`.toLowerCase();
      map.set(key, {
        confidence: 0.7,
        updatedAt: Date.now(),
        source: 'runtime',
        ...fact,
      });
    });
    store[key][persona] = [...map.values()]
      .sort((a, b) => Number(a.updatedAt || 0) - Number(b.updatedAt || 0))
      .slice(-45);
    writeJson(this.memoryFile, store);
    return store[key][persona];
  }

  conversationFile(accountKey = DEFAULT_ACCOUNT_KEY) {
    return path.join(this.conversationsDir, `${accountKeyFileStem(accountKey)}.json`);
  }

  legacyConversationFile(accountKey = DEFAULT_ACCOUNT_KEY) {
    return path.join(this.conversationsDir, `${normalizeAccountKey(accountKey)}.json`);
  }

  readConversationStore(accountKey = DEFAULT_ACCOUNT_KEY) {
    const fallback = { accountKey: normalizeAccountKey(accountKey), conversations: [] };
    const primary = this.conversationFile(accountKey);
    const store = readJson(primary, undefined);
    if (store) return store;
    const legacy = this.legacyConversationFile(accountKey);
    return legacy === primary ? fallback : readJson(legacy, fallback);
  }

  writeConversationStore(accountKey, store) {
    writeJson(this.conversationFile(accountKey), {
      accountKey: normalizeAccountKey(accountKey),
      conversations: Array.isArray(store.conversations) ? store.conversations.slice(0, 40) : [],
    });
  }

  cleanPollutedRuntimeState() {
    const runs = readJson(this.runsFile, []);
    if (Array.isArray(runs) && runs.some(isPollutedRuntimeValue)) {
      writeJson(this.runsFile, runs.filter(run => !isPollutedRuntimeValue(run)));
    }
    const cache = readJson(this.cacheFile, {});
    if (cache && typeof cache === 'object') {
      const cleanCache = Object.fromEntries(Object.entries(cache).filter(([, value]) => !isPollutedRuntimeValue(value)));
      if (Object.keys(cleanCache).length !== Object.keys(cache).length) writeJson(this.cacheFile, cleanCache);
    }
    const memory = this.memoryStore();
    let memoryChanged = false;
    for (const scoped of Object.values(memory)) {
      if (!scoped || typeof scoped !== 'object') continue;
      for (const [persona, facts] of Object.entries(scoped)) {
        if (!Array.isArray(facts)) continue;
        const cleanFacts = facts.filter(fact => !isPollutedRuntimeValue(fact));
        if (cleanFacts.length !== facts.length) {
          scoped[persona] = cleanFacts;
          memoryChanged = true;
        }
      }
    }
    if (memoryChanged) writeJson(this.memoryFile, memory);
    if (fs.existsSync(this.conversationsDir)) {
      for (const entry of fs.readdirSync(this.conversationsDir, { withFileTypes: true })) {
        if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
        const file = path.join(this.conversationsDir, entry.name);
        const store = readJson(file, { conversations: [] });
        const conversations = Array.isArray(store.conversations) ? store.conversations : [];
        const cleanConversations = conversations.filter(conversation => !isPollutedRuntimeValue(conversation));
        if (cleanConversations.length !== conversations.length) {
          writeJson(file, { accountKey: store.accountKey || DEFAULT_ACCOUNT_KEY, conversations: cleanConversations });
        }
      }
    }
  }

  getConversations(accountKey = DEFAULT_ACCOUNT_KEY, limit = 20, options = {}) {
    const stores = options.includeAll
      ? fs.readdirSync(this.conversationsDir, { withFileTypes: true })
        .filter(entry => entry.isFile() && entry.name.endsWith('.json'))
        .map(entry => readJson(path.join(this.conversationsDir, entry.name), { conversations: [] }))
      : [this.readConversationStore(accountKey)];
    return stores
      .flatMap(store => (Array.isArray(store.conversations) ? store.conversations : []))
      .slice()
      .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))
      .slice(0, limit);
  }

  getConversation(accountKey = DEFAULT_ACCOUNT_KEY, conversationId) {
    if (!conversationId) return undefined;
    const store = this.readConversationStore(accountKey);
    return store.conversations.find(item => item.id === conversationId);
  }

  createConversation(accountKey = DEFAULT_ACCOUNT_KEY, input = {}) {
    const key = normalizeAccountKey(accountKey);
    const store = this.readConversationStore(key);
    const now = Date.now();
    const conversation = {
      id: nowId('conv'),
      accountKey: key,
      title: compact(input.query || '当前画面解读', 48),
      game: input.game || '',
      scene: input.scene || 'unknown',
      createdAt: now,
      updatedAt: now,
      messageCount: 0,
      lastRunId: '',
      lastObservation: undefined,
      lastKnowledge: [],
      lastRetrievalSource: [],
      filteredSources: [],
      lastRunSnapshot: undefined,
      messages: [],
    };
    store.conversations = [conversation, ...store.conversations].slice(0, 40);
    this.writeConversationStore(key, store);
    return conversation;
  }

  upsertConversation(accountKey, conversation) {
    const key = normalizeAccountKey(accountKey || conversation?.accountKey);
    const store = this.readConversationStore(key);
    const next = { ...conversation, accountKey: key, updatedAt: Date.now() };
    store.conversations = [
      next,
      ...store.conversations.filter(item => item.id !== next.id),
    ].slice(0, 40);
    this.writeConversationStore(key, store);
    return next;
  }

  conversationRunIds(conversation = {}) {
    return [...new Set([
      conversation.lastRunId,
      conversation.lastRunSnapshot?.id,
      ...(Array.isArray(conversation.messages) ? conversation.messages.map(message => message.runId) : []),
    ].filter(Boolean))];
  }

  removeRunsByIds(runIds = []) {
    const ids = new Set(runIds.filter(Boolean));
    if (!ids.size) return 0;
    const runs = readJson(this.runsFile, []);
    const nextRuns = Array.isArray(runs) ? runs.filter(run => !ids.has(run.id)) : [];
    if (nextRuns.length !== runs.length) writeJson(this.runsFile, nextRuns);
    return runs.length - nextRuns.length;
  }

  removeCacheByRefs({ conversationIds = [], runIds = [] } = {}) {
    const conversationSet = new Set(conversationIds.filter(Boolean));
    const runSet = new Set(runIds.filter(Boolean));
    if (!conversationSet.size && !runSet.size) return 0;
    const cache = readJson(this.cacheFile, {});
    const next = {};
    let removed = 0;
    for (const [key, value] of Object.entries(cache || {})) {
      if (conversationSet.has(value?.conversationId) || runSet.has(value?.id)) {
        removed += 1;
      } else {
        next[key] = value;
      }
    }
    if (removed) writeJson(this.cacheFile, next);
    return removed;
  }

  removeMemoryByRefs(accountKeys = [], { conversationIds = [], runIds = [], clearAccount = false } = {}) {
    const memory = this.memoryStore();
    const keys = accountKeys.length ? accountKeys.map(normalizeAccountKey) : Object.keys(memory);
    const conversationSet = new Set(conversationIds.filter(Boolean));
    const runSet = new Set(runIds.filter(Boolean));
    let removed = 0;
    for (const key of keys) {
      if (!memory[key]) continue;
      if (clearAccount) {
        removed += JSON.stringify(memory[key]).length ? 1 : 0;
        delete memory[key];
        continue;
      }
      for (const [persona, facts] of Object.entries(memory[key])) {
        if (!Array.isArray(facts)) continue;
        const nextFacts = facts.filter(fact => (
          !conversationSet.has(fact.conversationId) && !runSet.has(fact.runId) && !runSet.has(fact.parentRunId)
        ));
        removed += facts.length - nextFacts.length;
        memory[key][persona] = nextFacts;
      }
    }
    if (removed) writeJson(this.memoryFile, memory);
    return removed;
  }

  deleteConversation(input = {}) {
    const key = normalizeAccountKey(input.accountKey || DEFAULT_ACCOUNT_KEY);
    const conversationId = input.conversationId;
    if (!conversationId) throw new Error('缺少会话 ID');
    const store = this.readConversationStore(key);
    const conversation = (store.conversations || []).find(item => item.id === conversationId);
    if (!conversation) return { deleted: false, conversationId, accountKey: key, runsDeleted: 0, cacheDeleted: 0, memoryDeleted: 0 };
    const runIds = this.conversationRunIds(conversation);
    store.conversations = (store.conversations || []).filter(item => item.id !== conversationId);
    this.writeConversationStore(key, store);
    const runsDeleted = input.deleteLinkedRuns === false ? 0 : this.removeRunsByIds(runIds);
    const cacheDeleted = input.deleteLinkedRuns === false ? 0 : this.removeCacheByRefs({ conversationIds: [conversationId], runIds });
    const memoryDeleted = this.removeMemoryByRefs([key], { conversationIds: [conversationId], runIds });
    return { deleted: true, conversationId, accountKey: key, runsDeleted, cacheDeleted, memoryDeleted };
  }

  clearConversations(input = {}) {
    const includeAll = Boolean(input.includeAll);
    const stores = includeAll
      ? fs.readdirSync(this.conversationsDir, { withFileTypes: true })
        .filter(entry => entry.isFile() && entry.name.endsWith('.json'))
        .map(entry => ({ file: path.join(this.conversationsDir, entry.name), store: readJson(path.join(this.conversationsDir, entry.name), { conversations: [] }) }))
      : [{ file: this.conversationFile(input.accountKey || DEFAULT_ACCOUNT_KEY), store: this.readConversationStore(input.accountKey || DEFAULT_ACCOUNT_KEY) }];
    const conversationIds = [];
    const runIds = [];
    const accountKeys = [];
    for (const item of stores) {
      const accountKey = normalizeAccountKey(item.store.accountKey || input.accountKey || DEFAULT_ACCOUNT_KEY);
      accountKeys.push(accountKey);
      for (const conversation of item.store.conversations || []) {
        conversationIds.push(conversation.id);
        runIds.push(...this.conversationRunIds(conversation));
      }
      writeJson(item.file, { accountKey, conversations: [] });
    }
    const runsDeleted = input.deleteLinkedRuns === false ? 0 : this.removeRunsByIds(runIds);
    const cacheDeleted = input.deleteLinkedRuns === false ? 0 : this.removeCacheByRefs({ conversationIds, runIds });
    const memoryDeleted = input.clearMemory
      ? this.removeMemoryByRefs(includeAll ? [] : accountKeys, { clearAccount: true })
      : this.removeMemoryByRefs(accountKeys, { conversationIds, runIds });
    return {
      cleared: conversationIds.length,
      includeAll,
      accountKey: includeAll ? undefined : normalizeAccountKey(input.accountKey || DEFAULT_ACCOUNT_KEY),
      runsDeleted,
      cacheDeleted,
      memoryDeleted,
    };
  }

  appendConversationRun(accountKey, conversationId, input, run) {
    if (!conversationId) return undefined;
    const key = normalizeAccountKey(accountKey);
    const conversation = this.getConversation(key, conversationId);
    if (!conversation) return undefined;
    const now = Date.now();
    const messages = [
      ...(conversation.messages || []),
      {
        id: nowId('msg-user'),
        role: 'user',
        text: input.query || '解读当前画面',
        timestamp: now,
        runId: run.id,
      },
      {
        id: nowId('msg-model'),
        role: 'model',
        text: run.answer || run.summary || '',
        timestamp: Date.now(),
        runId: run.id,
      },
    ].slice(-30);
    return this.upsertConversation(key, {
      ...conversation,
      title: conversation.title || compact(input.query || run.observation?.summary || '当前画面解读', 48),
      game: run.observation?.game || conversation.game || '',
      scene: run.scene || conversation.scene || 'unknown',
      messageCount: messages.length,
      lastRunId: run.id,
      lastObservation: run.observation,
      lastKnowledge: (run.knowledge || []).slice(0, 8),
      lastRetrievalSource: run.retrievalSource || [],
      filteredSources: run.filteredSources || [],
      lastRunSnapshot: run,
      messages,
    });
  }

  getRuns(limit = 30) {
    return readJson(this.runsFile, []).slice(0, limit);
  }

  getRun(runId) {
    if (!runId) return undefined;
    return readJson(this.runsFile, []).find(run => run.id === runId);
  }

  getLatestRun() {
    return this.getRuns(1)[0];
  }

  saveRun(run) {
    const runs = readJson(this.runsFile, []);
    writeJson(this.runsFile, [run, ...runs].slice(0, 60));
  }

  retrieveKnowledge(query, scene, observationText = '', gameKey = '') {
    const sceneTerms = {
      gear: '装备 武器 圣遗物 遗器 词条',
      roster: '配队 阵容 循环',
      story: '剧情 防剧透 NPC',
      explore: '探索 地图 路线',
    };
    const rawQuery = `${query} ${scene} ${sceneTerms[scene] || ''} ${observationText}`.toLowerCase();
    const effectiveGameKey = gameKey || gameKeyFromText(rawQuery);
    const terms = rawQuery
      .toLowerCase()
      .split(/[\s，。！？、；：/|]+/)
      .filter(term => term.length > 1);
    return this.knowledge.entries
      .filter(entry => {
        if (!effectiveGameKey) return entry.game === '通用';
        const label = gameLabelFromKey(effectiveGameKey);
        return entry.game === label || entry.game === '通用';
      })
      .map(entry => {
        const haystack = `${entry.game} ${entry.title} ${(entry.tags || []).join(' ')} ${entry.content}`.toLowerCase();
        const termScore = terms.reduce((sum, term) => sum + (haystack.includes(term) ? 1 : 0), 0);
        const tagScore = (entry.tags || []).reduce((sum, tag) => sum + (rawQuery.includes(String(tag).toLowerCase()) ? 3 : 0), 0);
        const titleScore = rawQuery.includes(String(entry.title).toLowerCase()) ? 5 : 0;
        const score = termScore + tagScore + titleScore;
        return { ...entry, score };
      })
      .filter(entry => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
      .map(({ id, game, title, content, score }) => ({ id, game, title, content, score }));
  }

  routeSkills(input, observation = {}) {
    const startedAt = Date.now();
    const query = input.query || '';
    const visual = Boolean(input.imageDataUrl);
    const reuseObservation = Boolean(input.reuseLastObservation);
    const contextKind = inferContextKind(input, observation);
    const gameContext = contextKind === 'game';
    const webDemand = classifyWebNeed(input.query).required;
    const nonGameWebImage = Boolean(visual && observation?.contextKind === 'web');
    const canUseKnowledgeSkills = gameContext || (webDemand && !nonGameWebImage);
    const selected = new Map([
      ['observe.capture_source', visual ? '本轮包含截图输入' : reuseObservation ? '追问复用上一轮画面' : '本轮为纯文本输入'],
      ['context.profile_memory', '所有回答都会读取当前玩家画像'],
      ['reason.model_call', '需要模型融合上下文并生成回答'],
      ['answer.player_brief', '需要生成玩家可读短答案'],
      ['guard.safety_rules', '所有回答都会执行边界规则'],
    ]);
    if (visual || reuseObservation || observation?.summary) selected.set('observe.visual_context', visual ? '截图需要视觉提取特征' : '复用会话中的上一轮视觉观察');
    if (input.conversationId || reuseObservation) selected.set('context.conversation_memory', '当前问题属于已有会话追问');
    if (canUseKnowledgeSkills && (/装备|圣遗物|遗器|词条|双爆|阵容|配队|剧情|NPC|探索|地图|机制|名词|为什么|怎么/.test(query) || visual)) {
      selected.set('knowledge.hybrid_rag', '游戏场景需要结合本地知识库和精选攻略知识');
    }
    if (canUseKnowledgeSkills && input.mode !== 'background' && input.analysisMode !== 'instant') {
      selected.set('knowledge.web_guides', '深度游戏问答允许在本地知识不足时联网兜底');
      selected.set('knowledge.source_filter', '联网和缓存来源需要过滤污染内容');
    }
    if (gameContext && (/配队|阵容|角色|练度|账号|装备/.test(query) || visual)) selected.set('context.public_account', '游戏判断可结合玩家公开 UID 与角色状态');
    return SKILL_DEFINITIONS.map(definition => {
      const active = selected.has(definition.id);
      const triggerReason = active ? selected.get(definition.id) : skipSkillReason(definition.id, { gameContext, visual, reuseObservation });
      return {
        id: definition.id,
        name: definition.id,
        displayName: definition.displayName,
        phase: definition.phase,
        toolName: definition.id,
        intent: definition.intent,
        triggerReason,
        inputSummary: active
          ? compact(`${contextKind} · ${input.scene || 'unknown'} · ${query || '解读当前画面'}`, 160)
          : triggerReason,
        outputSummary: active ? '已进入本地 Tool Runtime' : '本轮跳过',
        status: active ? 'done' : 'skipped',
        latencyMs: active ? Math.max(1, Date.now() - startedAt) : 0,
        confidence: active ? 1 : 0,
        output: active ? '已进入本地 Tool Runtime' : '本轮跳过',
        error: '',
      };
    });
  }

  finalizeSkills(skills, context = {}) {
    return skills.map(skill => {
      if (skill.status !== 'done') return skill;
      let outputSummary = skill.outputSummary || skill.output;
      if (skill.id === 'observe.capture_source') {
        outputSummary = context.sourceName ? `读取输入来源：${context.sourceName}` : '本轮使用纯文本追问';
      } else if (skill.id === 'observe.visual_context') {
        const texts = context.observation?.ocrText || [];
        outputSummary = `${context.observation?.summary || '已读取视觉上下文'}${texts.length ? `；视觉文字 ${texts.length} 条` : '；未发现稳定可读文字'}`;
      } else if (skill.id === 'context.conversation_memory') {
        outputSummary = context.conversationMessageCount ? `读取当前会话 ${context.conversationMessageCount} 条消息` : '当前会话暂无历史消息';
      } else if (skill.id === 'context.profile_memory') {
        outputSummary = context.memoryWrites ? `写入 ${context.memoryWrites} 条 memory` : `读取 ${context.memoryCount || 0} 条画像 memory`;
      } else if (skill.id === 'context.public_account') {
        outputSummary = context.accountContext?.account ? context.accountContext.summary : '未使用公开账号';
      } else if (skill.id === 'knowledge.hybrid_rag') {
        outputSummary = context.knowledge?.length ? `命中 ${context.knowledge.length} 条本地/缓存知识` : '本地知识未命中';
      } else if (skill.id === 'knowledge.web_guides') {
        outputSummary = context.webSearchUnavailableReason
          ? `未联网检索到可用结果：${context.webSearchUnavailableReason}`
          : context.tavilyRequestIds?.length
            ? `Tavily 请求 ${context.tavilyRequestIds.length} 个`
            : '本轮未调用 Tavily';
      } else if (skill.id === 'knowledge.source_filter') {
        outputSummary = context.filteredSources?.length ? `过滤 ${context.filteredSources.length} 个低质或污染来源` : '来源过滤通过';
      } else if (skill.id === 'reason.model_call') {
        outputSummary = context.model ? `实际调用模型 ${context.model}${context.requestId ? `，请求 ${context.requestId}` : ''}` : '等待模型调用';
      } else if (skill.id === 'answer.player_brief') {
        outputSummary = context.actions?.length ? `生成 ${context.actions.length} 条行动建议和玩家短答案` : '生成玩家可读短答案';
      } else if (skill.id === 'guard.safety_rules') {
        outputSummary = context.rules?.some(rule => rule.verdict === 'block') ? '触发阻断规则' : '合规规则通过';
      }
      return {
        ...skill,
        outputSummary,
        output: outputSummary,
      };
    });
  }

  applyRules(input) {
    const automationRisk = /自动点击|自动操作|脚本刷|读取内存|抓包|封包/.test(input.query || '');
    const storyMode = input.persona === 'STORY' || input.scene === 'story' || /剧情|剧透|NPC/.test(input.query || '');
    return [
      {
        id: 'rule.local-first',
        name: '本地数据优先',
        priority: 'P0',
        verdict: 'pass',
        detail: 'memory、知识库、缓存和 trace 均保存在本机；云端仅接收本轮问题与选定截图。',
      },
      {
        id: 'rule.no-memory-read',
        name: '不读内存不抓包',
        priority: 'P0',
        verdict: automationRisk ? 'block' : 'pass',
        detail: automationRisk ? '检测到自动化或进程读取意图，本轮只提供合规的手动建议。' : '只使用用户选择的截图、输入和本地数据。',
      },
      {
        id: 'rule.spoiler-shield',
        name: '防剧透边界',
        priority: 'P0',
        verdict: storyMode ? 'warn' : 'pass',
        detail: storyMode ? '只允许解释当前画面和已知进度，不主动展开后续剧情。' : '当前请求未触发剧情风险。',
      },
      {
        id: 'rule.chinese-only',
        name: '中文上下文',
        priority: 'P1',
        verdict: 'pass',
        detail: '回答使用中文，必要技术术语保留英文。',
      },
    ];
  }

  buildMessages(input, memory, knowledge, rules, accountContext, fastObservation, conversationContext = {}, repair = false, retrievalMeta = {}) {
    const personaName = PERSONA_NAMES[input.persona] || '随心玩家';
    const personaGuidance = PERSONA_GUIDANCE[input.persona] || PERSONA_GUIDANCE.BALANCED;
    const gameContext = inferContextKind(input, fastObservation) === 'game';
    const retrievalMode = retrievalMeta?.matchMode || 'unknown';
    const retrievalPolicy = retrievalMeta?.retrievalPolicy || 'web-fallback';
    const guideIntent = retrievalMeta?.guideIntent || '';
    const webSearchRequired = !!retrievalMeta?.webSearchRequired;
    const webSearchUnavailableReason = String(retrievalMeta?.webSearchUnavailableReason || '');
    const searchHints = retrievalMeta?.searchHints || {};
    const queryHints = Array.isArray(searchHints.queryHints) ? searchHints.queryHints : [];
    const siteHints = Array.isArray(searchHints.siteHints) ? searchHints.siteHints : [];
    const hasSearchHints = queryHints.length > 0 || siteHints.length > 0;
    const isGuideQuestion = Boolean(guideIntent);
    const knowledgeText = knowledge.length
      ? knowledge.map(item => `【${item.game}·${item.title}】${item.sourceUrl ? `来源：${item.sourceUrl}。` : ''}${item.content}`).join(`\n`)
      : gameContext ? '本地知识未命中，请仅依据画面给建议。' : '当前不是游戏场景，建议先切换到游戏后再识别。';
    const hasKnowledgeSources = Array.isArray(knowledge) && knowledge.some(item => item.sourceUrl);
    const knowledgeRoutingText = retrievalPolicy === 'exact-local'
      ? 'knowledge strategy: exact local QA matched; answer from local curated card and current frame.'
      : retrievalPolicy === 'web-first'
        ? `knowledge strategy: guide intent ${guideIntent || 'general'} used web-first retrieval. Use the provided source cards and do not tell the player to search manually.`
        : retrievalPolicy === 'manual-fallback'
          ? `knowledge strategy: guide intent ${guideIntent || 'general'} needed web, but no usable web source is available. Do not invent guide details or specific bosses/mechanics.`
      : retrievalMode === 'high-confidence-local'
      ? 'knowledge strategy: local matches are sufficient; combine local hits and current frame.'
      : retrievalMode === 'low-match-web-empty'
        ? 'knowledge strategy: web was explicitly requested, but no usable web source returned. answer only from current frame and visible facts; absolutely no inferred boss mechanics/rotation/damage claims.'
        : retrievalMode === 'local-weak+web-fallback'
          ? 'knowledge strategy: local weak; web fallback used and should be prioritized.'
          : retrievalMode === 'web-fallback'
            ? 'knowledge strategy: local had no high-confidence hits; use web fallback with current frame.'
      : webSearchRequired
              ? 'knowledge strategy: user requested up-to-date攻略 or搜索-style result. prioritize web results, and if web is missing do not invent content.'
        : 'knowledge strategy: no confident local or web sources; answer from frame only, avoid fabricated details.';
    const knowledgeEvidenceText = retrievalPolicy === 'web-first' && hasKnowledgeSources
      ? '当前已有联网来源，答案必须先覆盖“机制/窗口/抗性/推荐配队”等关键条款，并在 sourcesUsed 写明采纳的来源。'
      : (isGuideQuestion && retrievalMode === 'low-match-web-empty') || (isGuideQuestion && retrievalPolicy === 'manual-fallback')
        ? '当前为攻略意图且缺少可用联网内容，请只基于可见事实给执行动作，不要输出未知机制、未确认伤害类型或未命中窗口。'
        : '';
    const knowledgeSummaryText = gameContext
      ? hasKnowledgeSources
        ? knowledgeText
        : retrievalPolicy === 'web-first' && hasSearchHints
          ? '联网已触发，但本轮未提取到可用攻略正文，暂不具备可引用机制细节。'
          : knowledgeText
      : hasKnowledgeSources
        ? knowledgeText
        : '当前不是明确游戏场景，当前无法直接调用游戏机制库。';

    const memoryText = memory.length
      ? memory.slice(-8).map(item => `${item.label}：${item.value}`).join('\n')
      : '当前画像没有历史 memory。';
    const ruleText = rules.map(item => `${item.name}：${item.detail}`).join('\n');
    const accountText = accountContext?.summary || (gameContext ? '未连接公开游戏账号。' : '当前不是游戏场景，本轮不使用游戏账号。');
    const fastObservationText = fastObservation
      ? `视觉提取特征：${fastObservation.summary}\n画面类型：${fastObservation.contextKind}\n应用：${fastObservation.app}\n可见事实：${(fastObservation.facts || []).join('、')}\n可见文字：${(fastObservation.ocrText || []).join('、')}`
      : '视觉提取特征未启用或未成功，直接由深度模型理解画面。';
    const conversationMessages = Array.isArray(conversationContext.messages) ? conversationContext.messages.slice(-8) : [];
    const conversationText = conversationMessages.length
      ? conversationMessages.map(item => `${item.role === 'user' ? '玩家' : '以太'}：${compact(item.text, 260)}`).join('\n')
      : '当前没有可复用的会话上下文。';
    const schema = JSON.stringify({
      answer: '三段以内的中文建议',
      conclusion: '一句话结论',
      currentTeam: '当前队伍或队伍候选判断，不能确认时必须说明只是候选',
      betterTeams: [{ title: '方案名', members: ['角色1', '角色2', '角色3', '角色4'], reason: '为什么更合适' }],
      buildAdvice: ['最多三条养成或操作建议'],
      sourcesUsed: ['采用的来源名，没有则留空'],
      playerAnswer: {
        conclusion: '一句话结论',
        currentTeam: '当前队伍判断',
        betterTeams: [{ title: '方案名', members: ['角色1', '角色2', '角色3', '角色4'], reason: '原因' }],
        buildAdvice: ['建议'],
        basis: '依据',
        sourcesUsed: ['来源名'],
      },
      observation: {
        contextKind: 'game、web、document、chat、system、desktop 或 other',
        app: '识别到的应用或界面名称',
        game: '仅在确认是游戏时填写游戏名称，否则留空',
        scene: 'gear、roster、story、explore 或 unknown',
        summary: '当前画面或问题摘要',
        facts: ['可验证事实'],
        ocrText: ['视觉提取到的画面可见文字'],
        selectedCharacter: '角色面板中正在查看的角色名',
        visibleRoster: ['左侧可见角色名，按从上到下从左到右排序'],
        activeTeamCandidates: ['左侧前四位角色名；不能确认真实上阵时只当队伍候选'],
        stats: { 元素精通: '925', 等级: '90/90' },
        confidence: 0.8,
      },
      actions: ['最多三条下一步行动'],
    });
    const system = [
      '你是“以太”屏幕理解助手的推理核心。必须使用中文回答，只有 skill、RAG、rules、memory、trace、Agent 等术语可保留英文。',
      '你必须基于当前截图、用户问题、本地知识与 memory 推理，不能声称看到了截图中不存在的内容。',
      '你可以理解游戏、网页、文档、聊天、系统界面和普通桌面。只有确认是游戏画面时才能使用游戏知识、公开游戏账号和攻略来源。',
      '剧情请求必须防剧透；自动化、读内存、抓包请求必须拒绝并改为手动建议。',
      '回答短、明确、可执行。不要输出 Markdown 代码块。',
      '回答直接面向玩家，不要提及模型名称、参数规模、request、runtime、Demo 或内部技术实现。',
      '如果截图是原神角色属性或角色池面板，必须识别当前角色、左侧可见角色和左侧前四位队伍候选。前四位不能确定为真实上阵时，必须写“从当前排序看……像是你正在看的队伍候选”。',
      '玩家答案必须按结论、当前队伍、更优选择、依据组织。不要输出模型推理过程、候选答案集合或重试信息。',
      '在游戏场景中，公开账号状态的可信度高于截图推测；外部攻略只能作为建议依据，不能伪装成确定事实。',
      retrievalPolicy === 'web-first' && knowledge.length
        ? '本轮已经拿到联网攻略来源。必须直接回答打法、路线、配队、装备或机制等攻略问题，并在 sourcesUsed 中写采用来源名；禁止回答“去搜索”“把机制截图发来”。'
        : '',
      knowledgeRoutingText,
      knowledgeEvidenceText,
      webSearchUnavailableReason
        ? `联网受限说明：${webSearchUnavailableReason}`
        : '',
      hasSearchHints && retrievalPolicy === 'manual-fallback'
        ? `手动检索建议：${queryHints.join('；') || '按主题关键词检索'}；优先来源可使用 ${siteHints.join('；')}`
        : '',
      webSearchRequired && retrievalMode === 'low-match-web-empty'
        ? '严禁编造 Boss 机制/循环/伤害/窗口信息。若联网无有效来源，请只输出“当前未找到可用新机制来源”，并基于可见事实给出下一步动作。'
        : '',
      input.scene === 'explore' && !/卡|找|怎么|哪里|路线|目标|解谜|开门|上去|下去/.test(input.query || '')
        ? '当前是探索场景，但玩家没有描述卡点。只解读可见线索，并邀请玩家补充一句卡在哪里，禁止猜测具体解法。'
        : '',
      `当前玩家偏好：${personaGuidance}`,
      `只输出一个合法 JSON 对象，结构为：${schema}`,
      repair ? '上一轮结果格式无效。这一轮必须严格输出合法 JSON，不能添加任何前后说明。' : '',
    ].filter(Boolean).join('\n');
    const text = [
      `用户画像：${personaName}`,
      `画像回答要求：${personaGuidance}`,
      `当前场景提示：${input.scene || 'unknown'}`,
      `运行模式：${input.mode}`,
      `用户问题：${input.query || '请解读当前画面并给出最短建议'}`,
      `本地 memory：\n${memoryText}`,
      `公开账号上下文：\n${accountText}`,
      `最近会话：\n${conversationText}`,
      `${fastObservationText}`,
      `攻略来源：\n${knowledgeSummaryText}`,
      `rules：\n${ruleText}`,
    ].join('\n\n');
    const content = input.imageDataUrl
      ? [
          { type: 'image_url', image_url: { url: input.imageDataUrl } },
          { type: 'text', text },
        ]
      : text;
    return [
      { role: 'system', content: system },
      { role: 'user', content },
    ];
  }

  async postModel(model, messages, maxTokens, timeoutMs) {
    if (!this.token && this.requiresAuth) throw new Error('未配置模型服务 API key');
    const requestWithWire = async (wire, explicitUrl) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const body = wire === 'responses'
          ? buildResponsesPayload(model, messages, maxTokens)
          : { model, messages, max_tokens: maxTokens };
        const endpoint = explicitUrl || resolveApiEndpoint(this.apiBaseUrl, wire);
        const headers = { 'Content-Type': 'application/json', 'User-Agent': this.userAgent };
        if (this.token) headers.Authorization = `Bearer ${this.token}`;
        const response = await this.fetchImpl(endpoint, {
          method: 'POST',
          headers,
          body: stringifyApiPayload(body),
          signal: controller.signal,
        });
        const raw = await response.text();
        if (!response.ok) {
          return { ok: false, status: response.status, raw, endpoint };
        }
        let payload;
        try {
          payload = JSON.parse(raw);
        } catch {
          return { ok: false, status: 200, raw: `${this.providerName} 返回非 JSON 响应` };
        }
        const content = extractApiText(payload);
        if (!content) {
          return { ok: false, status: 200, raw: `${this.providerName} 返回空结果` };
        }
        return {
          ok: true,
          requestId: payload.id || '',
          model: payload.model || model,
          content,
          usage: payload.usage || {},
        };
      } finally {
        clearTimeout(timer);
      }
    };

    const primary = await requestWithWire(this.apiWire, this.apiUrl);
    if (primary.ok) {
      return {
        requestId: primary.requestId || '',
        model: primary.model || model,
        content: primary.content || '',
        usage: primary.usage || {},
      };
    }
    const fallbackFromResponses = this.apiWire === 'responses'
      && primary.status
      && (primary.status === 404 || primary.status === 405);
    if (fallbackFromResponses) {
      const fallback = await requestWithWire('chat');
      if (fallback.ok) {
        return {
          requestId: fallback.requestId || '',
          model: fallback.model || model,
          content: fallback.content || '',
          usage: fallback.usage || {},
        };
      }
      if (fallback.status === 200) {
        throw new Error(fallback.raw || `${this.providerName} 返回空结果`);
      }
      throw new Error(classifyHttpError(fallback.status, fallback.raw));
    }
    throw new Error(classifyHttpError(primary.status, primary.raw));
  }

  async callModel(messages) {
    return this.postModel(this.model, messages, 1100, this.timeoutMs);
  }

  async callFastVision(input) {
    if (!input.imageDataUrl) return undefined;
    const visionModel = this.fastVisionModel || this.model;
    const result = await this.postModel(visionModel, [{
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: input.imageDataUrl } },
        { type: 'text', text: '使用中文快速提取当前画面的视觉特征：画面类型、应用、场景、可见文字和关键事实。画面类型必须是 game、web、document、chat、system、desktop 或 other。只有确认是游戏时填写 game。如果是原神、星穹铁道、星穹鐵道、星鐵或绝区零游戏画面，必须写清游戏名和当前界面。如果画面出现“第三次元-戰鬥”“等級”“混沌藥箱”“幻造生物”，优先按崩坏：星穹铁道探索/战斗场景理解。如果是原神角色属性或角色池面板，必须提取 selectedCharacter、visibleRoster、activeTeamCandidates 和 stats；activeTeamCandidates 取左侧前四位可见角色，只能视为队伍候选。只输出 JSON：{"contextKind":"game","app":"原神","game":"原神","scene":"gear|roster|story|explore|unknown","summary":"","facts":[],"ocrText":[],"selectedCharacter":"","visibleRoster":[],"activeTeamCandidates":[],"stats":{},"confidence":0.8}' },
      ],
    }], 350, 30000);
    return {
      ...parseFastObservation(result.content, input),
      model: result.model || visionModel,
      requestId: result.requestId || '',
    };
  }

  cacheKey(input) {
    return hashValue(JSON.stringify({
      persona: input.persona,
      scene: input.scene,
      mode: input.mode,
      query: (input.query || '').trim(),
      imageHash: input.imageHash || (input.imageDataUrl ? hashValue(input.imageDataUrl) : ''),
    }));
  }

  cacheIdentity(input, observation = {}) {
    return {
      persona: input.persona || '',
      scene: observation.scene || input.scene || 'unknown',
      mode: input.mode || '',
      query: (input.query || '').trim(),
      imageHash: input.imageHash || (input.imageDataUrl ? hashValue(input.imageDataUrl) : ''),
      game: inferGameKeyFromObservation(input, observation) || '',
    };
  }

  getCached(input, observation = {}) {
    const cached = readJson(this.cacheFile, {})[this.cacheKey(input)];
    if (!cached?.cacheIdentity) return undefined;
    const expected = this.cacheIdentity(input, observation);
    const actual = cached.cacheIdentity;
    if (actual.query !== expected.query || actual.mode !== expected.mode || actual.persona !== expected.persona) return undefined;
    if (actual.imageHash !== expected.imageHash) return undefined;
    if (expected.game && actual.game !== expected.game) return undefined;
    if (actual.scene !== expected.scene) return undefined;
    return cached;
  }

  putCached(input, run) {
    const cache = readJson(this.cacheFile, {});
    cache[this.cacheKey(input)] = {
      ...run,
      cacheIdentity: this.cacheIdentity(input, run.observation || {}),
    };
    writeJson(this.cacheFile, cache);
  }

  makeMemoryFacts(input, parsed, metadata = {}) {
    const timestamp = Date.now();
    const base = {
      conversationId: input.conversationId,
      parentRunId: input.parentRunId,
      game: metadata.game || parsed.observation?.game || '',
      scene: metadata.scene || parsed.observation?.scene || input.scene || 'unknown',
    };
    const facts = [
      {
        id: nowId('memory-intent'),
        scope: 'session',
        label: '最近问题',
        value: input.query || '解读当前画面',
        confidence: 1,
        updatedAt: timestamp,
        source: 'user',
        ...base,
      },
      {
        id: nowId('memory-scene'),
        scope: 'scene',
        label: '最近场景',
        value: parsed.observation?.summary || parsed.answer.slice(0, 100),
        confidence: clamp(Number(parsed.observation?.confidence) || 0.7, 0, 1),
        updatedAt: timestamp,
        source: 'observe.visual_context',
        ...base,
      },
    ];
    const query = String(input.query || '');
    const profileSignals = [
      /别剧透|不要剧透|防剧透/.test(query) ? '偏好防剧透' : '',
      /少术语|看不懂|新手/.test(query) ? '偏好少术语解释' : '',
      /效率|强度|最优|收益/.test(query) ? '偏好效率和强度判断' : '',
      /收集|图鉴|宝箱|成就/.test(query) ? '偏好收集进度提醒' : '',
    ].filter(Boolean);
    profileSignals.forEach(signal => facts.push({
      id: nowId('memory-profile'),
      scope: 'profile',
      label: '玩家偏好',
      value: signal,
      confidence: 0.82,
      updatedAt: timestamp,
      source: 'user',
      ...base,
    }));
    return facts;
  }

  makeSchedule(input) {
    return [
      {
        id: 'job.hotkey-capture',
        title: '热键解读',
        cadence: '玩家按 Alt+Q 时触发',
        owner: 'observe.capture_source',
        nextRun: input.mode === 'scan' ? '本轮已触发' : '等待玩家唤起',
        status: input.mode === 'scan' ? 'done' : 'queued',
      },
      {
        id: 'job.knowledge-reload',
        title: '知识库热重载',
        cadence: '文件变化或手动同步',
        owner: 'knowledge.hybrid_rag',
        nextRun: `当前版本 ${this.knowledge.version}`,
        status: 'running',
      },
      {
        id: 'job.compliance-check',
        title: '合规检查',
        cadence: '每次 Agent 运行',
        owner: 'guard.safety_rules',
        nextRun: '本轮已完成',
        status: 'done',
      },
    ];
  }

  async run(input) {
    const startedAt = Date.now();
    const trace = [];
    const errors = [];
    const warnings = [];
    const accountKey = normalizeAccountKey(input.accountKey || DEFAULT_ACCOUNT_KEY);
    let conversation = input.conversationId
      ? this.getConversation(accountKey, input.conversationId)
      : undefined;
    if (!conversation && input.mode === 'scan') {
      conversation = this.createConversation(accountKey, input);
      input.conversationId = conversation.id;
    }
    const conversationContext = conversation || {};
    const addTrace = (kind, title, detail, start, status = 'done') => {
      trace.push({ id: nowId('trace'), kind, title, detail, durationMs: Date.now() - start, status });
    };

    let stepStarted = Date.now();
    const memory = this.getMemory(input.persona, accountKey);
    addTrace('memory', '读取专属 memory', `读取 ${memory.length} 条 ${PERSONA_NAMES[input.persona] || input.persona} memory；账号域 ${accountKey}。`, stepStarted);

    let fastObservation;
    let unifiedVisionUsed = false;
    if (!input.imageDataUrl && input.reuseLastObservation && conversation?.lastObservation) {
      fastObservation = conversation.lastObservation;
      addTrace('observe', '复用会话画面', `复用会话 ${conversation.id} 的上一轮视觉观察：${fastObservation.summary || '无摘要'}。`, Date.now());
    } else if (!input.imageDataUrl && input.mode === 'chat' && conversation?.lastObservation) {
      input.reuseLastObservation = true;
      fastObservation = conversation.lastObservation;
      addTrace('observe', '自动复用会话画面', `纯文本追问默认复用会话 ${conversation.id} 的最后视觉观察：${fastObservation.summary || '无摘要'}。`, Date.now());
    } else if (input.imageDataUrl) {
      stepStarted = Date.now();
      const unifiedVision = this.shouldUseSinglePassVision(input);
      if (unifiedVision) {
        const inferredContextKind = inferContextKind(input, {});
        const inferredGameKey = inferGameKeyFromObservation(input, {});
        const inferredGame = gameLabelFromKey(inferredGameKey);
        fastObservation = {
          contextKind: inferredContextKind || 'other',
          app: inferredGame || input.sourceName || '截图来源',
          game: inferredGame || '',
          scene: input.scene && input.scene !== 'unknown' ? input.scene : inferSceneFromText(input.query || ''),
          summary: '已采集截图，等待多模态模型直接解析。',
          facts: [],
          ocrText: [],
          confidence: 0.62,
        };
        unifiedVisionUsed = true;
        addTrace('observe', '单次多模态联动', `直接由 ${this.model} 读取图片与问题联合建模。`, stepStarted);
      } else {
        try {
          fastObservation = await this.callFastVision(input);
          unifiedVisionUsed = false;
          addTrace('observe', '即时视觉提取特征', `理解为 ${fastObservation.contextKind}：${fastObservation.summary || '已提取画面上下文'}。`, stepStarted);
        } catch (error) {
          warnings.push({ stage: 'fast-vision', message: error.message, attempt: 1, timestamp: Date.now() });
          addTrace('observe', '即时视觉提取回退', `${error.message}；继续使用深度模型。`, stepStarted);
        }
      }
    }

    const contextKind = inferContextKind(input, fastObservation);
    const gameContext = contextKind === 'game';
    const webDemand = classifyWebNeed(input.query).required;
    const observedGame = inferGameKeyFromObservation(input, fastObservation || {});
    const nonGameWebImage = Boolean(input.imageDataUrl && fastObservation?.contextKind === 'web');
    if (!input.scene && (fastObservation?.scene || conversation?.scene || 'unknown') !== 'unknown') {
      input.scene = fastObservation?.scene || conversation?.scene;
    }
    const useKnowledgeRetrieval = (gameContext || webDemand) && !nonGameWebImage;

    stepStarted = Date.now();
    let skills = this.routeSkills(input, fastObservation);
    addTrace('skill', '本地 skill 路由', `调度 ${skills.filter(skill => skill.status === 'done').length} 个 skill。`, stepStarted);

    stepStarted = Date.now();
    const rules = this.applyRules(input);
    addTrace('rule', '执行 rules', `完成 ${rules.length} 条合规与上下文规则检查。`, stepStarted);

    stepStarted = Date.now();
    let retrieval = {
      hits: useKnowledgeRetrieval ? this.retrieveKnowledge(input.query || '', input.scene || '', '', observedGame) : [],
      citations: [],
      filteredSources: [],
      retrievalSource: useKnowledgeRetrieval ? ['local'] : ['model'],
      tavilyRequestIds: [],
      accountContext: { characters: [], summary: gameContext ? '当前画面不是游戏场景；当前未同步账号。' : '当前不是游戏场景，当前不使用账号。' },
      fromCache: false,
      matchMode: useKnowledgeRetrieval ? 'low-match-no-web' : 'non-game',
      localMatchCount: 0,
      localTopScore: 0,
      retainedLocalCount: 0,
      webTriggered: false,
      webUsed: false,
      webSearchRequired: false,
      webSearchUnavailableReason: '',
      searchHints: {
        queryHints: [],
        siteHints: [],
      },
      webTriggerReason: '',
      guideIntent: '',
      retrievalPolicy: 'web-fallback',
      localExactQaMatch: false,
      webQueries: [],
      extractedUrls: [],
    };
    try {
      if (this.knowledgeService && useKnowledgeRetrieval) {
        retrieval = await this.knowledgeService.retrieve({
          query: input.query || '',
          game: observedGame || undefined,
          scene: input.scene || 'unknown',
          sourceName: input.sourceName || '',
          selectedCharacter: fastObservation?.selectedCharacter,
          visibleRoster: fastObservation?.visibleRoster || [],
          activeTeamCandidates: fastObservation?.activeTeamCandidates || [],
          summary: fastObservation?.summary || '',
          facts: fastObservation?.facts || [],
          ocrText: fastObservation?.ocrText || [],
          allowWeb: input.mode !== 'background' && input.analysisMode !== 'instant',
        });
      }
      addTrace(
        'reason',
        useKnowledgeRetrieval ? '分层游戏知识检索' : '通用画面路径',
        useKnowledgeRetrieval
          ? `命中 ${retrieval.hits.length} 条知识；来源：${retrieval.retrievalSource.join('、') || '模型已有能力'}。`
          : '当前画面未识别为游戏，已跳过游戏知识、攻略搜索和公开账号。',
        stepStarted,
      );
    } catch (error) {
      errors.push({ stage: 'knowledge', message: error.message, attempt: 1, timestamp: Date.now() });
      addTrace('reason', '联网知识检索失败', `${error.message}；已回退本地知识。`, stepStarted);
    }
    const retrievalMode = retrieval?.matchMode || 'unknown';
    const shouldReuseLastKnowledge = input.reuseLastObservation
      && Array.isArray(conversation?.lastKnowledge)
      && !Boolean(retrieval.guideIntent)
      && !['low-match-no-web', 'low-match-web-empty'].includes(retrievalMode);
    const knowledge = [
      ...retrieval.hits,
      ...(shouldReuseLastKnowledge ? conversation.lastKnowledge : []),
    ].filter((item, index, all) => item && all.findIndex(other => other.id === item.id) === index).slice(0, 8);

    skills = this.finalizeSkills(skills, {
      observation: fastObservation,
      knowledge,
      accountContext: retrieval.accountContext,
      tavilyRequestIds: retrieval.tavilyRequestIds,
      filteredSources: retrieval.filteredSources,
      webSearchRequired: retrieval.webSearchRequired,
      webSearchUnavailableReason: retrieval.webSearchUnavailableReason,
      searchHints: retrieval.searchHints,
      sourceName: input.sourceName || '纯文本',
      conversationMessageCount: conversationContext.messages?.length || 0,
      memoryCount: memory.length,
      rules,
    });

    if (input.imageDataUrl) {
      stepStarted = Date.now();
      const capture = input.captureInfo || {};
      const captureDetail = [
        `来源：${capture.sourceName || input.sourceName || '未知来源'}`,
        capture.sourceId ? `sourceId：${capture.sourceId}` : '',
        capture.displayId !== undefined ? `displayId：${capture.displayId}` : '',
        capture.captureMode ? `模式：${capture.captureMode}` : '',
        capture.hiddenAssistant ? `已临时隐藏以太：${capture.hiddenAssistant.control || capture.hiddenAssistant.answer || capture.hiddenAssistant.agentOps ? '是' : '否'}（${capture.hiddenAssistant.delayMs || 0}ms）` : '',
        capture.fallbackReason ? `回退：${capture.fallbackReason}` : '',
      ].filter(Boolean).join('；');
      addTrace('observe', '捕获视觉上下文', captureDetail || `读取用户选择的画面来源：${input.sourceName || '未知来源'}。`, stepStarted);
    }

    let parsed;
    let modelMeta;
    let unifiedVisionRecovered = false;
    let retries = 0;
    let modelLatencyMs = 0;
    if (input.analysisMode === 'instant' && fastObservation) {
      parsed = {
        answer: `${fastObservation.summary || '我已经看懂当前画面。'}${(fastObservation.facts || []).length ? `\n最值得注意：${fastObservation.facts.slice(0, 2).join('；')}。` : ''}\n需要更完整的解释或建议，可以继续让我深度分析。`,
        observation: fastObservation,
        actions: ['继续描述你想解决的问题', '需要时进行深度分析'],
      };
      modelMeta = {
        model: fastObservation.model || this.fastVisionModel || this.model,
        requestId: fastObservation.requestId || '',
      };
      addTrace('reason', '即时解读完成', '使用快速视觉模型返回低等待结果，未调用深度模型。', Date.now());
    }
    for (let attempt = 0; !parsed && attempt < 2; attempt += 1) {
      stepStarted = Date.now();
      let modelCallRecorded = false;
      try {
        modelMeta = await this.callModel(this.buildMessages(input, memory, knowledge, rules, retrieval.accountContext, fastObservation, conversationContext, attempt > 0, retrieval));
        modelLatencyMs += Date.now() - stepStarted;
        modelCallRecorded = true;
        parsed = parseModelJson(modelMeta.content);
        if (!containsEnoughChinese(parsed.answer)) throw new Error('模型回答未满足中文输出规则');
        addTrace('reason', attempt ? '模型格式修复' : '多模态模型推理', `真实调用 ${modelMeta.model}，请求编号 ${modelMeta.requestId || '未返回'}。`, stepStarted);
        break;
      } catch (error) {
        if (unifiedVisionUsed && !unifiedVisionRecovered) {
          unifiedVisionRecovered = true;
          try {
            const recovered = await this.callFastVision(input);
            fastObservation = recovered;
            addTrace('reason', '单次多模态失败回退', `回退到 fastVision 后继续调用深度模型：${recovered.summary || '已识别画面上下文'}。`, stepStarted);
            continue;
          } catch (fallbackError) {
            warnings.push({ stage: 'fast-vision', message: fallbackError.message, attempt: attempt + 1, timestamp: Date.now() });
            addTrace('observe', '回退失败', `单次多模态回退视觉失败：${fallbackError.message}`, stepStarted);
          }
        }
        if (!modelCallRecorded) modelLatencyMs += Date.now() - stepStarted;
        retries = attempt + 1;
        errors.push({ stage: 'model', message: error.message, attempt: attempt + 1, timestamp: Date.now() });
        addTrace('reason', attempt ? '模型格式修复失败' : '模型推理失败', error.message, stepStarted);
      }
    }

    if (!parsed) {
      const canUseCache = !(retrieval.webSearchRequired && retrieval.webTriggered && !retrieval.webUsed);
      const cached = canUseCache ? this.getCached(input, fastObservation || {}) : undefined;
      if (cached) {
        const replay = {
          ...cached,
          id: nowId('run-cache'),
          createdAt: Date.now(),
          source: 'cache',
          query: input.query,
          conversationId: conversation?.id,
          accountKey,
          captureInfo: input.captureInfo || cached.captureInfo,
          citations: retrieval.citations?.length ? retrieval.citations : cached.citations || [],
          filteredSources: retrieval.filteredSources || [],
          retrievalSource: retrieval.retrievalSource || cached.retrievalSource || ['model'],
          knowledgeMatchMode: retrieval.matchMode || "unknown",
          guideIntent: retrieval.guideIntent || '',
          retrievalPolicy: retrieval.retrievalPolicy || 'web-fallback',
          localExactQaMatch: !!retrieval.localExactQaMatch,
          webQueries: retrieval.webQueries || [],
          extractedUrls: retrieval.extractedUrls || [],
          knowledgeMatch: {
            localMatchCount: retrieval.localMatchCount || 0,
            localTopScore: retrieval.localTopScore || 0,
            retainedLocalCount: retrieval.retainedLocalCount || 0,
            webTriggered: !!retrieval.webTriggered,
            webUsed: !!retrieval.webUsed,
            webTriggerReason: retrieval.webTriggerReason || '',
          },
          accountContextUsed: retrieval.accountContext,
          analysisMode: input.analysisMode || 'deep',
          tavilyRequestIds: retrieval.tavilyRequestIds || [],
          summary: `实时推理失败，明确回放 ${new Date(cached.createdAt).toLocaleString('zh-CN')} 的真实结果。`,
          trace: [...trace, {
            id: nowId('trace'),
            kind: 'respond',
            title: '真实历史缓存回放',
            detail: '本轮未伪装为实时结果，界面必须显示缓存回放标记。',
            durationMs: 0,
            status: 'done',
          }],
          errors: [...warnings, ...errors],
          metrics: {
            ...cached.metrics,
            latencyMs: Date.now() - startedAt,
            modelLatencyMs,
            localLatencyMs: Date.now() - startedAt - modelLatencyMs,
            cacheHit: true,
            retries,
          },
        };
        this.saveRun(replay);
        this.appendConversationRun(accountKey, conversation?.id, input, replay);
        return replay;
      }

      const failed = {
        id: nowId('run-error'),
        createdAt: Date.now(),
        query: input.query,
        conversationId: conversation?.id,
        accountKey,
        mode: input.mode,
        scene: input.scene || 'unknown',
        persona: input.persona,
        answer: '这次没能完成画面解读。你可以稍后再试，或者继续直接提问。',
        summary: 'Agent 未生成推理结果。',
        model: this.model,
        requestId: '',
        source: 'error',
        inputSourceName: input.sourceName || '纯文本',
        captureInfo: input.captureInfo,
        observation: {
          contextKind,
          app: '未知应用',
          scene: input.scene || 'unknown',
          summary: '没有获得可靠观察结果',
          facts: [],
          ocrText: [],
          confidence: 0,
        },
        actions: ['稍后重新解读画面', '直接描述你想解决的问题'],
        knowledge,
      citations: retrieval.citations || [],
      filteredSources: retrieval.filteredSources || [],
      retrievalSource: retrieval.retrievalSource?.length ? retrieval.retrievalSource : ['model'],
      webSearchRequired: !!retrieval.webSearchRequired,
      webSearchUnavailableReason: retrieval.webSearchUnavailableReason || '',
      searchHints: retrieval.searchHints || {},
      knowledgeMatchMode: retrieval.matchMode || "unknown",
      guideIntent: retrieval.guideIntent || '',
      retrievalPolicy: retrieval.retrievalPolicy || 'web-fallback',
      localExactQaMatch: !!retrieval.localExactQaMatch,
      webQueries: retrieval.webQueries || [],
      extractedUrls: retrieval.extractedUrls || [],
      knowledgeMatch: {
        localMatchCount: retrieval.localMatchCount || 0,
            localTopScore: retrieval.localTopScore || 0,
            retainedLocalCount: retrieval.retainedLocalCount || 0,
            webTriggered: !!retrieval.webTriggered,
            webUsed: !!retrieval.webUsed,
            webTriggerReason: retrieval.webTriggerReason || '',
          },
        accountContextUsed: retrieval.accountContext,
        analysisMode: input.analysisMode || 'deep',
        tavilyRequestIds: retrieval.tavilyRequestIds || [],
        trace,
        skills,
        rules,
        memory,
        schedule: this.makeSchedule(input),
        errors: [...warnings, ...errors],
        metrics: {
          latencyMs: Date.now() - startedAt,
          modelLatencyMs,
          localLatencyMs: Date.now() - startedAt - modelLatencyMs,
          memoryWrites: 0,
          cacheHit: false,
          retries,
        },
      };
      this.saveRun(failed);
      this.appendConversationRun(accountKey, conversation?.id, input, failed);
      return failed;
    }

    const observation = normalizeObservation(parsed.observation, input);
    stepStarted = Date.now();
    const facts = this.makeMemoryFacts(input, { ...parsed, observation }, { game: observation.game, scene: observation.scene });
    const updatedMemory = this.writeMemory(input.persona, facts, accountKey);
    addTrace('memory', '写入专属 memory', `写入 ${facts.length} 条 memory，当前画像共 ${updatedMemory.length} 条。`, stepStarted);
    const playerAnswer = normalizePlayerAnswer(parsed, observation, retrieval.citations || [], retrieval.accountContext);
    skills = this.finalizeSkills(skills, {
      observation,
      knowledge,
      accountContext: retrieval.accountContext,
      tavilyRequestIds: retrieval.tavilyRequestIds,
      filteredSources: retrieval.filteredSources,
      webSearchRequired: retrieval.webSearchRequired,
      webSearchUnavailableReason: retrieval.webSearchUnavailableReason,
      searchHints: retrieval.searchHints,
      sourceName: input.sourceName || '纯文本',
      conversationMessageCount: conversationContext.messages?.length || 0,
      memoryCount: memory.length,
      model: modelMeta.model,
      requestId: modelMeta.requestId,
      rules,
      actions: Array.isArray(parsed.actions) ? parsed.actions.slice(0, 3) : [],
      memoryWrites: facts.length,
    });

    const run = {
      id: nowId('run-live'),
      createdAt: Date.now(),
      query: input.query,
      conversationId: conversation?.id,
      accountKey,
      mode: input.mode,
      scene: observation.scene,
      persona: input.persona,
      answer: playerAnswer.text,
      playerAnswer,
      summary: `真实 Agent 完成 ${trace.length + 1} 步运行，调用 ${skills.filter(skill => skill.status === 'done').length} 个 skill。`,
      model: modelMeta.model,
      requestId: modelMeta.requestId,
      source: 'live',
      inputSourceName: input.sourceName || '纯文本',
      captureInfo: input.captureInfo,
      observation: {
        ...observation,
        facts: observation.facts.slice(0, 8),
        ocrText: observation.ocrText.slice(0, 12),
      },
      actions: Array.isArray(parsed.actions) ? parsed.actions.slice(0, 3) : [],
      knowledge,
      citations: retrieval.citations || [],
      filteredSources: retrieval.filteredSources || [],
      retrievalSource: retrieval.retrievalSource?.length ? retrieval.retrievalSource : ['model'],
      webSearchRequired: !!retrieval.webSearchRequired,
      webSearchUnavailableReason: retrieval.webSearchUnavailableReason || '',
      searchHints: retrieval.searchHints || {},
      knowledgeMatchMode: retrieval.matchMode || "unknown",
      guideIntent: retrieval.guideIntent || '',
      retrievalPolicy: retrieval.retrievalPolicy || 'web-fallback',
      localExactQaMatch: !!retrieval.localExactQaMatch,
      webQueries: retrieval.webQueries || [],
      extractedUrls: retrieval.extractedUrls || [],
      knowledgeMatch: {
        localMatchCount: retrieval.localMatchCount || 0,
            localTopScore: retrieval.localTopScore || 0,
            retainedLocalCount: retrieval.retainedLocalCount || 0,
            webTriggered: !!retrieval.webTriggered,
            webUsed: !!retrieval.webUsed,
            webTriggerReason: retrieval.webTriggerReason || '',
          },
      accountContextUsed: retrieval.accountContext,
      analysisMode: input.analysisMode || 'deep',
      tavilyRequestIds: retrieval.tavilyRequestIds || [],
      trace: [...trace, {
        id: nowId('trace'),
        kind: 'respond',
        title: '生成低打扰回复',
        detail: '将真实模型结果压缩为悬浮窗可读建议，并保存完整 trace。',
        durationMs: 0,
        status: 'done',
      }],
      skills,
      rules,
      memory: updatedMemory,
      schedule: this.makeSchedule(input),
      errors,
      metrics: {
        latencyMs: Date.now() - startedAt,
        modelLatencyMs,
        localLatencyMs: Date.now() - startedAt - modelLatencyMs,
        memoryWrites: facts.length,
        cacheHit: false,
        retries,
      },
    };
    this.putCached(input, run);
    this.saveRun(run);
    this.appendConversationRun(accountKey, conversation?.id, input, run);
    return run;
  }

  async health() {
    const startedAt = Date.now();
    try {
      const result = await this.callModel([
        { role: 'system', content: '你是连接检查服务。只回答中文“连接成功”。' },
        { role: 'user', content: '检查连接' },
      ]);
      return {
        ok: true,
        model: result.model,
        requestId: result.requestId,
        latencyMs: Date.now() - startedAt,
        message: `${this.providerName} 真实推理连接成功`,
      };
    } catch (error) {
      return {
        ok: false,
        model: this.model,
        requestId: '',
        latencyMs: Date.now() - startedAt,
        message: error.message,
      };
    }
  }
}

module.exports = {
  AetherAgentRuntime,
  containsEnoughChinese,
  inferContextKind,
  normalizeObservation,
  parseFastObservation,
  parseModelJson,
  resolveApiEndpoint,
};
