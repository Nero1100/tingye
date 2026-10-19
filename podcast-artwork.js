import {feedURL,mediaURL} from './podcasts.js?v=2026.10.19.2';
// Verified against each publisher's Apple directory and exact RSS identity.
const covers=Object.freeze({
 'https://anchor.fm/s/c56bd1c/podcast/rss':'https://is1-ssl.mzstatic.com/image/thumb/Podcasts221/v4/c4/3f/97/c43f97cb-d2bd-505c-4624-150bde920f1b/mza_5154009728585939195.jpg/600x600bb.jpg',
 'https://anchor.fm/s/25d02b0c/podcast/rss':'https://is1-ssl.mzstatic.com/image/thumb/Podcasts122/v4/9b/48/c2/9b48c2fa-2b78-05cf-bd27-35cc9045c113/mza_758367773763980410.jpg/600x600bb.jpg',
 'https://anchor.fm/s/26aec4fc/podcast/rss':'https://is1-ssl.mzstatic.com/image/thumb/Podcasts211/v4/51/a7/6f/51a76f43-1525-e379-9dc5-091d8e4d268c/mza_3065210315616775554.jpg/600x600bb.jpg'
});
export function podcastArtworkCandidates(show){return [...new Set([covers[feedURL(show?.feed)],mediaURL(show?.cover)].filter(Boolean))];}
export function preferredPodcastArtwork(feed,appleCover,rssCover){return mediaURL(appleCover)||covers[feedURL(feed)]||mediaURL(rssCover);}
