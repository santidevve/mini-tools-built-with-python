from django.contrib import messages
from django.db.models import Count, F, Q
from django.http import JsonResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.views.decorators.http import require_GET, require_POST

from .forms import FeatureRequestForm
from .models import FeatureRequest, Project, Release


def _filter_releases(queryset, category="", query=""):
    """Apply optional category and search query filters to a Release queryset."""
    valid_categories = {choice[0] for choice in Release.Category.choices}
    if category in valid_categories:
        queryset = queryset.filter(category=category)
    if query:
        queryset = queryset.filter(
            Q(title__icontains=query)
            | Q(summary__icontains=query)
            | Q(version__icontains=query)
        )
    return queryset


def project_list(request):
    """Render the Release Radar portal home with projects and recent releases."""
    query = request.GET.get("q", "").strip()
    projects = Project.objects.annotate(
        release_count=Count("releases", distinct=True),
        feature_count=Count("feature_requests", distinct=True),
    ).prefetch_related("releases")

    if query:
        projects = projects.filter(
            Q(name__icontains=query) | Q(description__icontains=query)
        )

    recent_releases = Release.objects.select_related("project").all()
    if query:
        recent_releases = _filter_releases(recent_releases, query=query)
    recent_releases = recent_releases[:8]

    return render(
        request,
        "changelog/project_list.html",
        {
            "projects": projects,
            "recent_releases": recent_releases,
            "query": query,
            "total_projects": Project.objects.count(),
            "total_releases": Release.objects.count(),
            "total_features": FeatureRequest.objects.count(),
        },
    )


def project_detail(request, slug):
    """Display a project's versioned changelog and feature request board."""
    project = get_object_or_404(Project, slug=slug)
    selected_category = request.GET.get("category", "").strip()
    selected_status = request.GET.get("status", "").strip()
    query = request.GET.get("q", "").strip()

    if request.method == "POST":
        form = FeatureRequestForm(request.POST)
        if form.is_valid():
            feature = form.save(commit=False)
            feature.project = project
            feature.save()
            messages.success(request, f'Feature request "{feature.title}" submitted!')
            return redirect(f"{project.get_absolute_url()}#features")
    else:
        form = FeatureRequestForm()

    releases = _filter_releases(
        project.releases.all(),
        category=selected_category,
        query=query,
    )

    feature_requests = project.feature_requests.all()
    valid_statuses = {choice[0] for choice in FeatureRequest.Status.choices}
    if selected_status in valid_statuses:
        feature_requests = feature_requests.filter(status=selected_status)

    return render(
        request,
        "changelog/project_detail.html",
        {
            "project": project,
            "releases": releases,
            "feature_requests": feature_requests,
            "form": form,
            "categories": Release.Category.choices,
            "statuses": FeatureRequest.Status.choices,
            "selected_category": selected_category,
            "selected_status": selected_status,
            "query": query,
        },
    )


@require_POST
def upvote_feature(request, pk):
    """Atomically increment the vote count for a feature request."""
    feature = get_object_or_404(FeatureRequest, pk=pk)
    FeatureRequest.objects.filter(pk=feature.pk).update(votes=F("votes") + 1)
    feature.refresh_from_db(fields=["votes"])

    wants_json = (
        request.headers.get("x-requested-with") == "XMLHttpRequest"
        or "application/json" in request.headers.get("accept", "")
    )
    if wants_json:
        return JsonResponse({"id": feature.pk, "votes": feature.votes})

    messages.success(request, f'Upvoted "{feature.title}" ({feature.votes} votes).')
    return redirect(f"{feature.project.get_absolute_url()}#features")


@require_GET
def api_project_releases(request, slug):
    """JSON API returning a project's releases with optional category and search filters."""
    project = get_object_or_404(Project, slug=slug)
    category = request.GET.get("category", "").strip()
    query = request.GET.get("q", "").strip()

    releases = _filter_releases(project.releases.all(), category=category, query=query)
    payload = {
        "project": {
            "name": project.name,
            "slug": project.slug,
            "description": project.description,
        },
        "count": releases.count(),
        "releases": [
            {
                "id": rel.pk,
                "version": rel.version,
                "title": rel.title,
                "summary": rel.summary,
                "category": rel.category,
                "published_at": rel.published_at.isoformat(),
            }
            for rel in releases
        ],
    }
    return JsonResponse(payload)


@require_GET
def api_project_features(request, slug):
    """JSON API returning a project's feature requests with optional status filter."""
    project = get_object_or_404(Project, slug=slug)
    status = request.GET.get("status", "").strip()

    features = project.feature_requests.all()
    valid_statuses = {choice[0] for choice in FeatureRequest.Status.choices}
    if status in valid_statuses:
        features = features.filter(status=status)

    payload = {
        "project": {
            "name": project.name,
            "slug": project.slug,
        },
        "count": features.count(),
        "feature_requests": [
            {
                "id": feat.pk,
                "title": feat.title,
                "description": feat.description,
                "status": feat.status,
                "votes": feat.votes,
                "created_at": feat.created_at.isoformat(),
            }
            for feat in features
        ],
    }
    return JsonResponse(payload)
