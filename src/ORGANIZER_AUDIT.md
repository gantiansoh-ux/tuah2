# ORGANIZER AUDIT REPORT — Mike

> 生成日期: 2026-07-30
> 基于代码审查 + DB schema 分析

---

## 1. 已有功能完整清单

### 1.1 组织者仪表盘 (`/organizer`)
- **认证**：AuthProvider 验证，限制 organizer/admin 角色
- **Dashboard 统计**：显示 total/active/drafts/completed 卡片
- **Tournament 列表**：卡片网格显示所有 tournament（标题、类型、状态、日期、地点、poster 缩略图）
- **创建 Tournament 按钮** → `/organizer/create`
- **Profile 下拉菜单**：查看 profile / sign out
- **空状态**：无 tournament 时的引导 UI

### 1.2 创建 Tournament (`/organizer/create`)
- **5 步向导**：
  - Step 1: 选择 Tournament Type（11 种：junior/open/school/corporate/veteran/team_event/league/knockout/round_robin/ladder/festival）
  - Step 2: 基本信息（名称、描述、场地 VenuePicker、日期起止、报名截止、报名费、奖品）
  - Step 3: 媒体 & 规则（Poster/Banner/Logo 上传、Markdown 规则）
  - Step 4: Categories（年龄组/性别/类型/分数/格式/Deuce 设置，可添加/删除多个分类）
  - Step 5: 确认页，提交创建
- **文件上传**：使用 `/api/upload` endpoint
- **成功重定向** → `/organizer/{id}`

### 1.3 Tournament 详情页 (`/organizer/[tournamentId]`)
- **Header**：标题、状态徽章、场地、日期、统计（players/cats）、媒体缩略图
- **操作按钮**：
  - ✏️ Edit（Modal：编辑标题、描述、场地、日期）
  - +Category（Modal：创建新分类）
  - +Player（Modal：手动添加单个玩家）
  - 📥 CSV（Modal：从 CSV 导入玩家）
  - Publish（draft → published）
  - 🎲 Generate Draw（选择 draw format 后生成对阵）
  - 👤 Umpires（Modal：管理裁判分配）
  - 📱 QR（Modal：显示报名二维码）
  - 🔗 Link（复制 tournament 链接）
  - 🗑 Delete（draft 状态可删除）
- **5 个 Tab**：
  - **Overview**：stats 卡片、分类列表、缺少分类/玩家时的引导
  - **Players**：表格展示全部选手（可点击编辑姓名、设置种子编号、删除选手）
  - **Draw**：完整的对阵图/分组展示（自动检测 draw 类型：knockout/double elimination/swiss/group+KO 等，使用 BracketView 组件）
  - **Live Matches**：当前比赛列表（显示状态、裁判下拉分配、跳转到 umpire pad）
  - **Registrations**：在线报名管理（approve/reject、显示证件链接、支付状态）
- **导出按钮**：Export Draw Report / Export Results Report → `/api/reports/${id}`

### 1.4 对阵图支持（Draw Formats）
- Knockout（单败淘汰）
- Round Robin（循环赛）
- Swiss System（瑞士制）
- Double Elimination（双败淘汰）
- Group + Knockout（小组+淘汰赛）
- Manual（手动分配）
- Protected Draw（同俱乐部回避）
- Club Separation（俱乐部拆分到两大半区）

### 1.5 API Routes

#### `/api/tournaments/`
| Route | Method | 功能 |
|---|---|---|
| `/api/tournaments/list` | GET | 获取当前 organizer 的 tournament 列表 |
| `/api/tournaments/create` | POST | 创建 tournament（含 categories） |
| `/api/tournaments/[id]` | GET | 加载单个 tournament（含 categories/entries/matches/games） |
| `/api/tournaments/[id]` | PATCH | 更新 tournament 信息 |
| `/api/tournaments/[id]` | DELETE | 删除 tournament |
| `/api/tournaments/[id]/draw` | POST | 生成对阵图（8 种格式） |
| `/api/tournaments/[id]/matches` | POST/PUT | 创建/批量创建 match |
| `/api/tournaments/public` | GET | 公开 tournament 列表（公众页用） |

