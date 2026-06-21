const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { AetherAgentRuntime, containsEnoughChinese, inferContextKind, parseFastObservation, parseModelJson, resolveApiEndpoint } = require('./agent-runtime.cjs');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aether-agent-test-'));
const knowledgeFile = path.join(__dirname, 'knowledge', 'game-knowledge.json');
const testDataDir = name => path.join(root, name);

const modelPayload = answer => ({
  id: 'chatcmpl-test-real-shape',
  model: 'Qwen/Qwen3.5-397B-A17B',
  choices: [{
    message: {
      content: JSON.stringify({
        answer,
        observation: {
          contextKind: 'game',
          app: '原神',
          game: '原神',
          scene: 'gear',
          summary: '识别到装备界面',
          facts: ['当前画面存在武器属性'],
          ocrText: ['攻击力'],
          confidence: 0.91,
        },
        actions: ['先锁定候选装备'],
      }),
    },
  }],
  usage: { total_tokens: 20 },
});

const modelPayloadWithoutModel = answer => {
  const payload = modelPayload(answer);
  delete payload.model;
  return payload;
};

const response = (payload, ok = true, status = 200) => ({
  ok,
  status,
  text: async () => JSON.stringify(payload),
});

test('本地 Sub2Api endpoint 默认解析到 openai responses 路径', () => {
  assert.equal(resolveApiEndpoint('http://127.0.0.1:8080', 'responses'), 'http://127.0.0.1:8080/v1/responses');
  assert.equal(resolveApiEndpoint('http://127.0.0.1:8080/v1', 'responses'), 'http://127.0.0.1:8080/v1/responses');
  assert.equal(resolveApiEndpoint('http://127.0.0.1:8080/v1', 'chat'), 'http://127.0.0.1:8080/v1/chat/completions');
});

test('responses 协议可以解析 output_text', async () => {
  let capturedBody;
  const runtime = new AetherAgentRuntime({
    dataDir: testDataDir('responses-wire'),
    knowledgeFile,
    token: 'test-token',
    model: 'gpt-5.5',
    apiBaseUrl: 'http://127.0.0.1:8080/v1',
    apiWire: 'responses',
    fetchImpl: async (_url, init) => {
      capturedBody = JSON.parse(init.body);
      return response({
        id: 'resp-test',
        model: 'gpt-5.5',
        output_text: JSON.stringify({
          answer: '这是本地网关返回的一条完整中文建议。',
          observation: { contextKind: 'desktop', app: '桌面', scene: 'unknown', summary: '普通桌面', facts: [], ocrText: [], confidence: 0.8 },
          actions: ['先确认当前窗口'],
        }),
      });
    },
  });
  const result = await runtime.callModel([{ role: 'user', content: '检查连接' }]);
  assert.equal(capturedBody.max_output_tokens, 1100);
  assert.equal(capturedBody.input[0].content[0].type, 'input_text');
  assert.equal(result.requestId, 'resp-test');
  assert.match(result.content, /本地网关/);
});

test('运行结果显示服务端实际返回模型名', async () => {
  const runtime = new AetherAgentRuntime({
    dataDir: testDataDir('actual-model-name'),
    knowledgeFile,
    token: 'test-token',
    model: 'gpt-5.5',
    fetchImpl: async () => response(modelPayload('这是一条完整的中文建议。')),
  });
  const run = await runtime.run({
    query: '帮我看当前画面',
    persona: 'POWER',
    scene: 'gear',
    mode: 'chat',
    sourceName: '纯文本',
  });
  assert.equal(run.model, 'Qwen/Qwen3.5-397B-A17B');
});

test('服务端不返回模型名时回退到请求模型', async () => {
  const runtime = new AetherAgentRuntime({
    dataDir: testDataDir('requested-model-fallback'),
    knowledgeFile,
    token: 'test-token',
    model: 'gpt-5.5',
    fetchImpl: async () => response(modelPayloadWithoutModel('这是一条完整的中文建议。')),
  });
  const run = await runtime.run({
    query: '帮我看当前画面',
    persona: 'POWER',
    scene: 'gear',
    mode: 'chat',
    sourceName: '纯文本',
  });
  assert.equal(run.model, 'gpt-5.5');
});

test.before(() => {
  fs.rmSync(root, { recursive: true, force: true });
  fs.mkdirSync(root, { recursive: true });
});

