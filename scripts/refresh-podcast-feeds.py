"""Refresh an allowlisted public RSS directory; never download audio or private feeds."""
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.parse import urlsplit
from urllib.error import URLError
import json
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
SOURCE = 'https://api.substack.com/feed/podcast/1605429.rss'
ITUNES = 'http://www.itunes.com/dtds/podcast-1.0.dtd'
ET.register_namespace('itunes', ITUNES)

def apple_feed():
    # The publisher's public Apple directory supplies the same enclosure and RSS GUID.
    address = 'https://itunes.apple.com/lookup?id=1696009195&entity=podcastEpisode&limit=200'
    with urlopen(address, timeout=40) as response:
        raw = response.read(8 * 1024 * 1024 + 1)
    if len(raw) > 8 * 1024 * 1024:
        raise ValueError('Podcast directory too large')
    results = json.loads(raw)['results']
    show = next((item for item in results if item.get('kind') == 'podcast' and item.get('collectionId') == 1696009195), None)
    if not show or show.get('feedUrl') != SOURCE or show.get('collectionName') != 'Quebec French Podcast':
        raise ValueError('Apple podcast identity does not match the publisher')
    root = ET.Element('rss', version='2.0')
    channel = ET.SubElement(root, 'channel')
    for name, value in {'title': show['collectionName'], 'language': 'fr', 'link': 'https://www.frenchwithfrederic.com/podcast', '{'+ITUNES+'}author': show['artistName']}.items():
        ET.SubElement(channel, name).text = value
    ET.SubElement(channel, '{'+ITUNES+'}image', href=show.get('artworkUrl600', ''))
    from email.utils import format_datetime
    from datetime import datetime
    guids = set()
    for item in results:
        if item.get('kind') != 'podcast-episode' or item.get('collectionId') != 1696009195 or item.get('feedUrl') != SOURCE or not item.get('episodeGuid') or not item.get('episodeUrl'):
            continue
        output = ET.SubElement(channel, 'item')
        guids.add(item['episodeGuid'])
        for name, value in {'title': item['trackName'], 'guid': item['episodeGuid'], 'description': item.get('description', ''),
            'pubDate': format_datetime(datetime.fromisoformat(item['releaseDate'].replace('Z', '+00:00'))),
            '{'+ITUNES+'}duration': str(item.get('trackTimeMillis', 0) / 1000)}.items():
            ET.SubElement(output, name).text = value
        ET.SubElement(output, 'enclosure', url=item['episodeUrl'], type='audio/mpeg', length='0')
    # Retain older public episodes when Apple's latest-200 window advances.
    previous = ROOT / 'feeds/quebec-french.xml'
    if previous.exists():
        for item in ET.fromstring(previous.read_bytes()).findall('./channel/item'):
            if item.findtext('guid') not in guids:
                channel.append(item)
    return ET.tostring(root, encoding='utf-8', xml_declaration=True)

def build(payload):
    if len(payload) > 8 * 1024 * 1024 or b'<!DOCTYPE' in payload.upper():
        raise ValueError('Unsupported RSS input')
    source = ET.fromstring(payload).find('channel')
    if source is None or source.findtext('title') != 'Quebec French Podcast':
        raise ValueError('Unexpected podcast identity; previous directory preserved')
    root = ET.Element('rss', version='2.0')
    channel = ET.SubElement(root, 'channel')
    for name in ['title', 'link', 'description', 'language', '{'+ITUNES+'}author']:
        ET.SubElement(channel, name).text = source.findtext(name, '')[:5000]
    image = source.find('{'+ITUNES+'}image')
    if image is not None:
        ET.SubElement(channel, '{'+ITUNES+'}image', href=image.get('href', ''))
    count = 0
    for item in source.findall('item')[:2000]:
        enclosure = item.find('enclosure')
        if enclosure is None:
            continue
        url = enclosure.get('url', '')
        parsed = urlsplit(url)
        if parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password:
            continue
        output = ET.SubElement(channel, 'item')
        for name in ['title', 'guid', 'pubDate', 'description', '{'+ITUNES+'}duration']:
            ET.SubElement(output, name).text = item.findtext(name, '')[:20000]
        ET.SubElement(output, 'enclosure', {key: enclosure.get(key, '') for key in ['url', 'length', 'type']})
        count += 1
    if count < 1:
        raise ValueError('Empty podcast directory; previous file preserved')
    return ET.tostring(root, encoding='utf-8', xml_declaration=True), count

def main():
    try:
        with urlopen(Request(SOURCE, headers={'User-Agent': 'Tingye-Public-Podcast-Directory/1.0'}), timeout=40) as response:
            payload = response.read(8 * 1024 * 1024 + 1)
    except URLError:
        print('Publisher RSS unavailable; refreshing from its public Apple Podcasts directory')
        payload = apple_feed()
    output, count = build(payload)
    destination = ROOT / 'feeds/quebec-french.xml'
    destination.parent.mkdir(exist_ok=True)
    if not destination.exists() or destination.read_bytes() != output:
        temporary = destination.with_suffix('.xml.tmp')
        temporary.write_bytes(output)
        temporary.replace(destination)
    print(f'Quebec French Podcast: {count} public episodes; no audio downloaded')

if __name__ == '__main__':
    main()