#### `/api/categories/`
| Route | Method | 功能 |
|---|---|---|
| `/api/categories/create` | POST | 创建分类 |
| `/api/categories` | POST | 创建分类（detail page 增加分类用） |
| `/api/categories/[id]` | DELETE | 删除分类 |
| `/api/categories/[id]` | PATCH | 更新分类 |

#### `/api/entries/`
| Route | Method | 功能 |
|---|---|---|
| `/api/entries/create` | POST | 添加选手条目（self-registration 限制） |
| `/api/entries/import` | POST | CSV 批量导入选手 |
| `/api/entries/[id]` | GET | 获取单条 entry |
| `/api/entries/[id]` | PATCH | 更新 entry（seed, names, registration_status 等） |
| `/api/entries/[id]` | DELETE | 删除 entry |

#### `/api/matches/`
| Route | Method | 功能 |
|---|---|---|
| `/api/matches/[id]` | PATCH | 更新比赛（分配裁判、设置状态等） |

#### `/api/admin/`
| Route | Method | 功能 |
|---|---|---|
| `/api/admin` | GET | 管理后台数据（profiles/tournaments/stats） |
| `/api/admin/[id]` | PATCH | 修改用户角色 |

---

## 2. 缺少的功能 / Gaps

### 2.1 ⚠️ 严重缺口

1. **❌ 没有 Tournament 编辑页面的完整实现**
   - Edit Modal 只支持 4 个字段（title/description/venue/dates）
   - 不能修改: tournament_type, poster/banner/logo, rules, prize, entry_fee, registration_deadline
   - 没有修改 tournament 状态状态的 UI（除了 publish）

2. **❌ 没有批量分配裁判/场地/时间功能**
   - Live Matches tab 可以逐个分配，但没有批量操作
   - 没有场地管理模块（time slot, court assignment）

3. **❌ 没有通知系统**
   - tournament 状态变更/比赛安排/报名结果 → 没有推送/邮件/内站通知

4. **❌ 没有选手 Check-in 系统**
   - entries 表有 `checked_in: boolean` 字段，但 organizer 页没有 check-in UI
   - 完整比赛日需要选手签到管理

5. **❌ 没有支付集成**
   - entries 表有 payment_status, payment_method, payment_reference
   - payments 表也建立了
   - 但 organizer 页只能看到状态，不能发起/处理支付

### 2.2 🟡 中等优先

6. **缺少 Tournament 复制/克隆功能**
   - 办系列赛（每月 open）需要复制模板

7. **缺少 Schedule/日历视图**
   - 当前只有 match 列表，没有按场地+时间组织的赛程表/日历

8. **缺少比赛结果手动录入**
   - 依赖 umpire/v2 入口，如果裁判不在，organizer 无法手动录入比分

9. **缺少积分排名/Leaderboard**
   - Draw tab 只显示 bracket，没有选手排名/积分榜

10. **缺少多语言支持**
    - 全部硬编码英文

### 2.3 🟢 低优先 / Nice-to-have

11. **没有 Tournament 模板/预设**
12. **没有报名表单自定义**（extra fields）
13. **没有 Sponsor display**
14. **没有 Live streaming/embed**
15. **没有 导出为 PDF/Excel**（现在有 export draw/results report 但未确认格式）
16. **没有 批量更新 match scores**
17. **没有 统计图表**（参赛人数趋势、age group 分布等）

---

## 3. Turborite 代码的问题 & 坑

### 3.1 🔥 严重问题

#### Q1: DRAW GENERATION — `Protected` 格式的 `bracket_group` 字段数据库没有
- 前端在 Draw tab 按 `m.bracket_group` 分组显示
- 但 matches 表 **没有 `bracket_group` 字段**！
- `matches` 表的列：`id, tournament_id, category_id, round, match_number, court_number, scheduled_time, umpire_id, entry_1_id, entry_2_id, winner_entry_id, status, next_match_id, loser_match_id, notes, line_judge_id, camera_assigned, court_status, toss_winner_entry_id, toss_chose_side`
- Draw route 的 `autoGenerateDraw` 如果要写 `bracket_group`，会直接报错
- 非 Protected 格式可能用 `round` 字段区分 WB/LB（double elimination），这没问题

