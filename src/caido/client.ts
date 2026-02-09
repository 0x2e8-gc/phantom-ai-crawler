import { GraphQLClient, gql } from 'graphql-request';
import { prisma } from '../server/index.js';

const DEFAULT_CAIDO_URL = 'http://127.0.0.1:8080/graphql';

export class CaidoClient {
  private client: GraphQLClient | null = null;
  private apiKey: string | null = null;
  private graphqlUrl: string = DEFAULT_CAIDO_URL;

  async initialize() {
    // Buscar API Key
    const apiKeySetting = await prisma.settings.findUnique({
      where: { key: 'caidoGraphqlApiKey' }
    });
    
    // Buscar URL customizada (opcional)
    const urlSetting = await prisma.settings.findUnique({
      where: { key: 'caidoGraphqlUrl' }
    });
    
    if (apiKeySetting?.value) {
      this.apiKey = apiKeySetting.value;
      this.graphqlUrl = urlSetting?.value || DEFAULT_CAIDO_URL;
      
      // Garantir que a URL termina com /graphql
      if (!this.graphqlUrl.includes('/graphql')) {
        this.graphqlUrl = this.graphqlUrl.replace(/\/$/, '') + '/graphql';
      }
      
      this.client = new GraphQLClient(this.graphqlUrl, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
      });
      console.log(`[Caido] Connected to: ${this.graphqlUrl}`);
      return true;
    }
    return false;
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  async getRequests(limit: number = 50) {
    if (!this.client) {
      throw new Error('Caido client not configured');
    }

    const query = gql`
      query GetRequests($limit: Int!) {
        requests(limit: $limit, orderBy: { column: "id", direction: DESC }) {
          id
          host
          method
          path
          query
          status_code
          requestHeaders {
            name
            value
          }
          responseHeaders {
            name
            value
          }
          body
          response
          created_at
        }
      }
    `;

    return this.client.request(query, { limit });
  }

  async getRequestsByHost(host: string, limit: number = 100) {
    if (!this.client) {
      throw new Error('Caido client not configured');
    }

    const query = gql`
      query GetRequestsByHost($host: String!, $limit: Int!) {
        requests(
          where: { host: { _eq: $host } }
          limit: $limit
          orderBy: { column: "id", direction: DESC }
        ) {
          id
          host
          method
          path
          query
          status_code
          requestHeaders {
            name
            value
          }
          responseHeaders {
            name
            value
          }
          body
          response
          created_at
        }
      }
    `;

    return this.client.request(query, { host, limit });
  }

  async sendRequest(host: string, method: string, path: string, headers: any, body?: string) {
    if (!this.client) {
      throw new Error('Caido client not configured');
    }

    const mutation = gql`
      mutation SendRequest($input: SendRequestInput!) {
        sendRequest(input: $input) {
          id
          host
          method
          path
          status_code
          response
        }
      }
    `;

    return this.client.request(mutation, {
      input: {
        host,
        method,
        path,
        headers,
        body,
      }
    });
  }
}

export const caidoClient = new CaidoClient();



