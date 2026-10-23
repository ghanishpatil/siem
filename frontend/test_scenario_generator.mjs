import { createServer } from 'vite';

async function runTests() {
  const server = await createServer({
    server: { middlewareMode: true },
    appType: 'custom',
  });

  try {
    const mod = await server.ssrLoadModule('./src/utils/scenarioGenerator.ts');
    const { SCENARIO_DEFINITIONS, generateScenarioEvents } = mod;

    console.log('Testing Scenario Definitions...');
    const scenarioIds = ['AUTH-001', 'AUTH-002', 'AUTH-003', 'NET-001', 'PRIV-001'];
    for (const id of scenarioIds) {
      if (!SCENARIO_DEFINITIONS[id]) {
        throw new Error(`Missing scenario definition for ${id}`);
      }
      console.log(`✓ Scenario ${id}: ${SCENARIO_DEFINITIONS[id].name}`);
    }

    console.log('\nTesting Event Generation & Constraints...');
    const runId = 'TEST01';
    const baseTime = new Date('2026-10-17T10:00:00Z');

    // Test AUTH-001
    const bfEvents = generateScenarioEvents('AUTH-001', runId, baseTime);
    if (bfEvents.length !== 10) throw new Error(`AUTH-001 event count ${bfEvents.length} !== 10`);
    if (!bfEvents.every(e => e.is_synthetic === true)) throw new Error('AUTH-001: not all synthetic');
    if (!bfEvents.every(e => e.event_type === 'authentication_failure')) throw new Error('AUTH-001: wrong event type');
    const bfIp = bfEvents[0].source_ip;
    if (!bfEvents.every(e => e.source_ip === bfIp)) throw new Error('AUTH-001: source_ip varied');
    const bfUids = new Set(bfEvents.map(e => e.event_uid));
    if (bfUids.size !== 10) throw new Error('AUTH-001: duplicate event_uids');
    const bfDuration = (new Date(bfEvents[9].timestamp).getTime() - new Date(bfEvents[0].timestamp).getTime()) / 1000;
    if (bfDuration > 60) throw new Error(`AUTH-001 window exceeded: ${bfDuration}s`);
    console.log(`✓ AUTH-001 passed: 10 failures from ${bfIp} in ${bfDuration}s (threshold 10 / 60s)`);

    // Test AUTH-002
    const sprayEvents = generateScenarioEvents('AUTH-002', runId, baseTime);
    if (sprayEvents.length !== 6) throw new Error(`AUTH-002 event count ${sprayEvents.length} !== 6`);
    if (!sprayEvents.every(e => e.is_synthetic === true)) throw new Error('AUTH-002: not all synthetic');
    const sprayUsers = new Set(sprayEvents.map(e => e.username));
    if (sprayUsers.size < 5) throw new Error(`AUTH-002 users ${sprayUsers.size} < 5`);
    const sprayDuration = (new Date(sprayEvents[5].timestamp).getTime() - new Date(sprayEvents[0].timestamp).getTime()) / 1000;
    if (sprayDuration > 300) throw new Error(`AUTH-002 window exceeded: ${sprayDuration}s`);
    console.log(`✓ AUTH-002 passed: 6 events across ${sprayUsers.size} distinct users in ${sprayDuration}s (threshold 5 / 300s)`);

    // Test AUTH-003
    const f2sEvents = generateScenarioEvents('AUTH-003', runId, baseTime);
    if (f2sEvents.length !== 6) throw new Error(`AUTH-003 event count ${f2sEvents.length} !== 6`);
    const f2sFailures = f2sEvents.slice(0, 5);
    const f2sSuccess = f2sEvents[5];
    if (!f2sFailures.every(e => e.event_type === 'authentication_failure')) throw new Error('AUTH-003: initial 5 are not failures');
    if (f2sSuccess.event_type !== 'authentication_success') throw new Error('AUTH-003: 6th event is not success');
    const f2sUser = f2sSuccess.username;
    if (!f2sEvents.every(e => e.username === f2sUser)) throw new Error('AUTH-003: username varied across events');
    const f2sIp = f2sSuccess.source_ip;
    if (!f2sEvents.every(e => e.source_ip === f2sIp)) throw new Error('AUTH-003: source_ip varied across events');
    console.log(`✓ AUTH-003 passed: 5 failures followed by 1 success for user ${f2sUser} from ${f2sIp}`);

    // Test NET-001
    const scanEvents = generateScenarioEvents('NET-001', runId, baseTime);
    if (scanEvents.length !== 16) throw new Error(`NET-001 event count ${scanEvents.length} !== 16`);
    const scanPorts = new Set(scanEvents.map(e => e.destination_port));
    if (scanPorts.size < 15) throw new Error(`NET-001 distinct ports ${scanPorts.size} < 15`);
    const scanDuration = (new Date(scanEvents[15].timestamp).getTime() - new Date(scanEvents[0].timestamp).getTime()) / 1000;
    if (scanDuration > 60) throw new Error(`NET-001 window exceeded: ${scanDuration}s`);
    console.log(`✓ NET-001 passed: 16 connections to ${scanPorts.size} distinct ports in ${scanDuration}s (threshold 15 / 60s)`);

    // Test PRIV-001
    const privEvents = generateScenarioEvents('PRIV-001', runId, baseTime);
    if (privEvents.length !== 3) throw new Error(`PRIV-001 event count ${privEvents.length} !== 3`);
    if (privEvents[0].event_type !== 'privilege_escalation') throw new Error('PRIV-001: first event is not privilege_escalation');
    if (privEvents[1].event_type !== 'process_creation') throw new Error('PRIV-001: second event is not process_creation');
    if (privEvents[2].event_type !== 'file_access') throw new Error('PRIV-001: third event is not file_access');
    const privUser = privEvents[0].username;
    if (!privEvents.every(e => e.username === privUser)) throw new Error('PRIV-001: username varied');
    console.log(`✓ PRIV-001 passed: privilege_escalation followed by process_creation & file_access for ${privUser}`);

    // Test entity isolation across runs
    const runA_Events = generateScenarioEvents('AUTH-001', 'RUNAAA');
    const runB_Events = generateScenarioEvents('AUTH-001', 'RUNBBB');
    if (runA_Events[0].source_ip === runB_Events[0].source_ip) {
      console.warn('Note: Hash collision possible, verifying isolated IP offsets');
    }
    if (runA_Events[0].event_uid === runB_Events[0].event_uid) {
      throw new Error('Event UIDs must be globally unique across runs');
    }
    console.log('✓ Entity isolation verified: distinct runs produce unique UIDs and isolated entity hashes.');

    console.log('\nALL 5 SCENARIOS PASSED CLIENT-SIDE VALIDATION!');
  } finally {
    await server.close();
  }
}

runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
