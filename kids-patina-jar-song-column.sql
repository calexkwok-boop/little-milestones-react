-- One chosen song per kid's Patina Jar compilation, shared across the whole
-- family (not per-device localStorage) so every parent sees the same song
-- regardless of which device they're watching from. Same {name, artist,
-- artworkUrl, previewUrl} shape saved_reels.song already uses — no song2,
-- since the compilation loops a single track rather than crossfading two.
alter table kids add column patina_jar_song jsonb;
