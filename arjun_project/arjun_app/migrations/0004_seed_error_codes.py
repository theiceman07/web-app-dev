from django.db import migrations


def seed(apps, schema_editor):
    from arjun_app.errors import ERROR_CODES

    ErrorCode = apps.get_model('arjun_app', 'ErrorCode')
    for position, (code, e) in enumerate(ERROR_CODES.items(), start=1):
        ErrorCode.objects.update_or_create(
            code=code,
            defaults=dict(
                http_status=e['http'], title=e['title'], headline=e['headline'], message=e['message'],
                cause=e['cause'], fix=e['fix'], tone=e['tone'], is_site_specific=code.startswith('FC-'),
                position=position,
            ),
        )


def unseed(apps, schema_editor):
    apps.get_model('arjun_app', 'ErrorCode').objects.all().delete()


class Migration(migrations.Migration):
    dependencies = [('arjun_app', '0003_errorcode')]
    operations = [migrations.RunPython(seed, unseed)]
