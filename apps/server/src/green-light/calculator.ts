import { redis } from '../index';

export interface GreenLightSignals {
  fingerprint: {
    score: number;
    checks: {
      tlsConsistent: boolean;
      headersOrdered: boolean;
      ja3Valid: boolean;
      http2Supported: boolean;
    };
  };
  behavior: {
    score: number;
    checks: {
      timingHumanLike: boolean;
      mouseMovementNatural: boolean;
      scrollPatternsValid: boolean;
      noBursts: boolean;
    };
  };
  challengeResponse: {
    score: number;
    checks: {
      captchaSolved: boolean;
      solutionTimeAcceptable: boolean;
      noRepeatedFailures: boolean;
    };
  };
  session: {
    score: number;
    checks: {
      cookiesAccepted: boolean;
      sessionDuration: number;
      noTokenRefreshNeeded: boolean;
    };
  };
  network: {
    score: number;
    checks: {
      rateLimitRespected: boolean;
      ipNotBlacklisted: boolean;
      responseTimesNormal: boolean;
    };
  };
}

export interface GreenLightState {
  status: 'RED' | 'YELLOW' | 'GREEN' | 'ESTABLISHED';
  trustScore: number;
  signals: GreenLightSignals;
  establishedAt?: Date;
  maintainedFor: number;
  decayRate: number;
}

export class GreenLightCalculator {
  private readonly WEIGHTS = {
    fingerprint: 0.25,
    behavior: 0.25,
    challengeResponse: 0.20,
    session: 0.15,
    network: 0.15
  };

  private readonly THRESHOLDS = {
    RED_TO_YELLOW: 25,
    YELLOW_TO_GREEN: 50,
    GREEN_TO_ESTABLISHED: 75,
    ESTABLISHED_MAINTAIN: 70
  };

  async calculate(targetId: string, dna: any, recentRequests: any[]): Promise<GreenLightState> {
    // Get previous state
    const cached = await redis.get(`greenlight:${targetId}`);
    const previousState: GreenLightState | null = cached ? JSON.parse(cached) : null;

    // Calculate individual signal scores
    const signals: GreenLightSignals = {
      fingerprint: this.calculateFingerprintScore(dna, recentRequests),
      behavior: this.calculateBehaviorScore(dna, recentRequests),
      challengeResponse: this.calculateChallengeScore(recentRequests),
      session: this.calculateSessionScore(targetId, recentRequests),
      network: this.calculateNetworkScore(recentRequests)
    };

    // Calculate weighted trust score
    const trustScore = Math.round(
      signals.fingerprint.score * this.WEIGHTS.fingerprint +
      signals.behavior.score * this.WEIGHTS.behavior +
      signals.challengeResponse.score * this.WEIGHTS.challengeResponse +
      signals.session.score * this.WEIGHTS.session +
      signals.network.score * this.WEIGHTS.network
    );

    // Determine status
    let status: GreenLightState['status'] = 'RED';
    let establishedAt = previousState?.establishedAt;
    let maintainedFor = previousState?.maintainedFor || 0;

    if (previousState) {
      // State machine transitions
      switch (previousState.status) {
        case 'RED':
          if (trustScore >= this.THRESHOLDS.RED_TO_YELLOW) {
            status = 'YELLOW';
          }
          break;
        case 'YELLOW':
          if (trustScore >= this.THRESHOLDS.YELLOW_TO_GREEN) {
            status = 'GREEN';
          } else if (trustScore < this.THRESHOLDS.RED_TO_YELLOW) {
            status = 'RED';
          }
          break;
        case 'GREEN':
          if (trustScore >= this.THRESHOLDS.GREEN_TO_ESTABLISHED) {
            status = 'ESTABLISHED';
            establishedAt = new Date();
          } else if (trustScore < this.THRESHOLDS.YELLOW_TO_GREEN) {
            status = 'YELLOW';
          }
          break;
        case 'ESTABLISHED':
          if (trustScore >= this.THRESHOLDS.ESTABLISHED_MAINTAIN) {
            status = 'ESTABLISHED';
            maintainedFor += 1; // Add current second
          } else {
            status = 'GREEN';
            maintainedFor = 0;
          }
          break;
      }
    } else {
      // Initial state
      if (trustScore >= this.THRESHOLDS.GREEN_TO_ESTABLISHED) {
        status = 'ESTABLISHED';
        establishedAt = new Date();
      } else if (trustScore >= this.THRESHOLDS.YELLOW_TO_GREEN) {
        status = 'GREEN';
      } else if (trustScore >= this.THRESHOLDS.RED_TO_YELLOW) {
        status = 'YELLOW';
      }
    }

    const state: GreenLightState = {
      status,
      trustScore,
      signals,
      establishedAt: establishedAt ? new Date(establishedAt) : undefined,
      maintainedFor,
      decayRate: this.calculateDecayRate(trustScore, previousState)
    };

    // Cache for 30 seconds
    await redis.setex(`greenlight:${targetId}`, 30, JSON.stringify(state));

    return state;
  }