test.after(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

test('能够解析模型 JSON 并检查中文输出', () => {
  const parsed = parseModelJson(`\`\`\`json\n${JSON.stringify({ answer: '这是一条完整的中文建议。' })}\n\`\`\``);
  assert.equal(parsed.answer, '这是一条完整的中文建议。');
  assert.equal(containsEnoughChinese(parsed.answer), true);
  assert.equal(containsEnoughChinese('This is only English output'), false);
});

test('模型 JSON 少逗号时会自动修复 answer', () => {
  const parsed = parseModelJson('{"answer":"这是一条可以使用的中文建议。" "actions":["先看当前目标"]}');
  assert.equal(parsed.answer, '这是一条可以使用的中文建议。');
});

test('模型返回自然语言时不会污染玩家答案', () => {
  assert.throws(
    () => parseModelJson('当前画面像是一个构建产物目录。建议先确认 release 文件，再重新打开应用测试。'),
    /可解析的 JSON/,
  );
});

test('模型返回玩家段落文本时可以安全归一化', () => {
  const parsed = parseModelJson('结论：这队方向合理\\n当前队伍：从当前排序看像是队伍候选\\n更优选择：菈乌玛、纳西妲、心海、妮露\\n依据：基于截图和账号角色判断');
  assert.match(parsed.conclusion, /方向合理/);
  assert.match(parsed.currentTeam, /队伍候选/);
  assert.equal(parsed.betterTeams.length, 1);
});

test('快速视觉模型返回自然语言时仍能形成结构化观察', () => {
  const parsed = parseFastObservation('原神装备界面。当前角色正在查看一把满级武器。建议继续核对属性。', { scene: 'gear' });
  assert.equal(parsed.game, '原神');
  assert.equal(parsed.scene, 'gear');
  assert.match(parsed.summary, /装备界面/);
  assert.ok(parsed.facts.length >= 2);
});

test('通用画面分类不会误触发游戏知识和账号 skill', () => {
  assert.equal(inferContextKind({ query: '帮我总结这份 PDF 文档' }), 'document');
  const runtime = new AetherAgentRuntime({
    dataDir: testDataDir('generic-skills'),
    knowledgeFile,
    token: 'test-token',
    fetchImpl: async () => response(modelPayload('这是一条完整的中文建议。')),
  });
  const skills = runtime.routeSkills(
    { query: '帮我总结当前网页', imageDataUrl: 'data:image/jpeg;base64,test' },
    { contextKind: 'web', app: 'Chrome', summary: '网页文章' },
  );
  assert.equal(skills.find(item => item.id === 'observe.visual_context').status, 'done');
  assert.equal(skills.find(item => item.id === 'knowledge.hybrid_rag').status, 'skipped');
  assert.equal(skills.find(item => item.id === 'context.public_account').status, 'skipped');
});

test('网页截图会走通用视觉链路并跳过游戏知识服务', async () => {
  let retrievalCalls = 0;
  let modelCalls = 0;
  const knowledgeService = {
    importEntries: () => 0,
    status: () => ({ knowledgeEntries: 0 }),
    retrieve: async () => {
      retrievalCalls += 1;
      throw new Error('通用画面不应调用游戏知识服务');
    },
  };
  const runtime = new AetherAgentRuntime({
    dataDir: testDataDir('generic-run'),
    knowledgeFile,
    token: 'test-token',
    knowledgeService,
    fetchImpl: async () => {
      modelCalls += 1;
      if (modelCalls === 1) {
        return response({
          id: 'vision-web',
          model: 'vision-test',
          choices: [{ message: { content: JSON.stringify({
            contextKind: 'web',
            app: 'Chrome',
            scene: 'unknown',
            summary: '浏览器正在显示一篇文章',
            facts: ['页面包含标题和正文'],
            ocrText: ['文章标题'],
            confidence: 0.92,
          }) } }],
        });
      }
      return response({
        id: 'deep-web',
        model: 'deep-test',
        choices: [{ message: { content: JSON.stringify({
          answer: '这是一篇网页文章，可以先阅读标题与首段，再决定是否继续深入。',
          observation: {
            contextKind: 'web',
            app: 'Chrome',
            scene: 'unknown',
            summary: '浏览器正在显示一篇文章',
            facts: ['页面包含标题和正文'],
            ocrText: ['文章标题'],
            confidence: 0.92,
          },
          actions: ['先阅读标题与首段'],
        }) } }],
      });
    },
  });
  const run = await runtime.run({
    query: '帮我看看当前画面',
    persona: 'BALANCED',
    scene: 'unknown',
    mode: 'scan',
    analysisMode: 'deep',
    imageDataUrl: 'data:image/jpeg;base64,test',
    sourceName: '显示器 1',
  });
  assert.equal(retrievalCalls, 0);
  assert.equal(run.observation.contextKind, 'web');
  assert.deepEqual(run.retrievalSource, ['model']);
  assert.equal(run.skills.find(item => item.id === 'knowledge.hybrid_rag').status, 'skipped');
});

test('快速视觉 429 后深度模型成功时不污染玩家答案', async () => {
  let calls = 0;
  const runtime = new AetherAgentRuntime({
    dataDir: testDataDir('fast-vision-warning'),
    knowledgeFile,
    token: 'test-token',
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) return response({ error: 'rate limited' }, false, 429);
      return response({
        id: 'deep-zzz',
        model: 'gpt-5.5',
        choices: [{ message: { content: JSON.stringify({
          answer: '这是绝区零战斗待机画面，可以先观察敌人距离和角色状态，再决定是否开战。',
          conclusion: '现在像是绝区零的战斗待机画面，先别急着交技能。',
          currentTeam: '画面未稳定显示完整队伍，只能按当前角色与战斗环境判断。',
          betterTeams: [],
          buildAdvice: ['先看敌人动作', '确认角色血量和能量'],
          basis: '基于截图画面判断',
          observation: {
            contextKind: 'game',
            app: '绝区零',
            game: '绝区零',
            scene: 'unknown',
            summary: '第三人称战斗待机画面',
            facts: ['角色处于场景中', '界面显示战斗 HUD'],
            ocrText: [],
            confidence: 0.85,
          },
          actions: ['先观察敌人动作', '确认角色状态'],
        }) } }],
      });
    },
  });
  const run = await runtime.run({
    query: '让我看看现在画面',
    persona: 'BALANCED',
    scene: 'unknown',
    mode: 'scan',
    analysisMode: 'deep',
    imageDataUrl: 'data:image/jpeg;base64,test',
    sourceName: '显示器 1',
  });
  assert.equal(run.source, 'live');
  assert.equal(run.errors.length, 0);
  assert.match(run.playerAnswer.conclusion, /绝区零/);
  assert.doesNotMatch(run.answer, /429|快速视觉|重试/);
  assert.ok(run.trace.some(item => /回退/.test(item.title)));
});

