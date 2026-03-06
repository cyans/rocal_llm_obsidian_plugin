---
id: SPEC-PLUGIN-001
title: Obsidian Vault Agent Plugin - Acceptance Criteria
version: 1.0.0
status: Planned
created: 2026-03-05
updated: 2026-03-05
author: cyan91
priority: High
---

# Acceptance Criteria: Obsidian Vault Agent Plugin

## TAG Block
```
TAG: SPEC-PLUGIN-001
PHASE: Acceptance Testing
FORMAT: Gherkin (Given-When-Then)
COVERAGE_TARGET: 85%
```

---

## 1. Tool 1: Vault Search (볼트 검색)

### 1.1 기본 검색 기능

**Scenario: 키워드 기반 볼트 검색**
```gherkin
Given 사용자가 볼트에 "AI Automation" 관련 노트를 가지고 있음
And 사용자가 채팅 입력창에 "볼트에서 AI 자동화 관련 노트를 찾아줘"를 입력
When 에이전트가 Vault Search 도구를 호출
Then 검색 결과가 관련도 순으로 정렬되어 반환됨
And 결과에는 파일 경로, 제목, 스니펫, 점수가 포함됨
And 에이전트가 검색 결과를 사용자에게 요약해서 전달함
```

**Expected Output**:
```json
{
  "results": [
    {
      "file_path": "Projects/AI Automation.md",
      "title": "AI Automation",
      "snippet": "자동화 파이프라인 구축...",
      "score": 0.85,
      "tags": ["#AI", "#automation"]
    }
  ]
}
```

---

### 1.2 검색 결과 필터링

**Scenario: 제외 폴더 설정**
```gherkin
Given 설정에서 "Archive" 폴더를 제외 폴더로 지정함
And "Archive" 폴더에 "test.md" 파일이 존재함
When 사용자가 "test" 키워드로 검색
Then 검색 결과에 "Archive/test.md"가 포함되지 않음
```

---

### 1.3 성능 테스트

**Scenario: 대형 볼트 검색 성능**
```gherkin
Given 볼트에 1,000개의 마크다운 파일이 존재함
When 사용자가 키워드로 검색
Then 검색이 2초 이내에 완료됨
And 메모리 사용량이 50MB 이하로 유지됨
```

---

### 1.4 에러 케이스

**Scenario: 검색 결과 없음**
```gherkin
Given 볼트에 "xyz123nonexistent" 키워드와 관련된 노트가 없음
When 사용자가 해당 키워드로 검색
Then 빈 결과 배열이 반환됨
And 에이전트가 "검색 결과가 없습니다" 메시지를 사용자에게 전달함
```

---

## 2. Tool 2: Web Search (웹 검색)

### 2.1 기본 웹 검색

**Scenario: 실시간 정보 검색**
```gherkin
Given 사용자가 "최신 Qwen 3.5 모델 성능 비교를 웹에서 찾아줘"를 입력
When 에이전트가 Web Search 도구를 호출
Then SearXNG 또는 Brave Search API가 호출됨
And 검색 결과가 구조화된 텍스트로 반환됨
And 결과에는 제목, URL, 요약이 포함됨
```

**Expected Output**:
```text
[1] Qwen 3.5 Performance Benchmark
URL: https://example.com/qwen-benchmark
요약: Qwen 3.5는 이전 버전 대비 20% 성능 향상...

[2] LLM Comparison 2026
URL: https://example.com/llm-comparison
요약: Qwen 3.5는 가성비가 뛰어난 모델로 평가...
```

---

### 2.2 캐싱 동작

**Scenario: 동일 쿼리 캐싱**
```gherkin
Given 사용자가 "Qwen 3.5"로 웹 검색을 수행함
When 5분 이내에 동일한 쿼리로 다시 검색
Then API가 다시 호출되지 않음
And 캐시된 결과가 즉시 반환됨
```

---

### 2.3 다중 Provider 지원

**Scenario: Provider Fallback**
```gherkin
Given SearXNG API가 응답하지 않음
When 사용자가 웹 검색을 요청
Then Brave Search API로 자동 전환됨
And 검색 결과가 정상적으로 반환됨
```