  private calculateFingerprintScore(dna: any, requests: any[]): { score: number; checks: any } {
    const checks = {
      tlsConsistent: true,
      headersOrdered: true,
      ja3Valid: true,
      http2Supported: dna?.network?.http?.version === '2.0'
    };

    // Check for header inconsistencies
    const blockedRequests = requests.filter(r => r.wasBlocked);
    if (blockedRequests.length > 0) {
      const recentBlock = blockedRequests[blockedRequests.length - 1];
      if (recentBlock.blockReason?.includes('fingerprint')) {
        checks.tlsConsistent = false;
      }
    }

    const passedChecks = Object.values(checks).filter(Boolean).length;
    const score = (passedChecks / 4) * 100;

    return { score, checks };
  }

  private calculateBehaviorScore(dna: any, requests: any[]): { score: number; checks: any } {
    const checks = {
      timingHumanLike: true,
      mouseMovementNatural: true,
      scrollPatternsValid: true,
      noBursts: true
    };

    // Analyze request timing
    if (requests.length >= 2) {
      const intervals = [];
      for (let i = 1; i < requests.length; i++) {
        const diff = new Date(requests[i].createdAt).getTime() - 
                     new Date(requests[i-1].createdAt).getTime();
        intervals.push(diff);
      }

      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const minInterval = Math.min(...intervals);

      // If average interval is too fast (< 500ms), not human-like
      if (avgInterval < 500) {
        checks.timingHumanLike = false;
      }

      // If any burst (multiple requests < 100ms apart)
      if (minInterval < 100) {
        checks.noBursts = false;
      }
    }

    const passedChecks = Object.values(checks).filter(Boolean).length;
    const score = (passedChecks / 4) * 100;

    return { score, checks };
  }

  private calculateChallengeScore(requests: any[]): { score: number; checks: any } {
    const challengeRequests = requests.filter(r => r.challengeDetected);
    
    const checks = {
      captchaSolved: challengeRequests.length === 0 || 
                     challengeRequests.some(r => !r.wasBlocked),
      solutionTimeAcceptable: true,
      noRepeatedFailures: true
    };

    // Check for repeated failures
    const failures = challengeRequests.filter(r => r.wasBlocked).length;
    if (failures > 2) {
      checks.noRepeatedFailures = false;
    }

    const passedChecks = Object.values(checks).filter(Boolean).length;
    const score = (passedChecks / 3) * 100;

    return { score, checks };
  }

  private calculateSessionScore(targetId: string, requests: any[]): { score: number; checks: any } {
    const sessionRequests = requests.filter(r => r.responseStatus === 200);
    
    const checks = {
      cookiesAccepted: sessionRequests.length > 0,
      sessionDuration: 0,
      noTokenRefreshNeeded: true
    };

    if (sessionRequests.length > 0) {
      const first = new Date(sessionRequests[0].createdAt);
      const last = new Date(sessionRequests[sessionRequests.length - 1].createdAt);
      checks.sessionDuration = (last.getTime() - first.getTime()) / 1000;
    }

    const passedChecks = Object.values(checks).filter(Boolean).length;
    const score = (passedChecks / 3) * 100;

    return { score, checks };
  }

  private calculateNetworkScore(requests: any[]): { score: number; checks: any } {
    const checks = {
      rateLimitRespected: !requests.some(r => r.responseStatus === 429),
      ipNotBlacklisted: !requests.some(r => r.wasBlocked && r.blockReason === 'ip_blacklist'),
      responseTimesNormal: true
    };

    // Check response times
    const avgResponseTime = requests.reduce((sum, r) => sum + (r.timingMs || 0), 0) / requests.length;
    if (avgResponseTime > 10000) { // > 10s average is suspicious
      checks.responseTimesNormal = false;
    }

    const passedChecks = Object.values(checks).filter(Boolean).length;
    const score = (passedChecks / 3) * 100;

    return { score, checks };
  }

  private calculateDecayRate(currentScore: number, previousState: GreenLightState | null): number {
    if (!previousState) return 0;
    
    // Decay increases as score drops
    if (currentScore < previousState.trustScore) {
      return (previousState.trustScore - currentScore) * 0.1;
    }
    
    return 0;
  }

  async getNavigationRecommendation(targetId: string, state: GreenLightState): Promise<{
    canNavigate: boolean;
    recommendedAction: string;
    restrictions: string[];
  }> {
    const recommendations = {
      RED: {
        canNavigate: false,
        recommendedAction: 'Stop and analyze. Current DNA is not trusted by target.',
        restrictions: ['All navigation blocked']
      },
      YELLOW: {
        canNavigate: true,
        recommendedAction: 'Proceed with caution. Use conservative timing and minimal interaction.',
        restrictions: ['Max 1 request per 3 seconds', 'No form submissions', 'Read-only mode']
      },
      GREEN: {
        canNavigate: true,
        recommendedAction: 'Normal navigation allowed. Continue building trust.',
        restrictions: ['Max 3 requests per second', 'Simple forms allowed']
      },
      ESTABLISHED: {
        canNavigate: true,
        recommendedAction: 'Full trust established. All navigation modes available.',
        restrictions: []
      }
    };

    return recommendations[state.status];
  }
}