test('角色池截图会生成玩家版配队答案而不是内部推理记录', async () => {
  let modelCalls = 0;
  const knowledgeService = {
    importEntries: () => 0,
    status: () => ({ knowledgeEntries: 2, accountCount: 1 }),
    retrieve: async input => ({
      hits: [{ id: 'genshin-lauma-team', game: '原神', title: '菈乌玛配队判断', content: '菈乌玛需要水草核心、生存位和稳定循环。', score: 8 }],
      citations: [{ id: 'kqm', title: 'KQM Lauma Quick Guide', url: 'https://keqingmains.com/q/lauma-quickguide/', author: 'KeqingMains', version: '当前版本', updatedAt: Date.now(), sourceType: 'community' }],
      filteredSources: [],
      retrievalSource: ['account', 'local'],
      tavilyRequestIds: [],
      accountContext: {
        account: { id: 'a', game: 'genshin', uid: '1', label: '测试账号', active: true, characterCount: 4 },
        characters: [],
        summary: '公开角色包含菈乌玛、纳西妲、心海、妮露。',
        visibleRosterMatched: ['菈乌玛', '纳西妲', '心海'],
        ownedCandidates: ['菈乌玛', '纳西妲', '心海', '妮露'],
      },
      fromCache: false,
      query: input.query,
    }),
  };
  const runtime = new AetherAgentRuntime({
    dataDir: testDataDir('player-answer'),
    knowledgeFile,
    token: 'test-token',
    knowledgeService,
    fetchImpl: async () => {
      modelCalls += 1;
      if (modelCalls === 1) {
        return response({
          id: 'vision-lauma',
          model: 'vision-test',
          choices: [{ message: { content: JSON.stringify({
            contextKind: 'game',
            app: '原神',
            game: '原神',
            scene: 'gear',
            summary: '菈乌玛属性与角色池面板',
            facts: ['元素精通 925', '等级 90'],
            ocrText: ['菈乌玛', '元素精通 925'],
            selectedCharacter: '菈乌玛',
            visibleRoster: ['菈乌玛', '纳西妲', '珊瑚宫心海', '妮露'],
            activeTeamCandidates: ['菈乌玛', '纳西妲', '珊瑚宫心海', '妮露'],
            stats: { 元素精通: 925 },
            confidence: 0.92,
          }) } }],
        });
      }
      return response({
        id: 'deep-lauma',
        model: 'deep-test',
        choices: [{ message: { content: JSON.stringify({
          answer: '菈乌玛这队方向合理，优先保证水草循环和生存。',
          conclusion: '这套候选队伍方向合理，菈乌玛适合进绽放体系。',
          currentTeam: '从当前排序看，菈乌玛、纳西妲、珊瑚宫心海、妮露像是你正在看的队伍候选，水草核心和生存都具备。',
          betterTeams: [{ title: '妮露绽放', members: ['菈乌玛', '纳西妲', '珊瑚宫心海', '妮露'], reason: '水草触发稳定，心海补生存。' }],
          buildAdvice: ['继续看元素精通和充能，不只看等级。', '确认队伍里有稳定挂水。'],
          basis: '参考 KQM Lauma Quick Guide 与公开账号角色。',
          sourcesUsed: ['KeqingMains'],
          observation: {
            contextKind: 'game',
            app: '原神',
            game: '原神',
            scene: 'gear',
            summary: '菈乌玛属性与角色池面板',
            selectedCharacter: '菈乌玛',
            visibleRoster: ['菈乌玛', '纳西妲', '珊瑚宫心海', '妮露'],
            activeTeamCandidates: ['菈乌玛', '纳西妲', '珊瑚宫心海', '妮露'],
            stats: { 元素精通: 925 },
            facts: ['元素精通 925'],
            ocrText: ['菈乌玛'],
            confidence: 0.92,
          },
          actions: ['确认充能是否够循环', '保留心海或其他生存位'],
        }) } }],
      });
    },
  });
  const run = await runtime.run({
    query: '这队合理吗，能不能给更好的菈乌玛配队',
    persona: 'POWER',
    scene: 'roster',
    mode: 'scan',
    analysisMode: 'deep',
    imageDataUrl: 'data:image/jpeg;base64,test',
    sourceName: '角色池截图',
  });
  assert.equal(run.observation.selectedCharacter, '菈乌玛');
  assert.match(run.playerAnswer.conclusion, /方向合理/);
  assert.match(run.playerAnswer.currentTeam, /队伍候选/);
  assert.equal(run.playerAnswer.betterTeams[0].members.includes('妮露'), true);
  assert.doesNotMatch(run.answer, /ModelScope|choices|JSON|重试/);
});

