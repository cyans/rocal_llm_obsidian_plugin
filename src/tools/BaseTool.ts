/**
 * Base Tool Interface
 */

export interface ToolDefinition {
    name: string;
    description: string;
    parameters: Record<string, any>;
}

export abstract class BaseTool {
    abstract definition: ToolDefinition;
    abstract execute(params: Record<string, any>): Promise<any>;
}
