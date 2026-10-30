from django.http import JsonResponse
from django.urls import path

def health(request):
    return JsonResponse({"status": "ok", "service": "ai-engine"})

urlpatterns = [path("api/health/", health)]