test('任务攻略追问保留问题导向的分段答案', async () => {
  let modelCalls = 0;
  const knowledgeService = {
    status: () => ({ knowledgeEntries: 1, accountCount: 0 }),
    importEntries: () => undefined,
    retrieve: async input => ({
      hits: [{
        id: 'genshin-border-quest',
        game: '原神',
        title: '前往国境线任务流程',
        content: '前往国境线是魔神任务行动目标，可结合章节标题、任务链步骤和当前目标距离判断玩家处于本章后段。',
        sourceUrl: 'https://wiki.biligame.com/ys/%E4%BB%BB%E5%8A%A1',
        score: 18,
      }],
      citations: [{ id: 'biligame-border', title: '前往国境线任务流程', url: 'https://wiki.biligame.com/ys/%E4%BB%BB%E5%8A%A1', author: 'Biligame Wiki', version: 'current', updatedAt: Date.now(), sourceType: 'web' }],
      filteredSources: [],
      retrievalSource: ['web'],
      tavilyRequestIds: ['tvly-test'],
      accountContext: { characters: [], summary: '公开账号上下文未参与本轮任务判断。' },
      fromCache: false,
      query: input.query,
      matchMode: 'web-first',
      guideIntent: 'quest',
      retrievalPolicy: 'web-first',
      localExactQaMatch: false,
      webTriggered: true,
      webUsed: true,
      webQueries: ['原神 前往国境线 任务 章节 剧情进度 剩余时长'],
      extractedUrls: ['https://wiki.biligame.com/ys/%E4%BB%BB%E5%8A%A1'],
    }),
  };
  const runtime = new AetherAgentRuntime({
    dataDir: testDataDir('quest-guide-answer'),
    knowledgeFile,
    token: 'test-token',
    knowledgeService,
    fetchImpl: async () => {
      modelCalls += 1;
      if (modelCalls === 1) {
        return response({
          id: 'vision-quest',
          model: 'vision-test',
          choices: [{ message: { content: JSON.stringify({
            contextKind: 'game',
            app: '原神',
            game: '原神',
            scene: 'story',
            summary: '当前剧情目标为前往国境线',
            facts: ['当前目标：前往国境线', '目标距离 325 米'],
            ocrText: ['前往国境线'],
            confidence: 0.9,
          }) } }],
        });
      }
      return response({
        id: 'deep-quest',
        model: 'deep-test',
        choices: [{ message: { content: JSON.stringify({
          answer: '这是任务进度判断，需要结合当前目标和任务流程给出具体结论。',
          playerAnswer: {
            answerKind: 'guide',
            conclusion: '“前往国境线”更像是当前魔神任务链中的推进目标，可以用它定位到本章后段，但剩余时长只能估算。',
            sections: [
              { title: '可确认信息', items: ['当前目标文字是“前往国境线”。', '画面目标距离约 325 米，说明你还在前往触发点的路上。'] },
              { title: '合理推断', items: ['结合任务流程来源，这个目标通常不是章节开头，而是已经进入当前任务链的中后段。', '如果后续还有对话、战斗或过场，剩余时间应按 20 到 40 分钟估算，而不是只看当前 325 米。'] },
              { title: '下一步', items: ['先到达国境线触发点，确认新任务名。', '触发后把任务标题发来，就能继续精确判断还剩几段。'] },
            ],
            basis: '参考 Biligame Wiki 任务流程与当前画面目标文字。',
            sourcesUsed: ['Biligame Wiki'],
          },
          observation: {
            contextKind: 'game',
            app: '原神',
            game: '原神',
            scene: 'story',
            summary: '当前剧情目标为前往国境线',
            facts: ['当前目标：前往国境线'],
            ocrText: ['前往国境线'],
            confidence: 0.9,
          },
          actions: ['到达国境线触发点', '记录触发后的任务标题'],
        }) } }],
      });
    },
  });
  const run = await runtime.run({
    query: '原神前往国境线这个目标在哪个章节，还剩多久？',
    persona: 'STORY',
    scene: 'story',
    mode: 'scan',
    analysisMode: 'deep',
    imageDataUrl: 'data:image/jpeg;base64,test',
    sourceName: '剧情任务截图',
  });
  assert.equal(run.playerAnswer.answerKind, 'guide');
  assert.match(run.answer, /可确认信息：/);
  assert.match(run.answer, /前往国境线/);
  assert.match(run.answer, /合理推断：/);
  assert.match(run.answer, /下一步：/);
  assert.doesNotMatch(run.answer, /当前队伍：/);
});

