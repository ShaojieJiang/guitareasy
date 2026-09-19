-- scores.size is the UTF-8 byte length of tex, matching the upload limit.
-- Rows written before this stored the UTF-16 character count instead.
UPDATE scores SET size = length(CAST(tex AS BLOB));
