from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from changelog.models import FeatureRequest, Project, Release


SAMPLE_DATA = [
    {
        "name": "PulseDB",
        "slug": "pulsedb",
        "description": "Serverless time-series database built for real-time telemetry, anomaly alerts, and sub-10ms analytical queries.",
        "releases": [
            {
                "version": "v2.4.0",
                "title": "Streaming SQL Materialized Views",
                "summary": "Create continuous rollups over high-cardinality event streams with automatic incremental refresh and zero-downtime schema evolution.",
                "category": Release.Category.FEATURE,
                "days_ago": 2,
            },
            {
                "version": "v2.3.2",
                "title": "Fix WAL Compaction Memory Spike",
                "summary": "Resolved an issue where concurrent partition merges could retain stale write-ahead log buffers under heavy ingestion bursts.",
                "category": Release.Category.FIX,
                "days_ago": 9,
            },
            {
                "version": "v2.3.0",
                "title": "Faster Parquet Cold-Tier Scans",
                "summary": "Added dictionary-encoded predicate pushdown for archived S3 partitions, cutting cold query latency by up to 42%.",
                "category": Release.Category.IMPROVEMENT,
                "days_ago": 18,
            },
            {
                "version": "v2.0.0",
                "title": "Strict ISO-8601 Timestamp Parsing",
                "summary": "Legacy Unix-millisecond string coercion on ingest endpoints has been removed. Clients must send explicit epoch integers or RFC-3339 timestamps.",
                "category": Release.Category.BREAKING,
                "days_ago": 35,
            },
        ],
        "features": [
            {
                "title": "Native OpenTelemetry OTLP gRPC Ingest",
                "description": "Accept metrics and trace spans directly via OTLP gRPC without needing a sidecar collector.",
                "status": FeatureRequest.Status.IN_PROGRESS,
                "votes": 48,
            },
            {
                "title": "Per-Tenant Query Cost Quotas",
                "description": "Set soft and hard scan limits per API token to prevent runaway ad-hoc dashboards from impacting production.",
                "status": FeatureRequest.Status.PLANNED,
                "votes": 31,
            },
            {
                "title": "CSV & Parquet One-Click Export",
                "description": "Download any SQL query result directly from the web console as compressed Parquet or CSV.",
                "status": FeatureRequest.Status.SHIPPED,
                "votes": 64,
            },
        ],
    },
    {
        "name": "EdgeKit",
        "slug": "edgekit",
        "description": "Zero-config edge routing, rate limiting, and signed-webhook verification middleware for modern APIs.",
        "releases": [
            {
                "version": "v1.9.0",
                "title": "Adaptive Token-Bucket Rate Limiter",
                "summary": "Dynamically adjust burst allowances per region using sliding-window counters synchronized across edge PoPs.",
                "category": Release.Category.FEATURE,
                "days_ago": 4,
            },
            {
                "version": "v1.8.4",
                "title": "Fix IPv6 CIDR Matching in Allowlists",
                "summary": "Corrected compressed IPv6 prefix normalization when evaluating organization-level IP allowlist rules.",
                "category": Release.Category.FIX,
                "days_ago": 12,
            },
            {
                "version": "v1.8.0",
                "title": "Remove Deprecated X-Edge-Auth Header",
                "summary": "Replaced X-Edge-Auth with standard Authorization: Bearer tokens across all control-plane endpoints.",
                "category": Release.Category.BREAKING,
                "days_ago": 27,
            },
        ],
        "features": [
            {
                "title": "Terraform Provider for Route Rules",
                "description": "Manage edge route policies, rate limits, and custom error pages declaratively via Terraform.",
                "status": FeatureRequest.Status.IN_PROGRESS,
                "votes": 53,
            },
            {
                "title": "Mutual TLS Client Certificate Pinning",
                "description": "Upload custom root CAs and enforce mTLS verification at the edge before traffic reaches origin.",
                "status": FeatureRequest.Status.PLANNED,
                "votes": 27,
            },
            {
                "title": "Real-Time Request Replay Debugger",
                "description": "Inspect blocked requests in the dashboard and replay them against staging rules.",
                "status": FeatureRequest.Status.SHIPPED,
                "votes": 41,
            },
        ],
    },
    {
        "name": "TraceFlow",
        "slug": "traceflow",
        "description": "Lightweight distributed tracing and release-regression detector for Python and Go microservices.",
        "releases": [
            {
                "version": "v3.2.0",
                "title": "Automated Deployment Regression Alerts",
                "summary": "Correlates p95 latency shifts with Git release tags and posts actionable diffs to Slack or PagerDuty within 60 seconds.",
                "category": Release.Category.FEATURE,
                "days_ago": 1,
            },
            {
                "version": "v3.1.5",
                "title": "Reduce Python SDK Span Overhead",
                "summary": "Switched background batch exporter to a lock-free ring buffer, lowering CPU overhead under 10k req/s.",
                "category": Release.Category.IMPROVEMENT,
                "days_ago": 14,
            },
            {
                "version": "v3.1.2",
                "title": "Fix Duplicate Span Links on AsyncIO Retries",
                "summary": "Ensured contextvar propagation clears completed parent spans when httpx retries a timed-out upstream call.",
                "category": Release.Category.FIX,
                "days_ago": 22,
            },
        ],
        "features": [
            {
                "title": "Django ORM N+1 Query Detector",
                "description": "Highlight repeated SQL patterns within a single request trace and suggest select_related/prefetch_related.",
                "status": FeatureRequest.Status.PLANNED,
                "votes": 72,
            },
            {
                "title": "Dark Mode Flamegraph Export",
                "description": "Export shareable SVG flamegraphs for postmortems and incident reviews.",
                "status": FeatureRequest.Status.SHIPPED,
                "votes": 39,
            },
        ],
    },
]


class Command(BaseCommand):
    help = "Seed Release Radar with sample products, releases, and feature requests."

    def add_arguments(self, parser):
        parser.add_argument(
            "--reset",
            action="store_true",
            help="Delete existing changelog data before seeding.",
        )

    def handle(self, *args, **options):
        if options["reset"]:
            FeatureRequest.objects.all().delete()
            Release.objects.all().delete()
            Project.objects.all().delete()
            self.stdout.write(self.style.WARNING("Cleared existing changelog data."))

        now = timezone.now()
        created_projects = 0
        created_releases = 0
        created_features = 0

        for item in SAMPLE_DATA:
            project, p_created = Project.objects.get_or_create(
                slug=item["slug"],
                defaults={
                    "name": item["name"],
                    "description": item["description"],
                },
            )
            if p_created:
                created_projects += 1

            for rel in item["releases"]:
                _, r_created = Release.objects.get_or_create(
                    project=project,
                    version=rel["version"],
                    defaults={
                        "title": rel["title"],
                        "summary": rel["summary"],
                        "category": rel["category"],
                        "published_at": now - timedelta(days=rel["days_ago"]),
                    },
                )
                if r_created:
                    created_releases += 1

            for feat in item["features"]:
                _, f_created = FeatureRequest.objects.get_or_create(
                    project=project,
                    title=feat["title"],
                    defaults={
                        "description": feat["description"],
                        "status": feat["status"],
                        "votes": feat["votes"],
                    },
                )
                if f_created:
                    created_features += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"Seed complete: {created_projects} projects, "
                f"{created_releases} releases, {created_features} feature requests added."
            )
        )
