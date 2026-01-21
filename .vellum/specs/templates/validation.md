---
template_version: "1.0"
template_type: "spec-validation"
required_fields:
  - test_results
  - coverage
optional_fields:
  - STATUS
  - ISSUES_FOUND
  - RECOMMENDATIONS
---

# Validation Report: {{FEATURE_NAME}}

> **Phase**: 6/6 - Validation  
> **Created**: {{DATE}}  
> **Status**: {{STATUS:🟡 In Review}}  
> **Agent**: `spec-validator`  
> **Based on**: All previous phase documents

---

## 1. Validation Summary

{{VALIDATION_SUMMARY}}

### 1.1 Overall Status

```text
┌─────────────────────────────────────────────────────────────┐
│                    VALIDATION RESULT                         │
├─────────────────────────────────────────────────────────────┤
│  Status: ✅ PASSED | ⚠️ PASSED WITH WARNINGS | ❌ FAILED   │
├─────────────────────────────────────────────────────────────┤
│  Requirements Coverage: XX%                                  │
│  Test Pass Rate: XX%                                         │
│  Code Coverage: XX%                                          │
│  Issues Found: X critical, X warnings                        │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 Quick Stats

| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| Requirements Coverage | 100% | XX% | ✅/⚠️/❌ |
| Test Pass Rate | 100% | XX% | ✅/⚠️/❌ |
| Code Coverage | >80% | XX% | ✅/⚠️/❌ |
| Critical Issues | 0 | X | ✅/⚠️/❌ |

---

## 2. Requirements Traceability

{{REQUIREMENTS_COVERAGE}}

### 2.1 Functional Requirements

| Req ID | Description | Implementation | Test | Status |
|--------|-------------|----------------|------|--------|
| FR-001 | <!-- desc --> | `[file:line]` | `test.ts:XX` | ✅ |
| FR-002 | <!-- desc --> | `[file:line]` | `test.ts:XX` | ✅ |
| FR-003 | <!-- desc --> | `[file:line]` | `test.ts:XX` | ⚠️ |

**Coverage**: X/X requirements implemented (XX%)

### 2.2 Non-Functional Requirements

| Req ID | Description | Target | Actual | Status |
|--------|-------------|--------|--------|--------|
| NFR-P01 | Response time | <200ms | XXms | ✅ |
| NFR-P02 | Throughput | >100/s | XX/s | ✅ |
| NFR-S01 | Authentication | Implemented | Yes | ✅ |
| NFR-R01 | Availability | 99.9% | N/A | ⬜ |

**Coverage**: X/X NFRs verified (XX%)

### 2.3 Acceptance Criteria

| AC ID | Criteria | Verified | Evidence |
|-------|----------|----------|----------|
| AC-001 | Core functionality works | ✅ | Unit tests pass |
| AC-002 | Edge cases handled | ✅ | Test coverage |
| AC-003 | Error handling implemented | ✅ | Error test cases |
| AC-004 | Tests passing | ✅ | CI pipeline |
| AC-005 | Documentation updated | ✅ | README review |

---

## 3. Test Results

{{TEST_RESULTS}}

### 3.1 Test Summary

```text
Test Suites: X passed, X failed, X total
Tests:       X passed, X failed, X skipped, X total
Coverage:    XX% statements, XX% branches, XX% functions, XX% lines
Time:        X.XXs
```

### 3.2 Unit Test Results

| Test Suite | Tests | Passed | Failed | Coverage |
|------------|-------|--------|--------|----------|
| `feature.test.ts` | X | X | 0 | XX% |
| `types.test.ts` | X | X | 0 | XX% |
| `utils.test.ts` | X | X | 0 | XX% |

### 3.3 Integration Test Results

| Scenario | Status | Duration | Notes |
|----------|--------|----------|-------|
| Happy path | ✅ Pass | X.Xs | - |
| Error handling | ✅ Pass | X.Xs | - |
| Edge cases | ⚠️ Partial | X.Xs | 1 skipped |

### 3.4 Failed/Skipped Tests

| Test | Reason | Severity | Action |
|------|--------|----------|--------|
| `test_name` | <!-- reason --> | Low | Defer to future |

---

## 4. Code Quality

### 4.1 Coverage Report

```text
File                    | % Stmts | % Branch | % Funcs | % Lines |
------------------------|---------|----------|---------|---------|
All files               |   XX.XX |    XX.XX |   XX.XX |   XX.XX |
 feature/               |   XX.XX |    XX.XX |   XX.XX |   XX.XX |
  index.ts              |     100 |      100 |     100 |     100 |
  types.ts              |     100 |      100 |     100 |     100 |
  feature.ts            |   XX.XX |    XX.XX |   XX.XX |   XX.XX |
