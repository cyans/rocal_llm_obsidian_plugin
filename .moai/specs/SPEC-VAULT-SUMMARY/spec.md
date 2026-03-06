---
id: SPEC-VAULT-SUMMARY
title: 볼트 파일 요약 및 글쓰기 재료 추출 기능
version: 1.2.0
status: Reviewed
created: 2026-03-06
updated: 2026-03-06
author: cyan91
priority: High
---

# SPEC-VAULT-SUMMARY: 볼트 파일 요약 및 글쓰기 재료 추출

## HISTORY

### 2026-03-06 - 초기 작성
- 볼트 내 파일 내용을 읽고 요약하는 기능 초안 작성
- CLI 우선 전략과 별도 UI 컴포넌트 아이디어 포함

### 2026-03-06 - 구현 가능성 검토 후 수정
- 현재 플러그인 구조에 맞춰 API-first 방식으로 재정의
- 별도 FileSelector/SummaryView 중심 설계 대신 ChatView 통합 방식으로 변경
- CLI 우선 요구사항을 제거하고 향후 실험 항목으로 격하
- 구현 가능한 MVP 범위와 후속 확장 범위를 분리

### 2026-03-06 - CLI 활용 방향 재조정
- CLI를 전체 읽기 대체 수단이 아니라 사전 축약 최적화 경로로 재정의
- `search`, `outline`, `links`, `backlinks`, `read` 명령의 역할 분리
- API 기본 경로는 유지하되, CLI 사용 가능 시 토큰 절감용 프리프로세싱 허용

---

## 1. GOAL

사용자가 볼트 내 하나 이상의 노트를 선택하거나 지정했을 때, 플러그인이 해당 내용을 읽고:

1. 짧고 신뢰 가능한 요약을 생성하고
2. 글쓰기 재료로 재구성하며
3. 필요 시 결과를 새 노트로 저장할 수 있게 한다.

이 기능은 기존 채팅 기반 워크플로우 안에서 동작해야 하며, 현재 코드베이스의 `ChatView`, `AgentController`, `ToolRegistry`, `LLMService` 패턴을 재사용해야 한다.

## 2. IMPLEMENTATION FEASIBILITY

### 2.1 결론

이 기능은 **충분히 구현 가능**하다. 다만 초기 스펙의 일부는 현재 프로젝트 구조와 맞지 않거나 과도하게 낙관적이다.

### 2.2 바로 구현 가능한 범위

- Obsidian API 기반 파일 읽기
- 단일 파일 요약
- 다중 파일 요약
- 목차 기반 재구성
- 결과를 채팅 응답으로 표시
- 결과를 새 노트로 저장
- 선택적 CLI 기반 사전 축약

### 2.3 현재 스펙에서 비현실적이거나 수정이 필요한 부분

- Obsidian CLI 전체 우선 전략:
  파일 전체 본문 읽기까지 CLI를 기본 경로로 삼는 것은 배포성과 안정성을 떨어뜨린다. 대신 후보 축소, 헤딩 추출, 링크 관계 수집 같은 프리프로세싱 단계에 한정하면 현실성이 있다.
- 별도 `FileSelector`, `SummaryView` 중심 UI:
  현재 제품은 채팅 인터페이스 중심이다. 별도 화면보다 `ChatView` 확장이 비용 대비 효과가 크다.
- “중요한 내용을 누락하지 않아야 한다”:
  검증 불가능한 절대 요구다. 대신 핵심 항목 수, 출처 표시, 청크별 요약 후 병합 같은 측정 가능한 요구로 바꿔야 한다.
- 인코딩 오류 처리:
  Obsidian API가 읽는 텍스트 파일 기준으로는 우선순위가 낮다. MVP 범위에서는 제외해도 된다.

## 3. ENVIRONMENT

### 3.1 기술 환경

- 런타임: Obsidian Desktop App
- 언어: TypeScript 5.x
- 파일 접근: Obsidian Plugin API (`vault.read`, `vault.cachedRead`)
- LLM 백엔드: 기존 `LLMService`
- UI: 기존 `ChatView`

### 3.2 통합 대상

- `src/ui/ChatView.ts`
- `src/agent/AgentController.ts`
- `src/agent/ToolRegistry.ts`
- `src/llm/LLMService.ts`
- 기존 파일 쓰기 도구

### 3.3 제약 사항

- 모든 읽기/요약은 사용자의 로컬 볼트 범위 안에서만 수행한다.
- 대형 문서는 한 번에 전체를 LLM으로 보내지 않는다.
- 원본 파일은 사용자 요청 없이는 수정하지 않는다.
- CLI는 사용 가능 여부가 환경과 라이선스에 따라 달라질 수 있다.

