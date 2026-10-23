import React, { useState, useRef } from 'react'
import type { IngestSummary } from '../../types/event'
import { ingestJsonEvents, ingestJsonlFile } from '../../api/client'
import {
  UploadCloudIcon,
  RefreshCwIcon,
  CheckCircleIcon,
  AlertTriangleIcon,
  XCircleIcon,
  TerminalIcon,
} from '../common/Icons'

interface IngestionViewProps {
  onEventsIngested?: () => void
}

const SAMPLE_PAYLOADS: { label: string; data: unknown }[] = [
  {
    label: 'Single Auth Failure (Real Telemetry)',
    data: {
      event_uid: `evt-${Date.now()}-01`,
      timestamp: new Date().toISOString(),
      event_type: 'authentication_failure',
      source_ip: '192.168.1.105',
      destination_ip: '10.0.0.1',
      destination_port: 22,
      username: 'analyst_bob',
      host: 'bastion-01',
      source: 'ssh-daemon',
      severity: 'medium',
      is_synthetic: false,
    },
  },
  {
    label: 'Batch Auth Spray Telemetry (Array)',
    data: [
      {
        event_uid: `spray-${Date.now()}-1`,
        timestamp: new Date(Date.now() - 4000).toISOString(),
        event_type: 'authentication_failure',
        source_ip: '198.51.100.44',
        destination_ip: '10.0.0.5',
        destination_port: 443,
        username: 'admin',
        source: 'edge-vpn',
        severity: 'high',
        is_synthetic: false,
      },
      {
        event_uid: `spray-${Date.now()}-2`,
        timestamp: new Date(Date.now() - 3000).toISOString(),
        event_type: 'authentication_failure',
        source_ip: '198.51.100.44',
        destination_ip: '10.0.0.5',
        destination_port: 443,
        username: 'root',
        source: 'edge-vpn',
        severity: 'high',
        is_synthetic: false,
      },
      {
        event_uid: `spray-${Date.now()}-3`,
        timestamp: new Date(Date.now() - 2000).toISOString(),
        event_type: 'authentication_failure',
        source_ip: '198.51.100.44',
        destination_ip: '10.0.0.5',
        destination_port: 443,
        username: 'service_acc',
        source: 'edge-vpn',
        severity: 'high',
        is_synthetic: false,
      },
    ],
  },
  {
    label: 'Malformed Payload (For Testing Validation)',
    data: {
      event_uid: 'bad-event-999',
      timestamp: 'not-a-valid-timestamp',
      event_type: 'invalid_type_name',
      source_ip: 'not_an_ip',
      destination_port: 999999, // invalid port range
    },
  },
]

