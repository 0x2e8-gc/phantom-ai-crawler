import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { redis } from '../index';

const MutationSchema = z.object({
  gene: z.enum(['identity', 'timing', 'network', 'interaction', 'capabilities']),
  change: z.record(z.any()),
  reason: z.string(),
  confidence: z.number().min(0).max(1),
  riskLevel: z.enum(['low', 'medium', 'high'])
});

const TrustEvaluationSchema = z.object({
  trustScore: z.number().min(0).max(100),
  signals: z.array(z.object({
    name: z.string(),
    status: z.enum(['pass', 'warning', 'fail']),
    weight: z.number(),
    details: z.string().optional()
  })),
  recommendation: z.string(),
  shouldContinue: z.boolean()
});

export interface MCPContext {
  target: {
    id: string;
    url: string;
    greenLightStatus: string;
    trustScore: number;
  };
  currentDNA: any;
  observations: Array<{
    type: string;
    summary: string;
    timestamp: Date;
  }>;
  learningEvents: Array<{
    type: string;
    outcome: string;
  }>;
  currentChallenge?: {
    type: string;
    difficulty: string;
    attempts: number;
  };
  lastRequest?: {
    status: number;
    blocked: boolean;
    timing: number;
  };
}

export interface MCPResponse {
  analysis: string;
  mutations?: z.infer<typeof MutationSchema>[];
  trustEvaluation?: z.infer<typeof TrustEvaluationSchema>;
  strategy?: {
    action: string;
    reason: string;
    parameters?: Record<string, any>;
  };
  confidence: number;
  model: string;
}

export class MCPBridge {
  private client: Anthropic;
  private model: string;
  private minVersion: string = '4.5.0';
  private isMockMode: boolean = false;

  constructor() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    this.model = process.env.CLAUDE_MODEL || 'claude-4-5-sonnet-20250929';
    
    if (!apiKey) {
      console.log('[MCP] ⚠️ No ANTHROPIC_API_KEY - running in mock mode');
      this.client = {} as Anthropic;
      this.isMockMode = true;
      return;
    }
    