## 4. ASSUMPTIONS

### 4.1 사용자 가정

- 사용자는 활성 파일 또는 파일 경로/검색어로 대상 문서를 지정할 수 있다.
- 사용자는 “요약”, “핵심 포인트”, “목차별 정리”, “글감 추출” 같은 자연어 명령을 사용할 수 있다.

### 4.2 데이터 가정

- 대상 파일은 주로 Markdown 노트다.
- 파일 크기와 개수는 LLM 컨텍스트 한도를 초과할 수 있다.

### 4.3 시스템 가정

- 기존 LLM 연결은 정상 동작한다.
- 기존 `write_to_file` 도구를 통해 결과 저장이 가능하다.

## 5. REQUIREMENTS

### 5.1 Functional Requirements

**REQ-001**: 시스템은 단일 파일 내용을 읽어 요약할 수 있어야 한다.

**REQ-002**: 시스템은 여러 파일을 읽어 개별 요약과 통합 요약을 생성할 수 있어야 한다.

**REQ-003**: 시스템은 사용자가 제공한 목차 또는 섹션 목록에 맞춰 내용을 재구성할 수 있어야 한다.

**REQ-004**: 시스템은 각 요약 결과에 원본 출처 파일 경로를 포함해야 한다.

**REQ-005**: 시스템은 결과를 채팅 메시지로 우선 표시해야 하며, 필요 시 새 노트 저장으로 이어질 수 있어야 한다.

**REQ-006**: 시스템은 활성 파일이 있으면 해당 파일을 기본 입력으로 사용할 수 있어야 한다.

### 5.2 Safety Requirements

**REQ-007**: 시스템은 사용자 명시 요청 없이 원본 파일을 수정하지 않아야 한다.

**REQ-008**: 시스템은 여러 파일을 종합할 때, 어떤 파일에서 근거가 왔는지 표시해야 한다.

**REQ-009**: 시스템은 읽기 실패, 빈 파일, 요약 실패를 구분된 오류로 반환해야 한다.

### 5.3 Scale Requirements

**REQ-010**: 파일 크기가 임계값을 넘으면 시스템은 문서를 청크로 분할해 처리해야 한다.
- 초기 기준값: 20,000자 또는 100KB 중 먼저 도달하는 값

**REQ-011**: 다중 파일 요청 시 시스템은 처리 대상 수를 제한해야 한다.
- MVP 기본값: 최대 10개 파일

### 5.4 Quality Requirements

**REQ-012**: 요약 결과는 최소한 다음 필드를 가져야 한다.
- `summary`
- `key_points`
- `sources`

**REQ-013**: 요약 스타일은 최소 3가지를 지원해야 한다.
- `bullets`
- `paragraph`
- `outline`

**REQ-014**: 글쓰기 재료 추출 결과는 섹션별 메모 또는 아이디어 리스트 형태로 반환할 수 있어야 한다.

### 5.5 Optional CLI Optimization Requirements

**REQ-015**: 시스템은 Obsidian CLI가 사용 가능할 경우, 후보 문서 축소를 위해 `search` 명령을 사용할 수 있어야 한다.

**REQ-016**: 시스템은 토큰 절감을 위해 전체 본문 대신 `outline`, `links`, `backlinks` 결과를 먼저 사용할 수 있어야 한다.

**REQ-017**: 시스템은 CLI 최적화가 실패하거나 사용 불가능할 경우 즉시 Obsidian API 경로로 fallback 해야 한다.

**REQ-018**: CLI 사용 여부와 적용된 전략(`search`, `outline`, `read`, `api`)을 결과 메타데이터 또는 디버그 상태에 표시할 수 있어야 한다.

## 6. ARCHITECTURE DECISION

### 6.1 API-first with CLI-assisted pre-processing

MVP의 기본 읽기 경로는 **Obsidian API**다.

다만 CLI가 사용 가능하면, 다음과 같은 **사전 축약 단계**에 한해 선택적으로 사용한다.

- `search`: 관련 파일 후보 축소
- `outline`: 문서 구조만 추출
- `links`, `backlinks`: 문서 관계 수집
- `read`: 최종적으로 선택된 소수 파일 본문 확보

이유:
- 현재 플러그인 구조와 자연스럽게 맞는다.
- 플랫폼 간 차이가 적다.
- CLI가 없어도 기능이 유지된다.
- 테스트가 훨씬 쉽다.
- 토큰 절감과 후보 축소에는 CLI의 장점을 선택적으로 활용할 수 있다.

### 6.2 Chat-first UI

MVP는 별도 전용 뷰를 만들지 않고 `ChatView` 안에서 동작한다.