test('深渊机制与配队问题会生成多分面答案计划', async () => {
  let modelCalls = 0;
  const knowledgeService = {
    status: () => ({ knowledgeEntries: 2, accountCount: 1 }),
    importEntries: () => undefined,
    retrieve: async input => ({
      hits: [{
        id: 'genshin-abyss-boss',
        game: '原神',
        title: '12层第3间敌人与打法',
        content: '第12层第3间需要分别处理上半和下半敌人机制，队伍推荐需要结合破机制、输出窗口和生存压力。',
        sourceUrl: 'https://wiki.biligame.com/ys/%E6%B7%B1%E6%B8%8A',
        score: 20,
      }],
      citations: [{ id: 'abyss-wiki', title: '12层第3间敌人与打法', url: 'https://wiki.biligame.com/ys/%E6%B7%B1%E6%B8%8A', author: 'Biligame Wiki', version: 'current', updatedAt: Date.now(), sourceType: 'web' }],
      filteredSources: [],
      retrievalSource: ['account', 'web'],
      tavilyRequestIds: ['tvly-abyss'],
      accountContext: {
        account: { id: 'a', game: 'genshin', uid: '1', label: '测试账号', active: true, characterCount: 8 },
        characters: [],
        summary: '公开角色包含那维莱特、芙宁娜、玛薇卡、希诺宁、枫原万叶、茜特菈莉。',
      },
      fromCache: false,
      query: input.query,
      matchMode: 'web-first',
      guideIntent: 'abyss/endgame',
      retrievalPolicy: 'web-first',
      localExactQaMatch: false,
      webTriggered: true,
      webUsed: true,
      webQueries: ['原神 12层第3间 机制 打法 推荐队伍 上半 下半'],
      extractedUrls: ['https://wiki.biligame.com/ys/%E6%B7%B1%E6%B8%8A'],
    }),
  };
  const runtime = new AetherAgentRuntime({
    dataDir: testDataDir('abyss-guide-answer'),
    knowledgeFile,
    token: 'test-token',
    knowledgeService,
    fetchImpl: async () => {
      modelCalls += 1;
      if (modelCalls === 1) {
        return response({
          id: 'vision-abyss',
          model: 'vision-test',
          choices: [{ message: { content: JSON.stringify({
            contextKind: 'game',
            app: '原神',
            game: '原神',
            scene: 'roster',
            summary: '渊月螺旋12层第3间敌人列表',
            facts: ['上半 Boss', '下半 Boss', '三星时间目标'],
            ocrText: ['第12层 第3间', '上半', '下半'],
            confidence: 0.9,
          }) } }],
        });
      }
      return response({
        id: 'deep-abyss',
        model: 'deep-test',
        choices: [{ message: { content: JSON.stringify({
          answer: '这期12-3需要按上下半分别处理机制和队伍。',
          playerAnswer: {
            answerKind: 'guide',
            conclusion: '这不是单纯配队问题，要先按上下半机制拆，再决定队伍。',
            sections: [
              { title: '敌人和上下半', items: ['上半和下半都按 Boss 单体处理，队伍分配要避免把同一核心拆到两边。'] },
              { title: '关键机制', items: ['先观察免伤、蓄力条、召唤物或虚弱窗口，再决定爆发时间。'] },
              { title: '推荐队伍', items: ['上半优先放玛薇卡、希诺宁、枫原万叶、茜特菈莉这一类爆发队。', '下半优先放那维莱特、芙宁娜核心，容错更高。'] },
              { title: '打法步骤', items: ['开局先确认机制条或召唤物。', '等机制完成或虚弱窗口再集中交爆发。'] },
            ],
            basis: '参考 Biligame Wiki 深渊敌人信息与公开账号角色。',
            sourcesUsed: ['Biligame Wiki'],
          },
          observation: {
            contextKind: 'game',
            app: '原神',
            game: '原神',
            scene: 'roster',
            summary: '渊月螺旋12层第3间敌人列表',
            facts: ['上半 Boss', '下半 Boss'],
            ocrText: ['第12层 第3间'],
            confidence: 0.9,
          },
          actions: ['先打一次确认机制窗口', '按上下半分配队伍'],
        }) } }],
      });
    },
  });
  const run = await runtime.run({
    query: '这2个boss机制是什么，怎么打，这期新深渊有什么推荐队伍，上半下半怎么分？',
    persona: 'POWER',
    scene: 'roster',
    mode: 'scan',
    analysisMode: 'deep',
    imageDataUrl: 'data:image/jpeg;base64,test',
    sourceName: '深渊敌人截图',
  });
  assert.equal(run.playerAnswer.answerKind, 'guide');
  assert.ok(run.answerPlan.facets.includes('endgame'));
  assert.ok(run.answerPlan.facets.includes('mechanic'));
  assert.ok(run.answerPlan.facets.includes('team'));
  assert.ok(run.answerPlan.requiredSections.includes('关键机制'));
  assert.ok(run.answerPlan.requiredSections.includes('推荐队伍'));
  assert.match(run.answer, /敌人和上下半：/);
  assert.match(run.answer, /关键机制：/);
  assert.match(run.answer, /推荐队伍：/);
  assert.doesNotMatch(run.answer, /养成建议：/);
});

