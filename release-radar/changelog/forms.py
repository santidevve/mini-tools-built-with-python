from django import forms

from .models import FeatureRequest


class FeatureRequestForm(forms.ModelForm):
    """Form for submitting a new product feature request."""

    class Meta:
        model = FeatureRequest
        fields = ["title", "description"]
        widgets = {
            "title": forms.TextInput(
                attrs={
                    "placeholder": "e.g., Webhook signature verification helper",
                    "maxlength": 200,
                }
            ),
            "description": forms.Textarea(
                attrs={
                    "rows": 4,
                    "placeholder": "Describe the problem this solves and how you'd use it...",
                }
            ),
        }