- [2026-08-08 FIXED] bracket_group column EXISTS in live DB (matches.bracket_group text) - verified via information_schema; draw route writes it fine.
#### Q2: `entries.player_1_id / player_2_id` 是 NOT NULL 但前端允许空
- DB schema: `player_1_id uuid NOT NULL`，但导入 CSV 时可能存在空行
- 且前端有逻辑 `getPlayerName(e)` 会返回 "TBD"，但 DB 会拒绝 NULL `player_1_id`
- CSV 导入的 `findOrCreateProfile` 如果找不到/创建失败，也会破坏 NOT NULL 约束

#### Q3: CSV 导入使用模糊 `findOrCreateProfile` 机制
- 直接根据字符串创建 profiles，没有区分同名用户
- 可能导致：同名的人被合并到同一个 profile，或者 duplicate profiles

#### Q4: 报名费 (entry_fee) 的语义混乱
- 前端 UI 写 "Entry Fee / Total Price (RM)"
- DB field `entry_fee numeric(10,2)` default 0
- categories 表也有 `fee numeric(10,2)` default 0
- 没有 clear 的关联 — 是 per-category 收费还是 per-tournament 收费？

### 3.2 🟡 逻辑问题 / 设计缺陷

#### Q5: `entries/create` 限制 "只能自己报名"，但 organizer 页面需要添加选手
- API route 的逻辑：
  ```
  if (entryPlayerId !== payload.userId) {
    return NextResponse.json({ error: "You can only register yourself..." }, { status: 403 });
  }
  ```
- 这意味着 **organizer 不能通过 API 为其他人报名**
- 但在前端 detail page，`addSinglePlayer` 通过 `/api/entries/create` 添加选手
- 而 CSV import 通过 `/api/entries/import` 直接插入无限制
- **矛盾**：一个 API 不允许，另一个允许

#### Q6: 在线注册流程未完成
- `tournament_registrations` 表：players 报名 tournament 级别
- `entries` 表：players 报名 specific categories
- 前端 Registrations tab 混合了两者（`entries.filter(e => e.registration_status)` + `registrations`）
- `approveRegistration` 只 PATCH `tournament_registrations`，没有同步创建 `entries`
- **报名审批不会自动产生 entry**，两者脱节

#### Q7: Registration tab 统计计数重复
- Stats Row 在 Registration tab 中：
  ```
  entries.filter(e => e.registration_status === 'pending').length + registrations.filter(r => r.status === 'pending').length
  ```
- 如果一个人在 entries 和 registrations 里都有 pending 状态，会被 **重复计数**

#### Q8: `winner_id` vs `winner_entry_id`
- `games` 表有 `winner_id` (指向 entries)
- `matches` 表有 `winner_entry_id` (指向 entries)
- 前端 `enrichWithScores` 只用 game scores，没有使用 match-level `winner_entry_id`
- 可能存在数据不一致

#### Q9: Scoring config 的格式不一致
- 创建 tournament 时前端传 `scoring_config: { points_per_game, best_of, deuce, deuce_cap, serve_switch }`
- DB `categories.scoring_config` 是 jsonb，默认值也是这些字段
- 但部分代码（detail page 编辑分类）用 `catForm` 的独立字段（points/bestOf/deuce）构建
- 没有统一的 scoring config validator

#### Q10: `winner_id` 在 games 表可为 NULL
- `games.winner_id` → `entries(id)` 的 FK，nullable
- 但如果一个 game 完成但 `winner_id` 为 NULL，前端无法显示谁赢了 game

### 3.3 🔧 代码质量 / 维护性问题

#### Q11: 行末混杂 CRLF/LF
- `organizer/[tournamentId]/page.tsx` 部分行用 `\r\n`(CRLF) 部分用 `\n`(LF)
- 可能在不同环境下导致 lint/format 问题

