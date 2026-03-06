/**
 * Conversation Manager Tests
 * @MX:SPEC: SPEC-PLUGIN-001
 */

import { ConversationManager } from '../../../src/agent/ConversationManager';

describe('ConversationManager', () => {
    let manager: ConversationManager;

    beforeEach(() => {
        manager = new ConversationManager();
    });

    describe('addMessage', () => {
        it('should add user message to history', () => {
            manager.addMessage('user', 'Hello');
            const history = manager.getHistory();

            expect(history).toHaveLength(1);
            expect(history[0]).toEqual({ role: 'user', content: 'Hello' });
        });

        it('should add assistant message to history', () => {
            manager.addMessage('assistant', 'Hi there');
            const history = manager.getHistory();

            expect(history).toHaveLength(1);
            expect(history[0]).toEqual({ role: 'assistant', content: 'Hi there' });
        });
    });

    describe('formatForLLM', () => {
        it('should format messages for LLM API', () => {
            manager.addMessage('user', 'Hello');
            manager.addMessage('assistant', 'Hi');

            const formatted = manager.formatForLLM();

            expect(formatted).toEqual([
                { role: 'user', content: 'Hello' },
                { role: 'assistant', content: 'Hi' },
            ]);
        });
    });

    describe('clear', () => {
        it('should clear all messages', () => {
            manager.addMessage('user', 'Hello');
            manager.clear();

            expect(manager.getHistory()).toHaveLength(0);
        });
    });
});