```

### 4.2 Code Analysis

| Check | Tool | Result | Notes |
|-------|------|--------|-------|
| Linting | ESLint | ✅ Pass | No errors |
| Type checking | TypeScript | ✅ Pass | No errors |
| Formatting | Prettier | ✅ Pass | Formatted |
| Complexity | - | ✅ Pass | Under threshold |

### 4.3 Technical Debt

| Item | Severity | Location | Recommendation |
|------|----------|----------|----------------|
| TODO comment | Low | `file.ts:XX` | Create issue |
| Deprecated API | Medium | `file.ts:XX` | Plan migration |

---

## 5. Issues Found

{{ISSUES_FOUND:None}}

### 5.1 Critical Issues

| ID | Description | Impact | Resolution |
|----|-------------|--------|------------|
| None | - | - | - |

### 5.2 Warnings

| ID | Description | Impact | Recommendation |
|----|-------------|--------|----------------|
| W-001 | <!-- desc --> | Low | <!-- action --> |

### 5.3 Observations

- Observation 1
- Observation 2

---

## 6. Security Review

### 6.1 Security Checklist

| Check | Status | Notes |
|-------|--------|-------|
| Input validation | ✅ | All inputs validated |
| Output encoding | ✅ | XSS prevention in place |
| Authentication | ✅/N/A | Properly enforced |
| Authorization | ✅/N/A | RBAC implemented |
| Sensitive data | ✅ | No exposure |
| Logging | ✅ | No sensitive data logged |

### 6.2 Vulnerability Scan

| Severity | Count | Action |
|----------|-------|--------|
| Critical | 0 | - |
| High | 0 | - |
| Medium | 0 | - |
| Low | 0 | - |

---

## 7. Performance Review

### 7.1 Benchmark Results

| Operation | Target | Actual | Status |
|-----------|--------|--------|--------|
| Method A | <100ms | XXms | ✅ |
| Method B | <50ms | XXms | ✅ |
| Full flow | <200ms | XXms | ✅ |

### 7.2 Resource Usage

| Resource | Limit | Usage | Status |
|----------|-------|-------|--------|
| Memory | 50MB | XXMB | ✅ |
| CPU | - | X% | ✅ |
| Disk I/O | - | Minimal | ✅ |

---

## 8. Documentation Review

### 8.1 Documentation Checklist

| Document | Status | Notes |
|----------|--------|-------|
| Code comments (JSDoc) | ✅ | All public APIs documented |
| README | ✅ | Updated with new feature |
| API documentation | ✅ | Types exported correctly |
| Migration guide | ✅/N/A | Not required |
| CHANGELOG | ✅ | Entry added |

### 8.2 Documentation Quality

| Criterion | Met | Notes |
|-----------|-----|-------|
| Accurate | ✅ | Matches implementation |
| Complete | ✅ | All features covered |
| Clear | ✅ | Easy to understand |
| Examples | ✅ | Usage examples included |

---

## 9. Recommendations

{{RECOMMENDATIONS:None}}

### 9.1 Before Release

- [ ] Action item 1
- [ ] Action item 2

### 9.2 Future Improvements

| Improvement | Priority | Effort | Value |
|-------------|----------|--------|-------|
| <!-- item --> | Medium | Low | High |

### 9.3 Technical Debt to Address

| Item | Priority | Timeline |
|------|----------|----------|
| <!-- item --> | Low | Next sprint |

---

## 10. Sign-Off

### 10.1 Validation Checklist

- [ ] All functional requirements implemented
- [ ] All tests passing
- [ ] Code coverage meets target (>80%)
- [ ] No critical issues
- [ ] Documentation complete
- [ ] Security review passed
- [ ] Performance requirements met

### 10.2 Final Status

| Criterion | Status |
|-----------|--------|
| **Ready for Release** | ✅ Yes / ⚠️ With conditions / ❌ No |
| **Conditions** | <!-- if any --> |
| **Blockers** | None |

### 10.3 Approval

| Role | Status | Date |
|------|--------|------|
| Validator Agent | ✅ Approved | {{DATE}} |
| User Review | ⬜ Pending | - |

---

## Workflow Complete

### ✅ Spec Workflow Completed

All 6 phases have been executed:

1. ✅ Research - Problem analysis complete
2. ✅ Requirements - Specifications defined
3. ✅ Design - Architecture designed
4. ✅ Tasks - Implementation planned
5. ✅ Implementation - Code written
6. ✅ Validation - Quality verified

**Output Location**: `.vellum/specs/{{FEATURE_NAME}}/`

### Next Steps

- Review validation report
- Address any open items
- Merge implementation
- Archive spec documents
