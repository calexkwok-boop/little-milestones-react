-- One-time sync: comments/likes store display_name as a snapshot taken at the
-- moment they were posted (profiles.display_name, i.e. someone's "real name" in
-- social contexts). If someone set their real name after already commenting or
-- liking things, those older rows are stuck showing whatever they were called
-- before. This brings every existing row in line with each person's current name.

update entry_comments ec
set display_name = p.display_name
from profiles p
where ec.user_id = p.id
  and p.display_name is not null
  and ec.display_name is distinct from p.display_name;

update entry_likes el
set display_name = p.display_name
from profiles p
where el.user_id = p.id
  and p.display_name is not null
  and el.display_name is distinct from p.display_name;