export function IngestionView({ onEventsIngested }: IngestionViewProps) {
  const [mode, setMode] = useState<'json' | 'file'>('json')
  const [jsonInput, setJsonInput] = useState<string>(
    JSON.stringify(SAMPLE_PAYLOADS[0].data, null, 2)
  )
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [dragActive, setDragActive] = useState<boolean>(false)

  // Ingestion status
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false)
  const [ingestStatus, setIngestStatus] = useState<number | null>(null)
  const [resultSummary, setResultSummary] = useState<IngestSummary | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleJsonSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrorMessage(null)
    setResultSummary(null)
    setIngestStatus(null)

    let parsed: unknown
    try {
      parsed = JSON.parse(jsonInput)
    } catch {
      setErrorMessage('Input is not valid JSON. Please correct syntax before submitting.')
      return
    }

    setIsSubmitting(true)
    try {
      const res = await ingestJsonEvents(parsed)
      setIngestStatus(res.status)
      setResultSummary(res.summary)
      if (res.summary.accepted_count > 0 && onEventsIngested) {
        onEventsIngested()
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : String(err))
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleFileSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedFile) {
      setErrorMessage('Please select a JSONL file first.')
      return
    }

    setErrorMessage(null)
    setResultSummary(null)
    setIngestStatus(null)
    setIsSubmitting(true)

    try {
      const res = await ingestJsonlFile(selectedFile)
      setIngestStatus(res.status)
      setResultSummary(res.summary)
      if (res.summary.accepted_count > 0 && onEventsIngested) {
        onEventsIngested()
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : String(err))
    } finally {
      setIsSubmitting(false)
    }
  }

  function handleFileDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragActive(false)
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setSelectedFile(e.dataTransfer.files[0])
    }
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Mode Selector Tabs */}
      <div className="flex border-b border-border-subtle">
        <button
          onClick={() => {
            setMode('json')
            setResultSummary(null)
            setErrorMessage(null)
          }}
          className={`px-4 py-2.5 text-xs font-mono font-medium border-b-2 transition-colors flex items-center gap-2 ${
            mode === 'json'
              ? 'border-cyan-400 text-cyan-400 bg-panel-primary'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <TerminalIcon className="w-4 h-4" />
          JSON Event / Array Editor
        </button>
        <button
          onClick={() => {
            setMode('file')
            setResultSummary(null)
            setErrorMessage(null)
          }}
          className={`px-4 py-2.5 text-xs font-mono font-medium border-b-2 transition-colors flex items-center gap-2 ${
            mode === 'file'
              ? 'border-cyan-400 text-cyan-400 bg-panel-primary'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <UploadCloudIcon className="w-4 h-4" />
          JSONL File Stream Upload
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Input Form (8 cols) */}
        <div className="lg:col-span-7 space-y-4">
          {mode === 'json' ? (
            <form onSubmit={handleJsonSubmit} className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-slate-400">
                  Pre-configured Telemetry Samples:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {SAMPLE_PAYLOADS.map((sample, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setJsonInput(JSON.stringify(sample.data, null, 2))}
                      className="px-2 py-0.5 rounded bg-panel-secondary hover:bg-panel-elevated border border-border-subtle text-[11px] font-mono text-cyan-300"
                    >
                      {sample.label.split(' ')[0]} {sample.label.split(' ')[1]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-lg bg-panel-primary border border-border-subtle overflow-hidden focus-within:border-cyan-500/50">
                <div className="px-3 py-1.5 bg-panel-secondary border-b border-border-subtle text-[11px] font-mono text-slate-400 flex items-center justify-between">
                  <span>Input JSON Payload (Single Object or Array)</span>
                  <span className="text-[10px] text-slate-500">Max batch: 1,000 records (~5 MB)</span>
                </div>
                <textarea
                  rows={14}
                  value={jsonInput}
                  onChange={(e) => setJsonInput(e.target.value)}
                  className="w-full p-3.5 bg-black/80 text-cyan-300 font-mono text-xs leading-relaxed focus:outline-none resize-y"
                  placeholder="Paste or write JSON telemetry payload..."
                />
              </div>

              <div className="flex items-center justify-between pt-1">
                <div className="text-[11px] font-mono text-slate-500">
                  Target Endpoint: <code className="text-slate-400">POST /api/events/ingest</code>
                </div>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-2 px-5 py-2 rounded-md bg-cyan-500 text-slate-950 font-mono font-bold text-xs hover:bg-cyan-400 disabled:opacity-50 transition-colors"
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCwIcon className="w-3.5 h-3.5 animate-spin" />
                      Normalizing & Ingesting...
                    </>
                  ) : (
                    <>
                      <UploadCloudIcon className="w-4 h-4" />
                      Ingest Events
                    </>
                  )}
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleFileSubmit} className="space-y-4">
              <div
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragActive(true)
                }}
                onDragLeave={() => setDragActive(false)}
                onDrop={handleFileDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`p-8 rounded-lg border-2 border-dashed text-center cursor-pointer transition-all ${
                  dragActive
                    ? 'border-cyan-400 bg-cyan-950/20'
                    : selectedFile
                    ? 'border-emerald-500/50 bg-panel-primary'
                    : 'border-border-subtle hover:border-slate-700 bg-panel-primary'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".jsonl,.txt"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      setSelectedFile(e.target.files[0])
                    }
                  }}
                />
                <UploadCloudIcon className="w-10 h-10 text-cyan-400 mx-auto mb-3" />
                <h4 className="text-sm font-semibold text-slate-200">
                  {selectedFile ? selectedFile.name : 'Choose a JSONL file or drag and drop'}
                </h4>
                <p className="mt-1 text-xs text-slate-400 font-mono">
                  {selectedFile
                    ? `${(selectedFile.size / 1024).toFixed(1)} KB selected`
                    : 'Newline-delimited JSON stream (.jsonl) · Max 10,000 records (~10 MB)'}
                </p>
              </div>

              <div className="flex items-center justify-between pt-1">
                <div className="text-[11px] font-mono text-slate-500">
                  Multipart field name: <code className="text-slate-400">'file'</code>
                </div>
                <button
                  type="submit"
                  disabled={isSubmitting || !selectedFile}
                  className="inline-flex items-center gap-2 px-5 py-2 rounded-md bg-cyan-500 text-slate-950 font-mono font-bold text-xs hover:bg-cyan-400 disabled:opacity-50 transition-colors"
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCwIcon className="w-3.5 h-3.5 animate-spin" />
                      Streaming & Persisting...
                    </>
                  ) : (
                    <>
                      <UploadCloudIcon className="w-4 h-4" />
                      Upload & Ingest JSONL
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Right: API Ingestion Result Breakdown (5 cols) */}
        <div className="lg:col-span-5 rounded-lg bg-panel-primary border border-border-subtle p-5 space-y-4">
          <div className="pb-3 border-b border-border-subtle flex items-center justify-between">
            <h3 className="text-xs font-mono font-bold text-slate-200 uppercase tracking-wider">
              Ingestion Response Status
            </h3>
            {ingestStatus && (
              <span
                className={`text-[11px] font-mono font-semibold px-2 py-0.5 rounded border ${
                  ingestStatus === 201
                    ? 'bg-emerald-950/40 text-emerald-300 border-emerald-600/40'
                    : ingestStatus === 207
                    ? 'bg-amber-950/40 text-amber-300 border-amber-600/40'
                    : 'bg-rose-950/40 text-rose-300 border-rose-600/40'
                }`}
              >
                HTTP {ingestStatus} {ingestStatus === 201 ? 'CREATED' : ingestStatus === 207 ? 'MULTI-STATUS' : 'FAILED'}
              </span>
            )}
          </div>

          {errorMessage && (
            <div className="p-3 rounded bg-rose-950/30 border border-rose-600/40 text-xs text-rose-300 font-mono space-y-1">
              <div className="font-bold flex items-center gap-1.5">
                <XCircleIcon className="w-4 h-4" /> Ingestion Error
              </div>
              <div>{errorMessage}</div>
            </div>
          )}

          {!resultSummary && !errorMessage && (
            <div className="py-12 text-center text-xs font-mono text-slate-400">
              Submit a JSON payload or JSONL file to view validation and persistence metrics.
            </div>
          )}

          {resultSummary && (
            <div className="space-y-4 font-mono text-xs">
              {/* Metric Counters Grid */}
              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="p-2.5 rounded bg-panel-secondary border border-border-subtle">
                  <div className="text-[10px] uppercase text-slate-400">Received</div>
                  <div className="text-lg font-bold text-slate-100">{resultSummary.received_count}</div>
                </div>
                <div className="p-2.5 rounded bg-emerald-950/20 border border-emerald-800/30">
                  <div className="text-[10px] uppercase text-emerald-400">Accepted</div>
                  <div className="text-lg font-bold text-emerald-300">{resultSummary.accepted_count}</div>
                </div>
                <div className="p-2.5 rounded bg-amber-950/20 border border-amber-800/30">
                  <div className="text-[10px] uppercase text-amber-400">Duplicates</div>
                  <div className="text-lg font-bold text-amber-300">{resultSummary.duplicate_count}</div>
                </div>
                <div className="p-2.5 rounded bg-rose-950/20 border border-rose-800/30">
                  <div className="text-[10px] uppercase text-rose-400">Rejected</div>
                  <div className="text-lg font-bold text-rose-300">{resultSummary.rejected_count}</div>
                </div>
              </div>

              {/* Accepted Records List */}
              {resultSummary.accepted && resultSummary.accepted.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-[11px] font-semibold text-emerald-400 flex items-center gap-1.5">
                    <CheckCircleIcon className="w-3.5 h-3.5" />
                    Persisted Records ({resultSummary.accepted.length}):
                  </div>
                  <div className="max-h-36 overflow-y-auto divide-y divide-border-subtle border border-border-subtle rounded bg-panel-secondary">
                    {resultSummary.accepted.map((rec) => (
                      <div key={rec.id} className="p-1.5 flex items-center justify-between text-[11px]">
                        <span className="text-slate-200">ID #{rec.id}</span>
                        <span className="text-cyan-400">{rec.event_uid}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Rejected Records Errors */}
              {resultSummary.rejected && resultSummary.rejected.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-[11px] font-semibold text-rose-400 flex items-center gap-1.5">
                    <AlertTriangleIcon className="w-3.5 h-3.5" />
                    Rejected Validation Errors ({resultSummary.rejected.length}):
                  </div>
                  <div className="max-h-44 overflow-y-auto space-y-1.5">
                    {resultSummary.rejected.map((rej, i) => (
                      <div key={i} className="p-2 rounded bg-rose-950/30 border border-rose-800/40 text-[11px]">
                        <div className="font-semibold text-rose-300">
                          Index #{rej.index} {rej.event_uid ? `(${rej.event_uid})` : ''}
                        </div>
                        <ul className="mt-1 space-y-0.5 text-rose-200">
                          {rej.errors.map((err, ei) => (
                            <li key={ei}>
                              <span className="text-rose-400">• {err.field}:</span> {err.message}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Duplicates notice */}
              {resultSummary.duplicates && resultSummary.duplicates.length > 0 && (
                <div className="p-2 rounded bg-amber-950/20 border border-amber-800/30 text-[11px] text-amber-300">
                  <span>{resultSummary.duplicates.length} duplicate event UID(s) already existed in DB.</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