예시:
- “현재 파일 요약해줘”
- “선택한 파일들 핵심만 bullet로 정리해줘”
- “이 노트들을 아래 목차 기준으로 정리해줘”

### 6.3 Tool-oriented integration

기능은 에이전트 도구로 노출하는 것이 기본이다.

권장 도구 구성:
- `vault_read_contents`
- `vault_summarize`
- `outline_organize`

추가 유틸리티 계층:
- `obsidianCliAdapter` 또는 `vaultPreprocessor`

## 7. TOOL SPECIFICATION

### 7.1 Tool 1: `vault_read_contents`

목적: 하나 이상의 볼트 파일을 읽고 메타데이터와 함께 반환

파라미터:
- `file_paths` (string[], required)
- `max_chars_per_file` (number, optional)

반환 형식:

```json
{
  "success": true,
  "files": [
    {
      "file_path": "notes/project.md",
      "title": "project",
      "content": "문서 내용",
      "char_count": 1200,
      "word_count": 320,
      "truncated": false
    }
  ],
  "errors": []
}
```

구현 메모:
- `vault.getAbstractFileByPath()`
- `vault.cachedRead()` 우선, 필요 시 `vault.read()`
- CLI 사용 가능 시 `read`는 선택된 소수 파일에만 적용
- 너무 긴 문서는 잘라서 반환하거나 청크 처리 경로로 넘김

### 7.2 Tool 2: `vault_summarize`

목적: 읽은 문서를 요약하고 핵심 포인트를 생성

파라미터:
- `inputs` (array, required)
- `style` (string, optional)
- `max_output_tokens` (number, optional)
- `combine` (boolean, optional)

입력 예시:

```json
{
  "inputs": [
    {
      "file_path": "notes/project.md",
      "content": "..."
    }
  ],
  "style": "bullets",
  "combine": true
}
```

반환 형식:

```json
{
  "success": true,
  "summaries": [
    {
      "file_path": "notes/project.md",
      "summary": "핵심 요약",
      "key_points": ["포인트 1", "포인트 2"]
    }
  ],
  "combined_summary": "통합 요약",
  "sources": ["notes/project.md"]
}
```

구현 메모:
- CLI `search` 결과나 `outline` 결과를 입력 축약에 활용 가능
- 입력이 길면 청크별 1차 요약 후 병합
- 최종 응답에는 파일별 요약과 통합 요약을 모두 담을 수 있음

### 7.3 Tool 3: `outline_organize`

목적: 여러 문서 내용을 목차 기준으로 정리해 글쓰기 재료를 만든다

파라미터:
- `inputs` (array, required)
- `outline` (string[], required)
- `mode` (string, optional: `notes` | `draft_material`)

반환 형식:

```json
{
  "success": true,
  "sections": [
    {
      "title": "문제 정의",
      "content": "이 섹션에 들어갈 핵심 메모",
      "sources": ["notes/a.md", "notes/b.md"]
    }
  ]
}
```

구현 메모:
- CLI `outline`과 `backlinks`는 섹션 분류의 보조 신호로 사용 가능
- 완전 자동 분류보다 “초안 재료 생성”을 목표로 한다.
- 각 섹션은 문장 단위 초안 또는 bullet 메모 형태로 반환 가능하다.

## 8. PROMPTING STRATEGY

### 8.1 요약 프롬프트 원칙

- 과장 없이 핵심 내용만 요약
- 추정과 사실을 구분
- 출처 파일명을 명시
- 길 경우 섹션별로 먼저 요약 후 최종 병합
- 가능하면 전체 본문 대신 검색 매치, outline, 링크 정보부터 사용해 입력 크기를 줄인다.

### 8.2 글쓰기 재료 추출 원칙

- 목차 섹션별 관련 근거를 모은다.
- 원문을 그대로 복붙하지 않고 압축된 메모 형태로 정리한다.
- 불충분한 섹션은 “근거 부족”으로 표기할 수 있다.

## 9. IMPLEMENTATION PLAN

### Phase 1: MVP

범위:
- 활성 파일 또는 명시된 파일 경로 읽기
- 단일 파일 요약
- 채팅 결과 표시
- API 경로 기반 구현

대상 파일:
- `src/tools/VaultReadContentsTool.ts`
- `src/tools/VaultSummarizeTool.ts`
- `src/agent/ToolRegistry.ts`
- `src/ui/ChatView.ts`

완료 기준:
- “현재 파일 요약해줘”가 동작한다.
- 파일이 없거나 비어 있으면 명확한 오류가 나온다.

### Phase 2: Multi-file summary

