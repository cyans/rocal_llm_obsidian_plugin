/**
 * Stream Handler Tests
 * @MX:SPEC: SPEC-PLUGIN-001
 */

import { StreamHandler } from '../../../src/llm/StreamHandler';

describe('StreamHandler', () => {
    let handler: StreamHandler;

    beforeEach(() => {
        handler = new StreamHandler();
    });

    describe('parseSSELine', () => {
        it('should parse SSE data line', () => {
            const line = 'data: {"choices":[{"delta":{"content":"Hello"}}]}';
            const parsed = handler.parseSSELine(line);

            expect(parsed).toBeDefined();
            expect(parsed?.content).toBe('Hello');
        });

        it('should ignore empty lines', () => {
            const parsed = handler.parseSSELine('');
            expect(parsed).toBeNull();
        });

        it('should ignore non-data lines', () => {
            const parsed = handler.parseSSELine('comment: test');
            expect(parsed).toBeNull();
        });
    });
});
