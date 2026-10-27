"""
URL configuration for arjun_project project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/4.2/topics/http/urls/
"""
from django.contrib import admin
from django.urls import path, re_path

from arjun_app import views

# Custom error pages. Django uses these when DEBUG is False; the catch-all
# route at the bottom shows the same 404 page while DEBUG is True.
handler400 = 'arjun_app.views.handler400'
handler403 = 'arjun_app.views.handler403'
handler404 = 'arjun_app.views.handler404'
handler500 = 'arjun_app.views.handler500'

urlpatterns = [
    path('admin/', admin.site.urls),
    path('', views.index, name='index'),
    path('api/assistant/', views.assistant, name='assistant'),
    path('status/', views.status_index, name='status-index'),
    path('status/<int:code>/', views.status_page, name='status'),
    re_path(r'^.*$', views.not_found),
]
