from io import StringIO

from django.contrib import admin
from django.core.management import call_command
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone

from .models import FeatureRequest, Project, Release


class ModelTests(TestCase):
    def test_project_auto_slug_and_str(self):
        project = Project.objects.create(
            name="Cloud Sync",
            description="Fast bidirectional file synchronization.",
        )
        self.assertEqual(project.slug, "cloud-sync")
        self.assertEqual(str(project), "Cloud Sync")
        self.assertEqual(project.get_absolute_url(), "/projects/cloud-sync/")

    def test_release_ordering_and_defaults(self):
        project = Project.objects.create(name="PulseDB", description="Time-series DB")
        older = Release.objects.create(
            project=project,
            version="v1.0.0",
            title="Initial Release",
            summary="First public release.",
            category=Release.Category.FEATURE,
            published_at=timezone.now() - timezone.timedelta(days=5),
        )
        newer = Release.objects.create(
            project=project,
            version="v1.1.0",
            title="Query Fix",
            summary="Fixed range scan edge case.",
            category=Release.Category.FIX,
            published_at=timezone.now(),
        )
        self.assertEqual(list(project.releases.all()), [newer, older])

    def test_feature_request_ordering_by_votes(self):
        project = Project.objects.create(name="EdgeKit", description="Edge router")
        low = FeatureRequest.objects.create(
            project=project,
            title="Low votes",
            description="Details",
            votes=2,
        )
        high = FeatureRequest.objects.create(
            project=project,
            title="High votes",
            description="Details",
            votes=15,
        )
        self.assertEqual(list(project.feature_requests.all()), [high, low])


class ViewAndFeatureTests(TestCase):
    def setUp(self):
        self.project = Project.objects.create(
            name="TraceFlow",
            slug="traceflow",
            description="Distributed tracing for Python services.",
        )
        self.feat_release = Release.objects.create(
            project=self.project,
            version="v2.1.0",
            title="Regression Alerts",
            summary="Automated p95 latency alerts.",
            category=Release.Category.FEATURE,
        )
        self.fix_release = Release.objects.create(
            project=self.project,
            version="v2.0.1",
            title="Fix AsyncIO Span Leak",
            summary="Cleared completed spans on retry.",
            category=Release.Category.FIX,
        )
        self.feature_req = FeatureRequest.objects.create(
            project=self.project,
            title="Django N+1 Detector",
            description="Flag repeated SQL queries per trace.",
            status=FeatureRequest.Status.PLANNED,
            votes=10,
        )

    def test_project_list_view(self):
        response = self.client.get(reverse("changelog:project_list"))
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "TraceFlow")
        self.assertContains(response, "Regression Alerts")

    def test_project_detail_404_for_missing_slug(self):
        response = self.client.get(
            reverse("changelog:project_detail", kwargs={"slug": "does-not-exist"})
        )
        self.assertEqual(response.status_code, 404)

    def test_release_filtering_by_category_and_query(self):
        url = reverse("changelog:project_detail", kwargs={"slug": self.project.slug})

        by_category = self.client.get(url, {"category": "Fix"})
        self.assertEqual(by_category.status_code, 200)
        self.assertContains(by_category, "Fix AsyncIO Span Leak")
        self.assertNotContains(by_category, "Regression Alerts")

        by_query = self.client.get(url, {"q": "p95"})
        self.assertEqual(by_query.status_code, 200)
        self.assertContains(by_query, "Regression Alerts")
        self.assertNotContains(by_query, "Fix AsyncIO Span Leak")

    def test_submit_feature_request(self):
        url = reverse("changelog:project_detail", kwargs={"slug": self.project.slug})
        response = self.client.post(
            url,
            {
                "title": "OpenTelemetry Export",
                "description": "Export traces directly to OTLP collectors.",
            },
            follow=True,
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(
            FeatureRequest.objects.filter(
                project=self.project, title="OpenTelemetry Export"
            ).exists()
        )

    def test_upvote_feature_request_redirect_and_ajax(self):
        url = reverse("changelog:upvote_feature", kwargs={"pk": self.feature_req.pk})

        # Standard POST redirects and increments votes
        response = self.client.post(url)
        self.assertEqual(response.status_code, 302)
        self.feature_req.refresh_from_db()
        self.assertEqual(self.feature_req.votes, 11)

        # AJAX POST returns JSON and increments votes
        ajax_response = self.client.post(
            url,
            HTTP_X_REQUESTED_WITH="XMLHttpRequest",
        )
        self.assertEqual(ajax_response.status_code, 200)
        self.assertEqual(ajax_response.json(), {"id": self.feature_req.pk, "votes": 12})

        # GET is rejected
        get_response = self.client.get(url)
        self.assertEqual(get_response.status_code, 405)


class JsonApiTests(TestCase):
    def setUp(self):
        self.project = Project.objects.create(
            name="PulseDB",
            slug="pulsedb",
            description="Time-series database.",
        )
        Release.objects.create(
            project=self.project,
            version="v2.0.0",
            title="Strict Timestamps",
            summary="Removed legacy timestamp coercion.",
            category=Release.Category.BREAKING,
        )
        Release.objects.create(
            project=self.project,
            version="v2.1.0",
            title="Streaming Views",
            summary="Incremental SQL rollups.",
            category=Release.Category.FEATURE,
        )
        FeatureRequest.objects.create(
            project=self.project,
            title="OTLP Ingest",
            description="Native gRPC OTLP endpoint.",
            status=FeatureRequest.Status.IN_PROGRESS,
            votes=25,
        )

    def test_api_project_releases_and_filters(self):
        url = reverse("changelog:api_project_releases", kwargs={"slug": "pulsedb"})
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["project"]["slug"], "pulsedb")
        self.assertEqual(data["count"], 2)

        filtered = self.client.get(url, {"category": "Breaking"})
        self.assertEqual(filtered.status_code, 200)
        self.assertEqual(filtered.json()["count"], 1)
        self.assertEqual(filtered.json()["releases"][0]["version"], "v2.0.0")

        searched = self.client.get(url, {"q": "rollups"})
        self.assertEqual(searched.status_code, 200)
        self.assertEqual(searched.json()["count"], 1)
        self.assertEqual(searched.json()["releases"][0]["version"], "v2.1.0")

    def test_api_project_releases_404(self):
        url = reverse("changelog:api_project_releases", kwargs={"slug": "missing"})
        response = self.client.get(url)
        self.assertEqual(response.status_code, 404)

    def test_api_project_features(self):
        url = reverse("changelog:api_project_features", kwargs={"slug": "pulsedb"})
        response = self.client.get(url, {"status": "In Progress"})
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["count"], 1)
        self.assertEqual(data["feature_requests"][0]["title"], "OTLP Ingest")


class SeedAndAdminTests(TestCase):
    def test_seed_data_command_is_idempotent(self):
        out = StringIO()
        call_command("seed_data", stdout=out)
        self.assertEqual(Project.objects.count(), 3)
        self.assertGreaterEqual(Release.objects.count(), 10)
        self.assertGreaterEqual(FeatureRequest.objects.count(), 8)

        # Running a second time should not duplicate records
        call_command("seed_data", stdout=out)
        self.assertEqual(Project.objects.count(), 3)

    def test_models_registered_in_admin(self):
        self.assertIn(Project, admin.site._registry)
        self.assertIn(Release, admin.site._registry)
        self.assertIn(FeatureRequest, admin.site._registry)