test('不同画像的 memory 相互隔离', () => {
  const runtime = new AetherAgentRuntime({
    dataDir: testDataDir('memory-isolation'),
    knowledgeFile,
    token: 'test-token',
    fetchImpl: async () => response(modelPayload('这是一条可靠的中文建议，请先锁定候选装备。')),
  });
  runtime.writeMemory('POWER', [{ id: 'power', label: '偏好', value: '追求强度' }]);
  runtime.writeMemory('STORY', [{ id: 'story', label: '偏好', value: '防剧透' }]);
  runtime.writeMemory('BALANCED', [{ id: 'balanced', label: '偏好', value: '随心游玩' }]);
  assert.equal(runtime.getMemory('POWER')[0].value, '追求强度');
  assert.equal(runtime.getMemory('STORY')[0].value, '防剧透');
  assert.equal(runtime.getMemory('BALANCED')[0].value, '随心游玩');
});

test('不同 UID 的 memory 相互隔离', () => {
  const runtime = new AetherAgentRuntime({
    dataDir: testDataDir('memory-account-isolation'),
    knowledgeFile,
    token: 'test-token',
    fetchImpl: async () => response(modelPayload('这是一条可靠的中文建议。')),
  });
  runtime.writeMemory('POWER', [{ id: 'a', label: '偏好', value: 'UID A 喜欢强度' }], 'genshin:100000001');
  runtime.writeMemory('POWER', [{ id: 'b', label: '偏好', value: 'UID B 喜欢收集' }], 'genshin:100000002');
  assert.equal(runtime.getMemory('POWER', 'genshin:100000001')[0].value, 'UID A 喜欢强度');
  assert.equal(runtime.getMemory('POWER', 'genshin:100000002')[0].value, 'UID B 喜欢收集');
});

