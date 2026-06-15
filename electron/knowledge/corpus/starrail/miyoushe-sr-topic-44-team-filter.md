---
id: starrail-miyoushe-topic-44-team-filter
game: 崩坏：星穹铁道
topic: 阵容推荐
scene: team
title: 米游社阵容推荐话题过滤规则
tags: [阵容推荐, topic_id_44, 配队, 米游社, 过滤规则]
sourceUrl: https://www.miyoushe.com/sr/topicDetail/44
sourceTitle: 米游社星铁阵容推荐话题
author: 米游社玩家社区
sourceType: community
sourceTier: curated
version: 2026.06.15
updatedAt: 2026-06-15T00:00:00.000Z
confidence: 0.9
---
米游社星铁 topic_id=44 对应“阵容推荐”话题，可返回最新阵容帖。2026-06-15 抓取样例中包含“将杀王棋”“星启模式”等高时效阵容标题，但大量帖子正文只有图片或很短说明。

入库规则：只有当标题或正文明确包含队伍、关卡、配置、分数、轮次、角色名和可复述打法时，才写入知识卡。纯图片帖、只有“六金0轮队”这类标题但缺少配置说明的帖子，只可作为可追溯来源入口，不能当成 RAG 结论。若需要使用图片阵容，应在 UI 或后续抓取中做图片 OCR 后再沉淀。

回答阵容推荐时优先使用已清洗的角色攻略、配队文章和本地可验证卡片；只有本地不足时，再把 topic_id=44 作为最新阵容兜底搜索。