---

### 2.4 에러 케이스

**Scenario: 네트워크 오류**
```gherkin
Given 인터넷 연결이 끊어짐
When 사용자가 웹 검색을 요청
Then 명확한 에러 메시지가 반환됨
And "인터넷 연결을 확인해주세요" 메시지가 표시됨
```

---

## 3. Tool 3: Write to File (파일 생성/전체 수정)

### 3.1 새 파일 생성

**Scenario: 새 노트 생성**
```gherkin
Given 사용자가 "오늘 회의 내용을 'Meeting/2026-03-05.md'에 저장해줘"를 입력
When 에이전트가 Write to File 도구를 호출
Then 사용자 확인 다이얼로그가 표시됨
And 사용자가 승인하면 파일이 생성됨
And 디렉토리가 자동으로 생성됨 (존재하지 않을 경우)
And 성공 메시지가 표시됨
```

**Expected File Content**:
```markdown
# 2026-03-05 회의

## 참석자
- 홍길동
- 김철수

## 안건
1. 프로젝트 진행 상황
2. 다음 단계 계획
```

---

### 3.2 기존 파일 덮어쓰기

**Scenario: 파일 덮어쓰기 확인**
```gherkin
Given "Notes/test.md" 파일이 이미 존재함
When 에이전트가 동일 경로에 새 파일을 생성하려고 함
Then 사용자에게 덮어쓰기 확인 다이얼로그가 표시됨
And diff 미리보기가 표시됨
And 사용자가 승인하면 파일이 덮어쓰기됨
```

---

### 3.3 안전장치

**Scenario: 백업 생성**
```gherkin
Given 사용자가 기존 파일을 덮어쓰기 승인함
When 파일이 수정됨
Then 원본 파일이 백업 폴더에 저장됨
And 실행 취소(Undo) 기능이 제공됨
```

---

### 3.4 에러 케이스

**Scenario: 잘못된 파일 경로**
```gherkin
Given 사용자가 유효하지 않은 경로를 제공함
When 파일 생성을 시도
Then 명확한 에러 메시지가 반환됨
And 에이전트가 대안 경로를 제안함
```

---

## 4. Tool 4: Replace in File (부분 수정)

### 4.1 단일 SEARCH/REPLACE

**Scenario: 텍스트 치환**
```gherkin
Given "Projects/AI.md" 파일에 "# Status: In Progress" 텍스트가 존재함
When 사용자가 "AI 프로젝트 상태를 완료로 변경해줘"를 요청
And 에이전트가 Replace in File 도구를 호출
Then SEARCH 패턴이 파일에서 발견됨
And REPLACE 내용으로 교체됨
And 사용자에게 diff 미리보기가 표시됨
And 승인 후 파일이 수정됨
```

**Before**:
```markdown
# AI Project

## Status
# Status: In Progress
```

**After**:
```markdown
# AI Project

## Status
# Status: Completed
```

---

### 4.2 다중 SEARCH/REPLACE

**Scenario: 여러 위치 동시 수정**
```gherkin
Given 파일에 "2025" 날짜가 3곳에 존재함
When 사용자가 "모든 2025를 2026으로 변경해줘"를 요청
Then 모든 매칭 위치가 표시됨
And 사용자가 전체 수정을 승인
And 3곳 모두 수정됨
```

---

### 4.3 에러 케이스

**Scenario: 검색 텍스트 없음**
```gherkin
Given 파일에 "xyz123nonexistent" 텍스트가 없음
When 해당 텍스트를 검색하여 교체하려고 함
Then 에러 메시지가 반환됨
And "검색 텍스트를 찾을 수 없습니다" 메시지가 표시됨
And 에이전트가 대안을 제안함
```

---

## 5. Tool 5: YouTube Transcription (YouTube 자막 추출)

### 5.1 기본 자막 추출

