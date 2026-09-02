-- Lets a Patina Jar entry be an uploaded still photo instead of a live
-- in-app video recording -- some parents find "record right now, in the
-- app" harder to get to than "here's a photo from earlier this month."
-- Exactly one of video_url/photo_url is ever set per entry. A photo
-- entry's caption is always PATINA_JAR_QUESTIONS[month_index] (the same
-- text the video flow already shows live while recording), derived
-- client-side rather than stored, so no caption column is needed here.
alter table patina_jar_entries alter column video_url drop not null;
alter table patina_jar_entries add column photo_url text;
alter table patina_jar_entries add constraint patina_jar_entries_exactly_one_media check (
  (video_url is not null and photo_url is null) or (video_url is null and photo_url is not null)
);
