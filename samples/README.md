# Synthetic sample data

Everything in this folder is **synthetic** data authored for demonstrations and
tests. It is never real collected telemetry.

To keep synthetic and real data distinguishable end to end, every event the
engine ingests carries an explicit source marker (for example a `source` field
and an `is_synthetic` boolean on the canonical event). Data seeded from this
folder is flagged as synthetic; data arriving through the live ingestion API is
not. The dashboard surfaces this distinction so demo data is never mistaken for
real activity.

Sample event files are added from Phase 1 onward.