**Scenario: YouTube URL에서 자막 추출**
```gherkin
Given 사용자가 YouTube URL을 공유함
And 해당 동영상에 한국어 자막이 존재함
When 사용자가 "이 영상 요약해줘"를 요청
And 에이전트가 YouTube Transcription 도구를 호출
Then 자막이 추출됨
And 타임스탬프가 포함됨
And 에이전트가 자막을 기반으로 요약을 제공함
```

**Expected Output**:
```text
[00:00] 안녕하세요, 오늘은 AI 자동화에 대해 이야기하겠습니다.
[00:15] 자동화의 핵심은 반복 작업을 줄이는 것입니다.
[00:30] Qwen 3.5 모델을 사용하면...
```

---

### 5.2 다국어 지원

**Scenario: 언어 우선순위**
```gherkin
Given 동영상에 한국어와 영어 자막이 모두 존재함
And 설정에서 preferredLanguage이 "ko"로 지정됨
When 자막을 추출
Then 한국어 자막이 우선 선택됨
And 한국어 자막이 없으면 영어 자막으로 fallback됨
```

---

### 5.3 볼트 저장

**Scenario: 자막을 마크다운으로 저장**
```gherkin
Given 사용자가 "이 영상 자막을 볼트에 저장해줘"를 요청
And save_to_vault 파라미터가 true로 설정됨
When 자막 추출이 완료됨
Then YouTube/동영상제목.md 파일이 생성됨
And 파일에 타임스탬프와 자막이 포함됨
And 파일 링크가 사용자에게 제공됨
```

---

### 5.4 에러 케이스

**Scenario: 자막 없는 동영상**
```gherkin
Given 동영상에 자막이 없음
When 자막 추출을 시도
Then 명확한 에러 메시지가 반환됨
And "이 동영상에는 자막이 없습니다" 메시지가 표시됨
```

---

## 6. Agent Loop (ReAct) 통합 테스트

### 6.1 복합 작업 수행

**Scenario: 웹 검색 + 파일 생성**
```gherkin
Given 사용자가 "Qwen 3.5 최신 정보를 웹에서 찾아서 'Research/Qwen3.5.md'에 정리해줘"를 입력
When 에이전트가 작업을 시작
Then Web Search 도구가 호출됨
And 검색 결과를 기반으로 콘텐츠가 생성됨
And Write to File 도구가 호출됨
And 파일이 생성됨
And 전체 과정이 10회 이내의 도구 호출로 완료됨
```

---

### 6.2 최대 반복 횟수 제한

**Scenario: 무한 루프 방지**
```gherkin
Given 에이전트가 10회 연속 도구를 호출함
And 각 호출이 새로운 도구 호출을 유발함
When 10회째 도구 호출이 완료됨
Then 에이전트가 루프를 종료함
And "최대 도구 호출 횟수에 도달했습니다" 메시지가 표시됨
And 현재까지의 결과가 사용자에게 전달됨
```

---

### 6.3 에러 복구

**Scenario: 도구 실행 실패 시 대안 행동**
```gherkin
Given Web Search 도구가 네트워크 오류로 실패함
When 에이전트가 실패 결과를 수신
Then 에이전트가 대안 접근 방식을 시도함
And "웹 검색을 사용할 수 없어 볼트 내 관련 정보를 검색합니다" 메시지가 표시됨
And Vault Search 도구가 호출됨
```

---

## 7. UI 통합 테스트

### 7.1 채팅 인터페이스

**Scenario: 메시지 송수신**
```gherkin
Given 사용자가 채팅 UI를 열음
When 사용자가 메시지를 입력하고 전송
Then 메시지가 입력창에 표시됨
And LLM 스트리밍 응답이 실시간으로 표시됨
And 마크다운이 올바르게 렌더링됨
```

---

### 7.2 도구 실행 상태 표시

**Scenario: Tool Status Banner**
```gherkin
Given 에이전트가 도구를 호출함
When 도구가 실행 중
Then "Vault Search 실행 중..." 배너가 표시됨
And 배너를 클릭하면 상세 정보가 펼쳐짐
And 도구 완료 시 배너가 "완료" 상태로 변경됨
```

---

### 7.3 도구 토글

