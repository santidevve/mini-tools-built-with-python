from django.urls import path

from . import views

app_name = "changelog"

urlpatterns = [
    path("", views.project_list, name="project_list"),
    path("projects/<slug:slug>/", views.project_detail, name="project_detail"),
    path("features/<int:pk>/upvote/", views.upvote_feature, name="upvote_feature"),
    path(
        "api/projects/<slug:slug>/releases/",
        views.api_project_releases,
        name="api_project_releases",
    ),
    path(
        "api/projects/<slug:slug>/features/",
        views.api_project_features,
        name="api_project_features",
    ),
]