test('scan 创建会话，chat 追问追加到同一会话并复用观察', async () => {
  const runtime = new AetherAgentRuntime({
    dataDir: testDataDir('conversation-flow'),
    knowledgeFile,
    token: 'test-token',
    fetchImpl: async () => response(modelPayload('这是一条基于当前会话的中文建议，请先检查队伍循环。')),
  });
  const scan = await runtime.run({
    query: '帮我看当前画面',
    persona: 'POWER',
    scene: 'gear',
    mode: 'scan',
    sourceName: '演示画面',
    accountKey: 'genshin:100000001',
  });
  assert.ok(scan.conversationId);
  let conversation = runtime.getConversation('genshin:100000001', scan.conversationId);
  assert.equal(conversation.messages.length, 2);
  assert.equal(conversation.lastObservation.summary, '识别到装备界面');
  assert.equal(conversation.lastRunSnapshot.id, scan.id);
  assert.equal(runtime.getRun(scan.id).answer, scan.answer);

  const followUp = await runtime.run({
    query: '那我下一步怎么配队',
    persona: 'POWER',
    scene: 'roster',
    mode: 'chat',
    includeVision: false,
    reuseLastObservation: true,
    conversationId: scan.conversationId,
    accountKey: 'genshin:100000001',
  });
  assert.equal(followUp.conversationId, scan.conversationId);
  conversation = runtime.getConversation('genshin:100000001', scan.conversationId);
  assert.equal(conversation.messages.length, 4);
  assert.equal(conversation.messages[2].text, '那我下一步怎么配队');
  assert.equal(followUp.observation.summary, '识别到装备界面');
  assert.equal(conversation.lastRunSnapshot.id, followUp.id);
  assert.equal(conversation.lastRunSnapshot.trace.length, followUp.trace.length);
});

test('skill 输出包含阶段、展示名和触发原因，并按场景跳过无关能力', async () => {
  const runtime = new AetherAgentRuntime({
    dataDir: testDataDir('skill-metadata'),
    knowledgeFile,
    token: 'test-token',
    fetchImpl: async () => response(modelPayload('这是一条完整的中文建议。')),
  });
  const gameRun = await runtime.run({
    query: '帮我看当前装备怎么调整',
    persona: 'POWER',
    scene: 'gear',
    mode: 'scan',
    sourceName: '演示画面',
    imageDataUrl: 'data:image/png;base64,AAAA',
    imageHash: 'game-image',
  });
  const skillById = Object.fromEntries(gameRun.skills.map(skill => [skill.id, skill]));
  assert.equal(skillById['observe.capture_source'].phase, 'observe');
  assert.equal(skillById['observe.capture_source'].displayName, '画面来源');
  assert.match(skillById['observe.capture_source'].triggerReason, /截图|输入/);
  assert.equal(skillById['knowledge.hybrid_rag'].phase, 'knowledge');
  assert.equal(skillById['reason.model_call'].phase, 'reason');
  assert.equal(skillById['answer.player_brief'].phase, 'answer');
  assert.equal(skillById['guard.safety_rules'].phase, 'guard');

  const desktopRun = await runtime.run({
    query: '总结这个网页',
    persona: 'BALANCED',
    scene: 'unknown',
    mode: 'chat',
    sourceName: '浏览器',
  });
  const desktopSkills = Object.fromEntries(desktopRun.skills.map(skill => [skill.id, skill]));
  assert.equal(desktopSkills['knowledge.hybrid_rag'].status, 'skipped');
  assert.equal(desktopSkills['context.public_account'].status, 'skipped');
  assert.match(desktopSkills['knowledge.hybrid_rag'].triggerReason, /不是游戏场景/);
});

