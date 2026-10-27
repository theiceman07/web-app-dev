from django.db import migrations

FAQS = [
    ('Getting started', 'What is FoleyCraft?',
     'FoleyCraft is a browser studio for building soundscapes. You place sounds around a listener, such as a torch on the left and rain far behind, and hear them in 3D through ordinary headphones. Every sound is generated live, so nothing is a repeating loop.',
     'about, what, studio, soundscape, foley'),
    ('Getting started', 'Do I need to install anything or create an account?',
     'No. FoleyCraft runs entirely in your browser. There is nothing to install and no account to create. Open the studio and press play.',
     'install, account, signup, sign up, download, register, login'),
    ('Getting started', 'Why should I use headphones?',
     'The 3D effect works by giving each ear a slightly different sound, which only works with headphones. On laptop speakers the sounds still play, but they will not seem to come from around you.',
     'headphones, speakers, 3d, binaural, hrtf'),
    ('Using the studio', 'How do I place a sound around me?',
     'Drag a sound on the round stage. Sounds near the centre are close to the listener and sounds near the edge are far away. You can also select a sound and use the arrow keys to nudge it half a metre at a time.',
     'place, move, drag, position, stage, radar, arrow keys'),
    ('Using the studio', 'Why can I not hear anything?',
     'Browsers only allow sound after you press a button, so press Play first. Then check that your device volume is up, the master volume in the studio is not muted, and that the sound you want is not muted or soloed against another one.',
     'no sound, silent, cannot hear, mute, volume, play, audio not working'),
    ('Using the studio', 'What are scenes and presets?',
     'A scene is a saved arrangement of sounds and room settings. FoleyCraft includes seven ready-made scenes, such as Dungeon Crypt and Cozy Tavern Hearth. Pick one to hear it, then change anything you like and save your own version.',
     'scene, preset, dungeon, tavern, thunderstorm, forest, saved, save'),
    ('Using the studio', 'What does the room setting do?',
     'The room setting adds the space around the sounds with a generated reverb. A small room has a short tail, a cathedral has a long one. Decay time can be set from 0.2 to 8 seconds.',
     'room, reverb, echo, decay, cathedral, space'),
    ('Exporting', 'Can I export my soundscape?',
     'Yes. The studio exports your scene as a 16-bit WAV file at 44.1 kHz. You can drop the file into Unity, Unreal Engine, Godot or any audio editor. You can also export and import a scene file to continue editing later.',
     'export, wav, download, unity, unreal, godot, save file'),
    ('Exporting', 'Is the audio really different every time?',
     'Yes. Crackles, drips and gusts are synthesised as they play instead of being a recorded loop, so the pattern never repeats. Exports capture one rendering of the scene.',
     'loop, repeat, random, procedural, generated, different'),
    ('Account and data', 'Where are my saved scenes stored?',
     'Saved scenes stay in your own browser, in local storage. They are not uploaded to a server, so clearing your browser data or switching browsers removes them. Export a scene file if you want a backup.',
     'saved, storage, local storage, backup, lost, data, privacy, where'),
    ('Support', 'How do I contact support or report a problem?',
     'Use the Support page to send a ticket, or ask the assistant. If the assistant cannot answer from this FAQ it opens a ticket for you automatically. Every ticket gets a reference like FC-ABC123 that you can use to check its status.',
     'contact, support, help, ticket, report, bug, problem, email'),
    ('Support', 'What do the error codes mean?',
     'The Errors page lists every code the site can show, such as 404 for a missing page, 429 for too many requests and 503 when a service is down, plus the site-specific code FC-100 for when the AI is slow and the FAQ answers instead. Ask the assistant about any code for a quick explanation.',
     'error, code, 404, 500, 503, 429, 403, 401, 400, fc-100, status'),
    ('Support', 'Which browsers does FoleyCraft support?',
     'Any recent version of Chrome, Edge, Firefox or Safari. It uses the Web Audio API, which these browsers provide, on both desktop and mobile.',
     'browser, chrome, safari, firefox, edge, mobile, phone, support'),
]


def seed(apps, schema_editor):
    FAQ = apps.get_model('arjun_app', 'FAQ')
    if FAQ.objects.exists():
        return
    for position, (category, question, answer, keywords) in enumerate(FAQS, start=1):
        FAQ.objects.create(category=category, question=question, answer=answer, keywords=keywords, position=position)


def unseed(apps, schema_editor):
    apps.get_model('arjun_app', 'FAQ').objects.filter(question__in=[f[1] for f in FAQS]).delete()


class Migration(migrations.Migration):
    dependencies = [('arjun_app', '0001_initial')]
    operations = [migrations.RunPython(seed, unseed)]