    this.client = new Anthropic({ apiKey });
    this.validateModel();
  }
  
  isMock(): boolean {
    return this.isMockMode;
  }

  private validateModel() {
    // Ensure we're using Sonnet 4.5 or higher
    if (!this.model.includes('4-5') && !this.model.includes('4.5')) {
      throw new Error(
        `Phantom AI requires Claude Sonnet 4.5 or higher. ` +
        `Current model: ${this.model}. ` +
        `Earlier versions lack the reasoning capabilities needed for behavioral adaptation.`
      );
    }
    console.log(`✅ MCP Bridge initialized with ${this.model}`);
  }

  async analyze(context: MCPContext): Promise<MCPResponse> {
    // Mock mode - return mock response
    if (this.isMockMode) {
      return this.mockResponse(context);
    }
    
    // Check cache first
    const cacheKey = `mcp:analysis:${context.target.id}:${Date.now()}`;
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const tools: Anthropic.Tool[] = [
      {
        name: 'suggest_dna_mutation',
        description: 'Suggest a specific change to the behavioral DNA based on observations',
        input_schema: {
          type: 'object',
          properties: {
            gene: {
              type: 'string',
              enum: ['identity', 'timing', 'network', 'interaction', 'capabilities'],
              description: 'Which gene to mutate'
            },
            change: {
              type: 'object',
              description: 'The specific changes to apply'
            },
            reason: {
              type: 'string',
              description: 'Detailed explanation for why this mutation is needed'
            },
            confidence: {
              type: 'number',
              minimum: 0,
              maximum: 1,
              description: 'Confidence level in this mutation (0-1)'
            },
            riskLevel: {
              type: 'string',
              enum: ['low', 'medium', 'high'],
              description: 'Risk level of this mutation'
            }
          },
          required: ['gene', 'change', 'reason', 'confidence', 'riskLevel']
        }
      },
      {
        name: 'evaluate_trust_status',
        description: 'Evaluate current trust level and determine if Green Light status should change',
        input_schema: {
          type: 'object',
          properties: {
            trustScore: {
              type: 'number',
              minimum: 0,
              maximum: 100,
              description: 'Calculated trust score (0-100)'
            },
            signals: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  status: { type: 'string', enum: ['pass', 'warning', 'fail'] },
                  weight: { type: 'number' },
                  details: { type: 'string' }
                }
              }
            },
            recommendation: {
              type: 'string',
              description: 'Strategic recommendation for next actions'
            },
            shouldContinue: {
              type: 'boolean',
              description: 'Whether to continue navigation or pause'
            }
          },
          required: ['trustScore', 'signals', 'recommendation', 'shouldContinue']
        }
      },
      {
        name: 'determine_strategy',
        description: 'Determine the overall crawling strategy based on target behavior',
        input_schema: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: ['continue', 'pause', 'adapt', 'retreat', 'accelerate'],
              description: 'Recommended action'
            },
            reason: {
              type: 'string'
            },
            parameters: {
              type: 'object',
              description: 'Additional parameters for the action'
            }
          },
          required: ['action', 'reason']
        }
      }
    ];

    const prompt = this.buildContextPrompt(context);

    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 4096,
        temperature: 0.2,
        tools: tools,
        tool_choice: { type: 'auto' },
        messages: [{
          role: 'user',
          content: prompt
        }]
      });

      const result = this.parseResponse(response);
      
      // Cache for 5 minutes
      await redis.setex(cacheKey, 300, JSON.stringify(result));
      
      return result;
    } catch (error) {
      console.error('MCP Analysis failed:', error);
      throw error;
    }
  }

  private buildContextPrompt(context: MCPContext): string {
    return `You are the intelligence engine for Phantom AI, an adaptive web crawler that evolves its behavior to match what targets expect.

TARGET INFORMATION:
- URL: ${context.target.url}
- Current Status: ${context.target.greenLightStatus}
- Trust Score: ${context.target.trustScore}/100
- Target ID: ${context.target.id}

CURRENT BEHAVIORAL DNA:
${JSON.stringify(context.currentDNA, null, 2)}

RECENT OBSERVATIONS (last 10):
${context.observations.map(o => `- [${o.type}] ${o.summary}`).join('\n') || 'None yet'}

LEARNING HISTORY (last 5 events):
${context.learningEvents.map(e => `- ${e.type}: ${e.outcome}`).join('\n') || 'None yet'}

${context.currentChallenge ? `
CURRENT CHALLENGE:
- Type: ${context.currentChallenge.type}
- Difficulty: ${context.currentChallenge.difficulty}
- Attempts: ${context.currentChallenge.attempts}
` : ''}

${context.lastRequest ? `
LAST REQUEST RESULT:
- Status: ${context.lastRequest.status}
- Blocked: ${context.lastRequest.blocked}
- Timing: ${context.lastRequest.timing}ms
` : ''}

ANALYZE AND RESPOND:
1. Is the current behavioral DNA appropriate for this target?
2. What patterns do you observe in the responses?
3. Should we mutate the DNA? If so, how?
4. Evaluate trust status - should Green Light change?
5. What is the recommended strategy?

Be specific in your tool calls. Include detailed reasoning.`;
  }

  private parseResponse(response: Anthropic.Message): MCPResponse {
    const result: MCPResponse = {
      analysis: '',
      confidence: 0.8,
      model: this.model
    };

    // Extract text content
    const textContent = response.content.find(c => c.type === 'text');
    if (textContent && 'text' in textContent) {
      result.analysis = textContent.text;
    }

    // Extract tool calls
    const toolUses = response.content.filter(c => c.type === 'tool_use');
    
    for (const tool of toolUses) {
      if ('name' in tool && 'input' in tool) {
        const input = tool.input as any;
        
        if (tool.name === 'suggest_dna_mutation') {
          if (!result.mutations) result.mutations = [];
          const mutation = MutationSchema.parse(input);
          result.mutations.push(mutation);
        }
        
        if (tool.name === 'evaluate_trust_status') {
          result.trustEvaluation = TrustEvaluationSchema.parse(input);
        }
        
        if (tool.name === 'determine_strategy') {
          result.strategy = {
            action: input.action,
            reason: input.reason,
            parameters: input.parameters
          };
        }
      }
    }

    return result;
  }

  private mockResponse(context: MCPContext): MCPResponse {
    console.log('[MCP] Generating mock response (no API key)');
    
    return {
      analysis: 'Mock MCP analysis - configure ANTHROPIC_API_KEY for real analysis with Claude Sonnet 4.5',
      confidence: 0.5,
      model: this.model,
      mutations: [{
        gene: 'timing',
        change: { delayRange: [2000, 5000], randomize: true },
        reason: 'Mock: Increase delays between requests to appear more human-like',
        confidence: 0.7,
        riskLevel: 'low'
      }],
      trustEvaluation: {
        trustScore: Math.min(context.target.trustScore + 5, 100),
        signals: [{
          name: 'mock_signal',
          status: 'pass',
          weight: 0.5,
          details: 'Mock evaluation - no real analysis performed'
        }],
        recommendation: 'Continue with conservative approach while in mock mode',
        shouldContinue: true
      },
      strategy: {
        action: 'continue',
        reason: 'Mock strategy - waiting for real API key to enable live analysis',
        parameters: { note: 'Add ANTHROPIC_API_KEY to .env for live MCP' }
      }
    };
  }

  async validateModelVersion(): Promise<boolean> {
    if (this.isMockMode) return true;
    
    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 10,
        messages: [{
          role: 'user',
          content: 'Respond with "valid"'
        }]
      });
      return true;
    } catch (error) {
      console.error('Model validation failed:', error);
      return false;
    }
  }
}