test('会话列表支持首页限制和 AgentOps 全量读取', () => {
  const runtime = new AetherAgentRuntime({
    dataDir: testDataDir('conversation-list-scope'),
    knowledgeFile,
    token: 'test-token',
    fetchImpl: async () => response(modelPayload('这是一条完整的中文建议。')),
  });
  for (let index = 1; index <= 4; index += 1) {
    runtime.createConversation('genshin:100000001', { query: `原神历史会话 ${index}`, scene: 'gear' });
  }
  runtime.createConversation('starrail:200000001', { query: '星铁历史会话', scene: 'story' });

  const homeList = runtime.getConversations('genshin:100000001', 3);
  assert.equal(homeList.length, 3);
  assert.ok(homeList.every(item => item.accountKey === 'genshin:100000001'));

  const allList = runtime.getConversations('local:default', 200, { includeAll: true });
  assert.equal(allList.length, 5);
  assert.ok(allList.some(item => item.accountKey === 'starrail:200000001'));
});

test('真实成功结果会持久化，失败后明确进入缓存回放', async () => {
  const runtime = new AetherAgentRuntime({
    dataDir: testDataDir('live-cache'),
    knowledgeFile,
    token: 'test-token',
    fetchImpl: async () => response(modelPayload('这是一条真实模型生成的中文建议，请先检查装备词条。')),
  });
  const input = {
    query: '帮我判断这件装备',
    persona: 'POWER',
    scene: 'gear',
    mode: 'chat',
    sourceName: '纯文本',
  };
  const live = await runtime.run(input);
  assert.equal(live.source, 'live');
  assert.equal(live.requestId, 'chatcmpl-test-real-shape');
  assert.equal(live.metrics.cacheHit, false);

  runtime.fetchImpl = async () => response({ error: 'offline' }, false, 503);
  const replay = await runtime.run(input);
  assert.equal(replay.source, 'cache');
  assert.equal(replay.metrics.cacheHit, true);
  assert.match(replay.summary, /真实结果/);
});

test('没有缓存且模型失败时返回明确错误态', async () => {
  const runtime = new AetherAgentRuntime({
    dataDir: testDataDir('error-state'),
    knowledgeFile,
    token: 'test-token',
    fetchImpl: async () => response({ error: 'offline' }, false, 503),
  });
  const result = await runtime.run({
    query: '一个全新问题',
    persona: 'NEWBIE',
    scene: 'unknown',
    mode: 'chat',
    sourceName: '纯文本',
  });
  assert.equal(result.source, 'error');
  assert.equal(result.requestId, '');
  assert.equal(result.errors.length, 2);
});

test('本地 RAG 能命中游戏知识', () => {
  const runtime = new AetherAgentRuntime({
    dataDir: testDataDir('rag'),
    knowledgeFile,
    token: 'test-token',
    fetchImpl: async () => response(modelPayload('这是一条完整的中文建议。')),
  });
  const hits = runtime.retrieveKnowledge('双爆配平是什么意思', 'gear');
  assert.ok(hits.some(item => item.title === '双爆配平'));
});

test('知识包导入后立即更新检索结果', () => {
  const runtime = new AetherAgentRuntime({
    dataDir: testDataDir('knowledge-import'),
    knowledgeFile: path.join(testDataDir('knowledge-import'), 'knowledge.json'),
    token: 'test-token',
    fetchImpl: async () => response(modelPayload('这是一条完整的中文建议。')),
  });
  const imported = path.join(testDataDir('knowledge-import'), 'imported.json');
  fs.mkdirSync(path.dirname(imported), { recursive: true });
  fs.writeFileSync(imported, JSON.stringify({
    version: 'test-new',
    entries: [{ id: 'new', game: '原神', title: '夜魂机制', tags: ['夜魂'], content: '新版知识内容' }],
  }), 'utf8');
  runtime.importKnowledge(imported);
  assert.equal(runtime.status().knowledgeVersion, 'test-new');
  assert.equal(runtime.retrieveKnowledge('夜魂是什么', 'unknown')[0].title, '夜魂机制');
});
