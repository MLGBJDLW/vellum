/**
 * Test Fixtures Module
 *
 * Exports for test fixture utilities including the FakeResponseLoader
 * for mocking API responses in E2E and integration tests.
 *
 * @module cli/test/fixtures
 */

export {
  DEFAULT_FIXTURES_DIR,
  FAKE_RESPONSES_ENV,
  FakeResponseLoader,
  FIXTURES_DIR_ENV,
  getFakeResponseLoader,
  type MockEventType,
  type MockResponse,
  type MockStreamEvent,
  resetFakeResponseLoader,
} from "./fake-response-loader.js";
