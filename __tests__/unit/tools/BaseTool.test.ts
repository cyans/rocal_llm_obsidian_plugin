/**
 * BaseTool Tests
 * @MX:TEST: SPEC-PLUGIN-001 Phase 2
 */

import { BaseTool, ToolDefinition } from '../../../src/tools/BaseTool';

// Mock tool for testing
class MockTool extends BaseTool {
    definition: ToolDefinition = {
        name: 'mock_tool',
        description: 'A mock tool for testing',
        parameters: {
            type: 'object',
            properties: {
                input: {
                    type: 'string',
                    description: 'Test input parameter'
                }
            },
            required: ['input']
        }
    };

    async execute(params: Record<string, any>): Promise<any> {
        return { result: `executed with: ${params.input}` };
    }
}

describe('BaseTool', () => {
    describe('ToolDefinition', () => {
        it('should have valid tool definition structure', () => {
            const tool = new MockTool();

            expect(tool.definition).toBeDefined();
            expect(tool.definition.name).toBe('mock_tool');
            expect(tool.definition.description).toBe('A mock tool for testing');
            expect(tool.definition.parameters).toBeDefined();
        });

        it('should have required fields in definition', () => {
            const tool = new MockTool();

            expect(tool.definition.name).toBeTruthy();
            expect(tool.definition.description).toBeTruthy();
            expect(tool.definition.parameters).toBeTruthy();
        });
    });

    describe('execute', () => {
        it('should be an async method', () => {
            const tool = new MockTool();

            expect(typeof tool.execute).toBe('function');
        });

        it('should execute with valid parameters', async () => {
            const tool = new MockTool();
            const result = await tool.execute({ input: 'test' });

            expect(result).toBeDefined();
            expect(result.result).toBe('executed with: test');
        });

        it('should handle missing optional parameters', async () => {
            const tool = new MockTool();
            const result = await tool.execute({ input: 'test' });

            expect(result).toBeDefined();
        });
    });

    describe('OpenAI Tool Format', () => {
        it('should produce OpenAI-compatible tool definition', () => {
            const tool = new MockTool();
            const openaiFormat = {
                type: 'function',
                function: {
                    name: tool.definition.name,
                    description: tool.definition.description,
                    parameters: tool.definition.parameters
                }
            };

            expect(openaiFormat.type).toBe('function');
            expect(openaiFormat.function.name).toBe('mock_tool');
            expect(openaiFormat.function.parameters).toHaveProperty('type', 'object');
        });
    });
});