**Scenario: 도구 활성화/비활성화**
```gherkin
Given 사용자가 Web Search 도구를 비활성화함
When 사용자가 "웹에서 검색해줘"를 요청
Then 에이전트가 Web Search 도구를 호출하지 않음
And "웹 검색이 비활성화되어 있습니다" 메시지가 표시됨
```

---

## 8. 설정 관리 테스트

### 8.1 설정 저장

**Scenario: 설정 지속성**
```gherkin
Given 사용자가 LLM API URL을 "http://localhost:8080/v1"로 변경함
And Obsidian을 재시작함
When 플러그인이 로드됨
Then 변경된 API URL이 유지됨
```

---

### 8.2 기본값 복원

**Scenario: 기본 설정 복원**
```gherkin
Given 사용자가 여러 설정을 변경함
When "기본값 복원" 버튼을 클릭
Then 모든 설정이 기본값으로 복원됨
```

---

## 9. 품질 게이트 (Quality Gates)

### 9.1 테스트 커버리지

| 모듈 | 목표 커버리지 | 측정 방법 |
|------|---------------|-----------|
| Vault Search Tool | 85% | Jest coverage |
| Web Search Tool | 85% | Jest coverage |
| Write to File Tool | 85% | Jest coverage |
| Replace in File Tool | 85% | Jest coverage |
| YouTube Transcription Tool | 85% | Jest coverage |
| Agent Controller | 80% | Jest coverage |
| LLM Service | 80% | Jest coverage |

---

### 9.2 성능 기준

| 항목 | 기준 | 측정 방법 |
|------|------|-----------|
| 볼트 검색 (1,000 파일) | < 2초 | Performance test |
| 메모리 사용량 | < 200MB | Memory profiler |
| 스트리밍 지연 | < 100ms | Latency test |
| 도구 호출 오버헤드 | < 50ms | Performance test |

---

### 9.3 보안 기준

| 항목 | 기준 | 검증 방법 |
|------|------|-----------|
| API 키 저장 | 암호화 | Security audit |
| 파일 경로 검증 | 샌드박싱 | Path traversal test |
| 외부 데이터 전송 | 없음 | Network monitoring |
| 사용자 승인 | 파일 수정 필수 | Integration test |

---

## 10. Definition of Done (DoD)

### 10.1 기능 완료 기준

- [ ] 모든 5개 도구가 정상 동작함
- [ ] ReAct 루프가 최대 10회까지 안정적으로 동작함
- [ ] 스트리밍 응답이 지연 없이 표시됨
- [ ] 파일 수정 전 사용자 승인이 필수임
- [ ] 설정이 세션 간에 유지됨

---

### 10.2 품질 완료 기준

- [ ] 각 도구별 85% 이상 테스트 커버리지 달성
- [ ] 모든 에지 케이스에 대한 테스트 작성
- [ ] 성능 기준 충족 (검색 < 2초, 메모리 < 200MB)
- [ ] 보안 기준 충족 (API 키 암호화, 경로 검증)
- [ ] 코드 리뷰 완료

---

### 10.3 문서화 완료 기준

- [ ] README.md 작성 완료
- [ ] 각 도구별 사용법 문서화
- [ ] 설정 가이드 작성
- [ ] 트러블슈팅 가이드 작성
- [ ] API 참조 문서 작성

---

### 10.4 사용성 완료 기준

- [ ] 직관적인 UI
- [ ] 명확한 에러 메시지
- [ ] 도구 실행 상태 실시간 표시
- [ ] 접근성 기준 충족

---

## 11. 테스트 실행 계획

### 11.1 단위 테스트
- 각 도구별 독립 테스트
- Mock LLM API 사용
- 커버리지 85% 목표

### 11.2 통합 테스트
- ReAct 루프 전체 흐름
- UI ↔ Agent ↔ LLM 통합
- 에러 복구 시나리오

### 11.3 E2E 테스트
- 사용자 시나리오별 전체 워크플로우
- 실제 Qwen 3.5 서버 사용
- 성능 측정

---

**Acceptance Criteria 작성 완료**
- 작성자: cyan91
- 검토 필요: 성능 기준 현실성, 테스트 자동화 범위
