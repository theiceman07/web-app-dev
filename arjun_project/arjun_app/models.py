import secrets
import string

from django.db import models


class FAQ(models.Model):
    """A frequently asked question. Shown on the FAQ page and used by the assistant."""

    question = models.CharField(max_length=255)
    answer = models.TextField()
    category = models.CharField(max_length=60, default='General')
    keywords = models.CharField(max_length=255, blank=True, help_text='Comma-separated words that should match this FAQ.')
    position = models.PositiveIntegerField(default=0)
    is_published = models.BooleanField(default=True)

    class Meta:
        ordering = ['position', 'id']
        verbose_name = 'FAQ'
        verbose_name_plural = 'FAQs'

    def __str__(self):
        return self.question


def _new_reference():
    alphabet = string.ascii_uppercase.replace('O', '').replace('I', '') + string.digits.replace('0', '').replace('1', '')
    return 'FC-' + ''.join(secrets.choice(alphabet) for _ in range(6))


class Ticket(models.Model):
    """A support ticket, created from the Support form or by the assistant."""

    class Status(models.TextChoices):
        OPEN = 'open', 'Open'
        PENDING = 'pending', 'Pending'
        RESOLVED = 'resolved', 'Resolved'

    class Source(models.TextChoices):
        WEB = 'web', 'Support form'
        ASSISTANT = 'assistant', 'Assistant'

    reference = models.CharField(max_length=12, unique=True, editable=False)
    name = models.CharField(max_length=120, blank=True)
    email = models.EmailField(blank=True)
    subject = models.CharField(max_length=200)
    message = models.TextField()
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.OPEN)
    source = models.CharField(max_length=10, choices=Source.choices, default=Source.WEB)
    chat_session_id = models.CharField(max_length=64, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def save(self, *args, **kwargs):
        if not self.reference:
            # Retry on the (very unlikely) collision of a random reference.
            for _ in range(5):
                candidate = _new_reference()
                if not Ticket.objects.filter(reference=candidate).exists():
                    self.reference = candidate
                    break
            else:
                raise RuntimeError('Could not generate a unique ticket reference')
        super().save(*args, **kwargs)

    def __str__(self):
        return f'{self.reference}: {self.subject}'