#### Q12: 大文件 — `tournament detail page` 超过 2000 行
- 单个 page component 过于庞大
- Modal/Category section/Bracket display 应拆分为独立组件

#### Q13: 硬编码的 `STATUS_STYLES` / `STATUS_LABELS` 多处重复
- `organizer/page.tsx` 有 `STATUS_KEYS`, `getStatusStyle`
- `tournament detail page` 又有 `STATUS_STYLES`, `STATUS_LABELS`
- 应统一在 `@/lib/constants` 或 types 中

#### Q14: 类型定义冗余
- `organizer/page.tsx` 自定义 `Tournament` interface（只含部分字段）
- `tournament detail page` 从 `@/lib/types` import 类型
- 部分地方用 `any` 类型（matches, games 等）

#### Q15: Edit tournament API 没有验证 organizer 权限
- `PATCH /api/tournaments/[id]` 检查 cookie 但可能没有 **判断是否是 tournament owner**
- 需要验证 `organizer_id === payload.userId`

#### Q16: Toss 相关字段在前端未使用
- `matches` 表有 `toss_winner_entry_id`, `toss_chose_side`
- 前端 scorer/umpire pad 之外没有 UI 处理 toss

#### Q17: `court_name` 在 frontend 使用但表里有 `court_number`(int)
- Frontend: `m.court_name` 和 DB matches 的 `court_number`(integer) 不匹配
- Draw tab 显示 `{m.court_name || ""}`，但表里没有 court_name 列
- Live Matches tab 也用 `m.court_name`
- [2026-08-08 FIXED] ALTER TABLE matches ADD COLUMN court_name text applied to live DB; PATCH /api/matches/{id} with court_name verified 200 and persisted (BUG-010). self_hosted_schema.sql aligned.

#### Q18: 没有 TypeScript strict mode 使用
- 多处用 `any`，没有 strict null checks
- 可能导致运行时错误

---

## 4. DB Schema 完整性检查

| 表名 | 状态 | 备注 |
|---|---|---|
| tournaments ✅ | 完整 | 19 列 + indexes + check constraints |
| categories ✅ | 完整 | scoring_config 用 jsonb，灵活 |
| entries ✅ | 完整 | 支持 singles/doubles、注册状态、支付状态 |
| matches ✅ | 完整 | 包含 toss/camera/umpire 等高级字段 |
| games ✅ | 完整 | per-game 分数追踪 |
| point_logs ✅ | 完整 | 逐点计时日志 |
| card_logs ✅ | 完整 | 黄/红牌记录 |
| profiles ✅ | 完整 | 用户信息（支持 player/organizer/umpire 角色） |
| tournament_registrations ✅ | 存在 | 在线报名 |
| payments ✅ | 存在 | 支付记录 |
| umpire_reviews ✅ | 存在 | 裁判评价 |

**注意**：没有 `users` 表（只有 `profiles`），design 是 profile-first auth。

---

## 5. 总结

### 优点
- 功能覆盖广：创建、管理、对阵生成、报名管理一应俱全
- 8 种 draw format 支持，在同类系统中少见
- DB schema 设计合理，扩展性好
- UI 相对完善（Loading/Empty/Error states）

### 最关键修复点 (Priority)
1. 🔴 `bracket_group` 字段缺失 — draw 显示可能报错
2. 🔴 `court_name` vs `court_number` 字段不匹配 — 前端引用不存在列
3. 🔴 `entries/create` 阻塞 organizer 手动添加选手 — 与 CSV import 逻辑矛盾
4. 🟡 Registration 审批不自动创建 entry
5. 🟡 缺少批量裁判/场地分配
6. 🟡 Edit Modal 字段有限

### 建议下一步
- 修复 DB 字段不一致（bracket_group, court_name）
- 统一 entries/create API 逻辑（区分 self-registration vs organizer-add）
- 实现 registration → entry 的自动化同步
- 拆分庞大 detail page 为子组件
- 统一类型定义和常量到共享模块
