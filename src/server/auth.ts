import { Request, Response, NextFunction } from 'express';
import { prisma } from './index.js';
import crypto from 'crypto';

// Gerar token aleatório
export function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

// Gerar API key
export function generateApiKey(): string {
  return 'pa_' + crypto.randomBytes(32).toString('base64url');
}

// Middleware de autenticação
export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  // Rotas públicas que não precisam de auth
  const publicPaths = ['/health', '/api/auth/setup', '/api/auth/login', '/api/auth/status'];
  if (publicPaths.some(path => req.path.startsWith(path))) {
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized - Token required' });
  }

  const token = authHeader.substring(7);

  try {
    const session = await prisma.session.findUnique({
      where: { token },
      include: { apiKey: true }
    });

    if (!session) {
      return res.status(401).json({ error: 'Unauthorized - Invalid token' });
    }

    if (new Date() > session.expiresAt) {
      await prisma.session.delete({ where: { id: session.id } });
      return res.status(401).json({ error: 'Unauthorized - Session expired' });
    }

    if (!session.apiKey.isActive) {
      return res.status(401).json({ error: 'Unauthorized - API key disabled' });
    }

    // Atualizar lastUsedAt
    await prisma.apiKey.update({
      where: { id: session.apiKeyId },
      data: { lastUsedAt: new Date() }
    });

    // Adicionar info do usuário ao request
    (req as any).session = session;
    next();
  } catch (error) {
    res.status(500).json({ error: 'Auth error: ' + String(error) });
  }
}

// Verificar se é primeira vez (sem API keys)
export async function isFirstTime(): Promise<boolean> {
  const count = await prisma.apiKey.count();
  return count === 0;
}

