from django.contrib import admin

from .models import FeatureRequest, Project, Release


class ReleaseInline(admin.TabularInline):
    model = Release
    extra = 0
    fields = ("version", "title", "category", "published_at")
    ordering = ("-published_at",)


@admin.register(Project)
class ProjectAdmin(admin.ModelAdmin):
    list_display = ("name", "slug", "release_count", "feature_request_count", "created_at")
    search_fields = ("name", "slug", "description")
    prepopulated_fields = {"slug": ("name",)}
    inlines = [ReleaseInline]

    @admin.display(description="Releases")
    def release_count(self, obj):
        return obj.releases.count()

    @admin.display(description="Feature Requests")
    def feature_request_count(self, obj):
        return obj.feature_requests.count()


@admin.register(Release)
class ReleaseAdmin(admin.ModelAdmin):
    list_display = ("version", "title", "project", "category", "published_at")
    list_filter = ("category", "project", "published_at")
    search_fields = ("version", "title", "summary", "project__name")
    date_hierarchy = "published_at"
    ordering = ("-published_at", "-id")


@admin.register(FeatureRequest)
class FeatureRequestAdmin(admin.ModelAdmin):
    list_display = ("title", "project", "status", "votes", "created_at")
    list_filter = ("status", "project")
    search_fields = ("title", "description", "project__name")
    list_editable = ("status",)
    ordering = ("-votes", "-created_at")
    actions = ("mark_planned", "mark_in_progress", "mark_shipped")

    @admin.action(description="Mark selected requests as Planned")
    def mark_planned(self, request, queryset):
        queryset.update(status=FeatureRequest.Status.PLANNED)

    @admin.action(description="Mark selected requests as In Progress")
    def mark_in_progress(self, request, queryset):
        queryset.update(status=FeatureRequest.Status.IN_PROGRESS)

    @admin.action(description="Mark selected requests as Shipped")
    def mark_shipped(self, request, queryset):
        queryset.update(status=FeatureRequest.Status.SHIPPED)
