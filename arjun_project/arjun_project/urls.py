"""
URL configuration for arjun_project project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/4.2/topics/http/urls/
"""
from django.urls import path, re_path

from arjun_app import views

# Custom error pages. Django uses these when DEBUG is False; the catch-all
# route at the bottom shows the same 404 page while DEBUG is True.
handler400 = 'arjun_app.views.handler400'
handler403 = 'arjun_app.views.handler403'
handler404 = 'arjun_app.views.handler404'
handler500 = 'arjun_app.views.handler500'

urlpatterns = [
    # Pages
    path('', views.index, name='index'),
    path('faq/', views.faq, name='faq'),
    path('support/', views.support, name='support'),
    path('status/', views.status_index, name='status-index'),
    path('errors/', views.status_index, name='errors'),
    path('status/<str:code>/', views.status_page, name='status'),
    path('health/', views.health, name='health'),
    # JSON APIs
    path('api/assistant/', views.assistant, name='assistant'),
    path('api/feedback/', views.feedback, name='feedback'),
    path('api/tickets/email/', views.ticket_attach_email, name='ticket-email'),
    path('api/tickets/<str:reference>/', views.ticket_lookup, name='ticket-lookup'),
    path('api/weather-scene/', views.weather_scene, name='weather-scene'),
    path('api/health/', views.health, name='api-health'),
    re_path(r'^.*$', views.not_found),
]