범위:
- 다중 파일 읽기
- 파일별 요약 + 통합 요약
- 처리 수 제한
- 검색 기반 후보 축소

완료 기준:
- 최대 10개 파일까지 요약 가능
- 파일별 출처가 표시된다.

### Phase 3: Outline-based organization

범위:
- 목차 입력 기반 재구성
- 글쓰기 재료 출력
- 새 노트 저장 연동
- outline/backlinks 보조 활용

완료 기준:
- “이 목차 기준으로 정리해줘” 요청이 동작한다.

### Phase 4: CLI-assisted optimization

범위:
- CLI 감지
- `search`, `outline`, `links`, `backlinks` 프리프로세싱
- `read`의 제한적 사용
- API fallback

완료 기준:
- CLI가 있으면 후보 축소 또는 구조 추출에 활용된다.
- CLI가 없어도 동일 요청이 API 경로로 계속 처리된다.

## 10. FILE IMPACT ANALYSIS

### New Files

```text
src/tools/VaultReadContentsTool.ts
src/tools/VaultSummarizeTool.ts
src/tools/OutlineOrganizerTool.ts
src/utils/obsidianCliAdapter.ts
src/utils/vaultPreprocessor.ts
```

### Modified Files

```text
src/agent/ToolRegistry.ts
src/agent/PromptBuilder.ts
src/ui/ChatView.ts
src/types.ts
__tests__/unit/agent/ToolRegistry.test.ts
__tests__/unit/agent/AgentController.test.ts
__tests__/unit/utils/obsidianCliAdapter.test.ts
```

### Not Needed For MVP

```text
src/ui/FileSelector.ts
src/ui/SummaryView.ts
```

## 11. ACCEPTANCE CRITERIA

### Scenario 1: 활성 파일 요약

```text
GIVEN 사용자가 Markdown 파일을 열어 둔 상태에서
WHEN "현재 파일 요약해줘"라고 요청하면
THEN 시스템은 해당 파일을 읽고 요약을 반환한다
```

### Scenario 2: 여러 파일 통합 요약

```text
GIVEN 사용자가 2개 이상의 파일 경로를 지정하고
WHEN 통합 요약을 요청하면
THEN 시스템은 각 파일 요약과 전체 요약을 함께 반환한다
```

### Scenario 3: 목차별 글쓰기 재료 추출

```text
GIVEN 사용자가 목차와 관련 파일을 제공하고
WHEN 정리를 요청하면
THEN 시스템은 섹션별 메모와 출처를 반환한다
```

### Scenario 4: 긴 문서 처리

```text
GIVEN 문서가 LLM 입력 한도를 넘을 만큼 길고
WHEN 요약을 요청하면
THEN 시스템은 청크 기반으로 처리한 뒤 최종 요약을 반환한다
```

### Scenario 5: CLI 기반 후보 축소

```text
GIVEN Obsidian CLI가 사용 가능하고 관련 파일이 많은 상황에서
WHEN 사용자가 특정 주제 요약을 요청하면
THEN 시스템은 search 또는 outline 결과를 먼저 활용해 입력 범위를 줄일 수 있다
```

### Scenario 6: CLI fallback

```text
GIVEN CLI가 설치되어 있지 않거나 실행에 실패하고
WHEN 동일 요청이 들어오면
THEN 시스템은 API 경로로 자동 전환해 기능을 계속 제공한다
```

## 12. NON-FUNCTIONAL REQUIREMENTS

### 성능

- 20KB 이하 단일 문서 읽기: 체감상 즉시
- 단일 문서 요약: 정상 환경에서 15초 이내 목표
- 다중 문서 요약: 파일 수와 모델 속도에 비례해 점진적으로 응답

### 신뢰성

- 파일별 실패를 전체 실패로 즉시 승격하지 않는다.
- 부분 실패 시 성공/실패 파일을 분리해 알려준다.

### 사용성

- 결과는 바로 복사 가능한 Markdown 형태여야 한다.
- 파일 경로와 출처가 응답 안에 명시돼야 한다.
- 디버그 모드에서는 CLI/API 어떤 경로가 사용됐는지 확인 가능해야 한다.

## 13. OUT OF SCOPE

이번 스펙 범위에서는 아래를 제외한다.

- 전용 파일 선택 다이얼로그
- 전용 요약 결과 화면
- 임베딩 기반 추천
- 민감 정보 자동 마스킹

## 14. REVIEW NOTES

이 스펙은 현재 코드베이스 기준으로 “바로 구현 가능한 범위”에 맞춰 수정되었다. CLI는 더 이상 전체 대체 전략이 아니라, 후보 축소와 토큰 절감을 위한 선택적 프리프로세싱 계층으로 정의한다.
