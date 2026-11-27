from django.db import models
from django.urls import reverse
from django.utils import timezone
from django.utils.text import slugify


class Project(models.Model):
    """A software product whose releases and feature requests are tracked."""

    name = models.CharField(max_length=120, unique=True)
    slug = models.SlugField(max_length=140, unique=True, blank=True)
    description = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = slugify(self.name)
        super().save(*args, **kwargs)

    def get_absolute_url(self):
        return reverse("changelog:project_detail", kwargs={"slug": self.slug})

    def __str__(self):
        return self.name


class Release(models.Model):
    """A versioned changelog entry belonging to a Project."""

    class Category(models.TextChoices):
        FEATURE = "Feature", "Feature"
        FIX = "Fix", "Fix"
        BREAKING = "Breaking", "Breaking"
        IMPROVEMENT = "Improvement", "Improvement"

    project = models.ForeignKey(
        Project,
        on_delete=models.CASCADE,
        related_name="releases",
    )
    version = models.CharField(max_length=32)
    title = models.CharField(max_length=200)
    summary = models.TextField()
    category = models.CharField(
        max_length=20,
        choices=Category.choices,
        default=Category.FEATURE,
    )
    published_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["-published_at", "-id"]

    def __str__(self):
        return f"{self.project.name} {self.version} - {self.title}"


class FeatureRequest(models.Model):
    """A community-submitted feature request with status tracking and upvotes."""

    class Status(models.TextChoices):
        PLANNED = "Planned", "Planned"
        IN_PROGRESS = "In Progress", "In Progress"
        SHIPPED = "Shipped", "Shipped"

    project = models.ForeignKey(
        Project,
        on_delete=models.CASCADE,
        related_name="feature_requests",
    )
    title = models.CharField(max_length=200)
    description = models.TextField()
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PLANNED,
    )
    votes = models.PositiveIntegerField(default=1)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-votes", "-created_at"]

    def __str__(self):
        return f"{self.title} ({self.status})"
