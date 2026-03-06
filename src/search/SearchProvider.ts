/**
 * Search Provider Interface
 */

export interface SearchProvider {
    search(query: string, numResults: number): Promise<any>;
}
